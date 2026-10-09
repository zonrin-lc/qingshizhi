#!/bin/bash
# devlog day8 配图生成(风格对齐 day6/day7:深底、金题、白文、色条卡片)
set -e
cd /workspace
FR=/home/Maker/fonts/NotoSansSC-Regular.ttf
FB=/home/Maker/fonts/NotoSansSC-Bold.otf
BK='#141210'; GOLD='#d9a441'; TXT='#e8dcc8'; DIM='#9a8f7d'
GRN='#6aa84f'; RED='#c0504d'; BLU='#5b9bd5'; BRN='#b08a55'; LINE='#3a332a'
W=1280; H=800
OUT=assets/images/devlog

# ---------- 图1: 七个不崩的 bug ----------
convert -size ${W}x${H} xc:${BK} \
  -font ${FB} -pointsize 44 -fill ${GOLD} -annotate +60+86 '七个不崩的 bug' \
  -font ${FR} -pointsize 25 -fill ${TXT} -annotate +60+132 '构建全绿、日志干净、游戏起得来——只是某条线不见了、某段字没出来、某个角露出去了' \
  -draw "stroke ${LINE} stroke-width 2 line 60,162 1220,162" \
  \
  -font ${FB} -pointsize 26 -fill ${TXT} -annotate +60+215 '① 小标题文字整段消失' \
  -font ${FR} -pointsize 22 -fill ${DIM} -annotate +60+250 'lbl 未传 wrap=false → normal 在宽度不定时折进 0 宽' \
  -font ${FB} -pointsize 26 -fill ${TXT} -annotate +60+310 '② 两条金线整根不见' \
  -font ${FR} -pointsize 22 -fill ${DIM} -annotate +60+345 'width=100% 遇内容自适应父级 → 解析成 auto → 分不到宽度' \
  -font ${FB} -pointsize 26 -fill ${TXT} -annotate +60+405 '③ 立绘从抹角处露出' \
  -font ${FR} -pointsize 22 -fill ${DIM} -annotate +60+440 'overflow 裁剪走 nvgIntersectScissor,只能裁矩形' \
  -font ${FB} -pointsize 26 -fill ${TXT} -annotate +60+500 '④ 罗盘中心一块半透明方块' \
  -font ${FR} -pointsize 22 -fill ${DIM} -annotate +60+535 '同因:矩形裁剪裁不了圆形' \
  \
  -draw "stroke ${LINE} stroke-width 2 line 700,190 700,600" \
  \
  -font ${FB} -pointsize 26 -fill ${TXT} -annotate +740+215 '⑤ 匾额局名溢出(4 字比匾额还高)' \
  -font ${FR} -pointsize 22 -fill ${DIM} -annotate +740+250 '字号按卡高定,没按字数自适应' \
  -font ${FB} -pointsize 26 -fill ${TXT} -annotate +740+310 '⑥ 顶栏整体偏下' \
  -font ${FR} -pointsize 22 -fill ${DIM} -annotate +740+345 '顶部留白按 vw×3%,横屏折算成 5.3% 屏高' \
  -font ${FB} -pointsize 26 -fill ${TXT} -annotate +740+405 '⑦ 胶囊悬停边框外有东西' \
  -font ${FR} -pointsize 22 -fill ${DIM} -annotate +740+440 '尖头形制 vs 圆角阴影:弧总比角宽' \
  \
  -draw "stroke ${LINE} stroke-width 2 line 60,600 1220,600" \
  -font ${FB} -pointsize 30 -fill ${GOLD} -annotate +60+665 '七个里六个,根因是同一个无知' \
  -font ${FR} -pointsize 24 -fill ${TXT} -annotate +60+715 '① 横屏:左右边距按屏宽算,上下边距按屏高算' \
  -font ${FR} -pointsize 24 -fill ${TXT} -annotate +60+752 '② 百分比宽度只在父级宽度确定时有效' \
  ${OUT}/day8-invisible.png

# ---------- 图2: 罗盘四版 ----------
convert -size ${W}x${H} xc:${BK} \
  -font ${FB} -pointsize 44 -fill ${GOLD} -annotate +60+86 '一只罗盘,转了四遍' \
  -font ${FR} -pointsize 25 -fill ${TXT} -annotate +60+132 '四遍都不是我想通的,是你指出来的——和 DAY 7 布局三次改版一样' \
  -draw "stroke ${LINE} stroke-width 2 line 60,162 1220,162" \
  \
  -font ${FB} -pointsize 28 -fill ${TXT} -annotate +60+222 '一' \
  -font ${FR} -pointsize 24 -fill ${TXT} -annotate +130+222 '点中朝代,自动转到正上方' \
  -font ${FR} -pointsize 23 -fill ${RED} -annotate +900+222 '✕ 像下拉菜单' \
  -font ${FB} -pointsize 28 -fill ${TXT} -annotate +60+292 '二' \
  -font ${FR} -pointsize 24 -fill ${TXT} -annotate +130+292 '拖拽跟手转,松手吸附最近一格' \
  -font ${FR} -pointsize 23 -fill ${RED} -annotate +900+292 '✕ 停不稳' \
  -font ${FB} -pointsize 28 -fill ${TXT} -annotate +60+362 '三' \
  -font ${FR} -pointsize 24 -fill ${TXT} -annotate +130+362 '拨盘弹簧 + 底板整体旋转' \
  -font ${FR} -pointsize 23 -fill ${RED} -annotate +900+362 '✕ 指针菱饰不跟着转' \
  -font ${FB} -pointsize 28 -fill ${GOLD} -annotate +60+432 '四' \
  -font ${FR} -pointsize 24 -fill ${TXT} -annotate +130+432 '两段:①底板先转,指针指认 ②再整体归位' \
  -font ${FR} -pointsize 23 -fill ${GRN} -annotate +900+432 '✓ 就是它' \
  \
  -draw "stroke ${LINE} stroke-width 2 line 60,490 1220,490" \
  -font ${FB} -pointsize 28 -fill ${GOLD} -annotate +60+548 '拆成两个角度,省掉一整类状态同步 bug' \
  -font ${FR} -pointsize 23 -fill ${TXT} -annotate +60+598 'base_     盘面旋转量(指针烘焙在底板顶部 → 指针角 = TOP + base_)' \
  -font ${FR} -pointsize 23 -fill ${TXT} -annotate +60+636 'nameOff_   朝代名基准角(第 i 项名在 nameOff_ + (i-1)·step)' \
  -font ${FR} -pointsize 23 -fill ${BRN} -annotate +60+690 '归位时两个一起转回 → 相对角不变 → 指针全程锁在选中名上' \
  \
  -draw "stroke ${LINE} stroke-width 2 line 60,720 1220,720" \
  -font ${FR} -pointsize 22 -fill ${DIM} -annotate +60+760 '顺带抓到既有 bug:指针事件是控件局部坐标,原判定却减绝对中心 → 点环上方位算错' \
  ${OUT}/day8-compass.png

echo "已生成:"
ls -la ${OUT}/day8-*.png
