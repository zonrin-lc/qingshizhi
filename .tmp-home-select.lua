  -- ---------- 选择页(v4:左罗盘择朝代 | 右剧本卡横滑 + 难度 + 入局) ----------

  local buildRight   -- 前向声明(scenCard 内会回调)

  -- 剧本卡:立绘满铺 + 底部匾额(竖排局名,细金边)
  local function scenCard(k)
    local sc = DATA[k].SCENARIO
    local juname = string.match(sc.name, '·%s*(.+)$') or sc.name
    local sel = (k == env.selScen)
    -- 匾额:米底 + 细金边,竖排局名
    local platePanel = UI.Panel {
      position = "absolute", bottom = 8, left = 0, right = 0,
      alignItems = "center", justifyContent = "center",
      children = {
        UI.Panel {
          paddingLeft = 7, paddingRight = 7, paddingTop = 8, paddingBottom = 8,
          backgroundColor = { 248, 242, 228, 242 },
          borderWidth = 1, borderColor = sel and C.goldHi or C.line,
          borderRadius = 3,
          children = { T.VText(juname, { size = 15, color = sel and C.zhu or C.inkStrong, bold = true, gap = 1 }) },
        },
      },
    }
    local card = UI.Panel {
      width = 132, height = 300, borderRadius = 6, overflow = "hidden",
      borderWidth = 1, borderColor = sel and C.goldHi or C.lineSoft,
      pointerEvents = "auto",
      onClick = function() env.selScen = k; buildRight() end,
      children = {
        -- 立绘满铺
        UI.Panel { position = "absolute", top = 0, left = 0, right = 0, bottom = 0,
          backgroundImage = 'char/char_' .. k .. '.png', backgroundFit = "cover" },
        -- 选中:整体提亮(白色薄纱,不加粗边框)
        sel and UI.Panel { position = "absolute", top = 0, left = 0, right = 0, bottom = 0,
          backgroundColor = { 255, 250, 235, 46 } } or UI.Panel { width = 0, height = 0 },
        platePanel,
      },
    }
    return card
  end

  local function buildRightImpl()
    local c = env.homeRight
    c:ClearChildren()
    local cur = DYNASTIES[env.dynIdx + 1]

    -- 小标题(居中,两侧金细线)
    c:AddChild(T.Divider('选 择 剧 本', { size = T.FS.note, mt = 0, mb = 8 }))

    if not cur.hasData then
      -- 准备中
      c:AddChild(UI.Panel { width = "100%", height = 320,
        alignItems = "center", justifyContent = "center", gap = 10, children = {
          T.VText('准备中', { size = 40, color = C.inkDim, gap = 8 }),
          T.lbl { t = '史 笔 未 至 · 此 卷 尚 在 修 撰', size = T.FS.note, color = C.inkSoft, ls = 2, wrap = false },
        } })
    else
      -- 剧本卡:横向排列,超出则左右滑动(不折行)
      local strip = UI.Panel { flexDirection = "row", gap = 12, alignItems = "center" }
      for _, k in ipairs(ORDER) do strip:AddChild(scenCard(k)) end
      c:AddChild(UI.ScrollView {
        id = "scenScroll", width = "100%", height = 312,
        scrollX = true, scrollY = false, showScrollbar = false,
        children = { strip },
      })
    end

    -- 难度
    c:AddChild(T.Divider('选 择 难 易', { size = T.FS.note, mt = 14, mb = 8 }))
    local DIFFS = { { k = 'story', band = C.qing }, { k = 'normal', band = C.gold }, { k = 'hardcore', band = C.zhu } }
    local drow = UI.Row { gap = 10, justifyContent = "center", width = "100%" }
    for _, d in ipairs(DIFFS) do
      local df = DATA[env.selScen].DIFFICULTY[d.k]
      local sel = (env.selDiff == d.k)
      drow:AddChild(UI.Panel {
        paddingLeft = 22, paddingRight = 22, paddingTop = 8, paddingBottom = 8,
        borderRadius = 18, borderWidth = 1,
        borderColor = sel and C.gold or C.line,
        backgroundColor = sel and C.gold or { 0, 0, 0, 0 },
        pointerEvents = "auto",
        onClick = function() env.selDiff = d.k; buildRight() end,
        children = { T.lbl { t = df.n, size = T.FS.ui, bold = sel,
          color = sel and C.card or C.inkStrong, wrap = false } },
      })
    end
    c:AddChild(drow)

    -- 入局 / 继续
    c:AddChild(T.Btn { text = '入 局', variant = 'primary', size = T.FS.ui, w = 220, mt = 16,
      onClick = function()
        Store.remove(Store.saveKey(env.selScen))
        local g = Shell.newGame(env.selScen, env.selDiff)
        g:start()
        Shell.showGame()
        Shell.renderIntro(false)
      end })
    local sv = Store.read(Store.saveKey(env.selScen))
    if sv and sv.diffKey and sv.snapshot then
      local sd = DATA[env.selScen].DIFFICULTY[sv.diffKey]
      local sc = DATA[env.selScen].CHAPTERS[sv.chapterIdx + 1]
      local label = '继 续 · 本章开局'
      if sd and sc then
        label = label .. '（' .. sd.n .. ' · ' .. (string.match(sc.title, '^(.-)｜') or sc.title) .. '）'
      end
      c:AddChild(T.Btn { text = label, size = T.FS.cap, w = 220,
        onClick = function()
          if not enterSave(env.selScen, sv) then buildRight() end
        end })
    end
  end
  buildRight = buildRightImpl
  env.buildRight = buildRight

  Shell.renderHome = function()
    Shell.cancelReveal()
    env.lastSettleText = nil
    local c = env.homeWrap
    c:ClearChildren()

    -- 顶栏:左返回钮 / 右标题+副题
    local backBtn = UI.Panel {
      width = 54, height = 54, borderRadius = 27,
      borderWidth = 1.5, borderColor = C.gold,
      alignItems = "center", justifyContent = "center",
      pointerEvents = "auto",
      onClick = function() Shell.showMenu() end,
      children = { T.lbl { t = '←', size = 26, color = C.inkStrong, wrap = false } },
    }
    c:AddChild(UI.Row { width = "100%", justifyContent = "space-between", alignItems = "flex-start", children = {
      backBtn,
      UI.Panel { alignItems = "flex-end", gap = 2, children = {
        UI.Row { gap = 6, alignItems = "center", children = {
          T.lbl { t = '青史志', size = T.FS.h2, color = C.inkHeavy, bold = true, ls = 4, wrap = false },
          T.Seal('史', { size = 26, fs = 13, fill = true }),
        } },
        T.lbl { t = '悠悠千载 · 青史万卷', size = T.FS.cap, color = C.inkDim, ls = 1, wrap = false },
      } },
    } })

    -- 主体:左罗盘 | 右内容
    local row = UI.Row { width = "100%", gap = 20, alignItems = "center",
      justifyContent = "center", marginTop = 6 }
    local wheelCol = UI.Panel { width = 460, height = 460, flexShrink = 0,
      alignItems = "center", justifyContent = "center" }
    if not env.wheel then
      env.wheel = Wheel {
        width = 450, height = 450, items = DYNASTIES, index = env.dynIdx + 1,
        colors = C, arch = T.ARCH,
        onChange = function(i)
          env.dynIdx = i - 1
          if env.buildRight then env.buildRight() end
        end,
      }
    end
    wheelCol:AddChild(env.wheel)
    row:AddChild(wheelCol)
    env.homeRight = UI.Panel { flexGrow = 1, flexBasis = 0, flexShrink = 1,
      flexDirection = "column", alignItems = "center" }
    row:AddChild(env.homeRight)
    c:AddChild(row)
    buildRight()
    env.homeSC:SetScroll(0, 0)
  end

  -- 选择页齿轮每帧更新
  Shell.tickWidgets = function(dt)
    if env.wheel then env.wheel:Update(dt) end
  end
