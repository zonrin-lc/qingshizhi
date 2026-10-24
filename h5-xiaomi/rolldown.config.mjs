/**
 * 快游戏(rpk)打包配置:把整条移植线打成单文件 IIFE main.js。
 *
 * 为什么用 rolldown 而不是 vite build:rpk 的入口必须是单个 main.js,
 * 不能再按 chunk 拆分;素材由 pack-rpk.mjs 单独拷进 rpk/。
 */
const repoRoot = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

export default {
  input: 'src/main.ts',
  platform: 'browser',
  resolve: {
    alias: {
      '@data': `${repoRoot}prot/lua-data`,
      '@engine': `${repoRoot}prot/engine.js`,
    },
  },
  output: {
    file: 'rpk/main.js',
    format: 'iife',
    name: 'QingshiMini',
  },
};
