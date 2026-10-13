/**
 * prot/engine.js 的类型定义。
 *
 * 引擎是仓库里的 JS 真源(prot/ 的测试守护它),H5 侧**不拷贝**、只 alias 引用,
 * 因此这里只声明「用到的形状」,不改运行时行为。
 *
 * 索引语义(engine.js 顶部注释的契约 2):对外一律 0-based。
 *
 * 本文件是纯类型模块(无运行时代码),供 engine.d.ts / data.d.ts 引用。
 */

export type DiffKey = 'story' | 'normal' | 'hardcore';

export type AttrKey =
  | 'tupo' | 'wuli' | 'caixue' | 'moulue' | 'biancai'
  | 'caifu' | 'shengwang' | 'quanshi' | 'zhengji' | 'junxin' | 'weiji';

/** 选项的可用性 + 不可用原因(引擎给出的文案,直接展示) */
export interface OptionView {
  opt: EventOption;
  locked: boolean;
  reason: string | null;
  hist: boolean;
  risky: { rate: number; unmet: { k: AttrKey; name: string; need: number; have: number; gap: number }[] } | null;
}

export interface EventOption {
  /** 选项文案 */
  t: string;
  /** 命中后结算的效果 */
  eff?: Effect;
  /** 走历史线时展示的对照文案 */
  hist?: boolean;
  /** 险招失败时的文案 */
  resFail?: string;
  /** 硬门槛(不满足即锁定);数值为属性下限 */
  req?: Record<string, number | boolean>;
}

export interface Effect {
  attrs?: Partial<Record<AttrKey, number>>;
  setAttrs?: Partial<Record<AttrKey, number>>;
  condAttrs?: { if?: Record<string, unknown>; attrs?: Partial<Record<AttrKey, number>>; note?: string }[];
  dev?: number;
  flags?: string[];
  rmflags?: string[];
  zg?: number;
  zgSet?: number;
  hist?: number;
  merit?: string;
  ach?: string | { id: string; if?: Record<string, unknown> };
  notes?: Record<string, string>;
}

export interface GameEvent {
  id: string;
  title: string;
  segs?: string[];
  options: EventOption[];
  /** 关键节点(进复盘) */
  key?: boolean;
  altSegs?: { flag: string; segs: string[] };
  enterEffects?: unknown[];
  enterOnce?: string;
  /** 抉择卡:次级关键事件的多选项结构 */
  choice?: {
    title?: string;
    segs?: string[];
    options: { t: string; res?: string; eff?: Effect }[];
  };
}

export interface Chapter {
  /** 章号,如 c0/c1。配音切片路径靠它推导,数据里五本剧本全都有 */
  id: string;
  title: string;
  sub?: string;
  intro?: string[];
  start: string;
  events: GameEvent[];
  summaryNotes?: string[];
  endEvents?: { title?: string; segs?: string[]; options?: EventOption[]; if?: Record<string, unknown> }[];
  mutations?: {
    if?: Record<string, unknown>;
    flag?: string;
    zg?: number;
    zgSet?: number;
    setAttrs?: Partial<Record<AttrKey, number>>;
    capAttrs?: Partial<Record<AttrKey, number>>;
    note?: string;
  }[];
  age?: number;
  achOnEnter?: string;
  /** 进章即生效的注记/功业(enterChapter 读取,写进 introNotes) */
  enter?: { merit?: string; note?: string };
}

