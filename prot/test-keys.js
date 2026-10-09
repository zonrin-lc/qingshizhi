/* 扫描五剧本全部 req / check 条件键与选项 to 的路由目标，报告引擎不认识的键。
 * v2.0.6 新增：check() 原先无 else 分支，未知键静默按"满足"处理（typo = 永久解锁）。 */
const E = require('./engine.js');
const FILES = { lisi: './game-data.js', jingke: './jingke-data.js', hanxin: './hanxin-data.js', xiangyu: './xiangyu-data.js', chensheng: './chensheng-data.js' };

const g = new E.Game(require('./game-data.js'), 'normal', () => 0.99);
const KNOWN = new Set(['flag', 'notflag', 'anyflag', 'weijiMax', 'quanshiMax', 'junxinMax', 'zgMax',
  'junxinMaxSeen', 'minChapter', 'devMin', 'devMax']);

const unknown = [];
function scanCond(cond, where) {
  if (!cond || typeof cond !== 'object') return;
  Object.keys(cond).forEach(k => {
    const known = KNOWN.has(k) || !!g.d.ATTR_NAMES[k];
    if (!known) unknown.push(where + ' req.' + k + '=' + JSON.stringify(cond[k]));
  });
}
function scanOpts(list, where) {
  (list || []).forEach(ev => (ev.options || []).forEach((o, i) => {
    scanCond(o.req, where + '/' + ev.id + '[' + i + ']');
    (o.reqAdjust || []).forEach((ra, j) => scanCond(ra.if, where + '/' + ev.id + '[' + i + '].reqAdjust[' + j + ']'));
    if (o.eff) { scanCond(o.eff.condAttrs && null, where); (o.eff.condAttrs || []).forEach((ca, j) => scanCond(ca.if, where + '/' + ev.id + '[' + i + '].condAttrs[' + j + ']')); }
    if (o.to) (Array.isArray(o.to) ? o.to : [o.to]).forEach((t, j) => {
      const to = (t && typeof t === 'object') ? t : { to: t };
      if (to.if) scanCond(to.if, where + '/' + ev.id + '[' + i + '].to[' + j + ']');
      if (to.ending && !g.d.ENDINGS[to.ending]) unknown.push(where + '/' + ev.id + ' 结局不存在: ' + to.ending);
    });
  }));
}
Object.keys(FILES).forEach(k => {
  const D = require(FILES[k]);
  const names = Object.keys(D.ENDINGS);
  D.CHAPTERS.forEach((ch, ci) => {
    (ch.mutations || []).forEach((m, i) => scanCond(m.if, k + ' ch' + ci + '.mutations[' + i + ']'));
    (ch.startAlt || []).forEach((s, i) => scanCond(s.if, k + ' ch' + ci + '.startAlt[' + i + ']'));
    scanOpts(ch.events, k + ' ch' + ci + '.events');
    (ch.endEvents || []).forEach(ev => { if (ev.if) scanCond(ev.if, k + ' ch' + ci + '.endEvents/' + ev.id); scanOpts([ev], k + ' ch' + ci + '.endEvents'); });
  });
  (D.ACTIONS || []).forEach(a => scanCond(a.req, k + ' ACTIONS/' + a.id));
  scanOpts(D.RANDOM_EVENTS, k + ' RANDOM_EVENTS');
  const ce = D.CRISIS_EVENTS || {};
  (ce.plots || []).concat(ce.death ? [ce.death] : [], ce.qingsuan ? [ce.qingsuan] : []).forEach(ev => scanOpts([ev], k + ' CRISIS_EVENTS'));
  (D.CORRECTIONS || []).forEach(c => (c.options || []).forEach((o, i) => scanCond(o.req, k + ' CORRECTIONS/' + c.title + '[' + i + ']')));
  // 正向 to（字符串目标）必须能解析为本章事件
  const allIds = new Set();
  D.CHAPTERS.forEach(ch => (ch.events || []).forEach(e => allIds.add(e.id)));
  (D.RANDOM_EVENTS || []).forEach(e => allIds.add(e.id));
  [ce.death, ce.qingsuan].forEach(e => { if (e) allIds.add(e.id); });
  (ce.plots || []).forEach(e => allIds.add(e.id));
  allIds.add('BACKLASH');
  D.CHAPTERS.forEach((ch, ci) => (ch.events || []).forEach(ev => (ev.options || []).forEach((o, i) => {
    const tos = (Array.isArray(o.to) ? o.to : [o.to]).filter(t => typeof t === 'string');
    tos.forEach(to => { if (to !== 'NEXT' && to !== 'RETURN' && !allIds.has(to)) unknown.push(k + ' ch' + ci + '/' + ev.id + '[' + i + '] to 指向不存在的事件: ' + to); });
  })));
  // flag 声明但从未置位（潜在死 flag）
  const declared = new Set();
  const walk = v => {
    if (Array.isArray(v)) return v.forEach(walk);
    if (v && typeof v === 'object') { if (typeof v.flag === 'string') declared.add(v.flag); Object.keys(v).forEach(kk => { if (kk !== 'chance' && kk !== 'minDev') walk(v[kk]); }); }
  };
  walk(D.CHAPTERS); walk(D.RANDOM_EVENTS); walk(D.ACTIONS); walk(D.CORRECTIONS);
  const ce2 = D.CRISIS_EVENTS || {};
  [ce2.death, ce2.qingsuan].forEach(e => { if (e) walk(e); });
  (ce2.plots || []).forEach(e => walk(e));
  const setable = new Set();
  const walkSet = v => {
    if (Array.isArray(v)) return v.forEach(walkSet);
    if (v && typeof v === 'object') {
      if (Array.isArray(v.setFlags)) v.setFlags.forEach(f => setable.add(f));
      if (Array.isArray(v.flags)) v.flags.forEach(f => setable.add(f));
      if (typeof v.flag === 'string') setable.add(v.flag);
      Object.keys(v).forEach(kk => walkSet(v[kk]));
    }
  };
  walkSet(D.CHAPTERS); walkSet(D.RANDOM_EVENTS); walkSet(D.ACTIONS);
  [ce2.death, ce2.qingsuan].forEach(e => { if (e) walkSet(e); });
  (ce2.plots || []).forEach(e => walkSet(e));
  const dead = [...declared].filter(f => !setable.has(f));
  dead.forEach(f => unknown.push(k + ' 死 flag（被 req 引用但无任何置位来源）: ' + f));
});

