/**
 * 主菜单:封存 Lua 版 home.lua renderMenu 的 H5 复刻。
 *
 * 版式:整页水墨山水底;左侧 56% 是竖排书法标题(星火粒子常驻),
 * 右侧 44% 是米白纱帘菜单(开始/继续/存档/设置/退出)。
 *
 * 入场时序与 Lua 一致(自绘插值,不用 CSS transition 的延迟链):
 *   一、标题淡入(1.0s,easeOutCubic,停留至 1.5s)
 *   二、停留 1.0s(让标题独自站定)
 *   三、右帘从屏外推入 + 标题左移归位(同步 0.9s)
 *   四、星火淡入(1.0s)后常驻
 *
 * 「退出游戏」在浏览器里没法真退出:确认后给出落幕页(青史长存,后会有期),
 * 而不是调 window.close() —— 非脚本打开的窗口会被浏览器拒绝,表现为没反应。
 */
import { el, lbl } from './kit';
import { APP_VERSION } from '../game/settings';

import titleImg from '../assets/lua/title-calligraphy.webp';

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

// ---------- 星火粒子(ui/sparks.lua 的 canvas 移植) ----------
interface Spark {
  x: number; y: number; r: number; vy: number;
  sway: number; phase: number; life: number; age: number;
}

function spawnSpark(w: number, h: number, initial: boolean): Spark {
  const rnd = (a: number, b: number) => a + (b - a) * Math.random();
  const life = rnd(2.6, 5.2);
  return {
    x: rnd(w * 0.06, w * 0.94),
    y: rnd(h * 0.02, h * 0.98),
    r: rnd(3.0, 6.0),
    vy: -rnd(10, 26),
    sway: rnd(0.4, 1.3),
    phase: rnd(0, Math.PI * 2),
    life,
    age: initial ? rnd(0, life) : 0,
  };
}

export function renderMenu(host: HTMLElement, act: MenuActions): MenuPage {
  host.querySelector('.menu')?.remove();
  const root = el('div', 'menu');

  // ---------- 左侧:书法标题 + 星火 ----------
  const titleWrap = el('div', 'menu__titlewrap');
  const titleBox = el('div', 'menu__titlebox');
  const sparksCv = el('canvas', 'menu__sparks') as HTMLCanvasElement;
  const art = el('img', 'menu__title') as HTMLImageElement;
  art.src = titleImg;
  art.alt = '青史志';
  art.draggable = false;
  titleBox.append(sparksCv, art);
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

  // ---------- 入场时序 + 星火(单 rAF 循环) ----------
  const reduced = typeof matchMedia === 'function'
    && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let alive = true;
  let raf = 0;
  let last = 0;
  // 阶段计时:t 是当前阶段已进行秒数
  let stage = reduced ? 5 : 1;
  let t = 0;
  const sparks: Spark[] = [];
  const ctx = sparksCv.getContext('2d');

  const easeOut = (p: number) => 1 - (1 - p) ** 3;

  function layout(): { W: number; boxW: number; boxH: number } {
    const W = root.clientWidth || 1280;
    const boxW = titleBox.clientWidth || 264;
    const boxH = titleBox.clientHeight || 556;
    return { W, boxW, boxH };
  }

  function applyStage(): void {
    const { W } = layout();
    const curtainW = W * 0.44;
    const titleOff = W * 0.22;
    if (stage === 1) {
      titleWrap.style.transform = `translateX(${titleOff}px)`;
      titleWrap.style.opacity = '0';
      curtain.style.transform = `translateX(${curtainW + 4}px)`;
      (root.querySelector('.menu__edge') as HTMLElement).style.transform =
        `translateX(${curtainW + 4}px)`;
      sparksCv.style.opacity = '0';
    } else if (stage >= 5) {
      titleWrap.style.transform = 'translateX(0px)';
      titleWrap.style.opacity = '1';
      curtain.style.transform = 'translateX(0px)';
      (root.querySelector('.menu__edge') as HTMLElement).style.transform = 'translateX(0px)';
      sparksCv.style.opacity = '1';
    }
  }

  function tick(ts: number): void {
    if (!alive) return;
    const dt = last ? Math.min(0.05, (ts - last) / 1000) : 0;
    last = ts;
    t += dt;

    // ---- 入场时序 ----
    const { W } = layout();
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
      if (t >= 0.9) { stage = 4; t = 0; }
    } else if (stage === 4) {
      const p = Math.min(1, t / 1.0);
      sparksCv.style.opacity = String(easeOut(p));
      if (t >= 1.0) { sparksCv.style.opacity = '1'; stage = 5; t = 0; }
    }

    // ---- 星火 ----
    if (ctx) {
      const { boxW, boxH } = layout();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (sparksCv.width !== Math.round(boxW * dpr) || sparksCv.height !== Math.round(boxH * dpr)) {
        sparksCv.width = Math.round(boxW * dpr);
        sparksCv.height = Math.round(boxH * dpr);
      }
      const sx = boxW / 264; // Lua 的粒子域是 264×556,按实际盒宽等比换算
      if (sparks.length === 0 && boxW > 0) {
        for (let i = 0; i < 26; i += 1) sparks.push(spawnSpark(264, 556, true));
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, boxW, boxH);
      for (let i = 0; i < sparks.length; i += 1) {
        let p = sparks[i]!;
        p.age += dt;
        if (p.age >= p.life) { p = spawnSpark(264, 556, false); sparks[i] = p; }
        p.y += p.vy * dt;
        p.x += Math.sin(p.age * 1.6 + p.phase) * p.sway * dt * 12;
        if (p.y < -20) p.y = 556 + 10;
        if (p.x < 0) p.x = 0; else if (p.x > 264) p.x = 264;
        const k = p.age / p.life;
        let a = Math.sin(k * Math.PI);
        a *= a;
        if (a > 0.02) {
          const x = p.x * sx;
          const y = p.y * sx;
          const rr = p.r * sx;
          // 外晕(深琥珀)+ 亮芯(近白暖金),与 sparks.lua 同色
          ctx.beginPath();
          ctx.arc(x, y, rr * 3.2, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(214, 150, 58, ${(a * 90) / 255})`;
          ctx.fill();
          ctx.beginPath();
          ctx.arc(x, y, rr * 1.15, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255, 236, 176, ${a})`;
          ctx.fill();
        }
      }
    }
    raf = requestAnimationFrame(tick);
  }

  applyStage();
  raf = requestAnimationFrame(tick);

  return {
    root,
    destroy() {
      alive = false;
      cancelAnimationFrame(raf);
      root.remove();
    },
  };
}
