#!/bin/bash
# devlog day11 配图生成(风格对齐 day6-10:深底、金题、白文、色条卡片)
set -e
cd /workspace
FR=/home/Maker/fonts/NotoSansSC-Regular.ttf
FB=/home/Maker/fonts/NotoSansSC-Bold.otf
BK='#141210'; GOLD='#d9a441'; TXT='#e8dcc8'; DIM='#9a8f7d'
GRN='#6aa84f'; RED='#c0504d'; BLU='#5b9bd5'; BRN='#b08a55'; LINE='#3a332a'
W=1280; H=800
OUT=assets/images/devlog

# ---------- 图1: 立绘工程(缺口统计 + 五批 + 抠图流水线) ----------
convert -size ${W}x${H} xc:${BK} \
  -font ${FB} -pointsize 44 -fill ${GOLD} -annotate +60+86 '立绘:13 → 72 张' \
  -font ${FR} -pointsize 25 -fill ${TXT} -annotate +60+132 '先问「还差谁」,再分批补齐。缺口清单从剧本里算出来' \
  -draw "stroke ${LINE} stroke-width 2 line 60,162 1220,162" \
  \
  -font ${FB} -pointsize 27 -fill ${TXT} -annotate +60+218 '缺口怎么算' \
  -font ${FR} -pointsize 22 -fill ${TXT} -annotate +60+258 '出场角色 = 正文里被高亮标记的名字' \
  -font ${FR} -pointsize 22 -fill ${DIM} -annotate +60+292 'currentSpeaker 靠它决定右栏显示谁的立绘' \
  -font ${FR} -pointsize 22 -fill ${TXT} -annotate +60+332 'gap = 高亮词 − 已有立绘 − 非人物词' \
  -font ${FR} -pointsize 21 -fill ${BRN} -annotate +60+366 '非人物词(地名/官名/器物/制度)需显式列出' \
  \
  -font ${FB} -pointsize 25 -fill ${GOLD} -annotate +60+430 '结果' \
  -font ${FR} -pointsize 22 -fill ${TXT} -annotate +60+470 '高亮词 141 = 有图 70 + 非人物 71 + 待补 0' \
  -font ${FR} -pointsize 21 -fill ${GRN} -annotate +60+504 '五部剧本出场角色全部有立绘,不再留白' \
  \
  -draw "stroke ${LINE} stroke-width 2 line 700,190 700,580" \
  \
  -font ${FB} -pointsize 27 -fill ${GOLD} -annotate +740+218 '五批,59 张' \
  -font ${FR} -pointsize 21 -fill ${TXT} -annotate +740+258 '一 6 / 二 13 / 三 14  按出场频次' \
  -font ${FR} -pointsize 21 -fill ${TXT} -annotate +740+292 '四 10                  改按剧情分量' \
  -font ${FR} -pointsize 21 -fill ${TXT} -annotate +740+326 '五 16                  扫尾补齐' \
  -font ${FR} -pointsize 20 -fill ${DIM} -annotate +740+362 '频次 ≠ 重要性:范增/樊於期/王翦只出现 1 次' \
  -font ${FR} -pointsize 20 -fill ${DIM} -annotate +740+392 '按频次排会把这些关键人物排到最后' \
  \
  -font ${FB} -pointsize 25 -fill ${GOLD} -annotate +740+450 '抠图流水线' \
  -font ${FR} -pointsize 20 -fill ${TXT} -annotate +740+488 '生成 512×768 宣纸底' \
  -font ${FR} -pointsize 20 -fill ${TXT} -annotate +740+518 '→ AI 逐张抠图(保留飞白枯笔)' \
  -font ${FR} -pointsize 20 -fill ${TXT} -annotate +740+548 '→ 校验尺寸与透明占比' \
  \
  -draw "stroke ${LINE} stroke-width 2 line 60,600 1220,600" \
  -font ${FB} -pointsize 28 -fill ${GOLD} -annotate +60+660 '为什么不用算法抠图' \
  -font ${FR} -pointsize 22 -fill ${TXT} -annotate +60+704 '水墨人像边缘是渐变的(飞白、枯笔),没有清晰边界' \
  -font ${FR} -pointsize 22 -fill ${RED} -annotate +60+740 '洪水填充:低阈值留墨晕 / 高阈值把人咬缺 —— 两头都不对' \
  ${OUT}/day11-portraits.png

