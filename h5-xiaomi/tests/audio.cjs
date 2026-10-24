/**
 * BGM 回归。
 *
 * 这套测试盯的不是「有没有声音」——headless 里听不到,
 * 而是那几件真正会出事的事:
 *   1. URL 对不对(glob 不加 ?url 会烤出未带 hash 的路径,全 404)
 *   2. MIME 对不对(错了是「下到了但不解码」,最容易被误判成 autoplay 问题)
 *   3. 播放策略对不对:页面加载即下 idle(进游戏就播);
 *      入局后下 inst 并后台预载 vocal,双轨轮播(不开单曲循环);
 *      回选择页切回 idle 循环。
 *
 * 2026-10-20 起音频只出 webm(opus),m4a 那套已砍(见 game/audio.ts 头注)。
 * AUDIO_RE 仍同时匹配两种后缀:多匹配的那一边用来断言「m4a 不该再出现」。
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

check('产物齐全(11 首)', distAudio.length === WANT.length, `实到 ${distAudio.length} 个`);
for (const w of WANT) check(`  ${w} 有 webm`, size(w, '.webm') > 0);
check('只出 webm 单格式(无 m4a 产物)', distAudio.every((f) => f.endsWith('.webm')),
  distAudio.filter((f) => !f.endsWith('.webm')).join(', '));
check('无 0 字节产物', distAudio.every((f) => fs.statSync(path.join(AUD, f)).size >= 1024));
// 注意:不要断言「inst 一定小于 vocal」。实测 hanxin 的纯音乐版(1496 KB)
// 反而比语音版(1469 KB)大——混音密度是内容属性,不是缺陷。
// 预算按实测最差值定;2026-10-17 重编码后最差值为 jingke-vocal.m4a 2243 KB。
// m4a 砍掉后最差值回落到 webm 一侧,预算保留 2.25 MiB 不收紧(留余量)。
check(
  '产物都在预算内(≤2.25 MiB)',
  distAudio.every((f) => fs.statSync(path.join(AUD, f)).size <= 2.25 * 1024 * 1024),
  `最大 ${Math.round(Math.max(...distAudio.map((f) => fs.statSync(path.join(AUD, f)).size)) / 1024)} KB`,
);
const instKb = size('lisi-inst', '.webm') / 1024;
check('入局下载量在预算内(≤1.5 MB)', instKb <= 1536, `lisi-inst ${instKb.toFixed(0)} KB`);
check(
  '每首纯音乐版都 ≤1.5 MB',
  ['idle', 'lisi-inst', 'jingke-inst', 'hanxin-inst', 'xiangyu-inst', 'chensheng-inst']
    .every((n) => size(n, '.webm') > 0 && size(n, '.webm') <= 1536 * 1024),
);

const buildOk = report('构建产物', checks);

// ---------- 浏览器里的真实请求行为 ----------
withPage(async ({ evaluate, cdp, url, netLog, netReset, enterGame, consoleErrors }) => {
  const rows = [];
  // why 只在失败时追加 —— 否则通过的行也挂着「<< 一个音频请求都没有」,
  // 读起来像坏了
  const add = (name, ok, why) => rows.push([ok || !why ? name : `${name}  << ${why}`, !!ok]);

  await enterGame();
  await sleep(900);
  const reqs = netLog().filter((r) => AUDIO_RE.test(r.url));
  const got = [...new Set(reqs.map((r) => logical(r.url)))];

  add('入局确实拉了 BGM', reqs.length > 0, '一个音频请求都没有');
  add('音频请求全部 200', reqs.every((r) => r.status === 200),
    reqs.filter((r) => r.status !== 200).map((r) => `${logical(r.url)}:${r.status}`).join(', '));
  add('运行时不再请求 m4a(单格式已生效)', reqs.every((r) => extOf(r.url) === 'webm'),
    reqs.filter((r) => extOf(r.url) !== 'webm').map((r) => r.url.split('/').pop()).join(', '));
  add('URL 带构建 hash(glob 的 ?url 生效)', reqs.every((r) => /-[A-Za-z0-9_-]{8,}\.(webm|m4a)$/.test(r.url)),
    reqs.filter((r) => !/-[A-Za-z0-9_-]{8,}\.(webm|m4a)$/.test(r.url)).map((r) => r.url.split('/').pop())[0]);

  const wantMime = { webm: 'audio/webm', m4a: 'audio/mp4' };
  add('MIME 正确(浏览器会真的解码)', reqs.every((r) => r.mime === wantMime[extOf(r.url)]),
    reqs.filter((r) => r.mime !== wantMime[extOf(r.url)]).map((r) => `${logical(r.url)}=${r.mime}`).join(', '));

  // 播放策略:加载即下 idle(进游戏就播);入局后 inst 主播 + vocal 后台预载。
  // 缓存可能让个别文件不出现在网络日志里,所以按「逻辑名子集 + 主播放器状态」双向验。
  // 2026-10-17 起入局还会拉配音(章首 intro 等),那是 voice.cjs 的管辖范围,这里剔除再断言;
  // 2026-10-20 起入局链路有点击/入局等 UI 音效(sfx.ts),同样剔除。
  const expectSet = ['idle', 'lisi-inst', 'lisi-vocal'];
  const isVoiceName = (g) => /^(intro|\d+-\d+|cj-|choice_|ending_|crisis_|corr_)/.test(g);
  const isSfxName = (g) => /^(back|card|chapter|click|coin|dialog|dice-land|dice-roll|down|ending|enter|fail|gain|seal)$/.test(g);
  const bgmGot = got.filter((g) => !isVoiceName(g) && !isSfxName(g));
  add('BGM 拉取集合 ⊆ {idle, inst, vocal}', bgmGot.every((g) => expectSet.includes(g)),
    `实到: ${bgmGot.join(', ')}`);
  add('入局拉了当前剧本纯音乐版', got.includes('lisi-inst'), `实到: ${got.join(', ')}`);

  const probe = await evaluate(`(() => {
    const a = document.createElement('audio');
    return { webm: a.canPlayType('audio/webm; codecs="opus"') };
  })()`);
  const supportsWebm = probe.webm === 'probably' || probe.webm === 'maybe';
  const instReq = reqs.find((r) => logical(r.url) === 'lisi-inst');
  // 单格式后不再按 canPlayType 分流;这里顺手记下探针结果,便于读测试时判断环境。
  add('固定下 webm(不再做格式探测分流)', !!instReq && extOf(instReq.url) === 'webm',
    `支持webm=${supportsWebm},实际下 ${instReq ? extOf(instReq.url) : '(无)'}`);

  const probeEl = `(() => {
    const as = [...document.querySelectorAll('audio')];
    const bg = as.find(x => (x.getAttribute('src') || '').includes('lisi-inst'));
    if (!bg) return { ok: false, why: '找不到 lisi-inst 的 audio 元素',
                      srcs: as.map(x => (x.getAttribute('src') || '').split('/').pop()) };
    const pre = as.find(x => x !== bg && (x.getAttribute('src') || '').includes('lisi-vocal'));
    return { ok: true, src: bg.getAttribute('src') || '', loop: bg.loop, vol: bg.volume,
             paused: bg.paused, readyState: bg.readyState, preloading: !!pre };
  })()`;
  // 「在播」不等于「有个 src 含 lisi-inst 的 <audio>」——那只是元素挂上了。
  // 得真的在放(paused === false)而且浏览器已经把音频解出来了
  // (readyState >= 2 = HAVE_CURRENT_DATA),否则可能只是把 src 写上去、
  // 还没拉到数据,断言照样通过(恒真)。
  // 等条件成立而不是赌固定时长:解码快慢跟机器负载、磁盘冷热都有关系。
  let el = { ok: false, why: '还没等到 lisi-inst 的 audio 元素', srcs: [] };
  for (let i = 0; i < 40; i += 1) {
    el = await evaluate(probeEl);
    if (el.ok && el.paused === false && el.readyState >= 2) break;
    await sleep(200);
  }
  add('主播放器在播当前剧本纯音乐版', el.ok && el.paused === false,
    el.ok ? `paused=${el.paused}` : `${el.why}: ${(el.srcs || []).join(', ')}`);
  add('主播放器已解码(readyState >= 2)', el.ok && el.readyState >= 2,
    el.ok ? `readyState=${el.readyState}` : (el.why || '没有 lisi-inst 元素'));
  add('双轨轮播(不开单曲循环)', el.ok && el.loop === false, `loop=${el.loop}`);
  add('vocal 已在后台预载', el.ok && el.preloading === true);
  // 音量是设置项驱动的(设置页滑杆,默认 0.06,见 game/settings.ts)。
  // 滑杆是连续值,断言「落在 (0,1] 的有效区间」,不是某个离散档位。
  add('BGM 音量取自设置(有效区间)',
    el.ok && el.vol > 0 && el.vol <= 1,
    `音量 ${el.vol}`);

  // 回选择页 → 主播放器切回 idle 单曲循环。
  // idle 多半已命中缓存,不一定有网络请求,所以验元素状态而不是请求数。
  netReset();
  await evaluate('window.__QS__.goSelect()');
  await sleep(800);
  const back = await evaluate(`(() => {
    const as = [...document.querySelectorAll('audio')];
    const bg = as.find(x => (x.getAttribute('src') || '').includes('idle'));
    if (!bg) return { ok: false, srcs: as.map(x => (x.getAttribute('src') || '').split('/').pop()) };
    return { ok: true, loop: bg.loop };
  })()`);
  add('回选择页切回 idle 循环', back.ok && back.loop === true,
    back.ok ? `loop=${back.loop}` : (back.srcs || []).join(', '));

  // 页面不可见必须静音(切标签/关预览面板,标签还活着音乐却在响的回归)。
  // CDP 没有直接改 visibilityState 的口子,用「新标签挤到前台」的真实路径:
  // 本页变 hidden → BGM 应暂停;激活回本页 → 应自动续播。
  const bgEl = `(() => {
    const bg = [...document.querySelectorAll('audio')].find(x => (x.getAttribute('src') || '').includes('idle'));
    return { vis: document.visibilityState, paused: bg ? bg.paused : null };
  })()`;
  const t2 = await cdp.send('Target.createTarget', { url: 'about:blank' });
  await cdp.send('Target.activateTarget', { targetId: t2.targetId });
  await sleep(400);
  const hid = await evaluate(bgEl);
  add('页面进后台 → BGM 暂停', hid.vis === 'hidden' && hid.paused === true,
    `visibilityState=${hid.vis}, paused=${hid.paused}`);
  const { targetInfos } = await cdp.send('Target.getTargets');
  const mine = targetInfos.find((t) => (t.url || '').startsWith(url));
  if (mine) await cdp.send('Target.activateTarget', { targetId: mine.targetId });
  await cdp.send('Target.closeTarget', { targetId: t2.targetId }).catch(() => {});
  await sleep(400);
  const shown = await evaluate(bgEl);
  add('回前台 → BGM 自动续播', shown.vis === 'visible' && shown.paused === false,
    `visibilityState=${shown.vis}, paused=${shown.paused}`);

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
