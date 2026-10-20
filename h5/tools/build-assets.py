#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
《青史志》H5 美术资产管线。

把 D:\\MUSI\\SHIJU\\qingshizhi-暂存\\ui 下的 74 张源图(合计约 131 MB)
压成 WebP,输出到 h5/src/assets/,供 Vite 打包。

为什么必须有这一步:源图是 2848x1602 的 PNG,单张背景就 6~8 MB。
直接引用的话对局页光背景就要下 6 MB,首屏根本没法看。
统一转到 WebP + 限制最大边后,整站美术预算控制在几 MB 量级。

尺寸策略:
  - 背景:限宽 1920(2K 屏够用,再高对缩放棋盘没有意义)
  - 卷轴/面板底板:保留原尺寸或限宽 ~760,九宫格拉伸时中段会被拉伸,
    保留足够像素是为了 2x 屏下金线不虚
  - 按钮/选项卡:限宽 400~600,棋盘上实际显示宽度就那么大
  - 装饰枝叶:限宽 500~620
  - 极扁的装饰线(高度 < 60px):不缩放,原样转,宽度可以放宽

用法:
    python h5/tools/build-assets.py                 # 全量
    python h5/tools/build-assets.py --only game     # 只做某一组
    python h5/tools/build-assets.py --dry-run       # 只看会产出什么,不写盘
