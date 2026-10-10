/* 韩信剧本《兵仙之局》自动化剧本验证。运行：node test-hanxin.js
 * 结构口径与 test-sim.js / test-jingke.js 一致。 */
const D = require('./hanxin-data.js');
const E = require('./engine.js');

const rngHigh = () => 0.99;
const rngLow = () => 0.01;

/* v1.9 疾病系统（韩信本 ILLNESS 开启）：出牌即掷发病（ill 流）。
 * 全套件统一经 mkGame 构造 Game，默认注入 ill 流恒 0.99（≥发病率上限 0.35，永不发病），
 * 保证既有路线断言的确定性轨迹不受新增随机源干扰；疾病专项用例（#15）经 streams.ill 自注序列。 */
const ILL_NEVER = () => 0.99;
function illSeq(vals) { let i = 0; return () => vals[Math.min(i++, vals.length - 1)]; }
function mkGame(diffKey, rng, streams) {
  return new E.Game(D, diffKey, rng, Object.assign({ ill: ILL_NEVER }, streams));
}

function play(diffKey, script0, rng, endScript, hook) {
  const script = Object.assign({}, script0);   // 浅拷贝：takeScript 会消费队列，不污染调用方的字面量
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
      let idx = pickIndex(ev.options, takeScript(script, ev.id), opts);
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
  const g = mkGame('normal', rngHigh);
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
  /* 脚本取值：数组 = 同一事件的多次到访脚本（依次取用，如 2-4「二连执意要走」）；
   * 非数组 = 单次指定。用完的项从 script 移除，保留其余项不变。 */
  function takeScript(script, key) {
    if (script == null) return undefined;
    var v = script[key];
    if (v == null) return undefined;
    if (Array.isArray(v)) {
      if (!v.length) { delete script[key]; return undefined; }
      var head = v[0], rest = v.slice(1);
      if (rest.length) script[key] = rest; else delete script[key];
      return head;
    }
    return v;
  }

let pass = 0, fail = 0;
function expect(name, actual, wantId, wantVariant) {
  const ok = actual.id === wantId && (wantVariant === undefined || actual.variant === wantVariant);
  if (ok) { pass++; console.log(`✔ ${name} → ${actual.id}${actual.variant ? '/' + actual.variant : ''}「${actual.name}」 总分 ${actual.total} 评级 ${actual.grade} 偏离 ${actual.dev}`); }
  else { fail++; console.log(`✘ ${name} 期望 ${wantId}/${wantVariant || '-'}，实际 ${actual.id}/${actual.variant || '-'}「${actual.name}」`); }
}
function has(g, ach) { return g.ach.includes(ach); }

/* ---------- 1. 史实线 → E1 钟室之斩 ---------- */
{
  const { g, trace } = play('normal', {
    '0-1': '立誓', '0-2': '俯身', '0-3': '杖剑从戎',
    '1-1': '陷阵先登', '1-2': '数数献策', '1-3': '亡楚归汉',
    '2-1': '上不欲就天下乎', '2-2': '整肃仓廪', '2-3': '尽陈兵略', '2-4': '归而受命', '2-5': '汉中对',
    '3-1': '举兵东出', '3-2': '收拢溃兵', '3-3': '木罂缶渡河',
    '4-1': '背水一战', '4-2': '师事之', '4-3': '半渡而击',
    '5-1': '静候汉王处分', '5-2': '独当一面', '5-3': '汉王遇我厚',
    '6-1': '报德雪怨并施', '6-2': '收而庇之', '6-3': '持钟离眜首级往谒', '6-4': '勉其反', '6-5': '入贺'
  });
  expect('史实线', g.ending, 'E1');
  if (g.dev <= 45) { pass++; } else { fail++; console.log('✘ 史实线偏离应≤45，实际 ' + g.dev); }
  const need = ['kuaxia', 'piaomu', 'xiaohe', 'dengtan', 'chencang', 'beishui', 'zuoche', 'longju', 'qiwang', 'zhongshi'];
  const miss = need.filter(a => !has(g, a));
  if (miss.length === 0) { pass++; console.log('✔ 史实线成就 10 枚全部解锁'); }
  else { fail++; console.log('✘ 史实线缺成就：' + miss.join('、')); }
  if (g.ending.review.length === 5) { pass++; console.log('✔ 复盘 5 条（登坛/背水/请封/蒯通/陈豨）'); }
  else { fail++; console.log('✘ 复盘应为 5 条，实际 ' + g.ending.review.length); }
}

/* ---------- 2a. 苟活线 → E2 漂母之钓（不投军） ----------
 * v1.6.8：0-3「守钓不问世事」加 notflag piaomu-en 早退闸（对齐 lisi 0-3-B 的 notflag 观鼠悟道 模式）——
 * 已受漂母饭、立誓重恩者不再收零代价退出。故此线须先在 0-1 走「不食，转身离去」（不受恩、不置 flag）。 */
{
  const { g } = play('normal', { '0-1': '不食', '0-3': '守钓不问世事' });
  expect('苟活线（守钓）', g.ending, 'E2');
}

/* ---------- 2a-2. 早退闸契约：已立誓者不得零代价退出（v1.6.8） ---------- */
{
  const { g, trace } = play('normal', { '0-1': '立誓', '0-3': '杖剑从戎' });
  const lockedOut = trace.every(t => t[0] !== '0-3' || t[1].indexOf('守钓') < 0);
  if (lockedOut) { pass++; console.log('✔ 早退闸：受漂母恩立誓后，0-3「守钓不问世事」不可选'); }
  else { fail++; console.log('✘ 早退闸失效：立誓者仍可选「守钓不问世事」'); }
}

/* ---------- 2b. 苟活线 → E2（萧何月下二连执意要走） ----------
 * 2-4 首次「执意要走」被驳回（flag zhui2），再次到访方以「执意再走」收束 E2（v1.6.8 P1-4）。 */
{
  const { g } = play('normal', {
    '0-3': '杖剑从戎', '1-3': '亡楚归汉',
    '2-1': '上不欲就天下乎', '2-2': '整肃仓廪', '2-3': '尽陈兵略',
    '2-4': ['执意要走', '执意再走']
  });
  expect('苟活线（终走）', g.ending, 'E2');
}

/* ---------- 3. 苟活线 → E3 楚营郎中（留楚不去） ---------- */
{
  const { g } = play('normal', { '0-3': '杖剑从戎', '1-3': '留楚不去' });
  expect('苟活线（留楚）', g.ending, 'E3');
}

/* ---------- 4. 逆天线 → E6 三分之局（听蒯通） ---------- */
{
  // 权势缺口（路线 66/70）由行动卡演兵/整训补足——hook 模拟该经营结果
  const { g } = play('normal', {
    '0-1': '受饭，默然铭记', '0-2': '俯身', '0-3': '杖剑从戎',
    '1-1': '陷阵先登', '1-2': '闭口不言', '1-3': '亡楚归汉',
    '2-1': '上不欲就天下乎', '2-2': '整肃仓廪', '2-3': '尽陈兵略', '2-4': '归而受命', '2-5': '汉中对',
    '3-1': '举兵东出', '3-2': '趁乱扩军', '3-3': '木罂缶渡河',
    '4-1': '背水一战', '4-2': '释而归之', '4-3': '半渡而击',
    '5-1': '静候汉王处分', '5-2': '让首功于诸将', '5-3': '听蒯通'
  }, rngHigh, null, g => { if (g.eventId === '5-3') g.attrs.quanshi = Math.max(g.attrs.quanshi, 72); });
  expect('逆天线（三分）', g.ending, 'E6');
}

/* ---------- 5. 逆天线 → E7 易帜之夏（阳从阴蓄 + 陈豨内应） ---------- */
{
  // 才学（65）与权势（75）缺口由读书与演兵经营补足——hook 模拟该结果
  const { g } = play('normal', {
    '0-1': '受饭，默然铭记', '0-2': '俯身', '0-3': '杖剑从戎',
    '1-1': '陷阵先登', '1-2': '闭口不言', '1-3': '亡楚归汉',
    '2-1': '上不欲就天下乎', '2-2': '整肃仓廪', '2-3': '尽陈兵略', '2-4': '归而受命', '2-5': '汉中对',
    '3-1': '举兵东出', '3-2': '趁乱扩军', '3-3': '木罂缶渡河',
    '4-1': '背水一战', '4-2': '释而归之', '4-3': '半渡而击',
    '5-1': '静候汉王处分', '5-2': '独当一面', '5-3': '阳从阴蓄',
    '6-4': '勉其反'
  }, rngHigh, null, g => {
    if (g.eventId === '5-3') { g.attrs.moulue = Math.max(g.attrs.moulue, 66); g.attrs.quanshi = Math.max(g.attrs.quanshi, 72); } // 5-3 阳从阴蓄门槛迁移 moulue:65（原 caixue:65）——谋略缺口由读书/观阵类卡经营补足，hook 模拟该结果
    if (g.eventId === '6-4') g.attrs.quanshi = Math.max(g.attrs.quanshi, 76);
  });
  expect('逆天线（易帜）', g.ending, 'E7');
}

/* ---------- 6. 稳健线 → E5 学道全身（请解兵权） ---------- */
{
  const { g } = play('normal', {
    '0-1': '立誓', '0-2': '俯身', '0-3': '杖剑从戎',
    '1-1': '陷阵先登', '1-2': '数数献策', '1-3': '亡楚归汉',
    '2-1': '上不欲就天下乎', '2-2': '整肃仓廪', '2-3': '尽陈兵略', '2-4': '归而受命', '2-5': '汉中对',
    '3-1': '举兵东出', '3-2': '收拢溃兵', '3-3': '木罂缶渡河',
    '4-1': '背水一战', '4-2': '师事之', '4-3': '半渡而击',
    '5-1': '静候汉王处分', '5-2': '独当一面', '5-3': '请解兵权归老'
  });
  expect('稳健线（学道）', g.ending, 'E5');
  if (has(g, 'xuedao')) { pass++; console.log('✔ 结局成就解锁：学道全身'); }
  else { fail++; console.log('✘ E5 线应解锁成就 xuedao'); }
}

/* ---------- 7. 稳健线 → E4 王于齐土（三分不成退而自固） ---------- */
{
  // 同 E6 路线但不经营权势（66<70）→ 三分判定失败 → E4
  const { g } = play('normal', {
    '0-1': '受饭，默然铭记', '0-2': '俯身', '0-3': '杖剑从戎',
    '1-1': '陷阵先登', '1-2': '闭口不言', '1-3': '亡楚归汉',
    '2-1': '上不欲就天下乎', '2-2': '整肃仓廪', '2-3': '尽陈兵略', '2-4': '归而受命', '2-5': '汉中对',
    '3-1': '举兵东出', '3-2': '趁乱扩军', '3-3': '木罂缶渡河',
    '4-1': '背水一战', '4-2': '释而归之', '4-3': '半渡而击',
    '5-1': '静候汉王处分', '5-2': '让首功于诸将', '5-3': '听蒯通'
  });
  expect('稳健线（齐土）', g.ending, 'E4');
}

/* ---------- 8a. 失败线 → E8 云梦之缚（发兵拒捕） ---------- */
{
  const { g } = play('normal', {
    '0-1': '立誓', '0-2': '俯身', '0-3': '杖剑从戎',
    '1-1': '陷阵先登', '1-2': '数数献策', '1-3': '亡楚归汉',
    '2-1': '上不欲就天下乎', '2-2': '整肃仓廪', '2-3': '尽陈兵略', '2-4': '归而受命', '2-5': '汉中对',
    '3-1': '举兵东出', '3-2': '收拢溃兵', '3-3': '木罂缶渡河',
    '4-1': '背水一战', '4-2': '师事之', '4-3': '半渡而击',
    '5-1': '静候汉王处分', '5-2': '独当一面', '5-3': '汉王遇我厚',
    '6-1': '报德雪怨并施', '6-2': '收而庇之', '6-3': '发兵拒捕'
  });
  expect('失败线（拒捕）', g.ending, 'E8', 'yunmeng');
}

/* ---------- 8b. 失败线 → E8 云梦之缚（疑心≥70 往谒被擒） ---------- */
{
  const { g } = play('normal', {
    '0-1': '立誓', '0-2': '俯身', '0-3': '杖剑从戎',
    '1-1': '陷阵先登', '1-2': '数数献策', '1-3': '亡楚归汉',
    '2-1': '上不欲就天下乎', '2-2': '整肃仓廪', '2-3': '尽陈兵略', '2-4': '归而受命', '2-5': '汉中对',
    '3-1': '举兵东出', '3-2': '趁乱扩军', '3-3': '木罂缶渡河',
    '4-1': '背水一战', '4-2': '师事之', '4-3': '半渡而击',
    '5-1': '再遣使催封', '5-2': '独当一面', '5-3': '汉王遇我厚',
    '6-1': '报德雪怨并施', '6-2': '收而庇之', '6-3': '持钟离眜首级往谒'
  }, rngHigh, null, g => { if (g.eventId === '6-3') g.zg = Math.max(g.zg, 70); }); // 疑心累积（催封+扩军+修正共同作用）——hook 收口
  expect('失败线（往谒）', g.ending, 'E8', 'yunmeng');
}

/* ---------- 8c. 失败线 → E8 谋泄之诛（xuli 反迹败露） ---------- */
{
  const { g } = play('normal', {
    '0-1': '立誓', '0-2': '俯身', '0-3': '杖剑从戎',
    '1-1': '陷阵先登', '1-2': '数数献策', '1-3': '亡楚归汉',
    '2-1': '上不欲就天下乎', '2-2': '整肃仓廪', '2-3': '尽陈兵略', '2-4': '归而受命', '2-5': '汉中对',
    '3-1': '举兵东出', '3-2': '收拢溃兵', '3-3': '木罂缶渡河',
    '4-1': '背水一战', '4-2': '师事之', '4-3': '半渡而击',
    '5-1': '静候汉王处分', '5-2': '独当一面', '5-3': '阳从阴蓄',
    '6-4': '勉其反', '6-5': '入贺'
  }, rngHigh, null, g => { if (g.eventId === '5-3') g.attrs.moulue = Math.max(g.attrs.moulue, 66); }); // 同 E7 线（门槛迁移 moulue:65）
  expect('失败线（谋泄）', g.ending, 'E8', 'mouxie');
}

/* ---------- 8d. 失败线 → E8 潍水覆军（才学不足连番失利，单骑而逃） ---------- */
{
  const { g, trace } = play('normal', {
    '0-1': '不食', '0-2': '拔剑而起', '0-3': '杖剑从戎',
    '1-1': '陷阵先登', '1-2': '当众争锋', '1-3': '亡楚归汉',
    '2-1': '上不欲就天下乎', '2-2': '敷衍度日', '2-3': '以退为进', '2-4': '归而受命', '2-5': '答以守成之策',
    '3-1': '举兵东出', '3-1b': '血战拔城', '3-2': '收拢溃兵', '3-3': '正面强攻',
    '4-1': '背水一战', '4-1b': '单骑而逃'
  });
  expect('失败线（覆军）', g.ending, 'E8', 'weishui');
  if (trace.some(t => t[0] === '3-1b') && trace.some(t => t[0] === '4-1b')) { pass++; console.log('✔ 战役判定数组：才学不足连入兜底线（陈仓苦战→背水覆军）'); }
  else { fail++; console.log('✘ 兜底线流转异常'); }
}

/* ---------- 9. N1/N2 异变触发（声望≥45 萧何先闻 / 偏离≥46 李左车策被用） ---------- */
{
  const g1 = mkGame('normal', rngHigh);
  g1.randomOn = false; g1.start();
  g1.attrs.shengwang = 50;
  g1.enterChapter(2);
  if (g1.flags.hexianwen && g1.introNotes.some(n => n.indexOf('萧何') >= 0)) { pass++; console.log('✔ N1 异变：声望≥45 萧何先闻'); }
  else { fail++; console.log('✘ N1 异变未触发'); }
  const g2 = mkGame('normal', rngHigh);
  g2.randomOn = false; g2.start();
  g2.dev = 50;
  g2.enterChapter(4);
  if (g2.flags.zuochece && g2.introNotes.some(n => n.indexOf('李左车') >= 0)) { pass++; console.log('✔ N2 异变：偏离≥46 陈馀听李左车策'); }
  else { fail++; console.log('✘ N2 异变未触发'); }
}

/* ---------- 10. 修正事件触发（高偏离 + 必中随机） ---------- */
{
  const { trace } = play('normal', {
    '0-1': '不食', '0-2': '拔剑而起', '0-3': '杖剑从戎',
    '1-1': '陷阵先登', '1-2': '当众争锋', '1-3': '亡楚归汉',
    '2-1': '上不欲就天下乎', '2-2': '敷衍度日', '2-3': '以退为进', '2-4': '归而受命', '2-5': '答以守成之策',
    '3-1': '兵分两路', '3-2': '趁乱扩军', '3-3': '正面强攻',
    '4-1': '据险缓图', '4-2': '斩之示众', '4-3': '深沟高垒',
    '5-1': '再遣使催封', '5-2': '让首功于诸将', '5-3': '听蒯通'
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
  const ZG_WHITE = { 'HX-ACT-40': 3 }; // 威胁值白名单：仅此卡可挂 eff.zg 且值固定
  const DEV_WHITE = { 'HX-ACT-74': [2], 'HX-ACT-75': [1, 3], 'HX-ACT-76': [1] }; // 抉择卡重设计：仅此三卡的指定选项可挂 eff.dev
  D.ACTIONS.forEach(a => {
    // 抉择卡无顶层 eff，逐选项检查；普通卡查自身 eff
    const effList = a.choice ? (a.choice.options || []).map(o => o.eff || {}) : [a.eff || {}];
    effList.forEach(eff => {
    Object.keys(eff.attrs || {}).forEach(k => { if (Math.abs(eff.attrs[k]) > 8) bad.push(a.id + ' ' + k); });
    if (eff.zg && ZG_WHITE[a.id] !== eff.zg) bad.push(a.id + ' zg=' + eff.zg);
    if (eff.flags || eff.rmflags || eff.hist || eff.merit || eff.ach) bad.push(a.id + ' 干扰结局树字段');
    if (eff.dev && !(DEV_WHITE[a.id] || []).includes(eff.dev)) bad.push(a.id + ' dev');
    });
  });
  const pools = [];
  for (let ci = 0; ci <= 6; ci++) pools.push(D.ACTIONS.filter(a => (a.chapters || [0, 6])[0] <= ci && ci <= (a.chapters || [0, 6])[1]).length);
  const poolExpect = [18, 18, 18, 16, 19, 17, 18]; // 抉择卡重设计后章节迁移（HX-ACT-71~76）后的实测池
  if (D.ACTIONS.length === 76 && bad.length === 0 && pools.every((n, i) => n === poolExpect[i])) { pass++; console.log('✔ 76 个行动数据卫生（卡牌 v2 + 12 抉择卡）：单项 ≤±8、dev 白名单（HX-ACT-74/75/76）、无 flags/hist/merit/ach/rmflags、zg 白名单（HX-ACT-40 +3）、每章池 ' + poolExpect.join('/') + '（实测 ' + pools.join('/') + '）'); }
  else { fail++; console.log('✘ 行动数据卫生异常：' + (bad.join('；') || '池大小 ' + pools.join('/') + ' 总数 ' + D.ACTIONS.length)); }

  let badach = [];
  Object.values(D.ENDINGS).forEach(e => {
    (e.ach || []).forEach(a => { if (!D.ACHIEVEMENTS[a]) badach.push(a); });
    Object.values(e.variantAch || {}).flat().forEach(a => { if (!D.ACHIEVEMENTS[a]) badach.push(a); });
  });
  if (badach.length === 0) { pass++; } else { fail++; console.log('✘ 结局成就悬挂引用：' + badach.join('、')); }

  const g = mkGame('normal', rngHigh);
  g.start();
  const ok = g.zg === 15 && g.zgWord() === '尚无猜忌';
  g.zg = 55;
  if (ok && g.zgWord() === '猜忌日深') { pass++; console.log('✔ 刘邦疑心（隐藏值）：初始 15，状态词按档位映射'); }
  else { fail++; console.log('✘ 刘邦疑心映射异常'); }
}

/* ---------- 12. 失宠结算归汉后方生效（PERSIST.junxinFrom=2） ---------- */
{
  const g = mkGame('normal', rngHigh);
  g.randomOn = false; g.start();
  const firedEarly = g.introNotes.some(n => n.indexOf('失宠于上') >= 0);
  g.beginEvents(); g.playCard(0);
  const r0 = g.choose(0);
  const firedInstant = r0.changes.some(c => c.note === '失宠于上');
  g.attrs.junxin = 10;
  const w1 = g.attrs.weiji;
  g.enterChapter(2);
  const firedAt2 = g.introNotes.some(n => n.indexOf('失宠于上') >= 0);
  if (!firedEarly && !firedInstant && firedAt2 && g.attrs.weiji === w1 + 10) { pass++; console.log('✔ 失宠结算：序章/一章不触发（未识≠失宠），归汉后正常生效'); }
  else { fail++; console.log('✘ 失宠生效口径异常：early=' + firedEarly + ' instant=' + firedInstant + ' at2=' + firedAt2 + ' weiji=' + g.attrs.weiji); }
}

/* ---------- 13. 破魏之役不再死循环：才学不足 → 3-3b 再渡（单次兜底下落） ---------- */
{
  const g = mkGame('normal', rngHigh);
  g.randomOn = false; g.start(); g.enterChapter(3); g.eventId = '3-3';
  g.attrs.caixue = 40; // < 55，木罂缶首战不成
  g.beginRounds(); g.playCard(0);
  g.choose(0); g.proceed();
  const at33b = g.eventId === '3-3b';
  g.playCard(0); g.choose(0); g.proceed(); // 二次渡河 → 章末结算（3-3b 为本章末事件）
  const advanced = g.phase === 'summary' || g.phase === 'endEvent';
  if (at33b && advanced) {
    pass++; console.log('✔ 破魏之役：才学不足落 3-3b 再渡，二次渡河后入章末结算（无自指死循环）');
  } else { fail++; console.log('✘ 3-3b 兜底异常：' + g.eventId + ' ' + g.phase); }
}

/* ---------- 14. 年龄与寿元（v2.1.3）：章首定龄 20/23/25/26/28/29/35；年龄档自 26 岁起衰、末章 35 入 -3；
 *            高体魄得寿元逐点抵衰。此前沿用引擎默认 40 岁首档，【春秋渐高】在 5200 局内一次未触发（死内容）。 ---------- */
{
  const ages = [20, 23, 25, 26, 28, 29, 35];
  const decay = [0, 0, 0, -1, -1, -2, -3];
  const bandsOk = JSON.stringify(D.AGE.bands) === JSON.stringify([[26, 0], [29, -1], [32, -2], [36, -3], [200, -4]]);
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
  // 寿元抵衰三档（末章 -3 最深）：体魄 44/50/58 → 寿元+0/+1/+2 → 实减 -3/-2/-1
  const trio = [[44, 0, -3], [50, 1, -2], [58, 2, -1]].map(([tp, wantCred, wantD]) => {
    const g = mkGame('normal', rngHigh);
    g.randomOn = false; g.start();
    g.attrs.tupo = tp; const cr = g._longevity(); const t = g.attrs.tupo;
    g.enterChapter(6);
    return cr === wantCred && g.attrs.tupo === t + wantD && g.age === 35;
  });
  if (okAll) { pass++; console.log('✔ 章首定龄与年龄档：' + ages.join('/') + '，逐章体魄 ' + decay.join('/') + '（26 岁起衰，此前为死内容）'); }
  else { fail++; console.log('✘ 章首定龄异常：' + (bandsOk ? '' : 'bands 表不符 ') + detail.join('、')); }
  if (trio.every(Boolean)) { pass++; console.log('✔ 寿元抵衰三档：体魄 44/50/58 → 寿元+0/+1/+2，末章衰减 -3 分别实减 -3/-2/-1'); }
  else { fail++; console.log('✘ 寿元抵衰异常：' + trio.join('/')); }
}

/* ---------- 15. 疾病闭环（v1.9，ILLNESS cost 3 / heal 5）：大病 onset → 治病卡自动发放 → 治愈；体魄归零 → E8/baobing「病殁侯邸」 ---------- */
{
  // (a) 大病 onset：ill 流 0.0（<发病率）+ 0.0（<大病率）→ major，当即体魄-5/危机+3
  const g = mkGame('normal', rngHigh, { ill: illSeq([0.0, 0.0]) });
  g.randomOn = false; g.start(); g.beginEvents();
  const t0 = g.attrs.tupo;
  g.offer = [{ type: 'key' }, { type: 'action', id: 'HX-ACT-8' }]; // 整理兵书：不带体魄增减，onset 数值干净
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
  // (c) 病亡：体魄 1 持大病 drain → 体魄归零 → 强制结局 E8/baobing「病殁侯邸」
  const gd = mkGame('normal', rngHigh);
  gd.randomOn = false; gd.start(); gd.beginEvents();
  gd.ill = { type: 'major' }; gd.attrs.tupo = 1;
  gd.offer = [{ type: 'key' }, { type: 'action', id: 'HX-ACT-1' }];
  const rd = gd.playCard(1);
  const dead = rd && rd.forcedEnding === true;
  gd.proceed();
  if (dead && gd.ending && gd.ending.id === 'E8' && gd.ending.variant === 'baobing' && gd.ending.name === '病殁侯邸') { pass++; console.log('✔ 病亡：体魄归零 → E8/baobing「病殁侯邸」'); }
  else { fail++; console.log('✘ 病亡异常：' + JSON.stringify({ dead, end: gd.ending && (gd.ending.id + '/' + gd.ending.variant) })); }
}

/* ---------- 16. 无收益递减（卡牌 v2，ACTION_RULES.diminish=false）：同卡连用 3 次收益逐次完全相同，getOffer diminishing 恒 false ---------- */
{
  const g = mkGame('normal', rngHigh);
  g.randomOn = false; g.start(); g.beginEvents();
  const deltas = [], useCounts = [];
  for (let k = 0; k < 3; k++) {
    g.offer = [{ type: 'key' }, { type: 'action', id: 'HX-ACT-1' }]; // 著书立说：才学+3/声望+1/危机+2
    const r = g.playCard(1);
    useCounts.push(r.useCount);
    deltas.push(['caixue', 'shengwang', 'weiji'].map(kk => r.changes.find(c => c.k === kk).delta).join('/'));
  }
  g.offer = [{ type: 'key' }, { type: 'action', id: 'HX-ACT-1' }];
  const oUsed = g.getOffer()[1];
  if (useCounts.join(',') === '1,2,3' && deltas.every(d => d === '3/1/2') && oUsed.usedCount === 3 && oUsed.diminishing === false) { pass++; console.log('✔ 无递减：HX-ACT-1 连用 3 次收益逐次相同（才学+3/声望+1/危机+2），diminishing 恒 false、useCount 照计'); }
  else { fail++; console.log('✘ 无递减异常：' + JSON.stringify({ useCounts, deltas, dim: oUsed.diminishing })); }
}

/* ---------- 17. 政绩/辩才经济存在性（v2.1.0 卡侧扩至 7 源，覆盖全部七章 + 门槛白名单）：事件侧 3-2/4-2 hist 各 +5；
 * zhengji 门槛白名单：全书 req/路由 cond 引用恰两处（6-3 req:12 / 5-3 路由 if:15）；biancai 门槛白名单：恰一处（C-DEATH req:35）
 * v2.1.0：此前仅 ch4/5/6 三章有卡侧供给，ch1/2/3/7 四章零源 → 5-3「解兵权归老」E5/huaiyin 变体循史口径仅 6% 可达；
 *          补 HX-ACT-10/16/20/43 四源后升至 25%；6-3「历数战功」req 10→12（原 10 循史 100% 无张力） ---------- */
{
  const zj = {};
  D.ACTIONS.forEach(a => { if (a.eff && a.eff.attrs && a.eff.attrs.zhengji) zj[a.id] = a.eff.attrs.zhengji; });
  const zjSorted = JSON.stringify(Object.keys(zj).sort().map(k => [k, zj[k]]));
  const cardsOk = zjSorted === JSON.stringify([['HX-ACT-10', 1], ['HX-ACT-16', 1], ['HX-ACT-20', 1], ['HX-ACT-25', 1], ['HX-ACT-39', 2], ['HX-ACT-43', 1], ['HX-ACT-59', 2]]);
  const zjEvents = [];
  D.CHAPTERS.forEach(ch => (ch.events || []).forEach(ev => ev.options.forEach(o => { if (o.eff && o.eff.attrs && o.eff.attrs.zhengji) zjEvents.push(ev.id + ':' + o.eff.attrs.zhengji + (o.hist ? ':hist' : '')); })));
  const eventsOk = JSON.stringify(zjEvents.slice().sort()) === JSON.stringify(['3-2:5:hist', '4-2:5:hist']);
  const refs = { zhengji: [], biancai: [] };
  const scanEv = ev => (ev.options || []).forEach(o => {
    ['zhengji', 'biancai'].forEach(k => {
      if (o.req && o.req[k] != null) refs[k].push(ev.id + ':req:' + o.req[k]);
      if (Array.isArray(o.to)) o.to.forEach(t => { if (t.if && t.if[k] != null) refs[k].push(ev.id + ':route:' + t.if[k]); });
    });
  });
  D.CHAPTERS.forEach(ch => (ch.events || []).forEach(scanEv));
  (D.RANDOM_EVENTS || []).forEach(scanEv);
  const ce = D.CRISIS_EVENTS || {};
  ['death', 'qingsuan'].forEach(k => { if (ce[k]) scanEv(ce[k]); });
  (ce.plots || []).forEach(scanEv);
  const zjRefsOk = JSON.stringify(refs.zhengji.slice().sort()) === JSON.stringify(['5-3:route:15', '6-3:req:12']);
  const bcRefsOk = JSON.stringify(refs.biancai.slice().sort()) === JSON.stringify(['C-DEATH:req:35']);
  if (cardsOk && eventsOk && zjRefsOk && bcRefsOk) { pass++; console.log('✔ 政绩/辩才经济存在性：卡侧 7 源七章全覆盖（HX-ACT-10/16/20/25/43+1、39/59+2），事件侧 3-2/4-2 hist 各+5；zhengji 门槛恰两处（6-3 req:12 / 5-3 路由 if:15），biancai 门槛恰一处（C-DEATH req:35）'); }
  else { fail++; console.log('✘ 政绩/辩才经济异常：' + JSON.stringify({ zj, zjEvents, refs })); }
}

/* ---------- 18. v2.0.1 缺口路线 ×3：政绩（6-3 自辩 / E5 变体）与辩才（C-DEATH 廷对）门槛（属性门槛为软门槛：不足转险招，达标直选） ---------- */
{
  // (a) 6-3「历数战功，廷前自辩」req 政绩12（v2.1.0 由 10 上调）：不足转险招，达标直选 → 6-4（以功折狱：疑心≥70 亦不入云梦之缚）
  const ga = driveTo('6-3', {});
  ga.attrs.zhengji = 11;
  const aLow = ga.getOptions().find(o => o.opt.t.indexOf('廷前自辩') >= 0);
  ga.attrs.zhengji = 12; ga.zg = 80; // 疑心 80（史实往谒 zgMax:69 已必缚）——验证自辩线独立于 zg 判定
  const aIdx = ga.getOptions().findIndex(o => o.opt.t.indexOf('廷前自辩') >= 0);
  const aHigh = ga.getOptions()[aIdx];
  ga.choose(aIdx); ga.proceed();
  const aOk = aLow && !aLow.locked && aLow.risky && aLow.risky.rate === 70
    && aHigh && !aHigh.locked && !aHigh.risky && ga.eventId === '6-4';
  if (aOk) { pass++; console.log('✔ 新路线 6-3「历数战功，廷前自辩」：政绩 11 转险招（70%）/ 12 直选 → 6-4（疑心 80 亦不入云梦之缚）'); }
  else { fail++; console.log('✘ 6-3 自辩异常：' + JSON.stringify({ low: aLow && !!aLow.risky, ev: ga.eventId })); }

  // (b) C-DEATH「廷对自明，历陈不反之状」req 辩才35：不足转险招，达标直选 → RETURN（危机-15，回到被插入事件）
  const gb = mkGame('normal', rngHigh);
  gb.randomOn = false; gb.start();
  gb.attrs.weiji = 95; gb.attrs.biancai = 34;
  gb.enterChapter(1); gb.beginEvents();
  gb.playCard(0); // 关键卡 → C-DEATH
  const bStart = gb.eventId; // 'C-DEATH'
  const bLow = gb.getOptions().find(o => o.opt.t.indexOf('廷对自明') >= 0);
  gb.attrs.biancai = 35;
  const bIdx = gb.getOptions().findIndex(o => o.opt.t.indexOf('廷对自明') >= 0);
  const bHigh = gb.getOptions()[bIdx];
  gb.choose(bIdx); gb.proceed();
  const bOk = bStart === 'C-DEATH' && bLow && !bLow.locked && bLow.risky && bLow.risky.rate === 70
    && bHigh && !bHigh.locked && !bHigh.risky && gb.attrs.weiji === 80 && gb.eventId === '1-1';
  if (bOk) { pass++; console.log('✔ 新路线 C-DEATH「廷对自明」：辩才 34 转险招（70%）/ 35 直选，危机 95→80，RETURN 回 1-1'); }
  else { fail++; console.log('✘ C-DEATH 廷对异常：' + JSON.stringify({ low: bLow && !!bLow.risky, weiji: gb.attrs.weiji, ev: gb.eventId })); }

  // (c) 5-3「从汉，但请解兵权归老」E5 条件变体：zhengji≥15 → E5/huaiyin「淮阴之治」；<15 → E5 本体（引擎先结算 eff 再判路由，该选项 eff 无政绩）
  const gc = mkGame('normal', rngHigh);
  gc.randomOn = false; gc.start(); gc.enterChapter(5); gc.eventId = '5-3';
  gc.attrs.zhengji = 15; gc.attrs.shengwang = 60;
  gc.beginRounds(); gc.playCard(0);
  const cIdx = gc.getOptions().findIndex(o => o.opt.t.indexOf('请解兵权归老') >= 0);
  gc.choose(cIdx); gc.proceed();
  const gc2 = mkGame('normal', rngHigh);
  gc2.randomOn = false; gc2.start(); gc2.enterChapter(5); gc2.eventId = '5-3';
  gc2.attrs.zhengji = 14; gc2.attrs.shengwang = 60;
  gc2.beginRounds(); gc2.playCard(0);
  const cIdx2 = gc2.getOptions().findIndex(o => o.opt.t.indexOf('请解兵权归老') >= 0);
  gc2.choose(cIdx2); gc2.proceed();
  const cOk = gc.ending && gc.ending.id === 'E5' && gc.ending.variant === 'huaiyin' && gc.ending.name === '淮阴之治'
    && gc2.ending && gc2.ending.id === 'E5' && !gc2.ending.variant;
  if (cOk) { pass++; console.log('✔ 5-3 解兵权条件变体：政绩 15 → E5/huaiyin「淮阴之治」，14 → E5 本体'); }
  else { fail++; console.log('✘ 解兵权变体异常：' + JSON.stringify({ v15: gc.ending && gc.ending.variant, v14: gc2.ending && gc2.ending.variant })); }
}

console.log(`\n结果：${pass} 通过，${fail} 失败`);
process.exit(fail > 0 ? 1 : 0);
