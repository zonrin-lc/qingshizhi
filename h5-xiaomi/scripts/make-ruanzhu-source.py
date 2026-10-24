# -*- coding: utf-8 -*-
"""生成软著源代码鉴别材料 docx：前30页 + 后30页，每页<=50行，页眉+页码。"""
import os, glob
from docx import Document
from docx.shared import Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.section import WD_SECTION

ROOT = r"D:\MUSI\QINGSHIZHI"
SW = "青史志互动叙事游戏软件"   # 软件全称
VER = "V1.0"                    # 软件版本号
OUT = os.path.join(ROOT, "docs", "软著-源代码鉴别材料.docx")

# 拼接顺序：引擎核心在前（前30页落于此），主会话逻辑 session.ts 在最后（后30页落于此）
engine = os.path.join(ROOT, "prot", "engine.js")
src_files = sorted(glob.glob(os.path.join(ROOT, "h5", "src", "**", "*.ts"), recursive=True))
src_files = [f for f in src_files if os.path.basename(f) != "session.ts" and "node_modules" not in f]
session = os.path.join(ROOT, "h5", "src", "game", "session.ts")
order = [engine] + src_files + [session]

chunks = []  # (filepath, lines)
for f in order:
    with open(f, "r", encoding="utf-8", errors="replace") as fh:
        ls = fh.read().split("\n")
    if ls and ls[-1] == "":
        ls.pop()
    chunks.append((f, ls))

# 计算每文件累计行号，用于截取前1500/后1500时的来源标注
total = sum(len(ls) for _, ls in chunks)
HEAD = 1500
TAIL = 1500
start = 0
end = total - TAIL

# 生成要写入的行列表，带"文件边界"标注
def build_range(a, b):
    out = []
    pos = 0
    for f, ls in chunks:
        n = len(ls)
        seg_a = max(a - pos, 0)
        seg_b = min(b - pos, n)
        if seg_a < seg_b:
            rel = os.path.relpath(f, ROOT)
            out.append(("// ===== 文件: " + rel + " (行 " + str(seg_a+1) + "-" + str(seg_b) + ") =====", None))
            for i in range(seg_a, seg_b):
                out.append((ls[i], i + 1))
        pos += n
    return out

lines_head = build_range(0, HEAD)
lines_tail = build_range(end, total)

PER_PAGE = 50
footer_pages = lambda seq: None

doc = Document()
sec = doc.sections[0]
sec.page_height = Pt(1169)   # A4
sec.page_width = Pt(826)
sec.top_margin = Pt(60); sec.bottom_margin = Pt(60)
sec.left_margin = Pt(70); sec.right_margin = Pt(70)

# 页眉：软件全称+版本号 右对齐
hdr = sec.header.paragraphs[0]
hdr.alignment = WD_ALIGN_PARAGRAPH.RIGHT
run = hdr.add_run(f"{SW}  {VER}")
run.font.size = Pt(9); run.font.name = "宋体"

# 页脚：页码居中
ftr = sec.footer.paragraphs[0]
ftr.alignment = WD_ALIGN_PARAGRAPH.CENTER
run = ftr.add_run()
run.font.size = Pt(9)
# 用 PAGE 域插入页码
from docx.oxml.ns import qn
from docx.oxml import OxmlElement
def add_field(paragraph, field):
    r = paragraph.add_run()
    fldBegin = OxmlElement('w:fldChar'); fldBegin.set(qn('w:fldCharType'), 'begin')
    instr = OxmlElement('w:instrText'); instr.set(qn('xml:space'), 'preserve'); instr.text = field
    fldSep = OxmlElement('w:fldChar'); fldSep.set(qn('w:fldCharType'), 'separate')
    t = OxmlElement('w:t'); t.text = "1"
    fldEnd = OxmlElement('w:fldChar'); fldEnd.set(qn('w:fldCharType'), 'end')
    r._r.append(fldBegin); r._r.append(instr); r._r.append(fldSep); r._r.append(t); r._r.append(fldEnd)
add_field(ftr, "PAGE")

style = doc.styles["Normal"]
style.font.name = "Consolas"
style.font.size = Pt(10.5)
# 中文字体映射
from docx.oxml import OxmlElement as _O
rpr = style.element.get_or_add_rPr(); rfonts = rpr.get_or_add_rFonts()
rfonts.set(qn('w:eastAsia'), "宋体")

def write_block(seq, marker):
    p = doc.add_paragraph()
    r = p.add_run(marker)
    r.font.bold = True; r.font.color.rgb = RGBColor(0x99, 0x33, 0x00)
    r.font.size = Pt(10.5)
    p.paragraph_format.space_after = Pt(4)
    cnt = 0
    for text, _ in seq:
        para = doc.add_paragraph()
        rr = para.add_run(text if text else " ")
        rr.font.name = "Consolas"; rr.font.size = Pt(10.5)
        para.paragraph_format.space_after = Pt(0)
        para.paragraph_format.line_spacing = 1.0
        cnt += 1
        if cnt % PER_PAGE == 0:
            doc.add_page_break()

write_block(lines_head, "// ===== 以下为源程序前 30 页（前 1500 行） =====")
write_block(lines_tail, "// ===== 以下为源程序后 30 页（末 1500 行） =====")

doc.save(OUT)
print("saved:", OUT)
print("total source lines:", total, "| head:", len(lines_head), "tail:", len(lines_tail))
