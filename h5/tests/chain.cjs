/**
 * P2 主链路:序章 → 关键事件 → 选项 → 属性增减 → 行动卡 → 章末 → 下一章。
 *
 * 这是「P2 是否成立」的总闸:对应计划里「先用 Chrome 手动跑一遍第一章」的要求。
 * 驱动方式是页内循环读 game.phase 并点对应按钮,全程记录相位轨迹。
 */
'use strict';

const { withPage, report } = require('./lib/harness.cjs');

const DRIVER = `(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const q = s => document.querySelector(s);
  const qa = s => [...document.querySelectorAll(s)];
  const g = window.__QS__.game;
  const trace = [];
  const push = o => trace.push(o);

  for (let i = 0; i < 600; i++) {
    await sleep(3);
    const ov = q('.overlay');
    if (ov && !ov.hidden) {
      push({ at: i, evt: 'settle', title: (q('.overlay__title')||{}).textContent || '',
             changes: qa('.chglist__v').map(n => n.textContent.trim()), phase: g.phase, dev: g.dev });
      const b = q('.overlay .btn--primary');
      if (!b) { push({ evt: 'STUCK: settle 无继续按钮' }); break; }
      b.click(); continue;
    }
    const ph = g.phase;
    if (ph === 'intro') {
      const ch = g.chapter();
      push({ at: i, evt: 'intro', idx: g.chapterIdx, title: ch.title,
             paras: qa('.stage__main .prose').length, notes: qa('.intro-note').length,
             gloss: qa('.gloss').length });
      if (g.chapterIdx >= 1) { push({ evt: 'PASS' }); break; }
      // 顺手验一次 ⟦词条⟧ 点击链路
      const first = q('.gloss');
      if (first && !window.__glossClicked) {
        window.__glossClicked = true; first.click(); await sleep(2);
        push({ evt: 'gloss', open: !q('.overlay').hidden,
               body: (q('.overlay__body')||{}).textContent || '' });
        if (!q('.overlay').hidden) q('.overlay .btn--primary').click();
        await sleep(2);
      }
      const b = q('.stage__foot .btn--primary'); if (b) b.click(); continue;
    }
    if (ph === 'round') {
      const cards = qa('.stage__foot .card').filter(c => c.getAttribute('role') === 'button');
      const acts  = qa('.stage__foot .card--action').filter(c => c.getAttribute('role') === 'button');
      const key = g.getOffer().find(e => e.type === 'key') || {};
      push({ at: i, evt: 'round', idx: g.chapterIdx, offer: g.getOffer().length,
             key: key.title || null, keyLeft: key.roundsLeft, playable: cards.length,
             settleRecalled: !!q('.settle-recall') });
      const pick = acts[0] || cards[0];
      if (!pick) { push({ evt: 'STUCK: round 无可点牌' }); break; }
      pick.click(); continue;
    }
    if (ph === 'event') {
      const opts = g.getOptions();
      const open = qa('.stage__foot .card--tappable');
      // 优先挑偏离最大的选项,以便验证偏离归因(devLog)也能在 UI 上出来
      let pick = -1, bestDev = 0;
      for (let j = 0; j < opts.length; j++) {
        const o = opts[j]; if (!o || o.locked) continue;
        const dv = (o.opt.eff && o.opt.eff.dev) || 0;
        if (dv > bestDev) { bestDev = dv; pick = j; }
      }
      const first = opts.findIndex(o => !o.locked);
      if (first < 0) { push({ evt: 'STUCK: event 无可选项' }); break; }
      if (pick < 0) pick = first;
      push({ at: i, evt: 'event', id: g.eventId, title: (g.findEvent(g.eventId)||{}).title,
             opts: opts.length, locked: opts.filter(o => o.locked).length,
             risky: opts.filter(o => o.risky).length, segs: qa('.stage__main .prose').length,
             canClick: open.length, picked: pick, pickedDev: bestDev });
      open[pick].click(); continue;
    }
    if (ph === 'choice') {
      const c = g.getChoiceCard();
      push({ at: i, evt: 'choice', title: c && c.title, opts: c ? c.options.length : 0 });
      const b = qa('.stage__foot .card--tappable')[0]; if (b) b.click(); else break;
      continue;
    }
    if (ph === 'summary') {
      push({ at: i, evt: 'summary', idx: g.chapterIdx, dev: g.dev,
             devRows: qa('.devrow').length, attrRows: qa('.stage__main .kv').length,
             hasNext: qa('.stage__foot .btn--primary').length > 0 });
      const b = q('.stage__foot .btn--primary'); if (b) b.click();
      continue;
    }
    if (ph === 'endEvent') {
      push({ at: i, evt: 'endEvent' });
      const b = qa('.stage__foot .card--tappable')[0]; if (b) b.click(); continue;
    }
    if (ph === 'correction') {
      push({ at: i, evt: 'correction' });
      const b = q('.overlay .btn--primary'); if (b) b.click(); else g.correctionContinue(); continue;
    }
    push({ at: i, evt: 'OTHER', phase: ph }); break;
  }
  return { trace, top: (q('.stage__chap')||{}).textContent,
           band: (q('.stage__band')||{}).textContent,
           side: qa('.stage__side .kv').map(n => n.textContent.replace(/\\s+/g,' ').trim()) };
})()`;

withPage(async ({ evaluate, consoleErrors }) => {
  const out = await evaluate(DRIVER);

  console.log('=== 顶栏 ===');
  console.log('  ' + out.top + ' | ' + out.band);
  console.log('=== 右栏属性 ===');
  console.log('  ' + out.side.join('  '));
  console.log('=== 相位轨迹 ===');
  out.trace.forEach((t) => console.log('  ' + JSON.stringify(t)));

  const kinds = new Set(out.trace.map((t) => t.evt));
  const need = ['intro', 'gloss', 'round', 'settle', 'event', 'summary'];
  const settles = out.trace.filter((t) => t.evt === 'settle');
  const errs = consoleErrors();
  const stuck = out.trace.filter((t) => String(t.evt).startsWith('STUCK'));
  const summaries = out.trace.filter((t) => t.evt === 'summary');

  const ok = report('P2 主链路', [
    ['覆盖 intro/词条/回合/结算/事件/章末', need.every((k) => kinds.has(k))],
    ['属性增减出现', settles.some((t) => t.changes && t.changes.length > 0)],
    ['章末结算页出现', summaries.length > 0],
    ['章末列出本章境遇差值', summaries.some((t) => t.attrRows > 0)],
    ['偏离归因行出现', summaries.some((t) => t.devRows > 0)],
    ['章末提供进入下一章', summaries.some((t) => t.hasNext)],
    ['进入第二章', kinds.has('PASS')],
    ['无卡死', stuck.length === 0],
    ['控制台无错误', errs.length === 0],
  ]);
  if (!ok) {
    console.log('\n失败明细:');
    if (stuck.length) console.log('  卡死 ' + JSON.stringify(stuck));
    if (errs.length) errs.forEach((e) => console.log('  错误 ' + e));
  }
  return ok;
})
  .then((ok) => process.exit(ok ? 0 : 1))
  .catch((e) => {
    console.error('[失败]', e.message);
    process.exit(1);
  });