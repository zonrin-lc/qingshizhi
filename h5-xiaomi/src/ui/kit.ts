/**
 * 菜单类界面共用的 canvas 小工具:几何、描框、按钮、换行。
 *
 * 对局屏(scenes/play.ts)自带一套同名实现,是因为它的排版与烘焙跟这里不同频;
 * 这里只收菜单页真正重复的部分,不往对局屏倒灌。
 */

import { COLOR } from '../port/theme';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 字号 → ctx.font 字符串(楷体优先,回落衬线) */
export type Font = (size: number, bold?: boolean) => string;

export interface TapHit {
  rect: Rect;
  on: () => void;
}

export const inRect = (x: number, y: number, r: Rect): boolean =>
  x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

export function roundRect(ctx: CanvasRenderingContext2D, r: Rect, radius: number): void {
  const rr = Math.min(radius, r.w / 2, r.h / 2);
  ctx.beginPath();
  ctx.moveTo(r.x + rr, r.y);
  ctx.arcTo(r.x + r.w, r.y, r.x + r.w, r.y + r.h, rr);
  ctx.arcTo(r.x + r.w, r.y + r.h, r.x, r.y + r.h, rr);
  ctx.arcTo(r.x, r.y + r.h, r.x, r.y, rr);
  ctx.arcTo(r.x, r.y, r.x + r.w, r.y, rr);
  ctx.closePath();
}

export function fitCover(sw: number, sh: number, iw: number, ih: number): Rect {
  const s = Math.max(sw / iw, sh / ih);
  const w = iw * s;
  const h = ih * s;
  return { x: (sw - w) / 2, y: (sh - h) / 2, w, h };
}

export function fitContain(sw: number, sh: number, iw: number, ih: number): Rect {
  const s = Math.min(sw / iw, sh / ih);
  const w = iw * s;
  const h = ih * s;
  return { x: (sw - w) / 2, y: (sh - h) / 2, w, h };
}

export function makeFont(family: string | null): Font {
  const fam = family ? `"${family}", ` : '';
  return (size: number, bold = false) => `${bold ? 'bold ' : ''}${size}px ${fam}serif`;
}

/** 一次画完的底框:填充 + 描边(缺省不描) */
export function frame(
  ctx: CanvasRenderingContext2D,
  r: Rect,
  o: { fill?: string; stroke?: string; radius?: number; width?: number; alpha?: number },
): void {
  ctx.save();
  if (o.alpha !== undefined) ctx.globalAlpha = o.alpha;
  if (o.fill) {
    ctx.fillStyle = o.fill;
    roundRect(ctx, r, o.radius ?? 10);
    ctx.fill();
  }
  if (o.stroke) {
    ctx.strokeStyle = o.stroke;
    ctx.lineWidth = o.width ?? 1;
    roundRect(ctx, r, o.radius ?? 10);
    ctx.stroke();
  }
  ctx.restore();
}

/** 按宽度逐字换行;超限行数时末行去尾补省略号 */
export function wrapLines(
  ctx: CanvasRenderingContext2D,
  font: Font,
  text: string,
  size: number,
  bold: boolean,
  maxW: number,
  maxLines = 99,
): string[] {
  ctx.font = font(size, bold);
  const out: string[] = [];
  let line = '';
  for (const ch of text) {
    const test = line + ch;
    if (ctx.measureText(test).width > maxW && line) {
      out.push(line);
      line = ch;
    } else {
      line = test;
    }
  }
  if (line) out.push(line);
  if (out.length > maxLines) {
    out.length = maxLines;
    const last = out[maxLines - 1] ?? '';
    out[maxLines - 1] = `${last.slice(0, Math.max(1, last.length - 1))}…`;
  }
  return out;
}