export interface ScenarioData {
  SCENARIO: { id: string; name: string; sub?: string; noSave?: boolean };
  ATTRS: { k: AttrKey; n: string; words: [number, string][]; inverse?: boolean; max?: number }[];
  ATTR_NAMES: Record<AttrKey, string>;
  INIT: Record<AttrKey, number>;
  DIFFICULTY: Record<DiffKey, {
    n: string; wj: number; corr: number; coef: number;
    backtrack: number; lethal: boolean; hideAttrs: boolean; desc: string;
  }>;
  AGE?: { init?: number; bands?: [number, number][]; longevity?: [number, number][] };
  ILLNESS?: Record<string, unknown>;
  ENCOUNTER?: { randomChance?: number; randomMax?: number; keyCardRounds?: number };
  ACTION_RULES?: { diminish?: boolean };
  PERSIST?: { junxinFrom?: number; junxinShichong?: boolean };
  HIDDEN?: { init?: number; words?: [number, string][] };
  CHAPTERS: Chapter[];
  ACTIONS: {
    id: string;
    name: string;
    desc?: string;
    descHidden?: string;
    res?: string;
    eff?: Effect;
    req?: Record<string, number>;
    chapters?: [number, number];
    choice?: GameEvent['choice'];
  }[];
  RANDOM_EVENTS?: GameEvent[];
  CORRECTIONS: { title: string; segs: string[]; minDev: number; maxDev: number; chance: number; eff?: Effect }[];
  ENDINGS: Record<string, {
    name: string; seal: string; zhuan?: string; zhuanAppends?: { if?: Record<string, unknown>; text: string }[];
    cuncun?: number; nitian?: boolean; epilogue?: string; ach?: string[];
    variants?: Record<string, { name: string; zhuan?: string }>;
    variantAch?: Record<string, string[]>;
    aliveNote?: string;
  }>;
  ACHIEVEMENTS: Record<string, string>;
  GLOSSARY: Record<string, string>;
  KEY_NODE_NAMES: Record<string, string>;
  MERIT_MAP?: Record<string, number>;
  SHIPING_BONUS_FLAGS?: { flag: string; bonus: number }[];
  ALIVE_NOTE?: { flag: string; text: string };
  CRISIS_EVENTS?: { death?: GameEvent; qingsuan?: GameEvent; plots?: GameEvent[] };
  DEV_BANDS: { name: string; max: number; color: string }[];
}

export interface EndingView {
  id: string;
  variant: string | null;
  name: string;
  seal: string;
  zhuan: string;
  nitian?: boolean;
  aliveNote: string | null;
  scores: { gongye: number; cuncun: number; shiping: number; yingxiang: number };
  merits: string[];
  dev: number;
  total: number;
  grade: 'S' | 'A' | 'B' | 'C' | 'D';
  diffName: string;
  review: { node: string; you: string; hist: string; isHist: boolean; dev: number }[];
  epilogue: string;
  achNew: string | null;
}

/** 属性增减的一行(引擎 applyEff 的返回值元素) */
export interface ChangeView {
  k: AttrKey;
  label: string;
  delta: number;
  note?: string;
}

/** 章末结算(makeSummary) */
export interface SummaryView {
  chapter: string;
  devLog: { ev: string; t: string; dev: number }[];
  attrDelta: Partial<Record<AttrKey, number>>;
  corrTitle: string | null;
  notes: string[];
  nextTitle: string | null;
  bandName: string;
  dev: number;
}

/**
 * 相位路由。
 *
 * 引擎所有 advance 型方法(proceed / beginEvents / nextChapter /
 * correctionContinue / proceedAfterEndEvent)统一返回本结构,
 * 视图层据此切换页面——这是 H5 与 Lua 共用的唯一导航协议。
 */
export type Route =
  | { type: 'round'; resumed?: boolean }
  | { type: 'event'; eventId?: string }
  | { type: 'ending' }
  | { type: 'chapter'; chapter: Chapter }
  | { type: 'summary'; summary: SummaryView }
  | { type: 'endEvent' }
  | { type: 'correction'; correction: { title: string; segs: string[]; changes?: ChangeView[] } }
  | { type: 'none' };

/** 打牌(行动/关键/蓄势/抉择)的结算。UI 据 kind 与各 forced* 决定去向。 */
export interface CardResult {
  kind: 'key' | 'action' | 'xushi' | 'choice';
  /** kind==='key': 本事件已是最后一节,直接收束本章 */
  chapterEnd?: boolean;
  /** 本动作直接触发终局 */
  forcedEnding?: boolean;
  /** 本动作直接续上关键事件(如 ATG-xielou) */
  forcedKey?: boolean;
  /** 下一相位(未强制时以本字段为准) */
  route?: Route;
  text: string;
  changes: ChangeView[];
  devDelta?: number;
  achNew?: string | null;
  bandUp?: boolean;
  bandName?: string;
  risk?: unknown;
  failed?: boolean;
}

