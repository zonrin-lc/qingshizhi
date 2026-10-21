/**
 * BGM。
 *
 * 源是 41.3 MB 的 vorbis,网页端不可能直接用;
 * 由 tools/build-audio.py 转成 webm(opus),运行时直接播。
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
 * 只出 webm(opus) 一种(2026-10-20 用户拍板):原本 webm/m4a 双格式是为
 * Safari 兜底,但 m4a 一套让产物多背 173 MB,而目标平台是 TapTap 容器
 * (WebView 内核支持 opus),不值得为兜底付这个体积。若将来要支持 Safari
 * 直开,把 m4a 重新生成回来即可 —— 源 ogg 一直在 assets/audio/。
 */

type Variant = 'inst' | 'vocal';

// 与 tools/build-audio.py 的输出名对应: idle / <key>-inst / <key>-vocal
//
// `query: '?url'` 不能省:glob 命中 .webm 这类资源时,不加它 Vite 会把
// 源码相对路径原样烤进包里,变成 /assets/bgm/idle.webm;而实际产物带 hash,
// 是 /assets/bgm/idle-Bmeqaz.webm —— 于是每个音频请求都是 404。
// 加了 ?url 才会重写成构建后的真实 URL。
// eager 只取 URL 字符串,不内联音频字节。
const urls = import.meta.glob<string>('../assets/bgm/*.webm', {
  eager: true,
  query: '?url',
  import: 'default',
});

function pick(key: string, variant: Variant): string | null {
  const base = key === 'idle' ? 'idle' : `${key}-${variant}`;
  return urls[`../assets/bgm/${base}.webm`] ?? null;
}

export class Bgm {
  private el: HTMLAudioElement | null = null;
  /** 轮播另一轨的预载器(只下载,不播放) */
  private preloader: HTMLAudioElement | null = null;
  /** 当前曲目标签:`<key>#<variant>` 或 `idle#inst` */
  private current = '';
  /** 非空表示正在剧本双轨轮播中 */
  private rotateKey: string | null = null;
  private wanted = true;
  /** 音量:由设置项驱动(设置页 0-100 滑杆,默认 0.06),不是写死的;
   *  这里的初值只是设置加载前的兜底 */
  private volume = 0.06;
  /**
   * 熔断标记(2026-10-21 改):原来只有一个布尔 `failed`,一旦某首曲子出错就
   * **永不复位** —— 某个剧本缺曲或 404,菜单 idle 曲从此整局静音。
   * 现在记住「是哪一首出的问题」,换曲时重新给机会;同一首再错才继续熔断。
   */
  private failed = false;
  private failedUrl = '';
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
    // 2026-10-21 修:资源出错时元素可能 readyState=HAVE_NOTHING,按规范给
    // currentTime 赋值会抛 InvalidStateError —— 异常会逃出事件监听器,
    // 连带把下面的状态清理跳过(曲目标签/预载标记都留着)。包 try 兜住。
    try {
      this.el.currentTime = 0;
    } catch { /* 元素没有可寻址的媒体:忽略 */ }
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
    // 换曲 = 给音乐重新一次机会(上一首的失败不该让整局静音)
    if (this.failed && this.failedUrl !== url) {
      this.failed = false;
      this.failedUrl = '';
    }
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
      // 某个剧本的曲子缺失不该影响游戏,只放弃音乐(2026-10-21 改:
      // 记下是哪一首出的问题,换曲时重新给机会,不再一错就整局静音)
      this.failed = true;
      this.failedUrl = el.currentSrc || el.src || '';
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
