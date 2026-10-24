/**
 * 对局流程:引擎(prot/engine.js)的薄壳 + 相位路由 + 配音调度。
 *
 * 移植口径照抄 h5/src/game/session.ts 的路由部分(见该文件 route/Action 段),
 * 但这里不出现任何 canvas/DOM:渲染在 scenes/play.ts,一次只画当前相位。
 *
 * 与 H5 的一处差别:没有 DOM 的「小节累积」层,相位切换由 revision/screen
 * 两个信号交给场景,由场景决定是续写卷轴还是换页。
 */

import engine from '@engine';
import type {
  CardResult,
  DiffKey,
  EventOption,
  Game,
  Route,
  ScenarioData,
  SummaryView,
} from '../../types/scenario';
import type { Voice } from './voice';
import type { Sfx } from './sfx';

export type Screen =
  | 'intro'
  | 'round'
  | 'event'
  | 'choice'
  | 'endEvent'
  | 'summary'
  | 'ending'
  | 'correction'
  | 'finished';

/** 一次打牌/选项的结算:场景据此在卷轴上追加一节,并在 auto 时自行推进 */
export interface PendingResult {
  r: CardResult;
  /** 小节题签(经营 · 第 N 轮——卡名);空串表示不推题签 */
  title: string;
  /** 险招/段位提示,画在结果正文之上(朱色) */
  warn: string;
  /** 结果之后怎么走 */
  after: () => void;
  /** 自动推进(行动/蓄势/际遇),否则等玩家点「继续」 */
  auto: boolean;
}

export class Run {
  readonly game: Game;
  screen: Screen = 'intro';
  /** 本已经营轮数:只在引擎消耗一轮时 +1(与 H5 advanceRound 同口径) */
  roundNo = 0;
  pending: PendingResult | null = null;
  /** 章节代际:换章/回溯/重开时 +1,场景据此清空卷轴 */
  revision = 0;

  /** 章末结算视图(读档落在 summary 相位时也用它) */
  summary: SummaryView | null = null;
  /** 历史修正视图 */
  correction: { title: string; segs: string[]; changes?: { k: string; label: string; delta: number }[] } | null =
    null;

  /** 一次性提示(选项走不通等),场景画成 toast */
  toast = '';

  constructor(
    data: ScenarioData,
    readonly diffKey: DiffKey,
    private readonly voice: Voice | null = null,
    private readonly sfx: Sfx | null = null,
  ) {
    this.game = new engine.Game(data, diffKey);
  }

  get data(): ScenarioData {
    return this.game.d;
  }

  // ---------- 配音 ----------

  /** 入队一条配音切片(不打断当前句) */
  speak(clip: string): void {
    const s = this.game.d.SCENARIO.id;
    const c = this.game.chapter()?.id;
    if (!s || !c || !this.voice?.enabled) return;
    this.voice.enqueue(s, c, clip);
  }

  /** 掐断当前句并切到结果切片(结算语音) */
  private speakReplace(clip: string | null): void {
    this.voice?.stop();
    if (clip) this.speak(clip);
  }

  /** 进入某相位后该念什么:照抄 H5 各 render 的 speak 口径 */
  private voiceForPhase(): void {
    const g = this.game;
    switch (this.screen) {
      case 'intro':
        if (!this.voice?.enabled) break;
        this.voice.stop();
        this.speak('intro');
        break;
      case 'event': {
        const ev = g.eventId ? g.findEvent(g.eventId) : null;
        if (!ev) break;
        if (g.currentRandom) {
          // 危机插入播 _shared 的 crisis_<id>;普通随机事件(R-*)不配音
          if (g.eventId?.startsWith('C-')) this.speak(`crisis_${g.eventId}`);
        } else if (!this.altActive(ev)) {
          this.speak(ev.id);
        }
        break;
      }
      case 'choice': {
        const v = g.getChoiceCard();
        if (v) this.speak(`choice_${v.id}`);
        break;
      }
      case 'ending': {
        const e = g.ending;
        if (e) this.speak(`ending_${e.id}${e.variant ? `_${e.variant}` : ''}`);
        break;
      }
      default:
        break;
    }
  }

  // ---------- 相位 ----------

  private setScreen(s: Screen): void {
    this.screen = s;
    this.pending = null;
    this.voiceForPhase();
  }

  /** 开局:引擎进章首,场景从卷轴第一屏起稿 */
  start(): void {
    this.game.start();
    this.roundNo = 0;
    this.revision += 1;
    this.setScreen('intro');
  }