/** 条件判定(check)。无条件时引擎直接返回 true。 */
export type CheckResult = true | { ok: boolean; reason: string | null };

/** 章末事件的进行中状态 */
export interface EndEventView {
  title: string;
  segs?: string[];
  options: EventOption[];
}

export interface Game {
  readonly d: ScenarioData;
  readonly diffKey: DiffKey;
  readonly diff: ScenarioData['DIFFICULTY'][DiffKey];
  attrs: Record<AttrKey, number>;
  dev: number;
  phase: 'home' | 'intro' | 'round' | 'event' | 'choice' | 'settle' | 'correction' | 'summary' | 'endEvent' | 'ending';
  merits: string[];
  ach: string[];
  gloss: string[];
  age: number | null;
  ill: { type: 'minor' | 'major'; left?: number } | null;
  eventId: string | null;
  chapterIdx: number;
  backtracksThisChapter: number;
  xushi: boolean;
  /** 本章进章注记(春秋渐高 / 树大招风 / 门客散去 …) */
  introNotes: string[];
  flags: Record<string, true | number>;
  /** 当前是否为际遇注入的事件 */
  currentRandom: GameEvent | null;
  /** 章首快照;exportSave 导出的就是它(存档语义 = 回到本章开头) */
  snapshot: Record<string, unknown> | null;
  /** 章末事件的进行中状态(endEvent 相位) */
  currentEndEvent: EndEventView | null;
  ending: EndingView | null;

  start(): void;
  beginEvents(): Route;
  beginRounds(): Route;
  chapter(): Chapter | null;
  devBand(dev?: number): number;
  findEvent(id: string): GameEvent | null;
  /** 本章关键事件推进进度(顶栏显示 done/total) */
  chapterProgress(): { done: number; total: number };
  getOffer(): OfferView[];
  getOptions(): OptionView[];
  getChoiceCard(): { id: string; title: string; segs: string[]; options: { t: string; res?: string }[] } | null;
  playCard(i: number): CardResult | null;
  playXushi(): CardResult | null;
  chooseCardOption(i: number): CardResult | null;
  cancelChoice(): boolean;
  choose(i: number): CardResult | null;
  proceed(): Route;
  /** 际遇判定:命中则引擎已切到 event 相位并回填 currentRandom */
  maybeRandom(): GameEvent | null;
  endEventChoose(i: number): CardResult | null;
  proceedAfterEndEvent(): Route;
  proceedSummary(): Route;
  correctionContinue(): Route;
  check(cond: Record<string, unknown> | null | undefined): CheckResult;
  attrWord(k: AttrKey): string;
  zgWord(): string;
  attrMax(k: AttrKey): number;
  riskTitle(r: unknown): string;
  canBacktrack(): boolean;
  backtrack(): boolean;
  exportSave(): unknown;
  importSave(obj: unknown): boolean;
}

/** 回合页的牌堆条目:关键事件占位 或 具体行动 */
export interface OfferView {
  type: 'key' | 'action';
  /** type==='key' */
  eventId?: string;
  title?: string;
  inserted?: boolean;
  roundsLeft?: number;
  enterable?: boolean;
  /** type==='action' */
  id?: string;
  action?: {
    id: string;
    name: string;
    desc?: string;
    descHidden?: string;
    res?: string;
  };
  locked: boolean;
  reason: string | null;
  usedCount?: number;
  diminishing?: boolean;
  risky: { rate: number; unmet: { k: AttrKey; name: string; need: number; have: number; gap: number }[] } | null;
}

export interface EngineModule {
  Game: new (d: ScenarioData, diffKey: DiffKey) => Game;
  KEY_CARD_ROUNDS: number;
  riskWord(rate: number): string;
}