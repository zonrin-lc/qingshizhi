/* 路径统计 v2：状态图 BFS（最短）+ DAG 记忆化 DFS（最长简单路径）
 * 状态 = (章, 事件, 阶段, 属性, 偏离, Flag, 史评, 功业)；修正事件随机性固定为不触发。
 *
 * v2.1.5 统计口径诚实化（GDD 附录 U.16）：本工具是**有界搜索**，不是穷尽证明。
 *   · 展开上限可调：--cap N（0 = 不限，慎用）；另有时间预算 --budget 秒（默认 1800，
 *     即与旧口径「跑满 40 万展开」等效，仅作超时保险）。
 *   · 触上限/超预算时，所有派生结论（结局覆盖、从未走到的事件、最短路径）一律标注
 *     「下界·未穷尽」，并给出未展开队列规模——**不得把「测不到」读成「不存在」**
 *     （与 balance-sim 的 U.12「策略集即测量栅栏」同源错误）。
 *   · 展开范围本身有限：回合阶段只 playCard(0) 走关键卡，行动卡不入状态图；
 *     际遇（R-*）受 randomChance / randomMax / cond 与章内牌堆非重复抽取限制，危机注入
 *     （C-*）在其确定性路径下可进入。注意本工具主 rng 虽为常量 0.99，但 `_stream('event')`
 *     会从主 rng 派生独立事件流并按序取值，故际遇闸门**并非恒不过**（实测 R-2 等已进入）。
 *     故覆盖统计按「章节事件 / 随机际遇 / 危机注入」三类分别列出未走到项，不混判。
 */
const D = require('./game-data.js');
const E = require('./engine.js');
const rng = () => 0.99;
function arg(name, def) {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}
const CAP = parseInt(arg('cap', '400000'), 10) === 0 ? Infinity : Math.max(1000, parseInt(arg('cap', '400000'), 10));
const BUDGET = Math.max(1, parseInt(arg('budget', '1800'), 10)) * 1000; // 默认 30min：与旧口径（跑满 --cap 40 万）一致，仅作超时保险

function clone(g) {
  const n = new E.Game(D, 'normal', rng);
  n.attrs = Object.assign({}, g.attrs);
  n.dev = g.dev; n.flags = Object.assign({}, g.flags);
  n.histScore = g.histScore; n.merits = g.merits.slice(); n.ach = g.ach.slice();
  n.keyChoices = g.keyChoices.slice(); n.peak = Object.assign({}, g.peak);
  n.coef = g.coef; n.backtracksThisChapter = g.backtracksThisChapter;
  n.chapterIdx = g.chapterIdx; n.eventId = g.eventId; n.phase = g.phase;
  n.introNotes = g.introNotes.slice(); n.pendingEndEvents = g.pendingEndEvents.slice();
  n.currentEndEvent = g.currentEndEvent; n.correction = g.correction;
  n.ending = g.ending; n.snapshot = g.snapshot; n._endEventsChecked = g._endEventsChecked;
  n.zg = g.zg; n.chapterDev = g.chapterDev.slice(); n._corrShown = g._corrShown; n._backlashDone = g._backlashDone;
  // 危机高值机制的插入状态（GDD 4.1）：C-DEATH 事件依赖 currentRandom 才能被 findEvent 找到
  n.currentRandom = g.currentRandom; n.pendingEventId = g.pendingEventId;
  n._crisisPlotPending = !!g._crisisPlotPending;
  // 回合制状态：playCard 依赖 offer/keyRoundsLeft；actionUses 沿关键卡展开恒为空、passedEvents 不影响选项可用性，
  // 二者不入指纹（避免状态爆炸），但须随克隆携带以保证引擎运转
  n.offer = g.offer ? g.offer.map(e => Object.assign({}, e)) : null;
  n.keyRoundsLeft = g.keyRoundsLeft;
  n.actionUses = Object.assign({}, g.actionUses || {});
  n.passedEvents = Object.assign({}, g.passedEvents || {});
  n._skipRandom = !!g._skipRandom;
  return n;
}
function fp(g) {
  // zg（赵高威胁度）在剧本中仅有 zgMax:49 一处判定，≥50 合并为同一桶，避免状态空间无谓膨胀
  return g.chapterIdx + '|' + g.eventId + '|' + g.phase + '|' + JSON.stringify(g.attrs) + '|' + g.dev + '|' + Math.min(g.zg, 50) + '|' +
    Object.keys(g.flags).sort().join(',') + '|' + (g.currentEndEvent ? g.currentEndEvent.id : '') + '|' + g.pendingEndEvents.length;
}

