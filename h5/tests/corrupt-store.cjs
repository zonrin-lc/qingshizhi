'use strict';
/**
 * 脏档 / 异常输入。
 *
 * 存档来自三个不受控的来源:localStorage(手改、旧版本残留)、云端整包(别的机器
 * 上的旧包)、导入的 bundle。原来的 readAutos / readStash 只有一个 catch:
 * 解析失败就当空处理 —— 形状不对(桶不是数组、条目 payload 是 null)则直接
 * 让 .map / .push 抛 TypeError,存档页整页渲染失败、对局页「返回」也退不出去。
 *
 * 2026-10-21 起 saves.ts 加了逐条形状校验(sanitizeStore),解析失败还会先把
 * 原始串隔离到 `.broken` 键。这套用例把那些边界都钉住:
 *   1. 应用不白屏(主菜单出得来、还能入局)
 *   2. 存档页给**空态**,而不是崩
 *   3. 坏档与好档混在一起时,好档还在,而且点「读 取」真的能读(不静默失败)
 *   4. 原始数据不被无声抹掉:解析失败先隔离到 `.broken`,原键也还在
 */
const { withPage, report, sleep, STEP_SNIPPET } = require('./lib/harness.cjs');

/** 坏值样本:JSON.parse 会炸的 / 形状不对的 / 根本不是对象的 / 超长的 */
const BAD_VALUES = [
  { name: '非法 JSON("{")', value: '{', parseFail: true },
  { name: '非法 JSON(截断)', value: '{"lisi":[{"payload":', parseFail: true },
  { name: '桶不是数组', value: '{"lisi":"not-an-array"}', parseFail: false },
  { name: '条目 payload 为 null', value: '{"lisi":[{"payload":null}]}', parseFail: false },
  { name: '整个值是数组', value: '[1,2,3]', parseFail: false },
  { name: '超长垃圾串', value: `"${'x'.repeat(200000)}"`, parseFail: false },
];

/** 打出一条**真**的自动档(后面拿它当「好档」混进坏数据里) */
const MAKE_GOOD_SAVE = `(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const q = s => document.querySelector(s), qa = s => [...document.querySelectorAll(s)];
  const g = window.__QS__.game;
${STEP_SNIPPET}
  for (let i = 0; i < 200 && g.phase === 'intro'; i += 1) { advanceOnce(); await sleep(8); }
  const r = window.__QS__.saveGame();
  await sleep(120);
  return { ok: !!r.ok, reason: r.reason || '' };
})()`;

/** 进存档页,看它给的是空态还是崩 */
const OPEN_SAVE_PAGE = `(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const q = s => document.querySelector(s), qa = s => [...document.querySelectorAll(s)];
  const out = { entered: false, savesShown: false, emptyHint: false, filled: -1, guide: false, err: '' };
  try {
    q('.menu__item--start')?.click();
    const tE = performance.now();
    while (!q('.selenter') && performance.now() - tE < 8000) await sleep(50);
    q('.selenter')?.click();
    const tQ = performance.now();
    while (!(window.__QS__ && window.__QS__.goSaves) && performance.now() - tQ < 8000) await sleep(50);
    out.entered = !!(window.__QS__ && window.__QS__.goSaves);
    if (out.entered) {
      window.__QS__.goSaves();
      const tS = performance.now();
      while (!q('.saves') && performance.now() - tS < 8000) await sleep(50);
    }
    out.savesShown = !!q('.saves');
    out.emptyHint = !!q('.saves__empty');
    out.guide = !!q('.saves__guide');
    out.filled = qa('.saves__list .slot:not(.is-empty)').length;
  } catch (e) {
    out.err = String((e && e.message) || e);
  }
  return out;
})()`;

const READ_STORE = `(() => {
  const raw = localStorage.getItem('qingshi.autos.v1');
  let parsed = null;
  let parseFailed = false;
  try { parsed = JSON.parse(raw || '{}'); } catch (e) { parseFailed = true; }
  return {
    raw,
    broken: localStorage.getItem('qingshi.autos.v1.broken'),
    brokenStash: localStorage.getItem('qingshi.stash.v1.broken'),
    stashRaw: localStorage.getItem('qingshi.stash.v1'),
    parseFailed,
    slots: parsed && typeof parsed === 'object' && !Array.isArray(parsed) && Array.isArray(parsed.lisi)
      ? parsed.lisi.length : -1,
  };
})()`;

