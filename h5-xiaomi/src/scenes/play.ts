/**
 * 对局屏:把 H5 的「剧情卷轴 + 右侧属性栏 + 底部选项卡」在 canvas 2D 上重画。
 *
 * 与 h5/src/game/session.ts 的关系:流程照抄(相位路由在 game/run.ts),
 * 但 DOM 的累积式小节换成「块 + 离屏烘焙」——每次换相位/落一牌只重排新增的那一块,
 * 卷轴按滚动窗口整块 blit,避免每帧上千次 fillText(真机主要开销)。
 *
 * 覆盖相位:章首 / 回合(行动+蓄势) / 事件(关键·际遇) / 抉择 / 章末事件 /
 * 章末结算 / 历史修正 / 结局。回溯走确认框。
 */

import type { Platform } from '../port/platform';
import type { AssetStore } from '../port/assets';
import { IMG } from '../port/assets';
import { COLOR, CARD_W, DESIGN_W, PANEL, TEXT } from '../port/theme';
import { layoutParagraphs, parseRuns, renderTextCanvas, type Run as TextRun } from '../port/text';
import { veil } from '../ui/kit';
import type { Run } from '../game/run';
import type { SettingsStore } from '../game/settings';
import type { AttrKey, ChangeView, EventOption, OptionView } from '../../types/scenario';

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

type HitKind =
  | 'card'
  | 'option'
  | 'xushi'
  | 'choice'
  | 'cancel'
  | 'endEvent'
  | 'key'
  | 'continue'
  | 'overlay'
  | 'back'
  | 'menu'
  | 'yes'
  | 'no';

interface Hit {
  rect: Rect;
  kind: HitKind;
  index: number;
}

/** 卷轴里的一块:题签行 + 已烘焙正文 + 属性胶囊 */
interface Block {
  titleLines: string[];
  warnLines: string[];
  body: any | null;
  bodyH: number;
  chipRows: { text: string; up: boolean; x: number; w: number }[][];
  chipH: number;
  h: number;
}

const SIDE = { x: 856, y: 92, w: 368, h: 452 } as const;
/** 正文可视区:面板内、底部按钮之上 */
const STORY = { x: PANEL.x + 48, y: PANEL.y + 34, w: PANEL.w - 96, h: PANEL.h - 106 } as const;
/** 关键事件提示条:钉在面板与选项卡之间 */
const KEYBAR = { x: PANEL.x + 22, y: PANEL.y + PANEL.h + 6, w: PANEL.w - 44, h: 26 } as const;
const SLOT_Y = 584;
const SLOT_H = 110;
const BTN = { x: PANEL.x + PANEL.w - 172, y: PANEL.y + PANEL.h - 58, w: 124, h: 38 } as const;
const BACK = { x: 1132, y: 26, w: 72, h: 32 } as const;
/** 顶栏「菜单」:回主菜单前由外层决定是否落一条自动档 */
const MENU = { x: 1050, y: 26, w: 72, h: 32 } as const;

/** 右栏:五维雷达 + 身外六维 */
const RADAR_AXES: AttrKey[] = ['tupo', 'wuli', 'caixue', 'moulue', 'biancai'];
const SIDE_ATTRS: AttrKey[] = ['caifu', 'shengwang', 'quanshi', 'zhengji', 'junxin', 'weiji'];

/** 行动卡类型徽标配色(对齐 H5 card-face-* 的五色) */
const TYPE_COLOR: Record<string, string> = {
  进取: '#9e3422',
  守成: '#467069',
  兑换: '#8a6a34',
  保身: '#567444',
  抉择: '#6b4a76',
};

const inRect = (x: number, y: number, r: Rect): boolean =>
  x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

function roundRect(ctx: CanvasRenderingContext2D, r: Rect, radius: number): void {
  const rr = Math.min(radius, r.w / 2, r.h / 2);
  ctx.beginPath();
  ctx.moveTo(r.x + rr, r.y);
  ctx.arcTo(r.x + r.w, r.y, r.x + r.w, r.y + r.h, rr);
  ctx.arcTo(r.x + r.w, r.y + r.h, r.x, r.y + r.h, rr);
  ctx.arcTo(r.x, r.y + r.h, r.x, r.y, rr);
  ctx.arcTo(r.x, r.y, r.x + r.w, r.y, rr);
  ctx.closePath();
}

function fitCover(sw: number, sh: number, iw: number, ih: number): Rect {
  const s = Math.max(sw / iw, sh / ih);
  const w = iw * s;
  const h = ih * s;
  return { x: (sw - w) / 2, y: (sh - h) / 2, w, h };
}

/** 「第一章 ｜ 兰陵问道」→「兰陵问道」 */
function shortTitle(full: string): string {
  const parts = full.split('｜');
  return parts.length > 1 ? (parts[1] ?? full).trim() : full;
}

const TYPE_ERA = /^(教学章|历史节点预备|历史节点|全剧本枢纽)$/;

export interface PlayOptions {
  /** 结局页「返回主页」:由外层接到主菜单 */
  onFinish?: () => void;
  /** 顶栏「菜单」:外层据此落自动档再回主菜单 */
  onMenu?: () => void;
  /** 正文大小 / 阅读节奏的来源(缺省按标准字号与 650ms) */
  settings?: SettingsStore;
}

export class PlayScene {
  private blocks: Block[] = [];
  private scrollY = 0;
  private totalH = 0;
  private drag: { id: number; startY: number; startScroll: number; moved: boolean } | null = null;
  private hits: Hit[] = [];

  private lastScreen: string = '';
  private lastRev = -1;
  private lastPending: unknown = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** 绘制帧数:冒烟脚本据此判断渲染循环是否还在跑 */
  private frames = 0;

  private toast: { text: string; until: number } | null = null;
  private confirm: { title: string; lines: string[]; okText: string; onOk: () => void } | null = null;
  /** 正文字号倍率:进局时定死,一局之内不换字号(已烘焙的块不跟着变) */
  private readonly textMul: number;

  constructor(
    private readonly plat: Platform,
    private readonly assets: AssetStore,
    readonly run: Run,
    private readonly fontFamily: string | null,
    private readonly opts: PlayOptions = {},
  ) {
    /** 外层已经替我们 start()/resume() 过引擎:这里只负责把相位摆上卷轴 */
    this.textMul =
      opts.settings?.value.textScale === 'small'
        ? 0.9
        : opts.settings?.value.textScale === 'large'
          ? 1.12
          : 1;
    this.refresh();
  }

