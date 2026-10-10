/* 自动化剧本验证：用脚本化选择驱动引擎，断言各路线收束到正确结局。
 * 运行：node test-sim.js
 */
const D = require('./game-data.js');
const E = require('./engine.js');

// 固定随机序列（修正事件的 30% 概率可预期）：全部返回 0.99 → 不触发概率修正
const rngHigh = () => 0.99;
// 全部返回 0.01 → 必然触发概率修正
const rngLow = () => 0.01;

/* v1.8 疾病系统（李斯本 ILLNESS 开启）：出牌即掷发病（ill 流）。
 * 全套件统一经 mkGame 构造 Game，默认注入 ill 流恒 0.99（≥发病率上限 0.35，永不发病），
 * 保证既有路线断言的确定性轨迹不受新增随机源干扰；疾病专项用例（#59–#62、#65）经 streams.ill 自注序列。 */
const ILL_NEVER = () => 0.99;
function illSeq(vals) { let i = 0; return () => vals[Math.min(i++, vals.length - 1)]; }
function mkGame(diffKey, rng, streams) {
  return new E.Game(D, diffKey, rng, Object.assign({ ill: ILL_NEVER }, streams));
}

// trace 条目：[事件id, 选项文本, 决策时偏离度]；hook(g) 每步回调，用于中间态构造/观测（如改 dev、检查章末事件锁定）
function play(diffKey, script, rng, endScript, hook) {
  const g = mkGame(diffKey, rng || rngHigh);
  g.randomOn = false; // 剧本路线断言需确定性，随机际遇单独测试
  g.start();
  let guard = 0;
  const trace = [];
  while (g.phase !== 'ending' && guard++ < 400) {
    if (hook) hook(g);
    if (g.phase === 'intro') { g.beginEvents(); continue; }
    if (g.phase === 'round') {
      const offer = g.getOffer();
      const keyId = offer[0].eventId;
      if (script[keyId] != null) { g.playCard(0); continue; } // 有指定：点关键卡，event 阶段照原逻辑按 script 选选项
      // 无指定：点第一张未锁定、非险招且本章未用过的行动卡（都用过则第一张未锁定非险招；全锁兜底点关键卡）。
      // 优先未用过的卡可避免确定性发牌下同一张卡连刷三次造成的属性漂移（如 ACT-18 才学-2×3 锁死后续 scripted 门槛），
      // 同时覆盖更多卡面与递减计数；险招卡带掷骰随机，通用选择跳过以保路线确定性（险招语义由专门用例覆盖）。
      let ai = -1;
      for (let i = 1; i < offer.length; i++) if (!offer[i].locked && !offer[i].risky && !offer[i].choice && offer[i].usedCount === 0) { ai = i; break; }
      if (ai < 0) for (let i = 1; i < offer.length; i++) if (!offer[i].locked && !offer[i].risky && !offer[i].choice) { ai = i; break; }
      if (ai < 0) ai = 0;
      const r = g.playCard(ai);
      if (!r) { g.playCard(0); continue; }
      if (r.kind === 'action' && r.forcedKey) {
        // 倒计时归零：强制进入关键事件抉择页（玩家亲选）；事件选择由下一轮 event 分支按 script 处理
        trace.push([keyId, '（倒计时归零·强制抉择）', g.dev]);
      }
      continue; // forcedEnding 时 phase='settle'，由 settle 分支 proceed 收束
    }
    if (g.phase === 'correction') { trace.push(['修正', g.correction.title, g.dev]); g.correctionContinue(); continue; }
    if (g.phase === 'summary') { g._summaryCount = (g._summaryCount || 0) + 1; g.proceedSummary(); continue; }
    if (g.phase === 'endEvent') {
      const ev = g.currentEndEvent;
      const idx = pickIndex(ev.options, script[ev.id] != null ? script[ev.id] : (endScript && endScript[ev.id]));
      if (idx == null) throw new Error('章末事件 ' + ev.id + ' 没有可用选择（script 未指定或选项锁定）');
      trace.push([ev.id, ev.options[idx].t, g.dev]);
      g.endEventChoose(idx);
      continue;
    }
    if (g.phase === 'event') {
      const ev = g.findEvent(g.eventId);
      const opts = g.getOptions();
      let idx = pickIndex(ev.options, script[ev.id], opts);
      if (idx == null) throw new Error('事件 ' + ev.id + ' 没有可用选择（script 未指定或全部锁定）');
      trace.push([ev.id, ev.options[idx].t, g.dev]);
      g.choose(idx);
      continue;
    }
    // 抉择卡默认不入自动出牌（避免挤占剧本既定路线）；脚本显式指定时仍会走到这里
    if (g.phase === 'choice') {
      const v = g.getChoiceCard();
      trace.push([v.id, v.options[0].t, g.dev]);
      g.chooseCardOption(0);
      continue;
    }
    if (g.phase === 'settle') { g.proceed(); continue; }
    throw new Error('未知阶段 ' + g.phase);
  }
  if (g.phase !== 'ending') throw new Error('未能在限定步数内到达结局');
  return { g, trace };
}

// 驱动到指定剧本事件（phase==='event' 且 eventId===stopId）停下，用于结算条目级断言。
// picks：{ 事件id: 选项下标 }，缺省选第一个未锁定项；只适用于不遇章末事件/修正的路线
function driveTo(stopId, picks) {
  const g = mkGame('normal', rngHigh);
  g.randomOn = false;
  g.start();
  let guard = 0;
  while (guard++ < 200) {
    if (g.phase === 'event' && g.eventId === stopId) return g;
    if (g.phase === 'intro') { g.beginEvents(); continue; }
    if (g.phase === 'round') { g.playCard(0); continue; } // 线性流：每回合直接点关键卡（stopId 于 event 阶段返回）
    if (g.phase === 'summary') { g.proceedSummary(); continue; }
    if (g.phase === 'event') {
      const opts = g.getOptions();
      let i = picks && picks[g.eventId];
      if (i == null) { for (let k = 0; k < opts.length; k++) if (!opts[k].locked) { i = k; break; } }
      if (i == null) throw new Error('事件 ' + g.eventId + ' 全部锁定');
      g.choose(i);
      continue;
    }
    if (g.phase === 'settle') { g.proceed(); continue; }
    throw new Error('driveTo 遇意外阶段 ' + g.phase + '（' + g.eventId + '）');
  }
  throw new Error('driveTo 未能在限定步数内到达 ' + stopId);
}

function pickIndex(options, want, wrapped) {
  if (want == null) {
    // 默认选第一个未锁定
    if (wrapped) { for (let i = 0; i < wrapped.length; i++) if (!wrapped[i].locked) return i; return null; }
    return 0;
  }
  if (typeof want === 'number') return want;
  // 按文本包含匹配
  for (let i = 0; i < options.length; i++) {
    const t = options[i].t || options[i].opt && options[i].opt.t;
    if (t && t.indexOf(want) >= 0) {
      if (wrapped && wrapped[i].locked) return null;
      return i;
    }
  }
  return null;
}

let pass = 0, fail = 0;
function expect(name, actual, wantId, wantVariant) {
  const ok = actual.id === wantId && (wantVariant === undefined || actual.variant === wantVariant);
  if (ok) { pass++; console.log(`✔ ${name} → ${actual.id}${actual.variant ? '/' + actual.variant : ''}「${actual.name}」 总分 ${actual.total} 评级 ${actual.grade} 偏离 ${actual.dev}`); }
  else { fail++; console.log(`✘ ${name} 期望 ${wantId}/${wantVariant || '-'}，实际 ${actual.id}/${actual.variant || '-'}「${actual.name}」`); }
}

/* ---------- 1. 史实线 → E1 东市之叹 ---------- */
{
  const { g } = play('normal', {
    '0-1': '驻足细想', '0-2': '辞去吏职', '0-4': '仓中鼠',
    '1-1': '潜心问学', '1-2': '西入秦', '1-3': '细察秦国民情',
    '2-1': '埋头著文', '2-2': '灭诸侯、成帝业', '2-3': '上书自辩', '2-4': '全力经略',
    '3-1': '拖延时日', '3-2': '上书——',
    '4-1': '物禁大盛', '4-2': '弹劾韩非', '4-3': '独排众议', '4-4': '倾力推行', '4-5': '上焚书议', '4-6': '缄默',
    '5-1': '怒斥', '5-2': '从之。矫诏',
    '6-1': '上督责书', '6-2': '照常入谏', '6-3': '狱中上书'
  });
  expect('史实线', g.ending, 'E1');
  if (g.dev !== 0) { fail++; console.log('✘ 史实线偏离应为 0，实际 ' + g.dev); } else { pass++; }
  if (g.ending.review.length !== 5) { fail++; console.log('✘ 复盘应为 5 条，实际 ' + g.ending.review.length); } else { pass++; }
  if (g.ach.includes('dongmen') && g.ach.includes('shaqiu')) { pass++; console.log('✔ 结局成就解锁：东门黄犬、沙丘之夜'); }
  else { fail++; console.log('✘ E1 线应解锁成就 dongmen/shaqiu，实际 ' + g.ach.join('、')); }
  if (!g.ach.includes('shutongwen')) { pass++; console.log('✔ 声望 37<60，书同文成就未解锁（门槛生效）'); }
  else { fail++; console.log('✘ 低声望线不应解锁书同文成就'); }
  if (g._summaryCount === 6) { pass++; console.log('✔ 章末结算页经过 6 次'); }
  else { fail++; console.log('✘ 章末结算页次数异常：' + g._summaryCount); }
}

/* ---------- 2. 苟活线 → E2 上蔡旧吏 ---------- */
{
  const { g } = play('normal', { '0-1': '嗟叹', '0-2': '忍了', '0-3': '罢了' });
  expect('苟活线（留守）', g.ending, 'E2', 'jiuli');
}

/* ---------- 2b. 苟活线 → E2 兰陵归鼠（儒林） ---------- */
{
  const { g } = play('normal', { '0-2': '辞去吏职', '1-2': '留兰陵', '1-5': '继续著述' });
  expect('苟活线（儒林）', g.ending, 'E2');
}

/* ---------- 3. 逐客线 → E3 东门逐客 ---------- */
{
  const { g } = play('normal', {
    '0-2': '辞去吏职', '1-2': '西入秦', '2-1': '埋头著文', '2-2': '灭诸侯', '2-3': '闭门谢客', '2-4': '只做离间',
    '3-1': '认命出关'
  });
  expect('逐客线', g.ending, 'E3');
}

/* ---------- 4. 逆天线 → E6 扶苏新政 ---------- */
{
  const { g, trace } = play('normal', {
    '0-1': '驻足细想', '0-2': '辞去吏职',
    '1-1': '潜心问学', '1-2': '西入秦', '1-3': '细察秦国民情',
    '2-1': '埋头著文', '2-2': '灭诸侯', '2-3': '为吕不韦收尸', '2-4': '只做离间',
    '3-1': '拖延时日', '3-2': '上书——',
    '4-1': '物禁大盛', '4-2': '举荐韩非', '4-3': '独排众议', '4-4': '倾力推行', '4-5': '连署', '4-6': '为扶苏缓颊',
    'cj-yaojia': '挺身力保', 'cj-tuiyin': '再留一程',
    '5-1': '怒斥', '5-2': '反客为主'
  });
  expect('逆天线（扶苏）', g.ending, 'E6');
  if (g.ach.includes('shuyumengtian')) { pass++; console.log('✔ 结局成就解锁：吾与他，孰与蒙恬'); }
  else { fail++; console.log('✘ E6 线应解锁成就 shuyumengtian'); }
  if (g.ach.includes('nitian')) { pass++; console.log('✔ 结局成就解锁：逆天改命'); }
  else { fail++; console.log('✘ E6 线应解锁成就 nitian'); }
  // 剧本事件全部脚本化时驱动器不打出行动卡（见 play() 回合分支），本路线数值确定：
  // 章末权势恒 24≤30 且持知止，急流勇退必然触发——由提示转为正式断言
  const tuiyinSeen = trace.some(t => t[0] === 'cj-tuiyin');
  if (tuiyinSeen) { pass++; console.log('✔ 急流勇退事件按条件触发（权势≤30 且知止）'); }
  else { fail++; console.log('✘ 急流勇退事件应触发而未触发（权势峰值=' + g.peak.quanshi + '）'); }
}

/* ---------- 5. 逆天线 → E7 权倾二世（6-2-C 密奏成功：quanshi≥70、junxin≥40、dev≥46） ---------- */
{
  // 原路线 6-2 时 dev 仅 33，不满足新门槛 devMin:46；兰陵一折（留兰陵+意难平，+11）抬偏离后收 E7
  const { g } = play('normal', {
    '0-1': '驻足细想', '0-2': '忍了', '0-3': '变卖家资',
    '1-1': '潜心问学', '1-2': '留兰陵', '1-5': '终究还是意难平',
    '2-1': '主动请办杂务', '2-2': '灭诸侯', '2-3': '上书自辩', '2-4': '全力经略',
    '3-1': '拖延时日', '3-2': '上书——',
    '4-1': '不叹', '4-2': '弹劾韩非', '4-3': '独排众议', '4-4': '倾力推行', '4-5': '上焚书议', '4-6': '附议重罚',
    '5-1': '怒斥', '5-2': '假意从之',
    '6-1': '上督责书', '6-2': '密奏二世'
  });
  expect('逆天线（除赵高）', g.ending, 'E7');
  if (g.dev >= 46) { pass++; console.log('✔ 密奏时偏离 ' + g.dev + ' ≥46，满足 6-2-C 通 E7 门槛'); }
  else { fail++; console.log('✘ E7 线偏离应≥46，实际 ' + g.dev); }
  if (g.ach.includes('nitian')) { pass++; console.log('✔ 结局成就解锁：逆天改命'); }
  else { fail++; console.log('✘ E7 线应解锁成就 nitian'); }
}

/* ---------- 5b. 6-2-C 门槛回退：低偏离密奏失败落 6-3，6-4 按 dev≤45 收 E1 ---------- */
{
  // 原「逆天线（除赵高）」路线保留为回退断言：密奏时 dev 不足 46 → 落 6-3；
  // 6-4 收束数组 dev≤45 → E1。同时覆盖 E1 门槛的 21–45 区间（dev=0 见史实线 #1，46–70→E5 见 #18，≥71→E7 见 #26）
  const { g, trace } = play('normal', {
    '0-1': '驻足细想', '0-2': '忍了', '0-3': '变卖家资',
    '1-1': '潜心问学', '1-2': '西入秦', '1-3': '细察秦国民情',
    '2-1': '主动请办杂务', '2-2': '灭诸侯', '2-3': '上书自辩', '2-4': '全力经略',
    '3-1': '拖延时日', '3-2': '上书——',
    '4-1': '不叹', '4-2': '弹劾韩非', '4-3': '独排众议', '4-4': '倾力推行', '4-5': '上焚书议', '4-6': '附议重罚',
    '5-1': '怒斥', '5-2': '假意从之',
    '6-1': '上督责书', '6-2': '密奏二世', '6-3': '狱中上书'
  });
  expect('低偏离密奏（门槛回退）', g.ending, 'E1');
  if (g.dev >= 21 && g.dev <= 45 && trace.some(t => t[0] === '6-4')) { pass++; console.log('✔ 密奏失败落 6-3，经 6-4 收束（偏离 ' + g.dev + ' 在 21–45 区间）'); }
  else { fail++; console.log('✘ 回退路线异常：dev=' + g.dev + '，经 6-4=' + trace.some(t => t[0] === '6-4')); }
}

/* ---------- 6. 稳健线 → E5 沙丘孤忠 ---------- */
{
  const { g } = play('normal', {
    '0-2': '辞去吏职', '1-2': '西入秦',
    '2-1': '埋头著文', '2-2': '灭诸侯', '2-3': '上书自辩', '2-4': '只做离间',
    '3-1': '拖延时日', '3-2': '上书——',
    '4-1': '物禁大盛', '4-2': '纵韩非归韩', '4-3': '独排众议', '4-4': '倾力推行', '4-5': '官藏代焚', '4-6': '为扶苏缓颊',
    '5-1': '怒斥', '5-2': '拒之。宁死'
  });
  expect('稳健线（孤忠）', g.ending, 'E5');
}

/* ---------- 7. 稳健线 → E4 上蔡东门（急流勇退） ---------- */
{
  const { g, trace } = play('normal', {
    '0-2': '辞去吏职', '1-2': '西入秦',
    '2-1': '埋头著文', '2-2': '灭诸侯', '2-3': '闭门谢客', '2-4': '只做离间',
    '3-1': '拖延时日', '3-2': '上书——',
    '4-1': '物禁大盛', '4-2': '举荐韩非', '4-3': '独排众议', '4-4': '倾力推行', '4-5': '官藏代焚', '4-6': '缄默',
    'cj-yaojia': '挺身力保', 'cj-tuiyin': '上表辞官'
  });
  expect('稳健线（身退）', g.ending, 'E4');
  if (!trace.some(t => t[0] === 'cj-tuiyin')) { fail++; console.log('✘ 急流勇退事件未触发'); } else { pass++; }
}

/* ---------- 8. 失败线 → E8 狱中死（直斥秦王） ---------- */
{
  const { g } = play('normal', {
    '0-2': '辞去吏职', '1-2': '西入秦',
    '2-1': '埋头著文', '2-2': '先谈富国强兵', '2-3': '闭门谢客', '2-4': '只做离间',
    '3-1': '拖延时日', '3-2': '直斥秦王'
  });
  expect('失败线（直斥）', g.ending, 'E8');
}