/** 按钮三态配色:主(朱)/次(纸)/金 */
export function button(
  ctx: CanvasRenderingContext2D,
  font: Font,
  r: Rect,
  label: string,
  o: { variant?: 'primary' | 'ghost' | 'gold'; disabled?: boolean; size?: number; radius?: number } = {},
): void {
  const variant = o.variant ?? 'ghost';
  const radius = o.radius ?? 8;
  ctx.save();
  if (o.disabled) ctx.globalAlpha = 0.4;
  if (variant === 'primary') {
    ctx.fillStyle = COLOR.zhu;
    roundRect(ctx, r, radius);
    ctx.fill();
  } else if (variant === 'gold') {
    ctx.fillStyle = COLOR.goldHi;
    roundRect(ctx, r, radius);
    ctx.fill();
  } else {
    ctx.fillStyle = 'rgba(246,239,224,0.92)';
    roundRect(ctx, r, radius);
    ctx.fill();
    ctx.strokeStyle = COLOR.line;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.fillStyle = variant === 'ghost' ? COLOR.ink : '#f6efe0';
  ctx.font = font(o.size ?? 22, true);
  ctx.textAlign = 'center';
  ctx.fillText(label, r.x + r.w / 2, r.y + (r.h - (o.size ?? 22)) / 2 + 1);
  ctx.textAlign = 'left';
  ctx.restore();
}

/** 胶囊(难度/开关):选中描朱,未选留纸 */
export function chip(
  ctx: CanvasRenderingContext2D,
  font: Font,
  r: Rect,
  label: string,
  on: boolean,
  size = 19,
): void {
  ctx.save();
  ctx.fillStyle = on ? 'rgba(176,67,47,0.10)' : 'rgba(246,239,224,0.85)';
  roundRect(ctx, r, r.h / 2);
  ctx.fill();
  ctx.strokeStyle = on ? COLOR.zhu : COLOR.lineSoft;
  ctx.lineWidth = on ? 1.6 : 1;
  ctx.stroke();
  ctx.fillStyle = on ? COLOR.zhu : COLOR.inkSoft;
  ctx.font = font(size, on);
  ctx.textAlign = 'center';
  ctx.fillText(label, r.x + r.w / 2, r.y + (r.h - size) / 2 + 1);
  ctx.textAlign = 'left';
  ctx.restore();
}

/** 顶层命中:后画的优先(与对局屏同口径) */
export function fireTap(x: number, y: number, hits: TapHit[]): boolean {
  for (let i = hits.length - 1; i >= 0; i--) {
    const h = hits[i];
    if (h && inRect(x, y, h.rect)) {
      h.on();
      return true;
    }
  }
  return false;
}

/**
 * 全屏压暗层:必须按「屏幕在设计坐标里的实际范围」铺,
 * 不能只填 1280×720 —— 异形屏下多出来的边会漏光(右/下一条亮边)。
 */
export function veil(ctx: CanvasRenderingContext2D, plat: { screenW: number; screenH: number; scale: number; offsetX: number; offsetY: number }): void {
  const x = -plat.offsetX / plat.scale;
  const y = -plat.offsetY / plat.scale;
  ctx.fillStyle = 'rgba(24,20,15,0.55)';
  ctx.fillRect(x, y, plat.screenW / plat.scale, plat.screenH / plat.scale);
}

/**
 * 页脚小注:底图在页面下缘往往是最亮的(水面/远山),纯文字会被吃掉,
 * 所以统一垫一层薄纸。right 对齐时 x 是右边界。
 */
export function notePlate(
  ctx: CanvasRenderingContext2D,
  font: Font,
  text: string,
  x: number,
  y: number,
  align: 'left' | 'right' = 'right',
  size = 15,
): void {
  ctx.font = font(size);
  const w = ctx.measureText(text).width + 26;
  const bx = align === 'right' ? x - w : x;
  frame(ctx, { x: bx, y: y - 7, w, h: size + 15 }, { fill: 'rgba(246,239,224,0.74)', radius: 7 });
  ctx.fillStyle = COLOR.inkSoft;
  ctx.textAlign = 'left';
  ctx.fillText(text, bx + 13, y);
}
