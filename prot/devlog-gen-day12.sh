#!/bin/bash
# devlog day12 配图生成(风格对齐 day6-11:深底、金题、白文、色条卡片)
set -e
cd /workspace
FR=/home/Maker/fonts/NotoSansSC-Regular.ttf
FB=/home/Maker/fonts/NotoSansSC-Bold.otf
BK='#141210'; GOLD='#d9a441'; TXT='#e8dcc8'; DIM='#9a8f7d'
GRN='#6aa84f'; RED='#c0504d'; BLU='#5b9bd5'; BRN='#b08a55'; LINE='#3a332a'
W=1280; H=800
OUT=assets/images/devlog

# ---------- 图1: 配音全覆盖 ----------
convert -size ${W}x${H} xc:${BK} \
  -font ${FB} -pointsize 44 -fill ${GOLD} -annotate +60+86 '配音:全量覆盖 1927 条' \
  -font ${FR} -pointsize 25 -fill ${TXT} -annotate +60+132 'DAY 11 只认三类,真跑起来发现三类事件全是哑的 —— 恰好是最需要声音的三类' \
  -draw "stroke ${LINE} stroke-width 2 line 60,162 1220,162" \
  \
  -font ${FB} -pointsize 27 -fill ${TXT} -annotate +60+218 '给 manifest 加一层 specials' \
  -font ${FR} -pointsize 22 -fill ${DIM} -annotate +60+258 '原结构 chapters[剧本][章节],装不下「不属于任何章节的事件」' \
  -font ${FR} -pointsize 22 -fill ${TXT} -annotate +60+298 'specials[剧本][事件id] = { segs = 正文, opts = 选项结算 }' \
  -font ${FR} -pointsize 21 -fill ${TXT} -annotate +80+334 '随机事件   RANDOM_EVENTS        R-1 … R-12' \
  -font ${FR} -pointsize 21 -fill ${TXT} -annotate +80+366 '危机事件   CRISIS_EVENTS        C-1 … C-DEATH' \
  -font ${FR} -pointsize 21 -fill ${TXT} -annotate +80+398 '历史修正   CORRECTIONS          corr1 … corr9' \
  \
  -font ${FB} -pointsize 25 -fill ${GOLD} -annotate +60+462 '反噬事件的 id 是算出来的' \
  -font ${FR} -pointsize 21 -fill ${DIM} -annotate +60+502 'CORRECTIONS 是数组,条目没有 id —— 用下标当 id(corr<N>)' \
  -font ${FR} -pointsize 21 -fill ${DIM} -annotate +60+534 '引擎侧拿到的是条目对象,不知自己是第几个 → 反查下标' \
  -font ${FR} -pointsize 21 -fill ${BRN} -annotate +60+570 '反噬走同一条路(复用 CORRECTIONS 条目),也查同一个 corrId' \
  \
  -draw "stroke ${LINE} stroke-width 2 line 700,190 700,580" \
  \
  -font ${FB} -pointsize 27 -fill ${GOLD} -annotate +740+218 '查表分两条路' \
  -font ${FR} -pointsize 21 -fill ${TXT} -annotate +740+258 '先查主线,查不到再查 specials' \
  -font ${FR} -pointsize 20 -fill ${BLU} -annotate +740+294 'SegPaths(sid, ch, ev)' \
  -font ${FR} -pointsize 20 -fill ${BLU} -annotate +760+322 'or SpecialSegPaths(sid, ev.corrId or ev.id)' \
  -font ${FR} -pointsize 20 -fill ${BLU} -annotate +740+352 'OptPath(...) or SpecialOptPath(...)' \
  -font ${FR} -pointsize 20 -fill ${DIM} -annotate +740+386 'ev.corrId or ev.id:反噬用算出的 corrId,其余用自带 id' \
  \
  -font ${FB} -pointsize 25 -fill ${GOLD} -annotate +740+424 '覆盖面' \
  -font ${FR} -pointsize 21 -fill ${TXT} -annotate +740+462 '主线 933 / 随机 285 / 抉择卡 228' \
  -font ${FR} -pointsize 21 -fill ${TXT} -annotate +740+494 '修正 133 / 危机 124 / 结局 82 / 其他 142' \
  -font ${FR} -pointsize 21 -fill ${BRN} -annotate +740+534 '分剧本:李斯 491 / 韩信 402 / 荆轲 364' \
  -font ${FR} -pointsize 21 -fill ${BRN} -annotate +760+564 '项羽 347 / 陈胜 323' \
  \
  -draw "stroke ${LINE} stroke-width 2 line 60,600 1220,600" \
  -font ${FB} -pointsize 28 -fill ${GOLD} -annotate +60+660 '今天最值钱的一条' \
  -font ${FR} -pointsize 22 -fill ${TXT} -annotate +60+704 '「全覆盖」不是把已有的做多,是把没覆盖的找出来' \
  -font ${FR} -pointsize 22 -fill ${BRN} -annotate +60+744 '一个功能「看起来完成了」和「所有路径都有覆盖」,是两件事' \
  ${OUT}/day12-voice.png

