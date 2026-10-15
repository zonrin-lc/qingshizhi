/**
 * 主菜单:封存 Lua 版 home.lua renderMenu 的 H5 复刻。
 *
 * 版式:整页水墨山水底;左侧 56% 是组合主 logo(花纹在上、竖排书法居中、
 * 朱印压文字右下角),右侧 44% 是米白纱帘菜单(开始/继续/存档/设置/退出)。
 *
 * 入场时序与 Lua 一致(自绘插值,不用 CSS transition 的延迟链):
 *   一、标题淡入(1.0s,easeOutCubic,停留至 1.5s)
 *   二、停留 1.0s(让标题独自站定)
 *   三、右帘从屏外推入 + 标题左移归位(同步 0.9s)
 *
 * 「退出游戏」在浏览器里没法真退出:确认后给出落幕页(青史长存,后会有期),
 * 而不是调 window.close() —— 非脚本打开的窗口会被浏览器拒绝,表现为没反应。
 */
import { el, lbl } from './kit';
import { APP_VERSION } from '../game/settings';

import titleImg from '../assets/lua/title-calligraphy.webp';
import logoIconImg from '../assets/lua/logo-icon.webp';
import logoYinImg from '../assets/lua/logo-yin.webp';

export interface MenuActions {
  /** 开始游戏 → 选择页 */
  onStart(): void;
  /** 继续旅程(有存档才可用):单档直接进,多档去存档页 */
  onContinue(): void;
  /** 查看存档(有存档才可用) */
  onSaves(): void;
  onSettings(): void;
  /** 是否有可用存档(决定继续/存档两项亮不亮) */
  hasSaves(): boolean;
}

export interface MenuPage {
  root: HTMLElement;
  destroy(): void;
}