/* ---------- 9. 苟活变体 → E4/会稽老丈 ---------- */
{
  const { g } = play('normal', {
    '0-2': '辞去吏职', '1-2': '西入秦',
    '2-1': '埋头著文', '2-2': '灭诸侯', '2-3': '上书自辩', '2-4': '中饱私囊',
    '3-1': '藏匿咸阳', '3-2': '上书——',
    '4-1': '不叹', '4-2': '弹劾韩非', '4-3': '独排众议', '4-4': '倾力推行', '4-5': '上焚书议', '4-6': '缄默',
    '5-1': '怒斥', '5-2': '从之。矫诏',
    '6-1': '称病不朝', '6-2': '察觉有诈', '6-3': '散尽家财'
  });
  expect('苟活变体（会稽）', g.ending, 'E4', 'kuaiji');
  if (g.ach.includes('jinchan')) { pass++; console.log('✔ 结局成就解锁：金蝉脱壳'); }
  else { fail++; console.log('✘ E4/kuaiji 线应解锁成就 jinchan'); }
}

/* ---------- 10. 修正事件触发验证（高偏离 + 必中随机） ---------- */
{
  const { g, trace } = play('normal', {
    '0-2': '辞去吏职', '1-2': '留兰陵', '1-5': '终究还是意难平',
    '2-1': '广交三晋', '2-2': '直言吕不韦', '2-3': '为吕不韦收尸', '2-4': '只做离间',
    '3-1': '拖延时日', '3-2': '上书——',
    '4-1': '不叹', '4-2': '举荐韩非', '4-3': '附和王绾', '4-4': '委之属吏', '4-5': '官藏代焚', '4-6': '为扶苏缓颊',
    'cj-yaojia': '挺身力保',
    '5-1': '怒斥', '5-2': '拒之。宁死'
  }, rngLow);
  const corr = trace.filter(t => t[0] === '修正').length;
  if (corr > 0) { pass++; console.log(`✔ 修正事件触发 ${corr} 次（高偏离线）`); }
  else { fail++; console.log('✘ 高偏离线未触发任何修正事件'); }
  expect('高偏离收束', g.ending, 'E5');
}

/* ---------- 11. 回溯机制（普通难度每章 1 次）；回合制状态（actionUses/keyRoundsLeft）随快照恢复 ---------- */
{
  const g = mkGame('normal', rngHigh);
  g.start();
  g.beginEvents();
  // 先出一张行动卡：计入本章递减计数，关键卡倒计时 -1
  const offer = g.getOffer();
  let ai = -1;
  for (let i = 1; i < offer.length; i++) if (!offer[i].locked && !offer[i].choice) { ai = i; break; }  // 抉择卡点击即挂起、不结算，本用例须用直接结算卡
  const usedId = offer[ai].action.id;
  g.playCard(ai);
  if (g.actionUses[usedId] === 1 && g.keyRoundsLeft === E.KEY_CARD_ROUNDS - 1) { pass++; console.log('✔ 行动卡计入递减计数，关键卡倒计时 ' + E.KEY_CARD_ROUNDS + '→' + g.keyRoundsLeft); }
  else { fail++; console.log('✘ 行动卡计数异常：' + JSON.stringify(g.actionUses) + ' 倒计时 ' + g.keyRoundsLeft); }
  g.playCard(0); // 关键卡 → 0-1
  g.choose(1); g.proceed(); // 0-1 观鼠悟道（成就 cangshu）→ 0-2
  if (g.ach.includes('cangshu')) { pass++; } else { fail++; console.log('✘ 观鼠悟道应解锁成就'); }
  if (!g.canBacktrack()) { fail++; console.log('✘ 章内应可回溯'); }
  else {
    const ok = g.backtrack();
    if (ok && g.eventId === '0-1' && g.backtracksThisChapter === 1) { pass++; console.log('✔ 回溯返回章首，次数扣减正确'); }
    else { fail++; console.log('✘ 回溯状态异常'); }
    if (Object.keys(g.actionUses).length === 0 && g.keyRoundsLeft === E.KEY_CARD_ROUNDS) { pass++; console.log('✔ 回溯后递减计数与倒计时回到章首快照（actionUses 清空、倒计时回满）'); }
    else { fail++; console.log('✘ 回溯后回合制状态未随快照恢复：' + JSON.stringify(g.actionUses) + ' 倒计时 ' + g.keyRoundsLeft); }
    if (g.canBacktrack()) { fail++; console.log('✘ 普通难度本章不应再有回溯次数'); } else { pass++; }
    if (g.ach.includes('cangshu')) { pass++; console.log('✔ 回溯后已解锁成就不重置（GDD 6.4）'); }
    else { fail++; console.log('✘ 回溯后成就被重置'); }
  }
}

/* ---------- 12. 硬核难度危机增速 ×1.2 且属性以状态词显示 ---------- */
{
  const g = mkGame('hardcore', rngHigh);
  g.start(); g.beginEvents();
  g.playCard(0); // 关键卡 → 0-1
  const r = g.choose(2); // 捉仓鼠：危机+3 → ×1.2 ≈ 4
  const wj = r.changes.find(c => c.k === 'weiji');
  if (wj && wj.delta === 4) { pass++; console.log('✔ 硬核危机 ×1.2（+3→+4）'); }
  else { fail++; console.log('✘ 硬核危机倍率异常：' + (wj && wj.delta)); }
  // 状态词按档位实质映射（硬核隐藏数值，仅显状态词，GDD 4.4）
  g.attrs.caixue = 80;
  const w80 = g.attrWord('caixue');
  g.attrs.caixue = 40;
  const w40 = g.attrWord('caixue');
  if (w80 === '学究天人' && w40 === '腹有诗书') { pass++; console.log('✔ 硬核状态词按档位映射（80→学究天人 / 40→腹有诗书）'); }
  else { fail++; console.log('✘ attrWord 档位映射异常：' + w80 + '/' + w40); }
}

/* ---------- 13. 害韩非锁死逆天线 E6 ---------- */
{
  const { g } = play('normal', {
    '0-1': '驻足细想', '0-2': '辞去吏职',
    '1-1': '潜心问学', '1-2': '西入秦', '1-3': '细察秦国民情',
    '2-1': '埋头著文', '2-2': '灭诸侯', '2-3': '为吕不韦收尸', '2-4': '只做离间',
    '3-1': '拖延时日', '3-2': '上书——',
    '4-1': '物禁大盛', '4-2': '弹劾韩非', '4-3': '独排众议', '4-4': '倾力推行', '4-5': '官藏代焚', '4-6': '为扶苏缓颊',
    '5-1': '怒斥', '5-2': '拒之。宁死'   // 5-2C「反客为主」应被锁定，改选拒之 → 有 fusu → E5
  });
  // 直接检查：重放至 5-2（持污名·害韩非 + 扶苏信任），验证 C 选项的锁定态与原因
  const g13 = driveTo('5-2', { '3-1': 1, '4-6': 1 });
  const opts52 = g13.getOptions();
  const c52 = opts52.find(o => o.opt.t.indexOf('反客为主') >= 0);
  if (c52 && c52.locked && !opts52[1].locked) { pass++; console.log('✔ 5-2-C 在【污名·害韩非】下直接锁定（原因：' + (c52.reason || '无') + '）'); }
  else { fail++; console.log('✘ 5-2-C 锁定态异常：locked=' + (c52 && c52.locked)); }
  expect('污名锁死逆天（收束 E5）', g.ending, 'E5');
}

/* ---------- 14. 随机际遇触发与返回（round 阶段口径：RETURN 后回 round（resumed）且倒计时回满） ---------- */
{
  const g = mkGame('normal', () => 0.01, { event: () => 0.01 }); // 际遇改走 event 流：注入常量 0.01 保持"必触发"口径
  g.start(); g.beginEvents();
  g.playCard(0); // 关键卡 → 0-1
  g.choose(0); g.proceed(); // 0-1 → 0-2（回 round）
  if (g.phase === 'round' && g.eventId === '0-2') { pass++; } else { fail++; console.log('✘ 事件结算后未回到回合：' + g.phase); }
  // 先出一张行动卡消耗倒计时（3→2），再插际遇
  const offer = g.getOffer();
  let ai = -1;
  for (let i = 1; i < offer.length; i++) if (!offer[i].locked) { ai = i; break; }
  g.playCard(ai);
  if (g.keyRoundsLeft === E.KEY_CARD_ROUNDS - 1) { pass++; } else { fail++; console.log('✘ 行动卡未消耗倒计时：' + g.keyRoundsLeft); }
  const ev = g.maybeRandom();
  if (ev && ev.id.indexOf('R-') === 0 && g.eventId === ev.id && g.phase === 'event') { pass++; console.log('✔ 际遇触发：' + ev.id + '「' + ev.title + '」'); }
  else { fail++; console.log('✘ 际遇未触发'); }
  if (ev) {
    const before = g.pendingEventId;
    g.choose(0); const n = g.proceed();
    if (g.eventId === before && g.phase === 'round' && n.resumed === true && !g.currentRandom) { pass++; console.log('✔ 际遇结算后 RETURN 剧本事件 ' + before + '（round/resumed）'); }
    else { fail++; console.log('✘ 际遇返回异常：' + g.eventId + ' phase=' + g.phase); }
    // 际遇不消耗决策点：倒计时回满
    if (g.keyRoundsLeft === E.KEY_CARD_ROUNDS) { pass++; console.log('✔ 际遇 RETURN 后关键卡倒计时回满'); }
    else { fail++; console.log('✘ 际遇 RETURN 后倒计时未回满：' + g.keyRoundsLeft); }
    // 返回后不应立刻再触发
    if (g.maybeRandom() === null) { pass++; } else { fail++; console.log('✘ 返回后重复触发际遇'); }
  }
}

/* ---------- 15. 际遇次数上限 ---------- */
{
  const g = mkGame('normal', () => 0.01);
  g.start(); g.beginEvents();
  g.randomCount = 2;
  if (g.maybeRandom() === null) { pass++; console.log('✔ 际遇每章上限生效'); } else { fail++; console.log('✘ 际遇上限失效'); }
}

/* ---------- 16. 行动卡：生效、无收益递减（卡牌 v2，ACTION_RULES.diminish=false——同卡连用收益逐次完全相同）、getOffer 透出 usedCount/diminishing ---------- */
{
  const g = mkGame('normal', rngHigh);
  g.randomOn = false; g.start(); g.beginEvents();
  // getOffer 透出：初始 usedCount 0、diminishing false；req 锁定（入宫请安在序章锁定）——
  // 注：req 不满足的行动不进发牌池，故锁定情形以 check(req) 直接验证
  const offer = g.getOffer();
  const allFresh = offer.slice(1).every(o => o.type === 'action' && o.usedCount === 0 && o.diminishing === false);
  if (allFresh) { pass++; console.log('✔ getOffer 透出 usedCount/diminishing（初始 0/false）'); }
  else { fail++; console.log('✘ getOffer 透出异常：' + JSON.stringify(offer.slice(1).map(o => [o.action && o.action.id, o.usedCount, o.diminishing]))); }
  if (!g.check({ minChapter: 2 }).ok) { pass++; console.log('✔ 入宫请安（req minChapter:2）在序章不可用'); }
  else { fail++; console.log('✘ 入宫请安在序章应锁定'); }
  // 无递减（卡牌 v2）：stub 发牌强制同一张 ACT-1（才学+3/声望+1/危机+2）连用 3 次，收益逐次完全相同，useCount 仍计次
  const deltas = [], useCounts = [];
  for (let k = 0; k < 3; k++) {
    g.offer = [{ type: 'key' }, { type: 'action', id: 'ACT-1' }];
    const r = g.playCard(1);
    useCounts.push(r.useCount);
    deltas.push(['caixue', 'shengwang', 'weiji'].map(kk => r.changes.find(c => c.k === kk).delta).join('/'));
  }
  if (useCounts.join(',') === '1,2,3' && deltas.every(d => d === '3/1/2')) { pass++; console.log('✔ 行动结算生效且无递减：ACT-1 连用 3 次收益逐次相同（才学+3/声望+1/危机+2），useCount 1→3 照计'); }
  else { fail++; console.log('✘ 行动结算异常：' + JSON.stringify({ useCounts, deltas })); }
  // 连用后 getOffer 透出：usedCount 照计，diminishing 恒 false（李斯无递减）
  g.offer = [{ type: 'key' }, { type: 'action', id: 'ACT-1' }];
  const oUsed = g.getOffer()[1];
  if (oUsed.usedCount === 3 && oUsed.diminishing === false) { pass++; console.log('✔ 连用后 getOffer 透出 usedCount=3、diminishing 恒 false（无递减）'); }
  else { fail++; console.log('✘ 递减透出异常：usedCount=' + oUsed.usedCount + ' diminishing=' + oUsed.diminishing); }
  // 行动不干扰事件流：关键事件仍是 0-1（第 3 张触发倒计时归零强制抉择，phase 转 event 属预期，见 #44）
  if ((g.phase === 'round' || g.phase === 'event') && g.eventId === '0-1') { pass++; } else { fail++; console.log('✘ 行动后事件流被打断：' + g.phase + ' ' + g.eventId); }
}

/* ---------- 16b. 收益递减跨剧本对照：未声明 ACTION_RULES 的数据递减保留（第 2 次减半、代价不减、diminishing=true） ----------
 * 对照本原为荆轲、后换韩信；韩信 v1.9 起亦声明 diminish:false（见其套件 #16）——真实剧本已无未声明本，
 * 故改为内联合成最小 stub 数据（不引用任何真实剧本、未声明 ACTION_RULES），保持「引擎对未声明本保留递减」的断言意图。 */
{
  const STUB = {
    ATTRS: [{ k: 'caixue', n: '文才' }, { k: 'weiji', n: '危机', inverse: true }],
    ATTR_NAMES: { caixue: '文才', weiji: '危机' },
    INIT: { tupo: 40, wuli: 40, caixue: 40, moulue: 40, biancai: 40, caifu: 40, shengwang: 40, quanshi: 40, zhengji: 0, junxin: 40, weiji: 10 },
    DIFFICULTY: { normal: { n: '普通', wj: 1.0, corr: 1.0, coef: 1.0, backtrack: 1, lethal: true, hideAttrs: false } },
    CHAPTERS: [{ id: 'c0', title: '合成测试章', start: 's-1',
      events: [{ id: 's-1', title: '合成测试事件', options: [{ t: '过场', to: 's-1' }] }] }],
    ACTIONS: [{ id: 'X-ACT-1', name: '合成测试行动', chapters: [0, 0],
      eff: { attrs: { caixue: 4, weiji: 2 } } }]
  };
  const gj = new E.Game(STUB, 'normal', rngHigh);
  gj.randomOn = false; gj.start(); gj.beginEvents();
  gj.offer = [{ type: 'key' }, { type: 'action', id: 'X-ACT-1' }]; // 合成测试行动：才学+4/危机+2（代价）
  const j1 = gj.playCard(1);
  gj.offer = [{ type: 'key' }, { type: 'action', id: 'X-ACT-1' }];
  const jo2 = gj.getOffer()[1];
  const j2 = gj.playCard(1);
  const d1cx = j1.changes.find(c => c.k === 'caixue').delta, d2cx = j2.changes.find(c => c.k === 'caixue').delta;
  const d1wj = j1.changes.find(c => c.k === 'weiji').delta, d2wj = j2.changes.find(c => c.k === 'weiji').delta;
  if (d1cx === 4 && d2cx === 2 && d1wj === 2 && d2wj === 2 && jo2.usedCount === 1 && jo2.diminishing === true) { pass++; console.log('✔ 跨剧本对照：合成 stub 未声明 ACTION_RULES，递减保留（才学+4→+2、代价危机+2 不减、diminishing=true）'); }
  else { fail++; console.log('✘ stub 递减对照异常：' + JSON.stringify({ d1cx, d2cx, d1wj, d2wj, dim: jo2.diminishing })); }
}

/* ---------- 17. 赵高威胁度 ≥50：5-2 拒绝被拖入死线（GDD 4.3 / 5-2-B） ---------- */
{
  const { g, trace } = play('normal', {
    '0-1': '驻足细想', '0-2': '辞去吏职', '0-4': '仓中鼠',
    '1-1': '潜心问学', '1-2': '西入秦', '1-3': '细察秦国民情',
    '2-1': '主动请办杂务', '2-2': '灭诸侯', '2-3': '上书自辩', '2-4': '全力经略',
    '3-1': '拖延时日', '3-2': '上书——',
    '4-1': '不叹', '4-2': '弹劾韩非', '4-3': '独排众议', '4-4': '倾力推行', '4-5': '上焚书议', '4-6': '缄默',
    '5-1': '当场密令宿卫', '5-2': '拒之。宁死', '5-3': '死拒'
  });
  expect('赵高威胁≥50 死线', g.ending, 'E8', 'baobing');
  if (trace.some(t => t[0] === '5-3')) { pass++; console.log('✔ 威胁≥50 时拒绝被拖入 5-3 死线'); }
  else { fail++; console.log('✘ 威胁≥50 时应进入 5-3'); }
}

/* ---------- 18. N2 异变：君心≤30 触发前置事件「御前发难」 ---------- */
{
  const { g, trace } = play('normal', {
    '0-1': '驻足细想', '0-2': '辞去吏职',
    '1-1': '潜心问学', '1-2': '西入秦', '1-3': '细察秦国民情',
    '2-1': '埋头著文', '2-2': '先谈富国强兵', '2-3': '闭门谢客', '2-4': '只做离间',
    '3-1': '拖延时日', '3-2': '上书——',
    '4-1': '物禁大盛', '4-2': '纵韩非归韩', '4-3': '附和王绾', '4-4': '委之属吏',
    '4-5-pre': '周仆射面谀', '4-5': '官藏代焚', '4-6': '缄默',
    'cj-tuiyin': '再留一程',
    '5-1': '怒斥', '5-2': '从之。矫诏',
    '6-1': '上督责书', '6-2': '照常入谏', '6-3': '狱中上书'
  });
  // 该线收束时 dev=46>45：6-4 收束数组 dev≤45→E1 不再适用，按 46–70 档回退记为 E5（GDD 9.1 高偏离回退）
  expect('N2 周仆射之问', g.ending, 'E5');
  if (trace.some(t => t[0] === '4-5-pre')) { pass++; console.log('✔ 君心≤30 触发 N2 前置异变「御前发难」'); }
  else { fail++; console.log('✘ 未触发 4-5-pre'); }
}

