/**
 * 浏览器验收测试的公共设施:静态服务 + Chrome + CDP。
 *
 * 设计取舍:
 * - 不引 Playwright/Puppeteer。Node 18+ 自带 WebSocket,直接说 CDP 就够了,
 *   也就不用往 h5/ 里塞几百 KB 的测试依赖(与 P6 首屏瘦身目标一致)。
 * - 端口动态分配,避免并行跑或本机已有服务时撞端口。
 * - 路径全部相对 __dirname 解析,clone 到任意位置都能跑。
 */
'use strict';

const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const DIST = path.resolve(__dirname, '..', '..', 'dist');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ============================================================================
 * UTF-8 报告(2026-10-21 加)
 *
 * 控制台仍然只打 ASCII 短标记(ok / FAIL),但完整判定明细另写一份
 * tests/.report/<套名>.txt(UTF-8)。原因很实在:失败详情原先只写 stdout,
 * 一旦把输出重定向到文件,Windows 上按 cp936 解码就是一堆乱码,
 * 事后根本分不清「这条断言失败了」还是「这里只是编码不对」。
 * ========================================================================== */
const REPORT_DIR = path.resolve(__dirname, '..', '.report');
const reportLines = [];
{
  const suiteName = path.basename(process.argv[1] || 'suite').replace(/\.[cm]?js$/, '');
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  const tee = (orig) => (chunk, enc, cb) => {
    try { reportLines.push(String(chunk)); } catch { /* 报告写失败不许影响测试结果 */ }
    return orig(chunk, enc, cb);
  };
  process.stdout.write = tee(origOut);
  process.stderr.write = tee(origErr);
  process.on('exit', () => {
    try {
      fs.mkdirSync(REPORT_DIR, { recursive: true });
      const head = [
        `# ${suiteName}`,
        `# 生成时间: ${new Date().toISOString()}`,
        '# 说明:控制台只打 ASCII 短标记,本文件是同一份输出的 UTF-8 版本(失败详情看这里)',
        '',
        '',
      ].join('\n');
      fs.writeFileSync(path.join(REPORT_DIR, `${suiteName}.txt`), head + reportLines.join(''), 'utf8');
    } catch { /* 写不出报告就算了,不影响退出码 */ }
  });
}

/** 定位 Chrome:环境变量优先,否则按平台猜常见安装位置 */
function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const home = os.homedir();
  const candidates =
    process.platform === 'win32'
      ? [
          'C:/Program Files/Google/Chrome/Application/chrome.exe',
          'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
          path.join(home, 'AppData/Local/Google/Chrome/Application/chrome.exe'),
        ]
      : process.platform === 'darwin'
        ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
        : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome-stable'];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  throw new Error('未找到 Chrome。请设置环境变量 CHROME_PATH 指向浏览器可执行文件。');
}

/**
 * 向系统要一个空闲端口。
 *
 * ⚠ 这里只作**兜底**用:「先占后放」有 TOCTOU 窗口 —— 占到端口到真正监听之间
 * 别的进程(并行跑的测试套、用户自己起的服务)完全可能抢走它。
 * 正常路径是让 Chrome 自己挑端口(--remote-debugging-port=0),
 * 再从 profile/DevToolsActivePort 读回真实端口,见 launchChrome。
 */
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

/**
 * 从 Chrome 的 profile 里读回它自己挑的调试端口。
 *
 * 传 --remote-debugging-port=0 时,Chrome 会挑一个空闲端口并把
 * 「端口号\n浏览器 ws 路径」写进 <user-data-dir>/DevToolsActivePort。
 * 这样端口由内核分配,不存在自己占后放出的竞态窗口。
 */
async function readDevToolsPort(profile, timeoutMs = 15000) {
  const f = path.join(profile, 'DevToolsActivePort');
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      const txt = fs.readFileSync(f, 'utf8');
      const line = txt.split(/\r?\n/)[0].trim();
      if (/^\d+$/.test(line)) return Number(line);
    } catch { /* 还没落盘 */ }
    await sleep(100);
  }
  return null;
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  // BGM:必须给对 MIME,否则 Chromium 拿到 application/octet-stream 会拒绝解码,
  // 表现为「文件下到了但没声音」,很容易被误判成音量或 autoplay 问题
  '.webm': 'audio/webm',
  '.m4a': 'audio/mp4',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
};

