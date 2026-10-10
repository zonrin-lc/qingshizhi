/* P1 golden 生成器(对拍台)
 * 思路:用 JS 引擎驱动若干局"回放型"对局——记录每一步的**决策序列**(phase+选择下标)
 * 与**终局快照**(ending/variant/grade/total/dev/chapter/attrs 全量/章末段位序列)。
 * Lua 侧(P2)只需按同一决策序列回放,终局必须逐字段一致。
 * 决策序列法的好处:策略实现(hist/nitian 的巨型偏好表)无需翻译——Lua 侧是纯执行器。
 * 引擎的随机性(际遇/抽卡/修正/掷骰)仍由种子驱动,序列相同+种子相同 ⇒ 全轨迹相同。
 */
const fs = require('fs');
const path = require('path');
const { P } = require('./paths');
const E = require('./engine.js');

const FILES = { lisi: 'game-data.js', jingke: 'jingke-data.js', hanxin: 'hanxin-data.js', xiangyu: 'xiangyu-data.js', chensheng: 'chensheng-data.js' };
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    var t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
// 简单确定性策略(供对拍,不用平衡侧的复杂 STRATEGIES)
function pickByRng(options, rng) {
  const unlocked = [];
  options.forEach((o, i) => { if (!o.locked) unlocked.push(i); });
  if (!unlocked.length) return 0;
  return unlocked[Math.floor(rng() * unlocked.length)];
}

function driveGame(D, diffKey, seed) {
  const rng = mulberry32(seed);
  const g = new E.Game(D, diffKey, mulberry32(seed));
  const steps = []; let guard = 0;
  g.__bands = [];
  const origCE = g.chapterEnd.bind(g);
  g.chapterEnd = function () { g.__bands.push(g.devBand()); return origCE(); };
  g.start();
  while (g.phase !== 'ending' && guard++ < 400) {
    if (g.phase === 'intro') { g.beginEvents(); steps.push(['intro']); continue; }
    if (g.phase === 'round') {
      const offer = g.getOffer();
      // 确定性:优先关键卡(0),否则随机行动卡;偶发蓄势(每 7 步一次蓄势,覆盖 playXushi 路径)
      let ci = 0;
      if (steps.length % 7 === 3 && offer.length > 1 && !offer[1].locked) { ci = -1; }
      else { ci = pickByRng(offer, rng); }
      if (ci === -1) {
        const rx = g.playXushi();
        if (!rx) { g.playCard(0); steps.push(['card', 0]); } else steps.push(['xushi']);
      } else {
        const r = g.playCard(ci);
        if (!r) { g.playCard(0); steps.push(['card', 0]); } else steps.push(['card', ci]);
      }
      continue;
    }
    if (g.phase === 'correction') { g.correctionContinue(); steps.push(['corr']); continue; }
    if (g.phase === 'summary') { g.proceedSummary(); steps.push(['sum']); continue; }
    if (g.phase === 'endEvent') {
      const opts = g.currentEndEvent.options.map(o => ({ locked: o.req ? !g.check(o.req).ok : false }));
      const i = pickByRng(opts, rng);
      g.endEventChoose(i); steps.push(['endev', i]); continue;
    }
    if (g.phase === 'event') {
      const opts = g.getOptions();
      const i = pickByRng(opts.map(o => ({ locked: o.locked })), rng);
      g.choose(i); steps.push(['ev', i]); continue;
    }
    if (g.phase === 'settle') { g.proceed(); steps.push(['settle']); continue; }
    if (g.phase === 'choice') {
      const v = g.getChoiceCard();
      const i = Math.floor(rng() * v.options.length);
      g.chooseCardOption(i); steps.push(['copt', i]); continue;
    }
    throw new Error('unknown phase ' + g.phase);
  }
  if (g.phase !== 'ending') throw new Error('no ending in 400 steps');
  const snap = {
    diff: diffKey, seed: seed,
    ending: g.ending.id, variant: g.ending.variant || null,
    grade: g.ending.grade, total: g.ending.total,
    dev: g.dev, chapter: g.chapterIdx, bands: g.__bands,
    attrs: Object.assign({}, g.attrs),
    steps
  };
  return snap;
}

const golden = {};
for (const scen in FILES) {
  const D = require(path.join(__dirname, FILES[scen]));
  golden[scen] = [];
  const diffs = ['story', 'normal', 'hardcore'];
  const base = 1000 + scen.charCodeAt(0) * 131;
  for (let i = 0; i < 20; i++) {
    const diff = diffs[i % 3];
    const seed = base + i * 7919;
    try { golden[scen].push(driveGame(D, diff, seed)); }
    catch (e) { golden[scen].push({ error: String(e.message).slice(0, 100), diff, seed }); }
  }
  console.log(scen, 'games:', golden[scen].length, 'errors:', golden[scen].filter(x => x.error).length);
}
const GOLDEN_OUT = path.join(P.PROT_LUA_DATA, 'golden.json');
fs.writeFileSync(GOLDEN_OUT, JSON.stringify(golden));
console.log('golden written, bytes=', fs.statSync(GOLDEN_OUT).size);