/* ---------- 19. 书同文成就：声望≥60 解锁 ---------- */
{
  const { g } = play('normal', {
    '0-1': '驻足细想', '0-2': '辞去吏职', '0-4': '仓中鼠',
    '1-1': '多与同窗交游', '1-2': '西入秦', '1-3': '细察秦国民情',
    '2-1': '埋头著文', '2-2': '灭诸侯', '2-3': '为吕不韦收尸', '2-4': '只做离间',
    '3-1': '拖延时日', '3-2': '上书——',
    '4-1': '物禁大盛', '4-2': '举荐韩非', '4-3': '独排众议', '4-4': '倾力推行', '4-5': '官藏代焚', '4-6': '为扶苏缓颊',
    'cj-yaojia': '挺身力保', 'cj-tuiyin': '再留一程',
    '5-1': '怒斥', '5-2': '拒之。宁死'
  });
  expect('书同文高声望线', g.ending, 'E5');
  if (g.ach.includes('shutongwen')) { pass++; console.log('✔ 声望≥60 解锁成就：书同文'); }
  else { fail++; console.log('✘ 高声望线应解锁书同文'); }
}

/* ---------- 20. 偏离≥46 解锁特殊选项：密遣心腹北联蒙恬（GDD 5.2 正向收益） ---------- */
{
  const { g, trace } = play('normal', {
    '0-2': '辞去吏职', '1-2': '留兰陵', '1-5': '终究还是意难平',
    '2-1': '埋头著文', '2-2': '直言吕不韦', '2-3': '为吕不韦收尸', '2-4': '只做离间',
    '3-1': '拖延时日', '3-2': '上书——',
    '4-1': '物禁大盛', '4-2': '举荐韩非', '4-3': '独排众议', '4-4': '倾力推行', '4-5': '官藏代焚', '4-6': '为扶苏缓颊',
    'cj-yaojia': '挺身力保', 'cj-tuiyin': '再留一程',
    '5-1': '密遣心腹', '5-2': '拒之。宁死'
  });
  expect('密遣心腹（偏离≥46）', g.ending, 'E5');
  if (trace.some(t => t[0] === '5-1' && t[1].indexOf('密遣心腹') >= 0)) { pass++; console.log('✔ 偏离≥46 解锁特殊选项：密遣心腹，北联蒙恬'); }
  else { fail++; console.log('✘ 密遣选项未出现或被锁定'); }
}
{
  const g = mkGame('normal', rngHigh);
  g.start();
  g.dev = 45; const locked = !g.check({ devMin: 46 }).ok;
  g.dev = 46; const open = g.check({ devMin: 46 }).ok;
  if (locked && open) { pass++; console.log('✔ devMin 门槛边界（45 锁 / 46 开）'); }
  else { fail++; console.log('✘ devMin 门槛边界异常'); }
}

/* ---------- 21. 逆天段（偏离≥71）章中随机反噬（GDD 5.2） ---------- */
{
  const g = mkGame('normal', () => 0.01, { event: () => 0.01 }); // 反噬触发/抽取走 event 流：注入常量保持恒触发且恒取池首
  g.start(); g.beginEvents();
  g.dev = 75;
  const ev = g.maybeRandom();
  if (ev && ev.id === 'BACKLASH') { pass++; console.log('✔ 逆天段章中反噬触发：' + ev.title); }
  else { fail++; console.log('✘ 逆天段反噬未触发'); }
  if (ev) {
    const before = g.pendingEventId;
    const w0 = g.attrs.weiji;
    g.choose(0); g.proceed();
    if (g.eventId === before && g.phase === 'round' && g.attrs.weiji > w0) { pass++; console.log('✔ 反噬结算生效并返回剧本事件（round）'); }
    else { fail++; console.log('✘ 反噬返回异常：' + g.eventId + ' phase=' + g.phase); }
    if (g.maybeRandom() === null) { pass++; } else { fail++; console.log('✘ 反噬后不应立刻再触发'); }
  }
}

/* ---------- 22. GDD 4.1 章首持续结算（树大招风 / 失宠 / 门客散去） ---------- */
{
  const g = mkGame('normal', rngHigh);
  g.start();
  g.attrs.quanshi = 82;
  const w0 = g.attrs.weiji;
  g.enterChapter(1);
  if (g.attrs.weiji === w0 + 5 && g.introNotes.some(n => n.indexOf('树大招风') >= 0)) { pass++; console.log('✔ 权势≥80：章首猜忌 危机+5'); }
  else { fail++; console.log('✘ 章首持续结算异常 weiji ' + w0 + '→' + g.attrs.weiji); }
  g.attrs.junxin = 10; g.attrs.caifu = 0;
  const w1 = g.attrs.weiji, s1 = g.attrs.shengwang;
  g.enterChapter(2);
  if (g.attrs.weiji === w1 + 15 && g.attrs.shengwang === s1 - 5) { pass++; console.log('✔ 失宠+10 / 门客散去-5 章首生效'); }
  else { fail++; console.log('✘ 章首持续结算异常（二章）weiji ' + w1 + '→' + g.attrs.weiji + ' shengwang ' + s1 + '→' + g.attrs.shengwang); }
}

/* ---------- 23. N1 异变：君心≥45 触发 3-0 密报之夜，连夜起草减上书门槛 ---------- */
{
  const g = mkGame('normal', rngHigh);
  g.randomOn = false; g.start();
  g.attrs.junxin = 50; // 倾力经营君心后的状态（史实线为 41，需另加一次入宫请安）
  g.enterChapter(3);
  if (g.eventId === '3-0' && g.flags.mibao && g.introNotes.some(n => n.indexOf('密告') >= 0)) { pass++; console.log('✔ 君心≥45 触发 N1 异变：3-0 密报之夜'); }
  else { fail++; console.log('✘ 3-0 未触发，起始事件 ' + g.eventId); }
  g.beginEvents();
  g.playCard(0); // 关键卡 → 3-0
  g.choose(0); g.proceed(); // 连夜起草 → 3-1
  if (g.flags.liancao && g.eventId === '3-1') { pass++; console.log('✔ 连夜起草完成，进入 3-1'); }
  else { fail++; console.log('✘ 3-0 选项流向异常：' + g.eventId); }
  g.attrs.caixue = 45;
  g.playCard(0); // 关键卡 → 3-1
  g.choose(1); g.proceed(); // 拖延时日 → 3-2
  g.playCard(0); // 关键卡 → 3-2
  const opts = g.getOptions();
  const shangshu = opts.find(o => o.opt.hist);
  if (shangshu && !shangshu.locked) { pass++; console.log('✔ 连夜起草使上书门槛 -10（才学 45 可上书）'); }
  else { fail++; console.log('✘ 上书门槛减免未生效'); }
}

/* ---------- 24. N1 异变：声望≥50 触发「籍没其家」 ---------- */
{
  const g = mkGame('normal', rngHigh);
  g.randomOn = false; g.start();
  g.attrs.shengwang = 55; g.attrs.caifu = 30;
  g.enterChapter(3);
  if (g.flags.jimo && g.attrs.caifu === 5 && g.introNotes.some(n => n.indexOf('籍没其家') >= 0)) { pass++; console.log('✔ 声望≥50 触发 N1 异变：逐客且籍没其家（财富 30 封至 5）'); }
  else { fail++; console.log('✘ jimo 异变未触发'); }
}

/* ---------- 25. 偏离度只增不减：多条路线 trace 的 dev 序列无下降（GDD 4.2；cj-yaojia-B 已无 dev:-5） ---------- */
{
  const cases = [
    ['史实线', { '0-1': '驻足细想', '0-2': '辞去吏职', '0-4': '仓中鼠', '3-1': '拖延时日', '3-2': '上书——', '6-2': '照常入谏', '6-3': '狱中上书' }],
    ['逆天扶苏线', { '0-1': '驻足细想', '0-2': '辞去吏职', '2-3': '为吕不韦收尸', '2-4': '只做离间', '3-1': '拖延时日', '3-2': '上书——', '4-2': '举荐韩非', '4-5': '连署', '4-6': '为扶苏缓颊', 'cj-yaojia': '挺身力保', 'cj-tuiyin': '再留一程', '5-2': '反客为主' }],
    ['修正线（必中随机）', { '0-2': '辞去吏职', '1-2': '留兰陵', '1-5': '终究还是意难平', '2-2': '直言吕不韦', '2-3': '为吕不韦收尸', '2-4': '只做离间', '3-1': '拖延时日', '3-2': '上书——', '4-1': '不叹', '4-2': '举荐韩非', '4-3': '附和王绾', '4-4': '委之属吏', '4-5': '官藏代焚', '4-6': '为扶苏缓颊', 'cj-yaojia': '挺身力保', '5-2': '拒之。宁死' }, rngLow]
  ];
  cases.forEach(function (c) {
    const r = play('normal', c[1], c[2] || rngHigh);
    let ok = true;
    for (let i = 1; i < r.trace.length; i++) if (r.trace[i][2] < r.trace[i - 1][2]) { ok = false; break; }
    if (ok) { pass++; console.log('✔ 偏离单调不减：' + c[0] + '（' + r.trace.length + ' 个决策点，终偏离 ' + r.g.dev + '）'); }
    else { fail++; console.log('✘ ' + c[0] + ' dev 序列出现下降'); }
  });
}

/* ---------- 26. 6-4 东市收束：dev≥71 落 E7（hook 构造中间态；46–70→E5 见 #18，≤45→E1 见 #1/#5b） ---------- */
{
  let raised = false;
  const { g, trace } = play('normal', {
    // v1.8 重调路线：全事件脚本化（同 #1 史实线选项）。旧路线只脚本部分事件，未脚本事件的兜底行动卡
    // 轨迹随 caifu req 标尺调整漂移（发牌池过滤变化），c4–c6 危机积累可能越 100 提前死（E8/zuzhu），到不了 6-4
    '0-1': '驻足细想', '0-2': '辞去吏职', '0-4': '仓中鼠',
    '1-1': '潜心问学', '1-2': '西入秦', '1-3': '细察秦国民情',
    '2-1': '埋头著文', '2-2': '灭诸侯、成帝业', '2-3': '上书自辩', '2-4': '全力经略',
    '3-1': '拖延时日', '3-2': '上书——',
    '4-1': '物禁大盛', '4-2': '弹劾韩非', '4-3': '独排众议', '4-4': '倾力推行', '4-5': '上焚书议', '4-6': '缄默',
    '5-1': '怒斥', '5-2': '从之。矫诏',
    '6-1': '上督责书', '6-2': '照常入谏', '6-3': '狱中上书'
  }, rngHigh, null, function (g) {
    // 回合制：6-4 未入 script，关键卡停留 round 阶段即构造 dev（随后的行动卡不改 dev）
    if (!raised && g.eventId === '6-4' && (g.phase === 'event' || g.phase === 'round')) { g.dev = 75; raised = true; }
  });
  if (raised && trace.some(t => t[0] === '6-4')) { pass++; console.log('✔ 到达 6-4 并构造 dev=75（逆天档）'); }
  else { fail++; console.log('✘ 未到达 6-4'); }
  expect('6-4 逆天偏离收束', g.ending, 'E7');
}

/* ---------- 27. cj-tuiyin 急流勇退：dev>45 时「上表辞官」锁定（req devMax:45；对照解锁见 #7） ---------- */
{
  let lockInfo = null;
  const { g } = play('normal', {
    '0-2': '辞去吏职', '1-2': '留兰陵', '1-5': '终究还是意难平',
    '2-1': '埋头著文', '2-2': '直言吕不韦', '2-3': '为吕不韦收尸', '2-4': '只做离间',
    '3-1': '拖延时日', '3-2': '上书——',
    '4-1': '物禁大盛', '4-2': '举荐韩非', '4-3': '附和王绾', '4-4': '委之属吏', '4-5': '官藏代焚', '4-6': '为扶苏缓颊',
    'cj-yaojia': '挺身力保', 'cj-tuiyin': '再留一程',
    '5-1': '怒斥', '5-2': '拒之。宁死'
  }, rngHigh, null, function (g) {
    if (!lockInfo && g.phase === 'endEvent' && g.currentEndEvent && g.currentEndEvent.id === 'cj-tuiyin') {
      const c = g.check(g.currentEndEvent.options[0].req); // 上表辞官 req: { devMax: 45 }
      lockInfo = { dev: g.dev, ok: c.ok, reason: c.reason };
    }
  });
  if (lockInfo && lockInfo.dev > 45 && !lockInfo.ok) { pass++; console.log('✔ 急流勇退在偏离 ' + lockInfo.dev + '>45 时锁定（' + lockInfo.reason + '），改选再留一程'); }
  else { fail++; console.log('✘ 急流勇退锁定验证异常：' + JSON.stringify(lockInfo)); }
  expect('高偏离婉拒身退收束', g.ending, 'E5');
}

/* ---------- 28. 危机 70–89：章内保底注入构陷际遇（不走概率、不占 randomCount 配额，GDD 4.1） ---------- */
{
  const g = mkGame('normal', rngHigh); // rng 恒 0.99：概率际遇本不触发，注入必来自保底
  g.start();
  g.attrs.weiji = 75;
  g.enterChapter(1);
  g.beginEvents();
  const ev = g.maybeRandom();
  const isPlot = ev && (D.CRISIS_EVENTS.plots || []).some(p => p.id === ev.id);
  if (isPlot && g.randomCount === 0 && !g._crisisPlotPending) { pass++; console.log('✔ 危机 75 保底注入：' + ev.id + '「' + ev.title + '」，不占 randomCount'); }
  else { fail++; console.log('✘ 危机保底注入异常：' + (ev && ev.id)); }
  if (g.maybeRandom() === null) { pass++; console.log('✔ 保底注入每章一次（二次调用不重复）'); }
  else { fail++; console.log('✘ 保底注入重复触发'); }
  if (ev) {
    g.choose(0); g.proceed();
    if (g.eventId === '1-1' && g.phase === 'round' && !g.currentRandom) { pass++; console.log('✔ 构陷际遇结算后 RETURN 原剧本事件 1-1（round）'); }
    else { fail++; console.log('✘ 构陷际遇返回异常：' + g.eventId + ' phase=' + g.phase); }
  }
}

/* ---------- 29. 危机 ≥90：章首替换为死亡判定事件（RETURN 返回原起始事件，GDD 4.1） ---------- */
{
  const g = mkGame('normal', rngHigh);
  g.start();
  g.attrs.weiji = 95; g.attrs.caifu = 50; // 散尽家财 req caifu 30，需达标才不锁
  g.enterChapter(1);
  if (g.eventId === 'C-DEATH' && g.pendingEventId === '1-1' && g.currentRandom) { pass++; console.log('✔ 危机 95：章首替换为死亡判定事件 C-DEATH'); }
  else { fail++; console.log('✘ 死亡判定章首替换异常：' + g.eventId); }
  g.beginEvents();
  if (g.getOffer()[0].inserted === true) { pass++; console.log('✔ 危机插入事件作为关键卡透出 inserted=true'); }
  else { fail++; console.log('✘ 关键卡未透出 inserted'); }
  g.playCard(0); // 关键卡 → C-DEATH
  const i = g.getOptions().findIndex(o => o.opt.t.indexOf('散尽家财') >= 0);
  const r = g.choose(i); // 财富够：危机 -25 → 70
  g.proceed();
  if (!r.forcedEnding && g.attrs.weiji === 70 && g.eventId === '1-1' && g.phase === 'round') { pass++; console.log('✔ 散尽家财：危机 95→70，RETURN 原起始事件（round）'); }
  else { fail++; console.log('✘ 散尽家财结算异常：weiji=' + g.attrs.weiji + ' eventId=' + g.eventId + ' phase=' + g.phase); }
  const g2 = mkGame('normal', rngHigh);
  g2.start(); g2.attrs.weiji = 95; g2.enterChapter(1); g2.beginEvents();
  g2.playCard(0); // 关键卡 → C-DEATH
  const j = g2.getOptions().findIndex(o => o.opt.t.indexOf('坐以待毙') >= 0);
  const r2 = g2.choose(j); // 危机 +15 → 100 → 致死
  g2.proceed();
  if (r2.forcedEnding && g2.ending && g2.ending.id === 'E8' && g2.ending.variant === 'cike') { pass++; console.log('✔ 坐以待毙致死 → E8/cike（zg<70）'); }
  else { fail++; console.log('✘ 坐以待毙致死异常：' + (g2.ending && g2.ending.id)); }
}

/* ---------- 30. 章末事件结算致死：weiji 推过 100 → forcedEnding 强制收束（GDD 4.1） ---------- */
{
  const g = mkGame('normal', rngHigh);
  g.start();
  g.enterChapter(4);
  g.flags.hanfeicun = true;  // 使章末事件 cj-yaojia 入队
  g.attrs.weiji = 95;        // 在章首危机判定之后抬高，避免触发章首替换
  g.beginEvents();
  g.chapterEnd();
  if (g.phase === 'endEvent' && g.currentEndEvent && g.currentEndEvent.id === 'cj-yaojia') { pass++; }
  else { fail++; console.log('✘ 章末事件未就绪：' + g.phase); }
  const r = g.endEventChoose(0); // 挺身力保：危机 +10 → 100
  g.proceed();
  if (r.forcedEnding && g.ending && g.ending.id === 'E8') { pass++; console.log('✔ 章末事件结算致死，强制收束 E8/' + g.ending.variant); }
  else { fail++; console.log('✘ 章末事件致死判定异常'); }
}

