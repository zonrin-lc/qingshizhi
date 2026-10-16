/**
 * TapTap H5/小游戏容器的全局 `tap` 对象类型(按需声明,不是完整覆盖)。
 *
 * 依据:小游戏开发者文档
 * - 登录管理  tap.login / tap.checkSession
 *   https://developer.taptap.cn/minigameapidoc/dev/tutorial/open-capabilities/login-management/
 * - 云存档    CloudSaveManager(createArchive/updateArchive/getArchiveList/getArchiveData/deleteArchive)
 *   https://developer.taptap.cn/minigameapidoc/dev/api/open-api/cloudsave/
 * - 本地文件  FileSystemManager(writeFile/readFile),路径根 tap.env.USER_DATA_PATH
 *
 * `tap` 只在 TapTap 客户端/小游戏容器里注入;普通浏览器为 undefined,
 * 业务侧一律先过 tapcloud.isTapEnv() 再碰它。
 */

/** 回调风格公共形态:官方同时支持 Promise 风格,但包一层回调对两版都成立 */
interface TapCallbackOpts<T> {
  success?: (res: T) => void;
  fail?: (err: { errMsg?: string; errno?: number; code?: number }) => void;
  complete?: () => void;
}

interface TapLoginRes { code: string }

interface TapArchiveMetaData {
  /** 60 字节内,不允许空,不允许汉字 */
  name: string;
  /** 500 字节内,不允许空 */
  summary: string;
  /** 1000 字节内,允许空 */
  extra?: string;
  /** 秒级,不允许负值 */
  playtime?: number;
}

interface TapArchiveDetail {
  uuid: string;
  fileId: string;
  name: string;
  summary: string;
  extra: string;
  playtime: number;
  saveSize: number;
  coverSize: number;
  /** 秒级 */
  createdTime: number;
  /** 秒级 */
  modifiedTime: number;
}

interface TapCloudSaveManager {
  createArchive(opts: TapCallbackOpts<{ uuid: string; fileId: string }> & {
    archiveMetaData: TapArchiveMetaData;
    archiveFilePath: string;
    archiveCoverPath?: string;
  }): void;
  updateArchive(opts: TapCallbackOpts<{ uuid: string; fileId: string }> & {
    archiveUUID: string;
    archiveMetaData: TapArchiveMetaData;
    archiveFilePath: string;
    archiveCoverPath?: string;
  }): void;
  getArchiveList(opts?: TapCallbackOpts<{ saves: TapArchiveDetail[] }>): void;
  getArchiveData(opts: TapCallbackOpts<{ filePath: string }> & {
    archiveUUID: string;
    archiveFileId: string;
    targetFilePath?: string;
  }): void;
  deleteArchive(opts: TapCallbackOpts<Record<string, never>> & { archiveUUID: string }): void;
}

interface TapFileSystemManager {
  writeFile(opts: TapCallbackOpts<Record<string, never>> & {
    filePath: string;
    data: string;
    encoding?: string;
  }): void;
  readFile(opts: TapCallbackOpts<{ data: string }> & {
    filePath: string;
    encoding?: string;
  }): void;
}

interface TapGlobal {
  env: { USER_DATA_PATH: string };
  login(opts?: TapCallbackOpts<TapLoginRes>): void;
  checkSession(opts?: TapCallbackOpts<Record<string, never>>): void;
  getCloudSaveManager(): TapCloudSaveManager;
  getFileSystemManager(): TapFileSystemManager;
  /** 退出当前小游戏/结束 H5 容器进程。对齐 wx.exitMiniProgram 命名;
   *  文档站未收录此接口,故声明为可选,业务侧必须特性探测后再调 */
  exitMiniProgram?(opts?: TapCallbackOpts<Record<string, never>>): void;
}

/** 容器注入的全局对象;普通浏览器为 undefined */
declare const tap: TapGlobal | undefined;

interface Window {
  tap?: TapGlobal;
}
