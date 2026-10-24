/**
 * 选剧本页:五本手风琴式立绘卡 + 难度胶囊 + 入局。
 *
 * 对应 h5/src/ui/select.ts,砍掉两处对这个切片无意义的东西:
 * - 朝代罗盘(汉/唐/宋/明 都还没有数据,点了也只是预告页);
 * - 异步取数态(五本 JSON 已随主包静态引入,不存在「正在展卷」的等待)。
 */

import type { Platform } from '../port/platform';
import type { AssetStore } from '../port/assets';
import { IMG } from '../port/assets';
import { COLOR, DESIGN_H, DESIGN_W } from '../port/theme';
import { SCENARIOS, DIFFICULTIES, type ScenarioMeta } from '../data/scenarios';
import { scenarioData } from '../data/library';
import { DIFF_LABEL } from '../game/saves';
import type { DiffKey } from '../../types/scenario';
import type { Sfx } from '../game/sfx';
import { button, chip, fireTap, fitCover, frame, makeFont, notePlate, roundRect, type Font, type TapHit } from '../ui/kit';

export interface SelectActions {
  onEnter(key: string, diff: DiffKey): void;
  onBack(): void;
}

const BACK = { x: 62, y: 28, w: 82, h: 34 } as const;
const CARDS = { x0: 70, y: 106, w: 1140, h: 380, gap: 12 } as const;
const PLATE_H = 84;
const CHIP_Y = 512;
const START = { x: 1002, y: 508, w: 198, h: 62 } as const;

export class SelectScene {
  private hits: TapHit[] = [];
  private readonly font: Font;
  private curIndex: number;
  private diff: DiffKey = 'normal';

  constructor(
    private readonly plat: Platform,
    private readonly assets: AssetStore,
    fontFamily: string | null,
    private readonly sfx: Sfx | null,
    private readonly act: SelectActions,
    private readonly initialKey?: string,
  ) {
    this.font = makeFont(fontFamily);
    const hit = this.initialKey ? SCENARIOS.findIndex((s) => s.key === this.initialKey) : -1;
    this.curIndex = hit >= 0 ? hit : 0;
  }

  private get cur(): ScenarioMeta {
    return SCENARIOS[this.curIndex] ?? SCENARIOS[0]!;
  }