/** 静态服务 dist/。注意:防目录穿越,别把仓库根暴露出去。 */
function serve(root) {
  const abs = path.resolve(root);
  const srv = http.createServer(async (req, res) => {
    let p = decodeURIComponent((req.url || '/').split('?')[0]);
    if (p.endsWith('/')) p += 'index.html';
    const f = path.join(abs, p);
    // 目录穿越防护:解析后必须仍在 dist 内
    const missing = () => !f.startsWith(abs) || !fs.existsSync(f) || fs.statSync(f).isDirectory();
    if (missing()) {
      // Defender 实时扫描会在构建后的短时间内锁住新写入的文件,existsSync
      // 偶发 false → 随机 404(「控制台无错误」项抖动,1 次或多次不定,
      // 同一文件事后又能 200)。等一拍重试再判,仍缺才是真 404。
      await sleep(25);
      if (missing()) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        return res.end('not found');
      }
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise((resolve, reject) => {
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => resolve({ srv, port: srv.address().port }));
  });
}

async function waitCdp(port, tries = 80) {
  for (let i = 0; i < tries; i += 1) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (r.ok) return (await r.json()).webSocketDebuggerUrl;
    } catch {
      /* 还没起来 */
    }
    await sleep(250);
  }
  throw new Error('Chrome 调试端口未就绪');
}

/** 极简 CDP 客户端 */
function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const waiting = new Map();
  const events = [];
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && waiting.has(m.id)) {
      const { resolve, reject } = waiting.get(m.id);
      waiting.delete(m.id);
      if (m.error) reject(new Error(JSON.stringify(m.error)));
      else resolve(m.result);
    } else if (m.method) events.push(m);
  });
  const ready = new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true });
    ws.addEventListener('error', rej, { once: true });
  });
  const send = async (method, params = {}, sessionId) => {
    await ready;
    const mid = ++id;
    return new Promise((resolve, reject) => {
      waiting.set(mid, { resolve, reject });
      ws.send(JSON.stringify({ id: mid, method, params, sessionId }));
    });
  };
  return { send, events, close: () => ws.close() };
}

/**
 * 起一套「服务 + 浏览器 + 页面」交给 fn,结束自动清理。
 *
 * fn 收到 { evaluate, cdp, url, consoleErrors, setViewport }
 */
