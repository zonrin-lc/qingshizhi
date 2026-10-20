'use strict';
/**
 * TapTap 云存档对接(game/tapcloud.ts)的验收。
 *
 * 真容器(全局 tap 对象)只在 TapTap 客户端里存在,本测试用
 * Page.addScriptToEvaluateOnNewDocument 在页面脚本前注入一个内存版 mock:
 * 文件系统/云存档列表全是内存表,uploads/downloads/login 计数留在
 * window.__TAPLOG__ 供断言。mock 忠实复刻官方语义:存档名不带汉字、
 * create/update 返回 {uuid,fileId}、getArchiveData 落本地文件再读。
 *
 * 频控不等真 60s:注入脚本把 __QS_TAP_UPLOAD_INTERVAL__ 压到 2s
 * (tapcloud.ts 的测试挂钩),验证「合并 debounce + 频控窗口」行为。
 *
 * 四组场景:
 * A. 无 mock(普通浏览器):设置页显示「仅本地」,整页无报错 —— 降级不砸页面
 * B. 有 mock:登录 → 存档 → debounce 上传 → 频控内再存只传一次 → 窗口后补传
 * C. 有 mock 且云端预置了更新的存档:启动对账 → 云端整包覆写本地
 * D. 有 mock:退出游戏 → 容器收到 exitMiniProgram 请求,落幕页兜底、「再执笔」回菜单
 * E. 有 mock:设置页手动「上 传」「下 载」两个操作(上传真传一次、下载覆盖本地)
 */
const { withPage, report, sleep, STEP_SNIPPET } = require('./lib/harness.cjs');

const UPLOAD_MS = 2000; // 与注入脚本里的 __QS_TAP_UPLOAD_INTERVAL__ 一致

/** 内存版 TapTap 容器 mock;seed 为预置云存档(JSON 字符串),C 组用 */
function mockTap(seed) {
  return `
window.__QS_TAP_UPLOAD_INTERVAL__ = ${UPLOAD_MS};
(() => {
  const archives = [];
  const files = {};
  const log = { login: 0, uploads: [], downloads: 0, exits: 0 };
  window.__TAPLOG__ = log;
  // 云端内容后门:断言「传上去的包是什么」用,业务代码不碰它
  window.__TAPDUMP__ = () => archives.map((a) => ({ name: a.name, data: a._data, modifiedTime: a.modifiedTime }));
  ${seed ? `archives.push(${seed});` : ''}
  window.tap = {
    env: { USER_DATA_PATH: 'tapfile://usr' },
    login(o) { log.login += 1; if (o && o.success) o.success({ code: 'mock-code' }); },
    checkSession(o) { if (o && o.success) o.success({}); },
    exitMiniProgram(o) { log.exits += 1; if (o && o.success) o.success({}); },
    getFileSystemManager() {
      return {
        writeFile(o) { files[o.filePath] = String(o.data); o.success({}); },
        readFile(o) {
          if (o.filePath in files) o.success({ data: files[o.filePath] });
          else o.fail({ errMsg: 'file not exists' });
        },
      };
    },
    getCloudSaveManager() {
      const pub = (a) => ({
        uuid: a.uuid, fileId: a.fileId, name: a.name, summary: a.summary,
        extra: a.extra || '', playtime: 0, saveSize: (a._data || '').length,
        coverSize: 0, createdTime: a.createdTime, modifiedTime: a.modifiedTime,
      });
      return {
        getArchiveList(o) { o.success({ saves: archives.map(pub) }); },
        createArchive(o) {
          const now = Math.floor(Date.now() / 1000);
          const a = {
            uuid: 'uuid-' + (archives.length + 1), fileId: 'f' + now,
            name: o.archiveMetaData.name, summary: o.archiveMetaData.summary,
            extra: o.archiveMetaData.extra || '', createdTime: now, modifiedTime: now,
            _data: files[o.archiveFilePath],
          };
          archives.push(a);
          log.uploads.push({ type: 'create', name: a.name });
          o.success({ uuid: a.uuid, fileId: a.fileId });
        },
        updateArchive(o) {
          const a = archives.find((x) => x.uuid === o.archiveUUID);
          if (!a) { o.fail({ errMsg: 'archive not found', errno: 400002 }); return; }
          a._data = files[o.archiveFilePath];
          a.fileId = 'f' + Math.floor(Date.now() / 1000);
          a.modifiedTime = Math.floor(Date.now() / 1000);
          log.uploads.push({ type: 'update', name: a.name });
          o.success({ uuid: a.uuid, fileId: a.fileId });
        },
        getArchiveData(o) {
          const a = archives.find((x) => x.uuid === o.archiveUUID);
          if (!a) { o.fail({ errMsg: 'archive not found', errno: 400002 }); return; }
          const p = o.targetFilePath || ('tapfile://tmp/' + a.uuid);
          files[p] = a._data;
          log.downloads += 1;
          o.success({ filePath: p });
        },
        deleteArchive(o) {
          const i = archives.findIndex((x) => x.uuid === o.archiveUUID);
          if (i < 0) { o.fail({ errMsg: 'archive not found', errno: 400002 }); return; }
          archives.splice(i, 1);
          o.success({});
        },
      };
    },
  };
})();
`;
}

