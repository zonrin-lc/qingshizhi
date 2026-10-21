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
import './styles/teaser.css';
import './styles/save.css';
import './styles/gallery.css';
import './styles/settings.css';

import engine from '@engine';
import type { DiffKey, Game } from '../types/scenario';
import { getScenario, loadScenario } from './data/scenarios';
import { initScale, logScale } from './shell/scale';
import { buildShell, renderSide, setBg, setDeco, wireBack } from './shell/shell';
import { Session } from './game/session';
import { diagnostics, diagnosticsText, installDiagnostics } from './game/diagnostics';
import { bgm } from './game/audio';
import { voice } from './game/voice';
import { renderMenu, type MenuPage } from './ui/menu';
import { renderSelectPage, type SelectPage } from './ui/select';
import { renderSettingsPage, syncFromStorage, type SettingsPage } from './ui/settings';
import { applyVisual, broadcastSettings, loadSettings, onSegDelay } from './game/settings';
import { renderSavePage } from './ui/savepage';
import { renderGalleryPage, type GalleryPage } from './ui/gallery';
import {
  AUTO_MAX, autoCount, fmtRound, getLatestAuto, listStash, listAutos, loadPayload, SAVE_MIN_ROUND, saveAuto, stashSave,
  whyCannotSave, type Slot, type SecRec,
} from './game/saves';
import { injectCollection } from './game/collection';
import { initTapCloud, isTapEnv, requestExit as requestAppExit } from './game/tapcloud';
import { btn, el, lbl, toast as kitToast } from './ui/kit';

/**
 * 引擎侧还有没有下一章。
 *
 * 判据与 prot/engine.js 的 nextChapter() 一致(chapterIdx+1 < CHAPTERS.length):
 * 末章结算页之后没有下一章,这一局就算走完了。
 * whyCannotSave 在 game/saves.ts(本轮不改那个文件),所以在调用点自己判。
 */