async function withPage(fn, opts = {}) {
  if (!fs.existsSync(DIST)) {
    throw new Error(`找不到构建产物 ${DIST}——请先运行 npm run build`);
  }
  const { srv, port: httpPort } = await serve(DIST);
  const { chrome, profile, cdpPort } = await launchChrome();

  let client = null;
  try {
    client = cdp(await waitCdp(cdpPort));
    const { targetId } = await client.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await client.send('Target.attachToTarget', { targetId, flatten: true });
      await client.send('Runtime.enable', {}, sessionId);
      await client.send('Log.enable', {}, sessionId);
      await client.send('Page.enable', {}, sessionId);
      await client.send('Network.enable', {}, sessionId);
      // 页面脚本运行前注入(tapcloud.cjs 用它预置 window.tap 的 TapTap 容器 mock;
      // tapcloud-conflict.cjs / corrupt-store.cjs 用它在应用启动前预置 localStorage)
      if (opts.inject) {
        await client.send('Page.addScriptToEvaluateOnNewDocument', { source: opts.inject }, sessionId);
      }

      // 网络流水:用来断言「只下了一个音频文件」「没有 404」这类
      // 光看 DOM 看不见的事实。cdp() 把事件缓在 client.events 里,这里现算。
      let netMark = 0;
      const netLog = () => {
        const rows = new Map();
        for (const e of client.events.slice(netMark)) {
          const r = e.params?.request;
          const u = e.params?.request?.url || e.params?.response?.url;
          if (!u) continue;
          let row = rows.get(u);
          if (!row) rows.set(u, (row = { url: u, status: 0, mime: '' }));
          if (r) row.method = r.method;
          if (e.params.response) {
            row.status = e.params.response.status;
            row.mime = e.params.response.mimeType;
          }
          if (e.method === 'Network.loadingFailed') row.status = -1;
        }
        return [...rows.values()];
      };
      const netReset = () => { netMark = client.events.length; };

      /**
       * 网络流水(带时刻):用来断言「同时在途的请求数 ≤ 1」这种并发事实。
       * netLog() 按 URL 归并,看不出并发;这里每个请求都留起止时刻
       * (Network.requestWillBeSent / loadingFinished 的 timestamp)。
       */
      const netTimeline = () => {
        const rows = [];
        const byId = new Map();
        for (const e of client.events.slice(netMark)) {
          if (e.method === 'Network.requestWillBeSent') {
            const row = {
              url: e.params.request.url,
              start: e.params.timestamp,
              end: null,
              status: 0,
              mime: '',
              failed: false,
            };
            byId.set(e.params.requestId, row);
            rows.push(row);
          } else if (e.method === 'Network.responseReceived') {
            const row = byId.get(e.params.requestId);
            if (row) {
              row.status = e.params.response.status;
              row.mime = e.params.response.mimeType;
            }
          } else if (e.method === 'Network.loadingFinished' || e.method === 'Network.loadingFailed') {
            const row = byId.get(e.params.requestId);
            if (row) {
              row.end = e.params.timestamp;
              row.failed = e.method === 'Network.loadingFailed';
            }
          }
        }
        return rows;
      };

    const url = `http://127.0.0.1:${httpPort}/`;

    /**
     * 控制台错误 + 未捕获异常。
     *
     * - 按 sessionId 过滤:多标签(测试自己会另开一个 target 逼页面进后台)
     *   时,别的标签的错误不该算到本套头上。
     * - 未捕获异常优先取 exceptionDetails.exception.description:
     *   exceptionDetails.text 实测就是 "Uncaught"(没有栈、没有消息),
     *   真正的报错文本全在 description 里,只取 text 等于什么都没拿到。
     */
    const consoleErrors = () =>
      client.events
        .filter((e) => e.sessionId === sessionId && e.method === 'Log.entryAdded' && e.params.entry.level === 'error')
        .map((e) => {
          const en = e.params.entry;
          const where = en.url ? ` @${String(en.url).split('/').pop()}:${en.lineNumber ?? '?'}` : '';
          return `${en.text}${where}`;
        })
        .concat(
          client.events
            .filter((e) => e.sessionId === sessionId && e.method === 'Runtime.exceptionThrown')
            .map((e) => {
              const d = e.params.exceptionDetails || {};
              const ex = d.exception;
              if (ex && (ex.description || ex.value !== undefined)) {
                return String(ex.description || ex.value);
              }
              return d.text || 'Uncaught(无描述)';
            }),
        );

    const load = async (w = 1280, h = 720, dsf = 1) => {
      await client.send(
        'Emulation.setDeviceMetricsOverride',
        { width: w, height: h, deviceScaleFactor: dsf, mobile: false },
        sessionId,
      );
      await client.send('Page.navigate', { url }, sessionId);
      await sleep(opts.settleMs || 900);
      // 等应用真的起来(主菜单渲染完)再往下走。固定 sleep 在机器忙/首启冷缓存时
      // 偶发不够,表现为「批量跑时大批用例莫名失败、单独跑又都好」——
      // 那些用例等的是 window.__QS__,应用没起来自然就 undefined。
      for (let i = 0; i < 60; i += 1) {
        const r = await client.send(
          'Runtime.evaluate',
          { expression: `!!document.querySelector('.menu__item--start')`, returnByValue: true },
          sessionId,
        );
        if (r.result && r.result.value) return;
        await sleep(150);
      }
      // 等不到主菜单 = 应用没起来(白屏/脚本崩了/构建产物不对)。
      // 原来这里静默 return,于是后面每一条断言都以「元素不存在」的面孔出现,
      // 定位成本极高(看起来像十几条断言一起坏,其实是应用根本没跑起来)。
      // 现在直接抛错,并把控制台错误一起带出去。
      const errs = consoleErrors();
      throw new Error([
        `应用没起来:9 秒内没等到主菜单(.menu__item--start)`,
        `控制台错误(${errs.length} 条):`,
        ...errs.map((e) => `  ${e}`),
        errs.length ? '' : '  (无 —— 白屏多半是构建产物不对或脚本没加载)',
      ].join('\n'));
    };
    await load(...(opts.viewport || []));

    /** 在页面里跑一段 async 表达式并取回可序列化结果 */
    const evaluate = async (expression) => {
      const r = await client.send(
        'Runtime.evaluate',
        { expression, awaitPromise: true, returnByValue: true },
        sessionId,
      );
      if (r.exceptionDetails) {
        const d = r.exceptionDetails;
        throw new Error(`页内异常: ${(d.exception && (d.exception.description || d.exception.value)) || d.text}`);
      }
      return r.result.value;
    };

    /**
     * 发一个真实按键(CDP Input)。
     *
     * 全仓 20 套测试原先没有一处派发过 keydown —— 键盘路径完全没被覆盖。
     * 这里走 CDP 而不是页内 dispatchEvent:合成事件不带用户激活,
     * 浏览器对「空格/回车触发按钮」的默认行为也不认,测出来的东西不是真的。
     */
    const KEYS = {
      Tab: { key: 'Tab', code: 'Tab', vk: 9 },
      Enter: { key: 'Enter', code: 'Enter', vk: 13, text: '\r' },
      ' ': { key: ' ', code: 'Space', vk: 32, text: ' ' },
      Escape: { key: 'Escape', code: 'Escape', vk: 27 },
      ArrowDown: { key: 'ArrowDown', code: 'ArrowDown', vk: 40 },
      ArrowUp: { key: 'ArrowUp', code: 'ArrowUp', vk: 38 },
    };
    const pressKey = async (name, times = 1) => {
      const k = KEYS[name];
      if (!k) throw new Error(`未知按键: ${name}`);
      for (let i = 0; i < times; i += 1) {
        const base = {
          key: k.key, code: k.code,
          windowsVirtualKeyCode: k.vk, nativeVirtualKeyCode: k.vk,
        };
        await client.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...base }, sessionId);
        if (k.text) {
          await client.send('Input.dispatchKeyEvent', { type: 'char', key: k.key, text: k.text, unmodifiedText: k.text }, sessionId);
        }
        await client.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base }, sessionId);
        await sleep(30);
      }
    };

    /**
     * 从主菜单入局。
     *
     * 入口动线是「主菜单 → 选择页 → 对局页」(对齐封存 Lua 版 home.lua),
     * 所以对局相关的测试要先点「开 始 游 戏」再点漩涡「入局」,
     * 否则 window.__QS__.game 根本不存在。
     * 这一步同时验证了主菜单 → 选择页 → 对局页的跳转本身。
     */
    const enterGame = async () => {
      await sleep(250);
      const r = await client.send(
        'Runtime.evaluate',
        {
          expression: `(async () => {
            const sleep = ms => new Promise(r => setTimeout(r, ms));
            const start = document.querySelector('.menu__item--start');
            if (start) { start.click(); await sleep(150); }
            const b = document.querySelector('.selenter');
            if (!b) return { ok: false, why: 'no .selenter (不在选择页?)' };
            b.click();
            return { ok: true };
          })()`,
          returnByValue: true,
          awaitPromise: true,
        },
        sessionId,
      );
      await sleep(opts.settleMs || 900);
      const chk = await client.send(
        'Runtime.evaluate',
        { expression: `!!window.__QS__ && !!window.__QS__.game && !!document.querySelector('.stage__main')`, returnByValue: true },
        sessionId,
      );
      if (!r.result.value.ok) throw new Error(`入局失败: ${r.result.value.why}`);
      if (!chk.result.value) throw new Error('点了入局但 __QS__.game 没出现');
    };

    // 默认直接入局;需要测选择页本身时传 { enter: false }
    if (opts.enter !== false) await enterGame();

    return await fn({
      evaluate, cdp: client, url, consoleErrors, load, sessionId, enterGame,
      netLog, netReset, netTimeline, pressKey,
    });
  } finally {
    if (client) client.close();
    // 强杀:Windows 上 chrome 常忽略 SIGTERM 拖住 profile 目录不释放,
    // 临时目录里会攒出几百个 qingshi-cdp-*(每个几十 MB),拖慢后续每套的启动,
    // 表现为「整套批量跑时大批用例莫名失败、单独跑又都好」——那正是它干的。
    // SIGKILL 在 Windows 上即 TerminateProcess,进程一落 profile 就解锁。
    chrome.kill('SIGKILL');
    srv.close();
    // 等进程真正退出再删目录,删不掉就多兜几轮
    await new Promise((r) => { chrome.once('exit', r); setTimeout(r, 5000); });
    for (let i = 0; i < 12; i++) {
      try {
        fs.rmSync(profile, { recursive: true, force: true });
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 300));
      }
    }
  }
}

