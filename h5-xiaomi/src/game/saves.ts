/**
 * 存档系统:引擎 exportSave/importSave ↔ Platform 存储(快游戏是小程序签名存储)。
 *
 * 结构与 H5 的 game/saves.ts 完全一致,只是把 localStorage 换成注入的 Platform:
 * - 自动档(qingshi.autos.v1):每个剧本独立一桶,最多 AUTO_MAX 条,新→旧
 * - 暂存(qingshi.stash.v1):每个剧本只留最近 1 条(关页/切后台的防丢兜底)
 *
 * 三条引擎硬约束照抄,UI 必须如实反映:
 * 1. 存档精确到当前轮次(exportSave 导出 snapshot+live 两件套);
 * 2. 硬核难度(diff.backtrack === 0)exportSave 直接返回 null,不可存;
 * 3. 未开局(没进过任何一章 / 结局已定)不可存。
 * 另外 SCENARIO.noSave 的剧本永不可存。
 */

import type { Platform } from '../port/platform';
import type { DiffKey, Game } from '../../types/scenario';

export interface SaveMeta {
  at: number;
  scenKey: string;
  scenName: string;
  diffKey: DiffKey;
  /** 存档对应第几章(0-based) */
  chapterIdx: number;
  chapterTitle: string;
  /** 本章已落定的经营轮数(0 = 章首/未经营;旧档无此字段) */
  roundNo?: number;
  /** 本章还能回溯几次(-1 = 无限) */
  backtracksLeft: number;
  age: number | null;
}

/** 题签历史里一枚属性胶囊 */
export interface SecTag {
  k: string;
  name: string;
  v: string;
  up: boolean;
}

/** 一条已落定的小节记录(读档时把卷轴上收起的小节摆回去) */
export interface SecRec {
  t: string;
  tags: SecTag[];
  body: string;
}

export interface Slot extends SaveMeta {
  payload: unknown;
  ui?: SecRec[];
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

const AUTO_KEY = 'qingshi.autos.v1';
const STASH_KEY = 'qingshi.stash.v1';
const BACKUP_KEY = 'qingshi.cloudbackup.v1';

/** 每剧本自动档上限;与存档页槽位行数一致 */
export const AUTO_MAX = 6;
/** 暂存上限:只保留最近一条 */
export const STASH_MAX = 1;
/** 本章经营满几轮才开始存档:开局没多久退出没什么可存的 */
export const SAVE_MIN_ROUND = 5;

type Store = Record<string, Slot[]>;

function isSlot(v: unknown): v is Slot {
  if (!v || typeof v !== 'object') return false;
  const s = v as Partial<Slot>;
  return typeof s.at === 'number' && !!s.payload && typeof s.payload === 'object';
}

/**
 * 逐桶过滤:非法桶整个丢弃,非法条目逐条丢弃。
 * dropped=true 表示原始数据里有非法形状,调用方据此把原文隔离到 .broken 键。
 */
function sanitizeStore(raw: unknown): { store: Store; dropped: boolean } {
  const out: Store = {};
  let dropped = false;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { store: out, dropped: !!raw };
  }
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(v)) {
      dropped = true;
      continue;
    }
    const list = v.filter(isSlot);
    if (list.length !== v.length) dropped = true;
    if (list.length) out[k] = list;
  }
  return { store: out, dropped };
}

/** 自动档条目:Slot + 存储序索引(旧→新),删除时按 idx 精确移除 */
export interface AutoEntry {
  slot: Slot;
  idx: number;
}

/** 暂存条目:同上 */
export interface StashEntry {
  slot: Slot;
  idx: number;
}

type MutListener = () => void;

export class SaveStore {
  private readonly mutListeners: MutListener[] = [];

  constructor(private readonly plat: Platform) {}

  /** 存档变动订阅;返回退订函数。监听者抛错不许砸存档本体。 */
  onMutated(cb: MutListener): () => void {
    this.mutListeners.push(cb);
    return () => {
      const i = this.mutListeners.indexOf(cb);
      if (i >= 0) this.mutListeners.splice(i, 1);
    };
  }

  /* ---------------------------------------------------------------- 自动档 */

