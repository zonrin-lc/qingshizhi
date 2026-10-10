#!/bin/bash
# devlog day10 配图生成(风格对齐 day6-9:深底、金题、白文、色条卡片)
set -e
cd /workspace
FR=/home/Maker/fonts/NotoSansSC-Regular.ttf
FB=/home/Maker/fonts/NotoSansSC-Bold.otf
BK='#141210'; GOLD='#d9a441'; TXT='#e8dcc8'; DIM='#9a8f7d'
GRN='#6aa84f'; RED='#c0504d'; BLU='#5b9bd5'; BRN='#b08a55'; LINE='#3a332a'
W=1280; H=800
OUT=assets/images/devlog

# ---------- 图1: 八次推翻 ----------
convert -size ${W}x${H} xc:${BK} \
  -font ${FB} -pointsize 44 -fill ${GOLD} -annotate +60+86 '一个标志,八次推翻' \
  -font ${FR} -pointsize 25 -fill ${TXT} -annotate +60+132 '八次里七次是同一个毛病:在「加法」里找答案,而正确的路一直是「减法」' \
  -draw "stroke ${LINE} stroke-width 2 line 60,162 1220,162" \
  \
  -font ${FB} -pointsize 25 -fill ${RED} -annotate +60+212 '第一轮 · 三个字标' \
  -font ${FR} -pointsize 21 -fill ${DIM} -annotate +60+248 'A 纯书法+朱印  B 书法+朱红横线  C 卷轴包字' \
  -font ${FR} -pointsize 21 -fill ${BRN} -annotate +60+282 '→ 都是「字」不是「标」;缩小后笔锋糊成一团' \
  \
  -font ${FB} -pointsize 25 -fill ${RED} -annotate +60+336 '第二轮 · 图形图标 + 文字' \
  -font ${FR} -pointsize 21 -fill ${DIM} -annotate +60+372 '卷轴/竹简 · 史笔+书卷 · 朱印+「史」字' \
  -font ${FR} -pointsize 21 -fill ${BRN} -annotate +60+406 '→ 准确,但没有气质;像「这里有一本书」' \
  \
  -font ${FB} -pointsize 25 -fill ${GRN} -annotate +60+460 '第三轮 · 你给了方向' \
  -font ${FR} -pointsize 21 -fill ${TXT} -annotate +60+496 '人物剪影 + 朱红日轮 + 一笔环形金墨,不含文字' \
  -font ${FR} -pointsize 21 -fill ${GRN} -annotate +60+530 '→ 一次成型:方向本身已包含「什么该留、什么该舍」' \
  \
  -draw "stroke ${LINE} stroke-width 2 line 700,190 700,560" \
  \
  -font ${FB} -pointsize 25 -fill ${TXT} -annotate +740+212 '第四轮 · 专业细化(七处诊断)' \
  -font ${FR} -pointsize 21 -fill ${DIM} -annotate +740+248 '① 两轴头形制不一致(一开一合)' \
  -font ${FR} -pointsize 21 -fill ${DIM} -annotate +740+282 '② 轴头亮金镜面,像黄铜管' \
  -font ${FR} -pointsize 21 -fill ${DIM} -annotate +740+316 '③ 轴心纯黑洞,无层次' \
  -font ${FR} -pointsize 21 -fill ${DIM} -annotate +740+350 '④ 纸面浮雕云纹,像印刷纹理' \
  -font ${FR} -pointsize 21 -fill ${DIM} -annotate +740+384 '⑤ 纸面描边叠了 3-4 层' \
  -font ${FR} -pointsize 21 -fill ${RED} -annotate +740+418 '⑥ 卷尾黑钩 + 衣服穿出纸面' \
  -font ${FR} -pointsize 21 -fill ${DIM} -annotate +740+452 '⑦ 散落红色噪点' \
  -font ${FR} -pointsize 21 -fill ${BRN} -annotate +740+500 '→ 改完六项好了,第⑥项反而更糟' \
  -font ${FR} -pointsize 21 -fill ${BRN} -annotate +740+534 '(AI 不懂三维前后关系)' \
  \
  -draw "stroke ${LINE} stroke-width 2 line 60,580 1220,580" \
  -font ${FB} -pointsize 30 -fill ${GOLD} -annotate +60+640 '最关键的一次判断:做减法' \
  -font ${FR} -pointsize 23 -fill ${TXT} -annotate +60+686 '「卷轴不需要画出来,只需要暗示」—— 具象卷轴整个删掉,换成一道金墨弧线' \
  -font ${FR} -pointsize 22 -fill ${GRN} -annotate +60+726 '空间关系不可能错 / 不抢视觉重心 / 缩放安全' \
  -font ${FR} -pointsize 22 -fill ${GOLD} -annotate +60+764 '一笔胜过一堆细节 —— 这也是水墨本身的道理' \
  ${OUT}/day10-iterations.png