withPage(async ({ evaluate, load, consoleErrors }) => {
  const checks = [];
  const add = (name, ok, why) => checks.push([ok || !why ? name : `${name}  << ${why}`, !!ok]);

  // ---------- 一、先造一条真档(当「好档」用) ----------
  const good = await evaluate(MAKE_GOOD_SAVE);
  add('能造出一条真自动档(后面当好档用)', good.ok === true, JSON.stringify(good));
  const goodStore = await evaluate(`localStorage.getItem('qingshi.autos.v1')`);
  let goodSlots = [];
  try {
    const o = JSON.parse(goodStore || '{}');
    goodSlots = Array.isArray(o.lisi) ? o.lisi : [];
  } catch { /* 解析不了就当没有 */ }
  add('真档确实写进了 localStorage', goodSlots.length >= 1, `条数 ${goodSlots.length}`);

  // ---------- 二、逐个坏值:不白屏 + 空态 + 数据不被无声抹掉 ----------
  const perCase = [];
  for (const c of BAD_VALUES) {
    // 先收掉对局:pagehide 会重写暂存,会把我们刚塞的坏值盖掉
    await evaluate(`(() => {
      try { if (window.__QS__ && window.__QS__.goMenu) window.__QS__.goMenu(); } catch (e) {}
      return true;
    })()`);
    await sleep(250);
    await evaluate(`(() => {
      localStorage.setItem('qingshi.autos.v1', ${JSON.stringify(c.value)});
      localStorage.setItem('qingshi.stash.v1', ${JSON.stringify(c.value)});
      return true;
    })()`);
    // 重载:应用可能直接起不来(白屏/脚本崩)——那本身就是这一条要验的东西,
    // 不能让 harness 的异常把整个套中断掉(后面的样本就都验不到了)
    let loadErr = null;
    try {
      await load(1600, 900, 1);
    } catch (e) {
      loadErr = e.message;
    }
    const menu = await evaluate(`!!document.querySelector('.menu__item--start')`);
    const page = loadErr
      ? { entered: false, savesShown: false, emptyHint: false, filled: -1, guide: false, err: loadErr }
      : await evaluate(OPEN_SAVE_PAGE);
    const store = await evaluate(READ_STORE);
    perCase.push({ name: c.name, parseFail: c.parseFail, menu, page, store, loadErr });
  }

  for (const r of perCase) {
    add(`坏档[${r.name}]:应用没白屏`, r.menu === true, r.loadErr || '');
    add(`坏档[${r.name}]:还能入局`, r.page.entered === true, r.page.err);
    add(`坏档[${r.name}]:存档页渲染出来了`, r.page.savesShown === true, r.page.err);
    add(`坏档[${r.name}]:给的是空态而不是崩`,
      r.page.emptyHint === true && r.page.filled === 0,
      `emptyHint=${r.page.emptyHint} 占用槽位 ${r.page.filled}`);
    add(`坏档[${r.name}]:原始数据没被无声抹掉(原键还在)`,
      r.store.raw !== null, '原键被清掉了');
    if (r.parseFail) {
      add(`坏档[${r.name}]:坏数据先隔离到 .broken 键`,
        typeof r.store.broken === 'string' && r.store.broken.length > 0,
        `broken=${JSON.stringify((r.store.broken || '').slice(0, 40))}`);
      add(`坏档[${r.name}]:暂存的坏数据也隔离到 .broken 键`,
        typeof r.store.brokenStash === 'string' && r.store.brokenStash.length > 0,
        `brokenStash=${JSON.stringify((r.store.brokenStash || '').slice(0, 40))}`);
    }
  }

  // ---------- 三、好档与坏档混在一起:好档还在,而且「读 取」能用 ----------
  const mixed = JSON.stringify({
    lisi: [{ at: 'not-a-number', payload: null }, ...goodSlots],
  });
  await evaluate(`(() => {
    try { if (window.__QS__ && window.__QS__.goMenu) window.__QS__.goMenu(); } catch (e) {}
    return true;
  })()`);
  await sleep(250);
  await evaluate(`(() => {
    localStorage.setItem('qingshi.autos.v1', ${JSON.stringify(mixed)});
    return true;
  })()`);
  await load(1600, 900, 1);
  const mixedPage = await evaluate(OPEN_SAVE_PAGE);  add('好坏混存:应用没白屏', mixedPage.entered === true, mixedPage.err);
  add('好坏混存:好档还在(坏的那条被剔掉)', mixedPage.filled === 1, `占用槽位 ${mixedPage.filled}`);
  const readBack = await evaluate(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const q = s => document.querySelector(s), qa = s => [...document.querySelectorAll(s)];
    const btn = q('.saves__list .slot:not(.is-empty) .btn--primary');
    if (!btn) return { clicked: false, why: '没有「读 取」按钮' };
    const before = window.__QS__ && window.__QS__.game;
    btn.click();
    const tL = performance.now();
    while ((!window.__QS__ || !window.__QS__.game || window.__QS__.game === before) && performance.now() - tL < 10000) {
      await sleep(50);
    }
    const tD = performance.now();
    while (!q('.stage__main .sec') && performance.now() - tD < 5000) await sleep(50);
    const g = window.__QS__ && window.__QS__.game;
    return {
      clicked: true,
      inGame: !!g,
      // 真的换了一局吗?只判「有 game」会被「读档失败、旧局还在」蒙过去
      changed: !!g && g !== before,
      phase: g ? g.phase : '',
      chap: (q('.stage__chap .stage__ch') || {}).textContent || '',
      heads: qa('.stage__main .sec .sec__head').map(h => h.textContent || '').length,
      toast: (q('.toast') || {}).textContent || '',
    };
  })()`);
  add('好坏混存:点「读 取」真的进了对局(不静默失败)',
    readBack.clicked === true && readBack.inGame === true && readBack.changed === true
    && !/缺失|拒收/.test(readBack.toast || ''),
    JSON.stringify(readBack));

  const errs = consoleErrors();
  add('控制台无未捕获异常', errs.filter((e) => !/TypeError|is not a function/.test(e)).length === 0,
    errs.join(' / '));

  const ok = report('脏档 / 异常输入', checks);
  if (!ok) {
    console.log('\n诊断:');
    for (const r of perCase) {
      console.log(`  ${r.name}: menu=${r.menu} entered=${r.page.entered} saves=${r.page.savesShown} `
        + `empty=${r.page.emptyHint} filled=${r.page.filled} raw=${JSON.stringify((r.store.raw || '').slice(0, 60))} `
        + `broken=${JSON.stringify((r.store.broken || '').slice(0, 60))}`);
    }
    console.log('  读取 ', JSON.stringify(readBack));
    errs.forEach((e) => console.log('  错误 ' + e));
  }
  return ok;
})
  .then((ok) => process.exit(ok ? 0 : 1))
  .catch((e) => { console.error('[失败]', e.message); process.exit(1); });
