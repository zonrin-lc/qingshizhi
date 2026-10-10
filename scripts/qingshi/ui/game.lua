-- qingshi/ui/game.lua —— 纸墨对局渲染与路由(对应 JS ui-round/ui-event/ui-overlays/ui-ending)
-- 卡面数字改写(cardDesc)/立绘行/雷达图为后续批次;核心循环全通。
local UI = require("urhox-libs/UI")
local T = require("qingshi/ui/theme")
local Store = require("qingshi/store")
local Radar = require("qingshi/ui/radar")

local M = {}

-- 立绘资源:头部角色有图,其余优雅降级(无图时背景留纸底)
local CHAR_IMG = {
  ['李斯'] = 'lisi', ['荆轲'] = 'jingke', ['韩信'] = 'hanxin', ['项羽'] = 'xiangyu', ['陈胜'] = 'chensheng',
  ['赵高'] = 'zhaogao', ['嬴政'] = 'yingzheng', ['韩非'] = 'hanfei', ['蒙恬'] = 'mengtian',
  ['扶苏'] = 'fusu', ['胡亥'] = 'huhai', ['章邯'] = 'zhanghan', ['萧何'] = 'xiaohe',
}

local BAND_WARNS = {
  ['微澜'] = '史书提示：偏离度已入「微澜」——史书的正文尚未改，页边已多了几行你的批注。',
  ['改流'] = '史书提示：偏离度已入「改流」——河已改道，史官的笔开始跟不上你了。',
  ['逆天'] = '史书提示：偏离度已入「逆天」——这是一段无人见过的新历史，天命将以反噬索价。',
}

