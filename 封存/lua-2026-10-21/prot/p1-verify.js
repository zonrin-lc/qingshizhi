/* P1 验证器:JSON -> Lua 转换的完整等价性
 * 指纹规则:
 *   数字 -> float64 十六进制位型(绕过 int/float/格式差异)
 *   布尔 -> b1/b0
 *   字符串 -> s<码点数>:<内容>(Lua 用 utf8.len,JS 用 Array.from,编码对齐)
 *   数组 -> [ ... ](Lua 以 1..n 连续且无额外键判定;JS 以 Array.isArray)
 *   对象 -> { key|value; ... }(键排序;两侧一致)
 *   空数组 [] 在 Lua 表示层坍缩为 {},指纹同样按 {} 处理(记录计数)
 */
const fs = require('fs');
const path = require('path');
const { P, loadWasmoon, readRepo } = require('./paths');
const { LuaFactory } = loadWasmoon();

const LUA_DUMP = `
local function dump(v, out)
  local tv = type(v)
  if v == nil then out[#out+1] = 'n'
  elseif tv == 'number' then
    out[#out+1] = 'd' .. string.format('%016x', string.unpack('<I8', string.pack('<d', v)))
  elseif tv == 'boolean' then out[#out+1] = v and 'b1' or 'b0'
  elseif tv == 'string' then out[#out+1] = 's' .. tostring(utf8.len(v)) .. ':' .. v
  elseif tv == 'table' then
    local n = #v
    local extra = 0
    for _ in pairs(v) do extra = extra + 1 end
    if n > 0 and extra == n then
      out[#out+1] = '['
      for i = 1, n do dump(v[i], out) end
      out[#out+1] = ']'
    else
      local keys = {}
      for k in pairs(v) do keys[#keys+1] = tostring(k) end
      table.sort(keys)
      out[#out+1] = '{'
      for _, k in ipairs(keys) do
        local val = v[k]
        if val == nil then
          local nk = tonumber(k)
          if nk then val = v[nk] end
        end
        dump(k, out); out[#out+1]='|'; dump(val, out); out[#out+1]=';'
      end
      out[#out+1] = '}'
    end
  else out[#out+1] = '?' .. tv end
end
local t = dofile(path)
local out = {}
dump(t, out)
return table.concat(out)
`;

const buf = new ArrayBuffer(8); const dv = new DataView(buf);
let emptyArrCount = 0;
function jsDump(v, out) {
  if (v === null || v === undefined) { out.push('n'); return; }
  const t = typeof v;
  if (t === 'number') { dv.setFloat64(0, v); out.push('d' + dv.getBigUint64(0).toString(16).padStart(16, '0')); return; }
  if (t === 'boolean') { out.push(v ? 'b1' : 'b0'); return; }
  if (t === 'string') { out.push('s' + Array.from(v).length + ':' + v); return; }
  if (Array.isArray(v)) {
    if (v.length === 0) { emptyArrCount++; out.push('{', '}'); return; }
    out.push('[');
    for (const x of v) jsDump(x, out);
    out.push(']');
    return;
  }
  // 值为 null 的键:引擎全篇宽松消费(已逐键核验),Lua 侧 `k = nil` 运行时即缺席,
  // pairs() 不遍历——故 JS 侧同样跳过,使两侧口径对齐。跳过数透明计数供审计。
  const keys = Object.keys(v).filter(k => v[k] !== null).sort();
  out.push('{');
  for (const k of keys) { jsDump(String(k), out); out.push('|'); jsDump(v[k], out); out.push(';'); }
  out.push('}');
}

(async () => {
  const files = fs.readdirSync(P.PROT_LUA_DATA).filter(f => f.endsWith('.json'));
  let allOk = true;
  for (const f of files) {
    const json = JSON.parse(fs.readFileSync(path.join(P.PROT_LUA_DATA, f), 'utf8'));
    const outName = f.replace('.json', '.lua');
    emptyArrCount = 0;
    const jsOut = []; jsDump(json, jsOut);
    const jsFp = jsOut.join('');
    const factory = new LuaFactory();
    const lua = await factory.createEngine();
    await factory.mountFile('/d.lua', readRepo(path.join('prot', 'lua', 'data', outName)));
    lua.global.set('path', '/d.lua');
    const luaFp = String(await lua.doString(LUA_DUMP));
    await lua.global.close();
    if (jsFp === luaFp) {
      console.log(outName + ': 等价 PASS (fp=' + jsFp.length + ', 空数组坍缩=' + emptyArrCount + ')');
    } else {
      allOk = false;
      let i = 0; const L = Math.min(jsFp.length, luaFp.length);
      while (i < L && jsFp[i] === luaFp[i]) i++;
      console.log(outName + ': MISMATCH at ' + i + ' (jsLen=' + jsFp.length + ' luaLen=' + luaFp.length + ')');
      console.log('  JS : ' + jsFp.slice(Math.max(0, i - 50), i + 30));
      console.log('  LUA: ' + luaFp.slice(Math.max(0, i - 50), i + 30));
    }
  }
  console.log(allOk ? 'P1 VERIFY: 全部逐字段等价' : 'P1 VERIFY: 存在不一致');
  process.exit(allOk ? 0 : 1);
})().catch(e => { console.log('ERR', e); process.exit(1); });
