/**
 * 配音回归(全剧本,2026-10-17 整段合并口径)。
 *
 * 这套测试盯的是「预取时机」和「串行」——headless 里听不到声音,
 * 但这两件事错了玩家立刻能感觉到(卡顿、串音、上一章跟着念)。
 *
 *   1. 入局就拉本章配音(intro 已合并为一条),且只拉 opus 一套格式
 *   2. 首句在「继续」之前就已预取好(缓冲窗口只有几百毫秒,来不及现拉)
 *   3. 请求是串行的,不会一次并发几十条把连接池打满
 *   4. 换相位会掐断上一段,回选择页也掐断
 *
 * 命名(与 voice.ts 头注释同口径):
 *   intro / <事件id>(N-N、N-Nb、4-5-pre 这类事件 id、章末事件 cj-* 等)
 *   choice_<卡id>(_oN) / ending_E*(_变体) / crisis_C-*(_oN) / corr_N
 *
 * 配音与 BGM 的区分:dist/assets 里的音频只有这两类,BGM 命名固定为
 * idle / <剧本>-(inst|vocal),所以「是音频且不是 BGM」就是配音 ——
 * 事件/卡片 id 各剧本不同(lisi 是 ACT-N,jingke 是 JK-ACT-N……),正向枚举会漂移。
 */
const fs = require('fs');
const path = require('path');
const { withPage, report, sleep, STEP_SNIPPET } = require('./lib/harness.cjs');

