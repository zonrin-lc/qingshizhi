/* 剧本全文逆导入器：docs/剧本内容导出_2026-10-16/<剧本名>_新.md → prot/lua-data/<scen>.json
 * export-script-md.js 的逆操作。原则：
 *   - 只替换文本字段（剧情段/结算/标题/卡面/太史公曰/状态词/词条等）；
 *   - 数值与结构字段（效果、门槛、条件、偏离区间、概率、章节范围、结局 key 等）一律只校验不替换，
 *     发现 md 与 json 不一致即报错并中止该剧本；
 *   - 剧情段数组允许整组替换（新文本压缩时会合并段落），选项个数不允许变化；
 *   - 全部校验通过才写回 json；写回后可跑 export-script-md.js 做 round-trip 对拍。
 * 用法: node import-script-md.js [scen...]   （不带参数则处理全部五剧本）
 */
const fs = require('fs');
const path = require('path');
const { P } = require('./paths');

const ALL = ['lisi', 'jingke', 'hanxin', 'xiangyu', 'chensheng'];
const MD_DIR = path.join(P.ROOT, 'docs', '剧本内容导出_2026-10-16');
const scens = process.argv.slice(2).filter(s => ALL.includes(s));
const targets = scens.length ? scens : ALL;

const CRISIS_GROUP_NAMES = { plots: '暗流（危机铺垫）', death: '杀机（死亡线）', qingsuan: '清算（旧事清算）' };

// ---- 与 export-script-md.js 完全一致的格式化函数（用于校验非文本行） ----
function fmtEff(eff, attrNames) {
  if (!eff) return '无';
  const parts = [];
  if (eff.attrs) {
    for (const [k, v] of Object.entries(eff.attrs)) {
      parts.push((attrNames[k] || k) + (v > 0 ? '+' + v : String(v)));
    }
  }
  if (eff.dev) parts.push('偏离' + (eff.dev > 0 ? '+' + eff.dev : String(eff.dev)));
  if (eff.hist) parts.push('史册' + (eff.hist > 0 ? '+' + eff.hist : String(eff.hist)));
  if (eff.flags && eff.flags.length) parts.push('旗标:[' + eff.flags.join(',') + ']');
  if (eff.ach) parts.push('成就:' + (Array.isArray(eff.ach) ? eff.ach.join(',') : eff.ach));
  return parts.length ? parts.join('，') : '无';
}
function fmtTo(to) {
  if (to === undefined || to === null) return null;
  if (typeof to === 'string') return to;
  return JSON.stringify(to);
}

// ---- JSON 深比较（键序无关） ----
function canon(v) {
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  if (v && typeof v === 'object') {
    return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
  }
  return JSON.stringify(v);
}
function jsonTextEq(jsonVal, text) {
  try { return canon(jsonVal) === canon(JSON.parse(text)); } catch (e) { return false; }
}

// ---- 行游标 ----
class Cur {
  constructor(lines, file) {
    this.lines = lines; this.i = 0; this.file = file; this.errors = []; this.warnings = []; this.replaced = 0;
  }
  skipBlank() {
    while (this.i < this.lines.length) {
      const t = this.lines[this.i].trim();
      if (t === '' || t === '---') this.i++; else break;
    }
  }
  peek() { this.skipBlank(); return this.lines[this.i]; }
  err(msg, got) {
    this.errors.push(this.file + ' 第' + (this.i + 1) + '行: ' + msg + (got !== undefined ? ' | 实际: ' + String(got).slice(0, 120) : ''));
  }
  // 当前行必须以 prefix 开头，返回剩余部分；失败记错并返回 null（仍前进，尽量多收集错误）
  take(prefix) {
    const l = this.peek();
    if (l === undefined || !l.startsWith(prefix)) { this.err('期望前缀[' + prefix.slice(0, 40) + ']', l); this.i++; return null; }
    this.i++;
    return l.slice(prefix.length);
  }
  // 当前行必须精确等于 expected
  expect(expected) {
    const l = this.peek();
    if (l !== expected) { this.err('期望行[' + expected.slice(0, 60) + ']', l); }
    this.i++;
  }
  // 收集连续的 '- ' 文本段（整组替换）
  collectSegs() {
    const out = [];
    while (true) {
      const l = this.peek();
      if (l !== undefined && l.startsWith('- ')) { out.push(l.slice(2)); this.i++; } else break;
    }
    return out;
  }
}

