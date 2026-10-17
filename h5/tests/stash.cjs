'use strict';
/**
 * 暂存链路(2026-10-15 拍板,同日二次调整):
 *   对局中直接关页/刷新(pagehide)→ 自动暂存;每个剧本只保留最近 1 条。
 *   点「返回」正常退出由玩家确认后写自动档,不动暂存。
 *
 * 验收点:
 *   1. 暂存真的能写进 localStorage(qingshi.stash.v1)
 *   2. 连写 3 份后只剩最新 1 份
 *   3. pagehide(关页)会刷新这份暂存(与「返回」同口径:本章经营未满 5 轮不暂存)
 *   4. 退出对局(goMenu,不经过「返回」确认框)不动暂存、不写自动档
 *   5. 刷新后暂存还在,存档页能看到「暂存」区
 *   6. 从存档页读暂存,回到暂存那一刻的相位(v2.2.0 轮次存档)
 */
const { withPage, report, STEP_SNIPPET } = require('./lib/harness.cjs');

/** 打满 5 轮经营(2026-10-17 起未满 5 轮不暂存)制造进度,然后连写 3 份暂存验「只留最近一条」,再分别验 pagehide 与退出路径 */
const STASH_FLOW = `(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const q = s => document.querySelector(s), qa = s => [...document.querySelectorAll(s)];
  const g = window.__QS__.game;
${STEP_SNIPPET}

  for (let i = 0; i < 160 && g.phase !== 'round'; i++) { await sleep(6); advanceOnce(); }
  let played = 0;
  for (let n = 0; n < 800 && played < 5; n++) {
    if (ovOpen()) { q('.overlay .btn--primary')?.click(); await sleep(5); continue; }
    if (g.phase === 'round') {
      const c = qa('.stage__foot .card--action').filter(x => x.getAttribute('role') === 'button')[0];
      // 结算动画序列(2026-10-17 拍板)自动推进但真实耗时,点完要等发牌落定
      if (c) { c.click(); played += 1; await waitDeal(); }
      else { advanceOnce(); await sleep(8); }
    } else if (g.phase === 'event' || g.phase === 'choice') {
      const c = qa('.stage__main .card--tappable, .stage__foot .card--tappable')[0];
      // 随机事件落定后无「继 续」(2026-10-17 拍板),自动推进要等相位离开 settle
      if (c) { c.click(); await sleep(10); await waitSettle(); } else { advanceOnce(); await sleep(8); }
    } else { advanceOnce(); await sleep(8); }
  }
  const ch = g.chapterIdx;
  const phaseAtStash = g.phase;   // 暂存相位(v2.2.0):读暂存应回到同一相位
  const lisiAts = () => (JSON.parse(localStorage.getItem('qingshi.stash.v1') || '{}').lisi || []).map(s => s.at);

  // 连写 3 份,间隔 2ms 保证 at 可分辨;只应留下最新一份
  const first = window.__QS__.stashGame();
  for (let i = 0; i < 2; i++) { await sleep(2); window.__QS__.stashGame(); }
  const ats3 = lisiAts();
  const lenAfter3 = ats3.length;
  const prevNewestAt = ats3.length ? ats3[ats3.length - 1] : 0;

  // 关页/刷新路径:pagehide 应刷新这份暂存(仍 1 条,at 前移)
  await sleep(2);
  window.dispatchEvent(new Event('pagehide'));
  await sleep(20);
  const atsHide = lisiAts();
  const hideLen = atsHide.length;
  const hideNewestAt = atsHide.length ? atsHide[atsHide.length - 1] : 0;

  // 退出对局(不经过「返回」确认框的汇聚路径):不动暂存,也不写自动档
  window.__QS__.goMenu();
  await sleep(220);
  const atsExit = lisiAts();
  const autos = JSON.parse(localStorage.getItem('qingshi.autos.v1') || '{}');
  const autoLen = Object.values(autos).reduce((n, l) => n + (Array.isArray(l) ? l.length : 0), 0);
  return {
    played, ch, phaseAtStash, firstOk: !!first,
    lenAfter3,
    hideLen, hideNewestAt, prevNewestAt,
    exitLen: atsExit.length,
    exitNewestAt: atsExit.length ? atsExit[atsExit.length - 1] : 0,
    exitNewestCh: (JSON.parse(localStorage.getItem('qingshi.stash.v1') || '{}').lisi || []).slice(-1)[0]?.chapterIdx ?? -1,
    autoLen,
  };
})()`;