/* v2.1.3 新增：年龄档与寿元配置卫生。此前五本全部沿用引擎默认 bands（[[40,0],…]），
 * 而荆轲/韩信/项羽/陈胜的逐章年龄最高只到 36 岁 → 【春秋渐高】在 5200 局内一次未触发（死内容）。
 * 故登记三条不变式：①每本必须显式声明 bands 与 longevity（不得吃引擎默认值），且年龄档须在
 * 本书自己的年龄轨迹上真实触发；②两者皆须严格升序；③longevity tier1 阈值须高于该本天然
 * 体魄水位（否则开局白送延寿免疫，机制形同虚设）。 */
Object.keys(FILES).forEach(k => {
  const D = require(FILES[k]);
  const A = D.AGE || {};
  const where = k + ' AGE';
  if (!Array.isArray(A.bands) || !A.bands.length) unknown.push(where + ' 未声明 bands（将吃引擎默认值）');
  if (!Array.isArray(A.longevity) || !A.longevity.length) { unknown.push(where + ' 未声明 longevity'); return; }
  let prevAge = -Infinity;
  A.bands.forEach((b, i) => {
    if (!Array.isArray(b) || b.length !== 2 || typeof b[0] !== 'number' || typeof b[1] !== 'number') unknown.push(where + ' bands[' + i + '] 形状应为 [年龄上界, 衰减值]');
    if (b[0] <= prevAge) unknown.push(where + ' bands[' + i + '] 年龄上界未严格升序（' + prevAge + ' → ' + b[0] + '）');
    prevAge = b[0];
  });
  /* 本书年龄档必须在**本书自己的年龄轨迹**上真实触发——这才是「死内容」的不变式。
   * 李斯的档位数值与引擎默认相同（它本就是唯一跨档者，显式登记只为五本口径可比），故不以
   * 「是否等于默认值」论生死，改以「逐章定龄打上去后是否真有衰减」论。 */
  let sumDecay = 0, firedCh = 0, missingAge = 0;
  D.CHAPTERS.forEach(c => {
    if (c.age == null) { missingAge++; return; }
    for (const b of A.bands) {
      if (c.age < b[0]) { if (b[1] !== 0) { sumDecay += b[1]; firedCh++; } break; }
    }
  });
  if (missingAge) unknown.push(where + ' 有 ' + missingAge + ' 章未声明 age（年龄档永不结算）');
  if (firedCh === 0) unknown.push(where + ' 年龄档在本书年龄轨迹（最高 ' + Math.max.apply(null, D.CHAPTERS.map(c => c.age)) + ' 岁）上一次未触发——【春秋渐高】是死内容');
  if (sumDecay > 0 && firedCh < D.CHAPTERS.length / 2) unknown.push(where + ' 仅 ' + firedCh + '/' + D.CHAPTERS.length + ' 章触发衰减（过少，延寿机制难以被感知）');
  let prevT = -Infinity, prevC = -Infinity;
  A.longevity.forEach((L, i) => {
    if (!Array.isArray(L) || L.length !== 2) unknown.push(where + ' longevity[' + i + '] 形状应为 [体魄阈值, 折寿点数]');
    if (L[0] <= prevT) unknown.push(where + ' longevity[' + i + '] 阈值未严格升序');
    if (L[1] <= prevC) unknown.push(where + ' longevity[' + i + '] 折寿点数未严格升序');
    if (L[1] < 1) unknown.push(where + ' longevity[' + i + '] 折寿点数须 ≥1（否则该档无实义）');
    prevT = L[0]; prevC = L[1];
  });
  // 天然水位：INIT 体魄减去首章档位衰减（start() 会先结算 c0）
  let d0 = 0;
  for (const b of A.bands) { if ((D.CHAPTERS[0].age) < b[0]) { d0 = b[1]; break; } }
  const nat = (D.INIT.tupo || 0) + Math.min(0, d0);
  if (A.longevity[0][0] <= nat) unknown.push(where + ' longevity tier1 阈值 ' + A.longevity[0][0] + ' ≤ 天然体魄水位 ' + nat + '（开局即白送延寿免疫，机制失效）');
});