/* ---------- 31. 行动卡结算致死：weiji 推过 100 → forcedEnding，补 proceed 收束（GDD 4.1） ---------- */
{
  const g = mkGame('normal', rngHigh);
  g.randomOn = false; g.start(); g.beginEvents();
  g.attrs.weiji = 99;
  g.offer = [{ type: 'key' }, { type: 'action', id: 'ACT-1' }]; // stub 发牌锁定 ACT-1
  const r = g.playCard(1); // 著书立说：危机 +2 → 100
  if (r && r.kind === 'action' && r.forcedEnding === true) { pass++; console.log('✔ 行动卡结算把危机推过 100，forcedEnding 置位'); }
  else { fail++; console.log('✘ 行动卡致死判定异常'); }
  g.proceed(); // forcedEnding 需再调 proceed 收束
  if (g.ending && g.ending.id === 'E8') { pass++; console.log('✔ 行动卡致死经 proceed 收束 E8/' + g.ending.variant); }
  else { fail++; console.log('✘ 行动卡致死未收束'); }
}

/* ---------- 32. checkDeath 变体：zg≥70 族诛（zuzhu），否则刺杀（cike） ---------- */
{
  const g = mkGame('normal', rngHigh);
  g.start(); g.attrs.weiji = 100; g.zg = 70;
  const d1 = g.checkDeath();
  if (d1 && d1.ending === 'E8' && d1.variant === 'zuzhu') { pass++; console.log('✔ zg=70 致死 → E8/zuzhu 族诛之祸'); }
  else { fail++; console.log('✘ zuzhu 变体异常'); }
  const g2 = mkGame('normal', rngHigh);
  g2.start(); g2.attrs.weiji = 100; g2.zg = 69;
  const d2 = g2.checkDeath();
  if (d2 && d2.ending === 'E8' && d2.variant === 'cike') { pass++; console.log('✔ zg=69 致死 → E8/cike 刺客之夜'); }
  else { fail++; console.log('✘ cike 变体异常'); }
}

/* ---------- 33. 死 Flag 兑现：zhitin → 2-2-A condAttrs 才学+3（GDD 8 章 2-2-A 设计备注） ---------- */
{
  const g1 = driveTo('2-2', { '0-1': 1, '0-2': 1, '1-3': 0 }); // 细察秦国民情 → zhitin
  const r1 = g1.choose(0); // 灭诸侯、成帝业
  const hit1 = r1.changes.find(c => c.k === 'caixue' && c.delta === 3 && c.note);
  if (g1.flags.zhitin && hit1) { pass++; console.log('✔ 持【知秦】走 2-2-A：结算含 condAttrs 才学+3（' + hit1.note + '）'); }
  else { fail++; console.log('✘ zhitin 兑现异常：' + JSON.stringify(r1.changes)); }
  const g0 = driveTo('2-2', { '0-1': 1, '0-2': 1, '1-3': 1 }); // 直趋咸阳 → 无 zhitin
  const r0 = g0.choose(0);
  if (!g0.flags.zhitin && !r0.changes.some(c => c.k === 'caixue' && c.note)) { pass++; console.log('✔ 对照：无 flag 路线 2-2-A 无此增益'); }
  else { fail++; console.log('✘ zhitin 对照路线异常'); }
}

/* ---------- 34. 死 Flag 兑现：wangzhiwo → 2-4 condAttrs 权势+10（GDD 8 章 2-2-C 设计备注） ---------- */
{
  const g = driveTo('2-2', {}); // 默认首选：才学 68≥55，直言吕不韦可用
  const opts = g.getOptions();
  if (!opts[2].locked) { pass++; } else { fail++; console.log('✘ 2-2-C 直言吕不韦不应锁定（才学 ' + g.attrs.caixue + '）'); }
  g.choose(2); g.proceed();  // 直言吕不韦 → wangzhiwo → 2-3（回 round）
  if (g.flags.wangzhiwo) { pass++; } else { fail++; console.log('✘ wangzhiwo flag 未置位'); }
  g.playCard(0); g.choose(0); g.proceed();  // 2-3 上书自辩 → 2-4
  g.playCard(0); // 关键卡 → 2-4
  const r = g.choose(0);     // 2-4 全力经略（三选项均挂同一份 condAttrs）
  const hit = r.changes.find(c => c.k === 'quanshi' && c.delta === 10 && c.note);
  if (hit) { pass++; console.log('✔ 持【王知我】到 2-4：结算含 condAttrs 权势+10（' + hit.note + '）'); }
  else { fail++; console.log('✘ wangzhiwo 兑现异常：' + JSON.stringify(r.changes)); }
}

/* ---------- 35. 死 Flag 兑现：tanmo → 硬核难度第四/五章章首插入清算 C-QS（一次性，GDD 8 章 2-4-C 设计备注） ---------- */
{
  const g = mkGame('hardcore', rngHigh);
  g.start();
  g.flags.tanmo = true;
  g.enterChapter(4);
  // _tanmo_qs 是引擎内部一次性闸，v2.0.6 起在 _once 命名空间（不再混进剧本 flags）
  if (g.eventId === 'C-QS' && g._once._tanmo_qs && g.pendingEventId === '4-1') { pass++; console.log('✔ 硬核+贪墨：第四章章首插入清算事件 C-QS「旧事清算」'); }
  else { fail++; console.log('✘ C-QS 未插入：' + g.eventId); }
  g.beginEvents();
  g.playCard(0); // 关键卡 → C-QS
  g.choose(0); g.proceed(); // 破财消灾 → RETURN
  if (g.eventId === '4-1' && g.phase === 'round' && !g.currentRandom) { pass++; console.log('✔ C-QS 结算后 RETURN 章起始事件 4-1（round）'); }
  else { fail++; console.log('✘ C-QS 返回异常：' + g.eventId + ' phase=' + g.phase); }
  g.enterChapter(5);
  if (g.eventId === '5-1' && !g.currentRandom) { pass++; console.log('✔ C-QS 一次性：第五章章首不再插入'); }
  else { fail++; console.log('✘ C-QS 重复插入：' + g.eventId); }
  const g2 = mkGame('normal', rngHigh);
  g2.start(); g2.flags.tanmo = true; g2.enterChapter(4);
  if (g2.eventId === '4-1' && !g2.currentRandom) { pass++; console.log('✔ 普通难度不插入清算'); }
  else { fail++; console.log('✘ 普通难度插入异常：' + g2.eventId); }
}

/* ---------- 36. 死 Flag 兑现：xiangchou/zhizhi → E4 史传尾声叠加；hanfeicun → 史评+10 且 hanfeiAlive ---------- */
{
  const { g } = play('normal', {
    '0-2': '辞去吏职', '0-4': '儿会回来的',   // xiangchou
    '2-3': '闭门谢客', '2-4': '只做离间',
    '3-1': '拖延时日', '3-2': '上书——',
    '4-1': '物禁大盛', '4-2': '举荐韩非', '4-3': '独排众议', '4-4': '倾力推行', '4-5': '官藏代焚', '4-6': '缄默', // zhizhi
    'cj-yaojia': '挺身力保', 'cj-tuiyin': '上表辞官'
  });
  expect('乡愁+知止身退线', g.ending, 'E4');
  const zhuan = g.ending.zhuan;
  if (zhuan.indexOf('诺虽迟') >= 0 && zhuan.indexOf('知止不殆') >= 0) { pass++; console.log('✔ E4 史传追加乡愁/知止两段尾声（可叠加）'); }
  else { fail++; console.log('✘ E4 尾声句缺失'); }
}
{
  const { g } = play('normal', {
    '0-1': '驻足细想', '0-2': '辞去吏职', '0-4': '仓中鼠',
    '1-1': '多与同窗交游',
    '2-3': '为吕不韦收尸', '2-4': '只做离间',
    '3-1': '拖延时日', '3-2': '上书——',
    '4-1': '物禁大盛', '4-2': '举荐韩非', '4-3': '独排众议', '4-4': '倾力推行', '4-5': '官藏代焚', '4-6': '为扶苏缓颊',
    'cj-yaojia': '挺身力保', 'cj-tuiyin': '再留一程',   // 挺身力保：韩非存活至结局
    '5-1': '怒斥', '5-2': '拒之。宁死'
  });
  expect('韩非存活线', g.ending, 'E5');
  const withScore = g.ending.scores.shiping, alive = !!g.ending.aliveNote;
  delete g.flags.hanfeicun;
  const ctrl = g.buildEnding('E5', null); // 同状态去 flag 重建对照
  if (alive && !ctrl.aliveNote && withScore === ctrl.scores.shiping + 10) { pass++; console.log('✔ 韩非存活：史评 ' + ctrl.scores.shiping + '→' + withScore + '（+10），aliveNote 置位'); }
  else { fail++; console.log('✘ 韩非存活史评异常：' + withScore + ' vs 对照 ' + ctrl.scores.shiping); }
}

/* ---------- 37. yuwei：5-1-B 虚与委蛇后 5-2 非史实选项门槛 +5（GDD 5-1-B 结算注） ---------- */
{
  const g1 = driveTo('5-1', { '0-1': 1, '3-1': 1 }); // 观鼠悟道（guanshu）+ 史实主线
  g1.attrs.caixue = 67; // 介于原门槛 65 与 +5 后 70 之间
  const i1 = g1.getOptions().findIndex(o => o.opt.t.indexOf('虚与委蛇') >= 0);
  g1.choose(i1); g1.proceed();
  const withYw = g1.getOptions().find(o => o.opt.t.indexOf('假意从之') >= 0);
  if (g1.eventId === '5-2' && g1.flags.yuwei && withYw.risky && withYw.risky.rate === 70 && withYw.risky.unmet[0].need === 70) { pass++; console.log('✔ 虚与委蛇后 5-2「假意从之」门槛+5：才学 67/70 转险招（成功率 70%）'); }
  else { fail++; console.log('✘ yuwei 门槛加成未生效'); }
  const alt = g1.findEvent('5-2').altSegs;
  if (alt && alt.flag === 'yuwei' && alt.segs.length > 0) { pass++; console.log('✔ 5-2 持 altSegs 话术变体（flag: yuwei，渲染分支归 UI）'); }
  else { fail++; console.log('✘ 5-2 altSegs 缺失'); }
  const g2 = driveTo('5-1', { '0-1': 1, '3-1': 1 });
  g2.attrs.caixue = 67;
  const i2 = g2.getOptions().findIndex(o => o.opt.t.indexOf('怒斥') >= 0);
  g2.choose(i2); g2.proceed();
  const noYw = g2.getOptions().find(o => o.opt.t.indexOf('假意从之') >= 0);
  if (!g2.flags.yuwei && !noYw.locked && !noYw.risky) { pass++; console.log('✔ 对照：怒斥线才学 67 按原门槛 65 解锁（无锁无险）'); }
  else { fail++; console.log('✘ yuwei 对照路线异常'); }
}

/* ---------- 38. chapterProgress() 新口径：choose 关键事件后 done+1，行动卡与际遇不计（GDD 3.3） ---------- */
{
  const g = mkGame('normal', () => 0.01, { event: () => 0.01 }); // 际遇改走 event 流：注入常量 0.01 保持"必触发"口径
  g.start(); g.beginEvents();
  const p0 = g.chapterProgress();
  if (p0.done === 0 && p0.total === D.CHAPTERS[0].events.length) { pass++; console.log('✔ 章首进度 ' + p0.done + '/' + p0.total + '（新口径：choose 关键事件后才 +1）'); }
  else { fail++; console.log('✘ 章首进度异常：' + JSON.stringify(p0)); }
  // 行动卡不计入章内进度
  const offer = g.getOffer();
  let ai = -1;
  for (let i = 1; i < offer.length; i++) if (!offer[i].locked) { ai = i; break; }
  g.playCard(ai);
  const pA = g.chapterProgress();
  if (pA.done === 0) { pass++; console.log('✔ 行动卡不计入章内进度（done 仍 0）'); }
  else { fail++; console.log('✘ 行动卡被计入进度：' + JSON.stringify(pA)); }
  g.playCard(0); // 关键卡 → 0-1
  g.choose(0); g.proceed(); // 0-1 → 0-2
  const p1 = g.chapterProgress();
  if (p1.done === 1 && p1.total === p0.total) { pass++; console.log('✔ choose 关键事件后进度 ' + p1.done + '/' + p1.total); }
  else { fail++; console.log('✘ 进度递增异常：' + JSON.stringify(p1)); }
  const ev = g.maybeRandom();
  g.choose(0); g.proceed(); // 际遇结算 → RETURN 0-2
  const p2 = g.chapterProgress();
  if (ev && ev.id.indexOf('R-') === 0 && p2.done === 1 && g.eventId === '0-2') { pass++; console.log('✔ 际遇 ' + ev.id + ' 插入不计入章内进度'); }
  else { fail++; console.log('✘ 际遇进度口径异常：' + JSON.stringify(p2)); }
}

/* ---------- 39. exportSave/importSave 往返与校验（GDD 6.4：章首存档点语义） ---------- */
{
  const g = mkGame('normal', rngHigh);
  g.randomOn = false; g.start(); g.beginEvents();
  g.playCard(0); g.choose(1); g.proceed(); // 0-1 驻足细想
  g.playCard(0); g.choose(1); g.proceed(); // 0-2 辞去吏职 → 0-4
  g.playCard(0); g.choose(0); g.proceed(); // 0-4 → 章末结算页
  if (g.phase === 'summary') g.proceedSummary(); // → 第一章章首
  const save = g.exportSave();
  if (save && save.diffKey === 'normal' && save.chapterIdx === 1 && save.snapshot.eventId === '1-1') { pass++; console.log('✔ 章首导出存档（难度 ' + save.diffKey + '，章 ' + save.chapterIdx + '，事件 ' + save.snapshot.eventId + '）'); }
  else { fail++; console.log('✘ 导出存档异常：' + JSON.stringify(save && save.snapshot && save.snapshot.eventId)); }
  if (save && save.snapshot.actionUses && save.snapshot.keyRoundsLeft === E.KEY_CARD_ROUNDS) { pass++; console.log('✔ 存档快照覆盖回合制状态（actionUses/keyRoundsLeft）'); }
  else { fail++; console.log('✘ 存档快照缺回合制状态'); }
  g.beginEvents();
  g.playCard(0); g.choose(0); g.proceed(); // 1-1 潜心问学 → 1-2，偏离章首状态
  const ok = g.importSave(save);
  const s = save.snapshot;
  const same = ok && g.phase === 'intro' && g.eventId === s.eventId && g.dev === s.dev
    && JSON.stringify(g.attrs) === JSON.stringify(s.attrs)
    && JSON.stringify(g.flags) === JSON.stringify(s.flags);
  if (same) { pass++; console.log('✔ 导入后关键状态与章首快照一致（attrs/dev/flags/eventId/phase）'); }
  else { fail++; console.log('✘ 导入状态不一致'); }
  if (JSON.stringify(g.actionUses) === JSON.stringify(s.actionUses) && g.keyRoundsLeft === s.keyRoundsLeft) { pass++; console.log('✔ 导入后 actionUses/keyRoundsLeft 与快照一致'); }
  else { fail++; console.log('✘ 导入后回合制状态不一致'); }
  if (g.importSave(null) === false && g.importSave({}) === false
    && g.importSave({ diffKey: 'hardcore', chapterIdx: 1, snapshot: s }) === false
    && g.importSave({ diffKey: 'normal', chapterIdx: 99, snapshot: s }) === false) { pass++; console.log('✔ 坏对象/串难度/越界章 importSave 均返回 false'); }
  else { fail++; console.log('✘ importSave 校验异常'); }
  const gh = mkGame('hardcore', rngHigh);
  gh.start();
  if (gh.exportSave() === null) { pass++; console.log('✔ 硬核难度（无回溯额度）exportSave 返回 null'); }
  else { fail++; console.log('✘ 硬核不应可导出存档'); }

  /* ---------- 39b. 脏档字段校验补强（v2.0.3 P0：此前漏检 histScore/peak/attrs 范围/eventId/zg，
   *  后果是「脏档导入成功」而非被拒，UI 的坏档清理分支永不触发） ---------- */
  const mkSave = (mut) => { const t = mkGame('normal', rngHigh); t.randomOn = false; t.start(); t.beginEvents(); const sv = t.exportSave(); mut(sv); return sv; };
  const rejects = [
    ['histScore 非数值', (sv) => { sv.snapshot.histScore = 'abc'; }],
    ['attrs 超上限（weiji 500）', (sv) => { sv.snapshot.attrs.weiji = 500; }],
    ['attrs 为负（tupo -20）', (sv) => { sv.snapshot.attrs.tupo = -20; }],
    ['attrs 含未知键（跨剧本档）', (sv) => { sv.snapshot.attrs.foo = 10; }],
    ['zg 非数值', (sv) => { sv.snapshot.zg = 'x'; }],
    ['peak 非数值', (sv) => { sv.snapshot.peak.quanshi = 'x'; }],
    // 跨剧本串档：五剧本维度同名（十一维），故按 scenKey 校验剧本身份
    ['跨剧本档（scenKey 不匹配）', (sv) => { sv.scenKey = 'xiangyu'; }],
    ['flags 为数组', (sv) => { sv.snapshot.flags = []; }],
    ['keyRoundsLeft 为负', (sv) => { sv.snapshot.keyRoundsLeft = -1; }]
  ];
  rejects.forEach(([label, mut]) => {
    const sv = mkSave(mut);
    const gx = mkGame('normal', rngHigh);
    if (gx.importSave(sv) === false) { pass++; console.log('✔ 脏档拒收：' + label); }
    else { fail++; console.log('✘ 脏档未被拒收：' + label); }
  });
  // eventId 不可解析时按章首语义回退（而非硬拒）：导入成功且落到本章可解析事件、getOptions 非空
  {
    const sv = mkSave((x) => { x.snapshot.eventId = '9-9'; });
    const gx = mkGame('normal', rngHigh);
    const okf = gx.importSave(sv);
    const optsOk = okf && gx.getOptions().length > 0 && gx.findEvent(gx.eventId);
    if (optsOk) { pass++; console.log('✔ eventId 不可解析时回退到本章可解析事件（getOptions 非空，非死局）'); }
    else { fail++; console.log('✘ eventId 回退失败，导入后成死局'); }
  }
  // 缺失维度按 INIT 补齐（否则 _clampA 遇 undefined 得 NaN）
  {
    const sv = mkSave((x) => { delete x.snapshot.attrs.caifu; });
    const gx = mkGame('normal', rngHigh);
    const okm = gx.importSave(sv) && typeof gx.attrs.caifu === 'number' && isFinite(gx.attrs.caifu);
    if (okm) { pass++; console.log('✔ 缺失维度按 INIT 补齐（caifu=' + gx.attrs.caifu + '）'); }
    else { fail++; console.log('✘ 缺失维度未补齐'); }
  }
  // peak 缺键不得让功业评分得 NaN
  {
    const sv = mkSave((x) => { delete x.snapshot.peak; });
    const gx = mkGame('normal', rngHigh);
    gx.importSave(sv); gx.finishEnding('E1');
    if (isFinite(gx.ending.total) && isFinite(gx.ending.scores.gongye)) { pass++; console.log('✔ peak 缺键时结局评分有限（total=' + gx.ending.total + ' gongye=' + gx.ending.scores.gongye + '）'); }
    else { fail++; console.log('✘ peak 缺键致结局评分 NaN：' + JSON.stringify(gx.ending.scores)); }
  }
  // getOptions 对未知 eventId 返回空集而非抛异常（引擎层契约）
  {
    const gx = mkGame('normal', rngHigh);
    gx.start();
    gx.eventId = '9-9';
    let threw = false, res = null;
    try { res = gx.getOptions(); } catch (e) { threw = true; }
    if (!threw && Array.isArray(res) && res.length === 0) { pass++; console.log('✔ getOptions 未知 eventId 返回空集（不抛异常）'); }
    else { fail++; console.log('✘ getOptions 未知 eventId 抛异常或返回非空'); }
    if (gx.choose(0) === null) { pass++; console.log('✔ choose 未知 eventId 返回 null'); }
    else { fail++; console.log('✘ choose 未防护'); }
  }
}

