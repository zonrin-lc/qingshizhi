-- ============================================================================
-- main.lua  五丈原·改命 —— 入口与流程编排
-- 主题:涌现。玩家扮演诸葛亮做关键抉择,但每个选择只扰动状态变量;
-- 变量间的反馈回路 + 司马懿 AI + 街亭/会战的自发判定,共同推演出
-- 没人预设过的"历史"。每局结束自动生成文言编年史。
-- ============================================================================

local UI = require("urhox-libs/UI")
local GameState = require("GameState")
local Events = require("Events")
local Chronicle = require("Chronicle")

-- ============================================================================
-- 全局
-- ============================================================================
---@type Widget|nil
local uiRoot_ = nil
local state_ = GameState.New()
local bars_ = {}      -- key -> { bar = ProgressBar, label = Label, def = VarDef }

-- 水墨宣纸色调
local COLOR = {
    bg     = { 24, 20, 16, 255 },
    paper  = { 42, 36, 28, 235 },
    ink    = { 232, 222, 200, 255 },
    inkDim = { 168, 156, 132, 220 },
    gold   = { 212, 175, 96, 255 },
    line   = { 90, 78, 60, 160 },
}

local function clampInt(v)
    return math.floor(math.max(0, math.min(100, v + 0.5)))
end

-- ============================================================================
-- 生命周期
-- ============================================================================
function Start()
    graphics.windowTitle = "五丈原·改命"
    pcall(function() math.randomseed(os.time()) end)

    UI.Init({
        theme = "default-dark",
        scale = UI.Scale.DEFAULT,
    })

    BuildShell()
    ShowTitle()

    SubscribeToEvent("KeyDown", "HandleKeyDown")
    print("=== 五丈原·改命 started ===")
end

function Stop()
    UI.Shutdown()
end

---@param eventType string
---@param eventData KeyDownEventData
function HandleKeyDown(eventType, eventData)
    local key = eventData["Key"]:GetInt()
    if key == KEY_SPACE and state_.phase == "over" then
        Restart()
    end
end

function Restart()
    state_ = GameState.New()
    BuildShell()
    ShowTitle()
end

-- ============================================================================
-- UI 骨架:顶栏(状态条) + 中央内容区 + 底栏(史书滚动)
-- ============================================================================
function BuildShell()
    uiRoot_ = UI.Panel {
        id = "root",
        width = "100%",
        height = "100%",
        backgroundColor = COLOR.bg,
        children = {
            UI.Panel {
                id = "topBar",
                width = "100%",
                padding = { top = 10, bottom = 8, left = 16, right = 16 },
                gap = 6,
                backgroundColor = { 30, 26, 20, 255 },
                borderBottomWidth = 1,
                borderBottomColor = COLOR.line,
                children = {
                    UI.Panel {
                        flexDirection = "row",
                        justifyContent = "space-between",
                        alignItems = "baseline",
                        width = "100%",
                        children = {
                            UI.Label {
                                text = "五丈原·改命",
                                fontSize = 17,
                                fontColor = COLOR.gold,
                            },
                            UI.Label {
                                id = "roundLabel",
                                text = "",
                                fontSize = 12,
                                fontColor = COLOR.inkDim,
                            },
                        },
                    },
                    BuildBars(),
                },
            },
            -- 中央内容区(可滚动,防小屏溢出)
            UI.ScrollView {
                id = "content",
                flexGrow = 1,
                width = "100%",
                alignItems = "center",
                padding = { top = 20, bottom = 20, left = 16, right = 16 },
                pointerEvents = "auto",
            },
            -- 底栏:编年史
            UI.ScrollView {
                id = "chronicleScroll",
                width = "100%",
                height = 96,
                padding = { top = 8, bottom = 8, left = 16, right = 16 },
                borderTopWidth = 1,
                borderTopColor = COLOR.line,
                backgroundColor = { 18, 15, 12, 240 },
                gap = 4,
            },
        },
    }
    UI.SetRoot(uiRoot_, true)
    RefreshChronicle()
end

