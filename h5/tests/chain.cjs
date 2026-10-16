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
  const badLayout = [];
  const push = o => trace.push(o);
  let lastCard = null;

  // 版式不变量:.stage__main 是 display:flex(row),只允许直接挂
  // .castbox(出场立绘排)与 .prose-body 两个子元素。之前 章末/结局/抉择/章末事件
  // 四个渲染函数把标题、装饰线、每个段落直接 append 到 main,
  // 它们就成了兄弟 flex 项,正文被排成四列 —— 而当时的测试只查 DOM 存在,
  // 完全没发现。这里逐相位盯住这条不变量。
  // (类名从 portrait 改成 castbox 时,这条断言是唯一报错的地方——它确实在盯。)
  const checkLayout = ph => {
    const main = q('.stage__main');
    if (!main) return;
    const loose = [...main.children].filter(
      c => !c.classList.contains('castbox') && !c.classList.contains('prose-body'));
    if (loose.length) {
      badLayout.push({ ph, n: loose.length, cls: loose.map(c => c.className || c.tagName).join('|') });
    }
  };

  for (let i = 0; i < 600; i++) {
    await sleep(3);
    // 叙事渐显:段落没全亮、选项也还没挂上(对齐 Lua 的"读完才给选")。
    // 先点正文区跳过去,否则下面 paras/segs 的段数断言会读到半截。
    if (window.__QS__.session.isRevealing) {
      q('.stage__main').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      continue;
    }
    checkLayout(g.phase);
    const ov = q('.overlay');
    if (ov && !ov.hidden) {
      push({ at: i, evt: 'settle', title: (q('.overlay__title')||{}).textContent || '',
             changes: qa('.chgrow__v').map(n => n.textContent.trim()), phase: g.phase, dev: g.dev });
      const b = q('.overlay .btn--primary');
      if (!b) { push({ evt: 'STUCK: settle 无继续按钮' }); break; }
      b.click(); continue;
    }
    const ph = g.phase;
    // 偶遇/随机事件与关键事件的结算都内联在文本区(2026-10-14 起关键事件不再弹浮层),
    // choose() 把引擎相位停在 settle。内联成功路径已在文本区挂「继 续」按钮
    // (.stage__main .btn--primary),点它推进;属性胶囊封在小节题签(.chgrow__v)。
    // 顶部 overlay 分支只剩词条/历史修正浮层。
    if (ph === 'settle') {
      const b0 = q('.stage__main .btn--primary');
      push({ at: i, evt: 'inline-settle', phase: ph, dev: g.dev,
        changes: qa('.stage__main .chgrow__v').map(n => n.textContent.trim()),
        btn: b0 ? { text: b0.textContent,
          sec: (b0.closest('.sec') && b0.closest('.sec').querySelector('.sec__head') || {}).textContent || null,
          collapsed: !!(b0.closest('.sec') && b0.closest('.sec').classList.contains('is-collapsed')) } : null });
      if (b0) { b0.click(); continue; }
      g.proceed(); continue;    }
    if (ph === 'intro') {
      const ch = g.chapter();
      push({ at: i, evt: 'intro', idx: g.chapterIdx, title: ch.title,
             paras: qa('.stage__main .prose').length, notes: qa('.intro-note').length,
             gloss: qa('.gloss').length, cast: qa('.castChip').length,
             focus: (q('.portrait__name') || {}).textContent || '' });
      // 本章的 0-1/R-2 等事件未必带 ⟦NPC⟧ 标记(实测 cast 只有主角),castswitch
      // 不能只挂在事件相位赌发牌——第二章章首稳定有 3 个圆像(荀卿等),在 PASS
      // 之前顺手验掉:点一个与当前焦点不同的圆像,名签应跟着换。
      if (!window.__castSwitched) {
        const cur = (q('.portrait__name') || {}).textContent || '';
        const chip = qa('.castChip').find(c => c.title && !cur.includes(c.title));
        if (chip) {
          window.__castSwitched = true;
          chip.click(); await sleep(2);
          // 名签带「— 名 —」短横装饰,断言用 includes 而不是全等
          push({ evt: 'castswitch', to: chip.title,
                 now: (q('.portrait__name') || {}).textContent || '' });
        }
      }
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
      const b = q('.stage__main .sec:not(.is-collapsed) .btn--primary') || q('.stage__foot .btn--primary');
      if (b) b.click(); continue;
    }
    if (ph === 'round') {
      // 行动/蓄势/抉择卡内联结算后,引擎相位已回 round,但 UI 还在等文本区的
      // 一次性「继 续」(2026-10-14 起不再弹浮层)。先点它再读手牌。
      const cont = q('.stage__main .btn--primary');
      if (cont) {
        const sec = cont.closest('.sec');
        const secTitle = (sec && sec.querySelector('.sec__head') || {}).textContent || null;
        // 题签卡名必须与刚打出的牌一致(曾把 playCard 后的新 offer 当卡名来源,题文错位)
        push({ at: i, evt: 'card-settle',
          sec: secTitle,
          picked: lastCard,
          nameMatch: lastCard ? !!(secTitle && secTitle.includes(lastCard)) : null,
          changes: qa('.stage__main .chgrow__v').map(n => n.textContent.trim()),
          residual: !!(sec && sec.classList.contains('is-collapsed')) });
        lastCard = null;
        cont.click(); continue;
      }
      const cards = qa('.stage__foot .card').filter(c => c.getAttribute('role') === 'button');
      const acts  = qa('.stage__foot .card--action').filter(c => c.getAttribute('role') === 'button');
      const offer = g.getOffer();
      const key = offer.find(e => e.type === 'key') || {};
      push({ at: i, evt: 'round', idx: g.chapterIdx, offer: offer.length,
             key: key.title || null, keyLeft: key.roundsLeft, playable: cards.length });
      // 抉择卡必点:引擎把它追加在 offer 末尾,acts[0] 几乎永远轮不到它
      // (发牌流非确定性,靠「其他卡全锁」撞上它是抽奖)。关键事件卡已挪到文本区
      // 提示条,offer 下标与底部 DOM 不再一一对应——卡片上带 data-offer-idx,
      // 按它定位,不再靠下标对齐。
      const ci = offer.findIndex(e => e.type === 'action' && e.choice);
      const all = qa('.stage__foot .card');
      const pick = (ci >= 0 && all.find(c => c.dataset.offerIdx === String(ci) && c.getAttribute('role') === 'button'))
        || acts[0] || cards[0]
        || q('.stage__main .prompt--key.is-live');   // 行动全锁时关键事件提示条是唯一出路
      if (!pick) {
        // 发牌前有约 0.5s 翻面动画(2026-10-16 拍板:选中牌留到下回合开始前才翻),
        // 旧牌还占着位就等发牌落定,不算卡死
        if (q('.stage__foot .card.is-flipped')) { await sleep(30); continue; }
        push({ evt: 'STUCK: round 无可点牌' }); break;
      }
      // 记下打出的卡名(去掉险招的 ⚠ 后缀),下一拍 card-settle 要核对题签
      lastCard = pick.classList.contains('card')
        ? ((pick.querySelector('.card__title') || {}).textContent || '').replace(/\s*⚠$/, '').trim()
        : null;
      pick.click(); continue;
    }
    if (ph === 'event') {
      // 偶遇/随机事件:结算与「继续」内联在文本区,先把它点掉再读选项
      const cont = q('.stage__main .btn--primary');
      if (cont) {
        // 一次性「继 续」应在 pushSec 收起旧节时被摘除;若它出现在已收起的小节里,
        // 就是残留——点它会误触当前相位的 proceed,把整个事件跳掉
        const sec = cont.closest('.sec');
        push({ at: i, evt: 'inline-settle', id: g.eventId,
          btnText: cont.textContent,
          sec: (sec && sec.querySelector('.sec__head') || {}).textContent || null,
          residual: !!(sec && sec.classList.contains('is-collapsed')) });
        cont.click(); continue;
      }
      const opts = g.getOptions();
      const open = qa('.stage__main .card--tappable, .stage__foot .card--tappable');
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
             canClick: open.length, picked: pick, pickedDev: bestDev, cast: qa('.castChip').length,
             focus: (q('.portrait__name') || {}).textContent || '' });
      // 顺手验一次「点圆像切换大立绘焦点」:点一个与当前焦点不同的圆像,
      // 名签应跟着换(李斯局的出场角色都有大立绘,不存在点了开词条的旁路)
      if (!window.__castSwitched) {
        const cur = (q('.portrait__name') || {}).textContent || '';
        const chip = qa('.castChip').find(c => c.title && !cur.includes(c.title));
        if (chip) {
          window.__castSwitched = true;
          chip.click(); await sleep(2);
          // 名签带「— 名 —」短横装饰,断言用 includes 而不是全等
          push({ evt: 'castswitch', to: chip.title,
                 now: (q('.portrait__name') || {}).textContent || '' });
        }
      }
      open[pick].click(); continue;
    }
    if (ph === 'choice') {
      const c = g.getChoiceCard();
      // 序章仅关键事件 options[2] 带 dev(3)——不偏挑则章末归因行永远出不来。
      // getOptions() 只覆盖事件相位,抉择卡直接从卡片数据里挑 dev 最大的选项。
      let ci = 0, bestDev = -1;
      if (c) c.options.forEach((o, j) => {
        const dv = (o.eff && o.eff.dev) || 0;
        if (dv > bestDev) { bestDev = dv; ci = j; }
      });
      push({ at: i, evt: 'choice', title: c && c.title, opts: c ? c.options.length : 0,
             pick: ci, pickDev: bestDev,
             devs: c ? c.options.map(o => (o.eff && o.eff.dev) || 0) : [] });
      // 抉择卡选项已内联进文本区(2026-10-16),与际遇/关键事件同口径
      const b = qa('.stage__main .card--tappable, .stage__foot .card--tappable')[ci]; if (b) b.click(); else break;
      continue;
    }
    if (ph === 'summary') {
      push({ at: i, evt: 'summary', idx: g.chapterIdx, dev: g.dev,
             devRows: qa('.devrow').length, attrRows: qa('.stage__main .statrow__cell').length,
             hasNext: qa('.stage__foot .btn--primary').length > 0 });
      const b = q('.stage__foot .btn--primary'); if (b) b.click();
      continue;
    }
    if (ph === 'endEvent') {
      push({ at: i, evt: 'endEvent' });
      // 偶遇/一般事件的选项卡已内联进文本区,不再在底部决策区
      const b = qa('.stage__main .card--tappable, .stage__foot .card--tappable')[0]; if (b) b.click(); continue;
    }
    if (ph === 'correction') {
      push({ at: i, evt: 'correction' });
      const b = q('.overlay .btn--primary'); if (b) b.click(); else g.correctionContinue(); continue;
    }
    push({ at: i, evt: 'OTHER', phase: ph }); break;
  }
  return { trace, badLayout, top: (q('.stage__chap')||{}).textContent,
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
  // choice(抉择卡)也在必现清单里:五本各 12 张、每两轮一张,第一章内必然出现;
  // 不点它,整条「次级关键事件」链路塌了这套总闸也发现不了。
  // 「结算」一项 2026-10-14 起认 inline-settle:关键事件/行动卡结算都内联了,
  // 浮层 settle 只剩历史修正与词条,不再强求每局必现。
  const need = ['intro', 'gloss', 'round', 'inline-settle', 'event', 'choice', 'summary'];
  const errs = consoleErrors();
  const stuck = out.trace.filter((t) => String(t.evt).startsWith('STUCK'));
  const summaries = out.trace.filter((t) => t.evt === 'summary');

  const ok = report('P2 主链路', [
    ['覆盖 intro/词条/回合/结算/事件/抉择/章末', need.every((k) => kinds.has(k))],
    // 属性增减既可来自浮层(历史修正),也可来自内联题签胶囊(关键/际遇/经营/抉择结算)
    ['属性增减出现', out.trace.some((t) => (t.evt === 'settle' || t.evt === 'inline-settle' || t.evt === 'card-settle') && t.changes && t.changes.length > 0)],
    ['章末结算页出现', summaries.length > 0],
    ['章末列出本章境遇差值', summaries.some((t) => t.attrRows > 0)],
    ['偏离归因行出现', summaries.some((t) => t.devRows > 0)],
    ['章末提供进入下一章', summaries.some((t) => t.hasNext)],
    ['进入第二章', kinds.has('PASS')],
    ['无卡死', stuck.length === 0],
    // 一次性「继 续」必须在 pushSec 收起旧节时被摘除;event 相位在已收起小节里
    // 摸到它,就是残留——点它会误触 proceed 把整个事件跳掉(2026-10-14 间歇 FAIL 根因)
    ['无残留一次性按钮', !out.trace.some((t) => t.residual)],
    // 经营/抉择小节的题签卡名必须就是刚打出的那张牌(2026-10-14 题文错位回归)
    ['经营题签与所打卡一致', !out.trace.some((t) => t.evt === 'card-settle' && t.nameMatch === false)],
    ['版式不变量(main 只挂 castbox/prose-body)', out.badLayout.length === 0],
    // 立绘排按 ⟦NPC⟧ 标记生成,李斯一整局有 8+ 个带立绘的 NPC;
    // 整章都一张不出,说明 ⟦词条⟧ 解析或 CHAR_IMG 映射断了。
    ['出场立绘排随 ⟦NPC⟧ 标记出现', out.trace.some((t) => (t.cast || 0) > 0)],
    // 2026-10-14:出场角色接管大立绘(无出场角色才显示主角);
    // 圆像排第一个是主角,点圆像切焦点
    ['出场 NPC 接管过大立绘(焦点曾是 NPC)',
      out.trace.some((t) => t.focus && !t.focus.includes('李斯'))],
    ['点圆像切换大立绘焦点',
      out.trace.some((t) => t.evt === 'castswitch' && t.now.includes(t.to) && t.to.length > 0)],
    ['控制台无错误', errs.length === 0],
  ]);
  if (!ok) {
    console.log('\n失败明细:');
    if (stuck.length) console.log('  卡死 ' + JSON.stringify(stuck));
    if (out.badLayout.length) console.log('  版式越界 ' + JSON.stringify(out.badLayout.slice(0, 4)));
    if (errs.length) errs.forEach((e) => console.log('  错误 ' + e));
  }
  return ok;
})
  .then((ok) => process.exit(ok ? 0 : 1))
  .catch((e) => {
    console.error('[失败]', e.message);
    process.exit(1);
  });
