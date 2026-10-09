-- ============================================================================
-- GameState.lua  涌现规则引擎
-- 五丈原·改命 —— 6 个状态变量 + 反馈回路 + 司马懿 AI + 胜负判定
-- 历史走向不来自预设剧本,而来自这些简单规则的相互作用。
-- ============================================================================

---@class GameState
---@field round integer
---@field phase string
---@field vars table
---@field flags table
---@field chronicle {season: string, text: string}[]
---@field ending string|nil
---@field endingText string|nil
local GameState = {}
GameState.__index = GameState

-- 状态变量定义(0-100)
local VAR_DEFS = {
    { key = "provision", label = "粮草",   good = true },
    { key = "morale",    label = "军心",   good = true },
    { key = "trust",     label = "朝任",   good = true },
    { key = "health",    label = "身体",   good = true },
    { key = "people",    label = "民心",   good = true },
    { key = "position",  label = "地势",   good = true }, -- 渭南据势,隐藏变量
    { key = "threat",    label = "魏惧",   good = false }, -- 高=危险,但决战窗口也在此
}
GameState.VAR_DEFS = VAR_DEFS

-- 回合上限(建兴十二年二月起,每回合约一月,至九月终局)
GameState.MAX_ROUND = 8

--- 新建一局(初始状态贴近史实:孤军深入、粮道绵长、身体抱恙)
function GameState.New()
    local self = setmetatable({}, GameState)
    self.round = 1
    self.phase = "event" -- event | decision | over
    self.vars = {
        provision = 62, -- 斜谷屯田,勉强支撑
        morale    = 70, -- 六军初至,士气正盛
        trust     = 55, -- 李严一党在朝,君相有隙
        health    = 60, -- 事必躬亲,寝少餐多
        people    = 50, -- 蜀民疲于北伐
        position  = 55, -- 据渭南,临渭背原
        threat    = 45, -- 司马懿坚壁,尚未尽全力
    }
    self.flags = {}     -- 事件产生的标记(如已杀马谡、已送巾帼)
    self.ending = nil   -- 结局 key
    self.endingText = nil
    return self
end

local clamp = function(v) return math.max(0, math.min(100, v)) end

--- 应用一组效果
---@param effects table<string, number>
function GameState:ApplyEffects(effects)
    if not effects then return end
    for k, v in pairs(effects) do
        if self.vars[k] then
            self.vars[k] = clamp(self.vars[k] + v)
        end
    end
end

--- 反馈规则:回合末自动结算,变量互相牵制,这是"涌现"的核心
---@return string[] 触发的系统事件(供史书记录)
function GameState:Feedback()
    local logs = {}
    local v = self.vars

    -- R1 粮草不足 → 军心浮动、朝议蜂起
    if v.provision < 40 then
        v.morale = clamp(v.morale - 6)
        v.trust = clamp(v.trust - 4)
        table.insert(logs, "军中乏食,士卒怨望,朝中议者蜂起")
    end

    -- R2 军心崩溃 → 虚实为敌所侦
    if v.morale < 30 then
        v.threat = clamp(v.threat + 5)
        table.insert(logs, "士气低迷,魏军侦知虚实")
    end

    -- R3 魏惧过甚 → 司马懿压迫,战事紧张耗身体
    if v.threat > 70 then
        v.morale = clamp(v.morale - 4)
        v.health = clamp(v.health - 5)
        table.insert(logs, "司马出关压迫,亮昼夜筹划,寝食俱废")
    end

    -- R4 身体抱恙 → 朝中疑相
    if v.health < 30 then
        v.trust = clamp(v.trust - 5)
        table.insert(logs, "亮寝食渐废,成都闻之,或有疑相者")
    end

    -- R5 朝任过低 → 粮运被掣肘(李严线)
    if v.trust < 30 then
        v.provision = clamp(v.provision - 8)
        table.insert(logs, "李严托故缓军粮,粮道几断")
    end

    -- R6 民心深厚 → 百姓输粮支援
    if v.people > 60 then
        v.provision = clamp(v.provision + 4)
        table.insert(logs, "百姓载粮输军,粮道得续")
    end

    -- R7 战线平静 → 得以寝食(与"逼司马出战"形成张力:魏惧低则安全但无胜机)
    if v.threat <= 28 then
        v.health = clamp(v.health + 2)
        v.provision = clamp(v.provision + 2)
    end

    return logs
end

--- 街亭自发判定:若曾遣马谡,其胜败由当前状态涌现,而非剧本写死
---@return string[]
function GameState:JieTingCheck()
    local logs = {}
    local f = self.flags
    if not f.maSuSent or f.__jiTingResolved then return logs end
    f.__jiTingResolved = true

    local v = self.vars
    local power = v.morale * 0.45 + v.provision * 0.25 + (100 - v.threat) * 0.3
    if power >= 58 then
        v.threat = clamp(v.threat - 8)
        v.morale = clamp(v.morale + 8)
        v.position = clamp(v.position + 5)
        f.maSuWon = true
        table.insert(logs, "街亭之战,谡据城当道,魏骑不得入,张郃引去。先帝知人之训,竟不验于此")
    else
        v.morale = clamp(v.morale - 12)
        v.threat = clamp(v.threat + 10)
        v.position = clamp(v.position - 8)
        f.maSuLost = true
        table.insert(logs, "马谡舍水上山,张郃断其汲道,大破之,街亭尽失,大军无根")
    end
    return logs
