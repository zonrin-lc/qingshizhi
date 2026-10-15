/**
 * H5 入口 / 页面装配。
 *
 * 动线(对齐封存 Lua 版 home.lua):
 *   主菜单(开始/继续/存档/设置/退出)→ 选择页(朝代罗盘 + 剧本卡 + 难度 + 入局)
 *   → 对局页 → 结局页 → 回主菜单。
 * 各页面都是 .stage 下的兄弟节点,靠背景与显隐切换,不引路由框架。
 */
import './styles/base.css';
import './styles/stage.css';
import './styles/game.css';
import './styles/art.css';
import './styles/menu.css';
import './styles/select.css';
import './styles/save.css';
import './styles/settings.css';

import engine from '@engine';
import type { DiffKey, Game } from '../types/scenario';
import { getScenario, loadScenario } from './data/scenarios';
import { initScale, logScale } from './shell/scale';
import { buildShell, renderSide, setBg, setDeco, wireBack } from './shell/shell';
import { Session } from './game/session';
import { bgm } from './game/audio';
import { voice } from './game/voice';
import { renderMenu, type MenuPage } from './ui/menu';
import { renderSelectPage, type SelectPage } from './ui/select';
import { renderSettingsPage, syncFromStorage } from './ui/settings';
import { applyVisual, broadcastSettings, loadSettings, onSegDelay } from './game/settings';
import { renderSavePage } from './ui/savepage';
import { getAuto, listSlots, load as loadSlot, loadPayload, save as writeSlot, saveAuto } from './game/saves';
import { injectCollection } from './game/collection';
import { lbl } from './ui/kit';

/** 引擎导出面自检 */
function checkEngineSurface(): string[] {
  const problems: string[] = [];
  if (typeof engine !== 'object' || engine === null) return ['engine 模块不是对象'];
  if (typeof engine.Game !== 'function') problems.push('engine.Game 不是构造函数');
  if (typeof engine.riskWord !== 'function') problems.push('engine.riskWord 缺失');
  return problems;
}

/** 冒烟:不挂 DOM,只确认引擎能在浏览器里把一局跑到结局 */
async function smokeGame(): Promise<string> {
  const data = await loadScenario('lisi');
  if (!data) return 'lisi 数据缺失';
  const g = new engine.Game(data as never, 'normal');
  g.start();
  let guard = 0;
  while (g.phase !== 'ending' && guard < 500) {
    guard += 1;
    const ph = g.phase;
    if (ph === 'intro') g.beginEvents();
    else if (ph === 'round') { if (!g.playCard(0)) g.playCard(1); }
    else if (ph === 'event') {
      const opts = g.getOptions();
      for (let i = 0; i < opts.length; i += 1) {
        const o = opts[i];
        if (o && !o.locked && g.choose(i)) break;
      }
    } else if (ph === 'choice') {
      const c = g.getChoiceCard();
      if (c && c.options.length) g.chooseCardOption(0); else g.cancelChoice();
    } else if (ph === 'settle') g.proceed();
    else if (ph === 'correction') g.correctionContinue();
    else if (ph === 'summary') g.proceedSummary();
    else if (ph === 'endEvent') g.endEventChoose(0);
    else break;
  }
  if (g.phase !== 'ending') return `未收敛(guard=${guard}, phase=${g.phase})`;
  const e = (g as unknown as { ending: { id: string; grade: string; total: number } }).ending;
  return `${e.id}·${e.grade}·${e.total}`;
}

function bootstrap(): void {
  initScale();
  logScale();

  const mount = document.getElementById('app');
  if (!mount) throw new Error('#app 未找到');
  const shell = buildShell(mount);

  void start(shell);
}

/** 自检 → 主菜单。剧本数据的结构校验已前移到构建期(scripts/verify-data.mjs),
 *  运行时不再把五份 JSON 全拉下来 —— 那是 P6 懒加载的意义所在。 */
