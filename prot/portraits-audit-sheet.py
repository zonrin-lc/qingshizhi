#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""全量立绘审校联络表:按 CHAR_IMG 顺序排版,每格标序号 + 拼音 id。

棋盘底便于看透明区;每格下方白条写序号与 id,便于逐张点名。
"""
import re
from PIL import Image, ImageDraw

GAME = "scripts/qingshi/ui/game.lua"
src = open(GAME, encoding="utf-8").read()
# 按 CHAR_IMG 表里出现的顺序取 (中文名, id)
pairs = re.findall(r"\['([^']+)'\]\s*=\s*'([^']+)'", src)

COLS, CW, CH, PAD, BAR = 8, 150, 225, 5, 20
rows = (len(pairs) + COLS - 1) // COLS
W = COLS * (CW + PAD) + PAD
H = rows * (CH + BAR + PAD) + PAD
sheet = Image.new("RGBA", (W, H), (250, 246, 236, 255))

# 棋盘底
for y in range(0, H, 14):
    for x in range(0, W, 14):
        if (x // 14 + y // 14) % 2:
            sheet.paste((226, 220, 206, 255), (x, y, min(x + 14, W), min(y + 14, H)))

d = ImageDraw.Draw(sheet)
for i, (cn, pid) in enumerate(pairs):
    r, c = divmod(i, COLS)
    x0 = PAD + c * (CW + PAD)
    y0 = PAD + r * (CH + BAR + PAD)
    try:
        im = Image.open("assets/image/portraits/char_%s.png" % pid).convert("RGBA")
    except FileNotFoundError:
        print("缺图:", pid)
        continue
    im = im.resize((CW, CH), Image.LANCZOS)
    sheet.alpha_composite(im, (x0, y0))
    d.rectangle([x0, y0 + CH, x0 + CW, y0 + CH + BAR], fill=(255, 255, 255, 255))
    d.text((x0 + 3, y0 + CH + 4), "%02d %s" % (i + 1, pid), fill=(40, 40, 40, 255))

sheet.convert("RGB").save(".tmp/audit-all.png", quality=90)
print("已生成 .tmp/audit-all.png  %s  共 %d 张" % (sheet.size, len(pairs)))

# 再出两张放大版,便于看细节
for part in (1, 2):
    sub = pairs[(part - 1) * 36:part * 36]
    cols, cw, ch = 6, 220, 330
    rws = (len(sub) + cols - 1) // cols
    s2 = Image.new("RGBA", (cols * (cw + PAD) + PAD, rws * (ch + BAR + PAD) + PAD),
                   (250, 246, 236, 255))
    for y in range(0, s2.height, 14):
        for x in range(0, s2.width, 14):
            if (x // 14 + y // 14) % 2:
                s2.paste((226, 220, 206, 255), (x, y, min(x + 14, s2.width), min(y + 14, s2.height)))
    d2 = ImageDraw.Draw(s2)
    for j, (cn, pid) in enumerate(sub):
        r, c = divmod(j, cols)
        x0 = PAD + c * (cw + PAD)
        y0 = PAD + r * (ch + BAR + PAD)
        im = Image.open("assets/image/portraits/char_%s.png" % pid).convert("RGBA")
        im = im.resize((cw, ch), Image.LANCZOS)
        s2.alpha_composite(im, (x0, y0))
        d2.rectangle([x0, y0 + ch, x0 + cw, y0 + ch + BAR], fill=(255, 255, 255, 255))
        d2.text((x0 + 3, y0 + ch + 4), "%02d %s %s" % ((part - 1) * 36 + j + 1, cn, pid),
                fill=(40, 40, 40, 255))
    s2.convert("RGB").save(".tmp/audit-%d.png" % part, quality=92)
    print("已生成 .tmp/audit-%d.png  %s" % (part, s2.size))