/* ---------- 40. CHAPTERS summaryNotes → 章末结算页 notes（序章 4 条教学：v1.8 增岁月/疾病条） ---------- */
{
  const g = mkGame('normal', rngHigh);
  g.randomOn = false; g.start(); g.beginEvents();
  g.playCard(0); g.choose(0); g.proceed(); // 0-1
  g.playCard(0); g.choose(0); g.proceed(); // 0-2 忍了 → 0-3
  g.playCard(0); g.choose(0);              // 0-3 变卖家资 → NEXT
  const r = g.proceed();    // → 章末结算页
  const notes = r.summary && r.summary.notes;
  if (r.type === 'summary' && notes && notes.length === 4 && notes === D.CHAPTERS[0].summaryNotes) { pass++; console.log('✔ 序章结算页 summary.notes 为 4 条（引用 CHAPTERS.summaryNotes）'); }
  else { fail++; console.log('✘ 结算页 notes 异常：' + (notes && notes.length)); }
  if (D.CHAPTERS.every(ch => Array.isArray(ch.summaryNotes) && ch.summaryNotes.length > 0)) { pass++; console.log('✔ 各章均有 summaryNotes'); }
  else { fail++; console.log('✘ 有章节缺 summaryNotes'); }
}

/* ---------- 41. 修正池结构：9 条因果化、三段各 3 条；逆天段池首含正危机（BACKLASH 断言依赖） ---------- */
{
  const seg = function (min) { return D.CORRECTIONS.filter(c => c.minDev === min); };
  const s1 = seg(21), s2 = seg(46), s3 = seg(71);
  if (D.CORRECTIONS.length === 9 && s1.length === 3 && s2.length === 3 && s3.length === 3) { pass++; console.log('✔ 修正池 9 条：微澜(21–45)/改流(46–70)/逆天(71–100) 各 3 条'); }
  else { fail++; console.log('✘ 修正池结构异常：共 ' + D.CORRECTIONS.length + ' 条，分段 ' + s1.length + '/' + s2.length + '/' + s3.length); }
  if (s3[0].eff.attrs && s3[0].eff.attrs.weiji > 0) { pass++; console.log('✔ 逆天段池首项含正危机（+' + s3[0].eff.attrs.weiji + '），固定 rng 下章中反噬恒取此项'); }
  else { fail++; console.log('✘ 逆天段池首项危机非正（会破坏 #21 反噬断言）'); }
}

/* ---------- 42. E1 变体「无言东市」：史实线 6-3 沉默赴死 → E1/wuyan ---------- */
{
  const { g } = play('normal', {
    '0-1': '驻足细想', '0-2': '辞去吏职', '0-4': '仓中鼠',
    '1-1': '潜心问学', '1-2': '西入秦', '1-3': '细察秦国民情',
    '2-1': '埋头著文', '2-2': '灭诸侯、成帝业', '2-3': '上书自辩', '2-4': '全力经略',
    '3-1': '拖延时日', '3-2': '上书——',
    '4-1': '物禁大盛', '4-2': '弹劾韩非', '4-3': '独排众议', '4-4': '倾力推行', '4-5': '上焚书议', '4-6': '缄默',
    '5-1': '怒斥', '5-2': '从之。矫诏',
    '6-1': '上督责书', '6-2': '照常入谏', '6-3': '不写了'
  });
  expect('无言东市变体', g.ending, 'E1', 'wuyan');
}

/* ---------- 43. 回合发牌 offer 结构：1 关键 + ≤3 行动；行动卡 chapters 过滤（不同章池不同） ---------- */
{
  const g = mkGame('normal', rngHigh);
  g.randomOn = false; g.start(); g.beginEvents();
  const offer = g.getOffer();
  const key = offer[0];
  const acts = offer.slice(1);
  const structOk = key.type === 'key' && key.eventId === '0-1' && typeof key.title === 'string' && key.title.length > 0
    && key.roundsLeft === E.KEY_CARD_ROUNDS && key.inserted === false
    && acts.length > 0 && acts.length <= 4
    && acts.every(o => o.type === 'action' && o.action && typeof o.locked === 'boolean' && typeof o.usedCount === 'number' && typeof o.diminishing === 'boolean');
  if (structOk) { pass++; console.log('✔ offer 结构：1 关键卡（' + key.eventId + '「' + key.title + '」倒计时 ' + key.roundsLeft + '）+ ' + acts.length + ' 行动卡（≤3 常规 + 至多 1 强制抉择卡）'); }
  else { fail++; console.log('✘ offer 结构异常：' + JSON.stringify(offer.map(o => o.type))); }
  // chapters 过滤：章 0 offer 内行动均覆盖章 0，且不含他章专属（如 ACT-13 兰陵）
  const inCh0 = acts.every(o => o.action.chapters[0] <= 0 && 0 <= o.action.chapters[1]);
  if (inCh0) { pass++; console.log('✔ 章 0 行动卡 chapters 过滤正确（' + acts.map(o => o.action.id).join('、') + '）'); }
  else { fail++; console.log('✘ 章 0 行动卡越章：' + acts.map(o => o.action.id).join('、')); }
  // 不同章池不同：章 1 offer 行动均覆盖章 1，且两章可用池 id 集不同
  const poolOf = ci => D.ACTIONS.filter(a => a.chapters[0] <= ci && ci <= a.chapters[1]).map(a => a.id).join(',');
  const g1 = mkGame('normal', rngHigh);
  g1.randomOn = false; g1.start(); g1.enterChapter(1); g1.beginRounds();
  const acts1 = g1.getOffer().slice(1);
  const inCh1 = acts1.every(o => o.action.chapters[0] <= 1 && 1 <= o.action.chapters[1]);
  if (inCh1 && poolOf(0) !== poolOf(1)) { pass++; console.log('✔ 章 1 行动卡 chapters 过滤正确，且章 0/章 1 行动池不同'); }
  else { fail++; console.log('✘ 章 1 行动卡过滤异常：' + acts1.map(o => o.action.id).join('、')); }
}

/* ---------- 44. 关键卡倒计时：连出行动卡 roundsLeft 3→2→1→0，归零强制进入关键事件抉择（不自动结算）；连用收益无递减（卡牌 v2） ---------- */
{
  const g = mkGame('normal', rngHigh);
  g.randomOn = false; g.start(); g.beginEvents();
  const seen = [];
  let r = null;
  for (let k = 0; k < 3; k++) {
    seen.push(g.getOffer()[0].roundsLeft);
    g.offer = [{ type: 'key' }, { type: 'action', id: 'ACT-1' }]; // stub 发牌锁定同一行动
    r = g.playCard(1);
  }
  if (seen.join('→') === '3→2→1') { pass++; console.log('✔ 关键卡倒计时随行动卡递减：' + seen.join('→') + '→0'); }
  else { fail++; console.log('✘ 倒计时序列异常：' + seen.join('→')); }
  // 第 3 次使用（卡牌 v2 无递减）：收益与首次完全相同（才学+3/声望+1），代价危机+2 不变
  const d3cx = r.changes.find(c => c.k === 'caixue'), d3sw = r.changes.find(c => c.k === 'shengwang'), d3wj = r.changes.find(c => c.k === 'weiji');
  if (r.useCount === 3 && d3cx.delta === 3 && d3sw.delta === 1 && d3wj.delta === 2) { pass++; console.log('✔ 第 3 次收益与首次完全相同（无递减：才学+3 声望+1），代价危机+2 不变'); }
  else { fail++; console.log('✘ 连用收益异常：' + JSON.stringify(r.changes)); }
  // 归零强制抉择：停在 0-1 事件页（phase 'event'），未自动 choose、未推进；成就「时不我待」解锁
  if (r.forcedKey === true && g.phase === 'event' && g.eventId === '0-1' && !r.route && !g.flags.guanshu) {
    pass++; console.log('✔ 倒计时归零强制进入 0-1 抉择页（forcedKey，未自动结算、未推进）');
  } else { fail++; console.log('✘ 强制抉择异常：eventId=' + g.eventId + ' phase=' + g.phase + ' forcedKey=' + r.forcedKey); }
  if (g.ach.includes('shiwodai') && r.achNew && r.achNew.indexOf('时不我待') >= 0) { pass++; console.log('✔ 成就解锁：时不我待（倒计时归零被历史赶上）'); }
  else { fail++; console.log('✘ 强制抉择未解锁成就 shiwodai'); }
  // 玩家亲选史实项（驻足细想）后正常推进：0-2 新回合、倒计时回满
  const idx01 = g.getOptions().findIndex(o => o.opt.t.indexOf('驻足细想') >= 0);
  g.choose(idx01);
  const rt = g.proceed();
  if (rt && rt.type === 'round' && g.eventId === '0-2' && g.phase === 'round' && g.keyRoundsLeft === E.KEY_CARD_ROUNDS && g.flags.guanshu) {
    pass++; console.log('✔ 强制抉择后玩家亲选：0-1 史实项结算，推进至 0-2，倒计时回满');
  } else { fail++; console.log('✘ 亲选推进异常：eventId=' + g.eventId + ' phase=' + g.phase + ' route=' + JSON.stringify(rt && rt.type)); }
}

/* ---------- 45. hist 未达标转险招时强制抉择：事件页 hist 选项变险招（史实升一档 20%），玩家亲选无门槛项（6-3 才学不足→「不写了」） ---------- */
{
  const g = mkGame('normal', rngHigh);
  g.randomOn = false; g.start();
  g.enterChapter(6);
  g.eventId = '6-3';
  g.attrs.caixue = 30; // 「狱中上书」（hist）需才学 60 → 险招（差 21 → 基档 15%，史实升一档 20%）
  g.beginRounds();
  let r = null;
  for (let k = 0; k < 3; k++) {
    g.offer = [{ type: 'key' }, { type: 'action', id: 'ACT-4' }]; // 闭门读书：才学+3，30→39 仍不足 60
    r = g.playCard(1);
  }
  const opts63 = g.getOptions();
  const histRisky = opts63[0].risky && opts63[0].risky.rate === 20; // options[0] = hist「狱中上书」转险招（史实升档 15→20%）
  if (r.forcedKey === true && g.phase === 'event' && g.eventId === '6-3' && histRisky && !opts63[1].locked && !opts63[1].risky) {
    pass++; console.log('✔ 强制抉择（hist 险招史实升一档 20%）：停在 6-3 事件页，玩家须亲选');
  } else { fail++; console.log('✘ 强制抉择（hist 险招）异常：eventId=' + g.eventId + ' phase=' + g.phase + ' rate=' + (opts63[0].risky && opts63[0].risky.rate)); }
  g.choose(1);
  const rt63 = g.proceed();
  if (g.eventId === '6-4' && rt63) {
    pass++; console.log('✔ 玩家亲选无门槛项「不写了。沉默赴死」→ 6-4');
  } else { fail++; console.log('✘ 亲选推进异常：eventId=' + g.eventId); }
}

/* ---------- 45b. 险招机制：梯度 / 分类 / 选项成败 / 行动卡成败 / 硬锁与际遇（GDD 附录 J） ---------- */
{
  // 1. 成功率六档梯度（差 ≤3/6/9/12/15/>15 → 70/50/40/30/20/15）
  const gg = mkGame('normal', rngHigh);
  const tiers = [3, 6, 9, 12, 15, 16].map(x => gg.riskRate(x));
  if (tiers.join('/') === '70/50/40/30/20/15') { pass++; console.log('✔ 险招成功率六档梯度：' + tiers.join('/')); }
  else { fail++; console.log('✘ 梯度异常：' + tiers.join('/')); }
  // 2. 软硬分类：flag 硬锁优先；行动卡 caifu 特判硬；多门槛取最低档
  gg.attrs = { quanshi: 47, shengwang: 50, junxin: 40, caifu: 5, caixue: 30, weiji: 10 };
  const crMix = gg.checkRisk({ junxin: 50, flag: 'fusu' }, false);
  const crCaifu = gg.checkRisk({ caifu: 8 }, true);
  const crMulti = gg.checkRisk({ junxin: 43, caixue: 50 }, false); // gap 7→50 / gap 20→15 → min 15
  if (crMix.hardOk === false && crMix.hardReason === '需要扶苏的信任' && crMix.unmet.length === 1
    && crCaifu.hardOk === false && crCaifu.rate === null
    && crMulti.rate === 15) { pass++; console.log('✔ 软硬门槛分类：flag/行动caifu 硬锁优先，多门槛取最低档（min 15%）'); }
  else { fail++; console.log('✘ 分类异常：' + JSON.stringify({ m: crMix.hardOk, c: crCaifu.hardOk, r: crMulti.rate })); }
}

{
  // 3. 选项险招·成功：6-3「狱中上书」（hist）需才学 60，才学 55（差 5 → 基档 50%，史实升一档 70%），roll 31 ≤ 70 正常结算推进
  // 险招骰改走 risk 流：常量骰经 streams.risk 注入（0.3 → roll 31）
  const g = mkGame('normal', () => 0.3, { risk: () => 0.3 });
  g.randomOn = false; g.start(); g.enterChapter(6); g.eventId = '6-3';
  g.attrs.caixue = 55; g.beginRounds(); g.playCard(0);
  const opts = g.getOptions();
  const r = g.choose(0);
  const rt = (r && !r.failed) ? g.proceed() : null;
  if (opts[0].risky && opts[0].risky.rate === 70 && r && !r.failed && r.risk.success && r.risk.roll === 31
    && g.eventId === '6-4' && g.phase === 'round') { pass++; console.log('✔ 险招成功：roll 31 ≤ 70（史实升档），「狱中上书」正常结算推进 6-4'); }
  else { fail++; console.log('✘ 险招成功路径异常：' + JSON.stringify({ rate: opts[0].risky && opts[0].risky.rate, failed: r && r.failed, ev: g.eventId, phase: g.phase })); }
}

{
  // 4. 选项险招·失败：roll 81 ＞ 70（史实升档后）→ 危机+5、选项烧毁（已试，事未谐）、留在本事件改选
  // 险招骰改走 risk 流：常量骰经 streams.risk 注入（0.8 → roll 81）
  const g = mkGame('normal', () => 0.8, { risk: () => 0.8 });
  g.randomOn = false; g.start(); g.enterChapter(6); g.eventId = '6-3';
  g.attrs.caixue = 55; const wj0 = g.attrs.weiji; g.beginRounds(); g.playCard(0);
  const r = g.choose(0);
  const opts2 = g.getOptions();
  const failOk = r && r.failed === true && r.risk.roll === 81 && g.phase === 'event'
    && g.attrs.weiji === wj0 + 5
    && opts2[0].locked === true && opts2[0].reason === '已试，事未谐';
  g.choose(1); g.proceed(); // 改选「不写了」正常推进
  if (failOk && g.eventId === '6-4') { pass++; console.log('✔ 险招失败：roll 81 ＞ 70，危机+5、选项烧毁，改选「不写了」推进 6-4'); }
  else { fail++; console.log('✘ 险招失败路径异常：' + JSON.stringify({ failed: r && r.failed, roll: r && r.risk.roll, phase: g.phase, ev: g.eventId })); }
}

{
  // 5. 行动卡险招：ACT-22「修书吕门」需才学 45，才学 40（差 5 → 50%）入池带 risky；失败徒劳+计次+推进，成功正常结算
  // 险招骰改走 risk 流：常量骰经 streams.risk 注入（0.8 → roll 81 失败；0.3 → roll 31 成功）
  const g1 = mkGame('normal', () => 0.8, { risk: () => 0.8 });
  g1.randomOn = false; g1.start(); g1.enterChapter(2); g1.attrs.caixue = 40;
  g1.beginRounds();
  g1.offer = [{ type: 'key' }, { type: 'action', id: 'ACT-22' }];
  const off1 = g1.getOffer();
  const r1 = g1.playCard(1);
  const okActFail = off1[1].risky && off1[1].risky.rate === 50 && r1.failed === true && r1.text === '徒劳一场。'
    && r1.useCount === 1 && r1.changes.some(c => c.k === 'weiji' && c.delta === 3) && r1.route && r1.route.type === 'round';
  const g2 = mkGame('normal', () => 0.3, { risk: () => 0.3 });
  g2.randomOn = false; g2.start(); g2.enterChapter(2); g2.attrs.caixue = 40;
  g2.beginRounds();
  g2.offer = [{ type: 'key' }, { type: 'action', id: 'ACT-22' }];
  const r2 = g2.playCard(1);
  const okActSucc = r2 && !r2.failed && r2.risk.roll === 31 && g2.attrs.caixue === 41; // 修书吕门 caixue+1（卡牌 v2 缩窄）
  if (okActFail && okActSucc) { pass++; console.log('✔ 行动卡险招：入池带 risky（50%）；失败徒劳危机+3计次推进，成功 roll 31 正常结算'); }
  else { fail++; console.log('✘ 行动卡险招异常：' + JSON.stringify({ f: okActFail, s: okActSucc, roll: r2 && r2.risk && r2.risk.roll })); }
}