  /**
   * 读档:把存档 payload 导回引擎,再按引擎相位落到对应屏幕。
   * 存的是「存档那一刻」而不是章首(engine exportSave/importSave 的轮次语义),
   * 所以这里不能走 start(),否则玩家会从本章开头重来。
   */
  resume(payload: unknown, roundNo = 0): boolean {
    if (!this.game.importSave(payload)) return false;
    this.roundNo = roundNo;
    this.revision += 1;
    this.pending = null;
    this.summary = this.game.summaryView;
    this.correction = this.game.correction;
    this.toast = '';
    switch (this.game.phase) {
      case 'round':
        // 读档落在回合:先问一次际遇,与正常推进同口径
        this.route({ type: 'round' });
        break;
      case 'event':
        this.setScreen('event');
        break;
      case 'choice':
        this.setScreen('choice');
        break;
      case 'endEvent':
        this.setScreen('endEvent');
        break;
      case 'summary':
        this.setScreen('summary');
        break;
      case 'correction':
        this.setScreen('correction');
        break;
      case 'ending':
        this.setScreen('ending');
        break;
      default:
        this.setScreen('intro');
        break;
    }
    return true;
  }

  /**
   * 相位路由(与 H5 Session.route 同构)。
   * 所有 advance 型引擎方法的返回值都从这里进入。
   */
  route(n: Route | null | undefined): void {
    // 换相位先掐断上一段朗读:第一章的旁白不该跟着念到第二章
    this.voice?.stop();
    if (!n || n.type === 'none') {
      if (this.game.ending) {
        this.setScreen('ending');
        return;
      }
      // 末章之后没有下一章:本剧本走到尽头(无结局对象)
      this.setScreen('finished');
      return;
    }
    switch (n.type) {
      case 'round':
        if (this.game.maybeRandom()) this.setScreen('event');
        else this.setScreen('round');
        break;
      case 'event':
        this.setScreen('event');
        break;
      case 'ending':
        this.setScreen('ending');
        break;
      case 'chapter':
        // 换章:卷轴清空重来
        this.roundNo = 0;
        this.revision += 1;
        this.setScreen('intro');
        break;
      case 'summary':
        this.summary = n.summary;
        this.setScreen('summary');
        this.sfx?.play('chapter');
        break;
      case 'endEvent':
        this.setScreen('endEvent');
        break;
      case 'correction':
        this.correction = n.correction;
        this.setScreen('correction');
        break;
      default:
        this.setScreen('round');
        break;
    }
  }

  // ---------- 章首 / 回合 ----------

  beginEvents(): void {
    this.sfx?.play('enter');
    this.route(this.game.beginEvents());
  }

  /** 打一张行动/关键/抉择牌(下标是 getOffer 的下标) */
  playCard(i: number): void {
    const name = this.game.getOffer()[i]?.action?.name ?? '行动';
    const r = this.game.playCard(i);
    if (!r) {
      this.thaw('这张牌眼下走不通（门槛已变或状态不同步）。');
      return;
    }
    this.sfx?.play('card');
    if (r.kind === 'key') {
      if (r.chapterEnd) this.route(this.game.proceed());
      else this.setScreen('event');
      return;
    }
    if (r.kind === 'choice') {
      // 抉择卡出牌不消耗轮次:引擎停在 choice,落定那一刻才推进
      this.setScreen('choice');
      return;
    }
    this.roundNo += 1;
    this.showResult(r, `经营 · 第 ${this.roundNo} 轮——${name}`, () => this.routeAfterCard(r), true);
  }

  /** 蓄势 */
  playXushi(): void {
    const r = this.game.playXushi();
    if (!r) {
      this.thaw('蓄势只在一个关键事件内生效一次。');
      return;
    }
    this.sfx?.play('card');
    this.roundNo += 1;
    this.showResult(r, `经营 · 第 ${this.roundNo} 轮——蓄势 · 静观其变`, () => this.routeAfterCard(r), true);
  }

  /** 事件选项(关键事件/际遇同口径) */
  choose(i: number): void {
    const r = this.game.choose(i);
    if (!r) {
      this.thaw('这个选项眼下走不通（已试过或条件已变）。');
      return;
    }
    // 只有危机事件(C-*)有结算切片;主线/随机事件不配音
    this.speakReplace(
      this.game.eventId?.startsWith('C-') && !r.forcedEnding
        ? `crisis_${this.game.eventId}_o${i + 1}`
        : null,
    );
    // 险招失败即事件终结:收束路由走 abandonEvent;否则正常 proceed
    const after =
      r.failed && !r.forcedEnding
        ? () => this.route(this.game.abandonEvent())
        : () => this.route(this.game.proceed());
    const warn = [
      r.risk ? this.game.riskTitle(r) : '',
      r.bandUp && r.bandName ? `史书提示：偏离度已入「${r.bandName}」` : '',
    ]
      .filter(Boolean)
      .join(' ｜ ');
    // 事件结算一律等玩家点「继续」:读完一段再走是阅读节奏,不是加载等待
    this.showResult(r, '', after, false, warn);
  }

