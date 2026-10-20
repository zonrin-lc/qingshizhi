#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
《青史志》H5 字体门禁。

为什么需要这道门禁:游戏全站统一使用霞鹜文楷子集(base.css 的 --font-kai)。
子集是从完整字库里挑字生成的,一旦正文写了子集里没有的字,浏览器会静默
回落到系统字体 —— 页面上不会报错,只是某个字突然换了字形。这种问题在
真机上才看得见,所以必须在构建期拦下来。

检查两件事:
  1. 字体文件在位,且能解析出 cmap
  2. 源码里出现的中文字,字体子集全部覆盖(注释里的字不算 —— 它们不进页面)

用法:
    node tools/run-python.cjs tools/check-font.py   # 推荐:npm run verify:font 走这条
    python tools/check-font.py                      # 直接跑也可以
    python tools/check-font.py --all                # 连注释里的字一起报(诊断用)

Windows 注意:控制台默认 GBK,直接打印 '✓'/'✗' 会抛 UnicodeEncodeError 让门禁
以"失败"收场 —— 明明字体是全覆盖的。下面统一把标准流改到 UTF-8 并容错。
"""

import re
import sys
import pathlib

# Windows 控制台/重定向默认 GBK:打印 '✓' 会 UnicodeEncodeError。
# 直接运行时这里兜底;经 tools/run-python.cjs 启动时还额外设了 PYTHONIOENCODING。
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

ROOT = pathlib.Path(__file__).resolve().parents[1]
FONT = ROOT / "public" / "fonts" / "qingshi-kai.ttf"

# 只扫这些:进页面的文本都在 src/ 与 index.html。
# 不含 node_modules / dist / tests(测试里的中文不进页面)。
SCAN_GLOBS = ["src/**/*.ts", "src/**/*.css", "src/**/*.html", "index.html"]
SKIP_PARTS = {"node_modules", "dist", "design", "tests"}

CJK = re.compile(r"[一-鿿]")
# 块注释 / 行注释:注释里的字不进页面,默认不计入
BLOCK_COMMENT = re.compile(r"/\*[\s\S]*?\*/")
LINE_COMMENT = re.compile(r"//[^\n]*")
# 字体名本身不算页面文字。子集里没有「鹜」是正常的 —— 它只出现在
# CSS 的 font-family 声明里,浏览器按名字匹配字体,不需要渲染这个字。
FONT_NAME_CHARS = set("霞鹜文楷")
# font-family 声明:整行剔掉
FONT_FAMILY = re.compile(r"font-family\s*:[^;]*;")


def die(msg: str) -> None:
    print(f"[verify:font] ✗ {msg}", file=sys.stderr)
    sys.exit(1)


def load_cmap():
    try:
        from fontTools.ttLib import TTFont
    except ImportError:
        die("需要 fontTools:  pip install fonttools")
    if not FONT.exists():
        die(f"字体文件不存在: {FONT.relative_to(ROOT)}")
    try:
        return set(TTFont(str(FONT), lazy=True).getBestCmap().keys())
    except Exception as e:  # 字体损坏时给出可读原因,而不是抛栈
        die(f"字体解析失败({FONT.name}): {e}")


def collect_chars(strip_comments: bool):
    """返回 {字符: 首个出现的文件},按需剥掉注释"""
    found: dict[str, str] = {}
    files = []
    for g in SCAN_GLOBS:
        files += list(ROOT.glob(g))
    files = [f for f in files if not (SKIP_PARTS & set(f.parts))]
    if not files:
        die("没扫到任何源文件,检查 SCAN_GLOBS 是否写错")
    for f in files:
        try:
            text = f.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        if strip_comments:
            text = BLOCK_COMMENT.sub("", text)
            text = LINE_COMMENT.sub("", text)
            text = FONT_FAMILY.sub("", text)
        for ch in CJK.findall(text):
            if ch in FONT_NAME_CHARS:
                continue
            found.setdefault(ch, str(f.relative_to(ROOT)))
    return found


def main() -> None:
    strip = "--all" not in sys.argv
    cmap = load_cmap()
    chars = collect_chars(strip_comments=strip)

    missing = {c: src for c, src in chars.items() if ord(c) not in cmap}
    scope = "正文" if strip else "正文+注释"

    print(f"[verify:font] 字体: {FONT.relative_to(ROOT)}  ({len(cmap)} 码位)")
    print(f"[verify:font] 扫描{scope}中文字符: {len(chars)}")

    if missing:
        print(f"[verify:font] ✗ 缺字 {len(missing)} 个:", file=sys.stderr)
        for c, src in sorted(missing.items()):
            print(f"    {c}  (U+{ord(c):04X})  ← {src}", file=sys.stderr)
        die("字体子集不覆盖以上字符,页面上会静默回落到系统字体")
    print("[verify:font] ✓ 全部覆盖")


if __name__ == "__main__":
    main()
