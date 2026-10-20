/**
 * 配音落位:把 assets/audio/voice/ 里的 TTS 批次 ogg 转成 webm(opus)+m4a 双格式,
 * 按清单 <dir>/<name> 放到 h5/src/assets/voice/<scenario>/<dir>/<name>.{webm,m4a}。
 *
 * 用法: node tools/place-voice.cjs <scenarioKey> <批次前缀> [<清单路径>]
 *   node tools/place-voice.cjs jingke jingke_v1
 *   清单默认 C:/Users/28283/.kimi-code/vm/<key>-manifest.json
 *
 * 批次文件命名约定:<前缀>_b<批次号>_<序号>_<hash>.ogg,清单第 i 条 ↔ b<floor(i/10)>_<i%10+1>。
 * (李斯试点期的两条例外——清单[0]/[1] 来自 lisi_probe_1/2——用第三参传清单,再手工核对。)
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const [key, prefix, manifestPath] = process.argv.slice(2);
if (!key || !prefix) {
  console.error('用法: node tools/place-voice.cjs <scenarioKey> <批次前缀> [清单路径]');
  process.exit(1);
}
const manifest = JSON.parse(fs.readFileSync(
  manifestPath ?? `C:/Users/28283/.kimi-code/vm/${key}-manifest.json`, 'utf8'));
const SRC = 'D:/MUSI/QINGSHIZHI/assets/audio/voice';
const DST = `D:/MUSI/QINGSHIZHI/h5/src/assets/voice/${key}`;

const srcOf = (i) => {
  const b = Math.floor(i / 10);
  const seq = (i % 10) + 1;
  const hit = fs.readdirSync(SRC).find((f) =>
    f.startsWith(`${prefix}_b${b}_${seq}_`) && f.endsWith('.ogg'));
  return hit ? path.join(SRC, hit) : null;
};

let ok = 0;
const fail = [];
manifest.forEach((e, i) => {
  const src = srcOf(i);
  if (!src) { fail.push(`${i}:缺源 b${Math.floor(i / 10)}_${(i % 10) + 1}`); return; }
  const dir = path.join(DST, e.dir);
  fs.mkdirSync(dir, { recursive: true });
  try {
    execFileSync('ffmpeg', ['-y', '-i', src, '-c:a', 'copy', path.join(dir, `${e.name}.webm`)], { stdio: 'pipe' });
    execFileSync('ffmpeg', ['-y', '-i', src, '-c:a', 'aac', '-b:a', '96k', path.join(dir, `${e.name}.m4a`)], { stdio: 'pipe' });
    ok += 1;
  } catch {
    fail.push(`${i}:${e.dir}/${e.name} ffmpeg 失败`);
  }
});
console.log(`${key}: ok ${ok}/${manifest.length}`);
if (fail.length) { console.log('FAIL:\n' + fail.join('\n')); process.exit(1); }
