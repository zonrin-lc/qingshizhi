# 《青史志》设计资料包

## 这是什么
**设计过程稿与原始素材**。这些**不参与游戏运行**(构建时被排除),仅供查看/存档/二次加工。

## 目录

    assets/image/                    ← 设计稿与效果图(约 155MB)
      game-songyun-*.png               对局页效果图(v2 / v4 卷轴版 / v6 定稿)
      menu-songyun-hifi_*.png          主菜单效果图
      page-*.png                       存档页 / 设置页 / 章末结算 / 结局 / 回合页
      overlay-*.png                    抉择结算浮层 / 确认弹窗
      bg-songyun_*.png                 纯背景图(宣纸+远山+梅竹)
      qingshi-select-*.png             选择页早期效果图(v2/v3/v4/hifi)
      files*.png                       参考图
      选择页/                           美术交付的选择页素材原件(9 件)
      renwulihui_new/                  美术交付的立绘原件(13 张,2048×3072 起)
      edited_*.png                     二次加工过的图

    assets/images/devlog/            ← 开发者日志配图(DAY1–12)
    assets/ui/logo/                  ← 标志与图标(横版/方版/标识 + 64–512 多尺寸)

## 关于立绘
`image/renwulihui_new/` 是**美术交付原件**(2048×3072,单张 3–11MB)。
运行时用的是 `assets/image/portraits/` 里**缩放后的 512×768 版本**。

转换脚本:`prot/portraits-import.py`(可重跑)。

## 关于 UI 素材
`image/选择页/` 是美术交付的**原件**,已通过 `prot/ui-parts-import.py`
缩放并转存到 `assets/ui/parts/`(运行时用)。

## 注意
这些文件**不在构建白名单里**(见 `.project/resources.json`),
所以不会打进游戏包——放在这里只为留存。
