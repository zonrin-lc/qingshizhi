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

# ---------- 图1: 抉择卡 ----------
convert -size ${W}x${H} xc:${BK} \
  -font ${FB} -pointsize 44 -fill ${GOLD} -annotate +60+86 '一个新玩法:抉择卡' \
  -font ${FR} -pointsize 25 -fill ${TXT} -annotate +60+132 '点选后不直接结算 —— 先读一段剧情、做一次抉择,选完才落定。次级的关键事件' \
  -draw "stroke ${LINE} stroke-width 2 line 60,162 1220,162" \
  \
  -font ${FB} -pointsize 27 -fill ${TXT} -annotate +60+218 '规模' \
  -font ${FR} -pointsize 23 -fill ${TXT} -annotate +60+258 '每本剧本 12 张 × 5 本 = 60 张' \
  -font ${FR} -pointsize 22 -fill ${DIM} -annotate +60+296 '数据挂在行动卡上,多一个 choice 字段' \
  -font ${FR} -pointsize 22 -fill ${DIM} -annotate +60+330 'choice = { segs = 剧情, options = 选项 }' \
  \
  -font ${FB} -pointsize 27 -fill ${TXT} -annotate +60+402 '引擎侧:新增 phase = choice' \
  -font ${FR} -pointsize 22 -fill ${TXT} -annotate +60+442 'playCard        遇 a.choice 不结算,切 choice 阶段' \
  -font ${FR} -pointsize 22 -fill ${TXT} -annotate +60+476 'getChoiceCard   取剧情与选项,供 UI 渲染' \
  -font ${FR} -pointsize 22 -fill ${TXT} -annotate +60+510 'chooseCardOption 选项落定 → 应用 eff → 常规结算' \
  -font ${FR} -pointsize 22 -fill ${TXT} -annotate +60+544 'cancelChoice    中途退出 → 回 round 阶段' \
  \
  -draw "stroke ${LINE} stroke-width 2 line 700,190 700,580" \
  \
  -font ${FB} -pointsize 27 -fill ${GOLD} -annotate +740+218 '三条容易写错的规则' \
  -font ${FR} -pointsize 21 -fill ${TXT} -annotate +740+260 '① 落定后整局不再发,但「取消」不算' \
  -font ${FR} -pointsize 20 -fill ${DIM} -annotate +760+292 'choiceUsed 只在落定时写;取消不写 → 卡仍在池中' \
  -font ${FR} -pointsize 21 -fill ${RED} -annotate +740+340 '② 必须从 pool 剔除,不能只过滤候选' \
  -font ${FR} -pointsize 20 -fill ${DIM} -annotate +760+372 '只挡强制发牌位,挡不住「常规抽 3 张」' \
  -font ${FR} -pointsize 20 -fill ${DIM} -annotate +760+400 '→ 会二次进 choice 重复结算' \
  -font ${FR} -pointsize 21 -fill ${TXT} -annotate +740+448 '③ 取消要能回到原状态' \
  -font ${FR} -pointsize 20 -fill ${DIM} -annotate +760+480 '否则玩家被卡在剧情页出不来' \
  \
  -font ${FR} -pointsize 21 -fill ${BRN} -annotate +740+540 '随机流口径:仅强制发抉择卡时多耗一次 deal()' \
  -font ${FR} -pointsize 21 -fill ${BRN} -annotate +740+572 '→ 与 JS golden 严格同序,对拍不分叉' \
  \
  -draw "stroke ${LINE} stroke-width 2 line 60,600 1220,600" \
  -font ${FB} -pointsize 28 -fill ${GOLD} -annotate +60+660 '发牌调度:每两轮强制发一张' \
  -font ${FR} -pointsize 22 -fill ${TXT} -annotate +60+706 'choiceGap += 1;≥2 时从 crest 池里强制占一个发牌位,发完归零' \
  -font ${FR} -pointsize 22 -fill ${DIM} -annotate +60+744 '保证玩家不会漏掉抉择卡,而不是靠随机撞上' \
  ${OUT}/day10-choice-card.png