  dispose(): void {
    this.cancelTimer();
  }

  /** 调试/冒烟用:当前相位、卷轴规模、可点区域(设计坐标) */
  debug(): {
    screen: string;
    blocks: number;
    totalH: number;
    scrollY: number;
    pending: string | null;
    frames: number;
    hits: { kind: string; x: number; y: number; w: number; h: number }[];
  } {
    return {
      screen: this.run.screen,
      blocks: this.blocks.length,
      totalH: this.totalH,
      scrollY: this.scrollY,
      pending: this.run.pending ? (this.run.pending.r.kind ?? 'settle') : null,
      frames: this.frames,
      hits: this.hits.map((h) => ({ kind: h.kind, x: h.rect.x, y: h.rect.y, w: h.rect.w, h: h.rect.h })),
    };
  }

  // ---------- 状态同步 ----------

  private cancelTimer(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  /** 每次交互/定时推进后调:换相位补题签块、结算补结果块、自动推进挂计时 */
  refresh(): void {
    const run = this.run;
    if (run.revision !== this.lastRev) {
      this.lastRev = run.revision;
      this.blocks = [];
      this.scrollY = 0;
      this.totalH = 0;
      this.pushPhaseBlock();
    } else if (run.screen !== this.lastScreen) {
      this.pushPhaseBlock();
    }
    this.lastScreen = run.screen;

    if (run.pending && run.pending !== this.lastPending) {
      this.lastPending = run.pending;
      const p = run.pending;
      this.pushBlock(p.title, [p.r.text], [p.warn], p.r.changes);
      this.cancelTimer();
      if (p.auto) {
        // 阅读节奏:一段落定后按设置里的基数停一会儿(有属性变化多停一拍)
        const base = this.opts.settings?.value.segDelay ?? 650;
        const wait = p.r.changes.length > 0 ? base * 3 : base * 2;
        this.timer = setTimeout(() => this.act(() => run.advance()), wait);
      }
    } else if (!run.pending && this.lastPending !== null) {
      this.lastPending = null;
      this.cancelTimer();
    }

    if (run.toast) {
      this.toast = { text: run.toast, until: Date.now() + 2000 };
      run.toast = '';
    }
  }

  private act(fn: () => void): void {
    fn();
    this.refresh();
  }

  /** 相位切换时补一块正文(回合不推正文,只换手牌) */
  private pushPhaseBlock(): void {
    const run = this.run;
    const g = run.game;
    switch (run.screen) {
      case 'intro': {
        const ch = g.chapter();
        if (!ch) return;
        const era = (ch.sub ?? '')
          .split('·')
          .map((s) => s.trim())
          .filter((s) => s && !TYPE_ERA.test(s))
          .join(' · ');
        this.pushBlock(`${shortTitle(ch.title)}${era ? ` · ${era}` : ''}`, ch.intro ?? [], [], undefined, g.introNotes);
        break;
      }
      case 'event': {
        const ev = g.eventId ? g.findEvent(g.eventId) : null;
        if (!ev) return;
        const inserted = g.currentRandom != null;
        const title = inserted ? `际遇 · 随机事件——${ev.title}` : `关键事件 · ${ev.title}`;
        this.pushBlock(title, run.eventSegs(ev), []);
        break;
      }
      case 'choice': {
        const v = g.getChoiceCard();
        if (!v) return;
        this.pushBlock(`抉择 · ${v.title}`, run.eventSegs(v), []);
        break;
      }
      case 'endEvent': {
        const ev = g.currentEndEvent;
        if (!ev) return;
        this.pushBlock(ev.title, run.eventSegs(ev), []);
        break;
      }
      default:
        break;
    }
  }

  // ---------- 排版烘焙 ----------

  private font(size: number, bold = false): string {
    const fam = this.fontFamily ? `"${this.fontFamily}", ` : '';
    return `${bold ? 'bold ' : ''}${size}px ${fam}serif`;
  }

  private wrap(text: string, size: number, bold: boolean, maxW: number, maxLines = 99): string[] {
    const ctx = this.plat.ctx;
    ctx.font = this.font(size, bold);
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
    // 超出限行:砍掉末行尾字补省略号,避免半截字贴边
    if (out.length > maxLines) {
      out.length = maxLines;
      const last = out[maxLines - 1] ?? '';
      out[maxLines - 1] = `${last.slice(0, Math.max(1, last.length - 1))}…`;
    }
    return out;
  }

  /** 追加一块:排版 + 烘焙正文;题签/胶囊画时直出 */
  private pushBlock(
    title: string,
    segs: string[],
    warns: string[],
    changes?: ChangeView[],
    notes?: string[],
  ): void {
    const accent = COLOR.zhu;
    const paras: TextRun[][] = segs.map((s) => parseRuns(s, COLOR.ink, accent));
    for (const n of notes ?? []) paras.push(parseRuns(n, COLOR.zhu, accent));
    const fs = Math.round(TEXT.fontSize * this.textMul);
    const lh = Math.round(TEXT.lineHeight * this.textMul);
    const layout = layoutParagraphs(this.plat.ctx, this.font(fs), paras, {
      maxWidth: STORY.w,
      fontSize: fs,
      lineHeight: lh,
      paraGap: TEXT.paraGap,
    });
    const body = paras.length
      ? renderTextCanvas(this.plat.offscreen, layout, this.font(fs), COLOR.ink, TEXT.paraGap)
      : null;
    const bodyH = paras.length ? layout.height : 0;

    const titleLines = title ? this.wrap(title, 26, true, STORY.w, 2) : [];
    const warnLines: string[] = [];
    for (const w of warns) {
      if (w) warnLines.push(...this.wrap(w, 19, true, STORY.w, 2));
    }

    // 属性胶囊:横排、放不下换行
    const chipRows: Block['chipRows'] = [];
    let row: { text: string; up: boolean; x: number; w: number }[] = [];
    let x = 0;
    this.plat.ctx.font = this.font(17);
    for (const c of changes ?? []) {
      const text = `${c.label} ${c.delta > 0 ? '+' : ''}${c.delta}${c.note ? `（${c.note}）` : ''}`;
      const w = Math.ceil(this.plat.ctx.measureText(text).width) + 18;
      if (x + w > STORY.w && row.length) {
        chipRows.push(row);
        row = [];
        x = 0;
      }
      row.push({ text, up: c.delta > 0, x, w });
      x += w + 8;
    }
    if (row.length) chipRows.push(row);
    const chipH = chipRows.length ? chipRows.length * 30 + 6 : 0;

    const titleH = titleLines.length ? titleLines.length * 34 + 4 : 0;
    const warnH = warnLines.length ? warnLines.length * 25 + 2 : 0;
    const h = titleH + warnH + bodyH + chipH + 26;
    this.blocks.push({ titleLines, warnLines, body, bodyH, chipRows, chipH, h });
    this.totalH += h;
    // 新块的顶端尽量落在视口顶部:块比视口短时自然贴底,长的从题签开始读
    this.scrollY = Math.max(0, Math.min(this.maxScroll, this.totalH - h));
  }

  private get maxScroll(): number {
    return Math.max(0, this.totalH - STORY.h);
  }

  // ---------- 指针 ----------

  pointerDown(x: number, y: number, id: number): void {
    if (this.confirm) return;
    if (inRect(x, y, STORY)) {
      this.drag = { id, startY: y, startScroll: this.scrollY, moved: false };
    }
  }

  pointerMove(_x: number, y: number, id: number): void {
    if (!this.drag || this.drag.id !== id) return;
    const dy = y - this.drag.startY;
    if (!this.drag.moved && Math.abs(dy) > 6) this.drag.moved = true;
    if (!this.drag.moved) return;
    this.scrollY = Math.max(0, Math.min(this.maxScroll, this.drag.startScroll - dy));
  }

  pointerUp(x: number, y: number, id: number): void {
    const moved = this.drag?.moved ?? false;
    if (this.drag && this.drag.id === id) this.drag = null;
    if (moved) return;
    this.tap(x, y);
  }

  private tap(x: number, y: number): void {
    // 确认框优先:它盖住一切
    if (this.confirm) {
      for (const h of this.hits) {
        if (h.kind !== 'yes' && h.kind !== 'no') continue;
        if (!inRect(x, y, h.rect)) continue;
        const c = this.confirm;
        this.confirm = null;
        if (h.kind === 'yes') this.act(c.onOk);
        return;
      }
      return;
    }
    for (let i = this.hits.length - 1; i >= 0; i--) {
      const h = this.hits[i];
      if (!h || !inRect(x, y, h.rect)) continue;
      this.fire(h);
      return;
    }
  }

  private fire(h: Hit): void {
    const run = this.run;
    switch (h.kind) {
      case 'overlay':
        if (run.screen === 'summary') this.act(() => run.proceedSummary());
        else if (run.screen === 'correction') this.act(() => run.correctionContinue());
        else if (run.screen === 'ending' || run.screen === 'finished') {
          this.act(() => this.opts.onFinish?.());
        }
        break;
      case 'continue':
        this.act(() => (run.pending ? run.advance() : run.beginEvents()));
        break;
      case 'key':
        this.act(() => run.playCard(h.index));
        break;
      case 'card':
        this.act(() => run.playCard(h.index));
        break;
      case 'option':
        this.act(() => run.choose(h.index));
        break;
      case 'xushi':
        this.act(() => run.playXushi());
        break;
      case 'choice':
        this.act(() => run.chooseCardOption(h.index));
        break;
      case 'cancel':
        this.act(() => run.cancelChoice());
        break;
      case 'endEvent':
        this.act(() => run.endEventChoose(h.index));
        break;
      case 'back':
        this.openBacktrack();
        break;
      case 'menu':
        this.opts.onMenu?.();
        break;
      default:
        break;
    }
  }

  private openBacktrack(): void {
    const g = this.run.game;
    if (!g.canBacktrack()) return;
    const quota = g.diff.backtrack;
    const left = quota > 0 ? Math.max(0, quota - g.backtracksThisChapter) : null;
    this.confirm = {
      title: '回溯 ｜ 回到本章开头',
      lines: [
        quota < 0 ? '本章可无限次回溯,但每回溯一次,本章收益便削减一分。' : `本章还剩 ${left} 次回溯机会。`,
        '偏离度与已解锁的成就、声望、图鉴都不会重置——史书会记得。',
      ],
      okText: '回 溯',
      onOk: () => this.act(() => this.run.backtrack()),
    };
  }

  // ---------- 绘制 ----------

  draw(): void {
    const { ctx, dpr, screenW, screenH, scale, offsetX, offsetY } = this.plat;
    this.frames += 1;
    this.hits = [];

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = COLOR.app;
    ctx.fillRect(0, 0, screenW, screenH);
    const bg = this.assets.get(IMG.bgGame);
    if (bg) {
      const r = fitCover(screenW, screenH, bg.w, bg.h);
      ctx.drawImage(bg.img, r.x, r.y, r.w, r.h);
    }

    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * offsetX, dpr * offsetY);
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';

    this.drawPanel();
    this.drawSide();
    this.drawTop();

    const s = this.run.screen;
    if (s === 'summary' || s === 'ending' || s === 'correction' || s === 'finished') {
      this.drawOverlay(s);
    } else {
      this.drawStory();
      this.drawKeybar();
      this.drawSlots();
      this.drawTopButton();
    }

    this.drawToast();
    if (this.confirm) this.drawConfirm();
  }