/** 设置页入口:主菜单第 4 项「设 置 一 下」(没有专用类名,按文字找) */
const OPEN_SETTINGS = `(() => {
  const b = [...document.querySelectorAll('.menu__item')]
    .find((x) => (x.textContent || '').includes('设 置'));
  if (b) b.click();
  return !!b;
})()`;

/** 把对局推进到有章首快照(phase 离开 intro)再存档,对齐 save.cjs 的驱动方式 */
const DRIVE_AND_SAVE = `(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const g = window.__QS__.game;
${STEP_SNIPPET}
  for (let i = 0; i < 200 && g.phase === 'intro'; i += 1) { advanceOnce(); await sleep(8); }
  const r = window.__QS__.saveGame();
  return { ok: r.ok, phase: g.phase };
})()`;

async function runA() {
  const checks = [];
  const okAll = await withPage(async ({ evaluate, consoleErrors }) => {
    await sleep(600);
    checks.push(['设置页能打开', await evaluate(OPEN_SETTINGS)]);
    await sleep(400);
    const row = await evaluate(`(() => {
      const r = document.querySelector('.srow--tap');
      const acts = document.querySelector('.tapsync__acts');
      return r ? { text: r.textContent || '', actsHidden: acts ? acts.hidden : null } : null;
    })()`);
    checks.push(['非容器:同步行显示「仅本地」', !!row && row.text.includes('仅在 TapTap')]);
    checks.push(['非容器:上传/下载按钮隐藏', !!row && row.actsHidden === true]);

    // 退出游戏:无容器时 window.close 被浏览器拒(只有 warning,不算错误),落幕页兜底。
    // 先在 .settings 里圈返回钮回主菜单(壳层有同名 .pageback 没挂回调,裸选会点错)
    await evaluate(`(() => { const b = document.querySelector('.settings .pageback'); if (b) b.click(); })()`);
    await sleep(400);
    checks.push(['回到主菜单', await evaluate(`!!document.querySelector('.menu__item--exit')`)]);
    await evaluate(`(() => { const b = document.querySelector('.menu__item--exit'); if (b) b.click(); })()`);
    await sleep(250);
    checks.push(['退出确认框出现', await evaluate(`!!document.querySelector('.menu__confirm')`)]);
    await evaluate(`(() => { const b = document.querySelector('.menu__confirm .menu__cbtn--yes'); if (b) b.click(); })()`);
    await sleep(300);
    checks.push(['环境拒绝退出时落幕页兜底', await evaluate(`!!document.querySelector('.menu__farewell')`)]);

    const errs = consoleErrors();
    checks.push(['控制台无错误', errs.length === 0, errs.join(' / ')]);
    return true;
  }, { enter: false });
  return report('A. 普通浏览器降级', checks.map((c) => [c[2] ? `${c[0]}  << ${c[2]}` : c[0], c[1]])) && okAll;
}

