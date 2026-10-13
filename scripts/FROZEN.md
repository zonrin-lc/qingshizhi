# ⚠️ 本目录已冻结 —— Lua(UrhoX)版,不再演进

**不要在此目录新增或修改代码。** 后续开发在 `h5/`(Vite + TypeScript)。

| 项目 | 内容 |
|---|---|
| 冻结日期 | 2026-10-13 |
| 封存标签 | `archive/urhox-lua-2026-10-11` |
| 封存提交 | `896725c` —— 最后一次改动本目录的提交 |
| 完整说明 | [`../docs/封存说明-2026-10-12.md`](../docs/封存说明-2026-10-12.md) |

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
