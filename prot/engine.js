/* 《青史志》原型引擎 —— 纯逻辑，浏览器与 Node 通用（UI 只负责渲染与调用）
 *
 * 驱动模型：行动卡回合制（v0.9.5；v1.3.1 修订关键卡超时语义）
 *   每章：章首 intro → 回合循环（phase 'round'）→ 章末（endEvent/correction/summary）。
 *   每回合发 4 张卡：关键事件卡 ×1（当前 eventId，限时 KEY_CARD_ROUNDS 回合，
 *   倒计时归零未点则强制进入该事件抉择页——玩家阅读后必须亲自选择，不再自动循史）+ 普通行动卡 ×3
 *  （本章行动池随机抽取；同章重复使用同一行动收益递减——剧本级开关 ACTION_RULES.diminish，
 *   v1.9 李斯卡牌 v2 起关闭递减：池 16（8 通用 + 8 专属）、收益缩窄）。剧本事件的决策流（getOptions/choose/proceed）
 *   保持不变，只是事件不再自动接续，而是一律回到回合（round）重新发卡。
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.QINGSHI_ENGINE = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  function clamp(v) { return Math.max(0, Math.min(100, Math.round(v))); }

  /* 可复现 PRNG（随机流惰性派生用；与 balance-sim.js 同款 mulberry32） */
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  /* 关键事件卡限时（回合数）：每打出一张行动卡 -1；归零强制进入关键事件抉择页（玩家亲选，见 playCard） */
  var KEY_CARD_ROUNDS = 3;

  /* ---------- 遭遇层常量（v2.0.7 外置，可经剧本数据覆写） ----------
   * 此前 randomChance / randomMax / KEY_CARD_ROUNDS 是引擎级硬编码，
   * SPEC.md 声明「三难度数值口径在 DIFFICULTY」但遭遇层密度实为全局固定——
   * 难度与剧本都无法调「每回合遇际遇的概率」与「每章至多几次」。
   * 现在按 剧本数据 > 引擎默认 的顺序取值，数据侧写 ENCOUNTER 即可覆盖。 */
  var ENCOUNTER_DEFAULT = { randomChance: 0.4, randomMax: 2 };

  function Game(data, diffKey, rng, streams) {
    this.d = data;
    this.diffKey = diffKey;
    this.diff = data.DIFFICULTY[diffKey];
    this.rng = rng || Math.random;
    this._streams = streams || null;   // 按用途注入的随机流（测试用）：{ risk, event, corr, card }
    this._rngStreams = {};             // 惰性派生的随机流缓存（见 _stream）
    this.resetAll();
  }

  /* 随机流分流（v1.6.0）：按用途拆流，使险招骰点/际遇/修正不再与发牌共享同一随机序列
   * （原先前面抽到什么牌会改变后面骰到什么点数，连续"倒霉"无法归因）。
   * 注入优先（streams[name]）；未注入的流在首次使用时才从主 rng 取一值作种子派生
   * mulberry32——构造时刻不消耗主流，对既有轨迹扰动最小。
   * card（发牌）不派生：未注入时回退主 rng，发牌轨迹保持不变。 */
  Game.prototype._stream = function (name) {
    if (this._streams && typeof this._streams[name] === 'function') return this._streams[name];
    if (name === 'card') return this.rng;
    var s = this._rngStreams[name];
    if (!s) {
      s = mulberry32(Math.floor(this.rng() * 4294967296));
      this._rngStreams[name] = s;
    }
    return s;
  };

  Game.prototype.resetAll = function () {
    this.attrs = Object.assign({}, this.d.INIT);
    this.dev = 0;
    this.flags = {};                // 剧本 flag（数据侧声明的叙事里程碑，如 zhiwu/lianmeng）
    /* 一次性闸（v2.0.6）：引擎内部的「已触发过」记账（功高震主/宗室觊觎/失宠/门客散去/
     * 流言/命悬/贪墨清算/焚书污名警示）。此前这些写进同一个 this.flags ——
     * 于是 ①check() 认得 `_caizhi` 等键，任何 req:{flag:'_caizhi'} 会静默通过；
     * ②与剧本 flag 抢同一命名空间，存档里两种 flag 混在一起；
     * ③章节异变 enterOnce 也用它（见 onEventEnter），语义同样不是剧本 flag。
     * 拆出独立命名空间，两套随快照/存档同周期存读。 */
    this._once = {};
    this.histScore = 0;          // 史评原始分
    this.merits = [];            // 功业标记
    this.ach = [];               // 成就
    this.keyChoices = [];        // 复盘
    this.peak = { quanshi: this.attrs.quanshi, junxin: this.attrs.junxin };
    this.coef = 1;               // 回溯惩罚系数
    this.backtracksThisChapter = 0;
    this.chapterIdx = -1;
    this.eventId = null;
    this.phase = 'home';
    this.introNotes = [];
    this.pendingEndEvents = [];
    this.currentEndEvent = null;
    this.correction = null;
    this.ending = null;
    this.snapshot = null;
    this.pendingCardId = null;   // 抉择卡(次级关键事件)：进入 choice 阶段时挂起的行动卡 id
    this.choiceUsed = {};        // 抉择卡整局一次性：落定后不再发
    this.choiceGap = 1;          // 抉择卡调度：每两轮强制发一张
    // 回合制状态
    this.offer = null;           // 当前回合发牌：[{type:'key'}, {type:'action', id}...]
    this.keyRoundsLeft = 0;      // 关键事件卡剩余限时（回合）
    this.actionUses = {};        // 本章各行动已用次数（收益递减依据，n 从 1 计）
    // 随机际遇
    this.randomOn = true;
    var ENC = this.d.ENCOUNTER || ENCOUNTER_DEFAULT;   // v2.0.7：剧本可经 ENCOUNTER 覆写
    this.randomChance = ENC.randomChance != null ? ENC.randomChance : ENCOUNTER_DEFAULT.randomChance;  // 每回合触发际遇的概率
    this.randomMax = ENC.randomMax != null ? ENC.randomMax : ENCOUNTER_DEFAULT.randomMax;               // 每章至多触发次数
    this.keyCardRounds = ENC.keyCardRounds != null ? ENC.keyCardRounds : KEY_CARD_ROUNDS;             // 关键事件卡限时
    this.chapterDeck = [];
    this.randomCount = 0;
    this.currentRandom = null;
    this.pendingEventId = null;
    this._skipRandom = false;
    // 百科图鉴与隐藏 NPC 值
    this.gloss = [];             // 已解锁百科词条（回溯不重置，GDD 6.4）
    // 主敌威胁/戒心（隐藏值，GDD 4.3；剧本经 HIDDEN 配置，李斯=赵高威胁度）
    this.zg = (this.d.HIDDEN && this.d.HIDDEN.init != null) ? this.d.HIDDEN.init : 30;
    this.chapterDev = [];        // 本章偏离归因（章末结算页，GDD 5.4）
    this._corrShown = null;      // 本章触发的修正事件标题
    this._backlashDone = false;  // 逆天段章中反噬，每章一次（GDD 5.2）
    this._weijiClamp = 0;        // 非致命难度的危机 95 封顶记录（v2.0.6：如实并入章末差值）
    this._endEventsChecked = false;   // 章末事件池是否已按条件筛过（此前无初始化，靠 truthiness 跑）
    this._newAch = [];           // 最近一次结算新解锁的成就
    this._crisisPlotPending = false; // 危机 70–89：本章待注入一次构陷际遇（GDD 4.1）
    this.passedEvents = {};      // 本章已通过（choose 结算后离开）的剧本事件 id 集合（章内进度，GDD 3.3）
    this._chapterStartId = null; // 本章实际起始剧本事件（startAlt 解析后；进度分母口径用）
    this._burned = {};           // 险招失败烧毁的选项（章:eventId:idx → true，本章本事件内不可再试，GDD 附录 J）
    this.xushi = false;          // 蓄势状态（v1.6）：下一次事件抉择险招 +10，抉择后清空
    // 属性上限表（v1.8）：ATTRS[].max 声明（如财富 10000），未声明按 100
    var selfA = this; this._amax = {};
    (this.d.ATTRS || []).forEach(function (a) { selfA._amax[a.k] = a.max || 100; });
    this._actions = this._indexActions();   // 行动 id 索引（v2.0.7：省掉热路径上的全表扫描）
    // 年龄（v1.8，剧本 AGE 配置）：隐形背景值，章首按历史纪年定龄，体魄随年龄段衰减
    this.age = (this.d.AGE && this.d.AGE.init != null) ? this.d.AGE.init : null;
    // 疾病（v1.8，剧本 ILLNESS 配置开启）：null | { type:'minor'|'major', left?:n }
    this.ill = null;
  };

  /* 寿元（v2.1.3，剧本 AGE.longevity 配置）：高体魄延寿——「筋骨强健者老得慢」。
   * 按当前体魄查本表取「折寿」点数（升序 [[体魄阈值, 折寿点数], ...]，取全部命中项的末值），
   * 该点数同时作用于两个通道：
   *   1) 章首抵衰——抵消 AGE.bands 的年龄衰减量（点满即当章不衰）
   *   2) 疾病压力——折寿点数同时抵减体魄项与年龄项（见 _tickIllness 的 effTupo/effAge）
   * 口径：折寿点数是「可抵消的体魄点数」，与 bands 的衰减值同量纲，故两者可直接相加抵消。
   * 派生值不需存档：它完全由 attrs.tupo 推出，回溯/读档恢复体魄后自动一致。 */
  Game.prototype._longevity = function () {
    var lon = (this.d.AGE && this.d.AGE.longevity) || [];
    var c = 0;
    for (var i = 0; i < lon.length; i++) { if (this.attrs.tupo >= lon[i][0]) c = lon[i][1]; }
    return c;
  };

  /* 属性上限（per-attr max，v1.8；财富万位标尺用）与属性钳制 */
  Game.prototype.attrMax = function (k) { return (this._amax && this._amax[k]) || 100; };
  Game.prototype._clampA = function (k, v) { return Math.max(0, Math.min(this.attrMax(k), Math.round(v))); };

  /* 置值（不经增量）：钳制到 per-attr 上限，并同步 peak。
   * peak 此前只在 applyEff 内更新，任何走 setAttrs/capAttrs/onEventEnter 的置值路径
   * 都不会更新它 —— 而功业评分（buildEnding 的 gongye）读的正是 peak，
   * 于是「章首抬高权势」的局按陈旧峰值计功。 */
  Game.prototype._setAttrRaw = function (k, v) {
    this.attrs[k] = this._clampA(k, v);
    if (k === 'quanshi' && this.attrs[k] > this.peak.quanshi) this.peak.quanshi = this.attrs[k];
    if (k === 'junxin' && this.attrs[k] > this.peak.junxin) this.peak.junxin = this.attrs[k];
    return this.attrs[k];
  };

  Game.prototype.start = function () { this.enterChapter(0); };

  Game.prototype.chapter = function () { return this.d.CHAPTERS[this.chapterIdx]; };

  Game.prototype.findEvent = function (id) {
    if (this.currentRandom && this.currentRandom.id === id) return this.currentRandom;
    var ch = this.chapter();
    var evs = (ch && ch.events) || [];
    for (var i = 0; i < evs.length; i++) if (evs[i].id === id) return evs[i];
    return null;
  };

  Game.prototype.devBand = function (dev) {
    var bands = this.d.DEV_BANDS, v = (dev == null ? this.dev : dev);
    for (var i = 0; i < bands.length; i++) if (v <= bands[i].max) return i;
    return bands.length - 1;
  };

  var FLAG_REASONS = {
    fusu: '需要扶苏的信任', guanshu: '需要序章观鼠悟道', liuzheng: '需要沙丘留证',
    hanfeicun: '需要韩非尚在', ziwu: '需要自污保身', mibao: '需要宫中密报',
    guangjiaoyou: '需要广交游', shouxi: '当前处境不适用', piaobo: '已经漂泊过一遭',
    lianmeng: '需要已密联蒙恬', mtdi: '蒙恬已生敌意'
  };

  /* ---------- 条件判定 ---------- */
  Game.prototype.check = function (cond) {
    if (!cond) return true;
    var self = this, ok = true, reason = null;
    var names = this.d.ATTR_NAMES;
    Object.keys(cond).forEach(function (k) {
      if (!ok) return;
      var v = cond[k];
      if (k === 'flag') { if (!self.flags[v]) { ok = false; reason = FLAG_REASONS[v] || '需要特定经历'; } }
      else if (k === 'notflag') { if (self.flags[v]) { ok = false; reason = '与已有经历冲突'; } }
      else if (k === 'anyflag') {
        var has = v.some(function (f) { return self.flags[f]; });
        if (!has) { ok = false; reason = FLAG_REASONS[v[0]] || '需要特定经历'; }
      }
      else if (k === 'weijiMax') { if (self.attrs.weiji > v) { ok = false; reason = '危机须≤' + v; } }
      else if (k === 'quanshiMax') { if (self.attrs.quanshi > v) { ok = false; reason = '权势须≤' + v; } }
      else if (k === 'junxinMax') { if (self.attrs.junxin > v) { ok = false; reason = '君心须≤' + v; } }
      else if (k === 'zgMax') { if (self.zg > v) { ok = false; reason = '戒心须≤' + v; } }   // v2.0.6：reason 原为 ''（falsy），UI 的 if (c.reason) 不渲染 → 锁定原因空白
      else if (k === 'junxinMaxSeen') { if (self.peak.junxin < v) { ok = false; reason = '君心峰值须≥' + v; } }
      else if (k === 'minChapter') { if (self.chapterIdx < v) { ok = false; reason = '当前处境不适用'; } }
      else if (k === 'devMin') { if (self.dev < v) { ok = false; reason = '需偏离≥' + v + '（改流之势）'; } }
      else if (k === 'devMax') { if (self.dev > v) { ok = false; reason = '需偏离≤' + v; } }
      else if (names[k]) { if (self.attrs[k] < v) { ok = false; reason = names[k] + '须≥' + v; } }
      // v2.0.6：未知 req 键不再静默通过。此前无 else 分支——req:{caxue:50}（typo）
      // 会返回 {ok:true}，把一个门槛 typo 变成永久解锁；checkRisk 更把同一未知键
      // 归入 hard 并报 hardOk:true。改为按"未达标"处理并给出可读原因，
      // 数据侧 typo 会立刻显形（锁定项带原因），而非悄悄放开内容。
      else { if (typeof v === 'number') { ok = false; reason = '条件「' + k + '」无法识别'; } }
    });
    return { ok: ok, reason: reason };
  };

  /* ---------- 险招（软门槛 + 掷骰，v1.4.0，GDD 附录 J） ----------
   * 六维属性（ATTR_NAMES）最低值门槛为软门槛：不达标可冒险掷骰；
   * flag/notflag/anyflag/minChapter/devMin/devMax/weijiMax/*Max/zgMax/*Seen 为硬门槛（保持锁定）。
   * 行动卡语境下 caifu 是支付能力检查，特判为硬门槛。
   * 成功率按未达标差值六档取最低：≤3→70 / ≤6→50 / ≤9→40 / ≤12→30 / ≤15→20 / >15→15。 */
  Game.prototype.riskRate = function (gap) {
    if (gap <= 3) return 70; if (gap <= 6) return 50; if (gap <= 9) return 40;
    if (gap <= 12) return 30; if (gap <= 15) return 20; return 15;
  };

  /* 史实（hist）选项险招成功率升一档（v1.5.1）：历史惯性体——赌的是"改变历史"，少赌"成为历史" */
  Game.prototype.riskRateHist = function (rate) {
    if (rate >= 50) return 70; if (rate >= 40) return 50; if (rate >= 30) return 40;
    if (rate >= 20) return 30; return 20;
  };

  /* 分类 req：hardOk/hardReason（硬键判定）+ unmet（未达标软键明细）+ rate（综合成功率，无软缺口为 null）
   * caifu 恒为硬门槛（支付能力检查）：万位标尺（v1.8）下软门槛差值档不适用，且"钱不够"本就该锁而不是赌 */
  Game.prototype.checkRisk = function (req, actionHardCaifu) {
    var self = this, names = this.d.ATTR_NAMES;
    var hard = {}, unmet = [];
    Object.keys(req || {}).forEach(function (k) {
      if (names[k] && k !== 'caifu') {
        var have = self.attrs[k], need = req[k];
        if (have < need) unmet.push({ k: k, name: names[k], need: need, have: have, gap: need - have });
      } else hard[k] = req[k];
    });
    var hc = Object.keys(hard).length ? this.check(hard) : { ok: true, reason: null };
    var rate = null;
    if (unmet.length) {
      rate = 100;
      unmet.forEach(function (u) { rate = Math.min(rate, self.riskRate(u.gap)); });
    }
    return { hardOk: hc.ok === true, hardReason: hc.reason || null, unmet: unmet, rate: rate };
  };

  /* 掷一次骰（1–100）：roll ≤ rate 为成功。走 risk 流（险招专用，与发牌/际遇互不牵扯）；
   * 引擎内部判定，测试可经 streams.risk 注入常量骰、浏览器默认惰性派生。 */
  Game.prototype._rollRisk = function (rate, unmet) {
    var roll = Math.floor(this._stream('risk')() * 100) + 1;
    return { rate: rate, roll: roll, success: roll <= rate, unmet: unmet };
  };

  /* 掷骰结算标题（v1.6.1）：普通/剧情显示点数与成功率；硬核只显档位词（隐藏数值口径，GDD 4.4） */
  Game.prototype.riskTitle = function (r) {
    if (!r || !r.risk) return '';
    var rk = r.risk;
    var res = rk.success ? ' · 成' : ' · 败';
    if (this.diff.hideAttrs) return '🎲 成算' + riskWord(rk.rate) + res;
    return '🎲 掷骰 ' + rk.roll + (rk.success ? ' ≤ ' : ' ＞ ') + rk.rate + res;
  };

  /* 成算档位词（v2.0.5）：六档取最近档的下限词。此前 riskTitle 用 `>=` 阶梯，
   * 把 rate=60 说成「五成」、rate=25 说成「二成」——而这两档经蓄势 +10 / 史实升档
   * 后都真实可达（可达集合 {15,20,25,30,40,50,60,70}），且只影响硬核——恰恰是
   * 看不到数字的那批玩家。改为「就近向下取档」：word 取不超过 rate 的最大档。 */
  var RISK_WORDS = [[70, '七成'], [50, '五成'], [40, '四成'], [30, '三成'], [20, '二成'], [15, '一成五']];
  function riskWord(rate) {
    for (var i = 0; i < RISK_WORDS.length; i++) if (rate >= RISK_WORDS[i][0]) return RISK_WORDS[i][1];
    return '一成五';
  }

  /* ---------- 进入章节 ---------- */
  Game.prototype.enterChapter = function (idx) {
    this.chapterIdx = idx;
    this.backtracksThisChapter = 0;
    var ch = this.chapter();
    this.introNotes = [];
    if (ch.enter) {
      if (ch.enter.merit && this.merits.indexOf(ch.enter.merit) < 0) this.merits.push(ch.enter.merit);
      if (ch.enter.note) this.introNotes.push(ch.enter.note);
    }
    // 节点异变
    if (ch.mutations) {
      var self = this;
      ch.mutations.forEach(function (m) {
        if (self.check(m.if).ok) {
          if (m.flag) self.flags[m.flag] = true;
          // 戒心异变（2026-10-10 补，与 Lua 侧同步）：与 enterEffects 的 zg/zgSet 同语义。
          // 此前静默丢弃，荆轲 xielou/cuixing 两处异变因此失效。
          if (m.zg) self.zg = clamp(self.zg + m.zg);
          if (m.zgSet != null) self.zg = clamp(m.zgSet);
          // setAttrs/capAttrs 走 _clampA（v2.0.6）：此前 setAttrs 是裸赋值，可把属性写到
          // per-attr 上限之外（实测 setAttrs:{quanshi:250} 原样落 250，_clampA 会给 100），
          // 且不更新 peak —— 章首抬高权势的局，功业评分仍按陈旧 peak 计算。
          if (m.setAttrs) Object.keys(m.setAttrs).forEach(function (k) { self._setAttrRaw(k, m.setAttrs[k]); });
          // capAttrs：只降不升的置值（如 N1"籍没其家"——籍没只抄不补，财富高于上限才封至上限，贫寒者不反向补贴）
          if (m.capAttrs) Object.keys(m.capAttrs).forEach(function (k) { if (self.attrs[k] > m.capAttrs[k]) self._setAttrRaw(k, m.capAttrs[k]); });
          if (m.note) self.introNotes.push(m.note);
        }
      });
    }
    // 年龄定龄与衰老（v1.8，剧本 AGE 配置）：章首按历史纪年定龄；体魄随年龄段自然衰减（不进结算条目，走章首注）
    // v2.1.3：衰减量先取本剧本 bands 档位，再由寿元（高体魄）逐点抵消——「体魄好则老得慢」。
    //          折寿点满当章时衰减归零，如实告知玩家「衰老之损尽为体魄所抵」，不留未告知的静默改数。
    if (ch.age != null && this.d.AGE) {
      this.age = ch.age;
      var ageBands = this.d.AGE.bands || [[40, 0], [55, -2], [65, -4], [76, -6], [200, -8]];
      var dAge = 0;
      for (var abi = 0; abi < ageBands.length; abi++) { if (this.age < ageBands[abi][0]) { dAge = ageBands[abi][1]; break; } }
      if (dAge) {
        var cred = this._longevity();
        var dAgeRaw = dAge;
        if (cred) dAge = Math.min(0, dAge + cred);   // 抵衰：负值向 0 收敛，不会反成增益
        this.attrs.tupo = this._clampA('tupo', this.attrs.tupo + dAge);
        if (dAge) {
          this.introNotes.push('【春秋渐高】年已' + this.age + '，筋骨大不如前——体魄' + dAge + '。');
        } else {
          this.introNotes.push('【春秋渐高】年已' + this.age + '，然筋骨犹胜常人，衰老之损尽为体魄所抵（寿元+' + cred + '，本应体魄' + dAgeRaw + '）——体魄无损。');
        }
      }
    }
    // GDD 4.1 章首持续结算：高值风险以"每章"粒度生效（危机正增量乘难度系数 diff.wj，GDD 4.4）
    // 失宠规则为朝堂语境（需"有君可失"）——剧本可经 PERSIST.junxinFrom 设定生效起始章、
    // PERSIST.junxinShichong=false 整体关闭（项羽：君心=天下人望，惩罚由诸侯离心 zg 承担）
    var wj = this.diff.wj, dWj;
    var jxFrom = (this.d.PERSIST && this.d.PERSIST.junxinFrom != null) ? this.d.PERSIST.junxinFrom : 0;
    var shichongOn = !(this.d.PERSIST && this.d.PERSIST.junxinShichong === false);
    if (this.attrs.quanshi >= 80) { dWj = Math.round(5 * wj); this.attrs.weiji = this._clampA('weiji', this.attrs.weiji + dWj); this.introNotes.push('【树大招风】权势过盛，君主猜忌日深——危机+' + dWj + '。'); }
    if (this.attrs.junxin <= 15 && shichongOn && this.chapterIdx >= jxFrom) { dWj = Math.round(10 * wj); this.attrs.weiji = this._clampA('weiji', this.attrs.weiji + dWj); this.introNotes.push('【失宠于上】君心已冷，构陷者众——危机+' + dWj + '。'); }
    if (this.attrs.caifu <= 0) { this.attrs.shengwang = this._clampA('shengwang', this.attrs.shengwang - 5); this.introNotes.push('【门客散去】无钱养士，门前冷落——声望-5。'); }
    if (this.attrs.shengwang >= 80 && this.attrs.junxin < 40 && !this._once._gonggao) { this._once._gonggao = true; dWj = Math.round(10 * wj); this.attrs.weiji = this._clampA('weiji', this.attrs.weiji + dWj); this.introNotes.push('【功高震主】你的名望已越过人臣的界限——危机+' + dWj + '。'); }
    if (this.attrs.caifu >= this.attrMax('caifu') * 0.9 && !this._once._jiyu) { this._once._jiyu = true; dWj = Math.round(8 * wj); this.attrs.weiji = this._clampA('weiji', this.attrs.weiji + dWj); this.introNotes.push('【宗室觊觎】你的家产引来了宗室的目光——危机+' + dWj + '。'); }
    // GDD 4-5-A 设计备注：污名·焚书（wu_fenshu）——士人集团永久敌意。第五/六章章首兑现：
    // 首次入章一次性警示，此后每章声望-3 持续侵蚀（声望非危机，不乘难度系数，GDD 4.4 口径）
    if (this.flags.wu_fenshu && idx >= 5) {
      if (!this._once._wfsWarn) { this._once._wfsWarn = true; this.introNotes.push('【污名·焚书】士林至今以焚书之议罪你——辩白无用，这份敌意会伴你走到局终。'); }
      this.attrs.shengwang = this._clampA('shengwang', this.attrs.shengwang - 3);
      this.introNotes.push('【士林侧目】焚书之议，士林视你为仇——声望-3。');
    }
    if (ch.achOnEnter) this.unlockAch(ch.achOnEnter);
    this.chapterDev = [];
    this._corrShown = null;
    this._backlashDone = false;
    this.passedEvents = {};   // 章内进度（GDD 3.3）随章重置
    // 回合制与随机际遇的章内状态（须在起始事件与危机判定之前重置）
    this.offer = null;
    this.keyRoundsLeft = this.keyCardRounds;
    this.actionUses = {};
    this.randomCount = 0;
    this.currentRandom = null;
    this.pendingEventId = null;
    this._crisisPlotPending = false;
    var self = this;
    this.chapterDeck = this._buildChapterDeck(idx);
    // 起始事件（支持条件起始，如 3-0 密报）
    var start = ch.start;
    if (ch.startAlt) {
      for (var i = 0; i < ch.startAlt.length; i++) {
        if (this.check(ch.startAlt[i].if).ok) { start = ch.startAlt[i].start; break; }
      }
    }
    this._chapterStartId = start;   // 章内进度分母口径（chapterProgress）依据实际起点调整
    // GDD 4.1 危机高值：≥90 章首替换为死亡判定事件（RETURN 返回原起始事件）；
    // 70–89 置一次性标记，由 maybeRandom 在章内注入一次构陷/暗杀际遇
    if (this.attrs.weiji >= 90 && this.d.CRISIS_EVENTS && this.d.CRISIS_EVENTS.death) {
      var dev0 = JSON.parse(JSON.stringify(this.d.CRISIS_EVENTS.death));
      this.pendingEventId = start;
      this.currentRandom = dev0;
      this.eventId = dev0.id;
    } else if (this.diffKey === 'hardcore' && this.flags.tanmo && !this._once._tanmo_qs &&
               idx >= 4 && idx <= 5 && this.d.CRISIS_EVENTS && this.d.CRISIS_EVENTS.qingsuan) {
      // GDD 8 章 2-4-C 设计备注：持【贪墨】在硬核难度下触发后续清算事件（第四/五章章首，
      // 一次性，复用危机事件的插入/RETURN 机制，_tanmo_qs 防重；死亡判定优先于清算）
      this._once._tanmo_qs = true;
      this.pendingEventId = start;
      this.currentRandom = this.d.CRISIS_EVENTS.qingsuan;
      this.eventId = this.d.CRISIS_EVENTS.qingsuan.id;
      if (this.attrs.weiji >= 70) this._crisisPlotPending = true;
    } else {
      this.eventId = start;
      if (this.attrs.weiji >= 70) this._crisisPlotPending = true;
    }
    this.onEventEnter(); // 起始事件同样过进入钩子（5-1 勒索兑现等）
    // 存档点（异变应用、起始事件与危机判定确定之后再拍快照）
    this.snapshot = this.makeSnapshot();
    this.phase = 'intro';
  };

  Game.prototype.makeSnapshot = function () {
    return {
      attrs: Object.assign({}, this.attrs),
      dev: this.dev,
      flags: Object.assign({}, this.flags),
      once: Object.assign({}, this._once),   // 引擎内部一次性闸（v2.0.6：与剧本 flag 分离命名空间）
      histScore: this.histScore,
      merits: this.merits.slice(),
      ach: this.ach.slice(),
      keyChoices: this.keyChoices.slice(),
      peak: Object.assign({}, this.peak),
      zg: this.zg,
      eventId: this.eventId,
      // 章首死亡判定/构陷注入的插入状态一并入快照，保证回溯语义一致
      pendingEventId: this.pendingEventId,
      currentRandom: this.currentRandom,
      crisisPlotPending: this._crisisPlotPending,
      // 回合制状态（章首快照时点：倒计时满、行动未用、进度清零；offer 不入快照，恢复后由 beginRounds 重发）
      keyRoundsLeft: this.keyRoundsLeft,
      actionUses: Object.assign({}, this.actionUses),
      choiceUsed: Object.assign({}, this.choiceUsed),
      choiceGap: this.choiceGap,
      passed: Object.assign({}, this.passedEvents),
      age: this.age,   // 年龄/疾病属时间线状态（v1.8）：随快照存取，回溯即回到章首病况
      ill: this.ill ? Object.assign({}, this.ill) : null,
      /* 章首注记（v2.0.5 补入）：enterChapter 产出的规则提示（树大招风/失宠/功高震主/
       * 门客散去/污名·焚书/【春秋渐高】…）。此前不入快照——回溯与读档后 introNotes
       * 被清空，而它们对应的属性效果已在快照里，于是「属性被改了但没有解释」。
       * 这些注记是章首状态的确定性产物，故随快照存取（不改写，仅补齐）。 */
      introNotes: (this.introNotes || []).slice(),
      /* 回溯系数 coef（v2.0.5 补入）：跨会话读档此前清空（注释称「重置为 1」但无赋值，
       * 实测 coef=0.8 存活于读档后）。回溯每次 ×0.98，是纯时间线状态，
       * 随快照存取而非跨会话重置——与注释所述口径一致。 */
      coef: this.coef
    };
  };

  /* 章内进度（GDD 3.3）：done = 本章已通过（choose 结算后离开）的剧本事件数，
   * total = 本章 events 数；startAlt 条件起点跳过了 ch.start 指向的事件（如未获密报则 3-0
   * 不出现），分母相应减一。际遇/危机插入（currentRandom 非空）与章末事件不计。 */
  Game.prototype.chapterProgress = function () {
    var ch = this.chapter();
    var total = ch ? ch.events.length : 0;
    if (ch && this._chapterStartId && this._chapterStartId !== ch.start) total -= 1;
    return { done: Object.keys(this.passedEvents).length, total: Math.max(total, 1) };
  };

  /* 本章可用际遇牌堆（enterChapter / importSave / backtrack 三处共用同一过滤口径，
   * v2.0.5：此前 backtrack 不重建牌堆也不清 randomCount，「回到本章开头」名不副实） */
  Game.prototype._buildChapterDeck = function (idx) {
    return (this.d.RANDOM_EVENTS || []).filter(function (e) {
      return idx >= e.chapters[0] && idx <= e.chapters[1];
    }).slice();
  };

  /* intro → 回合 的入口（保留旧名 beginEvents，兼容既有调用） */
  Game.prototype.beginEvents = function () { return this.beginRounds(); };

  /* ---------- 回合发牌 ----------
   * 以当前 eventId 为关键事件卡（限时 keyRoundsLeft 回合），
   * 从本章可用行动池随机补 3 张行动卡（同轮不重复）。
   * 行动池 = ACTIONS 中 chapters 覆盖本章（字段缺失时按 [0,6] 处理）且 req 当前满足者。 */
  Game.prototype.beginRounds = function () {
    var self = this;
    var pool = (this.d.ACTIONS || []).filter(function (a) {
      var chs = a.chapters || [0, 6];
      if (self.chapterIdx < chs[0] || self.chapterIdx > chs[1]) return false;
      // 硬门槛过滤（caifu 支付检查特判硬）；属性软门槛不过滤，以 ⚠ 险招徽章入列（GDD 附录 J）
      return a.req ? self.checkRisk(a.req, true).hardOk : true;
    });
    var picks = [];
    var deal = this._stream('card');   // card 流未注入时回退主 rng（发牌轨迹不变）
    // 抉择卡调度（镜像 Lua beginRounds）：本章池中未使用的抉择卡，每两轮强制占一个发牌位；
    // 取消(且搁置)不计使用，抉择落定才入 choiceUsed。仅强制发牌时多消耗一次 deal()。
    this.choiceGap = (this.choiceGap || 0) + 1;
    // 已落定的抉择卡整局不再发：必须先从 pool 剔除。只过滤 crest(强制发牌候选)是不够的——
    // 它们仍留在 pool 里被「常规抽 3 张」选中,二次进入 choice 阶段重复结算。
    // 取消(且搁置)不写 choiceUsed,故该卡仍留在池中,语义正确。
    pool = pool.filter(function (a) { return !(a.choice && self.choiceUsed[a.id]); });
    var crest = pool.filter(function (a) { return a.choice; });
    var cpick = null;
    if (crest.length > 0 && this.choiceGap >= 2) {
      cpick = crest[Math.floor(deal() * crest.length)];
      this.choiceGap = 0;
      for (var ci = 0; ci < pool.length; ci++) { if (pool[ci] === cpick) { pool.splice(ci, 1); break; } }
    }
    var n = Math.min(3, pool.length);
    for (var k = 0; k < n; k++) {
      var idx = Math.floor(deal() * pool.length);
      picks.push(pool.splice(idx, 1)[0]);
    }
    this.offer = [{ type: 'key' }];
    picks.forEach(function (a) { self.offer.push({ type: 'action', id: a.id }); });
    if (cpick) this.offer.push({ type: 'action', id: cpick.id });
    // 治病卡（v1.8，剧本 ILLNESS）：染病时额外发一张「求医问药」，不占行动池、不入收益递减
    if (this.ill && this.d.ILLNESS) this.offer.push({ type: 'action', id: '__cure__' });
    this.phase = 'round';
    return { type: 'round' };
  };

  /* 当前回合手牌（UI 渲染用）：关键卡带倒计时，行动卡带 req 锁定与递减提示。
   * 行动卡 locked 仅由 req 决定（行动不限每章一次，重复用只是收益递减）。 */
  Game.prototype.getOffer = function () {
    if (!this.offer) return [];
    var self = this;
    return this.offer.map(function (e) {
      if (e.type === 'key') {
        var ev = self.findEvent(self.eventId);
        return {
          type: 'key', eventId: self.eventId,
          title: ev ? ev.title : String(self.eventId),
          inserted: !!self.currentRandom,   // 关键卡为危机插入事件（如章首 C-DEATH）时为 true
          roundsLeft: self.keyRoundsLeft,
          // v2.0.4 P1 死锁修复：本事件无任何可解锁选项时，关键卡由"纯被动展示"转为可点——
          // 否则「全锁事件 + 行动池也空」的剧本组合会让玩家零合法行动（ui-round 此前不绑 onclick）。
          enterable: !self._hasOpenOption()
        };
      }
      var a = null;
      if (e.id === '__cure__') {
        // 治病卡（v1.8）：数据不在 ACTIONS，由 ILLNESS 配置现组（UI 按普通行动卡渲染）
        if (self.d.ILLNESS) a = { id: '__cure__', name: '求医问药',
          desc: (self.ill && self.ill.type === 'major' ? '沉疴非药石不起——' : '小病亦不可拖——') + '延医诊治（财富-' + self.d.ILLNESS.cost + '）',
          // 硬核隐藏：药资数字不外露（数值口径见 GDD 4.4），改由 cardDesc 统一改写
          descHidden: (self.ill && self.ill.type === 'major' ? '沉疴非药石不起——' : '小病亦不可拖——') + '延医诊治（耗财）' };
      } else {
        a = self._actionById(e.id);   // v2.0.7：走 id 索引，不再每次渲染全扫 ACTIONS
      }
      var c = { ok: true, reason: null }, risky = null;
      if (a && a.req) {
        var cr = self.checkRisk(a.req, true);
        c = { ok: cr.hardOk, reason: cr.hardReason };
        if (cr.hardOk && cr.rate != null) risky = { rate: cr.rate, unmet: cr.unmet };
      }
      var used = self.actionUses[e.id] || 0;
      var noDim = self.d.ACTION_RULES && self.d.ACTION_RULES.diminish === false;
      return { type: 'action', action: a, locked: !c.ok, reason: c.reason || null, usedCount: used, diminishing: !noDim && used > 0, risky: risky, choice: (a && a.choice) ? true : null };
    });
  };

  /* 行动卡说明文本（GDD 4.4 数值可见性）：硬核难度下把说明里的数字抹掉。
   * 数据侧 desc 为人工撰写的文案，数值只以两种形态出现——括号内的代价（财富-8）
   * 与括号内的门槛（才学≥45 方能执笔）。此处按形态改写为不含数字的措辞：
   *   代价 → 「（耗财）」/「（费时）」等按属性名的通用措辞；门槛 → 「（X 不足则须冒险）」。
   * 未识别的形态原样返回（不吞内容，也不误伤无括号的纯叙事文案）。
   * UI 只经本方法取卡面文案（js/ui-round.js），确保硬核隐藏口径覆盖到卡面这一屏。 */
  var COST_WORD = { caifu: '耗财', tupo: '费力', wuli: '耗力', caixue: '耗神', moulue: '费心', biancai: '费辞' };
  Game.prototype.cardDesc = function (desc) {
    if (!desc) return desc;
    if (!this.diff.hideAttrs) return desc;      // 剧情/普通：数值可见，原样
    // 数据文案用属性中文名（如「财富-8」「才学≥45」），故先把中文名反查为键再取措辞
    var names = this.d.ATTR_NAMES || {}, byName = {};
    Object.keys(names).forEach(function (k) { byName[names[k]] = k; });
    var wordOf = function (nm) { var k = byName[nm]; return (k && COST_WORD[k]) || '有代价'; };
    return String(desc)
      .replace(/（([^（）]{1,8})-\d+）/g, function (_, nm) { return '（' + wordOf(nm) + '）'; })
      .replace(/（([^（）]{1,8})[≥>]=?\s*\d+\s*([^（）]*)）/g, function (_, nm, tail) {
        return '（' + nm + '不足则须冒险' + (tail ? '，' + tail : '') + '）';
      });
  };

  /* ---------- 出牌 ---------- */
  Game.prototype.playCard = function (i) {
    if (this.phase !== 'round' || !this.offer) return null;
    var entry = this.offer[i];
    if (!entry) return null;
    if (entry.type === 'key') {
      // 关键事件卡：进入现有事件决策流（onEventEnter 钩子在事件到达时已走过，幂等）。
      // 倒计时重置语义：本事件 choose 结算后由 proceed 为下一事件重建 offer（倒计时回满）。
      // v2.0.4 P1 死锁修复：本事件已无任何可解锁选项时，若照旧进入 event 页，玩家面对
      // 一页全灰的选项且行动池也已空——零合法行动。此处直接收束本章（记为章末），
      // 与 UI 侧「关键卡可点」配套。理论上不该出现（剧本事件应留有兜底选项），故仅作防御。
      if (!this._hasOpenOption()){
        this._next = { type: 'chapterEnd' };
        this.phase = 'settle';
        return { kind: 'key', forcedEnding: false, chapterEnd: true };
      }
      this.phase = 'event';
      return { kind: 'key' };
    }
    // ---- 行动卡 ----
    // 治病卡（v1.8）：清病 + 药资，视作本轮行动（推进倒计时，不收益递减）
    if (entry.id === '__cure__') {
      if (!this.ill || !this.d.ILLNESS) return null;
      var ILL = this.d.ILLNESS, wasMajor = this.ill.type === 'major';
      this.ill = null;
      var paid = Math.min(this.attrs.caifu, ILL.cost), owed = this.attrs.caifu < ILL.cost;
      this.attrs.caifu = this._clampA('caifu', this.attrs.caifu - ILL.cost);
      var heal = ILL.heal || 5;
      this.attrs.tupo = this._clampA('tupo', this.attrs.tupo + heal);
      var cureChanges = [
        { k: 'caifu', label: '财富', delta: -paid, note: owed ? '举债求医，债台高筑' : '延医之资' },
        { k: 'tupo', label: '体魄', delta: heal, note: '药石有功' }
      ];
      var rc = {
        kind: 'action', id: '__cure__',
        text: wasMajor ? '医者换了三次方，前前后后一个月，你终于能扶着墙坐起来了。这场大病，把日子熬短了一截。'
                       : '一剂汤药下去，病气散了。小病早治，原是至理。',
        changes: cureChanges, devDelta: 0, useCount: 1,
        achNew: null, bandUp: false, bandName: null, forcedEnding: false, risk: null, failed: false
      };
      var feC = this.checkDeath();
      if (feC) { this._next = feC; this.phase = 'settle'; rc.forcedEnding = true; return rc; }
      return this._advanceRound(rc);
    }
    var a = this._actionById(entry.id);   // v2.0.7：走 id 索引
    if (!a) return null;
    var cr = a.req ? this.checkRisk(a.req, true) : { hardOk: true, rate: null, unmet: [] };
    if (!cr.hardOk) return null;
    // 抉择卡(次级关键事件)：不直接结算，进入 choice 阶段展示剧情与选项，由 chooseCardOption 落定后才计次结算。数据约定：抉择卡不写 req 险招(rate)。
    if (a.choice) {
      this.pendingCardId = a.id;
      this.phase = 'choice';
      return { kind: 'choice', id: a.id };
    }
    // 险招掷骰：属性软门槛未达标，成败由骰；失败无收益、危机+3，仍计使用次数（收益递减）并推进倒计时
    var risk = null, failed = false;
    if (cr.rate != null) {
      risk = this._rollRisk(cr.rate, cr.unmet);
      failed = !risk.success;
    }
    var useN = (this.actionUses[a.id] || 0) + 1;   // 本章第 n 次使用（n 从 1 计）
    this.actionUses[a.id] = useN;
    // 收益递减为剧本级开关（v1.9，ACTION_RULES.diminish；false = 无递减，李斯卡牌 v2 起）
    var noDim = this.d.ACTION_RULES && this.d.ACTION_RULES.diminish === false;
    var eff = failed ? { attrs: { weiji: 3 } } : (noDim ? JSON.parse(JSON.stringify(a.eff || {})) : this._scaleActionEff(a.eff || {}, useN));
    var changes = this.applyEff(eff);
    // 疾病推进（v1.8，剧本 ILLNESS）：出牌即耗时日——已病者转归，未病者掷发病（ill 流）
    if (this.d.ILLNESS) this._tickIllness(changes);
    var r = {
      kind: 'action', id: a.id, text: failed ? '徒劳一场。' : a.res, changes: changes,
      devDelta: eff.dev || 0, useCount: useN,
      achNew: null, bandUp: false, bandName: null,
      forcedEnding: false, risk: risk, failed: failed
    };
    // 主动行动结算同样过死亡判定（GDD 4.1）；致死则置 _next，UI 据 forcedEnding 调 proceed 收束
    var forcedEnding = this.checkDeath();
    if (forcedEnding) {
      this._next = forcedEnding;
      this.phase = 'settle';
      r.forcedEnding = true;
      return r;
    }
    return this._advanceRound(r);
  };

  /* 回合推进（行动卡/蓄势共用）：关键事件卡倒计时 -1；归零则强制进入关键事件抉择页（玩家亲自选择） */
  Game.prototype._advanceRound = function (r) {
    this.keyRoundsLeft--;
    if (this.keyRoundsLeft <= 0) {
      var opts0 = this.getOptions(), anyOpen = false;
      for (var oi = 0; oi < opts0.length; oi++) if (!opts0[oi].locked) { anyOpen = true; break; }
      if (anyOpen) {
        this.phase = 'event';
        r.forcedKey = true;   // UI：结算浮层「继续」后直接进入关键事件抉择页（renderEvent）
        // 成就「时不我待」：首次被倒计时赶上——历史不替你翻页，但会催你翻页
        if (this.unlockAch('shiwodai')) {
          var nm0 = this.d.ACHIEVEMENTS.shiwodai;
          if (nm0) r.achNew = r.achNew ? r.achNew + '、' + nm0 : nm0;
        }
      } else {
        /* 极端兜底：当前事件全部选项锁定（不应出现）——倒计时重置，避免死锁。
           v2.0.7：原写死 1（而非 keyCardRounds），把「3 回合」契约静默降级成 2，
           且该状态与快照/存档持有的值不一致。现复位到本章的既定限时。 */
        this.keyRoundsLeft = this.keyCardRounds;
        this.beginRounds();
        r.route = { type: 'round' };
      }
    } else {
      this.beginRounds();
      r.route = { type: 'round' };
    }
    return r;
  };

  /* 蓄势（v1.6）：放弃本轮出牌，静观其变——下一次事件抉择中的险招成功率 +10（封顶 70），
   * 每个关键事件限一次；无险招/抉择后即清空。倒计时照常 -1。 */
  Game.prototype.playXushi = function () {
    if (this.phase !== 'round' || this.xushi) return null;
    this.xushi = true;
    var r = {
      kind: 'xushi', text: '你按兵不动，把心思都留给了即将到来的那件事。',
      changes: [], devDelta: 0, achNew: null, bandUp: false, bandName: null,
      forcedEnding: false, risk: null, failed: false
    };
    var forcedEnding = this.checkDeath();
    if (forcedEnding) { this._next = forcedEnding; this.phase = 'settle'; r.forcedEnding = true; return r; }
    return this._advanceRound(r);
  };

  /* ---------- 抉择卡(次级关键事件) ---------- */

  Game.prototype.getChoiceCard = function () {
    if (this.phase !== 'choice' || !this.pendingCardId) return null;
    var a = this._actionById(this.pendingCardId);
    if (!a || !a.choice) return null;
    return { id: a.id, title: a.choice.title || a.name, segs: a.choice.segs || [], options: a.choice.options || [], usedCount: this.actionUses[a.id] || 0 };
  };

  Game.prototype.chooseCardOption = function (i) {
    if (this.phase !== 'choice' || !this.pendingCardId) return null;
    var a = this._actionById(this.pendingCardId);
    if (!a || !a.choice) return null;
    var opt = (a.choice.options || [])[i];
    if (!opt) return null;
    this.pendingCardId = null;
    this.choiceUsed[a.id] = true;   // 抉择卡整局一次性：落定后不再发
    var useN = (this.actionUses[a.id] || 0) + 1;
    this.actionUses[a.id] = useN;
    var noDim = this.d.ACTION_RULES && this.d.ACTION_RULES.diminish === false;
    var eff = noDim ? JSON.parse(JSON.stringify(opt.eff || {})) : this._scaleActionEff(opt.eff || {}, useN);
    var changes = this.applyEff(eff);
    if (this.d.ILLNESS) this._tickIllness(changes);
    var r = { kind: 'action', id: a.id, text: opt.res || '', changes: changes, devDelta: eff.dev || 0, useCount: useN,
      achNew: null, bandUp: false, bandName: null, forcedEnding: false, risk: null, failed: false };
    var forcedEnding = this.checkDeath();
    if (forcedEnding) { this._next = forcedEnding; this.phase = 'settle'; r.forcedEnding = true; return r; }
    return this._advanceRound(r);
  };

  Game.prototype.cancelChoice = function () {
    if (this.phase !== 'choice') return false;
    this.pendingCardId = null;
    this.phase = 'round';
    return true;
  };

  /* 疾病推进（v1.8，剧本 ILLNESS 配置开启；GDD 附录 T）：
   * 出牌即耗时日——
   * 已病：小病（minor）每次行动 left-1，归零自愈；大病（major）每次行动体魄 -drainTupo、
   *       危机 +drainWeiji（×难度系数），且病催人老（年龄额外 +1，加速衰老循环），唯「求医问药」可愈。
   * 未病：按体魄与年龄掷发病（ill 流，可注入测试）——体魄越低、年纪越大越易病；
   *       发病率 base + max(0,45-体魄)×0.004 + max(0,年龄-55)×0.004（封顶 0.35）；
   *       大病概率 0.2 + max(0,年龄-60)×0.01 + max(0,30-体魄)×0.01。
   * 寿元（v2.1.3）：体魄达 AGE.longevity 阈值得折寿点数，体魄项与年龄项均按折寿后的值计
   *       （effTupo = 体魄+折寿、effAge = 年龄-折寿）——「高体魄延寿」的疾病通道。
   * 病亡：体魄归零即死（见 checkDeath，非致命难度钳到 1）。 */
  Game.prototype._tickIllness = function (changes) {
    var ILL = this.d.ILLNESS; if (!ILL) return;
    var wj = this.diff.wj, dW;
    if (this.ill) {
      if (this.ill.type === 'minor') {
        this.ill.left = (this.ill.left != null ? this.ill.left : 2) - 1;
        if (this.ill.left <= 0) {
          this.ill = null;
          changes.push({ k: 'tupo', label: '体魄', delta: 0, note: '病体自愈——小病靠养，总算过去了' });
        }
      } else {
        this.attrs.tupo = this._clampA('tupo', this.attrs.tupo - (ILL.drainTupo || 2));
        dW = Math.round((ILL.drainWeiji || 2) * wj);
        this.attrs.weiji = this._clampA('weiji', this.attrs.weiji + dW);
        if (this.age != null) this.age += 1;
        changes.push({ k: 'tupo', label: '体魄', delta: -(ILL.drainTupo || 2), note: '沉疴缠身，病势日重，病一年老三年——须用「求医问药」' });
        changes.push({ k: 'weiji', label: '危机', delta: dW, note: '病中无人主事，谗言易入' });
      }
      return;
    }
    var tupo = this.attrs.tupo, age = this.age != null ? this.age : 30;
    /* 寿元（v2.1.3）：折寿点数同时抵减体魄项与年龄项——effTupo 视作「折寿后的筋骨」，
     * effAge 视作「折寿后的年纪」，故高体魄者在两处都更不易病，与章首抵衰同一口径。 */
    var cred = this._longevity();
    var effTupo = tupo + cred, effAge = Math.max(0, age - cred);
    var p = (ILL.base != null ? ILL.base : 0.03) + Math.max(0, 45 - effTupo) * 0.004 + Math.max(0, effAge - 55) * 0.004;
    if (this._stream('ill')() >= Math.min(0.35, p)) return;
    var majorP = 0.2 + Math.max(0, effAge - 60) * 0.01 + Math.max(0, 30 - effTupo) * 0.01;
    if (this._stream('ill')() < majorP) {
      this.ill = { type: 'major' };
      this.attrs.tupo = this._clampA('tupo', tupo - (ILL.onsetTupo || 5));
      dW = Math.round((ILL.onsetWeiji || 3) * wj);
      this.attrs.weiji = this._clampA('weiji', this.attrs.weiji + dW);
      changes.push({ k: 'tupo', label: '体魄', delta: -(ILL.onsetTupo || 5), note: '沉疴骤至，一病不起——非「求医问药」不能愈' });
      changes.push({ k: 'weiji', label: '危机', delta: dW, note: '病榻之侧，人心浮动' });
    } else {
      this.ill = { type: 'minor', left: 2 };
      this.attrs.tupo = this._clampA('tupo', tupo - 2);
      dW = Math.round(1 * wj);
      this.attrs.weiji = this._clampA('weiji', this.attrs.weiji + dW);
      changes.push({ k: 'tupo', label: '体魄', delta: -2, note: '偶感风寒——静养两轮可自愈，亦可即服「求医问药」' });
      if (dW) changes.push({ k: 'weiji', label: '危机', delta: dW, note: '病中耳目闭塞' });
    }
  };

  /* 收益递减：同章第 n 次使用同一行动（n 从 1 计），eff.attrs 中的"收益项"逐次减半、
   * 向 0 方向收敛且下限 ±1；代价项（危机正值、其余属性负值）不变。
   * 收益项 = 非危机属性的正值、危机的负值。递减只作用 eff.attrs，condAttrs/zg/dev/hist 不动。 */
  Game.prototype._scaleActionEff = function (eff, n) {
    var scaled = JSON.parse(JSON.stringify(eff || {}));
    if (!scaled.attrs || n <= 1) return scaled;
    var div = Math.pow(2, n - 1);
    Object.keys(scaled.attrs).forEach(function (k) {
      var v = scaled.attrs[k];
      if (k === 'weiji') {
        if (v < 0) scaled.attrs[k] = Math.min(-1, -Math.floor(Math.abs(v) / div));
      } else if (v > 0) {
        scaled.attrs[k] = Math.max(1, Math.floor(v / div));
      }
    });
    return scaled;
  };

  /* ---------- 事件进入钩子（节点内动态异变） ---------- */
  Game.prototype.onEventEnter = function () {
    var ev = this.findEvent(this.eventId);
    if (!ev || !ev.enterEffects) return;
    if (ev.enterOnce) {
      // enterOnce 是「进入副作用只生效一次」的闸，不是剧本 flag（v2.0.6 命名空间分离）
      if (this._once[ev.enterOnce]) return;
      this._once[ev.enterOnce] = true;
    }
    var self = this;
    ev.enterEffects.forEach(function (ef) {
      if (ef.if && !self.check(ef.if).ok) return;
      if (ef.setFlags) ef.setFlags.forEach(function (f) { self.flags[f] = true; });
      if (ef.attrs) Object.keys(ef.attrs).forEach(function (k) { self.attrs[k] = self._clampA(k, self.attrs[k] + ef.attrs[k]); });
      if (ef.zg) self.zg = clamp(self.zg + ef.zg);
      if (ef.zgSet != null) self.zg = clamp(ef.zgSet);
    });
  };

  /* 险招烧毁的键（v2.0.5）：此前只用 eventId + idx，而际遇/危机插入事件的 chapters
 * 跨多章（如李斯 R-5 跨 [2,5]），同一 id 在不同章是彼此无关的遭遇——第二章烧掉的选项
 * 到第五章仍显示「已试，事未谐」并锁死，而那边本是一次全新的相遇。改为按章隔离，
 * 与 passedEvents（随章重置）口径一致。 */
  Game.prototype._burnKey = function (i) { return this.chapterIdx + ':' + this.eventId + ':' + i; };

  /* 一次性闸的读取（v2.0.6）：新档走 s.once；旧档（v2.0.5 及更早）把内部闸混在
   * flags 里且键带 `_` 前缀，此处按前缀迁回 _once 并从 flags 剔除——否则旧档读入后
   * 同一闸会被重复触发（如【功高震主】危机再涨一次），且剧本 flag 命名空间继续被污染。 */
  Game.prototype._readOnce = function (s) {
    var once = Object.assign({}, s.once || {}), flags = this.flags || {};
    Object.keys(flags).forEach(function (k) {
      if (k.charAt(0) === '_'){ once[k] = true; delete flags[k]; }
    });
    return once;
  };

  /* 行动 id → 行动对象索引（v2.0.7）：此前 getOffer（每次回合渲染）与 playCard
   各自 forEach 全扫 ACTIONS（每本 60+ 条），都在交互热路径上。resetAll 时建一次。 */
  Game.prototype._indexActions = function () {
    var m = {};
    (this.d.ACTIONS || []).forEach(function (a) { m[a.id] = a; });
    return m;
  };
  Game.prototype._actionById = function (id) { return this._actions[id] || null; };

  /* 当前事件是否存在未锁定的选项（死锁判定用，v2.0.4 P1） */
  Game.prototype._hasOpenOption = function () {
    var opts = this.getOptions();
    for (var i = 0; i < opts.length; i++) if (!opts[i].locked) return true;
    return false;
  };

  /* ---------- 选项列表（含动态门槛调整与锁定原因） ----------
   * eventId 解析不到事件时返回空选项集（v2.0.3 P0 修复）：findEvent 对未知 id 返回 null，
   * 脏档曾直接抛 TypeError 打断整局。调用方据 opts.length === 0 走兜底（见 UI 侧死锁防护）。 */
  Game.prototype.getOptions = function () {
    var ev = this.findEvent(this.eventId);
    if (!ev || !ev.options || !ev.options.length) return [];
    var self = this;
   /* 删项审计钩子（v2.1.4 · GDD 附录 U.15 第四节）：`g.auditHide = {ev, idx}` 使指定选项
    * 在本局内不进入 getOptions —— 用于「摘掉该选项重跑，看结局分布是否位移」这一
    * 「选择有重量」的唯一可证伪检验（支柱 1）。只读不改数据，删项不落盘。
    * 非审计场景 game.auditHide 为 undefined，filter 不生效，行为与 v2.1.3 完全一致。 */
   var _opts = ev.options.map(function (o, i) {
   if (self.auditHide && self.auditHide.ev === ev.id && self.auditHide.idx === i) return null;
   var req = o.req ? Object.assign({}, o.req) : null;
      // 数据驱动的门槛修正（节点异变/Flag 话术升级等）：opt.reqAdjust = [{ if, attr, delta }]
      if (o.reqAdjust) {
        req = req || {};
        o.reqAdjust.forEach(function (ra) {
          if (!ra.if || self.check(ra.if).ok) req[ra.attr] = (req[ra.attr] || 0) + ra.delta;
        });
      }
      var locked = false, reason = null, risky = null;
      if (self._burned[self._burnKey(i)]) {
        locked = true; reason = '已试，事未谐';
      } else if (req) {
        var cr = self.checkRisk(req, false);
        if (!cr.hardOk) { locked = true; reason = cr.hardReason; }
        else if (cr.rate != null) risky = { rate: o.hist ? self.riskRateHist(cr.rate) : cr.rate, unmet: cr.unmet };
      }
   return { opt: o, locked: locked, reason: reason, hist: !!o.hist, risky: risky };
   });
   /* 删项审计：过滤掉被摘除的项（见上方 auditHide 注释）。非审计场景 filter 恒真，零行为变化。 */
   return self.auditHide && self.auditHide.ev === ev.id ? _opts.filter(Boolean) : _opts;
   };

  /* ---------- 选择 ---------- */
  Game.prototype.choose = function (i) {
    var ev = this.findEvent(this.eventId);
    var opts = this.getOptions();
    var entry = opts[i];
    if (!ev || !entry || entry.locked) return null;
    var o = entry.opt;
    // 蓄势结算（v1.6）：本次事件抉择生效，随后清空（无险招则落空）
    var xushiBonus = this.xushi ? 10 : 0;
    this.xushi = false;
    // 险招掷骰：软门槛未达标，先判定成败（成功与达标同路径；失败烧毁选项、留在本事件改选）
    var risk = null;
    if (entry.risky) {
      risk = this._rollRisk(Math.min(70, entry.risky.rate + xushiBonus), entry.risky.unmet);
      if (!risk.success) {
        this._burned[this._burnKey(i)] = true;
        var fchg = this.applyEff(o.effFail || { attrs: { weiji: 5 } });
        var fEnd = this.checkDeath();
        if (fEnd) { this._next = fEnd; this.phase = 'settle'; }
        else this.phase = 'event';
        return {
          failed: true, risk: risk,
          text: o.resFail || '事与愿违。时机未到，强行为之，徒增其败。',
          changes: fchg, devDelta: 0, achNew: null, bandUp: false, bandName: null,
          forcedEnding: !!fEnd
        };
      }
    }
    // 章内进度：剧本事件（非际遇/危机插入）choose 结算即视为"已通过"
    if (!this.currentRandom && this.eventId) this.passedEvents[this.eventId] = true;
    var beforeBand = this.devBand();
    var changes = this.applyEff(o.eff || {});
    // 章末偏离归因（际遇不产偏离，自然不入账）
    var devDelta0 = (o.eff && o.eff.dev) || 0;
    if (devDelta0 > 0) this.chapterDev.push({ ev: ev.title, t: o.t, dev: devDelta0 });
    // 复盘记录
    if (ev.key) {
      var histOpt = null;
      ev.options.forEach(function (x) { if (x.hist) histOpt = x; });
      this.keyChoices.push({
        node: this.d.KEY_NODE_NAMES[ev.id] || ev.title,
        you: o.t,
        hist: histOpt ? histOpt.t : '—',
        isHist: !!o.hist,
        dev: (o.eff && o.eff.dev) || 0
      });
    }
    var afterBand = this.devBand();
    var self = this;
    var achNew = (this._newAch || []).map(function (a) { return self.d.ACHIEVEMENTS[a]; }).filter(Boolean).join('、') || null;
    // 死亡判定（GDD 4.1：危机≥100 致死；非致命难度钳到 95。赵高威胁度≥70 为族诛，否则刺杀）
    var forcedEnding = this.checkDeath();
    this._next = forcedEnding || this.resolveTo(o.to);
    this.phase = 'settle';
    return {
      text: o.res || '',
      changes: changes,
      devDelta: (o.eff && o.eff.dev) || 0,
      achNew: achNew,
      bandUp: afterBand > beforeBand,
      bandName: this.d.DEV_BANDS[afterBand].name,
      forcedEnding: !!forcedEnding,
      risk: risk   // 险招成功时带掷骰记录（非险招为 null）
    };
  };

  /* ---------- 公共死亡判定：致死返回结局路由（proceed 可直接收束），否则返回 null ---------- */
  Game.prototype.checkDeath = function () {
    // 病亡（v1.8，剧本 ILLNESS）：体魄归零即死（ILLNESS.death 指定结局/变体）；非致命难度钳到 1（不致死，GDD 4.4 口径）
    if (this.d.ILLNESS && this.attrs.tupo <= 0) {
      if (this.diff.lethal) {
        var dd = this.d.ILLNESS.death || { ending: 'E8' };
        return { type: 'ending', ending: dd.ending, variant: dd.variant || null };
      }
      this.attrs.tupo = 1;
    }
    if (this.attrs.weiji < 100) return null;
    if (this.diff.lethal) return { type: 'ending', ending: 'E8', variant: this.zg >= 70 ? 'zuzhu' : 'cike' };
    // 非致命难度：危机钳到 95（GDD 4.4）。此处记录本次钳制，供结算页如实告知
    // ——此前钳制发生在 changes 已算完之后，章末 attrDelta 按快照算出的差值
    // 不含这次回落，玩家看到一个自己没被告知过的危机下降。
    this._weijiClamp = this.attrs.weiji - 95;
    this.attrs.weiji = 95;
    return null;
  };

  Game.prototype.applyEff = function (eff) {
    var changes = [], self = this;
    this._newAch = [];
    var names = this.d.ATTR_NAMES;
    if (eff.attrs) {
      Object.keys(eff.attrs).forEach(function (k) {
        var v = eff.attrs[k];
        if (k === 'weiji' && v > 0) v = Math.round(v * self.diff.wj);
        var old = self.attrs[k];
        self._setAttrRaw(k, self.attrs[k] + v);
        // delta 报**实际生效值**（v2.0.6）：此前直接报请求值，触顶时虚报——
        // 权势 99 +10 报 +10 而实际落 100（应为 +1），治病卡体魄 98 +5 报 +5（实际 +2）。
        // 结算浮层每次触顶都在说谎。归零的条目不列（与 setAttrs 口径一致）。
        var d = self.attrs[k] - old;
        if (d === 0) return;
        var chg = { k: k, label: names[k], delta: d };
        // eff.notes = { 属性键: 注记 }：给普通 attrs 结算条目挂注记（渲染同 condAttrs 的 note；
        // 用于 Flag 兑现类设计备注的结算体现，如 4-6-C 蒙恬生隙、5-1-D 北联蒙恬）
        if (eff.notes && eff.notes[k]) chg.note = eff.notes[k];
        changes.push(chg);
      });
    }
    if (eff.setAttrs) {
      Object.keys(eff.setAttrs).forEach(function (k) {
        var old = self.attrs[k];
        self._setAttrRaw(k, eff.setAttrs[k]);
        var d = self.attrs[k] - old;
        if (d !== 0) changes.push({ k: k, label: names[k], delta: d });
      });
    }
    // 条件增益（Flag 兑现类设计备注，如 2-2-A 需【知秦】增益、2-4 亲政后【王知我】权势+10）：
    // eff.condAttrs = [{ if:{...}, attrs:{...}, note:'…' }]，条件满足才结算，note 进结算条目
    if (eff.condAttrs) {
      eff.condAttrs.forEach(function (ca) {
        if (ca.if && !self.check(ca.if).ok) return;
        Object.keys(ca.attrs || {}).forEach(function (k) {
          var v = ca.attrs[k];
          if (k === 'weiji' && v > 0) v = Math.round(v * self.diff.wj);
          var old = self.attrs[k];
          self._setAttrRaw(k, self.attrs[k] + v);
          var d = self.attrs[k] - old;   // 报实际生效值（同 attrs 分支口径，v2.0.6）
          if (d !== 0) changes.push({ k: k, label: names[k], delta: d, note: ca.note });
        });
      });
    }
    // GDD 4.2：偏离度只增不减，负增量无效
    if (eff.dev > 0) {
      this.dev = Math.min(100, this.dev + eff.dev);
    }
    if (eff.flags) eff.flags.forEach(function (f) { self.flags[f] = true; });
    if (eff.rmflags) eff.rmflags.forEach(function (f) { delete self.flags[f]; });
    if (eff.zg) this.zg = clamp(this.zg + eff.zg);           // 赵高威胁度（隐藏，不进结算条目）
    if (eff.zgSet != null) this.zg = clamp(eff.zgSet);
    if (eff.hist) this.histScore += eff.hist;
    if (eff.merit && this.merits.indexOf(eff.merit) < 0) this.merits.push(eff.merit);
    // 成就：字符串为直接解锁；{id, if} 在数值生效后判定门槛（如书同文需声望≥60）
    if (eff.ach) {
      if (typeof eff.ach === 'string') this.unlockAch(eff.ach);
      else if (eff.ach.id && (!eff.ach.if || this.check(eff.ach.if).ok)) this.unlockAch(eff.ach.id);
    }
    // peak 已在 _setAttrRaw 内逐项维护（v2.0.6）
    // 属性触阈值隐性规则（危机正增量乘难度系数 diff.wj，GDD 4.4）
    var wj = this.diff.wj, dT;
    var jxFrom2 = (this.d.PERSIST && this.d.PERSIST.junxinFrom != null) ? this.d.PERSIST.junxinFrom : 0;
    var shichongOn2 = !(this.d.PERSIST && this.d.PERSIST.junxinShichong === false);
    if (this.attrs.quanshi >= 80 && !this._once._caizhi) { this._once._caizhi = true; dT = Math.round(8 * wj); this.attrs.weiji = clamp(this.attrs.weiji + dT); changes.push({ k: 'weiji', label: '危机', delta: dT, note: '权势过盛，君主猜忌' }); }
    if (this.attrs.junxin <= 15 && shichongOn2 && this.chapterIdx >= jxFrom2 && !this._once._shichong) { this._once._shichong = true; dT = Math.round(10 * wj); this.attrs.weiji = clamp(this.attrs.weiji + dT); changes.push({ k: 'weiji', label: '危机', delta: dT, note: '失宠于上' }); }
    if (this.attrs.caifu <= 0 && !this._once._menke) { this._once._menke = true; this.attrs.shengwang = clamp(this.attrs.shengwang - 5); changes.push({ k: 'shengwang', label: '声望', delta: -5, note: '门客散去' }); }
    // GDD 6.3 阈值状态提示：危机首次 ≥70 / ≥90 各提示一次（只加 note，不改数值）
    if (this.attrs.weiji >= 70 && !this._once._liuyan) { this._once._liuyan = true; changes.push({ k: 'weiji', label: '危机', delta: 0, note: '流言四起，你已身处流言中心' }); }
    if (this.attrs.weiji >= 90 && !this._once._mingxuan) { this._once._mingxuan = true; changes.push({ k: 'weiji', label: '危机', delta: 0, note: '命悬一线' }); }
    return changes;
  };

  Game.prototype.unlockAch = function (id) {
    if (this.ach.indexOf(id) >= 0) return false;
    this.ach.push(id);
    if (this._newAch) this._newAch.push(id);
    return true;
  };

  Game.prototype.resolveTo = function (to) {
    if (to == null) return { type: 'none' };
    if (typeof to === 'string') {
      if (to === 'NEXT') return { type: 'chapterEnd' };
      if (to === 'RETURN') return { type: 'return' };
      return { type: 'event', eventId: to };
    }
    if (Array.isArray(to)) {
      for (var i = 0; i < to.length; i++) {
        if (!to[i].if || this.check(to[i].if).ok) return this.resolveTo(to[i].to);
      }
      // GDD 9.1 判定树 #9：条件数组全部未命中（罕见异常态）→ E8【狱中死】兜底
      return { type: 'ending', ending: 'E8' };
    }
    if (to.ending) return { type: 'ending', ending: to.ending, variant: to.variant || null };
    return { type: 'none' };
  };

  /* ---------- 结算后推进（回合制：事件不再自动接续，一律回到回合重发牌） ---------- */
  Game.prototype.proceed = function () {
    var n = this._next;
    this._next = null;
    if (!n) return this.chapterEnd();
    if (n.type === 'event') {
      // 下一剧本事件成为新的关键事件卡：倒计时回满，重发一回合
      this.eventId = n.eventId;
      this.onEventEnter();
      this.keyRoundsLeft = this.keyCardRounds;
      this.beginRounds();
      return { type: 'round' };
    }
    if (n.type === 'return') {
      // 际遇/危机插入结束：回到被插入的剧本事件并重发一回合。
      // 插入本身不耗回合——关键卡倒计时回满（"际遇不消耗决策点"，GDD 附录 C.1 精神的回合制口径）
      this.eventId = this.pendingEventId;
      this.pendingEventId = null;
      this.currentRandom = null;
      this._skipRandom = true;
      this.onEventEnter();
      this.keyRoundsLeft = this.keyCardRounds;
      this.beginRounds();
      return { type: 'round', resumed: true };
    }
    if (n.type === 'ending') { this.finishEnding(n.ending, n.variant); return { type: 'ending' }; }
    if (n.type === 'chapterEnd') return this.chapterEnd();
    // 空路由兜底：回到当前事件的回合（不应出现，防御性处理）
    this.beginRounds();
    return { type: 'round' };
  };

  /* 修正事件的系数口径（v2.0.5）：修正强度 diff.corr 只作用于**非危机**属性，
   * 危机增量一律交给 applyEff 的 diff.wj（附录 D #14「危机难度系数全口径」）。
   * 此前章末修正对 weiji 先乘 corr、applyEff 再乘 wj，修正事件的危机吃了两层系数
   * （硬核 1.3×1.2），而消费同一份 CORRECTIONS 数据的逆天反噬路径不乘 corr——
   * 两条路径相差一个 corr 因子（实测硬核危机 +10 → 16）。现统一口径。 */
  Game.prototype.correctionEff = function (c) {
    var eff = JSON.parse(JSON.stringify(c.eff || {})), corr = this.diff.corr;
    if (eff.attrs && corr !== 1){
      Object.keys(eff.attrs).forEach(function (k) {
        if (k !== 'weiji' && eff.attrs[k]) eff.attrs[k] = Math.round(eff.attrs[k] * corr);
      });
    }
    return eff;
  };

  /* ---------- 章末：章末事件 → 修正 → 下一章 ---------- */
  Game.prototype.chapterEnd = function () {
    var ch = this.chapter();
    var self = this;
    if (ch.endEvents && !this._endEventsChecked) {
      this._endEventsChecked = true;
      this.pendingEndEvents = ch.endEvents.filter(function (e) { return self.check(e.if).ok; });
    }
    if (this.pendingEndEvents && this.pendingEndEvents.length > 0) {
      this.currentEndEvent = this.pendingEndEvents.shift();
      this.phase = 'endEvent';
      return { type: 'endEvent', event: this.currentEndEvent };
    }
    this._endEventsChecked = false;
    // 历史修正（corr 流：触发判定与抽取）
    var band = this.devBand();
    if (band > 0) {
      var pool = this.d.CORRECTIONS.filter(function (c) { return self.dev >= c.minDev && self.dev <= c.maxDev; });
      if (pool.length > 0) {
        /* v2.0.5：抽取改为按各自 chance 加权。此前「一次 roll 对池内每个 chance 判是否触发，
         * 过了再对池长均匀抽」——是否触发实际取决于池内 max(chance)，而选哪条与 chance 无关
         * （实测三条 chance 均 0.3 的池在 roll 0.29 触发、0.31 跳过，第二次 roll 只决定
         * 「是哪条」）。加权抽一次即口径正确：池内任一条的边际概率 = chance/Σchance，
         * 池总触发概率 = max(chance)，与原「是否触发」一致。 */
        var total2 = pool.reduce(function (s, c) { return s + c.chance; }, 0);
        var c = null;
        if (total2 > 0) {
          var pick2 = this._stream('corr')() * total2, acc2 = 0;
          for (var ci = 0; ci < pool.length; ci++){ acc2 += pool[ci].chance; if (pick2 < acc2) { c = pool[ci]; break; } }
          if (!c) c = pool[pool.length - 1];
        } else c = pool[Math.floor(this._stream('corr')() * pool.length)];
        if (c && (band >= 2 || this._stream('corr')() < c.chance)) {
          var changes = this.applyEff(this.correctionEff(c));
          var forced = this.checkDeath();
          this.correction = { title: c.title, segs: c.segs, changes: changes, forced: forced };
          this._corrShown = c.title;
          this.phase = 'correction';
          return { type: 'correction', correction: this.correction };
        }
      }
    }
    return this.makeSummary();
  };

  Game.prototype.endEventChoose = function (i) {
    var ev = this.currentEndEvent;
    var o = ev && ev.options[i];
    if (!o) return null;
    // 章末选项门槛由引擎兜底校验（v1.6.2 P1 修复：UI 锁只是展示层，引擎不依赖 UI 防御）
    if (o.req && !this.check(o.req).ok) return null;
    var changes = this.applyEff(o.eff || {});
    var devDelta0 = (o.eff && o.eff.dev) || 0;
    if (devDelta0 > 0) this.chapterDev.push({ ev: ev.title, t: o.t, dev: devDelta0 });
    this.currentEndEvent = null;
    // 章末事件结算同样过死亡判定（GDD 4.1）；致死则强制收束，UI 据 forcedEnding 路由
    var forcedEnding = this.checkDeath();
    var r = { text: o.res, changes: changes, devDelta: (o.eff && o.eff.dev) || 0, forcedEnding: !!forcedEnding };
    this._next = forcedEnding || (o.to ? this.resolveTo(o.to) : null);
    this.phase = 'settle';
    return r;
  };

  Game.prototype.proceedAfterEndEvent = function () {
    if (this._next) return this.proceed();
    return this.chapterEnd();
  };

  Game.prototype.correctionContinue = function () {
    if (this.correction && this.correction.forced) {
      this.finishEnding(this.correction.forced.ending, this.correction.forced.variant);
      return { type: 'ending' };
    }
    this.correction = null;
    return this.makeSummary();
  };

  /* ---------- 章末结算页（GDD 3.1/5.4：偏离归因 + 属性总览 + 修正说明） ---------- */
  Game.prototype.makeSummary = function () {
    var snapAttrs = (this.snapshot && this.snapshot.attrs) || this.d.INIT;
    var attrDelta = {}, self = this;
    Object.keys(this.d.ATTR_NAMES).forEach(function (k) {
      var d = self.attrs[k] - (snapAttrs[k] != null ? snapAttrs[k] : 0);
      if (d !== 0) attrDelta[k] = d;
    });
    // 非致命难度的危机钳制（checkDeath 的 95 封顶）如实并入差值（v2.0.6）：
    // 该回落此前不可见，玩家看到一个未被告知的危机下降。
    if (this._weijiClamp) {
      attrDelta.weiji = (attrDelta.weiji || 0) - this._weijiClamp;
      this._weijiClamp = 0;
    }
    var next = this.d.CHAPTERS[this.chapterIdx + 1] || null;
    this.phase = 'summary';
    return {
      type: 'summary',
      summary: {
        chapter: this.chapter().title,
        devLog: this.chapterDev.slice(),
        attrDelta: attrDelta,
        corrTitle: this._corrShown,
        notes: this.chapter().summaryNotes || [],
        nextTitle: next ? next.title : null,
        bandName: this.d.DEV_BANDS[this.devBand()].name,
        dev: this.dev
      }
    };
  };

  Game.prototype.proceedSummary = function () {
    return this.nextChapter();
  };

  Game.prototype.nextChapter = function () {
    if (this.chapterIdx + 1 < this.d.CHAPTERS.length) {
      this.enterChapter(this.chapterIdx + 1);
      return { type: 'chapter', chapter: this.chapter() };
    }
    return { type: 'none' };
  };

  /* ---------- 回溯 ---------- */
  Game.prototype.canBacktrack = function () {
    if (this.phase === 'home') return false;
    if (this.phase === 'ending') return false;   // v2.0.5：终局不可撤销（结局页曾给出回溯入口，
    // 致死亡/达成结局后仍能回到本章开头，renderIntro 的 saveGame 又把「已结束」的进度写回存档）
    if (this.diff.backtrack === 0) return false;
    if (this.diff.backtrack > 0 && this.backtracksThisChapter >= this.diff.backtrack) return false;
    return !!this.snapshot;
  };

  Game.prototype.backtrack = function () {
    if (!this.canBacktrack()) return false;
    var s = this.snapshot;
    var keepDev = Math.max(s.dev, this.dev); // 偏离度不重置
    var keepAch = this.ach.slice();          // 已解锁成就/图鉴不重置（GDD 6.4）
    this.attrs = Object.assign({}, s.attrs);
    this.flags = Object.assign({}, s.flags);
    this._once = this._readOnce(s);
    this.histScore = s.histScore;
    this.merits = s.merits.slice();
    this.ach = s.ach.slice();
    keepAch.forEach(function (a) { if (this.ach.indexOf(a) < 0) this.ach.push(a); }, this);
    this.keyChoices = s.keyChoices.slice();
    this.peak = Object.assign({}, s.peak);
    this.zg = s.zg != null ? s.zg : this.zg;
    this.dev = keepDev;
    this.eventId = s.eventId;
    this.pendingEventId = s.pendingEventId || null;
    this.currentRandom = s.currentRandom || null;
    this._crisisPlotPending = !!s.crisisPlotPending;
    // 回合制状态随快照恢复（offer 不存，回到 intro 后由 beginRounds 重发）
    this.keyRoundsLeft = s.keyRoundsLeft != null ? s.keyRoundsLeft : this.keyCardRounds;
    this.actionUses = Object.assign({}, s.actionUses || {});
    this.choiceUsed = Object.assign({}, s.choiceUsed || {});
    this.choiceGap = s.choiceGap != null ? s.choiceGap : 1;
    this.pendingCardId = null;
    this.passedEvents = Object.assign({}, s.passed || {});
    // 时间线重写：蓄势与险招烧毁属上一条时间线的决策痕迹，不随回溯穿越（v1.6.1 P0 修复）
    this.xushi = false;
    this._burned = {};
    this.age = s.age != null ? s.age : this.age;             // 年龄/疾病随快照恢复（v1.8）
    this.ill = s.ill ? Object.assign({}, s.ill) : null;
    this.introNotes = (s.introNotes || []).slice();          // 章首注记随快照恢复（v2.0.5）
    this.coef = (typeof s.coef === 'number' && isFinite(s.coef)) ? s.coef : this.coef;   // v2.0.5
    this.offer = null;
    this.backtracksThisChapter++;
    this.coef = Math.round(this.coef * 0.98 * 100) / 100;
    this.pendingEndEvents = [];
    this.currentEndEvent = null;
    this.correction = null;
    this._endEventsChecked = false;
    this.chapterDev = [];
    this._corrShown = null;
    this._backlashDone = false;
    this.ending = null;          // 陈旧结局对象不得跨回溯残留（v2.0.5）
    // 章内际遇状态归零（v2.0.5）：「回到本章开头」须连本章已触发的际遇次数与牌堆一并归位。
    // 此前 deck 与 randomCount 原样保留，回溯后本章可触发的际遇比章首时更少。
    this.randomCount = 0;
    this.chapterDeck = this._buildChapterDeck(this.chapterIdx);
    this._skipRandom = false;
    this.phase = 'intro';
    return true;
  };

  /* ---------- 跨会话存档（GDD 6.4；引擎只出纯数据方法，存取/localStorage 归 UI 管） ----------
   * 存档语义 = 章首存档点，与回溯共用 snapshot 结构。*/

  // 剧情/普通难度（有回溯额度）且已有章首快照时导出纯 JSON 对象；硬核或无快照返回 null
  Game.prototype.exportSave = function () {
    // 单局即一生的剧本（随机命局，SCENARIO.noSave）：契约下沉到引擎，不依赖 UI 拦截
    if (this.d.SCENARIO && this.d.SCENARIO.noSave) return null;
    if (this.diff.backtrack === 0) return null;
    if (!this.snapshot) return null;
    var s = JSON.parse(JSON.stringify(this.snapshot));
    // currentRandom 是整只事件对象：序列化只存其 id，恢复时按 id 从事件池重建（见 importSave）
    s.currentRandomId = this.snapshot.currentRandom ? this.snapshot.currentRandom.id : null;
    delete s.currentRandom;
    return { diffKey: this.diffKey, scenKey: this.d.SCENARIO.id, chapterIdx: this.chapterIdx, snapshot: s,
             backtracksThisChapter: this.backtracksThisChapter };  // 回溯次数随档保存，防跨会话刷新（GDD 6.4 补注）
  };

  /* id 是否能在当前章解析为事件：本章 events 池或插入事件池（RANDOM / CRISIS）之一。
   * 供 importSave 校验 eventId/pendingEventId 用——脏档的未知 id 会让 getOptions 返回空集，
   * 玩家在无任何选项的页面上永久卡死（v2.0.3 P0）。 */
  Game.prototype._eventResolvable = function (id) {
    if (this.findEvent(id)) return true;
    return !!this._findInsertEvent(id);
  };

  // 从 RANDOM / CRISIS 事件池按 id 重建插入事件（BACKLASH 为临时构造对象，不在池中）
  Game.prototype._findInsertEvent = function (id) {
    var pools = [this.d.RANDOM_EVENTS || []];
    if (this.d.CRISIS_EVENTS) {
      pools.push(this.d.CRISIS_EVENTS.plots || []);
      if (this.d.CRISIS_EVENTS.death) pools.push([this.d.CRISIS_EVENTS.death]);
      if (this.d.CRISIS_EVENTS.qingsuan) pools.push([this.d.CRISIS_EVENTS.qingsuan]);
    }
    for (var i = 0; i < pools.length; i++)
      for (var j = 0; j < pools[i].length; j++)
        if (pools[i][j].id === id) return pools[i][j];
    return null;
  };

  // 恢复到存档所示章的章首状态；校验失败返回 false
  Game.prototype.importSave = function (obj) {
    if (!obj || typeof obj !== 'object') return false;
    if (obj.diffKey !== this.diffKey) return false;   // 存档与难度绑定（难度系数不同，不可串档）
    // 剧本身份绑定（v2.0.3 P0）：五剧本属性维度同名（十一维），原校验只看难度，
    // 跨剧本的档可被导入他本对局——带着别人的 flags 与 eventId 进入不可达内容，并覆写本剧本存档。
    // 旧档（无 scenKey）按字段缺省放行，兼容 v2.0.1 及更早的存档。
    if (obj.scenKey != null && obj.scenKey !== this.d.SCENARIO.id) return false;
    if (typeof obj.chapterIdx !== 'number' || !this.d.CHAPTERS[obj.chapterIdx]) return false;
    var s = obj.snapshot;
    if (!s || !s.attrs || typeof s.attrs !== 'object' || Array.isArray(s.attrs)) return false;
    // 提前落 chapterIdx：随后的 eventId 可解析性校验需按目标章的事件池判（findEvent 依赖 chapter()）
    this.chapterIdx = obj.chapterIdx;
    // 存档为不可信输入（localStorage）：关键字段类型/范围校验，脏档拒绝导入（v1.6.5）
    for (var ak in s.attrs) { if (typeof s.attrs[ak] !== 'number' || !isFinite(s.attrs[ak])) return false; }
    if (s.dev != null && (typeof s.dev !== 'number' || !isFinite(s.dev) || s.dev < 0)) return false;
    if (s.ach != null && !Array.isArray(s.ach)) return false;   // 成就列表：脏档（字符串/对象）拒收
    var bt = obj.backtracksThisChapter;
    if (bt == null) bt = 0;
    if (typeof bt !== 'number' || !isFinite(bt) || Math.floor(bt) !== bt || bt < 0) return false;
    if (this.diff.backtrack > 0 && bt > this.diff.backtrack) return false;
    if (s.age != null && (typeof s.age !== 'number' || !isFinite(s.age) || s.age < 0)) return false;   // 年龄（v1.8）
    if (s.ill != null && (typeof s.ill !== 'object' || (s.ill.type !== 'minor' && s.ill.type !== 'major'))) return false;   // 疾病（v1.8）
    // v2.0.3 P0 修复（补齐此前遗漏的字段校验——漏检的后果是「脏档导入成功」而非被拒，
    // SPEC.md「坏档清除回主页」的 UI 清理分支因此永不触发）：
    //   histScore/peak 曾无校验 → NaN 渗入结局评分（total/grade 静默变 NaN/D）；
    //   attrs 曾只校验 number+isFinite 不校验范围 → weiji:500 下一回合即刻致死、负值属性污染后续钳制；
    //   zg 曾无校验 → NaN 落入隐藏 NPC 值；keyChoices/merits/flags/actionUses 曾不校验容器类型。
    var numOk = function (v) { return typeof v === 'number' && isFinite(v); };
    var numRange = function (v, lo, hi) { return numOk(v) && v >= lo && v <= hi; };
    if (s.histScore != null && !numOk(s.histScore)) return false;
    if (s.peak != null && (typeof s.peak !== 'object' || Array.isArray(s.peak))) return false;
    if (s.peak) { for (var pk in s.peak) if (!numRange(s.peak[pk], 0, 1000)) return false; }
    if (s.zg != null && !numRange(s.zg, 0, 100)) return false;
    if (s.merits != null && !Array.isArray(s.merits)) return false;
    if (s.keyChoices != null && !Array.isArray(s.keyChoices)) return false;
    if (s.flags != null && (typeof s.flags !== 'object' || Array.isArray(s.flags))) return false;
    if (s.actionUses != null && (typeof s.actionUses !== 'object' || Array.isArray(s.actionUses))) return false;
    if (s.choiceUsed != null && (typeof s.choiceUsed !== 'object' || Array.isArray(s.choiceUsed))) return false;
    if (s.choiceGap != null && (!numOk(s.choiceGap) || s.choiceGap < 0)) return false;
    if (s.passed != null && (typeof s.passed !== 'object' || Array.isArray(s.passed))) return false;
    if (s.keyRoundsLeft != null && (!numOk(s.keyRoundsLeft) || s.keyRoundsLeft < 0)) return false;
    var attrs2 = Object.assign({}, s.attrs);        // 不就地改快照对象（exportSave 产物可能被复用）
    for (var ak2 in attrs2) {
      var k2 = ak2;
      if (!this.d.ATTR_NAMES[k2]) return false;                 // 未知属性键 = 跨剧本脏档
      if (!numRange(attrs2[k2], 0, this.attrMax(k2))) return false;   // 范围须落在本剧本 per-attr 上限内
    }
    for (var ak3 in this.d.ATTR_NAMES) {                        // 缺失维度按 INIT 补齐（否则 _clampA 遇 undefined 得 NaN）
      if (attrs2[ak3] == null) attrs2[ak3] = this._clampA(ak3, this.d.INIT[ak3] != null ? this.d.INIT[ak3] : 0);
    }
    // eventId 须可解析（v2.0.3 P0）：不可解析时不做硬拒（BACKLASH 等临时构造事件不在池中，
    // 跨剧本脏档则回退到 pendingEventId / 章起始事件），而是无条件回退到可解析 id——
    // 保留既有「插入事件查不到即回退原事件」语义，同时杜绝 getOptions 空集死局。
    var evId = s.eventId;
    if (evId != null && !this._eventResolvable(evId)) evId = null;
    var pendId = s.pendingEventId != null && this._eventResolvable(s.pendingEventId) ? s.pendingEventId : null;
    if (evId == null && pendId == null) {
      var ch2 = this.chapter(), start2 = ch2.start;
      if (ch2.startAlt) {
        for (var sa = 0; sa < ch2.startAlt.length; sa++) if (this.check(ch2.startAlt[sa].if).ok) { start2 = ch2.startAlt[sa].start; break; }
      }
      evId = (start2 && this._eventResolvable(start2)) ? start2 : ((ch2.events[0] && ch2.events[0].id) || null);
      if (evId == null) return false;   // 本章无任何可解析事件：确实是坏档
    }
    // 逐项还原章首状态（回溯次数随档恢复；coef 随快照存取——纯时间线状态，
    // 与 backtrack 同一「回到章首」语义，见 makeSnapshot 注释）
    this.attrs = attrs2;
    this.dev = s.dev || 0;
    this.flags = Object.assign({}, s.flags || {});
    this._once = this._readOnce(s);      // v2.0.6：同 backtrack，旧档的 _ 前缀键迁回独立命名空间
    this.histScore = s.histScore || 0;
    this.merits = (s.merits || []).slice();
    // 已解锁成就不因读档回退（v1.6.8 P1-2 修复）：与 backtrack() 同一"成就保留"语义。
    // 存档为章首快照，只含该章开局前解锁的成就；UI 侧 newGame() 已先灌入 localStorage
    // 跨局累计成就。此处若直接覆盖，跨会话累计的成就将被截断，且随后一次 saveCollection()
    // 写回即不可逆丢失——故改为「快照 ∪ 已有」合并。
    var keepAch = this.ach.slice();
    this.ach = (s.ach || []).slice();
    keepAch.forEach(function (a) { if (this.ach.indexOf(a) < 0) this.ach.push(a); }, this);
    this.keyChoices = (s.keyChoices || []).slice();
    this.peak = Object.assign({ quanshi: 0, junxin: 0 }, s.peak || {});   // 缺键补 0（否则 gongye 评分得 NaN）
    this.zg = s.zg != null ? s.zg : ((this.d.HIDDEN && this.d.HIDDEN.init != null) ? this.d.HIDDEN.init : 30);
    this.eventId = evId;
    this.pendingEventId = pendId;
    this._crisisPlotPending = !!s.crisisPlotPending;
    this.keyRoundsLeft = s.keyRoundsLeft != null ? s.keyRoundsLeft : this.keyCardRounds;
    this.actionUses = Object.assign({}, s.actionUses || {});
    this.choiceUsed = Object.assign({}, s.choiceUsed || {});
    this.choiceGap = s.choiceGap != null ? s.choiceGap : 1;
    this.passedEvents = Object.assign({}, s.passed || {});
    this.age = s.age != null ? s.age : ((this.d.AGE && this.d.AGE.init != null) ? this.d.AGE.init : null);
    this.ill = s.ill ? Object.assign({}, s.ill) : null;
    // 章首注记与 coef 随档恢复（v2.0.5）：此前注记被清空（属性效果却在快照里，
    // 读档后「属性被改了但没有解释」），coef 则因注释称重置为 1 却无赋值而存活
    this.introNotes = (s.introNotes || []).slice();
    this.coef = (typeof s.coef === 'number' && isFinite(s.coef)) ? s.coef : 1;
    this.offer = null;
    this.pendingCardId = null;
    // 章内进度分母口径：快照未存起点 id，按存档语义还原（有插入事件时 pendingEventId 即剧本起点）
    this._chapterStartId = pendId || evId || null;
    // 插入事件按 id 重建；查不到（如 BACKLASH）则回退到被插入的剧本事件并清空插入状态——
    // 反噬/际遇在插入时刻尚未结算，回到原事件重走一次即可，语义安全
    var rid = s.currentRandomId || null;
    var rev = rid ? this._findInsertEvent(rid) : null;
    if (rid && !rev) { this.eventId = this.pendingEventId || this.eventId; this.pendingEventId = null; }
    this.currentRandom = rev;
    // 章内状态按章首语义重置，并重建本章际遇牌堆（enterChapter / backtrack 同一过滤口径）
    // 回溯次数从存档恢复（缺失按 0，兼容旧档）——普通难度"每章 1 次"不可经重新载入刷新
    this.backtracksThisChapter = bt;
    this.randomCount = 0;
    this.chapterDeck = this._buildChapterDeck(this.chapterIdx);
    this.chapterDev = [];
    this._corrShown = null;
    this._backlashDone = false;
    this.pendingEndEvents = [];
    this.currentEndEvent = null;
    this.correction = null;
    this._endEventsChecked = false;
    this._newAch = [];
    this._skipRandom = false;
    // 以还原后的状态重拍快照，本章内的回溯仍回到同一章首点
    this.snapshot = this.makeSnapshot();
    this.phase = 'intro';
    return true;
  };

  /* ---------- 结局 ---------- */
  Game.prototype.finishEnding = function (id, variant) {
    this._newAch = [];
    // 数据驱动结局成就：ENDINGS[E].ach[] + variantAch[variant][]；逆天结局通用追加 nitian（剧本有定义时）
    var def0 = this.d.ENDINGS[id];
    var achIds = (def0 && def0.ach || []).slice();
    if (def0 && def0.variantAch && variant && def0.variantAch[variant]) achIds = achIds.concat(def0.variantAch[variant]);
    if (def0 && def0.nitian && this.d.ACHIEVEMENTS && this.d.ACHIEVEMENTS.nitian) achIds.push('nitian');
    var selfAch = this;
    achIds.forEach(function (a) { selfAch.unlockAch(a); });
    this.ending = this.buildEnding(id, variant);
    var self = this;
    this.ending.achNew = (this._newAch || []).map(function (a) { return self.d.ACHIEVEMENTS[a]; }).filter(Boolean).join('、') || null;
    this.phase = 'ending';
  };

  Game.prototype.buildEnding = function (id, variant) {
    var self = this;
    var def = this.d.ENDINGS[id];
    // v2.0.6：结局不存在时不再抛 TypeError（finishEnding('E99') 曾直接崩在 def.variants）。
    // 回落到剧本的死亡结局 E8；连 E8 都没有时给一个最小可渲染的结局对象，
    // 不让一次数据不一致在最坏的时刻（玩家濒死/收束）变成崩溃。
    if (!def){
      var fb = this.d.ENDINGS.E8;
      def = fb || { id: id, name: '终局', zhuan: '史笔至此中断。', cuncun: 0, seal: 'xunshi', epilogue: '' };
      id = 'E8'; variant = null;
    }
    var v = variant && def.variants ? def.variants[variant] : null;
    var meritScore = 0;
    var meritMap = this.d.MERIT_MAP || { '长史': 5, '廷尉': 8, '丞相': 20, '郡县': 15, '书同文': 15 }; // 剧本可覆写（MERIT_MAP）
    this.merits.forEach(function (m) { meritScore += meritMap[m] || 0; });   // v2.0.6：未知功业原按 8 分兜底（可白拿 S 级），改为不计
    /* 功业（v2.1.0 修订 · GDD 5.5 + 附录 S.2）
     * 原式：权势峰值×0.6 + 功业标记。问题：十一维里只有「权势」唯一可自由刷
     * （全书 9–21 个 +权势 选项，合计 +58~+118），故 35% 的最高权重实际只由
     * 一个维度驱动；其余十个维度对总分零贡献，而「政绩」在附录 S 被明确定义为
     * 「MERIT 功业的自然化轨道」却从未进公式。
     * 改为权势峰值×0.45 + 政绩×0.15 + 功业标记：两项经营向指标分担同一权重，
     * 与 GDD 附录 S 的设计分工（环境属性管结果、政绩是功业的自然化轨道）对齐。 */
    var gongye = clamp((this.peak.quanshi || 0) * 0.45 + (this.attrs.zhengji || 0) * 0.15 + meritScore);
    var cuncun = def.cuncun || 0;
    // GDD 四章章末注：韩非存活至结局，史评 +10（clamp 前计入）
    // 史评加成（数据驱动：数据顶层 SHIPING_BONUS_FLAGS = [{flag, bonus}]）
    var shipBonus = 0;
    (this.d.SHIPING_BONUS_FLAGS || []).forEach(function (sb) { if (self.flags[sb.flag]) shipBonus += sb.bonus; });
    var shiping = clamp(50 + this.histScore * 0.5 + shipBonus);
    if (def.seal === '循史') shiping = Math.max(shiping, 35); // 成为正史本身，史评有下限
    var yingxiang = clamp(this.dev * 0.6 + gongye * 0.4); // 历史影响 = 改写幅度 + 功业高度
    /* 四维权重（v2.1.0 修订 · GDD 5.5）：存续 25% → 30%，功业 35% → 30%。
     * 存续是**唯一编码结局性质**的维度（结局定义值），原先只占 25% 却被完全可
     * 自由刷的权势压过 —— 实测（1200 局/剧本）苟活线 E2（存续 100）均分 38.3、
     * 仅 31% 达到 GDD 9.2 登记的基准 C（≥40），而功业满配的 E8 败局可达 51.5（B 档）：
     * 「苟活得漂亮」与「死了但功业完整」同档甚至倒挂，评级不传达路线性质。
     * 提权后 E2 达标率 100%，且逆天 > 稳健 > 循史 > 苟活 > 败局 的性质序保持
     * （败局仅在 MERIT 满配时上浮至 B——附录 B/1365 已登记为预期行为）。 */
    var raw = 0.30 * gongye + 0.30 * cuncun + 0.20 * shiping + 0.20 * yingxiang;
    var total = raw * this.diff.coef * (def.nitian ? 1.15 : 1) * (this.coef || 1);
    total = Math.round(total);
    if (!isFinite(total)) total = 0;   // v2.0.6：脏状态（脏档/脏数据）不得让评分变 NaN
    var grade = total >= 85 ? 'S' : total >= 70 ? 'A' : total >= 55 ? 'B' : total >= 40 ? 'C' : 'D';
    var devC = this.dev;
    var epilogue;
    if (devC <= 20) epilogue = '你完整复刻了他的一生，包括他的错误。史书翻到今天，仍写着你的名字与骂名。历史给了你所有提示，你决定照抄一遍——这也是一种玩法。';
    else if (devC <= 45) epilogue = '你在大势之内做了几次小小的挣扎。史书的正文没有变，但字里行间，多了几处只有你知道的批注。';
    else epilogue = '史官的笔追不上你。从某个抉择开始，这就成了一段无人见过的新历史——无论结局如何，它属于你。';
    // GDD 8 章 0-4-B / 4-1-A 设计备注：乡愁（xiangchou）与知止（zhizhi）影响 E4 史传尾声，两段可叠加
    var zhuan = v ? v.zhuan : def.zhuan;
    // 数据驱动的史传尾声叠加：ENDINGS[E].zhuanAppends = [{ if, text }]
    if (def.zhuanAppends) {
      def.zhuanAppends.forEach(function (za) {
        if (!za.if || self.check(za.if).ok) zhuan += za.text;
      });
    }
    zhuan = zhuan || def.zhuan || '';   // v2.0.6：变体缺 zhuan 时回落到本体，不渲染 undefined
    // GDD 4-5-B 设计备注：焚书折中（zhezhong）——E4/E6 史传追加尾声句（官藏代焚，书得不绝）
    if ((id === 'E4' || id === 'E6') && this.flags.zhezhong) zhuan += '史又曰：焚书之议起，斯以官藏代焚，典籍得不绝于灰烟。天下读书人受其赐而不知，斯亦终不自言。';
    return {
      id: id, variant: variant,
      name: v ? v.name : def.name,
      seal: def.seal,
      zhuan: zhuan,
      nitian: def.nitian,
      aliveNote: (function () { var an = def.aliveNote || self.d.ALIVE_NOTE; return (an && self.flags[an.flag]) ? an.text : null; })(), // 结局附加提示（数据驱动）
      scores: { gongye: gongye, cuncun: cuncun, shiping: shiping, yingxiang: yingxiang },
      merits: this.merits.slice(),
      dev: this.dev,
      total: total, grade: grade,
      diffName: this.diff.n,
      review: this.keyChoices.slice(),
      epilogue: epilogue
    };
  };

  /* ---------- 随机际遇 ----------
   * 由 UI 在每回合结算后（phase 'round'）或进入事件后（phase 'event'）调用；
   * 触发则当前事件被替换为际遇事件（phase 转 'event'），际遇选项 to:'RETURN'
   * 结算后由 proceed 回到被插入的剧本事件并重发一回合。 */
  Game.prototype.maybeRandom = function () {
    if (this._skipRandom) { this._skipRandom = false; return null; }
    var inPlay = (this.phase === 'event' || this.phase === 'round');
    // event 流：际遇触发判定与抽取、危机注入抽取（以下各取值点经 this._stream('event')() 取值）
    // GDD 4.1 危机 70–89：每章确定性注入一次构陷/暗杀际遇（不走概率、不占 randomCount 配额）
    if (this._crisisPlotPending && inPlay && !this.currentRandom) {
      var ppool = (this.d.CRISIS_EVENTS && this.d.CRISIS_EVENTS.plots) || [];
      if (ppool.length > 0) {
        this._crisisPlotPending = false;
        var pev = ppool[Math.floor(this._stream('event')() * ppool.length)];
        this.pendingEventId = this.eventId;
        this.eventId = pev.id;
        this.currentRandom = pev;
        this.phase = 'event';
        return pev;
      }
    }
    if (!this.randomOn) return null;
    if (!inPlay || this.currentRandom) return null;
    // 逆天段（偏离≥71）：章中触发一次反噬，复用际遇插入机制（GDD 5.2 / 附录 D #7）
    // 口径（v1.6.8 P1-3 修复）：GDD 为「偏离≥71 后**每章一次**反噬」——入逆天段即每章必遇一次，
    // 「随机」指的是从重度修正池**抽取哪一条**，不是"是否触发"。此前此处复用 randomChance
    // （际遇触发率 0.4）作概率闸门，与 randomOn=false 的确定性测试也相互干扰。
    // 现改为确定性触发（_backlashDone 仍保证每章至多一次）；池为空时静默跳过，退化为无反噬章。
    if (!this._backlashDone && this.devBand() >= 3) {
      this._backlashDone = true;
      var bpool = this.d.CORRECTIONS.filter(function (c) { return c.minDev >= 71; });
      if (bpool.length > 0) {
        var bc = bpool[Math.floor(this._stream('event')() * bpool.length)];
        var bev = { id: 'BACKLASH', title: bc.title, segs: bc.segs,
          options: [{ t: '咬牙撑住', res: '你挺过了这一波反噬——代价已经付清，路还要继续走。', eff: this.correctionEff(bc), to: 'RETURN' }] };
        this.pendingEventId = this.eventId;
        this.eventId = bev.id;
        this.currentRandom = bev;
        this.phase = 'event';
        return bev;
      }
    }
    if (this.randomCount >= this.randomMax || this.chapterDeck.length === 0) return null;
    if (this._stream('event')() >= this.randomChance) return null;
    // 从章内牌堆抽取（不重复），动态条件不满足则跳过本次
    var idx = Math.floor(this._stream('event')() * this.chapterDeck.length);
    var ev = this.chapterDeck.splice(idx, 1)[0];
    if (ev.cond && !this.check(ev.cond).ok) return null;
    this.pendingEventId = this.eventId;
    this.eventId = ev.id;
    this.currentRandom = ev;
    this.randomCount++;
    this.phase = 'event';
    return ev;
  };

  /* 状态词（硬核模式） */
  Game.prototype.attrWord = function (k) {
    var def = null;
    this.d.ATTRS.forEach(function (a) { if (a.k === k) def = a; });
    var v = this.attrs[k];
    for (var i = 0; i < def.words.length; i++) if (v >= def.words[i][0]) return def.words[i][1];
    return def.words[def.words.length - 1][1];
  };

  /* 赵高威胁度的模糊状态词（剧情/普通难度可见，GDD 4.4） */
  Game.prototype.zgWord = function () {
    var words = (this.d.HIDDEN && this.d.HIDDEN.words) || [[70, '杀机毕露'], [50, '图穷匕见'], [35, '隐约不安'], [0, '敛迹藏锋']];
    for (var i = 0; i < words.length; i++) if (this.zg >= words[i][0]) return words[i][1];
    return words[words.length - 1][1];
  };

  return { Game: Game, KEY_CARD_ROUNDS: KEY_CARD_ROUNDS, riskWord: riskWord };
});
