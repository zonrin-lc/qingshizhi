/**
 * 构建期数据门禁:dev / build 之前先跑 prot/verify-data-js.js。
 *
 * 存在的理由:prot/lua-data/*.json(现役数据真源)与 prot/*-data.js(H5 实际吃
 * 的那份)必须始终等价。这层等价性曾经因为「改了 JSON、漏跑 sync-data-js.js」
 * 而悄悄破裂 —— 游戏里跑的是旧数据,没有任何报错。
 *
 * 2026-10-21 换掉了原来的 p1-verify(JSON↔Lua):Lua 引擎版已弃用,Lua 侧的
 * 等价性不再是风险;要紧的是 JSON↔JS 这一段,也就是玩家真正会看到的那份数据。
 *
 * 退出码:0 = 通过;非 0 = 阻断。
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const protDir = resolve(here, '../../prot');
const verifyScript = resolve(protDir, 'verify-data-js.js');

if (!existsSync(verifyScript)) {
  console.error(`[verify:data] 找不到校验脚本: ${verifyScript}`);
  process.exit(1);
}

console.log('[verify:data] 校验 prot/lua-data ↔ prot/*-data.js 逐字段等价 ...');

const r = spawnSync(process.execPath, [verifyScript], {
  cwd: protDir,
  encoding: 'utf8',
  timeout: 2 * 60 * 1000,
});

const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
process.stdout.write(out);

if (r.error) {
  console.error(`[verify:data] 执行失败: ${r.error.message}`);
  process.exit(1);
}
if (r.status !== 0) {
  console.error(`[verify:data] ✗ 数据校验未通过(exit=${r.status})，已阻断 dev/build。`);
  console.error('[verify:data]   若刚改过 prot/lua-data/*.json,正确顺序是: sync-data-js.js → 本脚本。');
  process.exit(r.status ?? 1);
}
console.log('[verify:data] ✓ 数据校验通过');

// ---------- 剧本结构校验(由运行时 main.ts checkData 前移到构建期) ----------
// 原来浏览器启动时逐本拉五份 JSON 查字段,280KB(gzip)首屏开销换一份安心;
// 那是运行期检查唯一能查到的东西,其实构建期查得更早、更便宜。
// 查法与旧 checkData 一致:轻量表 ↔ JSON 的 id/章数对账 + 关键字段非空。
const metaPath = resolve(here, '../src/data/scenario-meta.json');
const dataDir = resolve(protDir, 'lua-data');
const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
const structProblems = [];
for (const s of meta) {
  const f = resolve(dataDir, `${s.key}.json`);
  if (!existsSync(f)) { structProblems.push(`${s.key}: 数据分片缺失 ${f}`); continue; }
  let d;
  try {
    d = JSON.parse(readFileSync(f, 'utf8'));
  } catch (e) {
    structProblems.push(`${s.key}: JSON 解析失败(${e.message})`);
    continue;
  }
  if (!d.SCENARIO?.id) structProblems.push(`${s.key}: SCENARIO.id 缺失`);
  if (d.SCENARIO?.id !== s.id) structProblems.push(`${s.key}: 轻量表 id 与 JSON 不符(${s.id} vs ${d.SCENARIO?.id})`);
  if (!d.CHAPTERS?.length) structProblems.push(`${s.key}: CHAPTERS 为空`);
  if (d.CHAPTERS?.length !== s.chapters) structProblems.push(`${s.key}: 轻量表章数 ${s.chapters} 与 JSON ${d.CHAPTERS?.length} 不符`);
  if (!d.ACTIONS?.length) structProblems.push(`${s.key}: ACTIONS 为空`);
}
if (structProblems.length) {
  console.error('[verify:data] ✗ 剧本结构校验未通过:');
  for (const p of structProblems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`[verify:data] ✓ 剧本结构校验通过(${meta.length} 本)`);