async function runB() {
  const checks = [];
  const add = (name, ok, why) => checks.push([ok || !why ? name : `${name}  << ${why}`, !!ok]);
  let bundleJson = null;
  await withPage(async ({ evaluate, consoleErrors, enterGame }) => {
    await sleep(800);
    const log0 = await evaluate('window.__TAPLOG__');
    add('启动即静默登录(tap.login 调了一次)', log0.login === 1, `login=${log0.login}`);
    add('无本地档不上传', log0.uploads.length === 0, `uploads=${log0.uploads.length}`);

    add('设置页:容器内显示「已连接 TapTap」', await evaluate(`(() => {
      ${'' /* 回主菜单再进设置 */}
      const b = [...document.querySelectorAll('.menu__item')]
        .find((x) => (x.textContent || '').includes('设 置'));
      if (!b) return false;
      b.click();
      return true;
    })()`));
    await sleep(400);
    const st = await evaluate(`(document.querySelector('.srow--tap') || {}).textContent || ''`);
    add('状态行文案是已连接/已同步', /已连接 TapTap|已同步/.test(st), st);

    // 回主菜单(返回钮必须圈在 .settings 里选:壳层有颗同名 .pageback 隐藏但没挂回调,
    // 裸 querySelector 会点到壳层那颗,点了没反应 —— settings.cjs 里记过这个坑)
    await evaluate(`(() => {
      const bb = document.querySelector('.settings .pageback');
      if (bb) bb.click();
    })()`);
    await sleep(400);
    add('已回主菜单', await evaluate(`!!document.querySelector('.menu__item--start')`));
    await enterGame();
    await sleep(600);

    const s1 = await evaluate(DRIVE_AND_SAVE);
    add('打出一条本地自动档', s1.ok === true, JSON.stringify(s1));

    // debounce 1.5s + 频控窗口 2s → 2s 后应有一次 create
    await sleep(UPLOAD_MS + 700);
    const log1 = await evaluate('window.__TAPLOG__');
    add('存档后合并上传一次(create)', log1.uploads.length === 1 && log1.uploads[0].type === 'create',
      JSON.stringify(log1.uploads));

    // 云端内容校验(mock 后门 __TAPDUMP__):存档名合法 + 包里带着刚才那条自动档
    const dump1 = await evaluate('window.__TAPDUMP__()');
    add('云端只有一个存档且命名合法', dump1.length === 1 && dump1[0].name === 'qingshi_saves_v1',
      JSON.stringify(dump1.map((d) => d.name)));
    const pack1 = JSON.parse(dump1[0].data);
    const buckets1 = pack1.saves && pack1.saves.autos ? Object.keys(pack1.saves.autos) : [];
    add('云端包里有刚才那条自动档', buckets1.length > 0, JSON.stringify(buckets1));

    // 频控窗口内再存:不应立刻有第二次上传
    const s2 = await evaluate('window.__QS__.saveGame()');
    add('频控窗口内第二次存档成功(本地)', s2.ok === true);
    await sleep(600);
    const log2 = await evaluate('window.__TAPLOG__');
    add('频控窗口内不重复上传', log2.uploads.length === 1, `uploads=${log2.uploads.length}`);
    // 等过频控窗口:调度器补传(update)
    await sleep(UPLOAD_MS + 800);
    const log3 = await evaluate('window.__TAPLOG__');
    add('窗口过后补传一次(update)', log3.uploads.length === 2 && log3.uploads[1].type === 'update',
      JSON.stringify(log3.uploads));

    // 捞云端整包(最后一次 update 的内容),给 C 组当种子
    const dump2 = await evaluate('window.__TAPDUMP__()');
    bundleJson = dump2.length ? dump2[dump2.length - 1].data : null;
    add('拿到云端整包(供 C 组播种)', !!bundleJson);

    const errs = consoleErrors();
    add('控制台无错误', errs.length === 0, errs.join(' / '));
  }, { enter: false, inject: mockTap(null) });
  return { ok: report('B. 容器内:登录 + 上传 + 频控', checks), bundleJson };
}

