/**
 * BGM 回归。
 *
 * 这套测试盯的不是「有没有声音」——headless 里听不到,
 * 而是那三件真正会出事的事:
 *   1. URL 对不对(glob 不加 ?url 会烤出未带 hash 的路径,全 404)
 *   2. MIME 对不对(错了是「下到了但不解码」,最容易被误判成 autoplay 问题)
 *   3. 下得多不多(语音版不预载;只下当前剧本的纯音乐)
 */
const fs = require('fs');
const path = require('path');
const { withPage, report, sleep } = require('./lib/harness.cjs');

const AUD = path.join(__dirname, '..', 'dist', 'assets');
const AUDIO_RE = /\.(webm|m4a)(\?|$)/;
/**
 * 去掉构建 hash,只留逻辑名。
 * 不能写成 /-[A-Za-z0-9_-]{8,}\.webm$/ —— 那个贪婪模式会连 `lisi-inst` 里的
 * `-inst-Bmeqaz-1` 一起吃掉,剩下 "lisi"。Vite 的 hash 固定 8 位且贴着扩展名,
 * 所以让前面的 (.*) 贪婪回溯到「最后一个 8 位段」,才切得干净。
 */
const logical = (u) => {
  const f = u.replace(/^.*\//, '');
  const m = f.match(/^(.*)-[A-Za-z0-9_-]{8}\.(webm|m4a)$/);
  return m ? m[1] : f.replace(/\.(webm|m4a)$/, '');
};
const extOf = (u) => (u.endsWith('.webm') ? 'webm' : 'm4a');

const WANT = [
  'idle', 'lisi-inst', 'lisi-vocal', 'jingke-inst', 'jingke-vocal',
  'hanxin-inst', 'hanxin-vocal', 'xiangyu-inst', 'xiangyu-vocal',
  'chensheng-inst', 'chensheng-vocal',
];

// 只看 BGM。dist/assets 里还有配音切片(intro_1-*.webm 之类),
// 那部分由 tests/voice.cjs 负责 —— 这套测试别把它们算进来。
const isBgm = (f) =>
  /^(idle|(lisi|jingke|hanxin|xiangyu|chensheng)-(inst|vocal))-[A-Za-z0-9_-]{8}\.(webm|m4a)$/.test(f);
const distAudio = fs.existsSync(AUD) ? fs.readdirSync(AUD).filter((f) => isBgm(f)) : [];
// 只去 hash,别把 lisi-/idle- 前缀也剥掉 —— 下面按 'lisi-inst' 这种逻辑名查
const base = (f) => f.replace(/-[A-Za-z0-9_-]{8}\.(webm|m4a)$/, '');
const size = (name, ext) => {
  const f = distAudio.find((x) => base(x) === name && x.endsWith(ext));
  return f ? fs.statSync(path.join(AUD, f)).size : 0;
};

const checks = [];
const check = (name, ok, why) => checks.push([ok || !why ? name : `${name}  << ${why}`, !!ok]);

// ---------- 构建产物(纯 Node) ----------
// files/distAudio/base/size 已在上面按 BGM 过滤后定义。

check('产物齐全(11 首)', distAudio.length === WANT.length * 2, `实到 ${distAudio.length} 个`);
for (const w of WANT) check(`  ${w} 有 webm`, size(w, '.webm') > 0);
check('每首都有 m4a 兜底', WANT.every((w) => size(w, '.m4a') > 0));
check('无 0 字节产物', distAudio.every((f) => fs.statSync(path.join(AUD, f)).size >= 1024));
// 注意:不要断言「inst 一定小于 vocal」。实测 hanxin 的纯音乐版(1496 KB)
// 反而比语音版(1469 KB)大——混音密度是内容属性,不是缺陷。
// 预算按实测最差值定:aac 在持续音上会超出 -b:a 目标,64k 实测能到 ~77 kb/s。
// vocal 版是点播才下的,给它 2 MiB;inst 版另有更紧的预算(见下)。
check(
  '产物都在预算内(≤2 MiB)',
  distAudio.every((f) => fs.statSync(path.join(AUD, f)).size <= 2 * 1024 * 1024),
  `最大 ${Math.round(Math.max(...distAudio.map((f) => fs.statSync(path.join(AUD, f)).size)) / 1024)} KB`,
);
const instKb = size('lisi-inst', '.webm') / 1024;
check('入局下载量在预算内(≤1.5 MB)', instKb <= 1536, `lisi-inst ${instKb.toFixed(0)} KB`);
check(
  '每首纯音乐版都 ≤1.5 MB(默认只下这些)',
  ['idle', 'lisi-inst', 'jingke-inst', 'hanxin-inst', 'xiangyu-inst', 'chensheng-inst']
    .every((n) => size(n, '.webm') > 0 && size(n, '.webm') <= 1536 * 1024),
);

const buildOk = report('构建产物', checks);

// ---------- 浏览器里的真实请求行为 ----------
let sawVocal = false;
withPage(async ({ evaluate, netLog, netReset, enterGame, consoleErrors }) => {
  const rows = [];
  // why 只在失败时追加 —— 否则通过的行也挂着「<< 一个音频请求都没有」,
  // 读起来像坏了
  const add = (name, ok, why) => rows.push([ok || !why ? name : `${name}  << ${why}`, !!ok]);

  await enterGame();
  await sleep(900);
  const reqs = netLog().filter((r) => AUDIO_RE.test(r.url));
  sawVocal = reqs.some((r) => logical(r.url).includes('vocal'));

  add('入局确实拉了 BGM', reqs.length > 0, '一个音频请求都没有');
  add('音频请求全部 200', reqs.every((r) => r.status === 200),
    reqs.filter((r) => r.status !== 200).map((r) => `${logical(r.url)}:${r.status}`).join(', '));
  add('URL 带构建 hash(glob 的 ?url 生效)', reqs.every((r) => /-[A-Za-z0-9_-]{8,}\.(webm|m4a)$/.test(r.url)),
    reqs.filter((r) => !/-[A-Za-z0-9_-]{8,}\.(webm|m4a)$/.test(r.url)).map((r) => r.url.split('/').pop())[0]);

  const wantMime = { webm: 'audio/webm', m4a: 'audio/mp4' };
  add('MIME 正确(浏览器会真的解码)', reqs.every((r) => r.mime === wantMime[extOf(r.url)]),
    reqs.filter((r) => r.mime !== wantMime[extOf(r.url)]).map((r) => `${logical(r.url)}=${r.mime}`).join(', '));

  add('只下 1 个音频(不预载 vocal)', reqs.length === 1,
    `下了 ${reqs.length} 个: ${reqs.map((r) => logical(r.url)).join(', ')}`);
  add('下的是当前剧本纯音乐版',
    reqs.length > 0 && logical(reqs[0].url) === 'lisi-inst',
    reqs.map((r) => logical(r.url)).join(', '));

  const probe = await evaluate(`(() => {
    const a = document.createElement('audio');
    return { webm: a.canPlayType('audio/webm; codecs="opus"'), m4a: a.canPlayType('audio/mp4; codecs="mp4a.40.2"') };
  })()`);
  const supportsWebm = probe.webm === 'probably' || probe.webm === 'maybe';
  add('格式选择符合 canPlayType', supportsWebm ? extOf(reqs[0].url) === 'webm' : extOf(reqs[0].url) === 'm4a',
    `支持webm=${supportsWebm},实际下 ${extOf(reqs[0].url)}`);

  const el = await evaluate(`(() => {
    const a = document.querySelector('audio');
    if (!a) return { ok: false, why: '没有 audio 元素' };
    return { ok: true, src: a.getAttribute('src') || '', loop: a.loop, vol: a.volume, paused: a.paused };
  })()`);
  add('audio 元素已挂载且带 src', el.ok && !!el.src, el.why || 'src 为空');
  add('设为循环播放', el.loop === true);
  add('音量压低(背景乐不抢戏)', el.vol > 0 && el.vol <= 0.4, `音量 ${el.vol}`);

  // 回选择页 → 应停声,不切 idle
  netReset();
  await evaluate('window.__QS__.goSelect()');
  await sleep(800);
  const back = netLog().filter((r) => AUDIO_RE.test(r.url));
  add('回选择页停声(不再下曲子)',
    back.length === 0,
    back.map((r) => `${logical(r.url)}:${r.status}`).join(', ') || '(无请求)');

  // 整场看下来 vocal 一次都不该出现
  const all = netLog().filter((r) => AUDIO_RE.test(r.url));
  add('全程没有拉 vocal', !all.some((r) => logical(r.url).includes('vocal')),
    all.map((r) => logical(r.url)).join(', '));

  // withPage 把本函数的返回值原样传出 —— 必须显式 return,
  // 否则外层拿到 undefined,整套装明明全绿却以退出码 1 结束。
  const rt = report('运行时行为', rows);
  const errs = consoleErrors();
  const ct = report('控制台干净', [['无错误', errs.length === 0, errs.join(' / ')]]);
  return rt && ct;
}, { enter: false })
  .then((ok) => process.exit(ok && buildOk ? 0 : 1))
  .catch((e) => {
    console.error('[失败]', e.message);
    process.exit(1);
  });
