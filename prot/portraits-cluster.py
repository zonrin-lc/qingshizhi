#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""按"疑似雷同群"拼图,便于逐群肉眼比对姿态。"""
import sys
from PIL import Image, ImageDraw

GROUPS = {
    "A-拱手文士": ["liyuan", "jingju", "hougong", "tianguang", "caowushang",
                    "hansheng", "yidi", "lujujian", "xiangqiang", "chunyuyue"],
    "B-执卷文臣": ["lisi", "xiaohe", "liyou", "chenping", "hanfei", "xunqing",
                    "songyi", "lizuoche", "kongfu", "yaojia"],
    "C-深色甲胄": ["mengtian", "zhanghan", "xiangliang", "tenggong", "xiangyan",
                    "chenxi", "tianzang", "fanyuqi", "wangjian", "tianrong",
                    "lvmatong", "longju", "zhonglimo", "wuchen", "yingbu"],
    "D-指标异常": ["fanzeng", "zhangliang", "piaomu", "zhuangjia", "mengjia",
                    "xunqing", "zhouqingchen", "xiangbo", "liyou", "gaojianli"],
}

name = sys.argv[1] if len(sys.argv) > 1 else "A-拱手文士"
ids = GROUPS[name]
COLS, CW, CH, PAD, BAR = 5, 210, 315, 6, 22
rows = (len(ids) + COLS - 1) // COLS
W = COLS * (CW + PAD) + PAD
H = rows * (CH + BAR + PAD) + PAD
sheet = Image.new("RGBA", (W, H), (250, 246, 236, 255))
for y in range(0, H, 14):
    for x in range(0, W, 14):
        if (x // 14 + y // 14) % 2:
            sheet.paste((224, 218, 204, 255), (x, y, min(x + 14, W), min(y + 14, H)))
d = ImageDraw.Draw(sheet)
for i, pid in enumerate(ids):
    r, c = divmod(i, COLS)
    x0, y0 = PAD + c * (CW + PAD), PAD + r * (CH + BAR + PAD)
    im = Image.open("assets/image/portraits/char_%s.png" % pid).convert("RGBA")
    im = im.resize((CW, CH), Image.LANCZOS)
    sheet.alpha_composite(im, (x0, y0))
    d.rectangle([x0, y0 + CH, x0 + CW, y0 + CH + BAR], fill=(255, 255, 255, 255))
    d.text((x0 + 3, y0 + CH + 5), "%s  %s" % (pid, name), fill=(40, 40, 40, 255))
out = ".tmp/cluster-%s.png" % name
sheet.convert("RGB").save(out, quality=92)
print("已生成", out, sheet.size)
