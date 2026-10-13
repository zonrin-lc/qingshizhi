/**
 * 选择页:封存 Lua 版 home.lua renderHome 的 H5 复刻。
 *
 * 版式:顶栏(左罗盘返回钮 | 右书法标题)→ 主体(左朝代罗盘 | 右内容列)。
 * 右列自上而下:选择剧本(卡条)→ 选择难度(三枚胶囊)→ 入局(水墨漩涡)。
 *
 * 与 Lua 的行为对齐:
 * - 朝代罗盘可拖可点(见 ui/wheel.ts);只有「秦」已开卷,其余朝代显示准备中,
 *   但难度与入局保持上一选中剧本的状态(Lua 原行为);
 * - 剧本卡:立绘满铺 + 金框 + 底部竖排匾额局名;未选中压暗,悬停上浮;
 * - 难度胶囊:选中赭金/未选中描边,注释跟在选中的那枚正下方;
 * - 入局:水墨漩涡自转 + 呼吸,悬停时在下方浮现「入 局」二字;
 * - 难度名与注释取自剧本数据的 DIFFICULTY 表(选中剧本后异步加载填充)。
 */
import type { DiffKey, ScenarioData } from '../../types/scenario';
import { loadScenario, prefetch, SCENARIOS, DIFFICULTIES, type ScenarioEntry } from '../data/scenarios';
import { el, lbl, vText } from './kit';
import { createWheel, type WheelHandle } from './wheel';

import bgBack from '../assets/lua/back-btn.webp';
import titleH from '../assets/lua/title-h.webp';
import decoGem from '../assets/lua/deco.webp';
import wheelRing from '../assets/lua/wheel-ring.webp';
import archQin from '../assets/lua/arch-qin.webp';
import archHan from '../assets/lua/arch-han.webp';
import archTang from '../assets/lua/arch-tang.webp';
import archSong from '../assets/lua/arch-song.webp';
import archMing from '../assets/lua/arch-ming.webp';
import scenPlate from '../assets/lua/scen-plate.webp';
import vortexImg from '../assets/lua/vortex.webp';

import charLisi from '../assets/char/lisi.webp';
import charJingke from '../assets/char/jingke.webp';
import charHanxin from '../assets/char/hanxin.webp';
import charXiangyu from '../assets/char/xiangyu.webp';
import charChensheng from '../assets/char/chensheng.webp';

const PORTRAITS: Record<string, string> = {
  lisi: charLisi,
  jingke: charJingke,
  hanxin: charHanxin,
  xiangyu: charXiangyu,
  chensheng: charChensheng,
};

/** 与 Lua home.lua 的 DYNASTIES 一致:只有秦已开卷 */
const DYNASTIES = [
  { name: '秦', era: '前 221 — 前 207', hasData: true },
  { name: '汉', era: '前 202 — 220', hasData: false },
  { name: '唐', era: '618 — 907', hasData: false },
  { name: '宋', era: '960 — 1279', hasData: false },
  { name: '明', era: '1368 — 1644', hasData: false },
];

const ARCH: Record<string, string> = {
  秦: archQin, 汉: archHan, 唐: archTang, 宋: archSong, 明: archMing,
};

const DIFF_NAMES: Record<DiffKey, string> = {
  story: '剧情',
  normal: '普通',
  hardcore: '硬核',
};

export interface SelectResult {
  scenario: ScenarioEntry;
  diff: DiffKey;
}

export interface SelectPage {
  root: HTMLElement;
  readonly picked: () => SelectResult;
  select(key: string, diff: DiffKey): void;
  destroy(): void;
}

/** 小标题:金线 ─ 菱饰 ─ 题字 ─ 菱饰 ─ 金线(对齐 theme.Divider,菱饰用素材图) */
function selDivider(text: string): HTMLElement {
  const row = el('div', 'seldivider');
  const gem = () => {
    const g = el('span', 'seldivider__gem');
    g.style.backgroundImage = `url("${decoGem}")`;
    return g;
  };
  row.append(el('span', 'seldivider__rule'), gem(), lbl(text, 'seldivider__txt'),
    gem(), el('span', 'seldivider__rule'));
  return row;
}

