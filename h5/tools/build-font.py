# -*- coding: utf-8 -*-
"""重建霞鹜文楷子集字体(public/fonts/qingshi-kai.ttf)。

背景:2026-10-14 的内嵌子集(2976 码位)是按当时文本快照切的,之后剧本/界面
文字增长,缺了 196 个字(梅、超、谜、②、〔〕等),缺的字会静默回退到系统
楷体,肉眼可见字体不统一。此脚本把子集口径改成「当前全部文本 + GB2312 一级
字表(3755 常用字)+ GB2312 符号区 + ASCII」,给未来文本留足余量。

用法:
    python tools/build-font.py [完整字体路径]

完整字体(约 25 MB)不进仓库,默认从 .tmp/LXGWWenKai-Regular.ttf 读;
缺了就去官方 release 下载(OFL 协议,可自由内嵌):
    https://github.com/lxgw/LxgwWenKai/releases/latest → LXGWWenKai-Regular.ttf

文本来源变更(剧本/界面文案增加)后重跑一次即可;check-font.py 是只读校验,
挂在 npm run verify:font / prebuild 上,防止子集再次悄悄过期。
"""
import glob
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_SRC = os.path.join(ROOT, '.tmp', 'LXGWWenKai-Regular.ttf')
OUT = os.path.join(ROOT, 'public', 'fonts', 'qingshi-kai.ttf')
DOWNLOAD_HINT = 'https://github.com/lxgw/LxgwWenKai/releases/latest (LXGWWenKai-Regular.ttf)'


def collect_text_chars():
    """当前游戏会渲染的全部字符:剧本全文 + 界面/样式源码 + 轻量表。"""
    chars = set()
    files = glob.glob(os.path.join(ROOT, '..', 'prot', 'lua-data', '*.json'))
    files += glob.glob(os.path.join(ROOT, 'src', '**', '*.ts'), recursive=True)
    files.append(os.path.join(ROOT, 'src', 'data', 'scenario-meta.json'))
    for p in files:
        with open(p, encoding='utf-8') as f:
            chars.update(f.read())
    return chars, len(files)


def gb2312_chars():
    """GB2312 符号区(0xA1-0xAF 高字节)+ 一级字表(0xB0-0xD7,3755 常用字)。

    二级字表(罕用字)不常驻:真用到时必然已出现在剧本文本里,由
    collect_text_chars() 兜底覆盖。
    """
    chars = set()
    for hi in list(range(0xA1, 0xB0)) + list(range(0xB0, 0xD8)):
        for lo in range(0xA1, 0xFF):
            try:
                chars.add(bytes([hi, lo]).decode('gb2312'))
            except UnicodeDecodeError:
                pass
    return chars


def build_charset():
    chars, nfiles = collect_text_chars()
    chars.update(gb2312_chars())
    chars.update(chr(c) for c in range(0x20, 0x7F))  # ASCII 可打印
    # 控制字符/空白不入子集
    return {c for c in chars if ord(c) >= 0x20 and not c.isspace()}, nfiles


def main():
    # Bash 工具按 UTF-8 读输出;直接以 UTF-8 写,特殊符号不炸、不乱码
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    src = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_SRC
    if not os.path.exists(src):
        print(f'找不到完整字体: {src}\n请下载: {DOWNLOAD_HINT}', file=sys.stderr)
        return 1
    try:
        from fontTools import subset
    except ImportError:
        print('需要 fontTools: pip install fontTools', file=sys.stderr)
        return 1

    chars, nfiles = build_charset()
    print(f'字符集: {len(chars)} 码位(文本源 {nfiles} 个文件 + GB2312 一级字表/符号 + ASCII)')

    opts = subset.Options()
    opts.name_IDs = ['*']       # 保留字体名等元数据
    opts.layout_features = ['*']
    opts.hinting = False        # Web 渲染不依赖 TT 指令,省下体积
    opts.notdef_outline = True
    opts.recalc_timestamp = False

    font = subset.load_font(src, opts)
    ss = subset.Subsetter(opts)
    ss.populate(text=''.join(chars))
    ss.subset(font)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    font.save(OUT)

    # 自检:输出必须 100% 覆盖当前文本
    from fontTools.ttLib import TTFont
    cmap = TTFont(OUT).getBestCmap()
    text_chars, _ = collect_text_chars()
    missing = sorted(c for c in text_chars if ord(c) >= 0x20 and not c.isspace() and ord(c) not in cmap)
    size = os.path.getsize(OUT)
    print(f'输出: {OUT} ({size / 1024 / 1024:.2f} MB, {len(cmap)} 码位)')
    if missing:
        print(f'⚠ 仍有 {len(missing)} 个文本字符未被覆盖(完整字体本身缺这些字,多为 emoji):')
        print('  ' + ' '.join(f'U+{ord(c):04X}({c})' for c in missing))
    else:
        print('覆盖自检: 当前全部文本 0 缺字')
    return 0


if __name__ == '__main__':
    sys.exit(main())
