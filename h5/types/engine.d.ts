/**
 * `@engine` 的环境模块声明。
 *
 * Vite alias 把 `@engine` 指向 `../prot/engine.js`(UMD,零 require)。
 * 刻意**不**在 tsconfig.paths 里给 `@engine` 映射:那会让 TS 去推断那份 1600 行 JS
 * (退化成 any 且拖慢检查)。类型全部来自这里。
 *
 * 注意:本文件不能出现顶层 import/export,否则它会变成「模块」而非「全局脚本」,
 * declare module 就会退化成模块增补而失效(types/data.d.ts 同理)。
 */
declare module '@engine' {
  import type { EngineModule } from './scenario';
  const engine: EngineModule;
  export default engine;
}