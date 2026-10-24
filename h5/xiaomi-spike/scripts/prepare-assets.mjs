// 把 P0 需要的最小素材集合拷成小游戏包结构:dist/ 就是 rpk 的包根目录。
// 只拷这几个文件,不碰 h5 的构建产物与门禁。

import { copyFile, mkdir, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const spike = resolve(here, '..');
const h5 = resolve(spike, '..');
const repo = resolve(h5, '..');
const dist = join(spike, 'dist');

/** [源文件, 包内路径] */
const COPIES = [
  [join(h5, 'src/assets/bg/game.webp'), 'assets/bg/game.webp'],
  [join(h5, 'src/assets/panel/scroll-main.webp'), 'assets/panel/scroll-main.webp'],
  [join(h5, 'src/assets/card/card.webp'), 'assets/card/card.webp'],
  [join(h5, 'src/assets/card/card-face-jin.webp'), 'assets/card/card-face-jin.webp'],
  [join(h5, 'src/assets/card/card-face-shou.webp'), 'assets/card/card-face-shou.webp'],
  [join(h5, 'src/assets/card/card-face-bao.webp'), 'assets/card/card-face-bao.webp'],
  [join(h5, 'src/assets/portrait/jingke.webp'), 'assets/portrait/jingke.webp'],
  [join(h5, 'public/fonts/qingshi-kai.ttf'), 'assets/fonts/qingshi-kai.ttf'],
  [join(h5, 'src/assets/bgm/idle.webm'), 'assets/audio/idle.webm'],
  [join(h5, 'src/assets/sfx/click.webm'), 'assets/audio/click.webm'],
  [join(repo, 'assets/ui/logo/qingshi-icon-256.png'), 'icon.png'],
];

const TEMPLATES = [
  ['index.html', 'index.html'],
  ['manifest.json', 'manifest.json'],
  ['game-package.json', 'package.json'],
];

// 不删 dist:Windows 下本地静态服务会锁住目录,直接覆盖同名文件即可
await mkdir(dist, { recursive: true });

let total = 0;
for (const [from, to] of COPIES) {
  const target = join(dist, to);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(from, target);
  total += (await stat(target)).size;
}

for (const [from, to] of TEMPLATES) {
  const target = join(dist, to);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(join(spike, 'template', from), target);
  total += (await stat(target)).size;
}

console.log(`[prepare-assets] 已拷贝 ${COPIES.length} 个素材 → ${dist}`);
console.log(`[prepare-assets] 包内资源合计 ${(total / 1024 / 1024).toFixed(2)} MB(不含 main.js)`);
