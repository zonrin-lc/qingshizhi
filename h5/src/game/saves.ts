/**
 * 存档系统:引擎 exportSave/importSave ↔ localStorage。
 *
 * 结构(2026-10-15 二次拍板):
 * - **自动档**(qingshi.autos.v1):每个剧本独立一桶,最多 6 条。
 *   写入时机只有一个:对局页点「返回」(见 main.ts requestExit)——2026-10-17 起
 *   有空位时自动写不再打断,满员才问是否覆盖最早;本章经营未满 5 轮不写。
 *   存档页原来的 6 个手动槽位改为展示这 6 条自动档,不再有手动存。
 * - **暂存**(qingshi.stash.v1):每个剧本只留最近 1 条,关页/刷新(pagehide)
 *   时自动落,防丢兜底(同口径:未满 5 轮不落)。
 *
 * 引擎侧的三条硬约束(见 prot/engine.js exportSave),UI 必须如实反映,
 * 不能假装能存:
 *
 * 1. **存档精确到当前轮次**(v2.2.0)。exportSave 导出 snapshot(章首快照,
 *    供章内回溯)+ live(当前时刻全量状态,含发牌/相位/随机轨迹)两件套,
 *    读档回到存档那一刻,不再是「回到本章开头」。旧版 v1 章首档仍可读。
 *
 * 2. **硬核难度不可存**。diff.backtrack === 0 时 exportSave 直接返回 null
 *    (硬核的规则就是不许回退)。这不是 bug,是难度定义。
 *
 * 3. **未开局不可存**(还没进过任何一章、或结局已落定时)。
 *
 * 另外场景级开关:SCENARIO.noSave 的剧本(契约下属"冥河")永不可存。
 */
import type { DiffKey, Game } from '../../types/scenario';

export interface SaveMeta {
  at: number;
  scenKey: string;
  scenName: string;
  diffKey: DiffKey;
  /** 存档对应第几章(0-based) */
  chapterIdx: number;
  chapterTitle: string;
  /** 本章已落定的经营轮数(v2.2.0 轮次存档;0 = 章首/未经营;旧档无此字段) */
  roundNo?: number;
  /** 本章还能回溯几次 —— 读档后仍然有效,所以要存下来给玩家看 */
  backtracksLeft: number;
  age: number | null;
}

export interface Slot extends SaveMeta {
  payload: unknown;
  /** 题签历史(v2.3.0):读档时把卷轴上已收起的小节(题签+属性胶囊+正文)摆回去。
   *  这是 UI 层状态,不进引擎 payload;旧档没有它,按空处理。 */
  ui?: SecRec[];
}

/** 题签历史里一枚属性胶囊 */
export interface SecTag { k: string; name: string; v: string; up: boolean }
/** 一条已落定的小节记录:题签(含「——所选」后缀)+ 属性胶囊 + 正文纯文本 */
export interface SecRec { t: string; tags: SecTag[]; body: string }

/** 某个对局当前能不能存档,以及不能的理由 */
export function whyCannotSave(game: Game): string | null {
  if (game.d.SCENARIO.noSave) return '此局契约下属冥河,不可存档';
  if (game.diff.backtrack === 0) return '硬核难度不许回退,不可存档';
  if (!game.snapshot) return '尚未进入任何一章,暂无可存的进度';
  return null;
}

/** 槽位上的轮次标识:经营过才显示(章首/旧档不显示) */
export function fmtRound(roundNo?: number): string {
  return roundNo && roundNo > 0 ? `经营至第 ${roundNo} 轮` : '';
}

/** 直接把一份 payload 导入给定的 Game(读档/继续旅程共用这条路) */
export function loadPayload(payload: unknown, game: Game): boolean {
  if (!payload) return false;
  return game.importSave(payload);
}

/* ============================================================================
 * 自动档:按剧本分桶(旧→新),每桶最多 AUTO_MAX 条,超出需调用方确认后
 * 覆盖最早(overwriteOldest)。
 * ========================================================================== */