  private drawPanel(): void {
    const ctx = this.plat.ctx;
    const panel = this.assets.get(IMG.panelScroll);
    if (panel) ctx.drawImage(panel.img, PANEL.x, PANEL.y, PANEL.w, PANEL.h);
    else {
      ctx.fillStyle = COLOR.paper;
      roundRect(ctx, PANEL, 10);
      ctx.fill();
      ctx.strokeStyle = COLOR.line;
      ctx.stroke();
    }
  }

  private drawTop(): void {
    const ctx = this.plat.ctx;
    const g = this.run.game;
    const ch = g.chapter();
    let right = ch ? ch.title : '';
    if (ch && (g.phase === 'round' || g.phase === 'event')) {
      const p = g.chapterProgress();
      right += ` · ${p.done}/${p.total}`;
    }
    ctx.font = this.font(20);
    ctx.fillStyle = COLOR.inkDim;
    ctx.textAlign = 'left';
    const name = g.d.SCENARIO.name;
    ctx.fillText(name, PANEL.x, 32);
    const nameW = ctx.measureText(name).width + 22;
    ctx.fillStyle = COLOR.line;
    ctx.fillText('｜', PANEL.x + nameW, 32);
    ctx.fillStyle = COLOR.inkStrong;
    ctx.fillText(right, PANEL.x + nameW + 20, 32);
  }

