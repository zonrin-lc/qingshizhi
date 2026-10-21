/* prot/paths.js —— 仓库路径与依赖解析(单一事实源)
 *
 * 2026-10-21:Lua 引擎版下线后,这里原本的 wasmoon 装载与 scripts/、prot/lua/
 * 相关路径已随之移除(用到它们的工具都封存在 封存/lua-2026-10-21/ 下);
 * 留在本文件的是现役脚本还要用的那几条路径。
 */
const path = require('path');
const fs = require('fs');

/** 项目根(= prot/ 的上一级) */
const ROOT = path.resolve(__dirname, '..');

const P = {
  ROOT,
  PROT: __dirname,
  /** 现役剧本数据真源(目录名里的 "lua" 是历史遗留:数据本身是 JSON) */
  PROT_LUA_DATA: path.join(ROOT, 'prot', 'lua-data'),
};

/** 相对项目根的展示路径(报错信息里更短也更可读) */
P.rel = (p) => path.relative(ROOT, p);

/** 读取仓库内文件;不存在时给出明确报错而不是让下游抛 ENOENT */
function readRepo(relPath) {
  const abs = path.isAbsolute(relPath) ? relPath : path.join(ROOT, relPath);
  if (!fs.existsSync(abs)) throw new Error('找不到文件: ' + P.rel(abs));
  return fs.readFileSync(abs, 'utf8');
}

module.exports = { P, ROOT, readRepo };
