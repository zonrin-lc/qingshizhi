/* P2 对拍台:wasmoon 装载 Lua 引擎,按 golden 决策序列回放 100 局,终局快照逐字段(含 float64 位模式)比对。
 * 驱动逻辑逐字复刻 p1-golden.js(含 pickByRng、每 7 步蓄势、chapterEnd bands 探针)。
 * steps 协议:分号分隔,每项 TYPE 或 TYPE:数字;null 值以 @N@ 哨兵编码(Lua nil 会掉键)。 */
const { LuaFactory } = require('/workspace/.lua-runner/node_modules/wasmoon');
const fs = require('fs');

const golden = JSON.parse(fs.readFileSync('/workspace/prot/lua-data/golden.json', 'utf8'));

// 编码各局 steps
const games = [];
for (const scen of Object.keys(golden)) {
  golden[scen].forEach((g, gi) => {
    if (g.error) { games.push({ scen, gi, err: true }); return; }
    const enc = g.steps.map(s => s.length === 1 ? s[0] : s[0] + ':' + s[1]).join(';');
    games.push({ scen, gi, g, enc });
  });
}

const DRIVER = `
local function split(s, sep)
  local out, pos = {}, 1
  for m in string.gmatch(s, '[^' .. sep .. ']+') do out[#out+1] = m end
  return out
end
local function jnum(t, i)
  local v = t[i]
  if v == nil then return nil end
  if v == '@N@' then return nil end
  return tonumber(v)
end
_G.__QINGSHI_PRNG = dofile('/prng.lua')
local ENG = dofile('/engine.lua')
local function fmt(x)
  -- 数字一律转 float64 位模式十六进制(与 JS 侧 DataView 同口径,P0 已验证 string.pack 可用)
  if type(x) == 'number' then return string.format('%016x', string.unpack('<I8', string.pack('<d', x))) end
  if x == nil or x == false then return '@N@' end
  return tostring(x)
end
function replayGame(scenKey, diffKey, seedStr, stepsStr)
  local D = dofile('/data/' .. scenKey .. '.lua')
  local PRNG = _G.__QINGSHI_PRNG
  local rng = PRNG(tonumber(seedStr))
  local g = ENG.NewGame(D, diffKey, PRNG(tonumber(seedStr)))
  g._bands = {}
  local origCE = g.chapterEnd
  g.chapterEnd = function(self) self._bands[#self._bands+1] = self:devBand(); return origCE(self) end
  g:start()
  local steps = split(stepsStr, ';')
  local guard = 0
  local n = 0
  while g.phase ~= 'ending' and guard < 400 do
    guard = guard + 1
    n = n + 1
    local ph = g.phase
    if ph == 'intro' then
      g:beginEvents()
    elseif ph == 'round' then
      local tok = split(steps[n], ':')
      if tok[1] == 'xushi' then
        local rx = g:playXushi()
        if not rx then g:playCard(0) end
      else
        local cidx = tonumber(tok[2])
        local r = g:playCard(cidx)
        if not r then g:playCard(0) end
      end
    elseif ph == 'correction' then
      g:correctionContinue()
    elseif ph == 'summary' then
      g:proceedSummary()
    elseif ph == 'endEvent' then
      local tok = split(steps[n], ':')
      g:endEventChoose(tonumber(tok[2]))
    elseif ph == 'event' then
      local tok = split(steps[n], ':')
      g:choose(tonumber(tok[2]))
    elseif ph == 'settle' then
      g:proceed()
    else
      error('unknown phase ' .. tostring(g.phase))
    end
    if n >= #steps then
      if g.phase ~= 'ending' then error('steps exhausted at phase ' .. g.phase) end
      break
    end
  end
  if g.phase ~= 'ending' then error('no ending in 400 steps') end
  -- 快照字段序与 JS 侧比对键一致
  local out = {}
  out[#out+1] = 'ending=' .. fmt(g.ending.id)
  out[#out+1] = 'variant=' .. fmt(g.ending.variant)
  out[#out+1] = 'grade=' .. fmt(g.ending.grade)
  out[#out+1] = 'total=' .. fmt(g.ending.total)
  out[#out+1] = 'dev=' .. fmt(g.dev)
  out[#out+1] = 'chapter=' .. fmt(g.chapterIdx)
  local bs = {}
  for i = 1, #g._bands do bs[#bs+1] = fmt(g._bands[i]) end
  out[#out+1] = 'bands=' .. table.concat(bs, ',')
  local AN = D.ATTR_NAMES
  local ks = {}
  for k in pairs(AN) do ks[#ks+1] = k end
  table.sort(ks)
  for i = 1, #ks do
    out[#out+1] = 'attr.' .. ks[i] .. '=' .. fmt(g.attrs[ks[i]])
  end
  out[#out+1] = 'stepsUsed=' .. fmt(n)
  return table.concat(out, '|')
end
return 1
`;

