/* UI 契约测试（v1.6.8）：跨剧本的引擎侧契约——防 UI 改版回归。
 * 覆盖：硬核掷骰标题不泄露数字、回溯清蓄势/险招烧毁、分享卡标题按剧本数据驱动、
 *       全剧本 ACHIEVEMENTS 含 shiwodai（v1.5 被动关键卡后常态触发，缺条目会渲染 undefined）。
 * 运行：node test-ui-contract.js */
const E = require('./engine.js');
const FILES = { lisi: './game-data.js', jingke: './jingke-data.js', hanxin: './hanxin-data.js', xiangyu: './xiangyu-data.js', chensheng: './chensheng-data.js' };
const rngHigh = () => 0.99;
/* 可复现 PRNG（与引擎 mulberry32 同款）：用于统计类契约的确定性抽样 */
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

let pass = 0, fail = 0;
/* 显式停用的契约段数：不算通过也不算失败,但会在结果行里报出来,
 * 免得「停用」和「悄悄删掉了」在输出上长得一样(见第 8 段成就图标契约)。 */
let skipped = 0;

/* 1. 掷骰标题契约（全剧本 × 双难度）：普通含点数/成功率；硬核无数字、无百分号、只显档位词 */
{
  const digits = /\d|%/;
  Object.keys(FILES).forEach(k => {
    const D = require(FILES[k]);
    const fake = { risk: { rate: 50, roll: 31, success: true, unmet: [] } };
    const tN = new E.Game(D, 'normal', rngHigh).riskTitle(fake);
    const tH = new E.Game(D, 'hardcore', rngHigh).riskTitle(fake);
    if (/\d/.test(tN) && !digits.test(tH) && tH.indexOf('成算') >= 0) pass++;
    else { fail++; console.log('✘ [' + k + '] 掷骰标题契约：normal=' + tN + ' hardcore=' + tH); }
  });
  console.log('✔ 掷骰标题契约：5 剧本 × 双难度（普通含数字 / 硬核只显档位词）');
}

/* 2. 回溯契约（全剧本）：蓄势与险招烧毁不随回溯穿越 */
{
  Object.keys(FILES).forEach(k => {
    const D = require(FILES[k]);
    const g = new E.Game(D, 'normal', rngHigh);
    g.randomOn = false; g.start(); g.beginEvents();
    g.playXushi();
    g._burned[g._burnKey(0)] = true;   // 模拟上一条时间线的险招烧毁
    g.backtrack();
    if (g.xushi === false && Object.keys(g._burned).length === 0) pass++;
    else { fail++; console.log('✘ [' + k + '] 回溯穿越：xushi=' + g.xushi + ' burned=' + Object.keys(g._burned).length); }
  });
  console.log('✔ 回溯契约：5 剧本 backtrack 后 xushi=false、_burned 清空');
}

/* 3. 分享卡标题契约（全剧本）：SCENARIO.name 驱动，格式「主角「局名」」，不得写死 */
{
  Object.keys(FILES).forEach(k => {
    const D = require(FILES[k]);
    const sc = D.SCENARIO;
    const title = '青史志 · ' + String(sc.name || '').replace(' · ', '「') + '」';
    const ok = title.indexOf('「') > 0 && title.indexOf('」') === title.length - 1 && title.indexOf(sc.protag) >= 0;
    if (ok && (k !== 'lisi' ? title.indexOf('李斯') < 0 : title.indexOf('李斯「仓鼠之局」') >= 0)) pass++;
    else { fail++; console.log('✘ [' + k + '] 分享卡标题：' + title); }
  });
  console.log('✔ 分享卡标题契约：5 剧本各自正确（无李斯硬编码）');
}

/* 4. 成就契约（全剧本）：ACHIEVEMENTS 含 shiwodai（被动关键卡后常态解锁，缺条目渲染 undefined） */
{
  Object.keys(FILES).forEach(k => {
    const D = require(FILES[k]);
    if (D.ACHIEVEMENTS && D.ACHIEVEMENTS.shiwodai) pass++;
    else { fail++; console.log('✘ [' + k + '] ACHIEVEMENTS 缺 shiwodai'); }
  });
  console.log('✔ 成就契约：5 剧本 ACHIEVEMENTS 均含「时不我待」');
}

/* 5. 版本同步契约：js/ui-core.js 的 APP_VERSION 必须与 package.json version 一致（防首页版本号再次漂移） */
{
  const fs = require('fs');
  const pkg = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
  const core = fs.readFileSync('./js/ui-core.js', 'utf8');
  const m = core.match(/APP_VERSION = '([^']+)'/);
  if (m && m[1] === pkg.version) { pass++; console.log('✔ 版本同步契约：APP_VERSION ' + m[1] + ' = package.json ' + pkg.version); }
  else { fail++; console.log('✘ 版本漂移：APP_VERSION=' + (m && m[1]) + ' package.json=' + pkg.version); }
}

/* 6. 成就引用契约（全剧本）：数据层所有 ach 引用必须存在于 ACHIEVEMENTS（防"幽灵成就"：引用能跑、渲染 undefined + 破图） */
{
  const ghosts = [];
  function collectAchRefs(D, out) {
    function scanEff(eff, where) {
      if (!eff || !eff.ach) return;
      if (typeof eff.ach === 'string') out.push([eff.ach, where]);
      else if (eff.ach.id) out.push([eff.ach.id, where]);
    }
    (D.CHAPTERS || []).forEach(function (ch) {
      if (ch.achOnEnter) out.push([ch.achOnEnter, 'chapter.achOnEnter']);
      (ch.events || []).forEach(function (ev) {
        (ev.options || []).forEach(function (o) { scanEff(o.eff, 'event ' + ev.id); });
      });
      (ch.endEvents || []).forEach(function (ev) {
        (ev.options || []).forEach(function (o) { scanEff(o.eff, 'endEvent ' + ev.id); });
      });
    });
    (D.RANDOM_EVENTS || []).forEach(function (ev) {
      (ev.options || []).forEach(function (o) { scanEff(o.eff, 'random ' + ev.id); });
    });
    var ce = D.CRISIS_EVENTS || {};
    (ce.plots || []).concat(ce.death ? [ce.death] : [], ce.qingsuan ? [ce.qingsuan] : []).forEach(function (ev) {
      (ev.options || []).forEach(function (o) { scanEff(o.eff, 'crisis ' + ev.id); });
    });
    (D.ACTIONS || []).forEach(function (a) { scanEff(a.eff, 'action ' + a.id); });
    Object.keys(D.ENDINGS || {}).forEach(function (id) {
      var e = D.ENDINGS[id];
      (e.ach || []).forEach(function (a) { out.push([a, 'ending ' + id]); });
      Object.keys(e.variantAch || {}).forEach(function (v) {
        e.variantAch[v].forEach(function (a) { out.push([a, 'ending ' + id + '/' + v]); });
      });
    });
  }
  Object.keys(FILES).forEach(k => {
    const D = require(FILES[k]);
    const refs = [];
    collectAchRefs(D, refs);
    const bad = refs.filter(r => !(D.ACHIEVEMENTS && D.ACHIEVEMENTS[r[0]]));
    if (bad.length === 0 && refs.length > 0) pass++;
    else { fail++; bad.forEach(r => console.log('✘ [' + k + '] 幽灵成就引用：' + r[0] + '（' + r[1] + '）')); if (refs.length === 0) console.log('✘ [' + k + '] 未扫描到任何 ach 引用（扫描器失效？）'); }
  });
  console.log('✔ 成就引用契约：5 剧本全部 ach 引用均有 ACHIEVEMENTS 条目');
}

