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

export interface ScaleState {
  /** 最终缩放,写入 --ui-scale */
  scale: number;
  /** 设备像素比 */
  dpr: number;
  /** 逻辑视口宽高(px) */
  vw: number;
  vh: number;
}

/** 缩放下限,防止异常 DPR 把 UI 缩没 */
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
 * 策略:取「逻辑视口相对基准稿的放大比」与「DPR 密度」的较大者。
 * - 逻辑视口放大比负责让大屏上的内容相对更大
 * - DPR 负责在物理尺寸小但像素密的设备上保持可读性
 */
export function computeScale(): ScaleState {
  const dpr = window.devicePixelRatio || 1;
  const { vw, vh } = readViewport();

  // 视口放大比:用较短边,避免横屏下被长边拉爆
  const fit = Math.min(vw / BASE_W, vh / BASE_H);
  // DPR 折算:1x → 1.0,2x → 1.18,3x → 1.30(次线性,避免高 DPI 下字号过胀)
  const density = 1 + Math.log2(Math.max(1, dpr)) * 0.18;

  const scale = clamp(Math.max(fit, density), MIN_SCALE, MAX_SCALE);
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

  function onChange(): void {
    // 移动端地址栏收放会连续触发,下一帧再算,避免中间态抖动
    requestAnimationFrame(() => {
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