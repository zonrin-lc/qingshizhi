/**
 * H5 入口 / 页面装配。
 *
 * 动线(P3 起):选择页(选剧本 + 选难度)→ 对局页 → 结局页。
 * 选择页与对局页共用同一个 .stage 容器,靠 skin/背景切换,
 * 不做路由框架——只有两个页面,引 router 不划算。
 */
import './styles/base.css';
import './styles/stage.css';
import './styles/game.css';
import './styles/art.css';
import './styles/select.css';
import './styles/save.css';

import engine from '@engine';
import type { DiffKey, Game } from '../types/scenario';
import { getScenario, loadScenario, SCENARIOS } from './data/scenarios';
import { initScale, logScale } from './shell/scale';
import { buildShell, renderSide, setBg, setDeco, wireBack } from './shell/shell';
import { Session } from './game/session';
import { bgm } from './game/audio';
import { renderSelectPage } from './ui/select';
import { renderSavePage } from './ui/savepage';
import { getAuto, listSlots, load as loadSlot, loadPayload, save as writeSlot, saveAuto } from './game/saves';
import { lbl } from './ui/kit';

/** 引擎导出面自检 */
function checkEngineSurface(): string[] {
  const problems: string[] = [];
  if (typeof engine !== 'object' || engine === null) return ['engine 模块不是对象'];
  if (typeof engine.Game !== 'function') problems.push('engine.Game 不是构造函数');
  if (typeof engine.riskWord !== 'function') problems.push('engine.riskWord 缺失');
  return problems;
}

/**
 * 数据管线自检:逐本按需加载并查关键字段。
 * 这一步会真的把五份 JSON 都拉下来 —— 属于启动开销,但只在首次、
 * 且能挡住「某个剧本分片没打进来」这类只在运行期暴露的问题。
 * 代价约 280 KB(gzip),换来的是开局前就知道数据完整性。
 */
