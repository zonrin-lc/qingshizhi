/* 攻略配图:自动截取《青史志》攻略用的实机图
 *
 * 为什么要有它:攻略里的图是**实机画面**,不是画的。游戏一改(数值、界面、字号),
 * 图就过期了 —— 所以截图脚本必须能重跑,而不是一次性产物。
 *
 * 怎么截的:复用 h5/tests/lib/harness.cjs 的 CDP 测试台 —— 起真实 headless Chrome,
 * 伺服 h5/dist 的真实构建产物,用真点击驱动真 UI,再 Page.captureScreenshot 抓帧。
 * 截完用 ffmpeg 转成 JPG(攻略引用的是 .jpg;PNG 版 21MB → JPG 2.8MB)。
 *
 * 两处"人为"(其余全是点出来的):
 * 1. 容器内设置页:普通浏览器没有 TapTap 容器,注入一个 mock window.tap,
 *    好让「上 传 / 下 载」两枚按钮出现(真机上就是这样)。
 * 2. 结局页:不真打五到七章(要几千步),而是给引擎一份末态(权势/政绩/偏离度/史评/
 *    功业标记),再调引擎自己的 finishEnding() 算分、session.renderEnding() 渲染 ——
 *    评分与界面全是真的,只是那一局的过程是摆出来的。
 *
 * 用法:
 *   cd h5 && npm run build          # 必须先有 dist
 *   node tools/guide-shots.cjs      # 出全套(手机横屏 + 桌面 + 补图)
 *   node tools/guide-shots.cjs --only=ending   # 只重拍某几张
 * 输出:docs/攻略/img/*.jpg
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('node:child_process');
const { withPage, sleep, STEP_SNIPPET } = require('../tests/lib/harness.cjs');

const REPO = path.resolve(__dirname, '../..');
const OUT = path.join(REPO, 'docs', '攻略', 'img');
fs.mkdirSync(OUT, { recursive: true });

const ONLY = (process.argv.find((a) => a.startsWith('--only=')) || '').split('=')[1] || '';
const want = (name) => !ONLY || name.includes(ONLY);

/** TapTap 容器 mock:只为让云存档那两枚按钮露出来 */
const TAP_MOCK = `
window.tap = {
  env: { USER_DATA_PATH: 'tapfile://usr' },
  login(o) { if (o && o.success) o.success({ code: 'x' }); },
  getFileSystemManager() { return { writeFile(o) { o.success({}); }, readFile(o) { o.fail({ errMsg: 'x' }); } }; },
  getCloudSaveManager() { return { getArchiveList(o) { o.success({ saves: [] }); } }; },
};
`;

const CLICK = (sel) => `(() => { const b = document.querySelector('${sel}'); if (b) { b.click(); return true; } return false; })()`;
const CLICK_TEXT = (txt) => `(() => {
  const b = [...document.querySelectorAll('.menu__item')].find((x) => (x.textContent || '').includes('${txt}'));
  if (b && !b.disabled) { b.click(); return true; }
  return false;
})()`;

/** 抓一张:先存 PNG,再转 JPG 并删 PNG(攻略引用 .jpg) */
async function grab(cdp, sessionId, name) {
  const r = await cdp.send('Page.captureScreenshot', { format: 'png' }, sessionId);
  const png = path.join(OUT, `${name}.png`);
  const jpg = path.join(OUT, `${name}.jpg`);
  fs.writeFileSync(png, Buffer.from(r.data, 'base64'));
  // ffmpeg 偶尔会被 PATH 解析/杀软卡一下,重试三次;都不行就留 PNG 并提醒改引用
  for (let i = 0; i < 3; i++) {
    try {
      execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', png, '-q:v', '4', jpg], { stdio: 'pipe' });
      fs.unlinkSync(png);
      console.log('  ✓', name);
      return;
    } catch {
      await new Promise((r2) => setTimeout(r2, 800));
    }
  }
  console.warn(`  ! 没转成 JPG(ffmpeg 失败?): ${name}.png —— 文章里的引用要改成 .png`);
}