/** 刷新后:暂存应仍在;存档页有暂存区;读暂存回到暂存那一刻的相位 */
const LOAD_FLOW = `(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const q = s => document.querySelector(s), qa = s => [...document.querySelectorAll(s)];
  const store = JSON.parse(localStorage.getItem('qingshi.stash.v1') || '{}');
  const persisted = (store.lisi || []).length;

  // 刷新后 __QS__ 不存在(还没入局),先走正常动线进一局,再开存档页
  const start = document.querySelector('.menu__item--start');
  if (start) { start.click(); await sleep(150); }
  document.querySelector('.selenter')?.click();
  await sleep(600);
  window.__QS__.goSaves();
  await sleep(250);
  const stashShown = !!q('.saves__stash');
  const stashRows = qa('.saves__stash .slot--stash').length;
  const stashTitle = (q('.saves__stash .saves__stashtitle') || {}).textContent || '';

  // 读最新一份暂存(列表新→旧,第一行)
  const loadBtn = q('.saves__stash .slot--stash .btn--primary');
  const stashCh = (q('.saves__stash .slot--stash .slot__ch') || {}).textContent || '';
  if (loadBtn) { loadBtn.click(); await sleep(900); }
  const g = window.__QS__ && window.__QS__.game;
  // v2.3.0:读暂存也应把题签历史摆回卷轴
  const heads = [...document.querySelectorAll('.stage__main .sec .sec__head')].map(h => h.textContent || '');
  const histRounds = heads.filter(t => t.includes('经营 · 第')).length;
  return {
    persisted, stashShown, stashRows, stashTitle, stashCh, histRounds,
    loaded: !!g,
    phase: g ? g.phase : '',
    ch: g ? g.chapterIdx : -1,
  };
})()`;

withPage(async ({ evaluate, load, consoleErrors }) => {
  const stash = await evaluate(STASH_FLOW);

  // 真的刷新一次:暂存的持久性只有跨页面生命周期才有意义
  await load(1600, 900, 1);
  const res = await evaluate(LOAD_FLOW);
  const errs = consoleErrors();

  const ok = report('暂存链路', [
    ['对局中打满了 5 轮经营(2026-10-17 门槛)', stash.played >= 5, `实际 ${stash.played}`],
    ['暂存写入成功', stash.firstOk === true],
    ['连写后只留最近 1 条', stash.lenAfter3 === 1, `实际 ${stash.lenAfter3}`],
    ['关页(pagehide)会刷新暂存', stash.hideLen === 1 && stash.hideNewestAt > stash.prevNewestAt,
      `hide=${stash.hideLen}/${stash.hideNewestAt} prev=${stash.prevNewestAt}`],
    ['退出对局不动暂存、不写自动档',
      stash.exitLen === 1 && stash.exitNewestAt === stash.hideNewestAt && stash.autoLen === 0,
      `exit=${stash.exitLen}/${stash.exitNewestAt} autos=${stash.autoLen}`],
    ['最新暂存记的是当前章', stash.exitNewestCh === stash.ch],
    ['刷新后暂存仍在', res.persisted === 1, `实际 ${res.persisted}`],
    ['存档页出现暂存区', res.stashShown === true],
    ['暂存区列出 1 条', res.stashRows === 1, `实际 ${res.stashRows}`],
    ['暂存区有题签', res.stashTitle.replace(/\s/g, '') === '暂存'],
    ['读暂存成功入局', res.loaded === true],
    ['读暂存回到暂存那一刻的相位(v2.2.0)', res.phase === stash.phaseAtStash,
      `存时 ${stash.phaseAtStash} 读后 ${res.phase}`],
    ['读暂存回到存时的章节', res.ch === stash.ch],
    ['读暂存后卷轴恢复经营轮次题签(v2.3.0)', res.histRounds >= 1, `恢复出 ${res.histRounds} 条`],
    ['控制台无错误', errs.length === 0],
  ]);
  if (!ok) {
    console.log('\n诊断:');
    console.log('  暂存 ', JSON.stringify(stash));
    console.log('  读档 ', JSON.stringify(res));
  }
  return ok;
})
  .then((ok) => process.exit(ok ? 0 : 1))
  .catch((e) => { console.error('[失败]', e.message); process.exit(1); });
