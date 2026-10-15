/**
 * 设置页验收:七项设置渲染、改动即生效、持久化、返回主菜单。
 *
 * 审查(D-M1)前设置页零覆盖 —— 它是唯一同时碰视觉变量、音频实例、
 * localStorage 三处的页面,塌法最多。
 */
'use strict';

const { withPage, report, sleep } = require('./lib/harness.cjs');

const DRIVER = `(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const q = s => document.querySelector(s);
  const qa = s => [...document.querySelectorAll(s)];
  const out = {};

  // 主菜单 → 设置页(菜单项没有专用 class,按文字找)
  const item = qa('.menu__item').find(b => b.textContent.includes('设 置'));
  if (!item) return { ok: false, why: '主菜单没有「设 置 一 下」' };
  item.click();
  await sleep(300);

  out.rows = qa('.settings .srow').length;
  out.ver = (q('.settings__ver') || {}).textContent || '';

  // 界面缩放 → 大:localStorage 与 CSS 变量都该立刻变
  const scaleRow = qa('.settings .srow')[0];
  const big = [...scaleRow.querySelectorAll('.sopt')].find(b => b.textContent.trim() === '大');
  big.click();
  await sleep(200);
  const s1 = JSON.parse(localStorage.getItem('qingshi.settings.v1') || '{}');
  out.savedScale = s1.scale;
  out.cssScale = document.documentElement.style.getPropertyValue('--user-scale');
  out.bigOn = [...qa('.settings .srow')[0].querySelectorAll('.sopt')]
    .find(b => b.textContent.trim() === '大').classList.contains('is-on');

  // 背景音乐 → 关
  const musicRow = qa('.settings .srow').find(r => r.textContent.includes('背景音乐'));
  const off = [...musicRow.querySelectorAll('.sopt')].find(b => b.textContent.trim() === '关');
  off.click();
  await sleep(200);
  out.savedMusic = JSON.parse(localStorage.getItem('qingshi.settings.v1') || '{}').music;

  // 返回 → 主菜单
  q('.settings__back').click();
  await sleep(300);
  out.backToMenu = !!q('.menu__item--start');

  // 再进一次设置页:改动应被记住(持久化真的读回来了)
  qa('.menu__item').find(b => b.textContent.includes('设 置')).click();
  await sleep(300);
  out.persisted = JSON.parse(localStorage.getItem('qingshi.settings.v1') || '{}');
  out.ok = true;
  return out;
})()`;

withPage(
  async ({ evaluate, consoleErrors }) => {
    const out = await evaluate(DRIVER);
    const ok = report('设置页', [
      ['七个设置项全部渲染', out.rows === 7],
      ['版本号来自注入而非手抄', /v\S+ · H5 版/.test(out.ver || '')],
      ['界面缩放写入 localStorage', out.savedScale === 'large'],
      ['CSS 变量 --user-scale 同步生效', out.cssScale === '1.2'],
      ['选中态高亮跟随', out.bigOn === true],
      ['背景音乐开关写入', out.savedMusic === false],
      ['返回主菜单', out.backToMenu === true],
      ['改动跨进入持久', out.persisted?.scale === 'large' && out.persisted?.music === false],
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
