/**
 * TapTap 平台桥:登录态 + 云存档同步 + 退出(2026-10-16)。
 *
 * 运行环境:TapTap H5 容器注入全局 `tap` 对象(小游戏/H5 同一套,
 * 见 developer.taptap.cn/minigameapidoc)。普通浏览器没有 `tap`,
 * 本模块全部降级为 no-op,本地 localStorage 存档行为完全不变。
 *
 * 设计决策:
 * - **整包单存档**:本地是「自动档按剧本分桶 + 暂存每剧本一条」的多槽结构,
 *   云端不打散成一存档一槽(存档数量有上限 400003,且逐槽上传会撞上
 *   「一分钟一次」的频控 400001),而是把两个 store 打包成一个 JSON,
 *   对应云端唯一一份名为 qingshi_saves_v1 的存档。
 * - **冲突取舍:整包新者胜**。云端 modifiedTime 比本地最近变动新 → 云端
 *   整包覆写本地(覆写前 saves.ts 留本地备份 qingshi.cloudbackup.v1);
 *   反之上传本地。官方 QA 建议的「逐档对比引导玩家选」对整包方案不适用,
 *   多设备同时玩的冲突场景接受这个粒度。
 * - **频控**:createArchive/updateArchive 一分钟最多一次(400001)。
 *   本地每次写档只标脏(lastChange),由调度器在距上次上传满 60s 后
 *   (debounce 1.5s)合并上传;关页 pagehide 时若距上次上传已满 60s
 *   补一次末班车上传,不满就等下次启动 reconcile。
 * - **登录态**:启动时直接 tap.login() 静默登录(容器内是 TapTap 账号
 *   一键授权,无弹窗)。login 拿到的 code 是「开发者服务器换 openid」用的;
 *   本项目没有自建服务器,云存档走的是容器内当前 TapTap 账号的隐式身份,
 *   不需要 code 交换。昵称/头像接口小游戏体系未对 H5 开放(需后端
 *   code2Session),不做。
 *
 * 测试挂钩:上传间隔可被 window.__QS_TAP_UPLOAD_INTERVAL__ 覆写(毫秒),
 * 测试把它缩到 1.5s 级别,不用真等一分钟。
 */
import { exportSavesBundle, importSavesBundle, onSaveMutated } from './saves';

/** 云端存档名:平台限制 60 字节、不允许汉字和空格 */
const ARCHIVE_NAME = 'qingshi_saves_v1';
/** 本地同步元数据键 */
const META_KEY = 'qingshi.tapsync.v1';
/** 官方频控:create/update 一分钟最多一次 */
const UPLOAD_INTERVAL = 60_000;

interface SyncMeta {
  /** 本地存档最后一次变动(任何写档动作)的时间戳 */
  lastChange: number;
  /** 最后一次成功上传 */
  lastUpload: number;
}

export interface TapStatus {
  /** 是否在 TapTap 容器里(不在则以下字段无意义) */
  env: boolean;
  /** 登录态有效(checkSession 通过或 login 成功) */
  online: boolean;
  /** 正在上传/下载 */
  syncing: boolean;
  /** 有本地变动还没上云 */
  pending: boolean;
  /** 最后一次成功同步(上传或下载)的时间戳;从未同步为 null */
  lastSync: number | null;
}

type StatusListener = (s: TapStatus) => void;

/* ---------------- 环境探测与 Promise 化 ---------------- */

function tapEnv(): TapGlobal | null {
  const t = typeof window !== 'undefined' ? window.tap : undefined;
  if (!t || typeof t.getCloudSaveManager !== 'function' || typeof t.getFileSystemManager !== 'function') {
    return null;
  }
  return t;
}

/** 是否在 TapTap 容器内(普通浏览器为 false,所有能力静默降级) */
export function isTapEnv(): boolean {
  return tapEnv() !== null;
}

/** 回调风格包 Promise:官方虽标 Promise 风格可用,包回调对两种实现都成立 */
function call<T, O extends object>(
  fn: (opts: O) => void,
  opts: Omit<O, 'success' | 'fail' | 'complete'>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    fn({
      ...opts,
      success: (res: T) => resolve(res),
      fail: (err: { errMsg?: string; errno?: number; code?: number }) => {
        reject(new Error(err?.errMsg ?? `tap api failed (${err?.errno ?? err?.code ?? '?'})`));
      },
    } as O);
  });
}

/* ---------------- 同步元数据 ---------------- */

function readMeta(): SyncMeta {
  try {
    const raw = localStorage.getItem(META_KEY);
    if (raw) {
      const o = JSON.parse(raw) as Partial<SyncMeta>;
      return { lastChange: o.lastChange ?? 0, lastUpload: o.lastUpload ?? 0 };
    }
  } catch { /* 隐私模式等:当全新 */ }
  return { lastChange: 0, lastUpload: 0 };
}

