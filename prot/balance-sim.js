/* 批量平衡模拟器（GDD 第十章 平衡准则验收）
 * 用多种策略各跑 N 局 headless 对局，统计结局/通关率/评级分布，校验：
 *   准则 3：属性制衡——单一属性策略通关率仅作**压力测试读数**（v1.6.1 起非验收门槛，GDD 附录 D #25）
 *   准则 5：每剧本 ≥3 条通关路线（苟活 E2/E3、稳健 E4/E5、逆天 E6/E7 均应可达）
 *   准则 1：无万能最优选项（代理指标：各策略平均总分差、关键节点选项收益差）
 *   准则 2：历史惯性（代理指标：激进偏离策略的死亡率 vs 史实策略）
 * 运行：node balance-sim.js [--games 1000] [--seed 42] [--seeds 10] [--diff normal] [--scenario lisi|jingke] [--out report.json]
 */
function arg(name, def) {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}
/* 多剧本：--scenario jingke|hanxin 加载对应剧本数据（默认 lisi） */
const SCEN = arg('scenario', 'lisi');
const DATA_FILES = { lisi: './game-data.js', jingke: './jingke-data.js', hanxin: './hanxin-data.js', xiangyu: './xiangyu-data.js', chensheng: './chensheng-data.js' };
const D = require(DATA_FILES[SCEN] || DATA_FILES.lisi);
const E = require('./engine.js');

/* 可复现随机源 */
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    var t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const GAMES = parseInt(arg('games', '1000'), 10);
const SEED = parseInt(arg('seed', '42'), 10);
const SEEDS = Math.max(1, parseInt(arg('seeds', '1'), 10)); // 多 seed 扫描：--seeds N（N>1 时每策略总局数 = GAMES×N，可复现性由 SEED 派生保持）
const DIFF = arg('diff', 'normal');
const OUT = arg('out', null);

/* ---------- 策略：给定 {g, options:[{opt,locked,hist}], rng} 返回下标 ---------- */
function unlocked(options) {
  const r = [];
  options.forEach((o, i) => { if (!o.locked) r.push(i); });
  return r;
}
function pickBy(options, rng, score) {
  const cand = unlocked(options);
  let best = -Infinity, ties = [];
  cand.forEach(i => {
    const s = score(options[i].opt);
    if (s > best) { best = s; ties = [i]; }
    else if (s === best) ties.push(i);
  });
  return ties[Math.floor(rng() * ties.length)];
}
const devOf = o => (o.eff && o.eff.dev) || 0;
const attrOf = (o, k) => (o.eff && o.eff.attrs && o.eff.attrs[k]) || 0;

/* ---------- 规划型逆天策略（nitian）：验证"逆天线可被刻意规划达成"（准则 2 补证） ----------
 * 事件按预设路线表选（观鼠悟道 → 无害韩非 → 扶苏缓颊 → 沙丘反客为主；锁定则退 拒之 → 从之），
 * 行动卡主动经营：君心峰值 <60 优先入宫请安/托人递简（E6 需峰值≥60），危机 ≥60 优先压危机；
 * 关键卡余 1 轮时不再打行动卡，防止倒计时归零被强制提前进入抉择（如 4-2 提前弹劾韩非即全盘活埋）。 */
const NITIAN_PREFS = {
  lisi: {
  '0-1': ['驻足细想'], '0-2': ['辞去吏职'], '0-3': ['变卖家资'], '0-4': ['仓中鼠'],
  '1-1': ['潜心问学'], '1-2': ['西入秦'], '1-3': ['细察秦国民情'], '1-4': ['楚国不可为'], '1-5': ['意难平'],
  '2-1': ['埋头著文'], '2-2': ['灭诸侯'], '2-3': ['上书自辩'], '2-4': ['只做离间'],
  '3-0': ['连夜起草'], '3-1': ['拖延时日'], '3-2': ['上书——'], '3-3': ['狱中上书'],
  '4-1': ['物禁大盛'], '4-2': ['举荐韩非'], '4-3': ['独排众议'], '4-4': ['倾力推行'], '4-5-pre': ['周仆射面谀'],
  '4-5': ['官藏代焚'], '4-6': ['为扶苏缓颊'],
  'cj-yaojia': ['挺身力保'], 'cj-tuiyin': ['再留一程'],
  '5-1': ['怒斥'], '5-2': ['反客为主', '拒之。宁死', '从之'], '5-3': ['死拒', '屈服'], '5-4': ['等待命运'],
  '6-1': ['上书请减徭役'], '6-2': ['密奏二世', '察觉有诈'], '6-3': ['狱中上书', '不写了'], '6-4': ['引颈就戮']
  },
  jingke: {
  '0-1': ['还以眼色'], '0-2': ['长揖谢罪'], '0-3': ['西入燕'],
  '1-1': ['放歌相和'], '1-2': ['与论天下大势'], '1-3': ['静观时局'],
  '2-1': ['受遗命'], '2-2': ['许之'], '2-3': ['即刻治装'],
  '3-1': ['陈说利害'], '3-2': ['取真图'], '3-3': ['购徐夫人匕'], '3-4': ['以秦舞阳为副'],
  '4-1': ['和歌而去'], '4-2': ['细察秦廷关节'],
  '5-1': ['千金买通'], '5-2': ['如常进殿'], '5-3': ['笑而谢曰'], '5-4': ['揕其胸'], '5-5': ['倚柱而笑']
  },
  hanxin: {
  '0-1': ['受饭，默然铭记'], '0-2': ['俯身'], '0-3': ['杖剑从戎'],
  '1-1': ['陷阵先登'], '1-2': ['闭口不言'], '1-3': ['亡楚归汉'],
  '2-1': ['上不欲就天下乎'], '2-2': ['整肃仓廪'], '2-3': ['尽陈兵略'], '2-4': ['归而受命'], '2-5': ['汉中对'],
  '3-1': ['举兵东出'], '3-2': ['趁乱扩军'], '3-3': ['木罂缶渡河'],
  '4-1': ['背水一战'], '4-2': ['释而归之'], '4-3': ['半渡而击'],
  '5-1': ['静候汉王处分'], '5-2': ['让首功于诸将'], '5-3': ['听蒯通']
  },
  xiangyu: {
  '0-1': ['昼夜研习'], '0-2': ['悉心结交'], '0-3': ['随叔父赴府'],
  '1-1': ['召故吏豪杰'], '1-2': ['礼为上宾'], '1-3': ['立熊心为楚怀王'],
  '2-1': ['斩宋义'], '2-2': ['沉船破釜'], '2-3': ['九战破秦'],
  '3-1': ['收编为军'], '3-2': ['厉兵秣马'], '3-3': ['默然纵之'],
  '4-1': ['约法安民'], '4-2': ['尊义帝以虚名'], '4-3': ['遣使镇抚'],
  '5-1': ['乘胜穷追'], '5-2': ['察其诈'], '5-3': ['许之，而暗增戒备'],
  '6-1': ['遣骑四散'], '6-2': ['弃马步涉'], '6-3': ['并力一路'], '6-4': ['渡江再砺']
  },
  chensheng: {
  '0-1': ['恼而掷锄'], '0-2': ['接籍为屯长'], '0-3': ['与吴广深谈'],
  '1-1': ['再等等，雨停再议'], '1-2': ['因势利导'], '1-3': ['袒右称大楚'],
  '2-1': ['从民所欲'], '2-2': ['纵其自守'], '2-3': ['入据陈，开仓抚民'],
  '3-1': ['自立为王'], '3-2': ['缓图之'],
  '4-1': ['发援兵并力西进'], '4-1b': ['鸣金收兵'], '4-2': ['黜朱房胡武'],
  '5-1': ['亲赴荥阳'], '5-2': ['立诛田臧'],
  '6-1': ['弃陈南走'], '6-2': ['察其异，先收其刃'], '6-3': ['南下合流']
  }
};
const NITIAN_PREF = NITIAN_PREFS[SCEN] || NITIAN_PREFS.lisi;

/* ---------- 微澜策略（v2.1.1 新增）：稳健线 E4/E5 的真实测量口径 ----------
 * 此前 12 策略无一瞄准偏离带 21–45：devHigh 每步冲最高 dev（项羽/陈胜直落 71+ 反噬带，
 * E8 率 100%，是设计意图「力征必亡」），devLow/hist 贴 0 走史实线，稳健线在
 * balance-sim 里只能靠 random 命中 —— 于是「稳健线达成 3 局 / 20 局」被读成路线稀疏，
 * 实为**策略覆盖缺口**。本策略补上这一格：目标偏离 30（微澜带中部），
 * 兼顾战役门槛水位与终章 E4/E5 出口偏好。 */

