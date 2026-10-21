-- qingshi/ui/radar.lua —— 自绘雷达图控件(五维「自身」属性)
-- 覆写 Widget:Render(nvg) 直接走 NanoVG 路径;数据经 SetValues 更新,单帧重绘。
local Widget = require("urhox-libs/UI/Core/Widget")

local Radar = Widget:Extend("Radar")

---@param props table?
function Radar:Init(props)
  props = props or {}
  props.width = props.width or 200
  props.height = props.height or 200
  props.pointerEvents = "none"
  self.values_ = props.values or {}       -- 0-100 数组
  self.labels_ = props.labels or {}
  self.maxVal_ = props.max or 100
  self.lineColor_ = props.lineColor or { 188, 168, 130, 255 }
  self.fillColor_ = props.fillColor or { 176, 67, 47, 40 }
  self.strokeColor_ = props.strokeColor or { 176, 67, 47, 220 }
  self.labelColor_ = props.labelColor or { 107, 95, 73, 255 }
  self.fontSize_ = props.fontSize or 12
  self.fontFamily_ = props.fontFamily or "kai"
  Widget.Init(self, props)
end

function Radar:SetValues(values, labels)
  self.values_ = values or {}
  if labels then self.labels_ = labels end
end

function Radar:Render(nvg)
  local layout = self:GetAbsoluteLayout()
  if not layout or layout.w <= 0 or layout.h <= 0 then return end
  local cx, cy = layout.x + layout.w / 2, layout.y + layout.h / 2
  local R = math.min(layout.w, layout.h) * 0.36
  local n = #self.values_
  if n < 3 then return end

  local lc = self.lineColor_
  -- 同心网格
  nvgStrokeColor(nvg, nvgRGBA(lc[1], lc[2], lc[3], lc[4] or 255))
  nvgStrokeWidth(nvg, 1)
  for _, f in ipairs({ 0.25, 0.5, 0.75, 1.0 }) do
    nvgBeginPath(nvg)
    for i = 0, n - 1 do
      local a = -math.pi / 2 + i * (2 * math.pi / n)
      local x, y = cx + math.cos(a) * R * f, cy + math.sin(a) * R * f
      if i == 0 then nvgMoveTo(nvg, x, y) else nvgLineTo(nvg, x, y) end
    end
    nvgClosePath(nvg)
    nvgStroke(nvg)
  end
  -- 轴线 + 标签
  for i = 0, n - 1 do
    local a = -math.pi / 2 + i * (2 * math.pi / n)
    local ex, ey = cx + math.cos(a) * R, cy + math.sin(a) * R
    nvgBeginPath(nvg); nvgMoveTo(nvg, cx, cy); nvgLineTo(nvg, ex, ey); nvgStroke(nvg)
    local lb = self.labels_[i + 1]
    if lb then
      local lcol = self.labelColor_
      nvgFontFace(nvg, self.fontFamily_ or "kai")
      nvgFontSize(nvg, self.fontSize_)
      nvgFillColor(nvg, nvgRGBA(lcol[1], lcol[2], lcol[3], lcol[4] or 255))
      nvgTextAlign(nvg, NVG_ALIGN_CENTER_VISUAL + NVG_ALIGN_MIDDLE)
      nvgText(nvg, cx + math.cos(a) * (R + 16), cy + math.sin(a) * (R + 14), lb, nil)
    end
  end
  -- 数据多边形
  local fc = self.fillColor_
  local sc = self.strokeColor_
  nvgBeginPath(nvg)
  for i = 0, n - 1 do
    local a = -math.pi / 2 + i * (2 * math.pi / n)
    local v = math.max(0, math.min(self.maxVal_, self.values_[i + 1] or 0)) / self.maxVal_
    local r = R * math.max(0.04, v)
    local x, y = cx + math.cos(a) * r, cy + math.sin(a) * r
    if i == 0 then nvgMoveTo(nvg, x, y) else nvgLineTo(nvg, x, y) end
  end
  nvgClosePath(nvg)
  nvgFillColor(nvg, nvgRGBA(fc[1], fc[2], fc[3], fc[4] or 255))
  nvgFill(nvg)
  nvgStrokeColor(nvg, nvgRGBA(sc[1], sc[2], sc[3], sc[4] or 255))
  nvgStrokeWidth(nvg, 1.5)
  nvgStroke(nvg)
end

return Radar
