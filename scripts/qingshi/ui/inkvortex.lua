-- qingshi/ui/inkvortex.lua —— 水墨漩涡动效(入局按钮底)
-- 漩涡本体是美术绘制的透明底 PNG(笔触质感代码画不出来);
-- 这里只负责把它画上去,并加一点「旋」的动势:
-- 缓慢自转 + 轻微呼吸缩放。整体按控件尺寸居中铺满。
local Widget = require("urhox-libs/UI/Core/Widget")
local ImageCache = require("urhox-libs/UI/Core/ImageCache")

local Vortex = Widget:Extend("InkVortex")

---@param props table {image, spin, breath, scale, dy}
function Vortex:Init(props)
  props = props or {}
  props.pointerEvents = props.pointerEvents or "none"
  self.image_ = props.image
  self.spin_ = props.spin or 0.16      -- 自转角速度(rad/s,负值反向)
  self.breath_ = props.breath or 0.022 -- 呼吸缩放幅度
  self.scale_ = props.scale or 1       -- 相对控件短边的绘制比例
  self.dy_ = props.dy or 0             -- 垂直偏移(占短边的比例,正值向下)
  self.t_ = 0
  Widget.Init(self, props)
end

-- 由外部每帧推进(选择页只在自己可见时 tick)
function Vortex:Update(dt)
  self.t_ = (self.t_ + (dt or 0)) % 3600
end

function Vortex:Render(nvg)
  local l = self:GetAbsoluteLayout()
  if not l or l.w <= 2 or l.h <= 2 or not self.image_ then return end
  local img = ImageCache.Get(self.image_)
  if not img then return end

  local d = math.min(l.w, l.h)
  local cx = l.x + l.w / 2
  local cy = l.y + l.h / 2 + d * self.dy_
  -- 呼吸:1 ± breath 之间缓慢起伏
  local s = d * self.scale_ * (1 + self.breath_ * math.sin(self.t_ * 0.9))
  local ang = self.t_ * self.spin_

  nvgSave(nvg)
  nvgTranslate(nvg, cx, cy)
  nvgRotate(nvg, ang)
  local paint = nvgImagePattern(nvg, -s / 2, -s / 2, s, s, 0, img, 1)
  nvgBeginPath(nvg)
  nvgRect(nvg, -s / 2, -s / 2, s, s)
  nvgFillPaint(nvg, paint)
  nvgFill(nvg)
  nvgRestore(nvg)
end

return Vortex