/* 7. 回溯次数存档契约（全剧本）：普通难度回溯 1 次后，导出/导入存档仍不可再回溯（防跨会话刷新"每章 1 次"规则） */
{
  Object.keys(FILES).forEach(k => {
    const D = require(FILES[k]);
    const g = new E.Game(D, 'normal', rngHigh);
    g.randomOn = false; g.start(); g.beginEvents();
    const bt = g.backtrack();
    const locked = g.canBacktrack() === false;
    const sv = g.exportSave();
    const g2 = new E.Game(D, 'normal', rngHigh);
    const ok = sv && g2.importSave(JSON.parse(JSON.stringify(sv))) && g2.canBacktrack() === false && g2.backtracksThisChapter === 1;
    if (bt && locked && ok) pass++;
    else { fail++; console.log('✘ [' + k + '] 回溯次数存档契约：bt=' + bt + ' locked=' + locked + ' 恢复后 canBacktrack=' + g2.canBacktrack() + ' count=' + g2.backtracksThisChapter); }
  });
  console.log('✔ 回溯次数存档契约：5 剧本回溯后导出/导入，次数不重置');
}

/* 7b. 存档健壮性契约：localStorage 是不可信输入——backtracksThisChapter 非法值（字符串/负数/小数/超配额）拒收，脏 attrs/dev 拒收；合法档正常导入 */
{
  const D = require(FILES.lisi);
  const g0 = new E.Game(D, 'normal', rngHigh);
  g0.randomOn = false; g0.start(); g0.beginEvents(); g0.backtrack();
  const sv = JSON.parse(JSON.stringify(g0.exportSave()));
  let okAll = true;
  ['oops', -1, 1.5, 99].forEach(v => {  // 字符串 / 负数 / 小数 / 超配额（普通难度每章 1 次）
    const g2 = new E.Game(D, 'normal', rngHigh);
    const dirty = JSON.parse(JSON.stringify(sv)); dirty.backtracksThisChapter = v;
    if (g2.importSave(dirty) !== false) okAll = false;
  });
  // 脏 attrs / dev
  const d1 = JSON.parse(JSON.stringify(sv)); d1.snapshot.attrs.quanshi = 'oops';
  const d2 = JSON.parse(JSON.stringify(sv)); d2.snapshot.dev = -5;
  const gA = new E.Game(D, 'normal', rngHigh), gB = new E.Game(D, 'normal', rngHigh);
  if (gA.importSave(d1) !== false || gB.importSave(d2) !== false) okAll = false;
  const g3 = new E.Game(D, 'normal', rngHigh);
  const okValid = g3.importSave(JSON.parse(JSON.stringify(sv))) === true && g3.backtracksThisChapter === 1;
  if (okAll && okValid) pass++;
  else { fail++; console.log('✘ 存档健壮性契约失败：okAll=' + okAll + ' okValid=' + okValid); }
  console.log('✔ 存档健壮性契约：非法 backtracksThisChapter/attrs/dev 拒收，合法档正常导入');
}

/* 8. 成就图标契约 —— 已整体停用（2026-10-13，用户决定：成就功能无限期不做）。
 *
 * 原契约：ACHIEVEMENTS 每个 id 必须有 assets/ach/ach_<id>.png（防"数据有、图没有"）。
 * 现状：H5 版的美术管线不接成就图标，`assets/ach/` 整类未入库
 *       （git log --all -- assets/ach 命中 0 条，从未提交过）。
 *       引擎侧的 ACHIEVEMENTS 数据与解锁逻辑保持原样、未做任何改动——
 *       停用的只是「图标必须入库」这一条资产校验，以及 H5 不渲染任何成就 UI。
 *
 * 为什么是整段停用而不是逐项豁免：
 *   原来的 EXEMPT 是为「美术批次未交付的个别项」设计的逐项清单。
 *   而这里是整类资产缺席（60 张一张都没有），把 60 个 id 全塞进豁免表
 *   会让这条契约永久变绿，把「成就功能未接入」这个真实状态掩盖掉，
 *   也违背原注释里"交付后从豁免中移除"的自我约束。
 *   改成显式停用 + 说明，是让它在测试输出里一直可见，而不是被藏起来。
 *
 * 恢复条件：决定做成就功能时，把图标接进 h5/tools/build-assets.py 并落到
 *           assets/ach/，再把下面这段换回逐项豁免的校验即可。
 */
{
  skipped++;
  console.log('⊘ 成就图标契约：已停用（成就功能无限期不做；60 张图标未入库，H5 不渲染成就 UI）');
}

/* 9. 成就保留契约（全剧本 · v1.6.8 P1-2）：importSave 不得截断跨会话累计成就。
 * 复现：UI 侧 newGame() 先把 localStorage 累计成就灌入 game.ach，再 importSave 覆盖 → 成就丢失且写回后不可逆。 */
{
  Object.keys(FILES).forEach(k => {
    const D = require(FILES[k]);
    const g = new E.Game(D, 'normal', rngHigh);
    g.randomOn = false; g.start(); g.beginEvents();
    const inSnap = Object.keys(D.ACHIEVEMENTS)[0];
    g.unlockAch(inSnap);                                  // 快照内已解锁的一枚
    const sv = JSON.parse(JSON.stringify(g.exportSave()));
    const g2 = new E.Game(D, 'normal', rngHigh);
    const extra = Object.keys(D.ACHIEVEMENTS).find(a => sv.snapshot.ach.indexOf(a) < 0);  // 跨局累计、快照外
    g2.ach = [extra];                                     // 模拟 newGame() 灌入 localStorage 累计成就
    const ok = g2.importSave(sv) && g2.ach.indexOf(extra) >= 0 && g2.ach.indexOf(inSnap) >= 0;
    if (ok) pass++;
    else { fail++; console.log('✘ [' + k + '] 读档丢成就：extra=' + extra + ' ach=' + JSON.stringify(g2.ach)); }
  });
  console.log('✔ 成就保留契约：5 剧本 importSave 后成就为「快照 ∪ 已有」，不截断');
}

/* 9b. 脏 ach 拒收（v1.6.8 P1-2 配套）：ach 为字符串/对象/数字时 importSave 返回 false，不得因遍历抛错 */
{
  const D = require(FILES.lisi);
  const g0 = new E.Game(D, 'normal', rngHigh);
  g0.randomOn = false; g0.start(); g0.beginEvents();
  const sv = JSON.parse(JSON.stringify(g0.exportSave()));
  let ok = true;
  ['oops', { a: 1 }, 42].forEach(v => {
    const g = new E.Game(D, 'normal', rngHigh);
    const dirty = JSON.parse(JSON.stringify(sv)); dirty.snapshot.ach = v;
    if (g.importSave(dirty) !== false) ok = false;
  });
  if (ok) pass++; else { fail++; console.log('✘ 脏 ach 未拒收'); }
  console.log('✔ 脏 ach 拒收：字符串/对象/数字三种脏值均返回 false');
}

