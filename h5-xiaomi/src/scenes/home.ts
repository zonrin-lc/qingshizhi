/**
 * 主菜单:水墨底 + 竖排书法题名 + 继续/入局/存档/设置。
 *
 * 对应 h5/src/ui/menu.ts 的语义(继续旅程最显眼、无档时压暗),
 * 但不搬 DOM 版的分层视频与行舟:qg 没有视频层,主包也放不下 mp4。
 */

import type { Platform } from '../port/platform';
import type { AssetStore } from '../port/assets';
import { IMG } from '../port/assets';
import { COLOR, DESIGN_H, DESIGN_W } from '../port/theme';
import { APP_VERSION } from '../port/version';
import { DIFF_LABEL, type SaveStore, type Slot } from '../game/saves';
import type { Sfx } from '../game/sfx';
import { button, fireTap, fitCover, frame, makeFont, notePlate, type Font, type TapHit } from '../ui/kit';

export interface HomeActions {
  /** 入局 → 选剧本 */
  onStart(): void;
  /** 继续旅程:直接读最新一条自动档 */
  onContinue(slot: Slot): void;
  onSaves(): void;
  onSettings(): void;
}

export class HomeScene {
  private hits: TapHit[] = [];
  private readonly font: Font;

  constructor(
    private readonly plat: Platform,
    private readonly assets: AssetStore,
    fontFamily: string | null,
    private readonly saves: SaveStore,
    private readonly sfx: Sfx | null,
    private readonly act: HomeActions,
  ) {
    this.font = makeFont(fontFamily);
  }

  pointerDown(_x: number, _y: number, _id: number): void {
    /* 菜单页不做拖拽 */
  }

  pointerMove(_x: number, _y: number, _id: number): void {
    /* 同上 */
  }

  pointerUp(x: number, y: number, _id: number): void {
    fireTap(x, y, this.hits);
  }

  /** 冒烟用:当前可点区域(设计坐标) */
  debug(): { screen: string; hits: { kind: string; x: number; y: number; w: number; h: number }[] } {
    return {
      screen: 'home',
      hits: this.hits.map((h) => ({ kind: 'tap', x: h.rect.x, y: h.rect.y, w: h.rect.w, h: h.rect.h })),
    };
  }

  draw(): void {
    const { ctx, dpr, screenW, screenH, scale, offsetX, offsetY } = this.plat;
    this.hits = [];
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = COLOR.app;
    ctx.fillRect(0, 0, screenW, screenH);
    const bg = this.assets.get(IMG.menuBg);
    if (bg) {
      const r = fitCover(screenW, screenH, bg.w, bg.h);
      ctx.drawImage(bg.img, r.x, r.y, r.w, r.h);
    }

    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * offsetX, dpr * offsetY);
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';

