/**
 * H5 入口。
 *
 * P2 起不再只是「壳子就位」:这里起一局真实对局(李斯 · 普通难度),
 * 走完「序章 → 关键事件 → 选项 → 属性增减 → 行动卡 → 章末 → 下一章」全链路。
 * 启动时的冒烟自检保留,用于证明 @engine / @data 两条链路在浏览器里仍然通。
 */
import './styles/base.css';
import './styles/stage.css';
import './styles/game.css';

import engine from '@engine';
import type { DiffKey } from '../types/scenario';
import { getScenario, SCENARIOS } from './data/scenarios';
import { initScale, logScale } from './shell/scale';
import { buildShell, renderSide } from './shell/shell';
import { Session } from './game/session';
import { lbl, btn } from './ui/kit';

/** 引擎导出面自检 */
function checkEngineSurface(): string[] {
  const problems: string[] = [];
  if (typeof engine !== 'object' || engine === null) return ['engine 模块不是对象'];
  if (typeof engine.Game !== 'function') problems.push('engine.Game 不是构造函数');
  if (typeof engine.riskWord !== 'function') problems.push('engine.riskWord 缺失');
  return problems;
}

/** 数据管线自检 */
function checkData(): string[] {
  const problems: string[] = [];
  for (const s of SCENARIOS) {
    if (!s.data.SCENARIO?.id) problems.push(`${s.key}: SCENARIO.id 缺失`);
    if (!s.data.CHAPTERS?.length) problems.push(`${s.key}: CHAPTERS 为空`);
    if (!s.data.ACTIONS?.length) problems.push(`${s.key}: ACTIONS 为空`);
  }
  return problems;
}

/** 冒烟:不挂 DOM,只确认引擎能在浏览器里把一局跑到结局 */
function smokeGame(): string {
  const lisi = getScenario('lisi');
  if (!lisi) return 'lisi 数据缺失';
  const g = new engine.Game(lisi.data as never, 'normal');
  g.start();
  let guard = 0;
  while (g.phase !== 'ending' && guard < 500) {
    guard += 1;
    const ph = g.phase;
    if (ph === 'intro') g.beginEvents();
    else if (ph === 'round') {
      if (!g.playCard(0)) g.playCard(1);
    } else if (ph === 'event') {
      const opts = g.getOptions();
      for (let i = 0; i < opts.length; i += 1) {
        const o = opts[i];
        if (o && !o.locked && g.choose(i)) break;
      }
    } else if (ph === 'choice') {
      const c = g.getChoiceCard();
      if (c && c.options.length) g.chooseCardOption(0);
      else g.cancelChoice();
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

  const problems = [...checkEngineSurface(), ...checkData()];
  let smoke = '未执行';
  try {
    smoke = smokeGame();
  } catch (e) {
    smoke = `异常: ${e instanceof Error ? e.message : String(e)}`;
  }

  if (problems.length > 0) {
    console.error('[青史志] 自检未通过:', problems);
  } else {
    console.info('[青史志] 自检通过 · 冒烟', smoke);
  }

  if (problems.length > 0) {
    shell.main.append(
      lbl('自检未通过,已阻断开局', 'u-zhu'),
      ...problems.map((p) => lbl(p, 'u-dim')),
    );
    shell.band.textContent = '自检未通过';
    shell.band.classList.add('u-zhu');
    return;
  }

  // ---------- 起一局真实对局 ----------
  const lisi = getScenario('lisi');
  if (!lisi) {
    shell.main.append(lbl('剧本数据缺失', 'u-zhu'));
    return;
  }
  const diff: DiffKey = 'normal';
  const g = new engine.Game(lisi.data as never, diff);

  const session = new Session(
    g,
    { main: shell.main, opts: shell.foot, chap: shell.bar.querySelector('.stage__chap') as HTMLElement,
      band: shell.band, bar: shell.bar, overlay: shell.overlay },
    () => {
      shell.main.replaceChildren(lbl('对局结束。可刷新重开。', 'u-dim'));
      shell.foot.replaceChildren(
        btn('重 开 一 局', { variant: 'primary', onClick: () => location.reload() }),
      );
    },
  );

  // 每次相位变化都重绘右栏属性
  const patch = (): void => renderSide(shell.side, session.attrRows());
  const origRenderTop = (session as unknown as { renderTop: () => void }).renderTop.bind(session);
  (session as unknown as { renderTop: () => void }).renderTop = function patched(): void {
    origRenderTop();
    patch();
  };

  shell.band.textContent = '';
  shell.band.classList.remove('u-gold');
  session.start();

  // 供控制台调试
  (window as unknown as Record<string, unknown>).__QS__ = { session, game: g };
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
} else {
  bootstrap();
}