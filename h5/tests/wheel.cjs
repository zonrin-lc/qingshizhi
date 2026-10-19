/**
 * 选择页罗盘:空闲巡游 + 朝代切换右栏淡入。
 *
 * 加速参数(页内钩子,见 wheel.ts 文件头):
 * - __QS_WHEEL_AUTO_IDLE__ = 800ms(默认 20000)
 * - __QS_WHEEL_AUTO_SPEED__ = 240°/s(默认 3°/s;60fps 下 ~4°/帧,不会跳过 8.6° 触发窗)
 *
 * 动线:主菜单 → 「开 始 游 戏」→ 选择页,之后不操作,等巡游自动选中。
 * 归位后「明」离左上触发区最近(27°),第一个自动选中的必是它。
 */
'use strict';

const { withPage, report, sleep } = require('./lib/harness.cjs');

(async () => {
  const checks = [];

  const ok = await withPage(
    async ({ evaluate, consoleErrors, cdp, sessionId }) => {
      // 进选择页
      await evaluate(`(async () => {
        const sleep = ms => new Promise(r => setTimeout(r, ms));
        document.querySelector('.menu__item--start').click();
        await sleep(300);
        return !!document.querySelector('.dwheel');
      })()`);
      checks.push(['进入选择页(罗盘出现)', await evaluate(`!!document.querySelector('.dwheel')`)]);

// 巡游期间:朝代名位置不动,只有盘面(环带)旋转(2026-10-17 拍板)
        //
        // 不要用固定 sleep 采样「动画窗口内的那 400ms」。全量跑时机器有负载,
        // 那 400ms 可能整个落在动画之外(启动前或结束后),此时 ringMoved=false,
        // 表现成一条假失败 —— 单独跑必绿、全量里偶发红,正是这类断言的典型症状。
        //
        // 改成:轮询等盘面真的转起来,再确认这整段时间里名签一步没动。
        // 断言的是「巡游时名不动、盘动」这个条件,不是「我猜对了几点几」。
        const driftCheck = await evaluate(`(async () => {
          const sleep = ms => new Promise(r => setTimeout(r, ms));
          const names = () => [...document.querySelectorAll('.dwheel__name')].map(n => n.style.left + ',' + n.style.top).join('|');
          const ringRot = () => document.querySelector('.dwheel__ring').style.transform;
          const n0 = names(), r0 = ringRot();
          let nameMoved = false, ringMoved = false;
          const t0 = Date.now();
          while (Date.now() - t0 < 12000) {
            await sleep(150);
            if (names() !== n0) { nameMoved = true; break; }   // 名签动了 = 已离开巡游窗口,样本作废
            if (ringRot() !== r0) {                              // 盘面开始转,再盯一会儿
              ringMoved = true;
              await sleep(400);
              nameMoved = names() !== n0;
              break;
            }
          }
          return { nameMoved, ringMoved };
        })()`);
        checks.push(['巡游时朝代名位置不动', !driftCheck.nameMoved]);
        checks.push(['巡游时盘面在旋转', driftCheck.ringMoved]);

      const firstDyn = await evaluate(`document.querySelector('.dwheel__dyn').textContent`);
      checks.push(['罗盘有初始朝代(' + firstDyn + ')', typeof firstDyn === 'string' && firstDyn.length > 0]);

      // 等巡游触发自动选中(800ms 空闲 + 指针扫 315°/240°/s ≈ 2.1s,留足余量)
      let autoDyn = firstDyn;
      const t0 = Date.now();
      while (Date.now() - t0 < 12000) {
        autoDyn = await evaluate(`document.querySelector('.dwheel__dyn').textContent`);
        if (autoDyn !== firstDyn) break;
        await sleep(300);
      }
      checks.push(['巡游自动切换了朝代(' + firstDyn + '→' + autoDyn + ')', autoDyn !== firstDyn]);
      // 巡游顺序固定为朝代正序的下一个:秦→汉→唐→宋→明→秦…
      const ORDER = ['秦', '汉', '唐', '宋', '明'];
      const expectNext = ORDER[(ORDER.indexOf(firstDyn) + 1) % ORDER.length];
      checks.push(['切换顺序是朝代正序(应是 ' + expectNext + ')', autoDyn === expectNext]);

      // 自动选中的应是未开卷朝代 → 右栏渲染预告页
      checks.push(['右栏出现预告页 .teaser', await evaluate(`!!document.querySelector('.selright .teaser')`)]);
      // 朝代切换时右栏淡入(动画类重挂)
      checks.push(['右栏挂了淡入动画类 is-swap', await evaluate(`!!document.querySelector('.selright.is-swap')`)]);

      // 任意点击打断巡游。240°/s 下选中到观察之间可能已有一发在飞,
      // 先持续点击等到朝代稳定,再验证稳定后 2.2s 内不再变化。
      await evaluate(`(async () => {
        const sleep = ms => new Promise(r => setTimeout(r, ms));
        const dyn = () => document.querySelector('.dwheel__dyn').textContent;
        const poke = () => document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
        poke();
        // 等稳定:连续 20 次(约 2s,长过 point+reorient 全程 ~1.6s)读数不变,
        // 才确认没有在飞的自动选中
        let last = dyn(), same = 0;
        for (let i = 0; i < 120; i += 1) {
          await sleep(100); poke();
          const cur = dyn();
          same = cur === last ? same + 1 : 0;
          last = cur;
          if (same >= 20) break;
        }
        // 稳定后继续点击压制 2.2s,期间不许再变
        const settled = dyn();
        let drift = false;
        for (let i = 0; i < 11; i += 1) {
          await sleep(200); poke();
          if (dyn() !== settled) drift = true;
        }
        return { settled, drift };
      })()`).then((r) => {
        checks.push(['点击打断巡游(朝代停在 ' + r.settled + ')', !r.drift]);
      });

      // ---------- 入局(2026-10-18 二拍:漩涡转场已去,点击直接进对局,对局页自身淡入) ----------
      // 巡游可能已把朝代切到未开卷(预告页无漩涡),先用 CDP 真实输入点「秦」名签切回去
      // (合成 PointerEvent 没有有效 pointerId,setPointerCapture 会抛错,必须走真实管线)
      const clickAt = async (x, y) => {
        await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 }, sessionId);
        await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 }, sessionId);
      };
      const qinPos = await evaluate(`(() => {
        const n = [...document.querySelectorAll('.dwheel__name')].find(e => e.textContent === '秦');
        const r = n.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      })()`);
      await clickAt(qinPos.x, qinPos.y);
      // 点名签切朝代要过一圈 reorient 动画,等文字变成「秦」再断言
      const tQ = Date.now();
      while (Date.now() - tQ < 6000) {
        if (await evaluate(`document.querySelector('.dwheel__dyn').textContent === '秦'`)) break;
        await sleep(80);
      }
      checks.push(['点秦名签切回已开卷朝代', await evaluate(`document.querySelector('.dwheel__dyn').textContent === '秦'`)]);
      checks.push(['漩涡按钮在(秦已开卷)', await evaluate(`!!document.querySelector('.selenter')`)]);

      const enterPos = await evaluate(`(() => {
        const r = document.querySelector('.selenter').getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      })()`);
      await clickAt(enterPos.x, enterPos.y);
      // 等对局真的挂上:点完就断相位、带 1200ms 的猜测等,全量连跑时偶发不够,
      // 会在下一行断言「已进入对局」时读到一个还没挂完的中间态。
      const tG = Date.now();
      while (!(await evaluate(`!!window.__QS__ && !!window.__QS__.game`)) && Date.now() - tG < 10000) {
        await sleep(80);
      }
      checks.push(['点漩涡后无转场层(直接入局)', await evaluate(`!document.querySelector('.vortexwarp')`)]);
      checks.push(['点击后已进入对局', await evaluate(`!!window.__QS__ && !!window.__QS__.game`)]);
      checks.push(['对局页淡入类已挂', await evaluate(`!!document.querySelector('.stage__cols.is-gamein')`)]);

      const errs = consoleErrors();
      checks.push(['控制台无错误', errs.length === 0]);
      if (errs.length) console.log('console errors:', errs.slice(0, 5));
      return true;
    },
    {
      enter: false,
      inject: `window.__QS_WHEEL_AUTO_IDLE__ = 800; window.__QS_WHEEL_AUTO_SPEED__ = 240;`,
    },
  );

  process.exit(ok && report('选择页:罗盘空闲巡游 + 右栏淡入', checks) ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
