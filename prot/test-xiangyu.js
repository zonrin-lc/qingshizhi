/* 项羽剧本《霸王之局》自动化剧本验证。运行：node test-xiangyu.js
 * 结构口径与 test-sim.js / test-jingke.js / test-hanxin.js 一致。 */
const D = require('./xiangyu-data.js');
const E = require('./engine.js');

const rngHigh = () => 0.99;
const rngLow = () => 0.01;

/* v1.9 疾病系统（项羽本 ILLNESS 开启）：出牌即掷发病（ill 流）。
 * 全套件统一经 mkGame 构造 Game，默认注入 ill 流恒 0.99（≥发病率上限 0.35，永不发病），
 * 保证既有路线断言的确定性轨迹不受新增随机源干扰；疾病专项用例（#14）经 streams.ill 自注序列。 */
const ILL_NEVER = () => 0.99;
function illSeq(vals) { let i = 0; return () => vals[Math.min(i++, vals.length - 1)]; }
function mkGame(diffKey, rng, streams) {
  return new E.Game(D, diffKey, rng, Object.assign({ ill: ILL_NEVER }, streams));
}

function play(diffKey, script, rng, endScript, hook) {
  const g = mkGame(diffKey, rng || rngHigh);
  g.randomOn = false;
  g.start();
  let guard = 0;
  const trace = [];
  while (g.phase !== 'ending' && guard++ < 500) {
    if (hook) hook(g);
    if (g.phase === 'intro') { g.beginEvents(); continue; }
    if (g.phase === 'round') {
      const offer = g.getOffer();
      const keyId = offer[0].eventId;
      if (script[keyId] != null) { g.playCard(0); continue; }
      let ai = -1;
      for (let i = 1; i < offer.length; i++) if (!offer[i].locked && !offer[i].risky && !offer[i].choice && offer[i].usedCount === 0) { ai = i; break; }
      if (ai < 0) for (let i = 1; i < offer.length; i++) if (!offer[i].locked && !offer[i].risky && !offer[i].choice) { ai = i; break; }
      if (ai < 0) ai = 0;
      const r = g.playCard(ai);
      if (!r) { g.playCard(0); continue; }
      if (r.kind === 'action' && r.forcedKey) trace.push([keyId, '（倒计时归零·强制抉择）', g.dev]);
      continue;
    }
    if (g.phase === 'correction') { trace.push(['修正', g.correction.title, g.dev]); g.correctionContinue(); continue; }
    if (g.phase === 'summary') { g.proceedSummary(); continue; }
    if (g.phase === 'endEvent') {
      const ev = g.currentEndEvent;
      const idx = pickIndex(ev.options, script[ev.id] != null ? script[ev.id] : (endScript && endScript[ev.id]));
      if (idx == null) throw new Error('章末事件 ' + ev.id + ' 没有可用选择');
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

function driveTo(stopId, picks) {
  // corr 流注入 0.99：修正改走 corr 流后，保持本 helper"不遇概率修正"的原口径（契约：只适用于不遇章末事件/修正的路线）
  const g = mkGame('normal', rngHigh, { corr: rngHigh });
  g.randomOn = false;
  g.start();
  let guard = 0;
  while (guard++ < 300) {
    if (g.phase === 'event' && g.eventId === stopId) return g;
    if (g.phase === 'intro') { g.beginEvents(); continue; }
    if (g.phase === 'round') { g.playCard(0); continue; }
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
    if (wrapped) { for (let i = 0; i < wrapped.length; i++) if (!wrapped[i].locked) return i; return null; }
    return 0;
  }
  if (typeof want === 'number') return want;
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
function has(g, ach) { return g.ach.includes(ach); }

/* ---------- 1. 史实线 → E1 乌江自刎 ---------- */
{
  const { g } = play('normal', {
    '0-1': '昼夜研习', '0-2': '悉心结交', '0-3': '随叔父赴府',
    '1-1': '召故吏豪杰', '1-2': '礼为上宾', '1-3': '立熊心为楚怀王',
    '2-1': '斩宋义', '2-2': '沉船破釜', '2-3': '九战破秦',
    '3-1': '夜击坑之', '3-2': '厉兵秣马', '3-3': '默然纵之',
    '4-1': '收宝货妇女而东', '4-2': '密令英布等杀之江中', '4-3': '遣使镇抚',
    '5-1': '乘胜穷追', '5-2': '捕风捉影', '5-3': '许之，引兵东归',
    '6-1': '溃围南出', '6-2': '弃马步涉', '6-3': '分骑四向', '6-4': '我何渡为'
  });
  expect('史实线', g.ending, 'E1');
  if (g.dev <= 45) { pass++; } else { fail++; console.log('✘ 史实线偏离应≤45，实际 ' + g.dev); }
  const need = ['wanrendi', 'yafu', 'zidii', 'duojun', 'pofu', 'julu', 'hongmen', 'bawang', 'pengcheng', 'honggou', 'dongcheng', 'wujiang'];
  const miss = need.filter(a => !has(g, a));
  if (miss.length === 0) { pass++; console.log('✔ 史实线成就 12 枚全部解锁'); }
  else { fail++; console.log('✘ 史实线缺成就：' + miss.join('、')); }
  if (g.ending.review.length === 5) { pass++; console.log('✔ 复盘 5 条（安阳/新安/鸿门/鸿沟/乌江）'); }
  else { fail++; console.log('✘ 复盘应为 5 条，实际 ' + g.ending.review.length); }
}

/* ---------- 2. 苟活线 → E2 会稽老卒（不预兵事） ----------
 * v1.6.8：0-3「不预兵事」加 notflag wanrendi 早退闸（对齐 lisi 0-3-B 模式）——
 * 已「学万人敌 / 观始皇渡浙江」立志者不再收零代价退出。故此线须先在 0-1 走「以力代学」。 */
{
  const { g } = play('normal', { '0-1': '以力代学', '0-3': '不预兵事' });
  expect('苟活线（老卒）', g.ending, 'E2');
}

/* ---------- 2-2. 早退闸契约：已立志者不得零代价退出（v1.6.8） ---------- */
{
  const { g, trace } = play('normal', { '0-1': '昼夜研习', '0-3': '随叔父赴府' });
  const lockedOut = trace.every(t => t[0] !== '0-3' || t[1].indexOf('不预兵事') < 0);
  if (lockedOut) { pass++; console.log('✔ 早退闸：学万人敌立志后，0-3「不预兵事」不可选'); }
  else { fail++; console.log('✘ 早退闸失效：立志者仍可选「不预兵事」'); }
}

/* ---------- 3. 苟活线 → E3 执戟余生（咸阳后事了拂衣） ---------- */
{
  const { g, trace } = play('normal', {
    '0-3': '随叔父赴府',
    '1-1': '召故吏豪杰', '1-2': '礼为上宾', '1-3': '立熊心为楚怀王',
    '2-1': '斩宋义', '2-2': '沉船破釜', '2-3': '九战破秦',
    '3-1': '夜击坑之', '3-2': '厉兵秣马', '3-3': '默然纵之',
    '4-1': '事了拂衣'
  });
  expect('苟活线（拂衣）', g.ending, 'E3');
}

/* ---------- 4. 逆天线 → E7 垓下无楚（鸿门杀刘） ---------- */
{
  const { g } = play('normal', {
    '0-1': '观始皇渡浙江', '0-2': '比武立威', '0-3': '随叔父赴府',
    '1-1': '召故吏豪杰', '1-2': '以客卿待之', '1-3': '不立虚名，自号为长',
    '2-1': '斩宋义', '2-2': '沉船破釜', '2-3': '九战破秦',
    '3-1': '收编为军', '3-2': '缓兵三日', '3-3': '举玦为号'
  });
  expect('逆天线（杀刘）', g.ending, 'E7');
}

/* ---------- 5. 稳健线 → E5 霸王之业（不许鸿沟，成皋决胜） ---------- */
{
  const { g } = play('normal', {
    '0-1': '昼夜研习', '0-2': '悉心结交', '0-3': '随叔父赴府',
    '1-1': '召故吏豪杰', '1-2': '礼为上宾', '1-3': '立熊心为楚怀王',
    '2-1': '斩宋义', '2-2': '沉船破釜', '2-3': '九战破秦',
    '3-1': '收编为军', '3-2': '厉兵秣马', '3-3': '默然纵之',
    '4-1': '约法安民', '4-2': '尊义帝以虚名', '4-3': '遣使镇抚',
    '5-1': '乘胜穷追', '5-2': '察其诈', '5-3': '提兵再决胜负'
  });
  expect('稳健线（王业）', g.ending, 'E5');
}

/* ---------- 6. 稳健线 → E4 鸿沟真和（失范增后的成皋决胜） ---------- */
{
  const { g } = play('normal', {
    '0-1': '昼夜研习', '0-2': '悉心结交', '0-3': '随叔父赴府',
    '1-1': '召故吏豪杰', '1-2': '礼为上宾', '1-3': '立熊心为楚怀王',
    '2-1': '斩宋义', '2-2': '沉船破釜', '2-3': '九战破秦',
    '3-1': '收编为军', '3-2': '厉兵秣马', '3-3': '默然纵之',
    '4-1': '约法安民', '4-2': '尊义帝以虚名', '4-3': '遣使镇抚',
    '5-1': '乘胜穷追', '5-2': '捕风捉影', '5-3': '提兵再决胜负'
  });
  expect('稳健线（真和）', g.ending, 'E4');
}

/* ---------- 7. 逆天线 → E6 江东再砺（乌江渡江） ---------- */
{
  const { g } = play('normal', {
    '0-1': '昼夜研习', '0-2': '悉心结交', '0-3': '随叔父赴府',
    '1-1': '召故吏豪杰', '1-2': '礼为上宾', '1-3': '立熊心为楚怀王',
    '2-1': '斩宋义', '2-2': '沉船破釜', '2-3': '九战破秦',
    '3-1': '收编为军', '3-2': '厉兵秣马', '3-3': '默然纵之',
    '4-1': '约法安民', '4-2': '尊义帝以虚名', '4-3': '遣使镇抚',
    '5-1': '乘胜穷追', '5-2': '察其诈', '5-3': '许之，而暗增戒备',
    '6-1': '遣骑四散', '6-2': '弃马步涉', '6-3': '并力一路', '6-4': '渡江再砺'
  });
  expect('逆天线（渡江）', g.ending, 'E6');
}

/* ---------- 8a. 失败线 → E8 安阳之诛（忍而不发） ---------- */
{
  const { g } = play('normal', {
    '0-3': '随叔父赴府',
    '1-1': '召故吏豪杰', '1-2': '礼为上宾', '1-3': '立熊心为楚怀王',
    '2-1': '忍而不发'
  });
  expect('失败线（安阳）', g.ending, 'E8', 'anyang');
}

/* ---------- 8b. 失败线 → E8 固陵之溃（留船半渡巨鹿败） ---------- */
{
  const { g } = play('normal', {
    '0-1': '昼夜研习', '0-2': '悉心结交', '0-3': '随叔父赴府',
    '1-1': '召故吏豪杰', '1-2': '礼为上宾', '1-3': '立熊心为楚怀王',
    '2-1': '斩宋义', '2-2': '留船半渡', '2-3': '九战破秦'
  });
  expect('失败线（固陵）', g.ending, 'E8', 'guling');
}

/* ---------- 8c. 失败线 → E8 阴陵之泽（背泽一战而没） ---------- */
{
  const { g } = play('normal', {
    '0-1': '昼夜研习', '0-2': '比武立威', '0-3': '随叔父赴府',
    '1-1': '纵兵大掠', '1-2': '礼为上宾', '1-3': '立熊心为楚怀王',
    '2-1': '斩宋义', '2-2': '沉船破釜', '2-3': '九战破秦',
    '3-1': '夜击坑之', '3-2': '厉兵秣马', '3-3': '默然纵之',
    '4-1': '收宝货妇女而东', '4-2': '密令英布等杀之江中', '4-3': '陈兵示威',
    '5-1': '乘胜穷追', '5-2': '捕风捉影', '5-3': '许之，引兵东归',
    '6-1': '溃围南出', '6-2': '背泽一战'
  });
  expect('失败线（阴陵）', g.ending, 'E8', 'yinling');
}

/* ---------- 9. N1 异变：偏离≥40 宋义先动手（altSegs + 斩宋义免权势门槛） ---------- */
{
  const g = driveTo('2-1', { '0-1': 2, '0-2': 2, '1-1': 1, '1-2': 2, '1-3': 1 });
  g.dev = 45;
  g.enterChapter(2);
  if (!g.flags.songyiqiang) { fail++; console.log('✘ 宋义先动异变未触发'); }
  else {
    g.beginEvents(); g.playCard(0);
    const ev = g.findEvent('2-1');
    const segs = (ev.altSegs && g.flags[ev.altSegs.flag]) ? ev.altSegs.segs : ev.segs;
    const alt = segs[0].indexOf('宋义没有抬头') >= 0;
    const r = g.choose(0); // 斩宋义：异变 flag 免 quanshi 20 门槛
    g.proceed();
    if (alt && r && g.eventId === '2-2') { pass++; console.log('✔ 宋义先动异变：文本换体，斩宋义改由异变兜底'); }
    else { fail++; console.log('✘ 异变处理异常'); }
  }
}

/* ---------- 10. 修正事件触发（高偏离 + 必中随机） ---------- */
{
  const { trace } = play('normal', {
    '0-1': '观始皇渡浙江', '0-2': '比武立威', '0-3': '随叔父赴府',
    '1-1': '纵兵大掠', '1-2': '以武夫轻之', '1-3': '不立虚名，自号为长',
    '2-1': '引兵绕开宋义', '2-2': '留船半渡', '2-3': '与诸侯合兵同进',
    '3-1': '尽数遣散', '3-2': '缓兵三日', '3-3': '留刘为质',
    '4-1': '约法安民', '4-2': '废为庶人', '4-3': '陈兵示威',
    '5-1': '胜而不穷', '5-2': '捕风捉影', '5-3': '许之，而暗增戒备',
    '6-1': '遣骑四散', '6-2': '背泽一战', '6-3': '并力一路', '6-4': '回身再战'
  }, rngLow);
  const corr = trace.filter(t => t[0] === '修正').length;
  if (corr > 0) { pass++; console.log(`✔ 修正事件触发 ${corr} 次（高偏离线）`); }
  else { fail++; console.log('✘ 高偏离线未触发任何修正事件'); }
}

/* ---------- 11. 词条完整性 + 行动池卫生 + 剧本配置 ---------- */
{
  const s = JSON.stringify(D.CHAPTERS) + JSON.stringify(D.RANDOM_EVENTS) + JSON.stringify(D.CRISIS_EVENTS) + JSON.stringify(D.ACTIONS);
  const marks = [...new Set([...s.matchAll(/⟦(.+?)⟧/g)].map(m => m[1]))];
  const missing = marks.filter(t => !D.GLOSSARY[t]);
  if (missing.length === 0 && Object.keys(D.GLOSSARY).length >= 18) { pass++; console.log('✔ 百科词条：' + marks.length + ' 种标记全部有定义，词条库 ' + Object.keys(D.GLOSSARY).length + ' 条'); }
  else { fail++; console.log('✘ 词条缺定义：' + missing.join('、')); }

  const bad = [];
  const ZG_WHITE = {}; // 威胁值白名单：项羽本无 zg 卡，任何 eff.zg 皆为异常（精确比对口径同荆轲本）
  D.ACTIONS.forEach(a => {
    // 抉择卡无顶层 eff，逐选项检查；普通卡查自身 eff
    const effList = a.choice ? (a.choice.options || []).map(o => o.eff || {}) : [a.eff || {}];
    effList.forEach(eff => {
    Object.keys(eff.attrs || {}).forEach(k => { if (Math.abs(eff.attrs[k]) > 8) bad.push(a.id + ' ' + k); });
    if (eff.zg && ZG_WHITE[a.id] !== eff.zg) bad.push(a.id + ' zg=' + eff.zg);
    if (eff.flags || eff.rmflags || eff.hist || eff.merit || eff.ach) bad.push(a.id + ' 干扰结局树字段');
    if (eff.dev) bad.push(a.id + ' dev');
    });
  });
  const pools = [];
  for (let ci = 0; ci <= 6; ci++) pools.push(D.ACTIONS.filter(a => (a.chapters || [0, 6])[0] <= ci && ci <= (a.chapters || [0, 6])[1]).length);
  const poolExpect = [18, 18, 18, 18, 18, 17, 17];
  if (D.ACTIONS.length === 76 && bad.length === 0 && pools.every((n, i) => n === poolExpect[i])) { pass++; console.log('✔ 76 个行动数据卫生（卡牌 v2 + 12 抉择卡）：单项 ≤±8、dev 恒 0、无 flags/hist/merit/ach/rmflags、zg 白名单（空——本无 zg 卡）、每章池 ' + poolExpect.join('/') + '（实测 ' + pools.join('/') + '）'); }
  else { fail++; console.log('✘ 行动数据卫生异常：' + (bad.join('；') || '池大小 ' + pools.join('/') + ' 总数 ' + D.ACTIONS.length)); }

  let badach = [];
  Object.values(D.ENDINGS).forEach(e => {
    (e.ach || []).forEach(a => { if (!D.ACHIEVEMENTS[a]) badach.push(a); });
    Object.values(e.variantAch || {}).flat().forEach(a => { if (!D.ACHIEVEMENTS[a]) badach.push(a); });
  });
  if (badach.length === 0) { pass++; } else { fail++; console.log('✘ 结局成就悬挂引用：' + badach.join('、')); }

  const g = mkGame('normal', rngHigh);
  g.start();
  const ok = g.zg === 15 && g.zgWord() === '诸侯畏服';
  g.zg = 55;
  if (ok && g.zgWord() === '叛者四起') { pass++; console.log('✔ 诸侯离心（隐藏值）：初始 15，状态词按档位映射'); }
  else { fail++; console.log('✘ 诸侯离心映射异常'); }
}

/* ---------- 12. 失宠规则按剧本关闭（PERSIST.junxinShichong=false）：项羽君心=天下人望，惩罚由诸侯离心承担 ---------- */
{
  const g = mkGame('normal', rngHigh);
  g.randomOn = false; g.start();
  g.attrs.junxin = 10;
  const w1 = g.attrs.weiji;
  g.enterChapter(1);
  const firedAt1 = g.introNotes.some(n => n.indexOf('失宠于上') >= 0);
  g.beginEvents(); g.playCard(0);
  const r0 = g.choose(0);
  const firedInstant = r0.changes.some(c => c.note === '失宠于上');
  // 人望崩坏的惩罚经由 zg 呈现（坑降+10 / 弑义帝+15 已埋点，见 test 1 史实线）
  const g2 = driveTo('4-2', {});
  const z0 = g2.zg;
  g2.choose(1); // 密令英布等杀之江中 → zg+15
  if (!firedAt1 && !firedInstant && g.attrs.weiji === w1 && g2.zg === z0 + 15) { pass++; console.log('✔ 失宠规则按剧本关闭：君心触底不失宠，惩罚由诸侯离心承担'); }
  else { fail++; console.log('✘ 失宠关闭口径异常：at1=' + firedAt1 + ' instant=' + firedInstant + ' weiji=' + g.attrs.weiji + ' zg=' + z0 + '→' + g2.zg); }
}

/* ---------- 13. 年龄与寿元（v2.1.3）：章首定龄 22/23/25/26/26/28/30；年龄档自 26 岁起衰（史载项羽年三十一而殁，
 *            是五本中最短命者）；高体魄得寿元逐点抵衰。此前沿用默认 40 岁首档，【春秋渐高】一次未触发（死内容）。 ---------- */
{
  const ages = [22, 23, 25, 26, 26, 28, 30];
  const decay = [0, 0, 0, -1, -1, -2, -2];
  const bandsOk = JSON.stringify(D.AGE.bands) === JSON.stringify([[26, 0], [28, -1], [31, -2], [200, -3]]);
  let okAll = bandsOk; const detail = [];
  for (let ci = 0; ci < ages.length; ci++) {
    const g = mkGame('normal', rngHigh);
    g.randomOn = false; g.start();
    const t0 = g.attrs.tupo;
    g.enterChapter(ci);
    const note = g.introNotes.some(n => n.indexOf('春秋渐高') >= 0);
    const d = g.attrs.tupo - t0;
    if (!(g.age === ages[ci] && d === decay[ci] && note === (decay[ci] !== 0))) {
      okAll = false; detail.push('c' + ci + '=' + g.age + '/' + d + (note ? '/有注' : '/无注'));
    }
  }
  // 寿元抵衰三档：体魄 64/70/74 → 寿元+0/+1/+2，c6(-2) 实减 -2/-1/0
  const trio = [[64, 0, -2], [70, 1, -1], [74, 2, 0]].map(([tp, wantCred, wantD]) => {
    const g = mkGame('normal', rngHigh);
    g.randomOn = false; g.start();
    g.attrs.tupo = tp; const cr = g._longevity(); const t = g.attrs.tupo;
    g.enterChapter(6);
    return cr === wantCred && g.attrs.tupo === t + wantD && g.age === 30;
  });
  if (okAll) { pass++; console.log('✔ 章首定龄与年龄档：' + ages.join('/') + '，逐章体魄 ' + decay.join('/') + '（26 岁起衰，此前为死内容）'); }
  else { fail++; console.log('✘ 章首定龄异常：' + (bandsOk ? '' : 'bands 表不符 ') + detail.join('、')); }
  if (trio.every(Boolean)) { pass++; console.log('✔ 寿元抵衰三档：体魄 64/70/74 → 寿元+0/+1/+2，c6 衰减 -2 分别实减 -2/-1/0'); }
  else { fail++; console.log('✘ 寿元抵衰异常：' + trio.join('/')); }
}

/* ---------- 14. 疾病闭环（v1.9，ILLNESS cost 3 / heal 5）：大病 onset → 治病卡自动发放 → 治愈；体魄归零 → E8/baobing「病殁军中」 ---------- */
{
  // (a) 大病 onset：ill 流 0.0（<发病率）+ 0.0（<大病率）→ major，当即体魄-5/危机+3
  // （用 XY-ACT-10 夜读兵阵：eff 无体魄/危机项，不干扰 onset 数值断言）
  const g = mkGame('normal', rngHigh, { ill: illSeq([0.0, 0.0]) });
  g.randomOn = false; g.start(); g.beginEvents();
  const t0 = g.attrs.tupo;
  g.offer = [{ type: 'key' }, { type: 'action', id: 'XY-ACT-10' }];
  const r1 = g.playCard(1);
  const onset = g.ill && g.ill.type === 'major' && g.attrs.tupo === t0 - 5
    && r1.changes.some(c => c.k === 'tupo' && c.delta === -5 && c.note && c.note.indexOf('沉疴') >= 0)
    && r1.changes.some(c => c.k === 'weiji' && c.delta === 3 && c.note);
  // (b) 治病卡自动发放（不占行动池）→ 选它清病、财富-3、体魄+5、倒计时照常推进
  const offer = g.getOffer();
  const ci = offer.findIndex(o => o.action && o.action.id === '__cure__');
  const c0 = g.attrs.caifu, t1 = g.attrs.tupo, rl0 = g.keyRoundsLeft;
  const r2 = ci > 0 ? g.playCard(ci) : null;
  const cured = ci > 0 && offer[ci].action.name === '求医问药' && r2 && g.ill === null
    && g.attrs.caifu === c0 - 3 && g.attrs.tupo === t1 + 5 && g.keyRoundsLeft === rl0 - 1;
  if (onset && cured) { pass++; console.log('✔ 疾病闭环：大病 onset（体魄-5/危机+3）→「求医问药」自动发放 → 治愈（财富 ' + c0 + '→' + g.attrs.caifu + '、体魄+5、清病、倒计时 ' + rl0 + '→' + g.keyRoundsLeft + '）'); }
  else { fail++; console.log('✘ 疾病闭环异常：' + JSON.stringify({ onset, cured, ill: g.ill })); }
  // (c) 病亡：体魄 1 持大病 drain → 体魄归零 → 强制结局 E8/baobing「病殁军中」
  const gd = mkGame('normal', rngHigh);
  gd.randomOn = false; gd.start(); gd.beginEvents();
  gd.ill = { type: 'major' }; gd.attrs.tupo = 1;
  gd.offer = [{ type: 'key' }, { type: 'action', id: 'XY-ACT-10' }];
  const rd = gd.playCard(1);
  const dead = rd && rd.forcedEnding === true;
  gd.proceed();
  if (dead && gd.ending && gd.ending.id === 'E8' && gd.ending.variant === 'baobing' && gd.ending.name === '病殁军中') { pass++; console.log('✔ 病亡：体魄归零 → E8/baobing「病殁军中」'); }
  else { fail++; console.log('✘ 病亡异常：' + JSON.stringify({ dead, end: gd.ending && (gd.ending.id + '/' + gd.ending.variant) })); }
}

/* ---------- 15. 无收益递减（卡牌 v2，ACTION_RULES.diminish=false）：同卡连用 3 次收益逐次完全相同，getOffer diminishing 恒 false ---------- */
{
  const g = mkGame('normal', rngHigh);
  g.randomOn = false; g.start(); g.beginEvents();
  const deltas = [], useCounts = [];
  for (let k = 0; k < 3; k++) {
    g.offer = [{ type: 'key' }, { type: 'action', id: 'XY-ACT-4' }]; // 闭门读阵：才学+2/谋略+1/体魄-1/危机-1
    const r = g.playCard(1);
    useCounts.push(r.useCount);
    deltas.push(['caixue', 'moulue', 'weiji'].map(kk => r.changes.find(c => c.k === kk).delta).join('/'));
  }
  g.offer = [{ type: 'key' }, { type: 'action', id: 'XY-ACT-4' }];
  const oUsed = g.getOffer()[1];
  if (useCounts.join(',') === '1,2,3' && deltas.every(d => d === '2/1/-1') && oUsed.usedCount === 3 && oUsed.diminishing === false) { pass++; console.log('✔ 无递减：XY-ACT-4 连用 3 次收益逐次相同（才学+2/谋略+1/危机-1），diminishing 恒 false、useCount 照计'); }
  else { fail++; console.log('✘ 无递减异常：' + JSON.stringify({ useCounts, deltas, dim: oUsed.diminishing })); }
}

/* ---------- 16. 政绩经济存在性（v2.1.0 扩源，zhengji=治军与分封之政）：卡侧 6 源（补 XY-ACT-52 ch1 / 24 ch3 / 26 ch4 三处空窗）、事件侧 1-3/2-1 hist 各 +5；zhengji 门槛白名单：全书 req/路由 cond 引用恰一处（4-3 req:14，由 10 上调） ---------- */
{
  const zj = {};
  D.ACTIONS.forEach(a => { if (a.eff && a.eff.attrs && a.eff.attrs.zhengji) zj[a.id] = a.eff.attrs.zhengji; });
  // 此前仅 ch2/5/6 有供给，ch1/ch3/ch4/ch7 零源；4-3「以战功名实封赏诸将」落在 ch4，此前只能吃 ch2 的一分
  const cardsOk = JSON.stringify(zj) === JSON.stringify({ 'XY-ACT-52': 1, 'XY-ACT-53': 1, 'XY-ACT-24': 1, 'XY-ACT-26': 1, 'XY-ACT-59': 2, 'XY-ACT-61': 1 });
  const zjEvents = [];
  D.CHAPTERS.forEach(ch => (ch.events || []).forEach(ev => ev.options.forEach(o => { if (o.eff && o.eff.attrs && o.eff.attrs.zhengji) zjEvents.push(ev.id + ':' + o.eff.attrs.zhengji + (o.hist ? ':hist' : '')); })));
  const eventsOk = JSON.stringify(zjEvents.slice().sort()) === JSON.stringify(['1-3:5:hist', '2-1:5:hist']);
  const zjRefs = [];
  const scanEv = ev => (ev.options || []).forEach(o => {
    if (o.req && o.req.zhengji != null) zjRefs.push(ev.id + ':req:' + o.req.zhengji);
    if (Array.isArray(o.to)) o.to.forEach(t => { if (t.if && t.if.zhengji != null) zjRefs.push(ev.id + ':route:' + t.if.zhengji); });
  });
  D.CHAPTERS.forEach(ch => (ch.events || []).forEach(scanEv));
  (D.RANDOM_EVENTS || []).forEach(scanEv);
  const ce = D.CRISIS_EVENTS || {};
  ['death', 'qingsuan'].forEach(k => { if (ce[k]) scanEv(ce[k]); });
  (ce.plots || []).forEach(scanEv);
  const refsOk = JSON.stringify(zjRefs.slice().sort()) === JSON.stringify(['4-3:req:14']);
  if (cardsOk && eventsOk && refsOk) { pass++; console.log('✔ 政绩经济存在性：卡侧 6 源（XY-ACT-52+1/53+1/24+1/26+1/59+2/61+1，覆盖 ch1–ch6），事件侧 1-3/2-1 hist 各+5；zhengji 门槛白名单恰一处（4-3 req:14）'); }
  else { fail++; console.log('✘ 政绩经济异常：' + JSON.stringify({ zj, zjEvents, zjRefs })); }
}

/* ---------- 17. 缺口路线 ×3：政绩/辩才/君心门槛与 E6 条件变体「江东归心」（属性门槛为软门槛：不足转险招，达标直选） ---------- */
{
  // (a) 4-3「以战功名实封赏诸将」req 政绩14（v2.1.0 由 10 上调）：不足转险招，达标直选 → NEXT（章末结算页），zg-8 缓诸侯离心
  const ga = mkGame('normal', rngHigh);
  ga.randomOn = false; ga.start(); ga.enterChapter(4); ga.eventId = '4-3';
  ga.attrs.zhengji = 13;
  ga.beginRounds(); ga.playCard(0);
  const aLow = ga.getOptions().find(o => o.opt.t.indexOf('以战功名实') >= 0);
  ga.attrs.zhengji = 14;
  const aIdx = ga.getOptions().findIndex(o => o.opt.t.indexOf('以战功名实') >= 0);
  const aHigh = ga.getOptions()[aIdx];
  const z0 = ga.zg;
  ga.choose(aIdx);
  const rtA = ga.proceed(); // to NEXT → 章末结算（四章无章末事件、偏离 5 无修正）
  const aOk = aLow && !aLow.locked && aLow.risky && aLow.risky.rate === 70
    && aHigh && !aHigh.locked && !aHigh.risky && ga.zg === z0 - 8 && rtA && rtA.type === 'summary' && ga.phase === 'summary';
  if (aOk) { pass++; console.log('✔ 缺口路线 4-3「以战功名实封赏诸将」：政绩 13 转险招（70%）/ 14 直选，诸侯离心 ' + z0 + '→' + ga.zg + ' → NEXT（章末结算页）'); }
  else { fail++; console.log('✘ 4-3 封赏异常：' + JSON.stringify({ low: aLow && !!aLow.risky, zg: ga.zg, rt: rtA && rtA.type, phase: ga.phase })); }

  // (b) 3-3「当众折辩，诘其守关之欲」req 辩才42（v2.1.2 由 55 下调，原值实测直选率 0/400）：
  //     辩才 INIT 15、ch1–ch4 事件侧仅 +4，门下 p50=30 上限 38，55 是永不可达的死门槛。
  //     不足转险招（70%），达标直选 → NEXT（章末结算页）
  const gb = mkGame('normal', rngHigh);
  gb.randomOn = false; gb.start(); gb.enterChapter(3); gb.eventId = '3-3';
  gb.attrs.biancai = 41;
  gb.beginRounds(); gb.playCard(0);
  const bLow = gb.getOptions().find(o => o.opt.t.indexOf('当众折辩') >= 0);
  gb.attrs.biancai = 42;
  const bIdx = gb.getOptions().findIndex(o => o.opt.t.indexOf('当众折辩') >= 0);
  const bHigh = gb.getOptions()[bIdx];
  gb.choose(bIdx);
  const rtB = gb.proceed(); // to NEXT → 章末结算（三章无章末事件、偏离 12 无修正）
  const bOk = bLow && !bLow.locked && bLow.risky && bLow.risky.rate === 70
    && bHigh && !bHigh.locked && !bHigh.risky && rtB && rtB.type === 'summary' && gb.phase === 'summary';
  if (bOk) { pass++; console.log('✔ 缺口路线 3-3「当众折辩」：辩才 41 转险招（70%）/ 42 直选 → NEXT（章末结算页）'); }
  else { fail++; console.log('✘ 3-3 折辩异常：' + JSON.stringify({ low: bLow && !!bLow.risky, rt: rtB && rtB.type, phase: gb.phase })); }

  // (c) 6-4「怀人望而渡，江东父老犹附」req 君心45 + E6 条件变体：路由与「渡江再砺」同档（先结算 eff 再判路由），达标 → E6/renwang「江东归心」；路由不满足 → E8 本体
  const gc = mkGame('normal', rngHigh);
  gc.randomOn = false; gc.start(); gc.enterChapter(6); gc.eventId = '6-4';
  gc.attrs.junxin = 44;
  gc.beginRounds(); gc.playCard(0);
  const cLow = gc.getOptions().find(o => o.opt.t.indexOf('怀人望而渡') >= 0);
  gc.attrs.junxin = 45;
  const cIdx = gc.getOptions().findIndex(o => o.opt.t.indexOf('怀人望而渡') >= 0);
  const cHigh = gc.getOptions()[cIdx];
  gc.attrs.shengwang = 50; gc.dev = 46; // 路由第一档：shengwang 50 + notflag shiyidi + devMin 46
  gc.choose(cIdx); gc.proceed();
  const gc2 = mkGame('normal', rngHigh);
  gc2.randomOn = false; gc2.start(); gc2.enterChapter(6); gc2.eventId = '6-4';
  gc2.attrs.junxin = 45; gc2.attrs.shengwang = 30; gc2.dev = 46; // 路由两档皆不满足 → E8
  gc2.beginRounds(); gc2.playCard(0);
  const cIdx2 = gc2.getOptions().findIndex(o => o.opt.t.indexOf('怀人望而渡') >= 0);
  gc2.choose(cIdx2); gc2.proceed();
  const cOk = cLow && !cLow.locked && cLow.risky && cLow.risky.rate === 70
    && cHigh && !cHigh.locked && !cHigh.risky
    && gc.ending && gc.ending.id === 'E6' && gc.ending.variant === 'renwang' && gc.ending.name === '江东归心'
    && gc2.ending && gc2.ending.id === 'E8' && !gc2.ending.variant;
  if (cOk) { pass++; console.log('✔ 缺口路线 6-4「怀人望而渡」：君心 44 转险招 / 45 直选；路由达标 → E6/renwang「江东归心」，名声 30 → E8 本体'); }
  else { fail++; console.log('✘ 6-4 人望渡江异常：' + JSON.stringify({ low: cLow && !!cLow.risky, v50: gc.ending && (gc.ending.id + '/' + gc.ending.variant), v30: gc2.ending && (gc2.ending.id + '/' + gc2.ending.variant) })); }

  // (d) 辩才/君心门槛白名单：全书 options req/路由 cond 引用，biancai 恰 ['3-3:req:42']（v2.1.2 由 55 下调）、junxin 恰 ['6-4:req:45']（N1 异变 junxinMax 在 mutations，不在此口径）
  const bcRefs = [], jxRefs = [];
  const scan2 = ev => (ev.options || []).forEach(o => {
    if (o.req) {
      if (o.req.biancai != null) bcRefs.push(ev.id + ':req:' + o.req.biancai);
      if (o.req.junxin != null) jxRefs.push(ev.id + ':req:' + o.req.junxin);
    }
    if (Array.isArray(o.to)) o.to.forEach(t => { if (t.if) {
      if (t.if.biancai != null) bcRefs.push(ev.id + ':route:' + t.if.biancai);
      if (t.if.junxin != null) jxRefs.push(ev.id + ':route:' + t.if.junxin);
    } });
  });
  D.CHAPTERS.forEach(ch => (ch.events || []).forEach(scan2));
  (D.RANDOM_EVENTS || []).forEach(scan2);
  const ce2 = D.CRISIS_EVENTS || {};
  ['death', 'qingsuan'].forEach(k => { if (ce2[k]) scan2(ce2[k]); });
  (ce2.plots || []).forEach(scan2);
  if (JSON.stringify(bcRefs) === JSON.stringify(['3-3:req:42']) && JSON.stringify(jxRefs) === JSON.stringify(['6-4:req:45'])) { pass++; console.log('✔ 辩才/君心门槛白名单：biancai 恰 3-3:req:42，junxin 恰 6-4:req:45'); }
  else { fail++; console.log('✘ 辩才/君心门槛白名单异常：' + JSON.stringify({ bcRefs, jxRefs })); }
}

console.log(`\n结果：${pass} 通过，${fail} 失败`);
process.exit(fail > 0 ? 1 : 0);
