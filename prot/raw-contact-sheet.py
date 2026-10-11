#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把指定原图(未抠图)拼成联络表,便于生成后自检。"""
import glob
import os
import sys
from PIL import Image

NAMES = sys.argv[1:] or [
    "gaojianli", "xiangyan", "xiangbo", "chenxi", "kuaitong", "liyuan", "wangli",
    "xufuren", "songyi", "zhouwen", "geying", "tianzang", "jingju", "hougong",
]

COLS, CW, CH, PAD = 7, 180, 270, 6
rows = (len(NAMES) + COLS - 1) // COLS
W = COLS * (CW + PAD) + PAD
H = rows * (CH + PAD) + PAD
sheet = Image.new("RGBA", (W, H), (250, 246, 236, 255))

for i, n in enumerate(NAMES):
    cands = sorted(glob.glob("assets/image/%s_*.png" % n))
    if not cands:
        print("缺:", n)
        continue
    im = Image.open(cands[-1]).convert("RGBA").resize((CW, CH), Image.LANCZOS)
    r, c = divmod(i, COLS)
    sheet.alpha_composite(im, (PAD + c * (CW + PAD), PAD + r * (CH + PAD)))

os.makedirs(".tmp", exist_ok=True)
out = ".tmp/raw-batch3.png"
sheet.convert("RGB").save(out, quality=92)
print("已生成", out, sheet.size)