  /** 顶栏右侧「菜单 / 回溯」:回溯不可用时压暗,菜单常驻 */
  private drawTopButton(): void {
    const ctx = this.plat.ctx;
    // 菜单:与回溯同形,一并交给外层决定回主菜单前是否存档
    ctx.fillStyle = 'rgba(246,239,224,0.75)';
    roundRect(ctx, MENU, 6);
    ctx.fill();
    ctx.strokeStyle = COLOR.line;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = COLOR.ink;
    ctx.font = this.font(17);
    ctx.textAlign = 'center';
    ctx.fillText('菜单', MENU.x + MENU.w / 2, MENU.y + 8);
    ctx.textAlign = 'left';
    if (this.opts.onMenu) this.hits.push({ rect: MENU, kind: 'menu', index: 0 });

    const can = this.run.game.canBacktrack();
    ctx.globalAlpha = can ? 1 : 0.35;
    ctx.fillStyle = 'rgba(246,239,224,0.75)';
    roundRect(ctx, BACK, 6);
    ctx.fill();
    ctx.strokeStyle = COLOR.line;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = COLOR.ink;
    ctx.font = this.font(17);
    ctx.textAlign = 'center';
    ctx.fillText('回溯', BACK.x + BACK.w / 2, BACK.y + 8);
    ctx.textAlign = 'left';
    ctx.globalAlpha = 1;
    if (can) this.hits.push({ rect: BACK, kind: 'back', index: 0 });
  }

  private drawStory(): void {
    const ctx = this.plat.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.rect(STORY.x, STORY.y, STORY.w, STORY.h);
    ctx.clip();

    let y = STORY.y - Math.round(this.scrollY);
    for (const b of this.blocks) {
      if (b.titleLines.length) {
        ctx.fillStyle = COLOR.inkHeavy;
        ctx.font = this.font(26, true);
        for (const line of b.titleLines) {
          ctx.fillText(line, STORY.x, y + 4);
          y += 34;
        }
        y += 4;
      }
      if (b.warnLines.length) {
        ctx.fillStyle = COLOR.zhu;
        ctx.font = this.font(19, true);
        for (const line of b.warnLines) {
          ctx.fillText(line, STORY.x, y + 2);
          y += 25;
        }
        y += 2;
      }
      if (b.body) {
        ctx.drawImage(b.body, STORY.x, y);
        y += b.bodyH;
      }
      if (b.chipRows.length) {
        y += 6;
        for (const row of b.chipRows) {
          for (const chip of row) {
            const r = { x: STORY.x + chip.x, y, w: chip.w, h: 25 };
            ctx.fillStyle = chip.up ? 'rgba(176,67,47,0.08)' : 'rgba(70,112,105,0.10)';
            roundRect(ctx, r, 12);
            ctx.fill();
            ctx.strokeStyle = chip.up ? COLOR.zhu : COLOR.qing;
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.fillStyle = chip.up ? COLOR.zhu : COLOR.qing;
            ctx.font = this.font(17);
            ctx.textAlign = 'center';
            ctx.fillText(chip.text, r.x + r.w / 2, r.y + 4);
            ctx.textAlign = 'left';
          }
          y += 30;
        }
        y += 6;
      }
      y += 26;
    }

    // 回合没有正文:给一句引导
    if (this.blocks.length === 0) {
      ctx.fillStyle = COLOR.inkDim;
      ctx.font = this.font(22);
      ctx.textAlign = 'center';
      ctx.fillText('选一张行动牌，推进这一轮', STORY.x + STORY.w / 2, STORY.y + 20);
      ctx.textAlign = 'left';
    }
    ctx.restore();

    // 滚动条
    if (this.maxScroll > 0) {
      const barH = Math.max(28, STORY.h * (STORY.h / this.totalH));
      const barY = STORY.y + (STORY.h - barH) * (this.scrollY / this.maxScroll);
      ctx.fillStyle = 'rgba(176,67,47,0.45)';
      roundRect(ctx, { x: STORY.x + STORY.w + 12, y: barY, w: 5, h: barH }, 2.5);
      ctx.fill();
    }
  }

  // ---------- 底部选项卡 ----------

  private drawKeybar(): void {
    const run = this.run;
    if (run.screen !== 'round' || run.pending) return;
    const offer = run.game.getOffer();
    const idx = offer.findIndex((e) => e.type === 'key');
    const key = idx >= 0 ? offer[idx] : null;
    if (!key || key.type !== 'key' || !key.enterable) return;

    const ctx = this.plat.ctx;
    ctx.fillStyle = 'rgba(176,67,47,0.10)';
    roundRect(ctx, KEYBAR, 6);
    ctx.fill();
    ctx.strokeStyle = COLOR.zhu;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = COLOR.zhu;
    ctx.font = this.font(16, true);
    ctx.textAlign = 'center';
    ctx.fillText(`关键事件「${key.title ?? ''}」已至——点此了断本章`, KEYBAR.x + KEYBAR.w / 2, KEYBAR.y + 5);
    ctx.textAlign = 'left';
    this.hits.push({ rect: KEYBAR, kind: 'key', index: idx });
  }

  private drawSlots(): void {
    const run = this.run;
    const screen = run.screen;
    if (screen === 'intro') {
      if (!run.pending) this.drawContinue('继 续');
      return;
    }
    if (screen === 'round') {
      this.drawRoundCards();
      return;
    }
    if (screen === 'event') {
      this.drawOptions(run.game.getOptions(), false);
      return;
    }
    if (screen === 'choice') {
      const v = run.game.getChoiceCard();
      const opts: OptionView[] = (v?.options ?? []).map((o) => ({
        opt: o,
        locked: !!o.locked,
        reason: o.reason ?? null,
        hist: !!o.hist,
        risky: null,
      }));
      this.drawOptions(opts, true);
      return;
    }
    if (screen === 'endEvent') {
      const ev = run.game.currentEndEvent;
      const opts = ev?.options ?? [];
      this.drawEndEventOptions(opts);
    }
  }

