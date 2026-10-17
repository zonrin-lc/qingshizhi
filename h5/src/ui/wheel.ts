/**
 * 朝代罗盘:封存 Lua 版 scripts/qingshi/ui/wheel.lua 的 DOM 移植。
 *
 * 模型与手感参数与 Lua 完全一致:
 * - 朝代名固定在自己的方位(第 1 项在正上方),**不随盘转**;
 * - 盘面(环带 + 烘焙在顶部的指针)旋转,由指针去指当前选中的那一格;
 * - 中心盘以该朝建筑淡墨剪影为底,叠朝代大字与年代·状态(始终正立);
 *   中心盘垫在环图之下(环带内缘压住盘边),内容切换等轮盘停稳后淡入;
 * - 拖拽跟手 → 松手惯性 → 欠阻尼弹簧吸附(冲过再回摆)→ 整体归位;
 *   拖拽位移极小视为点击,按点到的方位直接选;中心盘为中枢死区。
 * - 空闲巡游:20s 无任何点击后盘面顺时针 3°/s 自转(朝代名固定不动),
 *   指针扫入左上触发区即按 秦→汉→唐→宋→明 顺序选中下一朝代(指针顺势
 *   继续顺时针摆到新朝代名上);选中后继续巡游,直到任意点击打断。
 *
 * 与 Lua 的差异只在渲染层:NanoVG 即时绘制换成 DOM + CSS transform,
 * 每帧只写 transform/位置,不重排布局。
 */
import { el, lbl } from './kit';

export interface WheelItem {
  name: string;
  era: string;
  hasData: boolean;
}

export interface WheelHandle {
  el: HTMLElement;
  /** 外部直接指定朝代(两段动画:指针先指认,再整体归位) */
  select(i: number): void;
  readonly index: number;
  destroy(): void;
}

const TAU = Math.PI * 2;
const TOP = -Math.PI / 2;

function angNorm(a: number): number {
  a %= TAU;
  return a < 0 ? a + TAU : a;
}
function angDiff(a: number, b: number): number {
  const d = angNorm(a - b);
  return d > Math.PI ? d - TAU : d;
}

// 手感参数(与 wheel.lua 一致)
const DRAG_GAIN = 1.0;
const SNAP_K = 120.0;
const SNAP_C = 19.0;
const FRICTION = 6.0;
const MAX_VEL = 12.0;
const DRAG_SLOP = 0.05;
const RE_TAU = 0.6;
const RE_SNAP = 0.002;
const POINT_K = 62.0;
const POINT_C = 15.0;
// 空闲巡游:无点击 AUTO_IDLE_MS 后启动,盘面顺时针 AUTO_SPEED(rad/s,屏幕 y 向下正角即顺时针),
// 朝代名固定不动;指针扫入左上 TRIGGER_ANG 附近 TRIGGER_WIN(step 比例)窗口即自动选中所指朝代。
// 测试钩子:window.__QS_WHEEL_AUTO_IDLE__(毫秒)/ __QS_WHEEL_AUTO_SPEED__(度每秒),正数生效。
const AUTO_IDLE_MS = 20000;
const AUTO_SPEED = Math.PI / 60;
const TRIGGER_ANG = TOP - Math.PI / 4;
const TRIGGER_WIN_RATIO = 0.12;

type Phase = 'idle' | 'drag' | 'settle' | 'point' | 'reorient' | 'auto';

