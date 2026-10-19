# 《青史志》动效优化规划（motion-design）

> 2026-10-19 · 仅规划，未动代码。基于 motion-design 技能（三支柱 / Motion Personality / 时长表 / 编排规则）对 `h5/src` 全量摸底后产出。
>
> **【同日落地记录】** 四批已全部实现并通过 `npm run build` + `test:browser`（15 套，voice.cjs 套件内偶发红、单跑复绿，与动效无关）：
> - ✅ P0 token（base.css `--ease-ink/--ease-exit` + `--dur-quick/std/slow`，全站 0.15/0.16/0.18s 过渡归拢）
> - ✅ 弹窗：入场 350ms 淡入+上浮；出场用「冻结克隆体」播 200ms 淡出——`hidden` 语义同步，测试零改动
> - ✅ 骰点重排（预备起势 + 缓摆 + squash 落定，去 linear）；朱印盖章动效（ending__seal / seal--big）
> - ✅ 雷达补间 `renderRadarTween`（380ms ease-out-cubic，rAF 插值多边形/顶点/数值）
> - ✅ 页面转场 page-in（`.menu/.select/.saves/.settings/.gallery` 插入即播，纯 CSS，navToken/测试不受影响）
> - ✅ 逐字墨染（`.prose__ch` opacity+blur 240ms）、卡片 secondary（内容延迟 0.18s 跟进）、对局页云雾 ambient（52s alternate，opacity 0.12）
> - ✅ meter 进度条 width→scaleX（kit.meter / applySideDelta 同步改写）
> - 备注：跑验收需 fontTools（已装入隔离 venv）；沙箱会拦 vite 清空 dist，先 `rm -rf dist` 再跑

---

## 一、现状盘点

### 已有的动效（基础不差，缺体系）

| 位置 | 现状 | 问题 |
|---|---|---|
| 对局页卡片入场 `game.css` | `card-flip-in` 0.45s + 0.06s 步进 stagger | 已达标；缺 secondary 层（阴影/内容无跟进） |
| 卡片按压 | transform 0.16s ease | 无 anticipation（下压 0.97 预备） |
| 险招骰点 `game.css` | `dice-shake`(linear infinite) + `dice-land` 0.32s | **linear 用错**（线性只给 spinner）；无预备动作、无落定回弹 |
| 属性变化 | `chg-flash` 2.4s / `kv-pop` 1.6s / 飞字 `attrdelta-in` 1.3s | 均可用；时长偏长且不在统一节奏上 |
| 雷达图 `radar.ts` | 数值变化时 points **瞬跳重绘** | 唯一「数据可视化无补间」硬伤 |
| 浮层 `art.css .overlay` | `hidden` 直接 `display:none`，**弹窗瞬时出现/消失** | 模态标准是 300-400ms 入/出 |
| 页面切换 | 菜单/选择/对局/存档/图鉴/设置 **瞬时换页** | 无任何转场 |
| 主菜单环境 | 船行 210s / 浮云 drift / 船身摇晃 | ambient 层教科书级，保留 |
| 选择页 | `selspin` 8.98s / `selbreath` 6.98s / dwswap 0.9s | 可用 |
| 打字机 `session.ts` | `splitToChars` 逐字上屏 | 缺逐字墨染（淡入质感） |
| 无障碍 | `base.css` 有全局 prefers-reduced-motion kill-switch | 达标，新动效自动继承 |

### 核心结论

**散、无定调。** 全项目时长有 0.15s～210s 共 14+ 档，easing 混用 `ease / ease-in-out / linear / cubic-bezier(0.2,0.7,0.3,1)`，没有 token。最伤体验的三处：**弹窗瞬时硬切、页面无转场、雷达图瞬跳**。

---

## 二、定调：Motion Personality

国风水墨修仙题材 → 选 **Elegance（优雅）** 原型，全站一致：

- **签名曲线（80% 动效用这一条）**：`cubic-bezier(0.4, 0, 0.2, 1)`（gentle float）
- **时长三档 token**：`--dur-quick: 160ms`（按压/悬停）· `--dur-std: 350ms`（卡片/弹窗/浮层）· `--dur-slow: 650ms`（页面转场/戏剧揭示）
- **入场模式**：淡入 + 轻位移（12~20px 上浮），墨染感（透明度先行、位移跟上）
- ** overshoot 0%**——水墨是「流体材质」，时长 ×1.5、落定要缓，不要回弹的 Q 弹感
- 特例：险招骰点/失败反馈可借「急促」曲线制造紧张，但仅限该场景

