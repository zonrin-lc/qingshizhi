-- qingshi/ui/theme.lua —— 「精致古籍」设计系统
-- 骨相:宣纸纹理底 + 五级墨色 + 朱批印章 + 赭金题签
-- 层次:字号阶(6 级)/ 间距阶(5 级)/ 墨色阶(4 级),取代随手尺寸
local UI = require("urhox-libs/UI")

local Theme = {}

Theme.FONT_KAI = "kai"     -- 霞鹜文楷(正文/叙事/标题,子集化)
Theme.FONT_SANS = "sans"   -- MiSans(fallback,接 emoji 与个别缺字)

-- ---------- 字号阶(6 级,收敛原 11–15 的混乱) ----------
-- 用法:size = T.FS.h1 / .h2 / .title / .body / .note / .cap
Theme.FS = {
  h1    = 52,   -- 主标题(主菜单书名)
  h2    = 30,   -- 页标题(章名/结局名)
  title = 22,   -- 区块标题(事件名/小节)
  body  = 17,   -- 正文(叙事)
  ui    = 15,   -- 界面文字(选项/按钮)
  note  = 13,   -- 注记(说明/次要信息)
  cap   = 11,   -- 极小(脚注/角标)
}

-- 菜单专用放大档(主菜单右侧整体更醒目)
Theme.FS.menu   = 30   -- 菜单项
Theme.FS.sub    = 20   -- 副标题

-- ---------- 间距阶(5 级) ----------
Theme.SP = { xs = 4, sm = 8, md = 14, lg = 22, xl = 34 }

-- ---------- 圆角阶 ----------
Theme.R = { sm = 4, md = 8, lg = 12, pill = 999 }

Theme.COLOR = {
  -- 纸层(淡墨远山为底,此三色用于卡/浮层)
  app     = { 242, 234, 216, 255 },  -- #f2ead8 整页底(v4 米白)
  paper   = { 246, 239, 224, 255 },  -- 内容区纸面
  card    = { 250, 245, 233, 255 },  -- 卡片(浮起)
  cardSel = { 255, 252, 242, 255 },  -- 选中卡
  -- 墨色阶(5 级浓淡)
  inkHeavy  = { 26, 22, 18, 255 },   -- 一级:标题,近黑
  inkStrong = { 42, 37, 29, 255 },   -- 二级:强调
  ink       = { 62, 55, 44, 255 },   -- 三级:正文
  inkSoft   = { 96, 86, 70, 255 },   -- 四级:次要
  inkDim    = { 132, 120, 100, 255 },-- 五级:注脚
  -- 印色
  zhu    = { 176, 67, 47, 255 },     -- 朱
  zhuHi  = { 158, 52, 34, 255 },     -- 深朱(浅底可读)
  gold   = { 138, 106, 52, 255 },    -- 赭金
  goldHi = { 196, 160, 90, 255 },    -- 亮金(描边/高亮)
  qing   = { 70, 112, 105, 255 },    -- 青碧
  good   = { 86, 116, 68, 255 },     -- 墨绿
  warn   = { 176, 110, 45, 255 },    -- 赭橙
  orange = { 176, 110, 45, 255 },    -- 别名
  -- 线/面
  line     = { 198, 180, 146, 255 }, -- 细金线
  lineSoft = { 214, 200, 174, 255 }, -- 更淡
  track    = { 42, 37, 29, 22 },
}

