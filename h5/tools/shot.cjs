/**
 * 截图工具:把当前页面存成 PNG,用于和参考图比对。
 *
 * 用法:
 *   node tools/shot.cjs out.png                    # 默认 1280x720,停在章首
 *   node tools/shot.cjs out.png 1280 720 event     # 走到事件页
 *   node tools/shot.cjs out.png 667 375 round      # 小屏回合页
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');

const DIST = path.resolve(__dirname, '..', 'dist');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.webp': 'image/webp', '.png': 'image/png',
  '.json': 'application/json', '.map': 'application/json', '.svg': 'image/svg+xml',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function chromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const cands = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    path.join(os.homedir(), 'AppData/Local/Google/Chrome/Application/chrome.exe'),
  ];
  for (const c of cands) if (fs.existsSync(c)) return c;
  throw new Error('未找到 Chrome,设 CHROME_PATH');
}

function freePort() {
  return new Promise((res) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); });
  });
}

function serve() {
  const abs = path.resolve(DIST);
  const srv = http.createServer((req, res) => {
    let p = decodeURIComponent((req.url || '/').split('?')[0]);
    if (p.endsWith('/')) p += 'index.html';
    const f = path.join(abs, p);
    if (!f.startsWith(abs) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
      res.writeHead(404); return res.end();
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => r({ srv, port: srv.address().port })));
}

function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0; const waiting = new Map();
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && waiting.has(m.id)) {
      const { resolve, reject } = waiting.get(m.id); waiting.delete(m.id);
      m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
    }
  });
  const ready = new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true });
    ws.addEventListener('error', rej, { once: true });
  });
  return {
    send: async (method, params = {}, sessionId) => {
      await ready; const mid = ++id;
      return new Promise((resolve, reject) => {
        waiting.set(mid, { resolve, reject });
        ws.send(JSON.stringify({ id: mid, method, params, sessionId }));
      });
    },
    close: () => ws.close(),
  };
}

// 把页面推到指定相位。
// target: intro | round | event | choice | summary
//        | settle(停在结算浮层) | confirm(打开回溯确认浮层)
const GO = `(async (target) => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const q = s => document.querySelector(s), qa = s => [...document.querySelectorAll(s)];
  const g = window.__QS__.game;
  const overlayOpen = () => { const o = q('.overlay'); return o && !o.hidden; };
  const clickCard = () => {
    const c = qa('.stage__foot .card--action').filter(x => x.getAttribute('role') === 'button')[0];
    if (c) { c.click(); return true; }
    return false;
  };
  for (let i = 0; i < 400; i++) {
    if (target === 'intro') break;
    await sleep(6);
    if (target === 'settle') {
      if (g.phase === 'round' && clickCard()) { await sleep(400); break; }
      if (overlayOpen()) { q('.overlay .btn--primary')?.click(); continue; }
    }
    if (target === 'confirm') {
      if (g.phase === 'round') { q('.backbtn')?.click(); await sleep(300); break; }
    }
    if (overlayOpen()) { q('.overlay .btn--primary')?.click(); continue; }
    const ph = g.phase;
    if (ph === target) break;
    if (ph === 'intro') { q('.stage__foot .btn--primary')?.click(); continue; }
    if (ph === 'round') {
      const c = qa('.stage__foot .card').filter(x => x.getAttribute('role') === 'button')[0];
      if (c) { c.click(); continue; }
      clickCard(); continue;
    }
    if (ph === 'event' || ph === 'choice') { qa('.stage__foot .card--tappable')[0]?.click(); continue; }
    if (ph === 'summary') { q('.stage__foot .btn--primary')?.click(); continue; }
  }
  await sleep(500);
  return g.phase;
})`;

(async () => {
  const outArg = process.argv[2] || 'shot.png';
  const W = Number(process.argv[3] || 1280);
  const H = Number(process.argv[4] || 720);
  const target = process.argv[5] || 'intro';
  const out = path.resolve(process.cwd(), outArg);

  const { srv, port } = await serve();
  const cdpPort = await freePort();
  const profile = path.join(os.tmpdir(), 'qingshi-shot-' + process.pid);
  const chrome = spawn(chromePath(), [
    '--headless=new', `--remote-debugging-port=${cdpPort}`, '--disable-gpu',
    '--hide-scrollbars', '--force-device-scale-factor=1',
    '--no-first-run', '--no-default-browser-check', `--user-data-dir=${profile}`,
    `--window-size=${W},${H}`, 'about:blank',
  ], { stdio: 'ignore' });

  let c = null;
  try {
    let wsUrl = null;
    for (let i = 0; i < 80 && !wsUrl; i++) {
      try { const r = await fetch(`http://127.0.0.1:${cdpPort}/json/version`); if (r.ok) wsUrl = (await r.json()).webSocketDebuggerUrl; } catch { /* 等 */ }
      if (!wsUrl) await sleep(250);
    }
    c = cdp(wsUrl);
    const { targetId } = await c.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await c.send('Target.attachToTarget', { targetId, flatten: true });
    await c.send('Runtime.enable', {}, sessionId);
    await c.send('Page.enable', {}, sessionId);
    await c.send('Emulation.setDeviceMetricsOverride',
      { width: W, height: H, deviceScaleFactor: 1, mobile: false }, sessionId);
    await c.send('Page.navigate', { url: `http://127.0.0.1:${port}/` }, sessionId);
    await sleep(1200);

    // P3 起应用入口是「选择页」,对局相关目标要先点一次「入 局」
    if (target === 'resume') {
      // 走一遍真实退出路径,好让选择页出现「继续上局」
      await c.send('Runtime.evaluate',
        { expression: "document.querySelector('.enterbtn')?.click()", returnByValue: true }, sessionId);
      await sleep(600);
      await c.send('Runtime.evaluate',
        { expression: 'window.__QS__.goSelect()', returnByValue: true }, sessionId);
      await sleep(500);
    } else if (target === 'saves') {
      // 走真实用户路径:选择页上点「档案」。
      // 不能直接调 __QS__.goSaves() —— 此时还没入局,__QS__ 根本不存在。
      await c.send('Runtime.evaluate',
        { expression: "document.querySelector('.savebtn')?.click()", returnByValue: true }, sessionId);
      await sleep(600);
    } else if (target !== 'select' && target !== 'intro') {
      await c.send('Runtime.evaluate',
        { expression: "document.querySelector('.enterbtn')?.click()", returnByValue: true }, sessionId);
      await sleep(700);
    }
    if (target !== 'select' && target !== 'intro') {
      const r = await c.send('Runtime.evaluate',
        { expression: `${GO}(${JSON.stringify(target)})`, awaitPromise: true, returnByValue: true }, sessionId);
      console.log('phase =', r.result.value);
    }
    await sleep(600);
    const shot = await c.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }, sessionId);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, Buffer.from(shot.data, 'base64'));
    console.log('saved', out, `${W}x${H}`, (fs.statSync(out).size / 1024).toFixed(0) + ' KB');
    c.close();
  } catch (e) {
    console.error('失败:', e.message);
    process.exitCode = 1;
  } finally {
    if (c) c.close();
    chrome.kill();
    srv.close();
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* noop */ }
  }
})();