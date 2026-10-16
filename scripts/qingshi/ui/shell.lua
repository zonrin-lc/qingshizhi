-- qingshi/ui/shell.lua —— 对局壳:安全区 + 单行顶栏(牌匾按钮+大标题) + 66/34 双卷轴(叙事·立绘 | 属性)+ 底部牌匾决策区
-- 规避刘海与 TapTap 胶囊:全部可交互内容包在 SafeAreaView(nativeMenuInset)内。
-- 底栏选项横向排列(超宽自动换行),决策不再占整块竖向空间。
local UI = require("urhox-libs/UI")
local T = require("qingshi/ui/theme")
local Voice = require("qingshi/ui/voice")
local Music = require("qingshi/ui/music")

local Shell = {}

local env_ = {
  game = nil,
  selScen = 'lisi',
  selDiff = 'normal',
  lastSettleText = nil,
  root = nil,
}
Shell.env = env_

local SEG_INTERVAL = 0.65

-- 叙事渐显间隔可经设置页调整(见 home 设置)
function Shell.setSegDelay(v)
  if type(v) == 'number' and v > 0 then SEG_INTERVAL = v end
end

-- ---------- 顶部状态条 ----------

-- 顶栏牌匾按钮:美术牌匾底图 + 居中文字
local function plaqueBtn(text, img, color, onClick, id)
  return UI.Panel {
    id = id, width = 96, height = 34,
    backgroundImage = img, backgroundFit = "fill",
    alignItems = "center", justifyContent = "center",
    pointerEvents = "auto", onClick = onClick,
    children = { T.lbl { t = text, size = T.FS.cap, color = color or T.COLOR.inkSoft, wrap = false } },
  }
end

local function topbarWidgets()
  local chap = UI.Label {
    text = '', fontSize = T.FS.title, fontColor = T.COLOR.inkHeavy, fontWeight = "bold",
    fontFamily = T.FONT_KAI, whiteSpace = "nowrap", maxLines = 1,
  }
  -- 大标题下金线菱饰分隔(美术素材,横线 + 中央菱饰)
  local rule = UI.Panel { width = "72%", height = 10,
    backgroundImage = T.PART.titleRule, backgroundFit = "fill", pointerEvents = "none" }
  local backtrackBtn = plaqueBtn('回溯', T.PART.plateRewind, T.COLOR.card, function() Shell.backtrackAsk() end, "btnBack")
  env_.backLbl = backtrackBtn.children[1]
  env_.backBox = backtrackBtn
  -- 返回主菜单:确认后离局(进度已在存档里)
  local homeBtn = plaqueBtn('← 返回', T.PART.plateBack, T.COLOR.inkSoft, function()
    Shell.confirm('返回主菜单?', '当前进度已保存,可随时从「继续旅程」回来。',
      function() Shell.showMenu() end, '返 回')
  end, "btnHome")
  return { chap = chap, rule = rule, backBtn = backtrackBtn, homeBtn = homeBtn, row = nil }
end

-- ---------- 页面切换 ----------

function Shell.showMenu()
  env_.root:SetBackgroundImage(T.BG_INK)
  Music.SetScenario('idle')        -- 待机:切菜单主题曲(同曲重入不打断)
  env_.menuLayer:SetVisible(true)
  env_.tw.row:SetVisible(false)
  env_.gameArea:SetVisible(false)
  env_.homeSC:SetVisible(false)
  env_.bottomBar:SetVisible(false)
  -- 子页可见性复位:存档/设置页曾各自独显(renderMenu 只重建 menuMain 子节点,
  -- 不碰可见性),不重置会让「返回主菜单」落在陈旧的存档/设置页上
  env_.menuMain:SetVisible(true)
  env_.menuSaves:SetVisible(false)
  env_.menuSettings:SetVisible(false)
  Shell.cancelReveal()
  Shell.renderMenu()
end

