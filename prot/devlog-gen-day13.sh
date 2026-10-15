#!/bin/bash
# devlog day13 配图生成(风格对齐 day6-12:深底、金题、白文、色条卡片)
set -e
cd /workspace
FR=/home/Maker/fonts/NotoSansSC-Regular.ttf
FB=/home/Maker/fonts/NotoSansSC-Bold.otf
BK='#141210'; GOLD='#d9a441'; TXT='#e8dcc8'; DIM='#9a8f7d'
GRN='#6aa84f'; RED='#c0504d'; BLU='#5b9bd5'; BRN='#b08a55'; LINE='#3a332a'
W=1280; H=800
OUT=assets/images/devlog

# ---------- 图1: H5 一天六个页面 ----------
convert -size ${W}x${H} xc:${BK} \
  -font ${FB} -pointsize 44 -fill ${GOLD} -annotate +60+86 'H5 版:一天重建六个页面' \
  -font ${FR} -pointsize 25 -fill ${TXT} -annotate +60+132 '不是因为写得快 —— 是因为规则不在渲染层里' \
  -draw "stroke ${LINE} stroke-width 2 line 60,162 1220,162" \
  \
  -font ${FB} -pointsize 27 -fill ${TXT} -annotate +60+218 '规则原样复用' \
  -font ${FR} -pointsize 21 -fill ${DIM} -annotate +60+258 'vite.config.ts: alias @engine → prot/engine.js' \
  -font ${FR} -pointsize 21 -fill ${DIM} -annotate +60+290 '                 alias @data   → prot/lua-data' \
  -font ${FR} -pointsize 21 -fill ${GRN} -annotate +60+326 '不拷贝、不转译 —— prot 的测试继续守护同一份代码' \
  -font ${FR} -pointsize 21 -fill ${TXT} -annotate +60+362 '于是今天的活 = 纯「把状态渲染成 DOM」' \
  \
  -font ${FB} -pointsize 25 -fill ${GOLD} -annotate +60+428 '六个页面 + 罗盘' \
  -font ${FR} -pointsize 20 -fill ${TXT} -annotate +60+466 'menu 263 / select 286 / settings 115 / savepage 107' \
  -font ${FR} -pointsize 20 -fill ${TXT} -annotate +60+498 'cast 77 / wheel 299(罗盘)/ session 933(会话)' \
  -font ${FR} -pointsize 20 -fill ${DIM} -annotate +60+530 '样式 2,481 行(art/base/game/menu/save/select…)' \
  \
  -draw "stroke ${LINE} stroke-width 2 line 700,190 700,580" \
  \
  -font ${FB} -pointsize 27 -fill ${GOLD} -annotate +740+218 '罗盘:DOM 移植,手感照搬' \
  -font ${FR} -pointsize 20 -fill ${TXT} -annotate +740+256 '朝代名固定方位,不随盘转' \
  -font ${FR} -pointsize 20 -fill ${TXT} -annotate +740+288 '盘面旋转,指针指当前格' \
  -font ${FR} -pointsize 20 -fill ${TXT} -annotate +740+320 '拖拽跟手 → 惯性 → 欠阻尼弹簧吸附' \
  -font ${FR} -pointsize 20 -fill ${BRN} -annotate +740+356 '手感参数与 Lua 完全一致(DAY 8 调过四版)' \
  -font ${FR} -pointsize 20 -fill ${DIM} -annotate +740+392 '差异只在渲染:NanoVG → DOM + CSS transform' \
  -font ${FR} -pointsize 20 -fill ${DIM} -annotate +740+424 '每帧只写 transform,不重排布局' \
  \
  -font ${FB} -pointsize 23 -fill ${GOLD} -annotate +740+486 '七套浏览器验收(1,325 行)' \
  -font ${FR} -pointsize 20 -fill ${TXT} -annotate +740+524 'chain / viewports / backtrack / save' \
  -font ${FR} -pointsize 20 -fill ${TXT} -annotate +740+556 'audio / voice / reveal + scenarios(Node)' \
  \
  -draw "stroke ${LINE} stroke-width 2 line 60,600 1220,600" \
  -font ${FB} -pointsize 28 -fill ${GOLD} -annotate +60+660 '最值钱的一条' \
  -font ${FR} -pointsize 22 -fill ${TXT} -annotate +60+704 '换载体能一天做完,不是因为写得快,是因为规则不在渲染层里' \
  -font ${FR} -pointsize 22 -fill ${BRN} -annotate +60+744 '规则与渲染分离,决定了项目的迁移成本' \
  ${OUT}/day13-h5.png

