/**
 * 共享 rAF 调度器:全项目只有这一条 requestAnimationFrame 循环。
 *
 * 为什么要有它:
 * - 改造前缩放适配/雷达补间/选择页/罗盘巡游/对局页各跑各的 rAF,同屏就有好几条循环;
 *   TapTap 容器把页面**挂后台**时页面并不卸载,这些循环照跑不误(费电、还会在回前台时瞬移)。
 * - 收拢成一条循环之后:没有订阅者就彻底停掉 rAF(不空转);页面不可见(document.hidden)
 *   整体暂停;回前台时时间增量归零(第一帧 dt=0),动画不会瞬移;
 *   还能按订阅者限帧(空闲巡游 30fps、交互中 60fps)。
 *
 * 时间源一律用 performance.now():
 * - 单调递增,不受系统改时间影响(Date.now() 会被 NTP/手动改表拽回去,dt 会出现负值);
 * - 亚毫秒精度,60fps 下相邻两帧只差 16.7ms,Date.now() 的毫秒精度会把它量化成 16/17 抖动。
 *
 * 「虚拟时钟」说明:
 * 调度器自己维护一个 clock(初值取 performance.now()),**只在页面可见时前进**。
 * 订阅者拿到的 now 是这个虚拟时钟,dt 是「距本订阅者上次执行」的虚拟毫秒数。
 * 于是后台暂停回来时:clock 没跳(动画停在原处继续),dt 也不会出现一个巨大的值。
 *
 * 放在 game/ 而不是 ui/ 的理由:
 * 它是跨层的运行时设施 —— shell/(缩放)、ui/(雷达/选择页/罗盘)、game/(对局页)都要用,
 * 而 game/ 下已经放着一批同样跨层的运行时服务(sfx/voice/audio/settings)。
 * ui/ 放的是「界面零件」,调度器不是零件。
 */

/**
 * 帧回调。
 * @param dt  距本回调上次执行经过的毫秒数(虚拟时间;页面不可见时不走表,回前台第一帧为 0)
 * @param now 虚拟时钟毫秒值(与 performance.now() 同源,但页面不可见时停走)
 */
export type FrameFn = (dt: number, now: number) => void;

/**
 * 订阅句柄:调用它即退订。
 * setFps 用来运行时改限帧(交互中 60fps / 空闲 30fps),
 * 免得为了换帧率退订重订(那会丢掉这一帧的时间基准)。
 */
export interface FrameSubscription {
  (): void;
  setFps(fps: number): void;
}

export interface FrameOptions {
  /**
   * 限帧上限。
   * 60(默认)=每帧都跑(不额外限速,与改造前的裸 rAF 一致:刷新率 120Hz 的屏上就是 120fps);
   * 30 = 每 ~33ms 跑一次(60fps 屏上隔一帧跑一次)。
   */
  fps?: number;
}

/** 单帧步进上限(ms):主线程被长任务卡住后,别让一帧吞掉整段动画 */
const MAX_STEP = 250;
/**
 * 限帧判定容差(ms)。
 * 帧间隔有抖动(16.7ms 上下浮动),卡着整比会把 60fps 打成 30fps,所以留半毫秒余量。
 */
const EPS = 0.5;

interface Sub {
  fn: FrameFn;
  /** 最小执行间隔(ms);0 = 每帧都跑 */
  interval: number;
  /** 自上次执行以来累计的虚拟时间(ms) */
  acc: number;
  /** 是否已经执行过:第一帧必须执行(否则限帧的订阅者首帧会被跳过) */
  started: boolean;
  alive: boolean;
}

/** 常驻订阅者(动画循环) */
const subs = new Set<Sub>();
/** 一次性帧任务(「下一帧做一次」) */
const shots = new Set<() => void>();

let rafId = 0;
let running = false;
/** 上一帧读到的真实时间(ms);恢复前台时归零,让第一帧的 dt 为 0 */
let lastReal = 0;
/** 虚拟时钟(ms):只在页面可见时前进 */
let clock = performance.now();

/** 页面是否不可见(容器挂后台时为 true;页面不卸载,只是看不见) */
function isHidden(): boolean {
  return typeof document !== 'undefined' && document.hidden === true;
}

/** 帧率 → 最小执行间隔(ms);0 表示每帧都跑 */
function intervalOf(fps: number): number {
  if (!Number.isFinite(fps) || fps <= 0) return 0;
  // 60 及以上不额外限速:改造前是裸 rAF,跟着屏幕刷新率走,这里保持一致
  if (fps >= 60) return 0;
  return 1000 / fps;
}

/** 起循环(已在跑就什么都不做) */
function start(): void {
  if (running || rafId) return;
  // 页面不可见时不启动:等 visibilitychange 回来再启,避免后台空转
  if (isHidden()) return;
  running = true;
  // 时间增量归零:第一帧的 dt 记 0(回前台时那一大段空白时间不算进动画)
  lastReal = 0;
  rafId = requestAnimationFrame(tick);
}

