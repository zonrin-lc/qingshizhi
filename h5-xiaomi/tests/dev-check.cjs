'use strict';
/**
 * dev 模式冒烟:验证 vite dev server 下页面真的能起来。
 *
 * 为什么需要:tests/ 三套都跑 dist/ 构建产物,dev 路径(vite dev + optimizeDeps)
 * 平时没人碰。已知历史问题就是 dev 下 @engine 的 UMD 拿不到 default 导出而白屏,
 * 所以这里专门盯 dev。
 *
 * 2026-10-21 改:这套原先不在 run-all 的 ALL 列表里(要人手动起 dev server),
 * 于是 dev 路径长期没人跑 —— 正是它坏掉的时候没人知道。
 * 现在它自己管端口:默认连 http://localhost:5173/(用户自己起的 dev server),
 * 连不上就自己起一个临时的 vite dev server(随机端口),跑完再收掉。
 *
 * 用法:先 npm run dev,再 node tests/dev-check.cjs [url]
 */
const { spawn } = require('node:child_process');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const fs = require('node:fs');

const H5 = path.resolve(__dirname, '..');
const DEFAULT_URL = 'http://localhost:5173/';

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

/** 向系统要一个空闲端口(只用来起临时的 dev server) */
function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.on('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

/** 探一下某个 url 通不通 */
async function reachable(url, timeoutMs = 1500) {
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), timeoutMs);
    const r = await fetch(url, { signal: ac.signal });
    clearTimeout(t);
    return r.ok || r.status < 500;
  } catch {
    return false;
  }
}

/**
 * 起一个临时的 vite dev server,返回 { proc, url }。
 * 用 node_modules 里的 vite 直起,不走 npm run dev(那会先跑 verify:data,
 * 而且会和用户自己起的 5173 撞端口)。
 */
async function startDevServer() {
  const vite = path.join(H5, 'node_modules', 'vite', 'bin', 'vite.js');
  if (!fs.existsSync(vite)) throw new Error(`找不到 vite:${vite}(先 npm install)`);
  const port = await freePort();
  const proc = spawn(process.execPath, [vite, '--port', String(port), '--strictPort', '--host', '127.0.0.1'], {
    cwd: H5, stdio: 'ignore',
  });
  const url = `http://127.0.0.1:${port}/`;
  for (let i = 0; i < 120; i += 1) {
    if (await reachable(url, 800)) return { proc, url };
    if (proc.exitCode !== null) break;
    await sleep(250);
  }
  proc.kill();
  throw new Error(`临时 dev server 起不来:${url}`);
}

(async () => {
  // 用户自己起的 dev server 优先;没有就自己起一个临时的
  let devProc = null;
  let URL = process.argv[2] || DEFAULT_URL;
  if (!(await reachable(URL))) {
    console.log(`[dev-check] ${URL} 不通,自己起一个临时 dev server`);
    const started = await startDevServer();
    devProc = started.proc;
    URL = started.url;
  }

  const cdpPort = 9340 + Math.floor(Math.random() * 200);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'qingshi-dev-'));
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

    // 入口动线:主菜单 → 选择页 → 对局页(对齐封存 Lua 版 home.lua)。
    // 分三步验:先确认主菜单渲染,再点「开 始 游 戏」确认选择页,最后点漩涡入局。
    const probe = await c.send('Runtime.evaluate', {
      expression: `(() => ({
        hasMenu: !!document.querySelector('.menu'),
        hasStart: !!document.querySelector('.menu__item--start'),
        items: document.querySelectorAll('.menu__item').length,
        labels: [...document.querySelectorAll('.menu__item')].map(x => (x.textContent||'').replace(/\\s+/g, '')),
        bg: document.querySelector('.stage')?.getAttribute('data-bg'),
        appHtmlLen: (document.getElementById('app')||{}).innerHTML?.length || 0,
      }))()`, returnByValue: true }, sessionId);
    const menu = probe.result.value;

    await c.send('Runtime.evaluate',
      { expression: `document.querySelector('.menu__item--start')?.click()`, returnByValue: true }, sessionId);
    await sleep(500);
    const probeSel = await c.send('Runtime.evaluate', {
      expression: `(() => ({
        hasSelect: !!document.querySelector('.select'),
        cards: document.querySelectorAll('.scard2').length,
        hasEnter: !!document.querySelector('.selenter'),
        wheel: !!document.querySelector('.dwheel'),
        bg: document.querySelector('.stage')?.getAttribute('data-bg'),
      }))()`, returnByValue: true }, sessionId);
    const sel = probeSel.result.value;

    await c.send('Runtime.evaluate',
      { expression: `document.querySelector('.selenter')?.click()`, returnByValue: true }, sessionId);
    await sleep(1200);
    const probe2 = await c.send('Runtime.evaluate', {
      expression: `(() => ({
        hasQS: !!window.__QS__,
        game: !!window.__QS__?.game,
        main: (document.querySelector('.stage__main')||{}).innerHTML?.length || 0,
        bg: document.querySelector('.stage')?.getAttribute('data-bg'),
      }))()`, returnByValue: true }, sessionId);
    const gm = probe2.result.value;

    const errs = c.events
      .filter((e) => e.method === 'Log.entryAdded' && e.params.entry.level === 'error')
      .map((e) => e.params.entry.text);

    console.log('主菜单:', JSON.stringify(menu));
    console.log('选择页:', JSON.stringify(sel));
    console.log('入局后:', JSON.stringify(gm));
    console.log('控制台错误:', errs.length ? errs : '无');
    // 入口项按「文案」判,不再数个数:
    // 原来写死 items === 5,后来主菜单多了「继 续 旅 程」胶囊(6 个 .menu__item),
    // 这条断言就一直红着 —— 因为这套压根不在 run-all 列表里,没人跑过。
    const labels = menu.labels || [];
    const needLabels = ['入局', '存档', '图鉴', '设置', '退出'];
    const ok = menu.hasMenu && menu.hasStart && needLabels.every((l) => labels.some((x) => x.includes(l)))
      && menu.bg === 'menu'
      && sel.hasSelect && sel.cards === 5 && sel.hasEnter && sel.wheel && sel.bg === 'select'
      && gm.hasQS && gm.game && gm.main > 0 && gm.bg === 'game' && errs.length === 0;
    console.log(ok ? '\n[PASS] dev 模式可用(主菜单 → 选择页 → 对局页)' : '\n[FAIL] dev 模式异常');
    c.close();
    process.exit(ok ? 0 : 1);
  } catch (e) {
    console.error('[驱动失败]', e.message);
    process.exit(1);
  } finally {
    if (c) c.close();
    chrome.kill();
    if (devProc) devProc.kill();
    try { require('node:fs').rmSync(profile, { recursive: true, force: true }); } catch { /* noop */ }
  }
})();
