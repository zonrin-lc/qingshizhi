/* 剧本全文导出器 v2：prot/lua-data/<scen>.json → docs/剧本内容导出_<日期>/<剧本名>.md
 * 覆盖全部叙事文本，一个字段都不漏：
 *   章节(章首引言/教学提示/进章提示/节点异变)、关键事件(剧情+altSegs变体+选项+结算+condAttrs条件附文)、
 *   抉择卡、常规行动(进取/守成/保身/兑换 的卡面+结算)、随机事件、危机事件(plots/death/qingsuan)、
 *   历史修正、结局太史公曰(含变体)、附录(难度说明/成就表/词条)。
 * 用法: node export-script-md.js [scen...]   （不带参数则导出全部五剧本）
 */
const fs = require('fs');
const path = require('path');
const { P } = require('./paths');

const ALL = ['lisi', 'jingke', 'hanxin', 'xiangyu', 'chensheng'];
const scens = process.argv.slice(2).filter(s => ALL.includes(s));
const targets = scens.length ? scens : ALL;

const today = new Date();
const dateStr = today.getFullYear() + '-' +
  String(today.getMonth() + 1).padStart(2, '0') + '-' +
  String(today.getDate()).padStart(2, '0');
const OUT_DIR = path.join(P.ROOT, 'docs', '剧本内容导出_' + dateStr);
fs.mkdirSync(OUT_DIR, { recursive: true });

const CRISIS_GROUP_NAMES = { plots: '暗流（危机铺垫）', death: '杀机（死亡线）', qingsuan: '清算（旧事清算）' };

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

function emitOption(out, o, i, attrNames) {
  let head = (i + 1) + '. **' + o.t + '**';
  if (o.hist === true) head += '　〔史〕';
  const to = fmtTo(o.to);
  if (to) head += '　→ ' + to;
  out.push(head);
  out.push('   - 效果：' + fmtEff(o.eff, attrNames));
  if (o.eff && Array.isArray(o.eff.condAttrs)) {
    for (const ca of o.eff.condAttrs) {
      out.push('   - 条件附文（' + JSON.stringify(ca['if']) + '）：' + ca.note);
    }
  }
  if (o.eff && o.eff.notes) {
    for (const [nk, nv] of Object.entries(o.eff.notes)) {
      out.push('   - 效果附注（' + (attrNames[nk] || nk) + '）：' + nv);
    }
  }
  out.push('   - 结算：' + o.res);
  if (o.req) out.push('   - 门槛：' + JSON.stringify(o.req));
  if (o.resFail) {
    out.push('   - 失败结算（未达门槛）：' + o.resFail);
    if (o.effFail) out.push('   - 失败效果：' + fmtEff(o.effFail, attrNames));
  }
}

function emitEvent(out, ev, attrNames) {
  out.push('### 事件 ' + ev.id + ' ｜ ' + ev.title, '', '**剧情**：', '');
  for (const s of ev.segs || []) out.push('- ' + s);
  if (ev.altSegs) {
    out.push('', '**剧情变体**（条件 ' + JSON.stringify(ev.altSegs['if'] || ev.altSegs.flag || {}) + '）：', '');
    for (const s of ev.altSegs.segs || []) out.push('- ' + s);
  }
  out.push('', '**选项**：', '');
  (ev.options || []).forEach((o, i) => emitOption(out, o, i, attrNames));
  out.push('');
}

