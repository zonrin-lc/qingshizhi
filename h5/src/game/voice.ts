/**
 * 配音(2026-10-17 起改为整段合并口径,覆盖李斯全剧本 134 条)。
 *
 * 切片命名与剧本节点的对应(由生成脚本按 JSON 推导,**不需要额外维护清单**,
 * 查不到就是没这条配音;这也是用 glob 而不是「预生成 index.json」的原因——清单会漂移,glob 不会):
 *   intro                → chapter.intro 全部段合并一条
 *   <事件id>             → event.segs 全部段合并一条(主线事件 + 章末事件 cj-*)
 *   choice_<ACT-id>      → 抉择卡 segs 合并一条
 *   choice_<ACT-id>_o<N> → 抉择卡第 N 个选项的结算
 *   ending_<E>[_<变体>]  → 结局「太史公曰」(变体结局单独一条)
 *   crisis_<C-id>        → 危机事件 segs 合并一条
 *   crisis_<C-id>_o<N>   → 危机事件第 N 个选项的结算
 *   corr_<N>             → CORRECTIONS[N] 历史修正 segs 合并一条
 * (主线事件的选项结算、随机事件 R-* 不配音 —— 2026-10-17 用户拍板)
 *
 * 目录:voice/<剧本>/<章cN>/<切片>;跨章共享的(choice_/ending_/crisis_/corr_)
 * 放 _shared/,clipUrl 先查本章目录、查不到回落 _shared。
 *
 * 四条现实约束,决定了下面的写法:
 *
 * 1. **缓冲窗口只有几百毫秒。** 点完选项到下一句播出来,中间没有留给你下载的时间。
 *    所以必须提前把切片拉下来,而不是播到哪下到哪。
 *
 * 2. **串行播放,不能并发。** 一次性并发拉全表会把连接池打满、
 *    拖慢正在播的那条。必须一条接一条,播完再拉下一条。
 *
 * 3. **语音要盖住 BGM。** 否则配音被背景乐压着,等于没做。
 *    靠基准音量差保证:配音 0.8 / BGM 0.6,各播各的,不做压低联动。
 *
 * 4. **页面不可见不念。** visibilitychange 隐藏时暂停当前这句、队列挂起
 *    (隐藏期间绝不开始下一句),回前台从断点续播 —— 与 BGM 同策略,见 audio.ts。
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

/** 该章某条切片在不在;查不到本章目录时回落 _shared(跨章共享切片)。 */
function clipUrl(scenario: string, chapter: string, clip: string): string | null {
  const pick = (dir: string): string | null => {
    const key = `../assets/voice/${scenario}/${dir}/${clip}.`;
    return probe === 'webm' ? (clips[key + 'webm'] ?? null) : (clips4a[key + 'm4a'] ?? null);
  };
  return pick(chapter) ?? pick('_shared');
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
  /** 配音开关(将来接设置页静音项);默认开。 */
  private wanted = true;
  /** 音量由设置项驱动(设置页 0-100 滑杆,默认 1.0);初值是设置加载前的兜底 */
  private volume = 1.0;
  /** 当前这句的收尾回调;stop() 主动调它,好让 pump 的循环能退出。 */
  private settleCurrent: (() => void) | null = null;
  /** 是我们因页面不可见而暂停的标记:只有这种情况才在回前台时自动续播 */
  private pausedByHidden = false;
  private visibilityBound = false;

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
    this.pausedByHidden = false;
    if (this.el) {
      this.el.pause();
      this.el.removeAttribute('src');
      this.el.load();
    }
    // 关键:pause() 不会触发 ended,只靠事件收尾的话 playOne 的 promise 永远不落定,
    // pump 会一直卡在 await 上、playing 永远是 true,之后所有入队都被无声丢弃。
    // 所以这里要主动把当前这句结算掉,让 pump 的循环看见空队列并退出。
    this.settleCurrent?.();
  }

  /**
   * 串行取队列。一条放完再放下一条 —— 这同时也是预取顺序的保证:
   * 一次并发几十条会把连接池打满,拖慢正在播的那条。
   *
   * 若已在 pump 中,直接返回即可:正在跑的循环每轮都会重查队列,
   * 自然会接手新入队的条目,不需要第二个循环。
   */
  private async pump(): Promise<void> {
    if (this.playing) return;
    this.playing = true;
    try {
      while (this.queue.length) {
        // 页面不可见时挂起队列:隐藏期间不该接着念下一句
        await this.waitVisible();
        if (!this.queue.length) break; // 挂起期间可能已被 stop() 清空
        const item = this.queue.shift()!;
        await this.playOne(item.url);
        // 句子之间留一点停顿,不然连续念像机关枪
        if (this.queue.length) await this.wait(260);
      }
    } finally {
      this.playing = false;
    }
  }

  private async waitVisible(): Promise<void> {
    while (typeof document !== 'undefined' && document.hidden) await this.wait(200);
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
        resolve();
      };
      // stop() 也要能调它,所以存起来,而不是只挂在事件上
      this.settleCurrent = done;
      el.addEventListener('ended', done, { once: true });
      el.addEventListener('error', done, { once: true });
      this.bindVisibility();
      el.src = url;
      el.volume = this.volume;
      el.preload = 'auto';
      void el.play().catch(() => done());
    });
  }

  private wait(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  /**
   * 页面不可见(切标签/最小化/关预览面板)时暂停当前这句,回前台续播。
   * 续播条件:settleCurrent 非空(这句还挂着没念完)且没被 stop() 收掉;
   * 续播被拒也不能卡死 pump —— 直接结算这句,让循环往下走。
   */
  private bindVisibility(): void {
    if (this.visibilityBound || typeof document === 'undefined') return;
    this.visibilityBound = true;
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (this.el && !this.el.paused) {
          this.pausedByHidden = true;
          this.el.pause();
        }
        return;
      }
      if (!this.pausedByHidden) return;
      this.pausedByHidden = false;
      if (this.wanted && this.el && this.el.src && this.settleCurrent) {
        void this.el.play().catch(() => this.settleCurrent?.());
      }
    });
  }
}

export const voice = new Voice();
export const VOICE_EXT = probe;
