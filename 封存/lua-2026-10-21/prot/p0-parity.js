/* P0 对拍(仓库固化版):JS mulberry32 vs Lua 5.4 译文,逐位 IEEE754 比对
 * 双路径验证：(a) 内联源码 doString（单文件足够）
 *            (b) mountFile + dofile（P2 多文件依赖的能力，此处一并立证）
 */
const fs = require('fs');
const path = require('path');
const { loadWasmoon, readRepo } = require('./paths');
const { LuaFactory } = loadWasmoon();
function m32js(seed) {
  let a = seed | 0;
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const buf = new ArrayBuffer(8); const dv = new DataView(buf);
function bits64(x) { dv.setFloat64(0, x); return dv.getBigUint64(0).toString(16).padStart(16, '0'); }

const SEEDS = [0, 1, 42, 10000061, 2147483647, 2147483648, 4294967295, 987654321, 2147483649, 6000000000];
const DRAW_CHUNK = `
local r = __M(tonumber(seedN))
local o = {}
for i = 1, 20 do o[i] = string.format("%016x", string.unpack("<I8", string.pack("<d", r()))) end
return table.concat(o, " ")`;

async function runOn(factory, lua, label, prefix) {
  let bad = 0, total = 0;
  for (const s of SEEDS) {
    lua.global.set('seedN', String(s));
    const luaStr = String(await lua.doString(prefix + DRAW_CHUNK));
    const luaBits = luaStr.split(' ');
    const r = m32js(s | 0);
    for (let i = 0; i < 20; i++) { const jb = bits64(r()); total++; if (String(luaBits[i]) !== jb) bad++; }
  }
  console.log(label + ': ' + (bad === 0 ? 'PASS ' + total + '/' + total : 'FAIL ' + bad + '/' + total));
  return bad === 0;
}

(async () => {
  // PRNG 译文本体(与 scripts/qingshi/prng.lua 同一份;原先指向 prot/lua/qingshi_prng.lua,
// 该文件并不存在 —— 换机器必挂,现指向真实来源)
const src = readRepo(path.join('scripts', 'qingshi', 'prng.lua'));
  // (a) 内联
  const f1 = new LuaFactory(); const l1 = await f1.createEngine();
  const okA = await runOn(f1, l1, 'P0a 内联 doString', 'local __M = (function() ' + src + ' end)()');
  await l1.global.close();
  // (b) 挂载 + dofile
  const f2 = new LuaFactory(); const l2 = await f2.createEngine();
  await f2.mountFile('/q.lua', src);
  const okB = await runOn(f2, l2, 'P0b mountFile+dofile', 'local __M = dofile("/q.lua")');
  await l2.global.close();
  process.exit(okA && okB ? 0 : 1);
})().catch(e => { console.log('ERR', e); process.exit(1); });
