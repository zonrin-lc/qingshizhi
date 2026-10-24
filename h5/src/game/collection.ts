/**
 * 跨局收藏:已解锁的成就、词条与结局达成记录,按剧本跨局累计。
 *
 * 对齐封存 Lua 版:home.lua newGame 开局把 col_v1_<scen> 灌进 g.gloss/g.ach,
 * game.lua 在 showGloss(新词条)与 renderEnding(结局)两处写回。
 * 没有这层,成就/图鉴只活在当局内存里,关页面就全丢。
 *
 * 键名带 v1 与 Lua 的 col_v1_ 同代;前缀沿用本项目 localStorage 习惯(qingshi.*)。
 * 结局达成记录(endings)是 H5 新增字段:旧档没有它,读取时按空表收窄,不拒收整份。
 */
import type { Game, ScenarioData } from '../../types/scenario';
import { SCENARIOS } from '../data/scenarios';

const key = (scenId: string): string => `qingshi.col.v1.${scenId}`;
/** 副副本键(2026-10-24 加):主键被容器清理/写坏时还能捞回来 */
const bakKey = (scenId: string): string => `qingshi.col.bak.v1.${scenId}`;

/** 单条结局达成记录。键为 'E1' 或 'E1:wuyan'(变体) */
export interface EndingRec {
  /** 结局名(变体取变体名) */
  n: string;
  /** 印:循史/苟活/稳健/逆天/败局 */
  s: string;
  /** 达成次数 */
  c: number;
  /** 最佳总分 */
  b: number;
  /** 最佳评级(十级制:甲上/甲/甲下/乙上/乙/乙下/丙上/丙/丙下/丁;旧档可能是 S/A/B/C/D) */
  g: string;
}

export interface Collection {
  /** 载荷版本(2026-10-21 加):老档没有这个字段,读取时按 v1 处理 */
  v?: number;
  gloss: string[];
  ach: string[];
  endings: Record<string, EndingRec>;
}

const empty = (): Collection => ({ v: 1, gloss: [], ach: [], endings: {} });

/** 解析一份收藏载荷;结构不对(sanitize 后为空壳)返回 null */
function parseCollection(raw: string | null): Collection | null {
  if (!raw) return null;
  try {
    const o: unknown = JSON.parse(raw);
    if (!o || typeof o !== 'object') return null;
    const c = o as { gloss?: unknown; ach?: unknown; endings?: unknown };
    if (!Array.isArray(c.gloss) || !Array.isArray(c.ach)) return null;
    // 脏档收窄:只收字符串项,其余丢弃而不是整份拒收(词条/成就丢了不阻断游戏)
    const col = empty();
    // 版本:老档没有 v 字段,按 v1 读;将来改结构时在这里迁移
    col.v = typeof (o as { v?: unknown }).v === 'number' ? (o as { v: number }).v : 1;
    col.gloss = c.gloss.filter((x): x is string => typeof x === 'string');
    col.ach = c.ach.filter((x): x is string => typeof x === 'string');
    if (c.endings && typeof c.endings === 'object') {
      for (const [k, v] of Object.entries(c.endings as Record<string, unknown>)) {
        const r = v as Partial<EndingRec> | null;
        if (!r || typeof r.n !== 'string' || typeof r.c !== 'number' || r.c < 1) continue;
        col.endings[k] = {
          n: r.n,
          s: typeof r.s === 'string' ? r.s : '',
          c: r.c,
          b: typeof r.b === 'number' ? r.b : 0,
          g: typeof r.g === 'string' ? normGrade(r.g) : '丁',
        };
      }
    }
    return col;
  } catch {
    return null;
  }
}

/** 两份收藏取并集(2026-10-24 加):词条/成就并集,结局取次数多、最佳分高、评级高者。
 *  双副本与云包合并都走这里 —— 任何一路数据都不许把另一路「减掉」。 */
function mergeCollections(a: Collection, b: Collection): Collection {
  const out = empty();
  out.v = Math.max(a.v ?? 1, b.v ?? 1);
  out.gloss = [...new Set([...a.gloss, ...b.gloss])];
  out.ach = [...new Set([...a.ach, ...b.ach])];
  out.endings = { ...a.endings };
  for (const [k, r] of Object.entries(b.endings)) {
    const prev = out.endings[k];
    if (!prev) { out.endings[k] = r; continue; }
    out.endings[k] = {
      n: r.c > prev.c ? r.n : prev.n,
      s: prev.s || r.s,
      c: Math.max(prev.c, r.c),
      b: Math.max(prev.b, r.b),
      g: (GRADE_RANK[r.g] ?? 0) > (GRADE_RANK[prev.g] ?? 0) ? r.g : prev.g,
    };
  }
  return out;
}