const AUD = path.join(__dirname, '..', 'dist', 'assets');
// Vite 会把 src/assets/** 全部摊平到 dist/assets/ 并加 hash,
// 所以产物 URL 里既没有剧本名也没有章号 —— 只能靠文件名本身识别。
// CDP 给的是完整绝对 URL(http://127.0.0.1:PORT/assets/xxx),匹配其中的 /assets/ 片段。
const BGM_SRC = '(?:idle|(?:lisi|jingke|hanxin|xiangyu|chensheng)-(?:inst|vocal))-[A-Za-z0-9_-]{8}\\.(?:webm|m4a)$';
const AUDIO_URL_RE = /\/assets\/[^/]+\.(?:webm|m4a)$/;
const BGM_RE = new RegExp(`\\/assets\\/${BGM_SRC}`);
// 音效名单:必须与 src/game/sfx.ts 的 SfxName 同步。
// 运行时网络日志里 sfx 和配音都长成 /assets/xxx.webm,不按名字排除就会混进来。
const SFX_NAMES = new Set([
  'click', 'card', 'enter', 'back', 'dialog', 'seal', 'coin', 'gain', 'down',
  'dice-roll', 'dice-land', 'chapter', 'ending', 'fail',
]);
const SFX_RE = `(?:${[...SFX_NAMES].join('|')})-[A-Za-z0-9_-]{8}\\.(?:webm|m4a)$`;
const isVoiceUrl = (u) => AUDIO_URL_RE.test(u) && !BGM_RE.test(u) && !new RegExp(`\\/assets\\/${SFX_RE}`).test(u);
// 用在 evaluate 字符串里的页面端判定:文件名是音频,且既不是 BGM 也不是音效
const IS_VOICE_FN = `(a => { const s = (a.getAttribute('src') || '').split('/').pop(); return /\\.(webm|m4a)$/.test(s) && !/${BGM_SRC}/.test(s) && !/^(?:${[...SFX_NAMES].join('|')})-[A-Za-z0-9_-]{8}\\.(?:webm|m4a)$/.test(s); })`;
const logical = (u) => u.replace(/^.*\//, '').replace(/-[A-Za-z0-9_-]{8}\.(webm|m4a)$/, '');
const checks = [];
const check = (name, ok, why) => checks.push([ok || !why ? name : `${name}  << ${why}`, !!ok]);

// ---------- 构建产物 ----------
const files = fs.existsSync(AUD) ? fs.readdirSync(AUD).filter((f) => /\.(webm|m4a)$/.test(f)) : [];
const isSfx = (f) => SFX_NAMES.has(f.replace(/-[A-Za-z0-9_-]{8}\.(webm|m4a)$/, ''));
const isVoice = (f) => isVoiceUrl('http://x/assets/' + f) && !isSfx(f);
const isBgm = (f) => BGM_RE.test('http://x/assets/' + f);
const voiceFiles = files.filter(isVoice);
const clipName = (f) => f.replace(/-[A-Za-z0-9_-]{8}\.(webm|m4a)$/, '');

check('配音产物已构建', voiceFiles.length > 0, `${voiceFiles.length} 个`);

// 源 ogg:TTS 批次产物(lisi_v2/lisi_probe + 其余剧本 <key>_v1),一条语音对应一个 webm 产物
// (2026-10-20 起只出 webm,m4a 那套已砍)
const srcDir = path.join(__dirname, '..', '..', 'assets', 'audio', 'voice');
const srcOgg = fs.existsSync(srcDir)
  ? fs.readdirSync(srcDir).filter((f) => /^(?:lisi_(?:v2|probe)|(?:jingke|hanxin|xiangyu|chensheng)_v1)_.*\.ogg$/.test(f))
  : [];
check('配音切片数与 TTS 源一致', voiceFiles.length > 0 && voiceFiles.length === srcOgg.length,
  `产物 ${voiceFiles.length},源 ${srcOgg.length}`);

const names = new Set(voiceFiles.map(clipName));
check('含章首 intro 切片', names.has('intro'), `样例 ${[...names][0]}`);
check('含主线事件切片(N-N)', [...names].some((n) => /^\d+-\d+$/.test(n)));
check('含章末事件切片(cj-*)', [...names].some((n) => /^cj-/.test(n)));
check('含抉择卡切片(choice_*-ACT-*)', [...names].some((n) => /^choice_(?:[A-Z]+-)?ACT-\d+$/.test(n)));
check('含抉择卡结算切片(choice_*_oN)', [...names].some((n) => /^choice_(?:[A-Z]+-)?ACT-\d+_o\d+$/.test(n)));
check('含结局切片(ending_E*)', [...names].some((n) => /^ending_E\d+$/.test(n)));
check('含结局变体切片(ending_E*_*)', [...names].some((n) => /^ending_E\d+_[a-z]+$/.test(n)));
check('含危机切片(crisis_C-*)', [...names].some((n) => /^crisis_C-[A-Za-z0-9]+$/.test(n)));
check('含危机结算切片(crisis_*_oN)', [...names].some((n) => /^crisis_C-[A-Za-z0-9]+_o\d+$/.test(n)));
check('含历史修正切片(corr_N)', [...names].some((n) => /^corr_\d+$/.test(n)));
// 不配音的类别不该出现在产物里:主线事件选项结算(N-N_oN)、随机事件(rand/R-*)、旧的逐段切片(_sN)
check('不含主线选项结算切片(N-N_oN)', ![...names].some((n) => /^\d+-\d+_o\d+$/.test(n)));
check('不含旧的逐段切片(_sN)', ![...names].some((n) => /_s\d+$/.test(n)));
// 加配音不该动到 BGM。11 首 = 11 个 webm(m4a 已砍)。
check('BGM 产物仍是 11 首', files.filter(isBgm).length === 11,
  `${files.filter(isBgm).length} 个`);
check('配音与 BGM 没有混在同一命名空间', voiceFiles.every(isVoice) && files.filter(isBgm).every((f) => !isVoice(f)));

// 单格式:每条切片只应有 webm,不该再出现 m4a
const strayM4a = voiceFiles.filter((f) => !f.endsWith('.webm'));
check('配音只出 webm 单格式(无 m4a)', strayM4a.length === 0, strayM4a.slice(0, 3).join(', '));

// 合并口径下单条最长约 240 字:opus 均值 ~213KB、最大 ~455KB(2026-10-17 李斯 134 条实测)
const opusSize = (l) => {
  const f = voiceFiles.find((x) => clipName(x) === l && x.endsWith('.webm'));
  return f ? fs.statSync(path.join(AUD, f)).size : 0;
};
const clipKeys = [...new Set(voiceFiles.map(clipName))];
const avgOpus = clipKeys.reduce((s, l) => s + opusSize(l), 0) / clipKeys.length;
check('单条 opus 均值在预算内(≤260 KB)', avgOpus <= 260 * 1024, `${(avgOpus / 1024).toFixed(0)} KB`);
const maxOpus = Math.max(...clipKeys.map(opusSize));
check('单条 opus 最大 ≤512 KB', maxOpus <= 512 * 1024, `${(maxOpus / 1024).toFixed(0)} KB`);

// ---------- 运行时 ----------
withPage(async ({ evaluate, cdp, url, netLog, netReset, netTimeline, enterGame, consoleErrors }) => {
  const rows = [];
  const add = (name, ok, why) => rows.push([ok || !why ? name : `${name}  << ${why}`, !!ok]);
  const voiceReqs = () => netLog().filter((r) => isVoiceUrl(r.url));

  // 不给 __QS__ 加「跳章」后门 —— 那样测的是后门而不是真实链路。
  // c0 只有 4 个事件,按真实流程点过去就行。
  const advance = async (wantCh, max = 300) => {
    for (let i = 0; i < max; i += 1) {
      const ch = await evaluate('window.__QS__.game.chapter()?.id || ""');
      if (ch === wantCh) return true;
      // 行动卡结算动画序列(2026-10-17 拍板)自动推进但真实耗时,点完要等发牌落定;
      // 随机事件落定无「继 续」也要等自动推进(否则 idle 空转烧步数)
      await evaluate(`(async () => { ${STEP_SNIPPET} const r = advanceOnce(); if (r === 'card') await waitDeal(); else await waitSettle(); })()`);
      await sleep(70);
    }
    return false;
  };

  // c0 入局即念章首:__QS__ 是入局后才挂上的,所以必须先 enterGame
  await enterGame();
  await sleep(1200);
  const atC0 = voiceReqs();
  add('c0 入局拉到了章首配音', atC0.some((r) => logical(r.url) === 'intro'),
    `却拉了 ${atC0.map((r) => logical(r.url)).join(', ') || '(无)'}`);

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

  add('拉的是配音切片(intro/事件id)', uniq.length > 0, uniq.slice(0, 4).join(',') || '(无)');
  add('URL 带构建 hash', c1.every((r) => /-[A-Za-z0-9_-]{8}\.(webm|m4a)$/.test(r.url)),
    c1[0]?.url);

  // 串行:配音必须一条接一条地取。
  //
  // 原来用「进 c1 后拉的条数 ≤ 6」这个魔数近似 —— 它既不是串行的判据
  // (并发 6 条照样 ≤ 6),又会随章节内容多少飘,恒真恒假都说不清。
  // 真正的判据是「同时在途的请求数」:用 CDP 的 requestWillBeSent /
  // loadingFinished 时刻算每条请求的占用区间,取最大重叠数。
  const voiceTl = netTimeline().filter((r) => isVoiceUrl(r.url));
  const marks = voiceTl.map((r) => r.start);
  const lastMark = marks.length ? Math.max(...marks) : 0;
  // 还没收到 loadingFinished 的(仍在传)按「最后一个已知时刻」收尾
  const endOf = (r) => (r.end === null ? lastMark : r.end);
  let maxConc = 0;
  for (const s of marks) {
    const conc = voiceTl.filter((o) => o.start <= s && endOf(o) > s).length;
    if (conc > maxConc) maxConc = conc;
  }
  add('配音请求是串行的(同时在途 ≤ 1)', voiceTl.length > 0 && maxConc <= 1,
    `同时在途 ${maxConc} 条,共 ${voiceTl.length} 条`);
  add('配音请求都有正常的起止时刻', voiceTl.length > 0 && voiceTl.every((r) => r.end !== null && r.end >= r.start),
    `${voiceTl.filter((r) => r.end === null).length} 条没有结束时刻`);

  const state = await evaluate(`(() => {
    const as = [...document.querySelectorAll('audio')];
    // BGM 双轨轮播后不再开单曲循环,不能再用 a.loop 认它;
    // 按 src 逻辑名认:剧本 BGM 是 <key>-inst / <key>-vocal,配音切片是 intro/N-N/choice_* 等。
    const bg = as.find(a => /-(inst|vocal)-[A-Za-z0-9_-]{8}\\.(webm|m4a)$/.test(a.getAttribute('src') || ''));
    return { n: as.length, hasBgm: !!bg, vol: bg ? bg.volume : null };
  })()`);
  add('audio 元素已挂载', state.n >= 1, `${state.n} 个`);
  add('BGM 存在且音量正常', state.hasBgm && state.vol > 0.05, `vol=${state.vol}`);

  // 页面不可见:当前句暂停、队列挂起;回前台续播(与 BGM 同策略,见 audio.cjs)。
  // 句间有 260ms 空档,先等到有一句真的在播再掐,否则断言会落在空档上。
  let playing = false;
  for (let i = 0; i < 30; i += 1) {
    playing = await evaluate(`[...document.querySelectorAll('audio')]
      .some(a => (${IS_VOICE_FN})(a) && !a.paused)`);
    if (playing) break;
    await sleep(200);
  }
  add('c1 有配音正在播', playing, '等了 6 秒还没有一句在播');
  const t2 = await cdp.send('Target.createTarget', { url: 'about:blank' });
  await cdp.send('Target.activateTarget', { targetId: t2.targetId });
  await sleep(500);
  const hidV = await evaluate(`(() => {
    const v = [...document.querySelectorAll('audio')].find(${IS_VOICE_FN});
    return { vis: document.visibilityState, paused: v ? v.paused : null };
  })()`);
  add('页面进后台 → 配音暂停', hidV.vis === 'hidden' && hidV.paused === true, JSON.stringify(hidV));
  const { targetInfos } = await cdp.send('Target.getTargets');
  const mine = targetInfos.find((t) => (t.url || '').startsWith(url));
  if (mine) await cdp.send('Target.activateTarget', { targetId: mine.targetId });
  await cdp.send('Target.closeTarget', { targetId: t2.targetId }).catch(() => {});
  await sleep(600);
  const backV = await evaluate(`(() => {
    const v = [...document.querySelectorAll('audio')].find(${IS_VOICE_FN});
    return { vis: document.visibilityState, paused: v ? v.paused : null };
  })()`);
  // 续播可能跨过句间空档:回前台后要么这句继续播,要么下一句已顶上
  add('回前台 → 配音续播', backV.vis === 'visible' && backV.paused === false, JSON.stringify(backV));

  // 换相位要掐断
  netReset();
  await evaluate('window.__QS__.goSelect()');
  await sleep(700);
  const afterExit = netLog().filter((r) => isVoiceUrl(r.url));
  add('退出后不再拉新配音', afterExit.length === 0, afterExit.map((r) => logical(r.url)).join(', '));

  // 只查配音切片:goSelect 会播 idle BGM,后台恢复路径下它是合法在播的,不能一起算。
  const paused = await evaluate(`[...document.querySelectorAll('audio')]
    .filter(${IS_VOICE_FN})
    .every(a => a.paused || !a.getAttribute('src'))`);
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
