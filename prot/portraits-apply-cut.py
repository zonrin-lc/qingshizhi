#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把 AI 抠图产物归位到 assets/image/portraits/char_*.png。

AI 输出为 assets/image/edited_cut_<name>_<ts>.png,这里按角色名映射回标准文件名,
并做尺寸/透明度校验(尺寸必须 512x768,透明占比需合理)。
"""
import glob
import os
import numpy as np
from PIL import Image

NAMES = ["mengtian", "chensheng", "fusu", "hanfei", "hanxin", "huhai",
         "jingke", "lisi", "xiangyu", "xiaohe", "yingzheng", "zhanghan", "zhaogao",
         # 第一批补充角色(2026-10-11)
         "liyou", "fankuai", "xunqing", "pengyue", "zhangliang", "wuguang",
         # 第二批角色(2026-10-11)
         "lvhou", "xiangliang", "xiangzhuang", "chenping", "yuji", "mengjia",
         "yingbu", "qinwuyang", "tenggong", "chunshenjun",
         "zhuangjia", "taizidan", "lvbuwei",
         # 第三批角色(2026-10-11)
         "gaojianli", "xiangyan", "xiangbo", "chenxi", "kuaitong", "liyuan",
         "wangli", "xufuren", "songyi", "zhouwen", "geying", "tianzang",
         "jingju", "hougong",
         # 第四批角色(2026-10-11,按剧情分量)
         "chunyuyue", "lizuoche", "zhouqingchen", "fanzeng", "fanyuqi",
         "wangjian", "tianguang", "laoai", "zhengguo", "genie"]

DST = "assets/image/portraits"
ok, bad = 0, []
for k in NAMES:
    cands = sorted(glob.glob("assets/image/edited_cut_%s_*.png" % k))
    if not cands:
        bad.append(k + "(缺)")
        continue
    src = cands[-1]
    im = Image.open(src).convert("RGBA")
    a = np.array(im)
    tr = (a[..., 3] < 10).mean()
    if im.size != (512, 768) or tr < 0.15:
        bad.append("%s(size=%s, tr=%.2f)" % (k, im.size, tr))
        continue
    im.save(os.path.join(DST, "char_%s.png" % k), optimize=True)
    ok += 1

print("归位 %d 张" % ok)
if bad:
    print("异常:", bad)
print()
for p in sorted(glob.glob(os.path.join(DST, "char_*.png"))):
    a = np.array(Image.open(p).convert("RGBA"))
    print("  %-24s 透明 %.1f%%  %6.1f KB"
          % (os.path.basename(p), (a[..., 3] < 10).mean() * 100, os.path.getsize(p) / 1024))