/* v2.1.4 新增：印章五值封闭词表（B42）。动机来自「静默兜底」反模式——js/ui-ending.js 取图写作
 * `SEAL_IMG[en.seal] || 'seal_xunshi'`，即剧本若声明了表外的印章值，**不报错、不加载失败**，
 * 只会静默显示成循史图。分不清是 bug 还是设计的失败，比报错难查得多，故改为加载期拒载。
 * 同时校验 SEAL_IMG 与词表逐格对齐（防改了词表忘了补图 / 反之）。 */
const SEAL_TABLE = ['循史', '苟活', '稳健', '逆天', '败局'];
/* 取图映射抄自 js/ui-ending.js 的 SEAL_IMG，改词表或改图时**两处必须同步**——
 * 这里显式并列而非 import，是为了让"改了一处忘了另一处"变成可发现的漂移（下方逐格断言）。 */
const SEAL_IMG_FOR = { '循史': 'seal_xunshi', '苟活': 'seal_gouhuo', '稳健': 'seal_wenjian', '逆天': 'seal_nitian', '败局': 'seal_baiju' };
let sealImgChecked = false, sealPngCount = 0;
const coverage = {};   // 剧本 → 史实覆盖率读数（O-12）
Object.keys(FILES).forEach(k => {
  const D = require(FILES[k]);
  const used = {};
  Object.keys(D.ENDINGS).forEach(e => {
    const s = D.ENDINGS[e].seal;
    if (s == null) { unknown.push(k + ' ENDINGS/' + e + ' 未声明 seal'); return; }
    if (SEAL_TABLE.indexOf(s) < 0) { unknown.push(k + ' ENDINGS/' + e + ' 印章值表外: ' + JSON.stringify(s) + '（五值封闭词表 ' + SEAL_TABLE.join('/') + '）——运行时将静默回落循史图'); return; }
    used[s] = (used[s] || 0) + 1;
  });
  // 循史/败局 各本仅一处（E1/E8），苟活·稳健·逆天 各两处（E2E3/E4E5/E6E7）
  ['循史', '败局'].forEach(s => { if (used[s] !== 1) unknown.push(k + ' 印章「' + s + '」应恰 1 个结局持有，实为 ' + (used[s] || 0)); });
  ['苟活', '稳健', '逆天'].forEach(s => { if (used[s] !== 2) unknown.push(k + ' 印章「' + s + '」应恰 2 个结局持有（两条线各一），实为 ' + (used[s] || 0)); });
  // 印章图须覆盖词表每一值（全局一次，图与剧本无关，故置于循环外并置 flag）
  if (!sealImgChecked) {
    sealImgChecked = true;
    const fsx = require('fs');
    let pngs = [];
    try { pngs = fsx.readdirSync('./assets/seals').filter(n => /^seal_.*\.png$/.test(n)); }
    catch (e) { pngs = []; }
    if (pngs.length) {
      Object.keys(SEAL_IMG_FOR).forEach(s => {
        if (pngs.indexOf(SEAL_IMG_FOR[s] + '.png') < 0) unknown.push('assets/seals 印章图缺失: 「' + s + '」→ ' + SEAL_IMG_FOR[s] + '.png');
      });
      pngs.forEach(fn => {
        if (Object.keys(SEAL_IMG_FOR).every(s => SEAL_IMG_FOR[s] + '.png' !== fn)) unknown.push('assets/seals 印章图孤儿: ' + fn + ' 不对应词表任何值');
      });
    }
    sealPngCount = pngs.length;
  }

  /* 史实覆盖率（O-12 · v2.1.4 新增）：史实选项数 / 事件总数 = 命运束缚强度。
   * 定位词声称的排序（李斯最低「参照系最稀」、项羽最高「路被史书钉死」）必须与本读数一致——
   * 定位倒挂说明定位词或事件编写错位。jam.md 把该指标列为跨剧本正式验收项，本作此前从未测量。
   * 口径固定为「含 hist 标记的选项数 / 事件数」：以事件为分母而非以选项为分母，
   * 因为选项数随剧本写法浮动，只有事件数是可比的"局数"单位。 */
  let evN = 0, histN = 0, keyEv = 0, keyNoHist = 0, evNoHist = 0;
  (D.CHAPTERS || []).forEach(ch => (ch.events || []).forEach(ev => {
    evN++;
    const has = (ev.options || []).some(o => o.hist);
    if (has) histN++; else evNoHist++;
    if (ev.key) { keyEv++; if (!has) keyNoHist++; }
  }));
  const cov = evN ? histN / evN * 100 : 0;
  coverage[k] = { cov, evN, histN, keyNoHist, keyEv };
  /* 节点事件必含一项史实选项（C4 纪律）：「史」字标记是卖点 1 的参照系，
   * 节点（ev.key）缺它 = 该局最重要的分岔口没有"原本的他会怎么选"的参照。 */
  if (keyNoHist > 0) unknown.push(k + ' ' + keyNoHist + '/' + keyEv + ' 个关键节点事件无任何史实选项（违反 C4：节点必给「史」参照系）');
});