function bits64(x) { dv.setFloat64(0, x); return dv.getBigUint64(0).toString(16).padStart(16, '0'); }
const buf = new ArrayBuffer(8); const dv = new DataView(buf);

function jsFieldLines(g, scenKey) {
  const lines = [];
  const fmt = v => (typeof v === 'number') ? bits64(v) : (v === null || v === undefined || v === false ? '@N@' : String(v));
  lines.push('ending=' + fmt(g.ending));
  lines.push('variant=' + fmt(g.variant));
  lines.push('grade=' + fmt(g.grade));
  lines.push('total=' + fmt(g.total));
  lines.push('dev=' + fmt(g.dev));
  lines.push('chapter=' + fmt(g.chapter));
  lines.push('bands=' + g.bands.map(fmt).join(','));
  const D = SCEN_CACHE[scenKey];
  const ks = Object.keys(D.ATTR_NAMES).sort();
  for (const k of ks) lines.push('attr.' + k + '=' + fmt(g.attrs[k]));
  lines.push('stepsUsed=' + fmt(g.steps.length));
  return lines.join('|');
}

// JS 侧需要剧本 ATTR_NAMES 键序 → 从 lua-data JSON 读
const SCEN_CACHE = {};
for (const s of ['lisi', 'jingke', 'hanxin', 'xiangyu', 'chensheng']) {
  SCEN_CACHE[s] = JSON.parse(fs.readFileSync('/workspace/prot/lua-data/' + s + '.json', 'utf8'));
}

(async () => {
  const factory = new LuaFactory();
  const lua = await factory.createEngine();
  await factory.mountFile('/prng.lua', fs.readFileSync('/workspace/scripts/qingshi/prng.lua', 'utf8'));
  await factory.mountFile('/engine.lua', fs.readFileSync('/workspace/scripts/qingshi/engine.lua', 'utf8'));
  for (const s of ['lisi', 'jingke', 'hanxin', 'xiangyu', 'chensheng']) {
    await factory.mountFile('/data/' + s + '.lua', fs.readFileSync([s == 'golden' ? '/workspace/prot/lua/data/' : '/workspace/scripts/qingshi/data/'] + s + '.lua', 'utf8'));
  }
  await lua.doString(DRIVER);
  const replay = await lua.global.get('replayGame');

  let pass = 0, fail = 0;
  const fails = [];
  for (const gm of games) {
    if (gm.err) continue;
    let outStr;
    try {
      outStr = String(await replay(gm.scen, gm.g.diff, String(gm.g.seed), gm.enc));
    } catch (e) {
      fail++; fails.push(gm.scen + '#' + gm.gi + ' LUA-ERR: ' + String(e.message || e).slice(0, 160)); continue;
    }
    const want = jsFieldLines(gm.g, gm.scen);
    if (outStr === want) pass++;
    else {
      fail++;
      const a = outStr.split('|'), b = want.split('|');
      let diffAt = -1;
      for (let i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) { diffAt = i; break; }
      fails.push(gm.scen + '#' + gm.gi + ' DIFF@' + diffAt + ': lua[' + String(a[diffAt]).slice(0, 60) + '] vs js[' + String(b[diffAt]).slice(0, 60) + ']');
    }
  }
  console.log('P2 REPLAY: pass=' + pass + ' fail=' + fail + ' (golden ' + games.length + ' 局)');
  fails.slice(0, 12).forEach(f => console.log('  -', f));
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.log('ERR', e); process.exit(1); });