/* 10. 逆天反噬确定性契约（v1.6.8 P1-3 · 全剧本）：偏离≥71 入逆天段后，本章必遇一次反噬。
 * 修复前复用 randomChance(0.4) 作概率闸门：rng 恒高（0.999 > 0.4）时永不触发，与 GDD 附录 D #7「每章一次」不符。
 * 注：反噬仍受 randomOn 门控（与际遇共用入口，randomOn 为测试开关，正式对局恒为 true），故此处保持 randomOn 默认。 */
{
  Object.keys(FILES).forEach(k => {
    const D = require(FILES[k]);
    const g = new E.Game(D, 'normal', () => 0.999);   // rng 恒高＝旧实现下永不触发
    g.start(); g.beginEvents();
    g.dev = 90;                                        // 置于逆天段
    let fired = false;
    for (let i = 0; i < 8 && !fired; i++) {
      if (g.currentRandom && g.currentRandom.id === 'BACKLASH') { fired = true; break; }
      if (g.phase === 'round') { g.maybeRandom(); continue; }
      if (g.phase === 'event') {
        const opts = g.getOptions(); const i2 = opts.findIndex(x => !x.locked);
        if (i2 < 0) break;
        g.choose(i2); continue;
      }
      break;
    }
    if (fired) pass++;
    else { fail++; console.log('✘ [' + k + '] 逆天反噬未确定性触发（rng=0.999 时仍应触发）'); }
  });
  console.log('✔ 逆天反噬契约：5 剧本偏离≥71 时每章必遇一次（不随概率闸门）');
}

/* 11. 蓄势作用域契约（v1.6.8 P1-1 · 引擎侧）：蓄势只兑现「事件抉择」——
 * playCard 险招掷骰须用原始 rate（UI 已同步为不显示加成），且 playCard 不消耗蓄势。
 * 此用例锁死引擎语义防回归。 */
{
  const D = require(FILES.lisi);
  let n = 0;
  const dealRng = () => { n++; return (n * 0.137) % 1; };   // 变动发牌流，便于抽到软门槛卡（ACT-22 req caixue≥45）
  const g = new E.Game(D, 'normal', dealRng, { risk: () => 0.29 });
  g.randomOn = false; g.start();
  g.chapterIdx = 2; g.attrs.caixue = 0; g.attrs.caifu = 50;   // 才学压低 → 修书吕门成险招卡
  let base = null, idx = -1;
  for (let r = 0; r < 80 && idx < 0; r++) {
    g.beginRounds();
    const o = g.getOffer();
    idx = o.findIndex(e => e.type === 'action' && e.risky);
    if (idx >= 0) base = o[idx].risky.rate;
    g.actionUses = {};
  }
  if (idx < 0) { fail++; console.log('✘ 李斯第三章未抽到险招行动卡，蓄势作用域用例无法构造'); }
  else {
    g.xushi = true;
    const r = g.playCard(idx);
    if (r && r.risk && r.risk.rate === base && g.xushi === true) pass++;
    else { fail++; console.log('✘ 蓄势作用域：playCard rate=' + (r && r.risk ? r.risk.rate : '?') + '（应=原始 ' + base + '），xushi=' + g.xushi + '（应仍为 true，蓄势不被行动卡消耗）'); }
  }
  console.log('✔ 蓄势作用域契约：playCard 险招不含蓄势加成、不消耗蓄势（仅 choose 兑现 +10 并清空）');
}

/* 12. 功业计分契约（全剧本 · v1.6.8）：每个剧本必须显式声明 MERIT_MAP，
 * 且所有 eff.merit / ch.enter.merit 授予的功业名都在表内——否则 engine.js 的
 * `meritMap[m] || 8` 兜底会静默按 8 分计（历史上 lisi 即依赖该兜底，数值恰好全中但跨剧本不对称）。 */
{
  const collectMerits = (D) => {
    const out = new Set();
    const walk = (v) => {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object') {
        if (typeof v.merit === 'string') out.add(v.merit);
        Object.values(v).forEach(walk);
      }
    };
    walk(D.CHAPTERS); walk(D.RANDOM_EVENTS); walk(D.CORRECTIONS);
    return [...out];
  };
  Object.keys(FILES).forEach(k => {
    const D = require(FILES[k]);
    const merits = collectMerits(D);
    const unscored = merits.filter(m => !(D.MERIT_MAP && m in D.MERIT_MAP));
    if (D.MERIT_MAP && unscored.length === 0) pass++;
    else { fail++; console.log('✘ [' + k + '] MERIT_MAP 缺失或未覆盖功业：' + (D.MERIT_MAP ? unscored.join('、') : '(未声明 MERIT_MAP) 全部=' + merits.join('、'))); }
  });
  console.log('✔ 功业计分契约：5 剧本均显式声明 MERIT_MAP 且覆盖全部已授予功业');
}

/* 13. 百科词条可达性契约（全剧本 · v1.6.8）：GLOSSARY 每个词条都必须在叙事/结算文本中
 * 有 ⟦词条⟧ 标记，否则图鉴「已收录 x/N」永远无法满（此前有 10 条死条目）。 */
{
  const collectText = (D) => {
    let t = '';
    const walk = (v) => {
      if (typeof v === 'string') t += v;
      else if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object') Object.values(v).forEach(walk);
    };
    walk(D.CHAPTERS); walk(D.RANDOM_EVENTS); walk(D.CORRECTIONS); walk(D.ACTIONS); walk(D.ENDINGS);
    return t;
  };
  Object.keys(FILES).forEach(k => {
    const D = require(FILES[k]);
    const text = collectText(D);
    const dead = Object.keys(D.GLOSSARY || {}).filter(t => text.indexOf('\u27e6' + t + '\u27e7') < 0);
    if (dead.length === 0) pass++;
    else { fail++; console.log('✘ [' + k + '] 死词条（无 ⟦⟧ 标记，图鉴不可收录）：' + dead.join('、')); }
  });
  console.log('✔ 百科可达性契约：5 剧本 GLOSSARY 全部有 ⟦词条⟧ 标记');
}

/* 14. 硬核卡面文案契约（全剧本 · v2.0.3 P0-5）：硬核难度下行动卡说明不得出现数字。
 * 此前 ui-round.js 直接渲染 a.desc（引擎现造的治病卡文案也拼了「财富-N」），
 * 而 riskText 紧邻着做了硬核分支——属性面板/结算浮层/章末结算都藏好了，唯独最常见的一屏
 * 把门槛与花销摊开，硬核难度的信息保护在这里失效。 */
{
  const digits = /\d/;
  let leaks = [];
  Object.keys(FILES).forEach(k => {
    const D = require(FILES[k]);
    const h = new E.Game(D, 'hardcore', rngHigh);
    const n = new E.Game(D, 'normal', rngHigh);
    (D.ACTIONS || []).forEach(a => {
      if (!a.desc) return;
      if (digits.test(h.cardDesc(a.desc))) leaks.push(k + '/' + a.id);
      if (n.cardDesc(a.desc) !== a.desc) leaks.push(k + '/' + a.id + '(normal 未原样返回)');
    });
  });
  if (leaks.length === 0) pass++;
  else { fail++; console.log('✘ 硬核卡面文案泄露数字：' + leaks.join('、')); }
  // 治病卡文案（引擎现组）：硬核走 descHidden，无数字
  {
    const D = require(FILES.lisi);
    const h = new E.Game(D, 'hardcore', rngHigh);
    h.ill = { type: 'minor', left: 2 };
    h.offer = [{ type: 'action', id: '__cure__' }];
    const card = h.getOffer()[0];
    const shown = h.cardDesc(h.diff.hideAttrs && card.action.descHidden ? card.action.descHidden : card.action.desc);
    if (!digits.test(shown) && digits.test(card.action.desc)) pass++;
    else { fail++; console.log('✘ 硬核治病卡文案泄露：' + JSON.stringify(shown)); }
  }
  console.log('✔ 硬核卡面文案契约：全剧本行动卡与治病卡说明在硬核下均无数字，普通难度原样');
}