function M.attach(Shell)
  local env = Shell.env
  local C = T.COLOR
  local g = function() return env.game end
  local S = Shell
  local mainAdd = function(w) env.mainBox:AddChild(w) end
  local segW = function(text) return T.richSeg(text, { onGloss = function(t) M.showGloss(t) end }) end
  local noteW = function(text) return T.lbl { t = text, size = T.FS.note, color = C.qing, mb = 6 } end

  -- 按 UTF-8 字符截断(string.sub 按字节切会碎中文,见 theme.VText 注)
  local function truncChars(s, maxChars)
    local n = utf8.len(s)
    if not n then return s end                        -- 非法 UTF-8 原样返回
    if n <= maxChars then return s end
    return string.sub(s, 1, utf8.offset(s, maxChars + 1) - 1) .. '…'
  end

  -- ---------- 右栏:立绘背景 + 自身雷达 + 身外属性 ----------

  local function currentSpeaker(texts)
    local best = nil
    for _, s in ipairs(texts or {}) do
      for name in tostring(s):gmatch('⟦(.-)⟧') do
        if CHAR_IMG[name] then best = name break end
      end
      if best then break end
    end
    return best
  end

  -- 右栏 tab:图鉴已按需求隐藏,只留属性。
  -- 恢复时把下面这行换回:{ k = 'attrs', n = '属 性' }, { k = 'gloss', n = '图 鉴' }
  local SIDE_TABS = { { k = 'attrs', n = '属 性' } }

  local function renderSideTabs()
    -- 兜底:sideTab_ 指向已隐藏的页签(如旧会话的 gloss)时回到属性
    local valid = false
    for _, t in ipairs(SIDE_TABS) do if t.k == env.sideTab_ then valid = true end end
    if env.sideTab_ and valid then return end
    env.sideTab_ = 'attrs'
    local bar = env.sideCol:GetChildAt(1)
    local function paint()
      T.destroyChildren(bar)
      for _, t in ipairs(SIDE_TABS) do
        local on = (env.sideTab_ == t.k)
        bar:AddChild(UI.Panel {
          flexGrow = 1, flexBasis = 0, paddingTop = 9, paddingBottom = 9,
          alignItems = "center", justifyContent = "center", pointerEvents = "auto",
          borderBottomWidth = on and 2 or 0, borderColor = C.zhu,
          onClick = function()
            if env.sideTab_ == t.k then return end
            env.sideTab_ = t.k
            paint()
            S.renderSide(env.lastTexts)
          end,
          children = { T.lbl { t = t.n, size = T.FS.note, bold = on,
            color = on and C.inkHeavy or C.inkDim, ls = 2, wrap = false } },
        })
      end
    end
    paint()
  end

  -- 正文区插图:当前说话人立绘(带名签)。无立绘的角色不插图。
  local function insertPortrait(texts)
    local gg = g()
    if not gg then return end
    local spk = currentSpeaker(texts)
    if not spk then return end
    local id = CHAR_IMG[spk]
    if not id then return end
    -- 立绘 512:768(2:3),按屏高取尺寸,保证纵向不喧宾夺主
    local ph = math.floor(graphics:GetHeight() / T.GetScale() * 0.34)
    local pw = math.floor(ph * 512 / 768)
    mainAdd(UI.Panel { width = "100%", alignItems = "center", marginTop = 10, marginBottom = 10,
      children = {
        UI.Panel { width = pw, height = ph,
          backgroundImage = "image/portraits/char_" .. id .. ".png",
          backgroundFit = "cover" },
        T.lbl { t = '— ' .. spk .. ' —', size = T.FS.cap, color = C.inkDim, mt = 4, wrap = false },
      } })
  end

  function S.renderSide(texts)
    local gg = g()
    if not gg then return end
    env.lastTexts = texts
    renderSideTabs()
    local body = env.sideCol:GetChildAt(2)
    T.destroyChildren(body)
    if env.sideTab_ == 'gloss' then
      S.openDrawer('gloss', body)
      return
    end
    local spk = currentSpeaker(texts)
    local panel = UI.Panel { width = "100%", height = "100%", flexDirection = "column",
      padding = 10, gap = 6, pointerEvents = "box-none" }
    if spk then
      panel:AddChild(T.lbl { t = '出场 ｜ ' .. spk, size = T.FS.cap, color = C.zhuHi, bold = true, wrap = false })
    end
    local SELF = { 'tupo', 'wuli', 'caixue', 'moulue', 'biancai' }
    local vals, labels = {}, {}
    for _, k in ipairs(SELF) do
      vals[#vals + 1] = gg.attrs[k] or 0
      for _, a in ipairs(gg.d.ATTRS) do if a.k == k then labels[#labels + 1] = a.n end end
    end
    panel:AddChild(UI.Panel { width = "100%", alignItems = "center", gap = 2, children = {
      T.lbl { t = '自 身', size = T.FS.cap, color = C.gold, bold = true, align = "center" },
      Radar { width = 166, height = 166, values = vals, labels = labels,
        lineColor = C.line, fillColor = { 176, 67, 47, 38 },
        strokeColor = { 176, 67, 47, 230 }, labelColor = C.inkDim },
    } })
    panel:AddChild(T.lbl { t = '身 外', size = T.FS.cap, color = C.gold, bold = true, mt = 6 })
    for _, a in ipairs(gg.d.ATTRS) do
      local isSelf = false
      for _, k in ipairs(SELF) do if a.k == k then isSelf = true break end end
      if not isSelf then
        local v = gg.attrs[a.k] or 0
        local pct = math.floor(v / gg:attrMax(a.k) * 100 + 0.5)
        if gg.diff.hideAttrs then
          local tier = #a.words
          for wi = 1, #a.words do if v >= a.words[wi][1] then tier = wi break end end
          pct = math.floor((#a.words - tier + 1) * (100 / #a.words) + 0.5)
        end
        local shown = gg.diff.hideAttrs and gg:attrWord(a.k) or tostring(v)
        panel:AddChild(UI.Panel { width = "100%", gap = 1, marginBottom = 3, children = {
          UI.Row { width = "100%", justifyContent = "space-between", children = {
            T.lbl { t = a.n, size = T.FS.cap, color = C.ink, wrap = false },
            T.lbl { t = shown, size = T.FS.cap, color = C.inkDim, wrap = false },
          } },
          UI.Panel { width = "100%", height = 5, borderRadius = 2, backgroundColor = C.track, overflow = "hidden",
            children = { UI.Panel { width = tostring(pct) .. '%', height = "100%",
              backgroundColor = a.inverse and C.zhu or C.gold } } },
        } })
      end
    end
    local meta = '偏离 ' .. tostring(gg.dev) .. '（' .. gg.d.DEV_BANDS[gg:devBand() + 1].name .. '）'
    if gg.age ~= nil then meta = meta .. ' · ' .. tostring(gg.age) .. '岁' end
    panel:AddChild(T.lbl { t = meta, size = T.FS.cap, color = C.inkDim, mt = 4, wrap = false })
    body:AddChild(panel)
  end

  function S.togglePanel()
    env.sideVisible = not env.sideVisible
    env.sideCol:SetVisible(env.sideVisible)
  end

  -- ---------- 结算浮层 ----------

  function S.showSettle(title, text, changes, devDelta, achNew, bandName, cb)
    S.renderTop()
    env.sTitle:SetText(title or '')
    env.sTitle:SetVisible((title or '') ~= '')
    T.destroyChildren(env.sText)
    env.sText:AddChild(T.richSeg(text or '', {}))
    T.destroyChildren(env.sList)
    for _, c in ipairs(changes or {}) do
      local col
      if c.k == 'weiji' then col = (c.delta > 0) and C.zhuHi or C.good
      else col = (c.delta >= 0) and C.good or C.zhuHi end
      local val
      if c.dev then
        val = '偏离 ' .. (c.delta > 0 and '+' or '') .. tostring(c.delta)
        col = C.warn
      elseif g().diff.hideAttrs then
        val = (c.label or c.k) .. ' ' .. (c.delta > 0 and '升' or '降') .. ' · ' .. tostring(g():attrWord(c.k))
      else
        val = (c.label or c.k) .. '　' .. (c.delta > 0 and '+' or '') .. tostring(c.delta)
      end
      local kids = { T.lbl { t = val, size = T.FS.ui, color = col, wrap = false } }
      if c.note then kids[2] = T.lbl { t = c.note, size = T.FS.cap, color = C.inkDim } end
      env.sList:AddChild(UI.Row { gap = 10, flexWrap = "wrap", alignItems = "center", children = kids })
    end
    if devDelta then
      env.sList:AddChild(T.lbl { t = '偏离 +' .. tostring(devDelta), size = T.FS.ui, color = C.warn })
    end
    env.sAch:SetVisible(achNew ~= nil)
    if achNew then env.sAch:SetText('成就解锁 ｜ ' .. achNew) end
    env.sBand:SetVisible(bandName ~= nil)
    if bandName then
      env.sBand:SetText(BAND_WARNS[bandName] or ('史书提示：偏离度已入「' .. bandName .. '」段。'))
    end
    env.settleCb = cb
    env.settleLayer:SetVisible(true)
  end

  local function showCorrection(c)
    S.showSettle('历史修正 ｜ ' .. c.title, table.concat(c.segs or {}, ''), c.changes, 0, nil, nil, function()
      S.handleRoute(g():correctionContinue())
    end)
  end

  -- ---------- 险招文本 ----------

  local function riskText(risky, withXushi)
    if withXushi == nil then withXushi = true end
    local xb = (withXushi and g().xushi) and 10 or 0
    local eff = math.min(70, risky.rate + xb)
    local t = g().diff.hideAttrs and ('成算 ' .. require("qingshi/engine").riskWord(eff))
        or ('成功率 ' .. eff .. '%')
    if xb > 0 then t = t .. (g().diff.hideAttrs and '（蓄势生效）' or '（含蓄势+10）') end
    local gaps = {}
    for _, u in ipairs(risky.unmet) do
      gaps[#gaps + 1] = g().diff.hideAttrs and (u.name .. '不足') or (u.name .. ' ' .. u.have .. '/' .. u.need)
    end
    return '⚠ 险招 · ' .. t .. '（' .. table.concat(gaps, '、') .. '）'
  end

  -- ---------- 路由 ----------

  function S.handleRoute(n)
    if not n then
      if g() and g().ending then M.renderEnding() else S.showHome() end
      return
    end
    local t = n.type
    if t == 'round' then
      if not n.resumed then
        local rev = g():maybeRandom()
        if rev then M.renderEvent() return end
      end
      M.renderRound()
    elseif t == 'event' then M.renderEvent()
    elseif t == 'ending' then M.renderEnding()
    elseif t == 'chapter' then M.renderIntro(false)
    elseif t == 'endEvent' then M.renderEndEvent()
    elseif t == 'correction' then showCorrection(n.correction)
    elseif t == 'summary' then M.renderSummary(n.summary)
    else
      if g() and g().ending then M.renderEnding() else S.showHome() end
    end
  end

  function S.saveGame()
    local gg = g()
    if not gg then return end
    local sv = gg:exportSave()
    if sv then Store.write(Store.saveKey(gg.d.SCENARIO.id), sv) end
  end

  -- ---------- 章首 ----------

  function S.renderIntro(fromBt)
    S.showGame()
    S.clearMain(); S.clearOpts()
    S.saveGame()
    env.lastSettleText = nil
    local ch = g():chapter()
    mainAdd(T.lbl { t = ch.sub or '', size = T.FS.note, color = C.inkDim, mb = 2 })
    mainAdd(T.lbl { t = (string.match(ch.title, '｜%s*(.+)$') or ch.title),
      size = T.FS.h2, color = C.inkHeavy, bold = true, mb = 4 })
    mainAdd(UI.Panel { width = 52, height = 2, backgroundColor = C.gold, marginBottom = 14 })
    insertPortrait(ch.intro)                 -- 正文插图:本章出场人物立绘
    local items = {}
    for _, s in ipairs(ch.intro or {}) do items[#items + 1] = segW(s) end
    for _, n in ipairs(g().introNotes or {}) do items[#items + 1] = noteW(n) end
    if fromBt then
      items[#items + 1] = noteW('【回溯】你回到了本章开头。偏离度与已解锁的成就、图鉴不会重置——做过的事，史书都记着。')
    end
    S.scrollMainTop()
    S.renderSide(ch.intro)
    S.revealSegs(items, function()
      S.clearOpts()
      env.optBox:AddChild(T.Btn { text = '继 续', variant = 'primary', size = T.FS.ui, w = 200,
        onClick = function() S.handleRoute(g():beginEvents()) end })
    end)
  end

  -- ---------- 事件页 ----------

  function M.renderEvent()
    S.showGame()
    S.clearMain(); S.clearOpts()
    local ev = g():findEvent(g().eventId)
    if not ev then
      mainAdd(T.lbl { t = '此节无处可述（章节数据不一致）。用顶栏「回溯」回到本章开头，或返回主页。', color = C.zhuHi })
      return
    end
    local ch = g():chapter()
    local isInsert = g().currentRandom ~= nil and g().currentRandom ~= false
    mainAdd(T.lbl { t = isInsert and '际遇 · 随机事件' or (string.match(ch.title, '^(.-)｜') or ch.title),
      size = T.FS.note, color = isInsert and C.zhuHi or C.inkDim })
    mainAdd(T.lbl { t = ev.title, size = T.FS.title, color = C.inkHeavy, bold = true, mb = 4 })
    mainAdd(UI.Panel { width = 44, height = 2, backgroundColor = isInsert and C.zhu or C.gold, marginBottom = 12 })
    local segs = ev.segs
    if ev.altSegs and g().flags[ev.altSegs.flag] then segs = ev.altSegs.segs end
    insertPortrait(segs)                     -- 正文插图:本事件出场人物立绘
    local items = {}
    for _, s in ipairs(segs or {}) do items[#items + 1] = segW(s) end
    S.scrollMainTop()
    S.renderSide(segs)
    S.revealSegs(items, function() M.renderOptions() end)
  end

  function M.renderOptions()
    S.clearOpts()
    local opts = g():getOptions()
    local hasHistRisk = false
    for _, o in ipairs(opts) do if o.hist and o.risky then hasHistRisk = true end end
    if hasHistRisk and not g()._taughtHistRisk then
      g()._taughtHistRisk = true
      env.optBox:AddChild(T.lbl { t = '史实选择并不保证史实结果——你继承了他的选择，却没有继承他当时的条件。',
        size = T.FS.cap, color = C.qing, mb = 6 })
    end
    for i, o in ipairs(opts) do
      local kids = { T.lbl { t = o.opt.t, size = T.FS.ui, color = o.locked and C.inkDim or C.ink } }
      local tags = {}
      if o.hist then tags[#tags + 1] = T.lbl { t = '〔史〕', size = T.FS.cap, color = C.qing, wrap = false } end
      if o.risky then tags[#tags + 1] = T.lbl { t = '⚠ 险招', size = T.FS.cap, color = C.warn, wrap = false } end
      if #tags > 0 then
        kids[#kids + 1] = UI.Row { gap = 6, children = tags }
      end
      if o.locked and o.reason then
        kids[#kids + 1] = T.lbl { t = '🔒 ' .. o.reason, size = T.FS.cap, color = C.zhuHi }
      end
      if o.risky then
        kids[#kids + 1] = T.lbl { t = riskText(o.risky), size = T.FS.cap, color = C.warn }
      end
      -- 固定一行 4 列:每张卡占 1/4 宽(不足 4 个的章节留空,由居中收拢)
      -- 锁定项必须真的「无回调」:不能用 `o.locked and nil or fn`
      -- (Lua 里 `x and nil or y` 恒等于 y,锁定项照样会挂上 handler)
      local onClick = nil
      if not o.locked then onClick = function() M.doChoose(i - 1) end end
      env.optBox:AddChild(T.Card {
        width = "24%", pad = 11, gap = 3, danger = o.risky and true or nil,
        opacity = o.locked and 0.55 or 1,
        onClick = onClick,
        children = kids,
      })
    end
  end

  function M.doChoose(i)
    local gg = g()
    local r = gg:choose(i)
    if not r then S.thawOpts('这个选项眼下走不通（已试过或条件已变）。') return end
    env.lastSettleText = r.text
    local title = r.risk and gg:riskTitle(r) or ''
    S.showSettle(title, r.text, r.changes, r.devDelta, r.achNew, r.bandUp and r.bandName or nil, function()
      if r.failed then
        if r.forcedEnding then S.handleRoute(gg:proceed()) else M.renderOptions() end
        return
      end
      S.handleRoute(gg:proceed())
    end)
  end

  -- ---------- 抉择卡(次级关键事件) ----------

  function M.renderCardChoice()
    S.showGame()
    S.clearMain(); S.clearOpts()
    local gg = g()
    local v = gg:getChoiceCard()
    print('[抉择] renderCardChoice phase=' .. tostring(gg.phase) .. ' v=' .. tostring(v ~= nil)
      .. (v and (' id=' .. tostring(v.id) .. ' segs=' .. #v.segs .. ' options=' .. #v.options) or ''))
    if not v then M.renderRound() return end
    mainAdd(T.lbl { t = '抉择 · 事有两端', size = T.FS.note, color = C.gold })
    mainAdd(T.lbl { t = v.title, size = T.FS.title, color = C.inkHeavy, bold = true, mb = 4 })
    mainAdd(UI.Panel { width = 44, height = 2, backgroundColor = C.gold, marginBottom = 12 })
    insertPortrait(v.segs)                   -- 正文插图:本抉择出场人物立绘
    local items = {}
    for _, s in ipairs(v.segs or {}) do items[#items + 1] = segW(s) end
    S.scrollMainTop()
    S.renderSide(v.segs)
    S.revealSegs(items, function()
      print('[抉择] reveal done → renderChoiceOptions')
      M.renderChoiceOptions(v)
    end)
  end

  function M.renderChoiceOptions(v)
    S.clearOpts()
    print('[抉择] renderChoiceOptions options=' .. #(v.options or {}))
    for i, o in ipairs(v.options) do
      -- 与回合页卡片同款 flex 布局:自适应宽 + wrap 文本在 Yoga 下会塌成细条(实测 21px),flex 定宽才可见
      env.optBox:AddChild(T.Card {
        flex = true, pad = 11, gap = 3,
        onClick = function() M.doChooseCardOpt(i - 1) end,
        children = { T.lbl { t = o.t, size = T.FS.ui, color = C.ink, bold = true } },
      })
    end
    env.optBox:AddChild(T.Card {
      flex = true, pad = 11, gap = 3,
      onClick = function() if g():cancelChoice() then M.renderRound() end end,
      children = { T.lbl { t = '且搁置', size = T.FS.ui, color = C.inkDim } },
    })
    S.probeOptBox = 10   -- [临时诊断] 10 帧后量取决策区尺寸
  end

  function M.doChooseCardOpt(i)
    local gg = g()
    local r = gg:chooseCardOption(i)
    if not r then S.thawOpts('这一抉择眼下走不通（状态已变）。') return end
    env.lastSettleText = r.text
    S.showSettle('抉择', r.text, r.changes, r.devDelta, r.achNew, nil, function()
      if r.forcedEnding then S.handleRoute(gg:proceed()) return end
      if r.forcedKey then M.renderEvent() return end
      S.handleRoute(r.route or { type = 'round' })
    end)
  end

  function S.thawOpts(msg)
    env.optBox:AddChild(T.lbl { t = msg or '这一步眼下无法走通——请换一条路。', size = T.FS.note, color = C.zhuHi, mt = 6 })
  end

  -- ---------- 回合页 ----------

  function M.renderRound()
    S.showGame()
    S.clearMain(); S.clearOpts()
    local gg = g()
    local offer = gg:getOffer()
    local key = nil
    for _, e in ipairs(offer) do if e.type == 'key' then key = e end end
    -- 回合页右栏维持主角立绘 + 属性(无新出场角色)
    S.renderSide({})
    mainAdd(T.lbl { t = gg:chapter().title, size = T.FS.note, color = C.inkDim, mb = 4 })
    if env.lastSettleText then
      mainAdd(T.richSeg(env.lastSettleText, { size = T.FS.ui, color = C.inkDim }))
    end
    mainAdd(UI.Panel {
      width = "100%", padding = 10, marginTop = 8, borderRadius = 8,
      backgroundColor = C.paper, borderWidth = 1, borderColor = C.lineSoft,
      children = { T.lbl { t = '经营以蓄势——关键事件「' .. (key and key.title or '') .. '」余 '
        .. (key and key.roundsLeft or 0) .. ' 轮后自动开启；届时抉择，须你亲定。'
        .. (env.lastSettleText and '' or '行动卡用完即开。'), size = T.FS.note, color = C.qing } },
    })
    for i, e in ipairs(offer) do
      if e.type == 'key' then
        local ev = gg:findEvent(e.eventId)
        local isHist = false
        if ev and ev.options then
          for _, o in ipairs(ev.options) do if o.hist then isHist = true break end end
        end
        local kids = {
          T.lbl { t = (e.inserted and '危机迫近' or '关键事件') .. ' ｜ 余 ' .. tostring(e.roundsLeft) .. ' 轮后开启',
            size = T.FS.note, color = e.inserted and C.zhuHi or C.gold },
          T.lbl { t = e.title, size = T.FS.ui, color = C.inkStrong, bold = true },
          T.lbl { t = e.inserted and '〔！〕' or (isHist and '〔史〕' or '〔！〕'), size = T.FS.cap,
            color = e.inserted and C.zhuHi or C.qing, wrap = false },
        }
        if e.enterable then
          kids[#kids + 1] = T.lbl { t = '此局已无可择之处——点此了断本章', size = T.FS.note, color = C.warn }
        end
        env.optBox:AddChild(T.Card {
          flex = true, pad = 11, gap = 3, gold = not e.inserted, danger = e.inserted, sel = e.enterable,
          onClick = e.enterable and (function() M.doPlayCard(i - 1) end) or nil,
          children = kids,
        })
      else
        local a = e.action
        local kids = {
          T.lbl { t = ((a and a.name) or tostring(e.id)) .. (e.risky and '  ⚠' or ''), size = T.FS.ui,
            color = e.locked and C.line or C.inkStrong, bold = true },
        }
        if e.choice then
          kids[#kids + 1] = T.lbl { t = '〔抉择〕', size = T.FS.cap, color = C.gold, wrap = false }
        end
        if a and a.desc then
          kids[#kids + 1] = T.lbl { t = (gg.diff.hideAttrs and a.descHidden or a.desc) or '', size = T.FS.note, color = C.inkDim }
        end
        if e.diminishing then
          kids[#kids + 1] = T.lbl { t = '已用 ' .. tostring(e.usedCount) .. ' 次 · 收益递减', size = T.FS.note, color = C.warn }
        end
        if e.locked and e.reason then
          kids[#kids + 1] = T.lbl { t = '🔒 ' .. e.reason, size = T.FS.cap, color = C.zhuHi }
        end
        if e.risky then
          kids[#kids + 1] = T.lbl { t = riskText(e.risky, false), size = T.FS.note, color = C.warn }
        end
        local cardClick = nil
        if not e.locked then cardClick = function() M.doPlayCard(i - 1) end end
        env.optBox:AddChild(T.Card {
          flex = true, pad = 11, gap = 3, danger = e.risky and true or nil,
          onClick = cardClick,
          children = kids,
          opacity = e.locked and 0.55 or 1,
        })
      end
    end
    env.optBox:AddChild(T.Card {
      flex = true, pad = 11, gap = 3,
      onClick = (not gg.xushi) and function() M.doXushi() end or nil,
      children = {
        T.lbl { t = '蓄势 · 静观其变', size = T.FS.ui, color = gg.xushi and C.qing or C.inkStrong, bold = true },
        T.lbl { t = gg.xushi and '已蓄势——下一次事件抉择的险招成功率 +10'
            or '不出手牌，为下一次事件抉择蓄一分胜算（险招成功率 +10，无险招则落空）', size = T.FS.cap, color = C.inkDim },
      },
    })
  end

  function M.doPlayCard(i)
    local gg = g()
    local r = gg:playCard(i)
    if not r then S.thawOpts('这张牌眼下走不通（门槛已变或状态不同步）。') return end
    if r.kind == 'key' then
      if r.chapterEnd then S.handleRoute(gg:proceed()) else M.renderEvent() end
      return
    end
    if r.kind == 'choice' then M.renderCardChoice() return end
    env.lastSettleText = r.text
    local title = r.risk and gg:riskTitle(r) or '行动'
    S.showSettle(title, r.text, r.changes, r.devDelta, r.achNew, nil, function()
      if r.forcedEnding then S.handleRoute(gg:proceed()) return end
      if r.forcedKey then M.renderEvent() return end
      S.handleRoute(r.route or { type = 'round' })
    end)
  end

  function M.doXushi()
    local gg = g()
    local r = gg:playXushi()
    if not r then S.thawOpts('蓄势只在一个关键事件内生效一次。') return end
    S.showSettle('蓄势', r.text, r.changes, 0, nil, nil, function()
      if r.forcedEnding then S.handleRoute(gg:proceed()) return end
      if r.forcedKey then M.renderEvent() return end
      S.handleRoute(r.route or { type = 'round' })
    end)
  end

  -- ---------- 章末事件 ----------

  function M.renderEndEvent()
    S.showGame()
    S.clearMain(); S.clearOpts()
    local ev = g().currentEndEvent
    if not ev or not ev.options or #ev.options == 0 then
      g().currentEndEvent = nil
      S.handleRoute(g():proceedAfterEndEvent())
      return
    end
    mainAdd(T.lbl { t = ev.title, size = T.FS.title, color = C.inkHeavy, bold = true, mb = 10 })
    local items = {}
    for _, s in ipairs(ev.segs or {}) do items[#items + 1] = segW(s) end
    S.scrollMainTop()
    S.renderSide(ev.segs)
    S.revealSegs(items, function()
      for i, o in ipairs(ev.options) do
        local c = o.req and g():check(o.req) or { ok = true, reason = nil }
        local kids = { T.lbl { t = o.t, size = T.FS.ui, color = c.ok and C.ink or C.line } }
        if not c.ok and c.reason then
          kids[#kids + 1] = T.lbl { t = '🔒 ' .. c.reason, size = T.FS.cap, color = C.zhuHi }
        end
        local evClick = nil
        if c.ok then
          evClick = function()
            local r = g():endEventChoose(i - 1)
            if not r then S.thawOpts('这个选项眼下走不通（条件已变）。') return end
            S.showSettle('', r.text, r.changes, r.devDelta, nil, nil, function()
              S.handleRoute(g():proceedAfterEndEvent())
            end)
          end
        end
        env.optBox:AddChild(T.Card {
          flex = true, pad = 11, gap = 3,
          onClick = evClick,
          children = kids,
          opacity = c.ok and 1 or 0.55,
        })
      end
    end)
  end

  -- ---------- 章末结算 ----------

  function M.renderSummary(s)
    S.showGame()
    S.clearMain(); S.clearOpts()
    S.scrollMainTop()                        -- 上一页可能停在渐显兜底,结算页须回卷首
    mainAdd(T.lbl { t = '章 末 结 算', size = T.FS.note, color = C.inkDim, mb = 2 })
    mainAdd(T.lbl { t = (string.match(s.chapter, '^(.-)｜') or s.chapter) .. ' 终',
      size = T.FS.h2, color = C.inkHeavy, bold = true })
    mainAdd(UI.Panel { width = 48, height = 2, backgroundColor = C.gold, marginTop = 4, marginBottom = 12 })
    mainAdd(T.lbl { t = '偏 离 归 因 ｜ 当前偏离 ' .. tostring(s.dev) .. '（' .. s.bandName .. '）',
      size = T.FS.ui, color = C.warn, mt = 8, mb = 6 })
    if #s.devLog == 0 then
      mainAdd(T.lbl { t = '本章你循史而行，史官的笔尚跟得上你。', color = C.inkDim })
    else
      for _, d in ipairs(s.devLog) do
        mainAdd(UI.Row { gap = 8, flexWrap = "wrap", marginBottom = 4, alignItems = "flex-start", children = {
          T.lbl { t = d.ev .. ' ｜ ' .. truncChars(d.t, 18), size = T.FS.note },
          T.lbl { t = '偏离 +' .. tostring(d.dev), size = T.FS.note, color = C.warn, wrap = false },
        } })
      end
    end
    for _, n in ipairs(s.notes or {}) do mainAdd(noteW(n)) end
    mainAdd(T.lbl { t = '本 章 境 遇', size = T.FS.ui, color = C.warn, mt = 12, mb = 6 })
    local hasDelta = false
    for _, a in ipairs(g().d.ATTRS) do
      local d = s.attrDelta[a.k]
      if d and d ~= 0 then
        hasDelta = true
        local good = a.inverse and d < 0 or d > 0
        local val = g().diff.hideAttrs and (g():attrWord(a.k) .. '（' .. (d > 0 and '升' or '降') .. '）')
            or ((d > 0 and '+' or '') .. tostring(d) .. ' → ' .. tostring(g().attrs[a.k]))
        mainAdd(UI.Row { gap = 8, width = "76%", justifyContent = "space-between", alignItems = "center", children = {
          T.lbl { t = a.n, size = T.FS.note, color = C.inkDim, wrap = false },
          T.lbl { t = val, size = T.FS.note, color = good and C.good or C.zhuHi, wrap = false },
        } })
      end
    end
    if not hasDelta then mainAdd(T.lbl { t = '诸维如止水，无增无减。', color = C.inkDim }) end
    if s.corrTitle then mainAdd(T.lbl { t = '历史修正：' .. s.corrTitle .. '（见前文结算）', size = T.FS.note, color = C.inkDim, mt = 6 }) end
    env.optBox:AddChild(T.Btn {
      text = s.nextTitle and '进 入 下 一 章' or '继 续', variant = 'primary', size = T.FS.ui, w = 200,
      onClick = function() S.handleRoute(g():proceedSummary()) end })
  end

  -- ---------- 结局页 ----------

  function M.renderEnding()
    S.showGame()
    local gg = g()
    local en = gg.ending
    S.saveCollection()
    Store.remove(Store.saveKey(gg.d.SCENARIO.id))
    S.clearMain(); S.clearOpts()
    S.scrollMainTop()                        -- 结局页从头呈现,不沿用上一页滚动位置
    mainAdd(T.lbl { t = '〔' .. tostring(en.seal) .. ' · ' .. tostring(en.diffName) .. '〕',
      size = T.FS.note, color = C.zhuHi, align = "center", mt = 12 })
    mainAdd(T.lbl { t = en.name, size = T.FS.h2, color = C.inkHeavy, bold = true, align = "center", mb = 4 })
    mainAdd(UI.Row { justifyContent = "center", marginBottom = 12, children = {
      UI.Panel { width = 60, height = 2, backgroundColor = C.gold } } })
    if en.achNew then mainAdd(T.lbl { t = '成就解锁 ｜ ' .. en.achNew, size = T.FS.note, color = C.gold, mb = 8 }) end
    mainAdd(segW(en.zhuan))
    if en.aliveNote then mainAdd(T.lbl { t = en.aliveNote, size = T.FS.note, color = C.qing, mb = 6 }) end
    mainAdd(T.lbl { t = '评 分', size = T.FS.ui, color = C.warn, mt = 12, mb = 6 })
    local names = { gongye = '功业', cuncun = '存续', shiping = '史评', yingxiang = '影响' }
    for _, k in ipairs({ 'gongye', 'cuncun', 'shiping', 'yingxiang' }) do
      local v = en.scores[k]
      mainAdd(UI.Row { gap = 8, width = "72%", alignItems = "center", children = {
        T.lbl { t = names[k], size = T.FS.note, color = C.inkDim, width = 40, wrap = false },
        UI.Panel { flexGrow = 1, flexBasis = 0, height = 7, borderRadius = 3,
          backgroundColor = C.track, overflow = "hidden",
          children = { UI.Panel { width = tostring(math.max(0, math.min(100, v))) .. '%', height = "100%",
            backgroundColor = C.gold } } },
        T.lbl { t = tostring(v), size = T.FS.note, wrap = false, color = C.ink },
      } })
    end
    mainAdd(UI.Row { gap = 12, alignItems = "center", marginTop = 10, children = {
      T.lbl { t = '总分 ' .. tostring(en.total), size = T.FS.title, color = C.inkStrong, bold = true },
      T.Seal(en.grade, { size = 52, fill = true }),
    } })
    mainAdd(T.lbl { t = '复 盘', size = T.FS.ui, color = C.warn, mt = 14, mb = 6 })
    if #en.review == 0 then
      mainAdd(T.lbl { t = '这一局太短，短到历史还没有来得及转向。', color = C.inkDim })
    end
    for i, r in ipairs(en.review) do
      mainAdd(T.Card {
        pad = 10, gap = 2, mb = 6, noBg = true,
        children = {
          T.lbl { t = '抉择 ' .. tostring(i) .. ' ｜ ' .. r.node, size = T.FS.note, color = C.inkDim },
          T.lbl { t = '你的选择：' .. r.you .. (r.isHist and '（同史实）' or ''), size = T.FS.note },
          T.lbl { t = '史实的选择：' .. r.hist, size = T.FS.note, color = C.inkDim },
        },
      })
    end
    mainAdd(T.lbl { t = en.epilogue, size = T.FS.note, color = C.qing, mt = 12, lh = 1.9 })
    env.optBox:AddChild(T.Btn { text = '再 入 此 局', variant = 'primary', size = T.FS.ui, w = 200,
      onClick = function()
        local dk = gg.diffKey
        local sk = gg.d.SCENARIO.id
        local nq = S.newGame(sk, dk)
        nq:start()
        S.renderIntro(false)
      end })
    env.optBox:AddChild(T.Btn { text = '返 回 主 页', size = T.FS.note, w = 200,
      onClick = function() S.showHome() end })
  end

  -- ---------- 属性/图鉴抽屉 ----------

  local function drawerLayer()
    if env.drawer then return env.drawer end
    env.drawerBody = UI.Panel { width = "100%", flexDirection = "column", gap = 4, paddingBottom = 20 }
    env.drawerHead = T.lbl { t = '', size = T.FS.title, color = C.inkStrong, bold = true, mb = 4 }
    env.drawerMeta = T.lbl { t = '', size = T.FS.note, color = C.inkDim, mb = 8 }
    env.drawer = UI.Panel {
      position = "absolute", top = 0, right = 0, bottom = 0, width = "44%", maxWidth = 440,
      backgroundColor = C.card, borderWidth = 1, borderColor = C.line,
      padding = 16, visible = false, pointerEvents = "auto",
      children = {
        UI.Row { justifyContent = "space-between", alignItems = "center", width = "100%", children = {
          env.drawerHead,
          T.Btn { text = '✕', size = T.FS.note, padding = 6, onClick = function() env.drawer:SetVisible(false) end },
        } },
        env.drawerMeta,
        UI.ScrollView { flexGrow = 1, flexBasis = 0, width = "100%", showScrollbar = false,
          children = { env.drawerBody } },
      },
    }
    env.root:AddChild(env.drawer)
    return env.drawer
  end

  ---@param mode string 'attrs' | 'gloss'
  ---@param into Widget|nil 给定时把内容填进该容器(右栏 tab 用),否则走浮层抽屉
  function S.openDrawer(mode, into)
    local gg = g()
    if not gg then return end
    if into then
      -- 右栏 tab 模式:直接往给定容器里填内容,不用浮层
      local body = into
      if mode == 'gloss' then
        body:AddChild(T.lbl { t = '百 科 图 鉴', size = T.FS.title, color = C.inkStrong, bold = true, mb = 6 })
        local total = 0
        for _ in pairs(gg.d.GLOSSARY) do total = total + 1 end
        body:AddChild(T.lbl { t = '已收录 ' .. tostring(#gg.gloss) .. ' / ' .. total
          .. ' 条。叙事中带下划线的词条,点按即可收录。', size = T.FS.note, color = C.inkDim, mb = 8 })
        local terms = {}
        for tname in pairs(gg.d.GLOSSARY) do terms[#terms + 1] = tname end
        table.sort(terms)
        for _, tname in ipairs(terms) do
          local has = false
          for _, x in ipairs(gg.gloss) do if x == tname then has = true break end end
          body:AddChild(T.Card {
            pad = 8, gap = 2, mb = 5,
            children = {
              T.lbl { t = (has and '· ' or '· ??? ') .. (has and tname or '未收录'),
                size = T.FS.note, color = has and C.ink or C.line, bold = true },
              T.lbl { t = has and (gg.d.GLOSSARY[tname] or '') or '尚未在叙事中遇到。',
                size = T.FS.cap, color = C.inkDim, lh = 1.6 },
            },
          })
        end
      end
      return
    end
    local dr = drawerLayer()
    T.destroyChildren(env.drawerBody)
    if mode == 'attrs' then
      env.drawerHead:SetText('属 性 面 板')
      local meta = '偏离 ' .. tostring(gg.dev) .. '（' .. gg.d.DEV_BANDS[gg:devBand() + 1].name .. '）｜ ' .. gg.diff.n
        .. ' ｜ 功业：' .. ((#gg.merits > 0) and table.concat(gg.merits, '、') or '无')
      if gg.age ~= nil then
        meta = meta .. '\n年 ' .. tostring(gg.age) .. ' 岁'
          .. (gg.ill and (gg.ill.type == 'major' and ' ｜ 沉疴缠身（须「求医问药」）' or ' ｜ 偶感风寒（静养可愈）') or ' ｜ 身体无恙')
      end
      env.drawerMeta:SetText(meta)
      for _, a in ipairs(gg.d.ATTRS) do
        local v = gg.attrs[a.k]
        local pct = math.floor(v / gg:attrMax(a.k) * 100 + 0.5)
        if gg.diff.hideAttrs then
          local tier = #a.words
          for wi = 1, #a.words do if v >= a.words[wi][1] then tier = wi break end end
          pct = math.floor((#a.words - tier + 1) * (100 / #a.words) + 0.5)
        end
        env.drawerBody:AddChild(UI.Panel { gap = 2, marginBottom = 5, children = {
          UI.Row { justifyContent = "space-between", width = "100%", children = {
            T.lbl { t = a.n, size = T.FS.note, color = C.ink, wrap = false },
            T.lbl { t = gg.diff.hideAttrs and gg:attrWord(a.k) or (tostring(v) .. ' · ' .. gg:attrWord(a.k)),
              size = T.FS.note, color = C.inkDim, wrap = false },
          } },
          UI.Panel { width = "100%", height = 6, borderRadius = 3, backgroundColor = C.track, overflow = "hidden",
            children = { UI.Panel { width = tostring(pct) .. '%', height = "100%",
              backgroundColor = a.inverse and C.zhu or C.gold } } },
        } })
      end
      env.drawerBody:AddChild(T.lbl { t = '成 就', size = T.FS.note, color = C.warn, mt = 10, mb = 4 })
      if #gg.ach == 0 then
        env.drawerBody:AddChild(T.lbl { t = '尚未解锁', size = T.FS.note, color = C.line })
      else
        for _, a in ipairs(gg.ach) do
          env.drawerBody:AddChild(T.lbl { t = '· ' .. tostring(gg.d.ACHIEVEMENTS[a] or a), size = T.FS.note })
        end
      end
    else
      env.drawerHead:SetText('百 科 图 鉴')
      local total = 0
      for _ in pairs(gg.d.GLOSSARY) do total = total + 1 end
      env.drawerMeta:SetText('已收录 ' .. tostring(#gg.gloss) .. ' / ' .. total .. ' 条。叙事中带下划线的词条，点按即可收录。')
      local terms = {}
      for tname in pairs(gg.d.GLOSSARY) do terms[#terms + 1] = tname end
      table.sort(terms)
      for _, tname in ipairs(terms) do
        local has = false
        for _, x in ipairs(gg.gloss) do if x == tname then has = true break end end
        env.drawerBody:AddChild(T.Card {
          pad = 8, mb = 4, sel = has,
          onClick = has and (function() M.showGloss(tname) end) or nil,
          children = { T.lbl { t = has and tname or '？？？', size = T.FS.note, color = has and C.ink or C.line } },
        })
      end
    end
    dr:SetVisible(true)
  end

  function M.showGloss(term)
    local gg = g()
    if not gg then return end
    local entry = gg.d.GLOSSARY[term]
    if not entry then return end
    local isNew = true
    for _, x in ipairs(gg.gloss) do if x == term then isNew = false break end end
    if isNew then gg.gloss[#gg.gloss + 1] = term; S.saveCollection() end
    S.showSettle('词条 ｜ ' .. term .. (isNew and '（新收录）' or ''), entry, {}, 0, nil, nil, function() end)
  end
end

return M