function BuildBars()
    bars_ = {}
    local rows = {}
    for _, d in ipairs(GameState.VAR_DEFS) do
        local label = UI.Label {
            text = string.format("%s %d", d.label, clampInt(state_.vars[d.key])),
            fontSize = 11,
            width = 72,
            fontColor = COLOR.inkDim,
        }
        local bar = UI.ProgressBar {
            flexGrow = 1,
            height = 6,
            max = 100,
            value = state_.vars[d.key],
            variant = state_:BarVariant(d.key),
        }
        bars_[d.key] = { bar = bar, label = label, def = d }
        table.insert(rows, UI.Panel {
            flexDirection = "row",
            alignItems = "center",
            gap = 8,
            width = "100%",
            children = { label, bar },
        })
    end
    return UI.Panel {
        id = "bars",
        width = "100%",
        gap = 3,
        children = rows,
    }
end

function RefreshBars()
    for key, refs in pairs(bars_) do
        local v = clampInt(state_.vars[key])
        refs.bar:SetValue(v)
        refs.bar:SetVariant(state_:BarVariant(key))
        local mark = refs.def.good == false and " ⚠" or ""
        refs.label:SetText(string.format("%s%s %d", refs.def.label, mark, v))
    end
    local rl = uiRoot_:FindById("roundLabel") --[[@as Label?]]
    if rl then
        if state_.phase == "over" then
            rl:SetText("天下大势,已定于一")
        else
            rl:SetText(string.format("建兴十二年%s · 第%d回合", Chronicle.SeasonName(state_.round), state_.round))
        end
    end
end

-- ============================================================================
-- 内容区
-- ============================================================================
function SetContent(node)
    local content = uiRoot_:FindById("content")
    if content then
        content:ClearChildren()
        content:AddChild(node)
    end
end

--- 抉择卡片(Panel 带 hover 态,规避 Button 不支持 children 布局的问题)
local function ChoiceCard(text, hint, onPress)
    local children = {
        UI.Label {
            text = text,
            fontSize = 15,
            fontColor = COLOR.ink,
            wordBreak = "break-word",
            flexShrink = 1,
        },
    }
    if hint then
        table.insert(children, UI.Label {
            text = hint,
            fontSize = 11,
            fontColor = { 150, 138, 112, 200 },
            flexShrink = 1,
        })
    end
    return UI.Panel {
        width = "100%",
        padding = { top = 10, bottom = 10, left = 14, right = 14 },
        gap = 3,
        borderRadius = 8,
        borderWidth = 1,
        borderColor = COLOR.gold,
        backgroundColor = { 52, 44, 32, 255 },
        hoverBackgroundColor = { 70, 58, 40, 255 },
        pressedBackgroundColor = { 84, 66, 44, 255 },
        alignItems = "flex-start",
        onClick = function() onPress() end,
        children = children,
    }
end

local function PrimaryButton(text, onPress)
    return UI.Button {
        text = text,
        variant = "primary",
        width = "100%",
        height = "auto",
        padding = { top = 12, bottom = 12, left = 14, right = 14 },
        borderRadius = 8,
        onClick = function() onPress() end,
    }
end

-- ============================================================================
-- 屏:标题
-- ============================================================================
function ShowTitle()
    RefreshBars()
    SetContent(UI.Panel {
        width = "100%",
        maxWidth = 520,
        gap = 18,
        alignItems = "center",
        padding = 24,
        children = {
            UI.Label { text = "五丈原·改命", fontSize = 30, fontColor = COLOR.gold },
            UI.Label {
                text = "建兴十二年,丞相亮最后一次北伐。\n这一次由你执子 —— 命运不由剧本写下,\n而由天下大势自己生长。",
                fontSize = 14,
                fontColor = COLOR.ink,
                textAlign = "center",
                lineHeight = 1.8,
            },
            UI.Label {
                text = "每个抉择同时扰动 粮草·军心·朝任·身体·民心·地势·魏惧;反馈回路每回合自动结算,司马懿因你而动。六种败亡与一条改命窄路,皆由状态涌现。",
                fontSize = 12,
                fontColor = COLOR.inkDim,
                textAlign = "center",
                lineHeight = 1.7,
            },
            PrimaryButton("举 兵 北 伐", ShowEvent),
        },
    })
end