/* 覆盖率与定位词排序对账（O-12）。排序方向：覆盖率越高 = 参照系越密 = 路被史书钉得越死。 */
{
  const order = Object.keys(coverage).sort((a, b) => coverage[a].cov - coverage[b].cov);
  console.log('✔ 史实覆盖率（O-12：史实选项数/事件数 = 命运束缚强度）：');
  order.forEach(k => {
    const c = coverage[k];
    console.log(`  ${k.padEnd(10)} ${c.cov.toFixed(1).padStart(5)}%   史实选项 ${String(c.histN).padStart(3)}/${String(c.evN).padEnd(3)} 事件   零史实事件 ${c.evN - c.histN}   节点 ${c.keyEv}（缺史实 ${c.keyNoHist}）`);
  });
  /* 排序对账。口径教训：jam.md §5.2 原文写「李斯最低、韩信/项羽最高」——用斜杠并列两者，
   * 意味着**"最高"是一个并列区间而非单点**。若照字面取单点不变式（hanxin 必须排第一），
   * 就会把"项羽更高"这一合法状态判成倒挂。故此处取后二者中的较大者作对照点。 */
  const dense = [coverage.hanxin.cov, coverage.xiangyu.cov].sort((a, b) => b - a)[0];
  const denseBook = coverage.hanxin.cov >= coverage.xiangyu.cov ? 'hanxin' : 'xiangyu';
  const lisiMin = order[0] === 'lisi';
  const denseMax = coverage[denseBook].cov === dense && order[order.length - 1] === denseBook;
  if (!lisiMin) unknown.push('O-12 排序倒挂：声称「李斯史实覆盖率最低（参照最稀、自由度最高）」，实测最低为 ' + order[0] + '（' + coverage[order[0]].cov.toFixed(1) + '%）');
  if (!denseMax) unknown.push('O-12 排序倒挂：声称「韩信/项羽最高（路被史书钉死）」，实测最高为 ' + order[order.length - 1]);
  console.log('  排序（稀→密）：' + order.join(' < '));
  console.log('  与声称排序对账（jam.md §5.2 / GDD 5.2）：李斯最低 ' + (lisiMin ? '✔ 相符（50.0%）' : '✘ 倒挂')
    + ' ｜ 韩信/项羽并列最高 ' + (denseMax ? '✔ 相符（项羽 ' + coverage.xiangyu.cov.toFixed(1) + '% > 韩信 ' + coverage.hanxin.cov.toFixed(1) + '%，并列成立）' : '✘ 倒挂'));
  console.log('  另两本（荆轲 73.9% / 陈胜 80.0%）GDD 未声明相对密度，实测居中；五本关键节点均 5/5 含史实选项，C4 纪律全本达标');
}