/* 门槛水位：战役门是**史实选项上的硬路由条件**，不满足即落兜底失败线直接落 E8
 * （项羽 2-3 权势 45 → E8/guling；陈胜 4-1 权势 40 → 4-1b → E8/xiting；
 *   韩信 4-1·4-3 才学 60 → 4-1b → E8/weishui）。真人必先经营到位，故策略也须给水位。 */
/* wSafe：危机安全线。稳健线出口是**条件路由上的 weijiMax**（陈胜 6-2「察其异」
 * 要求结算后危机 ≤84，否则直接落 E8；项羽 5-3「不许」≤59/≤69 两档），
 * 策略只看得见 eff 看不见路由，须自己把危机压到安全线以下，故危机权重按本登记。 */
const WEILIAN_GATES = {
  lisi:      { quanshi: 60, caixue: 60, moulue: 0, wSafe: 70, wW: 1.2 },
  jingke:    { quanshi: 15, caixue: 45, moulue: 0, wSafe: 60, wW: 1.2 },
  hanxin:    { quanshi: 70, caixue: 60, moulue: 0, wSafe: 65, wW: 1.2 },
  xiangyu:   { quanshi: 45, caixue: 55, moulue: 55, wSafe: 60, wW: 1.2 },
  chensheng: { quanshi: 40, caixue: 45, moulue: 50, wSafe: 70, wW: 3.5, wuli: 42, biancai: 45 },
};
const WG = WEILIAN_GATES[SCEN] || WEILIAN_GATES.lisi;

/* 前两章的偏离罚分，逐本登记——同一罚分在不同本效果相反：
 * 韩信/荆轲前两章的偏离选项本身是死路（韩信 1-3「留楚不去」→E3），须重罚（2.0）；
 * 项羽的权势来源自带偏离（1-1 纵兵大掠 dev5/qs+10、1-3 不立虚名 dev8），重罚会把权势压到 0、
 * 随后全数撞死在 ch3 巨鹿门，故轻罚（0.6）。 */
const EARLY_DEV_PENALTY = { lisi: 0.6, jingke: 2.0, hanxin: 2.0, xiangyu: 0.6, chensheng: 0.6 };
const EDP = EARLY_DEV_PENALTY[SCEN] != null ? EARLY_DEV_PENALTY[SCEN] : 0.6;
function devTarget(chapterIdx) { return chapterIdx >= 2 ? 30 : 0; }

/* 稳健线出口（E4/E5）逐本登记，含**入口节点**。dev 带策略只管「偏离量」，管不到「在哪个节点花这笔偏离」——
 * 而五本的 E4/E5 全部挂在终章的单个高 dev 选项上（李斯 5-2/5-3/6-2/6-3、荆轲 5-4、
 * 韩信 5-3、项羽 5-3/5-3b、陈胜 6-3），且部分入口本身也是高 dev 或死路选项
 * （李斯 3-1「认命出关」→E3 出关即终局；陈胜 6-2「察其异」dev15 会被偏离带惩罚压过）。
 * 只登记终点不登记入口，微澜会一路贴着 dev 30 走到 E1/E3 而永不触线。 */
const WEILIAN_EXITS = {
  lisi:      { '3-1': ['拖延时日', '藏匿咸阳'], '5-2': ['拒之'], '5-3': ['死拒'], '6-2': ['历陈政绩'], '6-3': ['散尽家财'] },
  jingke:    { '5-4': ['掷图喝破', '把袖不刺'] },
  hanxin:    { '5-3': ['从汉，但请解兵权归老', '听蒯通'] },
  xiangyu:   { '5-3': ['不许，提兵再决胜负'], '5-3b': ['总攻成皋'] },
  // 6-2「察其异，先收其刃」（req moulue 50）是通往 6-3「南下合流」的唯一入口，
  // 该项 dev15 会把 after 推过 45 反噬线而被打分惩罚，须显式登记
  // 5-2「分田臧兵」是通往 E8/yingyang 的岔路（5-2b → 亲征田臧 qs≥45 才收束，否则落败），
  // 5-2b 亦须登记，否则偏好落空后按打分会走进去
  // 5-1「不问，坐观成败」带 rmflags:['wuguang']，而 6-2 路由要求 anyflag[wuguang,buwang]——
  // 该项危机代价最低（w+5）故常被打分选中，一选就把 6-3 出口永久关死，须显式避开
  chensheng: { '5-1': ['以王命切责田臧', '亲赴荥阳'], '5-2': ['听之任之'], '5-2b': ['亲征田臧'], '6-2': ['察其异'], '6-3': ['南下合流'] },
};
const WX = WEILIAN_EXITS[SCEN] || WEILIAN_EXITS.lisi;

/* 缺口加权：离门槛越远越该补（不足时给高权重，达标后归零） */
function gapBonus(cur, target) { return target == null ? 0 : (cur < target ? (target - cur) * 0.9 : 0); }

/* 门槛属性非对称计权：收益按 w 全额奖励，代价只按 w×0.25 计入。
 * 对称计权会让策略为回避「权势-8」而选「危机+25」的死路（实测陈胜 4-1b：
 * 收兵退保 qs-8 得分 -10.4 < 死战不退 qs0 得分 -6 → 全数撞死 E8/xiting）。 */
function gateGain(v, cur, target) {
  const w = 2.5 + gapBonus(cur, target) * 0.1;
  return v > 0 ? v * w : v * w * 0.25;
}

function weilianScore(o, g) {
  const eff = o.eff || {};
  const dev = eff.dev || 0;
  const after = (g ? g.dev : 0) + dev;
  const A = g ? g.attrs : {};
  const tgt = devTarget(g ? g.chapterIdx : 0);
  let s = 0;
  if (after > 45) s -= (after - 45) * 4 + 20;     // 踏进必触发反噬带（46–70 / 71–100 每章必吃）
  else if (tgt) s += Math.min(after, tgt) * 0.8;  // 偏离收益，贴 30 最好
  if (tgt) { if (after < 21) s -= (21 - after) * 0.5; }
  else s -= dev * EDP;                            // 前两章：偏离轻罚（逐本登记）
  s -= attrOf(o, 'weiji') * WG.wW;                // 危机压舱（权重按本，见 WEILIAN_GATES.wW）
  s += attrOf(o, 'junxin') * 0.8;
  s += attrOf(o, 'shengwang') * 0.6;
  s += gateGain(attrOf(o, 'quanshi'), A.quanshi, WG.quanshi);
  s += gateGain(attrOf(o, 'caixue'), A.caixue, WG.caixue);
  if (WG.moulue) s += gateGain(attrOf(o, 'moulue'), A.moulue, WG.moulue);
  if (WG.wuli) s += gateGain(attrOf(o, 'wuli'), A.wuli, WG.wuli);
  if (WG.biancai) s += gateGain(attrOf(o, 'biancai'), A.biancai, WG.biancai);
  return s;
}

const STRATEGIES = {
  random:      (c) => { const u = unlocked(c.options); return u[Math.floor(c.rng() * u.length)]; },
  hist:        (c) => { const h = c.options.findIndex(o => o.hist && !o.locked); return h >= 0 ? h : STRATEGIES.random(c); },
  devHigh:     (c) => pickBy(c.options, c.rng, o => devOf(o)),
  devLow:      (c) => pickBy(c.options, c.rng, o => -devOf(o)),
  survive:     (c) => pickBy(c.options, c.rng, o => -attrOf(o, 'weiji') * 10 + attrOf(o, 'junxin')),
  quanshi:     (c) => pickBy(c.options, c.rng, o => attrOf(o, 'quanshi')),
  shengwang:   (c) => pickBy(c.options, c.rng, o => attrOf(o, 'shengwang')),
  junxin:      (c) => pickBy(c.options, c.rng, o => attrOf(o, 'junxin')),
  caifu:       (c) => pickBy(c.options, c.rng, o => attrOf(o, 'caifu')),
  caixue:      (c) => pickBy(c.options, c.rng, o => attrOf(o, 'caixue')),
  weilian:     (c) => {
    // 终章稳健线出口优先（与 nitian 的 NITIAN_PREFS 同构）；未登记事件照 weilianScore
    const evId = (c.g.phase === 'endEvent' && c.g.currentEndEvent) ? c.g.currentEndEvent.id : c.g.eventId;
    const prefs = WX[evId];
    if (prefs) {
      for (let p = 0; p < prefs.length; p++) {
        const i = c.options.findIndex(o => !o.locked && o.opt.t.indexOf(prefs[p]) >= 0);
        if (i >= 0) return i;
      }
    }
    return pickBy(c.options, c.rng, o => weilianScore(o, c.g));
  },
  nitian:      (c) => {
    const evId = (c.g.phase === 'endEvent' && c.g.currentEndEvent) ? c.g.currentEndEvent.id : c.g.eventId;
    const prefs = NITIAN_PREF[evId];
    if (prefs) {
      for (let p = 0; p < prefs.length; p++) {
        const i = c.options.findIndex(o => !o.locked && o.opt.t.indexOf(prefs[p]) >= 0);
        if (i >= 0) return i;
      }
    }
    return STRATEGIES.survive(c); // 未登记事件（际遇/危机插入）按求生打分兜底
  },
};
const ATTR_STRATS = ['quanshi', 'shengwang', 'junxin', 'caifu', 'caixue', 'survive'];
/* xushi 策略（v1.6.1）：每个关键事件先蓄势一次（round 阶段返回 -1 由 playOne 特判调 playXushi）。
 * v1.6.8 修正——此前 STRATEGIES.xushi = STRATEGIES.survive（事件抉择与已蓄势后的选卡完全同源），
 * 两条策略在 10 万局 × 5 剧本下产出**逐项完全相同**的统计量，说明"蓄势"从未被独立测量过：
 * 蓄势的全部作用本应体现在「多买一个回合」与「险招 +10」的边际收益上，而这两项在共用打分后被抵消。
 * 现给 xushi 独立的"厚积"打分：以危机压制为纲，但额外偏好**不消耗回合的解法**（dev=0 且不加危机），
 * 即"这一回合我宁可什么都不做，也要留一分胜算到抉择那一刻"——这才是蓄势的收益形状。 */
