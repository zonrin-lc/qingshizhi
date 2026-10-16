'use strict';
/**
 * 存档链路:存 → 刷新 → 读 → 状态还原。
 *
 * 重点验引擎那三条硬约束在 UI 上是否被如实反映(见 game/saves.ts 头注):
 *   1. 存档精确到当前轮次(v2.2.0) —— 读档回到存档那一刻,不是回章首
 *   2. 硬核难度 exportSave 返回 null,不可存
 *   3. 未开局(无章首快照)时不可存
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
      // 偶遇/随机事件的选项内联在文本区,选择器要带上 .stage__main
      const c = qa('.stage__main .card--tappable, .stage__foot .card--tappable')[0];
      if (c) { c.click(); await sleep(12); await step(); await sleep(8); }
      else { advanceOnce(); await sleep(8); }
    } else { advanceOnce(); await sleep(8); }
  }
  const before = { phase: g.phase, caixue: g.attrs.caixue, caifu: g.attrs.caifu,
                   weiji: g.attrs.weiji, ch: g.chapterIdx, played,
                   roundNo: (window.__QS__.session || {}).roundNo ?? 0 };
  before.init = init;
  // 扁平化:CDP 的 returnByValue 只带得住浅层,attrs 展开一层最稳
  before.changedKeys = Object.keys(init).filter(k => init[k] !== g.attrs[k]);
  const r = window.__QS__.saveGame();
  // 写满 6 条验上限与覆盖:再写 5 条到满,第 7 条不带覆盖应被拒(full),带覆盖应挤掉最早
  const fills = [];
  for (let i = 0; i < 5; i++) { await sleep(2); fills.push(window.__QS__.saveGame().ok); }
  const denied = window.__QS__.saveGame();
  const replaced = window.__QS__.saveGame(true);
  const cnt = (JSON.parse(localStorage.getItem('qingshi.autos.v1') || '{}').lisi || []).length;
  // ⚠ 只回扁平标量:CDP 的 returnByValue 会对返回值做深序列化,
  // saveGame 的返回里带着整份 snapshot(嵌套很深),序列化回来是个空对象。
  return { before: JSON.parse(JSON.stringify(before)), ok: !!(r && r.ok), reason: (r && r.reason) || '',
           fillsOk: fills.every(Boolean), deniedOk: !!denied.ok, deniedFull: !!denied.full,
           replacedOk: !!replaced.ok, cnt };
})()`;

/** 刷新后:存档应在,且读档能还原 */
const LOAD_FLOW = `(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const raw = localStorage.getItem('qingshi.autos.v1');
  let filled = 0;
  try {
    const o = JSON.parse(raw || '{}');
    filled = Object.values(o).reduce((n, l) => n + (Array.isArray(l) ? l.length : 0), 0);
  } catch { /* 解析失败即为空 */ }
  const start = document.querySelector('.menu__item--start');
  if (start) { start.click(); await sleep(150); }
  document.querySelector('.selenter')?.click();
  await sleep(600);
  const g = window.__QS__.game;
  const started = { caixue: g.attrs.caixue, caifu: g.attrs.caifu };
  const ok = window.__QS__.loadAuto(0);
  await sleep(80);
  return { rawExists: !!raw, filled, started, ok, phase: g.phase, ch: g.chapterIdx,
           caixue: g.attrs.caixue, caifu: g.attrs.caifu, backtracks: g.backtracksThisChapter };
})()`;