function Shell.showHome()
  env_.menuAnim = nil          -- 离开菜单:停止入场/星火时序(控件已不可见)
  env_.root:SetBackgroundImage(T.BG_INK)
  Music.SetScenario('idle')    -- 选择页仍属待机:续播菜单主题曲
  env_.menuLayer:SetVisible(false)
  env_.tw.row:SetVisible(false)
  env_.gameArea:SetVisible(false)
  env_.bottomBar:SetVisible(false)
  env_.homeSC:SetVisible(true)
  Shell.renderHome()
end

function Shell.showGame()
  env_.menuAnim = nil          -- 同上:入对局即停菜单时序
  env_.root:SetBackgroundImage(T.BG_GAME)   -- 对局页整幅山水底
  -- 按当前剧本切换主题曲:首次进入从无人声版起播,同剧本重入不打断
  if env_.game then Music.SetScenario(env_.game.d.SCENARIO.id) end
  env_.menuLayer:SetVisible(false)
  env_.tw.row:SetVisible(true)
  env_.homeSC:SetVisible(false)
  env_.gameArea:SetVisible(true)
  env_.bottomBar:SetVisible(true)
  Shell.renderTop()
end

function Shell.renderTop()
  local g = env_.game
  if not g then return end
  local tw = env_.tw
  local ch = g:chapter()
  -- 大标题:剧本名 ｜ 章名(章名内的「｜」换空格,偏离度已挪至右栏底部)
  local ct = ch and ch.title or ''
  ct = ct:gsub('｜', ' ')
  tw.chap:SetText(g.d.SCENARIO.name .. ' ｜ ' .. ct)
  -- 回溯:可回溯时亮起,不可回溯(硬核/次数用尽)时压暗;有次数则显示剩余
  env_.backBox:SetOpacity(g:canBacktrack() and 1 or 0.35)
  env_.backLbl:SetText(g.diff.backtrack > 0
    and ('回溯 ' .. tostring(math.max(0, g.diff.backtrack - g.backtracksThisChapter))) or '回溯')
end

function Shell.clearMain()
  -- 先 cancel 后 clear:cancelReveal 会把未播完的段落 AddChild 回 mainBox,
  -- 顺序颠倒会让上一页的残留文本混进新页面
  Shell.cancelReveal()
  Voice.Stop()                     -- 切页即停当前朗读;各页 renderX 随后按新内容重新 Play
  T.destroyChildren(env_.mainBox)
end

function Shell.clearOpts()
  T.destroyChildren(env_.optBox)
end

function Shell.scrollMainTop() env_.mainSC:SetScroll(0, 0) end
function Shell.scrollMainBottom() env_.mainSC:ScrollToBottom() end

-- ---------- 逐句渐显 ----------

Shell.revealing = nil
Shell.revealGen = 0

function Shell.cancelReveal()
  local rv = Shell.revealing
  if rv then
    Shell.revealing = nil
    while rv.i < #rv.items do
      rv.i = rv.i + 1
      env_.mainBox:AddChild(rv.items[rv.i])
    end
    if rv.done then rv.done() end
  end
end

function Shell.revealSegs(items, done)
  Shell.cancelReveal()
  if #items == 0 then if done then done() end return end
  Shell.revealGen = Shell.revealGen + 1
  local rv = { items = items, i = 0, timer = 0, done = done }
  Shell.revealing = rv
  rv.i = 1
  env_.mainBox:AddChild(items[1])
  Shell.scrollMainBottom()
end

function Shell.Update(timeStep)
  -- 主菜单入场时序推进
  if Shell.tickMenuAnim then Shell.tickMenuAnim(timeStep) end
  -- 选择页齿轮等常驻自绘控件
  if Shell.tickWidgets then Shell.tickWidgets(timeStep) end
  Voice.Update(timeStep)           -- 朗读:当前段播完,隔一小段停顿后续播下一段
  Music.Update(timeStep)           -- BGM:无人声/人声两版循环
  local rv = Shell.revealing
  if not rv then return end
  rv.timer = rv.timer + timeStep
  while rv.timer >= SEG_INTERVAL and Shell.revealing == rv do
    rv.timer = rv.timer - SEG_INTERVAL
    if rv.i >= #rv.items then
      Shell.revealing = nil
      if rv.done then rv.done() end
      return
    end
    rv.i = rv.i + 1
    env_.mainBox:AddChild(rv.items[rv.i])
    Shell.scrollMainBottom()
  end
