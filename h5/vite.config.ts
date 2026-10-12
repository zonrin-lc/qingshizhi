import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');

/**
 * 引擎复用:alias 精确指向 prot/ 下的规则真源,不做拷贝。
 * prot/ 的测试因此继续守护同一份代码——H5 与 Node 跑的是同一个 engine.js。
 *
 * 只 alias 这两个,而不是整个 prot/ 目录:prot/ 里还有 balance-sim.js、
 * path-stats.js 等依赖 fs/child_process 的工具脚本,它们只能跑在 Node,
 * 整目录 alias 会把它们拖进浏览器依赖图。
 *
 * engine.js 是 UMD(零 require),Vite 8(rolldown)内置 CommonJS 处理,
 * 无需 @rollup/plugin-commonjs——加了反而会触发 preferBuiltinFeature 警告。
 */
export default defineConfig({
  resolve: {
    alias: {
      '@engine': resolve(repoRoot, 'prot/engine.js'),
      '@data': resolve(repoRoot, 'prot/lua-data'),
    },
  },
  server: {
    // alias 指向 h5/ 之外,需显式放行 fs 读取
    fs: { allow: [repoRoot] },
  },
  build: {
    target: 'es2020',
    outDir: 'dist',
    sourcemap: true,
    // engine.js 走内置 CJS 处理;数据是 JSON,不需要额外处理
    commonjsOptions: { include: [/prot[\\/]engine\.js$/] },
    // 当前一次性打进 5 份剧本数据(约 700KB)。P6 做按需加载时会降下来,
    // 届时可移除本项。
    chunkSizeWarningLimit: 1024,
  },
});