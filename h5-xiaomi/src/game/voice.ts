/**
 * 配音:与 H5 的 game/voice.ts 同一套口径(整段合并切片、串行播放、切后台不念),
 * 底层换成 Platform.audio。
 *
 * 切片路径由剧本数据推导,**不维护清单**:
 *   assets/voice/<剧本>/<章>/<切片>.webm,查不到本章就回落 _shared/
 * 清单会漂移,路径不会。素材缺失(主包尚未分包)时安静跳过,不影响玩法。
 *
 * 四条现实约束照抄:
 * 1. 缓冲窗口只有几百毫秒 —— 入队时把 follow 一起排进来;
 * 2. 串行播放,不能并发(并发会把连接池打满);
 * 3. 语音要盖住 BGM:音量基准差(语音 0.8 / BGM 0.06)由设置项推过来;
 * 4. 页面不可见不念:隐藏时暂停当前句、挂起队列,回前台从断点续播。
 */

import type { AudioHandle, Platform } from '../port/platform';

export const VOICE_BASE = 'assets/voice';

/** 一条切片在本章与 _shared 两处的候选路径(按顺序试) */
function clipCandidates(scenario: string, chapter: string, clip: string): string[] {
  return [
    `${VOICE_BASE}/${scenario}/${chapter}/${clip}.webm`,
    `${VOICE_BASE}/${scenario}/_shared/${clip}.webm`,
  ];
}

interface QueueItem {
  cands: string[];
}

export class Voice {
  /** 预取队列(缓冲窗口内攒的活)。串行,不并发。 */
  private queue: QueueItem[] = [];
  private handle: AudioHandle | null = null;
  private playing = false;
  private wanted = true;
  /** 音量由设置项驱动(voiceGain,默认 1.0) */
  private volume = 1.0;

  /** 当前这句的收尾回调;stop() 主动调它,好让 pump 的循环能退出 */
  private settle: (() => void) | null = null;
  /** 当前这句的换源重试(本章没有 → _shared) */
  private retry: (() => void) | null = null;
  /** 当前句的代际号:陈旧事件不许碰当前句状态 */
  private token = 0;
  private pausedByHidden = false;
  private hidden = false;
  private unlockArmed = false;

  constructor(private readonly plat: Platform) {
    this.bindVisibility();
    this.armUnlock();
  }

  get enabled(): boolean {
    return this.wanted;
  }

  setEnabled(on: boolean): void {
    this.wanted = on;
    if (!on) this.stop();
  }

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    this.handle?.setVolume(this.volume);
  }

  /**
   * 排队一条配音。传 follow 数组时按顺序排在后面(章 intro、事件各段就是这种)。
   */
  enqueue(scenario: string, chapter: string, clip: string, follow: string[] = []): void {
    if (!this.wanted) return;
    this.queue.push({ cands: clipCandidates(scenario, chapter, clip) });
    for (const f of follow) {
      this.queue.push({ cands: clipCandidates(scenario, chapter, f) });
    }
    void this.pump();
  }

  /** 立刻掐断当前这句,并清空未播的。不该让上一章的语音继续响下去。 */
  stop(): void {
    this.queue.length = 0;
    this.pausedByHidden = false;
    // 先结算当前句(done 内部校验代际),再作废代际;
    // 反过来的话 pump 会永远卡在 await 上。
    this.settle?.();
    this.token += 1;
    this.handle?.stop();
  }

  /**
   * 串行取队列。一条放完再放下一条 —— 这同时也是预取顺序的保证。
   * 若已在 pump 中,直接返回:正在跑的循环每轮都会重查队列。
   */
  private async pump(): Promise<void> {
    if (this.playing) return;
    this.playing = true;
    try {
      while (this.queue.length) {
        await this.waitVisible();
        if (!this.queue.length) break; // 挂起期间可能已被 stop() 清空
        const item = this.queue.shift();
        if (!item) break;
        await this.playOne(item.cands);
        // 句子之间留一点停顿,不然连续念像机关枪
        if (this.queue.length) await this.wait(260);
      }
    } finally {
      this.playing = false;
    }
  }

  private async waitVisible(): Promise<void> {
    while (this.hidden) await this.wait(200);
  }

  private playOne(cands: string[]): Promise<void> {
    return new Promise<void>((resolve) => {
      const h = this.ensure(cands[0] ?? `${VOICE_BASE}/_shared/empty.webm`);
      const token = ++this.token;
      let settled = false;
      let i = 0;

      const done = (): void => {
        if (settled) return;
        settled = true;
        if (token === this.token) {
          this.settle = null;
          this.retry = null;
        }
        resolve();
      };

      // stop() 也要能调它,所以存起来,而不是只挂在事件上
      this.settle = done;

      const attempt = (): void => {
        if (settled || token !== this.token) return; // stop() 收掉了
        const path = cands[i];
        if (!path) {
          done();
          return;
        }
        i += 1;
        // 本条出错时换下一条候选路径(本章目录 → _shared)
        this.retry = attempt;
        h.setSrc(path);
        h.setVolume(this.volume);
        h.play();
      };

      attempt();
    });
  }

  private ensure(firstPath: string): AudioHandle {
    if (this.handle) return this.handle;
    const h = this.plat.audio(firstPath, { volume: this.volume });
    // 元素上只挂一次常驻监听,靠代际号判断事件归属
    h.onEnded(() => {
      this.settle?.();
    });
    h.onError(() => {
      const retry = this.retry;
      if (retry) retry();
      else this.settle?.();
    });
    this.handle = h;
    return h;
  }

  private wait(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  /** 自动播放被拒时的第一次手势补播 */
  private armUnlock(): void {
    if (this.unlockArmed) return;
    this.unlockArmed = true;
    this.plat.onPointer({
      down: () => {
        if (this.wanted && this.settle) this.handle?.resume();
      },
      move: () => {
        /* 只借 down 这一下 */
      },
      up: () => {
        /* 同上 */
      },
    });
  }

  /**
   * 页面不可见时暂停当前这句,回前台续播。
   * 续播被拒也不能卡死 pump —— 由 error/ended 事件结算。
   */
  private bindVisibility(): void {
    this.plat.onHide(() => {
      this.hidden = true;
      if (this.handle && this.settle) {
        this.pausedByHidden = true;
        this.handle.pause();
      }
    });
    this.plat.onShow(() => {
      this.hidden = false;
      if (!this.pausedByHidden) return;
      this.pausedByHidden = false;
      if (this.wanted && this.settle) this.handle?.resume();
    });
  }
}
