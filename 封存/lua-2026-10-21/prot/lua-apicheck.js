/* 模块 API 检查:校验各 UI 模块对 theme(T.*)与自身(S./M.)的调用是否真实存在。
 * 背景:语法台(load)只编译不执行,抓不到 "index a nil value" 这类运行时错误
 * (如 home.lua 误写 Theme.VText 而模块别名为 T)。此检查做静态符号比对。 */
const fs = require('fs');
const path = require('path');
const { P } = require('./paths');

const DIR = P.UI_DIR;
const EMMY = P.EMMY;   // 引擎全局名的权威来源(自动派生,自维护)

function read(f) { return fs.readFileSync(path.join(DIR, f), 'utf8'); }

// 递归收集待查 .lua(跳过 data/ 生成的大文件)
function collect(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) { if (e.name !== 'data') collect(path.join(dir, e.name), out); }
    else if (e.name.endsWith('.lua')) out.push(path.join(dir, e.name));
  }
  return out;
}

/* ---------- 引擎全局名(从 .emmylua 类型定义派生) ----------
 * 例:`FileSystem = {}`、`function nvgRect(...)`、`NVG_ROUND = 1`
 * 这样检查无需手工维护白名单:引擎加接口,这里自动跟上。 */
const engineGlobals = new Set();
if (fs.existsSync(EMMY)) {
  for (const f of fs.readdirSync(EMMY)) {
    if (!f.endsWith('.d.lua')) continue;
    const src = fs.readFileSync(path.join(EMMY, f), 'utf8');
    for (const m of src.matchAll(/^(\w+)\s*=\s*\{/gm)) engineGlobals.add(m[1]);
    for (const m of src.matchAll(/^function\s+(\w+)\s*\(/gm)) engineGlobals.add(m[1]);
    for (const m of src.matchAll(/^(\w+)\s*=\s*-?\d/gm)) engineGlobals.add(m[1]);
  }
}
console.log('引擎全局名:', engineGlobals.size, '个(派生自 .emmylua)');

// theme.lua 导出的字段
const themeSrc = read('theme.lua');
const themeFields = new Set();
for (const m of themeSrc.matchAll(/^function Theme\.(\w+)/gm)) themeFields.add(m[1]);
for (const m of themeSrc.matchAll(/^Theme\.(\w+) =/gm)) themeFields.add(m[1]);
console.log('theme 导出:', [...themeFields].sort().join(', '));

let bad = 0;
for (const f of fs.readdirSync(DIR)) {
  if (!f.endsWith('.lua') || f === 'theme.lua') continue;
  const src = read(f);
  // 只检查形如 T.xxx( 的调用
  for (const m of src.matchAll(/\bT\.(\w+)\s*\(/g)) {
    if (!themeFields.has(m[1])) {
      const line = src.slice(0, m.index).split('\n').length;
      console.log(`FAIL ${f}:${line}  T.${m[1]} 不在 theme 导出中`);
      bad++;
    }
  }
  // 误用:把 theme 写成 Theme.
  for (const m of src.matchAll(/\bTheme\.(\w+)/g)) {
    const line = src.slice(0, m.index).split('\n').length;
    console.log(`FAIL ${f}:${line}  误用 Theme.${m[1]}(应为 T.)`);
    bad++;
  }
  // 优先级陷阱:`X + (cond) and A or B` —— and/or 优先级低于 +,会先算 X + boolean 而崩
  // 正确写法须整体加括号:`X + ((cond) and A or B)`
  for (const m of src.matchAll(/[+\-*\/]\s*\([^()]*[<>=~]=[^()]*\)\s+and\s/g)) {
    const line = src.slice(0, m.index).split('\n').length;
    console.log(`FAIL ${f}:${line}  优先级陷阱(算术 + 比较 and/or 未加括号):${m[0].trim().slice(0, 50)}`);
    bad++;
  }

  /* 裸全局名:被当「表 / 方法」用、却从未声明为 local,也不在引擎全局表里。
   * 背景:重构时「删了 local 声明、留了引用」—— 语法台只编译不执行,抓不到;
   * 真机一跑才炸 "attempt to index a nil value (global 'side')"。
   * 实现:先做「文件级声明收集」,再逐行「清洗(去注释/去字符串)后匹配」。 */
  const LUA_STD = new Set(['math', 'string', 'table', 'os', 'io', 'utf8', 'coroutine', 'package',
    'print', 'pairs', 'ipairs', 'type', 'tostring', 'tonumber', 'pcall', 'xpcall', 'select',
    'setmetatable', 'getmetatable', 'rawget', 'rawset', 'require', 'next', 'error', 'assert',
    'unpack', 'load', 'collectgarbage', 'arg', 'self', '_G', '_ENV',
    // Lua 关键字(会被 `name(` 这类模式误抓)
    'and', 'or', 'not', 'function', 'if', 'then', 'else', 'elseif', 'end', 'for', 'while',
    'do', 'return', 'local', 'nil', 'true', 'false', 'in', 'break', 'repeat', 'until', 'goto']);
  // 引擎注入的全局单例:.emmylua 里未必写成 `x = {}`,这里补齐
  const ENGINE_SINGLETONS = ['graphics', 'renderer', 'engine', 'ui', 'input', 'cache',
    'fileSystem', 'log', 'console', 'debugHud', 'network', 'audio', 'time', 'scene', 'resourceCache'];
  const declared = new Set([...LUA_STD, ...ENGINE_SINGLETONS]);
  // local a, b = ... / local function f(...) / local a(无赋值的裸声明)
  for (const m of src.matchAll(/\blocal\s+function\s+(\w+)/g)) declared.add(m[1]);
  for (const m of src.matchAll(/\blocal\s+([\w\s,]+?)\s*=/g)) {
    for (const n of m[1].split(',')) { const t = n.trim(); if (/^\w+$/.test(t)) declared.add(t); }
  }
  for (const m of src.matchAll(/\blocal\s+(\w+)\s*(?:$|--)/gm)) declared.add(m[1]);
  // for k, v in ... / for i = ... / 函数参数(含 : 方法的隐式 self)
  for (const m of src.matchAll(/\bfor\s+([\w\s,]+?)\s+(?:in|=)/g)) {
    for (const n of m[1].split(',')) { const t = n.trim(); if (/^\w+$/.test(t)) declared.add(t); }
  }
  for (const m of src.matchAll(/function\s+([\w.:]*)\s*\(([^)]*)\)/g)) {
    if (m[1].includes(':')) declared.add('self');
    for (const n of m[2].split(',')) { const t = n.trim(); if (/^\w+$/.test(t)) declared.add(t); }
  }

  const flagged = new Set();
  // 按 \r?\n 切分:仓库文件是 CRLF,用 split('\n') 会在行尾留 '\r',
  // 而下面的注释剥离正则是 /--.*$/ —— JS 里 '.' 不匹配 '\r',会导致整行注释剥不掉,
  // 注释中的标识符被误判成「裸全局名」,凭空产出大量误报。
  const lines = src.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    // 清洗:去注释、去字符串,保留标识符位置
    const clean = lines[i].replace(/--.*$/, '').replace(/"[^"]*"|'[^']*'/g, '""');
    // 只抓「当表/函数用」:裸名后紧跟 . : [ 或 (
    for (const m of clean.matchAll(/(^|[^.\w:])([a-zA-Z_]\w*)\s*[.:[(]/g)) {
      const name = m[2];
      if (declared.has(name) || engineGlobals.has(name) || flagged.has(name)) continue;
      flagged.add(name);
      console.log(`FAIL ${f}:${i + 1}  裸全局名 '${name}' 当表用,但既非 local 也不在引擎全局中(疑漏写 local)`);
      bad++;
    }
  }
}

/* ---------- 资源引用核对 ----------
 * 动机:立绘路径是运行时拼接的(`'image/portraits/char_' .. id .. '.png'`),
 * 静态扫描字面量覆盖不到。往 CHAR_IMG 加一项却忘了放图时不会报错,
 * 只会在真机上静默不显示人物。这里把 CHAR_IMG 的键与 assets/ 实际文件对账。
 * 同时核对 theme.lua 里全部字面量资源路径。 */
{
  const assetRoot = path.join(P.ROOT, 'assets');
  const portraitDir = path.join(assetRoot, 'image', 'portraits');

  // 1) CHAR_IMG 的每个 id 都应有对应立绘
  //    注意:表内多个条目常写在同一行,不能用 ^ 锚行首,故先切出整块再匹配。
  const gameSrc = read('game.lua');
  const block = /local\s+CHAR_IMG\s*=\s*\{([\s\S]*?)\n\}/.exec(gameSrc);
  const charIds = block
    ? [...block[1].matchAll(/\[\s*'[^']+'\s*\]\s*=\s*'([A-Za-z0-9_]+)'/g)].map((m) => m[1])
    : [];
  if (!block) {
    console.log('FAIL game.lua  未能定位 CHAR_IMG 表,资源核对跳过');
    bad++;
  }
  for (const id of charIds) {
    const f = path.join(portraitDir, 'char_' + id + '.png');
    if (!fs.existsSync(f)) {
      console.log(`FAIL game.lua  CHAR_IMG 登记了 '${id}' 但缺文件 assets/image/portraits/char_${id}.png`);
      bad++;
    }
  }

  // 2) assets 里多余的立绘(可能是改名后遗留)
  if (fs.existsSync(portraitDir)) {
    for (const fn of fs.readdirSync(portraitDir)) {
      const m = /^char_([a-z]+)\.png$/.exec(fn);
      if (m && !charIds.includes(m[1])) {
        console.log(`WARN assets  立绘 char_${m[1]}.png 未在 game.lua 的 CHAR_IMG 中登记(不会显示)`);
      }
    }
  }

  // 3) theme.lua 的字面量资源路径必须存在
  const themeSrcAll = read('theme.lua');
  const seen = new Set();
  for (const m of themeSrcAll.matchAll(/["']((?:ui|arch|image|fonts)\/[^"']+)["']/g)) {
    const rel = m[1];
    if (seen.has(rel)) continue;
    seen.add(rel);
    if (!fs.existsSync(path.join(assetRoot, rel))) {
      console.log(`FAIL theme.lua  引用的资源不存在: assets/${rel}`);
      bad++;
    }
  }

  // 4) 上述路径还须落在 resources.json 白名单内,否则不会入包
  const resources = JSON.parse(fs.readFileSync(path.join(P.ROOT, '.project', 'resources.json'), 'utf8'));
  const groups = (resources.groups && resources.groups.default) || [];
  for (const rel of seen) {
    const covered = groups.some((g) => {
      if (!g.endsWith('/**')) return false;
      const base = g.slice(0, -3);
      return rel === base || rel.startsWith(base + '/');
    });
    if (!covered) {
      console.log(`FAIL theme.lua  ${rel} 不在 .project/resources.json 白名单内(不会打进包)`);
      bad++;
    }
  }
  console.log(`资源核对: 立绘 ${charIds.length} 项 / 字面量路径 ${seen.size} 条`);
}
console.log(bad === 0 ? 'API CHECK OK' : `API CHECK FAIL: ${bad}`);
process.exit(bad === 0 ? 0 : 1);
