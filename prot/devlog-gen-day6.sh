#!/bin/bash
# devlog day6 配图生成(风格对齐 day1-sim:深底、金题、白文、色条卡片)
set -e
cd /workspace
FR=/home/Maker/fonts/NotoSansSC-Regular.ttf
FM=/home/Maker/fonts/NotoSansSC-Medium.otf
FB=/home/Maker/fonts/NotoSansSC-Bold.otf
BK='#141210'
GOLD='#d9a441'
TXT='#e8dcc8'
DIM='#9a8f7d'
GRN='#6aa84f'
RED='#c0504d'
BLU='#5b9bd5'
BRN='#b08a55'
LINE='#3a332a'

# ---------- 图1: 对拍网三层验收 ----------
W=1280; H=800
convert -size ${W}x${H} xc:${BK} \
  -font ${FB} -pointsize 44 -fill ${GOLD} -annotate +60+86 '对拍网:一条 bit 级的验收网' \
  -font ${FR} -pointsize 25 -fill ${TXT} -annotate +60+132 '载体反转后,怎么证明一条翻译没有骗人——三层验收,任何一条不一致都是 bug,不是"差不多"' \
  -draw "stroke ${LINE} stroke-width 2 line 60,162 1220,162" \
  \
  -draw "fill ${GRN} rectangle 60,205 72,320" \
  -font ${FB} -pointsize 30 -fill ${TXT} -annotate +96+248 '层1 · PRNG 逐位对拍' \
  -font ${FR} -pointsize 24 -fill ${DIM} -annotate +96+292 'mulberry32 → Lua 5.4,两条装载路径各 200 次取数,要求每一个比特相同' \
  -font ${FB} -pointsize 26 -fill ${GRN} -annotate +1010+265 'PASS 200/200' \
  \
  -draw "fill ${BLU} rectangle 60,350 72,465" \
  -font ${FB} -pointsize 30 -fill ${TXT} -annotate +96+393 '层2 · 剧本数据指纹' \
  -font ${FR} -pointsize 24 -fill ${DIM} -annotate +96+437 '五本 JSON → Lua 字面量,数字按 float64 位模式、字符串按码点数逐字段核' \
  -font ${FB} -pointsize 26 -fill ${BLU} -annotate +1010+410 'PASS 6/6' \
  \
  -draw "fill ${GOLD} rectangle 60,495 72,610" \
  -font ${FB} -pointsize 30 -fill ${TXT} -annotate +96+538 '层3 · 决策序列回放' \
  -font ${FR} -pointsize 24 -fill ${DIM} -annotate +96+582 '100 局 golden 录音,Lua 侧纯执行器按序回放,终局快照逐字段一致' \
  -font ${FB} -pointsize 26 -fill ${GOLD} -annotate +1010+555 'P2 进行中' \
  \
  -draw "stroke ${LINE} stroke-width 2 line 60,645 1220,645" \
  -font ${FR} -pointsize 24 -fill ${TXT} -annotate +60+690 '关键证据:JS 的 t = t + Math.imul(...) ^ t,优先级实为 (t+imul)^t——按书写顺序翻必挂,单步 trace 揪出后全绿。' \
  -font ${FR} -pointsize 24 -fill ${TXT} -annotate +60+730 '决策序列法使巨型偏好表无需翻译;同一机制兼作冻结期防平衡漂移的看门狗,一鱼两吃。' \
  -font ${FR} -pointsize 20 -fill ${DIM} -annotate +60+772 '聚光灯GameJam · 涌现主题 · DAY6' \
  assets/images/devlog/day6-parity.png

# ---------- 图2: 正式基线五本全绿 ----------
convert -size ${W}x${H} xc:${BK} \
  -font ${FB} -pointsize 44 -fill ${GOLD} -annotate +60+86 '五本正式基线:1000 局 × 100 种子' \
  -font ${FR} -pointsize 25 -fill ${TXT} -annotate +60+132 '冻结前最后一轮全量模拟——逆天线占比峰值是路线成立的判据,合计 650 万局,零错误' \
  -draw "stroke ${LINE} stroke-width 2 line 60,162 1220,162" \
  \
  -font ${FB} -pointsize 28 -fill ${TXT} -annotate +60+220 '李斯' \
  -draw "fill #2a2620 rectangle 200,196 1100,232" -draw "fill ${RED} rectangle 200,196 946,232" \
  -font ${FB} -pointsize 26 -fill ${TXT} -annotate +970+228 '83%' \
  -font ${FR} -pointsize 20 -fill ${DIM} -annotate +60+266 '三线分立成立' \
  \
  -font ${FB} -pointsize 28 -fill ${TXT} -annotate +60+320 '荆轲' \
  -draw "fill #2a2620 rectangle 200,296 1100,332" -draw "fill ${BRN} rectangle 200,296 818,332" \
  -font ${FB} -pointsize 26 -fill ${TXT} -annotate +842+328 '69%' \
  \
  -font ${FB} -pointsize 28 -fill ${TXT} -annotate +60+420 '韩信' \
  -draw "fill #2a2620 rectangle 200,396 1100,432" -draw "fill ${BRN} rectangle 200,396 818,432" \
  -font ${FB} -pointsize 26 -fill ${TXT} -annotate +842+428 '69%' \
  \
  -font ${FB} -pointsize 28 -fill ${TXT} -annotate +60+520 '项羽' \
  -draw "fill #2a2620 rectangle 200,496 1100,532" -draw "fill ${GRN} rectangle 200,496 1100,532" \
  -font ${FB} -pointsize 26 -fill ${BK} -annotate +970+528 '100%' \
  \
  -font ${FB} -pointsize 28 -fill ${TXT} -annotate +60+620 '陈胜' \
  -draw "fill #2a2620 rectangle 200,596 1100,632" -draw "fill ${BLU} rectangle 200,596 838,632" -draw "fill ${RED} rectangle 838,596 1081,632" \
  -font ${FB} -pointsize 26 -fill ${TXT} -annotate +1110+628 '71%+27%' \
  -font ${FR} -pointsize 20 -fill ${DIM} -annotate +200+668 '蓝=逆天线71%  红=27% 按设计死于 5-2 权势≥45 门槛线(唯一由死法定谱的剧本)' \
  \
  -draw "stroke ${LINE} stroke-width 2 line 60,700 1220,700" \
  -font ${FR} -pointsize 24 -fill ${TXT} -annotate +60+745 '边界扫描(±5 扰动)五本全 PASS | 删项审计中聚合键污染 1029pp 被识破——先修量尺再信读数(B56 记自己)' \
  -font ${FR} -pointsize 20 -fill ${DIM} -annotate +60+782 '聚光灯GameJam · 涌现主题 · DAY6' \
  assets/images/devlog/day6-baseline.png

identify assets/images/devlog/day6-parity.png assets/images/devlog/day6-baseline.png