/* 推进到下一个决策点或结局；返回 {kind, clicks, ...} */
function advance(g) {
  let clicks = 0, guard = 0;
  while (guard++ < 300) {
    if (g.phase === 'ending') return { kind: 'ending', clicks, ending: g.ending };
    if (g.phase === 'intro') { clicks += g.chapter().intro.length; g.beginEvents(); continue; }
    // 回合边界先过遭遇闸门,与 H5 的 route() case 'round' 同口径。缺了它本工具
    // 只沿关键卡走,随机际遇/危机注入/逆天反噬一条都不进,路径统计与点击成本
    // 都会偏乐观。命中时引擎已切到 event,交给下方事件分支。
    if (g.phase === 'round') { clicks += 1; if (g.maybeRandom()) continue; g.playCard(0); continue; } // 只沿关键卡展开：行动卡视为回合外增益，不入路径（避免状态爆炸）
    if (g.phase === 'correction') { clicks += 1; g.correctionContinue(); continue; }
    if (g.phase === 'summary') { clicks += 1; g.proceedSummary(); continue; }
    if (g.phase === 'settle') { clicks += 1; g.proceed(); continue; }
    if (g.phase === 'endEvent') {
      const ev = g.currentEndEvent;
      return { kind: 'decision', clicks, evId: ev.id, options: ev.options.map((o, i) => ({ idx: i, t: o.t, locked: false })) };
    }
    if (g.phase === 'event') {
      const ev = g.findEvent(g.eventId);
      if (!ev) return { kind: 'dead', clicks };
      const segs = (ev.altSegs && g.flags[ev.altSegs.flag]) ? ev.altSegs.segs : ev.segs;
      clicks += segs.length;
      const opts = g.getOptions();
      return { kind: 'decision', clicks, evId: ev.id, options: opts.map((o, i) => ({ idx: i, t: o.opt.t, locked: o.locked })) };
    }
    return { kind: 'dead', clicks };
  }
  return { kind: 'dead', clicks };
}

/* 从决策点选择第 idx 项，推进到下一个节点 */
function succ(g, idx) {
  const g2 = clone(g);
  if (g2.phase === 'endEvent') g2.endEventChoose(idx);
  else g2.choose(idx);
  return advance(g2);
}

const endingsSeen = new Set();
const eventsSeen = new Set();
const mutationNotes = new Set();

/* ---------- 最长：DAG 记忆化 DFS（栈内查环，循环不计） ---------- */
const lmemo = new Map();
function longest(g, stack) {
  if (!dfsAbort && Date.now() - dfsT0 > DFS_BUDGET) dfsAbort = true;
  if (dfsAbort) return null;
  const node = advance(g);
  if (node.kind === 'ending') {
    endingsSeen.add(node.ending.id + (node.ending.variant ? '/' + node.ending.variant : ''));
    return { d: 0, c: node.clicks, ending: node.ending, path: [] };
  }
  if (node.kind !== 'decision') return null;
  eventsSeen.add(node.evId);
  const key = fp(g) + '@' + node.evId;
  if (stack.has(key)) return null; // 环：不允许重复状态
  if (lmemo.has(key)) {
    const m = lmemo.get(key);
    return { d: m.d, c: m.c + node.clicks - m.baseC, ending: m.ending, path: m.path };
  }
  stack.add(key);
  let bestR = null;
  for (const o of node.options) {
    if (o.locked) continue;
    const g2 = clone(g);
    if (g2.phase === 'endEvent') g2.endEventChoose(o.idx); else g2.choose(o.idx);
    const sub = longest(g2, stack);
    if (!sub) continue;
    const cand = { d: 1 + sub.d, c: node.clicks + 1 + sub.c, ending: sub.ending, path: [[node.evId, o.t]].concat(sub.path) };
    if (!bestR || cand.d > bestR.d || (cand.d === bestR.d && cand.c > bestR.c)) bestR = cand;
  }
  stack.delete(key);
  if (bestR) lmemo.set(key, { d: bestR.d, c: bestR.c, baseC: node.clicks, ending: bestR.ending, path: bestR.path });
  return bestR;
}

