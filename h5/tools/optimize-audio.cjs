/**
 * 音频瘦身:把配音切片与 BGM 从 Vorbis 换成 Opus(同容器 .webm,不改扩展名)。
 *
 * 为什么要做(2026-10-21 审查结论):
 * - 配音 600 个切片共 119MB,实测单条 28 秒的切片:Vorbis 77kb/s → 276KB,
 *   同一条换 Opus 32k 单声道只要 115KB(**省 58%**);整包能瘦掉 60MB 上下。
 * - Opus in WebM 的解码支持面早就够了(Android WebView 自 Chrome 32 / 2013 起
 *   就支持;TapTap 客户端的 WebView 必然更现代),而且 place-voice.cjs 本来
 *   就是按「webm(opus)」设计的 —— 只是它当时用 `-c:a copy` 把 TTS 的
 *   Vorbis 原样搬了过来,等于没吃到 Opus 的红利。
 *
 * 做法:逐个文件 ffmpeg 重编 → 比原文件小才替换(不小就保持原样,绝不劣化)。
 * 码率:配音 32k 单声道(人声);BGM 64k 立体声(音乐,留余量)。
 *
 * 用法:
 *   node tools/optimize-audio.cjs            # 实际执行
 *   node tools/optimize-audio.cjs --dry-run  # 只报账,不改文件
 *   node tools/optimize-audio.cjs --jobs 6   # 并发数(默认按 CPU 核数的一半)
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync, spawn } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const VOICE_DIR = path.join(ROOT, 'src/assets/voice');
const BGM_DIR = path.join(ROOT, 'src/assets/bgm');
const DRY = process.argv.includes('--dry-run');
const JOBS = Number((process.argv.find((a) => a.startsWith('--jobs=')) || '').split('=')[1])
  || Math.max(2, Math.min(8, Math.floor(os.cpus().length / 2)));

/** 配音:人声,单声道 32k;BGM:音乐,立体声 64k */
function codecArgs(kind) {
  return kind === 'voice'
    ? ['-c:a', 'libopus', '-b:a', '32k', '-ac', '1', '-vn']
    : ['-c:a', 'libopus', '-b:a', '64k', '-ac', '2', '-vn'];
}

function listFiles() {
  const out = [];
  const walk = (dir, kind) => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p, kind);
      else if (e.name.endsWith('.webm')) out.push({ file: p, kind });
    }
  };
  walk(VOICE_DIR, 'voice');
  walk(BGM_DIR, 'bgm');
  return out;
}

/** 跑一个 ffmpeg 重编,返回新文件大小(失败返回 null) */
let firstError = '';
function convert(file, kind, tmp) {
  return new Promise((resolve) => {
    const args = ['-hide_banner', '-loglevel', 'error', '-y', '-i', file, ...codecArgs(kind), '-f', 'webm', tmp];
    const p = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => { err += d.toString(); });
    p.on('error', (e) => { if (!firstError) firstError = e.message; resolve(null); });
    p.on('close', (code) => {
      if (code !== 0) { if (!firstError) firstError = `exit=${code} ${err.slice(0, 200)}`; resolve(null); return; }
      try { resolve(fs.statSync(tmp).size); } catch (e) { if (!firstError) firstError = e.message; resolve(null); }
    });
  });
}

async function main() {
  const files = listFiles();
  if (!files.length) { console.log('没有待优化的音频文件'); return; }
  const before = files.reduce((n, f) => n + fs.statSync(f.file).size, 0);
  console.log(`待处理 ${files.length} 个文件,合计 ${(before / 1048576).toFixed(1)}MB,并发 ${JOBS}${DRY ? '(试算)' : ''}`);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qs-opt-'));
  let seq = 0;
  let done = 0, saved = 0, skipped = 0, failed = 0;
  const queue = files.slice();

  async function worker() {
    for (;;) {
      const item = queue.shift();
      if (!item) return;
      // 临时名要唯一:不同目录下的同名切片(如各剧本的 intro.webm)会撞车
      const tmp = path.join(tmpDir, `${seq++}-${path.basename(item.file)}.webm`);
      const size = await convert(item.file, item.kind, tmp);
      const orig = fs.statSync(item.file).size;
      if (size === null) { failed += 1; done += 1; continue; }
      if (size < orig) {
        saved += orig - size;
        if (!DRY) fs.copyFileSync(tmp, item.file);
      } else {
        skipped += 1;
      }
      try { fs.unlinkSync(tmp); } catch { /* 临时文件清不掉无妨 */ }
      done += 1;
      if (done % 50 === 0 || done === files.length) {
        console.log(`  ${done}/${files.length} 已省 ${(saved / 1048576).toFixed(1)}MB(跳过 ${skipped},失败 ${failed})`);
      }
    }
  }

  await Promise.all(Array.from({ length: JOBS }, () => worker()));
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* 无妨 */ }

  const after = before - (DRY ? 0 : saved);
  console.log('\n=== 汇总 ===');
  console.log(`优化前: ${(before / 1048576).toFixed(1)}MB`);
  console.log(`优化后: ${(after / 1048576).toFixed(1)}MB`);
  console.log(`省下:   ${(saved / 1048576).toFixed(1)}MB(${((saved / before) * 100).toFixed(1)}%)`);
  console.log(`跳过(重编后没更小,保持原样): ${skipped}   失败: ${failed}`);
  if (firstError) console.log(`首个失败原因: ${firstError}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