export function loadCollection(scenId: string): Collection | null {
  try {
    const main = parseCollection(localStorage.getItem(key(scenId)));
    const bak = parseCollection(localStorage.getItem(bakKey(scenId)));
    // 双副本互校(2026-10-24):主键在、副键也在 → 并集(防止主键被写坏一半);
    // 只在一处有 → 用那一处。两处都没有 → null(全新存档)
    if (main && bak) return mergeCollections(main, bak);
    return main ?? bak;
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

/** 双写:主键 + 副副本(2026-10-24)。写失败不再全静默 —— 至少留一条 warn,
 *  否则「配额满导致图鉴永远不落盘」在线上完全不可见(论坛丢档就是这么来的)。 */
function write(scenId: string, col: Collection): boolean {
  const raw = JSON.stringify(col);
  let ok = false;
  try {
    localStorage.setItem(key(scenId), raw);
    ok = true;
  } catch (e) {
    console.warn('[青史志] 收藏写入失败(主键):', e instanceof Error ? e.message : e);
  }
  try {
    localStorage.setItem(bakKey(scenId), raw);
    ok = true;
  } catch (e) {
    if (!ok) console.warn('[青史志] 收藏写入失败(副副本):', e instanceof Error ? e.message : e);
  }
  return ok;
}

/** 写回(合并式,2026-10-24 改为并集):历史 ∪ 本局。
 *  原实现是 `[...game.gloss]` 覆盖写 —— 只要某一局的历史注入缺失
 *  (读档载荷自带老/空的 gloss、注入时机错位),一次落盘就把历史成就冲成当局子集。 */
export function saveCollection(game: Game): void {
  const scenId = game.d.SCENARIO.id;
  const prev = loadCollection(scenId) ?? empty();
  const next = mergeCollections(prev, {
    v: 1,
    gloss: [...game.gloss],
    ach: [...game.ach],
    endings: {},
  });
  write(scenId, next);
}

/* 评级高低序(v2.1.0 十级制,对齐 engine.js 结局评级);
 * S/A/B/C/D 是旧档残留值,留着只为历史 localStorage 记录比大小不塌成 0。 */
const GRADE_RANK: Record<string, number> = {
  甲上: 9, 甲: 8, 甲下: 7, 乙上: 6, 乙: 5, 乙下: 4, 丙上: 3, 丙: 2, 丙下: 1, 丁: 0,
  S: 9, A: 6, B: 4, C: 2, D: 0,
};

/** 旧档字母评级 → 十级制(按 GRADE_RANK 档位等价迁移;展示层只认十级) */
const LEGACY_GRADE: Record<string, string> = { S: '甲上', A: '乙上', B: '乙下', C: '丙', D: '丁' };
const normGrade = (g: string): string => LEGACY_GRADE[g] ?? g;

/** 剧本结局总数(本体 + 变体各算一种) */
export function countEndings(endings: ScenarioData['ENDINGS']): number {
  return Object.values(endings).reduce((n, e) => n + 1 + Object.keys(e.variants ?? {}).length, 0);
}

/**
 * 结局落地时记一笔(次数 +1、刷新最佳分/评级),并连同本局 gloss/ach 一起写回。
 * 返回展示用统计:这条结局的累计次数、该剧本已达成/总数。
 */
export function recordEnding(game: Game): { rec: EndingRec; reached: number; total: number } | null {
  const e = game.ending;
  if (!e) return null;
  const scenId = game.d.SCENARIO.id;
  const col = loadCollection(scenId) ?? empty();
  const k = e.variant ? `${e.id}:${e.variant}` : e.id;
  const prev = col.endings[k];
  const rec: EndingRec = {
    n: e.name,
    s: e.seal,
    c: (prev?.c ?? 0) + 1,
    b: Math.max(prev?.b ?? 0, e.total),
    g: (GRADE_RANK[e.grade] ?? 0) >= (GRADE_RANK[prev?.g ?? '丁'] ?? 0) ? e.grade : normGrade(prev?.g ?? e.grade),
  };
  col.endings[k] = rec;
  // 词条/成就同样并集写回(2026-10-24):结局落地这一笔不能顺带把历史成就缩水
  col.gloss = [...new Set([...col.gloss, ...game.gloss])];
  col.ach = [...new Set([...col.ach, ...game.ach])];
  write(scenId, col);
  return { rec, reached: Object.keys(col.endings).length, total: countEndings(game.d.ENDINGS) };
}

/* ---------- 云存档打包(2026-10-24 加) ----------
 * 云存档原先只包 autos/stash,图鉴(结局/成就/词条)完全不在包里 ——
 * 玩家清缓存、换设备、重装后,云档还在、图鉴全空,下一剧本还会被重新锁上。
 * 现在把各剧本的收藏一起塞进云包;导入走并集合并,旧云包不会把本机新纪录抹掉。 */

/** 各剧本收藏整包导出(键 = 剧本 key) */
export function exportCollectionBundle(): Record<string, Collection> {
  const out: Record<string, Collection> = {};
  for (const s of SCENARIOS) {
    const c = loadCollection(s.key);
    if (c && (c.gloss.length || c.ach.length || Object.keys(c.endings).length)) out[s.key] = c;
  }
  return out;
}

/** 云包导入:逐剧本与本地并集合并后落盘;返回是否全部写入成功 */
export function importCollectionBundle(b: unknown): boolean {
  if (!b || typeof b !== 'object' || Array.isArray(b)) return false;
  let ok = true;
  for (const [scenId, v] of Object.entries(b as Record<string, unknown>)) {
    if (!SCENARIOS.some((s) => s.key === scenId)) continue; // 不认识的剧本直接忽略
    const incoming = parseCollection(JSON.stringify(v));
    if (!incoming) continue;
    const local = loadCollection(scenId);
    const merged = local ? mergeCollections(local, incoming) : incoming;
    if (!write(scenId, merged)) ok = false;
  }
  return ok;
}

/** 图鉴页用:取某剧本的达成记录(无存档则为空表) */
export function endingRecords(scenId: string): Record<string, EndingRec> {
  return loadCollection(scenId)?.endings ?? {};
}

/* ---------- 剧本开放条件(2026-10-20 拍板) ----------
 * 李斯无限制;其余剧本需「上一剧本达成乙级评分 + 解锁 3 个不同结局」。
 * 数据源就是上面的跨局收藏:结局键去重个数 + 最佳评级是否 ≥ 乙。 */

/** 乙级及以上的评级档位线(GRADE_RANK:乙=5,甲下=7…都算达标) */
const GRADE_LINE_YI = 5;
/** 开放下一剧本所需的不同结局数 */
export const UNLOCK_ENDINGS_NEEDED = 3;

/** 单剧本的开卷进度:不同结局数 / 最佳评级是否达乙 */
export function unlockProgress(scenKey: string): { endings: number; gradeOk: boolean } {
  const col = loadCollection(scenKey);
  const endings = col ? Object.keys(col.endings).length : 0;
  const gradeOk = col
    ? Object.values(col.endings).some((r) => (GRADE_RANK[r.g] ?? 0) >= GRADE_LINE_YI)
    : false;
  return { endings, gradeOk };
}

/** 剧本是否开放:首剧本(lisi)无限制,其余按上一剧本进度判定 */
export function isScenarioUnlocked(scenKey: string): boolean {
  const idx = SCENARIOS.findIndex((s) => s.key === scenKey);
  if (idx <= 0) return true;
  const p = unlockProgress(SCENARIOS[idx - 1]!.key);
  return p.gradeOk && p.endings >= UNLOCK_ENDINGS_NEEDED;
}

/** 未开放的原因文案(toast 用);已开放返回 null */
export function lockReason(scenKey: string): string | null {
  if (isScenarioUnlocked(scenKey)) return null;
  const idx = SCENARIOS.findIndex((s) => s.key === scenKey);
  const prev = SCENARIOS[idx - 1]!;
  const p = unlockProgress(prev.key);
  return `「${prev.name}」尚未开卷：需达成乙级评分并解锁 ${UNLOCK_ENDINGS_NEEDED} 个不同结局`
    + `（当前结局 ${p.endings}/${UNLOCK_ENDINGS_NEEDED} · 最佳评级${p.gradeOk ? '已' : '未'}达乙）`;
}
