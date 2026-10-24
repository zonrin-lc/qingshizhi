'use strict';
/**
 * TapTap 云存档:冲突与失败分支。
 *
 * tapcloud.cjs 验的是「顺风局」:mock 全程成功,只走通了「云端更新 → 覆写本地」
 * 一个方向。这套补的是另一头:
 *   A. 本地更新 → 上传覆盖云端(本地是新的,云端该被盖掉)
 *   B. **本地有未上传改动时,启动对账不得用云端旧包覆盖本地**(2026-10-21 修的语义,务必锁住)
 *   C. getArchiveList / createArchive / updateArchive 失败(errno 400002):
 *      本地档**不被清空**、状态提示是「没同步」而不是「已同步」
 *   D. 非法包(saves:{} 或 autos 是数组)不得把玩家本地档清空
 *   E. 上传在飞时又存档:那次改动最终仍会上云(锁住「只回写 lastUpload」的修复)
 *
 * mock 与 tapcloud.cjs 同构,但多了三样东西:
 *   - 失败注入(ctl.failList / failCreate / failUpdate / failData)
 *   - 慢响应(ctl.delayMs):用来造「上传在飞」的窗口
 *   - 预置本地 localStorage:用来造「本地有未上传改动」的脏状态
 */
const { withPage, report, sleep, STEP_SNIPPET } = require('./lib/harness.cjs');

const UPLOAD_MS = 2000; // 与注入脚本里的 __QS_TAP_UPLOAD_INTERVAL__ 一致

/** 深比较(键序无关) */
const canon = (v) => {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  return '{' + Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(',') + '}';
};
const same = (a, b) => canon(a) === canon(b);

/**
 * 内存版 TapTap 容器 mock(带失败注入与慢响应)。
 *
 * @param {object} o
 *   o.seed      预置的云存档对象({uuid,name,extra,modifiedTime,_data})
 *   o.local     预置的 localStorage({key: value})
 *   o.fail*     失败注入
 *   o.delayMs   云端 API 的响应延迟(毫秒)
 */
