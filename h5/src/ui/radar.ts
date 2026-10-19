/**
 * 五维雷达图(SVG)。
 *
 * 对局页右栏「自身」那一组属性用。参考图里是:金色细线五边形外框 +
 * 朱色半透明填充内五边形 + 顶点朱点,标签在五边形外侧。
 *
 * 不用 canvas:五边形只有 5 条边,SVG 的 stroke-dasharray 天然适合画网格圈,
 * 且能随 --ui-scale 直接缩放,不必重绘。
 */
import type { AttrKey, Game } from '../../types/scenario';

/** 顺时针自正上方:突破 → 武力 → 才学 → 谋略 → 辩才 */
const AXES: AttrKey[] = ['tupo', 'wuli', 'caixue', 'moulue', 'biancai'];

const SIZE = 240;
const CX = SIZE / 2;
const CY = SIZE / 2 + 6;
/** 外接圆半径:留出标签空间 */
const R = 74;

/** 极坐标 → 直角坐标。angle 从正上方起,顺时针。 */
function pt(i: number, ratio: number): [number, number] {
  const a = (Math.PI * 2 * i) / AXES.length - Math.PI / 2;
  return [CX + Math.cos(a) * R * ratio, CY + Math.sin(a) * R * ratio];
}

/** 若干比例点连成多边形字符串 */
function poly(ratios: number[]): string {
  return ratios.map((r, i) => pt(i, r).map((n) => n.toFixed(1)).join(',')).join(' ');
}

const SVG_NS = 'http://www.w3.org/2000/svg';

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string> = {}): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

/**
 * 画雷达图。
 * @param game 用于取 attrs / attrMax / attrWord / diff.hideAttrs
 * @param values 旧值覆盖(2026-10-18 拍板):飞字落定前右栏保持旧值——
 *   表内的轴用旧值画,落定了就从表里放出来;表空传 undefined 即全取现值
 */
export function renderRadar(game: Game, values?: Partial<Record<AttrKey, number>>): SVGSVGElement {  const root = svg('svg', {
    class: 'radar',
    viewBox: `0 0 ${SIZE} ${SIZE + 8}`,
    role: 'img',
    'aria-label': '自身五维',
  });

  // 网格圈:1/5 ~ 5/5
  for (let ring = 1; ring <= 5; ring += 1) {
    const r = ring / 5;
    root.append(
      svg('polygon', {
        points: poly(AXES.map(() => r)),
        class: ring === 5 ? 'radar__ring radar__ring--outer' : 'radar__ring',
        fill: 'none',
        'stroke-width': ring === 5 ? '1' : '0.6',
      }),
    );
  }
  // 轴线
  for (let i = 0; i < AXES.length; i += 1) {
    const [x, y] = pt(i, 1);
    root.append(svg('line', {
      x1: String(CX), y1: String(CY),
      x2: x.toFixed(1), y2: y.toFixed(1),
      class: 'radar__axis',
    }));
  }

  // 数据多边形
  const ratios = AXES.map((k) => {
    const max = game.attrMax(k);
    const v = values?.[k] ?? game.attrs[k] ?? 0;
    return max > 0 ? Math.max(0, Math.min(1, v / max)) : 0;
  });
  root.append(svg('polygon', {
    points: poly(ratios),
    class: 'radar__data',
    'stroke-width': '1.4',
    'stroke-linejoin': 'round',
  }));
  AXES.forEach((_, i) => {
    const [x, y] = pt(i, ratios[i] ?? 0);
    root.append(svg('circle', { cx: x.toFixed(1), cy: y.toFixed(1), r: '2.6', class: 'radar__dot' }));
  });

  // 标签:属性名在外圈,数值印在名下方(对齐参考图「突破 / 72」的双行排布)
  AXES.forEach((k, i) => {
    const [x, y] = pt(i, 1.22);
    const name = svg('text', { x: x.toFixed(1), y: (y - 7).toFixed(1), class: 'radar__label radar__label--name' });
    name.textContent = game.d.ATTR_NAMES[k] ?? k;
    root.append(name);
    const val = svg('text', { x: x.toFixed(1), y: (y + 9).toFixed(1), class: 'radar__label radar__label--val', 'data-attr': k });
    // 硬核模式不出数值,只出档位词(与 Lua hideAttrs 同口径)
    val.textContent = game.diff.hideAttrs ? game.attrWord(k) : String(values?.[k] ?? game.attrs[k] ?? 0);
    root.append(val);
  });

  return root;
}

/**
 * 数值变化补间版(motion-design):同 renderRadar 画终值,但数据多边形/顶点/数值标签
 * 从旧值(from:未落定的轴用旧值,其余轴用现值)逐帧插值滑到新值。
 * SVG points 属性不可 CSS 过渡,这里用 rAF 手动插值(380ms,ease-out-cubic)。
 * 无变化、或系统开了「减少动态效果」时退化为直接出终值。
 */
export function renderRadarTween(game: Game, from?: Partial<Record<AttrKey, number>>): SVGSVGElement {
  const root = renderRadar(game);
  const toRatios = AXES.map((k) => ratioOf(game, k));
  const fromRatios = AXES.map((k) => {
    const v = from?.[k] ?? game.attrs[k] ?? 0;
    const max = game.attrMax(k);
    return max > 0 ? Math.max(0, Math.min(1, v / max)) : 0;
  });
  if (fromRatios.every((r, i) => Math.abs(r - (toRatios[i] ?? 0)) < 0.001)) return root;
  if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) return root;

  const data = root.querySelector<SVGPolygonElement>('.radar__data');
  const dots = root.querySelectorAll<SVGCircleElement>('.radar__dot');
  const labels = root.querySelectorAll<SVGTextElement>('text.radar__label--val');
  if (!data || dots.length !== AXES.length) return root;

  const DUR = 380;
  const t0 = performance.now();
  const step = (now: number): void => {
    const t = Math.min(1, (now - t0) / DUR);
    const e = 1 - Math.pow(1 - t, 3); /* ease-out-cubic:快起缓落 */
    const rs = fromRatios.map((r, i) => r + ((toRatios[i] ?? 0) - r) * e);
    data.setAttribute('points', poly(rs));
    dots.forEach((d, i) => {
      const [x, y] = pt(i, rs[i] ?? 0);
      d.setAttribute('cx', x.toFixed(1));
      d.setAttribute('cy', y.toFixed(1));
    });
    if (!game.diff.hideAttrs) {
      labels.forEach((l, i) => {
        const k = AXES[i];
        if (!k) return;
        const v0 = from?.[k] ?? game.attrs[k] ?? 0;
        const v1 = game.attrs[k] ?? 0;
        l.textContent = String(Math.round(v0 + (v1 - v0) * e));
      });
    }
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  return root;
}

function ratioOf(game: Game, k: AttrKey): number {
  const max = game.attrMax(k);
  if (max <= 0) return 0;
  return Math.max(0, Math.min(1, (game.attrs[k] ?? 0) / max));
}

export { AXES as RADAR_AXES };