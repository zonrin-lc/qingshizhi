/**
 * 配音试听页:把李斯 c1 的 41 条按「玩家实际听到的顺序」连播一遍。
 *
 * 为什么不给原文件:一堆 opus 片段手工点着听不出问题,
 * 真正要验的是「串起来顺不顺」——段与段之间的间隔、
 * 旁白与选项结果的衔接、整体节奏。这个页面对应游戏里的顺序。
 *
 * 生成到 dist/voice-preview.html,直接 npm run preview 就能开。
 * 注意它会重新按叙事顺序排一遍,所以顺序取自 prot/lua-data/lisi.json,
 * 而不是文件名排序 —— 文件名排序会把 1-10 排在 1-2 前面。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const AUD = path.join(DIST, 'assets');
const data = JSON.parse(fs.readFileSync(path.join(ROOT, '..', 'prot', 'lua-data', 'lisi.json'), 'utf8'));

if (!fs.existsSync(AUD)) {
  console.error('找不到 dist/assets —— 请先 npm run build');
  process.exit(1);
}

// dist 里是摊平 + hash 的名字,要把逻辑切片名映射回真实文件名
const files = fs.readdirSync(AUD);
const byClip = {};
for (const f of files) {
  const m = f.match(/^(intro_\d+|\d+-\d+_[so]\d+)-[A-Za-z0-9_-]{8}\.(webm|m4a)$/);
  if (m) (byClip[m[1]] ||= {})[f.endsWith('.webm') ? 'webm' : 'm4a'] = f;
}

const ch = data.CHAPTERS.find((c) => c.id === 'c1');
if (!ch) {
  console.error('lisi.json 里没有 c1');
  process.exit(1);
}

// 按叙事顺序组装。每一项 = { 标题, 片段名, 台词原文 }
const track = [];
(ch.intro || []).forEach((text, i) => {
  track.push({ group: `章首旁白 ${i + 1}/${ch.intro.length}`, clip: `intro_${i + 1}`, text });
});
for (const ev of ch.events) {
  (ev.segs || []).forEach((text, i) => {
    track.push({ group: `事件 ${ev.id} · 旁白 ${i + 1}/${ev.segs.length}`, clip: `${ev.id}_s${i + 1}`, text });
  });
  // 选项结果不在同一条主线上,归到末尾单独一组 —— 玩家只会听到自己选的那个
  (ev.options || []).forEach((o, i) => {
    track.push({ group: `事件 ${ev.id} · 选项 ${i + 1}「${o.t.slice(0, 10)}」`, clip: `${ev.id}_o${i + 1}`, text: o.res });
  });
}

const missing = track.filter((t) => !byClip[t.clip]?.webm && !byClip[t.clip]?.m4a);
if (missing.length) {
  console.error(`缺 ${missing.length} 条切片: ${missing.map((m) => m.clip).join(', ')}`);
  process.exit(1);
}

const payload = track.map((t) => ({
  ...t,
  webm: byClip[t.clip].webm ? `assets/${byClip[t.clip].webm}` : null,
  m4a: byClip[t.clip].m4a ? `assets/${byClip[t.clip].m4a}` : null,
}));

// BGM:同一套摊平 + hash 的产物。idle 是选择页用的,其余 -inst 是入局那首。
const BGM = [
  { id: 'idle', label: 'idle(选择页,入局时不放)' },
  { id: 'lisi-inst', label: 'lisi-inst(入局默认,李斯)' },
  { id: 'lisi-vocal', label: 'lisi-vocal(李斯·带人声)' },
  { id: 'jingke-inst', label: 'jingke-inst(荆轲)' },
  { id: 'hanxin-inst', label: 'hanxin-inst(韩信)' },
  { id: 'xiangyu-inst', label: 'xiangyu-inst(项羽)' },
  { id: 'chensheng-inst', label: 'chensheng-inst(陈胜)' },
].map((b) => {
  const f = files.find((x) => x.startsWith(`${b.id}-`) && x.endsWith('.webm'));
  const m = files.find((x) => x.startsWith(`${b.id}-`) && x.endsWith('.m4a'));
  return { ...b, webm: f ? `assets/${f}` : null, m4a: m ? `assets/${m}` : null };
});

const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<title>配音试听 ｜ 李斯 第一章 兰陵问道</title>
<style>
  :root { color-scheme: dark; }
  body { margin:0; background:#15120e; color:#e8dfc9; font:15px/1.75 "Noto Serif SC","Songti SC",serif; }
  header { padding:20px 24px 14px; border-bottom:1px solid #3a3225; position:sticky; top:0; background:#15120e; }
  h1 { margin:0 0 4px; font-size:20px; letter-spacing:.06em; }
  .sub { color:#9a8b6d; font-size:13px; }
  .bar { display:flex; gap:10px; align-items:center; margin-top:12px; flex-wrap:wrap; }
  button { background:#3a3225; color:#e8dfc9; border:1px solid #57492f; padding:7px 16px;
           border-radius:3px; font:inherit; font-size:14px; cursor:pointer; }
  button:hover { background:#4d4130; }
  select { background:#3a3225; color:#e8dfc9; border:1px solid #57492f; padding:6px 10px;
           border-radius:3px; font:inherit; font-size:14px; }
  input[type=range] { vertical-align:middle; width:90px; }
  .mode { font-size:13px; color:#b8a887; }
  .mode label { margin-right:12px; cursor:pointer; white-space:nowrap; }
  .row2 { display:flex; gap:14px; align-items:center; margin-top:10px; padding-top:10px;
          border-top:1px solid #2a241b; flex-wrap:wrap; }
  #now { font-size:13px; color:#c9b888; }
  ol { list-style:none; margin:0; padding:8px 0 40px; }
  li { padding:9px 24px; border-bottom:1px solid #241f18; display:flex; gap:14px; align-items:flex-start; }
  li.playing { background:#241f18; }
  li.played .n { color:#6f6248; }
  .n { color:#7a6c50; min-width:2.2em; font-variant-numeric:tabular-nums; font-size:13px; padding-top:2px; }
  .g { color:#8f7f60; font-size:12px; min-width:11em; padding-top:3px; }
  .t { flex:1; color:#cbbf9f; }
  li.playing .t { color:#f2e8cf; }
  .hint { font-size:12px; color:#7a6c50; margin-top:8px; }
</style></head><body>
<header>
  <h1>配音试听 ｜ 李斯 · 第一章 兰陵问道</h1>
  <div class="sub">${payload.length} 条切片,按游戏内实际顺序排列。选项结果放在末尾,玩家只会听到自己选的那一个。</div>
  <div class="bar">
    <button id="play">▶ 从头连播配音</button>
    <button id="stop">■ 停止</button>
    <span class="mode">
      <label><input type="checkbox" id="gap" checked> 句间 0.26 秒停顿(与游戏内一致)</label>
    </span>
    <span id="now">—</span>
  </div>
  <div class="row2">
    <label class="mode">BGM
      <select id="bgmSel">${BGM.map((b, k) => `<option value="${k}">${b.label}</option>`).join('')}</select>
    </label>
    <button id="bgmPlay">▶ 放 BGM</button>
    <label class="mode">BGM 音量 <input type="range" id="bgmVol" min="0" max="100" value="32"></label>
    <label class="mode"><input type="checkbox" id="duck" checked> 配音时压低 BGM(还原游戏内混音)</label>
  </div>
  <div class="hint">入局实况:默认只下 lisi-inst 一首,选择页不放 BGM。压低幅度是游戏里的 0.32 × 0.18 ≈ 6%。</div>
</header>
<ol id="list"></ol>
<audio id="au" preload="auto"></audio>
<audio id="bgm" loop preload="auto"></audio>
<script>
const TRACK = ${JSON.stringify(payload)};
const BGM = ${JSON.stringify(BGM)};
const au = document.getElementById('au');
const bgm = document.getElementById('bgm');
const list = document.getElementById('list');
let i = 0, timer = null;

TRACK.forEach((t, k) => {
  const li = document.createElement('li');
  li.innerHTML = '<span class="n">' + (k+1) + '</span><span class="g">' + t.group +
                 '</span><span class="t">' + t.text + '</span>';
  list.append(li);
});
const rows = [...list.children];

function srcFor(t) {
  const a = document.createElement('audio');
  const okW = a.canPlayType('audio/webm; codecs="opus")');
  if (okW === 'probably' || okW === 'maybe') return t.webm || t.m4a;
  return t.m4a || t.webm;
}

/* ---- BGM:还原游戏里的音量与压低逻辑 ---- */
const BGM_VOL = 0.32, DUCK_TO = 0.32 * 0.18;   // 与 src/game/audio.ts 一致
function bgmSrc() {
  const b = BGM[+document.getElementById('bgmSel').value];
  const a = document.createElement('audio');
  const okW = a.canPlayType('audio/webm; codecs="opus")');
  if (okW === 'probably' || okW === 'maybe') return b.webm || b.m4a;
  return b.m4a || b.webm;
}
function bgmBase() {
  // 滑杆是 0~100,但游戏里基准音量固定 0.32 —— 这里让滑杆缩放基准,
  // 免得听的时候比游戏里响很多,判断混音就失真了
  const s = (+document.getElementById('bgmVol').value) / 32;
  return Math.min(1, BGM_VOL * s);
}
function duck(on) {
  const want = on && document.getElementById('duck').checked ? DUCK_TO : bgmBase();
  if (bgm.src) bgm.volume = want;
}
document.getElementById('bgmPlay').onclick = function () {
  if (!bgm.src) { bgm.src = bgmSrc(); bgm.loop = true; }
  bgm.volume = bgmBase();
  if (bgm.paused) bgm.play(); else bgm.pause();
  this.textContent = bgm.paused ? '▶ 放 BGM' : '■ 停 BGM';
};
document.getElementById('bgmSel').onchange = function () {
  if (!bgm.paused) { bgm.src = bgmSrc(); bgm.volume = bgmBase(); bgm.play(); }
};
document.getElementById('bgmVol').oninput = () => duck(false);

