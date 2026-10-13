# 《青史志》源代码包

## 这是什么

游戏的**全部源码**,不是构建产物。

> ⚠️ **载体已转向 H5。** 游戏逻辑现在跑在 `h5/`(Vite + TypeScript),
> 规则真源是 `prot/engine.js`。`scripts/`(Lua / UrhoX 版)已于 2026-10-13 封存,
> 详见 [`docs/封存说明-2026-10-12.md`](docs/封存说明-2026-10-12.md)。

## 目录

    h5/               ← 当前主线:H5 版(Vite + TypeScript)
      src/
        main.ts           入口
        game/session.ts   会话层(控制流对齐 Lua 版)
        shell/            外壳与分辨率缩放
        ui/               UI 套件 + 雷达图
        data/             数据管线(@data → prot/lua-data/*.json)
        styles/           样式(art / base / game / stage)
      tests/              浏览器验收(chain / viewports / backtrack,自建 CDP)
      scripts/            构建期数据门禁(verify-data.mjs)

    prot/             ← 规则真源与开发工具(H5 依赖,继续维护)
      engine.js            规则引擎(单一真源,H5 经 Vite alias 直接引用)
      lua-data/            五本剧本 JSON(H5 直接 import)
      lua/data/            JSON→Lua 转换产物(p1-verify 的比对侧)
      p1-verify.js         数据等价门禁(H5 的 dev/build 前置)
      p2-replay.js         100 局逐位对拍
      lua-syntax-check.js  语法检查   ┐ 这三项跑在已封存的 scripts/ 上,
      lua-apicheck.js      API 检查   ├ 保留 scripts/ 即保留这些门禁
      p0-parity.js         PRNG 位型   ┘

    scripts/          ← 已封存:Lua(UrhoX)版,只读不改
      FROZEN.md         冻结声明(含被依赖清单)
      qingshi/          引擎 / UI 层 / 五本剧本数据
      main.lua          入口

    assets/           ← 运行时资源
      ui/               界面素材 + 标志图标
      image/portraits/  72 张人物立绘(透明底)
      arch/             五朝建筑剪影
      audio/            配音 1927 条 + 主题曲
      fonts/            霞鹜文楷子集

    .project/         ← 项目配置(project.json / settings.json / resources.json)

    docs/             ← 设计文档与开发日志(见 docs/README.md)

## 怎么构建

- **H5(主线)**:`cd h5 && npm i && npm run dev` / `npm run build`
  (dev/build 前会强制跑数据门禁 `verify-data.mjs`)
- **Lua 版(已封存)**:需 UrhoX(星火编辑器)工具链,入口 `scripts/main.lua`

## 验证

```bash
npm --prefix prot run verify   # 语法 / API / 100 局对拍(跑在 scripts/ 上)
npm --prefix prot test         # 7 套回归(含成就图标契约,当前 5 项红)
cd h5 && npm run test:browser  # 浏览器验收(需真实 Chrome)
```

## 注意

- **不要改 `scripts/`** —— 已冻结,见 `scripts/FROZEN.md`
- `assets/` 下**只有白名单内的目录**会进包(见 `.project/resources.json`)
- 新增 assets 一级目录需同步加白名单,否则不会入包
- 设计稿/效果图/立绘原件**不在本包**(它们不入包,且体积 155MB)