  /** 行内选项卡:等宽排布,最多 5 张 */
  private slotRects(n: number): Rect[] {
    const usable = DESIGN_W - 2 * 60;
    let w = CARD_W;
    let gap = 20;
    if (n > 4) {
      gap = 12;
      w = Math.floor((usable - gap * (n - 1)) / n);
    }
    const total = w * n + gap * Math.max(0, n - 1);
    const x0 = Math.round((DESIGN_W - total) / 2);
    const out: Rect[] = [];
    for (let i = 0; i < n; i++) out.push({ x: x0 + i * (w + gap), y: SLOT_Y, w, h: SLOT_H });
    return out;
  }

  private drawRoundCards(): void {
    const run = this.run;
    if (run.pending) {
      this.drawSettleHint();
      return;
    }
    const offer = run.game.getOffer();
    const idxs: number[] = [];
    for (let i = 0; i < offer.length; i++) {
      if (offer[i]?.type === 'action') idxs.push(i);
    }
    const rects = this.slotRects(idxs.length + 1);
    const hide = run.game.diff.hideAttrs;

    idxs.forEach((offerIdx, k) => {
      const e = offer[offerIdx];
      const rect = rects[k];
      if (!e || !rect) return;
      const a = e.action;
      const type = a?.type ?? (a?.id === '__cure__' ? '保身' : '');
      const desc = (hide ? a?.descHidden : a?.desc) ?? '';
      const lock = e.locked && e.reason ? `🔒 ${e.reason}` : '';
      const risk = e.risky ? run.riskText(e.risky) : '';
      const foot = e.diminishing ? `已用 ${e.usedCount ?? 0} 次 · 收益递减` : '';
      this.drawCard(rect, {
        type,
        name: `${a?.name ?? e.id ?? ''}${e.risky ? '  ⚠' : ''}`,
        desc,
        lock,
        risk,
        foot,
        dim: !!e.locked,
      });
      if (!e.locked) this.hits.push({ rect, kind: 'card', index: offerIdx });
    });

    // 蓄势
    const xr = rects[idxs.length];
    if (xr) {
      this.drawCard(xr, {
        type: '蓄势',
        name: '蓄势 · 静观其变',
        desc: run.game.xushi
          ? '已蓄势——下一次抉择的险招成功率 +10'
          : '不出手牌，为下一次抉择蓄一分胜算（险招 +10）',
        dim: run.game.xushi,
      });
      if (!run.game.xushi) this.hits.push({ rect: xr, kind: 'xushi', index: -1 });
    }
  }

  private drawOptions(opts: OptionView[], isChoice: boolean): void {
    const run = this.run;
    if (run.pending) {
      this.drawSettleHint();
      return;
    }
    const n = opts.length + (isChoice ? 1 : 0);
    const rects = this.slotRects(Math.max(1, n));
    opts.forEach((o, i) => {
      const rect = rects[i];
      if (!rect) return;
      const lock = o.locked && o.reason ? `🔒 ${o.reason}` : '';
      const risky = o.risky ? run.riskText(o.risky) : '';
      this.drawCard(rect, { name: o.opt.t, lock, risk: risky, hist: o.hist, dim: o.locked });
      if (!o.locked) this.hits.push({ rect, kind: isChoice ? 'choice' : 'option', index: i });
    });
    if (isChoice) {
      const rect = rects[opts.length];
      if (rect) {
        this.drawCard(rect, { name: '且搁置', desc: '暂不作决，回这一轮另作打算', dim: false });
        this.hits.push({ rect, kind: 'cancel', index: -1 });
      }
    }
  }

  private drawEndEventOptions(opts: EventOption[]): void {
    const run = this.run;
    if (run.pending) {
      this.drawSettleHint();
      return;
    }
    const rects = this.slotRects(Math.max(1, opts.length));
    opts.forEach((o, i) => {
      const rect = rects[i];
      if (!rect) return;
      const gate = run.reqCheck(o.req);
      const broke = run.brokeFor(o);
      const ok = gate.ok && !broke;
      const reason = gate.ok ? (broke ? '财富见底，无力为之' : '') : gate.reason ?? '';
      this.drawCard(rect, { name: o.t, lock: ok ? '' : `🔒 ${reason}`, dim: !ok });
      if (ok) this.hits.push({ rect, kind: 'endEvent', index: i });
    });
  }

