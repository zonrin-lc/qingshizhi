#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""统计五部剧本里 ⟦⟧ 高亮词频,对照已有立绘,给出缺口清单。

出场角色 = 正文中被 ⟦⟧ 包裹的名字(game.lua currentSpeaker 靠它切换立绘)。
⟦⟧ 里同时混有地名/官名/器物/事件等,故显式列出非人物词以剔除;
未列出的 ⟦⟧ 词一律按"待人工确认"处理,防止漏统计。
"""
import glob
import os
import re

# 只扫五部剧本;排除 voice-manifest.lua 等非剧本数据
SCENARIOS = ["lisi", "jingke", "hanxin", "xiangyu", "chensheng"]
FILES = ["scripts/qingshi/data/%s.lua" % n for n in SCENARIOS]
PAT = re.compile(r"⟦([^⟧]*)⟧")

# 已有立绘(CHAR_IMG 的中文名)
HAVE = {
    "李斯", "荆轲", "韩信", "项羽", "陈胜", "赵高", "嬴政", "韩非", "蒙恬",
    "扶苏", "胡亥", "章邯", "萧何", "李由", "樊哙", "荀卿", "彭越", "张良", "吴广",
    "吕后", "项梁", "项庄", "陈平", "虞姬", "蒙嘉", "英布", "秦舞阳", "滕公",
    "春申君", "庄贾", "太子丹", "吕不韦",
    "高渐离", "项燕", "项伯", "陈豨", "蒯通", "李园", "王离", "徐夫人",
    "宋义", "周文", "葛婴", "田臧", "景驹", "侯公",
    "淳于越", "李左车", "周青臣", "范增", "樊於期", "王翦", "田光", "嫪毐", "郑国", "盖聂",
}

# ⟦⟧ 里确认不是人物的词(地名/官名/器物/事件/群体/制度)
NOT_PERSON = {
    # 地名
    "函谷关", "上郡", "督亢", "沙丘", "大泽乡", "戏亭", "下城父", "敖仓",
    "三秦", "垓下", "云梦", "易水", "上蔡", "新安", "阳城", "渔阳", "渑池",
    "荥阳", "淮阴", "井陉口", "榆次", "兰陵", "阳周", "会稽", "下相",
    "巨鹿", "漳水", "彭城", "鸿沟", "阴陵", "乌江", "江东", "三川",
    # 官名 / 身份 / 群体
    "中车府令", "长史", "廷尉", "三老", "质子", "骊山徒", "卫",
    # 器物 / 书名 / 文章 / 字体
    "乌骓", "鱼书", "栈道", "木罂缶", "筑", "鲍鱼", "吕氏春秋",
    "谏逐客书", "仓颉篇", "小篆",
    # 制度 / 刑罚 / 政令
    "郡县", "驰道", "督责", "五刑", "三族", "什伍", "度量衡", "逐客令", "九宾", "合纵",
    # 事件 / 语句 / 国号
    "狐鸣", "暗度陈仓", "焚书", "坑儒", "破釜沉舟", "鸿门宴", "胯下",
    "王侯将相宁有种乎", "张楚",
    # 建筑
    "阿房宫", "长乐宫",
}

per_file = {}
total = {}
for f in FILES:
    name = os.path.basename(f)[:-4]
    cnt = {}
    for m in PAT.findall(open(f, encoding="utf-8").read()):
        cnt[m] = cnt.get(m, 0) + 1
        total[m] = total.get(m, 0) + 1
    per_file[name] = cnt

gap = {k: v for k, v in total.items() if k not in HAVE and k not in NOT_PERSON}
unknown = [k for k in gap if not re.match(r"^[一-鿿]{1,4}$", k)]

print("⟦⟧ 词 %d 个:有图 %d / 非人物 %d / 待补立绘 %d"
      % (len(total), len(HAVE & set(total)), len(NOT_PERSON & set(total)), len(gap)))
if unknown:
    print("⚠️ 未归类且不像人名,请人工确认:", unknown)

print()
print("=== 待补立绘人物(按总频次) ===")
for k, v in sorted(gap.items(), key=lambda x: (-x[1], x[0])):
    where = [n for n, c in per_file.items() if k in c]
    print("  %2d 次  %-6s  出现于: %s" % (v, k, " / ".join(where)))

print()
print("=== 各剧本缺口 ===")
for n, c in per_file.items():
    miss = sorted([k for k in c if k in gap], key=lambda k: -c[k])
    print("%-10s 待补 %2d 人: %s" % (n, len(miss), " ".join(miss)))
