/**
 * 青史图鉴(结局达成一览)验收。
 *
 * 不真打一整局 —— ending.cjs 已经验过「结局落地写记录」那条链路;
 * 这里直接往 localStorage 播种一份收藏,验图鉴页的渲染口径:
 * 立绘卡 + 缩略图切换剧本、x/y 进度、已达成的名字/简介/次数/评级(含旧档字母迁移)、
 * 未达成的只给谜面、已达成卡点开结算详情浮层。
 */
'use strict';

const { withPage, report } = require('./lib/harness.cjs');

const DRIVER = `(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const q = s => document.querySelector(s);
  const qa = s => [...document.querySelectorAll(s)];

  // 播种:李斯 E1 达成 2 回(乙)、E4 变体 kuaiji 1 回(甲下)、E6 1 回(甲上),
  // E2 1 回但评级是旧档字母 B —— 读入时应迁移显示为「乙下」;其余剧本空白
  localStorage.setItem('qingshi.col.v1.lisi', JSON.stringify({
    gloss: [], ach: [],
    endings: {
      E1: { n: '东市之叹', s: '循史', c: 2, b: 55, g: '乙' },
      E2: { n: '兰陵归鼠', s: '苟活', c: 1, b: 48, g: 'B' },
      'E4:kuaiji': { n: '会稽老丈', s: '稳健', c: 1, b: 61, g: '甲下' },
      E6: { n: '扶苏新政', s: '逆天', c: 1, b: 97, g: '甲上' },
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

  // 五剧本异步加载:等缩略图计数全部落地 + 默认选中本(李斯)的条目铺完
  let ready = false;
  for (let i = 0; i < 100; i++) {
    await sleep(100);
    const cnts = qa('.saves__thumbs .stab__cnt');
    ready = cnts.length === 5 && cnts.every(c => c.textContent.includes('结局'))
      && qa('.galsec .galent').length === 20;
    if (ready) break;
  }
  if (!ready) return { ok: false, why: '数据没加载完', secs: qa('.galsec').length };

  const thumbs = qa('.saves__thumbs .stab');
  const secText = () => (q('.galsec') ? q('.galsec').textContent : '');
  const progText = () => { const p = q('.galsec__prog'); return p ? p.textContent : null; };
  const portraitName = () => {
    const n = q('.gallery__portrait .saves__name');
    return n ? n.textContent : null;
  };

  const lisiEntries = qa('.galsec .galent');
  const e1 = lisiEntries.find(r => r.dataset.ending === 'E1');
  const e2 = lisiEntries.find(r => r.dataset.ending === 'E2');
  const kv = lisiEntries.find(r => r.dataset.ending === 'E4:kuaiji');
  const unknowns = lisiEntries.filter(r => r.classList.contains('is-unknown'));

  // 已达成卡点开结算详情浮层,收起后消失;未达成卡点了不应有反应
  const detail = { opened: false, hasName: false, hasStat: false, hasZhuan: false, closed: false, unkQuiet: false };
  if (e1) {
    e1.click();
    await sleep(150);
    const ov = q('.gallery .overlay');
    const box = q('.gallery .galdetail');
    detail.opened = !!(ov && !ov.hidden && box);
    detail.hasName = !!box && box.textContent.includes('东市之叹');
    // 2026-10-20 拍板:详情浮层达成行改版为「累计达成N回」(落在太史公曰后,无空格)
    detail.hasStat = !!box && box.textContent.includes('乙') && box.textContent.includes('55') && box.textContent.includes('累计达成2回');
    detail.hasZhuan = !!box && box.textContent.includes('太史公曰');
    const closeBtn = box ? [...box.querySelectorAll('.btn')].find(b => b.textContent.includes('收')) : null;
    if (closeBtn) closeBtn.click();
    await sleep(150);
    detail.closed = !!(ov && ov.hidden);
    const unk = unknowns[0];
    if (unk) unk.click();
    await sleep(120);
    detail.unkQuiet = !!(ov && ov.hidden);
  }

  // 切到荆轲(缩略图第 2 枚):右栏换成分节 0/18,立绘换名签
  const sw = { count: thumbs.length, jkProg: null, jkEntries: null, jkPortrait: null, back: null };
  if (thumbs[1]) {
    thumbs[1].click();
    await sleep(250);
    sw.jkProg = progText();
    sw.jkEntries = qa('.galsec .galent').length;
    sw.jkPortrait = portraitName();
    thumbs[0].click();
    await sleep(250);
    sw.back = progText();
  }

  const out = {
    ok: true,
    lisiProg: progText(),
    portraitName: portraitName(),
    entryCount: lisiEntries.length,
    e1Text: e1 ? e1.textContent : null,
    e2Text: e2 ? e2.textContent : null,
    kvText: kv ? kv.textContent : null,
    kvIsVariant: kv ? kv.classList.contains('galent--variant') : null,
    unknownCount: unknowns.length,
    unknownLeak: unknowns.some(r => /东市|兰陵|上蔡东门|沙丘|扶苏|权倾|狱中/.test(r.textContent)),
    ovText: (q('.gallery__aggr') || {}).textContent || '',
    detail,
    sw,
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
    ['图鉴页打开,立绘卡默认李斯 + 5 枚缩略图', out.ok === true && out.portraitName === '李 斯' && out.sw?.count === 5],
    ['李斯进度 结局 4/20', out.lisiProg === '结局 4/20'],
    ['李斯条目 20 条(本体+变体)', out.entryCount === 20],
    ['已达成条目显示名字/简介/次数', !!out.e1Text && out.e1Text.includes('东市之叹') && out.e1Text.includes('位极人臣而终受五刑') && out.e1Text.includes('达成 2 回') && out.e1Text.includes('55') && out.e1Text.includes('乙')],
    ['旧档字母评级迁移(B → 乙下)', !!out.e2Text && out.e2Text.includes('兰陵归鼠') && out.e2Text.includes('乙下') && !out.e2Text.includes('B')],
    ['变体条目带 galent--variant 类与自身名字', out.kvIsVariant === true && !!out.kvText && out.kvText.includes('会稽老丈')],
    ['未达成条目只留谜面(16 条,不泄露名字)', out.unknownCount === 16 && out.unknownLeak === false],
    ['聚合条:总览 4 / 82,五印计数正确(图标 + n/m)', out.ovText.includes('4 / 82') && out.ovText.includes('1/8') && out.ovText.includes('1/12') && out.ovText.includes('0/33')],
    ['已达成卡点开结算详情(名/评级/最佳/次数/太史公曰)', out.detail?.opened === true && out.detail?.hasName === true && out.detail?.hasStat === true && out.detail?.hasZhuan === true],
    ['收起后浮层关闭,未达成卡点了不开', out.detail?.closed === true && out.detail?.unkQuiet === true],
    ['切缩略图到荆轲:分节 0/18、18 条目、立绘换名签', out.sw?.jkProg === '结局 0/18' && out.sw?.jkEntries === 18 && out.sw?.jkPortrait === '荆 轲'],
    ['切回李斯进度恢复 4/20', out.sw?.back === '结局 4/20'],
    ['返回回到主菜单', out.menuBack === true],
    ['控制台无错误', consoleErrors().length === 0],
  ]);
  if (!ok) {
    console.log('明细: ' + JSON.stringify(out).slice(0, 900));
    consoleErrors().forEach((e) => console.log('  错误 ' + e));
  }
  return ok;
}, { enter: false })
  .then((ok) => process.exit(ok ? 0 : 1))
  .catch((e) => {
    console.error('[失败]', e.message);
    process.exit(1);
  });