// 把 "- note　〔条件 {json}〕" 拆出 note 并校验条件与 jsonVal 一致
function takeNoteWithCond(cur, jsonVal, what) {
  const rest = cur.take('- ');
  if (rest === null) return null;
  const m = rest.match(/^(.*)　〔条件 (.*)〕$/);
  if (!m) { cur.err(what + '：节点异变行缺少〔条件〕'); return null; }
  if (!jsonTextEq(jsonVal, m[2])) cur.err(what + '：条件与数据不符', m[2]);
  return m[1];
}

function parseOptions(cur, options, attrNames, what) {
  cur.expect('**选项**：');
  for (let i = 0; i < options.length; i++) {
    const o = options[i];
    const head = cur.peek();
    const hm = head && head.match(/^(\d+)\. \*\*([\s\S]*?)\*\*(　〔史〕)?(　→ (.*))?$/);
    if (!hm) { cur.err(what + ' 选项' + (i + 1) + '：标题行格式不符', head); cur.i++; continue; }
    cur.i++;
    if (Number(hm[1]) !== i + 1) cur.err(what + '：选项序号应为 ' + (i + 1), hm[1]);
    if (!!hm[3] !== (o.hist === true)) cur.err(what + ' 选项' + (i + 1) + '：〔史〕标记与数据不符');
    const to = fmtTo(o.to);
    if ((hm[5] || null) !== to) cur.err(what + ' 选项' + (i + 1) + '：跳转目标与数据不符', hm[5]);
    if (o.t !== hm[2]) { o.t = hm[2]; cur.replaced++; }
    cur.expect('   - 效果：' + fmtEff(o.eff, attrNames));
    if (o.eff && Array.isArray(o.eff.condAttrs)) {
      for (const ca of o.eff.condAttrs) {
        const rest = cur.take('   - 条件附文（');
        if (rest === null) continue;
        const cm = rest.match(/^([\s\S]*?)）：([\s\S]*)$/);
        if (!cm) { cur.err(what + '：条件附文格式不符', rest); continue; }
        if (!jsonTextEq(ca['if'], cm[1])) cur.err(what + '：条件附文条件与数据不符', cm[1]);
        if (ca.note !== cm[2]) { ca.note = cm[2]; cur.replaced++; }
      }
    }
    if (o.eff && o.eff.notes) {
      for (const nk of Object.keys(o.eff.notes)) {
        const rest = cur.take('   - 效果附注（' + (attrNames[nk] || nk) + '）：');
        if (rest === null) continue;
        if (o.eff.notes[nk] !== rest) { o.eff.notes[nk] = rest; cur.replaced++; }
      }
    }
    const res = cur.take('   - 结算：');
    if (res !== null && o.res !== res) { o.res = res; cur.replaced++; }
    // 门槛：以 md 为准（用户可能在缩减时调整数值设计），改动记入 warnings  loud 报告
    const reqLine = cur.peek();
    if (o.req) {
      const rest = cur.take('   - 门槛：');
      if (rest !== null && !jsonTextEq(o.req, rest)) {
        try {
          o.req = JSON.parse(rest);
          cur.warnings.push(what + ' 选项' + (i + 1) + '：门槛已按 md 修改 → ' + rest);
        } catch (e) { cur.err(what + ' 选项' + (i + 1) + '：门槛 JSON 解析失败', rest); }
      }
    } else if (reqLine && reqLine.startsWith('   - 门槛：')) {
      cur.i++;
      const rest = reqLine.slice('   - 门槛：'.length);
      try {
        o.req = JSON.parse(rest);
        cur.warnings.push(what + ' 选项' + (i + 1) + '：新增门槛 ' + rest + '（引擎按软门槛险招处理）');
      } catch (e) { cur.err(what + ' 选项' + (i + 1) + '：门槛 JSON 解析失败', rest); }
    }
    if (o.resFail) {
      const rest = cur.take('   - 失败结算（未达门槛）：');
      if (rest !== null && o.resFail !== rest) { o.resFail = rest; cur.replaced++; }
      if (o.effFail) cur.expect('   - 失败效果：' + fmtEff(o.effFail, attrNames));
    }
  }
  // 选项数不允许变化：下一行不应仍是选项编号
  const nx = cur.peek();
  if (nx && /^\d+\. \*\*/.test(nx)) cur.err(what + '：md 中选项多于数据（选项数不允许变化）', nx);
}