end

function Shell.TapReveal()
  if Shell.revealing then Shell.cancelReveal() end
end

-- ---------- 回溯确认 ----------

function Shell.backtrackAsk()
  local g = env_.game
  if not g or not g:canBacktrack() then return end
  Shell.confirm('回溯到本章开头？',
    '· 剩余额度 ' .. (g.diff.backtrack > 0 and tostring(g.diff.backtrack - g.backtracksThisChapter) or '不限') .. ' 次\n'
      .. '· 本章进度回到开头；偏离度与图鉴不重置\n'
      .. '· 蓄势与险招烧毁会被清空',
    function() g:backtrack(); Shell.renderIntro(true) end, '回 溯')
end

function Shell.confirm(title, body, onYes, yesText)
  env_.confirmCb = onYes
  env_.cTitle:SetText(title)
  env_.cBody:SetText(body)
  -- 确定按钮文案按场景传入(回溯/返回/退出),缺省「确 定」
  env_.cYesLbl:SetText(yesText or '确 定')
  env_.confirmLayer:SetVisible(true)
end

-- ---------- 子模块挂接 ----------

function Shell.attachModules()
  local Home = require("qingshi/ui/home")
  local Game = require("qingshi/ui/game")
  Home.attach(Shell)
  Game.attach(Shell)
  Shell.tickMenuAnim = Home.tickMenuAnim   -- 主菜单入场时序(Update 调用)
end

-- ---------- 构建 ----------

