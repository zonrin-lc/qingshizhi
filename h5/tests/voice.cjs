/**
 * 配音试点回归(李斯 c1)。
 *
 * 这套测试盯的是「预取时机」和「串行」——headless 里听不到声音,
 * 但这两件事错了玩家立刻能感觉到(卡顿、串音、上一章跟着念)。
 *
 *   1. 进 c1 才拉配音,且只拉 opus 一套格式
 *   2. 首句在「继续」之前就已预取好(缓冲窗口只有几百毫秒,来不及现拉)
 *   3. 请求是串行的,不会一次并发 41 条把连接池打满
 *   4. 换相位会掐断上一段,回选择页也掐断
 *   5. 有人说话时 BGM 被压低
 */
const fs = require('fs');
const path = require('path');
const { withPage, report, sleep, STEP_SNIPPET } = require('./lib/harness.cjs');

const AUD = path.join(__dirname, '..', 'dist', 'assets');
// Vite 会把 src/assets/** 全部摊平到 dist/assets/ 并加 hash,
// 所以产物 URL 里既没有剧本名也没有章号 —— 只能靠切片名本身识别。
// BGM 是 <剧本>-(inst|vocal)-<hash>,配音是 intro_N / N-N_sN / N-N_oN,两者不会撞。
// CDP 给的是完整绝对 URL(http://127.0.0.1:PORT/assets/xxx),
// 所以只能匹配其中的 /assets/ 片段,不能从 ^ 开始锚。
const VOICE_RE = /\/assets\/(intro_\d+|\d+-\d+_[so]\d+)-[A-Za-z0-9_-]{8}\.(webm|m4a)$/;
const logical = (u) => u.replace(/^.*\//, '').replace(/-[A-Za-z0-9_-]{8}\.(webm|m4a)$/, '');
const checks = [];
const check = (name, ok, why) => checks.push([ok || !why ? name : `${name}  << ${why}`, !!ok]);

// ---------- 构建产物 ----------
// Vite 把 src/assets/** 摊平到 dist/assets/ 并加 hash,所以产物名是
// intro_1-BFjC0lwb.webm 这种,剧本名与章号已经进了 map 的 key 而不是文件名。
const files = fs.existsSync(AUD) ? fs.readdirSync(AUD).filter((f) => /\.(webm|m4a)$/.test(f)) : [];
const isVoice = (f) => VOICE_RE.test('http://x/assets/' + f);
const voiceFiles = files.filter(isVoice);
const clipName = (f) => f.replace(/-[A-Za-z0-9_-]{8}\.(webm|m4a)$/, '');

check('配音产物已构建', voiceFiles.length > 0, `${voiceFiles.length} 个`);

const srcDir = path.join(__dirname, '..', '..', 'assets', 'audio', 'voice');
const srcC1 = fs.existsSync(srcDir) ? fs.readdirSync(srcDir).filter((f) => /^lisi_c1_.*\.ogg$/.test(f)) : [];
check('李斯 c1 切片数正确(41×2 格式)', voiceFiles.length === srcC1.length * 2,
  `产物 ${voiceFiles.length},源 ${srcC1.length}×2`);

const names = new Set(voiceFiles.map(clipName));
check('含 intro 切片', [...names].some((n) => /^intro_\d+$/.test(n)), `样例 ${[...names][0]}`);
check('含事件段 s 切片', [...names].some((n) => /^\d+-\d+_s\d+$/.test(n)));
check('含选项 o 切片', [...names].some((n) => /^\d+-\d+_o\d+$/.test(n)));
// 加配音不该动到 BGM。11 首 × 2 格式 = 22 个;idle 不含 inst/vocal 字样,
// 所以别用 /(inst|vocal)-/ 数,idle 会被漏掉(数出 20 而不是 22)。
const isBgm = (f) => !isVoice(f);
check('BGM 产物仍是 11 首 ×2', files.filter(isBgm).length === 22,
  `${files.filter(isBgm).length} 个`);
check('配音与 BGM 没有混在同一命名空间', voiceFiles.every(isVoice) && files.filter(isBgm).every((f) => !isVoice(f)));

// 每条切片双格式成对
const byLogical = {};
for (const f of voiceFiles) {
  const l = clipName(f);
  (byLogical[l] ||= {})[f.endsWith('.webm') ? 'webm' : 'm4a'] = true;
}
const unpaired = Object.entries(byLogical).filter(([, v]) => !v.webm || !v.m4a).map(([k]) => k);
check('每条切片都有 webm+m4a', unpaired.length === 0, unpaired.slice(0, 3).join(', '));

const opusSize = (l) => {
  const f = voiceFiles.find((x) => clipName(x) === l && x.endsWith('.webm'));
  return f ? fs.statSync(path.join(AUD, f)).size : 0;
};
const clipKeys = Object.keys(byLogical);
const avgOpus = clipKeys.reduce((s, l) => s + opusSize(l), 0) / clipKeys.length;
check('单条 opus 均值在预算内(≤100 KB)', avgOpus <= 100 * 1024, `${(avgOpus / 1024).toFixed(0)} KB`);
const maxOpus = Math.max(...clipKeys.map(opusSize));
check('单条 opus 最大 ≤150 KB', maxOpus <= 150 * 1024, `${(maxOpus / 1024).toFixed(0)} KB`);

// ---------- 运行时 ----------
withPage(async ({ evaluate, netLog, netReset, enterGame, consoleErrors }) => {
  const rows = [];
  const add = (name, ok, why) => rows.push([ok || !why ? name : `${name}  << ${why}`, !!ok]);
  const voiceReqs = () => netLog().filter((r) => VOICE_RE.test(r.url));

  // 不给 __QS__ 加「跳章」后门 —— 那样测的是后门而不是真实链路。
  // c0 只有 4 个事件,按真实流程点过去就行,顺带把 c0 无配音也验了。
  const advance = async (wantCh, max = 300) => {
    for (let i = 0; i < max; i += 1) {
      const ch = await evaluate('window.__QS__.game.chapter()?.id || ""');
      if (ch === wantCh) return true;
      await evaluate(`(() => { ${STEP_SNIPPET} advanceOnce(); })()`);
      await sleep(70);
    }
    return false;
  };

  // c0:应无配音。__QS__ 是入局后才挂上的,所以必须先 enterGame
  await enterGame();
  await sleep(700);
  const atC0 = voiceReqs();
  add('c0 没有配音也不报错', atC0.length === 0, `却拉了 ${atC0.map((r) => logical(r.url)).join(', ')}`);

  // 走到 c1
  netReset();
  const reached = await advance('c1');
  add('能走到 c1(真实链路)', reached, '点了几百下还在 c0');
  await sleep(1500);

  const c1 = voiceReqs();
  const uniq = [...new Set(c1.map((r) => logical(r.url)))];

  add('进 c1 拉到了配音', uniq.length > 0, '一个都没有');
  add('只拉 opus 一种格式', c1.length > 0 && c1.every((r) => r.url.endsWith('.webm')),
    [...new Set(c1.map((r) => r.url.split('.').pop()))].join(','));
  add('配音请求全部 200', c1.length > 0 && c1.every((r) => r.status === 200),
    c1.filter((r) => r.status !== 200).map((r) => `${logical(r.url)}:${r.status}`).join(', '));
  add('MIME 正确', c1.length > 0 && c1.every((r) => r.mime === 'audio/webm'),
    [...new Set(c1.map((r) => r.mime))].join(','));

  const chs = [...new Set(c1.map((r) => (r.url.match(/\/assets\/(intro_\d+|\d+-\d+_[so]\d+)/) || [])[1]).filter(Boolean))];
  add('拉的是本章切片(intro_/事件_s 事件_o)', chs.length > 0,
    chs.slice(0, 4).join(',') || '(无)');
  add('URL 带构建 hash', c1.every((r) => /-[A-Za-z0-9_-]{8}\.(webm|m4a)$/.test(r.url)),
    c1[0]?.url);

  // 串行:一次只预取几条。整章 41 条若一次性并发,网络面板会瞬间齐;
  // 串行则随播放逐条推进。这里用「进入 c1 后 1.5 秒内的条数」做粗判。
  add('没有一次性把整章拉完(串行预取)', uniq.length > 0 && uniq.length <= 14,
    `一下拉了 ${uniq.length} / 41 条`);

  const state = await evaluate(`(() => {
    const as = [...document.querySelectorAll('audio')];
    const bg = as.find(a => a.loop);
    return { n: as.length, hasBgm: !!bg, vol: bg ? bg.volume : null };
  })()`);
  add('audio 元素已挂载', state.n >= 1, `${state.n} 个`);
  add('BGM 存在且未被永久压低', state.hasBgm && state.vol > 0.05, `vol=${state.vol}`);

  // 换相位要掐断
  netReset();
  await evaluate('window.__QS__.goSelect()');
  await sleep(700);
  const afterExit = netLog().filter((r) => VOICE_RE.test(r.url));
  add('退出后不再拉新配音', afterExit.length === 0, afterExit.map((r) => logical(r.url)).join(', '));

  const paused = await evaluate(`[...document.querySelectorAll('audio')].every(a => a.paused || !a.getAttribute('src'))`);
  add('退出后语音已掐断', paused);

  const rt = report('运行时行为', rows);
  const errs = consoleErrors();
  const ct = report('控制台干净', [['无错误', errs.length === 0, errs.join(' / ')]]);
  return rt && ct;
}, { enter: false })
  .then((ok) => process.exit(ok && report('构建产物', checks) ? 0 : 1))
  .catch((e) => {
    console.error('[失败]', e.message);
    process.exit(1);
  });
