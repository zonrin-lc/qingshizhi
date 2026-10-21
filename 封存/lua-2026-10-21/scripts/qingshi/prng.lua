-- qingshi_prng.lua —— mulberry32 的 Lua 5.4 逐位译文
-- 与 engine.js 的 PRNG 经 200/200 IEEE754 位型对拍验证一致(2026-10-06,P0)。
-- 语义对齐要点:
--   * JS `a|=0; a=a+C|0` 的 32 位环绕 → `(a + C) & MASK`
--   * JS `t + imul(...) ^ t` 优先级是 `(t + imul) ^ t`,必须显式加括号
--   * JS 负数种子 `|0` 截断 → `seed & MASK` 取低 32 位(位型一致)
--   * Lua 整数是 64 位,所有中间量必须 `& 0xFFFFFFFF` 收窄

local MASK = 0xFFFFFFFF
local function imul(a, b) return (a * b) & MASK end

return function(seed)
  local a = seed & MASK
  return function()
    a = (a + 0x6D2B79F5) & MASK
    local t = imul(((a >> 15) ~ a), (a | 1))
    t = ((t + imul((t ~ (t >> 7)), (t | 61))) ~ t) & MASK
    return ((t ~ (t >> 14)) & MASK) / 4294967296
  end
end