export function renderSelectPage(
  host: HTMLElement,
  onEnter: (r: SelectResult) => void,
  onBack: () => void,
): SelectPage {
  // ⚠ 不要 clear(host):host 是 .stage,清空会把 stage 自己的
  // bar / cols / foot / main / side 一起从 DOM 里摘掉,
  // 之后入局时 Session 再往那些(已成游离节点的)容器里 append,页面就永远空白。
  // 选择页只是 .stage 下的一个兄弟节点,退出时由调用方 remove 掉。
  host.querySelector('.select')?.remove();
  const root = el('div', 'select');

  let dynIdx = 0;
  let curKey = SCENARIOS[0]?.key ?? 'lisi';
  let curDiff: DiffKey = 'normal';
  /** 已加载剧本的 DIFFICULTY 表缓存(难度名/注释的来源) */
  let curDiffTab: ScenarioData['DIFFICULTY'] | null = null;

  // ---------- 顶栏:左返回 | 右标题 ----------
  const top = el('div', 'seltop');
  const back = el('button', 'seltop__back') as HTMLButtonElement;
  back.type = 'button';
  back.title = '返回主菜单';
  const backImg = el('img', 'seltop__backimg') as HTMLImageElement;
  backImg.src = bgBack;
  backImg.alt = '返回';
  backImg.draggable = false;
  back.append(backImg);
  back.addEventListener('click', onBack);
  const brand = el('div', 'seltop__brand');
  const titleImg = el('img', 'seltop__title') as HTMLImageElement;
  titleImg.src = titleH;
  titleImg.alt = '青史志';
  titleImg.draggable = false;
  brand.append(titleImg, lbl('悠 悠 千 载  ·  青 史 万 卷', 'seltop__sub'));
  top.append(back, brand);
  root.append(top);

  // ---------- 主体:左罗盘 | 右内容 ----------
  const row = el('div', 'selrow');
  const wheelCol = el('div', 'selwheel');
  const right = el('div', 'selright');
  row.append(wheelCol, right);
  root.append(row);
  host.append(root);

  let wheel: WheelHandle | null = null;

  // ---------- 剧本卡 ----------
  function scenCard(s: ScenarioEntry): HTMLElement {
    const juname = s.name.split(/[·・]/).slice(1).join('').trim() || s.name;
    const sel = s.key === curKey;
    const card = el('div', `scard2${sel ? ' is-on' : ''}`);
    card.setAttribute('role', 'button');
    card.tabIndex = 0;
    const src = PORTRAITS[s.key];
    if (src) {
      const img = el('img', 'scard2__img') as HTMLImageElement;
      img.src = src;
      img.alt = s.name;
      img.loading = 'lazy';
      img.draggable = false;
      card.append(img);
    } else {
      card.append(lbl('立绘待补', 'scard2__ph'));
    }
    if (!sel) card.append(el('div', 'scard2__dim'));
    // 竖排局名匾额(素材:84×180 竖版匾额)
    const plate = el('div', 'scard2__plate');
    plate.style.backgroundImage = `url("${scenPlate}")`;
    plate.append(vText(juname, 'scard2__name'));
    card.append(plate);
    const pick = () => {
      curKey = s.key;
      curDiffTab = null;
      prefetch(s.key);
      buildRight();
      void syncDiff();
    };
    card.addEventListener('click', pick);
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); }
    });
    return card;
  }

  // ---------- 右列 ----------
  function buildRight(): void {
    while (right.firstChild) right.removeChild(right.firstChild);
    const cur = DYNASTIES[dynIdx]!;

    // 剧本区
    const scenGroup = el('div', 'selscen');
    scenGroup.append(selDivider('选 择 剧 本'));
    if (!cur.hasData) {
      const prep = el('div', 'selprep');
      prep.append(vText('准备中', 'selprep__v'),
        lbl('史 笔 未 至 · 此 卷 尚 在 修 撰', 'selprep__note'));
      scenGroup.append(prep);
    } else {
      const stripWrap = el('div', 'selcards');
      const strip = el('div', 'selcards__strip');
      for (const s of SCENARIOS) strip.append(scenCard(s));
      stripWrap.append(strip);
      scenGroup.append(stripWrap);
    }
    right.append(scenGroup);

    // 难度区
    const diffGroup = el('div', 'seldiff');
    diffGroup.append(selDivider('选 择 难 度'));
    const drow = el('div', 'seldiff__row');
    for (const dk of DIFFICULTIES) {
      const sel = dk === curDiff;
      const cap = el('button', `seldiff__cap${sel ? ' is-on' : ''}`) as HTMLButtonElement;
      cap.type = 'button';
      const name = curDiffTab?.[dk]?.n ?? DIFF_NAMES[dk];
      cap.append(lbl(name, 'seldiff__capname'));
      cap.addEventListener('click', () => { curDiff = dk; buildRight(); });
      drow.append(cap);
    }
    diffGroup.append(drow);
    // 注释:跟在选中的那枚胶囊正下方(等宽胶囊,用 grid 同位即可)
    const drow2 = el('div', 'seldiff__row seldiff__row--desc');
    for (const dk of DIFFICULTIES) {
      const desc = dk === curDiff ? (curDiffTab?.[dk]?.desc ?? '') : '';
      drow2.append(lbl(desc, 'seldiff__desc'));
    }
    diffGroup.append(drow2);
    right.append(diffGroup);

    // 入局:水墨漩涡(自转 + 呼吸),悬停浮现「入 局」
    const enter = el('button', 'selenter') as HTMLButtonElement;
    enter.type = 'button';
    enter.title = '入局';
    // 自转与呼吸是两个独立动画,transform 会互相覆盖,故分两层:
    // 外层 span 转,内层 img 缩放(对齐 inkvortex.lua 的 spin + breath)
    const spin = el('span', 'selenter__spin');
    const vortex = el('img', 'selenter__vortex') as HTMLImageElement;
    vortex.src = vortexImg;
    vortex.alt = '';
    vortex.draggable = false;
    spin.append(vortex);
    enter.append(spin, lbl('入 局', 'selenter__lbl'));
    enter.addEventListener('click', () => {
      const s = SCENARIOS.find((x) => x.key === curKey);
      if (s) onEnter({ scenario: s, diff: curDiff });
    });
    right.append(enter);
  }

  // ---------- 罗盘 ----------
  wheel = createWheel({
    items: DYNASTIES,
    index: dynIdx,
    ring: wheelRing,
    arch: ARCH,
    onChange(i) {
      dynIdx = i;
      buildRight();
    },
  });
  wheelCol.append(wheel.el);

  buildRight();

  // 难度名/注释依赖剧本数据:选中剧本后异步填充(数据分片按需加载)
  const syncDiff = async (): Promise<void> => {
    const key = curKey; // 捕获当时的选中项,加载回来后再比一次,防竞态
    const d = await loadScenario(key);
    if (d && curKey === key && d.DIFFICULTY) {
      curDiffTab = d.DIFFICULTY;
      buildRight();
    }
  };
  void syncDiff();

  return {
    root,
    picked: () => ({
      scenario: SCENARIOS.find((s) => s.key === curKey) ?? SCENARIOS[0]!,
      diff: curDiff,
    }),
    select(key: string, d: DiffKey) {
      curKey = key;
      curDiff = d;
      curDiffTab = null;
      prefetch(key);
      buildRight();
      void syncDiff();
    },
    destroy() {
      wheel?.destroy();
      root.remove();
    },
  };
}
