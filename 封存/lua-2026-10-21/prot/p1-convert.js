/* P1 转换器:五剧本 JSON → Lua 字面量表源码
 * 数据侧前置验证:JSON.stringify 全结构无函数、无循环(lisi/jingke/hanxin/xiangyu/chensheng 各 ~50-130KB)。
 * 转换规则:JSON → return { ... } 的 Lua 表;字符串按 Lua 长括号/转义处理;数组→1-based 表;
 * 数字:整数保持整数,浮点保持。验证=Lua 侧 load 后与 JSON 逐字段对拍(recurse compare)。 */
const fs = require('fs');
const path = require('path');
const { P } = require('./paths');

const SRC = P.PROT_LUA_DATA;
const OUT = P.PROT_LUA_DATA_OUT;
fs.mkdirSync(OUT, { recursive: true });

function esc(s) {
  // 用 Lua 双引号字符串 + 转义;中文原样 UTF-8 合法
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t');
}
function num(n) {
  if (Number.isInteger(n)) return String(n);
  // 浮点:%.17g 保证往返
  let s = n.toPrecision(17);
  // 去除尾随 0(保留 .17g 内的必要位)
  if (s.indexOf('.') >= 0 && !/e/i.test(s)) s = s.replace(/0+$/, '').replace(/\.$/, '.0');
  return s;
}
function toLua(v, indent) {
  const pad = '  '.repeat(indent);
  if (v === null) return 'nil';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return num(v);
  if (typeof v === 'string') return '"' + esc(v) + '"';
  if (Array.isArray(v)) {
    if (!v.length) return '{}';
    const items = v.map(x => '  '.repeat(indent + 1) + toLua(x, indent + 1));
    return '{\n' + items.join(',\n') + ',\n' + pad + '}';
  }
  // object
  const keys = Object.keys(v);
  if (!keys.length) return '{}';
  const parts = keys.map(k => {
    // Lua 键:合法标识符用裸键,否则 ["..."]
    // Lua 保留字(如路由键 "if")必须加引号
    const RESERVED = /^(and|break|do|else|elseif|end|false|for|function|goto|if|in|local|nil|not|or|repeat|return|then|true|until|while)$/;
    const kk = (/^[A-Za-z_][A-Za-z0-9_]*$/.test(k) && !RESERVED.test(k)) ? k : '["' + esc(k) + '"]';
    return '  '.repeat(indent + 1) + kk + ' = ' + toLua(v[k], indent + 1);
  });
  return '{\n' + parts.join(',\n') + ',\n' + pad + '}';
}

const files = fs.readdirSync(SRC).filter(f => f.endsWith('.json') && f !== 'golden.json');
for (const f of files) {
  const data = JSON.parse(fs.readFileSync(path.join(SRC, f), 'utf8'));
  const lua = '-- 自动生成:' + f + ' → Lua 字面量(P1 转换器,勿手改)\nreturn ' + toLua(data, 0) + '\n';
  const outName = f.replace('.json', '.lua');
  fs.writeFileSync(path.join(OUT, outName), lua);
  console.log(outName, 'bytes=', lua.length);
}
// golden 也转 Lua
const golden = JSON.parse(fs.readFileSync(path.join(SRC, 'golden.json'), 'utf8'));
const glua = '-- 自动生成:P1 金样(golden.json),P2 回放对拍的基准数据\nreturn ' + toLua(golden, 0) + '\n';
fs.writeFileSync(path.join(OUT, 'golden.lua'), glua);
console.log('golden.lua bytes=', glua.length);