# ---------- 图2: 加减法 ----------
convert -size ${W}x${H} xc:${BK} \
  -font ${FB} -pointsize 44 -fill ${GOLD} -annotate +60+86 '每一次减法,都比加法好' \
  -font ${FR} -pointsize 25 -fill ${TXT} -annotate +60+132 '从「一个有细节的卷轴」减到「两样东西」,标志反而立住了' \
  -draw "stroke ${LINE} stroke-width 2 line 60,162 1220,162" \
  \
  -font ${FB} -pointsize 27 -fill ${TXT} -annotate +60+222 '减法轨迹' \
  -font ${FR} -pointsize 23 -fill ${DIM} -annotate +60+268 '具象卷轴(轴头/纸卷/金边/穿插尾)' \
  -font ${FR} -pointsize 23 -fill ${BRN} -annotate +60+310 '↓  删掉全部具象细节' \
  -font ${FR} -pointsize 23 -fill ${DIM} -annotate +60+352 '一道金墨弧线' \
  -font ${FR} -pointsize 23 -fill ${BRN} -annotate +60+394 '↓  再去掉弧线' \
  -font ${FR} -pointsize 23 -fill ${TXT} -annotate +60+436 '朱红日轮 + 墨黑人物剪影' \
  -font ${FR} -pointsize 22 -fill ${GRN} -annotate +60+486 '→ 视觉重心回到人物;缩小后仍认得出' \
  \
  -font ${FB} -pointsize 27 -fill ${TXT} -annotate +60+560 '两处我看不出来的问题' \
  -font ${FR} -pointsize 22 -fill ${DIM} -annotate +60+604 '发带:甩出 5-6 条直到画面边缘,重心被拉跑' \
  -font ${FR} -pointsize 22 -fill ${GRN} -annotate +60+642 '→ 收到 2 条,长度缩到左侧 1/3 处' \
  -font ${FR} -pointsize 22 -fill ${DIM} -annotate +60+692 '横纹:左侧水平、右侧向右下倾斜,左右对不上' \
  -font ${FR} -pointsize 22 -fill ${GRN} -annotate +60+730 '→ 严格水平,左右连成同一条' \
  \
  -draw "stroke ${LINE} stroke-width 2 line 700,190 700,760" \
  \
  -font ${FB} -pointsize 27 -fill ${GOLD} -annotate +740+222 '水墨化的代价' \
  -font ${FR} -pointsize 22 -fill ${TXT} -annotate +740+268 '朱砂晕染 / 墨分五色 / 飞白毛边 / 淡赭石' \
  -font ${FR} -pointsize 22 -fill ${RED} -annotate +740+320 '水墨的本质 = 边缘模糊' \
  -font ${FR} -pointsize 22 -fill ${RED} -annotate +740+358 '图标的本质 = 边缘清晰' \
  -font ${FR} -pointsize 22 -fill ${BRN} -annotate +740+410 '→ 分版使用:' \
  -font ${FR} -pointsize 22 -fill ${TXT} -annotate +740+448 '   大尺寸(256/512) 用水墨版' \
  -font ${FR} -pointsize 22 -fill ${TXT} -annotate +740+486 '   小图标(64/128) 用清晰版' \
  \
  -font ${FB} -pointsize 27 -fill ${GOLD} -annotate +740+570 '今天没改一行游戏代码' \
  -font ${FR} -pointsize 21 -fill ${TXT} -annotate +740+612 '产出全是视觉资产(标志)与交付物(源码包)' \
  -font ${FR} -pointsize 21 -fill ${DIM} -annotate +740+650 '玩法已冻结(100 局逐位对拍兜底)' \
  -font ${FR} -pointsize 21 -fill ${DIM} -annotate +740+688 '缺的是「看起来像不像成品」' \
  ${OUT}/day10-subtract.png

echo "已生成:"
ls -la ${OUT}/day10-*.png