function mark(k) {
  rows.forEach((r, n) => { r.classList.toggle('playing', n === k); r.classList.toggle('played', n < k); });
  rows[k] && rows[k].scrollIntoView({ block: 'center', behavior: 'smooth' });
}
function step() {
  if (i >= TRACK.length) { document.getElementById('now').textContent = '播完了'; duck(false); return; }
  const t = TRACK[i];
  mark(i);
  document.getElementById('now').textContent = (i+1) + ' / ' + TRACK.length + ' · ' + t.clip;
  au.src = srcFor(t);
  duck(true);
  au.play().catch(() => { document.getElementById('now').textContent = '播放被拦:点一下「从头连播配音」'; });
}
au.addEventListener('ended', () => {
  duck(false);
  i++;
  const gap = document.getElementById('gap').checked ? 260 : 0;
  timer = setTimeout(() => { if (i < TRACK.length) step(); }, gap);
});

document.getElementById('play').onclick = () => { clearTimeout(timer); i = 0; step(); };
document.getElementById('stop').onclick = () => {
  clearTimeout(timer); au.pause(); duck(false); i = 0;
  rows.forEach(r => r.classList.remove('playing','played'));
  document.getElementById('now').textContent = '—';
};
rows.forEach((r, k) => r.onclick = () => { clearTimeout(timer); i = k; au.pause(); step(); });
</script></body></html>`;

fs.writeFileSync(path.join(DIST, 'voice-preview.html'), html, 'utf8');
console.log(`已生成 dist/voice-preview.html —— ${payload.length} 条`);
console.log(`顺序:章首旁白 ${ch.intro.length} → ` +
  ch.events.map((e) => `${e.id}(${e.segs.length}旁白+${(e.options||[]).length}选项)`).join(' → '));