function Shell.Build()
  local tw = topbarWidgets()
  env_.tw = tw

  -- 顶栏:单行(返回牌匾 ｜ 居中大标题+金线菱饰 ｜ 回溯牌匾)
  local topRow_ = UI.Panel {
    id = "topRow", flexDirection = "row", alignItems = "center",
    padding = 6, paddingLeft = 16, paddingRight = 16, gap = 10,
    children = {
      tw.homeBtn,
      UI.Panel { flexGrow = 1, flexBasis = 0, flexDirection = "column",
        alignItems = "center", gap = 2, children = { tw.chap, tw.rule } },
      tw.backBtn,
    },
  }
  tw.row = topRow_

  -- 左栏:叙事(66%),横卷轴底板;内分 立绘列 | 正文滚动列
  local mainBox = UI.Panel { id = "mainBox", width = "100%", flexDirection = "column", gap = 2,
    alignItems = "stretch", pointerEvents = "box-none", padding = 6 }
  env_.mainBox = mainBox
  env_.mainSC = UI.ScrollView {
    id = "mainScroll", flexGrow = 1, flexBasis = 0, height = "100%",
    scrollY = true, showScrollbar = false,
    onClick = function() Shell.TapReveal() end,
    children = { mainBox },
  }

  -- 立绘列:常驻左卷轴内侧;出场角色切换,无出场角色时显示主角(game.lua renderPortrait 驱动)
  -- 立绘统一 512x768(2:3):面板按宽高比定高 + fill 精确映射;
  -- 不用 contain——面板与贴图间的留白区会以贴图边缘行晕染(clamp),顶部会拖出竖向色带
  env_.portraitImg = UI.Panel { width = "100%", aspectRatio = 512 / 768,
    backgroundFit = "fill", pointerEvents = "none" }
  env_.portraitName = T.lbl { t = '', size = T.FS.note, color = T.COLOR.inkDim, wrap = false }
  local portraitCol = UI.Panel { id = "portraitCol", width = "30%", height = "100%",
    flexDirection = "column", alignItems = "center", justifyContent = "flex-end",
    gap = 4, paddingRight = 8, paddingBottom = 10, pointerEvents = "none",
    children = { env_.portraitImg, env_.portraitName } }

  -- 右栏:常驻竖栏 tab(属性 / 图鉴),默认展示属性,竖卷轴底板。
  env_.sideCol = UI.Panel { id = "sideCol", width = "34%", height = "100%",
    backgroundImage = T.PART.scrollSide, backgroundFit = "fill", overflow = "hidden",
    flexDirection = "column", children = {
      -- 头部:题字「属 性」+ 金线菱饰(由 game.lua renderSideTabs 填充)
      UI.Panel { id = "sideTabs", width = "100%", flexDirection = "column", children = {} },
      -- 内容(由 game.lua 的 renderSide 填充)
      UI.Panel { id = "sideBody", width = "100%", flexGrow = 1, flexBasis = 0,
        children = {} },
    } }

  env_.gameArea = UI.Row {
    id = "gameArea", width = "100%", flexGrow = 1, flexBasis = 0,
    children = {
      UI.Panel { id = "narrCol", width = "66%", height = "100%",
        backgroundImage = T.PART.scrollStory, backgroundFit = "fill",
        paddingLeft = 42, paddingRight = 30, paddingTop = 22, paddingBottom = 16,
        children = {
          UI.Row { width = "100%", height = "100%", children = { portraitCol, env_.mainSC } },
        } },
      env_.sideCol,
    },
  }

  -- 底部决策区:固定一行 4 列(不足 4 个的章节留空,由 justifyContent 居中)
  env_.optBox = UI.Panel { id = "optBox", width = "100%", flexDirection = "row",
    gap = 8, alignItems = "stretch", padding = 10, justifyContent = "center" }
  env_.bottomBar = UI.Panel {
    id = "bottomBar", width = "100%", maxHeight = "42%", overflow = "scroll",
    children = { env_.optBox },
  }

  -- 主页滚动容器(选择页)
  -- minHeight 撑满一屏:内容不足时仍垂直居中(超出时照常滚动)
  env_.homeWrap = UI.Panel { alignSelf = "stretch", width = "100%",
    minHeight = "100%", justifyContent = "center",
    flexDirection = "column", alignItems = "center", gap = 10, padding = 16 }
  env_.homeSC = UI.ScrollView {
    id = "homeScroll", width = "100%", flexGrow = 1, flexBasis = 0,
    scrollY = true, showScrollbar = false, children = { env_.homeWrap },
  }

  -- 确认浮层
  local cTitle = T.lbl { t = '', size = T.FS.ui, color = T.COLOR.zhu, bold = true, width = "86%" }
  local cBody = T.lbl { t = '', size = T.FS.note, color = T.COLOR.ink, width = "86%", lh = 1.8 }
  env_.cTitle, env_.cBody = cTitle, cBody
  env_.confirmLayer = UI.Panel {
    id = "confirmLayer", position = "absolute", top = 0, left = 0, right = 0, bottom = 0,
    backgroundColor = { 42, 37, 29, 120 }, justifyContent = "center", alignItems = "center",
    visible = false, pointerEvents = "auto",
    children = {
      UI.Panel { width = "86%", maxWidth = 430, padding = 22, gap = 14,
        backgroundColor = T.COLOR.card, borderRadius = 14, borderWidth = 1, borderColor = T.COLOR.line,
        children = { cTitle, cBody,
          UI.Row { gap = 12, justifyContent = "center", children = {
            T.Btn { text = '再想想', onClick = function() env_.confirmLayer:SetVisible(false) end },
            (function()
              local yesBtn = T.Btn { text = '确 定', variant = 'primary', onClick = function()
                env_.confirmLayer:SetVisible(false)
                if env_.confirmCb then env_.confirmCb() end
              end }
              env_.cYesLbl = yesBtn.children[1]   -- T.Btn 是 Panel 包 Label,留引用供 confirm() 改文案
              return yesBtn
            end)(),
          } } } },
    },
  }

  -- 结算浮层
  env_.sTitle = T.lbl { t = '', size = T.FS.ui, color = T.COLOR.gold, bold = true, width = "92%" }
  env_.sText = UI.Panel { flexDirection = "column", width = "92%", gap = 4 }
  env_.sList = UI.Panel { flexDirection = "column", width = "92%", gap = 3 }
  env_.sAch = T.lbl { t = '', size = T.FS.note, color = T.COLOR.gold, width = "92%", wrap = false }
  env_.sAch:SetVisible(false)
  env_.sBand = T.lbl { t = '', size = T.FS.note, color = T.COLOR.warn, width = "92%", lh = 1.6 }
  env_.sBand:SetVisible(false)
  env_.settleLayer = UI.Panel {
    id = "settleLayer", position = "absolute", top = 0, left = 0, right = 0, bottom = 0,
    backgroundColor = { 42, 37, 29, 150 }, justifyContent = "center", alignItems = "center",
    visible = false, pointerEvents = "auto",
    children = {
      UI.Panel { width = "88%", maxWidth = 600, padding = 20, gap = 10,
        backgroundColor = T.COLOR.card, borderRadius = 14, borderWidth = 1, borderColor = T.COLOR.gold,
        children = {
          env_.sTitle, env_.sText, env_.sList, env_.sAch, env_.sBand,
          UI.Row {
            justifyContent = "center", marginTop = 6,
            children = {
              T.Btn { text = '继 续', variant = 'primary', size = T.FS.ui, onClick = function()
                env_.settleLayer:SetVisible(false)
                Shell.saveCollection()
                if env_.settleCb then env_.settleCb() end
              end },
            },
          },
        },
      },
    },
  }

  -- 主菜单层
  -- 主菜单:绝对定位子元素铺满(见 home.renderMenu),容器不做居中约束
  env_.menuMain = UI.Panel { width = "100%", height = "100%", alignItems = "stretch" }
  env_.menuSaves = UI.Panel { width = "100%", height = "100%", flexDirection = "column",
    alignItems = "center", justifyContent = "center", gap = 8, visible = false,
    children = { UI.Label { text = '占位', fontSize = 1 } } }
  -- 设置页:与存档页同层,内容居中
  env_.menuSettings = UI.Panel { width = "100%", height = "100%", flexDirection = "column",
    alignItems = "center", justifyContent = "center", gap = 0, visible = false,
    backgroundImage = T.BG_INK, backgroundFit = "cover",
    children = { UI.Label { text = '占位', fontSize = 1 } } }
  env_.menuLayer = UI.Panel {
    id = "menuLayer", position = "absolute", top = 0, left = 0, right = 0, bottom = 0,
    backgroundColor = T.COLOR.app, pointerEvents = "auto",
    children = { env_.menuMain, env_.menuSaves, env_.menuSettings },
  }

  -- 内容根(不含浮层):状态条 + 对局区/主页区
  local contentRoot = UI.Panel {
    id = "contentRoot", width = "100%", flexGrow = 1, flexBasis = 0, flexDirection = "column",
    children = { topRow_, env_.gameArea, env_.homeSC, env_.bottomBar },
  }

  -- 安全区包裹:所有可交互内容避开刘海/圆角/TapTap 胶囊
  local safe = UI.SafeAreaView {
    id = "safeRoot", width = "100%", height = "100%", nativeMenuInset = true,
    backgroundColor = T.COLOR.app,
    backgroundImage = T.BG_INK, backgroundFit = "cover",
    children = { contentRoot, env_.menuLayer, env_.confirmLayer, env_.settleLayer },
  }

  env_.root = safe
  Shell.attachModules()
  -- 应用上次保存的设置(速度/正文字号;缩放交由用户显式修改时再接管)
  if Shell.applySettings then Shell.applySettings(Shell.loadSettings(), true) end
  Shell.showMenu()
  return safe
end

return Shell
