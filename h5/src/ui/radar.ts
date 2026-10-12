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
 */
export function renderRadar(game: Game): SVGSVGElement {
  const root = svg('svg', {
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
    const v = game.attrs[k] ?? 0;
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
    const name = svg('text', { x: x.toFixed(1), y: (y - 3).toFixed(1), class: 'radar__label radar__label--name' });
    name.textContent = game.d.ATTR_NAMES[k] ?? k;
    root.append(name);
    const val = svg('text', { x: x.toFixed(1), y: (y + 8).toFixed(1), class: 'radar__label radar__label--val' });
    // 硬核模式不出数值,只出档位词(与 Lua hideAttrs 同口径)
    val.textContent = game.diff.hideAttrs ? game.attrWord(k) : String(game.attrs[k] ?? 0);
    root.append(val);
  });

  return root;
}

export { AXES as RADAR_AXES };