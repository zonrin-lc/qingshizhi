# ⚠️ 本目录已冻结 —— Lua(UrhoX)版,不再演进

**新功能一律在 `h5/`(Vite + TypeScript)开发,不要在本目录加。**

| 项目 | 内容 |
|---|---|
| 冻结日期 | 2026-10-13 |
| 封存标签 | `archive/urhox-lua-2026-10-11` |
| 封存提交 | `896725c` —— 封存点(此后仅同步改动) |
| 完整说明 | [`../docs/封存说明-2026-10-12.md`](../docs/封存说明-2026-10-12.md) |

## 冻结的含义:不加新功能,但允许同步

**2026-10-16 修订。** 初版写的是"不要在此目录新增或修改代码",但实际开发中
H5 的数值与视觉改动会**同步回本目录**,以保持两版一致(如评级 10 级、印章双字、
险招摇骰动画)。这条规则因此细化为:

| 允许 | 不允许 |
|---|---|
| 同步 H5 已定稿的数值改动(评级线、系数) | 在 Lua 版**独立设计新玩法** |
| 同步 H5 已定稿的视觉改动(印章/动画/文案) | 为 Lua 版**单独优化 UI** |
| 由 `p1-convert` 生成的剧本数据(`qingshi/data/*.lua`) | 手工改剧本数据(会与 `prot/lua/data/` 分叉) |

> **判据:这个改动在 H5 侧是否已经定稿?** 是 → 可以同步过来;
> 否 → 先在 H5 定稿,再同步。

## ⚠️ 剧本数据必须由脚本生成,不可手工改

`qingshi/data/{lisi,jingke,hanxin,xiangyu,chensheng}.lua` 与
`prot/lua/data/*.lua` 由 `p1-convert` 从 `prot/lua-data/*.json` 生成,
**两边必须逐字节一致**(`p1-verify` 会校验)。

正确改法:改 `prot/*-data.js` → `p1-golden.js` → `p1-convert.js` → `p1-verify.js`。
直接改 `.lua` 会与 JSON 分叉,`p1-verify` 由绿转红。

## 为什么保留而不是删除

本目录有 **5 处仍被 `prot/` 验证链依赖**,删掉会断:

| 路径 | 谁依赖 |
|---|---|
| `qingshi/prng.lua` | `prot/p0-parity.js` —— PRNG 位型对拍(200/200) |
| `qingshi/data/{lisi,jingke,hanxin,xiangyu,chensheng}.lua` | `prot/lua-syntax-check.js`(语法门禁)、`dump-lua-data.js` |
| `qingshi/data/voice-manifest.lua` | `gen-voice-manifest.js`(生成目标) |

`prot/package.json` 的 `verify` 与 `test` 跑在本目录上,保留 = 这些门禁继续可用。

## 冻结的是演进,不是代码

- **规则真源是 JS**(`prot/engine.js`),Lua 是它的逐位移植,H5 复用前者
- 本目录的 UI 层(`qingshi/ui/*`)与 `engine.lua` / `store.lua` / `main.lua`
  **不再被任何链路依赖**,仅作存档与参考
- 恢复开发:`git checkout archive/urhox-lua-2026-10-11`,并删除本文件

## 可复用的结论

真机趟过的视觉规则(立绘底部锚定 / 贴图比例 / 重建须 Destroy 等 9 条)
已整理进封存说明 §4.3,H5 复刻时**照搬,不必重踩**。
