/**
 * 数据管线:按需加载 prot/lua-data/*.json,不拷贝、不转译。
 *
 * 单一真源:这五份 JSON 与 prot/lua/data/*.lua 由 p1-verify 保证逐字段等价,
 * 而 p1-verify 已被挂到 dev/build 的前置门禁(h5/scripts/verify-data.mjs)。
 * 也就是说「H5 用的数据 == prot 测试守护的数据」是构建期强制的,不是约定。
 *
 * ⚠ 为什么拆成「静态轻量表 + 动态 import」:
 * 五份剧本 JSON 合计 gzip 280.9 KB,而整个首屏 JS 才 297.4 KB(gzip)——
 * 数据占了 9 成多。五本全打进首屏包,选荆轲也得先下李斯和韩信的全文。
 *
 * 所以这里只静态留一张几十字节的轻量表(选择页要显示 id/名字/副题/章数),
 * 真正的剧本数据在「入局那一刻」才按需 import。
 *
 * 轻量表是手抄的,有漂移风险,所以 tests/scenarios.cjs 会断言它与 JSON 一致。
 */
import type { DiffKey, ScenarioData } from '../../types/scenario';
// 轻量表放在独立 JSON 里,是为了让 tests/scenarios.cjs 能直接读同一份文件做漂移校验;
// 写在 .ts 里就只能靠正则从源码里刨,那样断言本身也不可靠了。
import metaList from './scenario-meta.json';

export interface ScenarioMeta {
  key: string;
  /** 与 JSON 的 SCENARIO.id 一致 */
  id: string;
  name: string;
  sub: string;
  /** 契约下属冥河的剧本不可存档(见 game/saves.ts) */
  noSave: boolean;
  /** 章数,用于选剧本页的规模提示 */
  chapters: number;
}

export type ScenarioEntry = ScenarioMeta;

/** 展示顺序,与 Lua 版 home.lua 的 ORDER 保持一致 */
export const SCENARIOS: readonly ScenarioMeta[] = metaList as ScenarioMeta[];

export const DIFFICULTIES: readonly DiffKey[] = ['story', 'normal', 'hardcore'] as const;

export function getScenario(key: string): ScenarioMeta | undefined {
  return SCENARIOS.find((s) => s.key === key);
}

/** 惰性加载器;key 与 SCENARIOS 里的 key 一致 */
const loaders: Record<string, () => Promise<{ default: ScenarioData }>> = {
  lisi: () => import('@data/lisi.json').then((m) => ({ default: m.default as unknown as ScenarioData })),
  jingke: () => import('@data/jingke.json').then((m) => ({ default: m.default as unknown as ScenarioData })),
  hanxin: () => import('@data/hanxin.json').then((m) => ({ default: m.default as unknown as ScenarioData })),
  xiangyu: () => import('@data/xiangyu.json').then((m) => ({ default: m.default as unknown as ScenarioData })),
  chensheng: () => import('@data/chensheng.json').then((m) => ({ default: m.default as unknown as ScenarioData })),
};

/** 已加载的剧本数据缓存 —— 同局内重复取不该再走一次 import */
const cache = new Map<string, ScenarioData>();

/**
 * 取剧本全文。首次调用会真的下载该剧本的 JSON 分片。
 * 选荆轲就只下荆轲,不会捎带李斯和韩信。
 */
export async function loadScenario(key: string): Promise<ScenarioData | null> {
  const hit = cache.get(key);
  if (hit) return hit;
  const loader = loaders[key];
  if (!loader) return null;
  const m = await loader();
  cache.set(key, m.default);
  return m.default;
}

/** 预热:选择页上若已有明确目标,可提前拉取(入局时就不用等) */
export function prefetch(key: string): void {
  void loadScenario(key);
}
