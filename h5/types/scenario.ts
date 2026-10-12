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

  start(): void;
  beginEvents(): { type: 'round' };
  beginRounds(): { type: 'round' };
  chapter(): Chapter | null;
  devBand(dev?: number): number;
  findEvent(id: string): GameEvent | null;
  getOffer(): unknown[];
  getOptions(): OptionView[];
  getChoiceCard(): { id: string; title: string; segs: string[]; options: { t: string; res?: string }[] } | null;
  playCard(i: number): Record<string, unknown> | null;
  playXushi(): Record<string, unknown> | null;
  chooseCardOption(i: number): Record<string, unknown> | null;
  cancelChoice(): boolean;
  choose(i: number): Record<string, unknown> | null;
  proceed(): { type: string };
  attrWord(k: AttrKey): string;
  zgWord(): string;
  attrMax(k: AttrKey): number;
  riskTitle(r: unknown): string;
  canBacktrack(): boolean;
  backtrack(): boolean;
  exportSave(): unknown;
  importSave(obj: unknown): boolean;
}

export interface EngineModule {
  Game: new (d: ScenarioData, diffKey: DiffKey) => Game;
  KEY_CARD_ROUNDS: number;
  riskWord(rate: number): string;
}