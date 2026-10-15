/**
 * 回溯(backtrack)链路:顶栏按钮 → 确认浮层 → 回到章首。
 *
 * 重点验引擎侧的三条承诺(见 prot/engine.js 的 backtrack 与冻结的 Lua game.lua):
 *   1. 回到本章开头(phase=intro),牌堆与际遇配额归零
 *   2. 偏离度与已解锁成就**不重置**——否则玩家能靠回溯刷成就
 *   3. 配额按章计(normal=1 次/章);用尽后按钮压暗且点击无效
 * 另:每回溯一次 coef 衰减(引擎 0.98),这是回溯的实际代价。
 */
'use strict';

const { withPage, report } = require('./lib/harness.cjs');

const PROBE = `(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const q = s => document.querySelector(s), qa = s => [...document.querySelectorAll(s)];
  const g = window.__QS__.game;
  const log = [];
  const snap = tag => log.push({ tag,
    phase: g.phase, ch: g.chapterIdx, dev: g.dev,
    bt: g.backtracksThisChapter, coef: g.coef, ach: g.ach.length,
    attrs: { caifu: g.attrs.caifu, caixue: g.attrs.caixue, weiji: g.attrs.weiji },
    btnText: (q('.backbtn')||{}).textContent,
    btnLocked: q('.backbtn') ? q('.backbtn').classList.contains('is-locked') : null,
    btnAria: q('.backbtn') ? q('.backbtn').getAttribute('aria-disabled') : null,
    can: g.canBacktrack(),
  });
  const step = async () => { await sleep(6); const ov = q('.overlay');
    if (ov && !ov.hidden) { q('.overlay .btn--primary').click(); await sleep(6); } };

  snap('init');
  for (let i = 0; i < 40; i++) {
    if (window.__QS__.session.isRevealing) {
      q('.stage__main').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      await sleep(8);
      continue;
    }
    q('.stage__foot .btn--primary')?.click();
    await sleep(8);
    if (g.phase !== 'intro') break;
  }
  for (let i = 0; i < 40 && g.phase !== 'round'; i++) await step();
  snap('进回合');

  // 打到属性真的动起来。会撞上事件/结算/抉择,一路步进,
  // 直到与章首快照出现差异——否则「回溯把属性滚回去」根本无从验证。
  const startAttrs = { ...g.attrs };
  const WATCH = ['caifu','caixue','weiji','shengwang','quanshi','zhengji','junxin'];
  const attrsChanged = () => WATCH.some(k => g.attrs[k] !== startAttrs[k]);
  for (let n = 0; n < 200 && !attrsChanged(); n++) {
    if (window.__QS__.session.isRevealing) {
      q('.stage__main').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      await sleep(8);
      continue;
    }
    const ov = q('.overlay');
    if (ov && !ov.hidden) { q('.overlay .btn--primary').click(); await sleep(6); continue; }
    const ph = g.phase;
    if (ph === 'round') {
      const c = qa('.stage__foot .card--action').filter(x => x.getAttribute('role') === 'button')[0];
      if (c) { c.click(); await sleep(10); continue; }
    }
    if (ph === 'event' || ph === 'choice') {
      const e = qa('.stage__main .card--tappable, .stage__foot .card--tappable')[0];
      if (e) { e.click(); await sleep(10); continue; }
      const cont = q('.stage__main .btn--primary');
      if (cont) { cont.click(); await sleep(8); continue; }
    }
    if (ph === 'intro' || ph === 'summary') {
      const b = q('.stage__foot .btn--primary'); if (b) { b.click(); await sleep(8); continue; }
    }
  }
  // 判定放在循环外、且由循环条件每轮把关:
  // 若只写在循环体末尾,每条路径都是 continue,最后一次点击后循环
  // 因计数耗尽退出,这个值永远不会被求值(而且会一路打到下一章去)。
  const attrsMoved = attrsChanged();
  snap('打出变化后');

  // 强塞一个成就,用来验「回溯不重置成就」
  g.ach.push('__probe_ach__');
  const devBefore = g.dev;
  snap('解锁成就后');

  if (!q('.backbtn')) {
    return { log, confirmShown: false, confirmTitle: '', confirmBtns: [],
             devBefore, btNote: '', secondConfirm: false, attrsMoved, startAttrs,
             noBackbtn: true, phase: g.phase, ch: g.chapterIdx };
  }
  q('.backbtn').click(); await sleep(8);
  const confirmShown = !q('.overlay').hidden;
  const confirmTitle = (q('.overlay__title')||{}).textContent || '';
  const confirmBtns = qa('.overlay .btn').map(b => b.textContent.trim());
  snap('确认框');

  const okBtn = q('.overlay .btn--primary');
  if (!okBtn) {
    // 确认框没开 → 回溯没被受理。回报真实状态,别让测试崩在这
    return { log, confirmShown, confirmTitle, confirmBtns, devBefore, btNote: '', secondConfirm: false,
             attrsMoved, startAttrs, noConfirmBtn: true, can: g.canBacktrack(), phase: g.phase,
             btnText: (q('.backbtn')||{}).textContent, btnLocked: q('.backbtn')?.classList.contains('is-locked') };
  }
  okBtn.click(); await sleep(10);
  // 【回溯】提示在 revealSegs 的 items 末尾(Lua 那边也放最后),
  // 所以得先点正文把渐显跳完,再去读,否则读到的还是半截
  for (let i = 0; i < 30 && window.__QS__.session.isRevealing; i++) {
    q('.stage__main').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    await sleep(10);
  }
  snap('确认回溯后');
  const btNote = ((q('.stage__main')||{}).textContent || '').includes('【回溯】');

  q('.backbtn').click(); await sleep(8);
  const secondConfirm = !q('.overlay').hidden;
  snap('二次点击');

  return { log, confirmShown, confirmTitle, confirmBtns, devBefore, btNote, secondConfirm,
           attrsMoved, startAttrs };
})()`;