/* succK：把引擎与指纹挂到返回值（BFS 用） */
function succK(g, idx) {
  const g2 = clone(g);
  if (g2.phase === 'endEvent') g2.endEventChoose(idx); else g2.choose(idx);
  const node = advance(g2);
  node._g = g2;
  node._key = (node.kind === 'decision') ? fp(g2) + '@' + node.evId : 'ENDING@' + JSON.stringify(g2.ending && g2.ending.id + g2.ending.variant) ;
  return node;
}

/* BFS 重写（用 succK） */
function bfs2() {
  const g0 = new E.Game(D, 'normal', rng); g0.start();
  const first = advance(g0); first._g = g0;
  const k0 = (first.kind === 'decision') ? fp(g0) + '@' + first.evId : 'START';
  const best = new Map(); best.set(k0, { d: 0, c: first.clicks });
  const queue = [{ node: first, d: 0, c: first.clicks, path: [] }];
  let endMin = null; const perEnding = new Map();
  let expanded = 0;
  let truncated = false, reason = '';
  const t0 = Date.now();
  while (queue.length) {
    if (expanded >= CAP) { truncated = true; reason = `展开上限 ${CAP}`; break; }
    if (Date.now() - t0 > BUDGET) { truncated = true; reason = `时间预算 ${BUDGET / 1000}s`; break; }
    const cur = queue.shift(); expanded++;
    if (expanded % 20000 === 0) console.log(`  …已展开 ${expanded}，队列 ${queue.length}，去重状态 ${best.size}，${Date.now() - t0}ms`);
    if (cur.node.kind === 'ending') {
      const e = cur.node.ending;
      const k = e.id + (e.variant ? '/' + e.variant : '');
      endingsSeen.add(k);
      const rec = { d: cur.d, c: cur.c, ending: k, name: e.name, path: cur.path };
      if (!endMin || rec.d < endMin.d || (rec.d === endMin.d && rec.c < endMin.c)) endMin = rec;
      if (!perEnding.has(k) || rec.d < perEnding.get(k).d || (rec.d === perEnding.get(k).d && rec.c < perEnding.get(k).c)) perEnding.set(k, rec);
      continue;
    }
    if (cur.node.kind !== 'decision') continue;
    eventsSeen.add(cur.node.evId);
    cur.node._g.introNotes.forEach(n => mutationNotes.add(n.slice(0, 16)));
    for (const o of cur.node.options) {
      if (o.locked) continue;
      const nxt = succK(cur.node._g, o.idx);
      const nd = cur.d + 1, nc = cur.c + nxt.clicks + 1;
      const key = nxt._key;
      const b = best.get(key);
      if (b && (b.d < nd || (b.d === nd && b.c <= nc))) continue;
      best.set(key, { d: nd, c: nc });
      queue.push({ node: nxt, d: nd, c: nc, path: cur.path.concat([[cur.node.evId, o.t]]) });
    }
  }
  return { endMin, perEnding, expanded, states: best.size, truncated, reason, pending: queue.length };
}