/* 15. 死锁防护契约（v2.0.4 P1）：三处曾使玩家零合法行动的路径——
 *  a) disableOpts() 后引擎返回 null → 页面按钮永不再启用（UI 侧改为 thawOpts，此处锁死引擎返回 null 的分支存在）；
 *  b) 关键事件全锁 + 行动池空：getOffer 的 key 项须带 enterable，playCard(key) 须收束本章而非进入全灰选项页；
 *  c) getOptions 空集时 _hasOpenOption 须为 false。 */
{
  const D = require(FILES.lisi);
  const g = new E.Game(D, 'normal', rngHigh);
  g.randomOn = false; g.start(); g.beginEvents();
  // b) 烧毁当前事件全部选项 + 清空行动池 → 关键卡须转为 enterable
  const opts = g.getOptions();
  opts.forEach((o, i) => { g._burned[g._burnKey(i)] = true; });
  g.offer = [{ type: 'key' }];
  const keyCard = g.getOffer()[0];
  const enterable = keyCard.type === 'key' && keyCard.enterable === true;
  // playCard(key) 不得进入 event 页（否则玩家面对全灰选项）
  const r = g.playCard(0);
  const notEvent = r && r.kind === 'key' && r.chapterEnd === true && g.phase === 'settle';
  if (enterable && notEvent) pass++;
  else { fail++; console.log('✘ 全锁事件死锁防护：enterable=' + enterable + ' kind=' + (r && r.kind) + ' chapterEnd=' + (r && r.chapterEnd) + ' phase=' + g.phase); }
  // c) 空选项集 → 无可选项
  const g2 = new E.Game(D, 'normal', rngHigh);
  g2.start(); g2.eventId = '9-9';
  if (g2.getOptions().length === 0 && g2._hasOpenOption() === false) pass++;
  else { fail++; console.log('✘ 空事件集判定异常'); }
  // 正常事件须判为有可选项（避免误伤）
  const g3 = new E.Game(D, 'normal', rngHigh);
  g3.randomOn = false; g3.start();
  if (g3._hasOpenOption() === true) pass++;
  else { fail++; console.log('✘ 正常事件被判为无可选项'); }
  console.log('✔ 死锁防护契约：全锁事件关键卡转可点并收束本章、空事件集判定正确、正常事件不受误伤');
}

/* 16. UI 解冻兜底契约（v2.0.4 P1 · 静态）：disableOpts() 后所有返回 null 的分支必须配 thawOpts()，
 * 否则选项区按钮永不再启用，玩家得到不可交互的死页。 */
{
  const fs = require('fs');
  const files = { 'js/ui-round.js': 2, 'js/ui-event.js': 2 };   // 期望：playCard/playXushi/choose/endEventChoose
  const bad = [];
  Object.keys(files).forEach(f => {
    const src = fs.readFileSync(f, 'utf8');
    // 形如 `if (!r) return;` 且该行未含 thawOpts —— 引擎 null 后静默退出
    src.split(/\r?\n/).forEach((ln, i) => {
      if (/if\s*\(\s*!\w+\s*\)\s*return\s*;/.test(ln) && ln.indexOf('thawOpts') < 0) {
        bad.push(f + ':' + (i + 1) + ' ' + ln.trim());
      }
    });
  });
  if (bad.length === 0) pass++;
  else { fail++; console.log('✘ 仍有「引擎返回 null 即静默退出」的分支：\n    ' + bad.join('\n    ')); }
  console.log('✔ UI 解冻兜底契约：引擎 null 返回一律配 thawOpts 解冻，无静默锁死分支');
}

/* 17. 成算档位词契约（v2.0.5）：可达 rate 集合 {15,20,25,30,40,50,60,70}（六档基础
 * + 蓄势 +10 + 史实升档）每一档都须有正确措辞。此前 engine.riskTitle 用 `>=` 阶梯，
 * 把 60 说成「五成」、25 说成「二成」——且只影响硬核，恰是看不到数字的那批玩家。
 * 口径：就近向下取档（rate 落在 [40,50) 说四成）。 */
{
  const EXPECT = { 15: '一成五', 20: '二成', 25: '二成', 30: '三成', 40: '四成', 50: '五成', 60: '五成', 70: '七成' };
  let bad = [];
  Object.keys(EXPECT).forEach(rate => {
    const w = E.riskWord(Number(rate));
    if (w !== EXPECT[rate]) bad.push(rate + '→' + w + '(应 ' + EXPECT[rate] + ')');
    // 引擎与 UI 须同源（ui-event.js 现直接用 E.riskWord）
    const g = new E.Game(require(FILES.lisi), 'hardcore', rngHigh);
    const t = g.riskTitle({ risk: { rate: Number(rate), roll: 1, success: true, unmet: [] } });
    if (t.indexOf(w) < 0) bad.push('riskTitle ' + rate + ' 未含「' + w + '」：' + t);
  });
  if (bad.length === 0) pass++;
  else { fail++; console.log('✘ 成算档位词错档：' + bad.join('、')); }
  // UI 侧不得再有第二份阶梯
  const fs = require('fs');
  const src = fs.readFileSync('js/ui-event.js', 'utf8');
  if (!/七成/.test(src) && !/function riskWord/.test(src)) pass++;
  else { fail++; console.log('✘ js/ui-event.js 仍自有成算阶梯（应改用 E.riskWord 单一实现）'); }
  console.log('✔ 成算档位词契约：8 档可达 rate 全部正确，UI/引擎同源单一实现');
}

/* 18. 险招烧毁按章隔离契约（v2.0.5）：际遇 chapters 跨多章（如李斯 R-5 跨 [2,5]），
 * 同一 id 在不同章是彼此无关的遭遇。此前 _burned 键只有 eventId:idx，跨章泄漏——
 * 第二章烧掉的选项到第五章仍显示「已试，事未谐」并锁死。 */
{
  const D = require(FILES.lisi);
  const g = new E.Game(D, 'normal', rngHigh);
  g.start();
  // 找一条跨章际遇，构造跨章泄漏场景
  const span = (D.RANDOM_EVENTS || []).filter(e => e.chapters[1] - e.chapters[0] >= 2);
  if (!span.length) { fail++; console.log('✘ 李斯本无跨章际遇，烧毁隔离用例无法构造'); }
  else {
    const ev = span[0];
    g.chapterIdx = ev.chapters[0]; g.eventId = ev.id; g.currentRandom = ev;
    g._burned[g._burnKey(0)] = true;
    const lockedInCh0 = g.getOptions()[0].locked === true;
    g.chapterIdx = ev.chapters[1];
    const lockedInChLast = g.getOptions()[0].locked === true;   // 另一章的同 id：不应被锁
    if (lockedInCh0 && !lockedInChLast) pass++;
    else { fail++; console.log('✘ 烧毁跨章泄漏：章' + ev.chapters[0] + ' locked=' + lockedInCh0 + ' 章' + ev.chapters[1] + ' locked=' + lockedInChLast); }
  }
  console.log('✔ 险招烧毁隔离契约：跨章际遇的烧毁只在本章生效');
}

