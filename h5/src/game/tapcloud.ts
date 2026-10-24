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

/**
 * 回调风格包 Promise:官方虽标 Promise 风格可用,包回调对两种实现都成立。
 * 容器回调偶发不返回(弱网/容器抖动):15 秒超时兜底(对齐判官 cloudsave.js 的
 * 同名守卫),超时错误带 timeout 标记;迟到的回调因 Promise 已 settle 一不再受理。
 */
function call<T, O extends object>(
  fn: (opts: O) => void,
  opts: Omit<O, 'success' | 'fail' | 'complete'>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(Object.assign(new Error('tap api 无响应'), { timeout: true })),
      15000,
    );
    fn({
      ...opts,
      success: (res: T) => {
        clearTimeout(timer);
        resolve(res);
      },
      fail: (err: { errMsg?: string; errno?: number; code?: number }) => {
        clearTimeout(timer);
        reject(new Error(err?.errMsg ?? `tap api failed (${err?.errno ?? err?.code ?? '?'})`));
      },
    } as O);
  });
}

/* ---------------- 同步元数据 ---------------- */

/**
 * 同步元数据。**两个时间戳各管一件事**(2026-10-21 修):
 * - lastChange:本地最近一次**改动**的时刻(内容时间)
 * - lastUpload:最近一次**上传完成**的时刻(墙钟时间)→ 只用来算官方频控窗口
 * - lastUploadedAt:上一次**传到云端的那份包**的内容时间(`bundle.at`)
 *
 * 为什么不能拿 lastUpload 当脏判据:上传要跑 3 次网络往返,期间玩家又存了档,
 * 它的 lastChange(T2)会小于上传**完成**的墙钟时刻(T3)—— 于是
 * `lastChange > lastUpload` 不成立,那次存档被当成「已同步」,永远不再上云。
 * 脏判据必须用「云端那份包的内容时间」比。
 * 老档没有 lastUploadedAt,退回按 lastUpload 比(与旧行为一致)。
 */
interface SyncMeta {
  lastChange: number;
  lastUpload: number;
  lastUploadedAt?: number;
}

function readMeta(): SyncMeta {
  try {
    const raw = localStorage.getItem(META_KEY);
    if (raw) {
      const o = JSON.parse(raw) as Partial<SyncMeta>;
      return {
        lastChange: o.lastChange ?? 0,
        lastUpload: o.lastUpload ?? 0,
        lastUploadedAt: typeof o.lastUploadedAt === 'number' ? o.lastUploadedAt : undefined,
      };
    }
  } catch { /* 隐私模式等:当全新 */ }
  return { lastChange: 0, lastUpload: 0, lastUploadedAt: undefined };
}

function writeMeta(m: SyncMeta): void {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(m));
  } catch { /* 元数据写不进不阻断同步 */ }
}

/** 云端那份包的内容时间(脏判据用;老档退回 lastUpload) */
function uploadedAt(meta: SyncMeta): number {
  return meta.lastUploadedAt ?? meta.lastUpload;
}

