/**
 * H5 入口。
 *
 * P1 的职责边界:搭壳 + 验证「引擎与数据能在浏览器里跑起来」,
 * 不实现任何玩法。冒烟自检(SmokeCheck)是为证明 alias/数据管线真的通了——
 * 它会真的用 @engine 的 Game 跑几步,拿到终局快照。
 */
import './styles/base.css';
import './styles/stage.css';

import engine from '@engine';
import { SCENARIOS, getScenario } from './data/scenarios';
import { initScale, logScale } from './shell/scale';
import { buildShell } from './shell/shell';

/** 引擎导出面自检:确认 @engine 真的引到了 prot/engine.js */
function checkEngineSurface(): string[] {
  const problems: string[] = [];
  if (typeof engine !== 'object' || engine === null) {
    problems.push('engine 模块不是对象');
    return problems;
  }
  if (typeof engine.Game !== 'function') problems.push('engine.Game 不是构造函数');
  if (typeof engine.riskWord !== 'function') problems.push('engine.riskWord 缺失');
  if (typeof engine.KEY_CARD_ROUNDS !== 'number') problems.push('engine.KEY_CARD_ROUNDS 缺失');
  return problems;
}

/** 数据管线自检:五份剧本的关键字段齐全 */
function checkData(): string[] {
  const problems: string[] = [];
  for (const s of SCENARIOS) {
    if (!s.data.SCENARIO?.id) problems.push(`${s.key}: SCENARIO.id 缺失`);
    if (!Array.isArray(s.data.CHAPTERS) || s.data.CHAPTERS.length === 0) {
      problems.push(`${s.key}: CHAPTERS 为空`);
    }
    if (!Array.isArray(s.data.ACTIONS) || s.data.ACTIONS.length === 0) {
      problems.push(`${s.key}: ACTIONS 为空`);
    }
    if (!Array.isArray(s.data.DEV_BANDS) || s.data.DEV_BANDS.length === 0) {
      problems.push(`${s.key}: DEV_BANDS 为空`);
    }
  }
  return problems;
}

/**
 * 端到端冒烟:用李斯剧本跑一局到终局。
 * 与 prot/test-sim.js 用的是同一份 engine.js,这里只验证浏览器侧可消费。
 */
function smokeGame(): string {
  const lisi = getScenario('lisi');
  if (!lisi) return 'lisi 数据缺失';

  // 确定性:JS 侧 Game 构造器只吃 (data, diffKey),随机流由内部 mulberry32 派生,
  // 同一份数据必得同一局——因此这里的冒烟结果应当每次刷新都一样。
  const g = new engine.Game(lisi.data as never, 'normal');
  g.start();

  let guard = 0;
  while (g.phase !== 'ending' && guard < 500) {
    guard += 1;
    const ph = g.phase;
    if (ph === 'intro') {
      g.beginEvents();
    } else if (ph === 'round') {
      if (!g.playCard(0)) g.playCard(1);
    } else if (ph === 'event') {
      const opts = g.getOptions();
      let acted = false;
      for (let i = 0; i < opts.length; i += 1) {
        const o = opts[i];
        if (o && !o.locked) {
          acted = !!g.choose(i);
          break;
        }
      }
      if (!acted) g.choose(0);
    } else if (ph === 'choice') {
      const card = g.getChoiceCard();
      if (card && card.options.length > 0) g.chooseCardOption(0);
      else g.cancelChoice();
    } else if (ph === 'settle') {
      g.proceed();
    } else if (ph === 'correction') {
      g.correctionContinue();
    } else if (ph === 'summary') {
      g.proceedSummary();
    } else if (ph === 'endEvent') {
      g.endEventChoose(0);
    } else {
      break;
    }
  }

  if (g.phase !== 'ending') return `未收敛(guard=${guard}, phase=${g.phase})`;
  const e = (g as unknown as { ending: { id: string; grade: string; total: number } }).ending;
  // eslint-disable-next-line no-console
  console.info(
    `[青史志] 冒烟自检:${e.id} / ${e.grade} / ${e.total} 分(种子固定,应可复现)`,
  );
  return `${e.id}·${e.grade}·${e.total}`;
}

function bootstrap(): void {
  initScale();
  logScale();

  const mount = document.getElementById('app');
  if (!mount) throw new Error('#app 未找到');

  const shell = buildShell(mount);

  const engineProblems = checkEngineSurface();
  const dataProblems = checkData();

  let smoke = '未执行';
  try {
    smoke = smokeGame();
  } catch (e) {
    smoke = `异常: ${e instanceof Error ? e.message : String(e)}`;
  }

  const all = [...engineProblems, ...dataProblems];
  if (all.length > 0) {
    // eslint-disable-next-line no-console
    console.error('[青史志] P1 自检未通过:', all);
  } else {
    // eslint-disable-next-line no-console
    console.info('[青史志] P1 自检通过:引擎面 / 数据 / 冒烟对局', smoke);
  }

  shell.band.textContent = all.length === 0 ? `引擎就绪 · ${smoke}` : '自检未通过';
  shell.band.classList.toggle('u-gold', all.length === 0);
  shell.band.classList.toggle('u-zhu', all.length !== 0);
}

// DOM 就绪后再挂载
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
} else {
  bootstrap();
}