# ---------- 图2: 五首主题曲 ----------
convert -size ${W}x${H} xc:${BK} \
  -font ${FB} -pointsize 44 -fill ${GOLD} -annotate +60+86 '五首主题曲:只写那一刻' \
  -font ${FR} -pointsize 25 -fill ${TXT} -annotate +60+132 '第一版写成了生平全景 —— 那不是歌,是百科词条。重写时立五条原则' \
  -draw "stroke ${LINE} stroke-width 2 line 60,162 1220,162" \
  \
  -font ${FB} -pointsize 25 -fill ${TXT} -annotate +60+212 '五条原则' \
  -font ${FR} -pointsize 21 -fill ${TXT} -annotate +60+250 '史实准确 / 新切口 / 去辞藻堆砌 / 重韵律 / 立意明确' \
  -font ${FR} -pointsize 21 -fill ${GOLD} -annotate +60+286 '核心:去百科化 —— 一首歌只取「那一刻」,不做全景罗列' \
  \
  -font ${FB} -pointsize 24 -fill ${GOLD} -annotate +60+348 '五个切口' \
  -font ${FR} -pointsize 20 -fill ${TXT} -annotate +60+386 '李斯《上蔡叹》    刑场临刑前,对儿子说的话' \
  -font ${FR} -pointsize 20 -fill ${TXT} -annotate +60+418 '荆轲《易水寒》    易水送别,唱罢就车而去' \
  -font ${FR} -pointsize 20 -fill ${TXT} -annotate +60+450 '韩信《淮阴月》    长乐宫钟室之死' \
  -font ${FR} -pointsize 20 -fill ${TXT} -annotate +60+482 '陈胜《无相忘》    誓言「苟富贵无相忘」与其背叛' \
  -font ${FR} -pointsize 20 -fill ${TXT} -annotate +60+514 '项羽《不肯过江东》 乌江渡口,亭长撑船来迎,他不肯过' \
  -font ${FR} -pointsize 20 -fill ${DIM} -annotate +60+550 '待机《青史引》    古琴、箫,无鼓,极慢空阔,可无缝循环' \
  \
  -draw "stroke ${LINE} stroke-width 2 line 700,190 700,580" \
  \
  -font ${FB} -pointsize 27 -fill ${GOLD} -annotate +740+218 '双轨:先伴奏,后开唱' \
  -font ${FR} -pointsize 20 -fill ${TXT} -annotate +740+256 '进对局 → 无人声版 → 接有人声版 → 回无人声版循环' \
  -font ${FR} -pointsize 20 -fill ${DIM} -annotate +740+290 '第一遍给伴奏(进入状态),第二遍开唱(点题)' \
  -font ${FR} -pointsize 20 -fill ${DIM} -annotate +740+322 '之后回伴奏循环 —— 有词反复循环会烦' \
  \
  -font ${FB} -pointsize 23 -fill ${GOLD} -annotate +740+386 '两个工程细节' \
  -font ${FR} -pointsize 20 -fill ${TXT} -annotate +740+422 '朗读时自动压低 BGM(DUCK 0.45),避免抢耳' \
  -font ${FR} -pointsize 20 -fill ${TXT} -annotate +740+454 '人声版提前 1.5 秒切回伴奏,避开尾奏留白' \
  -font ${FR} -pointsize 20 -fill ${BRN} -annotate +740+494 '引擎不暴露精确时长 → 用 ffprobe 量出写死在曲库' \
  \
  -font ${FB} -pointsize 23 -fill ${GOLD} -annotate +740+556 '每句词都得有史书出处' \
  -font ${FR} -pointsize 19 -fill ${DIM} -annotate +740+592 '存档配意象对照表(如「上蔡东门逐狡兔」出《史记·李斯列传》)' \
  \
  -draw "stroke ${LINE} stroke-width 2 line 60,600 1220,600" \
  -font ${FB} -pointsize 28 -fill ${GOLD} -annotate +60+660 '「写全」和「写准」也是两件事' \
  -font ${FR} -pointsize 22 -fill ${TXT} -annotate +60+704 '第一版五首我「写全」了(生平一段不落),却没一首「写准」(没有切口)' \
  -font ${FR} -pointsize 22 -fill ${BRN} -annotate +60+744 '删掉四分之三,只留那一刻,歌才立住' \
  ${OUT}/day12-songs.png

echo "已生成:"
ls -la ${OUT}/day12-*.png