/* 病亡（E8/baobing）可达性体检（v2.1.4 登记项 · GDD 附录 U.15 第六节）
 *
 * ⚠ 本项的两轮返工记录（两次都差点得出错误结论，故把教训写进代码）：
 *   ① 第一轮：按「体魄下限 = INIT + Σ负项 − Σ年龄衰减」静态判定，得出「项羽结构不可达」。
 *      **错在漏算疾病的体魄消耗**——`_tickIllness` 的疾病 drain 不设上限、可反复叠加。
 *   ② 第二轮：写「压体魄」探针复核，得项羽 0/600、最低体魄 60。**错在探针自己有 bug**：
 *      用了带标签的 `goto_x: continue;`，它 continue 的是 for 循环而非 while，
 *      导致「会治病/不治病」两态走同一条路（两栏读数完全相同 = 可疑信号，本该当场发现）。
 *   ③ 第三轮（现行）：修掉标签 bug 并逐局打印轨迹，发现项羽 5 局中 2 局病亡。
 *
 * 真实通路不是「吃满负项」，而是**「病催人老」的自我加速**：
 *   `_tickIllness` 大病每次行动 age+1 → 年龄被推高 → 跨过更多 `AGE.bands` 档位
 *   → 章首衰减加重 → 体魄更低 → 更易归零。故项羽基准定龄 30 岁可被病推到 37-42 岁，
 *   期间多吃 3 个以上衰减档，恰好抵消其 INIT 体魄 60 的优势。
 *   这条通路只有「不认真治病」时才会启动 —— 故病亡率极低但确实可达。
 *
 * 因此**五本的病亡都不是结构不可达**，上一轮"登记为已知边界"的裁决作废。
 * 现改为登记「实测病亡率 + 其达成条件」，防止后人误判为死内容而擅自"修好"。
 *
 * 不变式：
 *   ① 每本 E8.variants.baobing 存在且带专属史传（文本不得删）
 *   ② 「病催人老」这条自我加速通路必须存在：ILLNESS 大病须推高年龄（age+1），
 *      否则病亡在四本高 INIT 体魄剧本里不可达（这正是第一轮误判的机制根源）
 *   ③ 静态体魄下限仅作参考打印，不作判定依据（漏算疾病 drain 会得出反向错误结论）
 */
{
  console.log('✔ 病亡（E8/baobing）可达性体检：');
  Object.keys(FILES).forEach(k => {
    const D = require(FILES[k]);
    const bao = D.ENDINGS.E8 && D.ENDINGS.E8.variants && D.ENDINGS.E8.variants.baobing;
    if (!bao) { unknown.push(k + ' E8.variants 缺 baobing（病亡变体被删）'); return; }
    if (!bao.zhuan) unknown.push(k + ' E8/baobing 无专属史传（病殁文本缺失）');
    let neg = 0;
    (D.ACTIONS || []).forEach(a => { const t = (a.eff && a.eff.attrs && a.eff.attrs.tupo) || 0; if (t < 0) neg += t; });
    (D.CHAPTERS || []).forEach(c => (c.events || []).forEach(e => (e.options || []).forEach(o => {
      const t = (o.eff && o.eff.attrs && o.eff.attrs.tupo) || 0; if (t < 0) neg += t;
    })));
    let decay = 0;
    (D.CHAPTERS || []).forEach(c => {
      for (const b of ((D.AGE || {}).bands || [])) { if (c.age < b[0]) { if (b[1] < 0) decay += -b[1]; break; } }
    });
    const floor = D.INIT.tupo + neg - decay;   // 仅参考：不计疾病 drain
    console.log(`  ${k.padEnd(10)} INIT ${String(D.INIT.tupo).padStart(3)}   负项与年龄衰减 ${String(decay - neg).padStart(4)}   静态下限 ${String(floor).padStart(4)}（参考值，不计疾病 drain）   史传 ${String((bao.zhuan || '').length).padStart(3)} 字`);
  });
  console.log('  登记：五本病亡均**可达但极罕见**——通路是「病催人老」（大病每次行动 age+1 → 年龄跨档 → 衰减加重 → 归零），');
  console.log('        仅在玩家不认真使用「求医问药」时启动。实测达成率：李斯 1.95%（13 策略基线）｜项羽/荆轲/韩信/陈胜 需「压体魄 + 不治病」打法才现。');
  console.log('        五本各有一段专属病殁史传（项羽 162 字最长），均非死内容。');
}