---

## 三、优化清单（按优先级）

### P0 · 立 token，一晚上见效
1. `base.css` 新增 `--dur-quick/std/slow` + `--ease-ink`（签名曲线）+ `--ease-exit`，把现有 14+ 档时长归到三档。纯替换，行为不变，风险最低。

### P0 · 弹窗动效（体验硬伤 #1）
2. `.overlay` 入场：蒙版淡入 250ms + 弹框「卷轴展开」式入场——scale 0.96→1 + 上浮 16px，`--ease-ink` 350ms。
3. 出场：反向 ease-in，**出场时长 = 入场的 70%**（240ms）。需把 `hidden` 的 display 切换改为 `animationend` 后收起（`session.ts` 的 `hideOverlay` 加一个 class）。
4. 章末结算弹框（`.overlay__box--scroll` 卷轴）用「垂落展开」入场：translateY(-24px) + scale，戏剧档 600ms。

### P1 · 页面转场（体验硬伤 #2）
5. 全站换页加水墨晕染 crossfade：旧页淡出 200ms → 新页淡入 + 上浮 400ms。入口收敛在换页函数处（`main.ts`/各 ui 模块的路由点），一处实现全站生效。
6. 对局页已有 `game-in` 0.55s，保留并对齐到 `--dur-slow` 即可。

### P1 · 雷达图数值补间（体验硬伤 #3）
7. 属性变化后五边形从旧值**逐帧插值**滑到新值（rAF tween，300~400ms ease-out），顶点朱点同步走，数值文字仍按现有「飞字落定后才刷新」的节奏接上。SVG points 不能 CSS 过渡，需在 `radar.ts` 加约 30 行插值逻辑。

### P1 · 骰点动画重做
8. 按「预备 → 主动作 → 跟随」重排：抬升 40ms → 左右摇（ease-in-out，2~3 次振荡，300ms）→ 落定带回弹下压（squash 0.94→1，200ms）。去掉 `linear infinite`。

### P2 · 成败印章「盖章」动效（品牌加分项）
9. 结算的「成 / 败」朱印：scale 1.6→1 + 旋转 -6°→0，ease-in（盖章是「砸下去」），150ms 砸落 + 100ms 墨晕扩散（伪元素 radial 淡出）。这正是「Success = scale pop」的国风翻译。

### P2 · 打字机逐字墨染
10. `splitToChars` 的每个字入场改「透明度 0→1 + blur(1px)→0」，逐字 30ms stagger。字数多时总预算压在 500ms 内（只对屏内首行做，滚动行不做）。

### P2 · 卡片 secondary 层
11. 卡片落定后内容（题名/牌面）延迟 80ms 淡入；hover 已有的 filter 过渡统一到 `--dur-quick`。按压加 0.97 下压预备（50ms）。

### P2 · 环境层延伸
12. 对局页加一层极淡的「远山云雾 drift」（复用主菜单思路，20s+ 周期，opacity ≤0.15）。遵守 1/3 原则：常驻元素动，前景叙事区一律不动。

### P3 · 性能与工程
13. `meter` 进度条 `transition: width`（game.css:983、gallery.css:116）改 `transform: scaleX`——width 触发 layout， scaleX 只走合成层。
14. 全部新动效只用 transform/opacity；继承现有 reduced-motion kill-switch，无需逐个处理。

---

## 四、风险与验收注意

- **浏览器验收（`npm run test:browser`）**：自建 CDP 测试若对弹窗/换页做瞬时断言，加上入场动画后可能拍早了——实现时优先用 `getAnimations().finished` 或在测试侧等待；这是动效改动的最大回归面。
- **TapTap Maker 移动端**：只动 transform/opacity 保证 60fps；云雾类 ambient 元素加 `will-change` 并控制层数。
- **scripts/（Lua 版）已封存**，所有改动只落在 `h5/src`。
- 改动全部可分批：P0 是纯替换可先单独交付；P0 弹窗和 P1 三项各自独立成批，改一批跑一次验收。

## 五、建议落地顺序

第一批（token + 弹窗）→ 第二批（骰点 + 印章 + 雷达补间）→ 第三批（页面转场 + 墨染 + secondary/ambient）→ 第四批（性能收尾）。每批结束跑 `test:browser` + 本地预览目验。
