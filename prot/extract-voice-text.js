// 从 prot/lua-data/*.json 抽取全部需配音的文本段,输出:
//   .tmp/voice/all.json      —— 全量清单 [{key, scen, chap, kind, ev, idx, text}]
//   .tmp/voice/batch-*.json  —— 分批(默认每批 N 条)
// 与 gen-voice-manifest.js 的文件命名约定保持一致。
const fs = require("fs");
const path = require("path");

const SCENARIOS = ["lisi", "jingke", "chensheng", "hanxin", "xiangyu"];
const BATCH = parseInt(process.argv[2] || "14", 10);
const OUT = ".tmp/voice";

const clean = (s) => String(s).replace(/⟦|⟧/g, "");

const items = [];
function push(scen, chap, kind, ev, idx, text) {
  if (!text) return;
  // 已有音频的段跳过(支持增量续铺)
  const key = kind === "intro"
    ? `${scen}_${chap}_intro_${idx}`
    : kind === "seg"
      ? `${scen}_${chap}_${ev}_s${idx}`
      : kind === "opt"
        ? `${scen}_${chap}_${ev}_o${idx}`
        : kind === "card"
          ? `${scen}_card_${ev}_s${idx}`
          : `${scen}_end_${ev}${idx ? "__" + idx : ""}`;
  if (fs.existsSync(`assets/audio/voice/${key}.ogg`)) return;   // 已生成,跳过
  items.push({ key, scen, chap, kind, ev, idx, text: clean(text) });
}

for (const sid of SCENARIOS) {
  const f = `prot/lua-data/${sid}.json`;
  if (!fs.existsSync(f)) continue;
  const d = JSON.parse(fs.readFileSync(f, "utf8"));

  for (const ch of (d.CHAPTERS || [])) {
    (ch.intro || []).forEach((s, j) => push(sid, ch.id, "intro", null, j + 1, s));
    for (const e of (ch.events || [])) {
      (e.segs || []).forEach((s, j) => push(sid, ch.id, "seg", e.id, j + 1, s));
      (e.options || []).forEach((o, j) => push(sid, ch.id, "opt", e.id, j + 1, o.res));
    }
    for (const e of (ch.endEvents || [])) {
      (e.segs || []).forEach((s, j) => push(sid, ch.id, "seg", e.id, j + 1, s));
    }
  }

  for (const a of (d.ACTIONS || [])) {
    if (!a || !a.choice) continue;
    (a.choice.segs || []).forEach((s, j) => push(sid, "card", "card", a.id, j + 1, s));
  }

  const E = d.ENDINGS || {};
  for (const k of Object.keys(E)) {
    push(sid, "end", "end", k, null, E[k].zhuan);
    for (const vk of Object.keys(E[k].variants || {})) {
      push(sid, "end", "end", k, vk, E[k].variants[vk].zhuan);
    }
  }
}

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(`${OUT}/all.json`, JSON.stringify(items, null, 2));

let totalChars = 0;
for (const it of items) totalChars += it.text.length;
console.log(`total items: ${items.length}, total chars: ${totalChars}`);
const byScen = {};
for (const it of items) byScen[it.scen] = (byScen[it.scen] || 0) + 1;
console.log("by scenario:", JSON.stringify(byScen));

const batches = [];
for (let i = 0; i < items.length; i += BATCH) batches.push(items.slice(i, i + BATCH));
console.log(`batches (size ${BATCH}): ${batches.length}`);
fs.writeFileSync(`${OUT}/batch-count.txt`, String(batches.length));
