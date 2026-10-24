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
    // 2026-10-21:原来用 `-c:a copy` 把 TTS 的 Vorbis 原样搬进 webm —— 容器对了,
    // 编码没吃到 Opus 的红利(实测同一条 28 秒切片:Vorbis 276KB → Opus 32k 115KB,
    // 省 58%;整个配音包因此瘦掉 68MB)。改成直接编 Opus 32k 单声道(人声够用),
    // 容器仍是 webm,运行时与测试都不需要改。
    execFileSync('ffmpeg', ['-y', '-i', src, '-c:a', 'libopus', '-b:a', '32k', '-ac', '1', '-vn',
      '-f', 'webm', path.join(dir, `${e.name}.webm`)], { stdio: 'pipe' });
    // m4a 兜底(不支持 webm 的浏览器):码率也一并降一档,体积不再是问题
    execFileSync('ffmpeg', ['-y', '-i', src, '-c:a', 'aac', '-b:a', '48k', '-ac', '1',
      path.join(dir, `${e.name}.m4a`)], { stdio: 'pipe' });
    ok += 1;
  } catch {
    fail.push(`${i}:${e.dir}/${e.name} ffmpeg 失败`);
  }
});
console.log(`${key}: ok ${ok}/${manifest.length}`);
if (fail.length) { console.log('FAIL:\n' + fail.join('\n')); process.exit(1); }
