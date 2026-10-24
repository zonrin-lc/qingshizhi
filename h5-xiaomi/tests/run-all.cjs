/**
 * 跑全部浏览器验收。
 *
 * 与 prot/ 的 Node 测试互补:prot/ 验规则(引擎/数据/契约),
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
const H5 = path.resolve(DIR, '..');
// 浏览器里跑的
const BROWSER = [
  'chain.cjs', 'viewports.cjs', 'backtrack.cjs', 'save.cjs', 'stash.cjs',
  'audio.cjs', 'voice.cjs', 'reveal.cjs', 'altsegs.cjs', 'ending.cjs',
  'settings.cjs', 'hardcore.cjs', 'gallery.cjs', 'tapcloud.cjs',
  'tapcloud-conflict.cjs', 'corrupt-store.cjs', 'a11y-keyboard.cjs', 'wheel.cjs',
  // dev 冒烟也进总览:它自己会起一个临时 dev server,不需要 dist
  'dev-check.cjs',
];
// 纯 Node 断言(不碰浏览器、不需要 dist)
// 2026-10-21:并进同一份列表。原来 PURE 单独一套,`node tests/run-all.cjs scenarios`
// 会过滤成空 → 打印「0/0 套通过」还 exit 0(静默假绿)。
const PURE = ['scenarios.cjs'];
const ALL = [...BROWSER, ...PURE];

const argv = process.argv.slice(2);
let tests;
if (argv.length === 0) {
  tests = ALL;
} else {
  const only = argv.filter((a) => ALL.some((f) => f.includes(a)));
  tests = ALL.filter((f) => only.some((o) => f.includes(o)));
  // 过滤后为空 = 名字打错了。必须 exit 1:
  // 「0/0 套通过」+ exit 0 在 CI 上看着是绿的,其实一套都没跑。
  if (tests.length === 0) {
    console.error(`没有匹配到任何测试套:${JSON.stringify(argv)}`);
    console.error(`可选:${ALL.join(', ')}`);
    process.exit(1);
  }
}

/** dev-check 走 vite dev server,不需要 dist;其余都要 */
const needsDist = tests.some((t) => t !== 'dev-check.cjs');
if (needsDist && !fs.existsSync(path.join(H5, 'dist', 'index.html'))) {
  console.error('找不到 dist/——请先运行: npm run build');
  process.exit(1);
}

/** 目录里最新的文件(递归) */
function newestFile(dir) {
  let max = 0;
  let file = '';
  const walk = (d) => {
    let entries = [];
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else {
        let st = null;
        try { st = fs.statSync(p); } catch { continue; }
        if (st.mtimeMs > max) { max = st.mtimeMs; file = p; }
      }
    }
  };
  walk(dir);
  return { max, file };
}

/**
 * dist 与 src 的新旧比对。
 *
 * 直跑单套时最容易踩的坑:src 改完了、dist 还是旧的,测试**测的是旧代码**,
 * 而且一路绿灯,没有任何提示。这里在开跑前比一次时间戳,
 * 明显陈旧就打印醒目警告(不阻断 —— 构建由人统一做,测试不该越权)。
 */
function checkStale() {
  const dist = path.join(H5, 'dist');
  const src = path.join(H5, 'src');
  if (!fs.existsSync(dist)) return null;
  const s = newestFile(src);
  const d = newestFile(dist);
  if (!s.max || !d.max) return null;
  const lagMin = Math.round((s.max - d.max) / 60000);
  return { lagMin, srcFile: s.file, distNewest: d.max };
}
const stale = checkStale();
if (stale && stale.lagMin >= 5) {
  console.log([
    '',
    '!'.repeat(72),
    `! 警告:dist/ 比 src/ 旧了约 ${stale.lagMin} 分钟 —— 这一轮测的是**旧代码**。`,
    `!   src 最新改动: ${path.relative(H5, stale.srcFile)}`,
    `!   dist 最新时间: ${new Date(stale.distNewest).toLocaleString()}`,
    '!   请先 npm run build(或等统一构建)再跑。',
    '!'.repeat(72),
    '',
  ].join('\n'));
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
console.log(`\n${'='.repeat(72)}\n>>> 总览\n${'='.repeat(72)}`);
for (const [t, ok] of results) console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${t}`);
const bad = results.filter(([, ok]) => !ok).length;
console.log(`\n${bad ? 'FAIL' : 'ok  '}  ${results.length - bad}/${results.length} 套通过`);
if (bad) console.log(`失败:${results.filter(([, ok]) => !ok).map(([t]) => t).join(', ')}`);
process.exit(bad ? 1 : 0);
