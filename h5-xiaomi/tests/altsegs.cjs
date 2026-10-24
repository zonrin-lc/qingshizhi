/**
 * 节点异变文案(altSegs)渲染验收。
 *
 * 为什么单独一套:五本数据共 20 处 altSegs —— 章首 mutations 按条件置 flag 后,
 * 该事件应换一套叙述。封存 Lua(game.lua:374)与旧 JS UI(ui-event.js:35)都按 flag 切换,
 * H5 移植时只读 ev.segs,变体永不显示。
 *
 * 数据侧的 test-sim.js:847 只断言「字段存在、flag 对得上」,盯不到渲染 ——
 * 所以引擎数据全绿、玩家看到的却始终是基础版。这里直接断言 DOM 文本。
 */
'use strict';

const { withPage, report } = require('./lib/harness.cjs');

const DRIVER = `(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const g = window.__QS__ && window.__QS__.game;
  const s = window.__QS__ && window.__QS__.session;
  if (!g || !s) return { ok: false, why: '对局未挂载' };

  // 当前剧本里第一个带 altSegs 的章节事件(不绑定具体剧本:换默认本也不会假红)
  let target = null;
  (g.d.CHAPTERS || []).forEach((ch, i) => {
    for (const ev of ch.events || []) {
      if (!target && ev.altSegs && ev.altSegs.segs && ev.altSegs.segs.length) target = { ev, i };
    }
  });
  if (!target) return { ok: false, why: '当前剧本无 altSegs 数据' };

  const ev = target.ev;
  const strip = t => t.replace(/[\\u27E6\\u27E7]/g, '');           // 去掉 ⟦⟧ 词条标记
  const norm = t => t.replace(/\\s+/g, '');
  const baseText = norm(strip((ev.segs || []).join('')));
  const altText = norm(strip(ev.altSegs.segs.join('')));

  const render = async (withFlag) => {
    if (withFlag) g.flags[ev.altSegs.flag] = true;
    else delete g.flags[ev.altSegs.flag];
    g.chapterIdx = target.i;
    g.eventId = ev.id;
    g.currentRandom = null;
    g.phase = 'event';
    s.renderEvent();
    s.skipReveal();                 // 立刻亮完,文本已全部在 DOM 里
    await sleep(30);
    // 卷轴会保留历史小节(2026-10-19 拍板),所以只读刚刚追加的最后一节正文
    const bodies = document.querySelectorAll('.prose-body .sec__body');
    const last = bodies[bodies.length - 1];
    return last ? norm(last.textContent) : '';
  };

  const t1 = await render(false);
  const t2 = await render(true);

  return {
    ok: true,
    evId: ev.id,
    flag: ev.altSegs.flag,
    baseHit: t1 === baseText,
    altHit: t2 === altText,
    changed: t1 !== t2,
    sampleBase: t1.slice(0, 26),
    sampleAlt: t2.slice(0, 26),
    baseLen: baseText.length,
    altLen: altText.length,
  };
})()`;

withPage(async ({ evaluate, consoleErrors }) => {
  const out = await evaluate(DRIVER);

  const ok = report('节点异变文案', [
    ['找到带 altSegs 的事件', out.ok === true],
    ['未持 flag:渲染基础叙述', out.baseHit === true],
    ['持 flag:渲染变体叙述', out.altHit === true],
    ['两种状态文本确实不同', out.changed === true],
    ['控制台无错误', consoleErrors().length === 0],
  ]);
  if (!ok) {
    console.log('明细: ' + JSON.stringify(out).slice(0, 600));
    consoleErrors().forEach((e) => console.log('  错误 ' + e));
  }
  return ok;
})
  .then((ok) => process.exit(ok ? 0 : 1))
  .catch((e) => {
    console.error('[失败]', e.message);
    process.exit(1);
  });