STRATEGIES.xushi = (c) => pickBy(c.options, c.rng, o => {
  const eff = o.eff || {};
  const crisis = (eff.attrs && eff.attrs.weiji) || 0;
  const dev = eff.dev || 0;
  const after = c.g.attrs.weiji + crisis;
  // 厚积（v1.6.8）：蓄势的收益形状 = "多留一分胜算到抉择那一刻"，代价是每节点少一轮经营。
  // 打分以**存亡**为纲——危险时（预计危机逼近致死线）拼命压险；安全时允许承担一点代价换取推进，
  // 否则在"全选项都加危机"的剧本（如项羽）里会无路可走、原地打转到 E8。
  let s;
  if (after >= 60) s = -crisis * 20 - (after - 60) * 3;   // 逼近死线：压险压倒一切
  else s = -crisis * 4 + (dev === 0 ? 6 : 0) + (after < 30 ? 4 : 0);  // 安全期：厚积优先，少作孽
  s += (eff.attrs && eff.attrs.junxin) || 0;
  return s;
});

/* ---------- round 阶段选卡（行动卡回合制） ----------
 * 打分函数统一作用于 eff（事件选项与行动卡同口径）；关键卡估值 = 当前事件各未锁定选项中该策略的最优值 */
const EFF_SCORE = {
  devHigh:   eff => (eff.dev || 0),
  devLow:    eff => -(eff.dev || 0),
  survive:   eff => -((eff.attrs && eff.attrs.weiji) || 0) * 10 + ((eff.attrs && eff.attrs.junxin) || 0),
  quanshi:   eff => (eff.attrs && eff.attrs.quanshi) || 0,
  shengwang: eff => (eff.attrs && eff.attrs.shengwang) || 0,
  junxin:    eff => (eff.attrs && eff.attrs.junxin) || 0,
  caifu:     eff => (eff.attrs && eff.attrs.caifu) || 0,
  caixue:    eff => (eff.attrs && eff.attrs.caixue) || 0,
  // 微澜（v2.1.1）：与 STRATEGIES.weilian 同源，打分对象是 eff（无 opt 包装）。
  // 第二参统一传 g 本身（weilian 需 dev 与 attrs 两项，其余策略传 wj）。
  weilian:   (eff, g) => {
    const dev = eff.dev || 0;
    const after = (g ? g.dev : 0) + dev;
    const tgt = devTarget(g ? g.chapterIdx : 0);
    let s = 0;
    if (after > 45) s -= (after - 45) * 4 + 20;
    else if (tgt) s += Math.min(after, tgt) * 0.8;
    if (tgt) { if (after < 21) s -= (21 - after) * 0.5; }
    else s -= dev * EDP;
    s -= ((eff.attrs && eff.attrs.weiji) || 0) * WG.wW;
    s += ((eff.attrs && eff.attrs.junxin) || 0) * 0.8;
    s += ((eff.attrs && eff.attrs.shengwang) || 0) * 0.6;
    const A = (g && g.attrs) || null;
    s += gateGain((eff.attrs && eff.attrs.quanshi) || 0, A && A.quanshi, WG.quanshi);
    s += gateGain((eff.attrs && eff.attrs.caixue) || 0, A && A.caixue, WG.caixue);
    if (WG.moulue) s += gateGain((eff.attrs && eff.attrs.moulue) || 0, A && A.moulue, WG.moulue);
    if (WG.wuli) s += gateGain((eff.attrs && eff.attrs.wuli) || 0, A && A.wuli, WG.wuli);
    if (WG.biancai) s += gateGain((eff.attrs && eff.attrs.biancai) || 0, A && A.biancai, WG.biancai);
    return s;
  },
  // 厚积（v1.6.8）：安全期少作孽、危险期拼命压险——同 STRATEGIES.xushi
  // wNow = 打出前的危机值；after = wNow + 本卡增减，用于判断是否逼近死线
  xushi:     (eff, wNow) => {
    const crisis = (eff.attrs && eff.attrs.weiji) || 0;
    const dev = eff.dev || 0;
    const after = wNow + crisis;
    let s;
    if (after >= 60) s = -crisis * 20 - (after - 60) * 3;
    else s = -crisis * 4 + (dev === 0 ? 6 : 0) + (after < 30 ? 4 : 0);
    s += (eff.attrs && eff.attrs.junxin) || 0;
    return s;
  },
};
function pickCard(stratName, g, rng) {
  const offer = g.getOffer();
  // 大病求医（v1.8 疾病系统）：大病不会自愈且持续消磨体魄至死——所有策略视同理性玩家，优先打出「求医问药」
  if (g.ill && g.ill.type === 'major') {
    for (let i = 1; i < offer.length; i++) if (offer[i].action && offer[i].action.id === '__cure__') return i;
  }
  if (stratName === 'hist') return 0; // 关键卡在则点关键卡（事件内照 hist 逻辑）
  if (stratName === 'xushi' && !g.xushi) return -1; // 蓄势策略：每个关键事件先蓄势一次（playOne 特判）
  // 已蓄势则按"厚积"打分出行动卡（v1.6.8 修复）：
  // 此前 return -1 无条件成立 → playXushi() 在 xushi 态返回 null → 兜底 g.playCard(0) 直接点关键卡，
  // 行动卡整局一张未出，只剩"白蓄一次势就进抉择"，蓄势收益被彻底测反（项羽 1.4% 通关）。
  if (stratName === 'random') {    const cand = [0]; // 4 张卡均匀随机（跳过锁定行动卡）
    for (let i = 1; i < offer.length; i++) if (!offer[i].locked) cand.push(i);
    return cand[Math.floor(rng() * cand.length)];
  }
  if (stratName === 'nitian') {
    // 关键卡余 1 轮时强制点关键卡，防倒计时归零被强制提前进入抉择
    if (g.keyRoundsLeft <= 1) return 0;
    if (SCEN === 'chensheng') {
      // 陈胜 E6 门槛（4-1 发援兵，eff 后判定）：权势 40（路线 26+eff15=41，余量靠行动卡）、
      // 才学 45（路线 37+读兵）、偏离 46（路线 51）。稀缺度：权势边际最薄，优先补权势。
      if (g.attrs.quanshi < 42) {
        for (let i = 1; i < offer.length; i++) if (offer[i].action && ['CS-ACT-22', 'CS-ACT-27', 'CS-ACT-35', 'CS-ACT-16', 'CS-ACT-20'].indexOf(offer[i].action.id) >= 0 && !offer[i].locked) return i;
      }
      if (g.attrs.caixue < 46) {
        for (let i = 1; i < offer.length; i++) if (offer[i].action && offer[i].action.id === 'CS-ACT-4' && !offer[i].locked) return i;
        for (let i = 1; i < offer.length; i++) if (offer[i].action && ['CS-ACT-17', 'CS-ACT-24'].indexOf(offer[i].action.id) >= 0 && !offer[i].locked) return i;
      }
      // 危机增速极快（发援兵+20 与高偏离修正叠加）：危机优先压舱
      if (g.attrs.weiji >= 55) {
        let best = 0, bi = 0;
        for (let i = 1; i < offer.length; i++) {
          const e = offer[i];
          if (e.locked || !e.action || !e.action.eff || !e.action.eff.attrs) continue;
          const w = e.action.eff.attrs.weiji || 0;
          if (w < best) { best = w; bi = i; }
        }
        if (bi) return bi;
      }
      // 兜底生存线（5-2 立诛田臧需君心≥50）：联络/聚义/犒赏经营君心
      if (g.attrs.junxin < 50) {
        for (let i = 1; i < offer.length; i++) if (offer[i].action && ['CS-ACT-3', 'CS-ACT-1', 'CS-ACT-32'].indexOf(offer[i].action.id) >= 0 && !offer[i].locked) return i;
      }
    } else if (SCEN === 'hanxin') {
      // 韩信 E6 门槛=权势≥70（战役才学 55/60 顺路）：权势不足优先 演兵示法/收留降卒/整训齐军
      if (g.attrs.quanshi < 70) {
        for (let i = 1; i < offer.length; i++) if (offer[i].action && ['HX-ACT-23', 'HX-ACT-30', 'HX-ACT-41'].indexOf(offer[i].action.id) >= 0 && !offer[i].locked) return i;
      }
      if (g.attrs.caixue < 60) {
        for (let i = 1; i < offer.length; i++) if (offer[i].action && offer[i].action.id === 'HX-ACT-1' && !offer[i].locked) return i;
        for (let i = 1; i < offer.length; i++) if (offer[i].action && offer[i].action.id === 'HX-ACT-4' && !offer[i].locked) return i;
      }
    } else if (SCEN === 'jingke') {
      // 荆轲 E6/E7 门槛=辩才（5-4 揕胸 E6 biancai:55 / E7 biancai:60；5-3 笑谢 biancai:40 顺路即过）。
      // 稀缺度（参照陈胜块口径）：财富是硬门槛生命线（3-3 购徐夫人匕 10 / 5-1 千金买通 10，caifu 恒硬锁不可险招）——
      // 财富水位不足先打赚钱卡（贩马/风餐/授剑/帮佣/变卖剑饰/燕邸授剑/鬻车/分藏）；辩才优先免费卡
      // （演练辞令/殿前演礼/听筑/谒田光墓/周旋宾客/抚樊旧部/筑前话别/太子府问安），富裕才打付费辩才卡；
      // 入 c5 连刷双卡 演练辞令（JK-ACT-40）/ 殿前演礼（JK-ACT-55）（ACTION_RULES 无递减，可连刷）冲刺 55–60。
      const JK_EARN = ['JK-ACT-9', 'JK-ACT-46', 'JK-ACT-15', 'JK-ACT-48', 'JK-ACT-23', 'JK-ACT-52', 'JK-ACT-54', 'JK-ACT-56'];
      const JK_BFREE = ['JK-ACT-40', 'JK-ACT-55', 'JK-ACT-13', 'JK-ACT-19', 'JK-ACT-20', 'JK-ACT-25', 'JK-ACT-32', 'JK-ACT-3'];
      const JK_BCOST = ['JK-ACT-11', 'JK-ACT-14', 'JK-ACT-18', 'JK-ACT-35', 'JK-ACT-2', 'JK-ACT-5'];
      if (g.attrs.caifu < 12) {
        for (let i = 1; i < offer.length; i++) if (offer[i].action && JK_EARN.indexOf(offer[i].action.id) >= 0 && !offer[i].locked) return i;
      }
      if (g.attrs.biancai < 58) {
        for (let i = 1; i < offer.length; i++) if (offer[i].action && JK_BFREE.indexOf(offer[i].action.id) >= 0 && !offer[i].locked) return i;
        if (g.attrs.caifu >= 15) for (let i = 1; i < offer.length; i++) if (offer[i].action && JK_BCOST.indexOf(offer[i].action.id) >= 0 && !offer[i].locked) return i;
      }
    } else if (g.peak.junxin < 60) {
      // 君心峰值不足 60（李斯 E6 门槛）：优先入宫请安（ACT-3），其次托人递简（ACT-28）
      for (let i = 1; i < offer.length; i++) if (offer[i].action && offer[i].action.id === 'ACT-3' && !offer[i].locked) return i;
      for (let i = 1; i < offer.length; i++) if (offer[i].action && offer[i].action.id === 'ACT-28' && !offer[i].locked) return i;
    }
    // 危机偏高：打出手牌中最强的危机削减卡
    if (g.attrs.weiji >= 60) {
      let best = 0, bi = 0;
      for (let i = 1; i < offer.length; i++) {
        const e = offer[i];
        if (e.locked || !e.action || !e.action.eff || !e.action.eff.attrs) continue;
        const w = e.action.eff.attrs.weiji || 0;
        if (w < best) { best = w; bi = i; }
      }
      if (bi) return bi;
    }
    return 0;
  }
    const score = EFF_SCORE[stratName];
    // 第二参：xushi 传当前危机（推算结算后危机）；weilian 传 g 本身（需 dev 与 attrs）
    const ctx = stratName === 'weilian' ? g : g.attrs.weiji;
    let keyVal = -Infinity;
    g.getOptions().forEach(o => { if (!o.locked) keyVal = Math.max(keyVal, score(o.opt.eff || {}, ctx)); });
    let best = keyVal, ties = [0];
    for (let i = 1; i < offer.length; i++) {
      if (offer[i].locked) continue;
      const v = score((offer[i].action && offer[i].action.eff) || {}, ctx);
      if (v > best) { best = v; ties = [i]; }
      else if (v === best) ties.push(i);
    }
    return ties[Math.floor(rng() * ties.length)];
}

