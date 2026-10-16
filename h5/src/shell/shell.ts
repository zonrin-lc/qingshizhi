/**
 * 布局壳:横屏容器 + 对局两栏(叙事 | 属性)。
 *
 * 结构(P3 已补美术层,装饰与内容分层):
 *   .viewport
 *     .stage[data-bg]         背景贴图层
 *       .stage__deco          梅枝/竹影装饰(不吃点击)
 *       header.stage__bar      返回(罗盘,绝对定位) | 标题 | 回溯
 *       .stage__cols           两行网格:文本行 + 选项行
 *         main.stage__main     剧情卷轴(立绘 + 叙事)
 *         aside.stage__side    属性卷轴(雷达 + 条形,纵跨两行)
 *         footer.stage__foot   选项区(与文本区同宽)
 *       .overlay               浮层
 */
import { backBtn, clear, el, lbl } from '../ui/kit';

export type PageBg = 'game' | 'menu' | 'select' | 'save' | 'settings' | 'summary' | 'ending' | '';

export interface Shell {
  root: HTMLElement;
  stage: HTMLElement;
  deco: HTMLElement;
  main: HTMLElement;
  foot: HTMLElement;
  bar: HTMLElement;
  cols: HTMLElement;
  chap: HTMLElement;
  band: HTMLElement;
  side: HTMLElement;
  overlay: HTMLElement;
  hint: HTMLElement;
}

export function buildShell(mount: HTMLElement): Shell {
  const viewport = el('div', 'viewport');
  const stage = el('div', 'stage');

  // ---------- 装饰层(P3) ----------
  const deco = el('div', 'stage__deco');
  deco.append(el('div', 'deco deco-plum-tr'), el('div', 'deco deco-bamboo-l'));
  stage.append(deco);

  // ---------- 顶栏 ----------
  const bar = el('header', 'stage__bar');
  // 返回钮:全站统一的罗盘按钮(kit.backBtn / .pageback),绝对定位脱出顶栏流,
  // 不占标题区的布局位。
  const back = backBtn(undefined, '返回');
  const chapWrap = el('div', 'stage__head');
  // 标题下的金线分隔去掉(2026-10-15 用户拍板),标题区只留章名
  const chap = el('div', 'stage__chap u-kai u-heavy', '青史志');
  chapWrap.append(chap);
  const band = el('div', 'stage__band', '');
  bar.append(back, chapWrap, band);

  // ---------- 主体两栏 + 底部选项区 ----------
  // foot 收进 cols(2026-10-15 拍板):cols 变两行网格,属性区纵跨两行,
  // 底部与选项卡行下缘对齐;选项区宽度 = 中部文本区宽度,天然一致。
  const cols = el('div', 'stage__cols');
  const main = el('main', 'stage__main panel-scroll');
  const side = el('aside', 'stage__side panel-plain');
  const foot = el('footer', 'stage__foot');
  cols.append(main, side, foot);

  // ---------- 浮层 ----------
  const overlay = el('div', 'overlay');
  overlay.hidden = true;

  stage.append(bar, cols, overlay);
  viewport.append(stage);
  mount.append(viewport);

  // ---------- 竖屏引导 ----------
  // 全游戏强制横屏(2026-10-14 用户拍板):竖屏下 16:9 的棋盘放不下带边框的
  // 卷轴,菜单/选择/对局/设置一律盖住,提示转屏。见 art.css 竖屏引导一节。
  const hint = el('div', 'rotate-hint');
  hint.append(
    el('div', 'rotate-hint__icon'),
    lbl('请 横 屏 游 玩', 'rotate-hint__txt'),
    lbl('横屏后可见完整的剧情卷轴与选项', 'rotate-hint__sub'),
  );
  stage.append(hint);

  return { root: viewport, stage, deco, main, foot, bar, cols, chap, band, side, overlay, hint };
}

/** 切背景(不同页面用不同底图) */
export function setBg(stage: HTMLElement, bg: PageBg): void {
  if (bg) stage.setAttribute('data-bg', bg);
  else stage.removeAttribute('data-bg');
}

/** 显示/隐藏装饰枝叶(部分页面自带完整背景,不需要再叠装饰) */
export function setDeco(deco: HTMLElement, on: boolean): void {
  deco.hidden = !on;
}

/**
 * 返回按钮挂回调(幂等)。
 *
 * 顶栏返回钮是常驻 DOM,而每开一局都会重新 wiring —— 直接 addEventListener
 * 会叠加,第 N 局点一次返回就触发 N 次回调。这里先摘旧回调再挂新的。
 */
const BACK_CB = Symbol('qingshi.back');
export function wireBack(shell: Shell, fn: () => void): void {
  const b = shell.bar.querySelector('.pageback') as (HTMLElement & { [BACK_CB]?: () => void }) | null;
  if (!b) return;
  if (b[BACK_CB]) b.removeEventListener('click', b[BACK_CB]);
  b[BACK_CB] = fn;
  b.addEventListener('click', fn);
}

/**
 * 侧栏重绘:由 Session 每次状态变化后调用。
 *
 * 注意不要「保留首个子元素当标题」——侧栏首元素是雷达 SVG,
 * 那样每次重绘都会多留一份雷达,叠出好几层。这里一律全量替换。
 */
export function renderSide(side: HTMLElement, rows: Element[]): void {
  clear(side);
  for (const r of rows) side.append(r);
}