# ---------- 图2: 审校(雷同量化 + 失效指标 + 重做) ----------
convert -size ${W}x${H} xc:${BK} \
  -font ${FB} -pointsize 44 -fill ${GOLD} -annotate +60+86 '审校:风格统一 ≠ 不雷同' \
  -font ${FR} -pointsize 25 -fill ${TXT} -annotate +60+132 '72 张做完,做了一轮全量设计审校 —— 找「过于雷同」与「偏离风格」' \
  -draw "stroke ${LINE} stroke-width 2 line 60,162 1220,162" \
  \
  -font ${FB} -pointsize 27 -fill ${TXT} -annotate +60+218 '结论:风格达标,姿态雷同严重' \
  -font ${FR} -pointsize 21 -fill ${RED} -annotate +60+262 '拱手/拢袖  8 张几乎同款(侯公↔田光 IoU 0.89)' \
  -font ${FR} -pointsize 21 -fill ${RED} -annotate +60+296 '执卷文臣  10 张里 9 张同款(李斯↔姚贾 IoU 0.90)' \
  -font ${FR} -pointsize 21 -fill ${BRN} -annotate +60+330 '约 17/72 张(24%)落在两种重复姿态里' \
  \
  -font ${FB} -pointsize 24 -fill ${GOLD} -annotate +60+392 '另三处离群' \
  -font ${FR} -pointsize 20 -fill ${TXT} -annotate +60+430 '尺度  张良 91% / 漂母 93% / 孔鲋 95%(底对齐→忽大忽小)' \
  -font ${FR} -pointsize 20 -fill ${TXT} -annotate +60+462 '元素  张良持羽扇(明清诸葛亮符号,时代错位)' \
  -font ${FR} -pointsize 20 -fill ${TXT} -annotate +60+494 '抠图  3 张半透明像素占比偏高,边缘有淡灰雾' \
  \
  -draw "stroke ${LINE} stroke-width 2 line 700,190 700,580" \
  \
  -font ${FB} -pointsize 27 -fill ${GOLD} -annotate +740+218 '一个失效的指标' \
  -font ${FR} -pointsize 21 -fill ${TXT} -annotate +740+258 '想用剪影 IoU 自动找雷同 —— 结果:' \
  -font ${FR} -pointsize 21 -fill ${RED} -annotate +740+296 '所有 72 张两两 IoU 都在 0.88 以上' \
  -font ${FR} -pointsize 20 -fill ${DIM} -annotate +740+330 '因为都裁得很满(高度占比中位 99%)' \
  -font ${FR} -pointsize 20 -fill ${DIM} -annotate +740+362 '残差来自「填满画幅」这个共性,不是差异' \
  -font ${FR} -pointsize 21 -fill ${BRN} -annotate +740+406 '→ 测「共同点」的指标测不出「离群者」' \
  -font ${FR} -pointsize 21 -fill ${GRN} -annotate +740+450 '改成:指标只筛可疑,结论一律目视复核' \
  \
  -font ${FB} -pointsize 25 -fill ${GOLD} -annotate +740+516 '重做 19 张' \
  -font ${FR} -pointsize 20 -fill ${TXT} -annotate +740+552 '每张给不同朝向 / 手部动作 / 道具' \
  -font ${FR} -pointsize 20 -fill ${GRN} -annotate +740+584 '复查:同剧本最高 IoU 0.87 → 0.84' \
  \
  -draw "stroke ${LINE} stroke-width 2 line 60,600 1220,600" \
  -font ${FB} -pointsize 28 -fill ${GOLD} -annotate +60+660 '最值钱的一条' \
  -font ${FR} -pointsize 22 -fill ${TXT} -annotate +60+706 '画风统一做到极致,反而暴露了构图的高度同质 —— 单张看不出,拼在一起才显形' \
  -font ${FR} -pointsize 22 -fill ${BRN} -annotate +60+744 '批量产出:审校要从「逐张看」改成「成组比」' \
  ${OUT}/day11-audit.png