  listAutoEntries(scenKey?: string): AutoEntry[] {
    const store = this.read(AUTO_KEY);
    const pick = (k: string): AutoEntry[] =>
      (store[k] ?? []).map((s, idx) => ({ slot: s, idx }));
    const out = scenKey ? pick(scenKey) : Object.keys(store).flatMap(pick);
    return out.sort((a, b) => b.slot.at - a.slot.at);
  }

  listAutos(scenKey?: string): Slot[] {
    return this.listAutoEntries(scenKey).map((e) => e.slot);
  }

  autoCount(scenKey: string): number {
    return (this.read(AUTO_KEY)[scenKey] ?? []).length;
  }

  /** 全部剧本里最新的一条自动档(驱动主菜单「继续旅程」) */
  getLatestAuto(): Slot | null {
    return this.listAutos()[0] ?? null;
  }

  /**
   * 写一条自动档。满 AUTO_MAX 条时:
   * - 未带 overwriteOldest → 不存,返回 full: true 让 UI 去确认
   * - 带了 → 覆盖最早的一条(FIFO)
   * 引擎说不可存(硬核 / 无章首快照 / noSave 剧本)时返回 ok:false。
   */
  saveAuto(
    game: Game,
    scenKey: string,
    scenName: string,
    opts?: { overwriteOldest?: boolean; roundNo?: number; ui?: SecRec[] },
  ): { ok: boolean; reason: string; full: boolean } {
    const ch = game.chapter();
    const payload = game.exportSave();
    if (!payload) {
      return {
        ok: false,
        reason: '当前对局不可存档(硬核不许回退 / 尚未进入任何一章)',
        full: false,
      };
    }
    const store = this.read(AUTO_KEY);
    const list = store[scenKey] ?? [];
    const roundNo = opts?.roundNo ?? 0;
    const record: Slot = {
      at: Date.now(),
      scenKey,
      scenName,
      diffKey: game.diffKey,
      chapterIdx: game.chapterIdx,
      chapterTitle: ch?.title ?? `第 ${game.chapterIdx + 1} 章`,
      roundNo,
      backtracksLeft:
        game.diff.backtrack < 0
          ? -1
          : Math.max(0, game.diff.backtrack - game.backtracksThisChapter),
      age: game.age,
      payload,
      ...(opts?.ui?.length ? { ui: opts.ui } : {}),
    };

    // 同一轮反复进出(看档又退出)不该啃掉槽位:最新一条同轮则原地刷新
    const last = list[list.length - 1];
    if (
      last &&
      last.chapterIdx === record.chapterIdx &&
      last.roundNo === record.roundNo &&
      last.diffKey === record.diffKey
    ) {
      list[list.length - 1] = record;
      store[scenKey] = list;
      return this.write(AUTO_KEY, store)
        ? { ok: true, reason: '已刷新本轮的自动档', full: false }
        : { ok: false, reason: '写入本地存储失败(可能空间已满)', full: false };
    }

    if (list.length >= AUTO_MAX) {
      if (!opts?.overwriteOldest) {
        return { ok: false, reason: `「${scenName}」的存档已满 ${AUTO_MAX} 条`, full: true };
      }
      list.shift();
    }
    list.push(record);
    store[scenKey] = list;
    const where = `${ch?.title ?? `第 ${game.chapterIdx + 1} 章`}${
      roundNo > 0 ? ` · 第 ${roundNo} 轮` : ''
    }`;
    return this.write(AUTO_KEY, store)
      ? { ok: true, reason: `已存档(${where})`, full: false }
      : { ok: false, reason: '写入本地存储失败(可能空间已满)', full: false };
  }

  removeAuto(scenKey: string, idx: number): void {
    const store = this.read(AUTO_KEY);
    const list = store[scenKey];
    if (!list || idx < 0 || idx >= list.length) return;
    list.splice(idx, 1);
    if (list.length === 0) delete store[scenKey];
    this.write(AUTO_KEY, store);
  }

  /** 清空某剧本的自动档(结局落地时调:通关的局不该再复活) */
  clearAutos(scenKey: string): void {
    const store = this.read(AUTO_KEY);
    if (!(scenKey in store)) return;
    delete store[scenKey];
    this.write(AUTO_KEY, store);
  }

  /* ------------------------------------------------------------------ 暂存 */