end

--- 司马懿 AI:按魏惧程度行动
---@return string[] 行动记录
function GameState:SimaYiAct()
    local logs = {}
    local v = self.vars

    -- 史实锚点:曹真病卒,司马并其军权 → 出现"乘隙"窗口
    if self.round >= 6 and not self.flags.windowPhase then
        self.flags.windowPhase = true
        table.insert(logs, "征南将军曹真病笃薨,魏军事一付司马,新故未定")
    end

    if v.threat >= 60 then
        if self.flags.windowPhase then
            -- 司马新领其众,众议思战 → 被迫出战,会战判定(胜败由状态涌现,非预设分支)
            local power = v.morale * 0.35 + v.provision * 0.25 + v.health * 0.15 + v.trust * 0.1 + v.position * 0.15
            if power >= 62 then
                v.threat = clamp(v.threat - 20)
                v.morale = clamp(v.morale + 10)
                v.people = clamp(v.people + 6)
                table.insert(logs, "司马迫于众议出战,亮阵前指麾,魏军大溃,却敌三十里")
                self.flags.winWindow = true
            else
                v.morale = clamp(v.morale - 15)
                v.provision = clamp(v.provision - 10)
                v.health = clamp(v.health - 8)
                table.insert(logs, "亮力战而兵疲,折损过当,退保本阵")
            end
        else
            -- 曹真尚持魏节度,坚壁不战,但高压对峙耗人
            v.morale = clamp(v.morale - 4)
            v.health = clamp(v.health - 4)
            table.insert(logs, "曹真坚壁不与亮战,两军久相持,亮寝食渐废")
        end
    elseif v.threat <= 25 then
        v.threat = clamp(v.threat + 8)
        v.provision = clamp(v.provision - 4)
        table.insert(logs, "魏以偏师来窥,亮分兵御之")
    else
        -- 相持:慢性消耗,事必躬亲
        v.provision = clamp(v.provision - 3)
        v.health = clamp(v.health - 1)
        table.insert(logs, "司马坚壁不出,两军相持于渭南")
    end

    -- 史实倒计时:入秋后亮病渐重
    if self.round >= 7 then
        v.health = clamp(v.health - 2)
        table.insert(logs, "秋风劲急,亮疮痍愈重")
    end

    return logs
end

--- 检查失败/胜利阈值(优先级:败亡 > 改命 > 史实耗尽)
---@return boolean 是否终局
function GameState:CheckEnd()
    local v = self.vars

    if v.health <= 0 then
        self:GameOver("star", "秋风五丈原,丞相星落。出师未捷身先死,长使英雄泪满襟。")
        return true
    end
    if v.provision <= 0 then
        self:GameOver("famine", "粮尽军溃,北伐无功而返。史书至此,与演义无异。")
        return true
    end
    if v.morale <= 0 then
        self:GameOver("mutiny", "六军哗变,亮夜遁还山,为天下笑。")
        return true
    end
    if v.trust <= 0 then
        self:GameOver("recalled", "诏书至军,夺亮兵符,召还成都。北伐之志,付与东流。")
        return true
    end

    if self.flags.winWindow and v.people >= 65 and v.morale >= 65 and v.provision >= 55 then
        self:GameOver("changan", "关中大震,长安士民开城门迎王师。亮抚掌叹曰:先帝之志,竟酬于今日。汉祚复延百年。")
        return true
    end

    if self.round > GameState.MAX_ROUND then
        self:GameOver("withdraw", "九月,亮度势难克,引军还汉中。虽未克中原,然全师而返,魏人惮其谋。")
        return true
    end

    return false
end

function GameState:GameOver(key, text)
    self.phase = "over"
    self.ending = key
    self.endingText = text
end

--- 回合推进(反馈 → 司马懿 → 阈值检查)
---@return string[] 本回合系统事件
function GameState:EndRound()
    local logs = self:Feedback()
    for _, l in ipairs(self:JieTingCheck()) do
        table.insert(logs, l)
    end
    for _, l in ipairs(self:SimaYiAct()) do
        table.insert(logs, l)
    end

    if self:CheckEnd() then
        return logs
    end

    self.round = self.round + 1
    return logs
end

--- 某个状态条的 variant(按好坏方向着色)
---@param key string
function GameState:BarVariant(key)
    local v = self.vars[key]
    local good = true
    for _, d in ipairs(VAR_DEFS) do
        if d.key == key then good = d.good end
    end
    local risk = good and (100 - v) or v
    if risk >= 70 then return "error" end
    if risk >= 45 then return "warning" end
    return "success"
end

return GameState
