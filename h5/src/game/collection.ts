/**
 * 跨局收藏:已解锁的成就与词条,按剧本跨局累计。
 *
 * 对齐封存 Lua 版:home.lua newGame 开局把 col_v1_<scen> 灌进 g.gloss/g.ach,
 * game.lua 在 showGloss(新词条)与 renderEnding(结局)两处写回。
 * 没有这层,成就/图鉴只活在当局内存里,关页面就全丢。
 *
 * 键名带 v1 与 Lua 的 col_v1_ 同代;前缀沿用本项目 localStorage 习惯(qingshi.*)。
 */
import type { Game } from '../../types/scenario';

const key = (scenId: string): string => `qingshi.col.v1.${scenId}`;

export interface Collection {
  gloss: string[];
  ach: string[];
}

export function loadCollection(scenId: string): Collection | null {
  try {
    const raw = localStorage.getItem(key(scenId));
    const o: unknown = raw ? JSON.parse(raw) : null;
    if (!o || typeof o !== 'object') return null;
    const c = o as { gloss?: unknown; ach?: unknown };
    if (!Array.isArray(c.gloss) || !Array.isArray(c.ach)) return null;
    // 脏档收窄:只收字符串项,其余丢弃而不是整份拒收(词条/成就丢了不阻断游戏)
    return {
      gloss: c.gloss.filter((x): x is string => typeof x === 'string'),
      ach: c.ach.filter((x): x is string => typeof x === 'string'),
    };
  } catch {
    return null;
  }
}

/** 开局灌入:新 Game 的 gloss/ach 是空表,把历史累计并进来(去重) */
export function injectCollection(game: Game): void {
  const col = loadCollection(game.d.SCENARIO.id);
  if (!col) return;
  for (const t of col.gloss) if (!game.gloss.includes(t)) game.gloss.push(t);
  for (const a of col.ach) if (!game.ach.includes(a)) game.ach.push(a);
}

/** 写回。localStorage 不可用时安静跳过 —— 收藏丢失不该阻断游戏 */
export function saveCollection(game: Game): void {
  try {
    localStorage.setItem(key(game.d.SCENARIO.id), JSON.stringify({ gloss: game.gloss, ach: game.ach }));
  } catch {
    /* 隐私模式等:本次会话内仍有效 */
  }
}
