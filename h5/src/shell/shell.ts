/**
 * 布局壳:P1 只搭结构,不含玩法。
 *
 * 层级(与 Lua 版 shell.lua 的 contentRoot 对齐,为 P2/P3 预留插槽):
 *   .viewport            横屏容器(安全区内缩)
 *     .stage
 *       header.stage__bar     单行顶栏(章节 / 偏离段位 / 菜单)
 *       main.stage__body      主体:P2 放叙事+选项,P3 放卷轴/立绘/右栏
 *       footer.stage__foot    底部决策区
 *
 * P1 的验收标准是「壳子能立住、引擎与数据能被浏览器消费」,
 * 因此这里不画任何玩法内容,只保证结构、横屏、DPR 与字体栈就位。
 */
import { SCENARIOS } from '../data/scenarios';

export interface Shell {
  root: HTMLElement;
  body: HTMLElement;
  foot: HTMLElement;
  bar: HTMLElement;
  /** 顶栏右侧的偏离段位槽位(P2 起显示实际段位) */
  band: HTMLElement;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function buildShell(mount: HTMLElement): Shell {
  const viewport = el('div', 'viewport');
  const stage = el('div', 'stage');

  // ---------- 顶栏 ----------
  const bar = el('header', 'stage__bar');
  const chap = el('div', 'stage__chap u-kai u-strong', '青史志');
  const band = el('div', 'stage__band u-gold', '');
  bar.append(chap, band);

  // ---------- 主体 ----------
  const body = el('main', 'stage__body');
  const hint = el('div', 'stage__hint u-dim');
  hint.innerHTML = `
    <p class="u-kai u-heavy" style="font-size:var(--fs-h2);margin:0 0 var(--sp-md)">
      布局壳就位
    </p>
    <p style="margin:0 0 var(--sp-sm)">
      横屏容器 · DPR 自适应 · 楷体/宋体栈已生效。
    </p>
    <p style="margin:0" class="u-dim">
      规则引擎已从 <code>@engine</code> 引入，数据 ${SCENARIOS.length} 个剧本自
      <code>@data</code> 直接 import。玩法内容待 P2 接入。
    </p>
  `;
  body.append(hint);

  // ---------- 底栏 ----------
  const foot = el('footer', 'stage__foot');

  stage.append(bar, body, foot);
  viewport.append(stage);
  mount.append(viewport);

  return { root: viewport, body, foot, bar, band };
}