{
  // 6. 硬锁不变：caifu 支付检查卡在财富 0 时不入池；际遇选项险招成功路径
  // 险招骰改走 risk 流：常量骰经 streams.risk 注入（0.3 → roll 31）
  const g = mkGame('normal', () => 0.3, { risk: () => 0.3 });
  g.randomOn = false; g.start(); g.enterChapter(2); g.attrs.caifu = 0;
  g.beginRounds();
  const noCaifuCards = g.getOffer().slice(1).every(o => !(o.action && o.action.req && o.action.req.caifu));
  const r5 = D.RANDOM_EVENTS.find(e => e.id === 'R-5');
  g.currentRandom = r5; g.eventId = 'R-5'; g.phase = 'event'; g.attrs.caixue = 45; // 「拦住穷究其言」需 50，差 5 → 50%
  const opts5 = g.getOptions();
  const r = g.choose(2); // roll 31 ≤ 50 成功：caixue+3
  if (noCaifuCards && opts5[2].risky && opts5[2].risky.rate === 50 && r && !r.failed && r.risk.success && g.attrs.caixue === 48) {
    pass++; console.log('✔ 硬锁不变（caifu 支付卡财富 0 不入池）；际遇险招成功（roll 31 ≤ 50，才学 45→48）');
  } else { fail++; console.log('✘ 硬锁/际遇险招异常：' + JSON.stringify({ noCaifuCards, r5rate: opts5[2].risky && opts5[2].risky.rate, failed: r && r.failed })); }
}

/* ---------- 45c. 蓄势（v1.6）：放弃出牌换下一次事件抉择险招 +10，限一次、抉择后清空 ---------- */
{
  // 1. 基本语义：蓄势置旗、倒计时 -1、route round；再次蓄势无效（限一次）
  const g1 = mkGame('normal', rngHigh);
  g1.randomOn = false; g1.start(); g1.beginEvents();
  const r1 = g1.playXushi();
  const again = g1.playXushi();
  if (r1 && r1.kind === 'xushi' && g1.xushi === true && g1.keyRoundsLeft === 2 && g1.phase === 'round' && again === null) {
    pass++; console.log('✔ 蓄势基本语义：置旗、倒计时 3→2、限一次（再次调用无效）');
  } else { fail++; console.log('✘ 蓄势基本语义异常：' + JSON.stringify({ k: r1 && r1.kind, x: g1.xushi, left: g1.keyRoundsLeft, again })); }
}

{
  // 2. 蓄势对险招：5-2「假意从之」（非 hist，需才学 65 + guanshu），才学 55（差 10 → 基档 30%）+蓄势 10 → 40%；roll 36 ≤ 40 成功
  // 险招骰改走 risk 流：常量骰经 streams.risk 注入（0.35 → roll 36）
  const g = mkGame('normal', () => 0.35, { risk: () => 0.35 });
  g.randomOn = false; g.start(); g.enterChapter(5); g.eventId = '5-2';
  g.flags.guanshu = true; g.attrs.caixue = 55;
  g.beginRounds();
  g.playXushi();
  g.playCard(0);
  const opts = g.getOptions();
  const r = g.choose(3);
  if (opts[3].risky && r && r.risk && r.risk.rate === 40 && r.risk.success && !r.failed && g.xushi === false) {
    pass++; console.log('✔ 蓄势兑现：险招 30%+10=40%，roll 36 ≤ 40 成功，蓄势清空');
  } else { fail++; console.log('✘ 蓄势兑现异常：' + JSON.stringify({ rate: r && r.risk && r.risk.rate, success: r && r.risk && r.risk.success, x: g.xushi })); }
}

{
  // 3. 无险招落空：蓄势后选无门槛项，蓄势照常清空
  const g = mkGame('normal', () => 0.5);
  g.randomOn = false; g.start(); g.beginEvents();
  g.playXushi();
  g.playCard(0);
  g.choose(0); // 0-1「驻足细想」无 req
  if (g.xushi === false) { pass++; console.log('✔ 蓄势落空口径：无险招的抉择后蓄势清空'); }
  else { fail++; console.log('✘ 蓄势未清空'); }
}

{
  // 4. 余 1 轮蓄势：倒计时归零 → forcedKey 强制进入关键事件
  const g = mkGame('normal', rngHigh);
  g.randomOn = false; g.start(); g.beginEvents();
  for (let k = 0; k < 2; k++) { g.offer = [{ type: 'key' }, { type: 'action', id: 'ACT-1' }]; g.playCard(1); } // 3→1
  const r = g.playXushi(); // 1→0 → forcedKey
  if (r && r.forcedKey === true && g.phase === 'event' && g.eventId === '0-1') {
    pass++; console.log('✔ 余 1 轮蓄势：倒计时归零自动开启关键事件（forcedKey）');
  } else { fail++; console.log('✘ 蓄势归零异常：' + JSON.stringify({ fk: r && r.forcedKey, phase: g.phase })); }
}

/* ---------- 45d. 回溯状态穿越修复（v1.6.1 P0）：蓄势与险招烧毁不随回溯穿越；硬核掷骰标题不泄露数字 ---------- */
{
  // 1. 蓄势后回溯：xushi 清空，可重新蓄势
  const g = mkGame('normal', rngHigh);
  g.randomOn = false; g.start(); g.beginEvents();
  g.playXushi();
  const xBefore = g.xushi;
  g.backtrack();
  const xAfterBt = g.xushi;   // 回溯后立即检查：应为 false
  g.beginEvents();
  const rAgain = g.playXushi();
  if (xBefore === true && xAfterBt === false && rAgain && rAgain.kind === 'xushi') {
    pass++; console.log('✔ 回溯清蓄势：backtrack 后 xushi=false，可重新蓄势');
  } else { fail++; console.log('✘ 回溯蓄势穿越：before=' + xBefore + ' after=' + g.xushi); }
}

{
  // 2. 险招烧毁后回溯：_burned 清空，同一选项不再显示「已试，事未谐」
  const g = mkGame('normal', () => 0.8, { risk: () => 0.8 });
  g.randomOn = false; g.start();
  g.enterChapter(6); g.eventId = '6-3'; g.attrs.caixue = 55;
  g.beginRounds(); g.playCard(0);
  const r = g.choose(0); // hist 狱中上书 roll 81 ＞ 70 失败烧毁
  const burnedBefore = r && r.failed === true && g.getOptions()[0].locked === true;
  g.backtrack();
  g.beginEvents();
  g.eventId = '6-3'; g.beginRounds(); g.playCard(0);
  const optsAfter = g.getOptions();
  const cleared = Object.keys(g._burned).length === 0 && !optsAfter[0].locked && optsAfter[0].reason !== '已试，事未谐';
  if (burnedBefore && cleared) {
    pass++; console.log('✔ 回溯清烧毁：backtrack 后 _burned 清空，险招选项恢复可试');
  } else { fail++; console.log('✘ 回溯烧毁穿越：burnedBefore=' + burnedBefore + ' cleared=' + cleared); }
}

{
  // 3. 掷骰标题口径：普通显示点数与成功率；硬核只显档位词（无数字、无百分号）
  const mk = (diff) => { const g = mkGame(diff, rngHigh); return g; };
  const fake = (rate, roll, success) => ({ risk: { rate: rate, roll: roll, success: success, unmet: [] } });
  const tN = mk('normal').riskTitle(fake(50, 31, true));
  const tH = mk('hardcore').riskTitle(fake(50, 31, true));
  const tHf = mk('hardcore').riskTitle(fake(30, 81, false));
  const digits = /\d|%/;
  if (tN.indexOf('31') >= 0 && tN.indexOf('50') >= 0 && tN.indexOf('掷骰') >= 0
    && !digits.test(tH) && tH.indexOf('成算五成') >= 0
    && !digits.test(tHf) && tHf.indexOf('成算三成') >= 0 && tHf.indexOf('败') >= 0) {
    pass++; console.log('✔ 掷骰标题：普通含点数/成功率，硬核只显档位词（' + tH + ' / ' + tHf + '）');
  } else { fail++; console.log('✘ 掷骰标题异常：normal=' + tN + ' hardcore=' + tH + ' / ' + tHf); }
}

{
  // 4. 章末选项门槛（v1.6.2 P1 修复）：cj-tuiyin「上表辞官」req devMax 45——高偏离不可绕过（引擎兜底）
  const g = mkGame('normal', rngHigh);
  g.randomOn = false; g.start();
  const ev = D.CHAPTERS[4].endEvents.find(e => e.id === 'cj-tuiyin');
  g.dev = 50; g.currentEndEvent = ev;
  const r1 = g.endEventChoose(0); // 上表辞官：dev 50 ＞ 45，引擎应拦截
  const blocked = r1 === null && g.currentEndEvent === ev;
  g.dev = 40;
  const r2 = g.endEventChoose(0); // dev 40 ≤ 45，放行
  if (blocked && r2 && r2.text && r2.text.indexOf('表章') >= 0) {
    pass++; console.log('✔ 章末选项门槛：偏离＞45 引擎拦截，≤45 正常放行（引擎+UI 双层）');
  } else { fail++; console.log('✘ 章末选项门槛异常：blocked=' + blocked + ' r2text=' + (r2 && r2.text || '').slice(0, 8)); }
}

/* ---------- 46. 行动卡数据卫生（卡牌 v2 + 抉择卡）：76 个行动 eff 单项 ≤±8（上限随 ATTRS max 缩放，现全维度 100 即 ≤±8）、zg ≤±5、带 chapters；抉择卡逐选项同口径检查 ---------- */
{
  const bad = [];
  const amax = {}; D.ATTRS.forEach(a => { amax[a.k] = a.max || 100; });
  D.ACTIONS.forEach(a => {
    if (!Array.isArray(a.chapters) || a.chapters.length !== 2) bad.push(a.id + ' 缺 chapters');
    // 抉择卡无顶层 eff，逐选项检查；普通卡查自身 eff
    const effList = a.choice ? (a.choice.options || []).map(o => o.eff || {}) : [a.eff || {}];
    effList.forEach(eff => {
    Object.keys(eff.attrs || {}).forEach(k => {
      const lim = Math.max(8, Math.round((amax[k] || 100) * 0.08));
      if (Math.abs(eff.attrs[k]) > lim) bad.push(a.id + ' ' + k + '=' + eff.attrs[k]);
    });
    if (eff.zg && Math.abs(eff.zg) > 5) bad.push(a.id + ' zg=' + eff.zg);
      if (eff.flags || eff.rmflags || eff.hist || eff.merit) bad.push(a.id + ' 干扰结局树字段');
    });
  });
  const poolSizes = [];
  for (let ci = 0; ci <= 6; ci++) poolSizes.push(D.ACTIONS.filter(a => a.chapters[0] <= ci && ci <= a.chapters[1]).length);
  const poolExpect = [18, 19, 19, 19, 19, 19, 17];
  if (D.ACTIONS.length === 76 && bad.length === 0 && poolSizes.every((n, i) => n === poolExpect[i])) { pass++; console.log('✔ 76 个行动数据卫生（卡牌 v2 + 12 抉择卡）：单项 ≤±8、zg ≤±5、每章池 ' + poolExpect.join('/') + '（实测 ' + poolSizes.join('/') + '）'); }
  else { fail++; console.log('✘ 行动数据卫生异常：' + (bad.join('；') || '池大小 ' + poolSizes.join('/') + ' 总数 ' + D.ACTIONS.length)); }
}

/* ---------- 47. 成就埋点：义薄云天（2-3-C 收尸）/ 护书之人（4-5-B 官藏代焚）/ 死里逃生（3-3-A 狱中书） ---------- */
{
  const g1 = driveTo('2-4', { '2-3': 2 }); // 为吕不韦收尸
  if (g1.ach.includes('yibo')) { pass++; console.log('✔ 成就埋点：义薄云天（2-3-C 为吕不韦收尸）'); }
  else { fail++; console.log('✘ 2-3-C 未解锁成就 yibo'); }

  const g2 = driveTo('4-6', { '3-1': 1, '4-5': 1 }); // 拖延时日 → 上书（默认首选）→ 官藏代焚
  if (g2.ach.includes('hushu')) { pass++; console.log('✔ 成就埋点：护书之人（4-5-B 官藏代焚）'); }
  else { fail++; console.log('✘ 4-5-B 未解锁成就 hushu'); }

  // 3-3-A：构造危机 69（避开 shouxi≥70 异变）、才学 65、君心 40（避开 mibao≥45）进第三章
  const g3 = mkGame('normal', rngHigh);
  g3.randomOn = false; g3.start();
  g3.attrs.weiji = 69; g3.attrs.caixue = 65; g3.attrs.junxin = 40;
  g3.enterChapter(3); g3.beginEvents();
  g3.playCard(0);                 // → 事件 3-1
  if (g3.eventId === '3-1') {
    g3.choose(2); g3.proceed();   // 藏匿咸阳：危机 69+15=84 ≥80 → 下狱 3-3
    g3.playCard(0);               // → 事件 3-3
    const opts33 = g3.getOptions();
    if (g3.eventId === '3-3' && !opts33[0].locked) {
      g3.choose(0);               // 狱中上书，陈情自辩：危机 84-30=54
      if (g3.ach.includes('sili') && g3.attrs.weiji === 54) { pass++; console.log('✔ 成就埋点：死里逃生（3-3-A 狱中书复官）'); }
      else { fail++; console.log('✘ 3-3-A 结算异常：ach=' + g3.ach.join(',') + ' weiji=' + g3.attrs.weiji); }
    } else { fail++; console.log('✘ 3-3-A 未到达或被锁定：eventId=' + g3.eventId); }
  } else { fail++; console.log('✘ 第三章起始事件异常：' + g3.eventId); }
}

/* ---------- 48. 百科词条完整性：所有 ⟦标记⟧ 均有定义，词条库 ≥40 条（GDD 5.6 阶段 2 口径） ---------- */
{
  const s = JSON.stringify(D.CHAPTERS) + JSON.stringify(D.RANDOM_EVENTS) + JSON.stringify(D.CRISIS_EVENTS) + JSON.stringify(D.ACTIONS);
  const marks = [...new Set([...s.matchAll(/⟦(.+?)⟧/g)].map(m => m[1]))];
  const missing = marks.filter(t => !D.GLOSSARY[t]);
  if (missing.length === 0 && Object.keys(D.GLOSSARY).length >= 40) { pass++; console.log('✔ 百科词条：' + marks.length + ' 种标记全部有定义，词条库 ' + Object.keys(D.GLOSSARY).length + ' 条'); }
  else { fail++; console.log('✘ 词条缺定义：' + missing.join('、') + '；库容 ' + Object.keys(D.GLOSSARY).length); }
}

/* ---------- 49. 章内进度口径：startAlt 条件起点跳过的章首事件不计入分母（GDD 3.3） ---------- */
{
  const g1 = mkGame('normal', rngHigh);
  g1.randomOn = false; g1.start();
  g1.attrs.junxin = 50; // mibao：3-0 起点
  g1.enterChapter(3);
  const p1 = g1.chapterProgress();
  const g2 = mkGame('normal', rngHigh);
  g2.randomOn = false; g2.start();
  g2.enterChapter(3);   // 君心 20：3-1 起点，3-0 不出现
  const p2 = g2.chapterProgress();
  if (p1.total === 4 && p2.total === 3) { pass++; console.log('✔ 章内进度分母按实际起点调整（密报线 4 / 常规线 3）'); }
  else { fail++; console.log('✘ 进度分母异常：密报线 ' + p1.total + ' / 常规线 ' + p2.total); }
}