-- 淡墨远山底图(对局页通用)
Theme.BG_INK = "ui/bg-ink.jpg"
-- 选择页底图(美术交付:远山 + 扁舟 + 芦苇)
Theme.BG_SELECT = "ui/bg-select.jpg"
-- 美术交付的 UI 素材(assets/ui/parts/)
Theme.PART = {
  title      = "ui/parts/title.png",        -- 青史志 书法标题
  wheelRing  = "ui/parts/wheel_ring.png",   -- 罗盘底板(环带 + 刻度 + 四向菱饰)
  cardFrame  = "ui/parts/card_frame.png",   -- 立绘外框(细金线,内部透明)
  scenPlate  = "ui/parts/scen_plate.png",   -- 剧本名匾额(竖排)
  deco       = "ui/parts/deco.png",         -- 小标题两侧菱饰
  backBtn    = "ui/parts/back_btn.png",     -- 返回按钮(罗盘形)
  diffOn     = "ui/parts/diff_on.png",      -- 难度胶囊·选中
  diffOff    = "ui/parts/diff_off.png",     -- 难度胶囊·未选中
  btnEnter   = "ui/parts/btn_enter.png",    -- 入局按钮(旧素材,已不用)
  vortex     = "ui/parts/btn_vortex.png",   -- 入局按钮底:水墨漩涡(透明底)
  -- 对局页 v2(牌匾/卷轴素材)
  scrollStory = "ui/parts/scroll_story.png",   -- 左侧剧情横卷轴底板
  scrollSide  = "ui/parts/scroll_side.png",    -- 右侧属性竖卷轴底板
  plateBack   = "ui/parts/plate_back.png",     -- 顶栏返回牌匾
  plateRewind = "ui/parts/plate_rewind.png",   -- 顶栏回溯牌匾(朱)
  plateOpt    = "ui/parts/plate_opt.png",      -- 底部选项牌匾(常态)
  plateOptHot = "ui/parts/plate_opt_hover.png",-- 底部选项牌匾(悬停)
  titleRule   = "ui/parts/title_rule.png",     -- 顶栏大标题下金线菱饰分隔
}
-- 对局页整幅山水底(梅枝/竹/扁舟)
Theme.BG_GAME = "ui/bg-game.png"
-- 五朝建筑剪影(罗盘中心背景)
Theme.ARCH = {
  ['秦'] = "arch/qin.jpg", ['汉'] = "arch/han.jpg", ['唐'] = "arch/tang.jpg",
  ['宋'] = "arch/song.jpg", ['明'] = "arch/ming.jpg",
}
-- 宣纸纹理(平铺;UI.Panel backgroundImage 用)
Theme.PAPER_TEX = "ui/paper-tex.jpg"
-- 书法主标题(透明底 PNG,竖排)
Theme.TITLE_IMG = "ui/logo/title-calligraphy.png"

-- 当前 UI 缩放(转发库实现;主题层统一出口,避免各处直接 require Core)
function Theme.GetScale() return UI.Theme.GetScale() end

-- 清空容器并销毁子树。ClearChildren 只 detach 不释放(Yoga 节点无 __gc 兜底,会泄漏);
-- Destroy 递归释放并将自身从 parent 摘除,故先快照再逐个销毁,不能边遍历 children 边销。
function Theme.destroyChildren(container)
  local kids = container.children
  if #kids == 0 then return end
  local snap = {}
  for i = 1, #kids do snap[i] = kids[i] end
  for i = 1, #snap do snap[i]:Destroy() end
end

-- ---------- hex → rgba(段循环 1..2,已修;脏输入回落赭金) ----------
local function hex2num(h)
  local n = 0
  for i = 1, 2 do
    local c = string.byte(h, i)
    local v
    if not c then return nil end
    if c >= 48 and c <= 57 then v = c - 48
    elseif c >= 65 and c <= 70 then v = c - 55
    elseif c >= 97 and c <= 102 then v = c - 87
    else return nil end
    n = n * 16 + v
  end
  return n
end