/**
 * 起 headless Chrome。
 *
 * profile:mkdtemp 生成唯一目录。原来的「pid + 端口」拼名会撞目录
 * (端口复用 + 同 pid 的两套并行),撞上时两个 Chrome 共用一个 profile,
 * 行为不可复现,而且旧 profile 的残留状态会污染下一轮。
 *
 * 端口:先试 --remote-debugging-port=0(Chrome 自己挑,再从
 * profile/DevToolsActivePort 读回),失败才退回 freePort() 自己挑。
 */
async function launchChrome() {
  const mkProfile = () => fs.mkdtempSync(path.join(os.tmpdir(), 'qingshi-cdp-'));
  const args = (profile, port) => [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    // 合成 click 不算用户手势,不开这个旗标音频全程被 autoplay 策略压着,
    // 「隐藏暂停/回前台续播」这类真实播放状态就没法验
    '--autoplay-policy=no-user-gesture-required',
    // 测试要验的是「元素在不在播」(paused/volume/网络请求),不是「扬声器有没有响」。
    // 不加这条,headless Chrome 会真的出声——整轮测试在用户机器上放 BGM,
    // 页面关掉/测试跑完后还余音绕梁(2026-10-20 用户报:关了游戏界面音乐还在响)。
    '--mute-audio',
    `--user-data-dir=${profile}`,
    '--window-size=1280,720',
    'about:blank',
  ];

  let profile = mkProfile();
  let chrome = spawn(findChrome(), args(profile, 0), { stdio: 'ignore' });
  const port = await readDevToolsPort(profile);
  if (port) return { chrome, profile, cdpPort: port };

  // 兜底:个别环境(企业策略/旧版 Chrome)不写 DevToolsActivePort,
  // 这时才退回「自己占一个端口」。这条路上仍有 TOCTOU 窗口,但只是兜底。
  chrome.kill('SIGKILL');
  await sleep(300);
  profile = mkProfile();
  const p = await freePort();
  chrome = spawn(findChrome(), args(profile, p), { stdio: 'ignore' });
  return { chrome, profile, cdpPort: p };
}