async function checkData(): Promise<string[]> {
  const problems: string[] = [];
  for (const s of SCENARIOS) {
    const d = await loadScenario(s.key);
    if (!d) { problems.push(`${s.key}: 数据分片加载失败`); continue; }
    if (!d.SCENARIO?.id) problems.push(`${s.key}: SCENARIO.id 缺失`);
    if (d.SCENARIO?.id !== s.id) problems.push(`${s.key}: 轻量表 id 与 JSON 不符(${s.id} vs ${d.SCENARIO?.id})`);
    if (!d.CHAPTERS?.length) problems.push(`${s.key}: CHAPTERS 为空`);
    if (d.CHAPTERS?.length !== s.chapters) problems.push(`${s.key}: 轻量表章数 ${s.chapters} 与 JSON ${d.CHAPTERS?.length} 不符`);
    if (!d.ACTIONS?.length) problems.push(`${s.key}: ACTIONS 为空`);
  }
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

/** 自检 → 选择页。自检要拉五份数据分片,所以是异步的。 */
async function start(shell: ReturnType<typeof buildShell>): Promise<void> {
  const problems = [...checkEngineSurface(), ...(await checkData())];
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

  // ---------- 选择页 ----------
  let session: Session | null = null;
  /** 当前对局的剧本 key,存档页高亮用 */
  let curKey = '';

  const hideGame = (): void => {
    shell.bar.hidden = true;
    shell.cols.hidden = true;
    shell.foot.hidden = true;
    shell.overlay.hidden = true;
  };
  /** 收掉选择页 —— 进对局或进存档页都要调,否则两个页面会叠在一起 */
  const hideSelect = (): void => {
    shell.stage.querySelector('.select')?.remove();
    shell.stage.querySelector('.saves')?.remove();
  };
  const showGame = (): void => {
    shell.bar.hidden = false;
    shell.cols.hidden = false;
    shell.foot.hidden = false;
    hideSelect();
  };

  /** 提示条:存档结果等需要告知玩家的短消息 */
  const toast = (text: string): void => {
    let t = shell.stage.querySelector<HTMLElement>('.toast');
    if (!t) {
      t = lbl('', 'toast');
      shell.stage.append(t);
    }
    t.textContent = text;
    t.hidden = false;
    window.setTimeout(() => { if (t) t.hidden = true; }, 2600);
  };

  const goSelect = (): void => {
    // 退出对局 → 自动存档。放在这里而不是单独一个「离开」按钮,
    // 是因为所有离开路径(点返回、结局页回主页、读档页返回)都汇聚到这一个函数,
    // 挂一处就够,不会漏。
    // 引擎说不可存时(硬核 / 无章首快照)安静跳过,不打断退出。
    if (session && session.game.phase !== 'ending') {
      saveAuto(session.game, curKey, session.game.d.SCENARIO.name);
    }
    session = null;
    hideGame();
    hideSelect();
    // 选择页不放音乐:它是一进站就要加载的页面,idle 曲子 1.38 MB,
    // 拿菜单的体验换首屏带宽不划算。菜单也正好该安静——玩家在挑剧本。
    bgm.stop();
    setBg(shell.stage, 'select');
    setDeco(shell.deco, false);
    renderSelectPage(
      shell.stage,
      ({ scenario, diff }) => goGame(scenario.key, diff),
      () => goSaves(),
      // 「继续上局」:有自动档时才出现
      getAuto()
        ? () => {
            const a = getAuto();
            if (!a || !getScenario(a.scenKey)) return;
            void (async () => {
              const g = await buildFrom(a);
              if (!g) { toast('自动存档已失效,无法继续'); return; }
              mountGame(a.scenKey, a.diffKey, g, true);
              toast(`已继续「${a.chapterTitle}」章首`);
            })();
          }
        : undefined,
    );
  };

  /** 存档页 */
  const goSaves = (): void => {
    hideGame();
    hideSelect();
    setBg(shell.stage, 'save');
    setDeco(shell.deco, false);
    renderSavePage(shell.stage, {
      currentKey: curKey,
      onBack: () => (session ? goGame(curKey, 'normal') : goSelect()),
      onSave: (slot) => {
        if (!session) { toast('没有进行中的对局,无法存入'); return; }
        const r = writeSlot(session.game, curKey, session.game.d.SCENARIO.name, slot);
        toast(r.reason);
        if (r.ok) goSaves(); // 重画以刷新计数
      },
      onLoad: (slot, s) => {
        if (!getScenario(s.scenKey)) { toast('该存档对应的剧本数据已缺失'); return; }
        void (async () => {
          const data = await loadScenario(s.scenKey);
          if (!data) { toast('剧本数据加载失败'); return; }
          const g = new engine.Game(data as never, s.diffKey);
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
    return loadPayload(s.payload, g) ? g : undefined;
  };

  const goGame = (key: string, diff: DiffKey, preloaded?: Game): void => {
    const meta = getScenario(key);
    if (!meta) return;
    if (preloaded) { mountGame(key, diff, preloaded, true); return; }
    // 正常入局:数据分片可能还没下(选了剧本卡才预热,也可能被清了缓存)
    void (async () => {
      const data = await loadScenario(key);
      if (!data) { toast('剧本数据加载失败'); goSelect(); return; }
      mountGame(key, diff, new engine.Game(data as never, diff));
    })();
  };

  const mountGame = (key: string, _diff: DiffKey, g: Game, fromSave = false): void => {
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
      () => goSelect(),
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
      session, game: g, shell, goSelect, goSaves,
      // 存档相关,供 tests/save.cjs 驱动真实流程(而不是另开一条测试专用通道)
      saveGame: (slot: number) => writeSlot(g, key, g.d.SCENARIO.name, slot),
      loadSlot: (slot: number) => loadSlot(slot, g),
      listSlots,
    };
  };

  goSelect();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
} else {
  bootstrap();
}