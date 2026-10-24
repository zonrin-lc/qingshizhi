'use strict';
/**
 * 键盘路径。
 *
 * 全仓 20 套测试里没有一处派发过 keydown —— 键盘这条路径完全没被覆盖过:
 * 焦点能不能走到那些控件、Enter/Space 能不能触发、浮层打开时焦点会不会
 * 跑到被蒙版盖住的后台控件上、Esc 能不能关掉浮层、:focus-visible 有没有
 * 可见的焦点指示 —— 全是空白。
 *
 * 这里用 CDP 的 Input.dispatchKeyEvent 发真按键(不是页内 dispatchEvent):
 * 合成事件不算用户激活,浏览器对「空格/回车触发按钮」的默认行为也不认,
 * 测出来的东西不是玩家真按出来的。
 *
 * 三段:
 *   A. 主菜单:Tab 能走到各个入口项,Enter 能触发(入局 → 选择页)
 *      对局里:Tab 能走到选项卡与关键事件提示条,Enter 能触发
 *   B. 确认浮层:打开时焦点移进浮层、Tab 不跑出浮层、Esc 能关、焦点还给触发者
 *   C. :focus-visible 有可见的焦点指示(轮廓/阴影/位移,任一即可)
 */
const { withPage, report, sleep, STEP_SNIPPET } = require('./lib/harness.cjs');

/** 当前焦点元素的快照 */
const ACTIVE = `(() => {
  const el = document.activeElement;
  if (!el) return null;
  let fv = false;
  try { fv = el.matches(':focus-visible'); } catch (e) { fv = false; }
  const cs = getComputedStyle(el);
  return {
    tag: el.tagName,
    cls: (el.className || '').toString(),
    text: (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 24),
    inOverlay: !!(el.closest && el.closest('.overlay')),
    focusVisible: fv,
    style: {
      outline: cs.outline, shadow: cs.boxShadow, transform: cs.transform,
      border: cs.borderColor, filter: cs.filter,
    },
  };
})()`;

/** 某个元素的样式快照(用来比「聚焦前 / 聚焦后」) */
const STYLE_OF = (sel) => `(() => {
  const el = document.querySelector(${JSON.stringify(sel)});
  if (!el) return null;
  const cs = getComputedStyle(el);
  return { outline: cs.outline, shadow: cs.boxShadow, transform: cs.transform,
           border: cs.borderColor, filter: cs.filter };
})()`;

const GAME_PHASE = `(() => {
  const g = window.__QS__ && window.__QS__.game;
  return { phase: g ? g.phase : '', cards: document.querySelectorAll('.stage__foot .card[role="button"]').length,
           keybar: !!document.querySelector('.prompt--key.is-live') };
})()`;

/** 一直按 Tab,直到焦点落在满足条件的元素上(或用完次数) */
async function tabUntil(evaluate, pressKey, pred, max = 60) {
  for (let i = 0; i < max; i += 1) {
    const a = await evaluate(ACTIVE);
    if (a && pred(a)) return { ok: true, steps: i, el: a };
    await pressKey('Tab');
  }
  const a = await evaluate(ACTIVE);
  return { ok: !!(a && pred(a)), steps: max, el: a };
}

/** 焦点指示:聚焦前后至少有一项视觉属性变了 */
function hasVisibleFocus(before, after) {
  if (!before || !after) return false;
  return ['outline', 'shadow', 'transform', 'border', 'filter']
    .some((k) => (before[k] || '') !== (after[k] || ''));
}