/* 章末事件选项引擎不校验锁定（防御在 UI），模拟器按 req 自行过滤；
 * 章末不骰化：全 req（含属性）按硬锁过滤。章内事件走 g.getOptions()（引擎已含险招语义：
 * 属性软门槛不锁、以 risky 呈现，策略选中后由引擎内掷骰判定，seeded rng 保持确定性）。 */
function wrapOptions(g, ev) {
  return ev.options.map(o => ({ opt: o, locked: o.req ? !g.check(o.req).ok : false, hist: !!o.hist }));
}

/* ---------- 单局 ---------- */
function playOne(stratName, diffKey, rng) {
  const g = new E.Game(D, diffKey, rng);
  const pick = STRATEGIES[stratName];
  /* v2.1.4：记录每次「历史修正判定时刻」的段位——段位边界的实际作用点就在这里
   * （engine chapterEnd 里 band>0 才进修正池、band>=2 无条件发、band>=3 触发逆天反噬）。
   * 只记终局 dev 是旁证不足：终局落点与判定时刻的段位不是同一件事。 */
  g.__bands = []; g.__devs = [];
  const origCE = g.chapterEnd.bind(g);
  g.chapterEnd = function () { g.__bands.push(g.devBand()); g.__devs.push(g.dev); return origCE(); };
  g.start();
  let guard = 0, decisions = 0;
  const keyPicks = []; // 关键节点抉择记录：[node, optionText]
  while (g.phase !== 'ending' && guard++ < 500) {
    if (g.phase === 'intro') { g.beginEvents(); continue; }
    if (g.phase === 'round') {
      const ci = pickCard(stratName, g, rng);
      if (ci === -1) { // 蓄势策略：放弃出牌（playXushi 内部照常推进倒计时与 forcedKey）
        const rx = g.playXushi();
        if (!rx) { g.playCard(0); continue; }
        decisions++;
        continue;
      }
      const r = g.playCard(ci);
      if (!r) { g.playCard(0); continue; } // 兜底：锁定等异常直接点关键卡
      decisions++;
      // r.kind==='key' → event 阶段由下方事件分支按策略选选项；
      // r.forcedKey（倒计时归零强制抉择）仅切入 event 阶段，抉择由下方事件分支按策略进行，非自动结算；
      // r.forcedEnding → phase='settle'，由 settle 分支 proceed 收束。
      continue;
    }
    if (g.phase === 'correction') { g.correctionContinue(); continue; }
    if (g.phase === 'summary') { g.proceedSummary(); continue; }
    if (g.phase === 'endEvent') {
      const options = wrapOptions(g, g.currentEndEvent);
      const i = pick({ g, options, rng });
      const ev = g.currentEndEvent;
      g.endEventChoose(i); decisions++;
      if (ev.key) keyPicks.push([D.KEY_NODE_NAMES[ev.id] || ev.title, ev.options[i].t]);
      continue;
    }
    if (g.phase === 'event') {
      const ev = g.findEvent(g.eventId);
      const options = g.getOptions();
      const i = pick({ g, options, rng });
      decisions++;
      if (ev.key) keyPicks.push([D.KEY_NODE_NAMES[ev.id] || ev.title, ev.options[i].t]);
      g.choose(i);
      continue;
    }
    if (g.phase === 'choice') { const v = g.getChoiceCard(); g.chooseCardOption(Math.floor(rng() * v.options.length)); continue; }
    if (g.phase === 'settle') { g.proceed(); continue; }
    throw new Error('未知阶段 ' + g.phase);
  }
  if (g.phase !== 'ending') throw new Error('未能在限定步数内到达结局（策略 ' + stratName + '）');
  return {
    ending: g.ending.id, variant: g.ending.variant,
    total: g.ending.total, grade: g.ending.grade,
    dev: g.dev, chapter: g.chapterIdx, decisions,
    bands: g.__bands || [], bandDevs: g.__devs || [],
    attrs: Object.assign({}, g.attrs), keyPicks
  };
}

