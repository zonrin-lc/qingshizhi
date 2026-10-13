/**
 * 存档系统:引擎 exportSave/importSave ↔ localStorage。
 *
 * 引擎侧的三条硬约束(见 prot/engine.js exportSave),UI 必须如实反映,
 * 不能假装能存:
 *
 * 1. **只存章首快照**。exportSave 导出的是 this.snapshot(进章时打的章首快照),
 *    不是当前任意时刻的状态。所以"存档"实际语义是「回到本章开头」,
 *    界面文案要说成"回到第 N 章开头",说"保存进度"会骗玩家。
 *
 * 2. **硬核难度不可存**。diff.backtrack === 0 时 exportSave 直接返回 null
 *    (硬核的规则就是不许回退)。这不是 bug,是难度定义。
 *
 * 3. **无章首快照时不可存**(刚开局还没进过任何一章时)。
 *
 * 另外场景级开关:SCENARIO.noSave 的剧本(契约下属"冥河")永不可存。
 */
import type { DiffKey, Game } from '../../types/scenario';

const KEY = 'qingshi.saves.v1';
/** 档位数量:与存档页选项卡版式对齐 */
export const SLOTS = 6;

export interface SaveMeta {
  at: number;
  scenKey: string;
  scenName: string;
  diffKey: DiffKey;
  /** 存档对应第几章(0-based);读档会回到这一章的开头 */
  chapterIdx: number;
  chapterTitle: string;
  /** 本章还能回溯几次 —— 读档后仍然有效,所以要存下来给玩家看 */
  backtracksLeft: number;
  age: number | null;
}

export interface Slot extends SaveMeta {
  payload: unknown;
}

/**
 * 自动存档。
 *
 * 与玩家手动槽位分开存放(键 AUTO_KEY),理由:
 * - 手动槽是玩家挑的,退出时随手覆盖等于替玩家做决定
 * - 自动档有自己的生命周期(每次退出覆写),混在一起会互相打架
 * - 选择页要单独把「继续上局」显示出来,不能混在 6 个格子里让人找
 */
const AUTO_KEY = 'auto';

type Store = Record<string, Slot | null>;

/** localStorage 可能不可用(隐私模式 / 被禁用),全部包 try */
function read(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const o: unknown = JSON.parse(raw);
    return o && typeof o === 'object' ? (o as Store) : {};
  } catch {
    return {};
  }
}

function write(store: Store): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
    return true;
  } catch {
    // 配额满或隐私模式:存档失败必须让 UI 知道,不能静默
    return false;
  }
}

/** 某个对局当前能不能存档,以及不能的理由 */
export function whyCannotSave(game: Game): string | null {
  if (game.d.SCENARIO.noSave) return '此局契约下属冥河,不可存档';
  if (game.diff.backtrack === 0) return '硬核难度不许回退,不可存档';
  if (!game.snapshot) return '尚未进入任何一章,暂无可存档的章首';
  return null;
}

/** 读取全部档位(按槽位序,空档为 null) */
export function listSlots(): (Slot | null)[] {
  const store = read();
  const out: (Slot | null)[] = [];
  for (let i = 0; i < SLOTS; i += 1) {
    const k = String(i);
    const s = store[k];
    out.push(s && typeof s === 'object' && 'payload' in s ? s : null);
  }
  return out;
}

export function getSlot(i: number): Slot | null {
  return listSlots()[i] ?? null;
}

/** 覆盖式写入某个槽位。返回是否成功。 */
export function save(game: Game, scenKey: string, scenName: string, slot: number): { ok: boolean; reason: string } {
  if (slot < 0 || slot >= SLOTS) return { ok: false, reason: '槽位不存在' };
  const ch = game.chapter();
  const payload = game.exportSave();
  if (!payload) {
    return { ok: false, reason: '当前对局不可存档(硬核不许回退 / 尚无章首快照)' };
  }
  const store = read();
  store[String(slot)] = {
    at: Date.now(),
    scenKey,
    scenName,
    diffKey: game.diffKey,
    chapterIdx: game.chapterIdx,
    chapterTitle: ch?.title ?? `第 ${game.chapterIdx + 1} 章`,
    backtracksLeft: Math.max(0, game.diff.backtrack - game.backtracksThisChapter),
    age: game.age,
    payload,
  };
  return write(store)
    ? { ok: true, reason: `已存入槽位 ${slot + 1}` }
    : { ok: false, reason: '写入本地存储失败(可能处于隐私模式或空间已满)' };
}

export function removeSlot(slot: number): void {
  const store = read();
  delete store[String(slot)];
  write(store);
}

/** 直接把一份 payload 导入给定的 Game(自动档没有槽位号,走这条路) */
export function loadPayload(payload: unknown, game: Game): boolean {
  if (!payload) return false;
  return game.importSave(payload);
}

/**
 * 把某个槽位导入到给定的 Game。
 *
 * 注意:必须先 importSave 再判断成功,失败时游戏对象可能已被部分改写,
 * 调用方最好失败后重建 Game(见 ui/savepage 的用法)。
 */
export function load(slot: number, game: Game): boolean {
  const s = getSlot(slot);
  if (!s) return false;
  return game.importSave(s.payload);
}

/** 读取自动存档(没有则 null) */
export function getAuto(): Slot | null {
  const s = read()[AUTO_KEY];
  return s && typeof s === 'object' && 'payload' in s ? s : null;
}

export function clearAuto(): void {
  const store = read();
  delete store[AUTO_KEY];
  write(store);
}

/**
 * 退出对局时自动存档。
 *
 * 刻意不做的事:
 * - 不提示玩家。题目要的是「退出时自动存档」,弹窗打断退出反而是另一种设计。
 * - 不覆盖手动槽(见 AUTO_KEY 的说明)。
 * - 引擎说不可存时(硬核 / 无章首快照 / noSave 剧本)就安静跳过,
 *   不报错也不打断 —— 这是难度和剧本的既定规则,不是出错。
 *
 * @returns 是否真的存下了
 */
export function saveAuto(game: Game, scenKey: string, scenName: string): boolean {
  const ch = game.chapter();
  const payload = game.exportSave();
  if (!payload) return false;
  const store = read();
  store[AUTO_KEY] = {
    at: Date.now(),
    scenKey,
    scenName,
    diffKey: game.diffKey,
    chapterIdx: game.chapterIdx,
    chapterTitle: ch?.title ?? `第 ${game.chapterIdx + 1} 章`,
    backtracksLeft: Math.max(0, game.diff.backtrack - game.backtracksThisChapter),
    age: game.age,
    payload,
  };
  return write(store);
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