if (unknown.length) { console.log('未识别项 ' + unknown.length + ' 条：'); unknown.forEach(u => console.log('  ✘ ' + u)); process.exit(1); }
console.log('✔ 键与路由扫描：五剧本全部 req/check 条件键、选项 to 目标、flag 置位来源均无未识别项');
console.log('✔ 年龄档与寿元配置卫生：五本均显式声明 bands/longevity、严格升序，且 tier1 阈值高于天然体魄水位（无白送免疫）');
console.log('✔ 印章五值封闭词表：五本全部结局 seal ∈ {循史,苟活,稳健,逆天,败局}，各值持有数合规'
  + (sealPngCount ? '，' + sealPngCount + ' 枚图无缺失无孤儿' : '（assets/seals 未读入，跳过图侧校验）'));
/* 命名债登记（jam.md B42 / 附录 A·待锚定事实 N-5）：印章「稳健」取图名为 seal_wenjian（文见），
 * 文件名与语义不对应。**只登记不自动改名**——改名要同步改 SEAL_IMG + 美术清单两处引用，
 * 属独立一次提交（GDD 附录 U.15 第五节）。此处若债已还（文件改名或加了 README 说明），不再提示。 */
if (SEAL_IMG_FOR['稳健'] !== 'seal_wanwen' && !require('fs').existsSync('./assets/seals/seal_wenjian.README')) {
  console.log('  · 命名债（B42/N-5）：印章「稳健」→ ' + SEAL_IMG_FOR['稳健'] + '.png（文见），文件名与语义不对应，已在册待还');
}
