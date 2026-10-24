/**
 * 剧本全文装载:五本 JSON 静态入口。
 *
 * 为什么不照抄 h5 的「按需 import」:rpk 的入口必须是单个 main.js,
 * 动态 import 会拆出 chunk,快游戏侧没有对应的加载协议。所以这里一次性
 * 静态引入,全部随主包走(体积账见 scripts/prepare-assets.mjs 的说明)。
 * 分包治理落地后,这里会改成「从分包或 assets/data 读取」的唯一改动点。
 */

import type { ScenarioData } from '../../types/scenario';
import lisiJson from '@data/lisi.json';
import jingkeJson from '@data/jingke.json';
import hanxinJson from '@data/hanxin.json';
import xiangyuJson from '@data/xiangyu.json';
import chenshengJson from '@data/chensheng.json';

const DATA: Record<string, ScenarioData> = {
  lisi: lisiJson as unknown as ScenarioData,
  jingke: jingkeJson as unknown as ScenarioData,
  hanxin: hanxinJson as unknown as ScenarioData,
  xiangyu: xiangyuJson as unknown as ScenarioData,
  chensheng: chenshengJson as unknown as ScenarioData,
};

export function scenarioData(key: string): ScenarioData | null {
  return DATA[key] ?? null;
}
