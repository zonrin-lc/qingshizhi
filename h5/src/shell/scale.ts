/**
 * DPR / 尺寸自适应缩放驱动。
 *
 * 对应 Lua 版的 `UI.Scale.DPR_DENSITY_ADAPTIVE()`(见 urhox-libs/UI/Core):
 * 引擎侧把密度折算成一个 scale,再乘用户偏好倍率,并对最终值取下限保护。
 * H5 侧用 CSS 自定义属性 `--ui-scale` 复现同一思路——
 * 所有 rem 字号都相对它,换设备不需要改任何组件尺寸。
 *
 * 两个要点:
 *  1. 对 DPR 过小的环境取下限 0.5。Lua 版实测遇到过 DPR=0.36 的环境,
 *     直接相乘会把整个 UI 缩到 27%(这是照搬过来的经验,不是臆测)。
 *  2. 缩放跟着**逻辑视口**走,不是物理像素:物理视口随 DPR 变大,
 *     直接用它会让高 DPI 屏上的元素偏小。
 */
import { nextFrame } from '../game/raf';

export interface ScaleState {
  /** 最终缩放,写入 --ui-scale */
  scale: number;
  /** 设备像素比 */
  dpr: number;
  /** 逻辑视口宽高(px) */
  vw: number;
  vh: number;
}

/** 缩放下限,防止异常/极小视口把 UI 缩没(对应 Lua 版 protect 的下限保护) */
const MIN_SCALE = 0.5;
/** 缩放上限,避免超宽屏上字号失控 */
const MAX_SCALE = 2.0;

/** 基准设计稿尺寸:Lua 版的逻辑分辨率 */
const BASE_W = 1280;
const BASE_H = 720;

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** 读取逻辑视口尺寸:优先 visualViewport(能正确反映移动端地址栏收放) */
function readViewport(): { vw: number; vh: number } {
  const vv = window.visualViewport;
  if (vv) return { vw: vv.width, vh: vv.height };
  return { vw: window.innerWidth, vh: window.innerHeight };
}

/**
 * 计算自适应缩放。
 *
 * 主项是**视口贴合比**,而不是 DPR:
 * CSS 布局本来就以 CSS px 为准,DPR 只影响一个 CSS px 画几个设备像素,
 * 若把它当主项,高 DPI 屏上会与视口缩放**重复计数**(文字凭空胀一圈)。
 *
 * DPR 只作为温和的可读性微调:
 *   dpr ≥ 2 高密度屏,略微上调(同样的物理尺寸字更实)
 *   dpr <  1 异常环境(实测遇到过 0.36),略微下调
 *
 * 取较小边算贴合比:横屏下若用长边,窄边方向会先溢出。
 *
 * ⚠️ 这里**不能**写成 max(fit, density):density 在 dpr=1 时恒为 1,
 * 会变成「缩放永不小于 1」的地板,视口缩小时完全不缩放
 * (无头实测:视口 762×428 时 fit=0.594,却算出 scale=1.0000)。
 */
export function computeScale(): ScaleState {
  const dpr = window.devicePixelRatio || 1;
  const { vw, vh } = readViewport();

  // 视口贴合比:相对基准稿放大了多少倍
  const fit = Math.min(vw / BASE_W, vh / BASE_H);
  // DPR 微调,保持温和(±6%),避免与视口缩放重复计数
  const density = dpr >= 2 ? 1.06 : dpr < 1 ? 0.94 : 1;

  const scale = clamp(fit * density, MIN_SCALE, MAX_SCALE);
  return { scale, dpr, vw, vh };
}

/** 把缩放与视口尺寸写入 :root 的自定义属性 */
function apply(state: ScaleState): void {
  const root = document.documentElement;
  root.style.setProperty('--ui-scale', state.scale.toFixed(4));
  root.style.setProperty('--vw', `${state.vw.toFixed(2)}px`);
  root.style.setProperty('--vh', `${state.vh.toFixed(2)}px`);
}

/**
 * 启动缩放驱动,并在视口变化时重算。
 * @returns 停止函数(便于热更新与测试)
 */
export function initScale(): () => void {
  let state = computeScale();
  apply(state);

  // 先用普通事件兜底,再叠加 visualViewport(仅移动端有)
  window.addEventListener('resize', onChange);
  window.addEventListener('orientationchange', onChange);
  const vv = window.visualViewport;
  vv?.addEventListener('resize', onChange);
  vv?.addEventListener('scroll', onChange);

  // 待执行的那一帧(停函数里要能撤掉)
  let pending: (() => void) | null = null;

  function onChange(): void {
    // 移动端地址栏收放会连续触发,下一帧再算,避免中间态抖动
    // 走共享调度器的一次性帧任务:页面被容器挂后台时这一帧不会在后台执行,
    // 回到前台才补算(裸 rAF 在后台照跑,那是白烧电)。
    // 连续触发只留最后一帧:同一次 resize 突发里的几次回调算出来的值本来就一样,
    // 合并后最终值与原来一致,只是少派发几次 qingshi:scale 事件。
    pending?.();
    pending = nextFrame(() => {
      pending = null;
      state = computeScale();
      apply(state);
      window.dispatchEvent(new CustomEvent('qingshi:scale', { detail: state }));
    });
  }

  return function stop(): void {
    window.removeEventListener('resize', onChange);
    window.removeEventListener('orientationchange', onChange);
    vv?.removeEventListener('resize', onChange);
    vv?.removeEventListener('scroll', onChange);
    // 撤掉还挂着的那一帧:驱动停了就不该再有 qingshi:scale 事件
    pending?.();
    pending = null;
  };
}

/** 供调试:把当前缩放打到控制台 */
export function logScale(): void {
  const s = computeScale();
  // eslint-disable-next-line no-console
  console.info(
    `[青史志] scale=${s.scale.toFixed(3)} dpr=${s.dpr} viewport=${s.vw.toFixed(0)}×${s.vh.toFixed(0)}`,
  );
}