/* prot/lua-data/<scen>.json 再生成器：wasmoon 装载 scripts/qingshi/data/<scen>.lua，
 * Lua 侧递归序列化为 JSON 文本，JS 侧 JSON.parse 后用最短浮点重 stringify 落盘。
 * 用法: node dump-lua-data.js lisi   （只允许五剧本键；golden.json 不由此生成，勿碰）
 * 浮点口径: Lua 侧用 %.17g 保 float64 往返，JS stringify 输出最短形式（0.59999999999999998→0.6）。
 * 键序: Lua 5.4 表字符串键按插入序迭代，与生成源码的书写顺序一致。 */
const fs = require('fs');
const path = require('path');
const { P, loadWasmoon, readRepo } = require('./paths');
const { LuaFactory } = loadWasmoon();

const scen = process.argv[2];
const VALID = ['lisi', 'jingke', 'hanxin', 'xiangyu', 'chensheng'];
if (!VALID.includes(scen)) {
  console.error('用法: node dump-lua-data.js <' + VALID.join('|') + '>');
  process.exit(1);
}

const DUMP = `
local function jstr(s)
  return '"' .. s:gsub('[%z\\1-\\31\\\\"]', function(c)
    local b = string.byte(c)
    if c == '"' then return '\\\\"' end
    if c == '\\\\' then return '\\\\\\\\' end
    if c == '\\n' then return '\\\\n' end
    if c == '\\r' then return '\\\\r' end
    if c == '\\t' then return '\\\\t' end
    return string.format('\\\\u%04x', b)
  end) .. '"'
end
local function jnum(n)
  if math.type(n) == 'integer' then return string.format('%d', n) end
  return string.format('%.17g', n)
end
local function isArr(t)
  local n = #t
  if n == 0 then return next(t) == nil end  -- 空表按对象输出（数据层无空表歧义）
  local c = 0
  for k in pairs(t) do
    if math.type(k) ~= 'integer' then return false end
    c = c + 1
  end
  return c == n
end
local ser
ser = function(v)
  local tv = type(v)
  if tv == 'nil' then return 'null' end
  if tv == 'boolean' then return tostring(v) end
  if tv == 'number' then return jnum(v) end
  if tv == 'string' then return jstr(v) end
  if tv == 'table' then
    local parts = {}
    if isArr(v) then
      for i = 1, #v do parts[#parts+1] = ser(v[i]) end
      return '[' .. table.concat(parts, ',') .. ']'
    end
    for k, val in pairs(v) do
      parts[#parts+1] = jstr(tostring(k)) .. ':' .. ser(val)
    end
    return '{' .. table.concat(parts, ',') .. '}'
  end
  error('unsupported type: ' .. tv)
end
local D = dofile('/data/' .. __SCEN .. '.lua')
return ser(D)
`;

(async () => {
  const factory = new LuaFactory();
  const lua = await factory.createEngine();
  await factory.mountFile('/data/' + scen + '.lua', readRepo(path.join('scripts', 'qingshi', 'data', scen + '.lua')));
  const jsonText = String(await lua.doString(DUMP.replace(/__SCEN/g, "'" + scen + "'")));
  // JS 重排：最短浮点 + 校验可解析
  const obj = JSON.parse(jsonText);
  const target = path.join(P.PROT_LUA_DATA, scen + '.json');
  // 与既有转储对齐：沿用旧文件键序；旧文件中的显式 null（Lua 侧为 nil，dump 掉键）补回；
  // 新增键排在对象末尾。无旧文件时按 dump 原样输出。
  let outObj = obj;
  if (fs.existsSync(target)) {
    const prev = JSON.parse(fs.readFileSync(target, 'utf8'));
    const align = (nw, old) => {
      if (Array.isArray(nw) && Array.isArray(old) && nw.length === old.length)
        return nw.map((v, i) => align(v, old[i]));
      if (nw && old && typeof nw === 'object' && typeof old === 'object' && !Array.isArray(nw) && !Array.isArray(old)) {
        const r = {};
        for (const k of Object.keys(old))
          if (k in nw) r[k] = align(nw[k], old[k]);
          else if (old[k] === null) r[k] = null;
        for (const k of Object.keys(nw)) if (!(k in r)) r[k] = nw[k];
        return r;
      }
      return nw;
    };
    outObj = align(obj, prev);
  }
  const out = JSON.stringify(outObj);
  fs.writeFileSync(target, out);
  console.log('written', P.rel(target), out.length, 'bytes');
})().catch(e => { console.error('ERR', e); process.exit(1); });
