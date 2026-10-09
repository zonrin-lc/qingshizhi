#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把美术交付的「选择页」素材规整为引擎资源。

源目录:assets/image/选择页/   (设计交付原件,尺寸很大)
目标:    assets/ui/parts/*.png + assets/ui/bg-select.jpg

原则:等比缩放到 2 倍屏够用的像素尺寸,保留 alpha,不做任何重绘/裁切。
"""
import os
from PIL import Image

SRC = "assets/image/选择页"
DST = "assets/ui/parts"
os.makedirs(DST, exist_ok=True)

# 源文件 -> (输出名, 目标长边像素)  None 表示保持原尺寸
JOBS = [
    ("标题青史志文字印章.png",        "title.png",      344),
    ("返回按钮.png",                 "back_btn.png",   240),
    ("小标题装饰.png",               "deco.png",       190),
    ("朝代选择轮盘底板.png",          "wheel_ring.png", 880),
    ("卡片边框.png",                 "card_frame.png", 480),
    ("剧本名边框.png",               "scen_plate.png", 180),
    ("难度按钮-选中.png",            "diff_on.png",    560),
    ("难度按钮-未选中.png",          "diff_off.png",   560),
    ("入局主按钮-1791442414328.png", "btn_enter.png",  620),
]

for src_name, out_name, long_edge in JOBS:
    im = Image.open(os.path.join(SRC, src_name)).convert("RGBA")
    if long_edge and max(im.size) != long_edge:
        s = long_edge / max(im.size)
        im = im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)
    p = os.path.join(DST, out_name)
    im.save(p, optimize=True)
    print(f"{out_name:16s} {im.width:4d}x{im.height:<4d} {os.path.getsize(p)/1024:7.1f} KB   <- {src_name}")

# 背景:JPEG 体积优先(无透明需求)
bg = Image.open(os.path.join(SRC, "background_v2-选择页.png")).convert("RGB")
s = 1600 / max(bg.size)
if s < 1:
    bg = bg.resize((round(bg.width * s), round(bg.height * s)), Image.LANCZOS)
p = "assets/ui/bg-select.jpg"
# 必须 baseline:引擎贴图解码不支持 progressive JPEG
bg.save(p, quality=84, optimize=True)
print(f"{'bg-select.jpg':16s} {bg.width:4d}x{bg.height:<4d} {os.path.getsize(p)/1024:7.1f} KB   <- background_v2-选择页.png")
