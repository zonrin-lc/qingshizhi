/**
 * 设置页验收:三条音量滑杆渲染、拖动即生效、持久化、返回主菜单。
 *
 * 2026-10-15:开关+三档按钮换成横向滑杆(拖到 0 即静音,图标随档位变化)。
 * 这里验的是:滑杆改值 → localStorage 立即写入 → 正在播的 BGM 立刻随动;
 * 以及拖到 0 再拖回来,音乐能恢复(走 armUnlock 手势补播也无妨)。
 *
 * 2026-10-21 补:三条滑杆原来只验「控件数量」和「写进了 localStorage」,
 * 音效/朗读那两条是**零行为断言** —— 滑杆拖到 0 之后,音效还会不会响、
 * 朗读还会不会念,一条都没验。现在补上真实行为:
 *   - 音效:开着时点卡片真的会去取 /assets/*.webm(音效素材);
 *     拖到 0 之后再点卡片,网络里不再出现音效请求。
 *   - 朗读:开着时真的会有一句在播(有配音 <audio> 在放);
 *     拖到 0 之后那句停了,而且再进一局整章都不再拉配音。
 */
'use strict';

const { withPage, report, sleep, STEP_SNIPPET } = require('./lib/harness.cjs');

/** 素材判据(与 voice.cjs / audio.cjs 同口径):
 *  BGM = idle / <剧本>-(inst|vocal);音效 = 固定名单;其余音频就是配音。 */
const BGM_RE = /\/assets\/(?:idle|(?:lisi|jingke|hanxin|xiangyu|chensheng)-(?:inst|vocal))-[A-Za-z0-9_-]{8}\.(?:webm|m4a)$/;
const SFX_RE = /\/assets\/(?:click|card|enter|back|dialog|seal|coin|gain|down|dice-roll|dice-land|chapter|ending|fail)-[A-Za-z0-9_-]{8}\.(?:webm|m4a)$/;
const isSfxUrl = (u) => SFX_RE.test(u);
const isVoiceUrl = (u) => /\.(?:webm|m4a)$/.test(u) && !SFX_RE.test(u) && !BGM_RE.test(u);

/** 页内判据:某个 <audio> 是不是配音(BGM 双轨轮播 + 音效池都不算) */
const IS_VOICE_EL = `(a => {
  const s = a.getAttribute('src') || '';
  if (!/\\.(webm|m4a)$/.test(s)) return false;
  if (/${BGM_RE.source}/.test(s)) return false;
  if (/${SFX_RE.source}/.test(s)) return false;
  return true;
})`;

/** 页内判据:某个 <audio> 是不是音效池里的元素 */
const IS_SFX_EL = `(a => {
  const s = a.getAttribute('src') || '';
  return /${SFX_RE.source}/.test(s);
})`;

/** 菜单相位:开设置页、验三条滑杆、音乐滑杆 0 → 80、返回主菜单 */
const DRIVER = `(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const q = s => document.querySelector(s);
  const qa = s => [...document.querySelectorAll(s)];
  const out = {};

  // 主菜单 → 设置页(菜单项没有专用 class,按文字找)
  const item = qa('.menu__item').find(b => b.textContent.includes('设 置'));
  if (!item) return { ok: false, why: '主菜单没有「设 置 一 下」' };
  item.click();
  await sleep(300);

  out.titles = qa('.settings .srow .srow__title').map(t => t.textContent.trim());
  out.rows = qa('.settings .srow--vol').length;
  out.sliders = qa('.settings .vol__range').length;
  out.ver = (q('.settings__ver') || {}).textContent || '';
  out.deco = qa('.settings .settings__deco').length;

  const rowOf = name => qa('.settings .srow').find(r => r.textContent.includes(name));
  const slide = (name, v) => {
    const r = rowOf(name).querySelector('.vol__range');
    r.value = String(v);
    r.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const saved = () => JSON.parse(localStorage.getItem('qingshi.settings.v1') || '{}');
  const idleEl = () => qa('audio').find(a => (a.getAttribute('src') || '').includes('idle'));
  const iconCls = name => rowOf(name).querySelector('.vol__icon').className;

  out.beforePaused = idleEl() ? idleEl().paused : null;

  // 音乐拖到 0 = 静音:存 music=false,BGM 立刻停,图标变静音叉
  slide('背景音乐', 0);
  await sleep(200);
  out.zeroMusic = saved().music;
  out.zeroPaused = idleEl() ? idleEl().paused : null;
  out.zeroIcon = iconCls('背景音乐');

  // 拖到 80:存 music=true + gain 0.8,图标变两波
  slide('背景音乐', 80);
  await sleep(200);
  out.highMusic = saved().music;
  out.highGain = saved().musicGain;
  out.highIcon = iconCls('背景音乐');

  // 返回 → 主菜单(顶部左侧,与选择页同款)。注意壳层的 .pageback 此时隐藏但仍在 DOM,
  // 必须圈在 .settings 里选,否则会点到壳层那颗没挂回调的
  q('.settings .pageback').click();
  await sleep(300);
  out.backToMenu = !!q('.menu__item--start');
  out.ok = true;
  return out;
})()`;