function hasNextChapter(g: Game): boolean {
  return g.chapterIdx + 1 < g.d.CHAPTERS.length;
}

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
  /** 选择页句柄:有 rAF 循环(罗盘/漩涡),离开时必须停 */
  let menuPage: MenuPage | null = null;
  let selectPage: SelectPage | null = null;
  let galleryPage: GalleryPage | null = null;
  let settingsPage: SettingsPage | null = null;
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
    galleryPage?.destroy();
    galleryPage = null;
    // 设置页也有 destroy(内部退订 tapcloud 状态订阅):原先是直接摘 DOM,
    // 订阅永不释放,每进一次设置页就多一个持有已脱离文档的回调(2026-10-21 修)。
    settingsPage?.destroy();
    settingsPage = null;
    shell.stage.querySelector('.saves')?.remove();
  };
  const showGame = (): void => {
    shell.bar.hidden = false;
    shell.cols.hidden = false;
    shell.foot.hidden = false;
    hidePages();
    // 入局淡入(2026-10-18 拍板:漩涡转场已去,只留对局页自身淡入)。
    // 摘类 → 强制回流 → 挂类,重进入局(读档/再来一局)动画才能重播。
    for (const part of [shell.bar, shell.cols]) {
      part.classList.remove('is-gamein');
      void part.offsetWidth;
      part.classList.add('is-gamein');
    }
  };

  /** 收掉对局会话(不写档)。所有离开路径最终都汇聚到 goMenu/goSelect。 */
  const disposeSession = (): void => {
    if (!session) return;
    session.dispose();
    session = null;
  };

  /**
   * 系统返回键 / 返回手势(2026-10-21 修)。
   *
   * 容器里按返回手势会直接离开页面,不经过 requestExit() —— 不写自动档、
   * 也不弹「自动档已满,是否覆盖最早一条」,玩家进度只落到暂存。
   * 修法:入局时压一条历史,popstate 里转对局页自己的 requestExit()
   * (同一条「返回」确认流)。别的页面不压历史也不拦:
   * 那些页面的后退归浏览器管,拦下来反而会把浏览器的正常后退弄坏。
   */
  let gameHistoryGuard = false;
  const pushGameHistory = (): void => {
    try {
      history.pushState({ qs: 'qingshi' }, '');
      gameHistoryGuard = true;
    } catch {
      // 某些容器/沙箱禁写历史:不拦返回键也不能因此崩,游戏照常玩
      gameHistoryGuard = false;
    }
  };
  window.addEventListener('popstate', () => {
    if (!session) {
      // 不在对局页:不拦截,让浏览器照常后退(顺手记下我们的守卫条目已被消费)
      gameHistoryGuard = false;
      return;
    }
    // 被系统返回吃掉的那条历史补回去,页面才不会真的跳走;
    // 然后走对局页自己的「返回」确认流(写自动档 / 满员问覆盖)。
    pushGameHistory();
    requestExit();
  });

  /**
   * 对局页点「返回」(2026-10-17 三次拍板,取代 10-15 的「一律先问是否存档」):
   * - 本章经营未满 SAVE_MIN_ROUND 轮:开局还浅,没什么可存的,不问不存直接退;
   * - 自动档有空位:自动存档(记下当前这一刻的完整进度,精确到经营轮次)直接退;
   * - 自动档满 AUTO_MAX 条:才弹框问是否覆盖最早一条;
   * - 结局已落定 / 硬核 / noSave / 尚未入章的局没有可存的东西,不问直接退。
   */
  const requestExit = (): void => {
    const s0 = session;
    // 2026-10-18 拍板:对局页「返回」回主菜单,不再回选择页
    if (!s0) { goMenu(); return; }
    const g = s0.game;
    const leave = (): void => { disposeSession(); goMenu(); };
    // 成就/词条先落盘(2026-10-21):中途离开时解锁的东西不该随页面蒸发
    s0.persistCollection();
    if (g.phase === 'ending' || whyCannotSave(g)) { leave(); return; }
    // 末章结算(引擎 phase==='summary')且引擎已经没有下一章了:这一局其实走完了,
    // 再写自动档会让「继续旅程」把一局**已通关**的进度当未完成的一局重载。
    // 引擎侧 whyCannotSave 在 game/saves.ts(那个文件本轮不改),所以在调用点判:
    // 判据与引擎的 nextChapter() 一致(见 hasNextChapter)。
    // 中间章的结算页仍有下一章,照常写档 —— 那是一局进行到一半的正常存档。
    if (g.phase === 'summary' && !hasNextChapter(g)) { leave(); return; }
    if (s0.roundNo < SAVE_MIN_ROUND) { leave(); return; }
    if (autoCount(curKey) < AUTO_MAX) {
      const r = saveAuto(g, curKey, g.d.SCENARIO.name, { roundNo: s0.roundNo, ui: s0.collectHistory() });
      toast(r.reason);
      leave();
      return;
    }
    shell.stage.querySelector('.saves__confirm')?.remove();
    // 与主菜单「退出游戏」同口径(2026-10-19 拍板):深色蒙版 + 窄幅悬挂卷轴
    const ov = el('div', 'saves__confirm overlay overlay--dim');
    const box = el('div', 'overlay__box overlay__box--scroll panel-scroll--summary');
    box.append(
      lbl('离 开 对 局？', 'overlay__title u-kai u-strong'),
      lbl(`「${g.d.SCENARIO.name}」的存档已满 ${AUTO_MAX} 条,再存将覆盖最早的一条;也可以不存直接离开。`, 'overlay__body u-zhu'),
    );
    const row = el('div', 'saves__confirmrow');
    row.append(
      btn('覆盖并退出', {
        variant: 'primary',
        onClick: () => {
          const r = saveAuto(g, curKey, g.d.SCENARIO.name, { overwriteOldest: true, roundNo: s0.roundNo, ui: s0.collectHistory() });
          toast(r.reason);
          ov.remove();
          leave();
        },
      }),
      btn('不存退出', {
        variant: 'ghost',
        onClick: () => {
          ov.remove();
          leave();
        },
      }),
      btn('再玩一会', { variant: 'ghost', onClick: () => ov.remove() }),
    );
    box.append(row);
    ov.append(box);
    // 点遮罩空白处视为取消(留在对局)
    ov.addEventListener('click', (e) => {
      if (e.target === ov) ov.remove();
    });
    shell.stage.append(ov);
  };

  /**
   * 直接关页/刷新的暂存(2026-10-15 拍板;同日调整:点「返回」只写自动档,
   * 暂存只剩这条防丢路径):pagehide 是关页场景下最可靠的钩子
   * (beforeunload 在移动端常被跳过)。页面已在销毁,只做写存储这一件事。
   * 与 autosaveIfPlaying 不会双写:那条路径先把 session 置空,这里看到 null 就跳过。
   */
  window.addEventListener('pagehide', () => {
    if (!session || session.game.phase === 'ending') return;
    // 与「返回」同口径(2026-10-17 拍板):本章经营未满 SAVE_MIN_ROUND 轮的局不暂存
    if (session.roundNo < SAVE_MIN_ROUND) return;
    stashSave(session.game, curKey, session.game.d.SCENARIO.name, session.roundNo, session.collectHistory());
  });

  /**
   * 提示条:存档结果等需要告知玩家的短消息。
   *
   * 只走 kit 的全站实现(2026-10-21 修):原先这里自己造了一套 .toast,
   * 与 kit 的同名同类,于是 shell.stage.querySelector('.toast') 会命中
   * kit 挂在页面根里的那条 —— 「剧本数据加载失败」被静默吞掉,
   * 两套定时器还会互相提前隐藏对方的消息。
   * 提示条不承载点击(见 save.css .toast 的 pointer-events:none),
   * 也不会压住主菜单底部的按钮。
   */
  const toast = (text: string): void => {
    kitToast(shell.stage, text);
  };

  /** 继续旅程:读全部剧本里最新的一条自动档;没有自动档则去存档页挑 */
  const continueJourney = (): void => {
    const a = getLatestAuto();
    if (a && getScenario(a.scenKey)) {
      const tk = navToken;
      void (async () => {
        const g = await buildFrom(a);
        if (tk !== navToken) return; // 等数据期间玩家已去别的页面
        if (!g) { toast('自动存档已失效,无法继续'); return; }
        mountGame(a.scenKey, a.diffKey, g, true, a.roundNo ?? 0, a.ui);
        toast(`已继续「${a.chapterTitle}」${fmtRound(a.roundNo)}`);
      })();
      return;
    }
    goSaves();
  };

  const hasSaves = (): boolean => Boolean(getLatestAuto()) || listStash().length > 0;

  // ---------- 主菜单 ----------
  const goMenu = (): void => {
    navToken += 1;
    disposeSession();
    hideGame();
    hidePages();
    // 进游戏就播 idle 曲;首次加载若被自动播放策略拦下,
    // audio.ts 会挂一次性手势监听,玩家点任何一下即补播。
    bgm.idle();
    voice.stop();
    setBg(shell.stage, 'menu');
    setDeco(shell.deco, false);
    menuPage = renderMenu(shell.stage, {
      onStart: () => goSelect(),
      onContinue: () => continueJourney(),
      onSaves: () => goSaves(),
      onGallery: () => goGallery(),
      onSettings: () => goSettings(),
      onExit: () => {
        bgm.stop();
        voice.stop();
        // 真退出(2026-10-16 拍板):容器杀进程 / 浏览器关页
        // (别名 requestAppExit:本文件 163 行的 requestExit 是对局页「返回」确认流)
        requestAppExit();
      },
      onExitBack: () => bgm.idle(),
      // 2026-10-21 用户拍板:移动端(TapTap 容器)点「退出」直接停机,不跳落幕页;
      // 普通浏览器关页常被拒,仍留落幕页兜底(带「再执笔」)。
      exitMode: isTapEnv() ? 'seal' : 'farewell',
      hasSaves,
    });
  };

  // ---------- 选择页 ----------
  const goSelect = (): void => {
    navToken += 1;
    disposeSession();
    hideGame();
    hidePages();
    bgm.idle();
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
    // 四个 go* 统一先收对局:漏掉这一句,对局计时器/朗读会在背后继续跑
    disposeSession();
    hideGame();
    hidePages();
    setBg(shell.stage, 'settings');
    setDeco(shell.deco, false);
    settingsPage = renderSettingsPage(shell.stage, () => {
      // 返回前按存档里的设置校准一次,确保音频与界面显示一致
      syncFromStorage();
      goMenu();
    });
  };

  /** 青史图鉴页(结局达成一览) */
  const goGallery = (): void => {
    navToken += 1;
    disposeSession();
    hideGame();
    hidePages();
    setBg(shell.stage, 'save');
    setDeco(shell.deco, false);
    galleryPage = renderGalleryPage(shell.stage, () => goMenu());
  };

  /** 存档页 */
  const goSaves = (): void => {
    navToken += 1;
    disposeSession();
    hideGame();
    hidePages();
    setBg(shell.stage, 'save');
    setDeco(shell.deco, false);
    renderSavePage(shell.stage, {
      currentKey: curKey,
      // 空态引导卡「开始新局」:去选剧本页
      onStart: () => goSelect(),
      // 所有入口都已先经 disposeSession 结算并清掉 session,到这里对局必然已不在
      // —— 返回就是回主菜单。不存在「带着对局返回」的路径。
      onBack: () => goMenu(),
      // 自动档与暂存的读取同口径:payload 已在手上,不再回存储找
      onLoad: (s: Slot) => {
        if (!getScenario(s.scenKey)) { toast('该存档对应的剧本数据已缺失'); return; }
        const tk = navToken;
        void (async () => {
          const g = await buildFrom(s);
          if (tk !== navToken) return; // 等数据期间玩家已离开存档页
          if (!g) { toast('存档校验未通过,已拒收'); return; }
          goGame(s.scenKey, s.diffKey, g, s.roundNo ?? 0, s.ui);
          toast(`已读取「${s.chapterTitle}」${fmtRound(s.roundNo)}`);
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

  const goGame = (key: string, diff: DiffKey, preloaded?: Game, roundNo = 0, ui?: SecRec[]): void => {
    navToken += 1;
    const meta = getScenario(key);
    if (!meta) return;
    if (preloaded) { mountGame(key, diff, preloaded, true, roundNo, ui); return; }
    // 正常入局:数据分片可能还没下(选了剧本卡才预热,也可能被清了缓存)
    const tk = navToken;
    // 取数期间给个「正在展卷…」的反馈(2026-10-21):以前这段等待是静默的,
    // 玩家点了没反应会以为按钮坏了;顺带禁掉连点。
    selectPage?.setEntering(true);
    void (async () => {
      const data = await loadScenario(key);
      if (tk !== navToken) return; // 等数据期间玩家已去别的页面
      if (!data) { selectPage?.setEntering(false); toast('剧本数据加载失败'); goSelect(); return; }
      const g = new engine.Game(data as never, diff);
      injectCollection(g); // 开局灌入跨局收藏(对齐 Lua home.lua newGame)
      mountGame(key, diff, g);
    })();
  };

  const mountGame = (key: string, _diff: DiffKey, g: Game, fromSave = false, roundNo = 0, ui?: SecRec[]): void => {
    navToken += 1;
    // 防御:若旧会话还在(理论上所有出口都会先 dispose),先收掉再放行,
    // 否则常驻壳上会叠出两个回溯按钮、两份 pointerdown 监听
    if (session) { session.dispose(); session = null; }
    showGame();
    curKey = key;
    // 「入局」那一下 click 就是用户手势,自动播放策略必然放行;
    // 进剧本后 inst/vocal 双轨轮播,先播无人声。
    bgm.play(key);
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
      const s = session;
      if (!s) return;
      // §3.5(2026-10-21 修):右栏还有属性在等飞字落定时,不要整块重画。
      // 整块重画会把「旧值保持到落定」冲成新值,session 里 applySideDelta 的守卫
      // (vEl.textContent !== oldShown)就永远命中:飞字补间不执行、待定轴也清不掉。
      if (s.hasSidePending()) return;
      renderSide(shell.side, s.sideContent());
    };
    wireBack(shell, () => requestExit());
    // 系统返回键/返回手势:入局压一条历史(见 pushGameHistory 的说明)
    if (!gameHistoryGuard) pushGameHistory();
    if (fromSave) {
      // 读档/继续进来:引擎 importSave 已把状态摆回存档那一刻(v2.2.0 轮次存档,
      // 旧版章首档落在 intro),按相位渲染回同一位置,经营轮数随槽位写回
      session.resume(roundNo, ui);
    } else {
      session.start();
    }
    (window as unknown as Record<string, unknown>).__QS__ = {
      session, game: g, shell, goMenu, goSelect, goSaves,
      // 存档相关,供 tests/save.cjs 驱动真实流程(而不是另开一条测试专用通道)
      // saveGame 等价「返回 → 存档退出」的写档动作;overwrite 满员时是否覆盖最早
      saveGame: (overwrite = false) => saveAuto(g, key, g.d.SCENARIO.name, { overwriteOldest: overwrite, roundNo: session?.roundNo ?? 0, ui: session?.collectHistory() }),
      loadAuto: (idx: number) => {
        const s = listAutos(key)[idx];
        return s ? loadPayload(s.payload, g) : false;
      },
      listAutos,
      // 暂存,供 tests/stash.cjs 驱动(2026-10-15)
      stashGame: () => stashSave(g, key, g.d.SCENARIO.name, session?.roundNo ?? 0, session?.collectHistory()),
      listStash,
    };
  };

  // 设置项在启动时先落地一次:界面缩放/正文字号(视觉)、音乐/朗读(音频)、叙事速度。
  // 叙事速度是静态订阅,所以订阅要注册在 broadcast 之前。
  applyVisual(loadSettings());
  onSegDelay((ms) => Session.setSegDelay(ms));
  syncFromStorage();
  broadcastSettings(loadSettings());

  // 全局异常兜底(2026-10-21):未捕获的运行时异常/未处理的 Promise 拒绝都记一条,
  // 弹个轻提示(不打断流程,玩家仍能返回/重开),并留在诊断缓冲里以便反馈时取用。
  installDiagnostics((text) => { try { toast(text); } catch { /* 外壳还没起好就算了 */ } });
  (window as unknown as Record<string, unknown>).__QS_DIAG__ = {
    list: () => diagnostics(),
    text: () => diagnosticsText(),
  };

  // TapTap 云存档:容器内静默登录 + 启动对账(云端新则整包覆写本地)。
  // 普通浏览器里整个是 no-op。对账若覆写了本地且玩家还停在主菜单,
  // 重渲一次菜单让「继续旅程」等状态对上(此时还没进对局,重渲无副作用)。
  void initTapCloud().then((r) => {
    if (r.changed && menuPage && !session) goMenu();
  });

  goMenu();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
} else {
  bootstrap();
}