function writeMeta(m: SyncMeta): void {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(m));
  } catch { /* 元数据写不进不阻断同步 */ }
}

/* ---------------- 状态与订阅 ---------------- */

let online = false;
let syncing = false;
let lastSync: number | null = null;
let inited = false;
let uploadTimer = 0;
/** 覆写导入期间压住 scheduleUpload:云端→本地不是本地改动,不能反过来回传 */
let suppressMutated = false;
const statusListeners: StatusListener[] = [];

export function getStatus(): TapStatus {
  const meta = readMeta();
  return {
    env: isTapEnv(),
    online,
    syncing,
    pending: meta.lastChange > meta.lastUpload,
    lastSync,
  };
}

/** 订阅状态变化;返回退订函数(页面销毁时必须退订,否则监听会累积) */
export function onStatus(cb: StatusListener): () => void {
  statusListeners.push(cb);
  return () => {
    const i = statusListeners.indexOf(cb);
    if (i >= 0) statusListeners.splice(i, 1);
  };
}

function emitStatus(): void {
  const s = getStatus();
  for (const cb of statusListeners) {
    try { cb(s); } catch { /* UI 异常不许砸同步 */ }
  }
}

/* ---------------- 上传 ---------------- */

function uploadInterval(): number {
  const v = (window as unknown as Record<string, unknown>).__QS_TAP_UPLOAD_INTERVAL__;
  return typeof v === 'number' && v > 0 ? v : UPLOAD_INTERVAL;
}

function bundlePath(t: TapGlobal): string {
  return `${t.env.USER_DATA_PATH}/qingshi_saves.json`;
}

/**
 * 立即上传一次。频控窗口内(400001)/并发中(400007)/不在容器里 → false。
 * 失败不丢数据:meta.lastChange 不动,下个窗口调度器还会再来。
 */
async function uploadNow(): Promise<boolean> {
  const t = tapEnv();
  if (!t || !online || syncing) return false;
  const meta = readMeta();
  if (meta.lastChange === 0 || meta.lastChange <= meta.lastUpload) return true; // 没脏数据
  if (Date.now() - meta.lastUpload < uploadInterval()) return false;

  syncing = true;
  emitStatus();
  try {
    const bundle = { v: 1, at: meta.lastChange, saves: exportSavesBundle() };
    const fs = t.getFileSystemManager();
    const cloud = t.getCloudSaveManager();
    const path = bundlePath(t);
    await call(fs.writeFile.bind(fs), {
      filePath: path, data: JSON.stringify(bundle), encoding: 'utf8',
    });
    const list = await call<{ saves: TapArchiveDetail[] }, TapCallbackOpts<{ saves: TapArchiveDetail[] }>>(cloud.getArchiveList.bind(cloud), {});
    const found = (list.saves ?? []).find((s) => s.name === ARCHIVE_NAME);
    const md: TapArchiveMetaData = {
      name: ARCHIVE_NAME,
      summary: '青史志 存档同步包',
      extra: JSON.stringify({ at: bundle.at }),
    };
    if (found) {
      await call(cloud.updateArchive.bind(cloud), {
        archiveUUID: found.uuid, archiveMetaData: md, archiveFilePath: path,
      });
    } else {
      await call(cloud.createArchive.bind(cloud), { archiveMetaData: md, archiveFilePath: path });
    }
    writeMeta({ ...meta, lastUpload: Date.now() });
    lastSync = Date.now();
    return true;
  } catch (e) {
    console.warn('[青史志] 云存档上传失败(下轮再试):', e instanceof Error ? e.message : e);
    return false;
  } finally {
    syncing = false;
    emitStatus();
  }
}

/** 本地写档后标脏并按频控调度上传(合并 debounce:频繁写只传一头一尾) */
function scheduleUpload(): void {
  if (suppressMutated) return;
  if (!isTapEnv() || !online) return;
  const meta = readMeta();
  writeMeta({ ...meta, lastChange: Date.now() });
  emitStatus();
  window.clearTimeout(uploadTimer);
  const wait = Math.max(1500, uploadInterval() - (Date.now() - meta.lastUpload));
  uploadTimer = window.setTimeout(() => {
    void uploadNow().then((ok) => {
      // 上传期间又写了档 → 排下一轮(仍受频控间隔约束)
      const m = readMeta();
      if (ok && m.lastChange > m.lastUpload) scheduleUpload();
    });
  }, wait);
}

/* ---------------- 下载(reconcile) ---------------- */

