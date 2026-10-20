/**
 * 配音清单生成器(2026-10-17 合并口径,与 lisi-voice-manifest.json 逐条对齐)。
 * 用法: node build-voice-manifest.cjs <scenarioKey> [<scenarioKey>...]
 * 产物: C:/Users/28283/.kimi-code/vm/<key>-manifest.json
 *
 * 口径(2026-10-17 用户拍板):
 *   配音:章首 intro、主线事件 segs(含章末事件 cj-*)、抉择卡 segs+选项结算、
 *        结局 zhuan(含变体)、危机事件 segs+选项结算、历史修正 corr;
 *   不配:主线事件选项结算、随机事件(R-*)正文与结算;
 *   合并:同一叙事单元的多段合并成一条,每段前加「。」(段界成「。。」,作长停顿);
 *   清洗:⟦⟧ 词条标记与【历史修正】UI 标签剥掉,不送 TTS。
 */
const fs = require('fs');
const path = require('path');

const OUT = 'C:/Users/28283/.kimi-code/vm';
fs.mkdirSync(OUT, { recursive: true });

const strip = (s) => s.replace(/⟦|⟧/g, '').replace(/【历史修正】/g, '');
/** 多段合并:每段前「。」;单段同样只加一个前缀 */
const merge = (segs) => '。' + segs.map(strip).join('。');
const single = (s) => '。' + strip(s);

for (const key of process.argv.slice(2)) {
  const j = require(`D:/MUSI/QINGSHIZHI/prot/lua-data/${key}.json`);
  const out = [];
  const seen = new Set();
  const push = (dir, name, text) => {
    const k = `${dir}/${name}`;
    if (seen.has(k)) throw new Error(`dup ${k}`);
    seen.add(k);
    out.push({ dir, name, text });
  };

  // 章:intro + 主线事件(不含选项结算) + 章末事件
  for (const ch of j.CHAPTERS ?? []) {
    const dir = ch.id;
    if ((ch.intro ?? []).length) push(dir, 'intro', merge(ch.intro));
    for (const ev of ch.events ?? []) {
      if ((ev.segs ?? []).length) push(dir, ev.id, merge(ev.segs));
    }
    for (const ev of ch.endEvents ?? []) {
      if ((ev.segs ?? []).length) push(dir, ev.id, merge(ev.segs));
    }
  }

  // 抉择卡(跨章 → _shared)
  for (const a of j.ACTIONS ?? []) {
    const c = a.choice;
    if (!c) continue;
    if ((c.segs ?? []).length) push('_shared', `choice_${a.id}`, merge(c.segs));
    (c.options ?? []).forEach((o, i) => {
      if (o.res) push('_shared', `choice_${a.id}_o${i + 1}`, single(o.res));
    });
  }

  // 结局太史公曰(含变体)
  for (const [eid, e] of Object.entries(j.ENDINGS ?? {})) {
    if (e.zhuan) push('_shared', `ending_${eid}`, single(e.zhuan));
    for (const [v, ve] of Object.entries(e.variants ?? {})) {
      if (ve.zhuan) push('_shared', `ending_${eid}_${v}`, single(ve.zhuan));
    }
  }

  // 危机事件(plots + death + qingsuan)
  const CE = j.CRISIS_EVENTS ?? {};
  const crises = [...(CE.plots ?? []), CE.death, CE.qingsuan].filter(Boolean);
  for (const ev of crises) {
    if ((ev.segs ?? []).length) push('_shared', `crisis_${ev.id}`, merge(ev.segs));
    (ev.options ?? []).forEach((o, i) => {
      if (o.res) push('_shared', `crisis_${ev.id}_o${i + 1}`, single(o.res));
    });
  }

  // 历史修正
  (j.CORRECTIONS ?? []).forEach((c, i) => {
    if ((c.segs ?? []).length) push('_shared', `corr_${i}`, merge(c.segs));
  });

  fs.writeFileSync(path.join(OUT, `${key}-manifest.json`), JSON.stringify(out, null, 1));
  const chars = out.reduce((s, e) => s + e.text.length, 0);
  console.log(`${key}: ${out.length} 条, ${chars} 字`);
}