/** 存档页渲染 + 选项卡过滤 + 删除二次确认 + 槽位轮次标识(v2.2.0) */
const UI_FLOW = `(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  window.__QS__.goSaves();
  await sleep(220);
  const q = s => document.querySelector(s), qa = s => [...document.querySelectorAll(s)];
  // 只数手动槽位区:暂存区的行也带 .slot 类(2026-10-15 起),不圈定会被算进槽位数
  const counts = () => ({ tabs: qa('.stab').length, slots: qa('.saves__list .slot').length,
                          filled: qa('.saves__list .slot:not(.is-empty)').length });
  const base = counts();
  const hint = (q('.saves__hint') || {}).textContent || '';
  const slotCh = (q('.saves__list .slot:not(.is-empty) .slot__ch') || {}).textContent || '';
  const storedOf = () => {
    const o = JSON.parse(localStorage.getItem('qingshi.autos.v1') || '{}');
    return Object.values(o).reduce((n, l) => n + (Array.isArray(l) ? l.length : 0), 0);
  };
  const storedBefore = storedOf();

  // 2026-10-15 起没有「全部」页签:进页默认落在当前剧本(lisi),占用档应直接可见。
  // 切到一个计数为 0 的剧本页签:占用档应被滤掉,并出现空提示
  const zero = qa('.stab').find(t => ((t.querySelector('.stab__cnt') || {}).textContent || '').startsWith('0'));
  zero?.click(); await sleep(60);
  const filtered = counts();
  const emptyHint = !!q('.saves__empty');
  // 切回有档的剧本页签
  const cur = qa('.stab').find(t => !((t.querySelector('.stab__cnt') || {}).textContent || '').startsWith('0'));
  cur?.click(); await sleep(60);
  const back = counts();

  // 删除二次确认:点删除 → 浮层 → 再想想 → 档还在;再点删除 → 确认 → 档消失
  const before = counts().filled;
  const delOf = () => q('.saves__list .slot:not(.is-empty) .slot__acts .btn--ghost');
  delOf()?.click(); await sleep(60);
  const confirmShown = !!q('.saves__confirm');
  q('.saves__confirm .btn--ghost')?.click(); await sleep(60);
  const afterCancel = counts().filled;
  delOf()?.click(); await sleep(60);
  q('.saves__confirm .btn--primary')?.click(); await sleep(80);
  const afterDel = counts().filled;
  const stored = storedOf();

  return { shown: !!q('.saves'), ...base, hint, slotCh, back, filtered, emptyHint,
           before, confirmShown, afterCancel, afterDel, storedBefore, stored };
})()`;

/** 退出存档:打牌 → 点顶栏「返回」弹确认框 → 存档退出 → 主菜单「继 续 旅 程」→ 回到存档那一刻;
 *  顺带验满员覆盖文案与「不存退出」路径 */