/* 19. 回溯为真章首快照契约（v2.0.5）：此前 backtrack 不重建 chapterDeck/randomCount、
 * 不清 _skipRandom、不清 ending，introNotes 与 coef 不入快照 ——「回到本章开头」名不副实。 */
{
  const D = require(FILES.lisi);
  const g = new E.Game(D, 'normal', rngHigh);
  g.start(); g.enterChapter(1);
  const notesAtStart = (g.introNotes || []).slice();
  g.beginEvents();
  // 制造偏离章首的状态
  g.randomCount = 1;
  g.chapterDeck = g.chapterDeck.slice(1);       // 抽掉一张
  g._skipRandom = true;
  g.finishEnding('E1');                          // 造一个陈旧 ending
  g.phase = 'round';
  const deckStart = g._buildChapterDeck(g.chapterIdx).length;
  g.backtrack();
  const ok = g.randomCount === 0
    && g.chapterDeck.length === deckStart
    && g._skipRandom === false
    && g.ending === null
    && JSON.stringify(g.introNotes) === JSON.stringify(notesAtStart)
    && typeof g.coef === 'number';
  if (ok) pass++;
  else { fail++; console.log('✘ 回溯未回到章首：randomCount=' + g.randomCount + ' deck=' + g.chapterDeck.length + '/' + deckStart + ' skipRandom=' + g._skipRandom + ' ending=' + (g.ending && g.ending.id) + ' notes=' + JSON.stringify(g.introNotes) + ' coef=' + g.coef); }
  // 读档亦须带 introNotes 与 coef（旧档缺失时按空/1 兜底，不得崩）
  const g2 = new E.Game(D, 'normal', rngHigh);
  g2.randomOn = false; g2.start(); g2.enterChapter(1);
  g2.coef = 0.8;
  const sv = JSON.parse(JSON.stringify(g2.exportSave()));
  const g3 = new E.Game(D, 'normal', rngHigh);
  const notesKept = g3.importSave(sv) && (g3.introNotes || []).length === (g2.introNotes || []).length;
  // 旧档（v1 章首档，无 v/live 字段）缺 introNotes/coef 时按空/1 兜底，不得崩
  const old = JSON.parse(JSON.stringify(sv));
  delete old.v; delete old.live;   // 摘掉 v2 字段才是真的旧档形状
  delete old.snapshot.introNotes; delete old.snapshot.coef;
  const g4 = new E.Game(D, 'normal', rngHigh);
  const oldOk = g4.importSave(old) && Array.isArray(g4.introNotes) && g4.coef === 1;
  if (notesKept && oldOk) pass++;
  else { fail++; console.log('✘ 读档 introNotes/coef：notesKept=' + notesKept + ' oldOk=' + oldOk); }
  console.log('✔ 回溯章首快照契约：deck/randomCount/_skipRandom/ending/introNotes/coef 全部归位，旧档兼容');
}

/* 20. 终局不可撤销契约（v2.0.5）：结局页曾给出回溯入口，canBacktrack 对
 * phase==='ending' 仍返回 true —— 死亡/达成结局后可回到本章开头，
 * 而 renderIntro 的 saveGame 又把「已结束」的进度写回跨会话存档。 */
{
  const D = require(FILES.lisi);
  const g = new E.Game(D, 'normal', rngHigh);
  g.randomOn = false; g.start();
  g.finishEnding('E1');
  if (g.phase === 'ending' && g.canBacktrack() === false && g.backtrack() === false) pass++;
  else { fail++; console.log('✘ 终局仍可回溯：phase=' + g.phase + ' can=' + g.canBacktrack() + ' bt=' + g.backtrack()); }
  // 对局中回溯不受影响
  const g2 = new E.Game(D, 'normal', rngHigh);
  g2.randomOn = false; g2.start(); g2.beginEvents();
  if (g2.canBacktrack() === true) pass++;
  else { fail++; console.log('✘ 对局中回溯被误伤'); }
  // UI 结局页不得再挂回溯按钮
  const fs = require('fs');
  const src = fs.readFileSync('js/ui-ending.js', 'utf8');
  const body = src.slice(src.indexOf('function renderEnding'), src.indexOf('function drawRadar'));
  if (body.indexOf('backtrack') < 0) pass++;
  else { fail++; console.log('✘ 结局页仍有回溯入口'); }
  console.log('✔ 终局不可撤销契约：canBacktrack/backtrack 对 ending 拒收，对局中回溯不受影响，结局页无回溯按钮');
}

/* 21. 修正事件系数口径契约（v2.0.5）：危机增量只乘 wj 一次（附录 D #14 全口径），
 * corr 只缩放身外属性。此前章末修正先乘 corr 再由 applyEff 乘 wj（硬核 1.3×1.2），
 * 而逆天反噬路径不乘 corr —— 消费同源 CORRECTIONS 的两条路径相差一个 corr 因子。 */
{
  const c = { title: 'T', segs: [], eff: { attrs: { quanshi: -10, weiji: 10 } } };
  const hk = new E.Game(require(FILES.lisi), 'hardcore', rngHigh);
  const eff = hk.correctionEff(c);
  // 权势吃 corr（1.3 → -13），危机不乘 corr（保持 10，由 applyEff 的 wj 定档）
  if (eff.attrs.quanshi === -13 && eff.attrs.weiji === 10) pass++;
  else { fail++; console.log('✘ correctionEff 系数口径：quanshi=' + eff.attrs.quanshi + ' weiji=' + eff.attrs.weiji); }
  // applyEff 后危机为 10×wj=12（而非 10×corr×wj=16）
  const chg = hk.applyEff(eff);
  const wj = chg.find(x => x.k === 'weiji');
  if (wj && wj.delta === 12) pass++;
  else { fail++; console.log('✘ 修正危机仍双重缩放：delta=' + (wj && wj.delta)); }
  // 普通难度 corr=1：原样透传
  const nm = new E.Game(require(FILES.lisi), 'normal', rngHigh);
  if (nm.correctionEff(c).attrs.quanshi === -10) pass++;
  else { fail++; console.log('✘ 普通难度 correctionEff 未原样透传'); }
  console.log('✔ 修正系数口径契约：corr 只缩身外属性、危机由 wj 一次定档（硬核 10→12 而非 16）');
}

