/**
 * 存档页:按剧本分页列出自动档(每本最多 6 条),可读、可删。
 *
 * 与 h5/src/ui/savepage.ts 的一处口径差别:归档(暂存)那一段不在主界面出现,
 * 只作为切后台时的防丢兜底留在存储里 —— 这一版没有「云档/本地档」双栏,
 * 多一列反而会让玩家分不清该读哪条。
 */

import type { Platform } from '../port/platform';
import type { AssetStore } from '../port/assets';
import { IMG } from '../port/assets';
import { COLOR, DESIGN_H, DESIGN_W } from '../port/theme';
import { SCENARIOS, type ScenarioMeta } from '../data/scenarios';
import {
  AUTO_MAX,
  DIFF_LABEL,
  fmtTime,
  type AutoEntry,
  type SaveStore,
  type Slot,
} from '../game/saves';
import type { Sfx } from '../game/sfx';
import { button, fireTap, fitCover, frame, makeFont, notePlate, veil, type Font, type TapHit } from '../ui/kit';

export interface SavesActions {
  onLoad(slot: Slot, scenKey: string): void;
  onBack(): void;
}

const BACK = { x: 62, y: 28, w: 82, h: 34 } as const;
const TABS = { x0: 70, y: 100, w: 214, gap: 10, h: 42 } as const;
const LIST = { x: 70, y: 166, w: 1140, rowH: 64, gap: 10 } as const;

export class SavesScene {
  private hits: TapHit[] = [];
  private readonly font: Font;
  private tab = 0;
  private confirm: { text: string; detail: string; onOk: () => void } | null = null;

  constructor(
    private readonly plat: Platform,
    private readonly assets: AssetStore,
    fontFamily: string | null,
    private readonly saves: SaveStore,
    private readonly sfx: Sfx | null,
    private readonly act: SavesActions,
  ) {
    this.font = makeFont(fontFamily);
  }

  private get scen(): ScenarioMeta {
    return SCENARIOS[this.tab] ?? SCENARIOS[0]!;
  }

  pointerDown(_x: number, _y: number, _id: number): void {
    /* 存档页不拖拽 */
  }

  pointerMove(_x: number, _y: number, _id: number): void {
    /* 同上 */
  }

  pointerUp(x: number, y: number, _id: number): void {
    if (this.confirm) {
      // 弹框只有两个命中区,用回调直接判定
      const box = { x: DESIGN_W / 2 - 280, y: 236, w: 560, h: 236 };
      const yes = { x: box.x + box.w / 2 - 150, y: box.y + box.h - 66, w: 140, h: 44 };
      const no = { x: box.x + box.w / 2 + 10, y: box.y + box.h - 66, w: 140, h: 44 };
      const c = this.confirm;
      if (x >= yes.x && x <= yes.x + yes.w && y >= yes.y && y <= yes.y + yes.h) {
        this.confirm = null;
        c.onOk();
      } else if (x >= no.x && x <= no.x + no.w && y >= no.y && y <= no.y + no.h) {
        this.confirm = null;
      }
      return;
    }
    fireTap(x, y, this.hits);
  }

  /** 冒烟用:当前可点区域(设计坐标) */
  debug(): { screen: string; hits: { kind: string; x: number; y: number; w: number; h: number }[] } {
    return {
      screen: 'saves',
      hits: this.hits.map((h) => ({ kind: 'tap', x: h.rect.x, y: h.rect.y, w: h.rect.w, h: h.rect.h })),
    };
  }

  draw(): void {
    const { ctx, dpr, screenW, screenH, scale, offsetX, offsetY } = this.plat;
    this.hits = [];
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = COLOR.app;
    ctx.fillRect(0, 0, screenW, screenH);
    const bg = this.assets.get(IMG.bgSave);
    if (bg) {
      const r = fitCover(screenW, screenH, bg.w, bg.h);
      ctx.drawImage(bg.img, r.x, r.y, r.w, r.h);
    }

    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * offsetX, dpr * offsetY);
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';

