/**
 * 音效(2026-10-20 接入):第三条音频通道,补 BGM( audio.ts )与朗读( voice.ts )
 * 之外的交互反馈音。源由 Maker Seed Audio 生成( assets/audio/sfx/*.mp3 ),
 * 经 ffmpeg 转出 webm(opus),与 BGM 同口径。
 *
 * 与 BGM/朗读的三点差异:
 * 1. **并发短音,不用单元素串行。** 同一音可能连发(快速连点按钮),
 *    所以按名字开小池,池内轮询空闲元素;都没有就新建(每名单类封顶 3 个)。
 * 2. **不做 visibility 暂停。** 全是 0.5~2.5s 的一次性音,播完即止,
 *    切标签时让它自然响完比掐断更顺。
 * 3. **音量与开关读设置项 sfx/sfxGain**(设置页 0-100 滑杆,0 即关),
 *    由 ui/settings.ts 的 applyAll 推过来,与音乐/朗读同一条路径。
 *
 * 自动播放策略:音效几乎都由真实手势直接触发(点击/出牌);个别挂在定时器上的
 * (骰子落定/属性飞字/章末结算)也都跟在手势链路之后,首个手势过后浏览器即放行。
 *
 * 只出 webm(opus) 一种(2026-10-20 用户拍板,同 BGM):原本另备一套 m4a
 * 是为 Safari 兜底,目标平台 TapTap 容器的 WebView 支持 opus,不值得付双份体积。
 */
const urls = import.meta.glob<string>('../assets/sfx/*.webm', {
  eager: true,
  query: '?url',
  import: 'default',
});

/** 可用的音效名 = 文件名(不含扩展)。新增素材丢进 assets/sfx 即可,不用改这里。 */
export type SfxName =
  | 'click' | 'card' | 'enter' | 'back' | 'dialog' | 'seal'
  | 'coin' | 'gain' | 'down' | 'dice-roll' | 'dice-land'
  | 'chapter' | 'ending' | 'fail';

function urlOf(name: SfxName): string | null {
  return urls[`../assets/sfx/${name}.webm`] ?? null;
}

/** 单个音的并发上限:连点超过这个数就复用最老的那个元素(从头重播) */
const POOL_MAX = 3;

export class Sfx {
  /** 名字 → 元素池。元素一经创建常驻,浏览器自己缓存音频数据。 */
  private pools = new Map<string, HTMLAudioElement[]>();
  private wanted = true;
  /** 音量:设置页滑杆驱动(默认 0.8),这里是设置加载前的兜底 */
  private volume = 0.8;

  get enabled(): boolean {
    return this.wanted;
  }

  setEnabled(on: boolean): void {
    this.wanted = on;
    if (!on) this.stopAll();
  }

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
  }

  /** 播一条。素材缺失/被策略拒绝都静默——音效是点缀,绝不影响玩法。 */
  play(name: SfxName): void {
    if (!this.wanted || typeof document === 'undefined') return;
    const url = urlOf(name);
    if (!url) return;
    const el = this.take(name, url);
    el.volume = this.volume;
    try {
      el.currentTime = 0;
    } catch {
      // 元数据未就绪时 currentTime 赋值会抛,从头播不了就让它接着播
    }
    void el.play().catch(() => { /* 首个手势前的拒播属正常 */ });
  }

  /** 关音效时收掉所有在播的 */
  private stopAll(): void {
    for (const pool of this.pools.values()) {
      for (const el of pool) el.pause();
    }
  }

  private take(name: string, url: string): HTMLAudioElement {
    let pool = this.pools.get(name);
    if (!pool) {
      pool = [];
      this.pools.set(name, pool);
    }
    for (const el of pool) {
      if (el.paused || el.ended) return el;
    }
    if (pool.length >= POOL_MAX) return pool[0]!;
    const el = document.createElement('audio');
    el.setAttribute('aria-hidden', 'true');
    el.preload = 'auto';
    el.src = url;
    pool.push(el);
    return el;
  }
}

export const sfx = new Sfx();
