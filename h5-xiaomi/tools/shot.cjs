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

// 把页面推到指定相位。推进逻辑与 tests/lib/harness.cjs 的 advanceOnce 同口径:
// 浮层 → 底部选项区 → 正文区内联(dock 钉在文本区底部)→ 点正文跳过逐字 reveal。
// target: intro | round | event | choice | summary
//        | settle(停在结算浮层) | confirm(打开回溯确认浮层)
const GO = `(async (target) => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const q = s => document.querySelector(s), qa = s => [...document.querySelectorAll(s)];
  const g = window.__QS__.game;
  const overlayOpen = () => { const o = q('.overlay'); return o && !o.hidden; };
  const isRevealing = () => !!(window.__QS__ && window.__QS__.session && window.__QS__.session.isRevealing);
  const tapMain = () => {
    const m = q('.stage__main');
    if (!m) return false;
    m.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    return true;
  };
  const clickCard = () => {
    const c = qa('.stage__foot .card--action').filter(x => x.getAttribute('role') === 'button')[0];
    if (c) { c.click(); return true; }
    return false;
  };
  const advanceOnce = () => {
    if (overlayOpen()) { q('.overlay .btn--primary')?.click(); return true; }
    const foot = q('.stage__foot');
    if (foot) {
      const tap = foot.querySelector('.card--tappable');
      if (tap) { tap.click(); return true; }
      const act = foot.querySelector('.card--action[role="button"]');
      if (act) { act.click(); return true; }
      const btn = foot.querySelector('.btn--primary');
      if (btn) { btn.click(); return true; }
    }
    const main = q('.stage__main');
    if (main && !isRevealing()) {
      const tap = main.querySelector('.card--tappable');
      if (tap) { tap.click(); return true; }
      const btn = main.querySelector('.btn--primary');
      if (btn) { btn.click(); return true; }
    }
    if (isRevealing()) return tapMain();
    return false;
  };
  for (let i = 0; i < 800; i++) {
    if (target === 'intro') break;
    await sleep(25);
    if (target === 'settle') {
      if (g.phase === 'round' && clickCard()) { await sleep(400); break; }
      if (overlayOpen()) { q('.overlay .btn--primary')?.click(); continue; }
    }
    if (target === 'confirm') {
      if (g.phase === 'round') { q('.backbtn')?.click(); await sleep(300); break; }
    }
    const ph = g.phase;
    if (ph === target) break;
    // 抉择卡目标:回合里优先点「事有两端」卡(抉择类型挂 t-jue 类),没发到才普通推进
    if (target === 'choice' && ph === 'round') {
      const jue = qa('.stage__foot .card--action.t-jue').filter(x => x.getAttribute('role') === 'button')[0];
      if (jue) { jue.click(); continue; }
    }
    advanceOnce();
  }
  // 到站后再等正文 reveal 完、选项真正挂上(抉择/事件选项在文本区 dock 里)
  for (let i = 0; i < 200; i++) {
    await sleep(25);
    if (isRevealing()) { tapMain(); continue; }
    if (qa('.stage__main .card--tappable, .stage__foot .card--tappable, .stage__foot .card--action[role="button"]').length > 0) break;
    if (g.phase !== target && target !== 'settle' && target !== 'confirm') break;
    if (i > 40) break;
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

    // 动线:主菜单(.menu__item--start「入 局」)→ 选择页 → 漩涡(.selenter)→ 对局页。
    // intro 目标就停在主菜单;select 只点第一下;对局目标两下都点再跑 GO。
    const MENU_ENTER = "document.querySelector('.menu__item--start')?.click()";
    const SEL_ENTER = "document.querySelector('.selenter')?.click()";
    if (target === 'resume') {
      // 走一遍真实退出路径,好让选择页出现「继续上局」
      await c.send('Runtime.evaluate', { expression: MENU_ENTER, returnByValue: true }, sessionId);
      await sleep(300);
      await c.send('Runtime.evaluate', { expression: SEL_ENTER, returnByValue: true }, sessionId);
      await sleep(600);
      await c.send('Runtime.evaluate',
        { expression: 'window.__QS__.goSelect()', returnByValue: true }, sessionId);
      await sleep(500);
    } else if (target === 'saves') {
      // 走真实用户路径:主菜单横排次级项点「存 档」。
      // 不能直接调 __QS__.goSaves() —— 此时还没入局,__QS__ 根本不存在。
      await c.send('Runtime.evaluate',
        { expression: "[...document.querySelectorAll('.menu__item--sub')].find(b => b.textContent.includes('存'))?.click()", returnByValue: true }, sessionId);
      await sleep(600);
    } else if (target !== 'intro') {
      await c.send('Runtime.evaluate', { expression: MENU_ENTER, returnByValue: true }, sessionId);
      await sleep(300);
      if (target !== 'select') {
        await c.send('Runtime.evaluate', { expression: SEL_ENTER, returnByValue: true }, sessionId);
        await sleep(700);
      }
    }
    if (target !== 'select' && target !== 'intro' && target !== 'resume' && target !== 'saves') {
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
    // 同 harness.cjs:等 chrome 退出再删 profile,否则 Windows 上 rm 必败,Temp 泄漏
    await new Promise((r) => { chrome.once('exit', r); setTimeout(r, 3000); });
    for (let i = 0; i < 5; i++) {
      try { fs.rmSync(profile, { recursive: true, force: true }); break; } catch { await sleep(400); }
    }
  }
})();