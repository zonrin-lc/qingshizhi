/**
 * 运行时素材装配:把「源素材目录」里真正要进包的文件复制到工程根的 assets/。
 *
 * 一个真源、两个消费者:
 *   - vite dev 直接按 /assets/... 提供(工程根就是站点根)
 *   - pack-rpk.mjs 把 assets/ 整体拷进 rpk/(快游戏的包根)
 *
 * 主包预算 < 4MB 是所有取舍的前提,所以这里显式列出清单,
 * 不做「整个 src/assets 全拷」——那会把 voice(50MB) 一起带进主包。
 */

import { cp, mkdir, readdir, readFile, stat, rm, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const src = join(root, 'src', 'assets');
const pub = join(root, 'public');
const out = join(root, 'assets');

/** 主包清单:每个条目都要能说出为什么必须随包 */
const MANIFEST = [
  // 一屏底图
  'bg/game.webp',
  // 正文卷轴
  'panel/scroll-main.webp',
  // 选项卡底板 / 选中态 / 史实章
  'card/card.webp',
  'card/card-hi.webp',
  'card/card-badge.webp',
  // 菜单线:三张分隔页底图
  'bg/select.webp',
  'bg/save.webp',
  'bg/settings.webp',
  // 主菜单:水墨底 + 竖排题名 + 花纹徽 / 朱印
  'lua/menu-bg-1440.webp',
  'lua/title-calligraphy.webp',
  'lua/logo-icon.webp',
  'lua/logo-yin.webp',
  // 选剧本封面:原图 768 见方太重,这里只要 384 的压缩版
  'cover/lisi-384.webp',
  'cover/jingke-384.webp',
  'cover/hanxin-384.webp',
  'cover/xiangyu-384.webp',
  'cover/chensheng-384.webp',
];

/** 整目录收进主包:音效单件 5~20KB,全部 14 条也不到 150KB */
const MANIFEST_DIRS = ['sfx'];

async function sizeOf(dir) {
  let total = 0;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) total += await sizeOf(p);
    else total += (await stat(p)).size;
  }
  return total;
}

await rm(out, { recursive: true, force: true });
await mkdir(join(out, 'fonts'), { recursive: true });

let copied = 0;
for (const rel of MANIFEST) {
  const from = join(src, rel);
  const to = join(out, rel);
  try {
    await stat(from);
  } catch {
    console.warn(`[assets] 缺失: ${rel}`);
    continue;
  }
  await mkdir(dirname(to), { recursive: true });
  await cp(from, to);
  copied += (await stat(to)).size;
  console.log(`[assets] + ${relative(out, to)}`);
}

// 整目录:把目录下的文件平铺拷进去(sfx/ 没有子目录)
for (const dirRel of MANIFEST_DIRS) {
  const from = join(src, dirRel);
  let entries;
  try {
    entries = await readdir(from, { withFileTypes: true });
  } catch {
    console.warn(`[assets] 缺失目录: ${dirRel}`);
    continue;
  }
  await mkdir(join(out, dirRel), { recursive: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const rel = `${dirRel}/${entry.name}`;
    await cp(join(from, entry.name), join(out, rel));
    copied += (await stat(join(out, rel))).size;
    console.log(`[assets] + ${rel}`);
  }
}

// 字体单独在 public/fonts 下(H5 侧由 index.html 的 @font-face 引用)。
// 原字体 2.1MB 几乎吃掉主包一半预算,这里按「五本剧本 + 引擎/界面源码里的字面量」
// 做子集;缺 pyftsubset 时退回整份拷贝(dev 仍可用,只是包变大)。
const fontFrom = join(pub, 'fonts', 'qingshi-kai.ttf');
const fontTo = join(out, 'fonts', 'qingshi-kai.ttf');

/** 深搜收集文本:剧本 JSON + engine.js + 本线 TS 里的中文/字符串字面量 */
async function collectText() {
  let text = '';
  const dataDir = join(root, '..', 'prot', 'lua-data');
  for (const f of await readdir(dataDir)) {
    if (f.endsWith('.json')) text += await readFile(join(dataDir, f), 'utf8');
  }
  const engine = join(root, '..', 'prot', 'engine.js');
  try {
    text += await readFile(engine, 'utf8');
  } catch {
    /* 引擎不在同层时忽略 */
  }
  const walk = async (dir) => {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === 'assets') continue;
        await walk(p);
      } else if (/\.(ts|html|css)$/.test(e.name)) {
        text += await readFile(p, 'utf8');
      }
    }
  };
  await walk(join(root, 'src'));
  return text;
}

async function subsetFont() {
  try {
    await stat(fontFrom);
  } catch {
    console.warn('[assets] 缺失: fonts/qingshi-kai.ttf(public/fonts)');
    return;
  }
  try {
    const raw = await collectText();
    // 基础 ASCII + 常用标点必须在,其余按出现过的字符收
    const base = ' !"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~';
    const extra = '…—·｜「」『』（）、，。：；！？“”‘’《》〈〉％×≈－／　';
    const chars = [...new Set((base + extra + raw).split(''))].filter((c) => c.codePointAt(0) > 31).join('');
    const tmp = join(out, 'fonts', '_chars.txt');
    await writeFile(tmp, chars, 'utf8');
    const attempt = (cmd, args) =>
      new Promise((res, rej) => {
        execFile(cmd, args, { maxBuffer: 1 << 24 }, (err) => (err ? rej(err) : res()));
      });
    const args = [fontFrom, `--text-file=${tmp}`, `--output-file=${fontTo}`, '--layout-features=*'];
    try {
      await attempt('pyftsubset', args);
    } catch {
      await attempt('python', ['-m', 'fontTools.subset', ...args]);
    }
    await rm(tmp, { force: true });
    const before = (await stat(fontFrom)).size;
    const after = (await stat(fontTo)).size;
    console.log(
      `[assets] + fonts/qingshi-kai.ttf(子集 ${Math.round(before / 1024)}KB → ${Math.round(after / 1024)}KB)`,
    );
    return;
  } catch (e) {
    console.warn(`[assets] 字体子集失败,退回整份:${String(e).slice(0, 120)}`);
  }
  await cp(fontFrom, fontTo);
  console.log('[assets] + fonts/qingshi-kai.ttf(整份)');
}

await subsetFont();

const total = await sizeOf(out);
console.log(
  `[assets] 装配完成 ${(total / 1024 / 1024).toFixed(2)}MB / 主包上限 4MB(剩余 ${(4 - total / 1024 / 1024).toFixed(2)}MB)`,
);
void copied;
