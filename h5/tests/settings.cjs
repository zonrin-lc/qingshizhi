/**
 * 设置页验收:三条音量滑杆渲染、拖动即生效、持久化、返回主菜单。
 *
 * 2026-10-15:开关+三档按钮换成横向滑杆(拖到 0 即静音,图标随档位变化)。
 * 这里验的是:滑杆改值 → localStorage 立即写入 → 正在播的 BGM 立刻随动;
 * 以及拖到 0 再拖回来,音乐能恢复(走 armUnlock 手势补播也无妨)。
 */
'use strict';

const { withPage, report, sleep } = require('./lib/harness.cjs');

const DRIVER = `(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const q = s => document.querySelector(s);
  const qa = s => [...document.querySelectorAll(s)];
  const out = {};

  // 主菜单 → 设置页(菜单项没有专用 class,按文字找)
  const item = qa('.menu__item').find(b => b.textContent.includes('设 置'));
  if (!item) return { ok: false, why: '主菜单没有「设 置 一 下」' };
  item.click();
  await sleep(300);

  out.titles = qa('.settings .srow .srow__title').map(t => t.textContent.trim());
  out.rows = qa('.settings .srow--vol').length;
  out.sliders = qa('.settings .vol__range').length;
  out.ver = (q('.settings__ver') || {}).textContent || '';
  out.deco = qa('.settings .settings__deco').length;

  const rowOf = name => qa('.settings .srow').find(r => r.textContent.includes(name));
  const slide = (name, v) => {
    const r = rowOf(name).querySelector('.vol__range');
    r.value = String(v);
    r.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const saved = () => JSON.parse(localStorage.getItem('qingshi.settings.v1') || '{}');
  const idleEl = () => qa('audio').find(a => (a.getAttribute('src') || '').includes('idle'));
  const iconCls = name => rowOf(name).querySelector('.vol__icon').className;

  out.beforePaused = idleEl() ? idleEl().paused : null;

  // 音乐拖到 0 = 静音:存 music=false,BGM 立刻停,图标变静音叉
  slide('背景音乐', 0);
  await sleep(200);
  out.zeroMusic = saved().music;
  out.zeroPaused = idleEl() ? idleEl().paused : null;
  out.zeroIcon = iconCls('背景音乐');

  // 拖到 80:存 music=true + gain 0.8,图标变两波
  slide('背景音乐', 80);
  await sleep(200);
  out.highMusic = saved().music;
  out.highGain = saved().musicGain;
  out.highIcon = iconCls('背景音乐');

  // 朗读拖到 0
  slide('剧情朗读', 0);
  await sleep(200);
  out.zeroVoice = saved().voice;

  // 返回 → 主菜单(顶部左侧,与选择页同款)。注意壳层的 .pageback 此时隐藏但仍在 DOM,
  // 必须圈在 .settings 里选,否则会点到壳层那颗没挂回调的
  q('.settings .pageback').click();
  await sleep(300);
  out.backToMenu = !!q('.menu__item--start');

  // 再进一次设置页:改动应被记住(滑杆位置从存档读回)
  qa('.menu__item').find(b => b.textContent.includes('设 置')).click();
  await sleep(300);
  out.persistMusicGain = saved().musicGain;
  out.musicSliderPos = rowOf('背景音乐').querySelector('.vol__range').value;
  out.ok = true;
  return out;
})()`;

withPage(
  async ({ evaluate, consoleErrors, cdp, sessionId }) => {
    // 可信点击拿到用户激活,让 idle 真的播起来 —— 否则「拖到 0 停声」断言
    // 会在一个本来就没出声的元素上空转(autoplay 策略下它永远是 paused)。
    const trusted = async () => {
      for (const type of ['mousePressed', 'mouseReleased']) {
        await cdp.send('Input.dispatchMouseEvent', { type, x: 640, y: 360, button: 'left', clickCount: 1 }, sessionId);
      }
    };
    await trusted();
    await sleep(1200);

    const out = await evaluate(DRIVER);

    // 音乐拖大之后:if play() 因激活过期被拒,armUnlock 会在下一次手势补播,
    // 两种结局都合法 —— 补一次可信点击,最终必须在响。
    await trusted();
    await sleep(800);
    const resumed = await evaluate(`(() => {
      const a = [...document.querySelectorAll('audio')].find(x => (x.getAttribute('src') || '').includes('idle'));
      return a ? { found: true, paused: a.paused } : { found: false };
    })()`);

    // 末尾的「云存档同步」行是 2026-10-16 TapTap 对接时加的页面约定(tapcloud.cjs 专测其行为)
    const wantTitles = ['背景音乐', '游戏音效', '剧情朗读', '云存档同步'];
    const ok = report('设置页', [
      ['三条音量行全部渲染', out.rows === 3 && out.sliders === 3],
      ['行标题与顺序符合约定', JSON.stringify(out.titles) === JSON.stringify(wantTitles)],
      ['装饰已移除(2026-10-19 拍板)', out.deco === 0],
      ['版本号来自注入而非手抄', /v\S+ · H5 版/.test(out.ver || '')],
      ['拖动前 BGM 确实在播', out.beforePaused === false],
      ['拖到 0:写入 music=false', out.zeroMusic === false],
      ['拖到 0:BGM 立刻停声', out.zeroPaused === true],
      ['拖到 0:图标变静音叉', String(out.zeroIcon).includes('vol--m0')],
      ['拖到 80:写入 music=true', out.highMusic === true],
      ['拖到 80:写入 gain 0.8', Math.abs((out.highGain ?? 0) - 0.8) < 0.001],
      ['拖到 80:图标变两波', String(out.highIcon).includes('vol--m3')],
      ['朗读拖到 0:写入 voice=false', out.zeroVoice === false],
      ['音乐拖大后恢复播放', resumed.found && resumed.paused === false],
      ['返回主菜单', out.backToMenu === true],
      ['滑杆位置从存档读回(80)', out.persistMusicGain === 0.8 && out.musicSliderPos === '80'],
      ['控制台无错误', consoleErrors().length === 0],
    ]);
    if (!ok) console.log('明细: ' + JSON.stringify(out) + ' resumed=' + JSON.stringify(resumed));
    return ok;
  },
  { enter: false },
)
  .then((ok) => process.exit(ok ? 0 : 1))
  .catch((e) => {
    console.error('[失败]', e.message);
    process.exit(1);
  });