/** 对局相位:等一句朗读真的在播,并记下那个 <audio> 元素(供后面比对) */
const VOICE_PROBE = `(() => {
  const vs = [...document.querySelectorAll('audio')].filter(${IS_VOICE_EL});
  const playing = vs.filter(a => !a.paused);
  if (playing.length) window.__QS_VOICE_EL__ = playing[0];
  return { n: vs.length, playing: playing.length,
           vol: playing.length ? playing[0].volume : null,
           srcs: vs.map(a => (a.getAttribute('src') || '').split('/').pop()) };
})()`;

/** 推进到回合相位(要有一手可点的牌,才能验「点卡片出音效」) */
const TO_ROUND = `(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const q = s => document.querySelector(s), qa = s => [...document.querySelectorAll(s)];
  const g = window.__QS__.game;
  ${STEP_SNIPPET}
  for (let i = 0; i < 400; i += 1) {
    if (g.phase === 'round' && qa('.stage__foot .card--action[role="button"]').length) break;
    advanceOnce();
    await sleep(15);
  }
  return { phase: g.phase, cards: qa('.stage__foot .card--action[role="button"]').length };
})()`;

/**
 * 装一个 play() 探针:记录每一次 HTMLMediaElement.play() 的目标。
 *
 * 音效池(Sfx)的 <audio> 元素**不挂进 DOM**(sfx.ts 的 take() 只 createElement
 * 不 append),所以从 DOM 里查不到它;而池又会复用元素,同一个音效第二次播
 * 不再发网络请求 —— 两条路都查不出「这次到底放没放音效」。
 * 探针直接钩住 play():放没放,一目了然。
 */
const INSTALL_PLAY_HOOK = `(() => {
  window.__QS_PLAY_LOG__ = [];
  if (!window.__QS_PLAY_HOOKED__) {
    window.__QS_PLAY_HOOKED__ = true;
    const orig = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      try {
        window.__QS_PLAY_LOG__.push({ src: this.getAttribute('src') || this.src || '', t: Date.now() });
      } catch (e) { /* 探针不许影响播放 */ }
      return orig.apply(this, arguments);
    };
  }
  return true;
})()`;

/** 点一张行动牌(音效就该响) */
const CLICK_CARD = `(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const c = document.querySelector('.stage__foot .card--action[role="button"]');
  if (!c) return { clicked: false };
  c.click();
  await sleep(120);
  return { clicked: true, title: (c.querySelector('.card__title') || {}).textContent || '' };
})()`;

/** 设置页相位:朗读/音效拖到 0,并如实记录「那一句配音」的状态 */
const SLIDE_DRIVER = `(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const q = s => document.querySelector(s), qa = s => [...document.querySelectorAll(s)];
  const item = qa('.menu__item').find(b => (b.textContent || '').includes('设 置'));
  if (!item) return { ok: false, why: '主菜单没有「设 置 一 下」' };
  item.click();
  await sleep(400);
  const rowOf = name => qa('.settings .srow').find(r => r.textContent.includes(name));
  const slide = (name, v) => {
    const r = rowOf(name).querySelector('.vol__range');
    r.value = String(v);
    r.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const saved = () => JSON.parse(localStorage.getItem('qingshi.settings.v1') || '{}');
  const vel = window.__QS_VOICE_EL__ || null;
  const before = vel ? { paused: vel.paused, volume: vel.volume } : null;

  // 朗读拖到 0
  slide('剧情朗读', 0);
  await sleep(300);
  const after = vel ? { paused: vel.paused, volume: vel.volume } : null;
  const voiceSaved = saved().voice;

  // 音效拖到 0
  slide('游戏音效', 0);
  await sleep(300);
  const sfxSaved = saved().sfx;
  const sfxIcon = rowOf('游戏音效').querySelector('.vol__icon').className;

  // 返回主菜单再进一次:滑杆位置要从存档读回
  q('.settings .pageback').click();
  await sleep(300);
  item2Click();
  await sleep(300);
  function item2Click() {
    const b = qa('.menu__item').find(x => (x.textContent || '').includes('设 置'));
    if (b) b.click();
  }
  const pos = name => {
    const r = rowOf(name);
    return r ? r.querySelector('.vol__range').value : null;
  };
  return { ok: true, before, after, voiceSaved, sfxSaved, sfxIcon,
           musicPos: pos('背景音乐'), voicePos: pos('剧情朗读'), sfxPos: pos('游戏音效'),
           musicGain: saved().musicGain, voiceGain: saved().voiceGain, sfxGain: saved().sfxGain };
})()`;

