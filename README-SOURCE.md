# 《青史志》源代码包

## 这是什么

游戏的**全部源码**,不是构建产物。

> ⚠️ **载体已转向 H5,Lua 版已下线。** 游戏逻辑跑在 `h5/`(Vite + TypeScript),
> 规则真源是 `prot/engine.js`。Lua / UrhoX 版(`scripts/`、`prot/lua/`、Lua 侧门禁脚本)
> 已于 2026-10-21 整体封存进 [`封存/lua-2026-10-21/`](封存/lua-2026-10-21/),
> 详见该目录的 [`封存说明.md`](封存/lua-2026-10-21/封存说明.md)
> 与 [`docs/封存说明-2026-10-12.md`](docs/封存说明-2026-10-12.md)(当年从 Lua 切到 H5 的那一次)。

## 目录

    h5/               ← 当前主线:H5 版(Vite + TypeScript)
      src/
        main.ts           入口
        game/session.ts   会话层(控制流对齐早期 Lua 版)
        shell/            外壳与分辨率缩放
        ui/               UI 套件 + 雷达图
        data/             数据管线(@data → prot/lua-data/*.json)
        styles/           样式(art / base / game / stage)
      tests/              浏览器验收(chain / viewports / backtrack,自建 CDP)
      scripts/            构建期数据门禁(verify-data.mjs)

    prot/             ← 规则真源与开发工具(H5 依赖,继续维护)
      engine.js            规则引擎(单一真源,H5 经 Vite alias 直接引用)
      lua-data/            五本剧本 JSON —— **现役数据真源**(目录名里的 "lua" 是历史遗留)
      *-data.js            由 lua-data/*.json 生成的 JS 产物(H5 吃这份)
      sync-data-js.js      生成器(唯一的生成方向:json → js)
      verify-data-js.js    数据等价门禁(JSON ↔ JS,取代了原 p1-verify)
      test-*.js            规则回归(test-sim / test-ui-contract / test-fate …)
      balance-sim.js      平衡模拟
      path-stats.js        路径统计

    封存/lua-2026-10-21/  ← 已下线的 Lua 引擎版(只读,不再维护)
      scripts/             封存的 Lua 工程(引擎 / UI / 五本剧本数据 / FROZEN.md)
      prot/lua/            JSON→Lua 转换产物
      prot/p1-*.js 等       Lua 侧生成与对拍门禁
      封存说明.md           里面有什么、为什么下线、要恢复怎么弄

    assets/           ← 运行时资源
      ui/               界面素材 + 标志图标
      image/portraits/  72 张人物立绘(透明底)
      arch/             五朝建筑剪影
      audio/            配音 1927 条 + 主题曲
      fonts/            霞鹜文楷子集

    .project/         ← 项目配置(project.json / settings.json / resources.json)

    docs/             ← 设计文档与开发日志(见 docs/README.md)

## 怎么构建

- **H5(唯一主线)**:`cd h5 && npm i && npm run dev` / `npm run build`
  (dev/build 前会强制跑数据门禁 `verify-data.mjs`)

## 验证

```bash
npm --prefix prot run verify   # 数据等价(JSON ↔ JS)
npm --prefix prot test         # 规则回归(8 套;jingke / chensheng 各 2 项为既有基线红)
cd h5 && npm run test:browser  # 浏览器验收 20 套(需真实 Chrome)
```

## 注意

- **不要改 `封存/`** —— 已下线,只作历史参考
- `prot/lua-data/*.json` 是**现役数据真源**:改完记得跑
  `node prot/sync-data-js.js && node prot/verify-data-js.js`
- `assets/` 下**只有白名单内的目录**会进包(见 `.project/resources.json`)
- 新增 assets 一级目录需同步加白名单,否则不会入包
- 设计稿/效果图/立绘原件**不在本包**(它们不入包,且体积 155MB)