  /** 写一份暂存;返回是否真的存下了(不可存的局安静返回 false) */
  stashSave(
    game: Game,
    scenKey: string,
    scenName: string,
    roundNo = 0,
    ui?: SecRec[],
  ): boolean {
    const ch = game.chapter();
    const payload = game.exportSave();
    if (!payload) return false;
    const store = this.read(STASH_KEY);
    const list = store[scenKey] ?? [];
    list.push({
      at: Date.now(),
      scenKey,
      scenName,
      diffKey: game.diffKey,
      chapterIdx: game.chapterIdx,
      chapterTitle: ch?.title ?? `第 ${game.chapterIdx + 1} 章`,
      roundNo,
      backtracksLeft:
        game.diff.backtrack < 0
          ? -1
          : Math.max(0, game.diff.backtrack - game.backtracksThisChapter),
      age: game.age,
      payload,
      ...(ui?.length ? { ui } : {}),
    });
    while (list.length > STASH_MAX) list.shift();
    store[scenKey] = list;
    return this.write(STASH_KEY, store);
  }

  listStashEntries(scenKey?: string): StashEntry[] {
    const store = this.read(STASH_KEY);
    const pick = (k: string): StashEntry[] =>
      (store[k] ?? []).map((s, idx) => ({ slot: s, idx }));
    const out = scenKey ? pick(scenKey) : Object.keys(store).flatMap(pick);
    return out.sort((a, b) => b.slot.at - a.slot.at);
  }

  listStash(scenKey?: string): Slot[] {
    return this.listStashEntries(scenKey).map((e) => e.slot);
  }

  removeStash(scenKey: string, idx: number): void {
    const store = this.read(STASH_KEY);
    const list = store[scenKey];
    if (!list || idx < 0 || idx >= list.length) return;
    list.splice(idx, 1);
    if (list.length === 0) delete store[scenKey];
    this.write(STASH_KEY, store);
  }

  /* -------------------------------------------------------------- 整包同步 */

  exportBundle(): SavesBundle {
    return { autos: this.read(AUTO_KEY), stash: this.read(STASH_KEY) };
  }

  /**
   * 用云 bundle 整包覆写本地。
   * 非法包不按空包处理(那会清空玩家本地档);备份写失败就中止导入。
   */
  importBundle(b: SavesBundle): boolean {
    if (!b || typeof b !== 'object') return false;
    const autos = b.autos;
    const stash = b.stash;
    if (!autos || typeof autos !== 'object' || Array.isArray(autos)) return false;
    if (!stash || typeof stash !== 'object' || Array.isArray(stash)) return false;
    const nextAutos = sanitizeStore(autos).store;
    const nextStash = sanitizeStore(stash).store;
    if (!this.plat.setStorage(BACKUP_KEY, JSON.stringify(this.exportBundle()))) return false;
    const okAutos = this.write(AUTO_KEY, nextAutos);
    const okStash = this.write(STASH_KEY, nextStash);
    return okAutos && okStash;
  }

  /* ----------------------------------------------------------------- 读写 */

  /**
   * 解析失败/形状非法时:先把原始串隔离到 .broken 键(数据不丢,可人工找回),
   * 再当空库处理 —— 但不删原键。
   */
  private read(key: string): Store {
    const raw = this.plat.getStorage(key);
    if (!raw) return {};
    try {
      const parsed: unknown = JSON.parse(raw);
      const { store, dropped } = sanitizeStore(parsed);
      if (dropped) this.quarantine(key, raw);
      return store;
    } catch {
      this.quarantine(key, raw);
      return {};
    }
  }

  private write(key: string, store: Store): boolean {
    if (!this.plat.setStorage(key, JSON.stringify(store))) return false;
    for (const cb of [...this.mutListeners]) {
      try {
        cb();
      } catch {
        /* 同步模块的异常不许砸存档 */
      }
    }
    return true;
  }

  private quarantine(key: string, raw: string): void {
    this.plat.setStorage(`${key}.broken`, raw);
  }
}

/** 整包结构:直接包两个 store,版本字段由云端信封管 */
export interface SavesBundle {
  autos: Store;
  stash: Store;
}

/** 人类可读的时间 */
export function fmtTime(at: number): string {
  const d = new Date(at);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(
    d.getHours(),
  )}:${p(d.getMinutes())}`;
}

export const DIFF_LABEL: Record<DiffKey, string> = {
  story: '剧情',
  normal: '普通',
  hardcore: '硬核',
};