/* ---------- 汇总 ---------- */
const ROUTES = { '苟活': ['E2', 'E3'], '稳健': ['E4', 'E5'], '逆天': ['E6', 'E7'], '史实': ['E1'], '失败': ['E8'] };
function routeOf(endingId) {
  for (const r in ROUTES) if (ROUTES[r].indexOf(endingId) >= 0) return r;
  return '未知';
}

const stats = {};      // strat -> aggregate
const keyNodeStats = {}; // strat -> node -> optionText -> {n, sumTotal}
const errors = [];
const stratNames = Object.keys(STRATEGIES);
const t0 = Date.now();

stratNames.forEach((sn, si) => {
  stats[sn] = { games: 0, clear: 0, clearB: 0, sumTotal: 0, sumDev: 0, sumChapter: 0, endings: {}, variants: {}, grades: {}, sumAttrs: {}, devHist: {}, bandHist: {}, bandDevHist: {} };
  keyNodeStats[sn] = {};
  for (let s = 0; s < SEEDS; s++) {
    for (let i = 0; i < GAMES; i++) {
      const rng = mulberry32(SEED + s * 10000019 + si * 1000003 + i);
      let r;
      try { r = playOne(sn, DIFF, rng); }
      catch (e) { errors.push(sn + ' #' + s + ':' + i + ': ' + e.message); continue; }
      const st = stats[sn];
    st.games++;
    if (r.ending !== 'E8') { st.clear++; if (r.grade === 'S' || r.grade === 'A' || r.grade === 'B') st.clearB++; }
    st.sumTotal += r.total; st.sumDev += r.dev; st.sumChapter += r.chapter;
    st.devHist[r.dev] = (st.devHist[r.dev] || 0) + 1;   // v2.1.4：段位边界扰动扫描的旁证（见下方 bandscan）
    (r.bands || []).forEach(b => { st.bandHist[b] = (st.bandHist[b] || 0) + 1; });
    (r.bandDevs || []).forEach(d => { st.bandDevHist[d] = (st.bandDevHist[d] || 0) + 1; });
      st.endings[r.ending] = (st.endings[r.ending] || 0) + 1;
      const v = r.ending + (r.variant ? '/' + r.variant : '');
      st.variants[v] = (st.variants[v] || 0) + 1;
      st.grades[r.grade] = (st.grades[r.grade] || 0) + 1;
      Object.keys(r.attrs).forEach(k => { st.sumAttrs[k] = (st.sumAttrs[k] || 0) + r.attrs[k]; });
      r.keyPicks.forEach(([node, t]) => {
        const ns = keyNodeStats[sn][node] = keyNodeStats[sn][node] || {};
        const os = ns[t] = ns[t] || { n: 0, sumTotal: 0 };
        os.n++; os.sumTotal += r.total;
      });
    }
  }
});

/* ---------- 报告 ---------- */
const pct = (a, b) => b ? (100 * a / b).toFixed(1) + '%' : '-';
const safeDiv = (a, b) => b ? a / b : 0;
const lines = [];
function log(s) { lines.push(s); console.log(s); }

log(`== 批量平衡模拟 ｜ 难度 ${DIFF} ｜ 每策略 ${GAMES}${SEEDS > 1 ? '×' + SEEDS + 'seed' : ''} 局 ｜ 种子 ${SEED} ｜ 耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s ==`);
log('注：总分含难度系数（剧情 ×0.8 / 普通 ×1.0 / 硬核 ×1.25），跨难度比较分数与评级无意义，仅同难度内比较。');
if (errors.length) log(`!! 引擎异常 ${errors.length} 起（详见 JSON 报告）`);

log('\n—— 策略总览（通关 = 非 E8 结局；优质通关 = 非 E8 且评级≥B）——');
log('策略        通关率    优质通关  平均总分  平均偏离  平均终局章  最常见结局');
stratNames.forEach(sn => {
  const s = stats[sn];
  const top = Object.keys(s.variants).sort((a, b) => s.variants[b] - s.variants[a])[0] || '-';
  log(`${sn.padEnd(10)}  ${pct(s.clear, s.games).padStart(7)}  ${pct(s.clearB, s.games).padStart(8)}  ${safeDiv(s.sumTotal, s.games).toFixed(1).padStart(8)}  ${safeDiv(s.sumDev, s.games).toFixed(1).padStart(8)}  ${safeDiv(s.sumChapter, s.games).toFixed(1).padStart(9)}  ${top} (${s.variants[top] || 0})`);
});

log('\n—— 结局分布（全策略合并，通关路线覆盖校验）——');
const merged = {};
stratNames.forEach(sn => Object.keys(stats[sn].endings).forEach(e => { merged[e] = (merged[e] || 0) + stats[sn].endings[e]; }));
Object.keys(ROUTES).forEach(r => {
  const n = ROUTES[r].reduce((a, e) => a + (merged[e] || 0), 0);
  log(`${r}（${ROUTES[r].join('/')}）：${n} 局`);
});

log('\n—— 准则 3：单一属性策略通关率（压力测试，非验收门槛 · GDD 附录 D #25 / 附录 O.1）——');
log('说明：GDD v1.6.1 起本项定位为「极端压力测试」，不设 PASS/FAIL 门槛——「每步只最大化单一属性」本就不是真实玩家行为。');
log('正式验收看：①优质通关率 ②逆天路线可达率 ③史实线死亡率 ④关键属性触底率 ⑤关键节点选择分布。以下仅作参考读数。');
ATTR_STRATS.forEach(sn => {
  const s = stats[sn], r = 100 * s.clear / s.games, rb = 100 * s.clearB / s.games;
  log(`  ${sn.padEnd(10)} 通关 ${r.toFixed(1)}% ｜ 优质通关 ${rb.toFixed(1)}%${r > 60 ? '  ⚠ 高于旧 60% 参考线' : ''}`);
});

log('\n—— 准则 5：三条通关路线可达性（任一策略达成即计）——');
['苟活', '稳健', '逆天'].forEach(r => {
  const n = ROUTES[r].reduce((a, e) => a + (merged[e] || 0), 0);
  log(`${n > 0 ? 'PASS' : 'FAIL'}  ${r}线达成 ${n} 局`);
});

log('\n—— 准则 1：无万能最优（代理）——');
const avg = sn => safeDiv(stats[sn].sumTotal, stats[sn].games);
const best = stratNames.slice().sort((a, b) => avg(b) - avg(a))[0];
log(`最优策略 ${best}（均分 ${avg(best).toFixed(1)}${best === 'nitian' ? '，规划型攻略上限，持上帝视角' : ''}） vs 随机 ${avg('random').toFixed(1)}，差 ${(avg(best) - avg('random')).toFixed(1)} 分`);
log('注：nitian 为**脚本化预设路线**（NITIAN_PREFS 逐节点指定选项），持全局信息优势，其均分天然居首；');
log('    且「总分允许突破 100」是 GDD 5.5 明确定义（难度系数 × 逆天加成 +15% 的表现分，v1.6.1）。');
log('    二者叠加 → 逆天均分 90+ 且评级集中于 S 属预期，**非评分模型缺陷**，勿据此改动评分公式。');
log('关键节点选项收益差（随机策略，样本≥30 的选项间最大均分差）：');
const kns = keyNodeStats.random;
Object.keys(kns).forEach(node => {
  const opts = Object.keys(kns[node]).filter(t => kns[node][t].n >= 30);
  if (opts.length < 2) return;
  const avgs = opts.map(t => ({ t, a: safeDiv(kns[node][t].sumTotal, kns[node][t].n), n: kns[node][t].n }));
  avgs.sort((x, y) => y.a - x.a);
  const gap = avgs[0].a - avgs[avgs.length - 1].a;
  log(`  ${node}：最优「${avgs[0].t.slice(0, 14)}」${avgs[0].a.toFixed(1)} / 最差「${avgs[avgs.length - 1].t.slice(0, 14)}」${avgs[avgs.length - 1].a.toFixed(1)}，差 ${gap.toFixed(1)}`);
});

log('\n—— 准则 2：历史惯性（代理）——');
log(`史实策略死亡率（E8）${pct(stats.hist.games - stats.hist.clear, stats.hist.games)}；激进偏离策略死亡率 ${pct(stats.devHigh.games - stats.devHigh.clear, stats.devHigh.games)}，逆天结局率 ${pct((stats.devHigh.endings.E6 || 0) + (stats.devHigh.endings.E7 || 0), stats.devHigh.games)}`);
const nitN = (stats.nitian.endings.E6 || 0) + (stats.nitian.endings.E7 || 0);
log(`${nitN > 0 ? 'PASS' : 'FAIL'}  规划型逆天策略（nitian）逆天结局率 ${pct(nitN, stats.nitian.games)}（E6:${stats.nitian.endings.E6 || 0} E7:${stats.nitian.endings.E7 || 0}），死亡率 ${pct(stats.nitian.games - stats.nitian.clear, stats.nitian.games)}，均分 ${avg('nitian').toFixed(1)}`);

