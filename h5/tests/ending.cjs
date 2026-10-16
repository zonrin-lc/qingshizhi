/**
 * 结局页验收:把李斯一整局点完,验结局页渲染与它的两条副作用。
 *
 * 为什么值得单独一套:chain.cjs 在第二章章首就 PASS 了,结局相位的
 * 渲染(评分/印鉴/总章)与「结局时清自动档、写跨局收藏」这两条副作用
 * 此前没有任何测试盯着 —— 审查(D-M1)指出这是最大的盲测面。
 *
 * 驱动方式与 chain 不同:不逐相位断言,只用公共步进片段一路点到结局,
 * 这顺带覆盖了 endEvent / correction / choice 等 chain 走不全的相位。
 */
'use strict';

const { withPage, report, STEP_SNIPPET } = require('./lib/harness.cjs');

const DRIVER = `(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const q = s => document.querySelector(s);
  const qa = s => [...document.querySelectorAll(s)];
  ${STEP_SNIPPET}
  const g = window.__QS__.game;
  // 先写一条自动档,结局落地时必须把它清掉(否则通关的局还会从「继续旅程」复活)
  window.__QS__.saveGame(true);
  let steps = 0;
  const phaseSeen = new Set();
  for (let i = 0; i < 6000; i++) {
    steps = i;
    phaseSeen.add(g.phase);
    if (g.phase === 'ending') break;
    const act = advanceOnce();
    if (act === 'idle') await sleep(4); else await sleep(2);
  }
  if (g.phase !== 'ending') return { ok: false, why: '6000 步内没走到结局', phase: g.phase, steps };

  // 结局页 DOM:评等印鉴、四维评分、总分行、返回主页
  const dom = {
    seal: !!q('.seal--big'),
    scores: qa('.score').length,
    total: !!q('.score--total'),
    back: qa('.stage__foot .btn--primary').map(b => b.textContent.trim()),
  };

  // 副作用 1:结局落地后该剧本的自动档必须清掉(对齐 Lua renderEnding → Store.remove),
  // 否则通关的局还会从「继续旅程」里复活
  const autos = JSON.parse(localStorage.getItem('qingshi.autos.v1') || '{}');
  const autoCleared = !(Array.isArray(autos.lisi) && autos.lisi.length > 0);

  // 副作用 2:跨局收藏必须写回(col_v1 语义),成就/词条跨局累计;
  // 结局达成记录(endings)也要落地 —— 图鉴页与结局页进度行都读它
  const col = JSON.parse(localStorage.getItem('qingshi.col.v1.lisi') || 'null');
  const endKeys = col && col.endings ? Object.keys(col.endings) : [];
  const endRec = endKeys.length ? col.endings[endKeys[0]] : null;

  // 结局页进度行:「此结局第 N 回达成 · 剧本结局 x/y」
  const progLine = qa('.txt').map(t => t.textContent).find(t => t.includes('回达成'));

  // 返回主页 → 主菜单出现
  const backBtn = qa('.stage__foot .btn--primary')[0];
  if (backBtn) backBtn.click();
  await sleep(300);
  const menuBack = !!q('.menu__item--start');

  return { ok: true, steps, phases: [...phaseSeen], dom, autoCleared, col, endRec, progLine, menuBack };
})()`;

withPage(async ({ evaluate, consoleErrors }) => {
  const out = await evaluate(DRIVER);
  if (!out.ok) {
    console.log('未走到结局: ' + JSON.stringify(out));
  }

  const ok = report('结局页', [
    ['整局走到 ending 相位', out.ok === true],
    ['评等印鉴渲染', out.dom?.seal === true],
    ['四维评分 + 总分行', (out.dom?.scores ?? 0) >= 5 && out.dom?.total === true],
    ['提供「返 回 主 页」', (out.dom?.back ?? []).some((t) => t.includes('返'))],
    ['结局后自动档已清', out.autoCleared === true],
    ['跨局收藏已写回(col_v1)', !!out.col && Array.isArray(out.col.gloss) && Array.isArray(out.col.ach)],
    ['结局达成记录落地(次数≥1)', !!out.endRec && out.endRec.c >= 1 && typeof out.endRec.n === 'string'],
    ['结局页有进度行(第 N 回达成 · x/y)', !!out.progLine && /第 \d+ 回达成/.test(out.progLine) && /结局 \d+\/\d+/.test(out.progLine)],
    ['返回主页回到主菜单', out.menuBack === true],
    ['控制台无错误', consoleErrors().length === 0],
  ]);
  if (!ok) {
    console.log('明细: ' + JSON.stringify(out).slice(0, 800));
    consoleErrors().forEach((e) => console.log('  错误 ' + e));
  }
  return ok;
})
  .then((ok) => process.exit(ok ? 0 : 1))
  .catch((e) => {
    console.error('[失败]', e.message);
    process.exit(1);
  });