"""
import argparse
import os
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print("需要 Pillow:  pip install pillow", file=sys.stderr)
    sys.exit(1)

SRC = Path(r"D:\MUSI\SHIJU\qingshizhi-暂存\ui")
# 第二个源根:原型工程 assets/。角色立绘、成就图标、属性图标都在这里,
# 不在 ui/ 下——ui/ 只有页面版式素材。
SRC2 = Path(r"D:\MUSI\SHIJU\qingshi-prototype\assets")
# 第三个源根:本仓库 assets/(封存 Lua 版的美术)。H5 主菜单/选择页按 Lua 版
# 复刻,标题书法、罗盘、卡框、匾额、难度胶囊、水墨漩涡等素材都从这里转。
SRC3 = Path(__file__).resolve().parents[2] / "assets"
OUT = Path(__file__).resolve().parents[1] / "src" / "assets"

# ---------------------------------------------------------------- 资产清单
# (分组, 源文件相对路径, 输出名, 最大宽度或None, 最大高度或None, 质量)
# 最大宽高为 None 表示该轴不限制。
# 九宫格素材(slice)的备注写在 group 注释里,实际 slice 值在 CSS 里。
ASSETS = [
    # ============ 对局页 ============
    ("game", r"对局页\background.png",                    "bg/game.webp",           1920, None, 72),
    ("game", r"对局页\左侧剧情卷轴底板-1791553744634.png", "panel/scroll-main.webp", None, 700, 84),
    ("game", r"对局页\右侧属性卷轴底板-1791553986131.png", "panel/attr.webp",        760,  None, 84),
    ("game", r"对局页\选项-背景-未选择.png",              "card/card.webp",         640,  None, 84),
    ("game", r"对局页\选项-背景-悬停.png",                "card/card-hi.webp",      640,  None, 84),
    ("game", r"对局页\李斯人物立绘-1791553734258.png",    "portrait/lisi.webp",     620,  860,  86),
    ("game", r"对局页\返回按钮-1791553668374.png",        "btn/back.webp",          360,  None, 86),
    ("game", r"对局页\回溯按钮-1791553682470.png",        "btn/backtrack.webp",     360,  None, 86),
    ("game", r"对局页\顶部主标题文字-1791553760876.png",    "deco/title.webp",        1100, None, 90),
    ("game", r"对局页\右上角红梅枝装饰.png",              "decor/plum-tr.webp",     520,  None, 82),
    ("game", r"对局页\左侧水墨竹装饰.png",                "decor/bamboo-l.webp",    None,  800,  82),
    # 回溯浮层(对局页内使用)
    ("backtrack", r"对局页\回溯浮层-古风弹窗底板.png",     "panel/dialog.webp",      720,  None, 84),
    ("backtrack", r"对局页\回溯浮层-确认按钮.png",         "btn/ok.webp",            400,  None, 86),
    ("backtrack", r"对局页\回溯浮层-再想想按钮.png",       "btn/ghost.webp",         400,  None, 86),
    ("backtrack", r"对局页\回溯浮层-弹窗分割线装饰.png",   "deco/rule-curl.webp",    840,  None, 92),

    # ============ 抉择结算浮层 ============
    ("settle", r"抉择结算浮层\古风弹窗面板.png",           "panel/dialog-tall.webp",  720,  None, 84),
    ("settle", r"抉择结算浮层\底部阅按钮-1791559051892.png","btn/read.webp",           400,  None, 86),
    ("settle", r"抉择结算浮层\标题下装饰线.png",           "deco/rule-thin.webp",     628,  None, 94),
    ("settle", r"抉择结算浮层\右侧红梅枝装饰.png",         "decor/plum-r.webp",      460,  None, 82),
    ("settle", r"抉择结算浮层\左侧水墨竹装饰.png",         "decor/bamboo-s.webp",    None,  1000, 82),
    ("settle", r"抉择结算浮层\background.png",             "bg/overlay.webp",         1600, None, 72),

    # ============ 章末结算 ============
    ("summary", r"章末结算\古风卷轴底板-1791557865324.png","panel/scroll-summary.webp", 780, None, 84),
    ("summary", r"章末结算\右上角梅花枝.png",              "decor/plum-tr2.webp",    600,  None, 82),
    ("summary", r"章末结算\左侧水墨竹子.png",              "decor/bamboo-l2.webp",   None,  1000, 82),
    ("summary", r"章末结算\background.png",                "bg/summary.webp",         1920, None, 72),

    # ============ 结局结算页 ============
    ("ending", r"结算页\卷轴底板-1791557346388.png",       "panel/scroll-ending.webp", 860, None, 84),
    ("ending", r"结算页\回到主页按钮-1791557470722.png",   "btn/home.webp",           440,  None, 86),
    ("ending", r"结算页\再入此局按钮-1791557461735.png",   "btn/again.webp",          440,  None, 86),
    ("ending", r"结算页\右上角水墨梅花枝装饰.png",         "decor/plum-tr3.webp",    540,  None, 82),
    ("ending", r"结算页\左侧水墨竹子装饰.png",             "decor/bamboo-l3.webp",   None,  960,  82),
    ("ending", r"结算页\background.png",                   "bg/ending.webp",          1920, None, 72),

    # ============ 选择页 ============
    ("select", r"选择页\background_v2-选择页.png",         "bg/select.webp",          1920, None, 72),
    ("select", r"选择页\标题青史志文字印章.png",           "deco/brand.webp",         380,  None, 90),
    ("select", r"选择页\副标题文字.png",                   "deco/subtitle.webp",      360,  None, 92),
    ("select", r"选择页\朝代选择轮盘底板.png",             "panel/wheel.webp",        620,  None, 84),
    ("select", r"选择页\秦主题中心面板.png",               "panel/wheel-center.webp", 460,  None, 84),
    ("select", r"选择页\轮盘中心文字印章.png",             "deco/wheel-seal.webp",    380,  None, 90),
    ("select", r"选择页\剧本名边框.png",                   "panel/script-frame.webp", 220,  None, 88),
    ("select", r"选择页\卡片边框.png",                     "panel/char-frame.webp",   520,  None, 88),
    ("select", r"选择页\返回按钮.png",                     "btn/back-sm.webp",        180,  None, 88),
    ("select", r"选择页\难度按钮-未选中.png",              "btn/diff-off.webp",       560,  None, 86),
    ("select", r"选择页\难度按钮-选中.png",                "btn/diff-on.webp",        560,  None, 86),
    ("select", r"选择页\难度选择文字标签.png",             "deco/diff-label.webp",    260,  None, 92),
    ("select", r"选择页\入局主按钮-1791442414328.png",     "btn/enter.webp",          560,  None, 86),
    ("select", r"选择页\小标题装饰.png",                   "deco/sub-mark.webp",      120,  None, 92),
    ("select", r"选择页\右上角青史志标识区.png",           "deco/brand-corner.webp",  340,  None, 90),

    # ============ 存档页 ============
    ("save", r"存档页\background.png",                     "bg/save.webp",            1920, None, 72),
    ("save", r"存档页\标题下方装饰线-1791556608777.png",   "deco/rule-line.webp",     1400, None, 92),
    ("save", r"存档页\李斯选项卡底板-1791556612723.png",   "panel/save-tab.webp",     640,  None, 86),
    ("save", r"存档页\李斯选项右侧箭头-1791556626119.png", "deco/arrow.webp",         160,  None, 88),
    ("save", r"存档页\右上角梅花枝装饰.png",               "decor/plum-save.webp",    620,  None, 82),
    ("save", r"存档页\左下角水墨竹子装饰.png",             "decor/bamboo-bl.webp",    None,  760,  82),

    # ============ 存档页 v2(2026-10-16 新美术,仓库 assets/image/save/) ============
    # 全部透明底小件,面板类(save-frame/slot/bar/guide)支持九宫格拉伸,
    # 保留原尺寸不缩放——金线/虚线在 2x 屏下才不糊。
    ("savepage", r"repo:image\save\save-frame.png",       "save/frame.webp",       None, None, 90),
    ("savepage", r"repo:image\save\save-thumb.png",       "save/thumb.webp",       None, None, 90),
    ("savepage", r"repo:image\save\save-thumb-on.png",    "save/thumb-on.webp",    None, None, 90),
    ("savepage", r"repo:image\save\save-slot.png",        "save/slot.webp",        None, None, 88),
    ("savepage", r"repo:image\save\save-slot-empty.png",  "save/slot-empty.webp",  None, None, 88),
    ("savepage", r"repo:image\save\save-bar.png",         "save/bar.webp",         None, None, 88),
    ("savepage", r"repo:image\save\save-guide.png",       "save/guide.webp",       None, None, 88),
    ("savepage", r"repo:image\save\save-pip.png",         "save/pip.webp",         None, None, 92),
    ("savepage", r"repo:image\save\save-pip-on.png",      "save/pip-on.webp",      None, None, 92),
    ("savepage", r"repo:image\save\btn-gold.png",         "save/btn-gold.webp",    None, None, 90),
    ("savepage", r"repo:image\save\btn-plain.png",        "save/btn-plain.webp",   None, None, 90),
    ("savepage", r"repo:image\save\badge-temp.png",       "save/badge-temp.webp",  None, None, 92),

    # ============ 设置 ============
    ("settings", r"设置\梅花枝装饰.png",                   "decor/plum-set.webp",     520,  None, 82),
    ("settings", r"设置\水墨竹石装饰.png",                 "decor/bamboo-set.webp",   None,  680,  82),
    ("settings", r"设置\b1af65d6-7474-402f-8a85-b85f24b0c35f.png", "bg/settings.webp", 1920, None, 72),

    # ============ Lua 版主菜单/选择页 ============
    # H5 的这两个页面按封存 Lua 版(home.lua)复刻,主体用 Lua 版那套素材;
    # 主菜单背景和左右装饰(梅/竹)改用的是「抉择结算浮层」组的设计稿素材
    # (2026-10-15 用户供图)。梅/竹源图内容偏向画布一侧,使用时按 CSS
    # scaleX(-1) 镜像贴边,管线里不翻转,保留原图。
    ("lua", r"抉择结算浮层\background.png",             "lua/menu-bg.webp",        1920, None, 74),
    ("lua", r"抉择结算浮层\zuo侧红梅枝装饰-改成镜像.png", "lua/menu-deco-mei.webp",  None, 720,  84),
    ("lua", r"抉择结算浮层\you侧水墨竹装饰-改成镜像.png",  "lua/menu-deco-zhu.webp",  None, 1100, 84),
    ("lua", r"repo:ui\title-calligraphy.png",   "lua/title-calligraphy.webp", None, 900, 92),
    ("lua", r"repo:ui\bg-select.jpg",           "lua/bg-select.webp",        1920, None, 74),
    ("lua", r"repo:ui\parts\wheel_ring.png",    "lua/wheel-ring.webp",       880,  None, 86),
    # 朝代图（2026-10-20）：源图由 arch\*.jpg 换为带圆形 alpha 遮罩的 512 PNG，
    # 尺寸 420→512、质量 80→88。旧 420 无 alpha 的 WebP 在圆盘上会露出硬边，
    # 且与 src/assets/lua 下同名 PNG 构成重复（同一素材两份，其中一份还被 import）。
    # 注：assets/arch 下新源图当前文件名为 *_副本.png，此处按无后缀名引用。
    ("lua", r"repo:arch\qin.png",               "lua/arch-qin.webp",         512,  None, 88),
    ("lua", r"repo:arch\han.png",               "lua/arch-han.webp",         512,  None, 88),
    ("lua", r"repo:arch\tang.png",              "lua/arch-tang.webp",        512,  None, 88),
    ("lua", r"repo:arch\song.png",              "lua/arch-song.webp",        512,  None, 88),
    ("lua", r"repo:arch\ming.png",              "lua/arch-ming.webp",        512,  None, 88),
    ("lua", r"repo:ui\parts\card_frame.png",    "lua/card-frame.webp",       None, None, 90),
    ("lua", r"repo:ui\parts\scen_plate.png",    "lua/scen-plate.webp",       None, None, 92),
    ("lua", r"repo:ui\parts\diff_on.png",       "lua/diff-on.webp",          560,  None, 88),
    ("lua", r"repo:ui\parts\diff_off.png",      "lua/diff-off.webp",         560,  None, 88),
    ("lua", r"repo:ui\parts\btn_vortex.png",    "lua/vortex.webp",           620,  None, 88),
    ("lua", r"repo:ui\parts\back_btn.png",      "lua/back-btn.webp",         200,  None, 88),
    ("lua", r"repo:ui\parts\title.png",         "lua/title-h.webp",          400,  None, 90),
    ("lua", r"repo:ui\parts\deco.png",          "lua/deco.webp",             None, None, 92),
]

# ============ 主角大立绘(对局页左侧) ============
# 李斯用对局页素材里的专用立绘(见上面 game 组);其余四主角从本仓库
# assets/image/portraits/ 的 char_*.png 转。shrink 只缩不放,512x768 原尺寸
# 转出,与李斯的 620 宽在 CSS 里统一收口(.portrait width:100%)。
ASSETS += [
    ("portrait", r"repo:image\portraits\char_jingke.png",    "portrait/jingke.webp",    620, 860, 86),
    ("portrait", r"repo:image\portraits\char_hanxin.png",    "portrait/hanxin.webp",    620, 860, 86),
    ("portrait", r"repo:image\portraits\char_xiangyu.png",   "portrait/xiangyu.webp",   620, 860, 86),
    ("portrait", r"repo:image\portraits\char_chensheng.png", "portrait/chensheng.webp", 620, 860, 86),
]

# ============ NPC 大立绘(对局页出场角色可切换,2026-10-14) ============
# 源:本仓库 assets/image/portraits/char_*.png(75 张抠图立绘)。
# 只转「五本剧本 ⟦NPC⟧ 标记里真实出场、且 src/ui/cast.ts CHAR_IMG 里有映射」
# 的角色。liubang/jibu 无大立绘源(只有圆像),跳过;五主角已在上面
# game/portrait 组,不重复。樊於期源文件名是 char_fanyuqi.png(生成时的
# 拼音笔误),输出仍按正确读音 fanwuqi.webp,与圆像同 id。
NPC_PORTRAIT_IDS = [
    "caomo", "caowushang", "chenping", "chenxi", "chunshenjun", "chunyuyue",
    "fankuai", "fanwuqi", "fanzeng", "fusu", "gaojianli", "genie", "geying",
    "hanfei", "hougong", "huhai", "jingju", "kongfu", "kuaitong", "laoai",
    "liyuan", "liyou", "lizuoche", "longju", "lujujian", "lvhou", "lvmatong",
    "mengjia", "mengtian", "pengyue", "piaomu", "qinwuyang", "songyi",
    "taizidan", "tenggong", "tianguang", "tianrong", "wangjian", "wangli",
    "wuchen", "wuguang", "xiawuju", "xiangbo", "xiangliang", "xiangqiang",
    "xiangyan", "xiangzhuang", "xiaohe", "xufuren", "xunqing", "yidi",
    "yingbu", "yingzheng", "yintong", "yuji", "zhanghan", "zhangliang",
    "zhaogao", "zhengguo", "zhouqingchen", "zhouwen", "zhonglimei", "zhuangjia",
]
for _cid in NPC_PORTRAIT_IDS:
    # 两个源文件名与标准读音不一致:樊於期(於 wū)写成了 fanyuqi,钟离眜(眜 mò)写成了 zhonglimo
    _src = {"fanwuqi": "char_fanyuqi.png", "zhonglimei": "char_zhonglimo.png"}.get(
        _cid, f"char_{_cid}.png")
    ASSETS.append(("npc", rf"repo:image\portraits\{_src}", f"portrait/{_cid}.webp", 620, 860, 86))

# ============ 角色立绘全集(来自原型 assets/char) ============
# 33 个角色,对齐原型 ui-core.js 的 CHAR_IMG 表。立绘不是按剧本挑的,
# 而是扫描叙事文本里的 ⟦NPC⟧ 标记——凡是在场且有图的,都出一张圆像,
# 所以必须整套接入,不能只挑五个主角。
# 原图 1024x1536 / 1672x2508,游戏页只显示上半身,限高 420 足够。
CHAR_IDS = [
    "chensheng", "fanwuqi", "fanzeng", "fusu", "gaojianli", "hanfei", "hanxin",
    "huhai", "jibu", "jingke", "kuaitong", "lisi", "liubang", "lizuoche",
    "longju", "mengtian", "piaomu", "qinwuyang", "taizidan", "tianguang",
    "wangjian", "wuchen", "wuguang", "xiangbo", "xiangliang", "xiangyu",
    "xiaohe", "yingzheng", "yuji", "zhanghan", "zhaogao", "zhengguo",
    "zhonglimei",
]
for _cid in CHAR_IDS:
    ASSETS.append(("char", rf"proto/char/char_{_cid}.png", f"char/{_cid}.webp", None, 560, 80))

# 不参与构建的源文件(参考图 / 合成预览 / 重复底图),列出来是为了自检时对得上账
SKIP = [
    r"对局页\对局页-参考图.png",
    r"对局页\回溯浮层-参考图.png",
    r"回溯浮层\background.png",
    r"回溯浮层\右上角红梅枝装饰.png",
    r"回溯浮层\左侧水墨竹装饰.png",
    r"回溯浮层\回溯浮层-古风弹窗底板.png",
    r"回溯浮层\回溯浮层-确认按钮.png",
    r"回溯浮层\回溯浮层-再想想按钮.png",
    r"回溯浮层\回溯浮层-弹窗分割线装饰.png",
    r"回溯浮层\回溯浮层-参考图.png",
    r"抉择结算浮层\composite.png",
    r"结算页\composite.png",
    r"存档页\composite.png",
    r"选择页\background.png",
    r"选择页\background (2).png",
    r"选择页\background_副本.png",
    r"选择页\composite.png",
    r"选择页\composite (2).png",
    r"章末结算\图片高清生成.jpeg",
]


def shrink(im: Image.Image, max_w, max_h) -> Image.Image:
    """按最大边等比缩放;任一轴为 None 表示不限。"""
    w, h = im.size
    scale = 1.0
    if max_w and w > max_w:
        scale = min(scale, max_w / w)
    if max_h and h > max_h:
        scale = min(scale, max_h / h)
    if scale >= 1.0:
        return im
    # 用 LANCZOS 缩,金线/细边框才不会糊;整数倍时用 NEAREST 保持锐利
    resample = Image.Resampling.NEAREST if abs(scale - round(scale)) < 1e-6 else Image.Resampling.LANCZOS
    return im.resize((max(1, round(w * scale)), max(1, round(h * scale))), resample)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", action="append", help="只做指定分组,可重复")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    rows = [a for a in ASSETS if not args.only or a[0] in args.only]
    # 按需检查源根:只转 repo: 组(本仓库 assets/)时不该因为 ui/ 素材目录
    # 不在就退出 —— 那个目录只在美术机上存在,克隆仓库的开发机没有。
    def need(pred, root, label):
        if any(pred(rel) for _, rel, *_ in rows) and not root.is_dir():
            print(f"找不到{label}: {root}", file=sys.stderr)
            return True
        return False
    if need(lambda r: not r.startswith(("proto/", "repo:")), SRC, "美术源目录"):
        return 2
    if need(lambda r: r.startswith("proto/"), SRC2, "原型 assets 目录"):
        return 2
    if need(lambda r: r.startswith("repo:"), SRC3, "仓库 assets 目录"):
        return 2
    missing = []
    total_in = 0
    total_out = 0
    done = 0

    for group, rel, out, mw, mh, q in rows:
        # proto/ 前缀走第二个源根(原型 assets/),repo: 前缀走本仓库 assets/,其余走 ui/
        if rel.startswith("proto/"):
            src = SRC2 / rel[len("proto/"):]
        elif rel.startswith("repo:"):
            src = SRC3 / rel[len("repo:"):]
        else:
            src = SRC / rel
        if not src.is_file():
            missing.append(rel)
            continue
        # 增量:输出已存在且不比源旧,跳过(上次跑到一半超时也能断点续转)
        dst = OUT / out
        if not args.dry_run and dst.is_file() and dst.stat().st_mtime >= src.stat().st_mtime:
            done += 1
            continue
        in_kb = src.stat().st_size / 1024
        total_in += in_kb
        if not args.dry_run:
            im = Image.open(src)
            # 统一转成 RGBA:金色描边与卷轴边有半透,RGB 会把透明区压成黑边
            if im.mode not in ("RGBA", "LA"):
                im = im.convert("RGBA")
            im = shrink(im, mw, mh)
            dst.parent.mkdir(parents=True, exist_ok=True)
            im.save(dst, "WEBP", quality=q, method=6)
            out_kb = dst.stat().st_size / 1024
        else:
            with Image.open(src) as im:
                out_kb = (im.size[0] * im.size[1]) / 1024 * 0.18  # 粗估
        total_out += out_kb
        done += 1
        print(f"  {group:<9} {out:<32} {in_kb:8.0f} KB -> {out_kb:7.0f} KB")

    print(f"\n处理 {done} 张")
    if not args.dry_run:
        print(f"体积 {total_in/1024:.1f} MB -> {total_out/1024:.2f} MB "
              f"(降 {(1-total_out/total_in)*100:.1f}%)")
    if missing:
        print(f"\n源文件缺失 {len(missing)} 个:", file=sys.stderr)
        for m in missing:
            print("  " + m, file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())