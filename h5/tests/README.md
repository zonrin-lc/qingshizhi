# 浏览器验收测试

对构建产物 `dist/` 跑真实 Chrome，验证「浏览器里真的能玩、真的不塌」。

与 `prot/` 的 Node 测试互补：`prot/` 验规则（引擎 / 数据 / 契约），
这里验 UI 行为与布局。两者都绿才算这一版站得住。

## 跑法

```bash
npm run test:browser          # 先自动 build，再跑全部三套
node tests/run-all.cjs chain  # 只跑其中一套
```

`pretest:browser` 会先执行 `npm run build`，所以不需要手动构建。
若浏览器不是常见安装位置，用环境变量指定：

```bash
CHROME_PATH=/path/to/chrome npm run test:browser
```

## 三套分别验什么

| 文件 | 验什么 | 为什么需要它 |
|---|---|---|
| `chain.cjs` | 李斯第一章全链路：序章 → 词条 → 行动卡 → 关键事件 → 选项 → 属性增减 → 章末 → 下一章 | 「P2 是否成立」的总闸。驱动方式是在页内读 `game.phase` 并点对应按钮，全程记录相位轨迹 |
| `viewports.cjs` | 8 种视口下的布局不塌 | **P2 的两栏布局在窄屏上会塌**：右栏 `13rem` 定宽在 667px 视口占 31%、竖屏 390px 占 53%，叙事区被挤到 166px，决策区还会顶穿棋盘。已加 880px 断点降级为「顶部横向属性条」 |
| `backtrack.cjs` | 顶栏回溯按钮 → 确认浮层 → 回章首 | 验引擎三条承诺：成就与偏离度**不**重置（防回溯刷成就）、配额按章计、`coef` 衰减 |

## 设计取舍

**不引 Playwright / Puppeteer。** Node 18+ 自带 `WebSocket`，直接说 CDP 就够，
省下几百 KB 测试依赖 —— 与 P6 的首屏体积预算目标一致。

**判据分两种布局形态。** `viewports.cjs` 里若右栏占比 > 0.9，说明已降级成整宽横条
（此时整宽是预期的），改判叙事区是否占到 90% 以上；否则判右栏占比不得超过 28%。
早期版本没区分这两种形态，把降级后的正确布局误报成失败。

**状态标记用 ASCII（`ok` / `FAIL`）而非 `✓` / `✘`。** Windows 控制台代码页
会把 UTF-8 的符号显示成乱码，ASCII 标记在 CI 与本地都稳定可读。

## 加新测试时

`lib/harness.cjs` 提供了：

- `withPage(fn)` — 起静态服务 + Chrome + CDP 页面，结束自动清理（含 profile 目录）
- `report(title, checks)` — 统一判定输出，返回是否全过
- `evaluate(expr)` — 在页面里跑 async 表达式并取回可序列化结果
- `consoleErrors()` — 收集页面错误与未捕获异常
- `load(w, h, dsf)` — 切视口并重载

端口是动态分配的，所以这些测试可以并行跑，不会撞端口。