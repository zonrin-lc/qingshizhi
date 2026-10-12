/**
 * 数据管线:直接从 prot/lua-data/*.json 引入,不拷贝、不转译。
 *
 * 单一真源:这五份 JSON 与 prot/lua/data/*.lua 由 p1-verify 保证逐字段等价,
 * 而 p1-verify 已被挂到 dev/build 的前置门禁(h5/scripts/verify-data.mjs)。
 * 也就是说「H5 用的数据 == prot/ 测试守护的数据」是构建期强制的,不是约定。
 */
import type { DiffKey, ScenarioData } from '../../types/scenario';

import lisi from '@data/lisi.json';
import jingke from '@data/jingke.json';
import hanxin from '@data/hanxin.json';
import xiangyu from '@data/xiangyu.json';
import chensheng from '@data/chensheng.json';

export interface ScenarioEntry {
  key: string;
  name: string;
  /** 章数,用于选剧本页的规模提示 */
  chapters: number;
  data: ScenarioData;
}

/** 展示顺序,与 Lua 版 home.lua 的 ORDER 保持一致 */
export const SCENARIOS: readonly ScenarioEntry[] = [
  { key: 'lisi', name: '李斯 · 仓鼠之局', chapters: lisi.CHAPTERS.length, data: lisi as ScenarioData },
  { key: 'jingke', name: '荆轲 · 图穷之局', chapters: jingke.CHAPTERS.length, data: jingke as ScenarioData },
  { key: 'hanxin', name: '韩信 · 兵仙之局', chapters: hanxin.CHAPTERS.length, data: hanxin as ScenarioData },
  { key: 'xiangyu', name: '项羽 · 霸王之局', chapters: xiangyu.CHAPTERS.length, data: xiangyu as ScenarioData },
  { key: 'chensheng', name: '陈胜 · 首义之局', chapters: chensheng.CHAPTERS.length, data: chensheng as ScenarioData },
] as const;

export const DIFFICULTIES: readonly DiffKey[] = ['story', 'normal', 'hardcore'] as const;

export function getScenario(key: string): ScenarioEntry | undefined {
  return SCENARIOS.find((s) => s.key === key);
}