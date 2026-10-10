-- qingshi/ui/home.lua —— 主菜单 + 合并选择页(朝代/剧本/难度一页;对应 JS ui-home.js)
local UI = require("urhox-libs/UI")
local T = require("qingshi/ui/theme")
local Engine = require("qingshi/engine")
local PRNG = require("qingshi/prng")
local Store = require("qingshi/store")
local Sparks = require("qingshi/ui/sparks")
local Wheel = require("qingshi/ui/wheel")
local ClipImage = require("qingshi/ui/clipimage")
local InkVortex = require("qingshi/ui/inkvortex")

local DATA = {
  lisi = require("qingshi/data/lisi"),
  jingke = require("qingshi/data/jingke"),
  hanxin = require("qingshi/data/hanxin"),
  xiangyu = require("qingshi/data/xiangyu"),
  chensheng = require("qingshi/data/chensheng"),
}
local ORDER = { 'lisi', 'jingke', 'hanxin', 'xiangyu', 'chensheng' }
local SCEN_NAME = { lisi = '李斯', jingke = '荆轲', hanxin = '韩信', xiangyu = '项羽', chensheng = '陈胜' }

local DYNASTIES = {
  { name = '秦', era = '前 221 — 前 207', hasData = true },
  { name = '汉', era = '前 202 — 220', hasData = false },
  { name = '唐', era = '618 — 907', hasData = false },
  { name = '宋', era = '960 — 1279', hasData = false },
  { name = '明', era = '1368 — 1644', hasData = false },
}

local M = {}

