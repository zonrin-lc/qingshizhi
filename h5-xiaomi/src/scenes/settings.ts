/**
 * 设置页:音乐/音效/配音(开关 + 音量)+ 正文大小 + 阅读节奏。
 *
 * h5 的「界面缩放」不搬:这一版是固定设计分辨率自绘,qg 侧整屏按比例缩放,
 * 再叠一层 UI 缩放只会把 1px 描边糊掉。正文大小与阅读节奏都真接到对局屏。
 */

import type { Platform } from '../port/platform';
import type { AssetStore } from '../port/assets';
import { IMG } from '../port/assets';
import { COLOR, DESIGN_H, DESIGN_W } from '../port/theme';
import type { Settings, SettingsStore } from '../game/settings';
import { SPEED_OPTS, TEXT_OPTS } from '../game/settings';
import type { Sfx } from '../game/sfx';
import { button, chip, fireTap, fitCover, frame, makeFont, notePlate, type Font, type TapHit } from '../ui/kit';

export interface SettingsActions {
  onBack(): void;
}

type VolKey = 'music' | 'sfx' | 'voice';

const BACK = { x: 62, y: 28, w: 82, h: 34 } as const;
const PANEL = { x: 70, y: 104, w: 1140, h: 434 } as const;
const ROW_X = 112;
const ROW_W = 1050;
const TOGGLE_X = 300;
const SLIDER = { x: 566, w: 430 } as const;

/** 三档节奏直接对齐 settings.SPEED_OPTS,不在页面里另造一套毫秒值 */

export class SettingsScene {
  private hits: TapHit[] = [];
  private readonly font: Font;
  private drag: { key: VolKey; index: number } | null = null;

  constructor(
    private readonly plat: Platform,
    private readonly assets: AssetStore,
    fontFamily: string | null,
    private readonly settings: SettingsStore,
    private readonly sfx: Sfx | null,
    private readonly act: SettingsActions,
  ) {
    this.font = makeFont(fontFamily);
  }

  private get value(): Settings {
    return this.settings.value;
  }

  /** 音量行:标签在左,开关在中,滑条在右 */
  private volRow(index: number): number {
    return PANEL.y + 30 + index * 88;
  }

  private sliderY(index: number): number {
    return this.volRow(index) + 22;
  }

  private setGain(key: VolKey, v: number): void {
    const n = Math.max(0, Math.min(1, v));
    if (key === 'music') this.settings.update({ musicGain: n });
    else if (key === 'sfx') this.settings.update({ sfxGain: n });
    else this.settings.update({ voiceGain: n });
  }

  private gainOf(key: VolKey): number {
    const v = this.value;
    return key === 'music' ? v.musicGain : key === 'sfx' ? v.sfxGain : v.voiceGain;
  }

  private onOf(key: VolKey): boolean {
    const v = this.value;
    return key === 'music' ? v.music : key === 'sfx' ? v.sfx : v.voice;
  }

  private toggle(key: VolKey, on: boolean): void {
    if (key === 'music') this.settings.update({ music: on });
    else if (key === 'sfx') this.settings.update({ sfx: on });
    else this.settings.update({ voice: on });
  }

  pointerDown(x: number, y: number, _id: number): void {
    const keys: VolKey[] = ['music', 'sfx', 'voice'];
    keys.forEach((key, i) => {
      if (this.drag || !this.onOf(key)) return;
      const cy = this.sliderY(i);
      if (x >= SLIDER.x - 12 && x <= SLIDER.x + SLIDER.w + 12 && y >= cy - 18 && y <= cy + 18) {
        this.drag = { key, index: i };
        this.setGain(key, (x - SLIDER.x) / SLIDER.w);
      }
    });
  }

  pointerMove(x: number, _y: number, _id: number): void {
    if (!this.drag) return;
    this.setGain(this.drag.key, (x - SLIDER.x) / SLIDER.w);
  }

  pointerUp(x: number, y: number, _id: number): void {
    if (this.drag) {
      this.drag = null;
      this.sfx?.play('click');
      return;
    }
    fireTap(x, y, this.hits);
  }

  /** 冒烟用:当前可点区域(设计坐标) */
  debug(): { screen: string; hits: { kind: string; x: number; y: number; w: number; h: number }[] } {
    return {
      screen: 'settings',
      hits: this.hits.map((h) => ({ kind: 'tap', x: h.rect.x, y: h.rect.y, w: h.rect.w, h: h.rect.h })),
    };
  }

  draw(): void {
    const { ctx, dpr, screenW, screenH, scale, offsetX, offsetY } = this.plat;
    this.hits = [];
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = COLOR.app;
    ctx.fillRect(0, 0, screenW, screenH);
    const bg = this.assets.get(IMG.bgSettings);
    if (bg) {
      const r = fitCover(screenW, screenH, bg.w, bg.h);
      ctx.drawImage(bg.img, r.x, r.y, r.w, r.h);
    }

    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * offsetX, dpr * offsetY);
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';

