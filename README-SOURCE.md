# 《青史志》源代码包

## 这是什么
游戏的**全部源码**,不是构建产物。

## 目录

    scripts/          ← 游戏逻辑(Lua)
      main.lua          入口
      qingshi/
        engine.lua      核心引擎(1622 行,与 JS 参考实现逐位对拍 100/100)
        prng.lua        确定性随机(mulberry32)
        store.lua       存档(File API + cjson)
        ui/             界面层
          theme.lua       设计系统(token:字号/间距/圆角/配色/素材路径)
          shell.lua       外壳与页面路由
          home.lua        主菜单 / 选择页 / 设置
          game.lua        对局流程
          wheel.lua       朝代罗盘(自绘)
          radar.lua       五维雷达图(自绘)
          clipimage.lua   按路径裁剪的图片控件
          inkvortex.lua   水墨漩涡(入局按钮)
          sparks.lua      星火粒子
        data/           五本剧本数据(李斯/荆轲/韩信/项羽/陈胜)
    assets/           ← 运行时资源
      ui/               界面素材(UI parts / 背景)
      image/portraits/  13 张人物立绘
      arch/             五朝建筑剪影
      fonts/            霞鹜文楷子集(1.39MB,覆盖 2976 码点)
    .project/         ← 项目配置
      project.json      项目元信息
      settings.json     构建设置
      resources.json    资源白名单(决定哪些资源入包)
    prot/             ← 开发工具与对拍网
      lua-syntax-check.js   语法检查(编译期)
      lua-apicheck.js       API/裸全局名检查
      p2-replay.js          100 局逐位对拍
      portraits-import.py   立绘导入脚本
      ui-parts-import.py    UI 素材导入脚本
      devlog-gen-day*.sh    开发日志配图生成
    docs/             ← 设计文档与开发日志
      gdd/              设计文档全册(13 分册:总纲 → 赛期与交付 + 两附录)
      devlog/           开发者日志 DAY1–12
      prot/             原型期资料(GDD 投稿版 + 提交前必读)
      音乐-歌词存档.md   五首主题曲歌词 + 意象对照
      封存说明-2026-10-12.md  Lua 版封存与 H5 转向说明

## 怎么构建
需要 UrhoX(星火编辑器)工具链。在项目根目录执行构建,
入口为 `scripts/main.lua`。

## 对拍网(验证逻辑没跑偏)
    node prot/lua-syntax-check.js   # 语法
    node prot/lua-apicheck.js       # 符号/裸全局名
    node prot/p2-replay.js          # 100 局逐位对拍
三项全绿才说明逻辑层没被改坏。

## 注意
- `assets/` 下**只有白名单内的目录**会进包(见 `.project/resources.json`)
- 新增 assets 一级目录需同步加白名单,否则不会入包
- 设计稿/效果图/立绘原件**不在本包**(它们不入包,且体积 155MB)
