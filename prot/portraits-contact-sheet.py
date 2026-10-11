#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把指定立绘拼成一张联络表(棋盘底,便于肉眼查残边/咬缺)。"""
import os
import sys
from PIL import Image

NAMES = sys.argv[1:] or [
    "lvhou", "xiangliang", "xiangzhuang", "chenping", "yuji", "mengjia", "yingbu",
    "qinwuyang", "tenggong", "chunshenjun", "zhuangjia", "taizidan", "lvbuwei",
]

COLS, CW, CH, PAD = 7, 180, 270, 6
rows = (len(NAMES) + COLS - 1) // COLS
W = COLS * (CW + PAD) + PAD
H = rows * (CH + PAD) + PAD
sheet = Image.new("RGBA", (W, H), (250, 246, 236, 255))

# 棋盘底:让透明区域一目了然
for y in range(0, H, 16):
    for x in range(0, W, 16):
        if (x // 16 + y // 16) % 2:
            sheet.paste((228, 222, 208, 255), (x, y, min(x + 16, W), min(y + 16, H)))

for i, n in enumerate(NAMES):
    p = "assets/image/portraits/char_%s.png" % n
    if not os.path.exists(p):
        print("缺:", p)
        continue
    im = Image.open(p).convert("RGBA").resize((CW, CH), Image.LANCZOS)
    r, c = divmod(i, COLS)
    sheet.alpha_composite(im, (PAD + c * (CW + PAD), PAD + r * (CH + PAD)))

out = ".tmp/contact-batch2.png"
os.makedirs(".tmp", exist_ok=True)
sheet.convert("RGB").save(out, quality=92)
print("已生成", out, sheet.size)
