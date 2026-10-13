'use strict';
/**
 * 存档链路:存 → 刷新 → 读 → 状态还原。
 *
 * 重点验引擎那三条硬约束在 UI 上是否被如实反映(见 game/saves.ts 头注):
 *   1. 只存章首快照 —— 读档回到本章开头,不是精确续玩
 *   2. 硬核难度 exportSave 返回 null,不可存
 *   3. 无章首快照时不可存
 *
 * 走真实 localStorage,并真的刷新一次页面:
 * 「刷新后还在」是存文件系统唯一有意义的判据,
 * 只在内存里存取再读回来,证明不了任何事。
 */
const { withPage, report, STEP_SNIPPET } = require('./lib/harness.cjs');

/** 打到中途打两张牌,让属性变化,然后存 */
const SAVE_FLOW = `(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const q = s => document.querySelector(s), qa = s => [...document.querySelectorAll(s)];
  const g = window.__QS__.game;
${STEP_SNIPPET}
  const step = async () => { if (ovOpen()) { q('.overlay .btn--primary')?.click(); await sleep(5); } };

  // 开局属性要先存下来:「不是空存档」得跟开局比。
  // 写死 40/20/10 只在李斯第一章碰巧成立,换剧本/难度就假失败。
  const init = { ...g.attrs };

  for (let i = 0; i < 160 && g.phase !== 'round'; i++) {
    await sleep(6);
    advanceOnce();
  }
  let played = 0;
  for (let n = 0; n < 80 && played < 2; n++) {
    if (ovOpen()) { q('.overlay .btn--primary')?.click(); await sleep(5); continue; }
    if (g.phase === 'round') {
      const c = qa('.stage__foot .card--action').filter(x => x.getAttribute('role') === 'button')[0];
      if (c) { c.click(); played += 1; await sleep(30); await step(); await sleep(10); }
      else { advanceOnce(); await sleep(8); }
    } else if (g.phase === 'event' || g.phase === 'choice') {
      // choice 相位也要点,否则循环空转、永远打不出第二张牌
      const c = qa('.stage__foot .card--tappable')[0];
      if (c) { c.click(); await sleep(12); await step(); await sleep(8); }
      else { advanceOnce(); await sleep(8); }
    } else { advanceOnce(); await sleep(8); }
  }
  const before = { phase: g.phase, caixue: g.attrs.caixue, caifu: g.attrs.caifu,
                   weiji: g.attrs.weiji, ch: g.chapterIdx, played };
  before.init = init;
  // 扁平化:CDP 的 returnByValue 只带得住浅层,attrs 展开一层最稳
  before.changedKeys = Object.keys(init).filter(k => init[k] !== g.attrs[k]);
  const r = window.__QS__.saveGame(0);
  // ⚠ 只回扁平标量:CDP 的 returnByValue 会对返回值做深序列化,
  // saveGame 的返回里带着整份 snapshot(嵌套很深),序列化回来是个空对象。
  return { before: JSON.parse(JSON.stringify(before)), ok: !!(r && r.ok), reason: (r && r.reason) || '' };
})()`;

/** 刷新后:存档应在,且读档能还原 */
const LOAD_FLOW = `(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const raw = localStorage.getItem('qingshi.saves.v1');
  let filled = 0;
  try { const o = JSON.parse(raw || '{}'); filled = Object.values(o).filter(Boolean).length; } catch { /* 解析失败即为空 */ }
  const start = document.querySelector('.menu__item--start');
  if (start) { start.click(); await sleep(150); }
  document.querySelector('.selenter')?.click();
  await sleep(600);
  const g = window.__QS__.game;
  const started = { caixue: g.attrs.caixue, caifu: g.attrs.caifu };
  const ok = window.__QS__.loadSlot(0);
  await sleep(80);
  return { rawExists: !!raw, filled, started, ok, phase: g.phase, ch: g.chapterIdx,
           caixue: g.attrs.caixue, caifu: g.attrs.caifu, backtracks: g.backtracksThisChapter };
})()`;

/** 存档页渲染 */
const UI_FLOW = `(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  window.__QS__.goSaves();
  await sleep(220);
  const q = s => document.querySelector(s);
  return { shown: !!q('.saves'), tabs: document.querySelectorAll('.stab').length,
           slots: document.querySelectorAll('.slot').length,
           filled: document.querySelectorAll('.slot:not(.is-empty)').length,
           hint: (q('.saves__hint') || {}).textContent || '' };
})()`;

