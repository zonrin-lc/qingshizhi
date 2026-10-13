/**
 * 布局壳:横屏容器 + 对局两栏(叙事 | 属性)。
 *
 * 结构(P3 已补美术层,装饰与内容分层):
 *   .viewport
 *     .stage[data-bg]         背景贴图层
 *       .stage__deco          梅枝/竹影装饰(不吃点击)
 *       header.stage__bar      返回 | 标题+金线 | 回溯
 *       .stage__cols
 *         main.stage__main     剧情卷轴(立绘 + 叙事)
 *         aside.stage__side    属性卷轴(雷达 + 条形)
 *       footer.stage__foot     选项区
 *       .overlay               浮层
 */
import { clear, el, lbl } from '../ui/kit';

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
  const back = el('button', 'topbtn topbtn--back', '返 回');
  back.type = 'button';
  back.title = '返回';
  const chapWrap = el('div', 'stage__head');
  const chap = el('div', 'stage__chap u-kai u-heavy', '青史志');
  const rule = el('div', 'stage__rule');
  chapWrap.append(chap, rule);
  const band = el('div', 'stage__band', '');
  bar.append(back, chapWrap, band);

  // ---------- 主体两栏 ----------
  const cols = el('div', 'stage__cols');
  const main = el('main', 'stage__main panel-scroll');
  const side = el('aside', 'stage__side panel-plain');
  cols.append(main, side);

  // ---------- 底栏(选项区) ----------
  const foot = el('footer', 'stage__foot');

  // ---------- 浮层 ----------
  const overlay = el('div', 'overlay');
  overlay.hidden = true;

  stage.append(bar, cols, foot, overlay);
  viewport.append(stage);
  mount.append(viewport);

  // ---------- 竖屏引导 ----------
  // 竖屏下棋盘被压成 16:9,放不下带边框的卷轴(见 art.css 的说明),
  // 所以竖屏不渲染对局,直接提示转屏。
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

/** 返回按钮挂回调 */
export function wireBack(shell: Shell, fn: () => void): void {
  const b = shell.bar.querySelector('.topbtn--back');
  b?.addEventListener('click', fn);
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