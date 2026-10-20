#\!/bin/bash
# devlog day17 配图生成(风格对齐 day6-16:深底、金题、白文、色条卡片)
set -e
cd /workspace
FR=/home/Maker/fonts/NotoSansSC-Regular.ttf
FB=/home/Maker/fonts/NotoSansSC-Bold.otf
BK='#141210'; GOLD='#d9a441'; TXT='#e8dcc8'; DIM='#9a8f7d'
GRN='#6aa84f'; RED='#c0504d'; BLU='#5b9bd5'; BRN='#b08a55'; LINE='#3a332a'
W=1280; H=900
OUT=assets/images/devlog

# ---------- 图1: 三天主线 ----------
convert -size ${W}x${H} xc:${BK} \
  -font ${FB} -pointsize 44 -fill ${GOLD} -annotate +60+86 '从「能玩」到「能上线」' \
  -font ${FR} -pointsize 25 -fill ${TXT} -annotate +60+132 'DAY 13-16 把 H5 做出来了;这三天让它像个成品' \
  -draw "stroke ${LINE} stroke-width 2 line 60,162 1220,162" \
  \
  -font ${FB} -pointsize 26 -fill ${GOLD} -annotate +60+214 'DAY 17 · 配音换口径' \
  -font ${FR} -pointsize 20 -fill ${DIM} -annotate +60+252 '旧:按事件切(c0_0-1_s1 / _o1,一条事件切 4-5 段)' \
  -font ${FR} -pointsize 20 -fill ${TXT} -annotate +60+284 '新:整段合并(intro / <事件id> / choice_<ACT> 各一条)' \
  -font ${FR} -pointsize 20 -fill ${BRN} -annotate +60+316 '砍掉:主线选项结算 + 随机事件(2026-10-17 拍板)' \
  -font ${FR} -pointsize 20 -fill ${GRN} -annotate +60+348 '3854 条旧切片 → 1200 条新切片;李斯全剧本 134 条' \
  \
  -font ${FB} -pointsize 26 -fill ${GOLD} -annotate +60+412 'DAY 18 · 音效 + 支付锁' \
  -font ${FR} -pointsize 20 -fill ${TXT} -annotate +60+450 'sfx.ts:第三条音频通道(14+ 条)' \
  -font ${FR} -pointsize 20 -fill ${DIM} -annotate +60+482 '并发短音开小池(连点不互相打断)/ 不做 visibility 暂停' \
  -font ${FR} -pointsize 20 -fill ${RED} -annotate +60+514 '引擎:财富见底锁(防软锁)' \
  -font ${FR} -pointsize 20 -fill ${DIM} -annotate +60+546 '实测:陈胜 R-1 / 韩信 R-7 全部选项都扣财富' \
  \
  -font ${FB} -pointsize 26 -fill ${GOLD} -annotate +60+610 'DAY 19 · 动效体系' \
  -font ${FR} -pointsize 20 -fill ${TXT} -annotate +60+648 'P0 token / 弹窗 / 骰点重排 / 朱印盖章' \
  -font ${FR} -pointsize 20 -fill ${TXT} -annotate +60+680 '雷达补间 / 页面转场 / 逐字墨染 / 云雾 ambient' \
  -font ${FR} -pointsize 20 -fill ${DIM} -annotate +60+712 '先规划后落地:docs/动效优化规划-motion-design.md' \
  \
  -draw "stroke ${LINE} stroke-width 2 line 700,190 700,760" \
  \
  -font ${FB} -pointsize 25 -fill ${GOLD} -annotate +740+214 '配音四条现实约束' \
  -font ${FR} -pointsize 19 -fill ${TXT} -annotate +740+252 '1 缓冲窗口仅几百毫秒 → 必须提前拉' \
  -font ${FR} -pointsize 19 -fill ${TXT} -annotate +740+284 '2 串行不能并发 → 否则打满连接池' \
  -font ${FR} -pointsize 19 -fill ${TXT} -annotate +740+316 '3 语音要盖住 BGM → 靠音量差(0.8/0.6)' \
  -font ${FR} -pointsize 19 -fill ${DIM} -annotate +760+346 '(DAY 15 的 ducking 已去掉)' \
  -font ${FR} -pointsize 19 -fill ${TXT} -annotate +740+380 '4 页面不可见不念 → 回前台从断点续' \
  \
  -font ${FB} -pointsize 23 -fill ${GOLD} -annotate +740+444 '目录与查找' \
  -font ${FR} -pointsize 19 -fill ${TXT} -annotate +740+482 'voice/<剧本>/<章>/  本章切片' \
  -font ${FR} -pointsize 19 -fill ${TXT} -annotate +740+514 'voice/<剧本>/_shared/  跨章共享' \
  -font ${FR} -pointsize 19 -fill ${DIM} -annotate +740+546 '先查本章,查不到回落 _shared' \
  -font ${FR} -pointsize 19 -fill ${BRN} -annotate +740+580 '清单会漂移,glob 不会' \
  \
  -font ${FB} -pointsize 23 -fill ${GOLD} -annotate +740+644 '四首主题曲换新词' \
  -font ${FR} -pointsize 19 -fill ${TXT} -annotate +740+682 '李斯《仓中鼠》/ 荆轲《易水寒》' \
  -font ${FR} -pointsize 19 -fill ${TXT} -annotate +740+714 '韩信《拜将坛》/ 项羽《不肯过江东》' \
  -font ${FR} -pointsize 19 -fill ${DIM} -annotate +740+746 '李斯那首以仓鼠意象贯穿一生,首尾落于东门牵黄犬' \
  \
  -draw "stroke ${LINE} stroke-width 2 line 60,790 1220,790" \
  -font ${FB} -pointsize 25 -fill ${GOLD} -annotate +60+840 '「能跑通的技术方案,不一定是对的方案」' \
  -font ${FR} -pointsize 20 -fill ${TXT} -annotate +60+876 '配音按段切技术上可行,坏在听感 —— 叙事是连贯一句,切成 4 段念就是断续的' \
  ${OUT}/day17-timeline.png

echo "已生成:"
ls -la ${OUT}/day17-*.png