/* ---------------- 通用流程:主菜单 → 选择页 → 对局页 ---------------- */
async function basicFlow(label, viewport) {
  await withPage(async ({ evaluate, cdp, sessionId }) => {
    await sleep(1400);
    if (want(`${label}-01-主菜单`)) await grab(cdp, sessionId, `${label}-01-主菜单`);

    await evaluate(CLICK('.menu__item--start'));
    await sleep(900);
    if (want(`${label}-02-选择页`)) await grab(cdp, sessionId, `${label}-02-选择页`);

    await evaluate(CLICK('.selenter'));
    await sleep(1600);
    await evaluate(`(() => { const m = document.querySelector('.stage__main'); if (m) m.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); return true; })()`);
    await sleep(1200);
    if (want(`${label}-03-对局页`)) await grab(cdp, sessionId, `${label}-03-对局页`);

    // 打一张牌,拍结算飞字
    await evaluate(`(() => {
      ${STEP_SNIPPET}
      const c = [...document.querySelectorAll('.stage__foot .card--action')].filter((x) => x.getAttribute('role') === 'button')[0];
      if (c) c.click();
      return !!c;
    })()`);
    await sleep(1400);
    if (want(`${label}-04-结算飞行`)) await grab(cdp, sessionId, `${label}-04-结算飞行`);

    // 点关键事件提示条,拍事件抉择
    await evaluate(`(() => { const k = document.querySelector('.prompt--key.is-live'); if (k) { k.click(); return true; } return false; })()`);
    await sleep(1000);
    if (want(`${label}-05-事件抉择`)) await grab(cdp, sessionId, `${label}-05-事件抉择`);

    // 设置页(普通浏览器:云存档按钮不显示,这一张只有手机版另拍容器内的那张)
    await evaluate(`(() => { if (window.__QS__) { window.__QS__.goMenu(); return true; } return false; })()`);
    await sleep(500);
    await evaluate(CLICK_TEXT('设 置'));
    await sleep(800);
    if (want(`${label}-06-设置与云存档`)) await grab(cdp, sessionId, `${label}-06-设置与云存档`);

    // 存档页
    await evaluate(CLICK('.settings .pageback'));
    await sleep(600);
    await evaluate(CLICK_TEXT('存 档'));
    await sleep(900);
    if (want(`${label}-07-存档页`)) await grab(cdp, sessionId, `${label}-07-存档页`);

    // 图鉴页
    await evaluate(CLICK('.saves .pageback'));
    await sleep(600);
    await evaluate(CLICK_TEXT('图 鉴'));
    await sleep(900);
    if (want(`${label}-08-图鉴`)) await grab(cdp, sessionId, `${label}-08-图鉴`);
  }, { enter: false, viewport });
}

/* ---------------- 容器内的设置页(mock tap,好露出上/下两枚按钮) ---------------- */
async function containerSettings() {
  await withPage(async ({ evaluate, cdp, sessionId }) => {
    await sleep(1400);
    await evaluate(CLICK_TEXT('设 置'));
    await sleep(900);
    if (want('容器内设置页')) await grab(cdp, sessionId, '手机-06b-设置与云存档-容器内');
  }, { enter: false, inject: TAP_MOCK, viewport: [874, 402, 2] });
}

/* ---------------- 险招徽章(单独一局,免得污染章末那张的状态) ----------------
 * ⚠ 徽章出现在**事件选项**上(行动卡的门槛多是财富这类硬门槛,不带徽章)。
 * 带软属性门槛的选项多在第二章之后(如李斯 2-2「权势过重」需文才 ≥55),
 * 所以要先打进去,再把智力型属性压低,选项就会挂上徽章。 */
