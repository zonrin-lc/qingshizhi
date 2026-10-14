# 《青史志》设计资料包

## 这是什么
**设计过程稿与原始素材**。这些**不参与游戏运行**(构建时被排除),仅供查看/存档/二次加工。

## ⚠️ `assets/` 目录不在 Git 版本库里

2026-10-14 起,`assets/`(721.7 MB / 4,743 个文件)已加入 `.gitignore`。
**本机文件完好保留**,只是不再进版本控制。

**为什么**:同步到 GitHub 时,包含 `assets/` 的推送要传 1.16 GiB 的 git pack,
实测走本地代理传输 26 分钟后被远端拒绝(`index-pack failed`,连接被截断)。
排除后仓库约 73 MB,一次推送即可完成。

**代价 —— 克隆下来的仓库缺什么**:
- `h5/tools/build-assets.py`(webp 资产管线)、`build-audio.py`(BGM 转码)、
  `build-voice.py`(配音切片)都无法重跑,它们都读 `assets/` 下的原件
- 想补齐:从别处拷贝 `assets/` 整个目录到仓库根即可,无需改任何配置

**不缺什么**:`h5/src/assets/` 里的**图像**成品(webp,约 11.7 MB)照常入库,
所以克隆后 `npm run build` 与全套浏览器验收(`npm run test:browser`)
都能直接跑通,页面版式也完整。

## ⚠️ 转码音频同样不在 Git 版本库里

`h5/src/assets/bgm/`(34.2 MB)与 `h5/src/assets/voice/`(6.9 MB)同样已 `.gitignore`。

这两个目录是 `h5/tools/build-audio.py`、`h5/tools/build-voice.py`
从 `assets/audio/` 下的原声转出来的**派生物**——而输入 `assets/` 本就不入库。
等于仓库里存着一堆自己算不出结果的产物,还占了推送量的 56%。

**影响**:克隆后的游戏**没有声音**,但其余一切正常。音频是运行时按需加载的,
缺了不会影响构建、布局、玩法与任何一条验收测试。

**重新生成**:

    # 先把 assets/ 整个目录拷回仓库根
    python h5/tools/build-audio.py            # BGM  → h5/src/assets/bgm/
    python h5/tools/build-voice.py           # 配音 → h5/src/assets/voice/ (默认李斯 c1)

两个脚本都需要 ffmpeg,且只**生成**产物、不会改动任何源码。

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
    assets/audio/                    ← 配音原声 1927 条 + BGM 11 首(291 MB)
    assets/fonts/                    ← 字体(1.3 MB)

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