/** 停循环 */
function stop(): void {
  running = false;
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = 0;
  }
}

function tick(): void {
  rafId = 0;
  if (!running) return;
  // 后台兜底:即便容器没派发 visibilitychange,这里也能发现并停下
  if (isHidden()) {
    stop();
    return;
  }
  const real = performance.now();
  const step = lastReal ? Math.min(MAX_STEP, real - lastReal) : 0;
  lastReal = real;
  clock += step;

  // 订阅者快照要先取:本帧才订阅的下一个帧再跑(与裸 rAF「回调里再 rAF 就是下一帧」的语义一致)
  const list = [...subs];

  // 一次性帧任务先跑(它们多半是「量一下布局/滚一下」,早一拍无副作用)
  if (shots.size) {
    const pending = [...shots];
    shots.clear();
    for (const fn of pending) fn();
  }

  for (const s of list) {
    if (!s.alive) {
      subs.delete(s);
      continue;
    }
    s.acc += step;
    if (!s.started) {
      // 第一帧必须执行,且 dt 记 0(与改造前「last 为 0 时 dt=0」一致)
      s.started = true;
      s.acc = 0;
      s.fn(0, clock);
      continue;
    }
    // 限帧:没到间隔就跳过这一帧(但累计时间照走,补帧时 dt 是整段,动画速度不变)
    if (s.interval > 0 && s.acc < s.interval - EPS) continue;
    const dt = s.acc;
    s.acc = 0;
    s.fn(dt, clock);
  }

  if (subs.size || shots.size) rafId = requestAnimationFrame(tick);
  else stop();
  syncListener();
}

/** 可见性变化:隐藏就整体暂停,回来就续跑(时间增量由 start() 归零) */
function onVisibility(): void {
  if (isHidden()) {
    stop();
    return;
  }
  if (subs.size || shots.size) start();
}

let listening = false;
/** 有订阅者时才挂可见性监听:没人要跑帧的时候,连监听都不留 */
function syncListener(): void {
  const need = subs.size > 0 || shots.size > 0;
  if (need === listening) return;
  listening = need;
  if (need) {
    document.addEventListener('visibilitychange', onVisibility);
    // 兜底:部分 WebView 回前台不一定派 visibilitychange,focus 更稳
    window.addEventListener('focus', onVisibility);
  } else {
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('focus', onVisibility);
  }
}

/**
 * 订阅帧回调(常驻动画循环用)。
 * @returns 退订函数;页面销毁时必须调它,否则来回切页会越挂越多
 */
export function subscribeFrame(fn: FrameFn, opts?: FrameOptions): FrameSubscription {
  const sub: Sub = {
    fn,
    interval: intervalOf(opts?.fps ?? 60),
    acc: 0,
    started: false,
    alive: true,
  };
  subs.add(sub);
  syncListener();
  start();

  return Object.assign(
    (): void => {
      if (!sub.alive) return;
      sub.alive = false;
      subs.delete(sub);
      syncListener();
      if (!subs.size && !shots.size) stop();
    },
    {
      setFps: (fps: number): void => {
        const next = intervalOf(fps);
        // 档位没变就别动:否则每次调用都会把累计时间清零,限帧的订阅者永远攒不够一帧
        if (next === sub.interval) return;
        sub.interval = next;
        // 换档位时把累计清零:新档位下的第一帧 dt 就是一帧的时长,
        // 而不是把旧档位攒下的时间也一并算进来(否则 60→30 的第一帧会走两帧的量)
        sub.acc = 0;
      },
    },
  );
}

/**
 * 「下一帧做一次」。
 * 一次性任务不占订阅者名额,但会让循环多活一帧(跑完就停)。
 * @returns 取消函数(还没跑到就取消掉)
 */
export function nextFrame(fn: () => void): () => void {
  shots.add(fn);
  syncListener();
  start();
  return (): void => {
    shots.delete(fn);
    syncListener();
    if (!subs.size && !shots.size) stop();
  };
}

/** 虚拟时钟(毫秒):页面不可见时停走 */
export function rafNow(): number {
  return clock;
}

/** 当前常驻订阅者数量(验收用:页面来回切几轮后应回到 0) */
export function rafSubscriberCount(): number {
  return subs.size;
}

/** 帧循环是否在跑(验收用) */
export function rafRunning(): boolean {
  return running;
}

/**
 * 调试钩子(window.__QS_RAF__):与 wheel.ts 的 __QS_WHEEL_AUTO_IDLE__ 同一路数,
 * 供验收脚本在页内查「现在有几个订阅者在跑」。
 */
if (typeof window !== 'undefined') {
  (window as unknown as { __QS_RAF__?: unknown }).__QS_RAF__ = {
    count: rafSubscriberCount,
    running: rafRunning,
    now: rafNow,
  };
}