function M.attach(Shell)
  local env = Shell.env
  local C = T.COLOR
  if env.dynIdx == nil then env.dynIdx = 0 end

  local function loadSaveInfo()
    local list = {}
    for _, k in ipairs(ORDER) do
      local sv = Store.read(Store.saveKey(k))
      -- type 守卫:截断/手改的存档经 cjson 解出可能是 number/boolean,直接索引会崩
      if type(sv) == 'table' and sv.diffKey and sv.snapshot then
        list[#list + 1] = { k = k, sv = sv }
      end
    end
    return list
  end

  local function enterSave(k, sv)
    local g = Shell.newGame(k, sv.diffKey)
    if g:importSave(sv) then
      Shell.showGame()
      Shell.renderIntro(false)
      return true
    end
    Store.remove(Store.saveKey(k))
    return false
  end

  -- ---------- 主菜单 ----------

  -- 菜单条目:文字居中 + 悬停时下方浮现金线(克制的反馈)
  local function menuItem(text, enabled, onClick)
    local lab = T.lbl { t = text, size = T.FS.menu, color = C.inkStrong, bold = true, wrap = false, ls = 6 }
    local under = UI.Panel { width = 0, height = 2, backgroundColor = C.gold, marginTop = 5 }
    local it = UI.Panel {
      flexDirection = "column", alignItems = "center",
      paddingTop = 12, paddingBottom = 12, paddingLeft = 30, paddingRight = 30,
      pointerEvents = (enabled and onClick) and "auto" or "none",
      onClick = enabled and onClick or nil,
      onPointerEnter = enabled and function()
        under:SetWidth(72)
        lab:SetFontColor(C.zhu)
      end or nil,
      onPointerLeave = enabled and function()
        under:SetWidth(0)
        lab:SetFontColor(C.inkStrong)
      end or nil,
      children = { lab, under },
    }
    if not enabled then it:SetOpacity(0.32) end
    return it
  end

  function Shell.renderMenu()
    local c = env.menuMain
    c:ClearChildren()
    env.menuAnim = nil   -- 重绘即重启时序(防止旧表引用已销毁控件)

    -- 底:水墨山水(保持不变)
    c:AddChild(UI.Panel {
      position = "absolute", top = 0, left = 0, right = 0, bottom = 0,
      backgroundImage = T.BG_INK, backgroundFit = "cover",
      pointerEvents = "none",
    })

    -- 右侧整块(墨纱 + 菜单)作为「帘」从右缘推入——含背景一起动
    local curtain = UI.Panel {
      position = "absolute", top = 0, right = 0, bottom = 0, width = "44%",
      backgroundColor = { 233, 222, 198, 205 },
      flexDirection = "column", justifyContent = "center", alignItems = "center",
      children = {},
    }
    local saves = loadSaveInfo()
    local items = UI.Panel { flexDirection = "column", alignItems = "center", children = {
      menuItem('开 始 游 戏', true, function() Shell.showHome() end),
      menuItem('继 续 旅 程', #saves > 0, function()
        if #saves == 1 and enterSave(saves[1].k, saves[1].sv) then return end
        Shell.showSaves()
      end),
      menuItem('查 看 存 档', #saves > 0, function() Shell.showSaves() end),
      menuItem('设 置 一 下', true, function() Shell.showSettings() end),
      menuItem('退 出 游 戏', true, function()
        Shell.confirm('退出游戏？', '确定要放下笔,离开这卷青史吗？', function() engine:Exit() end, '退 出')
      end),
    } }
    curtain:AddChild(T.lbl { t = '悠悠千载　青史万卷', size = T.FS.sub, color = C.inkSoft, ls = 5, wrap = false, mb = 8 })
    curtain:AddChild(T.lbl { t = '若置身棋局　当如何落子', size = T.FS.sub, color = C.inkSoft, ls = 5, wrap = false, mb = 58 })
    curtain:AddChild(items)
    curtain:AddChild(T.lbl { t = 'v2.2.0 · 引擎版', size = T.FS.note, color = C.inkDim, mt = 46, wrap = false })
    c:AddChild(curtain)
    -- 帘左缘细分界线,随帘一起动
    local curtainEdge = UI.Panel {
      position = "absolute", top = "8%", bottom = "8%", right = "44%",
      width = 1, backgroundColor = C.line, pointerEvents = "none",
    }
    c:AddChild(curtainEdge)

    -- 标题:书法字(溶解式出现) + 星火粒子
    -- 层级:本块在帘之后 AddChild,故位于帘上层——标题左移经过帘区时不会被遮
    -- 星火须绝对定位,否则会与书法字在流中上下堆叠、把字挤偏;
    -- 尺寸限定为文字宽度(264×556),星火只铺在字的范围内
    local sparks = Sparks {
      position = "absolute",
      width = 264, height = 556, count = 26, speed = 1.0,
      color = { 214, 150, 58 },        -- 深琥珀(浅纸上可辨)
      coreColor = { 255, 236, 176 },   -- 亮金芯
    }
    local glow = sparks   -- 沿用旧变量名,时序代码不变
    -- 标题:普通图片(居中淡入)
    local art = UI.Panel {
      width = 264, height = 556,
      backgroundImage = T.TITLE_IMG, backgroundFit = "contain",
    }
    local titleCol = UI.Panel {
      position = "absolute", top = 0, left = 0, bottom = 0, width = "56%",
      alignItems = "center", justifyContent = "center", pointerEvents = "none",
      children = {
        UI.Panel {
          width = 264, height = 556,          -- 与文字同尺寸,星火只在此范围内
          alignItems = "center", justifyContent = "center",
          children = { sparks, art },
        },
      },
    }
    c:AddChild(titleCol)

    -- ---------- 时序编排(过渡无 delay,用 Update 计时器串) ----------
    -- 一:标题溶解出现(1.2s,墨自下浸出)
    -- 二:停留 1s(让标题独自站定)
    -- 三:右帘「完全」从屏外推入 与 标题左移归位 —— 同时启动、同时结束
    -- 四:两者就位后,星火淡入并常驻
    local W = graphics:GetWidth() / T.GetScale()
    local curtainW = W * 0.44          -- 帘自身宽度:位移满此值即完全出屏
    local titleOff = W * 0.22          -- 标题容器中心(0.28W) → 画面中心(0.5W)

    curtain:SetStyle({ translateX = curtainW + 4 })     -- +4 确保完全在边框外
    curtainEdge:SetStyle({ translateX = curtainW + 4 })
    glow:SetOpacity(0)                                   -- 星火先隐
    -- 标题起始态:居中、透明。
    -- 说明:位移与淡入均在本模块内自行插值(不用引擎 transition)——
    -- 引擎的过渡起点取自 renderProps_,而该值在首帧尚为 nil,
    -- 导致先按目标值渲染一帧再被拉回,表现为"闪到最终位置一次"。
    titleCol:SetStyle({ translateX = titleOff, opacity = 0 })
    env.menuAnim = { t = 0, stage = 1, curtain = curtain, edge = curtainEdge,
                     title = titleCol, glow = glow, sparks = sparks,
                     titleOff = titleOff, curtainW = curtainW,
                     titleOp = 0, titleTx = titleOff,
                     curTx = curtainW + 4, edgeTx = curtainW + 4 }
  end

  -- 主菜单入场时序推进(由 Shell.Update 每帧调用)
  function M.tickMenuAnim(dt)
    local a = Shell.env.menuAnim
    if not a then return end
    if a.sparks then a.sparks:Update(dt) end
    a.t = a.t + dt

    -- 自绘缓动
    local function easeOut(p) return 1 - (1 - p) ^ 3 end

    if a.stage == 1 then
      -- 淡入:0 → 1(1.0s)
      local p = math.min(1, a.t / 1.0)
      local op = easeOut(p)
      if op ~= a.titleOp then
        a.titleOp = op
        a.title:SetStyle({ opacity = op })
      end
      if a.t >= 1.5 then a.stage = 2; a.t = 0 end
    elseif a.stage == 2 then
      -- 停留 1s
      if a.t >= 1.0 then a.stage = 3; a.t = 0 end
    elseif a.stage == 3 then
      -- 位移:标题 titleOff→0;帘 curtainW+4→0(同步 0.9s)
      local p = math.min(1, a.t / 0.9)
      local e = easeOut(p)
      a.titleTx = a.titleOff * (1 - e)
      a.curTx = (a.curtainW + 4) * (1 - e)
      a.title:SetStyle({ translateX = a.titleTx })
      a.curtain:SetStyle({ translateX = a.curTx })
      a.edge:SetStyle({ translateX = a.curTx })
      if a.t >= 0.9 then a.stage = 4; a.t = 0 end
    elseif a.stage == 4 then
      -- 星火淡入(1.0s)后常驻
      local p = math.min(1, a.t / 1.0)
      a.glow:SetOpacity(easeOut(p))
      if a.t >= 1.0 then
        a.glow:SetOpacity(1)
        a.stage = 5
        a.t = 0
      end
    end
    -- stage 5:静止常驻(仅星火在 Update 中自转)
  end

  function Shell.showSaves()
    env.menuAnim = nil   -- 离开菜单:停止入场/呼吸时序
    env.menuMain:SetVisible(false)
    env.menuSettings:SetVisible(false)
    env.menuSaves:SetVisible(true)
    local c = env.menuSaves
    c:ClearChildren()
    c:AddChild(T.lbl { t = '青 史 留 痕', size = T.FS.h2, color = C.inkStrong, bold = true, ls = 6, mb = 6 })
    local saves = loadSaveInfo()
    if #saves == 0 then
      c:AddChild(T.lbl { t = '尚无落笔之局。', size = T.FS.ui, color = C.inkDim, mb = 10 })
    end
    for _, it in ipairs(saves) do
      local sv = it.sv
      local d = DATA[it.k]
      local sd = d.DIFFICULTY[sv.diffKey]
      local ch = d.CHAPTERS[sv.chapterIdx + 1]
      c:AddChild(T.Card {
        w = "72%", maxWidth = 520, pad = 12, dir = "row", gap = 10, alignItems = "center",
        onClick = function() if not enterSave(it.k, sv) then Shell.showSaves() end end,
        children = {
          T.Seal(SCEN_NAME[it.k]:sub(1, 3), { size = 44 }),
          UI.Panel { flexGrow = 1, flexBasis = 0, gap = 2,
            children = {
              T.lbl { t = d.SCENARIO.name, size = T.FS.ui, color = C.inkStrong, bold = true, wrap = false },
              T.lbl { t = (sd and sd.n or sv.diffKey) .. ' · ' .. (ch and ch.title or '第' .. tostring((sv.chapterIdx or 0) + 1) .. '章')
                .. ' · 偏离 ' .. tostring(sv.snapshot.dev or 0), size = T.FS.cap, color = C.inkDim, wrap = false },
            } },
          T.Btn { text = '删除', size = T.FS.note, pad = 7, onClick = function()
            Store.remove(Store.saveKey(it.k))
            Shell.renderSavesRefresh()
          end },
        },
      })
    end
    c:AddChild(T.Btn { text = '‹ 返 回 菜 单', size = T.FS.note, mt = 12,
      onClick = function() Shell.hideSaves() end })
  end

  function Shell.renderSavesRefresh()
    local anySv = false
    for _, k in ipairs(ORDER) do
      local sv = Store.read(Store.saveKey(k))
      if type(sv) == 'table' and sv.diffKey and sv.snapshot then anySv = true break end
    end
    if not anySv then Shell.hideSaves(); return end
    Shell.showSaves()
  end

  function Shell.hideSaves()
    env.menuSaves:SetVisible(false)
    env.menuMain:SetVisible(true)
    Shell.renderMenu()
  end

  -- ---------- 设置页 ----------

  -- 设置存储:与存档同机制(引擎 File API),键 settings_v1
  local SETTINGS_KEY = 'settings_v1'
  local DEFAULTS = { scale = 'default', segDelay = 0.65, textScale = 'normal' }
  local SCALE_OPTS = { { 'small', '小' }, { 'default', '标准' }, { 'large', '大' } }
  local SPEED_OPTS = { { 1.1, '慢' }, { 0.65, '标准' }, { 0.3, '快' } }
  local TEXT_OPTS = { { 'small', '小' }, { 'normal', '标准' }, { 'large', '大' } }

  local function loadSettings()
    local s = Store.read(SETTINGS_KEY)
    -- 同 loadSaveInfo:脏设置档解出可能是 number/boolean,索引会崩 → 回落默认值
    if type(s) ~= 'table' then return { scale = DEFAULTS.scale, segDelay = DEFAULTS.segDelay, textScale = DEFAULTS.textScale } end
    return {
      scale = s.scale or DEFAULTS.scale,
      segDelay = s.segDelay or DEFAULTS.segDelay,
      textScale = s.textScale or DEFAULTS.textScale,
    }
  end

  local SCALE_MUL = { small = 0.85, default = 1.0, large = 1.2 }

  local function applySettings(s, skipScale)
    -- UI 缩放:在引擎自适应基础上乘用户倍率。
    -- 保护:DPR 在部分环境可能返回异常小值(实测 0.36),直接相乘会把整个 UI 缩到 27%。
    -- 故对最终值取下限 0.5,并在「用户未改过缩放」时不覆盖引擎初值(skipScale)。
    local mul = SCALE_MUL[s.scale] or 1.0
    if not skipScale then
      UI.SetScale(function()
        local base = UI.Scale.DPR_DENSITY_ADAPTIVE()
        local v = base * mul
        if v < 0.5 then v = 0.5 end
        return v
      end)
    end
    Shell.setSegDelay(s.segDelay)
    env.textScale = s.textScale
    Store.write(SETTINGS_KEY, s)
  end
  Shell.applySettings = applySettings
  Shell.loadSettings = loadSettings

  -- 一行设置项:标题 + 若干互斥选项
  local function settingRow(title, opts, cur, onPick)
    local row = UI.Row { gap = 8, children = {} }
    for _, o in ipairs(opts) do
      local val, label = o[1], o[2]
      local sel = (val == cur)
      row:AddChild(T.Card {
        pad = 9, mb = 0, sel = sel,
        onClick = function() onPick(val) end,
        children = { T.lbl { t = label, size = T.FS.note, color = sel and C.zhu or C.ink, bold = sel, wrap = false } },
      })
    end
    return UI.Panel { flexDirection = "row", alignItems = "center", gap = 18, marginBottom = 16, children = {
      T.lbl { t = title, size = T.FS.note, color = C.inkSoft, width = 90, wrap = false },
      row,
    } }
  end

  function Shell.showSettings()
    env.menuAnim = nil   -- 离开菜单:停止入场/呼吸时序
    env.menuMain:SetVisible(false)
    env.menuSaves:SetVisible(false)
    local c = env.menuSettings
    c:SetVisible(true)
    c:ClearChildren()
    local s = loadSettings()

    c:AddChild(T.lbl { t = '设 置', size = T.FS.h2, color = C.inkHeavy, bold = true, ls = 6, mb = 4 })
    c:AddChild(UI.Panel { width = 52, height = 2, backgroundColor = C.gold, marginBottom = 24 })

    local function repaint() Shell.showSettings() end
    c:AddChild(settingRow('界面缩放', SCALE_OPTS, s.scale, function(v)
      s.scale = v; applySettings(s); repaint()
    end))
    c:AddChild(settingRow('叙事速度', SPEED_OPTS, s.segDelay, function(v)
      s.segDelay = v; applySettings(s); repaint()
    end))
    c:AddChild(settingRow('正文字号', TEXT_OPTS, s.textScale, function(v)
      s.textScale = v; applySettings(s); repaint()
    end))

    c:AddChild(T.lbl { t = '设置即时生效,并保存在本地。', size = T.FS.cap, color = C.inkDim, mt = 4, mb = 20 })
    c:AddChild(T.Btn { text = '‹ 返 回', size = T.FS.ui, w = 180,
      onClick = function()
        c:SetVisible(false)
        env.menuMain:SetVisible(true)
        Shell.renderMenu()
      end })
  end

  -- ---------- 对局开局原语 ----------

  function Shell.newGame(scenKey, diffKey, data)
    -- 种子混入 os.clock 毫秒位:纯 os.time 是秒级,同一秒内重开两局会拿到同一个种子
    local seed = (os.time() % 2147483647) * 1000 + math.floor((os.clock() % 1) * 1000)
    local g = Engine.NewGame(data or DATA[scenKey], diffKey, PRNG(seed % 2147483647))
    local col = Store.read(Store.colKey(scenKey))
    if type(col) == 'table' and type(col.gloss) == 'table' and type(col.ach) == 'table' then
      for i = 1, #col.gloss do g.gloss[i] = col.gloss[i] end
      for i = 1, #col.ach do g.ach[i] = col.ach[i] end
    end
    env.game = g
    return g
  end

  function Shell.saveCollection()
    if not env.game then return end
    Store.write(Store.colKey(env.game.d.SCENARIO.id), { gloss = env.game.gloss, ach = env.game.ach })
  end

  -- ---------- 选择页(v4:左罗盘择朝代 | 右剧本卡横滑 + 难度 + 入局) ----------

  local buildRight   -- 前向声明(scenCard 内会回调)

  -- 逻辑屏尺寸(基准像素);百分比在 ScrollView 内会失去参照,故用其推算固定尺寸
  local function vw() return graphics:GetWidth() / T.GetScale() end
  local function vh() return graphics:GetHeight() / T.GetScale() end
  -- 剧本条总宽(5 卡 + 间距);右栏宽度自适应,内部元素用它定宽
  local function stripWOf()
    -- 卡宽由卡高按 512:768 反推,与 scenCard 内同口径
    local ch = math.floor(math.floor(vw() * 0.088) * 1.82 * 0.90)
    local cw = math.floor(ch * 512 / 768)
    local gap = math.floor(vw() * 0.011)
    return cw * #ORDER + gap * (#ORDER - 1)
  end
  -- 卡片条四周留白:让选中卡的「外发光」与悬停上浮不被 ScrollView 裁掉。
  -- 布局时需用负 margin 抵消它,右边缘才能与顶栏右内边距对齐。
  local CARD_GLOW = 14

  -- 剧本卡:立绘满铺 + 底部匾额(竖排局名,细金边)
  local function scenCard(k)
    local sc = DATA[k].SCENARIO
    local juname = string.match(sc.name, '·%s*(.+)$') or sc.name
    local sel = (k == env.selScen)
    -- 卡高按逻辑屏宽比例,卡宽按立绘的 512:768(2:3)比例反推
    local ch = math.floor(math.floor(vw() * 0.088) * 1.82 * 0.90)
    local cw = math.floor(ch * 512 / 768)
    -- 匾额:美术交付的竖版匾额素材(84:180),高占卡高 34%(v4 稿实测)
    local plH = math.floor(ch * 0.34)
    -- 竖排局名:字号由「匾额可用内高 ÷ 字数」反推,保证整串落在匾额内。
    -- 匾额上下尖角 + 内边距约占 30%,故可用内高取 70%;
    -- 行距用 VText 的 lh(1.05)+ gap(0),故除以 1.08 留一点余量。
    local nChar = utf8.len(juname) or #juname
    local nameSize = math.floor(plH * 0.56 / math.max(1, nChar) / 1.08)
    local platePanel = UI.Panel {
      position = "absolute", bottom = math.floor(ch * 0.035), left = 0, right = 0,
      alignItems = "center", justifyContent = "center",
      children = {
        UI.Panel {
          width = math.floor(plH * 84 / 180), height = plH,
          backgroundImage = T.PART.scenPlate, backgroundFit = "fill",
          alignItems = "center", justifyContent = "center",
          pointerEvents = "none",
          children = { T.VText(juname, { size = nameSize,
            color = sel and C.zhu or C.inkStrong, bold = true, gap = 0, lh = 1.0 }) },
        },
      },
    }
    -- 卡片本体 + 悬停上浮。选中态用「边框外发光」表达(朱金辉光,非加粗边框)。
    -- 卡框素材是抹角(斜切)形制,拐角约占卡宽 7.5%(实测 18/239);
    -- 卡片与阴影外壳都按此收角,否则阴影会按方形渲染,在抹角处露出黑方角。
    local cornerCut = math.floor(cw * 0.075)
    local cornerR = cornerCut
    local card = UI.Panel {
      width = cw, height = ch, overflow = "hidden", borderRadius = cornerR,
      pointerEvents = "auto",
      onClick = function() env.selScen = k; buildRight() end,
      children = {
        -- 立绘满铺。必须按路径裁剪:库的 overflow 裁剪是矩形
        -- (nvgIntersectScissor),抹角处会露出立绘。用八边形路径精确复刻卡框的斜切角。
        ClipImage { position = "absolute", top = 0, left = 0, right = 0, bottom = 0,
          image = 'image/portraits/char_' .. k .. '.png', fit = "cover", cut = cornerCut },
        -- 未选中:同形制压暗,让选中的那张自然凸显
        sel and UI.Panel { width = 0, height = 0 }
          or ClipImage { position = "absolute", top = 0, left = 0, right = 0, bottom = 0,
              cut = cornerCut, color = { 28, 24, 18, 152 } },
        -- 金框:美术交付的细金线外框(内部透明),等比铺满
        UI.Panel { position = "absolute", top = 0, left = 0, right = 0, bottom = 0,
          backgroundImage = T.PART.cardFrame, backgroundFit = "fill",
          pointerEvents = "none" },
        platePanel,
      },
    }
    -- 悬停上浮(不加阴影)
    local wrap = UI.Panel { borderRadius = cornerR, children = { card } }
    wrap:SetStyle({ transition = "translateY 0.16s easeOutCubic" })
    card.props.onPointerEnter = function() wrap:SetStyle({ translateY = -6 }) end
    card.props.onPointerLeave = function() wrap:SetStyle({ translateY = 0 }) end
    return wrap
  end

  local function buildRightImpl()
    local c = env.homeRight
    c:ClearChildren()
    local cur = DYNASTIES[env.dynIdx + 1]

    -- 剧本区(小标题 + 卡片)单独成组,底部留白,与难度区拉开。
    -- 整体下移用 translateY(绘制期变换,不占布局)→ 罗盘仍保持上下居中。
    local scenGroup = UI.Panel { flexDirection = "column", alignItems = "center",
      marginBottom = math.floor(vh() * 0.03) }
    scenGroup:SetStyle({ translateY = math.floor(vh() * 0.08) })
    c:AddChild(scenGroup)

    -- 小标题(居中,两侧金细线)
    scenGroup:AddChild(T.Divider('选 择 剧 本', { size = T.FS.body, mt = 26, mb = 10, width = stripWOf() }))

    -- 卡高:与 scenCard 内同口径
    local cardH = math.floor(math.floor(vw() * 0.088) * 1.82 * 0.90)

    if not cur.hasData then
      -- 准备中
      scenGroup:AddChild(UI.Panel { width = stripWOf(), height = cardH,
        alignItems = "center", justifyContent = "center", gap = 10, children = {
          T.VText('准备中', { size = 40, color = C.inkDim, gap = 8 }),
          T.lbl { t = '史 笔 未 至 · 此 卷 尚 在 修 撰', size = T.FS.note, color = C.inkSoft, ls = 2, wrap = false },
        } })
    else
      -- 剧本卡:横向排列。ScrollView 宽度显式给定(父级宽度自适应,百分比会失去参照),
      -- 超出部分左右滑动。
      local stripW = stripWOf()
      -- 卡间距按屏宽比例(约 1.5%),比原先固定 12 明显拉开
      local strip = UI.Panel { flexDirection = "row", gap = math.floor(vw() * 0.011),
        alignItems = "center",
        width = stripW, paddingLeft = CARD_GLOW, paddingRight = CARD_GLOW,
        paddingTop = CARD_GLOW, paddingBottom = CARD_GLOW }
      for _, k in ipairs(ORDER) do strip:AddChild(scenCard(k)) end
      scenGroup:AddChild(UI.ScrollView {
        id = "scenScroll", width = stripW + CARD_GLOW * 2, height = cardH + CARD_GLOW * 2,
        marginLeft = -CARD_GLOW, marginRight = -CARD_GLOW,   -- 抵消留白,右边缘对齐 pad
        scrollX = true, scrollY = false, showScrollbar = false,
        children = { strip },
      })
    end

    -- 难度区(标题 + 胶囊 + 注释)成组,同样用 translateY 下移(不占布局)
    local diffGroup = UI.Panel { flexDirection = "column", alignItems = "center" }
    diffGroup:SetStyle({ translateY = math.floor(vh() * 0.07) })
    c:AddChild(diffGroup)

    -- 难度:三枚并排胶囊(素材图:选中赭金 / 未选中描边)
    diffGroup:AddChild(T.Divider('选 择 难 度', { size = T.FS.body, mt = 18, mb = 10, width = stripWOf() }))
    local DIFFS = { { k = 'story' }, { k = 'normal' }, { k = 'hardcore' } }
    -- 胶囊恢复素材原始比例(注释移到按钮下方,不再挤在胶囊里)
    local capW = math.floor(vw() * 0.115)
    local capH = math.floor(capW * 151 / 560)
    local drow = UI.Row { gap = math.floor(vw() * 0.014), justifyContent = "center", width = stripWOf() }
    for _, d in ipairs(DIFFS) do
      local df = DATA[env.selScen].DIFFICULTY[d.k]
      local sel = (env.selDiff == d.k)
      local cap = UI.Panel {
        width = capW, height = capH,
        -- 胶囊素材是尖头(圭角)形制,阴影按胶囊圆角近似,避免露出方角
        borderRadius = math.floor(capH * 0.45),
        backgroundImage = sel and T.PART.diffOn or T.PART.diffOff,
        backgroundFit = "fill",
        alignItems = "center", justifyContent = "center",
        pointerEvents = "auto",
        onClick = function() env.selDiff = d.k; buildRight() end,
        -- 素材自带底色与边框,故不再画边框;只放名称
        children = { T.lbl { t = df.n, size = math.floor(capH * 0.40), bold = true,
          color = sel and C.card or C.inkStrong, wrap = false } },
      }
      -- 悬停只做上浮,不加阴影:胶囊是尖头(圭角)形制,圆角阴影总会在尖角外露头
      cap:SetStyle({ transition = "translateY 0.16s easeOutCubic" })
      cap.props.onPointerEnter = function() cap:SetStyle({ translateY = -5 }) end
      cap.props.onPointerLeave = function() cap:SetStyle({ translateY = 0 }) end
      drow:AddChild(cap)
    end
    diffGroup:AddChild(drow)

    -- 注释:跟着「选中」的那枚胶囊走。
    -- 三枚胶囊等宽居中排列,故选中项是第 selIdx 枚,偏移量可算出来;
    -- 注释框宽 = 胶囊宽(文字在其中折行),用 marginLeft = 2*offset 把它平移到
    -- 该胶囊的正下方(行内 justifyContent=center,左侧外边距会使居中点右移 offset)。
    local selIdx = 1
    for i, d in ipairs(DIFFS) do if d.k == env.selDiff then selIdx = i end end
    local capGap = math.floor(vw() * 0.014)
    local offset = (selIdx - 2) * (capW + capGap)
    local selDesc = DATA[env.selScen].DIFFICULTY[env.selDiff].desc or ''
    diffGroup:AddChild(UI.Row { width = stripWOf(), marginTop = 10,
      height = math.floor(vh() * 0.055), justifyContent = "center",
      alignItems = "flex-start", children = {
        UI.Panel { width = capW, marginLeft = 2 * offset,
          alignItems = "center", justifyContent = "flex-start",
          children = { T.lbl { t = selDesc, size = T.FS.note, color = C.inkSoft,
            align = "center", width = capW } } },
      } })

    -- 入局:纯水墨漩涡按钮(无文字),悬停时在漩涡「下方」浮现小字「入局」
    -- 按钮尺寸 = 漩涡本体尺寸(短边 × 0.75),使可点区域与看到的漩涡一致;
    -- 漩涡在按钮内居中(不再下移),文字用绝对定位挂在按钮下沿之外,不压漩涡。
    local entSize = math.floor(vh() * 0.30 * 0.75)
    local enterLbl = T.lbl { t = '入 局', size = math.floor(entSize * 0.105),
      color = C.inkSoft, bold = true, ls = 3, wrap = false }
    enterLbl:SetStyle({ opacity = 0, transition = "opacity 0.22s easeOutCubic" })
    local enter = UI.Panel {
      width = entSize, height = entSize, marginTop = math.floor(vh() * 0.06),
      pointerEvents = "auto",
      onClick = function()
        Store.remove(Store.saveKey(env.selScen))
        local g = Shell.newGame(env.selScen, env.selDiff)
        g:start()
        Shell.showGame()
        Shell.renderIntro(false)
      end,
      children = {
        -- 水墨漩涡(美术绘制,透明底):反向自转 + 呼吸;居中,不加偏移
        InkVortex { position = "absolute", top = 0, left = 0, right = 0, bottom = 0,
          image = T.PART.vortex, spin = -0.70 },
        -- 文字:绝对定位在按钮下沿之外(不参与布局,故不挤动漩涡)
        UI.Panel { position = "absolute", top = "100%", left = 0, right = 0,
          marginTop = 6, alignItems = "center", justifyContent = "center",
          children = { enterLbl } },
      },
    }
    enter.props.onPointerEnter = function() enterLbl:SetStyle({ opacity = 1 }) end
    enter.props.onPointerLeave = function() enterLbl:SetStyle({ opacity = 0 }) end
    c:AddChild(enter)                        -- 单独成块,不跟随难度区的下移
    env.inkVortex = enter:GetChildAt(1)      -- 供 tick 推进旋转
  end
  buildRight = buildRightImpl
  env.buildRight = buildRight

  Shell.renderHome = function()
    Shell.cancelReveal()
    env.lastSettleText = nil
    local c = env.homeWrap
    c:ClearChildren()

    -- 底图:美术交付的远山·扁舟(铺满整页,顶栏绝对定位浮于其上)
    c:AddChild(UI.Panel {
      position = "absolute", top = 0, left = 0, right = 0, bottom = 0,
      backgroundImage = T.BG_SELECT, backgroundFit = "cover",
      pointerEvents = "none",
    })

    -- 顶栏:左返回钮(罗盘形素材,含四向菱饰的方形画布) / 右标题(书法素材)
    local btnSize = math.floor(vh() * 0.10)
    local backBtn = UI.Panel {
      width = btnSize, height = btnSize,
      backgroundImage = T.PART.backBtn, backgroundFit = "contain",
      pointerEvents = "auto",
      onClick = function() Shell.showMenu() end,
    }
    local pad = math.floor(vw() * 0.03)          -- 左右边距:按屏宽
    local padTop = math.floor(vh() * 0.03)       -- 顶部边距:按屏高(横屏下 vw*3% 折算成
                                                 -- 高度约 5.3% 屏高,会显得靠下)
    -- 顶栏用绝对定位贴顶(否则会被 homeWrap 的垂直居中带着一起下移)
    -- 标题块右侧留出 pad 的边距(不贴屏幕边缘);副标题在标题下方
    c:AddChild(UI.Row { position = "absolute", top = padTop, left = 0, right = 0,
      justifyContent = "space-between", alignItems = "flex-start",
      paddingLeft = pad, paddingRight = pad, children = {
      backBtn,
      UI.Panel { alignItems = "flex-end", gap = 2, children = {
        -- 标题素材 344×125(等比缩放)
        UI.Panel { width = math.floor(vh() * 0.19), height = math.floor(vh() * 0.19 * 125 / 344),
          backgroundImage = T.PART.title, backgroundFit = "contain",
          pointerEvents = "none" },
        T.lbl { t = '悠 悠 千 载  ·  青 史 万 卷', size = T.FS.note,
          color = C.inkSoft, ls = 2, wrap = false },
      } },
    } })

    -- 主体:左罗盘 | 右内容。
    -- 两端对齐 + 左右 padding 都取顶栏的 pad,使「罗盘(含朝代名)左边距」与
    -- 「立绘区右边距」和顶栏左右边距一致;行撑满剩余高度(右列据此上下铺开)。
    local wheelSize = math.floor(math.min(vw() * 0.36, vh() * 0.80))
    -- 行高按内容(不撑满),由外层 homeWrap 的 justifyContent=center 垂直居中,
    -- 上下自然留出空间;顶栏是绝对定位,不占流,故不会被它顶下去。
    -- 行内垂直居中:罗盘上下居中;右列同样居中(不再与罗盘顶部对齐)
    local row = UI.Row { width = "100%",
      gap = math.floor(vw() * 0.03), alignItems = "center",
      justifyContent = "space-between",
      paddingLeft = pad, paddingRight = pad }
    -- 罗盘图在控件内左右各留 3.7%(画布 870 对内容半径 442),抵消它才能让
    -- 最外层的朝代名真正贴到 pad 上
    local wheelCol = UI.Panel { width = wheelSize, height = wheelSize, flexShrink = 0,
      marginLeft = -math.floor(wheelSize * 0.037),
      alignItems = "center", justifyContent = "center" }
    if env.wheel and env.wheelSize ~= wheelSize then
      -- 分辨率/缩放变化:旧罗盘尺寸已固化(创建时定宽高),作废重建以对位新屏
      env.wheel = nil
    end
    if not env.wheel then
      env.wheelSize = wheelSize
      env.wheel = Wheel {
        width = wheelSize, height = wheelSize,
        items = DYNASTIES, index = env.dynIdx + 1,
        colors = C, arch = T.ARCH, ring = T.PART.wheelRing,
        onChange = function(i)
          env.dynIdx = i - 1
          if env.buildRight then env.buildRight() end
        end,
      }
    end
    wheelCol:AddChild(env.wheel)
    row:AddChild(wheelCol)
    -- 右栏:宽度由内容决定(不设宽/不抢剩余);高度按内容,
    -- 由外层 ScrollView 的垂直居中 + 上下 padding 留出适当距离(不再撑满)。
    env.homeRight = UI.Panel { flexShrink = 1,
      flexDirection = "column", alignItems = "center" }
    row:AddChild(env.homeRight)
    c:AddChild(row)
    buildRight()
    env.homeSC:SetScroll(0, 0)
  end

  -- 选择页:罗盘 + 入局漩涡每帧更新
  Shell.tickWidgets = function(dt)
    if env.wheel then env.wheel:Update(dt) end
    if env.inkVortex then env.inkVortex:Update(dt) end
  end
end

return M