    this.drawHead();
    this.drawTabs();
    this.drawList();
    this.drawFoot();
    if (this.confirm) this.drawConfirm();
  }

  private drawHead(): void {
    const { ctx } = this.plat;
    button(ctx, this.font, BACK, '返回', { size: 18, radius: 6 });
    this.hits.push({
      rect: BACK,
      on: () => {
        this.sfx?.play('back');
        this.act.onBack();
      },
    });
    ctx.fillStyle = COLOR.inkHeavy;
    ctx.font = this.font(32, true);
    ctx.textAlign = 'center';
    ctx.fillText('存 档', DESIGN_W / 2, 30);
    ctx.textAlign = 'left';
    ctx.strokeStyle = COLOR.goldHi;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(DESIGN_W / 2 - 90, 78);
    ctx.lineTo(DESIGN_W / 2 + 90, 78);
    ctx.stroke();
    ctx.strokeStyle = COLOR.lineSoft;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(70, 78);
    ctx.lineTo(DESIGN_W / 2 - 106, 78);
    ctx.moveTo(DESIGN_W / 2 + 106, 78);
    ctx.lineTo(DESIGN_W - 70, 78);
    ctx.stroke();
  }

  private drawTabs(): void {
    const { ctx } = this.plat;
    SCENARIOS.forEach((s, i) => {
      const r = { x: TABS.x0 + i * (TABS.w + TABS.gap), y: TABS.y, w: TABS.w, h: TABS.h };
      const on = i === this.tab;
      const count = this.saves.autoCount(s.key);
      frame(ctx, r, {
        fill: on ? 'rgba(246,239,224,0.96)' : 'rgba(246,239,224,0.55)',
        stroke: on ? COLOR.zhu : COLOR.lineSoft,
        width: on ? 1.6 : 1,
        radius: 8,
      });
      ctx.fillStyle = on ? COLOR.inkHeavy : COLOR.inkSoft;
      ctx.font = this.font(19, on);
      ctx.textAlign = 'center';
      ctx.fillText(`${s.protag} · ${count}`, r.x + r.w / 2, r.y + 11);
      ctx.textAlign = 'left';
      this.hits.push({
        rect: r,
        on: () => {
          if (i === this.tab) return;
          this.tab = i;
          this.sfx?.play('click');
        },
      });
    });
  }

  private drawList(): void {
    const { ctx } = this.plat;
    const entries = this.saves.listAutoEntries(this.scen.key).slice(0, AUTO_MAX);
    if (entries.length === 0) {
      const box = { x: LIST.x, y: LIST.y, w: LIST.w, h: 300 };
      frame(ctx, box, { fill: 'rgba(246,239,224,0.55)', stroke: COLOR.lineSoft, radius: 10 });
      ctx.fillStyle = COLOR.inkDim;
      ctx.font = this.font(22);
      ctx.textAlign = 'center';
      ctx.fillText(`「${this.scen.protag}」尚无存档`, DESIGN_W / 2, box.y + 116);
      ctx.font = this.font(17);
      ctx.fillText('对局中离开时若已经营满 5 轮，会自动存一条', DESIGN_W / 2, box.y + 158);
      ctx.textAlign = 'left';
      return;
    }

    entries.forEach((e: AutoEntry, i: number) => {
      const y = LIST.y + i * (LIST.rowH + LIST.gap);
      const r = { x: LIST.x, y, w: LIST.w, h: LIST.rowH };
      frame(ctx, r, { fill: 'rgba(246,239,224,0.92)', stroke: COLOR.lineSoft, radius: 8 });
      // 序号桩
      ctx.fillStyle = COLOR.zhu;
      ctx.font = this.font(16, true);
      ctx.textAlign = 'center';
      ctx.fillText(String(i + 1), r.x + 22, r.y + 22);
      ctx.textAlign = 'left';

      const s = e.slot;
      ctx.fillStyle = COLOR.inkHeavy;
      ctx.font = this.font(22, true);
      ctx.fillText(s.chapterTitle, r.x + 46, r.y + 10);
      ctx.fillStyle = COLOR.inkDim;
      ctx.font = this.font(15);
      const roundTxt = s.roundNo && s.roundNo > 0 ? `第 ${s.roundNo} 轮` : '章首';
      const bt = s.backtracksLeft < 0 ? '回溯不限' : `回溯 ${s.backtracksLeft}`;
      ctx.fillText(
        `${DIFF_LABEL[s.diffKey]} · ${roundTxt} · ${bt} · ${fmtTime(s.at)}`,
        r.x + 46,
        r.y + 40,
      );

      const read = { x: r.x + r.w - 210, y: r.y + 12, w: 98, h: 40 };
      button(ctx, this.font, read, '读 档', { variant: 'primary', size: 18, radius: 6 });
      this.hits.push({
        rect: read,
        on: () => {
          this.sfx?.play('enter');
          this.act.onLoad(s, this.scen.key);
        },
      });

      const del = { x: r.x + r.w - 100, y: r.y + 12, w: 82, h: 40 };
      button(ctx, this.font, del, '删 除', { size: 18, radius: 6 });
      this.hits.push({
        rect: del,
        on: () => {
          this.sfx?.play('dialog');
          this.confirm = {
            text: '删除这条存档？',
            detail: `${s.chapterTitle} · ${fmtTime(s.at)} ‑ 删除后不可恢复`,
            onOk: () => {
              this.saves.removeAuto(this.scen.key, e.idx);
              this.sfx?.play('back');
            },
          };
        },
      });
    });
  }

  private drawFoot(): void {
    const { ctx } = this.plat;
    notePlate(
      ctx,
      this.font,
      `每部剧本最多 ${AUTO_MAX} 条自动档 · 读档即回到存档那一刻`,
      DESIGN_W - 70,
      DESIGN_H - 40,
      'right',
    );
    ctx.textAlign = 'left';
  }

  private drawConfirm(): void {
    const { ctx } = this.plat;
    const c = this.confirm;
    if (!c) return;
    veil(ctx, this.plat);
    const box = { x: DESIGN_W / 2 - 280, y: 236, w: 560, h: 236 };
    frame(ctx, box, { fill: COLOR.paper, stroke: COLOR.line, width: 1.5, radius: 10 });
    ctx.fillStyle = COLOR.inkHeavy;
    ctx.font = this.font(26, true);
    ctx.textAlign = 'center';
    ctx.fillText(c.text, box.x + box.w / 2, box.y + 36);
    ctx.fillStyle = COLOR.inkSoft;
    ctx.font = this.font(18);
    ctx.fillText(c.detail, box.x + box.w / 2, box.y + 86);
    ctx.textAlign = 'left';

    const yes = { x: box.x + box.w / 2 - 150, y: box.y + box.h - 66, w: 140, h: 44 };
    const no = { x: box.x + box.w / 2 + 10, y: box.y + box.h - 66, w: 140, h: 44 };
    button(ctx, this.font, yes, '删 除', { variant: 'primary', size: 20 });
    button(ctx, this.font, no, '再 想 想', { size: 20 });
  }
}

