# -*- coding: utf-8 -*-
"""按 TapTap H5 包规范打包 dist -> 单顶层文件夹 zip（文本 deflate，媒体 store 提速）"""
import os, zipfile, time

ROOT = r"D:\MUSI\QINGSHIZHI\h5"
SRC = os.path.join(ROOT, "dist")
OUT = os.path.join(ROOT, "release", "qingshizhi-h5-v1.0.1.zip")
TOP = "qingshizhi-h5-v1.0.1"  # zip 内唯一顶层文件夹

DEFLEXT = {".html", ".js", ".css", ".json", ".svg", ".txt", ".xml", ".map"}

files = []
for dirpath, _, names in os.walk(SRC):
    for n in names:
        p = os.path.join(dirpath, n)
        rel = os.path.relpath(p, SRC).replace(os.sep, "/")
        files.append((p, f"{TOP}/{rel}"))

t0 = time.time()
with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as z:
    for p, arc in files:
        ext = os.path.splitext(p)[1].lower()
        if ext in DEFLEXT:
            z.write(p, arc)
        else:  # 媒体已压缩，store 写入提速
            zi = zipfile.ZipInfo(arc, date_time=time.localtime()[:6])
            zi.compress_type = zipfile.ZIP_STORED
            zi.external_attr = 0o644 << 16
            with open(p, "rb") as f:
                z.writestr(zi, f.read())

mb = os.path.getsize(OUT) / 1048576
print(f"OK {OUT}")
print(f"files={len(files)} size={mb:.1f} MB elapsed={time.time()-t0:.1f}s")

# 校验：顶层只有一个文件夹且含 index.html
with zipfile.ZipFile(OUT) as z:
    tops = {n.split("/")[0] for n in z.namelist()}
    idx = [n for n in z.namelist() if n == f"{TOP}/index.html"]
    bad = z.testzip()
print(f"top-level={tops} index.html={'YES' if idx else 'NO'} corrupt={bad}")