async function runC(bundleJson) {
  const checks = [];
  const add = (name, ok, why) => checks.push([ok || !why ? name : `${name}  << ${why}`, !!ok]);
  // 播种:云端有一份「更晚」的存档(modifiedTime 未来 5 分钟,秒级)
  const seed = `{
    uuid: 'uuid-seed', fileId: 'fseed', name: 'qingshi_saves_v1',
    summary: 'seed', extra: '', createdTime: ${Math.floor(Date.now() / 1000)},
    modifiedTime: ${Math.floor(Date.now() / 1000) + 300},
    _data: ${JSON.stringify(bundleJson)}
  }`;
  await withPage(async ({ evaluate, consoleErrors }) => {
    await sleep(1200); // 等登录 + 对账跑完
    const log = await evaluate('window.__TAPLOG__');
    add('对账触发了下载', log.downloads === 1, `downloads=${log.downloads}`);
    const autos = await evaluate(`JSON.parse(localStorage.getItem('qingshi.autos.v1') || '{}')`);
    add('云端自动档覆写到本地', Object.keys(autos).length > 0, JSON.stringify(Object.keys(autos)));
    const backup = await evaluate(`localStorage.getItem('qingshi.cloudbackup.v1')`);
    add('覆写前留了本地备份', backup !== null);
    const meta = await evaluate(`JSON.parse(localStorage.getItem('qingshi.tapsync.v1') || '{}')`);
    add('覆写后不回传(lastChange 对齐云端)', (meta.lastChange || 0) > 0 && !(meta.lastChange > meta.lastUpload));
    const menu = await evaluate(`(() => {
      const b = document.querySelector('.menu__item--continue');
      return b ? !b.classList.contains('is-off') : null;
    })()`);
    add('主菜单「继续旅程」已点亮', menu === true);
    const errs = consoleErrors();
    add('控制台无错误', errs.length === 0, errs.join(' / '));
  }, { enter: false, inject: mockTap(seed) });
  return report('C. 容器内:云端新 → 覆写本地', checks);
}

/** D 组:容器内的真退出 —— exitMiniProgram 被调到,落幕页兜底 UI 照常,再执笔可回 */
async function runD() {
  const checks = [];
  const add = (name, ok, why) => checks.push([ok || !why ? name : `${name}  << ${why}`, !!ok]);
  await withPage(async ({ evaluate, consoleErrors }) => {
    await sleep(800);
    await evaluate(`(() => { const b = document.querySelector('.menu__item--exit'); if (b) b.click(); })()`);
    await sleep(250);
    add('退出确认框出现', await evaluate(`!!document.querySelector('.menu__confirm')`));
    await evaluate(`(() => { const b = document.querySelector('.menu__confirm .menu__cbtn--yes'); if (b) b.click(); })()`);
    await sleep(300);
    const log = await evaluate('window.__TAPLOG__');
    add('容器收到退出请求(exitMiniProgram 一次)', log.exits === 1, `exits=${log.exits}`);
    // mock 不会真杀进程:落幕页作为「环境拒绝时的兜底」必须照样出现
    add('落幕页兜底出现', await evaluate(`!!document.querySelector('.menu__farewell')`));
    await evaluate(`(() => { const b = document.querySelector('.menu__farewell .menu__cbtn--yes'); if (b) b.click(); })()`);
    await sleep(300);
    add('「再执笔」收起落幕页', await evaluate(`!document.querySelector('.menu__farewell')`));
    const errs = consoleErrors();
    add('控制台无错误', errs.length === 0, errs.join(' / '));
  }, { enter: false, inject: mockTap(null) });
  return report('D. 容器内:真退出请求', checks);
}

/**
 * E 组:手动上传/下载(2026-10-21 用户拍板:移动端要能自己上传、下载)
 * - 设置页两枚按钮都在;
 * - 「上 传」:有改动时真的传一次,没改动时如实说「无需上传」;
 * - 「下 载」:先出二次确认浮层,确认后云端整包覆盖本地(本地旧档留备份)。
 */
