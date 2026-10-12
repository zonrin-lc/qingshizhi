'use strict';
/**
 * dev 模式冒烟:验证 vite dev server 下页面真的能起来。
 *
 * 为什么需要:tests/ 三套都跑 dist/ 构建产物,dev 路径(vite dev + optimizeDeps)
 * 平时没人碰。已知历史问题就是 dev 下 @engine 的 UMD 拿不到 default 导出而白屏,
 * 所以这里专门盯 dev。
 *
 * 用法:先 npm run dev,再 node tests/dev-check.cjs [url]
 */
const { spawn } = require('node:child_process');
const path = require('node:path');
const os = require('node:os');

const URL = process.argv[2] || 'http://localhost:5173/';

function chromePath() {
  const cands = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    path.join(os.homedir(), 'AppData/Local/Google/Chrome/Application/chrome.exe'),
  ];
  for (const c of cands) if (require('node:fs').existsSync(c)) return c;
  throw new Error('未找到 Chrome');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0; const waiting = new Map(); const events = [];
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && waiting.has(m.id)) {
      const { resolve, reject } = waiting.get(m.id); waiting.delete(m.id);
      m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
    } else if (m.method) events.push(m);
  });
  const ready = new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true });
    ws.addEventListener('error', rej, { once: true });
  });
  return {
    send: async (m, p = {}, s) => { await ready; const i = ++id;
      return new Promise((resolve, reject) => { waiting.set(i, { resolve, reject });
        ws.send(JSON.stringify({ id: i, method: m, params: p, sessionId: s })); }); },
    events, close: () => ws.close(),
  };
}

(async () => {
  const cdpPort = 9340 + Math.floor(Math.random() * 200);
  const profile = path.join(os.tmpdir(), 'qingshi-dev-' + process.pid);
  const chrome = spawn(chromePath(), ['--headless=new', `--remote-debugging-port=${cdpPort}`,
    '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    `--user-data-dir=${profile}`, '--window-size=1280,720', 'about:blank'], { stdio: 'ignore' });
  let c = null;
  try {
    let ws = null;
    for (let i = 0; i < 80 && !ws; i++) {
      try { const r = await fetch(`http://127.0.0.1:${cdpPort}/json/version`); if (r.ok) ws = (await r.json()).webSocketDebuggerUrl; } catch { /* 等 */ }
      if (!ws) await sleep(250);
    }
    c = cdp(ws);
    const { targetId } = await c.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await c.send('Target.attachToTarget', { targetId, flatten: true });
    await c.send('Runtime.enable', {}, sessionId);
    await c.send('Log.enable', {}, sessionId);
    await c.send('Page.enable', {}, sessionId);
    await c.send('Page.navigate', { url: URL }, sessionId);
    await sleep(3500);

    const probe = await c.send('Runtime.evaluate', {
      expression: `(() => ({
        hasQS: !!window.__QS__,
        stage: !!document.querySelector('.stage'),
        main: !!document.querySelector('.stage__main'),
        bg: document.querySelector('.stage')?.getAttribute('data-bg'),
        appHtmlLen: (document.getElementById('app')||{}).innerHTML?.length || 0,
      }))()`, returnByValue: true }, sessionId);

    const errs = c.events
      .filter((e) => e.method === 'Log.entryAdded' && e.params.entry.level === 'error')
      .map((e) => e.params.entry.text);

    console.log('dev 页面状态:', JSON.stringify(probe.result.value));
    console.log('控制台错误:', errs.length ? errs : '无');
    const ok = probe.result.value.hasQS && probe.result.value.stage && errs.length === 0;
    console.log(ok ? '\n[PASS] dev 模式可��' : '\n[FAIL] dev 模式异常');
    c.close();
    process.exit(ok ? 0 : 1);
  } catch (e) {
    console.error('[驱动失败]', e.message);
    process.exit(1);
  } finally {
    if (c) c.close();
    chrome.kill();
    try { require('node:fs').rmSync(profile, { recursive: true, force: true }); } catch { /* noop */ }
  }
})();