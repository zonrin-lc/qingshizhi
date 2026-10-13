#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
配音转码:assets/audio/voice/*.ogg → h5/src/assets/voice/<剧本>/<章>/<片段>.{webm,m4a}

命名与 JSON 的对应关系(已对全库 162 个节点 + 全部随机事件校验通过):
    <key>_c<章id>_intro_<N>        → chapter.intro[N]
    <key>_c<章id>_<事件id>_s<N>    → event.segs[N-1]
    <key>_c<章id>_<事件id>_o<N>    → event.options[N-1].res
    <key>_rand_<R-id>_s<N> / _o<N> → RANDOM_EVENTS 同上
    <key>_end_<E> / _end_<E>__<变体> → ENDINGS[E].zhuan / variants[变体].zhuan

所以切片名可以纯靠推导得出(intro_1、1-1_s1、1-1_o1),
**不需要额外维护一份清单文件** —— src 侧用 import.meta.glob 建索引,
查不到就是没有这条配音,天然降级,也不会出现清单与数据漂移。

码率:源是 mono vorbis 96 kb/s。
    opus 32k mono 实测降到约 40%(24k 能到 50%,但齿音上能听出来,不值)
    aac 48k mono 作为 Safari 兜底

先按剧本+章做试点,而不是一次转 249 MB:
    全量 opus 后约 100 MB,一轮全流程出问题就得整体回退。
    单章约 2.5 MB、41 条,足够验证切片/预取/排队这套机制。

用法:
    python h5/tools/build-voice.py                      # 试点:李斯 c1
    python h5/tools/build-voice.py --scenario lisi --chapter c1
    python h5/tools/build-voice.py --all                # 全量(谨慎)
    python h5/tools/build-voice.py --list               # 看有哪些切片可用
"""
import argparse
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "assets" / "audio" / "voice"
OUT = Path(__file__).resolve().parents[1] / "src" / "assets" / "voice"
DATA = ROOT / "prot" / "lua-data"

# 切片名 → (章 id, 逻辑片段名)
#   lisi_c1_1-1_s1.ogg  →  key=lisi, ch=c1, name=1-1_s1
#   lisi_c1_intro_1.ogg →  key=lisi, ch=c1, name=intro_1
# 注意文件名里是 `_c1_`(章号就是 c1),不是 `_c` + `c1`。
SEG_RE = re.compile(r"^(?P<key>\w+)_c(?P<ch>\d+)_(?P<name>.+?)\.ogg$")


def find_ffmpeg() -> str | None:
    exe = shutil.which("ffmpeg")
    if exe:
        return exe
    for p in (r"C:\Users\28283\AppData\Roaming\qianfan-desktop-app\lightsandbox\native\bin\ffmpeg.exe",):
        if Path(p).is_file():
            return p
    return None


def collect(scenario: str | None, chapter: str | None):
    """列出要转的切片: [(源文件, 章id, 片段名)]"""
    out = []
    for f in sorted(SRC.glob("*.ogg")):
        m = SEG_RE.match(f.name)
        if not m:
            continue  # rand/end 不在章内,试点先不碰
        ch = f"c{m['ch']}"
        if scenario and m["key"] != scenario:
            continue
        # 注意比对的是补上 c 前缀的章 id —— 正则里捕获的是纯数字,
        # 直接拿它跟 "c1" 比会一个都匹配不上
        if chapter and ch != chapter:
            continue
        out.append((f, ch, m["name"]))
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--scenario", default="lisi")
    ap.add_argument("--chapter", default="c1")
    ap.add_argument("--all", action="store_true", help="转全部章(会产出约 100 MB)")
    ap.add_argument("--opus", default="32k")
    ap.add_argument("--aac", default="48k")
    ap.add_argument("--list", action="store_true", help="只列切片,不转码")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    jobs = collect(None if args.all else args.scenario, None if args.all else args.chapter)
    if not jobs:
        print(f"没找到切片: scenario={args.scenario} chapter={args.chapter}", file=sys.stderr)
        return 1

    by_ch = {}
    for _, ch, _name in jobs:
        by_ch[ch] = by_ch.get(ch, 0) + 1
    scope = "全部" if args.all else f"{args.scenario} {args.chapter}"
    print(f"范围 {scope}:{len(jobs)} 条,分布 {dict(sorted(by_ch.items()))}")
    print(f"  片段名样例: {', '.join(n for _, _, n in jobs[:6])}")

    if args.list:
        return 0

    # 转码前先对账:JSON 里这一章的段/选项数,应当与切片数吻合。
    # 对不上说明命名约定变了,得先修映射再转,别转出一堆没人引用的文件。
    if not args.all:
        data = json.loads((DATA / f"{args.scenario}.json").read_text(encoding="utf-8"))
        ch = next((c for c in data["CHAPTERS"] if c["id"] == args.chapter), None)
        if ch is None:
            print(f"JSON 里没有章 {args.chapter}", file=sys.stderr)
            return 1
        want_intro = len(ch.get("intro") or [])
        want = want_intro + sum(len(e["segs"]) + len(e.get("options") or []) for e in ch["events"])
        if want != len(jobs):
            print(f"切片数与 JSON 对不上: 音频 {len(jobs)},JSON {want}(intro {want_intro})", file=sys.stderr)
            return 1
        print(f"  对账通过:JSON {want} = 音频 {len(jobs)}")

    ff = find_ffmpeg()
    if not ff:
        print("找不到 ffmpeg", file=sys.stderr)
        return 2

    total_in = total_out = 0
    written: dict[str, int] = {"webm": 0, "m4a": 0}
    for src, ch, name in jobs:
        key = src.name.split("_")[0]
        dst_dir = OUT / key / ch
        dst_dir.mkdir(parents=True, exist_ok=True)
        in_kb = src.stat().st_size / 1024
        total_in += in_kb
        for ext, codec, br in (("webm", "libopus", args.opus), ("m4a", "aac", args.aac)):
            dst = dst_dir / f"{name}.{ext}"
            cmd = [ff, "-hide_banner", "-loglevel", "error", "-y", "-i", str(src),
                   "-c:a", codec, "-b:a", br, "-ac", "1", "-vn", str(dst)]
            if not args.dry_run:
                r = subprocess.run(cmd, capture_output=True, text=True)
                if r.returncode != 0 or not dst.is_file() or dst.stat().st_size < 256:
                    print(f"  转码失败 {src.name} -> {ext}:\n{r.stderr}", file=sys.stderr)
                    return 1
            if dst.is_file():
                written[ext] += dst.stat().st_size
        print(f"  {ch}/{name:<12} {in_kb:6.0f} KB")

    print(f"\n{len(jobs)} 条 × 2 格式")
    if not args.dry_run:
        # 按格式分别报,不要把两种格式加起来跟源比 —— 那必然显示"变大了",
        # 而运行时只会下载其中一种。真实成本是单格式那一行。
        print(f"源 vorbis   {total_in/1024:6.2f} MB  单条均 {total_in/len(jobs):5.0f} KB")
        for ext, label in (("webm", "opus"), ("m4a", "aac")):
            # written 是字节,total_in 是 KB —— 分母要补 *1024,否则百分比会大 1000 倍
            print(f"{label:<10} {written[ext]/1024/1024:6.2f} MB  单条均 {written[ext]/len(jobs)/1024:5.0f} KB"
                  f"  (源的 {written[ext]/(total_in*1024)*100:.0f}%)")
        print("→ 运行时只下载其中一种格式")
    return 0


if __name__ == "__main__":
    sys.exit(main())