  pointerDown(_x: number, _y: number, _id: number): void {
    /* 选剧本页不拖拽 */
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
      screen: 'select',
      hits: this.hits.map((h) => ({ kind: 'tap', x: h.rect.x, y: h.rect.y, w: h.rect.w, h: h.rect.h })),
    };
  }

  draw(): void {
    const { ctx, dpr, screenW, screenH, scale, offsetX, offsetY } = this.plat;
    this.hits = [];
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = COLOR.app;
    ctx.fillRect(0, 0, screenW, screenH);
    const bg = this.assets.get(IMG.bgSelect);
    if (bg) {
      const r = fitCover(screenW, screenH, bg.w, bg.h);
      ctx.drawImage(bg.img, r.x, r.y, r.w, r.h);
    }

    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * offsetX, dpr * offsetY);
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';

    this.drawHead();
    this.drawCards();
    this.drawDiff();
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
    ctx.fillText('选 择 剧 本', DESIGN_W / 2, 30);
    ctx.textAlign = 'left';
    // 金线:与存档/设置页同一条
    ctx.strokeStyle = COLOR.goldHi;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(DESIGN_W / 2 - 120, 78);
    ctx.lineTo(DESIGN_W / 2 + 120, 78);
    ctx.stroke();
    ctx.strokeStyle = COLOR.lineSoft;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(70, 78);
    ctx.lineTo(DESIGN_W / 2 - 140, 78);
    ctx.moveTo(DESIGN_W / 2 + 140, 78);
    ctx.lineTo(DESIGN_W - 70, 78);
    ctx.stroke();
  }

  private cardRect(i: number): { x: number; y: number; w: number; h: number } {
    const n = SCENARIOS.length;
    const selW = 300;
    const otherW = (CARDS.w - selW - CARDS.gap * (n - 1)) / (n - 1);
    let x = CARDS.x0;
    for (let k = 0; k < n; k++) {
      const w = k === this.curIndex ? selW : otherW;
      if (k === i) return { x, y: CARDS.y, w, h: CARDS.h };
      x += w + CARDS.gap;
    }
    return { x: CARDS.x0, y: CARDS.y, w: otherW, h: CARDS.h };
  }

  private drawCards(): void {
    const { ctx } = this.plat;
    SCENARIOS.forEach((s, i) => {
      const rect = this.cardRect(i);
      const on = i === this.curIndex;
      ctx.save();
      ctx.beginPath();
      roundRect(ctx, rect, 10);
      ctx.clip();
      const cover = this.assets.get(IMG.cover(s.key));
      if (cover) {
        const r = fitCover(rect.w, rect.h, cover.w, cover.h);
        ctx.drawImage(cover.img, rect.x + r.x, rect.y + r.y, r.w, r.h);
      } else {
        ctx.fillStyle = COLOR.paperCard;
        ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
      }
      if (!on) {
        ctx.fillStyle = 'rgba(26,22,18,0.55)';
        ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
      }
      // 底部名牌
      const py = rect.y + rect.h - PLATE_H;
      ctx.fillStyle = on ? 'rgba(246,239,224,0.94)' : 'rgba(246,239,224,0.74)';
      ctx.fillRect(rect.x, py, rect.w, PLATE_H);
      ctx.fillStyle = on ? COLOR.zhu : COLOR.inkDim;
      ctx.fillRect(rect.x, py, rect.w, 2);
      ctx.fillStyle = on ? COLOR.inkHeavy : COLOR.inkStrong;
      ctx.font = this.font(26, true);
      ctx.textAlign = 'center';
      ctx.fillText(s.protag, rect.x + rect.w / 2, py + 12);
      ctx.fillStyle = on ? COLOR.inkSoft : COLOR.inkDim;
      ctx.font = this.font(14);
      ctx.fillText(s.sub, rect.x + rect.w / 2, py + 46);
      ctx.fillStyle = COLOR.inkDim;
      ctx.font = this.font(13);
      ctx.fillText(`${s.chapters} 章 · ${s.endings} 结局`, rect.x + rect.w / 2, py + 66);
      ctx.textAlign = 'left';

      // 不可存档剧本:左上挂一枚朱签
      if (s.noSave) {
        const tag = { x: rect.x + 10, y: rect.y + 10, w: 62, h: 22 };
        ctx.fillStyle = 'rgba(176,67,47,0.88)';
        roundRect(ctx, tag, 4);
        ctx.fill();
        ctx.fillStyle = '#f6efe0';
        ctx.font = this.font(13);
        ctx.textAlign = 'center';
        ctx.fillText('不可存', tag.x + tag.w / 2, tag.y + 4);
        ctx.textAlign = 'left';
      }
      ctx.restore();

      frame(ctx, rect, {
        stroke: on ? COLOR.goldHi : 'rgba(198,180,146,0.65)',
        width: on ? 2 : 1,
        radius: 10,
      });

      this.hits.push({
        rect,
        on: () => {
          if (i === this.curIndex) return;
          this.curIndex = i;
          this.sfx?.play('card');
        },
      });
    });
  }

  private diffText(dk: DiffKey): { name: string; desc: string } {
    const tab = scenarioData(this.cur.key)?.DIFFICULTY;
    const row = tab?.[dk];
    return { name: row?.n ?? DIFF_LABEL[dk], desc: row?.desc ?? '' };
  }

  private drawDiff(): void {
    const { ctx } = this.plat;
    let x = 70;
    DIFFICULTIES.forEach((dk) => {
      const t = this.diffText(dk);
      const r = { x, y: CHIP_Y, w: 132, h: 44 };
      chip(ctx, this.font, r, t.name, dk === this.diff, 20);
      this.hits.push({
        rect: r,
        on: () => {
          if (this.diff === dk) return;
          this.diff = dk;
          this.sfx?.play('click');
        },
      });
      x += r.w + 16;
    });

    ctx.fillStyle = COLOR.inkSoft;
    ctx.font = this.font(18);
    const desc = this.diffText(this.diff).desc;
    if (desc) {
      const lines = desc.length > 34 ? [`${desc.slice(0, 34)}…`] : [desc];
      let y = CHIP_Y + 58;
      for (const line of lines) {
        ctx.fillText(line, 70, y);
        y += 26;
      }
    }

    button(ctx, this.font, START, '入 局', { variant: 'primary', size: 26 });
    this.hits.push({
      rect: START,
      on: () => {
        this.sfx?.play('enter');
        this.act.onEnter(this.cur.key, this.diff);
      },
    });

    notePlate(ctx, this.font, '选中剧本后择难度，入局即展卷', DESIGN_W - 70, DESIGN_H - 40, 'right');
    ctx.textAlign = 'left';
  }
}
