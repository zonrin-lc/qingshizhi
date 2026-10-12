// 抽取随机事件(RANDOM_EVENTS)与危机事件(CRISIS_EVENTS)的配音文本。
// 与主线分开,输出 .tmp/voice/extra.json(独立于 all.json,避免并发冲突)。
// 命名:随机 <scen>_rand_<id>_s<n>/_o<n> ;危机 <scen>_crisis_<id>_s<n>/_o<n>
const fs = require("fs");

const SCENARIOS = ["lisi", "jingke", "chensheng", "hanxin", "xiangyu"];
const OUT = ".tmp/voice";
const clean = (s) => String(s).replace(/⟦|⟧/g, "");

const items = [];
function push(scen, prefix, id, idx, kind, text) {
  if (!text) return;
  const key = `${scen}_${prefix}_${id}_${kind}${idx}`;
  if (fs.existsSync(`assets/audio/voice/${key}.ogg`)) return;
  items.push({ key, scen, text: clean(text) });
}

for (const sid of SCENARIOS) {
  const f = `prot/lua-data/${sid}.json`;
  if (!fs.existsSync(f)) continue;
  const d = JSON.parse(fs.readFileSync(f, "utf8"));

  for (const r of (d.RANDOM_EVENTS || [])) {
    (r.segs || []).forEach((s, j) => push(sid, "rand", r.id, j + 1, "s", s));
    (r.options || []).forEach((o, j) => push(sid, "rand", r.id, j + 1, "o", o.res));
  }

  const CE = d.CRISIS_EVENTS || {};
  const groups = [];
  if (Array.isArray(CE.plots)) groups.push(...CE.plots);
  if (CE.death) groups.push(CE.death);
  if (CE.qingsuan) groups.push(CE.qingsuan);
  for (const c of groups) {
    (c.segs || []).forEach((s, j) => push(sid, "crisis", c.id, j + 1, "s", s));
    (c.options || []).forEach((o, j) => push(sid, "crisis", c.id, j + 1, "o", o.res));
  }

  // 历史修正(CORRECTIONS,无 id,按下标编号)
  (d.CORRECTIONS || []).forEach((c, ci) => {
    (c.segs || []).forEach((s, j) => push(sid, "corr", ci + 1, j + 1, "s", s));
  });
}

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(`${OUT}/extra.json`, JSON.stringify(items, null, 2));
console.log(`extra items: ${items.length}`);
