/* 《青史志》随机命局生成器（v1.7.0，GDD 附录 R）—— 纯逻辑，浏览器与 Node 通用。
 * 输入：五剧本数据映射 + 可复现 rng；输出：一份可直接喂给引擎的"第六剧本"数据对象。
 * 随机化范围（主线/危机/修正保留主角本，涌现的是"势"）：
 *   ① 主角：五选一（均匀）
 *   ② 初始属性：以主角 INIT 为基准，十一维 ±10、危机 ±5（per-attr 上限 clamp，v1.8：如财富 ±1000 / 10000）
 *   ③ 际遇池：五本 RANDOM_EVENTS 全量 60 个抽 12 不重复（id 重编 F-1..F-12）
 *   ④ 词条库：五本 GLOSSARY 合并（key 冲突以主角本为准）
 *   ⑤ 命局摘要：写入 chapters[0].enter.note（章首注）
 * 存档语义：随机命局不写跨会话存档——每局即一生（GDD 附录 R.3）。 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.QINGSHI_FATE = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  var ATTR_KEYS = ['tupo', 'wuli', 'caixue', 'moulue', 'biancai', 'caifu', 'shengwang', 'quanshi', 'zhengji', 'junxin', 'weiji'];

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function ri(rng, lo, hi) { return lo + Math.floor(rng() * (hi - lo + 1)); }
  function clamp(v, mx) { return Math.max(0, Math.min(mx != null ? mx : 100, v)); }

  /* 单键数值钳制：INIT 缺键时 base 为 undefined，Math.round(undefined) 得 NaN 且会静默污染全部评分 */
  function num(v, dflt) { return typeof v === 'number' && isFinite(v) ? v : dflt; }

  /* 主入口：dataMap = {key: data, ...}（values 为剧本数据对象）；rng 为 () => [0,1)。
   * 返回 { data, report } —— data 为命局剧本数据；report 为命局摘要（人物/扰动/池来源）。 */
  function makeFate(dataMap, rng) {
    rng = rng || Math.random;
    var keys = Object.keys(dataMap);
    var protag = keys[Math.floor(rng() * keys.length)];
    var src = dataMap[protag];

    // 深拷贝主角本（剧本数据为纯 JSON 结构）
    var d = JSON.parse(JSON.stringify(src));

    // ① 初始属性扰动（per-attr 上限，v1.8：ATTRS[].max 声明——如财富 10000，扰动带随标尺）
    var amax = {};
    (d.ATTRS || []).forEach(function (a) { amax[a.k] = a.max || 100; });
    var jitter = {};
    ATTR_KEYS.forEach(function (k) {
      if (typeof d.INIT[k] !== 'number' || !isFinite(d.INIT[k])) d.INIT[k] = 0;   // 缺键/脏值兜底，杜绝 NaN 扩散
      var base = d.INIT[k], mx = amax[k] || 100;
      var span = k === 'weiji' ? 5 : Math.max(10, Math.round(mx / 10));
      var delta = ri(rng, -span, span);
      jitter[k] = delta;
      d.INIT[k] = clamp(base + delta, mx);
    });

    // ② 际遇池：全量打散抽 12（id 重编，防跨剧本重名冲突）
    //    过滤两处「抽到即废」的条目（v2.0.3 P1）：
    //    a) 章数越界——7 章本的际遇并入 6 章本（荆轲）后，chapters[1] ≥ 主角章数 的条目整局不可达；
    //    b) 死事件——跨剧本混入的 flag/cond 未重写，依赖别的剧本 flag 的选项永不可触发。
    //    b) 用不动点求解：先取"非际遇内容"可置位的 flag，再逐轮把保留际遇能置位的 flag 并入、
    //    剔除依赖不可满足的际遇，直至集合不再变化（保守剔除，不会误杀可达条目）。
    var nCh = (d.CHAPTERS || []).length;
    var pool = [];
    keys.forEach(function (k) {
      (dataMap[k].RANDOM_EVENTS || []).forEach(function (ev) {
        var cs = ev.chapters || [0, nCh - 1];
        if (cs[0] > nCh - 1 || cs[1] > nCh - 1) return;          // 越界：整局不可达，直接不入池
        pool.push({ from: k, ev: ev });
      });
    });
    // 不动点：反复「收集可置位 flag → 剔除死事件」，直至无可剔除
    var KEYS = ['flag', 'anyflag'];
    function depsOf(ev) {
      var out = [];
      function walk(v) {
        if (Array.isArray(v)) { v.forEach(walk); return; }
        if (!v || typeof v !== 'object') return;
        KEYS.forEach(function (k) {
          if (!(k in v)) return;
          if (k === 'flag') { if (typeof v[k] === 'string') out.push([v[k]]); }
          else if (Array.isArray(v[k])) out.push(v[k].filter(function (x) { return typeof x === 'string'; }));
        });
        Object.keys(v).forEach(function (k) { if (KEYS.indexOf(k) < 0) walk(v[k]); });
      }
      (ev.options || []).forEach(function (o) { walk(o.req); walk(o.reqAdjust); });
      return out;
    }
    function grantsOf(ev) {
      var out = {};
      function walk(v) {
        if (Array.isArray(v)) { v.forEach(walk); return; }
        if (!v || typeof v !== 'object') return;
        if (Array.isArray(v.setFlags)) v.setFlags.forEach(function (f) { if (typeof f === 'string') out[f] = true; });
        Object.keys(v).forEach(function (k) { walk(v[k]); });
      }
      walk(ev.options); walk(ev.enterEffects); walk(ev);
      return out;
    }
    var base = {};   // 非际遇内容（章节/行动/危机）可置位的 flag
    [d.CHAPTERS, d.ACTIONS, d.CRISIS_EVENTS].forEach(function (v) {
      var g = grantsOf(v) || {};
      Object.keys(g).forEach(function (k) { base[k] = true; });
    });
    // grantsOf(ev) 里 walk(ev) 会把 enterOnce 当普通字符串键扫不到，单独补扫
    function harvestFlags(v, out) {
      if (Array.isArray(v)) { v.forEach(function (x) { harvestFlags(x, out); }); return out; }
      if (!v || typeof v !== 'object') return out;
      if (typeof v.flag === 'string') out[v.flag] = true;
      if (typeof v.enterOnce === 'string') out[v.enterOnce] = true;
      Object.keys(v).forEach(function (k) { harvestFlags(v[k], out); });
      return out;
    }
    harvestFlags([d.CHAPTERS, d.ACTIONS, d.CRISIS_EVENTS], base);
    var kept = pool, changed = true, guard = 0;
    while (changed && guard++ < 20) {
      changed = false;
      var can = Object.assign({}, base);
      kept.forEach(function (it) { Object.assign(can, grantsOf(it.ev)); });
      kept = kept.filter(function (it) {
        var dead = depsOf(it.ev).some(function (alts) {
          return !alts.some(function (f) { return can[f]; });   // 该门槛的候选 flag 全不可置位
        });
        if (dead) changed = true;
        return !dead;
      });
    }
    var picked = [];
    var srcCount = {};
    for (var n = 0; n < 12 && kept.length > 0; n++) {
      var idx = Math.floor(rng() * kept.length);
      var item = kept.splice(idx, 1)[0];
      var ev = JSON.parse(JSON.stringify(item.ev));
      ev.id = 'F-' + (n + 1);
      picked.push(ev);
      srcCount[item.from] = (srcCount[item.from] || 0) + 1;
    }
    d.RANDOM_EVENTS = picked;

    // ③ 词条库合并：主角本最后覆盖（冲突以主角本为准）
    var gloss = {};
    keys.forEach(function (k) {
      var g = dataMap[k].GLOSSARY || {};
      Object.keys(g).forEach(function (t) { if (!gloss[t]) gloss[t] = g[t]; });
    });
    Object.keys(src.GLOSSARY || {}).forEach(function (t) { gloss[t] = src.GLOSSARY[t]; });
    d.GLOSSARY = gloss;

    // ④ 剧本身份与命局摘要
    var srcName = (src.SCENARIO && src.SCENARIO.name) || protag;
    d.SCENARIO = Object.assign({}, src.SCENARIO, {
      id: 'fate',
      name: srcName + ' · 随机命局',
      sub: '无人写过的命',
      recommend: '每局即一生（无存档）',
      noSave: true   // 引擎 exportSave 据此拒收（v2.0.3：此前仅 UI 拦截）
    });

    var report = {
      protag: protag, protagName: srcName,
      jitter: jitter, pool: srcCount, poolTotal: picked.length
    };
    var jt = ATTR_KEYS.map(function (k) {
      var v = jitter[k];
      return (d.ATTR_NAMES[k] || k) + (v >= 0 ? '+' : '') + v;
    }).join(' ');
    var poolDesc = keys.map(function (k) { return srcCount[k] || 0; }).join('/');
    d.CHAPTERS[0].enter = Object.assign({}, d.CHAPTERS[0].enter, {
      note: '【随机命局】' + srcName + ' ｜ 天道已重排：' + jt + ' ｜ 际遇×' + picked.length + ' 已洗入（' + poolDesc + '）｜ 此局无存档，一生即一局'
    });

    return { data: d, report: report };
  }

  return { makeFate: makeFate, mulberry32: mulberry32, ATTR_KEYS: ATTR_KEYS };
});
