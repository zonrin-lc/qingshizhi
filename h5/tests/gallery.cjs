/**
 * 青史图鉴(结局达成一览)验收。
 *
 * 不真打一整局 —— ending.cjs 已经验过「结局落地写记录」那条链路;
 * 这里直接往 localStorage 播种一份收藏,验图鉴页的渲染口径:
 * 五剧本分节、x/y 进度、已达成的名字/次数/最佳、未达成的只给谜面。
 */
'use strict';

const { withPage, report } = require('./lib/harness.cjs');

const DRIVER = `(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const q = s => document.querySelector(s);
  const qa = s => [...document.querySelectorAll(s)];

  // 播种:李斯 E1 达成 2 回、E4 变体 kuaiji 达成 1 回;其余剧本空白
  localStorage.setItem('qingshi.col.v1.lisi', JSON.stringify({
    gloss: [], ach: [],
    endings: {
      E1: { n: '东市之叹', s: '循史', c: 2, b: 55, g: 'B' },
      'E4:kuaiji': { n: '会稽老丈', s: '稳健', c: 1, b: 61, g: 'A' },
    },
  }));

  // 菜单首屏有入场动画,负载高时 settle 完了项还没挂上;等它出现再点
  let item = null;
  for (let i = 0; i < 50; i++) {
    item = qa('.menu__item').find(b => b.textContent.includes('图 鉴'));
    if (item) break;
    await sleep(100);
  }
  if (!item) return { ok: false, why: '主菜单没有「青 史 图 鉴」' };
  item.click();

  // 五个剧本分片异步加载,等最慢的那个落地
  let secs = [];
  for (let i = 0; i < 100; i++) {
    await sleep(100);
    secs = qa('.galsec');
    if (secs.length === 5 && secs.every(s => s.querySelector('.galsec__entries'))) break;
  }
  if (secs.length !== 5 || !secs.every(s => s.querySelector('.galsec__entries'))) {
    return { ok: false, why: '分节没加载完', secs: secs.length };
  }

  const secText = i => secs[i].textContent;
  const lisi = secs[0];
  const lisiProg = lisi.querySelector('.galsec__prog').textContent;
  const lisiEntries = [...lisi.querySelectorAll('.galent')];
  const e1 = lisiEntries.find(r => r.dataset.ending === 'E1');
  const kv = lisiEntries.find(r => r.dataset.ending === 'E4:kuaiji');
  const unknowns = lisiEntries.filter(r => r.classList.contains('is-unknown'));

  const out = {
    ok: true,
    lisiProg,
    entryCount: lisiEntries.length,
    e1Text: e1 ? e1.textContent : null,
    kvText: kv ? kv.textContent : null,
    kvIsVariant: kv ? kv.classList.contains('galent--variant') : null,
    unknownCount: unknowns.length,
    unknownLeak: unknowns.some(r => /东市|兰陵|上蔡东门|沙丘|扶苏|权倾|狱中/.test(r.textContent)),
    otherProgs: [1, 2, 3, 4].map(secText).map(t => (t.match(/结局 \\d+\\/\\d+/) || [''])[0]),
  };

  // 返回主菜单(页内这颗;壳上对局返回钮同 class,不能裸 q('.pageback'))
  q('.gallery .pageback').click();
  await sleep(300);
  out.menuBack = !!q('.menu__item--start');
  return out;
})()`;

withPage(async ({ evaluate, consoleErrors }) => {
  const out = await evaluate(DRIVER);
  if (!out.ok) {
    console.log('驱动失败: ' + JSON.stringify(out));
  }

  const ok = report('青史图鉴', [
    ['图鉴页打开且五剧本分节齐全', out.ok === true],
    ['李斯进度 结局 2/20', out.lisiProg === '结局 2/20'],
    ['李斯条目 20 条(本体+变体)', out.entryCount === 20],
    ['已达成条目显示名字与次数', !!out.e1Text && out.e1Text.includes('东市之叹') && out.e1Text.includes('达成 2 回') && out.e1Text.includes('55') && out.e1Text.includes('B')],
    ['变体条目带从属缩进与自身名字', out.kvIsVariant === true && !!out.kvText && out.kvText.includes('会稽老丈')],
    ['未达成条目只留谜面(18 条,不泄露名字)', out.unknownCount === 18 && out.unknownLeak === false],
    ['其余剧本进度 0/x', (out.otherProgs ?? []).every((t) => /^结局 0\/(1[458]|20)$/.test(t))],
    ['返回回到主菜单', out.menuBack === true],
    ['控制台无错误', consoleErrors().length === 0],
  ]);
  if (!ok) {
    console.log('明细: ' + JSON.stringify(out).slice(0, 800));
    consoleErrors().forEach((e) => console.log('  错误 ' + e));
  }
  return ok;
}, { enter: false })
  .then((ok) => process.exit(ok ? 0 : 1))
  .catch((e) => {
    console.error('[失败]', e.message);
    process.exit(1);
  });