/* ---------- 50. 蒙恬敌意实装（GDD 4.3）：lianmeng/mtdi 埋点与 5-4 兵变判定分支 ---------- */
{
  // (a) 5-1-D 埋点：偏离≥46 选「密遣心腹，北联蒙恬」→ 置 lianmeng，结算条目带注记
  const ga = mkGame('normal', rngHigh);
  ga.randomOn = false; ga.start(); ga.dev = 50; ga.enterChapter(5); ga.beginEvents();
  ga.playCard(0); // 关键卡 → 5-1
  const iD = ga.getOptions().findIndex(o => o.opt.t.indexOf('密遣心腹') >= 0);
  const ra = ga.choose(iD);
  if (ga.flags.lianmeng && ra.changes.some(c => c.note && c.note.indexOf('北军') >= 0) && ra.text.indexOf('蒙恬收下了玉璧') >= 0) { pass++; console.log('✔ 5-1-D 埋点：置 Flag【已联蒙恬】，结算文本与注记呼应'); }
  else { fail++; console.log('✘ lianmeng 埋点异常：flag=' + !!ga.flags.lianmeng + ' changes=' + JSON.stringify(ra.changes)); }
  // (b) lianmeng → 5-4 放宽：危机 90（>84 原上限）仍可达 E6 正传
  const gb = mkGame('normal', rngHigh);
  gb.start(); gb.enterChapter(5);
  gb.flags.fusu = true; gb.flags.lianmeng = true; gb.attrs.weiji = 90; gb.eventId = '5-4';
  gb.choose(0); gb.proceed();
  if (gb.ending && gb.ending.id === 'E6' && !gb.ending.variant) { pass++; console.log('✔ 已联蒙恬：5-4 判定放宽（危机 90>84 仍收 E6 正传）'); }
  else { fail++; console.log('✘ lianmeng 放宽异常：' + (gb.ending && gb.ending.id + '/' + gb.ending.variant)); }
  // (c) 对照：无旗维持现状——同样危机 90 只能 E6/kaifu
  const gc = mkGame('normal', rngHigh);
  gc.start(); gc.enterChapter(5);
  gc.flags.fusu = true; gc.attrs.weiji = 90; gc.eventId = '5-4';
  gc.choose(0); gc.proceed();
  if (gc.ending && gc.ending.id === 'E6' && gc.ending.variant === 'kaifu') { pass++; console.log('✔ 对照（无旗）：危机 90 按原判定收 E6/开府之阶（现状不变）'); }
  else { fail++; console.log('✘ 无旗对照异常：' + (gc.ending && gc.ending.id + '/' + gc.ending.variant)); }
  // (d) 4-6-C 埋点：附议重罚扶苏 → 置 mtdi，结算条目带注记
  const gd = driveTo('4-6', { '3-1': 1 });
  const iC = gd.getOptions().findIndex(o => o.opt.t.indexOf('附议重罚') >= 0);
  const rd = gd.choose(iC);
  if (gd.flags.mtdi && rd.changes.some(c => c.note && c.note.indexOf('蒙恬') >= 0)) { pass++; console.log('✔ 4-6-C 埋点：置 Flag【蒙恬敌意】，结算注记「' + rd.changes.find(c => c.note).note + '」'); }
  else { fail++; console.log('✘ mtdi 埋点异常：flag=' + !!gd.flags.mtdi); }
  // (e) mtdi → 5-4 降档：危机未炽则蒙恬按兵，你死于乱中而扶苏终立（E6/kaifu）
  const ge = mkGame('normal', rngHigh);
  ge.start(); ge.enterChapter(5);
  ge.flags.fusu = true; ge.flags.mtdi = true; ge.attrs.weiji = 50; ge.eventId = '5-4';
  ge.choose(0); ge.proceed();
  if (ge.ending && ge.ending.id === 'E6' && ge.ending.variant === 'kaifu') { pass++; console.log('✔ 蒙恬敌意：兵变降档——危机 50 收 E6/开府之阶（原可收 E6 正传）'); }
  else { fail++; console.log('✘ mtdi 降档异常：' + (ge.ending && ge.ending.id + '/' + ge.ending.variant)); }
  // (f) mtdi 且危机炽 → 兵变必败（E8/矫诏事发）
  const gf = mkGame('normal', rngHigh);
  gf.start(); gf.enterChapter(5);
  gf.flags.fusu = true; gf.flags.mtdi = true; gf.attrs.weiji = 90; gf.eventId = '5-4';
  gf.choose(0); gf.proceed();
  if (gf.ending && gf.ending.id === 'E8' && gf.ending.variant === 'xiefa') { pass++; console.log('✔ 蒙恬敌意且危机炽：兵变必败，收 E8/矫诏事发'); }
  else { fail++; console.log('✘ mtdi 必败异常：' + (gf.ending && gf.ending.id + '/' + gf.ending.variant)); }
}

/* ---------- 51. 死 Flag 兑现：zhihanfei → 4-2 altSegs 文本变体 + 选项 B condAttrs 增益（GDD 1-1-C） ---------- */
{
  const g = driveTo('4-2', { '3-1': 1, '1-1': 2 }); // 常与韩非论辩 → zhihanfei
  const alt = g.findEvent('4-2').altSegs;
  if (g.flags.zhihanfei && alt && alt.flag === 'zhihanfei' && alt.segs[1].indexOf('兰陵') >= 0) { pass++; console.log('✔ 持【知韩非】：4-2 配 altSegs 文本变体（你早知此人才华与锋芒）'); }
  else { fail++; console.log('✘ 4-2 altSegs 异常：' + JSON.stringify(alt && alt.flag)); }
  const r = g.choose(1); // 举荐韩非，共治秦廷
  const hit = r.changes.find(c => c.k === 'shengwang' && c.delta === 3 && c.note);
  if (hit) { pass++; console.log('✔ 知韩非判定兑现：举荐韩非结算含 condAttrs 声望+3（' + hit.note + '）'); }
  else { fail++; console.log('✘ zhihanfei condAttrs 异常：' + JSON.stringify(r.changes)); }
}

/* ---------- 52. 死 Flag 兑现：zhezhong → E4/E6 史传追加「官藏代焚，书得不绝」尾声句（GDD 4-5-B） ---------- */
{
  const g = mkGame('normal', rngHigh);
  g.start(); g.flags.zhezhong = true;
  const e4 = g.buildEnding('E4', null), e6 = g.buildEnding('E6', null);
  if (e4.zhuan.indexOf('官藏代焚') >= 0 && e6.zhuan.indexOf('官藏代焚') >= 0) { pass++; console.log('✔ 持【焚书折中】：E4 与 E6 史传均追加官藏代焚尾声句'); }
  else { fail++; console.log('✘ zhezhong 尾声缺失'); }
  const g2 = mkGame('normal', rngHigh);
  g2.start();
  if (g2.buildEnding('E4', null).zhuan.indexOf('官藏代焚') < 0) { pass++; console.log('✔ 对照：无 flag 的 E4 史传无此尾声'); }
  else { fail++; console.log('✘ zhezhong 对照异常'); }
}

/* ---------- 53. 死 Flag 兑现：wu_fenshu → 第五/六章章首一次性警示 + 声望-3/章持续侵蚀（GDD 4-5-A） ---------- */
{
  const g = mkGame('normal', rngHigh);
  g.start(); g.flags.wu_fenshu = true;
  const s0 = g.attrs.shengwang;
  g.enterChapter(5);
  if (g.attrs.shengwang === s0 - 3 && g.introNotes.some(n => n.indexOf('污名·焚书') >= 0)) { pass++; console.log('✔ 污名·焚书：第五章章首警示 + 声望 ' + s0 + '→' + g.attrs.shengwang); }
  else { fail++; console.log('✘ 焚书污名章首结算异常：shengwang=' + g.attrs.shengwang); }
  g.enterChapter(6);
  if (g.attrs.shengwang === s0 - 6 && !g.introNotes.some(n => n.indexOf('污名·焚书') >= 0) && g.introNotes.some(n => n.indexOf('士林侧目') >= 0)) { pass++; console.log('✔ 第六章侵蚀持续（声望 ' + g.attrs.shengwang + '），一次性警示不重复'); }
  else { fail++; console.log('✘ 焚书污名持续侵蚀异常：shengwang=' + g.attrs.shengwang); }
  // 边界对照：第四章章首不触发（正常流程旗在 4-5-A 才立，此处人工置旗仅验证 idx>=5 门槛）
  const g3 = mkGame('normal', rngHigh);
  g3.start(); g3.flags.wu_fenshu = true;
  const s3 = g3.attrs.shengwang;
  g3.enterChapter(4);
  if (g3.attrs.shengwang === s3 && !g3.introNotes.some(n => n.indexOf('士林侧目') >= 0)) { pass++; console.log('✔ 对照：第四章章首不触发焚书污名侵蚀（声望 ' + g3.attrs.shengwang + ' 不变）'); }
  else { fail++; console.log('✘ 焚书污名章界异常：shengwang=' + g3.attrs.shengwang); }
}

/* ---------- 54. N1 籍没边界：capAttrs 只降不升——财富 3 的贫寒玩家不被反向补贴 ---------- */
{
  const g = mkGame('normal', rngHigh);
  g.randomOn = false; g.start();
  g.attrs.shengwang = 55; g.attrs.caifu = 3;
  g.enterChapter(3);
  if (g.flags.jimo && g.attrs.caifu === 3) { pass++; console.log('✔ 籍没边界：财富 3 低于封存上限，jimo 触发但财富不增（不反向补贴）'); }
  else { fail++; console.log('✘ 籍没边界异常：jimo=' + !!g.flags.jimo + ' caifu=' + g.attrs.caifu); }
  const g2 = mkGame('normal', rngHigh);
  g2.randomOn = false; g2.start();
  g2.attrs.shengwang = 55; g2.attrs.caifu = 30;
  g2.enterChapter(3);
  if (g2.flags.jimo && g2.attrs.caifu === 5) { pass++; console.log('✔ 籍没封存：财富 30 高于上限，被封存至 5'); }
  else { fail++; console.log('✘ 籍没封存异常：jimo=' + !!g2.flags.jimo + ' caifu=' + g2.attrs.caifu); }
}

/* ---------- 55. 判定树 #9 catch-all：路由条件数组全部未命中 → E8 兜底（GDD 9.1） ---------- */
{
  const g = mkGame('normal', rngHigh);
  g.start();
  const r = g.resolveTo([{ if: { flag: 'bucunzai' }, to: 'NEXT' }]);
  if (r.type === 'ending' && r.ending === 'E8') { pass++; console.log('✔ 条件数组全部未命中 → {type:ending, ending:E8}（判定树 #9 兜底）'); }
  else { fail++; console.log('✘ catch-all 异常：' + JSON.stringify(r)); }
}

/* ---------- 56. 属性上限表（v1.8）：attrMax 全 11 维均 100（引擎保留 per-attr max 机制，李斯不再声明 max） ---------- */
{
  const g = mkGame('normal', rngHigh);
  const keys = ['tupo', 'wuli', 'caixue', 'moulue', 'biancai', 'caifu', 'shengwang', 'quanshi', 'zhengji', 'junxin', 'weiji'];
  const bad = keys.filter(k => g.attrMax(k) !== 100);
  if (bad.length === 0) { pass++; console.log('✔ attrMax：全 11 维均 100（per-attr max 机制保留，李斯不声明 max）'); }
  else { fail++; console.log('✘ attrMax 异常：' + bad.map(k => k + '=' + g.attrMax(k)).join('、')); }
}

/* ---------- 57. 财富钳制：applyEff 大额增益封顶 100、大额扣减钳 0（_clampA 走 per-attr max，0–100 标尺） ---------- */
{
  const g = mkGame('normal', rngHigh);
  g.start();
  g.attrs.caifu = 80;
  g.applyEff({ attrs: { caifu: 50 } });  // 80+50 → 封顶 100
  const top = g.attrs.caifu;
  g.applyEff({ attrs: { caifu: -200 } }); // → 钳 0
  const bottom = g.attrs.caifu;
  if (top === 100 && bottom === 0) { pass++; console.log('✔ 财富钳制：80+50 封顶 100，再 -200 钳 0'); }
  else { fail++; console.log('✘ 财富钳制异常：上界 ' + top + ' / 下界 ' + bottom); }
}

/* ---------- 58. 年龄系统（v1.8）：章首定龄 + 体魄按龄衰减（c1 定龄 29 无衰减；c3 定龄 47 → 体魄 -2，注【春秋渐高】） ---------- */
{
  const g = mkGame('normal', rngHigh);
  g.randomOn = false; g.start(); // c0 定龄 25
  const a0 = g.age, t0 = g.attrs.tupo;
  g.enterChapter(1); // c1 定龄 29（<40 档）：不衰减、无【春秋渐高】
  const noDecay = g.age === 29 && g.attrs.tupo === t0 && !g.introNotes.some(n => n.indexOf('春秋渐高') >= 0);
  const g2 = mkGame('normal', rngHigh);
  g2.randomOn = false; g2.start();
  const t2 = g2.attrs.tupo;
  g2.enterChapter(3); // c3 定龄 47（40–54 档）：体魄 -2
  const decay = g2.age === 47 && g2.attrs.tupo === t2 - 2 && g2.introNotes.some(n => n.indexOf('春秋渐高') >= 0);
  if (a0 === 25 && noDecay && decay) { pass++; console.log('✔ 年龄定龄与衰减：c0=25 / c1=29 无衰减 / c3=47 体魄 ' + t2 + '→' + g2.attrs.tupo + '（【春秋渐高】入章首注）'); }
  else { fail++; console.log('✘ 年龄系统异常：a0=' + a0 + ' c1 age/tupo=' + g.age + '/' + g.attrs.tupo + ' c3=' + g2.age + '/' + g2.attrs.tupo); }
}

/* ---------- 58b. 寿元（v2.1.3）：高体魄延长寿命的两条通道——抵衰与却病。
 *            李斯是五本中寿元阈值（35/48）低于「体魄项生效上界 45」的一本，故两条通道皆可测；
 *            项羽（65/74）、荆轲（50/60）阈值高于 45，其寿元只作用于抵衰一条通道（体魄项本就恒为 0）。 ---------- */
{
  // (a) 抵衰三档：c6（74 岁，档位 -6）体魄 34/35/48 → 寿元+0/+1/+2 → 实减 -6/-5/-4
  const trio = [[34, 0, -6], [35, 1, -5], [48, 2, -4]].map(([tp, wantCred, wantD]) => {
    const g = mkGame('normal', rngHigh);
    g.randomOn = false; g.start();
    g.attrs.tupo = tp; const cr = g._longevity(); const t = g.attrs.tupo;
    g.enterChapter(5);   // CHAPTERS[5] = c5? 逐章定龄 25/29/37/47/63/74/75 → 索引 5 为 74 岁
    return cr === wantCred && g.attrs.tupo === t + wantD && g.age === 74;
  });
  // (b) 却病：74 岁同一体魄水位下，跨过 tier1(35) 即降低发病率。
  //     体魄 34 → effTupo 34 / effAge 74 → p = 0.03 + 11×0.004 + 19×0.004 = 0.150
  //     体魄 35 → effTupo 36 / effAge 73 → p = 0.03 +  9×0.004 + 18×0.004 = 0.138
  //     取 ill = 0.145 落在两者之间（须避开 0.150 边界：引擎判定为 roll >= p 则不发病）。
  const sickAt = (tp) => {
    const g = mkGame('normal', rngHigh, { ill: illSeq([0.145, 0.99]) });
    g.randomOn = false; g.start();
    g.attrs.tupo = tp; g.age = 74;
    g._tickIllness([]);
    return !!g.ill;
  };
  const illLo = sickAt(34), illHi = sickAt(35);
  // (c) 阈值须高于天然水位：start() 后体魄 30（INIT），开局不得白送寿元
  const gN = mkGame('normal', rngHigh);
  gN.randomOn = false; gN.start();
  const natOk = gN.attrs.tupo === 30 && gN._longevity() === 0;
  if (trio.every(Boolean)) { pass++; console.log('✔ 寿元抵衰三档（李斯 c5 定龄 74、档位 -6）：体魄 34/35/48 → 寿元+0/+1/+2，实减 -6/-5/-4'); }
  else { fail++; console.log('✘ 寿元抵衰异常：' + trio.join('/')); }
  if (illLo && !illHi && natOk) { pass++; console.log('✔ 寿元却病：74 岁体魄 34（寿元+0）发病率 16.6% → ill=0.150 发病；体魄 35（寿元+1）降至 13.8% → 不发病（且开局天然水位 30 无寿元）'); }
  else { fail++; console.log('✘ 寿元却病异常：illLo=' + illLo + ' illHi=' + illHi + ' natOk=' + natOk); }
}

/* ---------- 59. 疾病·小病（v1.8）：ill 流 0.0（<发病率）+ 0.99（≥大病率）→ minor{left:2}、当即体魄-2；两次行动后自愈 ---------- */
{
  const g = mkGame('normal', rngHigh, { ill: illSeq([0.0, 0.99]) });
  g.randomOn = false; g.start(); g.beginEvents();
  const t0 = g.attrs.tupo;
  g.offer = [{ type: 'key' }, { type: 'action', id: 'ACT-1' }];
  const r1 = g.playCard(1); // 出牌结算后 _tickIllness：0.0 < 发病率（0.09）发病；0.99 ≥ 大病率（0.2）→ 小病
  const onset = g.ill && g.ill.type === 'minor' && g.ill.left === 2 && g.attrs.tupo === t0 - 2
    && r1.changes.some(c => c.k === 'tupo' && c.delta === -2 && c.note && c.note.indexOf('偶感风寒') >= 0);
  g.offer = [{ type: 'key' }, { type: 'action', id: 'ACT-1' }];
  g.playCard(1); // left 2→1
  const mid = g.ill && g.ill.type === 'minor' && g.ill.left === 1;
  g.offer = [{ type: 'key' }, { type: 'action', id: 'ACT-1' }];
  const r3 = g.playCard(1); // left 1→0 → 自愈
  const healed = g.ill === null && r3.changes.some(c => c.note && c.note.indexOf('自愈') >= 0);
  if (onset && mid && healed) { pass++; console.log('✔ 小病：minor{left:2} 当即体魄-2；此后每次行动 left-1，两次行动归零自愈'); }
  else { fail++; console.log('✘ 小病流程异常：' + JSON.stringify({ onset, mid, healed, ill: g.ill })); }
}

/* ---------- 60. 疾病·大病（v1.8）：ill 流 0.0 + 0.0 → major：当即体魄-5/危机+3；此后每次行动体魄-2、危机+2、年龄+1，不自愈 ---------- */
{
  const g = mkGame('normal', rngHigh, { ill: illSeq([0.0, 0.0]) });
  g.randomOn = false; g.start(); g.beginEvents();
  const t0 = g.attrs.tupo, a0 = g.age;
  g.offer = [{ type: 'key' }, { type: 'action', id: 'ACT-1' }];
  const r1 = g.playCard(1); // 0.0 < 发病率 → 发病；0.0 < 大病率 → 大病
  const onset = g.ill && g.ill.type === 'major' && g.attrs.tupo === t0 - 5
    && r1.changes.some(c => c.k === 'tupo' && c.delta === -5 && c.note && c.note.indexOf('沉疴') >= 0)
    && r1.changes.some(c => c.k === 'weiji' && c.delta === 3 && c.note);
  g.offer = [{ type: 'key' }, { type: 'action', id: 'ACT-1' }];
  const t1 = g.attrs.tupo;
  const r2 = g.playCard(1); // 大病转归：体魄-2、危机+2、年龄+1
  const drain = g.ill && g.ill.type === 'major' && g.attrs.tupo === t1 - 2 && g.age === a0 + 1
    && r2.changes.some(c => c.k === 'tupo' && c.delta === -2 && c.note && c.note.indexOf('沉疴缠身') >= 0)
    && r2.changes.some(c => c.k === 'weiji' && c.delta === 2 && c.note && c.note.indexOf('病中无人主事') >= 0);
  g.offer = [{ type: 'key' }, { type: 'action', id: 'ACT-1' }];
  g.playCard(1); // 再行动：大病不自愈
  const noHeal = g.ill && g.ill.type === 'major' && g.age === a0 + 2;
  if (onset && drain && noHeal) { pass++; console.log('✔ 大病：major 当即体魄-5/危机+3；每次行动体魄-2、危机+2、年龄+1（' + a0 + '→' + g.age + '），不自愈'); }
  else { fail++; console.log('✘ 大病流程异常：' + JSON.stringify({ onset, drain, noHeal, ill: g.ill })); }
}

