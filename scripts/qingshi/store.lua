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
  -- 原子写:先落 .tmp 再改名。直接覆写若在写入途中崩溃/断电,会留下截断的 JSON;
  -- 那种文件能通过 FileExists 但解不出东西,读档侧只能整份丢弃、玩家进度归零。
  local dest = pathOf(key)
  local tmp = dest .. ".tmp"
  local f = File(tmp, FILE_WRITE)
  if not f or not f:IsOpen() then return false end
  local wok = f:WriteString(txt)
  f:Close()
  if wok == false then
    fileSystem:Delete(tmp)          -- 写失败不留残骸
    return false
  end
  -- 改名是单一操作,不会留下「写了一半」的存档。
  -- 注意:部分平台的 Rename 不覆盖已存在的目标(第二次以后的存档即属此列),
  -- 故失败时删旧再试;再不成就退回直接覆写 —— 最坏情况与修复前一致,不会更差。
  if fileSystem:Rename(tmp, dest) then return true end
  if fileSystem:FileExists(dest) then
    fileSystem:Delete(dest)
    if fileSystem:Rename(tmp, dest) then return true end
  end
  fileSystem:Delete(tmp)
  local f2 = File(dest, FILE_WRITE)
  if not f2 or not f2:IsOpen() then return false end
  local ok2 = f2:WriteString(txt)
  f2:Close()
  return ok2 ~= false
end

function Store.remove(key)
  if fileSystem:FileExists(pathOf(key)) then fileSystem:Delete(pathOf(key)) end
end

function Store.saveKey(scenKey) return "save_v1_" .. scenKey end
function Store.colKey(scenKey) return "col_v1_" .. scenKey end

return Store
