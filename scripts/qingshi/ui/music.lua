-- qingshi/ui/music.lua —— 剧本主题曲(BGM)播放器
--
-- 设计(与 voice.lua 同构):
--   · 每个剧本一曲,分「无人声版(inst)」与「有人声版(vocal)」两条音轨。
--   · 进对局即从头播无人声版;放完一遍接有人声版;有人声版放完再回无人声版,如此循环。
--   · 剧情朗读(Voice)进行时自动压低 BGM,避免人声与朗读抢耳。
--   · 待机(主菜单/选择页)静音;设置页可开关与调音量。
--   · 音源类型 SOUND_MUSIC,与朗读的 SOUND_VOICE 音量相互独立。
--
-- 生命周期注意:Scene 必须由模块级变量持有,否则会被 GC 回收(见 lua-scripting-guide「局部 Scene」)。
local Voice = require("qingshi/ui/voice")

local M = {}

-- 模块级持有,勿改局部
---@type Scene|nil
local scene_ = nil
---@type Node|nil
local node_ = nil
---@type SoundSource|nil
local source_ = nil

-- 曲库:剧本 id → { inst=无人声版路径, vocal=有人声版路径, durInst/durVocal=时长(秒) }
-- 时长由 ffprobe 量得,用于循环点判定(引擎不暴露精确时长)。
-- 无 vocal 字段者(如待机曲)为单轨循环,不切人声版。
local TRACKS = {
  idle = {
    inst = "audio/bgm_idle.ogg",
    durInst = 193.20,
  },
  lisi = {
    inst = "audio/bgm_lisi_inst.ogg",
    vocal = "audio/bgm_lisi_vocal.ogg",
    durInst = 194.76,
    durVocal = 228.26,
  },
  jingke = {
    inst = "audio/bgm_jingke_inst.ogg",
    vocal = "audio/bgm_jingke_vocal.ogg",
    durInst = 211.46,
    durVocal = 219.43,
  },
  hanxin = {
    inst = "audio/bgm_hanxin_inst.ogg",
    vocal = "audio/bgm_hanxin_vocal.ogg",
    durInst = 208.44,
    durVocal = 230.04,
  },
  xiangyu = {
    inst = "audio/bgm_xiangyu_inst.ogg",
    vocal = "audio/bgm_xiangyu_vocal.ogg",
    durInst = 208.39,
    durVocal = 231.55,
  },
  chensheng = {
    inst = "audio/bgm_chensheng_inst.ogg",
    vocal = "audio/bgm_chensheng_vocal.ogg",
    durInst = 197.64,
    durVocal = 228.02,
  },
}

-- 设置(由 home.lua 设置页写入)
local enabled_ = true
local gain_ = 0.6          -- BGM 基准音量(低于朗读 1.0,避免抢耳)

local DUCK = 0.45          -- 朗读进行时的压低系数
local LEAD = 1.5           -- 人声版临近结尾提前切回伴奏的提前量(秒),避开尾奏留白

-- 运行状态
local scen_ = nil          -- 当前剧本 id;nil 表示未在某剧本对局中
local mode_ = "inst"       -- "inst" | "vocal"
local timer_ = 0           -- 当前音轨已播秒数
local active_ = false      -- 是否处于播放态

local function trackOf(scenId) return TRACKS[scenId] end

local function ensureSource()
  if source_ then return true end
  scene_ = Scene()
  node_ = scene_:CreateChild("Music")
  source_ = node_:CreateComponent("SoundSource")
  if not source_ then return false end
  source_:SetSoundType(SOUND_MUSIC)
  return true
end

-- 应用音量:基准 × 朗读压低。每帧可调(朗读状态随时变化)。
local function applyGain()
  if not source_ then return end
  local duck = 1.0
  if Voice.IsPlaying() then duck = DUCK end
  source_.gain = enabled_ and (gain_ * duck) or 0
end

-- 播放指定音轨(从 0 开始)
local function playMode(mode)
  local tr = trackOf(scen_)
  if not tr then return end
  local path = (mode == "vocal") and tr.vocal or tr.inst
  local sound = cache:GetResource("Sound", path)
  if not sound then
    print("[青史志] BGM 缺失: " .. tostring(path))
    return
  end
  -- 复用同一 source 前先复位频率,否则沿用上一条的采样率会变调(见 audio.md)
  source_:SetFrequency(0)
  applyGain()
  source_:Play(sound)
  mode_ = mode
end

-- 进入某剧本:从头播无人声版。同一剧本重复调用无副作用。
function M.SetScenario(scenId)
  if scenId == scen_ then return end
  M.Stop()
  if not trackOf(scenId) then return end   -- 该剧本暂无曲目:静默
  scen_ = scenId
  mode_ = "inst"
  timer_ = 0
  if not enabled_ then return end
  if not ensureSource() then return end
  active_ = true
  playMode("inst")
end

-- 停止并复位(待机静音)。下次 SetScenario 会从头重播。
function M.Stop()
  active_ = false
  scen_ = nil
  mode_ = "inst"
  timer_ = 0
  if source_ then source_:Stop() end
end

-- 由 Shell.Update 每帧调用:推进循环点、刷新压低音量
function M.Update(dt)
  if not active_ or not source_ then return end
  local tr = trackOf(scen_)
  if not tr then return end
  timer_ = timer_ + dt
  if not tr.vocal then
    -- 单轨(待机曲):放完即从头重播
    if timer_ >= tr.durInst then
      timer_ = 0
      playMode("inst")
    end
  elseif mode_ == "inst" then
    if timer_ >= tr.durInst then
      -- 无人声版放完一遍 → 接有人声版
      timer_ = 0
      playMode("vocal")
    end
  else
    if timer_ >= tr.durVocal - LEAD then
      -- 有人声版临近结尾 → 切回无人声版,循环
      timer_ = 0
      playMode("inst")
    end
  end
  applyGain()
end

function M.IsPlaying()
  return active_ and source_ ~= nil and source_:IsPlaying()
end

-- ---------- 设置 ----------

function M.SetEnabled(on)
  enabled_ = on and true or false
  if not enabled_ then
    if source_ then source_:Stop() end
    active_ = false
    return
  end
  -- 重新开启:若正在某剧本且未播,从头播起
  if scen_ and not active_ then
    if ensureSource() then
      active_ = true
      mode_ = "inst"
      timer_ = 0
      playMode("inst")
    end
  end
end
function M.IsEnabled() return enabled_ end

function M.SetGain(v)
  gain_ = v
  applyGain()
end
function M.GetGain() return gain_ end

return M
