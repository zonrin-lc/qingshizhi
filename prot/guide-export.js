/* 攻略数据导出器:prot/lua-data/*.json → docs/攻略/数据速查.md
 *
 * 为什么要有它(2026-10-21):
 * 攻略里的**表格**不该手抄 —— 属性四档评语、偏离度四档、险招成算分档、评级分档、
 * 三难度系数、事件选项的门槛分布、成就/词条/结局的计数,全都从数据里来。
 * 手抄必错,而且游戏一改数值攻略就悄悄过期。
 * 这里把表格一次生成,并在文首写上**数据指纹**(五份 JSON 的短哈希):
 * 指纹对不上,就说明数据动过、表格该重跑了。
 *
 * 边界:只导出**机制与分布**;不导出剧情路线、结局达成条件、旗标对照
 * (那是剧透,按用户要求不进攻略)。
 *
 * 用法: node prot/guide-export.js [--out <路径>]
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const DATA = path.join(ROOT, 'prot', 'lua-data');
const outArg = process.argv.indexOf('--out');
const OUT = outArg > 0 ? process.argv[outArg + 1] : path.join(ROOT, 'docs', '攻略', '数据速查.md');

const SCEN = ['lisi', 'jingke', 'hanxin', 'xiangyu', 'chensheng'];
const files = SCEN.map((k) => path.join(DATA, `${k}.json`));
const datas = files.map((f) => JSON.parse(fs.readFileSync(f, 'utf8')));
const byKey = Object.fromEntries(SCEN.map((k, i) => [k, datas[i]]));

/** 数据指纹:五份 JSON 的短哈希(顺序固定) */
const fingerprint = crypto.createHash('sha256');
for (const f of files) fingerprint.update(fs.readFileSync(f));
const FP = fingerprint.digest('hex').slice(0, 12);

const L = [];
/** 追加一行(可多段拼接,自动用空格分隔) */
const w = (...parts) => L.push(parts.filter((x) => x !== undefined && x !== null && x !== '').join(' '));
const tbl = (head, rows) => {
  w(`| ${head.join(' | ')} |`);
  w(`|${head.map(() => '---').join('|')}|`);
  for (const r of rows) w(`| ${r.join(' | ')} |`);
  w();
};

/* ---------- 0. 抬头 ---------- */
w('# 《青史志》数据速查');
w();
w('> 本表由 `prot/guide-export.js` 从剧本数据自动生成,**不要手改**。');
w(`> 数据指纹:\`${FP}\` —— 与 \`prot/lua-data/*.json\` 绑定;游戏数值一改,指纹就对不上,重跑生成器即可。`);
w(`> 生成时间:${new Date().toISOString().slice(0, 10)}`);
w();
w('口径以引擎与数据为准(`prot/engine.js`)。本表只列**机制与分布**,不含剧情路线与结局达成条件。');
w();

/* ---------- 1. 属性 ---------- */
w('## 一、属性与四档评语');
w();
w('十一种属性,每项 0–100(财富上限按剧本可另设)。右列是属性达到该档时的评语。');
w();
{
  const a = byKey.lisi.ATTRS;
  const names = byKey.lisi.ATTR_NAMES;
  const init = byKey.lisi.INIT;
  tbl(['属性', '键', '初值', '四档评语(高→低)'],
    a.map((x) => [names[x.k] || x.k, `\`${x.k}\``, String(init[x.k] ?? '—'),
      (x.words || []).map(([t, w2]) => (t === 0 ? `0 ${w2}` : `≥${t} ${w2}`)).join('<br>')]));
}

/* ---------- 2. 偏离度 ---------- */
w('## 二、偏离度四档与印章');
w();
{
  const bands = byKey.lisi.DEV_BANDS;
  tbl(['档位', '偏离度上限', '含义'],
    bands.map((b) => [b.name, `≤ ${b.max}`, {
      循史: '完整复刻了历史,史书正文没变',
      微澜: '大势之内的小挣扎,只在字里行间留批注',
      改流: '开始改写走向,史官的笔追不上了',
      逆天: '无人见过的新历史,无论结局如何都属于你',
    }[b.name] || '']));
  w('结局的「影响」分 = 偏离度×0.6 + 功业×0.4;偏离度还会决定终局尾声的三种语气,以及某些结局的准入门槛(`devMax`)。');
  w();
  const seals = [...new Set(SCEN.flatMap((k) => Object.values(byKey[k].ENDINGS || {}).map((e) => e.seal)))];
  w('印章共五色:', seals.join(' / '), '——印章是**结局的性质**,不是分数:「苟活」与「败局」是活法不同,不是高低。');
  w();
}