async function riskyBadge() {
  await withPage(async ({ evaluate, cdp, sessionId }) => {
    await sleep(1400);
    await evaluate(CLICK('.menu__item--start'));
    await sleep(700);
    await evaluate(CLICK('.selenter'));
    await sleep(1500);
    await evaluate(`(() => { const m = document.querySelector('.stage__main'); if (m) m.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); return true; })()`);
    await sleep(800);

    const risky = await evaluate(`(async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const q = (s) => document.querySelector(s), qa = (s) => [...document.querySelectorAll(s)];
      const g = () => window.__QS__.game;
      const s = window.__QS__.session;
      ${STEP_SNIPPET}
      // 直接落到「带软属性门槛」的那个事件(李斯 2-2「权势过重」需文才 ≥55):
      // 走的是事件页真实渲染路径,选项会自己算出成算并挂上 ⚠ 徽章
      const SOFT = ['caixue', 'moulue', 'biancai', 'wuli', 'shengwang', 'junxin', 'quanshi'];
      const chapters = g().d.CHAPTERS;
      let target = null;
      for (let ci = 0; ci < chapters.length && !target; ci++) {
        for (const ev of (chapters[ci].events || [])) {
          const hit = (ev.options || []).find((o) => Object.keys(o.req || {}).some((a) => SOFT.includes(a)));
          if (hit) { target = { ci, evId: ev.id, attr: Object.keys(hit.req).find((a) => SOFT.includes(a)) }; break; }
        }
      }
      if (!target) return { ok: false, why: '数据里没有带软属性门槛的事件' };
      for (const a of SOFT) g().attrs[a] = 1;
      g().chapterIdx = target.ci;
      g().eventId = target.evId;
      g().phase = 'event';
      s.renderEvent();
      await sleep(2200);                       // 选项是「渐显完才挂」
      const bad = qa('.card__risk');
      return { ok: bad.length > 0, n: bad.length, ev: target.evId, attr: target.attr, ch: target.ci };
    })()`);
    console.log('  险招徽章:', JSON.stringify(risky));
    await sleep(300);
    if (want('险招徽章') && risky.ok) await grab(cdp, sessionId, '手机-11-险招徽章');
  }, { enter: false, viewport: [874, 402, 2] });
}

/* ---------------- 章末结算 + 章首暗账(同一局里跑) ---------------- */
async function inGameStates() {
  await withPage(async ({ evaluate, cdp, sessionId }) => {
    await sleep(1400);
    await evaluate(CLICK('.menu__item--start'));
    await sleep(700);
    await evaluate(CLICK('.selenter'));
    await sleep(1500);
    await evaluate(`(() => { const m = document.querySelector('.stage__main'); if (m) m.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); return true; })()`);
    await sleep(800);

    // 打到第二章,拍章首暗账提示(【春秋渐高】【失宠于上】等)
    const ch2 = await evaluate(`(async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const q = (s) => document.querySelector(s), qa = (s) => [...document.querySelectorAll(s)];
      ${STEP_SNIPPET}
      for (let i = 0; i < 1500; i++) {
        const g = window.__QS__.game;
        if (g.chapterIdx >= 1) return { ok: true, ch: g.chapterIdx };
        const ov = q('.overlay');
        if (ov && !ov.hidden) { q('.overlay .btn--primary')?.click(); await sleep(60); continue; }
        if (g.phase === 'round') {
          const c = qa('.stage__foot .card--action').filter((x) => x.getAttribute('role') === 'button')[0];
          if (c) { c.click(); await sleep(200); } else { advanceOnce(); await sleep(50); }
        } else if (g.phase === 'event' || g.phase === 'choice') {
          const c = qa('.stage__main .card--tappable, .stage__foot .card--tappable')[0];
          if (c) { c.click(); await sleep(200); } else { advanceOnce(); await sleep(50); }
        } else { advanceOnce(); await sleep(50); }
      }
      return { ok: false, ch: window.__QS__.game.chapterIdx };
    })()`);
    console.log('  第二章:', JSON.stringify(ch2));
    await evaluate(`(() => { const m = document.querySelector('.stage__main'); if (m) m.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); return true; })()`);
    await sleep(900);
    if (want('章首暗账')) await grab(cdp, sessionId, '手机-10-章首暗账提示');

    // 章末结算:继续把这一章打完(到 summary 相位)
    const sum = await evaluate(`(async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const q = (s) => document.querySelector(s), qa = (s) => [...document.querySelectorAll(s)];
      ${STEP_SNIPPET}
      for (let i = 0; i < 1200; i++) {
        const g = window.__QS__.game;
        if (g.phase === 'summary') return { ok: true };
        const ov = q('.overlay');
        if (ov && !ov.hidden) { q('.overlay .btn--primary')?.click(); await sleep(60); continue; }
        if (g.phase === 'round') {
          const c = qa('.stage__foot .card--action').filter((x) => x.getAttribute('role') === 'button')[0];
          if (c) { c.click(); await sleep(200); } else { advanceOnce(); await sleep(50); }
        } else if (g.phase === 'event' || g.phase === 'choice') {
          const c = qa('.stage__main .card--tappable, .stage__foot .card--tappable')[0];
          if (c) { c.click(); await sleep(200); } else { advanceOnce(); await sleep(50); }
        } else { advanceOnce(); await sleep(50); }
      }
      return { ok: false, phase: window.__QS__.game.phase };
    })()`);
    console.log('  章末:', JSON.stringify(sum));
    await sleep(600);
    if (want('章末结算')) await grab(cdp, sessionId, '手机-09-章末结算');
  }, { enter: false, viewport: [874, 402, 2] });
}