withPage(async ({ evaluate, pressKey, consoleErrors, enterGame, load }) => {
  const checks = [];
  const add = (name, ok, why) => checks.push([ok || !why ? name : `${name}  << ${why}`, !!ok]);

  /* ---------------- A1. 主菜单:Tab 能走到入口项 ---------------- */
  const seen = [];
  for (let i = 0; i < 14; i += 1) {
    await pressKey('Tab');
    const a = await evaluate(ACTIVE);
    if (a) seen.push(a);
  }
  const clsOf = (a) => a.cls || '';
  const reachedStart = seen.some((a) => clsOf(a).includes('menu__item--start'));
  const reachedSub = seen.filter((a) => clsOf(a).includes('menu__item--sub')).length;
  add('Tab 能走到主菜单的「入 局」', reachedStart,
    `走过的元素:${seen.map((a) => a.cls || a.tag).slice(0, 8).join(' | ')}`);
  add('Tab 能走到主菜单的次级项(存档/图鉴/设置/退出)', reachedSub >= 3,
    `走到 ${reachedSub} 个次级项`);

  /* ---------------- A2. Enter 触发「入 局」 ---------------- */
  const toStart = await tabUntil(evaluate, pressKey, (a) => clsOf(a).includes('menu__item--start'));
  add('Tab 能停到「入 局」上', toStart.ok, `按了 ${toStart.steps} 次 Tab`);
  if (toStart.ok) {
    await pressKey('Enter');
    await sleep(700);
    const onSelect = await evaluate(`!!document.querySelector('.selenter')`);
    add('Enter 能触发「入 局」(进了选择页)', onSelect === true);
    // 回到主菜单:重载一次最省事 —— 选剧本页的返回钮与壳层那颗同名 .pageback
    // 容易点错(点错就留在选剧本页,后面的焦点循环全在错的页面里跑)
    await load();
  } else {
    add('Enter 能触发「入 局」(进了选择页)', false, '焦点到不了「入 局」');
  }

  /* ---------------- B. 确认浮层:焦点陷阱 + Esc ---------------- */
  // 用键盘打开:Tab 到「退 出」→ Enter(顺便也验了键盘能开浮层)
  const toExit = await tabUntil(evaluate, pressKey, (a) => clsOf(a).includes('menu__item--exit'));
  add('Tab 能停到「退 出」上', toExit.ok, `按了 ${toExit.steps} 次 Tab`);
  let overlayShown = false;
  if (toExit.ok) {
    await pressKey('Enter');
    await sleep(400);
    overlayShown = await evaluate(`!!document.querySelector('.menu__confirm')`);
    add('Enter 能打开退出确认浮层', overlayShown === true);
    const inOv = await evaluate(ACTIVE);
    add('浮层打开时焦点移进了浮层', !!(inOv && inOv.inOverlay),
      inOv ? `焦点在 ${inOv.cls || inOv.tag}` : '没有焦点');
    // Tab 三次:焦点不许跑到被蒙版盖住的后台控件上
    let escaped = false;
    const trail = [];
    for (let i = 0; i < 3; i += 1) {
      await pressKey('Tab');
      const a = await evaluate(ACTIVE);
      trail.push(a ? `${a.cls || a.tag}${a.inOverlay ? '(浮层内)' : '(浮层外!)'}` : '(无焦点)');
      if (!a || !a.inOverlay) escaped = true;
    }
    add('浮层打开时 Tab 不会跑到后台控件上', escaped === false, trail.join(' → '));
    await pressKey('Escape');
    await sleep(300);
    const closed = await evaluate(`!document.querySelector('.menu__confirm')`);
    add('Esc 能关掉确认浮层', closed === true);
    const back = await evaluate(ACTIVE);
    add('浮层关闭后焦点还给触发它的控件', !!(back && clsOf(back).includes('menu__item--exit')),
      back ? `焦点在 ${back.cls || back.tag}` : '没有焦点');
  } else {
    add('Enter 能打开退出确认浮层', false, '焦点到不了「退 出」');
    add('浮层打开时焦点移进了浮层', false, '没打开浮层');
    add('浮层打开时 Tab 不会跑到后台控件上', false, '没打开浮层');
    add('Esc 能关掉确认浮层', false, '没打开浮层');
    add('浮层关闭后焦点还给触发它的控件', false, '没打开浮层');
  }

  /* ---------------- C. :focus-visible 有可见指示 ---------------- */
  // 回主菜单,量一下「入 局」聚焦前后的样式差
  await load();
  await sleep(200);
  const beforeStyle = await evaluate(STYLE_OF('.menu__item--start'));
  await evaluate(`(() => { document.activeElement && document.activeElement.blur && document.activeElement.blur(); return true; })()`);
  const toStart2 = await tabUntil(evaluate, pressKey, (a) => clsOf(a).includes('menu__item--start'));
  const afterStyle = await evaluate(STYLE_OF('.menu__item--start'));
  const fvNow = toStart2.ok ? toStart2.el : null;
  add(':focus-visible 匹配得上(键盘聚焦)', !!(fvNow && fvNow.focusVisible),
    fvNow ? `focusVisible=${fvNow.focusVisible}` : '没聚焦到');
  add(':focus-visible 有可见的焦点指示', hasVisibleFocus(beforeStyle, afterStyle),
    `聚焦前 ${JSON.stringify(beforeStyle)} 聚焦后 ${JSON.stringify(afterStyle)}`);

  /* ---------------- A3. 对局里:选项卡 / 关键事件提示条 ---------------- */
  await enterGame();
  // 推进到回合相位(要有一手可点的牌)
  await evaluate(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const q = s => document.querySelector(s), qa = s => [...document.querySelectorAll(s)];
    const g = window.__QS__.game;
    ${STEP_SNIPPET}
    for (let i = 0; i < 300; i += 1) {
      if (g.phase === 'round' && qa('.stage__foot .card[role="button"]').length) break;
      advanceOnce();
      await sleep(15);
    }
    return true;
  })()`);
  const g0 = await evaluate(GAME_PHASE);
  add('进到回合相位(有手牌)', g0.phase === 'round' && g0.cards > 0, JSON.stringify(g0));

  // 选项卡:回合相位的行动牌(.card--action)与事件选项牌(.card--tappable)都算「卡」
  const toCard = await tabUntil(evaluate, pressKey, (a) => /(^|\s)card(\s|$)/.test(clsOf(a)));
  add('Tab 能走到选项卡', toCard.ok, `按了 ${toCard.steps} 次 Tab`);
  if (toCard.ok) {
    const before = await evaluate(GAME_PHASE);
    await pressKey('Enter');
    await sleep(500);
    const after = await evaluate(GAME_PHASE);
    add('Enter 能触发选项卡(牌真的打出去了)',
      after.phase !== before.phase || after.cards < before.cards,
      `之前 ${JSON.stringify(before)} 之后 ${JSON.stringify(after)}`);
  } else {
    add('Enter 能触发选项卡(牌真的打出去了)', false, '焦点到不了选项卡');
  }

  // 关键事件提示条:这一局不一定出现,出现了就必须键盘可达
  let keybarFound = false;
  for (let i = 0; i < 14; i += 1) {
    const st = await evaluate(GAME_PHASE);
    if (st.keybar) { keybarFound = true; break; }
    // 继续打牌,等下一轮的关键事件
    await evaluate(`(async () => {
      const sleep = ms => new Promise(r => setTimeout(r, ms));
      const q = s => document.querySelector(s), qa = s => [...document.querySelectorAll(s)];
      const g = window.__QS__.game;
      ${STEP_SNIPPET}
      for (let k = 0; k < 60; k += 1) {
        if (q('.prompt--key.is-live')) return true;
        if (g.phase === 'round') {
          const c = qa('.stage__foot .card--action[role="button"]')[0];
          if (c) { c.click(); await waitDeal(); }
        } else { advanceOnce(); await sleep(30); }
      }
      return true;
    })()`);
  }
  if (keybarFound) {
    const toKey = await tabUntil(evaluate, pressKey, (a) => clsOf(a).includes('prompt--key'));
    add('Tab 能走到关键事件提示条', toKey.ok, `按了 ${toKey.steps} 次 Tab`);
    if (toKey.ok) {
      const before = await evaluate(GAME_PHASE);
      await pressKey('Enter');
      await sleep(600);
      const after = await evaluate(GAME_PHASE);
      add('Enter 能触发关键事件提示条', after.phase !== before.phase,
        `之前 ${before.phase} 之后 ${after.phase}`);
    } else {
      add('Enter 能触发关键事件提示条', false, '焦点到不了提示条');
    }
  } else {
    add('Tab 能走到关键事件提示条(本局未出现该提示条,未覆盖)', true,
      '这一局没有出现关键事件提示条,键盘分支未覆盖');
    add('Enter 能触发关键事件提示条(本局未出现该提示条,未覆盖)', true,
      '这一局没有出现关键事件提示条,键盘分支未覆盖');
  }

  const errs = consoleErrors();
  add('控制台无错误', errs.length === 0, errs.join(' / '));

  const ok = report('键盘路径', checks);
  if (!ok) {
    console.log('\n诊断:');
    console.log('  走过的焦点:', seen.map((a) => `${a.tag}.${a.cls}`).join(' | '));
    errs.forEach((e) => console.log('  错误 ' + e));
  }
  return ok;
}, { enter: false })
  .then((ok) => process.exit(ok ? 0 : 1))
  .catch((e) => {
    console.error('[失败]', e.message);
    process.exit(1);
  });
