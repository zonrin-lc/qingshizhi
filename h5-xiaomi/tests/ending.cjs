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
    // 行动卡结算动画序列(2026-10-17 拍板)自动推进但真实耗时,点完要等它走完,
    // 否则 6000 步全空转在结算窗口里
    if (act === 'card') { await waitDeal(); continue; }
    // 随机事件落定后无「继 续」(2026-10-17 拍板):1.5s 自动推进,等相位离开 settle,
    // 否则每个随机事件都拿 idle 空转烧掉几百步
    if (g.phase === 'settle') { await waitSettle(); continue; }
    // 空转只发生在无任何可点元素的结算/发牌动画窗口(点不了的 2-3s),
    // 高频空转纯属烧步数预算(动画放慢后 4ms 空转一轮结算就烧 500 步)——拉长睡眠
    if (act === 'idle') await sleep(50); else await sleep(2);
  }
  if (g.phase !== 'ending') return { ok: false, why: '6000 步内没走到结局', phase: g.phase, steps };

  // 结局弹框内容是异步落定的(相位切来时上一相位 DOM 可能还在),等总分行出现再采样
  for (let i = 0; i < 40 && !q('.score--total'); i++) await sleep(100);

  // 结局弹框 DOM(2026-10-20 拍板复用图鉴详情弹框):印鉴 + 头部总分/评级 + 累计达成 + 返回主页
  const dom = {
    seal: !!q('.seal--big'),
    scores: qa('.score').length,
    total: !!q('.score--total'),
    back: qa('.overlay .btn--primary').map(b => b.textContent.trim()),
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

  // 结局页累计达成行:2026-10-20 拍板措辞「累计达成N回」(galdetail__meta)
  const progLine = qa('.txt').map(t => t.textContent).find(t => t.includes('累计达成'));

  // 返回主页(弹框内按钮) → 主菜单出现
  const backBtn = qa('.overlay .btn--primary')[0];
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
    // 2026-10-20 拍板:四维评分行并入头部总分/评级,不再单列
    ['总分行 + 评等印鉴(复用图鉴详情弹框)', (out.dom?.scores ?? 0) >= 1 && out.dom?.total === true && out.dom?.seal === true],
    ['提供「返 回 主 页」', (out.dom?.back ?? []).some((t) => t.includes('返'))],
    ['结局后自动档已清', out.autoCleared === true],
    ['跨局收藏已写回(col_v1)', !!out.col && Array.isArray(out.col.gloss) && Array.isArray(out.col.ach)],
    ['结局达成记录落地(次数≥1)', !!out.endRec && out.endRec.c >= 1 && typeof out.endRec.n === 'string'],
    ['结局页有累计达成行(2026-10-20 拍板措辞)', !!out.progLine && /累计达成\d+回/.test(out.progLine)],
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