const AUTO_KEY = 'qingshi.autos.v1';
/** 每剧本自动档上限;与存档页槽位行数一致 */
export const AUTO_MAX = 6;

/** 本章经营满几轮才开始存档(2026-10-17 拍板):开局没多久就退出没什么可存的,
 * 「返回」与 pagehide 暂存同口径。roundNo 章首归零,所以按本章轮次计。 */
export const SAVE_MIN_ROUND = 5;

type AutoStore = Record<string, Slot[]>;

/**
 * 桶/条目的形状校验(2026-10-21 修)。
 *
 * 存档来自三个不受控的来源:localStorage(手改/旧版本)、云端整包(别的机器上的
 * 旧包)、导入的 bundle。原来 readAutos 只判「是不是对象」,桶里塞个非数组就会
 * 让 listAutoEntries 的 .map 与 saveAuto 的 .push 双双抛 TypeError ——
 * 存档页整页渲染失败、对局页「返回」也退不出去。
 */
function isSlot(v: unknown): v is Slot {
  if (!v || typeof v !== 'object') return false;
  const s = v as Partial<Slot>;
  return typeof s.at === 'number' && !!s.payload && typeof s.payload === 'object';
}

/**
 * 逐桶过滤:非法桶整个丢弃(而不是让整库报废),非法条目逐条丢弃。
 * dropped=true 表示「原始数据里有非法形状」—— 调用方据此把原文隔离到
 * `.broken` 键(2026-10-21:原来只有 JSON 解析失败才隔离,「能解析但形状不对」
 * 的档会被静默丢条目,玩家看着自己的档凭空少了几条却不知道为什么)。
 */
function sanitizeStore(raw: unknown): { store: AutoStore; dropped: boolean } {
  const out: AutoStore = {};
  let dropped = false;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { store: out, dropped: !!raw };
  }
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(v)) { dropped = true; continue; }
    const list = v.filter(isSlot);
    if (list.length !== v.length) dropped = true;
    if (list.length) out[k] = list as Slot[];
  }
  return { store: out, dropped };
}

/** 原始串有非法形状时留一份底,别让玩家的数据无声消失 */
function quarantine(keyName: string, raw: string): void {
  try {
    localStorage.setItem(`${keyName}.broken`, raw);
  } catch { /* 隐私模式:连隔离键都写不进就算了,原键仍在 */ }
}

/**
 * localStorage 可能不可用(隐私模式 / 被禁用),全部包 try。
 * 解析失败/形状非法时:先把原始串隔离到 `.broken` 键(数据不丢,可人工找回),
 * 再当空库处理 —— 但**不删原键**,后续写档覆盖的是新值,原串仍在 .broken 里。
 */