# ---------- 图2: 资产管线 ----------
convert -size ${W}x${H} xc:${BK} \
  -font ${FB} -pointsize 44 -fill ${GOLD} -annotate +60+86 '资产:先瘦身,再上线' \
  -font ${FR} -pointsize 25 -fill ${TXT} -annotate +60+132 '美术给的原件不能直接上网页 —— 差了两个数量级' \
  -draw "stroke ${LINE} stroke-width 2 line 60,162 1220,162" \
  \
  -font ${FB} -pointsize 25 -fill ${TXT} -annotate +60+218 '三条管线,三个理由' \
  -font ${FR} -pointsize 21 -fill ${TXT} -annotate +60+258 '美术图  build-assets.py' \
  -font ${FR} -pointsize 20 -fill ${DIM} -annotate +80+290 '2848×1602 PNG,单张背景 6–8MB → WebP' \
  -font ${FR} -pointsize 20 -fill ${DIM} -annotate +80+320 '每张单独配质量(背景 72 / 卡片 84 / 标题 90)' \
  -font ${FR} -pointsize 21 -fill ${TXT} -annotate +60+360 'BGM     build-audio.py' \
  -font ${FR} -pointsize 20 -fill ${DIM} -annotate +80+392 '41.3MB → 每曲 ~1.4MB' \
  -font ${FR} -pointsize 21 -fill ${TXT} -annotate +60+432 '配音    build-voice.py' \
  -font ${FR} -pointsize 20 -fill ${DIM} -annotate +80+464 '249MB → 试点单章 2.5MB(先验证机制)' \
  \
  -font ${FB} -pointsize 23 -fill ${RED} -annotate +60+522 '先做试点,不一次转全量' \
  -font ${FR} -pointsize 20 -fill ${DIM} -annotate +60+558 '全量 opus 约 100MB,一轮出问题就得整体回退' \
  -font ${FR} -pointsize 20 -fill ${DIM} -annotate +60+588 '单章 2.5MB / 41 条,足够验证切片/预取/排队' \
  \
  -draw "stroke ${LINE} stroke-width 2 line 700,190 700,580" \
  \
  -font ${FB} -pointsize 25 -fill ${GOLD} -annotate +740+218 '转码踩出来的三条' \
  -font ${FR} -pointsize 20 -fill ${TXT} -annotate +740+258 '同码率 opus 比 aac 省 17%(48k vs 64k)' \
  -font ${FR} -pointsize 20 -fill ${RED} -annotate +740+298 '固定码率下 -ac 1 不会变小,只会更难听' \
  -font ${FR} -pointsize 20 -fill ${DIM} -annotate +760+328 '比特率是总量,单声道只是让每声道分到更多码' \
  -font ${FR} -pointsize 20 -fill ${TXT} -annotate +740+368 '必须出双格式(webm/opus + m4a/aac)' \
  -font ${FR} -pointsize 20 -fill ${DIM} -annotate +760+398 'opus 在 Safari 不稳;aac 才是通用兜底' \
  -font ${FR} -pointsize 20 -fill ${DIM} -annotate +760+428 'ffmpeg 往 m4a 塞 opus 会写出 0 字节坏文件' \
  \
  -font ${FB} -pointsize 23 -fill ${GOLD} -annotate +740+490 '配音:一个不维护清单的设计' \
  -font ${FR} -pointsize 20 -fill ${TXT} -annotate +740+528 '切片名纯靠推导(intro_1 / 1-1_s1 / 1-1_o1)' \
  -font ${FR} -pointsize 20 -fill ${TXT} -annotate +740+560 'import.meta.glob 建索引,查不到即降级' \
  -font ${FR} -pointsize 20 -fill ${BRN} -annotate +740+592 '理由:清单会漂移,glob 不会' \
  \
  -draw "stroke ${LINE} stroke-width 2 line 60,620 1220,620" \
  -font ${FB} -pointsize 26 -fill ${GOLD} -annotate +60+676 '先想清楚约束,代码形状自己就出来了' \
  -font ${FR} -pointsize 21 -fill ${TXT} -annotate +60+716 '自动播放策略 → 音乐在点「入局」后启动(那一下 click 是合法手势)' \
  -font ${FR} -pointsize 21 -fill ${TXT} -annotate +60+752 '缓冲窗口仅几百毫秒 → 配音必须提前拉整章,且串行不能并发' \
  ${OUT}/day13-assets.png

echo "已生成:"
ls -la ${OUT}/day13-*.png