# ---------- 图2: 四个真 bug + 审查 ----------
convert -size ${W}x${H} xc:${BK} \
  -font ${FB} -pointsize 44 -fill ${GOLD} -annotate +60+86 '顺手揪出的四个真 bug' \
  -font ${FR} -pointsize 25 -fill ${TXT} -annotate +60+132 '写抉择卡的过程中,在既有引擎里翻出来的既有问题' \
  -draw "stroke ${LINE} stroke-width 2 line 60,162 1220,162" \
  \
  -font ${FB} -pointsize 25 -fill ${RED} -annotate +60+212 '① enterChapter 静默丢弃 zg / zgSet' \
  -font ${FR} -pointsize 21 -fill ${DIM} -annotate +80+248 '荆轲的 xielou / cuixing 两处戒心异变完全失效' \
  -font ${FB} -pointsize 25 -fill ${RED} -annotate +60+302 '② 行动卡 chapters 缺省写死 {0, 6}' \
  -font ${FR} -pointsize 21 -fill ${DIM} -annotate +80+338 '章节数 > 7 的剧本会漏发行动卡' \
  -font ${FB} -pointsize 25 -fill ${RED} -annotate +60+392 '③ riskWord 缺前向声明' \
  -font ${FR} -pointsize 21 -fill ${DIM} -annotate +80+428 '调用被解析到全局 nil → 运行时崩' \
  -font ${FB} -pointsize 25 -fill ${RED} -annotate +60+482 '④ importSave 校验失败不恢复 chapterIdx' \
  -font ${FR} -pointsize 21 -fill ${DIM} -annotate +80+518 'chapterIdx 已换新、eventId 仍旧 → 后续静默错配' \
  -font ${FR} -pointsize 21 -fill ${BRN} -annotate +80+552 '→ 不报错,只是结果不对。最阴的一个' \
  \
  -draw "stroke ${LINE} stroke-width 2 line 700,190 700,580" \
  \
  -font ${FB} -pointsize 27 -fill ${GOLD} -annotate +740+218 '存档改成原子写' \
  -font ${FR} -pointsize 21 -fill ${TXT} -annotate +740+258 '原:直接覆写 —— 写一半崩了就是截断的 JSON' \
  -font ${FR} -pointsize 21 -fill ${DIM} -annotate +740+292 '那种文件能过 FileExists,却解不出来' \
  -font ${FR} -pointsize 21 -fill ${DIM} -annotate +740+324 '→ 读档侧只能整份丢弃,玩家进度归零' \
  -font ${FR} -pointsize 21 -fill ${GRN} -annotate +740+372 '现:先落 .tmp 再 Rename' \
  -font ${FR} -pointsize 21 -fill ${DIM} -annotate +740+406 '改名是单一操作,不会留下写了一半的存档' \
  -font ${FR} -pointsize 20 -fill ${BRN} -annotate +740+444 '注意:Rename 未必覆盖已存在目标 → 删旧再试' \
  \
  -font ${FB} -pointsize 27 -fill ${GOLD} -annotate +740+520 '全量审查' \
  -font ${FR} -pointsize 21 -fill ${TXT} -annotate +740+558 '26,213 行 · 逐行人工(3 路并行)' \
  -font ${FR} -pointsize 21 -fill ${TXT} -annotate +740+590 '+ LSP 静态诊断 + 自写数据校验器' \
  -font ${FR} -pointsize 21 -fill ${TXT} -annotate +740+622 '→ 四份报告;五本剧本导出可读 md' \
  \
  -draw "stroke ${LINE} stroke-width 2 line 60,600 1220,600" \
  -font ${FB} -pointsize 28 -fill ${GOLD} -annotate +60+660 '对拍网跟着升级' \
  -font ${FR} -pointsize 22 -fill ${TXT} -annotate +60+704 'p2-replay 支持 choice 步骤 → chooseCardOption(opt)' \
  -font ${FR} -pointsize 22 -fill ${TXT} -annotate +60+740 'engine.js(JS golden 侧)同步实现同一套规则' \
  ${OUT}/day10-bugs.png

echo "已生成:"
ls -la ${OUT}/day10-*.png
