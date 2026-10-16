/**
 * UI 基础件。
 *
 * 对齐 Lua 版 theme.lua 的设计语言,但用 DOM 重写:
 * 色值/字号阶全部走 CSS 令牌(base.css),这里只负责构造与拼装。
 * 美术资源自 P3 起引入(2026-10-16 起含带图组件:全站统一罗盘返回钮 backBtn)。
 */
import bgBack from '../assets/lua/back-btn.webp';

/** 建元素:tag.className / textContent */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** 清空容器 */
export function clear(node: HTMLElement): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

/** 文本块 */
export function lbl(text: string, cls = ''): HTMLElement {
  return el('p', `txt ${cls}`.trim(), text);
}

/** 竖排题签(楷体竖排,用于章节号/印章位) */
export function vText(text: string, cls = ''): HTMLElement {
  const col = el('span', `vtext ${cls}`.trim());
  // 按码点切,避免代理对被截断
  for (const ch of text) {
    if (ch === ' ' || ch === '　') continue;
    col.append(el('span', 'vtext__ch', ch));
  }
  return col;
}

/** 朱印 */
export function seal(text: string, cls = ''): HTMLElement {
  return el('span', `seal ${cls}`.trim(), text);
}

/**
 * 可点卡片。
 * locked 时给 aria-disabled 并阻止点击,而不是仅仅变灰——键盘/读屏也能感知。
 */
export function card(opts: {
  onClick?: () => void;
  locked?: boolean;
  cls?: string;
  title?: string;
}): HTMLElement {
  const node = el('div', `card ${opts.cls ?? ''}`.trim());
  if (opts.title) node.title = opts.title;
  if (opts.locked) {
    node.classList.add('is-locked');
    node.setAttribute('aria-disabled', 'true');
  } else if (opts.onClick) {
    node.setAttribute('role', 'button');
    node.tabIndex = 0;
    const fire = (e: Event): void => {
      e.preventDefault();
      opts.onClick?.();
    };
    node.addEventListener('click', fire);
    // 键盘可达:Enter / Space
    node.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') fire(e);
    });
  }
  return node;
}

/** 按钮 */
export function btn(text: string, opts: { onClick?: (e: MouseEvent) => void; variant?: 'primary' | 'ghost'; cls?: string } = {}): HTMLElement {
  const node = el(
    'button',
    `btn ${opts.variant === 'primary' ? 'btn--primary' : 'btn--ghost'} ${opts.cls ?? ''}`.trim(),
    text,
  );
  node.type = 'button';
  if (opts.onClick) node.addEventListener('click', opts.onClick);
  return node;
}

/** 分隔题签:金线 ─ 菱饰 ─ 题字 ─ 菱饰 ─ 金线(对齐 theme.Divider) */
export function divider(text: string): HTMLElement {
  const row = el('div', 'divider');
  row.append(el('span', 'divider__rule'), el('span', 'divider__gem'), lbl(text, 'divider__txt'),
    el('span', 'divider__gem'), el('span', 'divider__rule'));
  return row;
}

/** 一行键值(右栏属性条用) */
export function kv(label: string, value: string): HTMLElement {
  const row = el('div', 'kv');
  row.append(el('span', 'kv__k', label), el('span', 'kv__v', value));
  return row;
}

/** 细进度条。color 省略时走 CSS 的金色渐变(见 art.css .meter__fill) */
export function meter(pct: number, color?: string): HTMLElement {
  const track = el('div', 'meter');
  const fill = el('div', 'meter__fill');
  fill.style.width = `${Math.max(0, Math.min(100, pct))}%`;
  if (color) fill.style.background = color;
  track.append(fill);
  return track;
}
/**
 * 全站统一的罗盘返回钮(2026-10-16 拍板):复用选择页同款图与位置(top 3vh / left 3vw),
 * 样式见 base.css .pageback。绝对定位,须挂在各页根节点上(勿挂进本身带 top 偏移的
 * 容器,如 .seltop,否则双重偏移)。onBack 省略时只建按钮,回调由调用方后挂(见 wireBack)。
 */
export function backBtn(onBack?: () => void, title = '返回'): HTMLButtonElement {
  const b = el('button', 'pageback') as HTMLButtonElement;
  b.type = 'button';
  b.title = title;
  const img = el('img', 'pageback__img') as HTMLImageElement;
  img.src = bgBack;
  img.alt = '返回';
  img.draggable = false;
  b.append(img);
  if (onBack) b.addEventListener('click', onBack);
  return b;
}