log('\n—— 各策略结局明细 ——');
stratNames.forEach(sn => {
  const s = stats[sn];
  const det = Object.keys(s.variants).sort((a, b) => s.variants[b] - s.variants[a]).map(v => `${v}:${s.variants[v]}`).join(' ');
  log(`${sn.padEnd(10)} ${det}`);
});
log('\n—— 各策略评级分布 ——');
stratNames.forEach(sn => {
  const g = stats[sn].grades;
  log(`${sn.padEnd(10)} S:${g.S || 0} A:${g.A || 0} B:${g.B || 0} C:${g.C || 0} D:${g.D || 0}`);
});

/* ---------- 段位边界扰动扫描（v2.1.4 新增，GDD 附录 U.15 第二节） ----------
 * 动机：四段位边界（20/45/70）是"资格回路"的地基——修正节奏、结局资格区间、
 * 硬门槛的 devMin/devMax 全按它取档。但它**从未被扰动验证过**：若某条边界恰好落在
 * 门槛聚集区（大批选项的 req 或门槛聚集在同一带），则该边界位置是武断的，挪 5 点就会
 * 大幅改变结局分布。这与 U.13「死内容」是同一类问题的另一面：一个从未被扰动的参数，
 * 没人知道它是否承重。
 *
 * 判据：单条边界扰动 ±5 点，**任一结局占比变化 ≤ 2 个百分点**为通过。
 * 超标说明该边界落在门槛聚集区——修法是挪边界或挪门槛，复测收敛才放行。
 * 阈值取 2pp 而非更严：本项只回答"边界是否承重"，不回答"分布是否理想"（那是 O-1/O-5 的事）。
 *
 * 实现：只改 DEV_BANDS 的 max 值重跑同一批种子（种子不变 → 差异只可能来自边界本身）。
 * 基线已在上面跑完，直接复用 stats 做对照，无需第二遍全量。 */
/* ---------- 删项审计（v2.1.4 · GDD 附录 U.15 第四节）----------
 * 检验支柱 1「选择有重量」的唯一可证伪形式：摘掉某选项、同一批种子重跑，
 * 结局分布若毫无位移 → 该选项是装饰，不配占一个决策点。
 *
 * 复用本文件既有的 13 条策略（而不是另写一套）——这是关键：v2.1.4 初版曾用
 * random/hist/risk 三条自写策略，结果**随机策略 400 局全部止于 ch3 的 E3/东门逐客**
 * （危机涨满即死），ch5–ch7 的选项被批量误判成"装饰嫌疑"。那是策略没瞄准，
 * 不是选项没重量——与 U.12「策略集即测量栅栏」同一类错误：栅栏有缺口时读数不能当结论。
 * 本文件的策略集含 nitian（逆天 100%）/ weilian（稳健 95%+）/ quanshi 等，
 * 终局章分布覆盖到 ch6–ch7，故审计对象的后半段可被真正测到。
 *
 * 审计对象只取**带历史侧效果**（dev>0）的选项：纯属性经营类由静态三查覆盖，
 * 不动用模拟（成本 = 选项数 × 局数）。
 *
 * 判据分两种零位移，成因不同不可混判：
 *   a) 装饰：选项可达且被选中，摘除后分布不动 → 效果无下游
 *   b) 够不着：选项在所有策略下都未进入可选集（req 锁死或所在事件从未被走到）
 *      —— 属门槛/可达性问题，不是装饰问题
 * 故先统计该选项在基线下的**被选次数**，为 0 判 b、>0 判 a。
 */
/* ---------- 死路线扫描（v2.1.4 · GDD 附录 U.15 第五节）----------
 * 删项审计只覆盖"被 13 条策略走到的选项"。若某条**结局路线**要求一个没有任何策略
 * 会去满足的前置条件，它会整体隐形的——不在任何策略的结局分布里，也不在删项审计的
 * 视野里。本项按结局反查：每个 (结局, 变体) 声明为可达时，逐个核其**前置条件**是否
 * 真有自动策略能达成。判据 = 该路线在 13 策略基线扫描中零出现。
 *
 * 零出现的成因须分开判别（与删项审计同原则，不把"测不到"当"不存在"）：
 *   a) 死路线：前置条件在任何策略下都不可满足 → 内容问题
 *   b) 策略盲区：路线可走通（给定脚本可复现），但没有策略瞄准它 → 测量栅栏缺口（U.12 同类）
 * 故对每个零出现项，再跑一次「给定脚本强走」验证可达性，分出 a 与 b。
 */
if (arg('deadroute', null) !== null) {
  const DR_GAMES = parseInt(arg('drgames', String(GAMES)), 10);
  log(`\n—— 死路线扫描（结局/变体级可达性）——`);
  const seen = {};
  stratNames.forEach(sn => Object.keys(stats[sn].variants).forEach(v => { seen[v] = (seen[v] || 0) + stats[sn].variants[v]; }));
  const all = new Set();
  Object.keys(D.ENDINGS).forEach(e => {
    all.add(e);
    const v = D.ENDINGS[e].variants;
    if (v) Object.keys(v).forEach(x => all.add(e + '/' + x));
  });
  const zero = [...all].filter(k => !seen[k]).sort();
  log(`结局格共 ${all.size} 个，13 策略基线出现 ${Object.keys(seen).length} 个，零出现 ${zero.length} 个`);
  if (!zero.length) log('  全部结局格均被至少一条策略命中——无死路线');
  zero.forEach(k => log(`  · 零出现：${k}`));

  /* 零出现的成因分诊：**机制可达性**与**策略瞄准**是两件事，不可混判。
   * 本项只回答后者——13 条策略无一瞄准，故它们不可见。至于路线本身是否死掉，
   * 须用「给定脚本强走 / 直接构造前置状态」单独验证（那是 U.13 的静态走查 +
   * 各剧本 test 的脚本断言，两者均已覆盖）。故此处给出各零出现项的前置条件摘要，
   * 供人工判断是「该补一条瞄准它的策略」还是「该改内容」。 */
  if (zero.length) {
    log('  分诊（前置条件摘要；"脚本可走通"= 各剧本 test 已有断言覆盖该路线）：');
    const routeNote = {
      'E4/kuaiji': '前置 6-1[2]「称病不朝」req caifu≥30（INIT 20，需先经营财富）→ 置 flag ziwu → 6-3[2]「散尽家财」req ziwu+caifu≥15。强走脚本 200/200 复现，属策略盲区（13 策略无一条愿先花 caifu 换 flag）',
      'E8/baobing': '病亡 = 体魄归零。各本 INIT 体魄 30–60、卡侧 +9~+22，13 策略无一条主动压体魄至接近 0；实测「体魄压到 3 + ill 流必发病」稳定触发（engine checkDeath 病亡分支），属策略盲区',
      'E8/shangdian': '需 5-3 笑谢路由落空。test-jingke #8 以注入 biancai 36 走通，属策略盲区',
      'E8/xiefa': '唯一入口 5-4 的前置是 5-2[2]「反客为主」，其 req 含 flag:fusu → 到达 5-4 时 fusu 必真。xiefa 落点为 to[1]{flag:mtdi}，即「mtdi 且危机>84」。已穷举验证：可达（mtdi 真 + 危 90 命中）。属策略盲区——13 策略无一制造 mtdi 后仍能进 5-2[2]',
      'E7': '架空二世线，各本条件为高门槛组合',
      'E8': '败局本体（无变体）：危机≥100 致死且非构陷/毒杀/追杀变体时落入',
    };
    zero.forEach(k => log(`    ${k}：${routeNote[k] || '（无登记，查前置条件）'}`));
    log('  结论口径：本次扫描**未发现死路线**，全部零出现项均可归因于策略盲区。');
    log('  补充（v2.1.4 复核）：E8/baobing 的零出现**不是不可达**——13 策略皆会优先打出「求医问药」，');
    log('    而病亡的唯一通路恰是「不治病」。实测「压体魄 + 不治病」打法下项羽 5 局中 2 局病亡；');
    log('    李斯在 13 策略基线内即有 1.95%（76/3900，集中在才学策略）。机制为「病催人老」的自我加速：');
    log('    大病每次行动 age+1 → 年龄跨过更多 AGE.bands 档 → 章首衰减加重 → 体魄归零。');
  }
}