function mockTap(o = {}) {
  const failList = o.failList ? 'true' : 'false';
  const failCreate = o.failCreate ? 'true' : 'false';
  const failUpdate = o.failUpdate ? 'true' : 'false';
  const failData = o.failData ? 'true' : 'false';
  const delayMs = o.delayMs || 0;
  const local = o.local
    ? Object.entries(o.local)
      .map(([k, v]) => `try { localStorage.setItem(${JSON.stringify(k)}, ${JSON.stringify(v)}); } catch (e) {}`)
      .join('\n  ')
    : '';
  const seed = o.seed ? `archives.push(${JSON.stringify(o.seed)});` : '';
  return `
window.__QS_TAP_UPLOAD_INTERVAL__ = ${UPLOAD_MS};
(() => {
  ${local}
  const archives = [];
  const files = {};
  const log = { login: 0, uploads: [], downloads: 0, exits: 0, inflight: 0, listCalls: 0 };
  const ctl = { failList: ${failList}, failCreate: ${failCreate}, failUpdate: ${failUpdate},
                failData: ${failData}, delayMs: ${delayMs} };
  window.__TAPMOCK__ = {
    log, ctl, archives,
    dump: () => archives.map((a) => ({ name: a.name, data: a._data, extra: a.extra, modifiedTime: a.modifiedTime })),
  };
  ${seed}
  const later = (fn) => (ctl.delayMs > 0 ? setTimeout(fn, ctl.delayMs) : fn());
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
        getArchiveList(o) {
          log.listCalls += 1;
          if (ctl.failList) { o.fail({ errMsg: 'getArchiveList failed', errno: 400002 }); return; }
          o.success({ saves: archives.map(pub) });
        },
        createArchive(o) {
          if (ctl.failCreate) { o.fail({ errMsg: 'createArchive failed', errno: 400002 }); return; }
          log.inflight += 1;
          const now = Math.floor(Date.now() / 1000);
          const a = {
            uuid: 'uuid-' + (archives.length + 1), fileId: 'f' + now,
            name: o.archiveMetaData.name, summary: o.archiveMetaData.summary,
            extra: o.archiveMetaData.extra || '', createdTime: now, modifiedTime: now,
            _data: files[o.archiveFilePath],
          };
          later(() => {
            archives.push(a);
            log.uploads.push({ type: 'create', name: a.name, at: Date.now() });
            log.inflight -= 1;
            o.success({ uuid: a.uuid, fileId: a.fileId });
          });
        },
        updateArchive(o) {
          if (ctl.failUpdate) { o.fail({ errMsg: 'updateArchive failed', errno: 400002 }); return; }
          const a = archives.find((x) => x.uuid === o.archiveUUID);
          if (!a) { o.fail({ errMsg: 'archive not found', errno: 400002 }); return; }
          log.inflight += 1;
          later(() => {
            a._data = files[o.archiveFilePath];
            a.fileId = 'f' + Math.floor(Date.now() / 1000);
            a.modifiedTime = Math.floor(Date.now() / 1000);
            log.uploads.push({ type: 'update', name: a.name, at: Date.now() });
            log.inflight -= 1;
            o.success({ uuid: a.uuid, fileId: a.fileId });
          });
        },
        getArchiveData(o) {
          const a = archives.find((x) => x.uuid === o.archiveUUID);
          if (!a) { o.fail({ errMsg: 'archive not found', errno: 400002 }); return; }
          if (ctl.failData) { o.fail({ errMsg: 'getArchiveData failed', errno: 400002 }); return; }
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

/** 本地那条「可辨认」的档:云端整包覆盖时它必须被备份、覆盖后必须消失 */
function localMarker(at = 1111111111111) {
  return {
    at,
    scenKey: 'lisi', scenName: '李斯', diffKey: 'normal',
    chapterIdx: 0, chapterTitle: '本地标记卷', roundNo: 1, backtracksLeft: 1, age: 30,
    payload: {
      v: 2, diffKey: 'normal', scenKey: 'lisi', chapterIdx: 0,
      marker: 'LOCAL_BACKUP_MARK',
      snapshot: { attrs: { caifu: 11 } }, live: { attrs: { caifu: 11 } },
      backtracksThisChapter: 0,
    },
  };
}

/** 打出一条本地自动档(与 tapcloud.cjs 的 DRIVE_AND_SAVE 同口径) */
const DRIVE_AND_SAVE = `(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const g = window.__QS__.game;
${STEP_SNIPPET}
  for (let i = 0; i < 200 && g.phase === 'intro'; i += 1) { advanceOnce(); await sleep(8); }
  const r = window.__QS__.saveGame();
  return { ok: r.ok, reason: r.reason || '', phase: g.phase };
})()`;

const OPEN_SETTINGS = `(() => {
  const b = [...document.querySelectorAll('.menu__item')].find((x) => (x.textContent || '').includes('设 置'));
  if (b) b.click();
  return !!b;
})()`;
const STATUS_TEXT = `(() => {
  const t = document.querySelector('.tapsync__status');
  return t ? (t.textContent || '') : '';
})()`;
const LOCAL_AUTOS = `(() => {
  try { return JSON.parse(localStorage.getItem('qingshi.autos.v1') || '{}'); } catch (e) { return {}; }
})()`;
const META = `(() => {
  try { return JSON.parse(localStorage.getItem('qingshi.tapsync.v1') || '{}'); } catch (e) { return {}; }
})()`;

/** 等某个条件成立(轮询),别赌固定时长 */
async function until(fn, timeoutMs = 12000, stepMs = 100) {
  const t0 = Date.now();
  let last = null;
  while (Date.now() - t0 < timeoutMs) {
    last = await fn();
    if (last) return last;
    await sleep(stepMs);
  }
  return last;
}

/* ------------------------------------------------------------------ */
/* A. 本地更新 → 上传覆盖云端                                          */
/* ------------------------------------------------------------------ */
async function runA() {
  const checks = [];
  const add = (name, ok, why) => checks.push([ok || !why ? name : `${name}  << ${why}`, !!ok]);
  await withPage(async ({ evaluate, consoleErrors, enterGame }) => {
    await sleep(800);
    await enterGame();
    await sleep(500);
    const s1 = await evaluate(DRIVE_AND_SAVE);
    add('打出一条本地自动档', s1.ok === true, JSON.stringify(s1));

    // 第一轮上传(create)
    const up1 = await until(async () => {
      const l = await evaluate('window.__TAPMOCK__.log');
      return l.uploads.length >= 1 ? l : null;
    });
    add('本地有档 → 云端建了一份存档', !!up1 && up1.uploads[0].type === 'create',
      JSON.stringify(up1 && up1.uploads));

    const dump1 = await evaluate('window.__TAPMOCK__.dump()');
    const pack1 = dump1.length ? JSON.parse(dump1[0].data) : null;
    const cloudSlots1 = pack1 && pack1.saves && pack1.saves.autos ? pack1.saves.autos.lisi || [] : [];
    const local1 = await evaluate(LOCAL_AUTOS);
    const localSlots1 = local1.lisi || [];
    add('云端包里的自动档与本地一致(at/payload)',
      cloudSlots1.length === localSlots1.length && localSlots1.length > 0
      && cloudSlots1.every((s, i) => localSlots1[i] && s.at === localSlots1[i].at && same(s.payload, localSlots1[i].payload)),
      `云端 ${JSON.stringify(cloudSlots1.map((s) => s.at))} 本地 ${JSON.stringify(localSlots1.map((s) => s.at))}`);

    // 再改一次:本地更新 → 云端被覆盖成新的
    const s2 = await evaluate('window.__QS__.saveGame()');
    add('第二次存档成功(本地)', s2.ok === true);
    const up2 = await until(async () => {
      const l = await evaluate('window.__TAPMOCK__.log');
      return l.uploads.length >= 2 ? l : null;
    });
    add('第二次上传是 update(覆盖云端那份)', !!up2 && up2.uploads[1].type === 'update',
      JSON.stringify(up2 && up2.uploads));
    const dump2 = await evaluate('window.__TAPMOCK__.dump()');
    const pack2 = dump2.length ? JSON.parse(dump2[dump2.length - 1].data) : null;
    const cloudSlots2 = pack2 && pack2.saves && pack2.saves.autos ? pack2.saves.autos.lisi || [] : [];
    const local2 = await evaluate(LOCAL_AUTOS);
    const localSlots2 = local2.lisi || [];
    add('云端已被本地最新的一份盖住',
      cloudSlots2.length === localSlots2.length && localSlots2.length >= 2
      && cloudSlots2.every((s, i) => localSlots2[i] && s.at === localSlots2[i].at && same(s.payload, localSlots2[i].payload)),
      `云端 ${JSON.stringify(cloudSlots2.map((s) => s.at))} 本地 ${JSON.stringify(localSlots2.map((s) => s.at))}`);
    const meta = await evaluate(META);
    add('上传成功后 lastChange 对齐 lastUpload(没有待同步)',
      (meta.lastChange || 0) > 0 && !(meta.lastChange > meta.lastUpload),
      `lastChange=${meta.lastChange} lastUpload=${meta.lastUpload}`);

    const errs = consoleErrors();
    add('控制台无错误', errs.length === 0, errs.join(' / '));
  }, { enter: false, inject: mockTap() });
  return report('A. 本地更新 → 上传覆盖云端', checks);
}

/* ------------------------------------------------------------------ */
/* B. 本地有未上传改动时,启动对账不得用云端旧包覆盖本地                  */
/* ------------------------------------------------------------------ */
async function runB() {
  const checks = [];
  const add = (name, ok, why) => checks.push([ok || !why ? name : `${name}  << ${why}`, !!ok]);
  const marker = localMarker();
  // 云端:一份「旧」包(时间戳很早)
  const cloudBundle = {
    v: 1, at: 1000,
    saves: { autos: { lisi: [{ ...marker, at: 999, chapterTitle: '云端旧卷', payload: { ...marker.payload, marker: 'CLOUD_OLD' } }] }, stash: {} },
  };
  const seed = {
    uuid: 'uuid-old', fileId: 'fold', name: 'qingshi_saves_v1', summary: 'old', extra: '',
    createdTime: 1000, modifiedTime: 1000, _data: JSON.stringify(cloudBundle),
  };
  // 本地:有档,而且元数据标着「有未上传的改动」(脏)
  const local = {
    'qingshi.autos.v1': JSON.stringify({ lisi: [marker] }),
    'qingshi.tapsync.v1': JSON.stringify({ lastChange: Date.now(), lastUpload: 0 }),
  };
  await withPage(async ({ evaluate, consoleErrors }) => {
    await sleep(2500); // 等登录 + 对账跑完
    const log = await evaluate('window.__TAPMOCK__.log');
    add('启动对账没有去下载云端旧包', log.downloads === 0, `downloads=${log.downloads}`);
    const autos = await evaluate(LOCAL_AUTOS);
    const slots = autos.lisi || [];
    add('本地那半边改动没被云端旧包覆盖',
      slots.length === 1 && slots[0].at === marker.at
      && slots[0].payload && slots[0].payload.marker === 'LOCAL_BACKUP_MARK',
      JSON.stringify(slots.map((s) => ({ at: s.at, marker: s.payload && s.payload.marker }))));
    // 脏的本地最终应该上传上去(本地让路)
    const up = await until(async () => {
      const l = await evaluate('window.__TAPMOCK__.log');
      return l.uploads.length >= 1 ? l : null;
    }, 15000);
    add('本地改动最终被上传上去', !!up && up.uploads.length >= 1, JSON.stringify(up && up.uploads));
    const dump = await evaluate('window.__TAPMOCK__.dump()');
    const pack = dump.length ? JSON.parse(dump[dump.length - 1].data) : null;
    const cloudSlots = pack && pack.saves && pack.saves.autos ? pack.saves.autos.lisi || [] : [];
    add('云端现在装的是本地那一半',
      cloudSlots.length === 1 && cloudSlots[0].at === marker.at
      && cloudSlots[0].payload && cloudSlots[0].payload.marker === 'LOCAL_BACKUP_MARK',
      JSON.stringify(cloudSlots.map((s) => ({ at: s.at, marker: s.payload && s.payload.marker }))));
    const errs = consoleErrors();
    add('控制台无错误(允许云端告警)', errs.filter((e) => !/云存档|上传失败/.test(e)).length === 0, errs.join(' / '));
  }, { enter: false, inject: mockTap({ seed, local }) });
  return report('B. 本地有未上传改动 → 云端旧包不得覆盖本地', checks);
}

/* ------------------------------------------------------------------ */
/* C. 云端报错:本地档不被清空,状态不能说「已同步」                     */
/* ------------------------------------------------------------------ */
async function runC() {
  const checks = [];
  const add = (name, ok, why) => checks.push([ok || !why ? name : `${name}  << ${why}`, !!ok]);
  const marker = localMarker();

  // C1: getArchiveList 失败(对账直接失败)
  await withPage(async ({ evaluate, consoleErrors }) => {
    await sleep(2500);
    const autos = await evaluate(LOCAL_AUTOS);
    const slots = autos.lisi || [];
    add('C1 对账失败后本地档没被清空',
      slots.length === 1 && slots[0].at === marker.at,
      JSON.stringify(slots.map((s) => s.at)));
    const log = await evaluate('window.__TAPMOCK__.log');
    add('C1 没有发生上传(列表都拿不到)', log.uploads.length === 0, JSON.stringify(log.uploads));
    await evaluate(OPEN_SETTINGS);
    await sleep(500);
    const st = await evaluate(STATUS_TEXT);
    add('C1 状态提示不是「已同步」', !st.includes('已同步'), `状态「${st}」`);
    const errs = consoleErrors();
    add('C1 控制台无未捕获异常', errs.filter((e) => !/云存档/.test(e)).length === 0, errs.join(' / '));
  }, {
    enter: false,
    inject: mockTap({
      failList: true,
      local: { 'qingshi.autos.v1': JSON.stringify({ lisi: [marker] }) },
    }),
  });

  // C2: createArchive 失败(上传失败)
  await withPage(async ({ evaluate, consoleErrors, enterGame }) => {
    await sleep(800);
    await enterGame();
    await sleep(400);
    const s1 = await evaluate(DRIVE_AND_SAVE);
    add('C2 打出一条本地自动档', s1.ok === true, JSON.stringify(s1));
    // 等上传真的失败(create 报 errno 400002)
    await until(async () => {
      const m = await evaluate(META);
      return (m.lastChange || 0) > (m.lastUpload || 0) && (m.lastUpload || 0) === 0 ? m : null;
    }, 12000);
    await sleep(600);
    const autos = await evaluate(LOCAL_AUTOS);
    const slots = autos.lisi || [];
    add('C2 上传失败后本地档没被清空', slots.length >= 1, JSON.stringify(slots.map((s) => s.at)));
    const meta = await evaluate(META);
    add('C2 失败后仍标着「待同步」(没把状态说成已同步)',
      (meta.lastChange || 0) > (meta.lastUpload || 0),
      `lastChange=${meta.lastChange} lastUpload=${meta.lastUpload}`);
    await evaluate(`(() => { window.__QS__.goMenu(); return true; })()`);
    await sleep(500);
    await evaluate(OPEN_SETTINGS);
    await sleep(500);
    const st = await evaluate(STATUS_TEXT);
    add('C2 状态提示是「有改动待同步」而不是「已同步」',
      st.includes('待同步') && !st.includes('已同步'), `状态「${st}」`);
    const log = await evaluate('window.__TAPMOCK__.log');
    add('C2 云端确实没收到存档', log.uploads.length === 0, JSON.stringify(log.uploads));
    const errs = consoleErrors();
    add('C2 控制台无未捕获异常', errs.filter((e) => !/云存档|上传失败/.test(e)).length === 0, errs.join(' / '));
  }, { enter: false, inject: mockTap({ failCreate: true }) });

  return report('C. 云端失败:本地档不受损、状态不说「已同步」', checks);
}

/* ------------------------------------------------------------------ */
/* D. 非法包不得把玩家本地档清空                                        */
/* ------------------------------------------------------------------ */
async function runD() {
  const checks = [];
  const add = (name, ok, why) => checks.push([ok || !why ? name : `${name}  << ${why}`, !!ok]);
  const marker = localMarker();
  const cases = [
    { name: 'saves 是空对象', bundle: { v: 1, at: Date.now(), saves: {} } },
    { name: 'autos 是数组', bundle: { v: 1, at: Date.now(), saves: { autos: [], stash: {} } } },
  ];
  for (const c of cases) {
    const seed = {
      uuid: 'uuid-bad', fileId: 'fbad', name: 'qingshi_saves_v1', summary: 'bad', extra: '',
      createdTime: 1000, modifiedTime: Math.floor(Date.now() / 1000) + 300,
      _data: JSON.stringify(c.bundle),
    };
    // 本地:有档,且元数据是干净的(脏的话对账根本不会碰云端,这条就没意义)
    const local = {
      'qingshi.autos.v1': JSON.stringify({ lisi: [marker] }),
      'qingshi.tapsync.v1': JSON.stringify({ lastChange: 0, lastUpload: 0 }),
    };
    // eslint-disable-next-line no-await-in-loop
    await withPage(async ({ evaluate, consoleErrors }) => {
      await sleep(2500);
      const log = await evaluate('window.__TAPMOCK__.log');
      add(`非法包[${c.name}]:确实去下载了(否则这条没意义)`, log.downloads >= 1, `downloads=${log.downloads}`);
      const autos = await evaluate(LOCAL_AUTOS);
      const slots = autos.lisi || [];
      add(`非法包[${c.name}]:玩家本地档没被清空`,
        slots.length === 1 && slots[0].at === marker.at
        && slots[0].payload && slots[0].payload.marker === 'LOCAL_BACKUP_MARK',
        JSON.stringify(slots.map((s) => ({ at: s.at, marker: s.payload && s.payload.marker }))));
      const meta = await evaluate(META);
      add(`非法包[${c.name}]:没有把状态说成「已同步」`,
        !(meta.lastChange > 0 && meta.lastChange === meta.lastUpload),
        `lastChange=${meta.lastChange} lastUpload=${meta.lastUpload}`);
      const errs = consoleErrors();
      add(`非法包[${c.name}]:控制台无未捕获异常`,
        errs.filter((e) => !/云存档/.test(e)).length === 0, errs.join(' / '));
    }, { enter: false, inject: mockTap({ seed, local }) });
  }
  return report('D. 非法云端包不得清空玩家本地档', checks);
}

/* ------------------------------------------------------------------ */
/* E. 上传在飞时又存档:那次改动最终仍会上云                              */
/* ------------------------------------------------------------------ */
async function runE() {
  const checks = [];
  const add = (name, ok, why) => checks.push([ok || !why ? name : `${name}  << ${why}`, !!ok]);
  await withPage(async ({ evaluate, consoleErrors, enterGame }) => {
    await sleep(800);
    await enterGame();
    await sleep(400);
    const s1 = await evaluate(DRIVE_AND_SAVE);
    add('打出第一条本地自动档', s1.ok === true, JSON.stringify(s1));

    // 等上传真的在飞(mock 有 1.2s 的延迟)
    const flying = await until(async () => {
      const l = await evaluate('window.__TAPMOCK__.log');
      return l.inflight >= 1 ? l : null;
    }, 12000);
    add('上传确实在飞(有延迟窗口)', !!flying, JSON.stringify(flying && flying.log));
    // 在飞的时候再存一次
    const s2 = await evaluate('window.__QS__.saveGame()');
    add('上传在飞时又存档成功', s2.ok === true, JSON.stringify(s2));
    const localNow = await evaluate(LOCAL_AUTOS);
    const nLocal = (localNow.lisi || []).length;
    add('本地此时有两条自动档', nLocal >= 2, `本地 ${nLocal} 条`);

    // 第一轮上传落地
    const up1 = await until(async () => {
      const l = await evaluate('window.__TAPMOCK__.log');
      return l.uploads.length >= 1 ? l : null;
    }, 15000);
    add('第一轮上传落地(create)', !!up1 && up1.uploads[0].type === 'create', JSON.stringify(up1 && up1.uploads));
    const meta = await evaluate(META);
    // 判据用「云端那份包的内容时间」(lastUploadedAt):上传在飞时新存的档
    // lastChange 会晚于「已上传内容时间」,但早于「上传完成的墙钟时刻」——
    // 拿 lastUpload 比会把这次改动误判成已同步(2026-10-21 的模型:
    // lastUpload 只管频控窗口,lastUploadedAt 才管脏)。
    const uploadedAt = meta.lastUploadedAt ?? meta.lastUpload;
    add('上传成功只回写上传时间,新改动仍标着待同步',
      (meta.lastChange || 0) > (uploadedAt || 0),
      `lastChange=${meta.lastChange} lastUploadedAt=${meta.lastUploadedAt} lastUpload=${meta.lastUpload}`);

    // 补传那一轮
    const up2 = await until(async () => {
      const l = await evaluate('window.__TAPMOCK__.log');
      return l.uploads.length >= 2 ? l : null;
    }, 20000);
    add('在飞期间那次改动最终也上了云', !!up2 && up2.uploads.length >= 2,
      JSON.stringify(up2 && up2.uploads));
    const dump = await evaluate('window.__TAPMOCK__.dump()');
    const pack = dump.length ? JSON.parse(dump[dump.length - 1].data) : null;
    const cloudSlots = pack && pack.saves && pack.saves.autos ? pack.saves.autos.lisi || [] : [];
    const localSlots = (await evaluate(LOCAL_AUTOS)).lisi || [];
    add('云端最终与本地一致(两条都在)',
      cloudSlots.length === localSlots.length && localSlots.length >= 2
      && cloudSlots.every((s, i) => localSlots[i] && s.at === localSlots[i].at && same(s.payload, localSlots[i].payload)),
      `云端 ${JSON.stringify(cloudSlots.map((s) => s.at))} 本地 ${JSON.stringify(localSlots.map((s) => s.at))}`);
    const errs = consoleErrors();
    add('控制台无错误', errs.length === 0, errs.join(' / '));
  }, { enter: false, inject: mockTap({ delayMs: 1200 }) });
  return report('E. 上传在飞时又存档:改动最终仍上云', checks);
}

(async () => {
  const a = await runA();
  const b = await runB();
  const c = await runC();
  const d = await runD();
  const e = await runE();
  const ok = a && b && c && d && e;
  console.log(`\n${ok ? 'ok  ' : 'FAIL'}  tapcloud-conflict 总览`);
  process.exit(ok ? 0 : 1);
})();