/* ---------- 61. 治病卡（v1.8）：染病后 beginRounds 加发「求医问药」（__cure__，不占行动池）；选它清病、财富-3、体魄+5、倒计时照常推进 ---------- */
{
  const g = mkGame('normal', rngHigh, { ill: illSeq([0.0, 0.0]) });
  g.randomOn = false; g.start(); g.beginEvents();
  g.offer = [{ type: 'key' }, { type: 'action', id: 'ACT-1' }];
  g.playCard(1); // 大病发作 → 回合重发牌应带治病卡
  const offer = g.getOffer();
  const ci = offer.findIndex(o => o.action && o.action.id === '__cure__');
  const poolCards = offer.slice(1).filter(o => o.action && o.action.id !== '__cure__');
  const offered = ci > 0 && offer[ci].action.name === '求医问药' && !offer[ci].locked && poolCards.length === 3;
  const c0 = g.attrs.caifu, t0 = g.attrs.tupo, rl0 = g.keyRoundsLeft;
  const r = g.playCard(ci);
  const cured = r && r.id === '__cure__' && g.ill === null
    && g.attrs.caifu === c0 - 3 && g.attrs.tupo === t0 + 5
    && g.keyRoundsLeft === rl0 - 1 && g.phase === 'round'
    && r.changes.some(c => c.k === 'caifu' && c.delta === -3) && r.changes.some(c => c.k === 'tupo' && c.delta === 5);
  const gone = g.getOffer().every(o => !(o.action && o.action.id === '__cure__')); // 愈后重发牌不再带治病卡
  if (offered && cured && gone) { pass++; console.log('✔ 治病卡：染病后 getOffer 可见「求医问药」（3 池卡之外）；财富 ' + c0 + '→' + g.attrs.caifu + '、体魄+5、清病、倒计时 ' + rl0 + '→' + g.keyRoundsLeft + '，愈后停发'); }
  else { fail++; console.log('✘ 治病卡异常：' + JSON.stringify({ offered, cured, gone, ill: g.ill })); }
}

/* ---------- 62. 病亡（v1.8）：体魄归零 → 致命难度 E8/baobing；剧情难度钳到 1 不死 ---------- */
{
  const g = mkGame('normal', rngHigh);
  g.randomOn = false; g.start(); g.beginEvents();
  g.ill = { type: 'major' }; g.attrs.tupo = 1;
  g.offer = [{ type: 'key' }, { type: 'action', id: 'ACT-1' }];
  const r = g.playCard(1); // 大病 drain：体魄 1-2 → 0 → 病亡
  const dead = r && r.forcedEnding === true;
  g.proceed();
  const eNormal = g.ending && g.ending.id === 'E8' && g.ending.variant === 'baobing';
  const gs = mkGame('story', rngHigh);
  gs.randomOn = false; gs.start(); gs.beginEvents();
  gs.ill = { type: 'major' }; gs.attrs.tupo = 1;
  gs.offer = [{ type: 'key' }, { type: 'action', id: 'ACT-1' }];
  const rs = gs.playCard(1); // 剧情难度：体魄钳 1，不致死
  const alive = rs && !rs.forcedEnding && gs.attrs.tupo === 1 && gs.ending === null && gs.phase === 'round';
  if (dead && eNormal && alive) { pass++; console.log('✔ 病亡：普通难度体魄归零 → E8/baobing「' + g.ending.name + '」；剧情难度同路径体魄钳 1 不死'); }
  else { fail++; console.log('✘ 病亡异常：' + JSON.stringify({ dead, eNormal, alive, tupo: gs.attrs.tupo })); }
}

/* ---------- 63. caifu 恒为硬门槛（v1.8）：C-DEATH「散尽家财」req 财富 30——29 锁定（非险招），30 可选 ---------- */
{
  const g = mkGame('normal', rngHigh);
  g.randomOn = false; g.start();
  g.attrs.weiji = 95; g.attrs.caifu = 29;
  g.enterChapter(1); g.beginEvents();
  g.playCard(0); // 关键卡 → C-DEATH
  const find = () => g.getOptions().find(o => o.opt.t.indexOf('散尽家财') >= 0);
  const low = find();           // 29 < 30：硬锁，不转险招
  g.attrs.caifu = 30;
  const high = find();          // 30 达标：可选
  if (low && low.locked === true && !low.risky && high && !high.locked && !high.risky) { pass++; console.log('✔ caifu 硬门槛：财富 29「散尽家财」锁定（' + (low.reason || '无原因') + '，非险招），30 解锁'); }
  else { fail++; console.log('✘ caifu 硬门槛异常：' + JSON.stringify({ low: low && [low.locked, !!low.risky], high: high && [high.locked, !!high.risky] })); }
}

/* ---------- 64. v1.8 新分支 ×4：低于门槛转险招（软门槛口径）、达标直选、路由/变体/Flag 正确 ---------- */
{
  // (a) 2-2 第 4 选项「献并国之策」req 谋略55 → to 2-3，置 Flag【谋国】
  const ga = driveTo('2-2', {});
  ga.attrs.moulue = 54;
  const aLow = ga.getOptions().find(o => o.opt.t.indexOf('献并国之策') >= 0);
  ga.attrs.moulue = 55;
  const aIdx = ga.getOptions().findIndex(o => o.opt.t.indexOf('献并国之策') >= 0);
  const aHigh = ga.getOptions()[aIdx];
  ga.choose(aIdx); ga.proceed();
  const aOk = aLow && !aLow.locked && aLow.risky && aLow.risky.rate === 70
    && aHigh && !aHigh.locked && !aHigh.risky
    && ga.flags.mouguo && ga.eventId === '2-3';
  if (aOk) { pass++; console.log('✔ 新分支 2-2「献并国之策」：谋略 54 转险招（70%）/ 55 直选，置【谋国】→ 2-3'); }
  else { fail++; console.log('✘ 2-2 新分支异常：' + JSON.stringify({ low: aLow && !!aLow.risky, flag: !!ga.flags.mouguo, ev: ga.eventId })); }

  // (b) 3-2 第 4 选项「仗剑出关」req 武力55 → E3 新变体「任侠去国」
  const gb = driveTo('3-2', { '3-1': 1 }); // 拖延时日 → 3-2
  gb.attrs.wuli = 54;
  const bLow = gb.getOptions().find(o => o.opt.t.indexOf('仗剑出关') >= 0);
  gb.attrs.wuli = 55;
  const bIdx = gb.getOptions().findIndex(o => o.opt.t.indexOf('仗剑出关') >= 0);
  const bHigh = gb.getOptions()[bIdx];
  gb.choose(bIdx); gb.proceed();
  const bOk = bLow && !bLow.locked && bLow.risky && bLow.risky.rate === 70
    && bHigh && !bHigh.locked && !bHigh.risky
    && gb.ending && gb.ending.id === 'E3' && gb.ending.variant === 'renxia' && gb.ending.name === '任侠去国';
  if (bOk) { pass++; console.log('✔ 新分支 3-2「仗剑出关」：武力 54 转险招 / 55 直选 → E3/renxia「任侠去国」'); }
  else { fail++; console.log('✘ 3-2 新分支异常：' + JSON.stringify({ low: bLow && !!bLow.risky, end: gb.ending && (gb.ending.id + '/' + gb.ending.variant) })); }

  // (c) 4-3（郡县之辩）第 3 选项「廷辩折儒——舌战淳于越」req 辩才55 → to 4-4
  const gc = driveTo('4-3', { '3-1': 1 });
  gc.attrs.biancai = 54;
  const cLow = gc.getOptions().find(o => o.opt.t.indexOf('廷辩折儒') >= 0);
  gc.attrs.biancai = 55;
  const cIdx = gc.getOptions().findIndex(o => o.opt.t.indexOf('廷辩折儒') >= 0);
  const cHigh = gc.getOptions()[cIdx];
  gc.choose(cIdx); gc.proceed();
  const cOk = cLow && !cLow.locked && cLow.risky && cLow.risky.rate === 70
    && cHigh && !cHigh.locked && !cHigh.risky
    && gc.eventId === '4-4';
  if (cOk) { pass++; console.log('✔ 新分支 4-3「廷辩折儒」：辩才 54 转险招 / 55 直选 → 4-4'); }
  else { fail++; console.log('✘ 4-3 新分支异常：' + JSON.stringify({ low: cLow && !!cLow.risky, ev: gc.eventId })); }

  // (d) 6-2 第 4 选项「历陈政绩，请归相印」req 政绩38（v2.1.0 再校准：原 45 循史口径仅 3% 可达，见 #66 注）→ E4 新变体「功成名遂」
  const gd = mkGame('normal', rngHigh);
  gd.randomOn = false; gd.start(); gd.enterChapter(6); gd.eventId = '6-2';
  gd.attrs.zhengji = 37;
  gd.beginRounds(); gd.playCard(0); // 关键卡 → 6-2
  const dLow = gd.getOptions().find(o => o.opt.t.indexOf('历陈政绩') >= 0);
  gd.attrs.zhengji = 38;
  const dIdx = gd.getOptions().findIndex(o => o.opt.t.indexOf('历陈政绩') >= 0);
  const dHigh = gd.getOptions()[dIdx];
  gd.choose(dIdx); gd.proceed();
  const dOk = dLow && !dLow.locked && dLow.risky && dLow.risky.rate === 70
    && dHigh && !dHigh.locked && !dHigh.risky
    && gd.ending && gd.ending.id === 'E4' && gd.ending.variant === 'gongcheng' && gd.ending.name === '功成名遂';
  if (dOk) { pass++; console.log('✔ 新分支 6-2「历陈政绩，请归相印」：政绩 37 转险招 / 38 直选 → E4/gongcheng「功成名遂」'); }
  else { fail++; console.log('✘ 6-2 新分支异常：' + JSON.stringify({ low: dLow && !!dLow.risky, end: gd.ending && (gd.ending.id + '/' + gd.ending.variant) })); }
}

/* ---------- 65. 回溯恢复病况（v1.8）：major 状态下回溯 → ill 回到章首快照值（章首无病 → null），年龄同步回卷 ---------- */
{
  const g = mkGame('normal', rngHigh, { ill: illSeq([0.0, 0.0]) });
  g.randomOn = false; g.start(); g.beginEvents();
  g.offer = [{ type: 'key' }, { type: 'action', id: 'ACT-1' }];
  g.playCard(1); // 大病发作（年龄 25 不变）
  g.offer = [{ type: 'key' }, { type: 'action', id: 'ACT-1' }];
  g.playCard(1); // 大病转归：年龄 25→26
  const sick = g.ill && g.ill.type === 'major' && g.age === 26;
  const ok = g.backtrack(); // 章首快照：无病、25 岁
  if (sick && ok === true && g.ill === null && g.age === 25) { pass++; console.log('✔ 回溯恢复病况：major/26 岁 → 章首快照（ill=null、25 岁）'); }
  else { fail++; console.log('✘ 回溯病况异常：sick=' + sick + ' ok=' + ok + ' ill=' + JSON.stringify(g.ill) + ' age=' + g.age); }
}

/* ---------- 66. 政绩经济（v2.1.0 扩源）：卡侧 7 源（补 ch1/ch5/ch6 三处此前空窗）/ 事件侧 hist 合计 30 / ACT-49 武力+3 / ch3·ch5 不再零财富源 ---------- */
{
  // (a) 行动卡 zhengji 源（v2.1.0）：ACT-11(ch1 督办粮簿)/21(ch3)/32/33/34/35(ch5)/62(ch6)，
  //     值 1/1/1/1/2/2/1 —— 此前 ch1/ch2/ch4/ch6/ch7 五章零供给，6-2「历陈政绩」在 ch6 结算时
  //     只能靠 ch5 一章堆到 45（循史口径实测 3% 可达），扩源后门槛下调至 38（41% 可达）。
  const zjCards = D.ACTIONS.filter(a => a.eff && a.eff.attrs && a.eff.attrs.zhengji).map(a => a.id + ':' + a.eff.attrs.zhengji).sort();
  const cardsOk = JSON.stringify(zjCards) === JSON.stringify(['ACT-11:1', 'ACT-21:1', 'ACT-32:1', 'ACT-33:1', 'ACT-34:2', 'ACT-35:2', 'ACT-62:1']);
  // (b) 事件侧 hist 政绩源：恰 2-4+5 / 4-3+10 / 4-4+10 / 6-1+5 四处，合计 30（≥30）
  const zjEvents = [];
  D.CHAPTERS.forEach(ch => (ch.events || []).forEach(ev => ev.options.forEach(o => { if (o.eff && o.eff.attrs && o.eff.attrs.zhengji) zjEvents.push(ev.id + ':' + o.eff.attrs.zhengji); })));
  const zjSum = zjEvents.reduce((s, x) => s + Number(x.split(':')[1]), 0);
  const eventsOk = JSON.stringify(zjEvents.slice().sort()) === JSON.stringify(['2-4:5', '4-3:10', '4-4:10', '6-1:5'].slice().sort()) && zjSum >= 30;
  if (cardsOk && eventsOk) { pass++; console.log('✔ 政绩经济存在性：卡侧 7 源（' + zjCards.join('、') + '，覆盖 ch1/3/5/6），事件侧 hist 恰 4 处合计 ' + zjSum + '（≥30）'); }
  else { fail++; console.log('✘ 政绩经济异常：卡=' + zjCards.join('、') + ' 事件=' + zjEvents.join('、')); }
  // (c) ACT-49 习剑强身：武力 +3（体魄+1、财富-1 不变）
  const a49 = D.ACTIONS.find(a => a.id === 'ACT-49');
  if (a49.eff.attrs.wuli === 3 && a49.eff.attrs.tupo === 1 && a49.eff.attrs.caifu === -1) { pass++; console.log('✔ ACT-49 习剑强身：武力+3（体魄+1 财富-1 不变）'); }
  else { fail++; console.log('✘ ACT-49 异常：' + JSON.stringify(a49.eff.attrs)); }
  // (d) ch3/ch5 章池不再零财富源：ACT-57 鬻字易米 caifu+2（ch3 专属）、ACT-61 变卖珍玩 caifu+3（ch5 专属）
  const a57 = D.ACTIONS.find(a => a.id === 'ACT-57'), a61 = D.ACTIONS.find(a => a.id === 'ACT-61');
  const ch3ok = a57.name === '鬻字易米' && a57.eff.attrs.caifu === 2 && a57.chapters[0] === 3 && a57.chapters[1] === 3;
  const ch5ok = a61.name === '变卖珍玩' && a61.eff.attrs.caifu === 3 && a61.chapters[0] === 5 && a61.chapters[1] === 5;
  const ch3src = D.ACTIONS.filter(a => a.chapters[0] <= 3 && 3 <= a.chapters[1] && a.eff && a.eff.attrs && a.eff.attrs.caifu > 0).length;
  const ch5src = D.ACTIONS.filter(a => a.chapters[0] <= 5 && 5 <= a.chapters[1] && a.eff && a.eff.attrs && a.eff.attrs.caifu > 0).length;
  if (ch3ok && ch5ok && ch3src > 0 && ch5src > 0) { pass++; console.log('✔ ch3/ch5 财富源：ACT-57 鬻字易米 caifu+2、ACT-61 变卖珍玩 caifu+3（两章不再零财富源）'); }
  else { fail++; console.log('✘ ch3/ch5 财富源异常：' + JSON.stringify({ ch3ok, ch5ok, ch3src, ch5src })); }
}


/* ---------- 48. 抉择卡（次级关键事件）：点击挂起 → 叙事+选项 → 按选项结算；取消不耗轮不计次 ---------- */
{
  const g = mkGame('normal', rngHigh);
  g.start(); g.beginEvents();
  g.offer = [{ type: 'key' }, { type: 'action', id: 'ACT-65' }];  // 强制发一张抉择卡（故人贷金，ch0-1 池内）
  const cf0 = g.attrs.caifu, sw0 = g.attrs.shengwang, rl0 = g.keyRoundsLeft;
  const r1 = g.playCard(1);
  const v = g.getChoiceCard();
  const enterOk = !!(r1 && r1.kind === 'choice' && g.phase === 'choice' && v && v.options.length === 3 && v.segs.length >= 2);
  const cancelOk = g.cancelChoice() && g.phase === 'round' && (g.actionUses['ACT-65'] || 0) === 0 && g.keyRoundsLeft === rl0;
  g.playCard(1);
  const r2 = g.chooseCardOption(0);   // 倾囊相济：caifu-5 shengwang+3
  const settleOk = !!(r2 && r2.useCount === 1 && g.attrs.caifu === cf0 - 5 && g.attrs.shengwang === sw0 + 3 && g.keyRoundsLeft === rl0 - 1 && g.phase !== 'choice');
  if (enterOk && cancelOk && settleOk) { pass++; console.log('✔ 抉择卡全流程：进入挂起/取消不耗轮/选项结算（caifu-5 shengwang+3）+计次+倒计时'); }
  else { fail++; console.log('✘ 抉择卡流程异常：' + JSON.stringify({ enterOk: enterOk, cancelOk: cancelOk, settleOk: settleOk })); }
}
console.log(`\n结果：${pass} 通过，${fail} 失败`);
process.exit(fail > 0 ? 1 : 0);
