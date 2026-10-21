-- qingshi/ui/wheel.lua —— 朝代罗盘
-- 底板为美术交付的罗盘素材(环带/刻度/八向菱饰/顶部指针)。
-- 模型:朝代名固定在各自方位(第 1 项在正上方),**不随盘转**;
--       盘面(含指针)旋转,由指针去指当前选中的那一格。
-- 中心盘以该朝建筑淡墨剪影为底,前景叠朝代大字与年代·状态(始终正立)。
-- 交互:拖拽盘面跟手转,松手保留惯性 → 吸向最近的朝代名(欠阻尼弹簧,冲过再回摆);
--       拖拽位移极小视为点击,按点到的方位直接选;中心盘为中枢死区。
local Widget = require("urhox-libs/UI/Core/Widget")
local ImageCache = require("urhox-libs/UI/Core/ImageCache")

local Wheel = Widget:Extend("DynastyWheel")

local TAU = math.pi * 2
local TOP = -math.pi / 2            -- 正上方

local function angNorm(a)
  a = a % TAU
  if a < 0 then a = a + TAU end
  return a
end

local function angDiff(a, b)
  local d = angNorm(a - b)
  if d > math.pi then d = d - TAU end
  return d
end

---@param props table {items, index, onChange, colors}
function Wheel:Init(props)
  props = props or {}
  props.width = props.width or 480
  props.height = props.height or 480
  props.pointerEvents = "auto"
  self.items_ = props.items or {}
  self.index_ = props.index or 1
  self.onChange_ = props.onChange
  self.C = props.colors
  self.arch_ = props.arch or {}
  self.ring_ = props.ring                            -- 金环素材路径
  self.step_ = TAU / math.max(1, #self.items_)
  -- 两套角度:
  --   base_    盘面(底板)旋转量;指针烘焙在底板顶部,故指针绝对角 = TOP + base_
  --   nameOff_ 朝代名的基准角;第 i 项名在 nameOff_ + (i-1)*step
  -- 初始:选中项的名在正上方、盘面回初始位(base_=0)
  self.nameOff_ = TOP - (self.index_ - 1) * self.step_
  self.base_ = 0
  self.baseVel_ = 0
  self.pointVel_ = 0
  self.phase_ = "idle"      -- idle | drag | settle | point | reorient
  self.dragPrev_ = 0
  self.dragVel_ = 0         -- 拖拽角速度估计(松手后作为惯性初速度)
  self.dragT_ = 0
  self.accum_ = 0           -- 拖拽累计角度(判定是否算"拖动")
  self.k_ = self.index_     -- 吸附目标
  self.reT_ = 0             -- 归位进度 0→1
  self.reVel_ = 0
  self.reFrom_ = { base = 0, nameOff = 0 }
  Widget.Init(self, props)
end

-- 手感参数
local DRAG_GAIN = 1.0        -- 拖拽跟手系数(1 = 指针转多少盘转多少)
local SNAP_K    = 120.0      -- 松手后吸向最近一格的刚度(欠阻尼弹簧)
local SNAP_C    = 19.0       -- 阻尼;ζ≈0.87,<1s 内停稳且带一点回摆
local FRICTION  = 6.0        -- 松手后的自由旋转衰减(越大停得越快)
local MAX_VEL   = 12.0       -- 角速度上限(rad/s)
local DRAG_SLOP = 0.05       -- 小于此累计角度视为"点击"而非"拖动"
local RE_TAU    = 0.60       -- 归位时长(吸附停稳后,盘面与朝代名一起转回初始位)
local RE_SNAP   = 0.002      -- 收敛阈值
local POINT_K   = 62.0       -- 点选「指认」阶段的弹簧刚度(比吸附缓)
local POINT_C   = 15.0       -- 阻尼;ζ≈0.95,基本不过冲

-- 指针绝对角(底板顶部烘焙了指针,故随 base_ 转)
function Wheel:pointerAng() return TOP + self.base_ end

-- 第 i 项朝代名的绝对角(随 nameOff_ 转)
function Wheel:nameAng(i) return self.nameOff_ + (i - 1) * self.step_ end

-- 指针当前指向哪一项
function Wheel:PickByPointer()
  local best, bestD
  for i = 1, #self.items_ do
    local d = math.abs(angDiff(self:nameAng(i), self:pointerAng()))
    if not bestD or d < bestD then best, bestD = i, d end
  end
  return best
end

-- 外部直接指定朝代(点击环上名字):两段动画
--   ① point:底板先转,让指针指向该朝代(朝代名不动)
--   ② reorient:再整体归位 —— 底板回初始位,朝代名转到正上方
function Wheel:Select(i)
  i = math.max(1, math.min(#self.items_, i))
  if i == self.index_ and self.phase_ == "idle" then return end
  self.index_ = i
  self.k_ = i
  self.phase_ = "point"
  self.pointVel_ = 0
  if self.onChange_ then self.onChange_(i) end
end

-- 开始归位:从当前姿态线性插值到「base=0, 选中名在正上方」
function Wheel:beginReorient()
  self.phase_ = "reorient"
  self.reT_ = 0
  self.reVel_ = 0
  self.reFrom_.base = self.base_
  self.reFrom_.nameOff = self.nameOff_
end

-- 指针在控件内的局部坐标 → 相对圆心的角度
function Wheel:AngleAt(localX, localY)
  local l = self:GetLayout()
  if not l or l.w <= 0 then return nil end
  return math.atan(localY - l.h / 2, localX - l.w / 2)
end

function Wheel:OnPointerDown(event)
  Widget.OnPointerDown(self, event)
  if not event or event.x == nil then return end
  local a = self:AngleAt(event.x, event.y)
  if not a then return end
  self.phase_ = "drag"
  self.dragPrev_ = a
  self.dragVel_ = 0
  self.dragT_ = event.timestamp or 0
  self.accum_ = 0
  self.baseVel_ = 0
end

function Wheel:OnPointerMove(event)
  Widget.OnPointerMove(self, event)
  if self.phase_ ~= "drag" or not event or event.x == nil then return end
  local a = self:AngleAt(event.x, event.y)
  if not a then return end
  local d = angDiff(a, self.dragPrev_)          -- 取最短弧,跨 ±π 不跳
  if math.abs(d) > 1.2 then return end          -- 单帧跳变过大视为噪声
  self.dragPrev_ = a
  self.base_ = self.base_ + d * DRAG_GAIN       -- 盘面跟手转(朝代名不动)
  -- 角速度估计:用事件时间戳算真实 dt,再一阶低通抑制抖动
  local t = event.timestamp or 0
  local dt = (t - (self.dragT_ or t)) / 1000
  self.dragT_ = t
  if dt > 1e-4 and dt < 0.2 then
    local v = d / dt
    self.dragVel_ = self.dragVel_ * 0.6 + v * 0.4
  end
  self.accum_ = self.accum_ + d
end

function Wheel:OnPointerUp(event)
  Widget.OnPointerUp(self, event)
  if self.phase_ ~= "drag" then return end
  if math.abs(self.accum_) < DRAG_SLOP then
    -- 视为点击:按点到的方位直接选最近的一项(局部坐标,相对控件中心)
    self.phase_ = "idle"
    local l = self:GetLayout()
    if l and l.w > 0 and event and event.x ~= nil then
      local dx, dy = event.x - l.w / 2, event.y - l.h / 2
      local R = math.min(l.w, l.h) * 0.40
      if math.sqrt(dx * dx + dy * dy) >= R * 0.65 then   -- 中心盘为死区
        local clickAng = angNorm(math.atan(dy, dx))
        local best, bestD
        for i = 1, #self.items_ do
          local dd = math.abs(angDiff(self:nameAng(i), clickAng))
          if not bestD or dd < bestD then best, bestD = i, dd end
        end
        if best then self:Select(best) end
      end
    end
    return
  end
  -- 松手:保留惯性(限幅)先滑行,再由 Update 吸附到最近一项
  local v = self.dragVel_
  if v > MAX_VEL then v = MAX_VEL elseif v < -MAX_VEL then v = -MAX_VEL end
  self.baseVel_ = v
  self.phase_ = "settle"
end

function Wheel:Update(dt)
  if dt <= 0 then return end
  local ph = self.phase_
  if ph == "drag" then return end                -- 拖拽中完全跟手

  if ph == "settle" then
    -- 惯性滑行
    if math.abs(self.baseVel_) > 0.05 then
      self.base_ = self.base_ + self.baseVel_ * dt
      self.baseVel_ = self.baseVel_ - self.baseVel_ * math.min(1, FRICTION * dt)
      return
    end
    self.baseVel_ = 0
    -- 吸附:指针最近的朝代名,欠阻尼弹簧转过去(冲过一点再回摆)
    local k = self:PickByPointer()
    if not k then return end
    local target = self.base_ + angDiff(self:nameAng(k), self:pointerAng())
    local d = angDiff(target, self.base_)
    if math.abs(d) < RE_SNAP then
      self.base_ = target
      if k ~= self.index_ then
        self.index_ = k
        if self.onChange_ then self.onChange_(k) end
      end
      self.k_ = k
      self:beginReorient()                       -- 停稳 → 开始归位
    else
      local acc = d * SNAP_K - self.baseVel_ * SNAP_C
      self.baseVel_ = self.baseVel_ + acc * dt
      self.base_ = self.base_ + self.baseVel_ * dt
    end
    return
  end

  if ph == "point" then
    -- ① 底板转到指针指向选中朝代(朝代名不动);弹簧比吸附更缓,是"指认"的语气
    local d = angDiff(self:nameAng(self.k_), self:pointerAng())
    if math.abs(d) < RE_SNAP then
      self.base_ = self.base_ + d
      self.pointVel_ = 0
      self:beginReorient()                       -- 指到位 → 进入归位
    else
      local acc = d * POINT_K - self.pointVel_ * POINT_C
      self.pointVel_ = self.pointVel_ + acc * dt
      self.base_ = self.base_ + self.pointVel_ * dt
    end
    return
  end

  if ph == "reorient" then
    -- ② 归位:base → 0,同时把选中名转到正上方(指针全程锁在选中名上)
    self.reT_ = self.reT_ + dt / RE_TAU
    if self.reT_ >= 1 then
      self.reT_ = 1
      self.base_ = 0
      self.nameOff_ = TOP - (self.index_ - 1) * self.step_
      self.phase_ = "idle"
      return
    end
    local e = 1 - (1 - self.reT_) ^ 3            -- easeOutCubic
    self.base_ = self.reFrom_.base * (1 - e)
    local nameTo = TOP - (self.index_ - 1) * self.step_
    self.nameOff_ = self.reFrom_.nameOff
      + angDiff(nameTo, self.reFrom_.nameOff) * e
    return
  end
end

function Wheel:Render(nvg)
  local l = self:GetAbsoluteLayout()
  if not l or l.w <= 0 then return end
  local C = self.C
  local cx, cy = l.x + l.w / 2, l.y + l.h / 2
  local R = math.min(l.w, l.h) * 0.40           -- 环带外缘半径

  -- 底板素材 870×880:环带 255→405,八向菱饰到 442(内部透明)
  -- 底板随 base_ 整体旋转(刻度/菱饰/顶部指针跟着转),中心盘保持不转。
  if self.ring_ then
    local img = ImageCache.Get(self.ring_)
    if img then
      local d = R * 2 * (442 / 405)
      nvgSave(nvg)
      nvgTranslate(nvg, cx, cy)
      nvgRotate(nvg, self.base_)                 -- 底板指针烘焙在正上,故直接转 base_
      local paint = nvgImagePattern(nvg, -d / 2, -d / 2, d, d, 0, img, 1)
      nvgBeginPath(nvg)
      nvgRect(nvg, -d / 2, -d / 2, d, d)
      nvgFillPaint(nvg, paint)
      nvgFill(nvg)
      nvgRestore(nvg)
    end
  end

  -- 中心:宣纸盘 + 该朝建筑淡墨剪影 + 朝代大字 + 年代·状态
  local cur = self.items_[self.index_]
  local diskR = R * 0.62
  nvgBeginPath(nvg); nvgCircle(nvg, cx, cy, diskR)
  nvgFillColor(nvg, nvgRGBA(C.paper[1], C.paper[2], C.paper[3], 238)); nvgFill(nvg)
  local archPath = self.arch_[cur.name]
  if archPath then
    local img = ImageCache.Get(archPath)
    if img then
      -- 用圆形路径填充图片:圆外的方角被自动裁掉(裁剪矩形只能裁方角)
      local paint = nvgImagePattern(nvg, cx - diskR, cy - diskR, diskR * 2, diskR * 2, 0, img, 0.42)
      nvgBeginPath(nvg); nvgCircle(nvg, cx, cy, diskR)
      nvgFillPaint(nvg, paint); nvgFill(nvg)
    end
  end
  nvgBeginPath(nvg); nvgCircle(nvg, cx, cy, diskR)
  nvgStrokeColor(nvg, nvgRGBA(C.gold[1], C.gold[2], C.gold[3], 190))
  nvgStrokeWidth(nvg, 1.4); nvgStroke(nvg)

  nvgFontFace(nvg, "kai")
  nvgTextAlign(nvg, NVG_ALIGN_CENTER_VISUAL + NVG_ALIGN_MIDDLE)
  nvgFontSize(nvg, R * 0.46)
  nvgFillColor(nvg, nvgRGBA(C.inkHeavy[1], C.inkHeavy[2], C.inkHeavy[3], 255))
  nvgText(nvg, cx, cy - R * 0.05, cur.name, nil)
  nvgFontSize(nvg, R * 0.072)
  nvgFillColor(nvg, nvgRGBA(C.inkSoft[1], C.inkSoft[2], C.inkSoft[3], 255))
  nvgText(nvg, cx, cy + R * 0.30,
    cur.era .. '  ·  ' .. (cur.hasData and '已开卷' or '准备中'), nil)

  -- 环上朝代名:随 nameOff_ 转(拖拽时不动,归位时把选中项转到正上方)。
  -- 放在底板外缘之外 —— 底板外缘(含八向菱饰)半径 = R * 442/405,故取 1.06 倍。
  local nameR = R * (442 / 405) * 1.06
  for i = 1, #self.items_ do
    local a = self:nameAng(i)
    local it = self.items_[i]
    local sel = (i == self.index_)
    nvgFontSize(nvg, R * (sel and 0.150 or 0.115))
    if sel then
      nvgFillColor(nvg, nvgRGBA(C.zhu[1], C.zhu[2], C.zhu[3], 255))
    elseif it.hasData then
      nvgFillColor(nvg, nvgRGBA(C.inkStrong[1], C.inkStrong[2], C.inkStrong[3], 235))
    else
      nvgFillColor(nvg, nvgRGBA(C.inkDim[1], C.inkDim[2], C.inkDim[3], 175))
    end
    nvgText(nvg, cx + math.cos(a) * nameR, cy + math.sin(a) * nameR, it.name, nil)
  end
end

return Wheel
