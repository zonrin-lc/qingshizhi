/**
 * 把装配好的 assets/ 与 rolldown 产出的 main.js 收进 rpk/,并打印主包体积。
 *
 * 用法:
 *   node scripts/pack-rpk.mjs          # 只装配
 *   node scripts/pack-rpk.mjs --build  # 再调 quickgame build 出 .rpk
 */

import { cp, mkdir, readdir, rm, stat, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const rpk = join(root, 'rpk');
const assets = join(root, 'assets');

if (!existsSync(assets)) {
  console.error('[pack] 缺少 assets/,先跑 npm run assets');
  process.exit(1);
}
if (!existsSync(join(rpk, 'main.js'))) {
  console.error('[pack] 缺少 rpk/main.js,先跑 npm run build:qg');
  process.exit(1);
}

// icon:从剧本封面图拷一张,manifest 里 /icon.png 指向包根
if (!existsSync(join(rpk, 'icon.png'))) {
  const iconSrc = join(root, 'src', 'assets', 'icon', 'jingke.png');
  if (existsSync(iconSrc)) {
    await copyFile(iconSrc, join(rpk, 'icon.png'));
    console.log('[pack] + icon.png');
  } else {
    console.warn('[pack] 缺 icon.png 且找不到源图');
  }
}

await rm(join(rpk, 'assets'), { recursive: true, force: true });
await cp(assets, join(rpk, 'assets'), { recursive: true });
console.log('[pack] assets/ -> rpk/assets');

async function sizeOf(dir, skip) {
  let total = 0;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (skip.includes(entry.name)) continue;
    const p = join(dir, entry.name);
    if (entry.isDirectory()) total += await sizeOf(p, skip);
    else total += (await stat(p)).size;
  }
  return total;
}

const skip = ['node_modules', 'build', 'dist', 'sign'];
const total = await sizeOf(rpk, skip);
const mb = total / 1024 / 1024;
console.log(`[pack] 主包体积 ${mb.toFixed(2)}MB / 4MB 上限(剩余 ${(4 - mb).toFixed(2)}MB)`);
if (mb > 4) {
  console.error('[pack] 超出主包上限,必须分包或压缩');
  process.exit(2);
}

if (process.argv.includes('--build')) {
  await mkdir(join(rpk, 'dist'), { recursive: true });
  const cli = join(rpk, 'node_modules', '.bin', process.platform === 'win32' ? 'quickgame.cmd' : 'quickgame');
  if (!existsSync(cli)) {
    console.error('[pack] 找不到 quickgame CLI,请在 rpk/ 下 npm i quickgame-cli');
    process.exit(3);
  }
  const r = spawnSync(cli, ['build', '--include-file-ext', '.webp,.webm,.opus'], {
    cwd: rpk,
    stdio: 'inherit',
    shell: true,
  });
  process.exit(r.status ?? 1);
}
