--[[ 《青史志》引擎 Lua 移植(P2) —— engine.js 的逐位对应实现
 * 对拍契约:与 JS 版同一决策序列回放,终局快照逐字段一致。
 * 语义规则(翻译时全局遵守,详见 GDD 附录 C 迁移条目):
 *   1. Math.round(x) ≡ math.floor(x + 0.5)(16 站点逐个核过,恒等式对全体有限 float64 成立)
 *   2. 对外索引保持 0-based:chapterIdx、devBand 返回值、offer/opts 下标、phase 循环计数
 *      —— 数据数组为 Lua 1-based,访问时 +1,换算只发生在取值那一行
 *   3. JS `a || b` 的 0/''/false 语义用 OR(a,b) 复刻;仅"缺省补值"(a 只会是 nil)用原生 or
 *   4. 一切数值比较先判 nil:Lua 里 nil 参与 < / > 直接报错,JS 里 undefined 比较为 false
 *   5. pairs 顺序不影响 golden:乱序只许落在 reason/changes 等不进快照的展示字段
 *   6. cardDesc(正则改写)只被 UI 调用,不在引擎路径 → 置桩,P3 移植
 *]]

-- PRNG 装载双通道:wasmoon 对拍台先设 _G.__QINGSHI_PRNG(沙箱无 dofile,跨目录装载靠注入);
-- UrhoX 运行时走 require,并兼容"入口先把模块挂到 _G.__QINGSHI_PRNG"的直装载方案。
local PRNG = rawget(_G, '__QINGSHI_PRNG')
if not PRNG then
  local okm, m = pcall(require, "qingshi/prng")
  if okm and m then PRNG = m end
end
assert(PRNG, "qingshi engine: PRNG 未装载(require 与 _G 注入双通道均失败)")

---------- ---------- JS 语义助手 ---------- ----------

local function J(v)
  -- JS truthiness:false/nil/0/''/NaN 为假,其余为真
  if v == nil or v == false then return false end
  if v == 0 then return false end
  if v == '' then return false end
  if type(v) == 'number' and v ~= v then return false end
  return true
end

local function OR(a, b) return J(a) and a or b end

local function round(x) return math.floor(x + 0.5) end          -- ≡ JS Math.round

local function inList(t, x)                                     -- ≡ Array.indexOf(...) >= 0 / < 0
  for i = 1, #t do if t[i] == x then return i end end
  return 0
end

local function countKeys(t)                                     -- ≡ Object.keys(t).length
  local n = 0
  for _ in pairs(t) do n = n + 1 end
  return n
end

local function shallow(t)                                       -- ≡ Object.assign({}, t)(字典或数组)
  if t == nil then return nil end
  local r = {}
  for k, v in pairs(t) do r[k] = v end
  return r
end

local function copyArr(t)                                       -- ≡ arr.slice()
  local r = {}
  for i = 1, #t do r[i] = t[i] end
  return r
end

local function deepCopy(t)                                      -- ≡ JSON.parse(JSON.stringify(t))
  if type(t) ~= 'table' then return t end
  local r = {}
  for k, v in pairs(t) do r[k] = deepCopy(v) end
  return r
end

local KEY_CARD_ROUNDS = 3
local ENCOUNTER_DEFAULT = { randomChance = 0.4, randomMax = 2 }  -- 剧本可经 ENCOUNTER 覆写(v2.0.7)

local Game = {}
Game.__index = Game

local function NewGame(data, diffKey, rng, streams)
  local self = setmetatable({}, Game)
  self.d = data
  self.diffKey = diffKey
  self.diff = data.DIFFICULTY[diffKey]
  self.rng = rng or error('Lua 侧无 Math.random,必须注入 PRNG')
  self._streams = streams                                     -- 测试注入:{risk,event,corr,card,ill}
  self._rngStreams = {}
  self:resetAll()
  return self
end

---------- ---------- 随机流分流 ---------- ----------

function Game:_stream(name)
  if self._streams and type(self._streams[name]) == 'function' then return self._streams[name] end
  if name == 'card' then return self.rng end
  local s = self._rngStreams[name]
  if not s then
    s = PRNG(math.floor(self.rng() * 4294967296))
    self._rngStreams[name] = s
  end
  return s
end

---------- ---------- 状态初始化 ---------- ----------

function Game:resetAll()
  self.attrs = shallow(self.d.INIT)
  self.dev = 0
  self.flags = {}
  self._once = {}
  self.histScore = 0
  self.merits = {}
  self.ach = {}
  self.keyChoices = {}
  self.peak = { quanshi = self.attrs.quanshi, junxin = self.attrs.junxin }
  self.coef = 1
  self.backtracksThisChapter = 0
  self.chapterIdx = -1
  self.eventId = nil
  self.phase = 'home'
  self.introNotes = {}
  self.pendingEndEvents = {}
  self.currentEndEvent = nil
  self.correction = nil
  self.ending = nil
  self.snapshot = nil
  self.offer = nil
  self.keyRoundsLeft = 0
  self.actionUses = {}
  self.randomOn = true
  local ENC = self.d.ENCOUNTER or ENCOUNTER_DEFAULT
  self.randomChance = (ENC.randomChance ~= nil) and ENC.randomChance or ENCOUNTER_DEFAULT.randomChance
  self.randomMax = (ENC.randomMax ~= nil) and ENC.randomMax or ENCOUNTER_DEFAULT.randomMax
  self.keyCardRounds = (ENC.keyCardRounds ~= nil) and ENC.keyCardRounds or KEY_CARD_ROUNDS
  self.chapterDeck = {}
  self.randomCount = 0
  self.currentRandom = nil
  self.pendingEventId = nil
  self._skipRandom = false
  self.gloss = {}
  local H = self.d.HIDDEN
  self.zg = (H and H.init ~= nil) and H.init or 30
  self.chapterDev = {}
  self._corrShown = nil
  self._backlashDone = false
  self._weijiClamp = 0
  self._endEventsChecked = false
  self._newAch = {}
  self._crisisPlotPending = false
  self.passedEvents = {}
  self._chapterStartId = nil
  self._burned = {}
  self.xushi = false
  self._amax = {}
  local attrs = self.d.ATTRS or {}
  for i = 1, #attrs do
    local a = attrs[i]
    self._amax[a.k] = OR(a.max, 100)                         -- JS: a.max || 100(max=0 亦→100)
  end
  self._actions = self:_indexActions()
  self.age = (self.d.AGE and self.d.AGE.init ~= nil) and self.d.AGE.init or nil
  self.ill = nil
end

function Game:_longevity()
  local lon = (self.d.AGE and self.d.AGE.longevity) or {}
  local c = 0
  for i = 1, #lon do
    if self.attrs.tupo >= lon[i][1] then c = lon[i][2] end
  end
  return c
end

---------- ---------- 属性钳制 ---------- ----------

function Game:attrMax(k)
  local m = self._amax and self._amax[k]
  if not J(m) then return 100 end
  return m
end

function Game:_clampA(k, v)
  return math.max(0, math.min(self:attrMax(k), round(v)))
end

local function clamp(v) return math.max(0, math.min(100, round(v))) end

function Game:_setAttrRaw(k, v)
  self.attrs[k] = self:_clampA(k, v)
  if k == 'quanshi' and self.attrs[k] > self.peak.quanshi then self.peak.quanshi = self.attrs[k] end
  if k == 'junxin' and self.attrs[k] > self.peak.junxin then self.peak.junxin = self.attrs[k] end
  return self.attrs[k]
end

function Game:start() self:enterChapter(0) end

function Game:chapter()
  local i = self.chapterIdx + 1
  if i < 1 then return nil end
  return self.d.CHAPTERS[i]
end

function Game:findEvent(id)
  if self.currentRandom and self.currentRandom.id == id then return self.currentRandom end
  local ch = self:chapter()
  local evs = (ch and ch.events) or {}
  for i = 1, #evs do if evs[i].id == id then return evs[i] end end
  return nil
end

function Game:devBand(dev)
  local bands = self.d.DEV_BANDS
  local v = (dev == nil) and self.dev or dev
  for i = 1, #bands do if v <= bands[i].max then return i - 1 end end
  return #bands - 1
end

---------- ---------- 条件判定 ---------- ----------

local FLAG_REASONS = {
  fusu = '需要扶苏的信任', guanshu = '需要序章观鼠悟道', liuzheng = '需要沙丘留证',
  hanfeicun = '需要韩非尚在', ziwu = '需要自污保身', mibao = '需要宫中密报',
  guangjiaoyou = '需要广交游', shouxi = '当前处境不适用', piaobo = '已经漂泊过一遭',
  lianmeng = '需要已密联蒙恬', mtdi = '蒙恬已生敌意'
}