    this.drawHead();
    frame(ctx, PANEL, { fill: 'rgba(246,239,224,0.88)', stroke: COLOR.lineSoft, radius: 12 });
    this.drawVol('music', 0, '音 乐');
    this.drawVol('sfx', 1, '音 效');
    this.drawVol('voice', 2, '配 音');
    this.drawTextSize();
    this.drawPace();

    notePlate(ctx, this.font, '设置即时生效，保存在本机', DESIGN_W - 70, DESIGN_H - 40, 'right');
    ctx.textAlign = 'left';
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
    ctx.fillText('设 置', DESIGN_W / 2, 30);
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

  private drawVol(key: VolKey, index: number, label: string): void {
    const { ctx } = this.plat;
    const y = this.volRow(index);
    const on = this.onOf(key);

    ctx.fillStyle = COLOR.inkHeavy;
    ctx.font = this.font(22, true);
    ctx.fillText(label, ROW_X, y + 12);
    ctx.fillStyle = COLOR.inkDim;
    ctx.font = this.font(15);
    ctx.fillText(on ? '' : '已关闭', ROW_X + 110, y + 20);

    const w = 78;
    const onRect = { x: TOGGLE_X, y: y + 6, w, h: 38 };
    const offRect = { x: TOGGLE_X + w + 10, y: y + 6, w, h: 38 };
    chip(ctx, this.font, onRect, '开', on, 19);
    chip(ctx, this.font, offRect, '关', !on, 19);
    this.hits.push({
      rect: onRect,
      on: () => {
        if (!on) this.toggle(key, true);
        this.sfx?.play('click');
      },
    });
    this.hits.push({
      rect: offRect,
      on: () => {
        if (on) this.toggle(key, false);
        this.sfx?.play('click');
      },
    });

    // 滑条:轨道 + 已填充段 + 圆钮
    const cy = this.sliderY(index);
    const gain = this.gainOf(key);
    ctx.save();
    ctx.globalAlpha = on ? 1 : 0.35;
    ctx.fillStyle = COLOR.lineSoft;
    ctx.fillRect(SLIDER.x, cy - 3, SLIDER.w, 6);
    ctx.fillStyle = COLOR.zhu;
    ctx.fillRect(SLIDER.x, cy - 3, SLIDER.w * gain, 6);
    const kx = SLIDER.x + SLIDER.w * gain;
    ctx.beginPath();
    ctx.arc(kx, cy, 9, 0, Math.PI * 2);
    ctx.fillStyle = COLOR.paper;
    ctx.fill();
    ctx.strokeStyle = COLOR.zhu;
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = COLOR.inkSoft;
    ctx.font = this.font(15);
    ctx.textAlign = 'right';
    ctx.fillText(`${Math.round(gain * 100)}`, SLIDER.x + SLIDER.w + 56, cy - 9);
    ctx.textAlign = 'left';

    if (index < 2) {
      const ly = y + 74;
      ctx.strokeStyle = 'rgba(198,180,146,0.45)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(ROW_X, ly);
      ctx.lineTo(ROW_X + ROW_W, ly);
      ctx.stroke();
    }
  }

  /** 正文大小:对局屏按此倍率烘焙正文 */
  private drawTextSize(): void {
    const { ctx } = this.plat;
    const y = PANEL.y + 300;
    ctx.fillStyle = COLOR.inkHeavy;
    ctx.font = this.font(22, true);
    ctx.fillText('正 文 大 小', ROW_X, y + 12);

    const items: { label: string; v: Settings['textScale'] }[] = TEXT_OPTS.map((o) => ({
      label: o.label,
      v: o.value,
    }));
    let x = TOGGLE_X;
    for (const it of items) {
      const r = { x, y: y + 4, w: 88, h: 40 };
      chip(ctx, this.font, r, it.label, this.value.textScale === it.v, 19);
      this.hits.push({
        rect: r,
        on: () => {
          if (this.value.textScale === it.v) return;
          this.settings.update({ textScale: it.v });
          this.sfx?.play('click');
        },
      });
      x += r.w + 12;
    }
    ctx.fillStyle = COLOR.inkDim;
    ctx.font = this.font(15);
    ctx.fillText('影响卷轴正文字号，下一局起生效', PANEL.x + PANEL.w - 300, y + 16);
  }

  /** 阅读节奏:对齐 settings.segDelay(毫秒) */
  private drawPace(): void {
    const { ctx } = this.plat;
    const y = PANEL.y + 368;
    ctx.fillStyle = COLOR.inkHeavy;
    ctx.font = this.font(22, true);
    ctx.fillText('阅 读 节 奏', ROW_X, y + 12);

    let x = TOGGLE_X;
    for (const it of SPEED_OPTS) {
      const r = { x, y: y + 4, w: 96, h: 40 };
      const on = Math.abs(this.value.segDelay - it.value) < 1;
      chip(ctx, this.font, r, it.label, on, 19);
      this.hits.push({
        rect: r,
        on: () => {
          if (on) return;
          this.settings.update({ segDelay: it.value });
          this.sfx?.play('click');
        },
      });
      x += r.w + 12;
    }
    ctx.fillStyle = COLOR.inkDim;
    ctx.font = this.font(15);
    ctx.fillText('一段落定后等多久自动翻页', PANEL.x + PANEL.w - 300, y + 16);
  }
}