export function renderMenu(host: HTMLElement, act: MenuActions): MenuPage {
  host.querySelector('.menu')?.remove();
  const root = el('div', 'menu');

  // ---------- 左侧:组合主 logo(花纹 + 书法 + 朱印) ----------
  const titleWrap = el('div', 'menu__titlewrap');
  const titleBox = el('div', 'menu__titlebox');
  const icon = el('img', 'menu__logoicon') as HTMLImageElement;
  icon.src = logoIconImg;
  icon.alt = '';
  icon.draggable = false;
  const art = el('img', 'menu__title') as HTMLImageElement;
  art.src = titleImg;
  art.alt = '青史志';
  art.draggable = false;
  const seal = el('img', 'menu__seal') as HTMLImageElement;
  seal.src = logoYinImg;
  seal.alt = '';
  seal.draggable = false;
  titleBox.append(icon, art, seal);
  titleWrap.append(titleBox);
  root.append(titleWrap);

  // ---------- 右侧:纱帘菜单 ----------
  const curtain = el('div', 'menu__curtain');
  curtain.append(
    lbl('悠悠千载　青史万卷', 'menu__sub'),
    lbl('若置身棋局　当如何落子', 'menu__sub menu__sub--gap'),
  );
  const items = el('div', 'menu__items');
  const mkItem = (text: string, enabled: boolean, onClick?: () => void, cls = '') => {
    const it = el('button', `menu__item ${cls}`.trim());
    it.type = 'button';
    it.append(el('span', 'menu__label', text), el('span', 'menu__under'));
    if (enabled && onClick) it.addEventListener('click', onClick);
    else {
      it.disabled = true;
      it.classList.add('is-off');
    }
    return it;
  };
  items.append(
    mkItem('开 始 游 戏', true, act.onStart, 'menu__item--start'),
    mkItem('继 续 旅 程', act.hasSaves(), act.onContinue, 'menu__item--continue'),
    mkItem('查 看 存 档', act.hasSaves(), act.onSaves),
    mkItem('设 置 一 下', true, act.onSettings),
    mkItem('退 出 游 戏', true, () => showExitConfirm(), 'menu__item--exit'),
  );
  curtain.append(items, lbl(APP_VERSION, 'menu__ver'));
  root.append(curtain);
  root.append(el('div', 'menu__edge'));
  host.append(root);

  // ---------- 退出确认 → 落幕 ----------
  function showExitConfirm(): void {
    const ov = el('div', 'menu__confirm');
    const box = el('div', 'menu__confirmbox');
    box.append(lbl('退出游戏？', 'menu__confirmtitle u-kai'),
      lbl('确定要放下笔,离开这卷青史吗？', 'menu__confirmtext'));
    const row = el('div', 'menu__confirmrow');
    const yes = el('button', 'menu__cbtn menu__cbtn--yes', '退 出');
    const no = el('button', 'menu__cbtn', '再 想 想');
    yes.type = 'button';
    no.type = 'button';
    yes.addEventListener('click', () => {
      ov.remove();
      root.classList.add('is-farewell');
      const fw = el('div', 'menu__farewell');
      const again = el('button', 'menu__cbtn menu__cbtn--yes', '再 执 笔');
      again.type = 'button';
      again.addEventListener('click', () => {
        fw.remove();
        root.classList.remove('is-farewell');
      });
      fw.append(lbl('青史长存 · 后会有期', 'menu__farewelltext u-kai'), again);
      root.append(fw);
    });
    no.addEventListener('click', () => ov.remove());
    row.append(yes, no);
    box.append(row);
    ov.append(box);
    root.append(ov);
  }

  // ---------- 入场时序(单 rAF 循环,落幕后停止) ----------
  const reduced = typeof matchMedia === 'function'
    && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let alive = true;
  let raf = 0;
  let last = 0;
  // 阶段计时:t 是当前阶段已进行秒数
  let stage = reduced ? 5 : 1;
  let t = 0;

  const easeOut = (p: number) => 1 - (1 - p) ** 3;

  function applyStage(): void {
    const W = root.clientWidth || 1280;
    const curtainW = W * 0.44;
    const titleOff = W * 0.22;
    if (stage === 1) {
      titleWrap.style.transform = `translateX(${titleOff}px)`;
      titleWrap.style.opacity = '0';
      curtain.style.transform = `translateX(${curtainW + 4}px)`;
      (root.querySelector('.menu__edge') as HTMLElement).style.transform =
        `translateX(${curtainW + 4}px)`;
    } else if (stage >= 5) {
      titleWrap.style.transform = 'translateX(0px)';
      titleWrap.style.opacity = '1';
      curtain.style.transform = 'translateX(0px)';
      (root.querySelector('.menu__edge') as HTMLElement).style.transform = 'translateX(0px)';
    }
  }

  function tick(ts: number): void {
    if (!alive) return;
    const dt = last ? Math.min(0.05, (ts - last) / 1000) : 0;
    last = ts;
    t += dt;

    // ---- 入场时序 ----
    const W = root.clientWidth || 1280;
    const curtainW = W * 0.44;
    const titleOff = W * 0.22;
    if (stage === 1) {
      const p = Math.min(1, t / 1.0);
      titleWrap.style.opacity = String(easeOut(p));
      titleWrap.style.transform = `translateX(${titleOff}px)`;
      if (t >= 1.5) { stage = 2; t = 0; }
    } else if (stage === 2) {
      if (t >= 1.0) { stage = 3; t = 0; }
    } else if (stage === 3) {
      const p = Math.min(1, t / 0.9);
      const e = easeOut(p);
      titleWrap.style.transform = `translateX(${titleOff * (1 - e)}px)`;
      const cx = (curtainW + 4) * (1 - e);
      curtain.style.transform = `translateX(${cx}px)`;
      (root.querySelector('.menu__edge') as HTMLElement).style.transform = `translateX(${cx}px)`;
      if (t >= 0.9) { stage = 5; t = 0; applyStage(); return; }
    }
    raf = requestAnimationFrame(tick);
  }

  applyStage();
  if (stage < 5) raf = requestAnimationFrame(tick);

  return {
    root,
    destroy() {
      alive = false;
      cancelAnimationFrame(raf);
      root.remove();
    },
  };
}
