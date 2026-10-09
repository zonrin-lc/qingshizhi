#!/bin/bash
# devlog day7 配图生成(风格对齐 day6:深底、金题、白文、色条卡片)
set -e
cd /workspace
FR=/home/Maker/fonts/NotoSansSC-Regular.ttf
FB=/home/Maker/fonts/NotoSansSC-Bold.otf
BK='#141210'; GOLD='#d9a441'; TXT='#e8dcc8'; DIM='#9a8f7d'
GRN='#6aa84f'; RED='#c0504d'; BLU='#5b9bd5'; BRN='#b08a55'; LINE='#3a332a'
W=1280; H=800

# ---------- 图1: 对拍网收口(100/100) ----------
convert -size ${W}x${H} xc:${BK} \
  -font ${FB} -pointsize 44 -fill ${GOLD} -annotate +60+86 '对拍网收口:100 局逐位一致' \
  -font ${FR} -pointsize 25 -fill ${TXT} -annotate +60+132 '1556 行 JS → 1622 行 Lua,终局快照按 float64 位模式比对——不判"看起来对",只判"每一位都对"' \
  -draw "stroke ${LINE} stroke-width 2 line 60,162 1220,162" \
  \
  -font ${FB} -pointsize 30 -fill ${TXT} -annotate +60+222 '首次运行' \
  -font ${FR} -pointsize 24 -fill ${DIM} -annotate +60+262 '5 剧本 × 3 难度 × 20 局' \
  -draw "fill #2a2620 rectangle 620,196 1180,232" -draw "fill ${GRN} rectangle 620,196 1034,232" -draw "fill ${RED} rectangle 1034,196 1180,232" \
  -font ${FB} -pointsize 26 -fill ${BK} -annotate +1038+228 '26 挂' \
  -font ${FB} -pointsize 26 -fill ${BK} -annotate +830+228 '74 过' \
  \
  -font ${FB} -pointsize 30 -fill ${TXT} -annotate +60+330 '修一处 nil 守卫后' \
  -font ${FR} -pointsize 24 -fill ${DIM} -annotate +60+370 'JS undefined>0 为 false;Lua nil>0 直接报错' \
  -draw "fill #2a2620 rectangle 620,304 1180,340" -draw "fill ${GRN} rectangle 620,304 1180,340" \
  -font ${FB} -pointsize 26 -fill ${BK} -annotate +880+336 '100/100 全绿' \
  \
  -draw "stroke ${LINE} stroke-width 2 line 60,400 1220,400" \
  -font ${FB} -pointsize 28 -fill ${GOLD} -annotate +60+455 '同一无知,剥了五层皮' \
  -font ${FR} -pointsize 23 -fill ${TXT} -annotate +60+500 '① a and b() 不能作 Lua 语句(JS && 直译死穴)' \
  -font ${FR} -pointsize 23 -fill ${TXT} -annotate +60+538 '② hex 转换器把 2 字符段当 6 字符读' \
  -font ${FR} -pointsize 23 -fill ${TXT} -annotate +60+576 '③ Yoga alignItems 默认 flex-start,非 CSS 的 stretch' \
  -font ${FR} -pointsize 23 -fill ${GOLD} -annotate +60+614 '④ Yoga flexShrink 默认 0 —— 无界宽中文段不收缩不换行,溢出被裁(真凶)' \
  -font ${FR} -pointsize 23 -fill ${RED} -annotate +60+652 '⑤ 埋了诊断却忘了跑 build —— 测的一直是旧包(纪律问题,非技术)' \
  \
  -draw "stroke ${LINE} stroke-width 2 line 60,690 1220,690" \
  -font ${FR} -pointsize 24 -fill ${TXT} -annotate +60+738 '终解:换掉整条渲染路径——正文改 RichText 单控件(库级换行 + 首帧自撑高),词条升级为可点 link' \
  -font ${FR} -pointsize 20 -fill ${DIM} -annotate +60+776 '聚光灯GameJam · 涌现主题 · DAY7' \
  assets/images/devlog/day7-parity.png

# ---------- 图2: 布局三次改版 ----------
convert -size ${W}x${H} xc:${BK} \
  -font ${FB} -pointsize 44 -fill ${GOLD} -annotate +60+86 '布局三次改版:从仪表盘到史书' \
  -font ${FR} -pointsize 25 -fill ${TXT} -annotate +60+132 '三次都不是我想通的,是玩家指出的——方向比实现更难,所以更该记下被否的过程' \
  -draw "stroke ${LINE} stroke-width 2 line 60,162 1220,162" \
  \
  -draw "fill ${DIM} rectangle 60,200 72,300" \
  -font ${FB} -pointsize 28 -fill ${TXT} -annotate +96+240 'V1 · 左右双栏' \
  -font ${FR} -pointsize 23 -fill ${DIM} -annotate +96+282 '左叙事 / 右操作' \
  -font ${FR} -pointsize 23 -fill ${RED} -annotate +96+318 '否决:"不喜欢" —— 那是仪表盘气质,不是手机 App' \
  \
  -draw "fill ${BLU} rectangle 60,340 72,440" \
  -font ${FB} -pointsize 28 -fill ${TXT} -annotate +96+380 'V2 · 单栏' \
  -font ${FR} -pointsize 23 -fill ${DIM} -annotate +96+422 '状态条 → 叙事 → 底部决策(一屏只处理一件事)' \
  -font ${FR} -pointsize 23 -fill ${TXT} -annotate +96+458 '方向对了:一屏只处理一件事' \
  \
  -draw "fill ${GOLD} rectangle 60,480 72,600" \
  -font ${FB} -pointsize 28 -fill ${TXT} -annotate +96+520 'V3 · 66/34' \
  -font ${FR} -pointsize 23 -fill ${DIM} -annotate +96+562 '左 66% 叙事 | 右 34% 属性+立绘' \
  -font ${FR} -pointsize 23 -fill ${TXT} -annotate +96+598 '五维自身→雷达图;其余属性→横条;人物立绘作背景' \
  -font ${FR} -pointsize 23 -fill ${GOLD} -annotate +96+634 '右栏不是没地方放的仪表,是叙事的一部分——你读着李斯,右边站着李斯' \
  \
  -draw "stroke ${LINE} stroke-width 2 line 60,670 1220,670" \
  -font ${FR} -pointsize 24 -fill ${TXT} -annotate +60+715 '字体子集化:霞鹜文楷 24MB → 1.39MB(扫全剧本 2976 码点,核心中文零缺字)' \
  -font ${FR} -pointsize 24 -fill ${TXT} -annotate +60+753 '立绘:按出场频次取头部 13 人,统一水墨写意;无图者优雅退回纸底' \
  -font ${FR} -pointsize 20 -fill ${DIM} -annotate +60+782 '聚光灯GameJam · 涌现主题 · DAY7' \
  assets/images/devlog/day7-layout.png

identify assets/images/devlog/day7-parity.png assets/images/devlog/day7-layout.png
