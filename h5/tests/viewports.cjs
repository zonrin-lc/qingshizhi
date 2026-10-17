/**
 * 多视口布局体检。
 *
 * 为什么要单独一套:P1 验的是单栏壳,P2 加了两栏(定宽右栏 + 限高决策区 + 浮层),
 * 这套布局一旦遇到窄视口会直接塌——右栏 13rem 定宽在 667px 上就占 31%,
 * 竖屏 390px 更占到 53%,叙事区被挤到 166px;决策区还会顶穿整个棋盘。
 *
 * 判据分两种形态:
 * - 并排(side 占比 < 0.9):右栏占比不得超过 32%
 *   (2026-10-14 改版:用户拍板「文本区约 70% / 属性区约 30%」,
 *    阈值由 28% 放宽到 32%,实测并排形态稳定在 29.5% 左右)
 * - 降级(side 整宽横条,占比 > 0.9):叙事区须占到 90% 以上
 */
'use strict';

const { withPage, report, STEP_SNIPPET } = require('./lib/harness.cjs');

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
${STEP_SNIPPET}
  // 「是否竖屏」必须由视口方向判定,不能看引导层是否显示——
  // 否则引导层一旦在横屏误开,测试会以为「竖屏本就不渲染对局」而直接放过,
  // 变成假绿(这正是第一版踩的坑:1280x720 也被引导盖住却报 ok)。
  const isPortrait = window.innerHeight > window.innerWidth;
  const hint = q('.rotate-hint');
  const rotateHint = !!(hint && getComputedStyle(hint).display !== 'none');
  if (!isPortrait) {
    // 预算 140 轮 × ~14ms ≈ 2s:配音全量后入局负载变大,偶发走不完 intro→round;
    // 放宽到 400 轮(≈6s),布局断言本身不受影响
    for (let i = 0; i < 400 && g.phase !== 'round'; i++) {
      await sleep(10);
      // 渐显期间选项还没挂上,先点正文跳过去(同 chain)
      if (window.__QS__.session.isRevealing) {
        q('.stage__main').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
        continue;
      }
      const ov = q('.overlay');
      if (ov && !ov.hidden) { q('.overlay .btn--primary').click(); await sleep(4); continue; }
      if (g.phase === 'intro') { (q('.stage__main .btn--primary') || q('.stage__foot .btn--primary'))?.click(); await sleep(4); }
      else if (g.phase === 'event') {
        // 偶遇/随机事件:选项与结算「继续」内联在文本区,不在底部
        const cont = q('.stage__main .btn--primary');
        if (cont) cont.click();
        else (qa('.stage__main .card--tappable, .stage__foot .card--tappable')[0] || {}).click?.();
        await sleep(4);
      }
      else { advanceOnce(); await sleep(4); }
    }
  }
  await sleep(60);
  const stage = q('.stage'), main = q('.stage__main'), foot = q('.stage__foot'), side = q('.stage__side');
  const cards = qa('.stage__foot .card');
  const r = n => n ? n.getBoundingClientRect() : null;
  const sr = r(stage), mr = r(main), fr = r(foot), dr = r(side);
  return {
    phase: g.phase,
    isPortrait,
    rotateHint,
    rotateHintVisible: !!hint && hint.getBoundingClientRect().height > 0,
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

withPage(async ({ evaluate, load, enterGame, consoleErrors }) => {
  console.log('视口'.padEnd(26) + 'stage'.padEnd(12) + 'main'.padEnd(11) + 'side'.padEnd(8) + 'foot'.padEnd(8) + '卡片 横溢出 形态');
  console.log('-'.repeat(100));

  const rows = [];
  for (const [name, w, h, dsf] of VIEWPORTS) {
    await load(w, h, dsf);
    // load() 会重新导航,应用回到选择页 —— 每个视口都要重新入局,
    // 否则 probe 拿到的 window.__QS__.game 是 undefined。
    await enterGame();
    const o = await evaluate(PROBE);
    const stacked = o.sideW / o.stageW > 0.9;
    const mainShare = o.stageW ? +(o.mainW / o.stageW).toFixed(3) : 0;
    const sideShare = o.stageW ? +(o.sideW / o.stageW).toFixed(3) : 0;
    // 竖屏改为「请横屏」引导:不再硬渲染对局,叙事区高度不再有意义
    const portrait = o.isPortrait;

    const problems = [];
    if (o.docOverflowX > 0) problems.push(`横向溢出${o.docOverflowX}px`);
    // 引导层与朝向必须一致:竖屏该有、横屏绝不能有
    if (portrait && !o.rotateHintVisible) problems.push('竖屏未显示转屏提示');
    if (!portrait && o.rotateHintVisible) problems.push('横屏竟显示转屏提示');
    if (!portrait) {
      if (o.zeroCards > 0) problems.push(`压扁卡${o.zeroCards}张`);
      if (o.phase !== 'round') problems.push('未进到回合页');
      if (o.stageH && o.footH > o.stageH) problems.push('决策区顶穿棋盘');
      if (stacked) { if (mainShare < 0.9) problems.push(`叙事区仅占${mainShare}`); }
      else if (sideShare > 0.32) problems.push(`右栏过宽${sideShare}`);
      if (o.mainW < 240) problems.push(`叙事区过窄${o.mainW}px`);
      // 高度也要看:之前只断言宽度,叙事区一度掉到 16px 却仍报 ok —— 补上这条。
      if (o.mainH < 56) problems.push(`叙事区过矮${o.mainH}px`);
    }

    rows.push([name, problems]);
    console.log(
      name.padEnd(24) +
        `${o.stageW}x${o.stageH}`.padEnd(12) +
        `${o.mainW}x${o.mainH}`.padEnd(11) +
        (stacked ? '横条' : String(o.sideW)).padEnd(8) +
        String(o.footH).padEnd(8) +
        String(o.cards).padEnd(6) +
        String(o.docOverflowX).padEnd(9) +
        (portrait ? '转屏提示' : stacked ? `main${mainShare}` : `side${sideShare}`).padEnd(9) +
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
