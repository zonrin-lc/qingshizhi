-- ============================================================================
-- Chronicle.lua  史书生成器
-- 把玩家选择 + 系统涌现事件汇编成文言编年史(《五丈原本纪》)。
-- 玩家每局读到的"历史"由系统产生,不是预先写好的剧本。
-- ============================================================================

require("GameState")

---@class ChronicleEntry
---@field season string
---@field text string

local Chronicle = {}

--- 开局固定引言
function Chronicle.Opening()
    return "蜀汉建兴十二年春,丞相亮悉大众由斜谷出,以流马运,据武功五丈原,与司马宣王对于渭南。"
end

--- 记录一条(季节戳 + 文本)
---@param state GameState
---@param text string
---@param roundOverride? integer 显式回合(系统事件在其归属回合结算,早于 round+1)
function Chronicle.Record(state, text, roundOverride)
    if not text or text == "" then return end
    state.chronicle = state.chronicle or {}
    local season = Chronicle.SeasonName(roundOverride or state.round)
    table.insert(state.chronicle, { season = season, text = text })
end

--- 季节名(由回合推导,与 GameState.SEASONS 一致)
---@param round integer
function Chronicle.SeasonName(round)
    local names = {
        "二月", "三月", "四月",
        "五月", "六月", "七月", "八月", "九月",
        "九月", "九月", "九月", "九月",
    }
    local i = math.max(1, math.min(round, #names))
    return names[i]
end

--- 结局标题映射
Chronicle.EndingTitles = {
    changan   = "★ 改命 · 克复长安",
    star      = "星落 · 秋风五丈原(史实)",
    famine    = "粮尽 · 不战自溃",
    mutiny    = "兵变 · 夜遁还山",
    recalled  = "掣肘 · 诏夺兵符",
    withdraw  = "耗竭 · 全师而返(次史实)",
}

return Chronicle