    this.drawTitle();
    this.drawEntry();
    this.drawFoot();
  }

  /** 组合题名:花纹徽 → 竖排书法 → 朱印 */
  private drawTitle(): void {
    const { ctx } = this.plat;
    const art = this.assets.get(IMG.title);
    const boxH = 258;
    const boxW = art ? Math.round((boxH * art.w) / art.h) : 120;
    const cx = DESIGN_W / 2;
    const top = 66;
    if (art) ctx.drawImage(art.img, cx - boxW / 2, top, boxW, boxH);

    const icon = this.assets.get(IMG.logoIcon);
    if (icon) {
      const s = 78;
      ctx.globalAlpha = 0.92;
      ctx.drawImage(icon.img, cx - boxW / 2 - s - 26, top + 26, s, s);
      ctx.globalAlpha = 1;
    }
    const yin = this.assets.get(IMG.logoYin);
    if (yin) ctx.drawImage(yin.img, cx + boxW / 2 + 14, top + 190, 46, 46);

    // 副题:与存档页页脚同口径的小字
    ctx.fillStyle = COLOR.inkDim;
    ctx.font = this.font(18);
    ctx.textAlign = 'center';
    ctx.fillText('一 卷 青 史 ， 五 种 人 生', cx, top + boxH + 18);
    ctx.textAlign = 'left';
  }

  private drawEntry(): void {
    const { ctx } = this.plat;
    const latest = this.saves.getLatestAuto();
    const cx = DESIGN_W / 2;

    // 继续旅程胶囊:无档时压暗且不可点
    const res = { x: cx - 268, y: 398, w: 536, h: 64 };
    frame(ctx, res, {
      fill: latest ? 'rgba(246,239,224,0.90)' : 'rgba(246,239,224,0.55)',
      stroke: latest ? COLOR.line : COLOR.lineSoft,
      radius: 32,
    });
    ctx.textAlign = 'left';
    if (latest) {
      ctx.fillStyle = COLOR.inkHeavy;
      ctx.font = this.font(21, true);
      ctx.fillText(`${latest.scenName} · ${latest.chapterTitle}`, res.x + 28, res.y + 14);
      ctx.fillStyle = COLOR.inkSoft;
      ctx.font = this.font(15);
      ctx.fillText(DIFF_LABEL[latest.diffKey] ?? '', res.x + 28, res.y + 41);
      ctx.fillStyle = COLOR.zhu;
      ctx.font = this.font(18, true);
      ctx.textAlign = 'right';
      ctx.fillText('继续 ›', res.x + res.w - 26, res.y + 22);
      ctx.textAlign = 'left';
      this.hits.push({
        rect: res,
        on: () => {
          this.sfx?.play('click');
          this.act.onContinue(latest);
        },
      });
    } else {
      ctx.fillStyle = COLOR.inkSoft;
      ctx.font = this.font(19);
      ctx.textAlign = 'center';
      ctx.fillText('尚无存档 · 青史待启', cx, res.y + 21);
      ctx.textAlign = 'left';
    }

    // 主按钮「入 局」
    const enter = { x: cx - 140, y: 480, w: 280, h: 66 };
    button(ctx, this.font, enter, '入 局', { variant: 'primary', size: 30 });
    this.hits.push({
      rect: enter,
      on: () => {
        this.sfx?.play('enter');
        this.act.onStart();
      },
    });

    // 次级项:存 档 ｜ 设 置
    const hasSaves = this.saves.listAutos().length > 0;
    const subY = 568;
    const w = 92;
    const gap = 30;
    const total = w * 2 + gap;
    const x0 = cx - total / 2;
    const mk = (label: string, x: number, enabled: boolean, fn: () => void): void => {
      const r = { x, y: subY, w, h: 38 };
      ctx.globalAlpha = enabled ? 1 : 0.45;
      ctx.fillStyle = enabled ? COLOR.inkStrong : COLOR.inkDim;
      ctx.font = this.font(20);
      ctx.textAlign = 'center';
      ctx.fillText(label, r.x + r.w / 2, r.y + 8);
      ctx.textAlign = 'left';
      ctx.globalAlpha = 1;
      // 细下划线:菜单项的书卷感
      ctx.strokeStyle = enabled ? COLOR.line : COLOR.lineSoft;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(r.x + 16, r.y + 32);
      ctx.lineTo(r.x + r.w - 16, r.y + 32);
      ctx.stroke();
      if (!enabled) return;
      this.hits.push({
        rect: r,
        on: () => {
          this.sfx?.play('click');
          fn();
        },
      });
    };
    mk('存 档', x0, hasSaves, () => this.act.onSaves());
    ctx.fillStyle = COLOR.line;
    ctx.font = this.font(18);
    ctx.textAlign = 'center';
    ctx.fillText('｜', x0 + w + gap / 2, subY + 8);
    ctx.textAlign = 'left';
    mk('设 置', x0 + w + gap, true, () => this.act.onSettings());
  }

  private drawFoot(): void {
    const { ctx } = this.plat;
    notePlate(ctx, this.font, `青史志 ${APP_VERSION}`, DESIGN_W - 40, DESIGN_H - 30, 'right', 14);
    ctx.textAlign = 'left';
  }
}