async function runE() {
  const checks = [];
  const add = (name, ok, why) => checks.push([ok || !why ? name : `${name}  << ${why}`, !!ok]);
  await withPage(async ({ evaluate, consoleErrors, enterGame }) => {
    const toastText = () => evaluate(`(() => { const t = document.querySelector('.toast'); return t ? (t.textContent || '') : ''; })()`);
    await sleep(800);
    await enterGame();
    await sleep(600);
    const s1 = await evaluate(DRIVE_AND_SAVE);
    add('打出一条本地自动档(上传的料)', s1.ok === true, JSON.stringify(s1));

    // 回主菜单(设置页挂在主菜单上,对局里没有)
    await evaluate(`(() => { window.__QS__.goMenu(); return true; })()`);
    await sleep(500);

    // 等调度器自动传完第一轮(云端此刻有这份档)
    await sleep(UPLOAD_MS + 800);
    const log1 = await evaluate('window.__TAPLOG__');
    add('调度器已传过一次', log1.uploads.length === 1, JSON.stringify(log1.uploads));

    // 进设置页
    await evaluate(`(() => {
      const b = [...document.querySelectorAll('.menu__item')].find((x) => (x.textContent || '').includes('设 置'));
      if (b) b.click();
      return !!b;
    })()`);
    await sleep(500);
    const acts = await evaluate(`(() => {
      const bs = [...document.querySelectorAll('.tapsync__btn')].map((b) => (b.textContent || '').trim());
      return { n: bs.length, labels: bs };
    })()`);
    add('设置页有上/下两枚按钮', acts.n === 2, JSON.stringify(acts));
    add('按钮文案是 上传/下载', acts.labels.join('/') === '上 传/下 载', JSON.stringify(acts.labels));

    // 没改动时点上传:如实说无需上传,且不再产生上传
    await evaluate(`(() => {
      const b = [...document.querySelectorAll('.tapsync__btn')].find((x) => (x.textContent || '').includes('上 传'));
      if (b) b.click();
      return !!b;
    })()`);
    await sleep(400);
    const t1 = await toastText();
    add('无改动上传:提示无需上传', t1.includes('无需上传'), t1);
    const log2 = await evaluate('window.__TAPLOG__');
    add('无改动上传:云端没多出存档', log2.uploads.length === 1, JSON.stringify(log2.uploads));

    // 攒一次新改动:上一轮自动上传已过频控窗口,此时点上传应当真传一次
    // (别等太久:调度器在改动后 1.5s 自己也会传,那轮就不算手动操作了)
    await evaluate(`(() => { window.__QS__.saveGame(); return true; })()`);
    await sleep(300);
    await evaluate(`(() => {
      const b = [...document.querySelectorAll('.tapsync__btn')].find((x) => (x.textContent || '').includes('上 传'));
      if (b) b.click();
      return !!b;
    })()`);
    await sleep(600);
    const t2 = await toastText();
    add('有改动上传:提示已上传', t2.includes('已上传'), t2);
    const log3 = await evaluate('window.__TAPLOG__');
    add('有改动上传:云端多了一次 update', log3.uploads.length === 2 && log3.uploads[1].type === 'update',
      JSON.stringify(log3.uploads));

    // 本地改动(直接改 localStorage,模拟本机进度与云端分家),再走下载
    await evaluate(`(() => {
      localStorage.setItem('qingshi.autos.v1', JSON.stringify({ lisi: [] }));
      return true;
    })()`);
    await evaluate(`(() => {
      const b = [...document.querySelectorAll('.tapsync__btn')].find((x) => (x.textContent || '').includes('下 载'));
      if (b) b.click();
      return !!b;
    })()`);
    await sleep(300);
    add('下载先出二次确认浮层', await evaluate(`!!document.querySelector('.settings__confirm')`));
    await evaluate(`(() => {
      const b = document.querySelector('.settings__confirm .btn--primary');
      if (b) b.click();
      return !!b;
    })()`);
    await sleep(800);
    const t3 = await toastText();
    add('下载完成:提示已覆盖本地', t3.includes('覆盖本地'), t3);
    const autos = await evaluate(`JSON.parse(localStorage.getItem('qingshi.autos.v1') || '{}')`);
    const nAutos = Object.keys(autos).reduce((n, k) => n + (Array.isArray(autos[k]) ? autos[k].length : 0), 0);
    add('本地被云端整包覆盖(档回来了)', nAutos > 0, JSON.stringify(autos));
    const backup = await evaluate(`localStorage.getItem('qingshi.cloudbackup.v1')`);
    add('覆盖前留了本地备份', backup !== null);

    const errs = consoleErrors();
    add('控制台无错误', errs.length === 0, errs.join(' / '));
  }, { enter: false, inject: mockTap(null) });
  return report('E. 容器内:手动上传/下载', checks);
}

(async () => {
  const a = await runA();
  const b = await runB();
  const c = b.bundleJson ? await runC(b.bundleJson) : (console.log('\n=== C 组跳过:B 没拿到种子 ==='), false);
  const d = await runD();
  const e = await runE();
  const ok = a && b.ok && c && d && e;
  console.log(`\n${ok ? 'ok  ' : 'FAIL'}  tapcloud 总览`);
  process.exit(ok ? 0 : 1);
})();
