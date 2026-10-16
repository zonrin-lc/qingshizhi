# 《青史志》规则收口（v2.2.0 · 单一事实源索引）

> **项目版本号（唯一权威来源）**：`v2.2.0`（横屏双栏适配版;规则层零改动）。本行即全库当前版本的定义处；`package.json` version 与 `js/ui-core.js` APP_VERSION 均须等于此值（`test-ui-contract.js` 版本同步契约校验），文档里凡写「当前 vX」处亦须一致。
> **各文档独立版本**（不并入项目版本，记录的是各自的交付进度）：UI 页面清单 v1.1、美术资产清单 v0.1/v0.2、美术设计计划、ui效果图 README。体系统一的口径见 GDD 附录 U.15 第七节。

> 本文件是**索引**，不是第二份规格。一切以仓库根目录《青史志》游戏设计文档.md（下称 GDD）为准——本文件只把"改数值/规则时先看哪里"钉死，避免策划案、代码、测试三方口径漂移。
> 引擎注释中的 `GDD x.y` / `GDD 附录 X` 引用均指向该文档。

## 规则归属速查

| 规则 | 权威出处 | 实装位置 |
|---|---|---|
| 回合规则（关键卡被动倒计时 / 行动卡×3） | GDD 3.1 · 附录 I | `engine.js` beginRounds/playCard/_advanceRound |
| **遭遇层密度**（每回合际遇概率 / 每章至多次数 / 关键卡限时回合） | GDD 3.1 · 附录 I（v2.0.8 补入速查表） | 剧本 `ENCOUNTER` 覆写 `engine.js` 的 `ENCOUNTER_DEFAULT` |
| 收益递减（同章第 n 次同一行动，收益向 0 收敛、代价不变） | GDD 3.2 · 附录 C.2 | `engine.js` _scaleActionEff |
| 蓄势（策略牌：放弃出牌，下次事件抉择险招 +10，抉择即清空） | GDD 附录 N.1（语义定稿为"下一次事件抉择"，含际遇） | `engine.js` playXushi/choose |
| 险招（软门槛六档 / 史实升一档 / 失败烧毁） | GDD 附录 J（J.0 机制规格 / M 史实升档） | `engine.js` checkRisk/riskRate/riskRateHist/_rollRisk |
| **成算档位词**（硬核隐藏数值时的唯一口径，就近向下取档） | GDD 4.4 · 附录 J（v2.0.5 收口为引擎单一实现） | `engine.js` `riskWord`（UI 经 `E.riskWord` 消费，勿再自存阶梯） |
| 危机与死亡（危机≥100 致死、构陷、清算） | GDD 4.1 / 4.3 | `engine.js` checkDeath 及危机注入 |
| **危机 95 封顶的非致命难度记账**（封顶须如实并入章末差值） | GDD 4.4（v2.0.6 补） | `engine.js` checkDeath `_weijiClamp` / makeSummary |
| 回溯（章首快照；清 xushi/_burned；不重置偏离/成就/图鉴） | GDD 6.4 · 附录 O.0（P0-1；成就保留见附录 D #10） | `engine.js` backtrack |
| **回溯=真章首快照**（含牌堆/际遇计数/章首注记/coef/跳过标记） | GDD 6.4（v2.0.5 补全，快照字段见 `makeSnapshot`） | `engine.js` makeSnapshot/backtrack/_buildChapterDeck |
| **终局不可撤销**（结局页无回溯） | GDD 6.4（v2.0.5 补） | `engine.js` canBacktrack（`phase==='ending'` 拒收）· `js/ui-ending.js` |
| 随机流（risk/event/corr 独立流，惰性派生，可注入） | GDD 附录 N.2 | `engine.js` _stream |
| **回溯恢复历史状态，不恢复随机命运**（回溯不存 rng 状态，章首重入不保证相同随机序列——设计原则；**跨会话存档自 v2.2.0 起相反**：rng/派生流状态随档存取，读档续接存档时刻的随机序列） | GDD 附录 N.2 / P（本版定稿）· v2.2.0 存档修订 | `engine.js` makeStateRng/makeLiveState/_importLive |
| **读档不截断成就**（importSave = 快照 ∪ 已有，与 backtrack 同一语义） | GDD 6.4 · 附录 Q.2 | `engine.js` importSave |
| **存档剧本身份绑定**（`scenKey` 校验，防跨剧本串档；旧档无此字段则放行） | GDD 6.4（v2.0.3 补） | `engine.js` exportSave/importSave |
| **早退闸**（序章零代价退出须设 notflag 闸；李斯模式已推广至五剧本） | GDD 附录 D #26 · 附录 Q.7 | 五剧本 `*-data.js` 序章早退选项 `req` |
| 结局评分公式（四维 0–100；**功业 = 权势×0.45 + 政绩×0.15 + 标记**；权重 30/30/20/20；总分允许破 100） | GDD 5.5 评分模型（v2.1.0 修订功业构成与存续权重） | `engine.js` 结局结算（gongye/cuncun/shiping/yingxiang） |
| 评级（S/A/B/C/D 分数线，v2.1.0 **未动**） | GDD 5.5 评分模型 | 同上 |
| **政绩经济**（卡侧供给须覆盖多章；每处语义为"建功/安民/治军/置官"） | GDD 附录 T.7 / T.8 + **附录 U.11**（v2.1.0 扩源与门槛可达性校准） | 五剧本 `*-data.js` `ACTIONS[].eff.attrs.zhengji` 与事件 `eff.attrs.zhengji`；`test-sim.js` #66 / 各剧本「政绩经济存在性」断言 |
| 存档（v2.2.0 起为**当前时刻全量状态**（snapshot 章首快照 + live 轮次/相位/随机轨迹两件套），读档精确续玩；旧 v1 章首档兼容导入；硬核无存档；坏档清除回主页） | GDD 6.4（v2.2.0 时点修订） | `js/ui-core.js`（`loadGameSave/clearGameSave` **须显式传 scenKey**）· `engine.js` exportSave/importSave/_importLive |
| 三难度（剧情/普通/硬核的数值与信息口径） | GDD 4.4 | 各数据文件 DIFFICULTY |
| 硬核信息隐藏（属性状态词 / 掷骰只显档位词 / **行动卡说明去数字**） | GDD 4.4 · 附录 O.0（P0-2；卡面口径 v2.0.3 补） | `engine.js` riskTitle/cardDesc · `js/ui-round.js` · `js/*` hideAttrs 分支 |
| 逆天反噬（偏离≥71 **每章一次**，池内随机；非概率闸门） | GDD 5.2 · 附录 D #7 | `engine.js` maybeRandom |
| **历史修正的系数口径**（corr 只缩身外属性；危机一律乘 wj 一次） | GDD 4.4 · 附录 D #14（v2.0.5 统一） | `engine.js` correctionEff（章末与反噬共用同一实现） |
| **修正抽取按 chance 加权**（边际 chance/Σchance，池总触发 = max(chance)） | GDD 5.2（v2.0.5 收口） | `engine.js` chapterEnd |
| **随机命局**（人物/属性/际遇池随机；无存档；剔除死事件与章数越界项） | GDD 附录 R（R.3 无存档 / v2.0.3 内容过滤） | `fate.js` makeFate · `SCENARIO.noSave` → `engine.js` exportSave |
| **引擎内部一次性闸**（`_once`：功高震主/宗室觊觎/失宠/门客散去/流言/命悬/贪墨清算/焚书污名/enterOnce） | GDD 4.1 · 附录 D（v2.0.6 命名空间分离，**不属剧本 flag**） | `engine.js` `_once` / `_readOnce`（旧档按 `_` 前缀自动迁移） |
| 平衡验收口径（单属性策略=压力测试**非门槛**） | GDD 第十章 准则 3 · 附录 D #25 · 附录 O.1 | `balance-sim.js` |
| **策略集即测量栅栏**（"某条线稀疏"须先排除无策略瞄准；devHigh 100% 死亡是反噬带正确执行） | GDD 附录 U.12（v2.1.1 新增 `weilian` 微澜策略：目标偏离 30 + 门槛水位 + 出口偏好） | `balance-sim.js` `WEILIAN_GATES`/`WEILIAN_EXITS`/`EARLY_DEV_PENALTY`/`weilianScore` |
| **死门槛/死文案的判定口径**（门槛须按实际策略分布定档，不看理论上限；结局本体的可达性须查选项 + 引擎侧两入口） | GDD 附录 U.13（v2.1.2：项羽 3-3 辩才 55→42；荆轲 E8 本体补触发点） | 五剧本 `*-data.js` 属性门槛与 `ENDINGS[].ach[]`/`variantAch[]`；`engine.js` `checkDeath`/`finishEnding` |
| **寿元 = 高体魄延寿**（体魄达阈值得折寿点数，逐点抵衰 + 压低发病率；年龄档与寿元阈值逐本定档，tier1 须高于天然体魄水位） | GDD 附录 U.14（v2.1.3：五本 `AGE.bands` 重定 + `AGE.longevity` 新增） | `engine.js` `_longevity()` / 章首抵衰 / `_tickIllness` 的 `effTupo`·`effAge`；五剧本 `AGE.bands`·`AGE.longevity` |
| **印章五值封闭词表**（循史/苟活/稳健/逆天/败局；**表外值须加载期拒载，不得运行时兜底**） | GDD 附录 U.15 第一节（B42） | `test-keys.js` 印章扫描 · `js/ui-ending.js` `SEAL_IMG`（运行时 `|| 'seal_xunshi'` 兜底为**已登记的反模式**） |
| **段位边界扰动扫描**（±5 点，任一结局占比位移 ≤2pp 为承重） | GDD 附录 U.15 第二节 | `balance-sim.js --bandscan`（另报修正判定时刻段位分布与池边界耦合诊断） |
| **史实覆盖率**（史实选项数/事件数 = 命运束缚强度；须与定位词排序一致） | GDD 附录 U.15 第三节（O-12） | `test-keys.js` 覆盖率扫描 + 与 GDD 5.2 定位词对账 |
| **删项审计**（摘掉选项重跑，判装饰；**须复用既有策略集 + 双读数**） | GDD 附录 U.15 第四节（支柱 1 的可证伪形式） | `balance-sim.js --cull` · `engine.js` `auditHide` 钩子（非审计场景 filter 恒真） |
| **死路线扫描**（结局格零出现须分诊：死路线 vs 策略盲区；**零出现 ≠ 不可达**） | GDD 附录 U.15 第五节 · 第六节（三次口径与「病催人老」通路） | `balance-sim.js --deadroute` · `test-keys.js` 病亡可达性体检 |
| **「病催人老」通路**（大病每次行动 `age+1` → 年龄跨过更多 `AGE.bands` 档 → 衰减加重 → 体魄归零；病亡在高 INIT 体魄剧本里**唯一**的可达通路） | GDD 附录 U.15 第六节 · 附录 T.2 | `engine.js` `_tickIllness` 的 `age += 1`；`test-keys.js` 登记为不变式 |
| **数据侧键名与路由合法性**（req 键 / to 目标 / flag 置位来源） | GDD 8 · 9（v2.0.6 扫描入库） | `test-keys.js`（静态扫描，与 `check()` 的未知键拒收互为对照） |

