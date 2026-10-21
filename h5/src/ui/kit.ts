/**
 * UI 基础件。
 *
 * 对齐 Lua 版 theme.lua 的设计语言,但用 DOM 重写:
 * 色值/字号阶全部走 CSS 令牌(base.css),这里只负责构造与拼装。
 * 美术资源自 P3 起引入(2026-10-16 起含带图组件:全站统一罗盘返回钮 backBtn)。
 */
import bgBack from '../assets/lua/back-btn.webp';
import titleH from '../assets/lua/title-h.webp';
import emblemQingshi from '../assets/lua/emblem-qingshi.png';
import sealZhi from '../assets/lua/seal-zhi.png';
import { sfx, type SfxName } from '../game/sfx';

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
      sfx.play('card');
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

/** 按钮。sound 可换掉默认的点击音(如结算「阅」用 seal),传 null 则静音。 */
export function btn(text: string, opts: { onClick?: (e: MouseEvent) => void; variant?: 'primary' | 'ghost'; cls?: string; sound?: SfxName | null } = {}): HTMLElement {
  const node = el(
    'button',
    `btn ${opts.variant === 'primary' ? 'btn--primary' : 'btn--ghost'} ${opts.cls ?? ''}`.trim(),
    text,
  );
  node.type = 'button';
  const sound = opts.sound === undefined ? 'click' : opts.sound;
  if (sound) node.addEventListener('click', () => sfx.play(sound));
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

/* ---------- 模态浮层的无障碍口径(2026-10-21 修) ----------
 * 四个页面各有一份确认浮层(删存档 / 下云档 / 退游戏 / 看结局详情),
 * 行为必须一致:role=dialog + aria-modal、打开时移焦到主按钮、
 * Esc 关闭、Tab 在浮层内循环(焦点陷阱)、关闭后焦点还给触发它的元素。
 * 抄四遍必然走样(现在已经走样了),故收在 kit 里统一发牌。 */
const dlgPrevFocus = new WeakMap<HTMLElement, HTMLElement | null>();
const dlgKeyHandler = new WeakMap<HTMLElement, (e: KeyboardEvent) => void>();

/** 浮层盒内可聚焦的元素(按 tab 顺序) */
function dialogFocusables(box: HTMLElement): HTMLElement[] {
  return Array.from(box.querySelectorAll<HTMLElement>(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  ));
}

/**
 * 打开一个模态浮层:补无障碍语义与键盘行为。
 *
 * @param mask 蒙版(整幅遮罩,点它等于取消;键盘事件挂在它身上,盒内按键会冒泡上来)
 * @param box  浮层盒(真正承载内容的卷轴;role/aria-modal 挂这里)
 * @param opts.focus   打开后聚焦的元素(默认盒内第一个可聚焦元素,一般是主按钮)
 * @param opts.onClose Esc 时的收尾动作(默认直接摘掉浮层)
 *
 * 必须在盒子挂好、已入 DOM 之后调:焦点要能落到里面的按钮上。
 */
export function openDialog(
  mask: HTMLElement,
  box: HTMLElement,
  opts?: { focus?: HTMLElement | null; onClose?: () => void },
): void {
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  // 记下打开它时的焦点,关闭后还回去(浮层一摘,焦点会掉回 body)
  if (!dlgPrevFocus.has(mask)) dlgPrevFocus.set(mask, (document.activeElement as HTMLElement | null) ?? null);
  // 重复打开(同一浮层再开一次)时先摘旧监听,别叠成两个 Tab 陷阱
  const old = dlgKeyHandler.get(mask);
  if (old) mask.removeEventListener('keydown', old);
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (opts?.onClose) opts.onClose();
      else closeDialog(mask);
      return;
    }
    if (e.key !== 'Tab') return;
    // 焦点陷阱:Tab 在浮层内循环,不会跑到被蒙版盖住的页面上
    const list = dialogFocusables(box);
    if (list.length === 0) return;
    const idx = list.indexOf(document.activeElement as HTMLElement);
    const next = e.shiftKey
      ? (idx <= 0 ? list.length - 1 : idx - 1)
      : (idx < 0 || idx >= list.length - 1 ? 0 : idx + 1);
    e.preventDefault();
    list[next]?.focus();
  };
  dlgKeyHandler.set(mask, onKey);
  mask.addEventListener('keydown', onKey);
  // 焦点移到主按钮:键盘/读屏用户不用一路 Tab 找
  const target = opts?.focus ?? dialogFocusables(box)[0] ?? null;
  target?.focus?.();
}