withPage(
  async ({ evaluate, consoleErrors, cdp, sessionId, netLog, netReset, enterGame }) => {
    // 可信点击拿到用户激活,让 idle 真的播起来 —— 否则「拖到 0 停声」断言
    // 会在一个本来就没出声的元素上空转(autoplay 策略下它永远是 paused)。
    const trusted = async () => {
      for (const type of ['mousePressed', 'mouseReleased']) {
        await cdp.send('Input.dispatchMouseEvent', { type, x: 640, y: 360, button: 'left', clickCount: 1 }, sessionId);
      }
    };
    await trusted();
    await sleep(1200);
    await evaluate(INSTALL_PLAY_HOOK);

    // ---------- 一、菜单相位:滑杆渲染 + 音乐滑杆 ----------
    const out = await evaluate(DRIVER);

    // 音乐拖大之后:if play() 因激活过期被拒,armUnlock 会在下一次手势补播,
    // 两种结局都合法 —— 补一次可信点击,最终必须在响。
    await trusted();
    await sleep(800);
    const resumed = await evaluate(`(() => {
      const a = [...document.querySelectorAll('audio')].find(x => (x.getAttribute('src') || '').includes('idle'));
      return a ? { found: true, paused: a.paused } : { found: false };
    })()`);

    // ---------- 二、对局相位:朗读在播 + 点卡片出音效 ----------
    await enterGame();
    let voice = { n: 0, playing: 0, vol: null, srcs: [] };
    for (let i = 0; i < 50 && voice.playing === 0; i += 1) {
      await sleep(200);
      voice = await evaluate(VOICE_PROBE);
    }
    const round = await evaluate(TO_ROUND);
    const mark2 = await evaluate('(window.__QS_PLAY_LOG__ || []).length');
    const card = await evaluate(CLICK_CARD);
    await sleep(400);
    const plays2 = await evaluate(`(window.__QS_PLAY_LOG__ || []).slice(${mark2})`);
    // 音效素材请求:音效池按名字缓存元素,同一个音效第二次播**不再发请求**,
    // 所以这里看的是「整场有没有真的去取过音效素材」,不是「这一次有没有请求」
    const sfxReqs = netLog().filter((r) => isSfxUrl(r.url));

    // ---------- 三、设置页:朗读/音效拖到 0 ----------
    await evaluate(`(() => { window.__QS__.goMenu(); return true; })()`);
    await sleep(500);
    const slid = await evaluate(SLIDE_DRIVER);

    // ---------- 四、再进一局:音效与朗读都该闭嘴 ----------
    await evaluate(`(() => {
      const b = [...document.querySelectorAll('.menu__item')].find(x => (x.textContent || '').includes('设 置'));
      if (b) b.click();
      return true;
    })()`);
    await sleep(300);
    await evaluate(`(() => { const b = document.querySelector('.settings .pageback'); if (b) b.click(); return true; })()`);
    await sleep(300);
    await enterGame();
    const round2 = await evaluate(TO_ROUND);
    netReset();
    const mark4 = await evaluate('(window.__QS_PLAY_LOG__ || []).length');
    const card2 = await evaluate(CLICK_CARD);
    await sleep(500);
    const plays4 = await evaluate(`(window.__QS_PLAY_LOG__ || []).slice(${mark4})`);
    const sfxReqs2 = netLog().filter((r) => isSfxUrl(r.url));
    const voiceReqs2 = netLog().filter((r) => isVoiceUrl(r.url));
    const voicePlaying = await evaluate(`(() => {
      const vs = [...document.querySelectorAll('audio')].filter(${IS_VOICE_EL});
      return { n: vs.length, playing: vs.filter(a => !a.paused).length };
    })()`);
    const sfxPlays2 = plays2.filter((p) => isSfxUrl(p.src));
    const sfxPlays4 = plays4.filter((p) => isSfxUrl(p.src));
    const voicePlays4 = plays4.filter((p) => isVoiceUrl(p.src));

    // 末尾的「云存档同步」行是 2026-10-16 TapTap 对接时加的页面约定(tapcloud.cjs 专测其行为)
    const wantTitles = ['背景音乐', '游戏音效', '剧情朗读', '云存档同步'];
    const ok = report('设置页', [
      ['三条音量行全部渲染', out.rows === 3 && out.sliders === 3],
      ['行标题与顺序符合约定', JSON.stringify(out.titles) === JSON.stringify(wantTitles)],
      ['装饰已移除(2026-10-19 拍板)', out.deco === 0],
      ['版本号来自注入而非手抄', /^版本 v\d+\.\d+\.\d+/.test(out.ver || ''), `版本行「${out.ver}」`],
      ['拖动前 BGM 确实在播', out.beforePaused === false],
      ['拖到 0:写入 music=false', out.zeroMusic === false],
      ['拖到 0:BGM 立刻停声', out.zeroPaused === true],
      ['拖到 0:图标变静音叉', String(out.zeroIcon).includes('vol--m0')],
      ['拖到 80:写入 music=true', out.highMusic === true],
      ['拖到 80:写入 gain 0.8', Math.abs((out.highGain ?? 0) - 0.8) < 0.001],
      ['拖到 80:图标变两波', String(out.highIcon).includes('vol--m3')],
      ['音乐拖大后恢复播放', resumed.found && resumed.paused === false],
      ['返回主菜单', out.backToMenu === true],
      // ↓ 下面三条是行为断言(原来一条都没有)
      ['朗读开着:真的有一句在播',
        voice.playing >= 1 && (voice.vol ?? 0) > 0,
        `配音元素 ${voice.n} 个,在播 ${voice.playing} 个,音量 ${voice.vol}`],
      ['音效开着:真的去取过音效素材', sfxReqs.length > 0,
        `音效请求 ${sfxReqs.length} 条`],
      ['音效开着:点卡片会真的放音效', card.clicked === true && sfxPlays2.length >= 1,
        `播放调用 ${sfxPlays2.length} 次:${JSON.stringify(sfxPlays2.map((p) => p.src.split('/').pop()))}`],
      ['朗读拖到 0:写入 voice=false', slid.voiceSaved === false],
      ['朗读拖到 0:那一句配音停了',
        !!slid.after && (slid.after.paused === true || slid.after.volume === 0),
        `拖之前 ${JSON.stringify(slid.before)} 拖之后 ${JSON.stringify(slid.after)}`],
      ['音效拖到 0:写入 sfx=false', slid.sfxSaved === false],
      ['音效拖到 0:图标变静音叉', String(slid.sfxIcon).includes('vol--m0')],
      ['音效拖到 0:再点卡片不再放音效',
        card2.clicked === true && sfxPlays4.length === 0,
        `播放调用 ${sfxPlays4.length} 次:${JSON.stringify(sfxPlays4.map((p) => p.src.split('/').pop()))}`],
      ['朗读拖到 0:再进一局不再拉配音',
        voiceReqs2.length === 0 && voicePlaying.playing === 0 && voicePlays4.length === 0,
        `配音请求 ${voiceReqs2.length} 条,在播 ${voicePlaying.playing} 句,播放调用 ${voicePlays4.length} 次`],
      // 持久化(改完再进一次设置页,滑杆位置要读回来)
      ['滑杆位置从存档读回(音乐 80)', slid.musicPos === '80' && Math.abs((slid.musicGain ?? 0) - 0.8) < 0.001,
        `位置 ${slid.musicPos} gain ${slid.musicGain}`],
      ['滑杆位置从存档读回(朗读 0)', slid.voicePos === '0', `位置 ${slid.voicePos}`],
      ['滑杆位置从存档读回(音效 0)', slid.sfxPos === '0', `位置 ${slid.sfxPos}`],
      ['控制台无错误', consoleErrors().length === 0],
    ]);
    if (!ok) {
      console.log('明细: ' + JSON.stringify({ out, resumed, voice, round, card, slid, round2, card2,
        sfxReqs: sfxReqs.map((r) => r.url), sfxReqs2: sfxReqs2.map((r) => r.url),
        plays2, plays4, voiceReqs2: voiceReqs2.map((r) => r.url), voicePlaying }));
    }
    return ok;
  },
  { enter: false },
)
  .then((ok) => process.exit(ok ? 0 : 1))
  .catch((e) => {
    console.error('[失败]', e.message);
    process.exit(1);
  });