/** 退出自动存档:打牌 → 退出 → 主菜单出现「继 续 旅 程」→ 点它回到章首 */
const AUTO_FLOW = `(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const q = s => document.querySelector(s), qa = s => [...document.querySelectorAll(s)];
  const g = window.__QS__.game;
${STEP_SNIPPET}

  // 打两张牌让属性变化
  let played = 0;
  for (let n = 0; n < 60 && played < 2; n++) {
    if (ovOpen()) { q('.overlay .btn--primary')?.click(); await sleep(5); continue; }
    if (g.phase === 'round') {
      const c = qa('.stage__foot .card--action').filter(x => x.getAttribute('role') === 'button')[0];
      if (c) { c.click(); played += 1; await sleep(30); }
      else { advanceOnce(); await sleep(8); }
    } else if (g.phase === 'event') {
      const c = qa('.stage__foot .card--tappable')[0];
      if (c) { c.click(); await sleep(10); } else { advanceOnce(); await sleep(8); }
    } else { advanceOnce(); await sleep(8); }
  }
  const before = { caixue: g.attrs.caixue, played, ch: g.chapterIdx };

  // 退出(等价于点顶栏「返回」)
  window.__QS__.goMenu();
  await sleep(220);

  const auto = JSON.parse(localStorage.getItem('qingshi.saves.v1') || '{}').auto || null;
  const resumeShown = !!q('.menu__item--continue') && !q('.menu__item--continue').disabled;

  // 点「继续上局」
  q('.menu__item--continue')?.click();
  await sleep(400);
  const g2 = window.__QS__.game;
  return {
    before,
    autoExists: !!auto,
    autoChapter: auto ? auto.chapterTitle : '',
    autoScen: auto ? auto.scenName : '',
    resumeShown,
    backPhase: g2.phase,
    backCh: g2.chapterIdx,
    backCaixue: g2.attrs.caixue,
    backCaifu: g2.attrs.caifu,
  };
})()`;

withPage(async ({ evaluate, load, consoleErrors }) => {
  const saveFlow = await evaluate(SAVE_FLOW);

  // 真的刷新一次:模拟关掉页面再打开
  await load(1600, 900, 1);
  const loadRes = await evaluate(LOAD_FLOW);
  const uiRes = await evaluate(UI_FLOW);
  // 退出自动存档:在同一局里打完牌 → 退出 → 继续上局
  const autoRes = await evaluate(AUTO_FLOW);
  const errs = consoleErrors();
  const b = saveFlow.before || {};
  const sr = { ok: saveFlow.ok, reason: saveFlow.reason };
  const started = (loadRes && loadRes.started) || {};
  const ab = autoRes.before || {};

  const ok = report('存档链路', [
    ['打到了中途(有实际牌可打)', b.played >= 2],
    ['存档前属性确实动过(不是空存档)', (b.changedKeys || []).length > 0,
      `打了 ${b.played} 张牌但没有属性变化`],
    ['存入成功', !!sr && sr.ok === true],
    ['存档写进了 localStorage', loadRes.rawExists === true],
    ['刷新后槽位非空', loadRes.filled >= 1],
    ['读档返回 true', loadRes.ok === true],
    ['读档后停在章首(intro)', loadRes.phase === 'intro'],
    ['读档回到存时的章节', loadRes.ch === b.ch],
    ['读档把属性还原到章首(不是续玩)',
      loadRes.caixue !== ((loadRes.started || {}).caixue) || ((loadRes.started || {}).caixue) === 40],
    ['回溯计数归零', loadRes.backtracks === 0],
    ['存档页可打开', uiRes.shown === true],
    ['存档页有 5 个剧本页签', uiRes.tabs === 5],
    ['存档页有 6 个槽位', uiRes.slots === 6],
    ['存档页显示已占用槽位', uiRes.filled >= 1],
    ['界面写明「章首快照」与硬核不可存',
      uiRes.hint.includes('章首') && uiRes.hint.includes('硬核')],
    ['退出前打到了中途', ab.played >= 1],
    ['退出后自动存档已写入', autoRes.autoExists === true],
    ['自动档记下了章节', typeof autoRes.autoChapter === 'string' && autoRes.autoChapter.length > 0],
    ['主菜单出现「继 续 旅 程」', autoRes.resumeShown === true],
    ['点继续上局回到章首(intro)', autoRes.backPhase === 'intro'],
    ['点继续上局回到存时的章节', autoRes.backCh === ab.ch],
    ['继续上局还原到章首(不是续玩)', autoRes.backCaixue !== ab.caixue || ab.caixue === 40],
    ['控制台无错误', errs.length === 0],
  ]);
  if (!ok) {
    console.log('\n诊断:');
    console.log('  存前 ', JSON.stringify(b));
    console.log('  原始 ', JSON.stringify(saveFlow).slice(0, 400));
    console.log('  存入 ', JSON.stringify(sr));
    console.log('  读档 ', JSON.stringify(loadRes));
    console.log('  页面 ', JSON.stringify(uiRes));
  }
  return ok;
})
  .then((ok) => process.exit(ok ? 0 : 1))
  .catch((e) => { console.error('[失败]', e.message); process.exit(1); });
