// 从 prot/lua-data/*.json 权威顺序生成配音清单,仅收录磁盘上实际存在的音频文件。
// 输出:scripts/qingshi/data/voice-manifest.lua
//
// 文件命名约定:
//   章节 intro : <scen>_<chap>_intro_<n>.ogg
//   事件 segs  : <scen>_<chap>_<eventId>_s<n>.ogg   (章末事件复用同方案,其 id 独立)
//   选项结算   : <scen>_<chap>_<eventId>_o<n>.ogg
//   抉择卡 segs: <scen>_card_<actionId>_s<n>.ogg
//   结局 zhuan : <scen>_end_<key>.ogg / <scen>_end_<key>__<variant>.ogg
const fs = require("fs");
const path = require("path");

const VOICE_DIR = "assets/audio/voice";
const SCENARIOS = ["lisi", "jingke", "chensheng", "hanxin", "xiangyu"];

function rel(p) { return "audio/voice/" + path.basename(p); }
function exists(p) { return fs.existsSync(p); }
function pick(prefix, suffix, n) {
  const out = [];
  for (let i = 1; i <= n; i++) {
    const f = VOICE_DIR + "/" + prefix + suffix + i + ".ogg";
    if (exists(f)) out.push(rel(f));
  }
  return out;
}

const chapters = {};
const endings = {};
const cards = {};
const specials = {};
let count = 0;

for (const sid of SCENARIOS) {
  const jf = "prot/lua-data/" + sid + ".json";
  if (!exists(jf)) continue;
  const d = JSON.parse(fs.readFileSync(jf, "utf8"));

  // ---- 章节 ----
  const chOut = {};
  for (const ch of (d.CHAPTERS || [])) {
    const prefix = sid + "_" + ch.id + "_";
    const entry = { events: {} };

    const intro = pick(prefix, "intro_", (ch.intro || []).length);
    if (intro.length) entry.intro = intro;

    for (const e of (ch.events || [])) {
      const segs = pick(prefix, e.id + "_s", (e.segs || []).length);
      const opts = pick(prefix, e.id + "_o", (e.options || []).length);
      if (segs.length || opts.length) entry.events[e.id] = { segs: segs, opts: opts };
    }
    for (const e of (ch.endEvents || [])) {
      const segs = pick(prefix, e.id + "_s", (e.segs || []).length);
      if (segs.length) entry.events[e.id] = { segs: segs, opts: [] };
    }
    if (entry.intro || Object.keys(entry.events).length) chOut[ch.id] = entry;
  }
  if (Object.keys(chOut).length) chapters[sid] = chOut;

  // ---- 抉择卡(ACTIONS 中带 choice 的项)----
  const cardOut = {};
  for (const a of (d.ACTIONS || [])) {
    if (!a || !a.choice) continue;
    const segs = pick(sid + "_card_", a.id + "_s", (a.choice.segs || []).length);
    if (segs.length) cardOut[a.id] = { segs: segs };
  }
  if (Object.keys(cardOut).length) cards[sid] = cardOut;

  // ---- 结局 ----
  const endOut = {};
  const E = d.ENDINGS || {};
  for (const key of Object.keys(E)) {
    const base = VOICE_DIR + "/" + sid + "_end_" + key + ".ogg";
    if (exists(base)) endOut[key] = rel(base);
    const variants = E[key].variants || {};
    for (const vk of Object.keys(variants)) {
      const vf = VOICE_DIR + "/" + sid + "_end_" + key + "__" + vk + ".ogg";
      if (exists(vf)) endOut[key + "__" + vk] = rel(vf);
    }
  }
  if (Object.keys(endOut).length) endings[sid] = endOut;

  // ---- 随机/危机/修正事件(specials[剧本][事件id] = {segs, opts})----
  const specOut = {};
  const addSpecial = (prefix, id, segs, opts) => {
    if (segs.length || opts.length) specOut[id] = { segs: segs, opts: opts };
  };
  for (const r of (d.RANDOM_EVENTS || [])) {
    addSpecial("rand", r.id,
      pick(sid + "_rand_", r.id + "_s", (r.segs || []).length),
      pick(sid + "_rand_", r.id + "_o", (r.options || []).length));
  }
  const CE = d.CRISIS_EVENTS || {};
  const cGroups = [];
  if (Array.isArray(CE.plots)) cGroups.push(...CE.plots);
  if (CE.death) cGroups.push(CE.death);
  if (CE.qingsuan) cGroups.push(CE.qingsuan);
  for (const c of cGroups) {
    addSpecial("crisis", c.id,
      pick(sid + "_crisis_", c.id + "_s", (c.segs || []).length),
      pick(sid + "_crisis_", c.id + "_o", (c.options || []).length));
  }
  (d.CORRECTIONS || []).forEach((c, ci) => {
    const id = "corr" + (ci + 1);
    addSpecial("corr", id,
      pick(sid + "_corr_" + (ci + 1) + "_", "s", (c.segs || []).length), []);
  });
  if (Object.keys(specOut).length) specials[sid] = specOut;
}

