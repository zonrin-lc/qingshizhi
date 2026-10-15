/**
 * 硬核难度验收:难度差异此前零覆盖(审查 D-M1)。
 *
 * 硬核的三条契约(save.cjs 头注与 saves.ts 都盯着):
 * 1. 不可存档(exportSave 返回 null —— 硬核不许回退)
 * 2. 回溯不可用(顶栏回溯按钮压暗,不计次数)
 * 3. 隐藏数值(hideAttrs:属性只显示状态词,不显示数字)
 * 外加:章首写自动档对硬核必须安静跳过(localStorage 不该出现 auto)。
 */
'use strict';

const { withPage, report } = require('./lib/harness.cjs');

const DRIVER = `(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const q = s => document.querySelector(s);
  const qa = s => [...document.querySelectorAll(s)];
  const out = {};

  // 主菜单 → 选择页 → 选「硬核」→ 入局
  q('.menu__item--start').click();
  await sleep(300);
  const caps = qa('.seldiff__cap');
  out.caps = caps.length;
  caps[2].click(); // story / normal / hardcore
  await sleep(150);
  // 选中后胶囊会重画,旧引用已 detach,必须重新查
  out.capOn = qa('.seldiff__cap')[2].classList.contains('is-on');
  q('.selenter').click();
  await sleep(900);

  const g = window.__QS__ && window.__QS__.game;
  if (!g) return { ok: false, why: '入局失败' };
  out.ok = true;
  out.diffKey = g.diffKey;
  out.backLocked = !!q('.backbtn.is-locked');
  out.backText = (q('.backbtn') || {}).textContent || '';
  out.exportNull = g.exportSave() === null;

  // 章首自动档应被安静跳过
  const saves = JSON.parse(localStorage.getItem('qingshi.saves.v1') || '{}');
  out.noAuto = !saves.auto;

  // hideAttrs:右栏属性行显示状态词而不是裸数字
  const kvText = qa('.stage__side .kv').map(n => n.textContent.replace(/\\s+/g, ''));
  out.sideWords = kvText.length > 0 && kvText.every(t => !/\\d/.test(t));
  return out;
})()`;

withPage(
  async ({ evaluate, consoleErrors }) => {
    const out = await evaluate(DRIVER);
    const ok = report('硬核难度', [
      ['三个难度胶囊都在', out.caps === 3],
      ['硬核胶囊可选中', out.capOn === true],
      ['对局以硬核建立', out.diffKey === 'hardcore'],
      ['回溯按钮压暗且不计数', out.backLocked === true && !/\\d/.test(out.backText || '')],
      ['硬核不可存档(exportSave 为 null)', out.exportNull === true],
      ['章首自动档安静跳过', out.noAuto === true],
      ['属性隐藏数值(只显示状态词)', out.sideWords === true],
      ['控制台无错误', consoleErrors().length === 0],
    ]);
    if (!ok) console.log('明细: ' + JSON.stringify(out));
    return ok;
  },
  { enter: false },
)
  .then((ok) => process.exit(ok ? 0 : 1))
  .catch((e) => {
    console.error('[失败]', e.message);
    process.exit(1);
  });