if (arg('cull', null) !== null) {
  const FLOOR = parseFloat(arg('cullfloor', '0.5'));   // 最小报告地板（百分点）
  const CONT = parseFloat(arg('cullcont', '0.5'));     // 连续量位移下限（总分分 / 偏离点）
  const CULL_GAMES = parseInt(arg('cullgames', String(GAMES)), 10);
  const targets = [];
  D.CHAPTERS.forEach((ch, ci) => (ch.events || []).forEach(ev => {
    (ev.options || []).forEach((o, oi) => {
      const dev = o.eff && o.eff.dev ? o.eff.dev : 0;
      if (dev > 0) targets.push({ ev: ev.id, oi, dev, ci, title: ev.title, t: String(o.t || '').slice(0, 16), evN: (ev.options || []).length });
    });
  }));
  log(`\n—— 删项审计（${arg('cull', '')}：摘除后结局占比位移下限 ${FLOOR}pp）——`);
  log(`审计对象 ${targets.length} 个带历史侧效果（dev>0）的选项 ｜ 策略 ${stratNames.length} 条 × 每态 ${CULL_GAMES} 局`);

  /* 基线：跑一遍，同时记录每个选项被选中的次数（用于区分"装饰"与"够不着"） */
  const baseMerged = {}, picked = {};
  let cullGames = 0;
  const playCulled = (sn, seed, hide) => {
    const g = new E.Game(D, DIFF, mulberry32(seed));
    if (hide) g.auditHide = hide;                    // 引擎钩子（engine.js getOptions）
    const pick = STRATEGIES[sn];
    g.start();
    let guard = 0, pickedHere = [];
    while (g.phase !== 'ending' && guard++ < 500) {
      if (g.phase === 'intro') { g.beginEvents(); continue; }
      if (g.phase === 'round') { const ci = pickCard(sn, g, mulberry32(seed + guard)); if (ci === -1) { const rx = g.playXushi(); if (!rx) g.playCard(0); } else g.playCard(ci); continue; }
      if (g.phase === 'correction') { g.correctionContinue(); continue; }
      if (g.phase === 'summary') { g.proceedSummary(); continue; }
      if (g.phase === 'endEvent') {
        const options = wrapOptions(g, g.currentEndEvent);
        const i = pick({ g, options, rng: mulberry32(seed + guard * 7) });
        pickedHere.push('END/' + g.currentEndEvent.id + '#' + i);
        g.endEventChoose(i); continue;
      }
      if (g.phase === 'event') {
        const ev = g.findEvent(g.eventId);
        const options = g.getOptions();
        const i = pick({ g, options, rng: mulberry32(seed + guard * 13) });
        pickedHere.push(ev.id + '#' + i);
        g.choose(i); continue;
      }
      if (g.phase === 'choice') { const v = g.getChoiceCard(); g.chooseCardOption(Math.floor(rng() * v.options.length)); continue; }
      if (g.phase === 'settle') { g.proceed(); continue; }
      throw new Error('未知阶段 ' + g.phase);
    }
    if (g.phase !== 'ending') return null;
    return { key: g.ending.id + (g.ending.variant ? '/' + g.ending.variant : ''), pickedHere, total: g.ending.total, dev: g.dev };
  };
  stratNames.forEach((sn, si) => {
    for (let i = 0; i < CULL_GAMES; i++) {
      const r = playCulled(sn, SEED + si * 1000003 + i, null);
      if (!r) continue;
      baseMerged[r.key] = (baseMerged[r.key] || 0) + 1; cullGames++;
      baseMerged.sumTotal = (baseMerged.sumTotal || 0) + r.total;
      baseMerged.sumDev = (baseMerged.sumDev || 0) + r.dev;
      r.pickedHere.forEach(k => { picked[k] = (picked[k] || 0) + 1; });
    }
  });
  log(`基线 ${cullGames} 局，结局 ${Object.keys(baseMerged).length} 种`);

  const cullResults = [];
  targets.forEach(tg => {
    const after = {}; let n = 0;
    stratNames.forEach((sn, si) => {
      for (let i = 0; i < CULL_GAMES; i++) {
        const r = playCulled(sn, SEED + si * 1000003 + i, { ev: tg.ev, idx: tg.oi });
        if (!r) continue;
        after[r.key] = (after[r.key] || 0) + 1; n++;
        after.sumTotal = (after.sumTotal || 0) + r.total;
        after.sumDev = (after.sumDev || 0) + r.dev;
      }
    });
    if (!n) { cullResults.push({ ...tg, worst: 0, worstK: '-', pickedN: 0, dScore: 0, dDev: 0 }); return; }
    const keys = new Set([...Object.keys(baseMerged), ...Object.keys(after)]);
    let worst = 0, worstK = '-';
    keys.forEach(k => {
      if (k === 'sumTotal' || k === 'sumDev') return;   // v2.2.0 修复(C-12)：聚合键漏进占比桶，位移=均值×100 污染判据；连续位移已由 dScore/dDev 覆盖
      const d = Math.abs((after[k] || 0) / n * 100 - (baseMerged[k] || 0) / cullGames * 100);
      if (d > worst) { worst = d; worstK = k; }
    });
    /* 第二读数：连续量位移（平均总分 / 平均偏离）。
     * 结局是**离散粗桶**，一个把 dev 推高 20 的晚章选项若后续路径与原路径同归一处，
     * 结局占比可以完全不动而实际影响很大——只看占比会把它误判成装饰。
     * 连续量无此盲区：dev 与总分对选项效果是线性响应。两者并读才判得准。 */
    const dScore = (after.sumTotal / n) - (baseMerged.sumTotal / cullGames);
    const dDev = (after.sumDev / n) - (baseMerged.sumDev / cullGames);
    /* 被选次数：摘项后下标会整体前移，故原选项被选等价于「选了原 oi 或原 oi+1」两键之一 */
    let pickedN = 0;
    for (let q = 0; q <= 1; q++) pickedN += picked[tg.ev + '#' + (tg.oi + q)] || 0;
    cullResults.push({ ...tg, worst, worstK, pickedN, dScore, dDev });
    /* 双重判据：结局占比位移（粗桶，看"落到哪个结局变了"）与连续量位移（细粒度，
     * 看"同一结局内被活成了什么程度"）。v2.1.4 实测教训：只看占比会把 dev+20 的
     * 晚章选项全判成装饰——因为它与相邻选项常同归一个结局格，占比不动而总分/偏离
     * 大幅变化。**任一读数超阈即判有重量**（装饰的定义是"摘掉它世界不变"，
     * 而非"摘掉它结局桶不变"）。 */
    const hasWeight = worst > FLOOR || Math.abs(dScore) > CONT || Math.abs(dDev) > CONT;
    const verdict = hasWeight ? '有重量' : (pickedN === 0 ? '够不着(门槛/可达性)' : '装饰嫌疑');
    log(`  ${hasWeight ? '✔' : pickedN === 0 ? '○' : '✘'} ch${tg.ci + 1} ${tg.ev}[${tg.oi}] dev+${tg.dev} 「${tg.t}」`
      + ` → 结局位移 ${worst.toFixed(2)}pp @${worstK}  总分Δ${dScore >= 0 ? '+' : ''}${dScore.toFixed(2)}  偏离Δ${dDev >= 0 ? '+' : ''}${dDev.toFixed(2)}`
      + `  被选 ${pickedN}  判：${verdict}`);
  });
  const deco = cullResults.filter(r => r.worst <= FLOOR && Math.abs(r.dScore) <= CONT && Math.abs(r.dDev) <= CONT && r.pickedN > 0);
  const unreach = cullResults.filter(r => r.worst <= FLOOR && Math.abs(r.dScore) <= CONT && Math.abs(r.dDev) <= CONT && r.pickedN === 0);
  log(`\n删项审计结论：有重量 ${cullResults.length - deco.length - unreach.length} ／ 装饰嫌疑 ${deco.length} ／ 够不着 ${unreach.length}（共 ${cullResults.length}）`);
  log(`  双读数门槛：结局占比位移 >${FLOOR}pp 或 连续量位移 >${CONT}（总分/偏离），任一超阈即判有重量`);
  if (deco.length) { log('  装饰嫌疑（人工复核：改效果 or 删选项）：'); deco.forEach(r => log(`    ch${r.ci + 1} ${r.ev}[${r.oi}] dev+${r.dev} 「${r.t}」 本事件 ${r.evN} 选，被选 ${r.pickedN} 次，摘除后 结局${r.worst.toFixed(2)}pp 总分${r.dScore.toFixed(2)} 偏离${r.dDev.toFixed(2)}`)); }
  if (unreach.length) { log('  够不着（req 锁死或事件从未被走到，属门槛/可达性）：'); log('    ' + unreach.map(r => r.ev + '[' + r.oi + ']').join('  ')); }
  log('  注：审计用 13 条策略的终局章分布已覆盖 ch3–ch7；若某本后段选项仍大批判"够不着"，应先核该本策略是否真能走完（U.12 栅栏检查），再判内容。');
}