const AUTO_FLOW = `(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const q = s => document.querySelector(s), qa = s => [...document.querySelectorAll(s)];
  const g = window.__QS__.game;
${STEP_SNIPPET}
  const lisiCnt = () => (JSON.parse(localStorage.getItem('qingshi.autos.v1') || '{}').lisi || []).length;

  // 打两张牌让属性变化
  let played = 0;
  for (let n = 0; n < 60 && played < 2; n++) {
    if (ovOpen()) { q('.overlay .btn--primary')?.click(); await sleep(5); continue; }
    if (g.phase === 'round') {
      const c = qa('.stage__foot .card--action').filter(x => x.getAttribute('role') === 'button')[0];
      if (c) { c.click(); played += 1; await sleep(30); }
      else { advanceOnce(); await sleep(8); }
    } else if (g.phase === 'event') {
      const c = qa('.stage__main .card--tappable, .stage__foot .card--tappable')[0];
      if (c) { c.click(); await sleep(10); } else { advanceOnce(); await sleep(8); }
    } else { advanceOnce(); await sleep(8); }
  }
  // 落到回合相位再存:结算/事件途中的相位依赖点击时序,断言要稳(v2.2.0 读档回到存档相位)
  for (let n = 0; n < 60 && g.phase !== 'round'; n++) {
    if (ovOpen()) { q('.overlay .btn--primary')?.click(); await sleep(5); continue; }
    if (g.phase === 'event' || g.phase === 'choice') {
      const c = qa('.stage__main .card--tappable, .stage__foot .card--tappable')[0];
      if (c) { c.click(); await sleep(10); } else { advanceOnce(); await sleep(8); }
    } else { advanceOnce(); await sleep(8); }
  }
  const before = { caixue: g.attrs.caixue, caifu: g.attrs.caifu, played, ch: g.chapterIdx,
                   phase: g.phase, roundNo: (window.__QS__.session || {}).roundNo ?? 0 };

  // 顶到 6 条满员,验确认框的覆盖文案(UI_FLOW 删过一条,这里补回 6)
  while (lisiCnt() < 6) { window.__QS__.saveGame(); await sleep(2); }
  const cntBefore = lisiCnt();

  // 点顶栏「返回」:应弹「是否存档」确认框;满员时主按钮是「覆 盖 并 退 出」
  q('.pageback').click();
  await sleep(120);
  const confirmShown = !!q('.saves__confirm');
  const primaryText = (q('.saves__confirm .btn--primary') || {}).textContent || '';
  const fullHint = ((q('.saves__confirm') || {}).textContent || '').includes('覆盖最早');

  // 存档并退出 → 选择页;满员覆盖,总数仍 6
  q('.saves__confirm .btn--primary')?.click();
  await sleep(300);
  const atSelect = !!q('.seltop');
  const lisi = (JSON.parse(localStorage.getItem('qingshi.autos.v1') || '{}').lisi || []);
  const auto = lisi.length ? lisi[lisi.length - 1] : null; // 存储序旧→新,末尾最新
  const cntAfter = lisi.length;

  // 回主菜单,点「继 续 旅 程」→ 回到章首
  window.__QS__.goMenu();
  await sleep(250);
  const resumeShown = !!q('.menu__item--continue') && !q('.menu__item--continue').disabled;
  q('.menu__item--continue')?.click();
  await sleep(400);
  const g2 = window.__QS__.game;
  const back = { phase: g2.phase, ch: g2.chapterIdx, caixue: g2.attrs.caixue, caifu: g2.attrs.caifu };

  // 「不存退出」路径:再点返回 → 不存 → 选择页,档数不变
  q('.pageback').click();
  await sleep(120);
  const confirm2 = !!q('.saves__confirm');
  const cntPreNo = lisiCnt();
  qa('.saves__confirm .btn--ghost')[0]?.click(); // 不 存 退 出
  await sleep(250);
  const noSaveSelect = !!q('.seltop');
  const cntPostNo = lisiCnt();

  return {
    before, cntBefore, confirmShown, primaryText, fullHint, atSelect,
    autoExists: !!auto, autoChapter: auto ? auto.chapterTitle : '', autoScen: auto ? auto.scenName : '',
    autoRound: auto ? (auto.roundNo ?? -1) : -1,
    cntAfter, resumeShown,
    backPhase: back.phase, backCh: back.ch, backCaixue: back.caixue, backCaifu: back.caifu,
    confirm2, noSaveSelect, cntPreNo, cntPostNo,
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
    ['写满 6 条上限', saveFlow.fillsOk === true && saveFlow.cnt === 6, `实际 ${saveFlow.cnt}`],
    ['满 6 条后不确认则不写入', saveFlow.deniedOk === false && saveFlow.deniedFull === true],
    ['确认覆盖后仍封顶 6 条', saveFlow.replacedOk === true && saveFlow.cnt === 6],
    ['存档写进了 localStorage', loadRes.rawExists === true],
    ['刷新后槽位非空', loadRes.filled >= 1],
    ['读档返回 true', loadRes.ok === true],
    ['读档回到存档时的相位(v2.2.0 轮次续玩)', loadRes.phase === b.phase,
      `存时 ${b.phase} 读后 ${loadRes.phase}`],
    ['读档回到存时的章节', loadRes.ch === b.ch],
    ['读档还原到存档那一刻的属性(不是回章首)',
      loadRes.caixue === b.caixue && loadRes.caifu === b.caifu,
      `存时 ${b.caixue}/${b.caifu} 读后 ${loadRes.caixue}/${loadRes.caifu}`],
    ['回溯计数归零', loadRes.backtracks === 0],
    ['存档页可打开', uiRes.shown === true],
    ['存档页有 5 个页签(5 剧本,无「全部」)', uiRes.tabs === 5],
    ['存档页有 6 个槽位', uiRes.slots === 6],
    ['存档页显示已占用槽位', uiRes.filled >= 1],
    ['切回有档剧本后槽位齐全', uiRes.back && uiRes.back.slots === 6 && uiRes.back.filled >= 1],
    ['按剧本过滤:无档剧本不显示占用档', uiRes.filtered && uiRes.filtered.filled === 0],
    ['过滤为空时出现提示', uiRes.emptyHint === true],
    ['删除弹出二次确认', uiRes.confirmShown === true],
    ['取消删除后档案还在', uiRes.afterCancel === uiRes.before],
    ['确认删除后档案消失', uiRes.afterDel === uiRes.before - 1],
    ['删除已落到 localStorage', uiRes.stored === uiRes.storedBefore - 1],
    ['界面写明「精确到经营轮次」与硬核不可存',
      uiRes.hint.includes('经营轮次') && uiRes.hint.includes('硬核')],
    ['槽位题签带经营轮次(v2.2.0)',
      (b.roundNo ?? 0) > 0 ? uiRes.slotCh.includes(`经营至第 ${b.roundNo} 轮`) : true,
      `roundNo=${b.roundNo} 题签「${uiRes.slotCh}」`],
    ['退出前打到了中途', ab.played >= 1],
    ['返回时弹出存档确认框', autoRes.confirmShown === true],
    ['满员时确认框提示覆盖最早',
      autoRes.fullHint === true && (autoRes.primaryText || '').replace(/\s/g, '').includes('覆盖'),
      `主按钮「${autoRes.primaryText}」`],
    ['存档退出后落在选择页', autoRes.atSelect === true],
    ['存档退出后自动档写入(覆盖不膨胀)', autoRes.autoExists === true && autoRes.cntAfter === 6,
      `实际 ${autoRes.cntAfter}`],
    ['自动档记下了章节', typeof autoRes.autoChapter === 'string' && autoRes.autoChapter.length > 0],
    ['自动档记下了经营轮次', autoRes.autoRound === ab.roundNo,
      `档 ${autoRes.autoRound} 局 ${ab.roundNo}`],
    ['主菜单出现「继 续 旅 程」', autoRes.resumeShown === true],
    ['点继续上局回到存档时的相位(轮次续玩)', autoRes.backPhase === ab.phase,
      `存时 ${ab.phase} 续上 ${autoRes.backPhase}`],
    ['点继续上局回到存时的章节', autoRes.backCh === ab.ch],
    ['继续上局还原到存档那一刻的属性(不是回章首)',
      autoRes.backCaixue === ab.caixue && autoRes.backCaifu === ab.caifu,
      `存时 ${ab.caixue}/${ab.caifu} 续上 ${autoRes.backCaixue}/${autoRes.backCaifu}`],
    ['不存退出也弹确认框', autoRes.confirm2 === true],
    ['不存退出落在选择页且不写档',
      autoRes.noSaveSelect === true && autoRes.cntPostNo === autoRes.cntPreNo],
    ['控制台无错误', errs.length === 0],
  ]);
  if (!ok) {
    console.log('\n诊断:');
    console.log('  存前 ', JSON.stringify(b));
    console.log('  原始 ', JSON.stringify(saveFlow).slice(0, 400));
    console.log('  存入 ', JSON.stringify(sr));
    console.log('  读档 ', JSON.stringify(loadRes));
    console.log('  页面 ', JSON.stringify(uiRes));
    console.log('  退出 ', JSON.stringify(autoRes).slice(0, 600));
  }
  return ok;
})
  .then((ok) => process.exit(ok ? 0 : 1))
  .catch((e) => { console.error('[失败]', e.message); process.exit(1); });