## 修改纪律

1. 改任何规则数值/口径：**先改 GDD 对应章节，再改代码，再补/改测试断言**，三者同批提交。
2. 新机制一律进附录（当前至附录 U），正文只放稳定规则。附录 T = 年龄·疾病·李斯全维路线，U = 全面审查修复与验证补强。
3. 引擎注释引用 GDD 章节号必须与文档实际编号一致，发现漂移顺手修正。
4. 新增/改动剧本数据字段（`ENCOUNTER`、属性键、`to` 目标）后跑 `npm test`——
   `test-keys.js` 会报出引擎不认识的键、指向不存在事件的路由、无置位来源的死 flag、
   表外的印章值、未声明的年龄档、缺史实选项的关键节点。
5. 改**地基类参数**（门槛、段位边界、寿元阈值）后跑对应扰动/扫描：`node balance-sim.js --scenario X --bandscan`。
   未扰动过的参数无法区分"稳"与"没人动过它"（GDD 附录 U.15 第二节）。
6. 改**选项效果**后跑 `node balance-sim.js --scenario X --cull X`：摘掉该选项重跑，
   看结局占比**或**连续量（总分/偏离）是否位移。仅看占比会漏判——相邻选项常同归一个结局格
   （GDD 附录 U.15 第四节双读数判据）。
7. 改 UI 呈现（文案里带数值的地方）时，同时确认硬核口径：硬核下属性、掷骰、卡面说明
   都不得出现数字（`test-ui-contract.js` 的硬核卡面文案契约会拦截）。
