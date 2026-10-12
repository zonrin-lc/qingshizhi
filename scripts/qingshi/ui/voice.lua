-- qingshi/ui/voice.lua —— 剧情朗读(配音)播放器
--
-- 设计:
--   · 一条音频 = 一个剧情段(章首/事件 segs/选项结算/抉择卡/结局 zhuan),逐段顺序播放。
--   · 音频由离线 TTS 预生成,清单见 qingshi/data/voice-manifest.lua(缺失段落自动跳过)。
--   · 用模块级 Scene + 单个 SoundSource 复用播放;音源类型 SOUND_VOICE,便于独立调音量。
--   · 由 game.lua 在进入各页时调用 Play*,在 clearMain(切页)时调用 Stop。
--
-- 生命周期注意:Scene 必须由模块级变量持有,否则会被 GC 回收(见 lua-scripting-guide「局部 Scene」)。
local Manifest = require("qingshi/data/voice-manifest")

local M = {}

-- 模块级持有,勿改局部
---@type Scene|nil
local scene_ = nil
---@type Node|nil
local node_ = nil
---@type SoundSource|nil
local source_ = nil

-- 播放队列
local queue_ = {}        -- 待播路径列表
local qi_ = 0            -- 已取到第几条
local current_ = nil     -- 当前 Sound 资源
local stopped_ = true    -- 是否已停止(避免 Stop 后由 Update 续播)

-- 段间停顿(秒):上一段播完到下一段起音之间的静默,避免两段紧贴听感局促
local gap_ = 0.35
local gapWait_ = 0       -- 当前段结束后待消耗的停顿余量

-- 设置(由 home.lua 设置页写入)
local enabled_ = true
local gain_ = 1.0

local function ensureSource()
  if source_ then return true end
  scene_ = Scene()
  node_ = scene_:CreateChild("Voice")
  source_ = node_:CreateComponent("SoundSource")
  if not source_ then return false end
  source_:SetSoundType(SOUND_VOICE)
  -- 关掉 declick:其默认起音淡入会削掉每个音频片段的开头半个字
  -- (TTS 片段自带约 50ms 自然起音,再叠一层淡入便听成"被截")
  source_:SetDeclickEnabled(false)
  source_.gain = gain_
  return true
end

local function playPath(path)
  if not path or path == '' then return false end
  local sound = cache:GetResource("Sound", path)
  if not sound then return false end
  -- 复用同一 source 前先复位频率,否则沿用上一条的采样率会变调(见 audio.md)
  source_:SetFrequency(0)
  source_.gain = gain_
  source_:Play(sound)
  current_ = sound
  return true
end

-- 播放一组音频(顺序)。paths 为清单里的路径数组;空则静默停止。
function M.Play(paths)
  M.Stop()
  if not enabled_ then return end
  if type(paths) ~= 'table' or #paths == 0 then return end
  if not ensureSource() then return end
  queue_ = paths
  qi_ = 0
  gapWait_ = 0
  stopped_ = false
  M.Advance()
end

-- 取队列下一条开始播;队列空则结束
function M.Advance()
  if stopped_ then return end
  qi_ = qi_ + 1
  while qi_ <= #queue_ do
    if playPath(queue_[qi_]) then return end
    qi_ = qi_ + 1
  end
  current_ = nil
end

function M.Stop()
  stopped_ = true
  queue_ = {}
  qi_ = 0
  gapWait_ = 0
  current_ = nil
  if source_ then source_:Stop() end
end

-- 「朗读会话是否进行中」:含段间停顿(供 BGM 压低判定,避免段间音量抖动)
function M.IsPlaying()
  return not stopped_
end

-- 由 Shell.Update 每帧调用:当前段播完,先等段间停顿,再续播下一段
function M.Update(timeStep)
  if stopped_ then return end
  local dt = timeStep or 0

  -- 停顿阶段:上一段已播完,正在等段间静默
  if gapWait_ > 0 then
    gapWait_ = gapWait_ - dt
    if gapWait_ > 0 then return end
    gapWait_ = 0
    if qi_ >= #queue_ then stopped_ = true; current_ = nil; return end
    M.Advance()
    return
  end

  -- 播放阶段:当前段仍在播则等待
  if current_ and source_ and source_:IsPlaying() then return end
  if qi_ >= #queue_ then
    stopped_ = true
    current_ = nil
    return
  end
  -- 当前段播完:进入段间停顿(最后一段播完直接收尾,不再停顿)
  if gap_ > 0 then gapWait_ = gap_ else M.Advance() end
end

-- ---------- 设置 ----------

function M.SetEnabled(on)
  enabled_ = on and true or false
  if not enabled_ then M.Stop() end
end
function M.IsEnabled() return enabled_ end

function M.SetGain(v)
  gain_ = v
  if source_ then source_.gain = v end
end
function M.GetGain() return gain_ end

-- ---------- 按剧情上下文取路径 ----------

-- 章首:chapters[scen][chap].intro
function M.IntroPaths(scenId, chapId)
  local c = Manifest.chapters[scenId]
  local ch = c and c[chapId]
  return ch and ch.intro or nil
end

-- 事件正文:chapters[scen][chap].events[evId].segs
function M.SegPaths(scenId, chapId, evId)
  local c = Manifest.chapters[scenId]
  local ch = c and c[chapId]
  local e = ch and ch.events[evId]
  return e and e.segs or nil
end

-- 选项结算:chapters[scen][chap].events[evId].opts[optIndex](1 基)
function M.OptPath(scenId, chapId, evId, optIndex)
  local c = Manifest.chapters[scenId]
  local ch = c and c[chapId]
  local e = ch and ch.events[evId]
  local o = e and e.opts
  return o and o[optIndex] or nil
end

-- 抉择卡:cards[scen][actionId].segs
function M.CardPaths(scenId, actionId)
  local c = Manifest.cards[scenId]
  local card = c and c[actionId]
  return card and card.segs or nil
end

-- 随机/危机/修正事件正文:specials[scen][evId].segs
function M.SpecialSegPaths(scenId, evId)
  local s = Manifest.specials[scenId]
  local e = s and s[evId]
  return e and e.segs or nil
end

-- 随机/危机事件选项结算:specials[scen][evId].opts[optIndex]
function M.SpecialOptPath(scenId, evId, optIndex)
  local s = Manifest.specials[scenId]
  local e = s and s[evId]
  local o = e and e.opts
  return o and o[optIndex] or nil
end

-- 结局:endings[scen][key__variant] 或 [key]
function M.EndingPath(scenId, key, variant)
  local e = Manifest.endings[scenId]
  if not e or not key then return nil end
  if variant and e[key .. '__' .. variant] then return e[key .. '__' .. variant] end
  return e[key]
end

return M
