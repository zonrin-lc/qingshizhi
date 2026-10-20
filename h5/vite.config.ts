import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readFileSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');

/**
 * 版本号取 prot/package.json 的 version,不另立一份。
 *
 * prot/test-ui-contract.js 第 5 段已经在盯
 * prot/ui-core.js 的 APP_VERSION 必须等于 prot/package.json version。
 * H5 再抄一份就会成为第三个可能漂移的地方 —— 那个契约上次就已经漂过了。
 * 构建时读一次注入,运行时没有第二次真相。
 */
const appVersion: string = JSON.parse(
  readFileSync(resolve(repoRoot, 'prot/package.json'), 'utf8'),
).version;

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
  // 相对 base:TapTap H5 包解压后挂在子路径下(…/qingshizhi/index.html),
  // 默认的 '/assets/…' 绝对路径会全部 404 → 白屏(2026-10-20 打包实测)。
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  resolve: {
    alias: {
      '@engine': resolve(repoRoot, 'prot/engine.js'),
      '@data': resolve(repoRoot, 'prot/lua-data'),
    },
  },
  server: {
    // alias 指向 h5/ 之外,需显式放行 fs 读取
    fs: { allow: [repoRoot] },
    // 端口被占就直接报错,不静默换端口(5173→5174 漂移会让人对着旧服务器调试)
    strictPort: true,
  },
  optimizeDeps: {
    // engine.js 是 UMD(零 ESM 导出)。生产构建由 commonjsOptions 包一层,
    // 但 dev 模式对 alias 出的裸文件不做 CJS 转换,`import engine from '@engine'`
    // 会因没有 default 导出而整页白屏。强制预打包,让 dev 与 build 行为一致。
    include: ['@engine'],
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