function Game:check(cond)
  if not (cond ~= nil and cond ~= false) then return { ok = true, reason = nil } end
  local ok, reason = true, nil
  local names = self.d.ATTR_NAMES
  for k, v in pairs(cond) do
    if not ok then break end
    if k == 'flag' then
      if not self.flags[v] then ok = false; reason = OR(FLAG_REASONS[v], '需要特定经历') end
    elseif k == 'notflag' then
      if self.flags[v] then ok = false; reason = '与已有经历冲突' end
    elseif k == 'anyflag' then
      local has = false
      for i = 1, #v do if self.flags[v[i]] then has = true break end end
      if not has then ok = false; reason = OR(FLAG_REASONS[v[1]], '需要特定经历') end
    elseif k == 'weijiMax' then
      if self.attrs.weiji > v then ok = false; reason = '危机须≤' .. tostring(v) end
    elseif k == 'quanshiMax' then
      if self.attrs.quanshi > v then ok = false; reason = '权势须≤' .. tostring(v) end
    elseif k == 'junxinMax' then
      if self.attrs.junxin > v then ok = false; reason = '君心须≤' .. tostring(v) end
    elseif k == 'zgMax' then
      if self.zg > v then ok = false; reason = '戒心须≤' .. tostring(v) end
    elseif k == 'junxinMaxSeen' then
      if self.peak.junxin < v then ok = false; reason = '君心峰值须≥' .. tostring(v) end
    elseif k == 'minChapter' then
      if self.chapterIdx < v then ok = false; reason = '当前处境不适用' end
    elseif k == 'devMin' then
      if self.dev < v then ok = false; reason = '需偏离≥' .. tostring(v) .. '（改流之势）' end
    elseif k == 'devMax' then
      if self.dev > v then ok = false; reason = '需偏离≤' .. tostring(v) end
    elseif names[k] ~= nil and names[k] ~= false then
      if self.attrs[k] < v then ok = false; reason = names[k] .. '须≥' .. tostring(v) end
    else
      if type(v) == 'number' then ok = false; reason = '条件「' .. tostring(k) .. '」无法识别' end
    end
  end
  return { ok = ok, reason = reason }
end

---------- ---------- 险招 ---------- ----------

function Game:riskRate(gap)
  if gap <= 3 then return 70 end
  if gap <= 6 then return 50 end
  if gap <= 9 then return 40 end
  if gap <= 12 then return 30 end
  if gap <= 15 then return 20 end
  return 15
end

function Game:riskRateHist(rate)
  if rate >= 50 then return 70 end
  if rate >= 40 then return 50 end
  if rate >= 30 then return 40 end
  if rate >= 20 then return 30 end
  return 20
end

