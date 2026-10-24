#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
BGM 转码:assets/audio/*.ogg → h5/src/assets/bgm/*.webm

为什么必须转:
  源是 vorbis 160 kb/s、3 分 23 秒的完整曲子,单个 3.2~4.0 MB。
  十一个文件合计 41.3 MB,任何一个都不能直接上网页。
  同码率下 opus 比 aac 省 17%(48k vs 64k),省下的比换格式更重要。

为什么只出 webm:
  2026-10-20 用户拍板砍掉 m4a(aac) 那套。原本双格式是为 Safari 兜底,
  但 m4a 让产物多背 173 MB,而目标平台是 TapTap 容器(WebView 内核支持
  opus),不值得为兜底付这个体积。
  需要 Safari 直开时把 m4a 加回来即可 —— 源 ogg 一直在 assets/audio/。
  实测(idle):webm 1.35 MB。

装载策略(与 src/game/audio.ts 配套):
  - 入局只下「纯音乐版」一个文件,vocal 版是可选开关,不预载
  - 音乐在进入对局后后台加载,不阻塞首屏交互
  - 浏览器自动播放策略要求先有用户手势,所以真正 play() 发生在点「入局」之后

固定码率对 libopus 意义重大:加 -ac 1 不会变小(比特率是总量),
只会让每声道分到更多码,听起来更糟。要省只能降码率。

用法:
    python h5/tools/build-audio.py            # 全量
    python h5/tools/build-audio.py --opus 48k
"""
import argparse
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "assets" / "audio"
OUT = Path(__file__).resolve().parents[1] / "src" / "assets" / "bgm"

# 源文件名 → 输出名。保持同名,便于 src 侧按剧本 key 推导。
FILES = [
    ("bgm_idle.ogg", "idle"),
    ("bgm_lisi_inst.ogg", "lisi-inst"),
    ("bgm_lisi_vocal.ogg", "lisi-vocal"),
    ("bgm_jingke_inst.ogg", "jingke-inst"),
    ("bgm_jingke_vocal.ogg", "jingke-vocal"),
    ("bgm_hanxin_inst.ogg", "hanxin-inst"),
    ("bgm_hanxin_vocal.ogg", "hanxin-vocal"),
    ("bgm_xiangyu_inst.ogg", "xiangyu-inst"),
    ("bgm_xiangyu_vocal.ogg", "xiangyu-vocal"),
    ("bgm_chensheng_inst.ogg", "chensheng-inst"),
    ("bgm_chensheng_vocal.ogg", "chensheng-vocal"),
]


def find_ffmpeg() -> str | None:
    """优先用 PATH 上的;找不到再试常见的随包附带位置。"""
    exe = shutil.which("ffmpeg")
    if exe:
        return exe
    for p in (
        r"C:\Users\28283\AppData\Roaming\qianfan-desktop-app\lightsandbox\native\bin\ffmpeg.exe",
    ):
        if Path(p).is_file():
            return p
    return None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--opus", default="48k", help="opus 目标码率,默认 48k")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    ff = find_ffmpeg()
    if not ff:
        print("找不到 ffmpeg,无法转码。请先安装并加入 PATH。", file=sys.stderr)
        return 2

    OUT.mkdir(parents=True, exist_ok=True)
    total_in = total_out = 0
    done = 0

    for src_name, out_name in FILES:
        src = SRC / src_name
        if not src.is_file():
            print(f"  源缺失: {src_name}", file=sys.stderr)
            return 1
        in_kb = src.stat().st_size / 1024
        total_in += in_kb

        dst = OUT / f"{out_name}.webm"
        cmd = [ff, "-hide_banner", "-loglevel", "error", "-y", "-i", str(src),
               "-c:a", "libopus", "-b:a", args.opus, "-vn", str(dst)]
        if not args.dry_run:
            r = subprocess.run(cmd, capture_output=True, text=True)
            if r.returncode != 0 or not dst.is_file() or dst.stat().st_size < 1024:
                print(f"  转码失败 {src_name} -> webm:\n{r.stderr}", file=sys.stderr)
                return 1
        out_kb = (dst.stat().st_size / 1024) if dst.is_file() else 0
        total_out += out_kb

        done += 1
        print(f"  {src_name:<26} {in_kb:7.0f} KB -> "
              f"{out_name + '.webm':<17} {out_kb:6.0f} KB")

    print(f"\n{done} 首 · webm 单格式")
    if not args.dry_run:
        print(f"体积 {total_in/1024:.1f} MB -> {total_out/1024:.2f} MB "
              f"(降 {(1-total_out/total_in)*100:.1f}%)")
    return 0


if __name__ == "__main__":
    sys.exit(main())