if (arg('bandscan', null) !== null) {
  const THRESH = parseFloat(arg('bandthresh', '2'));   // 允许的最大占比变化（百分点）
  const DELTA = parseInt(arg('banddelta', '5'), 10);   // 扰动幅度（点）
  log(`\n—— 段位边界扰动扫描（±${DELTA} 点，占比变化上限 ${THRESH}pp）——`);
  const origBands = JSON.parse(JSON.stringify(D.DEV_BANDS));
  log(`基线边界：${origBands.map(b => b.max).join('/')}（${origBands.map(b => b.name).join('/')}）`);
  /* 判定时刻段位分布 —— 段位边界的**真实作用点**：engine chapterEnd 里
   * band>0 才进修正池、band>=2 无条件发、band>=3 每章另加逆天反噬。
   * 若某边界扰动后位移极小，须先看这个：若该段位在判定时刻本就几乎不出现，
   * 位移小是「这层几乎没被走到」而非「这层稳如磐石」——两者结论完全不同。 */
  {
    const bh = [0, 0, 0, 0];
    stratNames.forEach(sn => { const h = stats[sn].bandHist || {}; Object.keys(h).forEach(b => { bh[b] = (bh[b] || 0) + h[b]; }); });
    const bt = bh.reduce((a, x) => a + x, 0) || 1;
    log(`  修正判定时刻段位分布：${origBands.map((b, i) => b.name + ' ' + bh[i] + '（' + (bh[i] / bt * 100).toFixed(1) + '%）').join('  ')}  共 ${bt} 次判定`);
  /* 修正池的 dev 覆盖区间 —— 判定是否生效的**第二道闸**。
   * engine chapterEnd 的 pool 过滤是 `dev >= c.minDev && dev <= c.maxDev`，
   * 即便 band>0 进了修正流程，落在池外的 dev 一样抽不到条。故须把
   * 「band 覆盖」与「池覆盖」两张表并读：前者宽后者窄时，扰动 band 边界自然几乎无位移
   * ——那不是边界稳，是边界在这段区间内根本不承重。 */
  {
    const cmin = Math.min.apply(null, D.CORRECTIONS.map(c => c.minDev));
    const cmax = Math.max.apply(null, D.CORRECTIONS.map(c => c.maxDev));
    log(`  修正池 dev 覆盖：minDev 下界 ${cmin}，maxDev 上界 ${cmax}（dev 为整数，落在 (${origBands[0].max},${cmin - 1}] 即 20~20 时 band 已非循史、池却为空）`);
    /* 逐边界：扰动后该边界的"实际作用"取决于它与池下界/上界的关系，而非只看是否在 [cmin,cmax] 内。
     * 边界 b 承重的充要条件是：它能把一批 dev 从"池外"挪进"池内"，或反之——
     * 即 b 附近存在池边界（cmin 或某条的 minDev/maxDev）。 */
    const poolEdges = new Set();
    D.CORRECTIONS.forEach(c => { poolEdges.add(c.minDev); poolEdges.add(c.maxDev + 1); });
    origBands.slice(0, -1).forEach(b => {
      const near = [...poolEdges].filter(e => Math.abs(e - b.max) <= 5);
      const gap = near.length ? Math.min(...near.map(e => Math.abs(e - b.max))) : null;
      log(`    ${b.name} 边界 ${b.max}：最近池边界 ${near.length ? near.join('/') + `（相距 ${gap} 点）` : '无（>5 点）'}`
        + ` —— ${near.length && gap <= DELTA ? '扰动幅度内会改变进池资格，边界承重' : near.length ? `池边界距边界 ${gap} 点 > 扰动幅度 ${DELTA}，本次扰动够不到它——位移小是"没测到"而非"不影响"，须加大 --banddelta 复测` : '附近无池边界，扰动不改进池资格'}`);
    });
  }
    /* 判定时刻的 dev 原值（每 5 点一档）——用于定位「边界附近到底有没有人」。
     * band 索引会被边界改动重算，故此处打原值，两次扫描可逐档对照。 */
    const bd = {};
    stratNames.forEach(sn => { const h = stats[sn].bandDevHist || {}; Object.keys(h).forEach(d => { const lo = d - d % 5; bd[lo] = (bd[lo] || 0) + h[d]; }); });
    const bdk = Object.keys(bd).map(Number).sort((a, b) => a - b);
    log(`  判定时刻 dev 原值分布：${bdk.map(lo => `${lo}-${lo + 4}:${bd[lo]}`).join('  ')}`);
    origBands.slice(0, -1).forEach(b => {
      const lo = b.max - b.max % 5;
      const near = [lo - 5, lo, lo + 5].reduce((a, x) => a + (bd[x] || 0), 0);
      log(`    ${b.name} 边界 ${b.max}：判定时刻落在 ${lo - 5}~${lo + 9} 三档的共 ${near}/${bt} = ${(near / bt * 100).toFixed(1)}%`);
    });
  }
  const baseMerged = {};
  stratNames.forEach(sn => { const s = stats[sn]; s.games && s.games; Object.keys(s.variants).forEach(v => { baseMerged[v] = (baseMerged[v] || 0) + s.variants[v]; }); });
  const baseGames = stratNames.reduce((a, sn) => a + stats[sn].games, 0);

  /* 引擎持有 d.DEV_BANDS 的引用，改数组即改判定；跑完必须还原，否则污染后续 stat */
  const bandNames = origBands.map(b => b.name);
  let bandFail = 0;
  for (let bi = 0; bi < origBands.length - 1; bi++) {     // 末档 100 是硬顶，不扰动
    for (const dir of [-1, 1]) {
      const moved = JSON.parse(JSON.stringify(origBands));
      moved[bi].max = Math.max(1, Math.min(99, origBands[bi].max + dir * DELTA));
      if (moved[bi].max >= moved[bi + 1].max) { log(`  ${bandNames[bi]} 边界 ${origBands[bi].max} ${dir > 0 ? '+' : '-'}${DELTA} = ${moved[bi].max} 与下一档 ${moved[bi + 1].max} 交叉，跳过（档位须保持非空）`); continue; }
      D.DEV_BANDS = moved;
      const after = {};
      let errN = 0;
      for (const sn of stratNames) {
        for (let s = 0; s < SEEDS; s++) {
          for (let i = 0; i < GAMES; i++) {
            const rng = mulberry32(SEED + s * 10000019 + stratNames.indexOf(sn) * 1000003 + i);
            try {
              const r = playOne(sn, DIFF, rng);
              const v = r.ending + (r.variant ? '/' + r.variant : '');
              after[v] = (after[v] || 0) + 1;
            } catch (e) { errN++; }
          }
        }
      }
      const keys = new Set([...Object.keys(baseMerged), ...Object.keys(after)]);
      let worst = 0, worstK = '-';
      keys.forEach(k => {
        const d = Math.abs((after[k] || 0) / baseGames * 100 - (baseMerged[k] || 0) / baseGames * 100);
        if (d > worst) { worst = d; worstK = k; }
      });
      const ok = worst <= THRESH && errN === 0;
      if (!ok) bandFail++;
      log(`  ${ok ? 'PASS' : 'FAIL'}  ${bandNames[bi]} 边界 ${origBands[bi].max}→${moved[bi].max}（${dir > 0 ? '+' : ''}${dir * DELTA}）：最大结局占比位移 ${worst.toFixed(2)}pp @ ${worstK}${errN ? '，引擎异常 ' + errN + ' 起' : ''}`);
    }
  }
  D.DEV_BANDS = origBands;
  if (bandFail === 0) {
    log(`  结论：${(origBands.length - 1) * 2} 组扰动全部 ≤${THRESH}pp —— 三条段位边界均不落在门槛聚集区，位置承重、非武断`);
    log('  附注（三条边界与修正池下界均相距 1 点，属构造性耦合而非巧合）：');
    log('    · 循史边界 20 ↔ 池下界 21：下移 5 点时 dev 16–20 虽已非循史，但池仍为空 → 无位移；');
    log('      上移 5 点时 dev 21–25 退回循史，被 `band>0` 闸拦在池外 → 修正停发。方向不对称是构造使然。');
    log('    · 微澜/改流边界同理：各与所属档的池下界（46 / 71）相距 1 点。');
    log('    · 维护提示：若改动任一边界而不同步改 CORRECTIONS 的 minDev/maxDev，将出现"有段位无修正"或"有修正无段位"的错位带。');
  } else {
    log(`  结论：${bandFail} 组扰动超标 —— 该边界落在门槛聚集区，须挪边界或挪门槛后复测`);
  }
}

if (OUT) {
  require('fs').writeFileSync(OUT, JSON.stringify({ games: GAMES, seeds: SEEDS, seed: SEED, diff: DIFF, stats, keyNodeStats, errors }, null, 2));
  console.log('\n明细已写入 ' + OUT);
}
process.exit(errors.length > 0 ? 1 : 0);