function readAutos(): AutoStore {
  try {
    const raw = localStorage.getItem(AUTO_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    const { store, dropped } = sanitizeStore(parsed);
    if (dropped) quarantine(AUTO_KEY, raw);
    return store;
  } catch {
    quarantine(AUTO_KEY, localStorage.getItem(AUTO_KEY) ?? '');
    return {};
  }
}

function writeAutos(store: AutoStore): boolean {
  try {
    localStorage.setItem(AUTO_KEY, JSON.stringify(store));
    notifyMutated();
    return true;
  } catch {
    // 配额满或隐私模式:存档失败必须让 UI 知道,不能静默
    return false;
  }
}

/** 自动档条目:Slot + 存储序索引(旧→新),删除时按 idx 精确移除 */
export interface AutoEntry {
  slot: Slot;
  idx: number;
}

/** 读自动档:给 scenKey 列单剧本,不传则全部剧本;返回均按新→旧排列 */
export function listAutoEntries(scenKey?: string): AutoEntry[] {
  const store = readAutos();
  const pick = (k: string): AutoEntry[] =>
    (store[k] ?? [])
      .map((s, idx) => ({ slot: s, idx }))
      .filter((e) => e.slot && typeof e.slot === 'object' && 'payload' in e.slot);
  const out = scenKey ? pick(scenKey) : Object.keys(store).flatMap(pick);
  return out.sort((a, b) => b.slot.at - a.slot.at);
}

/** 读自动档(新→旧) */
export function listAutos(scenKey?: string): Slot[] {
  return listAutoEntries(scenKey).map((e) => e.slot);
}

/** 该剧本已有几条自动档(决定是否提示覆盖) */
export function autoCount(scenKey: string): number {
  return (readAutos()[scenKey] ?? []).length;
}

/** 全部剧本里最新的一条自动档(驱动主菜单「继续旅程」) */
export function getLatestAuto(): Slot | null {
  return listAutos()[0] ?? null;
}

/**
 * 写一条自动档。满 AUTO_MAX 条时:
 * - 未带 overwriteOldest → 不存,返回 full: true 让 UI 去确认
 * - 带了 → 覆盖最早的一条(FIFO)
 * 引擎说不可存(硬核 / 无章首快照 / noSave 剧本)时返回 ok:false。
 */
export function saveAuto(
  game: Game,
  scenKey: string,
  scenName: string,
  opts?: { overwriteOldest?: boolean; roundNo?: number; ui?: SecRec[] },
): { ok: boolean; reason: string; full: boolean } {
  const ch = game.chapter();
  const payload = game.exportSave();
  if (!payload) {
    return { ok: false, reason: '当前对局不可存档(硬核不许回退 / 尚未进入任何一章)', full: false };
  }
  const store = readAutos();
  const list = store[scenKey] ?? [];
  if (list.length >= AUTO_MAX) {
    if (!opts?.overwriteOldest) {
      return { ok: false, reason: `「${scenName}」的存档已满 ${AUTO_MAX} 条`, full: true };
    }
    list.shift(); // 覆盖最早
  }
  const roundNo = opts?.roundNo ?? 0;
  list.push({
    at: Date.now(),
    scenKey,
    scenName,
    diffKey: game.diffKey,
    chapterIdx: game.chapterIdx,
    chapterTitle: ch?.title ?? `第 ${game.chapterIdx + 1} 章`,
    roundNo,
    // 回溯余量:-1 = 无限(剧情难度 diff.backtrack = -1,与引擎语义一致,
    // 存档页按负值显示「本章可无限次回溯」)
    backtracksLeft: game.diff.backtrack < 0 ? -1 : Math.max(0, game.diff.backtrack - game.backtracksThisChapter),
    age: game.age,
    payload,
    ...(opts?.ui?.length ? { ui: opts.ui } : {}),
  });
  store[scenKey] = list;
  const where = `${ch?.title ?? `第 ${game.chapterIdx + 1} 章`}${roundNo > 0 ? ` · 第 ${roundNo} 轮` : ''}`;
  return writeAutos(store)
    ? { ok: true, reason: `已存档(${where})`, full: false }
    : { ok: false, reason: '写入本地存储失败(可能处于隐私模式或空间已满)', full: false };
}

/** 删除某剧本的第 idx 条自动档(按旧→新顺序的索引,与存储序一致) */
export function removeAuto(scenKey: string, idx: number): void {
  const store = readAutos();
  const list = store[scenKey];
  if (!list || idx < 0 || idx >= list.length) return;
  list.splice(idx, 1);
  if (list.length === 0) delete store[scenKey];
  writeAutos(store);
}

/** 清空某剧本的自动档(结局落地时调:通关的局不该再复活) */
export function clearAutos(scenKey: string): void {
  const store = readAutos();
  if (!(scenKey in store)) return;
  delete store[scenKey];
  writeAutos(store);
}

/** 人类可读的时间 */
export function fmtTime(at: number): string {
  const d = new Date(at);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export const DIFF_LABEL: Record<DiffKey, string> = {
  story: '剧情',
  normal: '普通',
  hardcore: '硬核',
};

/* ============================================================================
 * 暂存(2026-10-15 拍板,同日二次调整):对局中直接关页/刷新(pagehide)时
 * 自动落一份进度,每个剧本单独一桶,只保留最近一条。
 * 点「返回」正常退出不写暂存——那条路径写自动档(有空位自动写,满员确认覆盖)。
 *
 * 与自动档分开存放的理由:
 * - 自动档是玩家主动点「返回」留下的,语义是「我想留住这一局」
 * - 暂存是关页/刷新时的防丢兜底,玩家没表态,频繁覆写自动档等于替玩家做决定
 * - 暂存按剧本分桶:同时玩多个剧本时互不覆盖
 *
 * 引擎硬约束同上:暂存的同样是「当前时刻」的完整进度(v2.2.0);
 * 硬核/noSave/未开局时 exportSave 返回 null,安静跳过。
 * ========================================================================== */
const STASH_KEY = 'qingshi.stash.v1';
/** 每剧本暂存上限:只保留最近一条(2026-10-15 二次拍板) */
export const STASH_MAX = 1;

type StashStore = Record<string, Slot[]>;

function readStash(): StashStore {
  try {
    const raw = localStorage.getItem(STASH_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    const { store, dropped } = sanitizeStore(parsed);
    if (dropped) quarantine(STASH_KEY, raw);
    return store;
  } catch {
    // 同 readAutos:解析失败/形状非法先把原始串隔离到 .broken 键,再当空处理
    quarantine(STASH_KEY, localStorage.getItem(STASH_KEY) ?? '');
    return {};
  }
}

function writeStash(store: StashStore): boolean {
  try {
    localStorage.setItem(STASH_KEY, JSON.stringify(store));
    notifyMutated();
    return true;
  } catch {
    return false;
  }
}

/** 写一份暂存;返回是否真的存下了(不可存的局安静返回 false) */
export function stashSave(game: Game, scenKey: string, scenName: string, roundNo = 0, ui?: SecRec[]): boolean {
  const ch = game.chapter();
  const payload = game.exportSave();
  if (!payload) return false;
  const store = readStash();
  const list = store[scenKey] ?? [];
  list.push({
    at: Date.now(),
    scenKey,
    scenName,
    diffKey: game.diffKey,
    chapterIdx: game.chapterIdx,
    chapterTitle: ch?.title ?? `第 ${game.chapterIdx + 1} 章`,
    roundNo,
    // 回溯余量:-1 = 无限(与自动档同口径)
    backtracksLeft: game.diff.backtrack < 0 ? -1 : Math.max(0, game.diff.backtrack - game.backtracksThisChapter),
    age: game.age,
    payload,
    ...(ui?.length ? { ui } : {}),
  });
  // FIFO:超上限从头部(最早)挤掉
  while (list.length > STASH_MAX) list.shift();
  store[scenKey] = list;
  return writeStash(store);
}

/** 暂存条目:Slot + 存储序索引(旧→新),删除时按 idx 精确移除 */
export interface StashEntry {
  slot: Slot;
  idx: number;
}

/** 读暂存:给 scenKey 列单剧本,不传则全部剧本;返回均按新→旧排列 */
export function listStashEntries(scenKey?: string): StashEntry[] {
  const store = readStash();
  const pick = (k: string): StashEntry[] =>
    (store[k] ?? [])
      .map((s, idx) => ({ slot: s, idx }))
      .filter((e) => e.slot && typeof e.slot === 'object' && 'payload' in e.slot);
  const out = scenKey ? pick(scenKey) : Object.keys(store).flatMap(pick);
  return out.sort((a, b) => b.slot.at - a.slot.at);
}

/** 读暂存:给 scenKey 列单剧本(新→旧),不传则列出全部剧本(新→旧) */
export function listStash(scenKey?: string): Slot[] {
  return listStashEntries(scenKey).map((e) => e.slot);
}

/** 删除某剧本的第 idx 份暂存(按旧→新顺序的索引,与存储序一致) */
export function removeStash(scenKey: string, idx: number): void {
  const store = readStash();
  const list = store[scenKey];
  if (!list || idx < 0 || idx >= list.length) return;
  list.splice(idx, 1);
  if (list.length === 0) delete store[scenKey];
  writeStash(store);
}

/* ============================================================================
 * 云同步接缝(2026-10-16,TapTap 对接)
 *
 * tapcloud.ts 需要两样东西:
 * 1. 整包导出/导入 —— AUTO_KEY/STASH_KEY 是模块私有,云同步不该知道键名,
 *    所以由这里出 bundle(导出)和整包覆写(导入,覆写前留本地备份)。
 * 2. 写入通知 —— 每次本地存档变动(写自动档/暂存/删除/清空)都通知订阅者,
 *    tapcloud 据此标脏、按频控调度上传。存档本体不 import tapcloud,
 *    单向依赖:tapcloud → saves。
 * ========================================================================== */

/** 整包结构:直接包两个 store,版本字段由 tapcloud 的云端信封管 */
export interface SavesBundle {
  autos: AutoStore;
  stash: StashStore;
}

/** 覆写导入前的本地备份键:云端覆盖本地时先留一手,误杀可人工找回 */
const BACKUP_KEY = 'qingshi.cloudbackup.v1';

export function exportSavesBundle(): SavesBundle {
  return { autos: readAutos(), stash: readStash() };
}

/**
 * 用云端 bundle 整包覆写本地。返回是否真的写进去了。
 *
 * 2026-10-21 修三处:
 * - 结构先校验再落:autos/stash 必须是对象(桶可以为空,但不能是数组/字符串),
 *   非法包**不再按空包处理** —— 原来那样会把玩家本地档清空;
 * - 备份写失败就**中止导入**:备份是唯一回滚手段,没备份还覆盖等于让玩家
 *   无路可退(配额紧张时备份几乎必然失败,原来被空 catch 吞掉);
 * - 返回成功与否:调用方(tapcloud)据此决定要不要把「已同步」写进 meta ——
 *   写失败却对齐了 meta,分叉的那一半就永远不会再传。
 */
export function importSavesBundle(b: SavesBundle): boolean {
  if (!b || typeof b !== 'object') return false;
  const autos = b.autos;
  const stash = b.stash;
  if (!autos || typeof autos !== 'object' || Array.isArray(autos)) return false;
  if (!stash || typeof stash !== 'object' || Array.isArray(stash)) return false;
  const nextAutos = sanitizeStore(autos).store;
  const nextStash = sanitizeStore(stash).store;
  try {
    localStorage.setItem(BACKUP_KEY, JSON.stringify(exportSavesBundle()));
  } catch {
    // 备份写不进去(配额/隐私模式)就不覆盖:宁可不同步,也不让玩家丢档
    return false;
  }
  const okAutos = writeAutos(nextAutos);
  const okStash = writeStash(nextStash);
  return okAutos && okStash;
}

/**
 * 存档变动监听:每处写存储成功后触发。监听者抛错不许砸存档本体。
 * 返回退订函数(2026-10-21 加):页面级重复初始化时能真正摘掉订阅,
 * 不再是只增不减。
 */
type MutListener = () => void;
const mutListeners: MutListener[] = [];
export function onSaveMutated(cb: MutListener): () => void {
  mutListeners.push(cb);
  return () => {
    const i = mutListeners.indexOf(cb);
    if (i >= 0) mutListeners.splice(i, 1);
  };
}
function notifyMutated(): void {
  for (const cb of [...mutListeners]) {
    try { cb(); } catch { /* 同步模块的异常不许砸存档 */ }
  }
}
