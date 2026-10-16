/**
 * 叙事渐显。
 *
 * 对齐 Lua shell.lua 的 revealSegs / cancelReveal / TapReveal。
 *
 * 断言只钉「与时间无关的性质」:这里最容易踩的坑是拿「第 0 毫秒有几段」
 * 当证据 —— CDP 一次往返就可能 300~600ms,而渐显间隔才 650ms,
 * 量出来时而 1 段时而 2 段,测试就成了flaky。真正该盯的是:
 *   · 渐显期间该出现的东西没出现(继续按钮/选项)
 *   · 跳完之后该出现的全都出现了,一个不少
 *   · 跳完不再渐显(定时器没漏)
 */
const { withPage, report, sleep, STEP_SNIPPET } = require('./lib/harness.cjs');

const PROBE = `(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const q = s => document.querySelector(s), qa = s => [...document.querySelectorAll(s)];
  const g = window.__QS__.game;
  // 推进逻辑复用 harness 的 advanceOnce:浮层/选项/行动牌/主按钮/跳渐显都覆盖了。
  // 自己重写过一版,漏了回合里的 .card--action[role=button],结果卡在回合推进不动。
  ${STEP_SNIPPET}
  // 文本区改为累积式小节后,旧小节的 .prose 仍在 DOM 里(收起留题签),
  // 全文档计数会把上一章的段落也算进来 —— 只数当前展开的那一节。
  const paras = () => {
    const secs = qa('.stage__main .sec');
    const cur = secs.filter(s => !s.classList.contains('is-collapsed')).pop() || secs[secs.length - 1];
    return cur ? [...cur.querySelectorAll('.prose')].length : 0;
  };
  // 偶遇/随机事件与抉择卡的选项都内联在文本区小节里(2026-10-16),底部的也要算。
  // 渐显期间两边都没挂,所以「渐显期间为 0」的负向断言语义不变。
  const opts = () => qa('.stage__main .card--tappable, .stage__foot .card--tappable').length;
  // 剧情「继 续」跟在文本下面(内联,2026-10-15);章末/结局的主按钮仍在底部
  const cont = () => qa('.stage__main .sec:not(.is-collapsed) .btn--primary, .stage__foot .btn--primary').length;
  const revealing = () => !!window.__QS__.session.isRevealing;
  const out = {};

  // ---------- 章首 ----------
  const introTotal = (g.chapter().intro || []).length;
  out.introTotal = introTotal;
  out.revealingOnEntry = revealing();
  out.parasOnEntry = paras();
  out.continueOnEntry = cont();

  // 自然放完。用轮询等「不再渐显」,不要写死 sleep:
  // 4 段 × 650ms + 收尾那一拍 ≈ 2.6 秒,但整套测试连着跑时机器有负载,
  // 固定等待会偶发不够,后面每一条断言就全跟着塌。
  const t0 = performance.now();
  while (revealing() && performance.now() - t0 < 8000) await sleep(50);
  out.revealingAfterNatural = revealing();
  out.parasAfterNatural = paras();
  out.continueAfterNatural = cont();

  // ---------- 事件页:进游戏,立刻观察渐显中的状态 ----------
  // 「继续」可能还没挂上(上一段没放完),轮询等它,而不是赌它已经在了
  const t1 = performance.now();
  while (cont() === 0 && performance.now() - t1 < 5000) await sleep(40);
  const contBtn = () => q('.stage__main .sec:not(.is-collapsed) .btn--primary') || q('.stage__foot .btn--primary');
  if (contBtn()) contBtn().click();

  // 「继续」之后未必就是事件:引擎有随机事件机制(实测有时插 R-2,
  // 有时直接 0-1,偶尔一步跨到回合),所以不能假定落地相位。
  //
  // 关键:观测必须在页内同步取,不能「先推进出去、再用 evaluate 回来读」。
  // CDP 一次往返可能 300~600ms,而单段事件的渐显只要 650ms 就结束,
  // 往返一趟正好错过 —— 表现为「事件页也在渐显」时真时假。
  // 所以一旦看见 phase==='event' 且正在渐显,当场把数读完就停。
  const t2 = performance.now();
  while (performance.now() - t2 < 15000) {
    if (g.phase === 'event' && window.__QS__.session.isRevealing) {
      out.phaseAfterContinue = g.phase;
      out.revealingInEvent = true;
      out.evId = g.eventId;
      out.segsTotal = (g.findEvent(g.eventId) || { segs: [] }).segs.length;
      out.segsDuringReveal = paras();
      out.optionsDuringReveal = opts();
      break;
    }
    advanceOnce();
    await sleep(30);
  }

  // 跳完
  q('.stage__main').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  await sleep(60);
  out.revealingAfterSkip = revealing();
  out.segsAfterSkip = paras();
  out.optionsAfterSkip = opts();

  // ---------- 换一个相位,确认没有残留的渐显往新页塞段落 ----------
  opts() && qa('.stage__main .card--tappable, .stage__foot .card--tappable')[0].click();
  await sleep(500);
  out.revealingAfterChoose = revealing();
  out.phaseAfterChoose = g.phase;
  out.parasAfterChoose = paras();

  // 再等一会儿,段数不该自己往上爬(定时器漏掉就会这样)
  await sleep(1200);
  out.parasSettled = paras();
  return out;
})()`;

withPage(async ({ evaluate, enterGame, consoleErrors }) => {
  await enterGame();
  const o = await evaluate(PROBE);

  const checks = [
    ['章首一进来就在渐显', o.revealingOnEntry === true],
    ['渐显期间「继续」还没挂上', o.continueOnEntry === 0, `${o.continueOnEntry} 个`],
    ['渐显只出了一部分段落', o.parasOnEntry < o.introTotal,
      `${o.parasOnEntry} / ${o.introTotal}`],

    ['自然放完后不再渐显', o.revealingAfterNatural === false],
    ['自然放完后段落全出', o.parasAfterNatural === o.introTotal,
      `${o.parasAfterNatural} / ${o.introTotal}`],
    ['自然放完后「继续」出现', o.continueAfterNatural === 1, `${o.continueAfterNatural} 个`],

    ['进了事件页', o.phaseAfterContinue === 'event', o.phaseAfterContinue],
    ['事件页也在渐显', o.revealingInEvent === true],
    ['渐显期间事件选项还没挂上', o.optionsDuringReveal === 0, `${o.optionsDuringReveal} 个`],
    ['渐显期间旁白只出了一部分',
      o.segsDuringReveal > 0 && o.segsDuringReveal < o.segsTotal,
      `${o.segsDuringReveal} / ${o.segsTotal}`],

    ['跳完不再渐显', o.revealingAfterSkip === false],
    ['跳完后事件旁白一段不少', o.segsAfterSkip === o.segsTotal,
      `${o.segsAfterSkip} / ${o.segsTotal}`],
    ['跳完后选项出现', o.optionsAfterSkip >= 2, `${o.optionsAfterSkip} 个`],

    ['选完换相位后没有残留渐显', o.revealingAfterChoose === false],
    ['等待后段数不再自己爬(定时器没漏)',
      o.parasSettled === o.parasAfterChoose,
      `${o.parasAfterChoose} → ${o.parasSettled}`],
  ];

  const ok = report('叙事渐显', checks);
  const errs = consoleErrors();
  const ct = report('控制台干净', [['无错误', errs.length === 0, errs.join(' / ')]]);
  return ok && ct;
}, { enter: false })
  .then((ok) => process.exit(ok ? 0 : 1))
  .catch((e) => {
    console.error('[失败]', e.message);
    process.exit(1);
  });
