/**
 * 多视口布局体检。
 *
 * 为什么要单独一套:P1 验的是单栏壳,P2 加了两栏(定宽右栏 + 限高决策区 + 浮层),
 * 这套布局一旦遇到窄视口会直接塌——右栏 13rem 定宽在 667px 上就占 31%,
 * 竖屏 390px 更占到 53%,叙事区被挤到 166px;决策区还会顶穿整个棋盘。
 *
 * 判据分两种形态:
 * - 并排(side 占比 < 0.9):右栏占比不得超过 28%
 * - 降级(side 整宽横条,占比 > 0.9):叙事区须占到 90% 以上
 */
'use strict';

const { withPage, report } = require('./lib/harness.cjs');

const VIEWPORTS = [
  ['桌面 1280x720', 1280, 720, 1],
  ['平板横 1024x768', 1024, 768, 2],
  ['iPhone Pro Max 横 932x430', 932, 430, 3],
  ['iPhone 横 844x390', 844, 390, 3],
  ['iPhone SE 横 667x375', 667, 375, 2],
  ['小安卓横 640x360', 640, 360, 2],
  ['iPhone 竖 390x844', 390, 844, 3],
  ['小屏竖 360x640', 360, 640, 2],
];

/** 进到回合页(有多张卡)后量布局 */
const PROBE = `(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const q = s => document.querySelector(s), qa = s => [...document.querySelectorAll(s)];
  const g = window.__QS__.game;
  for (let i = 0; i < 80 && g.phase !== 'round'; i++) {
    await sleep(10);
    const ov = q('.overlay');
    if (ov && !ov.hidden) { q('.overlay .btn--primary').click(); await sleep(4); continue; }
    if (g.phase === 'intro') { q('.stage__foot .btn--primary').click(); await sleep(4); }
    else if (g.phase === 'event') { (qa('.stage__foot .card--tappable')[0]||{}).click?.(); await sleep(4); }
  }
  await sleep(60);
  const stage = q('.stage'), main = q('.stage__main'), foot = q('.stage__foot'), side = q('.stage__side');
  const cards = qa('.stage__foot .card');
  const r = n => n ? n.getBoundingClientRect() : null;
  const sr = r(stage), mr = r(main), fr = r(foot), dr = r(side);
  return {
    phase: g.phase,
    docOverflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    stageW: sr ? Math.round(sr.width) : 0,
    stageH: sr ? Math.round(sr.height) : 0,
    mainW: mr ? Math.round(mr.width) : 0,
    mainH: mr ? Math.round(mr.height) : 0,
    sideW: dr ? Math.round(dr.width) : 0,
    footH: fr ? Math.round(fr.height) : 0,
    cards: cards.length,
    zeroCards: cards.filter(c => c.getBoundingClientRect().height < 24).length,
  };
})()`;

withPage(async ({ evaluate, load, consoleErrors }) => {
  console.log('视口'.padEnd(26) + 'stage'.padEnd(12) + 'main'.padEnd(11) + 'side'.padEnd(8) + 'foot'.padEnd(8) + '卡片 横溢出 形态');
  console.log('-'.repeat(100));

  const rows = [];
  for (const [name, w, h, dsf] of VIEWPORTS) {
    await load(w, h, dsf);
    const o = await evaluate(PROBE);
    const stacked = o.sideW / o.stageW > 0.9;
    const mainShare = o.stageW ? +(o.mainW / o.stageW).toFixed(3) : 0;
    const sideShare = o.stageW ? +(o.sideW / o.stageW).toFixed(3) : 0;

    const problems = [];
    if (o.docOverflowX > 0) problems.push(`横向溢出${o.docOverflowX}px`);
    if (o.zeroCards > 0) problems.push(`压扁卡${o.zeroCards}张`);
    if (o.phase !== 'round') problems.push('未进到回合页');
    if (o.stageH && o.footH > o.stageH) problems.push('决策区顶穿棋盘');
    if (stacked) { if (mainShare < 0.9) problems.push(`叙事区仅占${mainShare}`); }
    else if (sideShare > 0.28) problems.push(`右栏过宽${sideShare}`);
    if (o.mainW < 240) problems.push(`叙事区过窄${o.mainW}px`);
    // 高度也要看:竖屏下顶栏/右栏条/决策区三者会把叙事区压没。
    // 之前只断言宽度,结果叙事区一度掉到 16px(约一行字)却仍然报 ok —— 补上这条。
    if (o.mainH < 56) problems.push(`叙事区过矮${o.mainH}px`);

    rows.push([name, problems]);
    console.log(
      name.padEnd(24) +
        `${o.stageW}x${o.stageH}`.padEnd(12) +
        `${o.mainW}x${o.mainH}`.padEnd(11) +
        (stacked ? '横条' : String(o.sideW)).padEnd(8) +
        String(o.footH).padEnd(8) +
        String(o.cards).padEnd(6) +
        String(o.docOverflowX).padEnd(9) +
        (stacked ? `main${mainShare}` : `side${sideShare}`).padEnd(9) +
        (problems.length ? 'FAIL ' + problems.join('/') : 'ok'),
    );
  }

  const errs = consoleErrors();
  const ok = report('多视口布局', [
    ...rows.map(([name, problems]) => [name, problems.length === 0]),
    ['控制台无错误', errs.length === 0],
  ]);
  return ok;
})
  .then((ok) => process.exit(ok ? 0 : 1))
  .catch((e) => {
    console.error('[失败]', e.message);
    process.exit(1);
  });