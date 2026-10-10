/* prot/paths.js —— 对拍工具的路径与依赖解析(单一事实源)
 *
 * 背景:本目录下的脚本原先把根目录写死成 /workspace(Linux 开发机路径)。
 * 换机器 / 换平台即全部失效,而 p2-replay 是唯一的逻辑回归防线。
 * 现改为从 __dirname 反推项目根,任何平台都能跑。
 */
const path = require('path');
const fs = require('fs');

/** 项目根(= prot/ 的上一级) */
const ROOT = path.resolve(__dirname, '..');

const P = {
  ROOT,
  PROT: __dirname,
  SCRIPTS: path.join(ROOT, 'scripts'),
  QINGSHI: path.join(ROOT, 'scripts', 'qingshi'),
  UI_DIR: path.join(ROOT, 'scripts', 'qingshi', 'ui'),
  DATA_DIR: path.join(ROOT, 'scripts', 'qingshi', 'data'),
  PROT_LUA: path.join(ROOT, 'prot', 'lua'),
  PROT_LUA_DATA: path.join(ROOT, 'prot', 'lua-data'),
  PROT_LUA_DATA_OUT: path.join(ROOT, 'prot', 'lua', 'data'),
  EMMY: path.join(ROOT, '.emmylua'),
};

/** 相对项目根的展示路径(报错信息里更短也更可读) */
P.rel = (p) => path.relative(ROOT, p);

/* wasmoon 是随仓库提交的依赖(.lua-runner/node_modules),不是全局 npm 包,
 * 所以不能直接 require('wasmoon')(node_modules 解析链够不到)。
 * 按候选位依次探测,可用 QINGSHI_WASMOON 环境变量覆盖。 */
function loadWasmoon() {
  const candidates = [
    process.env.QINGSHI_WASMOON,
    path.join(ROOT, '.lua-runner', 'node_modules', 'wasmoon'),
    path.join(__dirname, 'node_modules', 'wasmoon'),
  ].filter(Boolean);

  const tried = [];
  for (const c of candidates) {
    try { return require(c); }
    catch (e) { tried.push(c + '  (' + String(e.message).split('\n')[0] + ')'); }
  }
  throw new Error(
    '找不到 wasmoon。已尝试:\n  ' + tried.join('\n  ') +
    '\n请确认 .lua-runner/node_modules/wasmoon 存在,或用 QINGSHI_WASMOON 指定其路径。');
}

/** 读取仓库内文件;不存在时给出明确报错而不是让下游抛 ENOENT */
function readRepo(relPath) {
  const abs = path.isAbsolute(relPath) ? relPath : path.join(ROOT, relPath);
  if (!fs.existsSync(abs)) throw new Error('找不到文件: ' + P.rel(abs));
  return fs.readFileSync(abs, 'utf8');
}

module.exports = { P, ROOT, loadWasmoon, readRepo };