/* ---------- 3. 险招成算 ---------- */
w('## 三、险招成算(差距 → 成功率)');
w();
w('门槛属性不足时,若差距在软门槛内,该选项会带 ⚠ 徽章入列:可以冒险掷骰。差得越多越险。');
w();
tbl(['差距(还差几点)', '成算', '备注'],
  [['≤ 3', '七成', '几乎稳过'], ['4–6', '五成', ''], ['7–9', '四成', ''],
    ['10–12', '三成', ''], ['13–15', '两成', '不建议赌'], ['≥ 16', '一成半', '基本别赌']]
    .map((r) => [r[0], r[1], r[2]]));
w('- 「史实」类选项(维持历史惯性)成算**升一档**(五成→七成、四成→五成……)。');
w('- 掷 1–100 骰,点数 ≤ 成算即成。**险招失败,该选项当场烧毁**(本章此事件内不可再试),且失败即事件终结。');
w('- 财富门槛默认是**硬门槛**(钱不够直接锁死,不是险招);硬核难度下卡面数字还会被抹成「耗财/费力」这类措辞。');
w();

/* ---------- 4. 评级 ---------- */
w('## 四、终局评分与评级');
w();
w('总分 = (功业×0.30 + 存续×0.30 + 史评×0.20 + 影响×0.20) × 难度系数 × (逆天结局 ×1.15) × 回溯惩罚');
w();
tbl(['分项', '怎么来的', '能刷吗'],
  [['功业', '权势峰值×0.45 + 政绩×0.15 + 功业标记分', '能(权势/政绩/功业)'],
    ['存续', '结局自带的定义值(这一结局代表你活成了什么样)', '不能(由路线决定)'],
    ['史评', '50 + 史评原始分×0.5 + 史评加成', '间接'],
    ['影响', '偏离度×0.6 + 功业×0.4', '能(偏离度是主杠杆)']]);
w('评级十档(分越高越好):甲上 95 / 甲 90 / 甲下 85 / 乙上 80 / 乙 70 / 乙下 60 / 丙上 50 / 丙 40 / 丙下 30 / 丁 兜底。');
w();
w('> 每回溯一次,总分系数 ×0.98(回溯是后悔药,药钱按次扣)。');
w('> 通关下一部剧本的门槛:上一部达成**乙级及以上** + 解锁 **3 个不同结局**。');
w();

/* ---------- 5. 难度 ---------- */
w('## 五、三档难度');
w();
{
  const d = byKey.lisi.DIFFICULTY;
  tbl(['难度', '危机增长', '章末修正', '总分系数', '每章回溯', '会致死', '数值显示', '官方描述'],
    Object.entries(d).map(([k, v]) => [v.n, `×${v.wj}`, `×${v.corr}`, `×${v.coef}`,
      v.backtrack < 0 ? '无限' : `${v.backtrack} 次`, v.lethal ? '会' : '不会',
      v.hideAttrs ? '只给状态词' : '全可见', v.desc]));
}

/* ---------- 6. 回合结构 ---------- */
w('## 六、一回合的结构');
w();
w('- 每回合发 **4 张**:1 张关键事件卡(限时 3 回合,倒计时归零强制进事件页)+ 3 张行动卡。');
w('- 关键事件卡不占牌位,它以提示条形式出现,点它进入事件抉择。');
w('- **抉择卡**每两轮强制占一个发牌位(整局一张只发一次);染病时多一张「求医问药」(占一个牌位,财富 ≤ 0 时不得求医)。');
w('- 行动池按本章过滤;**硬门槛不达直接不出现**,软门槛不足则带 ⚠ 险招徽章入列。');
w('- 同一张行动卡**可以反复打**:引擎有「重复使用收益递减」规则(`ACTION_RULES.diminish`),但五本剧本当前都把它关掉了(`diminish: false`),所以收益不打折。');
w('- 抉择卡落定后整局不再发。');
w();