withPage(async ({ evaluate, consoleErrors }) => {
  const o = await evaluate(PROBE);

  console.log('=== 状态轨迹 ===');
  o.log.forEach((s) => console.log(
    `  ${s.tag.padEnd(12)} phase=${String(s.phase).padEnd(6)} bt=${s.bt} coef=${s.coef} ` +
    `dev=${s.dev} ach=${s.ach} attrs=${JSON.stringify(s.attrs)} ` +
    `btn="${s.btnText}" locked=${s.btnLocked} aria=${s.btnAria} can=${s.can}`));
  console.log('\n=== 确认浮层 ===');
  console.log('  标题: ' + o.confirmTitle);
  console.log('  按钮: ' + o.confirmBtns.join(' / '));

  const init = o.log[0];
  const inRound = o.log[1];
  const after = o.log[o.log.length - 2];
  const second = o.log[o.log.length - 1];
  const errs = consoleErrors();

  const ok = report('回溯链路', [
    ['章首显示剩余次数(normal=1)', init.btnText === '回溯 1' && init.can === true],
    ['进回合后仍可回溯', inRound.can === true && inRound.btnLocked === false],
    ['前置条件:属性确实被改动过', o.attrsMoved === true],
    ['回溯后属性回到章首快照',
      ['caifu', 'caixue', 'weiji'].every((k) => after.attrs[k] === init.attrs[k])],
    ['点击后弹出确认浮层', o.confirmShown === true],
    ['确认浮层有两个按钮', o.confirmBtns.length === 2],
    ['回溯后回到本章章首', after.phase === 'intro' && after.ch === init.ch],
    ['回溯计数 +1', after.bt === 1],
    ['成就未被重置', after.ach >= 1],
    ['偏离度未被重置', after.dev === o.devBefore],
    ['章首显【回溯】代价提示', o.btNote === true],
    ['配额用尽后按钮压暗', second.btnLocked === true && second.can === false],
    ['配额用尽后点击无效', o.secondConfirm === false],
    ['二次回溯计数仍为 1', second.bt === 1],
    ['回溯使 coef 衰减', second.coef < 1],
    ['控制台无错误', errs.length === 0],
  ]);
  return ok;
})
  .then((ok) => process.exit(ok ? 0 : 1))
  .catch((e) => {
    console.error('[失败]', e.message);
    process.exit(1);
  });