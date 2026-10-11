#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把 13 张剧本立绘抠成透明底(不带背景)。

源/出:assets/image/portraits/char_*.png(512x768,原地替换为透明底)

方法:**边缘泛洪填充**(flood fill)。
  从画面四边出发,沿「相邻像素色差 < 阈值」的路径向内扩散,扩散到的区域判为背景。
  这样判定的是「与边缘的颜色连通性」,而不是全局亮度 —— 所以:
    · 人物身上的浅色(白袍、浅色竹简)不会被误删 —— 它们与边缘不连通
    · 背景的渐变与笔触能被跟着走完 —— 不像固定色距那样留一圈灰雾
  再填内部空洞(袖口缝隙等被包住的背景块),最后边缘羽化避免硬边。
"""
import os
import glob
import numpy as np
from collections import deque
from PIL import Image, ImageFilter
from scipy import ndimage

SRC = "assets/image/portraits"
STEP_TOL = 24        # 相邻像素色差阈值(曼哈顿距离)
FEATHER = 1.0        # 边缘羽化半径(px)

done = []
for p in sorted(glob.glob(os.path.join(SRC, "char_*.png"))):
    name = os.path.basename(p)[:-4]
    im = Image.open(p).convert("RGB")
    a = np.array(im).astype(int)
    h, w, _ = a.shape

    # 从四边种子出发做泛洪
    seen = np.zeros((h, w), bool)
    dq = deque()
    for x in range(w):
        for y in (0, h - 1):
            if not seen[y, x]:
                seen[y, x] = True
                dq.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if not seen[y, x]:
                seen[y, x] = True
                dq.append((y, x))
    while dq:
        y, x = dq.popleft()
        cur = a[y, x]
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and not seen[ny, nx]:
                if np.abs(a[ny, nx] - cur).sum() < STEP_TOL:
                    seen[ny, nx] = True
                    dq.append((ny, nx))

    # 注意:这里**不能**用 binary_fill_holes —— 它的语义是「把被前景包住的洞填上」,
    # 而此处 seen 是背景、人物才是被包住的「洞」,填下去会把整个人物吞掉。
    bgmask = seen
    alpha = np.where(bgmask, 0, 255).astype(np.uint8)
    am = Image.fromarray(alpha, "L").filter(ImageFilter.GaussianBlur(FEATHER))
    alpha = np.clip((np.array(am).astype(int) - 40) * 255 / (255 - 40), 0, 255).astype(np.uint8)

    out = np.dstack([np.array(im), alpha])
    Image.fromarray(out.astype(np.uint8), "RGBA").save(p, optimize=True)
    done.append((name, bgmask.mean(), os.path.getsize(p) / 1024))

print("抠图完成 %d 张(原地替换):" % len(done))
for n, r, kb in done:
    print("   %-16s 背景占 %.1f%%   %6.1f KB" % (n, r * 100, kb))
