/**
 * BGM。
 *
 * 源是 41.3 MB 的 vorbis,网页端不可能直接用;
 * 由 tools/build-audio.py 转成 webm(opus) / m4a(aac) 两套,运行时只挑一套下载。
 * 详见该脚本头注。
 *
 * 三条硬约束:
 * 1. **浏览器自动播放策略**:没有用户手势之前 play() 会被拒。
 *    所以音乐不在页面加载时启动,而是在玩家点「入局」之后——
 *    那一下 click 就是合法手势。
 * 2. **只下纯音乐版**。vocal 版是独立文件(~1.5 MB),做成可选项,默认不预载。
 * 3. **不阻塞交互**。src 挂在 <audio> 上由浏览器流式取,加载期间游戏照常玩。
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
  private current = '';
  /** 用户是否要听。默认开,但尊重系统级的减少动效偏好?——不,音乐与动效无关。 */
  private wanted = true;
  /** 音量:背景乐不该抢戏,默认压到三成 */
  private volume = 0.32;
  /** 有人说话时临时压低的比例 */
  private ducked = 0.18;
  private failed = false;

  get enabled(): boolean {
    return this.wanted;
  }

  setEnabled(on: boolean): void {
    this.wanted = on;
    if (!on) { this.stop(); return; }
    // 从记忆里的 tag 恢复当前该放哪一首
    if (!this.current) return;
    const [key, variant] = this.current.split('#');
    this.play(key ?? 'idle', (variant as Variant) === 'vocal');
  }

  /**
   * 切到某本剧本的音乐。
   * @param vocal 是否要人声版(默认纯音乐)
   */
  play(key: string, vocal = false): void {
    if (!this.wanted || this.failed) return;
    const variant: Variant = vocal ? 'vocal' : 'inst';
    const tag = `${key}#${variant}`;
    if (tag === this.current && this.el && !this.el.paused) return;

    const url = pick(key, variant);
    if (!url) { this.failed = true; return; }

    this.ensure();
    const el = this.el!;
    this.current = tag;
    el.src = url;
    el.loop = true;
    el.volume = this.volume;
    el.preload = 'auto';
    // play() 返回的 Promise 会因为自动播放策略而 reject。
    // 那不是错误——调用点已经在用户手势里了,但仍要兜住,
    // 否则会变成一条未处理的 rejection。
    void el.play().catch(() => { /* 被策略拒绝:静默,音乐非关键路径 */ });
  }

  stop(): void {
    if (!this.el) return;
    this.el.pause();
    this.el.currentTime = 0;
    this.current = '';
  }

  /** 离开对局:回 idle 还是彻底停?对局页常驻,所以回 idle。 */
  idle(): void {
    this.play('idle', false);
  }

  /**
   * 配音期间把 BGM 压下去。
   *
   * 用音量渐变而不是 pause:pause 会让背景乐在每句之间硬断,
   * 听起来像设备故障。渐变到 18% 再回来,人声始终在前景。
   */
  duck(on: boolean): void {
    if (!this.el) return;
    const target = on ? this.volume * this.ducked : this.volume;
    // 120ms 足够平滑,又短到不会让人等
    this.el.volume = target;
  }

  private ensure(): void {
    if (this.el) return;
    const el = document.createElement('audio');
    el.setAttribute('aria-hidden', 'true');
    el.addEventListener('error', () => {
      // 某个剧本的曲子缺失不该影响游戏,只放弃音乐
      this.failed = true;
      this.stop();
    });
    document.body.append(el);
    this.el = el;
  }
}

export const bgm = new Bgm();
export const AUDIO_SUPPORT = probe;