/* 22. 修正抽取按 chance 加权契约（v2.0.5）：此前「一次 roll 判是否触发 + 均匀抽」——
 * 是否触发实际取决于池内 max(chance)，而选哪条与 chance 无关。 */
{
  const D = require(FILES.lisi);
  const pool = (D.CORRECTIONS || []).filter(c => c.chance > 0);
  if (!pool.length) { fail++; console.log('✘ CORRECTIONS 无 chance>0 条目'); }
  else {
    // 直接以 mulberry32 驱动引擎的加权抽逻辑：注入 corr 流后跑章末修正，
    // 统计抽中的条目分布。此前实现对三条同 chance=0.3 的池均匀抽——分布与
    // chance 无关；加权实现应呈 chance/Σchance。
    const g = new E.Game(D, 'normal', mulberry32(20260805), { corr: mulberry32(4242) });
    const realCorr = D.CORRECTIONS;
    // 造一个 chance 分别为 0.6/0.3/0.1 的三段池，dev 落在共同区间
    D.CORRECTIONS = [
      { title: 'HI', segs: [], minDev: 21, maxDev: 45, chance: 0.6, eff: { attrs: { quanshi: -1 } } },
      { title: 'MID', segs: [], minDev: 21, maxDev: 45, chance: 0.3, eff: { attrs: { quanshi: -1 } } },
      { title: 'LO', segs: [], minDev: 21, maxDev: 45, chance: 0.1, eff: { attrs: { quanshi: -1 } } }
    ];
    const cnt = { HI: 0, MID: 0, LO: 0 };
    const N = 3000;
    for (let n = 0; n < N; n++) {
      const gg = new E.Game(D, 'normal', mulberry32(7000 + n), { corr: mulberry32(9000 + n) });
      gg.start(); gg.dev = 30; gg.attrs.quanshi = 50;   // dev∈[21,45] = 微澜段（band>0 且非强制触发段）
      gg.chapterEnd();
      if (gg.correction) cnt[gg.correction.title]++;
    }
    D.CORRECTIONS = realCorr;
        const fired = cnt.HI + cnt.MID + cnt.LO;
    const tot = 0.6 + 0.3 + 0.1;
    // 加权抽：池内边际概率 = chance/Σchance；再经各条 chance 触发闸
    const expHi = N * 0.6 * 0.6 / tot, expMid = N * 0.3 * 0.3 / tot, expLo = N * 0.1 * 0.1 / tot;
    const near = (a, b) => Math.abs(a - b) <= Math.max(40, b * 0.15);
    if (near(cnt.HI, expHi) && near(cnt.MID, expMid) && near(cnt.LO, expLo) && cnt.HI > cnt.MID && cnt.MID > cnt.LO) pass++;
    else { fail++; console.log('✘ 加权抽分布异常：HI=' + cnt.HI + '/' + expHi.toFixed(0) + ' MID=' + cnt.MID + '/' + expMid.toFixed(0) + ' LO=' + cnt.LO + '/' + expLo.toFixed(0)); }
  }
  console.log('✔ 修正抽取加权契约：按各自 chance 加权（实测高频档边际≈声明值）');
}

/* 23. 引擎内部一次性闸与剧本 flag 命名空间分离契约（v2.0.6）：
 * _gonggao/_jiyu/_caizhi/_shichong/_menke/_liuyan/_mingxuan/_wfsWarn/_tanmo_qs
 * 与 enterOnce 此前都写进 this.flags —— ①check() 认得这些键，
 * req:{flag:'_caizhi'} 会静默通过；②与剧本 flag 抢命名空间；
 * ③enterOnce 语义（副作用只一次）也被当作剧本 flag。 */
{
  const D = require(FILES.lisi);
  const g = new E.Game(D, 'normal', rngHigh);
  g.randomOn = false; g.start();
  // 触发全部内部闸：制造 高权势 + 高声望 + 高财富 + 低君心 + 低财富 的组合
  g.attrs.quanshi = 90; g.attrs.shengwang = 90; g.attrs.junxin = 10; g.attrs.caifu = 100;
  g.enterChapter(1);
  const onceKeys = Object.keys(g._once);
  const leaked = onceKeys.filter(k => k in g.flags);
  const flagKeys = Object.keys(g.flags);
  const internalInFlags = flagKeys.filter(k => k.charAt(0) === '_');
  // check() 不得因内部闸而通过剧本门槛
  const g2 = new E.Game(D, 'normal', rngHigh);
  g2.randomOn = false; g2.start(); g2.enterChapter(1);
  g2._once._caizhi = true; g2._once._menke = true;
  const spoof = g2.check({ flag: '_caizhi' });
  if (leaked.length === 0 && internalInFlags.length === 0 && onceKeys.length > 0 && spoof.ok === false) pass++;
  else { fail++; console.log('✘ 命名空间未分离：once=' + onceKeys.join(',') + ' flags含内部键=' + internalInFlags.join(',') + ' check({flag:_caizhi})=' + JSON.stringify(spoof)); }
  // 快照/存档随周期存读，且旧档（内部键混在 flags）迁移后不重复触发。
  // 注意快照是 enterChapter 时刻拍的，故闸必须由 enterChapter 自身触发才在快照里。
  const g3 = new E.Game(D, 'normal', rngHigh);
  g3.randomOn = false; g3.start();
  g3.attrs.shengwang = 90; g3.attrs.junxin = 10;   // 触发【功高震主】→ _once._gonggao
  g3.enterChapter(1);
  const sv = JSON.parse(JSON.stringify(g3.exportSave()));
  const g4 = new E.Game(D, 'normal', rngHigh);
  const kept = g4.importSave(sv) && g4._once._gonggao === true && !('_gonggao' in g4.flags);
  const legacy = JSON.parse(JSON.stringify(sv));
  legacy.snapshot.once = undefined;
  legacy.snapshot.flags._gonggao = true;   // v2.0.5 之前的存档形态
  const g5 = new E.Game(D, 'normal', rngHigh);
  const migrated = g5.importSave(legacy) && g5._once._gonggao === true && !('_gonggao' in g5.flags);
  if (kept && migrated) pass++;
  else { fail++; console.log('✘ 一次性闸存取：kept=' + kept + ' migrated=' + migrated); }
  console.log('✔ 命名空间分离契约：内部闸在 _once、check 不认、随快照存读、旧档迁移不重复触发');
}

/* 24. check() 未知键契约（v2.0.6）：此前无 else 分支——req:{caxue:50}（typo）返回
 * {ok:true}，把门槛 typo 变成永久解锁；checkRisk 更把同一未知键归入 hard 并报
 * hardOk:true，数据错误完全静默。另 zgMax 的 reason 原为 ''（falsy），
 * UI 的 if (c.reason) 不渲染 → 锁定原因空白。 */
{
  const D = require(FILES.lisi);
  const g = new E.Game(D, 'normal', rngHigh);
  const typo = g.check({ caxue: 50 });
  const typoRisk = g.checkRisk({ caxue: 50 }, true);
  const zg = g.check({ zgMax: 10 });
  if (typo.ok === false && /无法识别/.test(typo.reason || '') && typoRisk.hardOk === false && zg.ok === false && zg.reason) pass++;
  else { fail++; console.log('✘ 未知键/zgMax：typo=' + JSON.stringify(typo) + ' risk=' + JSON.stringify(typoRisk) + ' zgMax=' + JSON.stringify(zg)); }
  // 合法键不受影响（防过度拦截）
  const okKeys = g.check({ quanshiMax: 200, junxinMaxSeen: 0, minChapter: 0, caifu: 1 }) !== false;
  const r1 = g.check({ quanshiMax: 200 }), r2 = g.check({ junxinMaxSeen: 0 }), r3 = g.check({ caifu: 1 });
  if (r1.ok === true && r2.ok === true && r3.ok === true) pass++;
  else { fail++; console.log('✘ 合法键被误拦：' + JSON.stringify([r1, r2, r3])); }
  console.log('✔ 未知键契约：typo 按未达标拒收并给出原因，zgMax 锁定原因非空，合法键不受影响');
}

