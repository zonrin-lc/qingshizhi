/**
 * 配音。
 *
 * 试点范围:李斯 c1(第一章 兰陵问道)41 条。其余章节/剧本没有配音,自动降级为无声。
 *
 * 切片命名与 JSON 的对应(已对全库 162 节点 + 全部随机事件校验):
 *   intro_<N>        → chapter.intro[N]
 *   <事件id>_s<N>    → event.segs[N-1]
 *   <事件id>_o<N>    → event.options[N-1].res
 *
 * 所以切片名纯靠推导得出,**不需要额外维护清单**。查不到就是没这条配音。
 * 这也是这里用 glob 而不是「预生成一份 index.json」的原因:
 * 清单会漂移,glob 不会。
 *
 * 三条现实约束,决定了下面的写法:
 *
 * 1. **缓冲窗口只有几百毫秒。** 点完选项到下一句播出来,中间没有留给你下载的时间。
 *    所以必须提前把本章切片拉下来,而不是播到哪下到哪。
 *
 * 2. **串行播放,不能并发。** 一章 41 条如果一次性并发拉,会把连接池打满、
 *    拖慢正在播的那条。必须一条接一条,播完再拉下一条。
 *
 * 3. **语音要盖住 BGM。** 否则配音被背景乐压着,等于没做。
 *    做法是进入配音句子时把 BGM 压低,句子结束恢复 —— 比暂停 BGM 自然。
 */

const clips = import.meta.glob<string>('../assets/voice/*/*/*.webm', {
  eager: true,
  query: '?url',
  import: 'default',
});
const clips4a = import.meta.glob<string>('../assets/voice/*/*/*.m4a', {
  eager: true,
  query: '?url',
  import: 'default',
});

type Ext = 'webm' | 'm4a';

const probe = (() => {
  if (typeof document === 'undefined') return 'm4a' as Ext;
  const a = document.createElement('audio');
  const w = a.canPlayType('audio/webm; codecs="opus"');
  return w === 'probably' || w === 'maybe' ? ('webm' as Ext) : ('m4a' as Ext);
})();

/** 该章某条切片在不在。切掉某章配音时这里是空表,其余不受影响。 */
function clipUrl(scenario: string, chapter: string, clip: string): string | null {
  const key = `../assets/voice/${scenario}/${chapter}/${clip}.`;
  return probe === 'webm' ? (clips[key + 'webm'] ?? null) : (clips4a[key + 'm4a'] ?? null);
}

export function hasVoice(scenario: string, chapter: string, clip: string): boolean {
  return clipUrl(scenario, chapter, clip) !== null;
}

type QueueItem = { url: string; onEnd?: () => void };

export class Voice {
  /** 预取队列(缓冲窗口内攒的活)。串行,不并发。 */
  private queue: QueueItem[] = [];
  private el: HTMLAudioElement | null = null;
  private playing = false;
  /**
   * 试点目的就是验证这条链路,所以默认开。
   * 真正上线前应接进设置(设置页按用户决定暂不做),给一个静音开关。
   */
  private wanted = true;
  /** 当前在放的是不是「有人说话」——用来决定 BGM 要不要让位。 */
  private speaking = false;
  /** 音量由设置项驱动(轻 0.5 / 标准 0.8 / 响 1.0) */
  private volume = 0.8;
  /** 当前这句的收尾回调;stop() 主动调它,好让 pump 的循环能退出。 */
  private settleCurrent: (() => void) | null = null;

  /** 外部注入:BGM 需要在配音期间让位。见 session.ts。 */
  onSpeakingChange: ((speaking: boolean) => void) | null = null;

  get available(): boolean {
    return Object.keys(clips).length > 0 || Object.keys(clips4a).length > 0;
  }

  setEnabled(on: boolean): void {
    this.wanted = on;
    if (!on) this.stop();
  }

  get enabled(): boolean {
    return this.wanted;
  }

  /** 设置项改音量 */
  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.el) this.el.volume = this.volume;
  }

  /**
   * 排队一条配音。会先把后面几条一起预取,避免播到一半才发现没下。
   * 传 follow 数组时按顺序预取(章 intro、事件各段就是这种)。
   */
  enqueue(scenario: string, chapter: string, clip: string, follow: string[] = []): void {
    const url = clipUrl(scenario, chapter, clip);
    if (!url || !this.wanted) return;
    this.queue.push({ url });
    for (const f of follow) {
      const u = clipUrl(scenario, chapter, f);
      if (u) this.queue.push({ url: u });
    }
    void this.pump();
  }

  /** 立刻掐断当前这句,并清空未播的。不该让上一章的语音继续响下去。 */
  stop(): void {
    this.queue.length = 0;
    if (this.el) {
      this.el.pause();
      this.el.removeAttribute('src');
      this.el.load();
    }
    // 关键:pause() 不会触发 ended,只靠事件收尾的话 playOne 的 promise 永远不落定,
    // pump 会一直卡在 await 上、playing 永远是 true,之后所有入队都被无声丢弃。
    // 所以这里要主动把当前这句结算掉,让 pump 的循环看见空队列并退出。
    this.settleCurrent?.();
    this.setSpeaking(false);
  }

  private setSpeaking(on: boolean): void {
    if (this.speaking === on) return;
    this.speaking = on;
    this.onSpeakingChange?.(on);
  }

  /**
   * 串行取队列。一条放完再放下一条 —— 这同时也是预取顺序的保证:
   * 一次并发 41 条会把连接池打满,拖慢正在播的那条。
   *
   * 若已在 pump 中,直接返回即可:正在跑的循环每轮都会重查队列,
   * 自然会接手新入队的条目,不需要第二个循环。
   */
  private async pump(): Promise<void> {
    if (this.playing) return;
    this.playing = true;
    try {
      while (this.queue.length) {
        const item = this.queue.shift()!;
        await this.playOne(item.url);
        // 句子之间留一点停顿,不然连续念像机关枪
        if (this.queue.length) await this.wait(260);
      }
    } finally {
      this.playing = false;
    }
  }

  private playOne(url: string): Promise<void> {
    return new Promise((resolve) => {
      if (!this.el) {
        const el = document.createElement('audio');
        el.setAttribute('aria-hidden', 'true');
        document.body.append(el);
        this.el = el;
      }
      const el = this.el;
      const done = () => {
        this.settleCurrent = null;
        this.setSpeaking(false);
        resolve();
      };
      // stop() 也要能调它,所以存起来,而不是只挂在事件上
      this.settleCurrent = done;
      el.addEventListener('ended', done, { once: true });
      el.addEventListener('error', done, { once: true });
      el.src = url;
      el.volume = this.volume;
      el.preload = 'auto';
      this.setSpeaking(true);
      void el.play().catch(() => done());
    });
  }

  private wait(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }
}

export const voice = new Voice();
export const VOICE_EXT = probe;
