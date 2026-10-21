-- ============================================================================
-- main.lua —— 《青史志》引擎版入口
-- 历史剧本偏离模拟器:五剧本纯数据包 + Lua 引擎(与 JS golden 100 局逐位对拍通过)
-- 视觉:浅色纸墨风(霞鹜文楷子集 1.39MB + MiSans emoji 兜底)
-- ============================================================================

local UI = require("urhox-libs/UI")
local Shell = require("qingshi/ui/shell")

---@type Widget|nil
local uiRoot_ = nil

function Start()
  graphics.windowTitle = "青史志"
  UI.Init({
    fonts = {
      -- bold 显式指向同一文件:文楷 Medium 本身偏粗,且防 "kai-bold" 未注册致文本不渲染
      { family = "kai",  weights = { normal = "fonts/qingshi-kai.ttf", bold = "fonts/qingshi-kai.ttf" } },
      { family = "sans", weights = { normal = "Fonts/MiSans-Regular.ttf" } },
    },
    scale = UI.Scale.DEFAULT,
  })
  uiRoot_ = Shell.Build()
  UI.SetRoot(uiRoot_)
  SubscribeToEvent("Update", "HandleUpdate")
  print("[青史志] paper-ink shell ready")
end

function Stop()
  UI.Shutdown()
end

---@param eventType string
---@param eventData UpdateEventData
function HandleUpdate(eventType, eventData)
  local timeStep = eventData["TimeStep"]:GetFloat()
  Shell.Update(timeStep)
end
