#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把美术交付的新立绘缩放到运行时尺寸(512x768),替换 assets/image/portraits/。

源目录 assets/image/renwulihui_new/ 是交付原件(2048x3072 起,单张 3-11MB),
运行时只需 512x768(与卡片 512:768 同比例)。统一转 RGB(alpha 全是 255,无透明需求)。
注意:源文件名 zhanggan 是拼写笔误,实际角色是「章邯」,故映射回 zhanghan。
"""
import os
import glob
from PIL import Image

SRC = "assets/image/renwulihui_new"
DST = "assets/image/portraits"
W, H = 512, 768

# 源文件名前缀 -> 目标角色 id
MAP = {
    "chensheng": "chensheng", "fusu": "fusu", "hanfei": "hanfei",
    "hanxin": "hanxin", "huhai": "huhai", "jingke": "jingke", "lisi": "lisi",
    "mengtian": "mengtian", "xiangyu": "xiangyu", "xiaohe": "xiaohe",
    "yingzheng": "yingzheng",
    "zhanggan": "zhanghan",   # 源文件拼写有误,实际角色是「章邯」
    "zhaogao": "zhaogao",
}


def key_of(fn):
    base = os.path.basename(fn)
    for k in MAP:
        if base.startswith(k):
            return k
    return None


done = []
for p in sorted(glob.glob(SRC + "/*.png")):
    k = key_of(p)
    if not k:
        print("  跳过(无法识别):", os.path.basename(p))
        continue
    im = Image.open(p).convert("RGB")
    s = min(W / im.width, H / im.height)
    nw, nh = round(im.width * s), round(im.height * s)
    im = im.resize((nw, nh), Image.LANCZOS)
    if nw != W or nh != H:
        left, top = (nw - W) // 2, (nh - H) // 2
        im = im.crop((left, top, left + W, top + H))
    out = os.path.join(DST, "char_%s.png" % MAP[k])
    im.save(out, optimize=True)
    done.append((MAP[k], im.size, os.path.getsize(out) / 1024))

print("替换 %d 张:" % len(done))
for k, size, kb in done:
    print("   char_%-12s %dx%d  %6.1f KB" % (k, size[0], size[1], kb))