function Game:checkRisk(req, actionHardCaifu)
  local names = self.d.ATTR_NAMES
  local hard, unmet = {}, {}
  local rq = req or {}
  for k, v in pairs(rq) do
    if (names[k] ~= nil and names[k] ~= false) and k ~= 'caifu' then
      local have = self.attrs[k]
      if have < v then
        unmet[#unmet + 1] = { k = k, name = names[k], need = v, have = have, gap = v - have }
      end
    else
      hard[k] = v
    end
  end
  local hc
  if countKeys(hard) > 0 then hc = self:check(hard) else hc = { ok = true, reason = nil } end
  local rate = nil
  if #unmet > 0 then
    rate = 100
    for i = 1, #unmet do rate = math.min(rate, self:riskRate(unmet[i].gap)) end
  end
  return { hardOk = (hc.ok == true), hardReason = OR(hc.reason, nil), unmet = unmet, rate = rate }
end

function Game:_rollRisk(rate, unmet)
  local roll = math.floor(self:_stream('risk')() * 100) + 1
  return { rate = rate, roll = roll, success = (roll <= rate), unmet = unmet }
end

function Game:riskTitle(r)
  if not J(r) or not J(r.risk) then return '' end
  local rk = r.risk
  local res = rk.success and ' · 成' or ' · 败'
  if self.diff.hideAttrs then return '🎲 成算' .. riskWord(rk.rate) .. res end
  return '🎲 掷骰 ' .. tostring(rk.roll) .. (rk.success and ' ≤ ' or ' ＞ ') .. tostring(rk.rate) .. res
end

local RISK_WORDS = { { 70, '七成' }, { 50, '五成' }, { 40, '四成' }, { 30, '三成' }, { 20, '二成' }, { 15, '一成五' } }
function riskWord(rate)
  for i = 1, #RISK_WORDS do
    if rate >= RISK_WORDS[i][1] then return RISK_WORDS[i][2] end
  end
  return '一成五'
end

---------- ---------- 进入章节 ---------- ----------

function Game:enterChapter(idx)
  self.chapterIdx = idx
  self.backtracksThisChapter = 0
  local ch = self:chapter()
  self.introNotes = {}
  if J(ch.enter) then
    if J(ch.enter.merit) and inList(self.merits, ch.enter.merit) == 0 then
      self.merits[#self.merits + 1] = ch.enter.merit
    end
    if J(ch.enter.note) then self.introNotes[#self.introNotes + 1] = ch.enter.note end
  end
  -- 节点异变
  if J(ch.mutations) then
    for i = 1, #ch.mutations do
      local m = ch.mutations[i]
      if self:check(m['if']).ok then
        if J(m.flag) then self.flags[m.flag] = true end
        if J(m.setAttrs) then
          for k, v in pairs(m.setAttrs) do self:_setAttrRaw(k, v) end
        end
        if J(m.capAttrs) then
          for k, v in pairs(m.capAttrs) do
            if self.attrs[k] > v then self:_setAttrRaw(k, v) end
          end
        end
        if J(m.note) then self.introNotes[#self.introNotes + 1] = m.note end
      end
    end
  end
  -- 年龄定龄与衰老(v1.8 / v2.1.3 寿元抵衰)
  if ch.age ~= nil and J(self.d.AGE) then
    self.age = ch.age
    local ageBands = self.d.AGE.bands or { { 40, 0 }, { 55, -2 }, { 65, -4 }, { 76, -6 }, { 200, -8 } }
    local dAge = 0
    for abi = 1, #ageBands do
      if self.age < ageBands[abi][1] then dAge = ageBands[abi][2] break end
    end
    if J(dAge) then
      local cred = self:_longevity()
      local dAgeRaw = dAge
      if J(cred) then dAge = math.min(0, dAge + cred) end
      self.attrs.tupo = self:_clampA('tupo', self.attrs.tupo + dAge)
      if J(dAge) then
        self.introNotes[#self.introNotes + 1] = '【春秋渐高】年已' .. tostring(self.age) .. '，筋骨大不如前——体魄' .. tostring(dAge) .. '。'
      else
        self.introNotes[#self.introNotes + 1] = '【春秋渐高】年已' .. tostring(self.age) .. '，然筋骨犹胜常人，衰老之损尽为体魄所抵（寿元+' .. tostring(cred) .. '，本应体魄' .. tostring(dAgeRaw) .. '）——体魄无损。'
      end
    end
  end
  -- GDD 4.1 章首持续结算(危机正增量乘难度系数 wj)
  local wj = self.diff.wj
  local dWj
  local P = self.d.PERSIST
  local jxFrom = (P and P.junxinFrom ~= nil) and P.junxinFrom or 0
  local shichongOn = not (P and P.junxinShichong == false)
  if self.attrs.quanshi >= 80 then
    dWj = round(5 * wj)
    self.attrs.weiji = self:_clampA('weiji', self.attrs.weiji + dWj)
    self.introNotes[#self.introNotes + 1] = '【树大招风】权势过盛，君主猜忌日深——危机+' .. tostring(dWj) .. '。'
  end
  if self.attrs.junxin <= 15 and shichongOn and self.chapterIdx >= jxFrom then
    dWj = round(10 * wj)
    self.attrs.weiji = self:_clampA('weiji', self.attrs.weiji + dWj)
    self.introNotes[#self.introNotes + 1] = '【失宠于上】君心已冷，构陷者众——危机+' .. tostring(dWj) .. '。'
  end
  if self.attrs.caifu <= 0 then
    self.attrs.shengwang = self:_clampA('shengwang', self.attrs.shengwang - 5)
    self.introNotes[#self.introNotes + 1] = '【门客散去】无钱养士，门前冷落——声望-5。'
  end
  if self.attrs.shengwang >= 80 and self.attrs.junxin < 40 and not self._once._gonggao then
    self._once._gonggao = true
    dWj = round(10 * wj)
    self.attrs.weiji = self:_clampA('weiji', self.attrs.weiji + dWj)
    self.introNotes[#self.introNotes + 1] = '【功高震主】你的名望已越过人臣的界限——危机+' .. tostring(dWj) .. '。'
  end
  if self.attrs.caifu >= self:attrMax('caifu') * 0.9 and not self._once._jiyu then
    self._once._jiyu = true
    dWj = round(8 * wj)
    self.attrs.weiji = self:_clampA('weiji', self.attrs.weiji + dWj)
    self.introNotes[#self.introNotes + 1] = '【宗室觊觎】你的家产引来了宗室的目光——危机+' .. tostring(dWj) .. '。'
  end
  -- 污名·焚书(GDD 4-5-A)
  if self.flags.wu_fenshu and idx >= 5 then
    if not self._once._wfsWarn then
      self._once._wfsWarn = true
      self.introNotes[#self.introNotes + 1] = '【污名·焚书】士林至今以焚书之议罪你——辩白无用，这份敌意会伴你走到局终。'
    end
    self.attrs.shengwang = self:_clampA('shengwang', self.attrs.shengwang - 3)
    self.introNotes[#self.introNotes + 1] = '【士林侧目】焚书之议，士林视你为仇——声望-3。'
  end
  if J(ch.achOnEnter) then self:unlockAch(ch.achOnEnter) end
  self.chapterDev = {}
  self._corrShown = nil
  self._backlashDone = false
  self.passedEvents = {}
  self.offer = nil
  self.keyRoundsLeft = self.keyCardRounds
  self.actionUses = {}
  self.randomCount = 0
  self.currentRandom = nil
  self.pendingEventId = nil
  self._crisisPlotPending = false
  self.chapterDeck = self:_buildChapterDeck(idx)
  -- 起始事件(支持条件起始)
  local start = ch.start
  if J(ch.startAlt) then
    for i = 1, #ch.startAlt do
      if self:check(ch.startAlt[i]['if']).ok then start = ch.startAlt[i].start break end
    end
  end
  self._chapterStartId = start
  -- GDD 4.1 危机 ≥90 章首死亡判定;硬核贪墨清算(第四/五章一次性)
  local CE = self.d.CRISIS_EVENTS
  if self.attrs.weiji >= 90 and J(CE) and J(CE.death) then
    local dev0 = deepCopy(CE.death)
    self.pendingEventId = start
    self.currentRandom = dev0
    self.eventId = dev0.id
  elseif self.diffKey == 'hardcore' and self.flags.tanmo and not self._once._tanmo_qs
      and idx >= 4 and idx <= 5 and J(CE) and J(CE.qingsuan) then
    self._once._tanmo_qs = true
    self.pendingEventId = start
    self.currentRandom = CE.qingsuan
    self.eventId = CE.qingsuan.id
    if self.attrs.weiji >= 70 then self._crisisPlotPending = true end
  else
    self.eventId = start
    if self.attrs.weiji >= 70 then self._crisisPlotPending = true end
  end
  self:onEventEnter()
  self.snapshot = self:makeSnapshot()
  self.phase = 'intro'
end

function Game:makeSnapshot()
  return {
    attrs = shallow(self.attrs),
    dev = self.dev,
    flags = shallow(self.flags),
    once = shallow(self._once),
    histScore = self.histScore,
    merits = copyArr(self.merits),
    ach = copyArr(self.ach),
    keyChoices = copyArr(self.keyChoices),
    peak = shallow(self.peak),
    zg = self.zg,
    eventId = self.eventId,
    pendingEventId = self.pendingEventId,
    currentRandom = self.currentRandom,
    crisisPlotPending = self._crisisPlotPending,
    keyRoundsLeft = self.keyRoundsLeft,
    actionUses = shallow(self.actionUses),
    passed = shallow(self.passedEvents),
    age = self.age,
    ill = self.ill and shallow(self.ill) or nil,
    introNotes = copyArr(self.introNotes),
    coef = self.coef
  }
end

function Game:chapterProgress()
  local ch = self:chapter()
  local total = ch and #ch.events or 0
  if ch and J(self._chapterStartId) and self._chapterStartId ~= ch.start then total = total - 1 end
  return { done = countKeys(self.passedEvents), total = math.max(total, 1) }
end

function Game:_buildChapterDeck(idx)
  local r = {}
  local src = self.d.RANDOM_EVENTS or {}
  for i = 1, #src do
    local e = src[i]
    if idx >= e.chapters[1] and idx <= e.chapters[2] then r[#r + 1] = e end
  end
  return r
end

function Game:beginEvents() return self:beginRounds() end

---------- ---------- 回合发牌 ---------- ----------

function Game:beginRounds()
  local pool = {}
  local acts = self.d.ACTIONS or {}
  for i = 1, #acts do
    local a = acts[i]
    local chs = OR(a.chapters, { 0, 6 })
    if not (self.chapterIdx < chs[1] or self.chapterIdx > chs[2]) then
      if a.req then
        if self:checkRisk(a.req, true).hardOk then pool[#pool + 1] = a end
      else
        pool[#pool + 1] = a
      end
    end
  end
  local picks = {}
  local deal = self:_stream('card')
  local n = math.min(3, #pool)
  for k = 1, n do
    local idx = math.floor(deal() * #pool) + 1
    picks[#picks + 1] = table.remove(pool, idx)
  end
  self.offer = { { type = 'key' } }
  for i = 1, #picks do
    self.offer[#self.offer + 1] = { type = 'action', id = picks[i].id }
  end
  if J(self.ill) and J(self.d.ILLNESS) then
    self.offer[#self.offer + 1] = { type = 'action', id = '__cure__' }
  end
  self.phase = 'round'
  return { type = 'round' }
end

function Game:getOffer()
  if not J(self.offer) then return {} end
  local r = {}
  for i = 1, #self.offer do
    local e = self.offer[i]
    if e.type == 'key' then
      local ev = self:findEvent(self.eventId)
      r[#r + 1] = {
        type = 'key', eventId = self.eventId,
        title = ev and ev.title or tostring(self.eventId),
        inserted = (self.currentRandom ~= nil and self.currentRandom ~= false),
        roundsLeft = self.keyRoundsLeft,
        enterable = not self:_hasOpenOption()
      }
    else
      local a = nil
      if e.id == '__cure__' then
        if self.d.ILLNESS then
          local pre = (self.ill and self.ill.type == 'major') and '沉疴非药石不起——' or '小病亦不可拖——'
          a = { id = '__cure__', name = '求医问药',
            desc = pre .. '延医诊治（财富-' .. tostring(self.d.ILLNESS.cost) .. '）',
            descHidden = pre .. '延医诊治（耗财）' }
        end
      else
        a = self:_actionById(e.id)
      end
      local c = { ok = true, reason = nil }
      local risky = nil
      if a and a.req then
        local cr = self:checkRisk(a.req, true)
        c = { ok = cr.hardOk, reason = cr.hardReason }
        if cr.hardOk and cr.rate ~= nil then risky = { rate = cr.rate, unmet = cr.unmet } end
      end
      local used = self.actionUses[e.id] or 0
      local AR = self.d.ACTION_RULES
      local noDim = J(AR) and AR.diminish == false
      r[#r + 1] = {
        type = 'action', action = a, locked = not c.ok,
        reason = OR(c.reason, nil), usedCount = used,
        diminishing = (not noDim) and used > 0, risky = risky
      }
    end
  end
  return r
end

-- cardDesc:仅 UI 调用,不参与引擎路径与对拍 → P3 移植
local COST_WORD = { caifu = '耗财', tupo = '费力', wuli = '耗力', caixue = '耗神', moulue = '费心', biancai = '费辞' }
function Game:cardDesc(desc)
  if not J(desc) then return desc end
  if not self.diff.hideAttrs then return desc end
  error('cardDesc 硬核数字改写待 P3 移植(不影响对拍路径)')
end

---------- ---------- 出牌 ---------- ----------

function Game:playCard(i)
  if self.phase ~= 'round' or not J(self.offer) then return nil end
  local entry = self.offer[i + 1]                        -- 契约 0-based → Lua 1-based
  if not J(entry) then return nil end
  if entry.type == 'key' then
    if not self:_hasOpenOption() then                    -- v2.0.4 P1 死锁兜底
      self._next = { type = 'chapterEnd' }
      self.phase = 'settle'
      return { kind = 'key', forcedEnding = false, chapterEnd = true }
    end
    self.phase = 'event'
    return { kind = 'key' }
  end
  -- 治病卡
  if entry.id == '__cure__' then
    if not J(self.ill) or not J(self.d.ILLNESS) then return nil end
    local ILL = self.d.ILLNESS
    local wasMajor = (self.ill.type == 'major')
    self.ill = nil
    local paid = math.min(self.attrs.caifu, ILL.cost)
    local owed = (self.attrs.caifu < ILL.cost)
    self.attrs.caifu = self:_clampA('caifu', self.attrs.caifu - ILL.cost)
    local heal = OR(ILL.heal, 5)
    self.attrs.tupo = self:_clampA('tupo', self.attrs.tupo + heal)
    local cureChanges = {
      { k = 'caifu', label = '财富', delta = -paid, note = owed and '举债求医，债台高筑' or '延医之资' },
      { k = 'tupo', label = '体魄', delta = heal, note = '药石有功' }
    }
    local rc = {
      kind = 'action', id = '__cure__',
      text = wasMajor and '医者换了三次方，前前后后一个月，你终于能扶着墙坐起来了。这场大病，把日子熬短了一截。'
                     or '一剂汤药下去，病气散了。小病早治，原是至理。',
      changes = cureChanges, devDelta = 0, useCount = 1,
      achNew = nil, bandUp = false, bandName = nil, forcedEnding = false, risk = nil, failed = false
    }
    local feC = self:checkDeath()
    if J(feC) then self._next = feC; self.phase = 'settle'; rc.forcedEnding = true; return rc end
    return self:_advanceRound(rc)
  end
  local a = self:_actionById(entry.id)
  if not J(a) then return nil end
  local cr
  if a.req then cr = self:checkRisk(a.req, true) else cr = { hardOk = true, rate = nil, unmet = {} } end
  if not cr.hardOk then return nil end
  local risk = nil
  local failed = false
  if cr.rate ~= nil then
    risk = self:_rollRisk(cr.rate, cr.unmet)
    failed = not risk.success
  end
  local useN = (self.actionUses[a.id] or 0) + 1
  self.actionUses[a.id] = useN
  local AR = self.d.ACTION_RULES
  local noDim = J(AR) and AR.diminish == false
  local eff
  if failed then
    eff = { attrs = { weiji = 3 } }
  elseif noDim then
    eff = deepCopy(a.eff or {})
  else
    eff = self:_scaleActionEff(a.eff or {}, useN)
  end
  local changes = self:applyEff(eff)
  if J(self.d.ILLNESS) then self:_tickIllness(changes) end
  local r = {
    kind = 'action', id = a.id, text = failed and '徒劳一场。' or a.res, changes = changes,
    devDelta = OR(OR(eff.dev, 0), 0), useCount = useN,
    achNew = nil, bandUp = false, bandName = nil,
    forcedEnding = false, risk = risk, failed = failed
  }
  local forcedEnding = self:checkDeath()
  if J(forcedEnding) then
    self._next = forcedEnding
    self.phase = 'settle'
    r.forcedEnding = true
    return r
  end
  return self:_advanceRound(r)
end

function Game:_advanceRound(r)
  self.keyRoundsLeft = self.keyRoundsLeft - 1
  if self.keyRoundsLeft <= 0 then
    local opts0 = self:getOptions()
    local anyOpen = false
    for oi = 1, #opts0 do if not opts0[oi].locked then anyOpen = true break end end
    if anyOpen then
      self.phase = 'event'
      r.forcedKey = true
      if self:unlockAch('shiwodai') then
        local nm0 = self.d.ACHIEVEMENTS.shiwodai
        if J(nm0) then r.achNew = J(r.achNew) and (r.achNew .. '、' .. nm0) or nm0 end
      end
    else
      self.keyRoundsLeft = self.keyCardRounds
      self:beginRounds()
      r.route = { type = 'round' }
    end
  else
    self:beginRounds()
    r.route = { type = 'round' }
  end
  return r
end

function Game:playXushi()
  if self.phase ~= 'round' or self.xushi then return nil end
  self.xushi = true
  local r = {
    kind = 'xushi', text = '你按兵不动，把心思都留给了即将到来的那件事。',
    changes = {}, devDelta = 0, achNew = nil, bandUp = false, bandName = nil,
    forcedEnding = false, risk = nil, failed = false
  }
  local forcedEnding = self:checkDeath()
  if J(forcedEnding) then self._next = forcedEnding; self.phase = 'settle'; r.forcedEnding = true; return r end
  return self:_advanceRound(r)
end

function Game:_tickIllness(changes)
  local ILL = self.d.ILLNESS
  if not J(ILL) then return end
  local wj = self.diff.wj
  local dW
  if J(self.ill) then
    if self.ill.type == 'minor' then
      self.ill.left = (self.ill.left ~= nil and self.ill.left or 2) - 1
      if self.ill.left <= 0 then
        self.ill = nil
        changes[#changes + 1] = { k = 'tupo', label = '体魄', delta = 0, note = '病体自愈——小病靠养，总算过去了' }
      end
    else
      self.attrs.tupo = self:_clampA('tupo', self.attrs.tupo - OR(ILL.drainTupo, 2))
      dW = round(OR(ILL.drainWeiji, 2) * wj)
      self.attrs.weiji = self:_clampA('weiji', self.attrs.weiji + dW)
      if self.age ~= nil then self.age = self.age + 1 end
      changes[#changes + 1] = { k = 'tupo', label = '体魄', delta = -OR(ILL.drainTupo, 2), note = '沉疴缠身，病势日重，病一年老三年——须用「求医问药」' }
      changes[#changes + 1] = { k = 'weiji', label = '危机', delta = dW, note = '病中无人主事，谗言易入' }
    end
    return
  end
  local tupo = self.attrs.tupo
  local age = (self.age ~= nil) and self.age or 30
  local cred = self:_longevity()
  local effTupo = tupo + cred
  local effAge = math.max(0, age - cred)
  local p = (ILL.base ~= nil and ILL.base or 0.03) + math.max(0, 45 - effTupo) * 0.004 + math.max(0, effAge - 55) * 0.004
  if self:_stream('ill')() >= math.min(0.35, p) then return end
  local majorP = 0.2 + math.max(0, effAge - 60) * 0.01 + math.max(0, 30 - effTupo) * 0.01
  if self:_stream('ill')() < majorP then
    self.ill = { type = 'major' }
    self.attrs.tupo = self:_clampA('tupo', tupo - OR(ILL.onsetTupo, 5))
    dW = round(OR(ILL.onsetWeiji, 3) * wj)
    self.attrs.weiji = self:_clampA('weiji', self.attrs.weiji + dW)
    changes[#changes + 1] = { k = 'tupo', label = '体魄', delta = -OR(ILL.onsetTupo, 5), note = '沉疴骤至，一病不起——非「求医问药」不能愈' }
    changes[#changes + 1] = { k = 'weiji', label = '危机', delta = dW, note = '病榻之侧，人心浮动' }
  else
    self.ill = { type = 'minor', left = 2 }
    self.attrs.tupo = self:_clampA('tupo', tupo - 2)
    dW = round(1 * wj)
    self.attrs.weiji = self:_clampA('weiji', self.attrs.weiji + dW)
    changes[#changes + 1] = { k = 'tupo', label = '体魄', delta = -2, note = '偶感风寒——静养两轮可自愈，亦可即服「求医问药」' }
    if J(dW) then changes[#changes + 1] = { k = 'weiji', label = '危机', delta = dW, note = '病中耳目闭塞' } end
  end
end

function Game:_scaleActionEff(eff, n)
  local scaled = deepCopy(eff or {})
  if not J(scaled.attrs) or n <= 1 then return scaled end
  local div = 2 ^ (n - 1)
  for k, v in pairs(scaled.attrs) do
    if k == 'weiji' then
      if v < 0 then scaled.attrs[k] = math.min(-1, -math.floor(math.abs(v) / div)) end
    elseif v > 0 then
      scaled.attrs[k] = math.max(1, math.floor(v / div))
    end
  end
  return scaled
end

---------- ---------- 事件进入钩子 ---------- ----------

function Game:onEventEnter()
  local ev = self:findEvent(self.eventId)
  if not J(ev) or not J(ev.enterEffects) then return end
  if J(ev.enterOnce) then
    if self._once[ev.enterOnce] then return end
    self._once[ev.enterOnce] = true
  end
  for i = 1, #ev.enterEffects do
    local ef = ev.enterEffects[i]
    if not (J(ef['if']) and not self:check(ef['if']).ok) then
      if J(ef.setFlags) then
        for j = 1, #ef.setFlags do self.flags[ef.setFlags[j]] = true end
      end
      if J(ef.attrs) then
        for k, v in pairs(ef.attrs) do self.attrs[k] = self:_clampA(k, self.attrs[k] + v) end
      end
      if J(ef.zg) then self.zg = clamp(self.zg + ef.zg) end
      if ef.zgSet ~= nil then self.zg = clamp(ef.zgSet) end
    end
  end
end

function Game:_burnKey(i) return tostring(self.chapterIdx) .. ':' .. tostring(self.eventId) .. ':' .. tostring(i) end

function Game:_readOnce(s)
  local once = shallow(s.once or {})
  local flags = self.flags or {}
  for k in pairs(flags) do
    if string.sub(k, 1, 1) == '_' then
      once[k] = true
      flags[k] = nil
    end
  end
  return once
end

function Game:_indexActions()
  local m = {}
  local acts = self.d.ACTIONS or {}
  for i = 1, #acts do m[acts[i].id] = acts[i] end
  return m
end

function Game:_actionById(id) return self._actions[id] or nil end

function Game:_hasOpenOption()
  local opts = self:getOptions()
  for i = 1, #opts do if not opts[i].locked then return true end end
  return false
end

---------- ---------- 选项列表 ---------- ----------

function Game:getOptions()
  local ev = self:findEvent(self.eventId)
  if not J(ev) or not J(ev.options) or #ev.options == 0 then return {} end
  local r = {}
  for i = 1, #ev.options do
    local o = ev.options[i]
    local skip = false
    if self.auditHide and self.auditHide.ev == ev.id and self.auditHide.idx == (i - 1) then skip = true end
    if not skip then
      local req = o.req and shallow(o.req) or nil
      if J(o.reqAdjust) then
        req = req or {}
        for j = 1, #o.reqAdjust do
          local ra = o.reqAdjust[j]
          if not J(ra['if']) or self:check(ra['if']).ok then
            req[ra.attr] = (req[ra.attr] or 0) + ra.delta
          end
        end
      end
      local locked = false
      local reason = nil
      local risky = nil
      if self._burned[self:_burnKey(i - 1)] then
        locked = true; reason = '已试，事未谐'
      elseif req then
        local cr = self:checkRisk(req, false)
        if not cr.hardOk then locked = true; reason = cr.hardReason
        elseif cr.rate ~= nil then
          risky = { rate = o.hist and self:riskRateHist(cr.rate) or cr.rate, unmet = cr.unmet }
        end
      end
      r[#r + 1] = { opt = o, locked = locked, reason = reason, hist = (o.hist and true or false), risky = risky }
    end
  end
  return r
end

---------- ---------- 选择 ---------- ----------

function Game:choose(i)
  local ev = self:findEvent(self.eventId)
  local opts = self:getOptions()
  local entry = opts[i + 1]                              -- 契约 0-based
  if not J(ev) or not J(entry) or entry.locked then return nil end
  local o = entry.opt
  local xushiBonus = self.xushi and 10 or 0
  self.xushi = false
  local risk = nil
  if J(entry.risky) then
    risk = self:_rollRisk(math.min(70, entry.risky.rate + xushiBonus), entry.risky.unmet)
    if not risk.success then
      self._burned[self:_burnKey(i)] = true
      local fchg = self:applyEff(o.effFail or { attrs = { weiji = 5 } })
      local fEnd = self:checkDeath()
      if J(fEnd) then self._next = fEnd; self.phase = 'settle'
      else self.phase = 'event' end
      return {
        failed = true, risk = risk,
        text = OR(o.resFail, '事与愿违。时机未到，强行为之，徒增其败。'),
        changes = fchg, devDelta = 0, achNew = nil, bandUp = false, bandName = nil,
        forcedEnding = (fEnd ~= nil and fEnd ~= false)
      }
    end
  end
  if not self.currentRandom and self.eventId then self.passedEvents[self.eventId] = true end
  local beforeBand = self:devBand()
  local changes = self:applyEff(o.eff or {})
  local devDelta0 = OR(o.eff and o.eff.dev, 0)
  if devDelta0 > 0 then
    self.chapterDev[#self.chapterDev + 1] = { ev = ev.title, t = o.t, dev = devDelta0 }
  end
  if ev.key then
    local histOpt = nil
    for x = 1, #ev.options do
      if ev.options[x].hist then histOpt = ev.options[x] end
    end
    self.keyChoices[#self.keyChoices + 1] = {
      node = OR(self.d.KEY_NODE_NAMES[ev.id], ev.title),
      you = o.t,
      hist = histOpt and histOpt.t or '—',
      isHist = (o.hist and true or false),
      dev = OR(o.eff and o.eff.dev, 0)
    }
  end
  local afterBand = self:devBand()
  local achNames = {}
  for a = 1, #(self._newAch or {}) do
    local nm = self.d.ACHIEVEMENTS[self._newAch[a]]
    if J(nm) then achNames[#achNames + 1] = nm end
  end
  local forcedEnding = self:checkDeath()
  self._next = OR(forcedEnding, self:resolveTo(o.to))
  self.phase = 'settle'
  return {
    text = OR(o.res, ''),
    changes = changes,
    devDelta = OR(o.eff and o.eff.dev, 0),
    achNew = (#achNames > 0) and table.concat(achNames, '、') or nil,
    bandUp = (afterBand > beforeBand),
    bandName = self.d.DEV_BANDS[afterBand + 1].name,
    forcedEnding = (forcedEnding ~= nil and forcedEnding ~= false),
    risk = risk
  }
end

---------- ---------- 死亡判定 ---------- ----------

function Game:checkDeath()
  if J(self.d.ILLNESS) and self.attrs.tupo <= 0 then
    if self.diff.lethal then
      local dd = self.d.ILLNESS.death or { ending = 'E8' }
      return { type = 'ending', ending = dd.ending, variant = dd.variant or nil }
    end
    self.attrs.tupo = 1
  end
  if self.attrs.weiji < 100 then return nil end
  if self.diff.lethal then
    return { type = 'ending', ending = 'E8', variant = (self.zg >= 70) and 'zuzhu' or 'cike' }
  end
  self._weijiClamp = self.attrs.weiji - 95
  self.attrs.weiji = 95
  return nil
end

---------- ---------- 效果结算 ---------- ----------

function Game:applyEff(eff)
  local changes = {}
  local names = self.d.ATTR_NAMES
  self._newAch = {}
  if J(eff.attrs) then
    for k, v0 in pairs(eff.attrs) do
      local v = v0
      if k == 'weiji' and v > 0 then v = round(v * self.diff.wj) end
      local old = self.attrs[k]
      self:_setAttrRaw(k, self.attrs[k] + v)
      local d = self.attrs[k] - old
      if d == 0 then
        -- 实际生效为零,不列条目
      else
        local chg = { k = k, label = names[k], delta = d }
        if eff.notes and eff.notes[k] then chg.note = eff.notes[k] end
        changes[#changes + 1] = chg
      end
    end
  end
  if J(eff.setAttrs) then
    for k, sv in pairs(eff.setAttrs) do
      local old = self.attrs[k]
      self:_setAttrRaw(k, sv)
      local d = self.attrs[k] - old
      if d ~= 0 then changes[#changes + 1] = { k = k, label = names[k], delta = d } end
    end
  end
  if J(eff.condAttrs) then
    for i = 1, #eff.condAttrs do
      local ca = eff.condAttrs[i]
      if not (J(ca['if']) and not self:check(ca['if']).ok) then
        for k, v0 in pairs(ca.attrs or {}) do
          local v = v0
          if k == 'weiji' and v > 0 then v = round(v * self.diff.wj) end
          local old = self.attrs[k]
          self:_setAttrRaw(k, self.attrs[k] + v)
          local d = self.attrs[k] - old
          if d ~= 0 then
            changes[#changes + 1] = { k = k, label = names[k], delta = d, note = ca.note }
          end
        end
      end
    end
  end
  if eff.dev ~= nil and eff.dev > 0 then                  -- JS: undefined > 0 为 false;Lua nil 比较直接报错
    self.dev = math.min(100, self.dev + eff.dev)
  end
  if J(eff.flags) then
    for i = 1, #eff.flags do self.flags[eff.flags[i]] = true end
  end
  if J(eff.rmflags) then
    for i = 1, #eff.rmflags do self.flags[eff.rmflags[i]] = nil end
  end
  if J(eff.zg) then self.zg = clamp(self.zg + eff.zg) end
  if eff.zgSet ~= nil then self.zg = clamp(eff.zgSet) end
  if J(eff.hist) then self.histScore = self.histScore + eff.hist end
  if J(eff.merit) and inList(self.merits, eff.merit) == 0 then
    self.merits[#self.merits + 1] = eff.merit
  end
  if J(eff.ach) then
    if type(eff.ach) == 'string' then
      self:unlockAch(eff.ach)
    elseif J(eff.ach.id) and (not J(eff.ach['if']) or self:check(eff.ach['if']).ok) then
      self:unlockAch(eff.ach.id)
    end
  end
  local wj = self.diff.wj
  local dT
  local P = self.d.PERSIST
  local jxFrom2 = (P and P.junxinFrom ~= nil) and P.junxinFrom or 0
  local shichongOn2 = not (P and P.junxinShichong == false)
  if self.attrs.quanshi >= 80 and not self._once._caizhi then
    self._once._caizhi = true
    dT = round(8 * wj)
    self.attrs.weiji = clamp(self.attrs.weiji + dT)
    changes[#changes + 1] = { k = 'weiji', label = '危机', delta = dT, note = '权势过盛，君主猜忌' }
  end
  if self.attrs.junxin <= 15 and shichongOn2 and self.chapterIdx >= jxFrom2 and not self._once._shichong then
    self._once._shichong = true
    dT = round(10 * wj)
    self.attrs.weiji = clamp(self.attrs.weiji + dT)
    changes[#changes + 1] = { k = 'weiji', label = '危机', delta = dT, note = '失宠于上' }
  end
  if self.attrs.caifu <= 0 and not self._once._menke then
    self._once._menke = true
    self.attrs.shengwang = clamp(self.attrs.shengwang - 5)
    changes[#changes + 1] = { k = 'shengwang', label = '声望', delta = -5, note = '门客散去' }
  end
  if self.attrs.weiji >= 70 and not self._once._liuyan then
    self._once._liuyan = true
    changes[#changes + 1] = { k = 'weiji', label = '危机', delta = 0, note = '流言四起，你已身处流言中心' }
  end
  if self.attrs.weiji >= 90 and not self._once._mingxuan then
    self._once._mingxuan = true
    changes[#changes + 1] = { k = 'weiji', label = '危机', delta = 0, note = '命悬一线' }
  end
  return changes
end

function Game:unlockAch(id)
  if inList(self.ach, id) > 0 then return false end
  self.ach[#self.ach + 1] = id
  if self._newAch then self._newAch[#self._newAch + 1] = id end
  return true
end

---------- ---------- 路由 ---------- ----------

function Game:resolveTo(to)
  if to == nil then return { type = 'none' } end
  if type(to) == 'string' then
    if to == 'NEXT' then return { type = 'chapterEnd' } end
    if to == 'RETURN' then return { type = 'return' } end
    return { type = 'event', eventId = to }
  end
  if #to > 0 or next(to) == nil then
    -- JSON 数组转 Lua 后恒为序列;空数组等价 JS 空数组(循环不进入→兜底)
    for i = 1, #to do
      if not J(to[i]['if']) or self:check(to[i]['if']).ok then return self:resolveTo(to[i].to) end
    end
    return { type = 'ending', ending = 'E8' }
  end
  if J(to.ending) then return { type = 'ending', ending = to.ending, variant = to.variant or nil } end
  return { type = 'none' }
end

function Game:proceed()
  local n = self._next
  self._next = nil
  if not J(n) then return self:chapterEnd() end
  if n.type == 'event' then
    self.eventId = n.eventId
    self:onEventEnter()
    self.keyRoundsLeft = self.keyCardRounds
    self:beginRounds()
    return { type = 'round' }
  end
  if n.type == 'return' then
    self.eventId = self.pendingEventId
    self.pendingEventId = nil
    self.currentRandom = nil
    self._skipRandom = true
    self:onEventEnter()
    self.keyRoundsLeft = self.keyCardRounds
    self:beginRounds()
    return { type = 'round', resumed = true }
  end
  if n.type == 'ending' then
    self:finishEnding(n.ending, n.variant)
    return { type = 'ending' }
  end
  if n.type == 'chapterEnd' then return self:chapterEnd() end
  self:beginRounds()
  return { type = 'round' }
end

function Game:correctionEff(c)
  local eff = deepCopy(c.eff or {})
  local corr = self.diff.corr
  if J(eff.attrs) and corr ~= 1 then
    for k, v in pairs(eff.attrs) do
      if k ~= 'weiji' and J(v) then eff.attrs[k] = round(v * corr) end
    end
  end
  return eff
end

---------- ---------- 章末 ---------- ----------

function Game:chapterEnd()
  local ch = self:chapter()
  if J(ch.endEvents) and not self._endEventsChecked then
    self._endEventsChecked = true
    local kept = {}
    for i = 1, #ch.endEvents do
      local e = ch.endEvents[i]
      if self:check(e['if']).ok then kept[#kept + 1] = e end
    end
    self.pendingEndEvents = kept
  end
  if #self.pendingEndEvents > 0 then
    self.currentEndEvent = table.remove(self.pendingEndEvents, 1)
    self.phase = 'endEvent'
    return { type = 'endEvent', event = self.currentEndEvent }
  end
  self._endEventsChecked = false
  local band = self:devBand()
  if band > 0 then
    local pool = {}
    for i = 1, #self.d.CORRECTIONS do
      local c = self.d.CORRECTIONS[i]
      if self.dev >= c.minDev and self.dev <= c.maxDev then pool[#pool + 1] = c end
    end
    if #pool > 0 then
      local total2 = 0
      for i = 1, #pool do total2 = total2 + pool[i].chance end
      local c = nil
      if total2 > 0 then
        local pick2 = self:_stream('corr')() * total2
        local acc2 = 0
        for ci = 1, #pool do
          acc2 = acc2 + pool[ci].chance
          if pick2 < acc2 then c = pool[ci] break end
        end
        if not J(c) then c = pool[#pool] end
      else
        c = pool[math.floor(self:_stream('corr')() * #pool) + 1]
      end
      if J(c) and (band >= 2 or self:_stream('corr')() < c.chance) then
        local changes = self:applyEff(self:correctionEff(c))
        local forced = self:checkDeath()
        self.correction = { title = c.title, segs = c.segs, changes = changes, forced = forced }
        self._corrShown = c.title
        self.phase = 'correction'
        return { type = 'correction', correction = self.correction }
      end
    end
  end
  return self:makeSummary()
end

function Game:endEventChoose(i)
  local ev = self.currentEndEvent
  local o = ev and ev.options[i + 1]
  if not J(o) then return nil end
  if o.req and not self:check(o.req).ok then return nil end
  local changes = self:applyEff(o.eff or {})
  local devDelta0 = OR(o.eff and o.eff.dev, 0)
  if devDelta0 > 0 then
    self.chapterDev[#self.chapterDev + 1] = { ev = ev.title, t = o.t, dev = devDelta0 }
  end
  self.currentEndEvent = nil
  local forcedEnding = self:checkDeath()
  local r = { text = o.res, changes = changes, devDelta = OR(o.eff and o.eff.dev, 0), forcedEnding = (forcedEnding ~= nil and forcedEnding ~= false) }
  if J(forcedEnding) then
    self._next = forcedEnding
  elseif J(o.to) then
    self._next = self:resolveTo(o.to)
  else
    self._next = nil
  end
  self.phase = 'settle'
  return r
end

function Game:proceedAfterEndEvent()
  if J(self._next) then return self:proceed() end
  return self:chapterEnd()
end

function Game:correctionContinue()
  if self.correction and self.correction.forced then
    self:finishEnding(self.correction.forced.ending, self.correction.forced.variant)
    return { type = 'ending' }
  end
  self.correction = nil
  return self:makeSummary()
end

function Game:makeSummary()
  local snapAttrs = (self.snapshot and self.snapshot.attrs) or self.d.INIT
  local attrDelta = {}
  for k in pairs(self.d.ATTR_NAMES) do
    local base = snapAttrs[k]
    local d = self.attrs[k] - (base ~= nil and base or 0)
    if d ~= 0 then attrDelta[k] = d end
  end
  if self._weijiClamp ~= 0 then
    attrDelta.weiji = (attrDelta.weiji or 0) - self._weijiClamp
    self._weijiClamp = 0
  end
  local nIdx = self.chapterIdx + 2
  local nxt = self.d.CHAPTERS[nIdx]
  self.phase = 'summary'
  local ch = self:chapter()
  return {
    type = 'summary',
    summary = {
      chapter = ch.title,
      devLog = copyArr(self.chapterDev),
      attrDelta = attrDelta,
      corrTitle = self._corrShown,
      notes = ch.summaryNotes or {},
      nextTitle = nxt and nxt.title or nil,
      bandName = self.d.DEV_BANDS[self:devBand() + 1].name,
      dev = self.dev
    }
  }
end

function Game:proceedSummary() return self:nextChapter() end

function Game:nextChapter()
  if self.chapterIdx + 1 < #self.d.CHAPTERS then
    self:enterChapter(self.chapterIdx + 1)
    return { type = 'chapter', chapter = self:chapter() }
  end
  return { type = 'none' }
end

---------- ---------- 回溯 ---------- ----------

local function isFin(v)
  return type(v) == 'number' and v == v and v ~= math.huge and v ~= -math.huge
end

function Game:canBacktrack()
  if self.phase == 'home' then return false end
  if self.phase == 'ending' then return false end
  if self.diff.backtrack == 0 then return false end
  if self.diff.backtrack > 0 and self.backtracksThisChapter >= self.diff.backtrack then return false end
  return J(self.snapshot)
end

function Game:backtrack()
  if not self:canBacktrack() then return false end
  local s = self.snapshot
  local keepDev = math.max(s.dev, self.dev)
  local keepAch = copyArr(self.ach)
  self.attrs = shallow(s.attrs)
  self.flags = shallow(s.flags)
  self._once = self:_readOnce(s)
  self.histScore = s.histScore
  self.merits = copyArr(s.merits)
  self.ach = copyArr(s.ach)
  for i = 1, #keepAch do
    if inList(self.ach, keepAch[i]) == 0 then self.ach[#self.ach + 1] = keepAch[i] end
  end
  self.keyChoices = copyArr(s.keyChoices)
  self.peak = shallow(s.peak)
  self.zg = (s.zg ~= nil) and s.zg or self.zg
  self.dev = keepDev
  self.eventId = s.eventId
  self.pendingEventId = s.pendingEventId or nil
  self.currentRandom = s.currentRandom or nil
  self._crisisPlotPending = (s.crisisPlotPending ~= nil and s.crisisPlotPending ~= false)
  self.keyRoundsLeft = (s.keyRoundsLeft ~= nil) and s.keyRoundsLeft or self.keyCardRounds
  self.actionUses = shallow(s.actionUses or {})
  self.passedEvents = shallow(s.passed or {})
  self.xushi = false
  self._burned = {}
  self.age = (s.age ~= nil) and s.age or self.age
  self.ill = s.ill and shallow(s.ill) or nil
  self.introNotes = copyArr(s.introNotes or {})
  self.coef = isFin(s.coef) and s.coef or self.coef
  self.offer = nil
  self.backtracksThisChapter = self.backtracksThisChapter + 1
  self.coef = round(self.coef * 0.98 * 100) / 100
  self.pendingEndEvents = {}
  self.currentEndEvent = nil
  self.correction = nil
  self._endEventsChecked = false
  self.chapterDev = {}
  self._corrShown = nil
  self._backlashDone = false
  self.ending = nil
  self.randomCount = 0
  self.chapterDeck = self:_buildChapterDeck(self.chapterIdx)
  self._skipRandom = false
  self.phase = 'intro'
  return true
end

---------- ---------- 跨会话存档 ---------- ----------

function Game:exportSave()
  if self.d.SCENARIO and self.d.SCENARIO.noSave then return nil end
  if self.diff.backtrack == 0 then return nil end
  if not J(self.snapshot) then return nil end
  local s = deepCopy(self.snapshot)
  s.currentRandomId = self.snapshot.currentRandom and self.snapshot.currentRandom.id or nil
  s.currentRandom = nil
  return {
    diffKey = self.diffKey, scenKey = self.d.SCENARIO.id, chapterIdx = self.chapterIdx,
    snapshot = s, backtracksThisChapter = self.backtracksThisChapter
  }
end

function Game:_eventResolvable(id)
  if J(self:findEvent(id)) then return true end
  return J(self:_findInsertEvent(id))
end

function Game:_findInsertEvent(id)
  local pools = { self.d.RANDOM_EVENTS or {} }
  if J(self.d.CRISIS_EVENTS) then
    pools[#pools + 1] = self.d.CRISIS_EVENTS.plots or {}
    if J(self.d.CRISIS_EVENTS.death) then pools[#pools + 1] = { self.d.CRISIS_EVENTS.death } end
    if J(self.d.CRISIS_EVENTS.qingsuan) then pools[#pools + 1] = { self.d.CRISIS_EVENTS.qingsuan } end
  end
  for i = 1, #pools do
    for j = 1, #pools[i] do
      if pools[i][j].id == id then return pools[i][j] end
    end
  end
  return nil
end

function Game:importSave(obj)
  if type(obj) ~= 'table' then return false end
  if obj.diffKey ~= self.diffKey then return false end
  if obj.scenKey ~= nil and obj.scenKey ~= self.d.SCENARIO.id then return false end
  if type(obj.chapterIdx) ~= 'number' or not J(self.d.CHAPTERS[obj.chapterIdx + 1]) then return false end
  local s = obj.snapshot
  if not J(s) or not J(s.attrs) then return false end
  if #s.attrs > 0 then return false end                       -- Array.isArray(attrs) 拒收(非空数组可判;空表歧义仅涉脏档拒收,不涉玩法)
  self.chapterIdx = obj.chapterIdx
  for _, v in pairs(s.attrs) do if type(v) ~= 'number' or not isFin(v) then return false end end
  if s.dev ~= nil and (type(s.dev) ~= 'number' or not isFin(s.dev) or s.dev < 0) then return false end
  if s.ach ~= nil and type(s.ach) ~= 'table' then return false end
  local bt = obj.backtracksThisChapter
  if bt == nil then bt = 0 end
  if type(bt) ~= 'number' or not isFin(bt) or bt ~= math.floor(bt) or bt < 0 then return false end
  if self.diff.backtrack > 0 and bt > self.diff.backtrack then return false end
  if s.age ~= nil and (type(s.age) ~= 'number' or not isFin(s.age) or s.age < 0) then return false end
  if s.ill ~= nil and (type(s.ill) ~= 'table' or (s.ill.type ~= 'minor' and s.ill.type ~= 'major')) then return false end
  local function numRange(v, lo, hi) return isFin(v) and v >= lo and v <= hi end
  if s.histScore ~= nil and not isFin(s.histScore) then return false end
  if s.peak ~= nil and type(s.peak) ~= 'table' then return false end
  if J(s.peak) then
    for _, pv in pairs(s.peak) do if not numRange(pv, 0, 1000) then return false end end
  end
  if s.zg ~= nil and not numRange(s.zg, 0, 100) then return false end
  if s.merits ~= nil and type(s.merits) ~= 'table' then return false end
  if s.keyChoices ~= nil and type(s.keyChoices) ~= 'table' then return false end
  if s.flags ~= nil and type(s.flags) ~= 'table' then return false end
  if s.actionUses ~= nil and type(s.actionUses) ~= 'table' then return false end
  if s.passed ~= nil and type(s.passed) ~= 'table' then return false end
  if s.keyRoundsLeft ~= nil and (not isFin(s.keyRoundsLeft) or s.keyRoundsLeft < 0) then return false end
  local attrs2 = shallow(s.attrs)
  for ak2 in pairs(attrs2) do
    if not J(self.d.ATTR_NAMES[ak2]) then return false end
    if not numRange(attrs2[ak2], 0, self:attrMax(ak2)) then return false end
  end
  for ak3 in pairs(self.d.ATTR_NAMES) do
    if attrs2[ak3] == nil then
      attrs2[ak3] = self:_clampA(ak3, (self.d.INIT[ak3] ~= nil) and self.d.INIT[ak3] or 0)
    end
  end
  local evId = s.eventId
  if evId ~= nil and not self:_eventResolvable(evId) then evId = nil end
  local pendId = (s.pendingEventId ~= nil and self:_eventResolvable(s.pendingEventId)) and s.pendingEventId or nil
  if evId == nil and pendId == nil then
    local ch2 = self:chapter()
    local start2 = ch2.start
    if J(ch2.startAlt) then
      for sa = 1, #ch2.startAlt do
        if self:check(ch2.startAlt[sa]['if']).ok then start2 = ch2.startAlt[sa].start break end
      end
    end
    evId = (J(start2) and self:_eventResolvable(start2)) and start2
        or ((ch2.events[1] and ch2.events[1].id) or nil)
    if evId == nil then return false end
  end
  self.attrs = attrs2
  self.dev = s.dev or 0
  self.flags = shallow(s.flags or {})
  self._once = self:_readOnce(s)
  self.histScore = s.histScore or 0
  self.merits = copyArr(s.merits or {})
  local keepAch = copyArr(self.ach)
  self.ach = copyArr(s.ach or {})
  for i = 1, #keepAch do
    if inList(self.ach, keepAch[i]) == 0 then self.ach[#self.ach + 1] = keepAch[i] end
  end
  self.keyChoices = copyArr(s.keyChoices or {})
  self.peak = shallow(s.peak or {})
  if self.peak.quanshi == nil then self.peak.quanshi = 0 end
  if self.peak.junxin == nil then self.peak.junxin = 0 end
  self.zg = (s.zg ~= nil) and s.zg
      or ((self.d.HIDDEN and self.d.HIDDEN.init ~= nil) and self.d.HIDDEN.init or 30)
  self.eventId = evId
  self.pendingEventId = pendId
  self._crisisPlotPending = (s.crisisPlotPending ~= nil and s.crisisPlotPending ~= false)
  self.keyRoundsLeft = (s.keyRoundsLeft ~= nil) and s.keyRoundsLeft or self.keyCardRounds
  self.actionUses = shallow(s.actionUses or {})
  self.passedEvents = shallow(s.passed or {})
  self.age = (s.age ~= nil) and s.age or ((self.d.AGE and self.d.AGE.init ~= nil) and self.d.AGE.init or nil)
  self.ill = s.ill and shallow(s.ill) or nil
  self.introNotes = copyArr(s.introNotes or {})
  self.coef = isFin(s.coef) and s.coef or 1
  self.offer = nil
  self._chapterStartId = pendId or evId or nil
  local rid = s.currentRandomId or nil
  local rev = rid and self:_findInsertEvent(rid) or nil
  if rid and not J(rev) then
    self.eventId = self.pendingEventId or self.eventId
    self.pendingEventId = nil
  end
  self.currentRandom = rev
  self.backtracksThisChapter = bt
  self.randomCount = 0
  self.chapterDeck = self:_buildChapterDeck(self.chapterIdx)
  self.chapterDev = {}
  self._corrShown = nil
  self._backlashDone = false
  self.pendingEndEvents = {}
  self.currentEndEvent = nil
  self.correction = nil
  self._endEventsChecked = false
  self._newAch = {}
  self._skipRandom = false
  self.snapshot = self:makeSnapshot()
  self.phase = 'intro'
  return true
end

---------- ---------- 结局 ---------- ----------

function Game:finishEnding(id, variant)
  self._newAch = {}
  local def0 = self.d.ENDINGS[id]
  local achIds = copyArr((def0 and def0.ach) or {})
  if def0 and J(def0.variantAch) and J(variant) and J(def0.variantAch[variant]) then
    local va = def0.variantAch[variant]
    for i = 1, #va do achIds[#achIds + 1] = va[i] end
  end
  if def0 and def0.nitian and J(self.d.ACHIEVEMENTS) and J(self.d.ACHIEVEMENTS.nitian) then
    achIds[#achIds + 1] = 'nitian'
  end
  for i = 1, #achIds do self:unlockAch(achIds[i]) end
  self.ending = self:buildEnding(id, variant)
  local names = {}
  for a = 1, #(self._newAch or {}) do
    local nm = self.d.ACHIEVEMENTS[self._newAch[a]]
    if J(nm) then names[#names + 1] = nm end
  end
  self.ending.achNew = (#names > 0) and table.concat(names, '、') or nil
  self.phase = 'ending'
end

function Game:buildEnding(id, variant)
  local def = self.d.ENDINGS[id]
  if not J(def) then
    local fb = self.d.ENDINGS.E8
    def = fb or { id = id, name = '终局', zhuan = '史笔至此中断。', cuncun = 0, seal = 'xunshi', epilogue = '' }
    id = 'E8'
    variant = nil
  end
  local v = (J(variant) and J(def.variants)) and def.variants[variant] or nil
  local meritScore = 0
  local meritMap = self.d.MERIT_MAP or { ['长史'] = 5, ['廷尉'] = 8, ['丞相'] = 20, ['郡县'] = 15, ['书同文'] = 15 }
  for i = 1, #self.merits do
    meritScore = meritScore + (meritMap[self.merits[i]] or 0)
  end
  local gongye = clamp((self.peak.quanshi or 0) * 0.45 + (self.attrs.zhengji or 0) * 0.15 + meritScore)
  local cuncun = def.cuncun or 0
  local shipBonus = 0
  local sbf = self.d.SHIPING_BONUS_FLAGS or {}
  for i = 1, #sbf do
    if self.flags[sbf[i].flag] then shipBonus = shipBonus + sbf[i].bonus end
  end
  local shiping = clamp(50 + self.histScore * 0.5 + shipBonus)
  if def.seal == '循史' then shiping = math.max(shiping, 35) end
  local yingxiang = clamp(self.dev * 0.6 + gongye * 0.4)
  local raw = 0.30 * gongye + 0.30 * cuncun + 0.20 * shiping + 0.20 * yingxiang
  local total = raw * self.diff.coef * (def.nitian and 1.15 or 1) * (self.coef or 1)
  total = round(total)
  if not isFin(total) then total = 0 end
  local grade = (total >= 85 and 'S') or (total >= 70 and 'A') or (total >= 55 and 'B') or (total >= 40 and 'C') or 'D'
  local devC = self.dev
  local epilogue
  if devC <= 20 then
    epilogue = '你完整复刻了他的一生，包括他的错误。史书翻到今天，仍写着你的名字与骂名。历史给了你所有提示，你决定照抄一遍——这也是一种玩法。'
  elseif devC <= 45 then
    epilogue = '你在大势之内做了几次小小的挣扎。史书的正文没有变，但字里行间，多了几处只有你知道的批注。'
  else
    epilogue = '史官的笔追不上你。从某个抉择开始，这就成了一段无人见过的新历史——无论结局如何，它属于你。'
  end
  local zhuan = v and v.zhuan or def.zhuan
  if J(def.zhuanAppends) then
    for i = 1, #def.zhuanAppends do
      local za = def.zhuanAppends[i]
      if not J(za['if']) or self:check(za['if']).ok then zhuan = zhuan .. za.text end
    end
  end
  zhuan = OR(zhuan, OR(def.zhuan, ''))
  if (id == 'E4' or id == 'E6') and self.flags.zhezhong then
    zhuan = zhuan .. '史又曰：焚书之议起，斯以官藏代焚，典籍得不绝于灰烟。天下读书人受其赐而不知，斯亦终不自言。'
  end
  local an = def.aliveNote or self.d.ALIVE_NOTE
  local aliveNote = (J(an) and self.flags[an.flag]) and an.text or nil
  return {
    id = id, variant = variant,
    name = (v and v.name) or def.name,
    seal = def.seal,
    zhuan = zhuan,
    nitian = def.nitian,
    aliveNote = aliveNote,
    scores = { gongye = gongye, cuncun = cuncun, shiping = shiping, yingxiang = yingxiang },
    merits = copyArr(self.merits),
    dev = self.dev,
    total = total, grade = grade,
    diffName = self.diff.n,
    review = copyArr(self.keyChoices),
    epilogue = epilogue
  }
end

---------- ---------- 随机际遇 ---------- ----------

function Game:maybeRandom()
  if self._skipRandom then self._skipRandom = false; return nil end
  local inPlay = (self.phase == 'event' or self.phase == 'round')
  if self._crisisPlotPending and inPlay and not self.currentRandom then
    local ppool = (self.d.CRISIS_EVENTS and self.d.CRISIS_EVENTS.plots) or {}
    if #ppool > 0 then
      self._crisisPlotPending = false
      local pev = ppool[math.floor(self:_stream('event')() * #ppool) + 1]
      self.pendingEventId = self.eventId
      self.eventId = pev.id
      self.currentRandom = pev
      self.phase = 'event'
      return pev
    end
  end
  if not self.randomOn then return nil end
  if not inPlay or self.currentRandom then return nil end
  if not self._backlashDone and self:devBand() >= 3 then
    self._backlashDone = true
    local bpool = {}
    for i = 1, #self.d.CORRECTIONS do
      local c = self.d.CORRECTIONS[i]
      if c.minDev >= 71 then bpool[#bpool + 1] = c end
    end
    if #bpool > 0 then
      local bc = bpool[math.floor(self:_stream('event')() * #bpool) + 1]
      local bev = { id = 'BACKLASH', title = bc.title, segs = bc.segs,
        options = { { t = '咬牙撑住', res = '你挺过了这一波反噬——代价已经付清，路还要继续走。', eff = self:correctionEff(bc), to = 'RETURN' } } }
      self.pendingEventId = self.eventId
      self.eventId = bev.id
      self.currentRandom = bev
      self.phase = 'event'
      return bev
    end
  end
  if self.randomCount >= self.randomMax or #self.chapterDeck == 0 then return nil end
  if self:_stream('event')() >= self.randomChance then return nil end
  local idx = math.floor(self:_stream('event')() * #self.chapterDeck) + 1
  local ev = table.remove(self.chapterDeck, idx)
  if J(ev.cond) and not self:check(ev.cond).ok then return nil end
  self.pendingEventId = self.eventId
  self.eventId = ev.id
  self.currentRandom = ev
  self.randomCount = self.randomCount + 1
  self.phase = 'event'
  return ev
end

---------- ---------- 状态词 ---------- ----------

function Game:attrWord(k)
  local def = nil
  local attrs = self.d.ATTRS
  for i = 1, #attrs do if attrs[i].k == k then def = attrs[i] end end
  local v = self.attrs[k]
  for i = 1, #def.words do if v >= def.words[i][1] then return def.words[i][2] end end
  return def.words[#def.words][2]
end

function Game:zgWord()
  local words = (self.d.HIDDEN and self.d.HIDDEN.words)
      or { { 70, '杀机毕露' }, { 50, '图穷匕见' }, { 35, '隐约不安' }, { 0, '敛迹藏锋' } }
  for i = 1, #words do if self.zg >= words[i][1] then return words[i][2] end end
  return words[#words][2]
end

return {
  Game = Game,
  NewGame = NewGame,
  KEY_CARD_ROUNDS = KEY_CARD_ROUNDS,
  riskWord = riskWord
}
