/**
 * 布局壳:P1 的横屏容器 + P2 的对局两栏(叙事 | 属性)。
 *
 * 结构(为 P3 预留插槽,卷轴/立绘/雷达会在此基础上替换):
 *   .viewport
 *     .stage
 *       header.stage__bar      单行顶栏
 *       .stage__cols
 *         main.stage__main     叙事区(由 Session 填充)
 *         aside.stage__side    右栏属性(由 Session 填充)
 *       footer.stage__foot     决策区
 *       .overlay               结算浮层(由 Session 填充)
 */
import { clear, el } from '../ui/kit';

export interface Shell {
  root: HTMLElement;
  /** 叙事区 */
  main: HTMLElement;
  /** 决策区 */
  foot: HTMLElement;
  bar: HTMLElement;
  /** 顶栏右侧槽位(偏离段位) */
  band: HTMLElement;
  /** 右栏 */
  side: HTMLElement;
  /** 结算浮层容器 */
  overlay: HTMLElement;
}

export function buildShell(mount: HTMLElement): Shell {
  const viewport = el('div', 'viewport');
  const stage = el('div', 'stage');

  // ---------- 顶栏 ----------
  const bar = el('header', 'stage__bar');
  const chap = el('div', 'stage__chap u-kai u-strong', '青史志');
  const band = el('div', 'stage__band', '');
  bar.append(chap, band);

  // ---------- 主体两栏 ----------
  const cols = el('div', 'stage__cols');
  const main = el('main', 'stage__main');
  const side = el('aside', 'stage__side');
  side.append(el('div', 'side__title u-kai', '身 外'));
  cols.append(main, side);

  // ---------- 底栏(决策区) ----------
  const foot = el('footer', 'stage__foot');

  // ---------- 结算浮层 ----------
  const overlay = el('div', 'overlay');
  overlay.hidden = true;

  stage.append(bar, cols, foot, overlay);
  viewport.append(stage);
  mount.append(viewport);

  return { root: viewport, main, foot, bar, band, side, overlay };
}

/** 侧栏重绘:由 Session 每次状态变化后调用 */
export function renderSide(side: HTMLElement, rows: HTMLElement[], footer?: HTMLElement): void {
  // 保留标题,只替换内容
  const keep = side.firstElementChild;
  clear(side);
  if (keep) side.append(keep);
  for (const r of rows) side.append(r);
  if (footer) side.append(footer);
}