/* ---------------- 结局页(真实引擎结算 + 真实结局界面) ---------------- */
async function endingPages() {
  await withPage(async ({ evaluate, cdp, sessionId }) => {
    await sleep(1400);
    await evaluate(CLICK('.menu__item--start'));
    await sleep(700);
    await evaluate(CLICK('.selenter'));
    await sleep(1600);
    await evaluate(`(() => { const m = document.querySelector('.stage__main'); if (m) m.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); return true; })()`);
    await sleep(700);

    // 逆天局:李斯 E6「扶苏新政」
    console.log('  逆天局:', JSON.stringify(await evaluate(`(() => {
      const g = window.__QS__.game; const s = window.__QS__.session;
      g.attrs.quanshi = 85; g.attrs.zhengji = 60; g.attrs.shengwang = 70; g.attrs.junxin = 55;
      g.attrs.caifu = 60; g.attrs.caixue = 70; g.attrs.moulue = 75; g.attrs.biancai = 70;
      g.attrs.tupo = 60; g.attrs.wuli = 60; g.attrs.weiji = 40;
      g.peak.quanshi = 85; g.peak.junxin = 60;
      g.dev = 80; g.histScore = 60; g.merits = ['丞相'];
      g.ach = ['cangshu', 'yizi']; g.gloss = ['上蔡', '荀子'];
      g.finishEnding('E6'); s.renderEnding();
      return { dev: g.dev, total: g.ending.total, grade: g.ending.grade, seal: g.ending.seal };
    })()`)));
    await sleep(1400);
    if (want('结局页-逆天')) await grab(cdp, sessionId, '手机-12-结局页-逆天');

    // 循史局:李斯 E1「东市之叹」(低偏离、低存续、低评级)
    console.log('  循史局:', JSON.stringify(await evaluate(`(() => {
      const g = window.__QS__.game; const s = window.__QS__.session;
      g.dev = 12; g.histScore = 10; g.merits = [];
      g.attrs.quanshi = 40; g.attrs.zhengji = 20;
      g.finishEnding('E1'); s.renderEnding();
      return { dev: g.dev, total: g.ending.total, grade: g.ending.grade, seal: g.ending.seal };
    })()`)));
    await sleep(1400);
    if (want('结局页-循史')) await grab(cdp, sessionId, '手机-13-结局页-循史');
  }, { enter: false, viewport: [874, 402, 2] });
}

(async () => {
  console.log('出图到', OUT);
  if (want('主菜单') || want('选择页') || want('对局页') || want('结算') || want('事件') || want('设置') || want('存档页') || want('图鉴')) {
    await basicFlow('手机', [874, 402, 2]);
    await basicFlow('桌面', [1440, 810, 1]);
  }
  if (want('容器内设置页')) await containerSettings();
  if (want('险招徽章')) await riskyBadge();
  if (want('章首暗账') || want('章末结算')) await inGameStates();
  if (want('结局页')) await endingPages();
  console.log('完成');
})();