/* 25. 结算条目报实际生效值契约（v2.0.6）：applyEff 曾报请求值而非钳制后的实际值——
 * 权势 99 +10 报 +10（实际落 100，应读 +1）；且不跳过 0 变化条目。 */
{
  const D = require(FILES.lisi);
  const g = new E.Game(D, 'normal', rngHigh);
  g.start(); g.enterChapter(1);
  g.attrs.quanshi = 99;
  const chg = g.applyEff({ attrs: { quanshi: 10 } });
  const q = chg.find(c => c.k === 'quanshi');
  if (q && q.delta === 1 && g.attrs.quanshi === 100) pass++;
  else { fail++; console.log('✘ 触顶虚报：delta=' + (q && q.delta) + ' 实际=' + g.attrs.quanshi); }
  // 归零条目不列
  const g2 = new E.Game(D, 'normal', rngHigh);
  g2.start(); g2.enterChapter(1);
  g2.attrs.quanshi = 100;
  const chg2 = g2.applyEff({ attrs: { quanshi: 10 } });
  if (chg2.filter(c => c.k === 'quanshi').length === 0) pass++;
  else { fail++; console.log('✘ 归零条目仍被列出：' + JSON.stringify(chg2)); }
  // setAttrs 越界钳制 + peak 更新（此前裸赋值可写 250，且不更新 peak）
  const g3 = new E.Game(D, 'normal', rngHigh);
  g3.start(); g3.enterChapter(1);
  g3.attrs.quanshi = 10;
  g3._setAttrRaw('quanshi', 250);
  const capped = g3.attrs.quanshi === 100 && g3.peak.quanshi === 100;
  g3._setAttrRaw('quanshi', -20);
  const floored = g3.attrs.quanshi === 0;
  if (capped && floored) pass++;
  else { fail++; console.log('✘ 置值未钳制/未更新 peak：quanshi=' + g3.attrs.quanshi + ' peak=' + g3.peak.quanshi); }
  console.log('✔ 结算实际值契约：触顶报 +1、归零不列、setAttrs 钳制且同步 peak');
}

/* 26. 结局健壮性契约（v2.0.6）：finishEnding('E99') 曾直接崩在 def.variants；
 * 未知功业曾按 8 分兜底（可白拿 S 级）；脏状态曾让 total 变 NaN。 */
{
  const D = require(FILES.lisi);
  const g = new E.Game(D, 'normal', rngHigh);
  g.start();
  let threw = false;
  try { g.finishEnding('E99'); } catch (e) { threw = true; }
  if (!threw && g.ending && g.ending.id && isFinite(g.ending.total) && g.ending.zhuan) pass++;
  else { fail++; console.log('✘ 未知结局未兜底：threw=' + threw + ' ending=' + (g.ending && g.ending.id) + ' total=' + (g.ending && g.ending.total)); }
  // 未知功业不再按 8 分计
  const g2 = new E.Game(D, 'normal', rngHigh);
  g2.start(); g2.merits = ['不存在的功业'];
  g2.finishEnding('E1');
  const unknownPenalty = g2.ending.scores.gongye;
  const g3 = new E.Game(D, 'normal', rngHigh);
  g3.start(); g3.merits = [];
  g3.finishEnding('E1');
  if (unknownPenalty === g3.ending.scores.gongye) pass++;
  else { fail++; console.log('✘ 未知功业仍计分：' + unknownPenalty + ' vs 无功业 ' + g3.ending.scores.gongye); }
  // 脏状态不得产出 NaN
  const g4 = new E.Game(D, 'normal', rngHigh);
  g4.start(); g4.histScore = NaN; g4.peak = {}; g4.coef = NaN;
  g4.finishEnding('E1');
  if (isFinite(g4.ending.total) && g4.ending.grade) pass++;
  else { fail++; console.log('✘ 脏状态致 NaN：total=' + g4.ending.total + ' grade=' + g4.ending.grade); }
  console.log('✔ 结局健壮性契约：未知结局回落 E8、未知功业不计分、脏状态不产 NaN');
}

/* 27. 非致命难度危机封顶如实记账契约（v2.0.6）：checkDeath 把危机钳到 95 时，
 * 该回落此前不体现在章末 attrDelta（玩家看到一个未被告知的危机下降）。 */
{
  const D = require(FILES.lisi);
  const g = new E.Game(D, 'story', rngHigh);   // 剧情 = lethal:false，危机≥100 钳到 95 不致死
  g.randomOn = false; g.start(); g.enterChapter(1);
  const snapWj = g.snapshot.attrs.weiji;
  g.attrs.weiji = 100;
  g.checkDeath();
  const clamped = g.attrs.weiji === 95 && g._weijiClamp === 5;
  const r = g.makeSummary();
  const wd = r.summary.attrDelta.weiji;
  // 快照 weiji=snapWj，现值 95；其中 5 点回落来自封顶 → 差值应为 (95-snapWj)-5
  const expect = (95 - snapWj) - 5;
  if (clamped && wd === expect) pass++;
  else { fail++; console.log('✘ 封顶未如实记账：weiji=' + g.attrs.weiji + ' clamp=' + g._weijiClamp + ' attrDelta.weiji=' + wd + '（应 ' + expect + '）'); }
  // 致命难度不封顶
  const gh = new E.Game(D, 'hardcore', rngHigh);
  gh.randomOn = false; gh.start(); gh.enterChapter(1);
  gh.attrs.weiji = 100;
  const fatal = gh.checkDeath();
  if (fatal && fatal.type === 'ending') pass++;
  else { fail++; console.log('✘ 致命难度危机 100 未致死：' + JSON.stringify(fatal)); }
  console.log('✔ 危机封顶记账契约：非致命难度封顶如实并入章末差值，致命难度照常致死');
}

