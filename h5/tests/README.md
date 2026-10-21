# 浏览器验收测试

对构建产物 `dist/` 跑真实 Chrome，验证「浏览器里真的能玩、真的不塌」。

与 `prot/` 的 Node 测试互补：`prot/` 验规则（引擎 / 数据 / 契约），
这里验 UI 行为与布局。两者都绿才算这一版站得住。

## 跑法

```bash
npm run test:browser          # 先自动 build，再跑全部
node tests/run-all.cjs chain  # 只跑其中一套
```

`pretest:browser` 会先执行 `npm run build`，所以不需要手动构建。
若浏览器不是常见安装位置，用环境变量指定：

```bash
CHROME_PATH=/path/to/chrome npm run test:browser
```

`run-all.cjs` 会在开跑前比对 `dist/` 与 `src/` 的时间戳：dist 明显更旧时
打印醒目警告（**不阻断**）—— 直跑单套时最容易踩的坑就是「src 改完了、
dist 还是旧的，测试测的是旧代码，而且一路绿灯」。

## 各套分别验什么

| 文件 | 验什么 | 为什么需要它 |
|---|---|---|
| `chain.cjs` | 李斯第一章全链路：序章 → 词条 → 行动卡 → 关键事件 → 选项 → 属性增减 → 章末 → 下一章 | 「P2 是否成立」的总闸。驱动方式是在页内读 `game.phase` 并点对应按钮，全程记录相位轨迹 |
| `viewports.cjs` | 8 种视口下的布局不塌 | **P2 的两栏布局在窄屏上会塌**：右栏 `13rem` 定宽在 667px 视口占 31%、竖屏 390px 占 53%，叙事区被挤到 166px，决策区还会顶穿棋盘。已加 880px 断点降级为「顶部横向属性条」 |
| `backtrack.cjs` | 顶栏回溯按钮 → 确认浮层 → 回章首 | 验引擎三条承诺：成就与偏离度**不**重置（防回溯刷成就）、配额按章计、`coef` 衰减 |
| `save.cjs` | 存档链路：存 → 刷新 → **走存档页「读 取」读** → DOM 对得上 | 引擎 `importSave` 对 ≠ UI 读档路径对：题签有没有摆回卷轴、顶栏章题、右栏属性，全都要在 DOM 上验 |
| `stash.cjs` | 暂存链路：pagehide 自动落盘、只留最近一条、刷新后还在 | 防丢兜底；顺带验脏暂存不会把存档页打崩 |
| `audio.cjs` | BGM：URL / MIME / 双轨轮播 / 切后台暂停续播 | 「下到了但不解码」最容易被误判成音量问题 |
| `voice.cjs` | 配音：入局即拉、**串行预取**（同时在途 ≤ 1）、切相位掐断 | 并发预取会把连接池打满、拖慢正在播的那条 |
| `reveal.cjs` / `altsegs.cjs` | 叙事渐显、随机事件段落 | 渐显没完就给选项 = 玩家点不动 |
| `ending.cjs` | 结局页与结局图鉴 | — |
| `settings.cjs` | 三条音量滑杆 + **真实行为**（音效拖到 0 后点卡片不再出声、朗读拖到 0 后整章不再念） | 只验「写进了 localStorage」等于没验 |
| `hardcore.cjs` / `gallery.cjs` / `wheel.cjs` | 硬核难度、图鉴页、罗盘 | — |
| `tapcloud.cjs` | TapTap 云存档顺风局：登录 → 上传 → 频控 → 云端覆写本地 | — |
| `tapcloud-conflict.cjs` | 云存档**冲突与失败分支**：本地让路、云端报错、非法包、上传在飞 | 顺风局全绿不等于云同步是对的 |
| `corrupt-store.cjs` | 脏档 / 异常输入：形状不对、非法 JSON、超长串 | 存档来自三个不受控的来源，坏数据不许把玩家进度打没 |
| `a11y-keyboard.cjs` | 键盘路径：Tab 可达、Enter 可触发、浮层焦点陷阱、Esc 关闭、`:focus-visible` 可见 | 纯鼠标路径跑通 ≠ 键盘用户能用 |
| `dev-check.cjs` | vite dev 路径冒烟（自己起临时 dev server） | dist 全绿不代表 dev 能跑 |
| `scenarios.cjs` | 剧本轻量表与 `prot/lua-data` 对账（纯 Node） | 手抄的轻量表迟早会忘改 |

## 设计取舍

**不引 Playwright / Puppeteer。** Node 18+ 自带 `WebSocket`，直接说 CDP 就够，
省下几百 KB 测试依赖 —— 与 P6 的首屏体积预算目标一致。

**判据分两种布局形态。** `viewports.cjs` 里若右栏占比 > 0.9，说明已降级成整宽横条
（此时整宽是预期的），改判叙事区是否占到 90% 以上；否则判右栏占比不得超过 28%。
早期版本没区分这两种形态，把降级后的正确布局误报成失败。

**状态标记用 ASCII（`ok` / `FAIL`）而非 `✓` / `✘`。** Windows 控制台代码页
会把 UTF-8 的符号显示成乱码，ASCII 标记在 CI 与本地都稳定可读。

**失败详情另写一份 UTF-8 报告。** stdout 被重定向到文件时按 cp936 解码就是乱码，
事后分不清「这条断言失败了」还是「这里只是编码不对」。每套跑完都会写一份
`tests/.report/<套名>.txt`（UTF-8，不入库）。

## 加新测试时

`lib/harness.cjs` 提供了：

- `withPage(fn)` — 起静态服务 + Chrome + CDP 页面，结束自动清理（含 profile 目录）
- `report(title, checks)` — 统一判定输出，返回是否全过
- `evaluate(expr)` — 在页面里跑 async 表达式并取回可序列化结果
- `consoleErrors()` — 收集页面错误与未捕获异常（按 sessionId 过滤，多标签不串台）
- `load(w, h, dsf)` — 切视口并重载（**应用没起来会抛错**，并带上控制台错误）
- `netLog()` / `netTimeline()` — 网络流水 / 带时刻的流水（用来断言并发）
- `pressKey(key)` — CDP 真按键（Tab / Enter / Space / Esc）

端口由 Chrome 自己挑（`--remote-debugging-port=0` + 读 `DevToolsActivePort`），
profile 目录用 `mkdtemp` 生成唯一目录，所以这些测试可以并行跑，不会撞端口/撞目录。
