/**
 * BGM。
 *
 * 源是 41.3 MB 的 vorbis,网页端不可能直接用;
 * 由 tools/build-audio.py 转成 webm(opus) / m4a(aac) 两套,运行时只挑一套下载。
 * 详见该脚本头注。
 *
 * 播放策略(2026-10-15 用户拍板):
 * 1. **进游戏就播**:主菜单/选择页播 idle 曲。浏览器自动播放策略要求真实用户手势,
 *    所以加载时先挂 src 预载,play() 被拒就记下,第一次 pointerdown 补播——
 *    菜单页任何一下点击都算手势。
 * 2. **进剧本双轨轮播**:无人声(inst)与有人声(vocal)两轨交替,先播无人声。
 *    换轨靠 ended 事件(不设单曲循环);另一轨提前后台预载,换轨不留下载空窗。
 *    vocal 缺失的剧本退化为 inst 单曲循环。
 * 3. **不阻塞交互**。src 挂在 <audio> 上由浏览器流式取,加载期间游戏照常玩。
 * 4. **页面不可见即静音**:切标签/最小化/关掉预览面板时标签还活着,
 *    不监听 visibilitychange 音乐就会在后台一直响。隐藏时暂停,
 *    回前台续播 —— 但落幕/主动停(current 为空)的不自动续。
 *
 * 格式选择用 canPlayType 探测,不猜:
 * Chromium/Firefox 走 webm(opus,更小),Safari 走 m4a(aac,通用)。
 */

type Variant = 'inst' | 'vocal';

// 与 tools/build-audio.py 的输出名对应: idle / <key>-inst / <key>-vocal
//
// `query: '?url'` 不能省:glob 命中 .webm/.m4a 这类资源时,不加它 Vite 会把
// 源码相对路径原样烤进包里,变成 /assets/bgm/idle.webm;而实际产物带 hash,
// 是 /assets/bgm/idle-Bmeqaz.webm —— 于是每个音频请求都是 404。
// 加了 ?url 才会重写成构建后的真实 URL。
// eager 只取 URL 字符串,不内联音频字节。
const urls = import.meta.glob<string>('../assets/bgm/*', {
  eager: true,
  query: '?url',
  import: 'default',
});

function pick(key: string, variant: Variant): string | null {
  const base = key === 'idle' ? 'idle' : `${key}-${variant}`;
  const w = urls[`../assets/bgm/${base}.webm`];
  const m = urls[`../assets/bgm/${base}.m4a`];
  if (!w && !m) return null;
  // 探测一次就够:两个浏览器的支持度在会话内不变
  if (probe.supportWebm) return w ?? m ?? null;
  return m ?? w ?? null;
}

const probe = (() => {
  if (typeof document === 'undefined') return { supportWebm: false, supportM4a: false };
  const a = document.createElement('audio');
  const webm = a.canPlayType('audio/webm; codecs="opus"');
  const m4a = a.canPlayType('audio/mp4; codecs="mp4a.40.2"');
  return { supportWebm: webm === 'probably' || webm === 'maybe', supportM4a: m4a !== '' };
})();

export class Bgm {
  private el: HTMLAudioElement | null = null;
  /** 轮播另一轨的预载器(只下载,不播放) */
  private preloader: HTMLAudioElement | null = null;
  /** 当前曲目标签:`<key>#<variant>` 或 `idle#inst` */
  private current = '';
  /** 非空表示正在剧本双轨轮播中 */
  private rotateKey: string | null = null;
  private wanted = true;
  /**
   * 音量:由设置项驱动(轻 0.3 / 标准 0.6 / 响 0.9),不是写死的。
   * 以前硬编码 0.32,那是我自己拍的;档位跟 Lua 的 home.lua 对齐,
   * 两套实现不该对"背景乐该多响"有两套答案。
   */
  private volume = 0.6;
  private failed = false;
  /** 自动播放被拒后,是否已挂上手势补播监听 */
  private unlockBound = false;
  /** 是我们因页面不可见而暂停的标记:只有这种情况才在回前台时自动续播 */
  private pausedByHidden = false;
  private visibilityBound = false;

  get enabled(): boolean {
    return this.wanted;
  }

  setEnabled(on: boolean): void {
    this.wanted = on;
    if (!on) {
      // 只暂停不清 current:设置页关掉再开,接着刚才的曲目恢复
      this.el?.pause();
      return;
    }
    // 页面若是在「音乐=关」的存档下加载的,此时还没有任何曲目记录,
    // 直接 return 会让设置页点「开」毫无动静 —— 退到 idle 曲兜底。
    if (!this.current) { this.idle(); return; }
    const [key] = this.current.split('#');
    if (key === 'idle') this.idle();
    else this.play(key ?? 'idle');
  }

