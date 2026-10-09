/* 模块 API 检查:校验各 UI 模块对 theme(T.*)与自身(S./M.)的调用是否真实存在。
 * 背景:语法台(load)只编译不执行,抓不到 "index a nil value" 这类运行时错误
 * (如 home.lua 误写 Theme.VText 而模块别名为 T)。此检查做静态符号比对。 */
const fs = require('fs');
const path = require('path');

const DIR = '/workspace/scripts/qingshi/ui';
const ROOT = '/workspace/scripts/qingshi';   // 全量扫描根(跳过 data/)
const EMMY = '/workspace/.emmylua';   // 引擎全局名的权威来源(自动派生,自维护)

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
  const lines = src.split('\n');
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
console.log(bad === 0 ? 'API CHECK OK' : `API CHECK FAIL: ${bad}`);
process.exit(bad === 0 ? 0 : 1);