function parseEvent(cur, ev, attrNames, what) {
  const t = cur.take('### 事件 ' + ev.id + ' ｜ ');
  if (t !== null && ev.title !== t) { ev.title = t; cur.replaced++; }
  cur.expect('**剧情**：');
  const segs = cur.collectSegs();
  if (!segs.length) cur.err(what + '：剧情段为空');
  else if (canon(ev.segs || []) !== canon(segs)) { ev.segs = segs; cur.replaced++; }
  if (ev.altSegs) {
    const rest = cur.take('**剧情变体**（条件 ');
    if (rest !== null) {
      const cm = rest.match(/^([\s\S]*?)）：$/);
      if (!cm || !jsonTextEq(ev.altSegs['if'] || ev.altSegs.flag || {}, cm[1])) {
        cur.err(what + '：剧情变体条件与数据不符', rest);
      }
      const asegs = cur.collectSegs();
      if (canon(ev.altSegs.segs || []) !== canon(asegs)) { ev.altSegs.segs = asegs; cur.replaced++; }
    }
  }
  parseOptions(cur, ev.options || [], attrNames, what + ' 事件' + ev.id);
}

function splitTailParen(rest) {
  const m = rest.match(/^(.*)（([^（）]*)）$/);
  return m ? [m[1], m[2]] : null;
}