function Theme.hex2rgba(s, alpha)
  s = tostring(s or '')
  local body = string.gsub(s, '^#', '')
  if #body ~= 6 and #body ~= 8 then return { 138, 106, 52, alpha or 255 } end
  local r, g, b = hex2num(string.sub(body, 1, 2)), hex2num(string.sub(body, 3, 4)), hex2num(string.sub(body, 5, 6))
  if not r or not g or not b then return { 138, 106, 52, alpha or 255 } end
  local a = (#body == 8) and hex2num(string.sub(body, 7, 8)) or (alpha or 255)
  return { r, g, b, a }
end

-- ---------- 富文本 run 拆分(⟦词条⟧ → 可点) ----------
function Theme.richRuns(s)
  local runs = {}
  s = tostring(s or '')
  local pos = 1
  while true do
    local b = string.find(s, '⟦', pos, true)
    if not b then
      runs[#runs + 1] = { text = string.sub(s, pos), gloss = false }
      break
    end
    if b > pos then runs[#runs + 1] = { text = string.sub(s, pos, b - 1), gloss = false } end
    local e = string.find(s, '⟧', b + 3, true)
    if not e then
      runs[#runs + 1] = { text = string.sub(s, b), gloss = false }
      break
    end
    local term = string.sub(s, b + 3, e - 1)
    runs[#runs + 1] = { text = term, gloss = term }
    pos = e + 3
  end
  return runs
end

-- ---------- 基础墨字 ----------
-- o:{t, size(或档位名 'h1'..'cap'), color, bold, align, width, wrap(false=单行), mt, mb, font}
function Theme.lbl(o)
  o = o or {}
  local sz = o.size
  if type(sz) == 'string' then sz = Theme.FS[sz] end
  return UI.Label {
    text = o.t or '',
    fontSize = sz or Theme.FS.ui,
    fontColor = o.color or Theme.COLOR.ink,
    fontWeight = o.bold and "bold" or "normal",
    fontFamily = o.font or Theme.FONT_KAI,
    whiteSpace = o.wrap == false and "nowrap" or "normal",
    textAlign = o.align, width = o.width,
    lineHeight = o.lh or 1.65,
    letterSpacing = o.ls,
    marginTop = o.mt, marginBottom = o.mb, marginLeft = o.ml,
    maxWidth = o.maxw,
  }
end

-- ---------- 宣纸底(纹理铺满,作根容器背景) ----------
-- 注:UI 库 backgroundFit 仅 fill/contain/cover,无 repeat;
-- 故纹理以 cover 铺满根容器(512px 纹理在大屏轻微柔化,可接受)。
function Theme.Paper(o)
  o = o or {}
  return UI.Panel {
    width = o.w or "100%", height = o.h or "100%",
    backgroundColor = o.color or Theme.COLOR.app,
    backgroundImage = Theme.PAPER_TEX, backgroundFit = "cover",
    flexDirection = o.dir or "column",
    children = o.children,
  }
end

-- ---------- 纸卡片(双层描边模拟纸张厚度;选中/危险以朱金区分) ----------
-- o:{w, sel, danger, gold, pad, gap, onClick, children, radius, noBg, flex}
function Theme.Card(o)
  o = o or {}
  local C = Theme.COLOR
  local accent = o.sel and C.gold or (o.danger and C.zhu or (o.gold and C.gold or nil))
  -- 外层:纸面 + 边;accent 有值时以左侧竖线作朱批标记(古籍眉批感)
  local panel = UI.Panel {
    width = o.w, flexGrow = o.flex and 1 or nil, flexBasis = o.flex and 0 or nil,
    flexShrink = o.flex and 1 or nil,
    minWidth = o.flex and 190 or nil,
    padding = o.pad or 14, gap = o.gap or 5,
    flexDirection = o.dir or "column",
    alignItems = o.alignItems,
    backgroundColor = o.noBg and { 0, 0, 0, 0 } or (o.sel and C.cardSel or C.card),
    borderRadius = o.radius or 8,
    borderWidth = 1,
    borderColor = accent or C.lineSoft,
    pointerEvents = o.onClick and "auto" or "none",
    onClick = o.onClick,
    marginBottom = o.mb, marginTop = o.mt,
    children = o.children,
  }
  if o.opacity then panel:SetOpacity(o.opacity) end
  return panel
end

-- ---------- 牌匾选项卡(对局页底部决策区:图片底 + 悬停换图;保留多行信息结构) ----------
-- o:{flex, w, pad, gap, onClick, children, locked, danger, sel, mb, mt, opacity}
function Theme.Plaque(o)
  o = o or {}
  local C = Theme.COLOR
  local panel = UI.Panel {
    width = o.w, flexGrow = o.flex and 1 or nil, flexBasis = o.flex and 0 or nil,
    flexShrink = o.flex and 1 or nil,
    minWidth = o.flex and 190 or nil,
    padding = o.pad or 10, paddingLeft = (o.pad or 10) + 14, paddingRight = (o.pad or 10) + 14,
    gap = o.gap or 3,
    flexDirection = "column",
    justifyContent = "center",
    backgroundColor = { 0, 0, 0, 0 },
    backgroundImage = Theme.PART.plateOpt, backgroundFit = "fill",
    borderWidth = (o.danger or o.sel) and 1 or 0,
    borderColor = o.danger and C.zhu or C.gold,
    borderRadius = 4,
    pointerEvents = o.onClick and "auto" or "none",
    onClick = o.onClick,
    marginBottom = o.mb, marginTop = o.mt,
    children = o.children,
  }
  if o.opacity then panel:SetOpacity(o.opacity) end
  if o.onClick then
    panel.props.onPointerEnter = function() panel:SetBackgroundImage(Theme.PART.plateOptHot) end
    panel.props.onPointerLeave = function() panel:SetBackgroundImage(Theme.PART.plateOpt) end
  end
  return panel
end

-- ---------- 竖排文字(古籍题签:逐字竖叠) ----------
-- 注:必须按 UTF-8 字符切分,string.sub 按字节切会碎中文
-- o:{size, color, bold, gap, ls}
function Theme.VText(text, o)
  o = o or {}
  local kids = {}
  for _, ch in utf8.codes(text) do
    local s = utf8.char(ch)
    if s ~= ' ' and s ~= '　' then   -- 半角/全角空格皆跳过
      -- lh 默认 1.65(正文行距),竖排单字会撑得很开,故默认收到 1.05
      kids[#kids + 1] = Theme.lbl { t = s, size = o.size, color = o.color,
        bold = o.bold, wrap = false, ls = o.ls, lh = o.lh or 1.05 }
    end
  end
  return UI.Panel { flexDirection = "column", alignItems = "center",
    gap = o.gap or 0, children = kids }
end

-- ---------- 卷轴题签分隔:金线 ── 菱饰 ── 题字 ── 菱饰 ── 金线 ----------
function Theme.Divider(text, o)
  o = o or {}
  local C = Theme.COLOR
  local dh = o.deco or 20                       -- 菱饰高(宽按素材 126:190 折算)
  local function ornament()
    return UI.Panel {
      width = math.floor(dh * 126 / 190), height = dh,
      backgroundImage = Theme.PART.deco, backgroundFit = "contain",
      pointerEvents = "none",
    }
  end
  -- 金线:高度用 2 逻辑px(缩放后仍有可见厚度),宽度由 flexGrow 分配。
  -- 注意:必须给 Row 显式宽度 —— 父级若是内容自适应列,width="100%" 会解析成
  -- auto,两个 flexGrow 子项分不到宽度 → 金线宽 0 而整条消失。
  local function rule()
    return UI.Panel { flexGrow = 1, flexBasis = 0, height = 2,
      backgroundColor = C.line }
  end
  return UI.Row {
    gap = 10, alignItems = "center", justifyContent = "center",
    width = o.width or "100%", marginTop = o.mt or 10, marginBottom = o.mb or 6,
    children = {
      rule(),
      ornament(),
      -- wrap=false(nowrap)必须显式给:Row 内父级宽度不定,normal 会把文字折成 0 宽而不可见
      Theme.lbl { t = text, size = o.size or 13, color = C.gold, bold = true,
        ls = 3, wrap = false },
      ornament(),
      rule(),
    },
  }
end

-- ---------- 印章(朱框方印,单字大字号;双字如「甲上」自动缩小) ----------
function Theme.Seal(text, o)
  o = o or {}
  local C = Theme.COLOR
  local sz = o.size or 46
  local nChar = utf8.len(text or '') or 1
  local fs = o.fs or math.floor(sz * (nChar > 1 and 0.34 or 0.5))
  return UI.Panel {
    width = sz, height = sz, borderRadius = 6,
    backgroundColor = o.fill and C.zhu or { 176, 67, 47, 22 },
    borderWidth = 2, borderColor = o.fill and C.card or C.zhu,
    justifyContent = "center", alignItems = "center",
    pointerEvents = "none",
    children = {
      UI.Label {
        text = text or '', fontSize = fs,
        fontColor = o.fill and C.card or C.zhu, fontWeight = "bold",
        fontFamily = Theme.FONT_KAI, textAlign = "center",
      },
    },
  }
end

-- ---------- 纸墨按钮 ----------
-- o:{text, variant(primary=朱底/ghost=墨线框), size, w, disabled, onClick, mb}
function Theme.Btn(o)
  o = o or {}
  local C = Theme.COLOR
  local primary = o.variant == 'primary'
  local dis = o.disabled
  -- 禁用则真的摘掉回调:不能用 `dis and nil or o.onClick`
  -- (Lua 里 `x and nil or y` 恒等于 y,禁用按钮照样会响应点击)
  local onClick = o.onClick
  if dis then onClick = nil end
  return UI.Panel {
    width = o.w,
    padding = o.pad or 12, paddingLeft = (o.pad or 12) + 8, paddingRight = (o.pad or 12) + 8,
    backgroundColor = dis and C.lineSoft or (primary and C.zhu or C.card),
    borderRadius = 8, borderWidth = primary and 0 or 1, borderColor = C.line,
    alignItems = "center", justifyContent = "center",
    marginBottom = o.mb, marginTop = o.mt,
    pointerEvents = (dis or not onClick) and "none" or "auto",
    onClick = onClick,
    children = {
      UI.Label {
        text = o.text or '', fontSize = o.size or 16,
        fontColor = dis and C.inkDim or (primary and C.card or C.ink),
        fontWeight = "bold", fontFamily = Theme.FONT_KAI, textAlign = "center",
      },
    },
  }
end

-- ---------- 富文本叙事段:⟦词条⟧ → RichText link(库级换行+点击,替代自拼 wrap 面板) ----------
local function attrEsc(s)
  s = tostring(s or '')
  s = string.gsub(s, '"', '&quot;')
  s = string.gsub(s, '<', '&lt;')
  s = string.gsub(s, '>', '&gt;')
  return s
end

function Theme.glossToLink(s)
  s = tostring(s or '')
  local out = {}
  local pos = 1
  while true do
    local b = string.find(s, '⟦', pos, true)
    if not b then out[#out + 1] = string.sub(s, pos) break end
    out[#out + 1] = string.sub(s, pos, b - 1)
    local e = string.find(s, '⟧', b + 3, true)
    if not e then out[#out + 1] = string.sub(s, b) break end
    local term = string.sub(s, b + 3, e - 1)
    out[#out + 1] = '<link url="' .. attrEsc(term) .. '">' .. term .. '</link>'
    pos = e + 3
  end
  return table.concat(out)
end

-- o:{size, color, mb, mt, onGloss, lh}
function Theme.richSeg(text, o)
  o = o or {}
  local C = Theme.COLOR
  local sz = o.size
  if type(sz) == 'string' then sz = Theme.FS[sz] end
  return UI.RichText {
    content = Theme.glossToLink(text),
    fontSize = sz or Theme.FS.body,
    fontColor = o.color or C.ink,
    linkColor = C.gold,
    lineHeight = o.lh or 1.85,   -- 古籍阅读感:行距放宽
    width = "100%",
    marginBottom = o.mb or 10, marginTop = o.mt,
    onLinkClick = o.onGloss and function(url, t) o.onGloss(url) end or nil,
  }
end

return Theme
