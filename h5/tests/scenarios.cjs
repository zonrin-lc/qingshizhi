'use strict';
/**
 * 剧本轻量表漂移校验。
 *
 * src/data/scenario-meta.json 是手抄的(为了首屏不打包五份剧本全文)。
 * 手抄的东西迟早会忘改,所以这里断言它与 prot/lua-data/*.json 一致:
 *   id / name / sub / noSave / chapters 五项逐一对账。
 *
 * 跑法:node tests/scenarios.cjs
 */
const fs = require('node:fs');
const path = require('node:path');
const { report } = require('./lib/harness.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'h5/src/data/scenario-meta.json'), 'utf8'));
const DATA = path.join(ROOT, 'prot/lua-data');

const checks = [];
for (const m of meta) {
  const p = path.join(DATA, `${m.key}.json`);
  if (!fs.existsSync(p)) { checks.push([`${m.key}: JSON 存在`, false]); continue; }
  checks.push([`${m.key}: JSON 存在`, true]);
  const d = JSON.parse(fs.readFileSync(p, 'utf8'));
  const sc = d.SCENARIO || {};
  checks.push([`${m.key}: id 一致`, m.id === sc.id]);
  checks.push([`${m.key}: name 一致`, m.name === sc.name]);
  checks.push([`${m.key}: sub 一致`, (m.sub || '') === (sc.sub || '')]);
  checks.push([`${m.key}: noSave 一致`, !!m.noSave === !!sc.noSave]);
  checks.push([`${m.key}: chapters 一致`, m.chapters === (d.CHAPTERS || []).length]);
}

// 反向:prot 下每本 JSON 都得有对应的轻量条目,否则新增剧本会被静默漏掉
const jsonKeys = fs.readdirSync(DATA).filter((f) => f.endsWith('.json')).map((f) => f.replace('.json', ''));
for (const k of jsonKeys) {
  // golden.json 是 prot 的对拍基准,不是可玩剧本,不进 h5
  if (k === 'golden') continue;
  checks.push([`${k}: 有轻量表条目`, meta.some((m) => m.key === k)]);
}

const ok = report('剧本轻量表', checks);
if (!ok) {
  console.log('\n提示:轻量表在 h5/src/data/scenario-meta.json,改完记得重新 npm run build');
}
process.exit(ok ? 0 : 1);
