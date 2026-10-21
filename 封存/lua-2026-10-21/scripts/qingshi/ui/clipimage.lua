-- qingshi/ui/clipimage.lua —— 按路径裁剪的图片控件
-- 库的 overflow 裁剪走 nvgIntersectScissor(只能是矩形),所以
-- borderRadius + overflow="hidden" 对 backgroundImage 只裁成矩形,
-- 抹角/尖角处仍会露出图片。这里改用「路径填充图片」:路径之外自然不绘制。
-- 支持两种路径:cut(八边形/斜切角,精确复刻卡框的抹角)、radius(圆角)。
local Widget = require("urhox-libs/UI/Core/Widget")
local ImageCache = require("urhox-libs/UI/Core/ImageCache")

local ClipImage = Widget:Extend("ClipImage")

---@param props table {image, fit, cut, radius, color}
--- color 给定时只按路径填色(不画图),用作压暗/提亮遮罩
function ClipImage:Init(props)
  props = props or {}
  props.pointerEvents = props.pointerEvents or "none"
  self.image_ = props.image
  self.fit_ = props.fit or "cover"
  self.cut_ = props.cut or 0
  self.radius_ = props.radius or 0
  self.color_ = props.color
  Widget.Init(self, props)
end

function ClipImage:Render(nvg)
  local l = self:GetAbsoluteLayout()
  if not l or l.w <= 0 or l.h <= 0 then return end
  local img = nil
  if self.image_ then
    img = ImageCache.Get(self.image_)
    if not img then return end
  elseif not self.color_ then
    return
  end

  local x, y, w, h = l.x, l.y, l.w, l.h
  local px, py, pw, ph = x, y, w, h
  if img and self.fit_ == "cover" then
    -- 等比放大到覆盖整个控件,再居中裁切
    -- 注:Get 返回的是句柄(number),尺寸要另用 GetSize 取
    local iw, ih = ImageCache.GetSize(self.image_)
    if iw and iw > 0 and ih and ih > 0 then
      local s = math.max(w / iw, h / ih)
      pw, ph = iw * s, ih * s
      px, py = x + (w - pw) / 2, y + (h - ph) / 2
    end
  end
  nvgBeginPath(nvg)
  local c = self.cut_
  if c > 0 then
    -- 八边形:四角各斜切 c(精确复刻卡框的抹角形制)
    c = math.min(c, w / 2, h / 2)
    nvgMoveTo(nvg, x + c, y)
    nvgLineTo(nvg, x + w - c, y)
    nvgLineTo(nvg, x + w, y + c)
    nvgLineTo(nvg, x + w, y + h - c)
    nvgLineTo(nvg, x + w - c, y + h)
    nvgLineTo(nvg, x + c, y + h)
    nvgLineTo(nvg, x, y + h - c)
    nvgLineTo(nvg, x, y + c)
    nvgClosePath(nvg)
  else
    local r = math.min(self.radius_, w / 2, h / 2)
    if r > 0 then
      nvgRoundedRect(nvg, x, y, w, h, r)
    else
      nvgRect(nvg, x, y, w, h)
    end
  end
  if img then
    nvgFillPaint(nvg, nvgImagePattern(nvg, px, py, pw, ph, 0, img, 1))
  else
    local col = self.color_
    nvgFillColor(nvg, nvgRGBA(col[1], col[2], col[3], col[4] or 255))
  end
  nvgFill(nvg)
end

return ClipImage
