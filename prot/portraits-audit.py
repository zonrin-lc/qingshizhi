#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""立绘设计审校:以"剪影形状"为主指标找姿态雷同,辅以尺度/边缘检查。

整体色调比对区分度不足(全是水墨白底),故主指标用 alpha 剪影:
把每张图缩到 40x60 的二值轮廓,两两算 IoU(交并比),IoU 高 = 姿态/构图雷同。
再按人物包围盒的"头顶位置 / 高度占比 / 宽占比"查尺度一致性。
"""
import re
import numpy as np
from PIL import Image

GAME = "scripts/qingshi/ui/game.lua"
src = open(GAME, encoding="utf-8").read()
block = src.split("local CHAR_IMG = {", 1)[1].split("\n}", 1)[0]
pairs = re.findall(r"\['([^']+)'\]\s*=\s*'([^']+)'", block)

MW, MH = 40, 60
sil, stats, names = [], [], []
for cn, pid in pairs:
    a = np.array(Image.open("assets/image/portraits/char_%s.png" % pid).convert("RGBA"))
    al = a[..., 3]
    m = (al > 40).astype(np.uint8)
    sil.append(np.array(Image.fromarray(m * 255).resize((MW, MH), Image.BILINEAR)) > 110)
    ys, xs = np.where(al > 40)
    top = ys.min() / al.shape[0]
    bh = (ys.max() - ys.min() + 1) / al.shape[0]
    bw = (xs.max() - xs.min() + 1) / al.shape[1]
    semi = ((al > 10) & (al < 245)).sum() / max(1, (al > 10).sum())
    stats.append((pid, top, bh, bw, semi))
    names.append((cn, pid))

print("CHAR_IMG 角色数:", len(pairs))
S = np.stack(sil)
inter = (S[:, None] & S[None, :]).sum(axis=(2, 3))
union = (S[:, None] | S[None, :]).sum(axis=(2, 3))
iou = inter / np.maximum(1, union)
np.fill_diagonal(iou, 0)

print()
print("=== 剪影最雷同的 15 对(IoU 越高越像) ===")
flat = [(iou[i, j], i, j) for i in range(len(names)) for j in range(i + 1, len(names))]
flat.sort(reverse=True)
for v, i, j in flat[:15]:
    print("  %.2f  %-12s %-12s" % (v, names[i][1], names[j][1]))

print()
print("=== 头顶位置一致性(>8% 说明构图偏高/偏低) ===")
for pid, top, bh, bw, semi in sorted(stats, key=lambda x: -x[1])[:8]:
    print("  头顶下移 %.0f%%  %s" % (top * 100, pid))
print("  中位头顶下移 %.0f%%" % (np.median([s[1] for s in stats]) * 100))

print()
print("=== 高度占比一致性(中位 %.0f%%,偏差大的构图过松/过紧) ==="
      % (np.median([s[2] for s in stats]) * 100))
med = np.median([s[2] for s in stats])
for pid, top, bh, bw, semi in sorted(stats, key=lambda x: x[2])[:6]:
    print("  偏小 %.0f%%  %s" % (bh * 100, pid))
for pid, top, bh, bw, semi in sorted(stats, key=lambda x: -x[2])[:6]:
    print("  偏大 %.0f%%  %s" % (bh * 100, pid))

print()
print("=== 边缘半透明占比(抠图灰雾,>11% 需复查) ===")
for pid, top, bh, bw, semi in sorted(stats, key=lambda x: -x[4])[:8]:
    print("  %-12s %.1f%%" % (pid, semi * 100))

print()
print("=== 宽度占比异常(<80% = 侧身太窄,与正面像不协调) ===")
for pid, top, bh, bw, semi in sorted(stats, key=lambda x: x[3])[:6]:
    print("  宽占比 %.0f%%  %s" % (bw * 100, pid))
