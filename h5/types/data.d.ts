/**
 * `@data/<剧本>.json` 的环境模块声明。
 *
 * Vite alias 把 `@data` 指向 `../prot/lua-data`。这些 JSON 单文件 120–173KB,
 * 若让 TS 靠 resolveJsonModule 去推断,会产生巨大的字面量类型并拖慢检查,
 * 因此逐个显式声明为 ScenarioData。
 *
 * 五个剧本一一对应 prot/lua-data/ 下的同名文件(目录名里的 "lua" 是历史遗留:
 * 数据本身是 JSON,是现役真源);prot/verify-data-js.js 负责保证它们与
 * prot/*-data.js 逐字段等价。
 *
 * 与 engine.d.ts 同理:本文件不能有顶层 import/export,否则 declare module 失效。
 */
declare module '@data/lisi.json' {
  import type { ScenarioData } from './scenario';
  const d: ScenarioData;
  export default d;
}
declare module '@data/jingke.json' {
  import type { ScenarioData } from './scenario';
  const d: ScenarioData;
  export default d;
}
declare module '@data/hanxin.json' {
  import type { ScenarioData } from './scenario';
  const d: ScenarioData;
  export default d;
}
declare module '@data/xiangyu.json' {
  import type { ScenarioData } from './scenario';
  const d: ScenarioData;
  export default d;
}
declare module '@data/chensheng.json' {
  import type { ScenarioData } from './scenario';
  const d: ScenarioData;
  export default d;
}