/* ---------- 7. 危机与死亡 ---------- */
w('## 七、危机与死亡');
w();
w('- 危机(weiji)满 100:致命难度**直接死**;非致命难度钳到 **95**,回落会单列一条「危机封顶回落」结算条目。');
w('- 染病时体魄归零也可能死(致命难度);非致命难度体魄最低留 1。');
w('- 每章有 2–3 个危机事件;危机 70–89 时本章会额外插入一次构陷际遇。');
w();

/* ---------- 8. 际遇与修正 ---------- */
w('## 八、际遇与历史修正');
w();
{
  const rand = SCEN.map((k) => Object.keys(byKey[k].RANDOM_EVENTS || {}).length);
  const corr = SCEN.map((k) => (byKey[k].CORRECTIONS || []).length);
  w(`- **际遇**:每回合 ${(byKey.lisi.ENCOUNTER || {}).randomChance ?? 0.4 * 100}% 概率触发,每章至多 ${(byKey.lisi.ENCOUNTER || {}).randomMax ?? 2} 次(各剧本可用 ENCOUNTER 覆写)。本游戏共 ${rand.reduce((a, b) => a + b, 0)} 条,分布:${SCEN.map((k, i) => `${byKey[k].SCENARIO.name} ${rand[i]}`).join(' / ')}。`);
  w(`- **历史修正**:章末掷一次骰,按高/中/低三档决定是否触发一条修正(共 ${corr.reduce((a, b) => a + b, 0)} 条)。修正会改写本章的历史,通常伴随偏离度与属性变化。`);
  w();
}

/* ---------- 9. 门槛分布(不点名) ---------- */
w('## 九、事件选项的属性门槛分布');
w();
w('统计**各属性被当作门槛的次数**与**常见门槛值**,用来规划「先攒哪一项」。不列具体选项,不剧透。');
w();
{
  const need = {};
  const vals = {};
  for (const k of SCEN) {
    for (const ch of byKey[k].CHAPTERS || []) {
      for (const ev of ch.events || []) {
        for (const o of ev.options || []) {
          for (const [attr, need2] of Object.entries(o.req || {})) {
            if (typeof need2 !== 'number') continue;
            need[attr] = (need[attr] || 0) + 1;
            (vals[attr] = vals[attr] || new Set()).add(need2);
          }
        }
      }
    }
  }
  const names = byKey.lisi.ATTR_NAMES;
  tbl(['属性', '作门槛的选项数', '常见门槛值'],
    Object.entries(need).sort((a, b) => b[1] - a[1])
      .map(([attr, n]) => [names[attr] || attr, String(n), [...vals[attr]].sort((a, b) => a - b).map((x) => `≥${x}`).join(' ')]));
}

/* ---------- 10. 收集 ---------- */
w('## 十、跨局收集');
w();
{
  const tot = (key) => SCEN.reduce((n, k) => n + Object.keys(byKey[k][key] || {}).length, 0);
  const rows = SCEN.map((k) => [
    byKey[k].SCENARIO.name,
    String(Object.keys(byKey[k].ACHIEVEMENTS || {}).length),
    String(Object.keys(byKey[k].GLOSSARY || {}).length),
    String(Object.keys(byKey[k].ENDINGS || {}).length),
  ]);
  w('| 剧本 | 成就 | 百科词条 | 结局 |');
  w('|---|---|---|---|');
  for (const r of rows) w(`| ${r.join(' | ')} |`);
  w();
  w(`合计:**成就 ${tot('ACHIEVEMENTS')}**、**百科词条 ${tot('GLOSSARY')}**、**结局 ${tot('ENDINGS')}**。`);
  w();
  w('- 成就与词条**跨局累计**:中途退出也算数,回溯**不重置**已解锁的成就与词条。');
  w('- 词条是「百科」性质的收藏:读到了就进图鉴,可在图鉴页回看。');
  w();
}

