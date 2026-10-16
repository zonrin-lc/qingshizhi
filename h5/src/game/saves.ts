/**
 * 存档系统:引擎 exportSave/importSave ↔ localStorage。
 *
 * 结构(2026-10-15 二次拍板):
 * - **自动档**(qingshi.autos.v1):每个剧本独立一桶,最多 6 条。
 *   写入时机只有一个:对局页点「返回」时玩家确认存档(见 main.ts requestExit)。
 *   存档页原来的 6 个手动槽位改为展示这 6 条自动档,不再有手动存。
 * - **暂存**(qingshi.stash.v1):每个剧本只留最近 1 条,关页/刷新(pagehide)
 *   时自动落,防丢兜底。
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
}

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

type AutoStore = Record<string, Slot[]>;

/** localStorage 可能不可用(隐私模式 / 被禁用),全部包 try */
function readAutos(): AutoStore {
  try {
    const raw = localStorage.getItem(AUTO_KEY);
    if (!raw) return {};
    const o: unknown = JSON.parse(raw);
    return o && typeof o === 'object' ? (o as AutoStore) : {};
  } catch {
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
  opts?: { overwriteOldest?: boolean; roundNo?: number },
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
    backtracksLeft: Math.max(0, game.diff.backtrack - game.backtracksThisChapter),
    age: game.age,
    payload,
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
 * 点「返回」正常退出不写暂存——那条路径由玩家确认后写自动档。
 *
 * 与自动档分开存放的理由:
 * - 自动档是玩家点「返回」时确认存的,语义是「我想留住这一局」
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
    const o: unknown = JSON.parse(raw);
    return o && typeof o === 'object' ? (o as StashStore) : {};
  } catch {
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
export function stashSave(game: Game, scenKey: string, scenName: string, roundNo = 0): boolean {
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
    backtracksLeft: Math.max(0, game.diff.backtrack - game.backtracksThisChapter),
    age: game.age,
    payload,
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

/** 用云端 bundle 整包覆写本地(只接受结构合法的输入;非法按空包处理) */
export function importSavesBundle(b: SavesBundle): void {
  try {
    localStorage.setItem(BACKUP_KEY, JSON.stringify(exportSavesBundle()));
  } catch { /* 备份失败不阻断同步 */ }
  writeAutos(b && typeof b === 'object' && b.autos && typeof b.autos === 'object' ? b.autos : {});
  writeStash(b && typeof b === 'object' && b.stash && typeof b.stash === 'object' ? b.stash : {});
}

/** 存档变动监听:每处写存储成功后触发。监听者抛错不许砸存档本体。 */
type MutListener = () => void;
const mutListeners: MutListener[] = [];
export function onSaveMutated(cb: MutListener): void {
  mutListeners.push(cb);
}
function notifyMutated(): void {
  for (const cb of mutListeners) {
    try { cb(); } catch { /* 同步模块的异常不许砸存档 */ }
  }
}