for (const scen of targets) {
  const d = JSON.parse(fs.readFileSync(path.join(P.PROT_LUA_DATA, scen + '.json'), 'utf8'));
  const attrNames = {};
  for (const a of d.ATTRS || []) attrNames[a.k] = a.n;

  const keyEvents = d.CHAPTERS.reduce((n, c) => n + c.events.length, 0);
  const mutationCount = d.CHAPTERS.reduce((n, c) => n + (c.mutations || []).length, 0);
  const cards = d.ACTIONS.filter(a => a.type === '抉择');
  const regularActions = d.ACTIONS.filter(a => a.type !== '抉择');
  const crisisCount = Object.values(d.CRISIS_EVENTS).reduce((n, g) => n + [].concat(g).length, 0);
  const variantCount = Object.values(d.ENDINGS).reduce((n, e) => n + Object.keys(e.variants || {}).length, 0);

  const out = [];
  out.push('# 《' + d.SCENARIO.name + '》剧本全文（完整版）', '');
  out.push('- 导出日期：' + dateStr);
  out.push('- 数据来源：scripts/qingshi/data/' + scen + '.lua（经 prot/lua-data/' + scen + '.json 转储）');
  out.push('- 年代：' + d.SCENARIO.era + '　主角：' + d.SCENARIO.protag);
  out.push('- 剧本简介：' + d.SCENARIO.desc + '（' + d.SCENARIO.sub + '）');
  if (d.SCENARIO.recommend) out.push('- 推荐语：' + d.SCENARIO.recommend);
  out.push('- 章节数：' + d.CHAPTERS.length +
    '；关键事件数：' + keyEvents +
    '；节点异变数：' + mutationCount +
    '；抉择卡数：' + cards.length +
    '；常规行动数：' + regularActions.length +
    '；随机事件数：' + d.RANDOM_EVENTS.length +
    '；危机事件数：' + crisisCount +
    '；历史修正数：' + d.CORRECTIONS.length +
    '；结局数：' + Object.keys(d.ENDINGS).length + '（含变体 ' + variantCount + '）');
  out.push('', '## 属性键对照', '');
  out.push(Object.entries(attrNames).map(([k, n]) => k + '=' + n).join('　'));
  out.push('', '---', '');

  // 一、章节（章首引言 + 教学提示 + 进章提示 + 节点异变 + 关键事件）
  out.push('# 一、章节正文', '');
  for (const ch of d.CHAPTERS) {
    out.push('## ' + ch.title + ' ｜ ' + (ch.sub || '') + '　年龄 ' + ch.age, '');
    if (ch.intro && ch.intro.length) {
      out.push('**章首引言**：', '');
      for (const s of ch.intro) out.push('- ' + s);
      out.push('');
    }
    if (ch.summaryNotes && ch.summaryNotes.length) {
      out.push('**章首提示**：', '');
      for (const s of ch.summaryNotes) out.push('- ' + s);
      out.push('');
    }
    if (ch.enter && ch.enter.note) {
      out.push('**进章提示**：' + ch.enter.note + (ch.enter.merit ? '（功业：' + ch.enter.merit + '）' : ''), '');
    }
    if (ch.mutations && ch.mutations.length) {
      out.push('**节点异变**（条件触发）：', '');
      for (const m of ch.mutations) {
        out.push('- ' + m.note + '　〔条件 ' + JSON.stringify(m['if']) + '〕');
      }
      out.push('');
    }
    for (const ev of ch.events) emitEvent(out, ev, attrNames);
    if (ch.endEvents && ch.endEvents.length) {
      out.push('**章末事件**（条件触发）：', '');
      for (const ev of ch.endEvents) {
        if (ev['if']) out.push('触发条件：' + JSON.stringify(ev['if']), '');
        emitEvent(out, ev, attrNames);
      }
    }
  }

  // 二、抉择卡
  out.push('---', '', '# 二、次级关键事件（抉择卡）', '');
  for (const a of cards) {
    out.push('### ' + a.id + ' ｜ 「' + a.name + '」（第' + (a.chapters || []).join('~') + '章）', '');
    out.push('- 卡面描述（公开）：' + a.desc);
    out.push('- 卡面描述（隐藏版）：' + a.descHidden);
    out.push('', '**剧情**：', '');
    for (const s of (a.choice && a.choice.segs) || []) out.push('- ' + s);
    out.push('', '**选项**：', '');
    ((a.choice && a.choice.options) || []).forEach((o, i) => emitOption(out, o, i, attrNames));
    out.push('');
  }

  // 三、常规行动
  out.push('---', '', '# 三、常规行动（年度行动）', '');
  for (const a of regularActions) {
    out.push('### ' + a.id + ' ｜ ' + a.name + '（' + a.type + '，第' + (a.chapters || []).join('~') + '章）', '');
    out.push('- 卡面描述（公开）：' + a.desc);
    if (a.descHidden && a.descHidden !== a.desc) out.push('- 卡面描述（隐藏版）：' + a.descHidden);
    out.push('- 效果：' + fmtEff(a.eff, attrNames));
    if (a.res) out.push('- 结算：' + a.res);
    out.push('');
  }

  // 四、随机事件
  out.push('---', '', '# 四、随机事件', '');
  for (const ev of d.RANDOM_EVENTS) {
    out.push('### ' + ev.id + ' ｜ ' + ev.title + '（第' + (ev.chapters || []).join('~') + '章）', '');
    out.push('**剧情**：', '');
    for (const s of ev.segs || []) out.push('- ' + s);
    out.push('', '**选项**：', '');
    (ev.options || []).forEach((o, i) => emitOption(out, o, i, attrNames));
    out.push('');
  }

  // 五、危机事件
  out.push('---', '', '# 五、危机事件', '');
  for (const [gk, group] of Object.entries(d.CRISIS_EVENTS)) {
    out.push('## ' + (CRISIS_GROUP_NAMES[gk] || gk), '');
    for (const ev of [].concat(group)) {
      out.push('### ' + ev.id + ' ｜ ' + ev.title, '');
      out.push('**剧情**：', '');
      for (const s of ev.segs || []) out.push('- ' + s);
      if (ev.options && ev.options.length) {
        out.push('', '**选项**：', '');
        ev.options.forEach((o, i) => emitOption(out, o, i, attrNames));
      }
      out.push('');
    }
  }

  // 六、历史修正
  out.push('---', '', '# 六、历史修正（偏离度触发）', '');
  for (const c of d.CORRECTIONS) {
    out.push('### ' + c.title + '（偏离 ' + c.minDev + '–' + c.maxDev + '，概率 ' + c.chance + '）', '');
    for (const s of c.segs || []) out.push('- ' + s);
    out.push('');
  }

  // 七、结局（太史公曰）
  out.push('---', '', '# 七、结局（太史公曰）', '');
  if (d.ALIVE_NOTE) {
    out.push('存续附注（' + JSON.stringify(d.ALIVE_NOTE['if'] || d.ALIVE_NOTE.flag || '') + '）：' + d.ALIVE_NOTE.text, '');
  }
  for (const [ek, e] of Object.entries(d.ENDINGS)) {
    out.push('## ' + ek + ' ｜ ' + e.name + '（' + (e.seal || '') + '）', '');
    out.push('> ' + e.zhuan, '');
    if (Array.isArray(e.zhuanAppends)) {
      for (const za of e.zhuanAppends) {
        out.push('> 追加（条件 ' + JSON.stringify(za['if']) + '）：' + za.text, '');
      }
    }
    if (e.aliveNote) out.push('存续附注：' + e.aliveNote, '');
    for (const [vk, v] of Object.entries(e.variants || {})) {
      out.push('### 变体 ' + vk + ' ｜ ' + v.name, '');
      out.push('> ' + v.zhuan, '');
      if (Array.isArray(v.zhuanAppends)) {
        for (const za of v.zhuanAppends) {
          out.push('> 追加（条件 ' + JSON.stringify(za['if']) + '）：' + za.text, '');
        }
      }
    }
  }

  // 附录
  out.push('---', '', '# 附录', '');
  if (d.ATTRS && d.ATTRS.length) {
    out.push('## 属性状态词（按阈值从高到低）', '');
    for (const a of d.ATTRS) {
      out.push('- **' + a.n + '**（' + a.k + '）：' + (a.words || []).map(w => w[0] + ' 分档「' + w[1] + '」').join('；'));
    }
    out.push('');
  }
  if (d.HIDDEN && d.HIDDEN.words) {
    out.push('## 隐藏值状态词（' + (d.HIDDEN.n || d.HIDDEN.name || '暗流') + '）', '');
    out.push((d.HIDDEN.words || []).map(w => w[0] + ' 分档「' + w[1] + '」').join('；'));
    out.push('');
  }
  if (d.DIFFICULTY) {
    out.push('## 难度说明', '');
    for (const [dk, dv] of Object.entries(d.DIFFICULTY)) {
      out.push('- **' + dv.n + '**（' + dk + '）：' + dv.desc);
    }
    out.push('');
  }
  if (d.ACHIEVEMENTS && Object.keys(d.ACHIEVEMENTS).length) {
    out.push('## 成就表（当前 UI 已隐藏）', '');
    for (const [ak, an] of Object.entries(d.ACHIEVEMENTS)) {
      out.push('- ' + ak + '：' + an);
    }
    out.push('');
  }
  if (d.KEY_NODE_NAMES && Object.keys(d.KEY_NODE_NAMES).length) {
    out.push('## 关键节点别名', '');
    for (const [nk, nn] of Object.entries(d.KEY_NODE_NAMES)) {
      out.push('- ' + nk + '：' + nn);
    }
    out.push('');
  }
  if (d.GLOSSARY && Object.keys(d.GLOSSARY).length) {
    out.push('## 名词词条', '');
    for (const [k, v] of Object.entries(d.GLOSSARY)) {
      out.push('- **' + k + '**：' + v);
    }
    out.push('');
  }

  const file = path.join(OUT_DIR, d.SCENARIO.name.replace(/\s+/g, '') + '.md');
  fs.writeFileSync(file, out.join('\n'));
  console.log('written', P.rel(file), out.length, 'lines');
}