/* ---------- 11. 规模 ---------- */
w('## 十一、五本剧本的体量');
w();
{
  const rows = SCEN.map((k) => {
    const d = byKey[k];
    const evs = (d.CHAPTERS || []).reduce((n, c) => n + (c.events || []).length, 0);
    const opts = (d.CHAPTERS || []).reduce((n, c) => n + (c.events || []).reduce((m, e) => m + (e.options || []).length, 0), 0);
    const kinds = {};
    for (const a of d.ACTIONS || []) kinds[a.type || '?'] = (kinds[a.type || '?'] || 0) + 1;
    return [d.SCENARIO.name, `${(d.CHAPTERS || []).length} 章`, String((d.ACTIONS || []).length),
      String(evs), String(opts), Object.entries(kinds).map(([kk, v]) => `${kk}${v}`).join(' ')];
  });
  tbl(['剧本', '章', '行动卡', '关键事件', '选项', '卡类分布'], rows);
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, L.join('\n') + '\n', 'utf8');
console.log(`已生成: ${path.relative(ROOT, OUT)}(${L.length} 行,数据指纹 ${FP})`);

/* ---------- 二、把文章里的数据表按标记块回填 ----------
 * 文章散文是手写的,但**表里每一个数字都来自数据** —— 手抄必错(实测属性评语就抄错过)。
 * 于是正文里用 <!-- AUTO:xxx --> … <!-- /AUTO:xxx --> 包住表格,这里按数据重填。
 * 数据一改,重跑本脚本,文章里的表自动跟上;标记块不见了会报错(提示手工补)。
 */
const ARTICLE = path.join(ROOT, 'docs', '攻略', '01-入局指南.md');