async function start(shell: ReturnType<typeof buildShell>): Promise<void> {
  const problems = checkEngineSurface();
  let smoke = '未执行';
  try {
    smoke = await smokeGame();
  } catch (e) {
    smoke = `异常: ${e instanceof Error ? e.message : String(e)}`;
  }
  if (problems.length > 0) {
    console.error('[青史志] 自检未通过:', problems);
    shell.main.append(lbl('自检未通过,已阻断开局', 'u-zhu'), ...problems.map((p) => lbl(p, 'u-dim')));
    shell.band.textContent = '自检未通过';
    return;
  }
  console.info('[青史志] 自检通过 · 冒烟', smoke);

  let session: Session | null = null;
  /** 当前对局的剧本 key,存档页高亮用 */
  let curKey = '';
  /** 菜单/选择页句柄:两者都有 rAF 循环(菜单入场/罗盘/漩涡),离开时必须停 */
  let menuPage: MenuPage | null = null;
  let selectPage: SelectPage | null = null;
  /**
   * 导航代数:每次页面切换 +1。异步入局(等数据分片下载)落地前比对,
   * 代数变了说明玩家已经去了别的页面,迟到的 resolve 不许再把人拽进对局。
   */
  let navToken = 0;

  const hideGame = (): void => {
    shell.bar.hidden = true;
    shell.cols.hidden = true;
    shell.foot.hidden = true;
    shell.overlay.hidden = true;
  };
  /** 收掉所有「整页」层 —— 进对局或换页都要调,否则页面会叠在一起 */
  const hidePages = (): void => {
    menuPage?.destroy();
    menuPage = null;
    selectPage?.destroy();
    selectPage = null;
    shell.stage.querySelector('.saves')?.remove();
    shell.stage.querySelector('.settings')?.remove();
  };
  const showGame = (): void => {
    shell.bar.hidden = false;
    shell.cols.hidden = false;
    shell.foot.hidden = false;
    hidePages();
  };

  /** 退出对局时自动存档:所有离开路径都汇聚到 goMenu/goSelect,挂一处就够 */
  const autosaveIfPlaying = (): void => {
    if (!session) return;
    if (session.game.phase !== 'ending') {
      saveAuto(session.game, curKey, session.game.d.SCENARIO.name);
    }
    // 结局的自动档在 renderEnding 时已清(对齐 Lua),这里只需收尾会话
    session.dispose();
    session = null;
  };

  /** 提示条:存档结果等需要告知玩家的短消息 */
  let toastTimer = 0;
  const toast = (text: string): void => {
    let t = shell.stage.querySelector<HTMLElement>('.toast');
    if (!t) {
      t = lbl('', 'toast');
      shell.stage.append(t);
    }
    t.textContent = text;
    t.hidden = false;
    // 连发两条时,旧定时器不能提前把新消息收掉
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => { if (t) t.hidden = true; }, 2600);
  };

  /** 继续旅程:只有一个自动档直接进;有手动档则去存档页挑 */
  const continueJourney = (): void => {
    const a = getAuto();
    if (a && getScenario(a.scenKey)) {
      const tk = navToken;
      void (async () => {
        const g = await buildFrom(a);
        if (tk !== navToken) return; // 等数据期间玩家已去别的页面
        if (!g) { toast('自动存档已失效,无法继续'); return; }
        mountGame(a.scenKey, a.diffKey, g, true);
        toast(`已继续「${a.chapterTitle}」章首`);
      })();
      return;
    }
    goSaves();
  };

  const hasSaves = (): boolean => Boolean(getAuto()) || listSlots().some(Boolean);

  // ---------- 主菜单 ----------
  const goMenu = (): void => {
    navToken += 1;
    autosaveIfPlaying();
    hideGame();
    hidePages();
    // 菜单与选择页不放音乐:idle 曲子 1.38 MB,拿首屏带宽换不划算;
    // 菜单也正好该安静 —— 玩家在端详这卷书。
    bgm.stop();
    voice.stop();
    setBg(shell.stage, 'menu');
    setDeco(shell.deco, false);
    menuPage = renderMenu(shell.stage, {
      onStart: () => goSelect(),
      onContinue: () => continueJourney(),
      onSaves: () => goSaves(),
      onSettings: () => goSettings(),
      hasSaves,
    });
  };

  // ---------- 选择页 ----------
  const goSelect = (): void => {
    navToken += 1;
    autosaveIfPlaying();
    hideGame();
    hidePages();
    bgm.stop();
    voice.stop();
    setBg(shell.stage, 'select');
    setDeco(shell.deco, false);
    selectPage = renderSelectPage(
      shell.stage,
      ({ scenario, diff }) => goGame(scenario.key, diff),
      () => goMenu(),
    );
  };

  // ---------- 设置页 ----------
  const goSettings = (): void => {
    navToken += 1;
    hideGame();
    hidePages();
    setBg(shell.stage, 'settings');
    setDeco(shell.deco, false);
    renderSettingsPage(shell.stage, () => {
      // 返回前按存档里的设置校准一次,确保音频与界面显示一致
      syncFromStorage();
      goMenu();
    });
  };

  /** 存档页 */
  const goSaves = (): void => {
    navToken += 1;
    hideGame();
    hidePages();
    setBg(shell.stage, 'save');
    setDeco(shell.deco, false);
    renderSavePage(shell.stage, {
      currentKey: curKey,
      // 所有入口(主菜单/继续旅程)都已先经 autosaveIfPlaying 结算并清掉 session,
      // 到这里对局必然已不在 —— 返回就是回主菜单。不存在「带着对局返回」的路径。
      onBack: () => goMenu(),
      // 同理,没有进行中的对局就没有可存的东西,不把「存入」做成点了才报错
      // 的死按钮;将来若从对局中开存档页,在这里接上 session 即可。
      // (捕获到局部常量:闭包被调用时外层 session 可能已变)
      onSave: (() => {
        const s0 = session;
        if (!s0) return undefined;
        return (slot: number) => {
          const r = writeSlot(s0.game, curKey, s0.game.d.SCENARIO.name, slot);
          toast(r.reason);
          if (r.ok) goSaves(); // 重画以刷新计数
        };
      })(),
      onLoad: (slot, s) => {
        if (!getScenario(s.scenKey)) { toast('该存档对应的剧本数据已缺失'); return; }
        const tk = navToken;
        void (async () => {
          const data = await loadScenario(s.scenKey);
          if (tk !== navToken) return; // 等数据期间玩家已离开存档页
          if (!data) { toast('剧本数据加载失败'); return; }
          const g = new engine.Game(data as never, s.diffKey);
          injectCollection(g); // 读档也并入跨局累计;importSave 内部会与存档快照合并
          if (loadSlot(slot, g)) {
            goGame(s.scenKey, s.diffKey, g); // 直接沿用已导入的 g
            toast(`已读取「${s.chapterTitle}」章首`);
          } else {
            toast('存档校验未通过,已拒收');
          }
        })();
      },
    });
  };

  /** 用一个存档 payload 造出已就位的 Game(读档/继续上局共用) */
  const buildFrom = async (
    s: { scenKey: string; diffKey: DiffKey; payload: unknown },
  ): Promise<Game | undefined> => {
    const data = await loadScenario(s.scenKey);
    if (!data) return undefined;
    const g = new engine.Game(data as never, s.diffKey);
    injectCollection(g); // 与存档页读档同口径:跨局累计先进来,再由 importSave 合并
    return loadPayload(s.payload, g) ? g : undefined;
  };

  const goGame = (key: string, diff: DiffKey, preloaded?: Game): void => {
    navToken += 1;
    const meta = getScenario(key);
    if (!meta) return;
    if (preloaded) { mountGame(key, diff, preloaded, true); return; }
    // 正常入局:数据分片可能还没下(选了剧本卡才预热,也可能被清了缓存)
    const tk = navToken;
    void (async () => {
      const data = await loadScenario(key);
      if (tk !== navToken) return; // 等数据期间玩家已去别的页面
      if (!data) { toast('剧本数据加载失败'); goSelect(); return; }
      const g = new engine.Game(data as never, diff);
      injectCollection(g); // 开局灌入跨局收藏(对齐 Lua home.lua newGame)
      mountGame(key, diff, g);
    })();
  };

  const mountGame = (key: string, _diff: DiffKey, g: Game, fromSave = false): void => {
    navToken += 1;
    // 防御:若旧会话还在(理论上所有出口都会先 dispose),先收掉再放行,
    // 否则常驻壳上会叠出两个回溯按钮、两份 pointerdown 监听
    if (session) { session.dispose(); session = null; }
    showGame();
    curKey = key;
    // 「入局」那一下 click 就是用户手势,正好满足浏览器的自动播放策略,
    // 所以音乐从这一刻起播,而不是在页面加载时(那样会被拒)。
    bgm.play(key, false);
    setDeco(shell.deco, true);
    session = new Session(
      g,
      {
        main: shell.main, opts: shell.foot, chap: shell.chap, band: shell.band,
        bar: shell.bar, overlay: shell.overlay, stage: shell.stage, deco: shell.deco,
      },
      () => goMenu(),
      { scenKey: key },
    );
    const origTop = session.renderTop.bind(session);
    session.renderTop = function patched(this: Session): void {
      origTop();
      renderSide(shell.side, session!.sideContent());
    };
    wireBack(shell, () => goSelect());
    if (fromSave) {
      // 读档/继续进来:引擎已在 importSave 里把 phase 摆到 intro,直接渲染章首即可
      session.renderIntro();
    } else {
      session.start();
    }
    (window as unknown as Record<string, unknown>).__QS__ = {
      session, game: g, shell, goMenu, goSelect, goSaves,
      // 存档相关,供 tests/save.cjs 驱动真实流程(而不是另开一条测试专用通道)
      saveGame: (slot: number) => writeSlot(g, key, g.d.SCENARIO.name, slot),
      loadSlot: (slot: number) => loadSlot(slot, g),
      listSlots,
    };
  };

  // 设置项在启动时先落地一次:界面缩放/正文字号(视觉)、音乐/朗读(音频)、叙事速度。
  // 叙事速度是静态订阅,所以订阅要注册在 broadcast 之前。
  applyVisual(loadSettings());
  onSegDelay((ms) => Session.setSegDelay(ms));
  syncFromStorage();
  broadcastSettings(loadSettings());

  goMenu();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
} else {
  bootstrap();
}
