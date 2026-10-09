-- qingshi/ui/sparks.lua —— 星火粒子控件
-- 标题周围飘散的金色光点:自下升腾、左右微摆、渐隐渐亮,循环不息。
-- 覆写 Render 直接走 NanoVG;Update(dt) 由外部每帧驱动。
local Widget = require("urhox-libs/UI/Core/Widget")

local Sparks = Widget:Extend("Sparks")

local function rnd(a, b) return a + (b - a) * math.random() end

---@param props table?
function Sparks:Init(props)
  props = props or {}
  props.width = props.width or 420
  props.height = props.height or 620
  props.pointerEvents = "none"
  self.count_ = props.count or 26
  self.color_ = props.color or { 226, 178, 92 }     -- 暖金
  self.coreColor_ = props.coreColor or { 255, 238, 190 }  -- 亮芯
  self.speed_ = props.speed or 1.0
  self.parts_ = {}
  for i = 1, self.count_ do
    self.parts_[i] = self:_spawn(true)
  end
  Widget.Init(self, props)
end

-- 生成一颗粒子:在整个区域随机分布(而非只从底部),
-- 否则慢速粒子飘不出底部就耗尽,视觉上星火只堆在下方。
function Sparks:_spawn(initial)
  local W, H = self.props.width, self.props.height
  local life = rnd(2.6, 5.2)
  return {
    x = rnd(W * 0.06, W * 0.94),
    y = rnd(H * 0.02, H * 0.98),
    r = rnd(3.0, 6.0),
    vy = -rnd(10, 26) * self.speed_,          -- 缓升,营造升腾感
    sway = rnd(0.4, 1.3),
    phase = rnd(0, math.pi * 2),
    life = life,
    age = initial and rnd(0, life) or 0,
  }
end

function Sparks:Update(dt)
  local H = self.props.height
  for i = 1, #self.parts_ do
    local p = self.parts_[i]
    p.age = p.age + dt
    if p.age >= p.life then
      self.parts_[i] = self:_spawn(false)
    else
      p.y = p.y + p.vy * dt
      p.x = p.x + math.sin(p.age * 1.6 + p.phase) * p.sway * dt * 12
      -- 飘出上缘则回到底部,保证整个区域始终有星火
      if p.y < -20 then p.y = H + 10 end
      -- 左右摆出边界则折回
      if p.x < 0 then p.x = 0 elseif p.x > self.props.width then p.x = self.props.width end
    end
  end
end

function Sparks:Render(nvg)
  local layout = self:GetAbsoluteLayout()
  if not layout or layout.w <= 0 then return end
  local W, H = self.props.width, self.props.height
  local sx = layout.w / W      -- 容器被拉伸时按比例换算
  local sy = layout.h / H
  local c = self.color_
  local cc = self.coreColor_
  for i = 1, #self.parts_ do
    local p = self.parts_[i]
    local t = p.age / p.life
    -- 生命曲线:两端淡、中段亮
    local a = math.sin(t * math.pi)
    a = a * a
    if a > 0.02 then
      local x = layout.x + p.x * sx
      local y = layout.y + p.y * sy
      local rr = p.r * sx
      -- 外晕(深琥珀,给浅底提供轮廓)
      nvgBeginPath(nvg)
      nvgCircle(nvg, x, y, rr * 3.2)
      nvgFillColor(nvg, nvgRGBA(c[1], c[2], c[3], math.floor(a * 90)))
      nvgFill(nvg)
      -- 亮芯(近白暖金,高不透明,浅底上"发光"感靠它)
      nvgBeginPath(nvg)
      nvgCircle(nvg, x, y, rr * 1.15)
      nvgFillColor(nvg, nvgRGBA(cc[1], cc[2], cc[3], math.floor(a * 255)))
      nvgFill(nvg)
    end
  end
end

return Sparks