/** 启动对账:云端比本地新 → 整包覆写本地;本地脏 → 调度上传。返回本地是否被覆写 */
async function reconcile(t: TapGlobal): Promise<boolean> {
  const cloud = t.getCloudSaveManager();
  const list = await call<{ saves: TapArchiveDetail[] }, TapCallbackOpts<{ saves: TapArchiveDetail[] }>>(cloud.getArchiveList.bind(cloud), {});
  const found = (list.saves ?? []).find((s) => s.name === ARCHIVE_NAME);
  const meta = readMeta();
  const cloudAt = found ? found.modifiedTime * 1000 : 0;

  if (found && cloudAt > meta.lastChange) {
    // 云端新:下载整包覆写本地(saves.ts 内部会先留本地备份)
    const fs = t.getFileSystemManager();
    const path = bundlePath(t);
    const got = await call<{ filePath: string }, TapCallbackOpts<{ filePath: string }> & { archiveUUID: string; archiveFileId: string; targetFilePath?: string }>(cloud.getArchiveData.bind(cloud), {
      archiveUUID: found.uuid, archiveFileId: found.fileId, targetFilePath: path,
    });
    const text = await call<{ data: string }, TapCallbackOpts<{ data: string }> & { filePath: string; encoding?: string }>(fs.readFile.bind(fs), { filePath: got.filePath ?? path, encoding: 'utf8' });
    const bundle = JSON.parse(text.data) as { v?: number; at?: number; saves?: Parameters<typeof importSavesBundle>[0] };
    if (bundle && typeof bundle === 'object' && bundle.saves) {
      // importSavesBundle 会经 writeAutos/writeStash 触发 onSaveMutated,
      // 压住监听并清掉可能已排期的定时器,再把 meta 对齐云端(不回传)
      suppressMutated = true;
      try {
        importSavesBundle(bundle.saves);
      } finally {
        suppressMutated = false;
      }
      window.clearTimeout(uploadTimer);
      writeMeta({ lastChange: cloudAt, lastUpload: cloudAt });
      lastSync = Date.now();
      emitStatus();
      return true;
    }
    console.warn('[青史志] 云端存档包结构非法,已忽略');
    return false;
  }
  if (meta.lastChange > meta.lastUpload) scheduleUpload();
  return false;
}

/* ---------------- 对外入口 ---------------- */

export interface InitResult {
  /** 在 TapTap 容器内且登录态可用 */
  online: boolean;
  /** reconcile 是否覆写了本地存档(调用方可能需要刷新页面) */
  changed: boolean;
}

/**
 * 启动初始化:探测环境 → 确认登录态 → 对账。幂等,重复调直接返回现状。
 * 普通浏览器:全部 no-op,返回 { online:false, changed:false }。
 */
export async function initTapCloud(): Promise<InitResult> {
  if (inited) return { online, changed: false };
  inited = true;
  const t = tapEnv();
  if (!t) return { online: false, changed: false };

  // 登录态:容器内静默一键授权;失败则云同步不可用(不影响本地游玩)
  try {
    await call<TapLoginRes, TapCallbackOpts<TapLoginRes>>(t.login.bind(t), {});
    online = true;
  } catch (e) {
    console.warn('[青史志] TapTap 登录态获取失败,云同步不可用:', e instanceof Error ? e.message : e);
    emitStatus();
    return { online: false, changed: false };
  }
  emitStatus();

  // 本地写档 → 标脏上传;关页末班车(同步频率窗口内才发,页面正在销毁,尽力而为)
  onSaveMutated(scheduleUpload);
  window.addEventListener('pagehide', () => {
    const meta = readMeta();
    if (meta.lastChange > meta.lastUpload && Date.now() - meta.lastUpload >= uploadInterval()) {
      void uploadNow();
    }
  });

  try {
    const changed = await reconcile(t);
    return { online: true, changed };
  } catch (e) {
    console.warn('[青史志] 云存档对账失败(不影响本地游玩):', e instanceof Error ? e.message : e);
    return { online: true, changed: false };
  }
}

/** 设置页「立即同步」按钮:不等调度器,直接试传一轮(仍受官方频控约束) */
export async function syncNow(): Promise<boolean> {
  return uploadNow();
}

/**
 * 真退出(2026-10-16 拍板):容器里请求结束游戏进程,浏览器里请求关页。
 * - TapTap 容器:优先 tap.exitMiniProgram(对齐 wx 命名;文档站未收录,
 *   故特性探测,没有就跳过);
 * - 浏览器/WebView:window.close()。脚本未打开的窗口会被浏览器拒绝
 *   (只留一条 warning 级日志,不算错误),调用方必须自备兜底 UI(落幕页)。
 * 点火即忘:退出成败都不可依赖回调(进程可能直接被掐),本地存档已在
 * localStorage,未上云的部分下次启动 reconcile 会补传,不在退出时抢传。
 */
export function requestExit(): void {
  const t = typeof window !== 'undefined' ? window.tap : undefined;
  try {
    if (t && typeof t.exitMiniProgram === 'function') t.exitMiniProgram({});
  } catch { /* 容器拒绝:继续走 window.close */ }
  try {
    window.close();
  } catch { /* 被浏览器拒绝:落幕页兜底 */ }
}