/** 关闭模态浮层:摘掉浮层并把焦点还给打开它的元素 */
export function closeDialog(mask: HTMLElement): void {
  const onKey = dlgKeyHandler.get(mask);
  if (onKey) { mask.removeEventListener('keydown', onKey); dlgKeyHandler.delete(mask); }
  const prev = dlgPrevFocus.get(mask) ?? null;
  dlgPrevFocus.delete(mask);
  mask.remove();
  if (prev && prev.isConnected) prev.focus();
}

/* ---------- 全站轻提示(save.css .toast) ---------- */
let toastEl: HTMLElement | null = null;
let toastTimer = 0;
/** 在 host 页根弹一条提示;同屏只留一条,2.6s 自动隐藏。
 * center=true 时出现在屏幕正中且字号大一档(强提醒,如剧本未解锁) */
export function toast(host: HTMLElement, text: string, center = false): void {
  if (!toastEl || !toastEl.isConnected) {
    toastEl = lbl('', 'toast');
    toastEl.hidden = true;
  }
  if (toastEl.parentElement !== host) host.append(toastEl);
  toastEl.classList.toggle('toast--center', center);
  toastEl.textContent = text;
  toastEl.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { if (toastEl) toastEl.hidden = true; }, 2600);
}

/** 一行键值(右栏属性条用) */
export function kv(label: string, value: string): HTMLElement {
  const row = el('div', 'kv');
  row.append(el('span', 'kv__k', label), el('span', 'kv__v', value));
  return row;
}

/** 细进度条。color 省略时走 CSS 的金色渐变(见 art.css .meter__fill)。
 * 填充量走 transform: scaleX(motion-design 性能项:不触发 layout),
 * 基底宽度 100% 在 .meter__fill 里,transform-origin 左对齐。 */
export function meter(pct: number, color?: string): HTMLElement {
  const track = el('div', 'meter');
  const fill = el('div', 'meter__fill');
  const ratio = Math.max(0, Math.min(100, pct)) / 100;
  fill.style.transform = `scaleX(${ratio})`;
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
  // 返回音挂在按钮自身:onBack 可能由 wireBack 事后补挂,两处都点得出声
  b.addEventListener('click', () => sfx.play('back'));
  if (onBack) b.addEventListener('click', onBack);
  return b;
}

/**
 * 全站统一的品牌 logo 组合(2026-10-18 拍板):圆徽 + 书法标题 + 方印「志」落款 + 副题,
 * 样式见 select.css 的 .seltop__brand 系列(全局打包,跨页可用)。
 * 选择页由 .seltop 顶栏流定位到右上;其余页面(存档/图鉴/设置)加 .brandcorner
 * 绝对定位到右上(见 base.css),须挂在带定位的页根节点上。
 */
export function brandLogo(): HTMLElement {
  const brand = el('div', 'seltop__brand');
  const logo = el('div', 'seltop__logo');
  const emblemImg = el('img', 'seltop__emblem') as HTMLImageElement;
  emblemImg.src = emblemQingshi;
  emblemImg.alt = '';
  emblemImg.draggable = false;
  const titleWrap = el('div', 'seltop__titlewrap');
  const titleImg = el('img', 'seltop__title') as HTMLImageElement;
  titleImg.src = titleH;
  titleImg.alt = '青史志';
  titleImg.draggable = false;
  const sealImg = el('img', 'seltop__seal') as HTMLImageElement;
  sealImg.src = sealZhi;
  sealImg.alt = '';
  sealImg.draggable = false;
  titleWrap.append(titleImg, sealImg);
  logo.append(emblemImg, titleWrap);
  brand.append(logo, lbl('悠 悠 千 载  ·  青 史 万 卷', 'seltop__sub'));
  return brand;
}
