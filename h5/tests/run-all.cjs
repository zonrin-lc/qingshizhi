/**
 * 跑全部浏览器验收。
 *
 * 与 prot/ 的 Node 测试互补:prot 验规则(引擎/数据/契约),
 * 这里验「浏览器里真的能玩、真的不塌」。
 *
 * 用法:
 *   npm run build     # 必须先有 dist/
 *   npm run test:browser
 *   node tests/run-all.cjs chain        # 只跑其中一套
 */
'use strict';

const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const DIR = __dirname;
// 浏览器里跑的
const ALL = ['chain.cjs', 'viewports.cjs', 'backtrack.cjs', 'save.cjs', 'audio.cjs'];
// 纯 Node 断言(不碰浏览器、不需要 dist),单独跑但一样计入总览
const PURE = ['scenarios.cjs'];
const only = process.argv.slice(2).filter((a) => [...ALL, ...PURE].some((f) => f.includes(a)));
const tests = only.length ? ALL.filter((f) => only.some((o) => f.includes(o))) : ALL;

if (!fs.existsSync(path.join(DIR, '..', 'dist', 'index.html'))) {
  console.error('找不到 dist/——请先运行: npm run build');
  process.exit(1);
}

const results = [];
for (const t of tests) {
  console.log(`\n${'='.repeat(72)}\n>>> ${t}\n${'='.repeat(72)}`);
  const { status } = spawnSync(process.execPath, [path.join(DIR, t)], {
    stdio: 'inherit',
    cwd: path.join(DIR, '..'),
  });
  results.push([t, status === 0]);
}

// scenarios.cjs / audio.cjs 的纯 Node 部分不碰浏览器,但一样计入总览 ——
// 剧本轻量表漂移、音轨缺失都属于同一类回归,不能漏。
if (!only.length) {
  for (const t of PURE) {
    console.log(`\n${'='.repeat(72)}\n>>> ${t} (纯 Node)\n${'='.repeat(72)}`);
    const r = spawnSync(process.execPath, [path.join(DIR, t)], { stdio: 'inherit', cwd: path.join(DIR, '..') });
    results.push([t, r.status === 0]);
  }
}

console.log(`\n${'='.repeat(72)}\n>>> 总览\n${'='.repeat(72)}`);
for (const [t, ok] of results) console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${t}`);
const bad = results.filter(([, ok]) => !ok).length;
console.log(`\n${bad ? 'FAIL' : 'ok  '}  ${results.length - bad}/${results.length} 套通过`);
process.exit(bad ? 1 : 0);