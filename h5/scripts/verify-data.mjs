/**
 * 构建期数据门禁:dev / build 之前先跑 prot/p1-verify.js。
 *
 * 存在的理由:prot/lua-data/*.json 与 prot/lua/data/*.lua 必须始终等价。
 * 这层等价性曾经因为「只重生成 golden.json、漏跑 p1-convert.js」而悄悄破裂
 * (见 docs/封存说明-2026-10-12.md §3.4 的警示),所以把它前置成硬门禁——
 * 数据一旦跑偏,dev/build 直接不启动,而不是等到对拍时才暴露。
 *
 * 退出码:0 = 通过;非 0 = 阻断。
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const protDir = resolve(here, '../../prot');
const verifyScript = resolve(protDir, 'p1-verify.js');

if (!existsSync(verifyScript)) {
  console.error(`[verify:data] 找不到校验脚本: ${verifyScript}`);
  process.exit(1);
}

console.log('[verify:data] 校验 prot/lua-data ↔ prot/lua/data 逐字段等价 ...');

const r = spawnSync(process.execPath, [verifyScript], {
  cwd: protDir,
  encoding: 'utf8',
  // p1-verify 会装载 wasmoon 跑 6 份数据的指纹比对,给足超时
  timeout: 10 * 60 * 1000,
});

const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
process.stdout.write(out);

if (r.error) {
  console.error(`[verify:data] 执行失败: ${r.error.message}`);
  process.exit(1);
}
if (r.status !== 0) {
  console.error(`[verify:data] ✗ 数据校验未通过(exit=${r.status})，已阻断 dev/build。`);
  console.error('[verify:data]   若刚改过数据,正确顺序是: p1-golden.js → p1-convert.js → 本脚本。');
  process.exit(r.status ?? 1);
}
console.log('[verify:data] ✓ 数据校验通过');