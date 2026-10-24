/**
 * BGM:与 H5 的 game/audio.ts 同一套播放策略,底层换成 Platform.audio
 * (浏览器 <audio> / 快游戏 InnerAudioContext)。
 *
 * 策略(照抄 H5,2026-10-15 拍板):
 * 1. 进游戏就播:主菜单/选择页播 idle 曲;自动播放被拒就等第一次手势补播。
 * 2. 进剧本双轨轮播:inst(无人声)与 vocal(有人声)交替,先播 inst。
 *    换轨靠 ended 事件,不设单曲循环;vocal 缺失时退化为 inst 单曲循环。
 * 3. 不阻塞交互:只给句柄换源,加载期间游戏照常玩。
 * 4. 切后台即暂停,回前台续播(主动 stop 的不续)。
 *
 * 与 H5 的一处差别:没有 <audio> 的 preload,也不另建预载元素 —— qg 的
 * InnerAudioContext 只有 setSrc 后才开始取流,提前预载需要再建一个句柄,
 * 而主包/分包体积还在治理中,这里先不付这份内存。
 */

import type { AudioHandle, Platform } from '../port/platform';

/** 音频根目录:分包落地后只改这一处(主包 assets/ → 分包 audi/ 之类) */
export const AUDIO_BASE = 'assets';
export const BGM_DIR = `${AUDIO_BASE}/bgm`;

type Variant = 'inst' | 'vocal';

function bgmPath(key: string, variant: Variant): string {
  return key === 'idle' ? `${BGM_DIR}/idle.webm` : `${BGM_DIR}/${key}-${variant}.webm`;
}

export class Bgm {
  private handle: AudioHandle | null = null;
  /** 当前音源路径;空串表示没有在播的曲目 */
  private currentPath = '';
  private currentKey = '';
  private currentVariant: Variant = 'inst';
  /** 非空表示正在剧本双轨轮播中 */
  private rotateKey: string | null = null;

  private wanted = true;
  /** 音量由设置项驱动(musicGain,默认 0.06),这里只是设置加载前的兜底 */
  private volume = 0.06;

  /** 缺失/出错的音源:不再反复重试,换曲时仍会给新路径机会 */
  private readonly missing = new Set<string>();
  private pausedByHidden = false;
  private unlockArmed = false;

  constructor(private readonly plat: Platform) {
    this.bindVisibility();
    this.armUnlock();
  }

  get enabled(): boolean {
    return this.wanted;
  }

  /** 当前曲目标签(调试用):`<key>#<variant>` */
  get current(): string {
    return this.currentKey ? `${this.currentKey}#${this.currentVariant}` : '';
  }

  setEnabled(on: boolean): void {
    this.wanted = on;
    if (!on) {
      this.handle?.pause();
      return;
    }
    if (!this.currentPath) {
      this.idle();
      return;
    }
    this.start(this.currentPath, this.rotateKey === null);
  }

  /**
   * 切到某本剧本的音乐:inst / vocal 双轨轮播,先播无人声。
   * vocal 缺失时(播放报错)退化为 inst 单曲循环。
   */
  play(key: string): void {
    if (!this.wanted) return;
    const path = bgmPath(key, 'inst');
    const tag = `${key}#inst`;
    if (tag === this.current && this.currentPath === path) return;
    if (this.missing.has(path)) return;

    this.currentKey = key;
    this.currentVariant = 'inst';
    this.currentPath = path;
    this.rotateKey = this.missing.has(bgmPath(key, 'vocal')) ? null : key;
    this.start(path, this.rotateKey === null);
  }

  /** 菜单/选择页:idle 单曲循环 */
  idle(): void {
    if (!this.wanted) return;
    const path = bgmPath('idle', 'inst');
    if (this.currentPath === path && this.currentKey === 'idle') return;
    if (this.missing.has(path)) return;
    this.currentKey = 'idle';
    this.currentVariant = 'inst';
    this.currentPath = path;
    this.rotateKey = null;
    this.start(path, true);
  }

  stop(): void {
    this.handle?.stop();
    this.currentPath = '';
    this.currentKey = '';
    this.rotateKey = null;
    this.pausedByHidden = false;
  }

  /** 设置页改档位时走这里 */
  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    this.handle?.setVolume(this.volume);
  }

  private ensure(): AudioHandle {
    if (this.handle) return this.handle;
    const h = this.plat.audio(bgmPath('idle', 'inst'), { volume: this.volume });
    h.onEnded(() => this.onEnded());
    h.onError((msg) => this.onError(msg));
    this.handle = h;
    return h;
  }

  private start(path: string, loop: boolean): void {
    const h = this.ensure();
    h.setLoop(loop);
    h.setSrc(path);
    h.setVolume(this.volume);
    h.play();
  }

  /** inst 播完 → vocal,vocal 播完 → inst,如此轮播 */
  private onEnded(): void {
    const key = this.rotateKey;
    if (!key || !this.wanted) return;
    const next: Variant = this.currentVariant === 'vocal' ? 'inst' : 'vocal';
    const path = bgmPath(key, next);
    if (this.missing.has(path)) {
      // 另一轨不可用:退回当前轨单曲循环
      this.rotateKey = null;
      this.start(bgmPath(key, this.currentVariant), true);
      return;
    }
    this.currentVariant = next;
    this.currentPath = path;
    this.start(path, false);
  }

  /**
   * 音源出错(缺失/解码失败):记住这条路径,别让整局静音。
   * vocal 出错 → 退化为 inst 循环;inst 出错 → 放弃音乐(游戏照常)。
   */
  private onError(msg: string): void {
    const failed = this.currentPath;
    if (!failed) return;
    this.missing.add(failed);
    if (this.currentVariant === 'vocal' && this.currentKey) {
      this.rotateKey = null;
      this.start(bgmPath(this.currentKey, 'inst'), true);
      return;
    }
    // 音乐非关键路径:留一条日志(浏览器端),不弹错误
    if (this.plat.kind === 'web') console.warn('[qingshi] BGM 播放失败', failed, msg);
    this.currentPath = '';
    this.currentKey = '';
    this.rotateKey = null;
  }

  /** 自动播放策略兜底:第一次 pointerdown 补播当前曲 */
  private armUnlock(): void {
    if (this.unlockArmed) return;
    this.unlockArmed = true;
    this.plat.onPointer({
      down: () => {
        if (this.wanted && this.handle && this.currentPath) this.handle.resume();
      },
      move: () => {
        /* 只借 down 这一下 */
      },
      up: () => {
        /* 同上 */
      },
    });
  }

  /** 切后台暂停,回前台续播;主动 stop 的不自动续 */
  private bindVisibility(): void {
    this.plat.onHide(() => {
      if (!this.handle || !this.currentPath) return;
      this.pausedByHidden = true;
      this.handle.pause();
    });
    this.plat.onShow(() => {
      if (!this.pausedByHidden) return;
      this.pausedByHidden = false;
      if (this.wanted && this.currentPath) this.handle?.resume();
    });
  }
}