/* 28. 遭遇层常量外置契约（v2.0.7）：randomChance / randomMax / KEY_CARD_ROUNDS
 * 此前是引擎级硬编码，SPEC.md 声明「三难度数值口径在 DIFFICULTY」但遭遇密度
 * 实为全局固定——难度与剧本都调不了。现剧本可经 ENCOUNTER 覆写。 */
{
  const D = require(FILES.lisi);
  const g = new E.Game(D, 'normal', rngHigh);
  const def = g.randomChance === 0.4 && g.randomMax === 2 && g.keyCardRounds === E.KEY_CARD_ROUNDS;
  // 数据侧声明 ENCOUNTER 即生效（用副本避免污染模块缓存）
  const D2 = JSON.parse(JSON.stringify(D));
  D2.ENCOUNTER = { randomChance: 0.9, randomMax: 5, keyCardRounds: 1 };
  const g2 = new E.Game(D2, 'normal', rngHigh);
  const over = g2.randomChance === 0.9 && g2.randomMax === 5 && g2.keyCardRounds === 1;
  // 部分声明须逐键回落默认
  const D3 = JSON.parse(JSON.stringify(D));
  D3.ENCOUNTER = { randomMax: 7 };
  const g3 = new E.Game(D3, 'normal', rngHigh);
  const partial = g3.randomChance === 0.4 && g3.randomMax === 7 && g3.keyCardRounds === E.KEY_CARD_ROUNDS;
  // 全锁兜底复位到既定限时（此前写死 1，把「3 回合」契约静默降级为 2）
  const g4 = new E.Game(D, 'normal', rngHigh);
  g4.randomOn = false; g4.start(); g4.beginEvents();
  g4.getOptions().forEach((o, i) => { g4._burned[g4._burnKey(i)] = true; });
  g4.keyRoundsLeft = 1; g4._advanceRound({ forcedEnding: false, achNew: null });
  const restored = g4.keyRoundsLeft === g4.keyCardRounds;
  if (def && over && partial && restored) pass++;
  else { fail++; console.log('✘ 遭遇常量外置：默认=' + def + ' 覆写=' + over + ' 部分=' + partial + ' 兜底复位=' + restored + '（keyRoundsLeft=' + g4.keyRoundsLeft + '/' + g4.keyCardRounds + '）'); }
  console.log('✔ 遭遇常量契约：ENCOUNTER 可逐键覆写，默认值不变，全锁兜底复位到既定限时');
}

/* 29. 行动索引契约（v2.0.7）：getOffer 与 playCard 此前各自 forEach 全扫 ACTIONS
 * （每本 60+ 条，均在交互热路径上）。现建一次 id→行动 索引，两处共用。 */
{
  const D = require(FILES.lisi);
  const g = new E.Game(D, 'normal', rngHigh);
  g.start();
  const idx = g._actions;
  const allIndexed = (D.ACTIONS || []).every(a => idx[a.id] === a);
  const lookup = g._actionById(D.ACTIONS[0].id) === D.ACTIONS[0];
  const missing = g._actionById('不存在的行动') === null;
  if (allIndexed && lookup && missing) pass++;
  else { fail++; console.log('✘ 行动索引：allIndexed=' + allIndexed + ' lookup=' + lookup + ' missing=' + missing); }
  console.log('✔ 行动索引契约：全部行动入索引、按 id 直取、未知 id 返回 null');
}

/* 28. 评分口径契约（v2.1.0 · GDD 5.5）：权重 30/30/20/20（存续与功业各 30），
 * 且功业纳入政绩（权势×0.45 + 政绩×0.15 + 标记）。
 * 修订动因：十一维里只有权势可自由刷高，功业原由单一维度驱动；而存续是唯一编码
 * 结局性质的维度，25% 权重下苟活线 E2（存续 100）达不到 GDD 9.2 登记的基准 C。 */
{
  const D = require(FILES.lisi);
  const g = new E.Game(D, 'normal', rngHigh);
  g.start();
  // 固定状态 → 手算期望值，与引擎逐项比对（构造两个对照局：政绩有无）
  const mkState = (zj, q) => {
    const gg = new E.Game(D, 'normal', rngHigh);
    gg.start();
    gg.peak.quanshi = q;
    gg.attrs.zhengji = zj;
    gg.histScore = 0; gg.dev = 0; gg.merits = []; gg.coef = 1;
    gg.finishEnding('E1');   // E1 cuncun=20，逆天加成不适用，难度 coef=1
    return gg.ending;
  };
  const a = mkState(0, 100), b = mkState(100, 100);
  // 功业 = clamp(100×0.45 + zj×0.15 + 0)
  const gongyeOK = a.scores.gongye === 45 && b.scores.gongye === Math.min(100, 45 + 15);
  // 权重反推：raw = 0.30×gongye + 0.30×20 + 0.20×shiping + 0.20×yingxiang
  const ship = Math.max(35, a.scores.shiping);
  const expectA = Math.round(0.30 * 45 + 0.30 * 20 + 0.20 * ship + 0.20 * a.scores.yingxiang);
  const weightOK = a.total === expectA;
  if (gongyeOK && weightOK) pass++;
  else { fail++; console.log('✘ 评分口径：功业(无政绩)=' + a.scores.gongye + '(应45) 功业(政绩100)=' + b.scores.gongye + '(应60) total=' + a.total + '/期望' + expectA); }
  // 存续权重须真的生效：cuncun 100 的 E2 与 cuncun 10 的 E8 在同等其他条件下应拉开 27 分
  const flatEnd = id => {
    const gg = new E.Game(D, 'normal', rngHigh);
    gg.start();
    gg.peak.quanshi = 0; gg.attrs.zhengji = 0; gg.histScore = 0; gg.dev = 0;
    gg.merits = []; gg.coef = 1;
    gg.finishEnding(id);
    return gg.ending;
  };
  const e2 = flatEnd('E2'), e8 = flatEnd('E8');
  const gap = e2.total - e8.total;   // 存续差 90 × 0.30 = 27（其余四项同）
  if (gap === 27) pass++;
  else { fail++; console.log('✘ 存续权重未生效：E2=' + e2.total + ' E8=' + e8.total + ' 差 ' + gap + '（应 27 = 存续差 90 × 0.30）'); }
  // 评级档位表（甲/乙/丙各分上中下、丁兜底，共十级：95/90/85/80/70/60/50/40/30）：
  // 扫大量构造态，逐个核对 engine 给的 grade 与档位表一致
  const expectGrade = t => t >= 95 ? '甲上' : t >= 90 ? '甲' : t >= 85 ? '甲下'
    : t >= 80 ? '乙上' : t >= 70 ? '乙' : t >= 60 ? '乙下'
    : t >= 50 ? '丙上' : t >= 40 ? '丙' : t >= 30 ? '丙下'
    : '丁';
  let bad = [], seen = 0;
  for (const eid of Object.keys(D.ENDINGS)) {
    for (const q of [0, 30, 60, 100]) for (const zj of [0, 40, 100]) for (const dv of [0, 50, 100]) {
      const gg = new E.Game(D, 'normal', rngHigh); gg.start();
      gg.peak.quanshi = q; gg.attrs.zhengji = zj; gg.dev = dv; gg.histScore = 0;
      gg.merits = []; gg.coef = 1;
      gg.finishEnding(eid);
      seen++;
      if (gg.ending.grade !== expectGrade(gg.ending.total)) bad.push(eid + '@' + gg.ending.total + '→' + gg.ending.grade);
    }
  }
  if (bad.length === 0) pass++;
  else { fail++; console.log('✘ 评级分数线漂移（' + bad.length + '/' + seen + '）：' + bad.slice(0, 6).join(' ')); }
  console.log('✔ 评分口径契约：权重 30/30/20/20、功业=权势×0.45+政绩×0.15+标记、存续提权生效（E2−E8=27）、评级档位表一致');
}

console.log(`\n结果：${pass} 通过，${fail} 失败` + (skipped ? `，${skipped} 段停用` : ''));
process.exit(fail > 0 ? 1 : 0);