  /** 抉择卡落定 */
  chooseCardOption(i: number): void {
    const cardId = this.game.getChoiceCard()?.id ?? '';
    const r = this.game.chooseCardOption(i);
    if (!r) {
      this.thaw('这一抉择眼下走不通（状态已变）。');
      return;
    }
    // 落定 = 引擎消耗一轮(致死那条路引擎先收束,没消耗)
    if (!r.forcedEnding) this.roundNo += 1;
    this.speakReplace(cardId ? `choice_${cardId}_o${i + 1}` : null);
    this.showResult(r, '', () => this.routeAfterCard(r), false);
  }

  /** 且搁置:引擎退出 choice 相位,回回合重发牌 */
  cancelChoice(): void {
    if (this.game.cancelChoice()) this.setScreen('round');
    else this.thaw('这一抉择此刻不能搁置。');
  }

  /** 章末事件选项 */
  endEventChoose(i: number): void {
    const r = this.game.endEventChoose(i);
    if (!r) {
      this.thaw('这个选项眼下走不通（条件已变）。');
      return;
    }
    this.showResult(r, '', () => this.route(this.game.proceedAfterEndEvent()), false);
  }

  // ---------- 结算推进 ----------

  private showResult(r: CardResult, title: string, after: () => void, auto: boolean, warn = ''): void {
    this.pending = { r, title, warn, after, auto };
  }

  /** 结果看完了:执行挂起的推进 */
  advance(): void {
    const p = this.pending;
    if (!p) return;
    this.pending = null;
    this.sfx?.play('enter');
    p.after();
  }

  /** 牌落定后的相位:强制结局 > 强制关键事件 > 引擎给的去向(默认回回合) */
  private routeAfterCard(r: CardResult): void {
    if (r.forcedEnding) this.route(this.game.proceed());
    else if (r.forcedKey) this.setScreen('event');
    else this.route(r.route ?? { type: 'round' });
  }

  // ---------- 结算页 ----------

  proceedSummary(): void {
    this.sfx?.play('enter');
    this.route(this.game.proceedSummary());
  }

  proceedAfterEndEvent(): void {
    this.route(this.game.proceedAfterEndEvent());
  }

  correctionContinue(): void {
    this.route(this.game.correctionContinue());
  }

  /** 回溯:回到本章开头(能否回溯只问引擎) */
  backtrack(): void {
    if (!this.game.canBacktrack()) return;
    if (!this.game.backtrack()) return;
    this.roundNo = 0;
    this.revision += 1;
    this.setScreen('intro');
  }

  // ---------- 工具 ----------

  /** 该事件的异变文案是否生效 */
  altActive(ev: { altSegs?: { flag: string } }): boolean {
    return !!(ev.altSegs && this.game.flags[ev.altSegs.flag]);
  }

  /** 事件正文:异变生效时用变体(H5 eventSegs 同口径) */
  eventSegs(ev: { segs?: string[]; altSegs?: { flag: string; segs: string[] } }): string[] {
    return this.altActive(ev) ? ev.altSegs!.segs : ev.segs ?? [];
  }

  /** 选项门槛(无条件时引擎直接返回 true) */
  reqCheck(req: Record<string, unknown> | undefined | null): { ok: boolean; reason: string | null } {
    if (!req) return { ok: true, reason: null };
    const r = this.game.check(req);
    return r === true ? { ok: true, reason: null } : r;
  }

  /** 财富见底锁:扣财选项不可执行 */
  brokeFor(opt: EventOption): boolean {
    return this.game.attrs.caifu <= 0 && ((opt.eff?.attrs?.caifu ?? 0) < 0);
  }

  /** 险招提示文案(硬核隐藏具体数值) */
  riskText(risky: { rate: number; unmet: { k: string; name: string; need: number; have: number }[] }): string {
    const eff = Math.min(70, risky.rate + (this.game.xushi ? 10 : 0));
    const gaps = risky.unmet
      .map((u) => (this.game.diff.hideAttrs ? `${u.name}不足` : `${u.name} ${u.have}/${u.need}`))
      .join('、');
    const rate = this.game.diff.hideAttrs ? '成算' : '成功率';
    return `⚠ 险招 · ${rate} ${eff}%（${gaps}）`;
  }

  /** 走不通的统一兜底:按引擎相位把界面摆回去(不留静默锁死) */
  private thaw(msg: string): void {
    this.toast = msg;
    this.sfx?.play('fail');
    const g = this.game;
    switch (g.phase) {
      case 'round':
        this.setScreen('round');
        break;
      case 'event':
        if (g.getOptions().some((o) => o && !o.locked)) this.setScreen('event');
        else this.route(g.abandonEvent());
        break;
      case 'choice':
        this.setScreen('choice');
        break;
      default:
        break;
    }
  }
}

export type { CardResult, ChangeView, OfferView, OptionView } from '../../types/scenario';