export function createWheel(opts: {
  items: WheelItem[];
  index: number;
  ring: string;
  arch: Record<string, string>;
  onChange: (i: number) => void;
}): WheelHandle {
  const items = opts.items;
  const step = TAU / Math.max(1, items.length);

  let index = Math.max(0, Math.min(items.length - 1, opts.index));
  let nameOff = TOP - index * step;
  let base = 0;
  let baseVel = 0;
  let pointVel = 0;
  let phase: Phase = 'idle';
  let dragPrev = 0;
  let dragVel = 0;
  let dragT = 0;
  let accum = 0;
  let k = index;
  let reT = 0;
  /** 中心盘内容待刷新:等轮盘停稳(归位完成)再淡入切换(2026-10-15 拍板) */
  let diskDirty = false;
  const reFrom = { base: 0, nameOff: 0 };

  // ---------- 空闲巡游 ----------
  const win = window as unknown as { __QS_WHEEL_AUTO_IDLE__?: number; __QS_WHEEL_AUTO_SPEED__?: number };
  const autoIdleMs = typeof win.__QS_WHEEL_AUTO_IDLE__ === 'number' && win.__QS_WHEEL_AUTO_IDLE__ > 0
    ? win.__QS_WHEEL_AUTO_IDLE__ : AUTO_IDLE_MS;
  const autoSpeed = typeof win.__QS_WHEEL_AUTO_SPEED__ === 'number' && win.__QS_WHEEL_AUTO_SPEED__ > 0
    ? win.__QS_WHEEL_AUTO_SPEED__ * Math.PI / 180 : AUTO_SPEED;
  const triggerWin = step * TRIGGER_WIN_RATIO;
  /** 巡游中标志;选中归位后仍 true 会立即继续巡游,直到任意点击打断 */
  let attract = false;
  /** 最近一次任意点击的时间(performance.now 与 rAF ts 同时钟) */
  let lastInteract = performance.now();
  function onAnyPointer(): void {
    attract = false;
    lastInteract = performance.now();
    // 正在巡游时点击:不归选新项,平滑归位回当前朝代
    if (phase === 'auto') beginReorient();
  }
  document.addEventListener('pointerdown', onAnyPointer, true);

  // ---------- DOM ----------
  const root = el('div', 'dwheel');
  const ring = el('img', 'dwheel__ring') as HTMLImageElement;
  ring.src = opts.ring;
  ring.alt = '';
  ring.draggable = false;
  const disk = el('div', 'dwheel__disk');
  const diskArch = el('div', 'dwheel__arch') as HTMLElement;
  const diskName = el('div', 'dwheel__dyn');
  const diskEra = el('div', 'dwheel__era');
  disk.append(diskArch, diskName, diskEra);
  // 中心盘先入 DOM:垫在环图之下,环带内缘正好压住盘边(2026-10-15 拍板)
  root.append(disk, ring);
  const nameEls: HTMLElement[] = [];
  for (let i = 0; i < items.length; i += 1) {
    const n = lbl(items[i]!.name, 'dwheel__name');
    if (!items[i]!.hasData) n.classList.add('is-locked');
    root.append(n);
    nameEls.push(n);
  }

  const pointerAng = () => TOP + base;
  const nameAng = (i: number) => nameOff + i * step;

  function pickByPointer(): number {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < items.length; i += 1) {
      const d = Math.abs(angDiff(nameAng(i), pointerAng()));
      if (d < bestD) { best = i; bestD = d; }
    }
    return best;
  }

  function paintDisk(): void {
    const cur = items[index]!;
    diskName.textContent = cur.name;
    diskEra.textContent = `${cur.era}  ·  ${cur.hasData ? '已开卷' : '准备中'}`;
    const a = opts.arch[cur.name];
    diskArch.style.backgroundImage = a ? `url("${a}")` : 'none';
  }

  /** 轮盘停稳后调用:换内容并重启淡入动画(类删了再加,动画才重播) */
  function swapDiskWithFade(): void {
    paintDisk();
    disk.classList.remove('is-swap');
    void disk.offsetWidth;
    disk.classList.add('is-swap');
  }

  function paint(): void {
    const w = root.clientWidth;
    const h = root.clientHeight;
    if (w <= 0) return;
    const cx = w / 2;
    const cy = h / 2;
    const R = Math.min(w, h) * 0.4;
    ring.style.transform = `translate(-50%, -50%) rotate(${base}rad)`;
    // 中心盘文字随罗盘尺寸走(对齐 wheel.lua:R*0.46 朝代字 / R*0.072 年代)
    diskName.style.fontSize = `${R * 0.46}px`;
    diskEra.style.fontSize = `${R * 0.072}px`;
    // 朝代名放到环带圈外:环带外缘(含八向菱饰)在 0.546·min 处,名签半径 0.58·min,
    // 超出容器边缘不裁切(.selwheel 无 overflow),由行布局留白容纳
    const nameR = R * 1.45;
    for (let i = 0; i < items.length; i += 1) {
      const a = nameAng(i);
      const nel = nameEls[i]!;
      const sel = i === index;
      nel.style.left = `${cx + Math.cos(a) * nameR}px`;
      nel.style.top = `${cy + Math.sin(a) * nameR}px`;
      nel.style.fontSize = `${R * (sel ? 0.15 : 0.115)}px`;
      nel.classList.toggle('is-on', sel);
    }
  }

  // ---------- 两段式选中动画 ----------
  function select(i: number): void {
    i = Math.max(0, Math.min(items.length - 1, i));
    if (i === index && phase === 'idle') return;
    index = i;
    k = i;
    phase = 'point';
    pointVel = 0;
    diskDirty = true;
    opts.onChange(i);
  }

  function beginReorient(): void {
    phase = 'reorient';
    reT = 0;
    reFrom.base = base;
    reFrom.nameOff = nameOff;
  }

  // ---------- 拖拽 ----------
  function angleAt(ev: PointerEvent): number {
    const r = root.getBoundingClientRect();
    return Math.atan2(ev.clientY - (r.top + r.height / 2), ev.clientX - (r.left + r.width / 2));
  }

  root.addEventListener('pointerdown', (ev) => {
    ev.preventDefault();
    root.setPointerCapture(ev.pointerId);
    phase = 'drag';
    dragPrev = angleAt(ev);
    dragVel = 0;
    dragT = ev.timeStamp;
    accum = 0;
    baseVel = 0;
  });
  root.addEventListener('pointermove', (ev) => {
    if (phase !== 'drag') return;
    const a = angleAt(ev);
    const d = angDiff(a, dragPrev);
    if (Math.abs(d) > 1.2) return; // 单帧跳变过大视为噪声
    dragPrev = a;
    base += d * DRAG_GAIN;
    const dt = (ev.timeStamp - dragT) / 1000;
    dragT = ev.timeStamp;
    if (dt > 1e-4 && dt < 0.2) {
      dragVel = dragVel * 0.6 + (d / dt) * 0.4;
    }
    accum += d;
  });
  root.addEventListener('pointerup', (ev) => {
    if (phase !== 'drag') return;
    if (Math.abs(accum) < DRAG_SLOP) {
      // 视为点击:按点到的方位直接选最近的一项;中心盘为死区
      phase = 'idle';
      const r = root.getBoundingClientRect();
      const dx = ev.clientX - (r.left + r.width / 2);
      const dy = ev.clientY - (r.top + r.height / 2);
      const R = Math.min(r.width, r.height) * 0.4;
      if (Math.hypot(dx, dy) >= R * 0.65) {
        const clickAng = angNorm(Math.atan2(dy, dx));
        let best = -1;
        let bestD = Infinity;
        for (let i = 0; i < items.length; i += 1) {
          const dd = Math.abs(angDiff(nameAng(i), clickAng));
          if (dd < bestD) { best = i; bestD = dd; }
        }
        if (best >= 0) select(best);
      }
      return;
    }
    endDragWithInertia();
  });
  // 移动端 webview 里系统手势/来电/切后台会发 pointercancel 而不是 pointerup。
  // 不收尾的话 phase 永远卡在 drag:惯性、吸附、归位全停,盘面定格在松手角度。
  root.addEventListener('pointercancel', () => {
    if (phase !== 'drag') return;
    // 取消不算点击(累积位移不可信),直接带惯性进吸附
    endDragWithInertia();
  });

  /** 松手/取消共用:保留惯性(限幅)先滑行,再由帧循环吸附到最近一项 */
  function endDragWithInertia(): void {
    let v = dragVel;
    if (v > MAX_VEL) v = MAX_VEL;
    else if (v < -MAX_VEL) v = -MAX_VEL;
    baseVel = v;
    phase = 'settle';
  }

  // ---------- 帧循环(与 wheel.lua Update 同构) ----------
  let raf = 0;
  let last = 0;
  let alive = true;

  function tick(ts: number): void {
    if (!alive) return;
    const dt = last ? Math.min(0.05, (ts - last) / 1000) : 0;
    last = ts;
    if (dt > 0 && phase !== 'drag') {
      if (phase === 'idle') {
        if (!attract && ts - lastInteract >= autoIdleMs) attract = true;
        if (attract) phase = 'auto';
      }
      if (phase === 'auto') {
        // 只转盘面(指针),朝代名固定在各自方位不动;
        // 指针扫入左上触发窗即按顺序选下一朝代(秦→汉→唐→宋→明),
        // point 相会让指针顺势继续顺时针摆到新朝代名上,全程不反转
        base += autoSpeed * dt;
        if (Math.abs(angDiff(pointerAng(), TRIGGER_ANG)) < triggerWin) {
          // 内部触发不重置巡游计时:归位后继续巡游
          select((index + 1) % items.length);
        }
      }
      if (phase === 'settle') {
        if (Math.abs(baseVel) > 0.05) {
          base += baseVel * dt;
          baseVel -= baseVel * Math.min(1, FRICTION * dt);
        } else {
          baseVel = 0;
          const kk = pickByPointer();
          const target = base + angDiff(nameAng(kk), pointerAng());
          const d = angDiff(target, base);
          if (Math.abs(d) < RE_SNAP) {
            base = target;
            if (kk !== index) {
              index = kk;
              diskDirty = true;
              opts.onChange(kk);
            }
            k = kk;
            beginReorient();
          } else {
            const acc = d * SNAP_K - baseVel * SNAP_C;
            baseVel += acc * dt;
            base += baseVel * dt;
          }
        }
      } else if (phase === 'point') {
        const d = angDiff(nameAng(k), pointerAng());
        if (Math.abs(d) < RE_SNAP) {
          base += d;
          pointVel = 0;
          beginReorient();
        } else {
          const acc = d * POINT_K - pointVel * POINT_C;
          pointVel += acc * dt;
          base += pointVel * dt;
        }
      } else if (phase === 'reorient') {
        reT += dt / RE_TAU;
        if (reT >= 1) {
          reT = 1;
          base = 0;
          nameOff = TOP - index * step;
          phase = 'idle';
          // 轮盘停稳:中心盘此刻才淡入切换到新朝代(2026-10-15 拍板)
          if (diskDirty) {
            diskDirty = false;
            swapDiskWithFade();
          }
        } else {
          const e = 1 - (1 - reT) ** 3;
          base = reFrom.base * (1 - e);
          const nameTo = TOP - index * step;
          nameOff = reFrom.nameOff + angDiff(nameTo, reFrom.nameOff) * e;
        }
      }
    }
    paint();
    raf = requestAnimationFrame(tick);
  }

  paintDisk();
  raf = requestAnimationFrame(tick);

  return {
    el: root,
    // 外部指定(点击/程序调用)视为一次交互:打断巡游并重置空闲计时
    select(i: number): void {
      attract = false;
      lastInteract = performance.now();
      select(i);
    },
    get index() { return index; },
    destroy() {
      alive = false;
      cancelAnimationFrame(raf);
      document.removeEventListener('pointerdown', onAnyPointer, true);
      root.remove();
    },
  };
}
