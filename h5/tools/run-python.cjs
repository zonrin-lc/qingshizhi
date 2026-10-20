#!/usr/bin/env node
/**
 * 便携 Python 启动器。
 *
 * 为什么需要它:npm 脚本里写死 `python3` 在 Windows 上会命中
 * `%LOCALAPPDATA%\Microsoft\WindowsApps\python3.exe` 这个应用商店占位程序 ——
 * 它不报"找不到命令",而是直接失败/弹出商店,于是 `npm run build` 整条 prebuild 链断掉。
 * 各平台解释器名也不统一:Linux/macOS 习惯 python3,Windows 常见 python 或 py -3。
 *
 * 这里依次探测可用解释器,再把 UTF-8 相关环境变量钉死 —— Windows 控制台默认 GBK,
 * Python 打印 '✓' 之类符号会抛 UnicodeEncodeError(脚本里另有自保,双保险)。
 *
 * 用法:node tools/run-python.cjs <脚本> [参数...]
 */
const { spawnSync } = require('child_process');
const path = require('path');

const args = process.argv.slice(2);
if (!args.length) {
  console.error('[run-python] 用法: node tools/run-python.cjs <脚本> [参数...]');
  process.exit(2);
}

const win = process.platform === 'win32';
const candidates = win
  ? [['python', []], ['py', ['-3']], ['python3', []]]
  : [['python3', []], ['python', []]];

function usable(cmd, pre) {
  const r = spawnSync(cmd, [...pre, '-c', 'import sys'], { stdio: 'ignore' });
  return !r.error && r.status === 0;
}

let chosen = null;
for (const [cmd, pre] of candidates) {
  if (usable(cmd, pre)) { chosen = { cmd, pre }; break; }
}

if (!chosen) {
  console.error('[run-python] 未找到可用的 Python 3。请安装后重试,或手动运行: ' + args.join(' '));
  process.exit(2);
}

const env = Object.assign({}, process.env, {
  PYTHONIOENCODING: 'utf-8',
  PYTHONUTF8: '1',
});

const r = spawnSync(chosen.cmd, [...chosen.pre, path.normalize(args[0]), ...args.slice(1)], {
  stdio: 'inherit',
  env,
});

if (r.error) {
  console.error('[run-python] 启动失败: ' + r.error.message);
  process.exit(2);
}
process.exit(r.status == null ? 1 : r.status);