/** 本地是否有还没上云的改动 */
function isDirty(meta: SyncMeta): boolean {
  return meta.lastChange > 0 && meta.lastChange > uploadedAt(meta);
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
    pending: isDirty(meta),
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

/**
 * 上传与下载各用各的临时文件(2026-10-21 修):
 * 原来两者共用 `qingshi_saves.json` —— 上传把本地整包写进去交给 updateArchive,
 * 下载又把云端内容落回同一路径;两条链一交错(启动对账未完时写档触发了上传),
 * 云端就会被旧内容覆盖,本机新档也丢了。文件名分开后互不干扰。
 */
function bundlePath(t: TapGlobal, kind: 'upload' | 'download'): string {
  return `${t.env.USER_DATA_PATH}/qingshi_saves_${kind}.json`;
}

/**
 * 立即上传一次。频控窗口内(400001)/并发中(400007)/不在容器里 → false。
 * 失败不丢数据:meta.lastChange 不动,下个窗口调度器还会再来。
 */
async function uploadNow(): Promise<boolean> {
  const r = await runUpload();
  return r === 'uploaded' || r === 'clean';
}

/** 上传结果分类:手动上传要区分「没得传」与「被频控挡了」,文案才说得准 */
export type PushResult =
  | 'uploaded'  // 已传上云
  | 'clean'     // 本地没有改动,无需传
  | 'throttled' // 官方频控:一分钟内只能一次
  | 'offline'   // 不在容器里 / 未登录
  | 'busy'      // 已有同步在跑
  | 'failed';   // 容器或网络报错

/** 下载结果分类 */
export type PullResult =
  | 'applied'   // 云端整包已覆盖本地
  | 'no-cloud'  // 云端还没有存档
  | 'offline'   // 不在容器里 / 未登录
  | 'failed';   // 容器或网络报错

/**
 * 上传本体(调度器与手动上传共用)。返回分类而不是 boolean:
 * 手动上传要把「没得传」「被频控挡了」「失败」分别告诉玩家。
 */
async function runUpload(): Promise<PushResult> {
  const t = tapEnv();
  if (!t) return 'offline';
  if (!online) {
    // 登录态可能只是暂时失败(弱网/容器抖动):重试一次,别让一次失败把整个
    // 会话的云同步永久关掉(2026-10-21 修)
    const ok = await tryLogin();
    if (!ok) return 'offline';
  }
  if (syncing) return 'busy';
  const meta = readMeta();
  if (!isDirty(meta)) return 'clean';
  if (Date.now() - meta.lastUpload < uploadInterval()) return 'throttled';

  syncing = true;
  emitStatus();
  try {
    const bundle = { v: 1, at: meta.lastChange, saves: exportSavesBundle() };
    const fs = t.getFileSystemManager();
    const cloud = t.getCloudSaveManager();
    const path = bundlePath(t, 'upload');
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
    // 只回写 lastUpload(墙钟,给频控窗口用)与 lastUploadedAt(本次上传的**内容
    // 时间** bundle.at,给脏判据用);lastChange 现读现用(2026-10-21 修):
    // 原来把上传开始前的 meta 快照整个写回,上传在飞期间玩家新存的档
    // (lastChange 已被推到更晚)会被回滚成旧值 → 那次存档再也不会上云。
    const now = readMeta();
    writeMeta({ ...now, lastUpload: Date.now(), lastUploadedAt: bundle.at });
    lastSync = Date.now();
    return 'uploaded';
  } catch (e) {
    console.warn('[青史志] 云存档上传失败(下轮再试):', e instanceof Error ? e.message : e);
    return 'failed';
  } finally {
    syncing = false;
    emitStatus();
  }
}

/**
 * 本地写档后标脏并按频控调度上传(合并 debounce:频繁写只传一头一尾)。
 *
 * 标脏与「是否在线」解耦(2026-10-21 修):原来离线时直接 return,lastChange
 * 恒为 0,启动对账拿云端时间戳与 0 比 → 云端(哪怕是旧包)恒胜,本机进度被
 * 整包静默覆盖。现在只要在容器里就先把 lastChange 记下来(脏 = 本地更新),
 * 对账据此让路;传不上去也只是「待同步」,不会丢数据。
 */
function scheduleUpload(): void {
  if (suppressMutated) return;
  if (!isTapEnv()) return;
  const meta = readMeta();
  writeMeta({ ...meta, lastChange: Date.now() });
  emitStatus();
  if (!online) return; // 没登录就只标脏,等下次有机会再传
  window.clearTimeout(uploadTimer);
  const wait = Math.max(1500, uploadInterval() - (Date.now() - meta.lastUpload));
  uploadTimer = window.setTimeout(() => {
    void uploadNow().then((ok) => {
      const m = readMeta();
      if (isDirty(m)) {
        // 还有没传上去的:成功时接着排下一轮,失败/频控时也按窗口再排一次
        // (原来只在 ok 时排,throttled/failed 之后 pending 一直挂着没人推)
        if (ok) scheduleUpload();
        else {
          window.clearTimeout(uploadTimer);
          uploadTimer = window.setTimeout(() => scheduleUpload(), uploadInterval());
        }
      }
    });
  }, wait);
}

/* ---------------- 下载(reconcile) ---------------- */

/**
 * 把云端整包落到本地(覆写前 saves.ts 留本地备份)。返回是否真的覆写了。
 * 启动对账与设置页手动「下载」共用这一段:手动下载不做新旧比较,
 * 一律以云端为准(玩家明说要下云端的)。
 *
 * 2026-10-21 修的三处:
 * - 落盘用**独立**的下载临时文件(不与上传共用,避免交错时云端被旧内容覆盖);
 * - 包结构先校验再落:非法包不当空包处理(否则会把玩家本地档清空);
 * - 导入失败(配额不足等)**不**对齐 meta:对齐了就等于告诉云端「已同步」,
 *   分叉的那一半永远不会再传。
 */
async function applyCloudBundle(t: TapGlobal, found: TapArchiveDetail): Promise<boolean> {
  if (syncing) return false;
  const fs = t.getFileSystemManager();
  const cloud = t.getCloudSaveManager();
  const path = bundlePath(t, 'download');
  let bundle: { v?: number; at?: number; saves?: Parameters<typeof importSavesBundle>[0] };
  try {
    const got = await call<{ filePath: string }, TapCallbackOpts<{ filePath: string }> & { archiveUUID: string; archiveFileId: string; targetFilePath?: string }>(cloud.getArchiveData.bind(cloud), {
      archiveUUID: found.uuid, archiveFileId: found.fileId, targetFilePath: path,
    });
    const text = await call<{ data: string }, TapCallbackOpts<{ data: string }> & { filePath: string; encoding?: string }>(fs.readFile.bind(fs), { filePath: got.filePath ?? path, encoding: 'utf8' });
    bundle = JSON.parse(text.data) as typeof bundle;
  } catch (e) {
    console.warn('[青史志] 云端存档读取失败,已放弃本次下载:', e instanceof Error ? e.message : e);
    return false;
  }
  if (!bundle || typeof bundle !== 'object' || !bundle.saves || typeof bundle.saves !== 'object') {
    console.warn('[青史志] 云端存档包结构非法,已忽略');
    return false;
  }
  // autos/stash 必须是对象(桶可以为空,但不能是数组或字符串)
  const s = bundle.saves as { autos?: unknown; stash?: unknown; col?: unknown };
  const autosOk = s.autos === undefined || (!!s.autos && typeof s.autos === 'object' && !Array.isArray(s.autos));
  const stashOk = s.stash === undefined || (!!s.stash && typeof s.stash === 'object' && !Array.isArray(s.stash));
  // 收藏(col)可缺省(老云包没有);形状不对只跳过它,不连累存档整包
  const colBad = s.col !== undefined && (!s.col || typeof s.col !== 'object' || Array.isArray(s.col));
  if (!autosOk || !stashOk) {
    console.warn('[青史志] 云端存档包结构非法(autos/stash 形状不对),已忽略');
    return false;
  }
  if (colBad) {
    console.warn('[青史志] 云端包里的收藏形状不对,已跳过收藏部分');
    (s as { col?: unknown }).col = undefined;
  }

  syncing = true;
  emitStatus();
  try {
    // importSavesBundle 会经 writeAutos/writeStash 触发 onSaveMutated,
    // 压住监听并清掉可能已排期的定时器,再把 meta 对齐云端(不回传)
    suppressMutated = true;
    let ok = false;
    try {
      ok = importSavesBundle(bundle.saves);
    } finally {
      suppressMutated = false;
    }
    if (!ok) {
      console.warn('[青史志] 云端存档写入本地失败(可能配额不足),已保留本地现状');
      return false;
    }
    window.clearTimeout(uploadTimer);
    // 以云端包里的 at(本地变动时刻)为准,不是服务器上传时刻;
    // 拿 modifiedTime 比会在每次成功上传后的启动都误判「云端更新」→
    // 白白下载并整包重写本地一次(2026-10-21 修)
    const cloudAt = typeof bundle.at === 'number' ? bundle.at : found.modifiedTime * 1000;
    writeMeta({ lastChange: cloudAt, lastUpload: cloudAt, lastUploadedAt: cloudAt });
    lastSync = Date.now();
    emitStatus();
    return true;
  } catch (e) {
    console.warn('[青史志] 云端存档写入本地失败:', e instanceof Error ? e.message : e);
    return false;
  } finally {
    syncing = false;
    emitStatus();
  }
}

/**
 * 启动对账:云端比本地新 → 整包覆写本地;本地脏 → 调度上传。返回本地是否被覆写。
 *
 * 2026-10-21 修:本地有未上传的改动时**不让云端覆盖**(脏 = 本机更新),
 * 否则登录失败/离线过一次就会拿旧包把本机进度盖掉。
 */
async function reconcile(t: TapGlobal): Promise<boolean> {
  const cloud = t.getCloudSaveManager();
  const list = await call<{ saves: TapArchiveDetail[] }, TapCallbackOpts<{ saves: TapArchiveDetail[] }>>(cloud.getArchiveList.bind(cloud), {});
  const found = (list.saves ?? []).find((s) => s.name === ARCHIVE_NAME);
  const meta = readMeta();
  const dirty = isDirty(meta);

  if (found && !dirty) {
    // 云端的「本地变动时刻」写在包 extra 的 at 里;老包没有就退回上传时刻
    const at = (() => {
      try {
        const extra = JSON.parse(found.extra || '{}') as { at?: number };
        return typeof extra.at === 'number' ? extra.at : found.modifiedTime * 1000;
      } catch {
        return found.modifiedTime * 1000;
      }
    })();
    if (at > meta.lastChange) {
      // 云端新:下载整包覆写本地(saves.ts 内部会先留本地备份)
      return applyCloudBundle(t, found);
    }
  }
  if (dirty) scheduleUpload();
  return false;
}

/* ---------------- 对外入口 ---------------- */

export interface InitResult {
  /** 在 TapTap 容器内且登录态可用 */
  online: boolean;
  /** reconcile 是否覆写了本地存档(调用方可能需要刷新页面) */
  changed: boolean;
}

/** 静默登录(容器内一键授权)。失败返回 false,不影响本地游玩 */
async function tryLogin(): Promise<boolean> {
  const t = tapEnv();
  if (!t) return false;
  try {
    await call<TapLoginRes, TapCallbackOpts<TapLoginRes>>(t.login.bind(t), {});
    online = true;
    emitStatus();
    return true;
  } catch (e) {
    console.warn('[青史志] TapTap 登录态获取失败,云同步不可用:', e instanceof Error ? e.message : e);
    emitStatus();
    return false;
  }
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
  if (!await tryLogin()) return { online: false, changed: false };

  // 本地写档 → 标脏上传;关页末班车(同步频率窗口内才发,页面正在销毁,尽力而为)
  onSaveMutated(scheduleUpload);
  window.addEventListener('pagehide', () => {
    const meta = readMeta();
    if (isDirty(meta) && Date.now() - meta.lastUpload >= uploadInterval()) {
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

/**
 * 设置页「上传」:手动把本地档传到云端。
 * 官方频控一分钟一次仍在(400001),撞窗时返回 'throttled' —— 这是平台限制,
 * 不做本地绕道,文案照实说。
 */
export async function pushSaves(): Promise<PushResult> {
  return runUpload();
}

/**
 * 设置页「下载」:拉云端整包覆盖本地(覆写前留本地备份)。
 * 与启动对账不同:不做新旧比较,玩家点了就是以云端为准。
 */
export async function pullSaves(): Promise<PullResult> {
  const t = tapEnv();
  if (!t) return 'offline';
  if (!online && !await tryLogin()) return 'offline';
  if (syncing) return 'failed';
  try {
    const cloud = t.getCloudSaveManager();
    const list = await call<{ saves: TapArchiveDetail[] }, TapCallbackOpts<{ saves: TapArchiveDetail[] }>>(cloud.getArchiveList.bind(cloud), {});
    const found = (list.saves ?? []).find((s) => s.name === ARCHIVE_NAME);
    if (!found) return 'no-cloud';
    const applied = await applyCloudBundle(t, found);
    return applied ? 'applied' : 'failed';
  } catch (e) {
    console.warn('[青史志] 云存档下载失败:', e instanceof Error ? e.message : e);
    return 'failed';
  }
}

/**
 * 容器退出接口候选名。
 *
 * 2026-10-21 复核:TapTap 小游戏/H5 的 API 全表(文档站 634 条路由全核对过)没有
 * 「退出/关页」接口,base/app/life-cycle 只有 onShow/onHide/getLaunchOptionsSync;
 * 类比平台的 tt.exitMiniProgram 也只是切后台不杀进程。所以这几个名字都是
 * 「容器将来可能补」的探测位(按 wx / 各类小程序命名习惯),有就用,没有就跳过。
 */
const EXIT_API_NAMES = ['exitMiniProgram', 'exitApplication', 'exit'] as const;

/**
 * 真退出(2026-10-16 拍板;2026-10-21 改):尽最大努力结束进程。
 * - 容器:把几个可能的退出接口都探测一遍(文档站没有,纯探测);
 * - 浏览器/WebView:window.close() 兜底(脚本未打开的窗口会被拒,只留 warning)。
 *
 * 退出前会**尽力**传一次脏档(不等它落地就往下走 —— 进程可能直接被掐)。
 * 传不上去也不会丢数据:本地档在 localStorage,且 lastChange 仍标着「脏」,
 * 下次启动 reconcile 会先让本地让路、再补传(2026-10-21 修的对账规则)。
 */
export function requestExit(): void {
  void uploadNow().catch(() => { /* 尽力而为,失败不拦退出 */ });
  const t = typeof window !== 'undefined' ? window.tap : undefined;
  if (t) {
    for (const name of EXIT_API_NAMES) {
      const fn = t[name];
      if (typeof fn !== 'function') continue;
      try {
        fn.call(t, {});
      } catch { /* 容器拒绝:继续试下一个 */ }
    }
  }
  try {
    window.close();
  } catch { /* 被浏览器拒绝:由界面进静默终态兜底 */ }
}
