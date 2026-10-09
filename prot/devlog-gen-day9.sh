#!/bin/bash
# devlog day9 配图生成(风格对齐 day6-8:深底、金题、白文、色条卡片)
set -e
cd /workspace
FR=/home/Maker/fonts/NotoSansSC-Regular.ttf
FB=/home/Maker/fonts/NotoSansSC-Bold.otf
BK='#141210'; GOLD='#d9a441'; TXT='#e8dcc8'; DIM='#9a8f7d'
GRN='#6aa84f'; RED='#c0504d'; BLU='#5b9bd5'; BRN='#b08a55'; LINE='#3a332a'
W=1280; H=800
OUT=assets/images/devlog

# ---------- 图1: 三道闸 ----------
convert -size ${W}x${H} xc:${BK} \
  -font ${FB} -pointsize 44 -fill ${GOLD} -annotate +60+86 '一次崩溃,逼出第三道闸' \
  -font ${FR} -pointsize 25 -fill ${TXT} -annotate +60+132 '删了 local 声明、留了引用 —— 语法合法、API 检查放行、构建全绿,只有真机才炸' \
  -draw "stroke ${LINE} stroke-width 2 line 60,162 1220,162" \
  \
  -font ${FB} -pointsize 27 -fill ${TXT} -annotate +60+222 '崩在哪' \
  -font ${FR} -pointsize 23 -fill ${DIM} -annotate +60+262 'qingshi/ui/game:150  renderSide' \
  -font ${FR} -pointsize 23 -fill ${RED} -annotate +60+300 'attempt to index a nil value (global 'side')' \
  -font ${FR} -pointsize 22 -fill ${TXT} -annotate +60+345 'local side = env.sideCol  ← 重构时删了' \
  -font ${FR} -pointsize 22 -fill ${TXT} -annotate +60+380 'side:AddChild(panel)      ← 末尾没删' \
  \
  -draw "stroke ${LINE} stroke-width 2 line 700,190 700,600" \
  \
  -font ${FB} -pointsize 27 -fill ${TXT} -annotate +740+222 '三道闸,为什么全放行' \
  -font ${FR} -pointsize 22 -fill ${DIM} -annotate +740+262 '语法检查   ✕  side:AddChild() 语法完全合法' \
  -font ${FR} -pointsize 22 -fill ${DIM} -annotate +740+300 'API 检查   ✕  只查 T.* 符号存在性' \
  -font ${FR} -pointsize 22 -fill ${DIM} -annotate +740+338 '构建       ✕  也只做语法检查' \
  -font ${FR} -pointsize 22 -fill ${BRN} -annotate +740+392 '→ 静态检查天然抓不到「删一半」' \
  \
  -draw "stroke ${LINE} stroke-width 2 line 60,600 1220,600" \
  -font ${FB} -pointsize 30 -fill ${GOLD} -annotate +60+660 '新增:裸全局名检查' \
  -font ${FR} -pointsize 23 -fill ${TXT} -annotate +60+706 '引擎全局名从 .emmylua 自动派生(1784 个,自维护,永不过期)' \
  -font ${FR} -pointsize 23 -fill ${TXT} -annotate +60+744 '只抓「当表用」:side:AddChild() 报;x = side 不报' \
  ${OUT}/day9-gates.png

# ---------- 图2: 规范 vs 原型图 ----------
convert -size ${W}x${H} xc:${BK} \
  -font ${FB} -pointsize 44 -fill ${GOLD} -annotate +60+86 '规范管几何,材质给温度' \
  -font ${FR} -pointsize 25 -fill ${TXT} -annotate +60+132 '把 prompt 写成规格说明书,AI 就画出一张规格图 —— 边距全对,整张是平的' \
  -draw "stroke ${LINE} stroke-width 2 line 60,162 1220,162" \
  \
  -font ${FB} -pointsize 27 -fill ${RED} -annotate +60+222 '第一版:像原型图' \
  -font ${FR} -pointsize 22 -fill ${DIM} -annotate +60+262 '只约束了几何:边距 / 圆角 / 对齐' \
  -font ${FR} -pointsize 22 -fill ${DIM} -annotate +60+298 '没约束材质:纸纹 / 墨晕 / 木色' \
  -font ${FR} -pointsize 22 -fill ${BRN} -annotate +60+340 '→ 「对齐」成了唯一目标,网格纪律变成扁平化' \
  \
  -font ${FB} -pointsize 27 -fill ${GRN} -annotate +60+412 '第二版:加回材质层' \
  -font ${FR} -pointsize 22 -fill ${TXT} -annotate +60+452 '宣纸纤维纹理 + 米色晕染(不是纯色块)' \
  -font ${FR} -pointsize 22 -fill ${TXT} -annotate +60+488 '卷轴形制:木轴头 + 双线金框 + 云纹角饰' \
  -font ${FR} -pointsize 22 -fill ${TXT} -annotate +60+524 '立绘淡墨写意收边(没有硬边方框)' \
  -font ${FR} -pointsize 22 -fill ${TXT} -annotate +60+560 '标题用行楷 + 朱红起首印' \
  -font ${FR} -pointsize 22 -fill ${TXT} -annotate +60+596 '分隔线 = 金线 + 中央嵌菱饰(不是裸线)' \
  \
  -draw "stroke ${LINE} stroke-width 2 line 700,190 700,640" \
  \
  -font ${FB} -pointsize 27 -fill ${GOLD} -annotate +740+222 '统一版式规范(1080p)' \
  -font ${FR} -pointsize 22 -fill ${TXT} -annotate +740+266 '外边距      48px(四周一致)' \
  -font ${FR} -pointsize 22 -fill ${TXT} -annotate +740+302 '左右栏      1224 / 576,间距 24px' \
  -font ${FR} -pointsize 22 -fill ${TXT} -annotate +740+338 '区块内边距  24px' \
  -font ${FR} -pointsize 22 -fill ${TXT} -annotate +740+374 '圆角        8px(统一)' \
  -font ${FR} -pointsize 22 -fill ${TXT} -annotate +740+410 '线条        1px 细金线 #c6b492' \
  -font ${FR} -pointsize 22 -fill ${TXT} -annotate +740+446 '图标        24x24 / 2px 线宽 / 无填充' \
  -font ${FR} -pointsize 22 -fill ${BRN} -annotate +740+500 '不是新造的 —— theme.lua 里本就有' \
  -font ${FR} -pointsize 22 -fill ${BRN} -annotate +740+536 'Theme.SP / R / FS / COLOR 四组 token' \
  \
  -draw "stroke ${LINE} stroke-width 2 line 60,660 1220,660" \
  -font ${FB} -pointsize 28 -fill ${GOLD} -annotate +60+716 '十个页面,同一张脸' \
  -font ${FR} -pointsize 22 -fill ${TXT} -annotate +60+760 '主菜单 / 选择页 / 对局页 / 回合页 / 存档 / 设置 / 章末结算 / 结局 / 结算浮层 / 确认弹窗' \
  ${OUT}/day9-spec.png

echo "已生成:"
ls -la ${OUT}/day9-*.png