for (const scen of targets) {
  const d = JSON.parse(fs.readFileSync(path.join(P.PROT_LUA_DATA, scen + '.json'), 'utf8'));
  const attrNames = {};
  for (const a of d.ATTRS || []) attrNames[a.k] = a.n;

  const mdFile = path.join(MD_DIR, d.SCENARIO.name.replace(/\s+/g, '') + '_新.md');
  if (!fs.existsSync(mdFile)) { console.error('找不到 md: ' + P.rel(mdFile)); process.exitCode = 1; continue; }
  const cur = new Cur(fs.readFileSync(mdFile, 'utf8').split(/\r?\n/), scen + '_新.md');

  // ---- 头部 ----
  cur.expect('# 《' + d.SCENARIO.name + '》剧本全文（完整版）');
  cur.take('- 导出日期：');
  const srcLine = cur.take('- 数据来源：');
  if (srcLine !== null && !srcLine.includes(scen + '.json')) cur.err('数据来源行与剧本不符', srcLine);
  const eraLine = cur.take('- 年代：');
  if (eraLine !== null) {
    const em = eraLine.match(/^([\s\S]*)　主角：([\s\S]*)$/);
    if (!em) cur.err('年代行格式不符', eraLine);
    else {
      if (d.SCENARIO.era !== em[1]) { d.SCENARIO.era = em[1]; cur.replaced++; }
      if (d.SCENARIO.protag !== em[2]) { d.SCENARIO.protag = em[2]; cur.replaced++; }
    }
  }
  const descLine = cur.take('- 剧本简介：');
  if (descLine !== null) {
    const dm = descLine.match(/^([\s\S]*)（([^（）]*)）$/);
    if (!dm) cur.err('剧本简介行格式不符', descLine);
    else {
      if (d.SCENARIO.desc !== dm[1]) { d.SCENARIO.desc = dm[1]; cur.replaced++; }
      if (d.SCENARIO.sub !== dm[2]) { d.SCENARIO.sub = dm[2]; cur.replaced++; }
    }
  }
  if (d.SCENARIO.recommend) {
    const rec = cur.take('- 推荐语：');
    if (rec !== null && d.SCENARIO.recommend !== rec) { d.SCENARIO.recommend = rec; cur.replaced++; }
  }
  const keyEvents = d.CHAPTERS.reduce((n, c) => n + c.events.length, 0);
  const mutationCount = d.CHAPTERS.reduce((n, c) => n + (c.mutations || []).length, 0);
  const cards = d.ACTIONS.filter(a => a.type === '抉择');
  const regularActions = d.ACTIONS.filter(a => a.type !== '抉择');
  const crisisCount = Object.values(d.CRISIS_EVENTS).reduce((n, g) => n + [].concat(g).length, 0);
  const variantCount = Object.values(d.ENDINGS).reduce((n, e) => n + Object.keys(e.variants || {}).length, 0);
  cur.expect('- 章节数：' + d.CHAPTERS.length +
    '；关键事件数：' + keyEvents +
    '；节点异变数：' + mutationCount +
    '；抉择卡数：' + cards.length +
    '；常规行动数：' + regularActions.length +
    '；随机事件数：' + d.RANDOM_EVENTS.length +
    '；危机事件数：' + crisisCount +
    '；历史修正数：' + d.CORRECTIONS.length +
    '；结局数：' + Object.keys(d.ENDINGS).length + '（含变体 ' + variantCount + '）');
  cur.expect('## 属性键对照');
  cur.expect(Object.entries(attrNames).map(([k, n]) => k + '=' + n).join('　'));

  // ---- 一、章节正文 ----
  cur.expect('# 一、章节正文');
  for (let ci = 0; ci < d.CHAPTERS.length; ci++) {
    const ch = d.CHAPTERS[ci];
    const what = scen + ' 第' + ci + '章';
    const head = cur.take('## ');
    if (head !== null) {
      const am = head.match(/^([\s\S]*)　年龄 (\S+)$/);
      if (!am) cur.err(what + '：章标题行格式不符', head);
      else {
        if (Number(am[2]) !== ch.age) cur.err(what + '：年龄与数据不符', am[2]);
        const cur_ = ch.title + ' ｜ ' + (ch.sub || '');
        if (am[1] !== cur_) {
          const idx = am[1].lastIndexOf(' ｜ ');
          if (idx < 0) cur.err(what + '：章标题缺少 ｜ 分隔', am[1]);
          else {
            const nt = am[1].slice(0, idx), ns = am[1].slice(idx + 3);
            if (ch.title !== nt) { ch.title = nt; cur.replaced++; }
            if ((ch.sub || '') !== ns) { ch.sub = ns; cur.replaced++; }
          }
        }
      }
    }
    if (ch.intro && ch.intro.length) {
      cur.expect('**章首引言**：');
      const segs = cur.collectSegs();
      if (canon(ch.intro) !== canon(segs)) { ch.intro = segs; cur.replaced++; }
    }
    if (ch.summaryNotes && ch.summaryNotes.length) {
      cur.expect('**章首提示**：');
      const segs = cur.collectSegs();
      if (canon(ch.summaryNotes) !== canon(segs)) { ch.summaryNotes = segs; cur.replaced++; }
    }
    if (ch.enter && ch.enter.note) {
      const rest = cur.take('**进章提示**：');
      if (rest !== null) {
        let note = rest;
        if (ch.enter.merit) {
          const suffix = '（功业：' + ch.enter.merit + '）';
          if (!rest.endsWith(suffix)) cur.err(what + '：进章提示功业标记与数据不符', rest);
          else note = rest.slice(0, -suffix.length);
        }
        if (ch.enter.note !== note) { ch.enter.note = note; cur.replaced++; }
      }
    }
    if (ch.mutations && ch.mutations.length) {
      cur.expect('**节点异变**（条件触发）：');
      for (const m of ch.mutations) {
        const note = takeNoteWithCond(cur, m['if'], what + ' 节点异变');
        if (note !== null && m.note !== note) { m.note = note; cur.replaced++; }
      }
    }
    for (const ev of ch.events) parseEvent(cur, ev, attrNames, what);
    if (ch.endEvents && ch.endEvents.length) {
      cur.expect('**章末事件**（条件触发）：');
      for (const ev of ch.endEvents) {
        if (ev['if']) {
          const rest = cur.take('触发条件：');
          if (rest !== null && !jsonTextEq(ev['if'], rest)) cur.err(what + '：章末事件触发条件与数据不符', rest);
        }
        parseEvent(cur, ev, attrNames, what + ' 章末');
      }
    }
  }

  // ---- 二、抉择卡 ----
  cur.expect('# 二、次级关键事件（抉择卡）');
  for (const a of cards) {
    const what = scen + ' 抉择卡 ' + a.id;
    const rest = cur.take('### ' + a.id + ' ｜ 「');
    if (rest !== null) {
      const cm = rest.match(/^([\s\S]*)」（第([\s\S]*)章）$/);
      if (!cm) cur.err(what + '：标题行格式不符', rest);
      else {
        if (cm[2] !== (a.chapters || []).join('~')) cur.err(what + '：章节范围与数据不符', cm[2]);
        if (a.name !== cm[1]) { a.name = cm[1]; cur.replaced++; }
      }
    }
    const desc = cur.take('- 卡面描述（公开）：');
    if (desc !== null && a.desc !== desc) { a.desc = desc; cur.replaced++; }
    const dh = cur.take('- 卡面描述（隐藏版）：');
    if (dh !== null && a.descHidden !== dh) { a.descHidden = dh; cur.replaced++; }
    cur.expect('**剧情**：');
    const segs = cur.collectSegs();
    if (a.choice && canon(a.choice.segs || []) !== canon(segs)) { a.choice.segs = segs; cur.replaced++; }
    parseOptions(cur, (a.choice && a.choice.options) || [], attrNames, what);
  }

  // ---- 三、常规行动 ----
  cur.expect('# 三、常规行动（年度行动）');
  for (const a of regularActions) {
    const what = scen + ' 行动 ' + a.id;
    const rest = cur.take('### ' + a.id + ' ｜ ');
    if (rest !== null) {
      const cm = rest.match(/^([\s\S]*)（([^（）]*)，第([\s\S]*)章）$/);
      if (!cm) cur.err(what + '：标题行格式不符', rest);
      else {
        if (cm[2] !== a.type) cur.err(what + '：类型与数据不符', cm[2]);
        if (cm[3] !== (a.chapters || []).join('~')) cur.err(what + '：章节范围与数据不符', cm[3]);
        if (a.name !== cm[1]) { a.name = cm[1]; cur.replaced++; }
      }
    }
    const desc = cur.take('- 卡面描述（公开）：');
    if (desc !== null && a.desc !== desc) { a.desc = desc; cur.replaced++; }
    if (a.descHidden && a.descHidden !== a.desc) {
      const dh = cur.take('- 卡面描述（隐藏版）：');
      if (dh !== null && a.descHidden !== dh) { a.descHidden = dh; cur.replaced++; }
    }
    cur.expect('- 效果：' + fmtEff(a.eff, attrNames));
    if (a.res) {
      const res = cur.take('- 结算：');
      if (res !== null && a.res !== res) { a.res = res; cur.replaced++; }
    }
  }

  // ---- 四、随机事件 ----
  cur.expect('# 四、随机事件');
  for (const ev of d.RANDOM_EVENTS) {
    const what = scen + ' 随机 ' + ev.id;
    const rest = cur.take('### ' + ev.id + ' ｜ ');
    if (rest !== null) {
      const cm = rest.match(/^([\s\S]*)（第([\s\S]*)章）$/);
      if (!cm) cur.err(what + '：标题行格式不符', rest);
      else {
        if (cm[2] !== (ev.chapters || []).join('~')) cur.err(what + '：章节范围与数据不符', cm[2]);
        if (ev.title !== cm[1]) { ev.title = cm[1]; cur.replaced++; }
      }
    }
    cur.expect('**剧情**：');
    const segs = cur.collectSegs();
    if (canon(ev.segs || []) !== canon(segs)) { ev.segs = segs; cur.replaced++; }
    parseOptions(cur, ev.options || [], attrNames, what);
  }

  // ---- 五、危机事件 ----
  cur.expect('# 五、危机事件');
  for (const [gk, group] of Object.entries(d.CRISIS_EVENTS)) {
    cur.expect('## ' + (CRISIS_GROUP_NAMES[gk] || gk));
    for (const ev of [].concat(group)) {
      const what = scen + ' 危机 ' + ev.id;
      const t = cur.take('### ' + ev.id + ' ｜ ');
      if (t !== null && ev.title !== t) { ev.title = t; cur.replaced++; }
      cur.expect('**剧情**：');
      const segs = cur.collectSegs();
      if (canon(ev.segs || []) !== canon(segs)) { ev.segs = segs; cur.replaced++; }
      if (ev.options && ev.options.length) parseOptions(cur, ev.options, attrNames, what);
    }
  }

  // ---- 六、历史修正 ----
  cur.expect('# 六、历史修正（偏离度触发）');
  for (const c of d.CORRECTIONS) {
    const what = scen + ' 修正';
    const rest = cur.take('### ');
    if (rest !== null) {
      const cm = rest.match(/^([\s\S]*)（偏离 (\d+)–(\d+)，概率 ([\d.]+)）$/);
      if (!cm) cur.err(what + '：标题行格式不符', rest);
      else {
        if (Number(cm[2]) !== c.minDev || Number(cm[3]) !== c.maxDev || Number(cm[4]) !== c.chance) {
          cur.err(what + '：偏离区间/概率与数据不符', rest);
        }
        if (c.title !== cm[1]) { c.title = cm[1]; cur.replaced++; }
      }
    }
    const segs = cur.collectSegs();
    if (canon(c.segs || []) !== canon(segs)) { c.segs = segs; cur.replaced++; }
  }

  // ---- 七、结局 ----
  cur.expect('# 七、结局（太史公曰）');
  if (d.ALIVE_NOTE) {
    const rest = cur.take('存续附注（');
    if (rest !== null) {
      const cm = rest.match(/^([\s\S]*?)）：([\s\S]*)$/);
      if (!cm) cur.err(scen + '：存续附注格式不符', rest);
      else {
        if (!jsonTextEq(d.ALIVE_NOTE['if'] || d.ALIVE_NOTE.flag || '', cm[1])) cur.err(scen + '：存续附注条件与数据不符', cm[1]);
        if (d.ALIVE_NOTE.text !== cm[2]) { d.ALIVE_NOTE.text = cm[2]; cur.replaced++; }
      }
    }
  }
  for (const [ek, e] of Object.entries(d.ENDINGS)) {
    const what = scen + ' 结局 ' + ek;
    const rest = cur.take('## ' + ek + ' ｜ ');
    if (rest !== null) {
      const nm = splitTailParen(rest);
      if (!nm) cur.err(what + '：标题行格式不符', rest);
      else {
        if (e.name !== nm[0]) { e.name = nm[0]; cur.replaced++; }
        if ((e.seal || '') !== nm[1]) { e.seal = nm[1]; cur.replaced++; }
      }
    }
    const zhuan = cur.take('> ');
    if (zhuan !== null && e.zhuan !== zhuan) { e.zhuan = zhuan; cur.replaced++; }
    if (Array.isArray(e.zhuanAppends)) {
      for (const za of e.zhuanAppends) {
        const zrest = cur.take('> 追加（条件 ');
        if (zrest === null) continue;
        const zm = zrest.match(/^([\s\S]*?)）：([\s\S]*)$/);
        if (!zm) { cur.err(what + '：追加行格式不符', zrest); continue; }
        if (!jsonTextEq(za['if'], zm[1])) cur.err(what + '：追加条件与数据不符', zm[1]);
        if (za.text !== zm[2]) { za.text = zm[2]; cur.replaced++; }
      }
    }
    if (e.aliveNote) {
      const an = cur.take('存续附注：');
      if (an !== null && e.aliveNote !== an) { e.aliveNote = an; cur.replaced++; }
    }
    for (const [vk, v] of Object.entries(e.variants || {})) {
      const vn = cur.take('### 变体 ' + vk + ' ｜ ');
      if (vn !== null && v.name !== vn) { v.name = vn; cur.replaced++; }
      const vz = cur.take('> ');
      if (vz !== null && v.zhuan !== vz) { v.zhuan = vz; cur.replaced++; }
      if (Array.isArray(v.zhuanAppends)) {
        for (const za of v.zhuanAppends) {
          const zrest = cur.take('> 追加（条件 ');
          if (zrest === null) continue;
          const zm = zrest.match(/^([\s\S]*?)）：([\s\S]*)$/);
          if (!zm) { cur.err(what + ' 变体' + vk + '：追加行格式不符', zrest); continue; }
          if (!jsonTextEq(za['if'], zm[1])) cur.err(what + ' 变体' + vk + '：追加条件与数据不符', zm[1]);
          if (za.text !== zm[2]) { za.text = zm[2]; cur.replaced++; }
        }
      }
    }
  }

  // ---- 附录 ----
  cur.expect('# 附录');
  if (d.ATTRS && d.ATTRS.length) {
    cur.expect('## 属性状态词（按阈值从高到低）');
    for (const a of d.ATTRS) {
      const line = cur.take('- ');
      if (line === null) continue;
      const am = line.match(/^\*\*([\s\S]*?)\*\*（(\w+)）：([\s\S]*)$/);
      if (!am) { cur.err(scen + ' 附录：属性状态词行格式不符', line); continue; }
      if (am[2] !== a.k) cur.err(scen + ' 附录：属性键不符(期望 ' + a.k + ')', am[2]);
      if (a.n !== am[1]) { a.n = am[1]; cur.replaced++; }
      const parts = am[3].split('；');
      if (parts.length !== (a.words || []).length) { cur.err(scen + ' 附录：' + a.k + ' 状态词档数不符', am[3]); continue; }
      parts.forEach((p, wi) => {
        const wm = p.match(/^(\d+) 分档「([\s\S]*)」$/);
        if (!wm) { cur.err(scen + ' 附录：状态词格式不符', p); return; }
        if (Number(wm[1]) !== a.words[wi][0]) cur.err(scen + ' 附录：' + a.k + ' 阈值与数据不符', p);
        if (a.words[wi][1] !== wm[2]) { a.words[wi][1] = wm[2]; cur.replaced++; }
      });
    }
  }
  if (d.HIDDEN && d.HIDDEN.words) {
    const hrest = cur.take('## 隐藏值状态词（');
    if (hrest !== null) {
      const hm = hrest.match(/^([\s\S]*)）$/);
      const curName = d.HIDDEN.n || d.HIDDEN.name || '暗流';
      if (hm && curName !== hm[1]) {
        if ('n' in d.HIDDEN) d.HIDDEN.n = hm[1]; else d.HIDDEN.name = hm[1];
        cur.replaced++;
      }
    }
    const wline = cur.peek();
    if (wline !== undefined && !wline.startsWith('#')) {
      cur.i++;
      const parts = wline.split('；');
      if (parts.length !== d.HIDDEN.words.length) cur.err(scen + ' 附录：隐藏值状态词档数不符', wline);
      else parts.forEach((p, wi) => {
        const wm = p.match(/^(\d+) 分档「([\s\S]*)」$/);
        if (!wm) { cur.err(scen + ' 附录：隐藏值状态词格式不符', p); return; }
        if (Number(wm[1]) !== d.HIDDEN.words[wi][0]) cur.err(scen + ' 附录：隐藏值阈值与数据不符', p);
        if (d.HIDDEN.words[wi][1] !== wm[2]) { d.HIDDEN.words[wi][1] = wm[2]; cur.replaced++; }
      });
    }
  }
  if (d.DIFFICULTY) {
    cur.expect('## 难度说明');
    for (const [dk, dv] of Object.entries(d.DIFFICULTY)) {
      const line = cur.take('- ');
      if (line === null) continue;
      const dm = line.match(/^\*\*([\s\S]*?)\*\*（(\w+)）：([\s\S]*)$/);
      if (!dm) { cur.err(scen + ' 附录：难度行格式不符', line); continue; }
      if (dm[2] !== dk) cur.err(scen + ' 附录：难度键不符(期望 ' + dk + ')', dm[2]);
      if (dv.n !== dm[1]) { dv.n = dm[1]; cur.replaced++; }
      if (dv.desc !== dm[3]) { dv.desc = dm[3]; cur.replaced++; }
    }
  }
  if (d.ACHIEVEMENTS && Object.keys(d.ACHIEVEMENTS).length) {
    cur.expect('## 成就表（当前 UI 已隐藏）');
    for (const ak of Object.keys(d.ACHIEVEMENTS)) {
      const rest = cur.take('- ' + ak + '：');
      if (rest !== null && d.ACHIEVEMENTS[ak] !== rest) { d.ACHIEVEMENTS[ak] = rest; cur.replaced++; }
    }
  }
  if (d.KEY_NODE_NAMES && Object.keys(d.KEY_NODE_NAMES).length) {
    cur.expect('## 关键节点别名');
    for (const nk of Object.keys(d.KEY_NODE_NAMES)) {
      const rest = cur.take('- ' + nk + '：');
      if (rest !== null && d.KEY_NODE_NAMES[nk] !== rest) { d.KEY_NODE_NAMES[nk] = rest; cur.replaced++; }
    }
  }
  if (d.GLOSSARY && Object.keys(d.GLOSSARY).length) {
    cur.expect('## 名词词条');
    for (const k of Object.keys(d.GLOSSARY)) {
      const rest = cur.take('- **' + k + '**：');
      if (rest !== null && d.GLOSSARY[k] !== rest) { d.GLOSSARY[k] = rest; cur.replaced++; }
    }
  }

  // ---- 收尾：md 必须消费完 ----
  const tail = cur.peek();
  if (tail !== undefined) cur.err('md 存在未消费内容', tail);

  if (cur.warnings.length) {
    console.log('[' + scen + '] 数值改动 ' + cur.warnings.length + ' 处（已按 md 应用）：');
    for (const w of cur.warnings) console.log('  ⚠ ' + w);
  }
  if (cur.errors.length) {
    console.error('\n[' + scen + '] 校验失败，未写回。错误 ' + cur.errors.length + ' 条（前 20 条）：');
    for (const e of cur.errors.slice(0, 20)) console.error('  ' + e);
    process.exitCode = 1;
    continue;
  }
  fs.writeFileSync(path.join(P.PROT_LUA_DATA, scen + '.json'), JSON.stringify(d));
  console.log('[' + scen + '] 写回完成，替换文本字段 ' + cur.replaced + ' 处');
}