function luaStr(s) { return '"' + s + '"'; }
function luaArr(a) { return "{ " + a.map(luaStr).join(", ") + " }"; }

const L = [];
L.push("-- 自动生成:配音清单(gen-manifest.js)。仅收录磁盘上存在的音频,勿手改。");
L.push("-- chapters[剧本][章节] = { intro={路径...}, events={ [事件id]={segs={...},opts={...}} } }");
L.push("-- cards[剧本][行动id] = { segs={...} } ; endings[剧本][结局key(可含__变体)] = 路径");
L.push("-- specials[剧本][事件id] = { segs={...}, opts={...} }(随机/危机/修正事件)");
L.push("return {");

L.push("  chapters = {");
for (const sid of Object.keys(chapters)) {
  L.push("    " + sid + " = {");
  for (const cid of Object.keys(chapters[sid])) {
    const c = chapters[sid][cid];
    L.push("      " + cid + " = {");
    if (c.intro) { L.push("        intro = " + luaArr(c.intro) + ","); count += c.intro.length; }
    L.push("        events = {");
    for (const eid of Object.keys(c.events)) {
      const e = c.events[eid];
      const parts = [];
      if (e.segs.length) { parts.push("segs = " + luaArr(e.segs)); count += e.segs.length; }
      if (e.opts.length) { parts.push("opts = " + luaArr(e.opts)); count += e.opts.length; }
      L.push("          [" + luaStr(eid) + "] = { " + parts.join(", ") + " },");
    }
    L.push("        },");
    L.push("      },");
  }
  L.push("    },");
}
L.push("  },");

L.push("  cards = {");
for (const sid of Object.keys(cards)) {
  L.push("    " + sid + " = {");
  for (const aid of Object.keys(cards[sid])) {
    const segs = cards[sid][aid].segs; count += segs.length;
    L.push("      [" + luaStr(aid) + "] = { segs = " + luaArr(segs) + " },");
  }
  L.push("    },");
}
L.push("  },");

L.push("  endings = {");
for (const sid of Object.keys(endings)) {
  L.push("    " + sid + " = {");
  for (const k of Object.keys(endings[sid])) {
    count += 1;
    L.push("      [" + luaStr(k) + "] = " + luaStr(endings[sid][k]) + ",");
  }
  L.push("    },");
}
L.push("  },");

L.push("  specials = {");
for (const sid of Object.keys(specials)) {
  L.push("    " + sid + " = {");
  for (const eid of Object.keys(specials[sid])) {
    const e = specials[sid][eid];
    const parts = [];
    if (e.segs.length) { parts.push("segs = " + luaArr(e.segs)); count += e.segs.length; }
    if (e.opts.length) { parts.push("opts = " + luaArr(e.opts)); count += e.opts.length; }
    L.push("      [" + luaStr(eid) + "] = { " + parts.join(", ") + " },");
  }
  L.push("    },");
}
L.push("  },");
L.push("}");

fs.writeFileSync("scripts/qingshi/data/voice-manifest.lua", L.join("\n") + "\n");
console.log("manifest written, files referenced:", count);