/** 表格生成器(与上面同口径) */
const mdTable = (head, rows) => {
  const out = [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`];
  for (const r of rows) out.push(`| ${r.join(' | ')} |`);
  return out.join('\n');
};

const blocks = {
  attrs: mdTable(['属性', '初值', '四档评语(高→低)'],
    byKey.lisi.ATTRS.map((x) => [
      byKey.lisi.ATTR_NAMES[x.k] || x.k,
      String(byKey.lisi.INIT[x.k] ?? '—'),
      (x.words || []).map(([t, w2]) => (t === 0 ? `0 ${w2}` : `≥${t} ${w2}`)).join(' / '),
    ])),
  bands: mdTable(['档位', '偏离度上限', '含义'],
    byKey.lisi.DEV_BANDS.map((b) => [b.name, `≤ ${b.max}`, {
      循史: '完整复刻了历史,连他的错误都没改',
      微澜: '大势之内的小挣扎,只在字里行间留了几处批注',
      改流: '走向开始变,史官的笔追不上了',
      逆天: '无人见过的新历史 —— 无论结局如何,它属于你',
    }[b.name] || ''])),
  risk: mdTable(['差距(还差几点)', '成算', '备注'],
    [['≤ 3', '七成', '几乎稳过'], ['4–6', '五成', ''], ['7–9', '四成', ''],
      ['10–12', '三成', ''], ['13–15', '两成', '不建议赌'], ['≥ 16', '一成半', '基本别赌']]
      .map((r) => [r[0], r[1], r[2]])),
  grade: mdTable(['评级', '总分门槛'],
    [['甲上', '95'], ['甲', '90'], ['甲下', '85'], ['乙上', '80'], ['乙', '70'], ['乙下', '60'],
      ['丙上', '50'], ['丙', '40'], ['丙下', '30'], ['丁', '兜底(不足 30)']]),
  diff: mdTable(['难度', '危机增长', '章末修正', '总分系数', '每章回溯', '会致死', '数值显示'],
    Object.entries(byKey.lisi.DIFFICULTY).map(([, v]) => [v.n, `×${v.wj}`, `×${v.corr}`, `×${v.coef}`,
      v.backtrack < 0 ? '无限' : `${v.backtrack} 次`, v.lethal ? '会' : '不会',
      v.hideAttrs ? '只给状态词' : '全可见'])),
  collect: mdTable(['剧本', '成就', '百科词条', '结局'],
    SCEN.map((k) => [byKey[k].SCENARIO.name,
      String(Object.keys(byKey[k].ACHIEVEMENTS || {}).length),
      String(Object.keys(byKey[k].GLOSSARY || {}).length),
      String(Object.keys(byKey[k].ENDINGS || {}).length)])),
  counts: mdTable(['项目', '数量'],
    [['成就', String(SCEN.reduce((n, k) => n + Object.keys(byKey[k].ACHIEVEMENTS || {}).length, 0))],
      ['百科词条', String(SCEN.reduce((n, k) => n + Object.keys(byKey[k].GLOSSARY || {}).length, 0))],
      ['结局', String(SCEN.reduce((n, k) => n + Object.keys(byKey[k].ENDINGS || {}).length, 0))],
      ['行动卡', String(SCEN.reduce((n, k) => n + (byKey[k].ACTIONS || []).length, 0))],
      ['关键事件', String(SCEN.reduce((n, k) => n + (byKey[k].CHAPTERS || []).reduce((n, c) => n + (c.events || []).length, 0), 0))],
      ['事件选项', String(SCEN.reduce((n, k) => n + (byKey[k].CHAPTERS || []).reduce((n, c) => n + (c.events || []).reduce((m, e) => m + (e.options || []).length, 0), 0), 0))]]),

  /* —— 论坛发布稿用的「列表卡」形态:手机上表格太挤,同样的数据用列表读 —— */
  attrsList: byKey.lisi.ATTRS.map((x) => {
    const nm = byKey.lisi.ATTR_NAMES[x.k] || x.k;
    const words = (x.words || []).map(([t, w2]) => (t === 0 ? `0 ${w2}` : `≥${t} ${w2}`)).join(' / ');
    return `- **${nm}**(初值 ${byKey.lisi.INIT[x.k] ?? '—'}):${words}`;
  }).join('\n'),
  diffList: Object.entries(byKey.lisi.DIFFICULTY).map(([, v]) => {
    const back = v.backtrack < 0 ? '无限回溯' : (v.backtrack ? `每章回溯 ${v.backtrack} 次` : '无回溯');
    return `- **${v.n}**:危机 ×${v.wj} · 章末修正 ×${v.corr} · 总分 ×${v.coef} · ${back} · ${v.lethal ? '会致死' : '不会死'} · ${v.hideAttrs ? '数值只给状态词' : '数值全可见'}`;
  }).join('\n'),
  riskList: [['≤ 3', '七成'], ['4–6', '五成'], ['7–9', '四成'], ['10–12', '三成'], ['13–15', '两成'], ['≥ 16', '一成半']]
    .map(([g, r]) => `- 还差 **${g}** 点 → 成算 **${r}**`).join('\n'),
  gradeList: [['甲上', '95'], ['甲', '90'], ['甲下', '85'], ['乙上', '80'], ['乙', '70'], ['乙下', '60'],
    ['丙上', '50'], ['丙', '40'], ['丙下', '30'], ['丁', '不足 30 分']]
    .map(([g, s2]) => `- **${g}** = ${s2} 分`).join('\n'),
  bandsList: byKey.lisi.DEV_BANDS.map((b) => `- **${b.name}**(≤ ${b.max}):${{
    循史: '完整复刻了历史,连他的错误都没改',
    微澜: '大势之内的小挣扎,只在字里行间留了几处批注',
    改流: '走向开始变,史官的笔追不上了',
    逆天: '无人见过的新历史 —— 无论结局如何,它属于你',
  }[b.name] || ''}`).join('\n'),
  collectList: (() => {
    const lines = SCEN.map((k) => `- **${byKey[k].SCENARIO.name}**:成就 ${Object.keys(byKey[k].ACHIEVEMENTS || {}).length} · 百科词条 ${Object.keys(byKey[k].GLOSSARY || {}).length} · 结局 ${Object.keys(byKey[k].ENDINGS || {}).length}`);
    const tot = (key) => SCEN.reduce((n, k) => n + Object.keys(byKey[k][key] || {}).length, 0);
    lines.push(`- **合计**:成就 ${tot('ACHIEVEMENTS')} · 百科词条 ${tot('GLOSSARY')} · 结局 ${tot('ENDINGS')}`);
    return lines.join('\n');
  })(),

  /* —— 第二篇《机制补遗》用的隐藏系统表 —— */
  meritList: SCEN.map((k) => {
    const map = byKey[k].MERIT_MAP || {};
    const items = Object.entries(map).map(([m, v]) => `${m} ${v}`).join(' · ');
    return `- **${byKey[k].SCENARIO.name}**:${items}`;
  }).join('\n'),
  hiddenList: SCEN.map((k) => {
    const h = byKey[k].HIDDEN || {};
    const words = (h.words || []).map(([t, w2]) => (t === 0 ? `0 ${w2}` : `≥${t} ${w2}`)).join(' / ');
    return `- **${byKey[k].SCENARIO.name}**(${h.name || '隐藏值'}):初值 ${h.init ?? '—'} · 第 ${h.showFrom ?? '—'} 章起显示状态词 · ${words}`;
  }).join('\n'),
  ageList: SCEN.map((k) => {
    const a = byKey[k].AGE || {};
    const bands = (a.bands || []).map(([age, d]) => (d === 0 ? `<${age} 不衰` : `${age}+ 体魄${d}`)).join(' · ');
    const lon = (a.longevity || []).map(([t, v]) => `体魄≥${t} 折寿+${v}`).join(' · ');
    return `- **${byKey[k].SCENARIO.name}**:起始 ${a.init ?? '—'} 岁 · ${bands} · 寿元:${lon || '无'}`;
  }).join('\n'),
  illnessList: SCEN.map((k) => {
    const ill = byKey[k].ILLNESS || {};
    if (!ill.cost) return `- **${byKey[k].SCENARIO.name}**:无疾病系统`;
    return `- **${byKey[k].SCENARIO.name}**:药资 ${ill.cost} 财富 · 药效 体魄+${ill.heal}(按实际生效值) · 染病 体魄−${ill.onsetTupo} 危机+${ill.onsetWeiji} · 大病每回合 体魄−${ill.drainTupo} 危机+${ill.drainWeiji}`;
  }).join('\n'),
};

if (fs.existsSync(ARTICLE)) {
  let art = fs.readFileSync(ARTICLE, 'utf8');
  let filled = 0;
  /** 用到的标记块(用于最后统计"哪些块没被任何稿件用上") */
  const used = new Set();
  for (const [name, table] of Object.entries(blocks)) {
    const re = new RegExp(`(<!-- AUTO:${name} -->)[\\s\\S]*?(<!-- /AUTO:${name} -->)`);
    if (!re.test(art)) { used.add(name); continue; }
    art = art.replace(re, `$1\n${table}\n$2`);
    filled += 1;
  }
  fs.writeFileSync(ARTICLE, art, 'utf8');
  console.log(`已回填文章表格: ${path.relative(ROOT, ARTICLE)}(${filled} 个标记块)`);
} else {
  console.warn(`  ! 找不到文章 ${path.relative(ROOT, ARTICLE)},跳过回填`);
}

/* 论坛发布稿等其它稿件:同样按标记块回填(谁有标记填谁) */
const GUIDE_DIR = path.join(ROOT, 'docs', '攻略');
for (const f of fs.existsSync(GUIDE_DIR) ? fs.readdirSync(GUIDE_DIR).filter((x) => x.endsWith('.md') && x !== '数据速查.md') : []) {
  const p = path.join(GUIDE_DIR, f);
  if (p === ARTICLE) continue;
  let txt = fs.readFileSync(p, 'utf8');
  if (!txt.includes('<!-- AUTO:')) continue;
  let n = 0;
  for (const [name, table] of Object.entries(blocks)) {
    const re = new RegExp(`(<!-- AUTO:${name} -->)[\\s\\S]*?(<!-- /AUTO:${name} -->)`);
    if (!re.test(txt)) continue;
    txt = txt.replace(re, `$1\n${table}\n$2`);
    n += 1;
  }
  fs.writeFileSync(p, txt, 'utf8');
  console.log(`已回填发布稿: docs/攻略/${f}(${n} 个标记块)`);
}