/** 统一的判定输出。status 用 ASCII,避免 Windows 控制台代码页把 ✓/✘ 变乱码。 */
function report(title, checks) {
  const bad = checks.filter((c) => !c[1]);
  console.log(`\n=== ${title} ===`);
  for (const [name, ok] of checks) console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${ok ? '' : '<< '}${name}`);
  console.log(`  ${bad.length ? 'FAIL' : 'ok  '}  ${checks.length - bad.length}/${checks.length} 项通过`);
  return bad.length === 0;
}

/**
 * 页内「推进游戏」片段,供各测试的步进循环拼进去。
 *
 * 关键一条是 SKIP_REVEAL:叙事渐显期间,选项/继续按钮还没挂上
 * (对齐 Lua —— 没读完不给选)。所以脚本报「点不到按钮」时,
 * 不是坏了,是正在渐显,得先点正文区把它跳过去。
 * 这正是玩家的真实操作,不为了测试去开后门。
 *
 * 优先级:浮层 → 选项卡(底部/文本区内联) → 行动牌 → 主按钮 → 点正文跳渐显。
 * 不按 phase 分支 —— 章末结算这类新相位出现时就不用回头改一遍。
 */
const STEP_SNIPPET = `
  const ovOpen = () => { const o = document.querySelector('.overlay'); return o && !o.hidden; };
  const tapMain = () => {
    const m = document.querySelector('.stage__main');
    if (!m) return false;
    m.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    return true;
  };
  const isRevealing = () => !!(window.__QS__ && window.__QS__.session && window.__QS__.session.isRevealing);
  const advanceOnce = () => {
    if (ovOpen()) { document.querySelector('.overlay .btn--primary')?.click(); return 'overlay'; }
    const foot = document.querySelector('.stage__foot');
    if (foot) {
      const tap = foot.querySelector('.card--tappable');
      if (tap) { tap.click(); return 'option'; }
      const act = foot.querySelector('.card--action[role="button"]');
      if (act) { act.click(); return 'card'; }
      const btn = foot.querySelector('.btn--primary');
      if (btn) { btn.click(); return 'primary'; }
    }
    // 偶遇/随机事件:选项与「继续」内联在文本区,不在底部(2026-10-14)
    const main = document.querySelector('.stage__main');
    if (main && !isRevealing()) {
      const tap = main.querySelector('.card--tappable');
      if (tap) { tap.click(); return 'inline-option'; }
      const btn = main.querySelector('.btn--primary');
      if (btn) { btn.click(); return 'inline-primary'; }
    }
    if (isRevealing() && tapMain()) return 'skip-reveal';
    return 'idle';
  };
  // 行动卡结算动画序列(2026-10-17 拍板:飞卡→题签渐入→逐行渐显→属性飞入→
  // 翻背面→自动推进,不再有「继续」钮)真实耗时约 1.5–3.5s。点完牌要等它走完:
  // 新牌发落 / 相位离开 round / 浮层出现,任一即到站;等待期间点正文区跳过
  // 逐行渐显,跟急性子玩家的真实操作一致。
  const waitDeal = async () => {
    const t0 = performance.now();
    while (performance.now() - t0 < 9000) {
      if (isRevealing()) { tapMain(); await new Promise(r => setTimeout(r, 60)); continue; }
      if (ovOpen()) return true;
      const g = window.__QS__ && window.__QS__.game;
      if (!g || g.phase !== 'round') return true;
      if (document.querySelector('.stage__foot .card[role="button"]')) return true;
      if (document.querySelector('.prompt--key.is-live')) return true;
      await new Promise(r => setTimeout(r, 80));
    }
    return false;
  };
  // 随机事件落定后无「继 续」(2026-10-17 拍板),约 1.5s 自动推进;等相位离开 settle。
  // 关键事件/抉择落定仍有「继 续」钮(停靠带里)——看到按钮就交还给点击路径。
  const waitSettle = async () => {
    const t0 = performance.now();
    while (performance.now() - t0 < 6000) {
      if (ovOpen()) return true;
      const g = window.__QS__ && window.__QS__.game;
      if (!g || g.phase !== 'settle') return true;
      if (document.querySelector('.stage__main .btn--primary')) return true;
      await new Promise(r => setTimeout(r, 100));
    }
    return false;
  };
`;

module.exports = {
  withPage, report, sleep, findChrome, serve, cdp, freePort, DIST, STEP_SNIPPET,
  REPORT_DIR, launchChrome, readDevToolsPort,
};