# ---------- 图3: 对局页 v2 + 配音与音乐 ----------
convert -size ${W}x${H} xc:${BK} \
  -font ${FB} -pointsize 44 -fill ${GOLD} -annotate +60+86 '对局页 v2 + 配音音乐' \
  -font ${FR} -pointsize 25 -fill ${TXT} -annotate +60+132 'DAY 9 定稿的效果图落地:骨架没变,所有底板换成美术素材' \
  -draw "stroke ${LINE} stroke-width 2 line 60,162 1220,162" \
  \
  -font ${FB} -pointsize 27 -fill ${TXT} -annotate +60+218 '对局页:四块全换' \
  -font ${FR} -pointsize 21 -fill ${DIM} -annotate +60+258 '顶栏按钮  透明墨线框 → 牌匾按钮(返回/回溯)' \
  -font ${FR} -pointsize 21 -fill ${TXT} -annotate +60+292 '左 66%    纸底 → 横卷轴底板 + 常驻立绘列(30%)' \
  -font ${FR} -pointsize 21 -fill ${TXT} -annotate +60+326 '右 34%    纸底 → 竖卷轴底板 + 题字「属 性」' \
  -font ${FR} -pointsize 21 -fill ${DIM} -annotate +60+360 '底栏选项  纸底 → 牌匾选项卡(悬停换图)' \
  -font ${FR} -pointsize 21 -fill ${BRN} -annotate +60+402 '新增素材 8 张:bg-game / scroll_story / scroll_side' \
  -font ${FR} -pointsize 21 -fill ${BRN} -annotate +60+434 '                plate_back / plate_rewind / plate_opt' \
  -font ${FR} -pointsize 21 -fill ${BRN} -annotate +60+466 '                plate_opt_hover / title_rule' \
  \
  -draw "stroke ${LINE} stroke-width 2 line 700,190 700,580" \
  \
  -font ${FB} -pointsize 27 -fill ${GOLD} -annotate +740+218 '配音与音乐' \
  -font ${FR} -pointsize 21 -fill ${TXT} -annotate +740+258 'voice.lua   剧情朗读(按 manifest 取 ogg)' \
  -font ${FR} -pointsize 21 -fill ${TXT} -annotate +740+292 'music.lua   背景音乐(SetScenario 切主题曲)' \
  -font ${FR} -pointsize 20 -fill ${DIM} -annotate +760+324 '同曲重入不打断' \
  -font ${FR} -pointsize 21 -fill ${TXT} -annotate +740+362 'voice-manifest.lua  台词→音频映射' \
  -font ${FR} -pointsize 20 -fill ${DIM} -annotate +760+394 '由脚本从剧本扫出,不手写' \
  \
  -font ${FB} -pointsize 23 -fill ${GOLD} -annotate +740+452 '设置页新增 4 项' \
  -font ${FR} -pointsize 20 -fill ${TXT} -annotate +740+490 '剧情朗读开关 / 朗读音量' \
  -font ${FR} -pointsize 20 -fill ${TXT} -annotate +740+520 '背景音乐开关 / 音乐音量' \
  -font ${FR} -pointsize 20 -fill ${DIM} -annotate +740+552 '随存档落本地,脏档回落默认值' \
  \
  -draw "stroke ${LINE} stroke-width 2 line 60,600 1220,600" \
  -font ${FB} -pointsize 28 -fill ${GOLD} -annotate +60+660 '标志定稿' \
  -font ${FR} -pointsize 22 -fill ${TXT} -annotate +60+704 '裁紧 + 导出多尺寸:横版 / 方版 / 标识三套' \
  -font ${FR} -pointsize 22 -fill ${TXT} -annotate +60+740 '标识另出 64 / 128 / 256 / 512 四档,适配不同显示尺寸' \
  ${OUT}/day11-audio.png

echo "已生成:"
ls -la ${OUT}/day11-*.png