-- ============================================================================
-- 屏:抉择
-- ============================================================================
function ShowEvent()
    state_.phase = "event"
    if state_.round > GameState.MAX_ROUND then
        state_:CheckEnd()
    end
    if state_.phase == "over" then
        ShowEnding()
        return
    end

    local pool = Events.PoolFor(state_)
    ---@type GameEvent|nil
    local ev
    if #pool > 0 then
        ev = pool[math.random(#pool)]
        Events.MarkUsed(state_, ev.id)
    else
        -- 无事件可抉择:直接推一回合大势
        ResolveChoice({ effects = nil, flags = nil, chronicle = nil })
        return
    end

    local children = {
        UI.Label { text = ev.title, fontSize = 20, fontColor = COLOR.gold, wordBreak = "break-word", flexShrink = 1 },
        UI.Label {
            text = ev.text,
            fontSize = 13,
            fontColor = COLOR.ink,
            lineHeight = 1.8,
            wordBreak = "break-word",
            flexShrink = 1,
        },
        UI.Panel { width = "100%", height = 1, backgroundColor = COLOR.line },
    }
    for _, opt in ipairs(ev.options) do
        table.insert(children, ChoiceCard(opt.label, opt.hint, function() ResolveChoice(opt) end))
    end

    RefreshBars()
    SetContent(UI.Panel {
        width = "100%",
        maxWidth = 520,
        gap = 12,
        padding = 20,
        backgroundColor = COLOR.paper,
        borderRadius = 14,
        borderWidth = 1,
        borderColor = COLOR.line,
        children = children,
    })
end

--- 选择落地:扰动变量 → 回合结算 → 下一幕
---@param opt table { effects, flags, chronicle }
function ResolveChoice(opt)
    state_:ApplyEffects(opt.effects)
    if opt.flags then
        for k, v in pairs(opt.flags) do
            state_.flags[k] = v
        end
    end
    if opt.chronicle then
        Chronicle.Record(state_, opt.chronicle, state_.round)
    end

    -- 回合结算:反馈回路 + 街亭/会战自发判定 + 司马懿行动
    local resolvedRound = state_.round
    local sysLogs = state_:EndRound()
    for _, l in ipairs(sysLogs) do
        Chronicle.Record(state_, l, resolvedRound)
    end

    RefreshChronicle()

    if state_.phase == "over" then
        ShowEnding()
        return
    end
    ShowEvent()
end

-- ============================================================================
-- 屏:结局
-- ============================================================================
function ShowEnding()
    RefreshBars()
    local title = Chronicle.EndingTitles[state_.ending] or "终章"
    SetContent(UI.Panel {
        width = "100%",
        maxWidth = 520,
        gap = 16,
        padding = 24,
        backgroundColor = COLOR.paper,
        borderRadius = 14,
        borderWidth = 1,
        borderColor = COLOR.gold,
        alignItems = "center",
        children = {
            UI.Label { text = title, fontSize = 24, fontColor = COLOR.gold },
            UI.Label {
                text = state_.endingText or "",
                fontSize = 14,
                fontColor = COLOR.ink,
                textAlign = "center",
                lineHeight = 1.9,
                flexShrink = 1,
            },
            UI.Label {
                text = "同一段史笔,换一次选择,便是另一部三国。(空格键重开)",
                fontSize = 12,
                fontColor = COLOR.inkDim,
                textAlign = "center",
            },
            PrimaryButton("再 入 五 丈 原", Restart),
        },
    })
end

-- ============================================================================
-- 底栏:编年史
-- ============================================================================
function RefreshChronicle()
    local scroll = uiRoot_:FindById("chronicleScroll")
    if not scroll then return end
    scroll:ClearChildren()
    scroll:AddChild(UI.Label {
        text = "《五丈原本纪》 —— 史书随局势自动生长",
        fontSize = 11,
        fontColor = COLOR.gold,
    })
    scroll:AddChild(UI.Label {
        text = "开篇," .. Chronicle.Opening(),
        fontSize = 11,
        fontColor = { 150, 138, 112, 200 },
        wordBreak = "break-word",
        flexShrink = 1,
    })
    if state_.chronicle then
        for _, c in ipairs(state_.chronicle) do
            scroll:AddChild(UI.Label {
                text = c.season .. "," .. c.text,
                fontSize = 11,
                fontColor = COLOR.inkDim,
                wordBreak = "break-word",
                flexShrink = 1,
            })
        end
    end
end