  private drawCard(
    rect: Rect,
    o: {
      type?: string;
      name: string;
      desc?: string;
      lock?: string;
      risk?: string;
      foot?: string;
      hist?: boolean;
      dim?: boolean;
    },
  ): void {
    const ctx = this.plat.ctx;
    const art = this.assets.get(IMG.card);
    ctx.globalAlpha = o.dim ? 0.72 : 1;
    if (art) ctx.drawImage(art.img, rect.x, rect.y, rect.w, rect.h);
    else {
      ctx.fillStyle = COLOR.paperCard;
      roundRect(ctx, rect, 10);
      ctx.fill();
      ctx.strokeStyle = COLOR.line;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    let y = rect.y + 10;
    const x = rect.x + 12;
    const maxW = rect.w - 24;
    // 类型徽标与首行卡名同排:省下的 24px 留给两行释义
    let firstX = x;
    let nameW = o.hist ? maxW - 26 : maxW;

    if (o.type && TYPE_COLOR[o.type]) {
      const label = o.type;
      ctx.font = this.font(14);
      const bw = Math.ceil(ctx.measureText(label).width) + 16;
      const br = { x, y: y + 1, w: bw, h: 18 };
      ctx.fillStyle = TYPE_COLOR[o.type] as string;
      roundRect(ctx, br, 9);
      ctx.fill();
      ctx.fillStyle = '#f6efe0';
      ctx.textAlign = 'center';
      ctx.fillText(label, br.x + br.w / 2, br.y + 2);
      ctx.textAlign = 'left';
      firstX = x + bw + 8;
      nameW = Math.max(40, nameW - bw - 8);
    } else if (o.type) {
      ctx.font = this.font(14);
      ctx.fillStyle = COLOR.gold;
      ctx.fillText(o.type, x, y + 2);
      y += 22;
    }

    // 史实标记:右上角朱圈
    if (o.hist) {
      const cx = rect.x + rect.w - 20;
      const cy = rect.y + 16;
      ctx.beginPath();
      ctx.arc(cx, cy, 10, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(246,239,224,0.92)';
      ctx.fill();
      ctx.strokeStyle = COLOR.zhu;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = COLOR.zhu;
      ctx.font = this.font(13, true);
      ctx.textAlign = 'center';
      ctx.fillText('史', cx, cy - 6);
      ctx.textAlign = 'left';
    }

    const nameLines = this.wrap(o.name, 19, true, nameW, 2);
    ctx.fillStyle = COLOR.inkHeavy;
    ctx.font = this.font(19, true);
    nameLines.forEach((line, i) => {
      ctx.fillText(line, i === 0 ? firstX : x, y);
      y += 22;
    });

    // 余下高度决定副文本能放几行:宁可截断,不让字压到卡框外
    const bottomLimit = rect.y + rect.h - (o.foot ? 20 : 8);
    const fits = (size: number): number => Math.max(0, Math.floor((bottomLimit - y) / size));
    if (o.lock) {
      const lines = this.wrap(o.lock, 14, false, maxW, Math.max(1, fits(17)));
      ctx.fillStyle = COLOR.zhu;
      ctx.font = this.font(14);
      for (const line of lines) {
        ctx.fillText(line, x, y);
        y += 17;
      }
    } else {
      if (o.desc) {
        const n = Math.min(2, fits(16));
        if (n > 0) {
          const lines = this.wrap(o.desc, 13, false, maxW, n);
          ctx.fillStyle = COLOR.inkDim;
          ctx.font = this.font(13);
          for (const line of lines) {
            ctx.fillText(line, x, y);
            y += 16;
          }
        }
      }
      if (o.risk) {
        const n = Math.min(2, fits(16));
        if (n > 0) {
          const lines = this.wrap(o.risk, 13, false, maxW, n);
          ctx.fillStyle = COLOR.gold;
          ctx.font = this.font(13);
          for (const line of lines) {
            ctx.fillText(line, x, y);
            y += 16;
          }
        }
      }
    }
    if (o.foot) {
      ctx.fillStyle = COLOR.gold;
      ctx.font = this.font(12);
      ctx.fillText(o.foot, x, rect.y + rect.h - 18);
    }
    ctx.globalAlpha = 1;
  }

  /** 结算中:选项卡区不再可点 */
  private drawSettleHint(): void {
    const ctx = this.plat.ctx;
    const run = this.run;
    const rect = { x: 60, y: SLOT_Y, w: DESIGN_W - 120, h: SLOT_H };
    ctx.fillStyle = 'rgba(246,239,224,0.55)';
    roundRect(ctx, rect, 8);
    ctx.fill();
    ctx.strokeStyle = COLOR.lineSoft;
    ctx.lineWidth = 1;
    ctx.stroke();
    if (run.pending && !run.pending.auto) {
      const btn = { x: rect.x + rect.w / 2 - 62, y: rect.y + 26, w: 124, h: 46 };
      ctx.fillStyle = COLOR.zhu;
      roundRect(ctx, btn, 8);
      ctx.fill();
      ctx.fillStyle = '#f6efe0';
      ctx.font = this.font(22, true);
      ctx.textAlign = 'center';
      ctx.fillText('继 续', btn.x + btn.w / 2, btn.y + 10);
      ctx.textAlign = 'left';
      this.hits.push({ rect: btn, kind: 'continue', index: 0 });
    } else {
      ctx.fillStyle = COLOR.inkDim;
      ctx.font = this.font(18);
      ctx.textAlign = 'center';
      ctx.fillText('结算中…', rect.x + rect.w / 2, rect.y + 38);
      ctx.textAlign = 'left';
    }
  }

  private drawContinue(label: string): void {
    const ctx = this.plat.ctx;
    if (this.run.pending) {
      this.drawSettleHint();
      return;
    }
    ctx.fillStyle = COLOR.zhu;
    roundRect(ctx, BTN, 8);
    ctx.fill();
    ctx.fillStyle = '#f6efe0';
    ctx.font = this.font(20, true);
    ctx.textAlign = 'center';
    ctx.fillText(label, BTN.x + BTN.w / 2, BTN.y + 8);
    ctx.textAlign = 'left';
    this.hits.push({ rect: BTN, kind: 'continue', index: 0 });
  }

  // ---------- 右侧属性栏 ----------

  private drawSide(): void {
    const ctx = this.plat.ctx;
    const g = this.run.game;
    ctx.fillStyle = 'rgba(246,239,224,0.82)';
    roundRect(ctx, SIDE, 8);
    ctx.fill();
    ctx.strokeStyle = COLOR.lineSoft;
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = COLOR.inkDim;
    ctx.font = this.font(17, true);
    ctx.textAlign = 'center';
    ctx.fillText('属 性', SIDE.x + SIDE.w / 2, SIDE.y + 14);
    ctx.textAlign = 'left';

    this.drawRadar();
    this.drawAttrRows();

    // 页脚:偏离(段位) · 年岁
    const band = g.d.DEV_BANDS[g.devBand()];
    ctx.fillStyle = COLOR.zhu;
    ctx.font = this.font(18, true);
    ctx.textAlign = 'center';
    const footY = SIDE.y + SIDE.h - 34;
    const ageTxt = g.age != null ? ` · ${g.age} 岁` : '';
    ctx.fillText(`偏离 ${g.dev}（${band ? band.name : '—'}）${ageTxt}`, SIDE.x + SIDE.w / 2, footY);
    ctx.textAlign = 'left';
  }

  private drawRadar(): void {
    const ctx = this.plat.ctx;
    const g = this.run.game;
    const cx = SIDE.x + SIDE.w / 2;
    const cy = SIDE.y + 118;
    const R = 52;
    const pt = (i: number, ratio: number): { x: number; y: number } => {
      const a = (Math.PI * 2 * i) / RADAR_AXES.length - Math.PI / 2;
      return { x: cx + Math.cos(a) * R * ratio, y: cy + Math.sin(a) * R * ratio };
    };
    // 网格
    ctx.strokeStyle = 'rgba(198,180,146,0.75)';
    ctx.lineWidth = 1;
    for (let ring = 1; ring <= 5; ring++) {
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const p = pt(i, ring / 5);
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.closePath();
      ctx.stroke();
    }
    // 数据多边形
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const k = RADAR_AXES[i] as AttrKey;
      const max = Math.max(1, g.attrMax(k));
      const p = pt(i, Math.max(0, Math.min(1, (g.attrs[k] ?? 0) / max)));
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(176,67,47,0.20)';
    ctx.fill();
    ctx.strokeStyle = COLOR.zhu;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // 顶点与轴名
    ctx.font = this.font(14);
    for (let i = 0; i < 5; i++) {
      const k = RADAR_AXES[i] as AttrKey;
      const p = pt(i, 1);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = COLOR.zhu;
      ctx.fill();
      const lp = pt(i, 1.42);
      ctx.fillStyle = COLOR.inkSoft;
      ctx.textAlign = 'center';
      ctx.fillText(g.d.ATTR_NAMES[k] ?? k, lp.x, lp.y - 8);
    }
    ctx.textAlign = 'left';
  }

  private drawAttrRows(): void {
    const ctx = this.plat.ctx;
    const g = this.run.game;
    const x = SIDE.x + 22;
    const w = SIDE.w - 44;
    let y = SIDE.y + 208;
    for (const k of SIDE_ATTRS) {
      const v = g.attrs[k] ?? 0;
      ctx.fillStyle = COLOR.inkSoft;
      ctx.font = this.font(16);
      ctx.fillText(g.d.ATTR_NAMES[k] ?? k, x, y);
      ctx.fillStyle = COLOR.inkStrong;
      ctx.font = this.font(16, true);
      ctx.textAlign = 'right';
      ctx.fillText(g.diff.hideAttrs ? g.attrWord(k) : String(v), x + w, y);
      ctx.textAlign = 'left';
      // 条
      const max = Math.max(1, g.attrMax(k));
      const ratio = Math.max(0, Math.min(1, v / max));
      ctx.fillStyle = 'rgba(198,180,146,0.55)';
      ctx.fillRect(x, y + 21, w, 3);
      ctx.fillStyle = k === 'weiji' ? COLOR.zhu : COLOR.gold;
      ctx.fillRect(x, y + 21, w * ratio, 3);
      y += 31;
    }
  }

  // ---------- 结算 / 结局 / 修正 ----------

  private drawOverlay(screen: string): void {
    const ctx = this.plat.ctx;
    const run = this.run;
    const g = run.game;

    veil(ctx, this.plat);

    const box = { x: 250, y: 64, w: 780, h: 592 };
    ctx.fillStyle = COLOR.paper;
    roundRect(ctx, box, 10);
    ctx.fill();
    ctx.strokeStyle = COLOR.line;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    const x = box.x + 44;
    const w = box.w - 88;
    let y = box.y + 34;

    const title = (t: string): void => {
      ctx.fillStyle = COLOR.inkHeavy;
      ctx.font = this.font(28, true);
      ctx.textAlign = 'center';
      ctx.fillText(t, box.x + box.w / 2, y);
      ctx.textAlign = 'left';
      y += 44;
      ctx.strokeStyle = COLOR.line;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + w, y);
      ctx.stroke();
      y += 18;
    };
    const para = (t: string, color: string, size = 20, bold = false): void => {
      ctx.fillStyle = color;
      ctx.font = this.font(size, bold);
      for (const line of this.wrap(t, size, bold, w)) {
        ctx.fillText(line, x, y);
        y += size + 9;
      }
    };

    const bottom = box.y + box.h - 84;

    if (screen === 'summary') {
      const s = run.summary;
      title(`章末结算 ｜ ${shortTitle(s?.chapter ?? '')} 终`);
      para(`偏离归因 ｜ 当前偏离 ${s?.dev ?? 0}（${s?.bandName ?? '—'}）`, COLOR.zhu, 21, true);
      y += 6;
      if (!s || s.devLog.length === 0) {
        para('本章你循史而行，史官的笔尚跟得上你。', COLOR.inkDim);
      } else {
        for (const d of s.devLog) {
          if (y > bottom - 120) break;
          para(`${d.ev} ｜ ${d.t}`, COLOR.inkDim, 18);
        }
      }
      for (const n of (s?.notes ?? []).filter((t) => !t.startsWith('【教学】'))) {
        if (y > bottom - 90) break;
        para(n, COLOR.qing, 18);
      }
      if (s?.corrTitle) para(`历史修正 ｜ ${s.corrTitle}`, COLOR.qing, 18);
      if (y < bottom - 60) {
        y += 8;
        para('本 章 境 遇', COLOR.inkDim, 18, true);
        const deltas = g.d.ATTRS.filter((a) => s?.attrDelta[a.k]);
        if (deltas.length === 0) para('诸维如止水，无增无减。', COLOR.inkDim, 18);
        else {
          const chips = deltas.map((a) => {
            const d = s?.attrDelta[a.k] ?? 0;
            return { text: `${a.n} ${g.diff.hideAttrs ? (d > 0 ? '升' : '降') : `${d > 0 ? '+' : ''}${d}`}`, up: d > 0 };
          });
          this.drawChips(chips, x, y, w);
          y += 34;
        }
      }
      this.drawOverlayButton(s?.nextTitle ? '进 入 下 一 章' : '继 续');
    } else if (screen === 'ending') {
      const e = g.ending;
      if (!e) {
        this.drawOverlayButton('返 回 主 页');
        return;
      }
      // 头部:朱印 + 结局名 + 总分/评级
      ctx.fillStyle = COLOR.zhu;
      roundRect(ctx, { x: x, y: y + 4, w: 64, h: 64 }, 4);
      ctx.fill();
      ctx.fillStyle = '#f6efe0';
      ctx.font = this.font(20, true);
      ctx.textAlign = 'center';
      ctx.fillText((e.seal || '史').slice(0, 2), x + 32, y + 22);
      ctx.textAlign = 'left';

      ctx.fillStyle = COLOR.inkHeavy;
      ctx.font = this.font(28, true);
      ctx.fillText(e.name, x + 82, y + 8);
      ctx.fillStyle = COLOR.inkDim;
      ctx.font = this.font(18);
      ctx.fillText(`${e.diffName} · 总分 ${e.total} · 评级 ${e.grade}`, x + 82, y + 44);
      y += 96;

      ctx.strokeStyle = COLOR.line;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + w, y);
      ctx.stroke();
      y += 16;

      ctx.fillStyle = COLOR.gold;
      ctx.font = this.font(18, true);
      ctx.textAlign = 'center';
      ctx.fillText('太 史 公 曰', box.x + box.w / 2, y);
      ctx.textAlign = 'left';
      y += 30;

      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, w, bottom - y - 8);
      ctx.clip();
      para(e.zhuan || '', COLOR.ink, 19);
      ctx.restore();
      this.drawOverlayButton('返 回 主 页');
    } else if (screen === 'correction') {
      const c = run.correction;
      title(`历史修正 ｜ ${c?.title ?? ''}`);
      para((c?.segs ?? []).join(''), COLOR.ink);
      if (c?.changes?.length) {
        y += 8;
        this.drawChips(
          c.changes.filter((x2) => x2.delta !== 0).map((x2) => ({
            text: `${x2.label} ${x2.delta > 0 ? '+' : ''}${x2.delta}`,
            up: x2.delta > 0,
          })),
          x,
          y,
          w,
        );
      }
      this.drawOverlayButton('继 续');
    } else {
      // finished:末章之后没有下一章,也没有结局对象
      title('这一卷已到尽头');
      para('青史长存，后会有期。', COLOR.inkDim);
      this.drawOverlayButton('返 回 主 页');
    }
  }

  private drawChips(chips: { text: string; up: boolean }[], x: number, y: number, maxW: number): void {
    const ctx = this.plat.ctx;
    ctx.font = this.font(17);
    let cx = 0;
    let cy = y;
    for (const chip of chips) {
      const w = Math.ceil(ctx.measureText(chip.text).width) + 18;
      if (cx + w > maxW && cx > 0) {
        cx = 0;
        cy += 30;
      }
      const r = { x: x + cx, y: cy, w, h: 25 };
      ctx.fillStyle = chip.up ? 'rgba(176,67,47,0.08)' : 'rgba(70,112,105,0.10)';
      roundRect(ctx, r, 12);
      ctx.fill();
      ctx.strokeStyle = chip.up ? COLOR.zhu : COLOR.qing;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = chip.up ? COLOR.zhu : COLOR.qing;
      ctx.textAlign = 'center';
      ctx.fillText(chip.text, r.x + r.w / 2, r.y + 4);
      ctx.textAlign = 'left';
      cx += w + 8;
    }
  }

  private drawOverlayButton(label: string): void {
    const ctx = this.plat.ctx;
    const box = { x: 250, y: 64, w: 780, h: 592 };
    const btn = { x: box.x + box.w / 2 - 90, y: box.y + box.h - 68, w: 180, h: 46 };
    ctx.fillStyle = COLOR.zhu;
    roundRect(ctx, btn, 8);
    ctx.fill();
    ctx.fillStyle = '#f6efe0';
    ctx.font = this.font(20, true);
    ctx.textAlign = 'center';
    ctx.fillText(label, btn.x + btn.w / 2, btn.y + 10);
    ctx.textAlign = 'left';
    this.hits.push({ rect: btn, kind: 'overlay', index: 0 });
  }

  // ---------- 浮层:确认框 / toast ----------

  private drawConfirm(): void {
    const ctx = this.plat.ctx;
    const c = this.confirm;
    if (!c) return;
    veil(ctx, this.plat);
    const box = { x: 320, y: 220, w: 640, h: 280 };
    ctx.fillStyle = COLOR.paper;
    roundRect(ctx, box, 10);
    ctx.fill();
    ctx.strokeStyle = COLOR.line;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    const x = box.x + 40;
    let y = box.y + 34;
    ctx.fillStyle = COLOR.inkHeavy;
    ctx.font = this.font(26, true);
    ctx.textAlign = 'center';
    ctx.fillText(c.title, box.x + box.w / 2, y);
    ctx.textAlign = 'left';
    y += 48;
    ctx.fillStyle = COLOR.inkSoft;
    ctx.font = this.font(19);
    for (const line of c.lines) {
      for (const l of this.wrap(line, 19, false, box.w - 80)) {
        ctx.fillText(l, x, y);
        y += 28;
      }
      y += 4;
    }

    const yes = { x: box.x + box.w / 2 - 150, y: box.y + box.h - 68, w: 140, h: 44 };
    const no = { x: box.x + box.w / 2 + 10, y: box.y + box.h - 68, w: 140, h: 44 };
    ctx.fillStyle = COLOR.zhu;
    roundRect(ctx, yes, 8);
    ctx.fill();
    ctx.fillStyle = COLOR.paper;
    roundRect(ctx, no, 8);
    ctx.fill();
    ctx.strokeStyle = COLOR.line;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.font = this.font(20, true);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f6efe0';
    ctx.fillText(c.okText, yes.x + yes.w / 2, yes.y + 9);
    ctx.fillStyle = COLOR.ink;
    ctx.fillText('再 想 想', no.x + no.w / 2, no.y + 9);
    ctx.textAlign = 'left';
    this.hits.push({ rect: yes, kind: 'yes', index: 0 }, { rect: no, kind: 'no', index: 0 });
  }

  private drawToast(): void {
    const t = this.toast;
    if (!t || Date.now() > t.until) {
      if (t) this.toast = null;
      return;
    }
    const ctx = this.plat.ctx;
    ctx.font = this.font(18);
    const w = Math.min(DESIGN_W - 120, Math.ceil(ctx.measureText(t.text).width) + 40);
    const box = { x: (DESIGN_W - w) / 2, y: 96, w, h: 40 };
    ctx.fillStyle = 'rgba(26,22,18,0.82)';
    roundRect(ctx, box, 20);
    ctx.fill();
    ctx.fillStyle = COLOR.paper;
    ctx.textAlign = 'center';
    ctx.fillText(t.text, box.x + box.w / 2, box.y + 10);
    ctx.textAlign = 'left';
  }
}


