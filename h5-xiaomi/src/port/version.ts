/**
 * 版本号唯一来源(移植线自带一份,避免构建期注入的差异:
 * vite 用 define、rolldown 用 transform.define,两边写法不一致时最容易漏注入)。
 * 发布前与 rpk/manifest.json 的 versionName 对齐。
 */
export const APP_VERSION = '0.1.0';