  /**
   * 切到某本剧本的音乐:inst / vocal 双轨轮播,先播无人声。
   * vocal 缺失时退化为 inst 单曲循环。
   */
  play(key: string): void {
    if (!this.wanted || this.failed) return;
    const tag = `${key}#inst`;
    if (tag === this.current && this.el && !this.el.paused) return;
    const inst = pick(key, 'inst');
    if (!inst) { this.failed = true; return; }

    this.current = tag;
    this.rotateKey = key;
    const vocal = pick(key, 'vocal');
    // 有 vocal 就不设循环:inst 播完靠 ended 换 vocal,如此交替
    this.start(inst, !vocal);
    // 另一轨后台预载,换轨时不留下载空窗
    if (vocal) this.preload(vocal);
  }

  /** 菜单/选择页:idle 单曲循环 */
  idle(): void {
    if (!this.wanted || this.failed) return;
    if (this.current === 'idle#inst' && this.el && !this.el.paused) return;
    const url = pick('idle', 'inst');
    if (!url) { this.failed = true; return; }
    this.current = 'idle#inst';
    this.rotateKey = null;
    this.start(url, true);
  }

  stop(): void {
    if (!this.el) return;
    this.el.pause();
    this.el.currentTime = 0;
    this.current = '';
    this.rotateKey = null;
    this.pausedByHidden = false;
  }

  /** 设置页改档位时走这里 */
  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.el) this.el.volume = this.volume;
  }

  private start(url: string, loop: boolean): void {
    this.ensure();
    const el = this.el!;
    el.src = url;
    el.loop = loop;
    el.volume = this.volume;
    el.preload = 'auto';
    // play() 返回的 Promise 会因为自动播放策略而 reject。
    // 那不是错误——记下想播,第一次真实手势时补播。
    void el.play().catch(() => this.armUnlock());
  }

  /** 自动播放策略兜底:第一次 pointerdown 补播当前曲 */
  private armUnlock(): void {
    if (this.unlockBound || typeof document === 'undefined') return;
    this.unlockBound = true;
    const unlock = (): void => {
      document.removeEventListener('pointerdown', unlock);
      this.unlockBound = false;
      if (this.wanted && this.el && this.el.paused && this.el.src) {
        void this.el.play().catch(() => { /* 还是被拒就静默,音乐非关键路径 */ });
      }
    };
    document.addEventListener('pointerdown', unlock);
  }

  /** inst 播完 → vocal,vocal 播完 → inst,如此轮播 */
  private readonly onEnded = (): void => {
    if (!this.rotateKey || !this.wanted) return;
    const next: Variant = this.current.endsWith('#vocal') ? 'inst' : 'vocal';
    const url = pick(this.rotateKey, next);
    if (!url) return;
    this.current = `${this.rotateKey}#${next}`;
    this.start(url, false);
    // 下一轮要用的那轨再确认一遍预载(多半已在缓存,防逐出)
    const other = pick(this.rotateKey, next === 'inst' ? 'vocal' : 'inst');
    if (other) this.preload(other);
  };

  private preload(url: string): void {
    if (typeof document === 'undefined') return;
    if (!this.preloader) {
      const p = document.createElement('audio');
      p.setAttribute('aria-hidden', 'true');
      document.body.append(p);
      this.preloader = p;
    }
    if (this.preloader.src === url) return;
    this.preloader.preload = 'auto';
    this.preloader.src = url;
  }

  private ensure(): void {
    if (this.el) return;
    const el = document.createElement('audio');
    el.setAttribute('aria-hidden', 'true');
    el.addEventListener('ended', this.onEnded);
    el.addEventListener('error', () => {
      // 某个剧本的曲子缺失不该影响游戏,只放弃音乐
      this.failed = true;
      this.stop();
    });
    document.body.append(el);
    this.el = el;
    this.bindVisibility();
  }

  /**
   * 页面不可见(切标签/最小化/关预览面板)时暂停,回前台续播。
   * current 为空说明是落幕或主动 stop,不自动续播。
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
      if (this.wanted && this.el && this.current && this.el.src) {
        void this.el.play().catch(() => this.armUnlock());
      }
    });
  }
}

export const bgm = new Bgm();
export const AUDIO_SUPPORT = probe;