console.log('—— 最短路径（BFS，单位成本=1 决策）——');
const r = bfs2();
const SCOPE = r.truncated ? `下界·未穷尽（${r.reason} 处截止，尚有 ${r.pending} 个状态未展开）` : '穷尽';
console.log(`展开决策点 ${r.expanded} 个，去重状态 ${r.states} 个 ｜ 搜索范围：${SCOPE}`);
if (r.truncated) console.log(`!! 本次为**下界**：以下结局覆盖与「从未走到的事件」都可能只是展开未及——需 --cap 0 或加大 --cap 复测后才可作结论。`);
if (r.endMin) {
  console.log(`全局最短：${r.endMin.d} 决策 / ${r.endMin.c} 点击 → ${r.endMin.ending}「${r.endMin.name}」`);
  console.log('路径：' + r.endMin.path.map(p => p[0] + '「' + p[1].slice(0, 12) + '」').join(' → '));
}
console.log('\n各结局最短到达：');
[...r.perEnding.keys()].sort().forEach(k => {
  const e = r.perEnding.get(k);
  console.log(`  ${e.ending}「${e.name}」：${e.d} 决策 / ${e.c} 点击`);
});

console.log(`\n—— 覆盖与死内容（BFS，口径：${SCOPE}） ——`);
console.log('结局覆盖' + (r.truncated ? '（下界）' : '') + '：' + [...endingsSeen].sort().join('、'));
console.log('节点异变触发：' + (mutationNotes.size ? [...mutationNotes].join('；') : '（仅章节固定事件）'));
const allEv = [];
D.CHAPTERS.forEach(c => c.events.forEach(e => allEv.push(e.id)));
const randomIds = (D.RANDOM_EVENTS || []).map(e => e.id);
const crisisIds = [];
if (D.CRISIS_EVENTS) {
  if (Array.isArray(D.CRISIS_EVENTS.plots)) D.CRISIS_EVENTS.plots.forEach(p => crisisIds.push(p.id));
  if (D.CRISIS_EVENTS.death && D.CRISIS_EVENTS.death.id) crisisIds.push(D.CRISIS_EVENTS.death.id);
  if (D.CRISIS_EVENTS.qingsuan && D.CRISIS_EVENTS.qingsuan.id) crisisIds.push(D.CRISIS_EVENTS.qingsuan.id);
}
console.log(`覆盖口径：${r.truncated ? '下界·未穷尽' : '穷尽'}（回合阶段只走关键卡，行动卡不入展开）`);
[['章节事件', allEv], ['随机际遇', randomIds], ['危机注入', crisisIds]].forEach(([label, ids]) => {
  const miss = ids.filter(id => !eventsSeen.has(id));
  const why = miss.length === 0 ? '' : (r.truncated
    ? '  ← 下界·可能只是展开未及，勿判作死内容（先用 --cap 0 或加大 --cap 复测）'
    : '  ← 穷尽口径下仍未进入：际遇类多为概率闸门/条件/配额未命中，亦非死内容');
  console.log(`${label}：${ids.length} 条，未走到 ${miss.length} 条 → ${miss.join('、') || '（全部覆盖）'}${why}`);
});
console.log('另注：BACKLASH（逆天反噬，偏离≥71 每章一次）与 C-DEATH/C-QS 属确定性注入，本工具会走到；');
console.log('      行动卡收益与「多买一回合」的路径不在本表内（回合阶段只 playCard(0)）。');

console.log('\n—— 最长路径（无重复状态的简单路径，预算 120s） ——');
const DFS_BUDGET = 120000;
const dfsT0 = Date.now();
let dfsAbort = false;
const g0 = new E.Game(D, 'normal', rng); g0.start();
const L = longest(g0, new Set());
if (dfsAbort || !L) console.log('最长路径：超出时间预算，已跳过（不影响上方覆盖统计）');
else {
  console.log(`全局最长：${L.d} 决策 / ${L.c} 点击 → ${L.ending.id}${L.ending.variant ? '/' + L.ending.variant : ''}「${L.ending.name}」`);
  console.log('路径：' + L.path.map(p => p[0]).join(' → '));
}
