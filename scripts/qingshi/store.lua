-- qingshi/store.lua —— 跨会话持久化（引擎 File API 版 localStorage）
-- 键空间与 JS 版对齐：save_v1_<scen> / col_v1_<scen>；tts 键弃用（Web Speech 已推翻）。
-- 注意：cjson 为引擎内置全局；UrhoX 沙箱 io/dofile 已移除。
local Store = {}
local BASE = "qingshi/"

local function pathOf(key) return BASE .. key .. ".json" end

function Store.read(key)
  if not fileSystem:FileExists(pathOf(key)) then return nil end
  local f = File(pathOf(key), FILE_READ)
  if not f or not f:IsOpen() then return nil end
  local ok, v = pcall(cjson.decode, f:ReadString())
  f:Close()
  if not ok then return nil end
  return v
end

function Store.write(key, val)
  local ok, txt = pcall(cjson.encode, val)
  if not ok then return false end
  fileSystem:CreateDir(BASE)
  local f = File(pathOf(key), FILE_WRITE)
  if not f or not f:IsOpen() then return false end
  f:WriteString(txt)
  f:Close()
  return true
end

function Store.remove(key)
  if fileSystem:FileExists(pathOf(key)) then fileSystem:Delete(pathOf(key)) end
end

function Store.saveKey(scenKey) return "save_v1_" .. scenKey end
function Store.colKey(scenKey) return "col_v1_" .. scenKey end

return Store
