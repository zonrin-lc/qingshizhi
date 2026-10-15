/**
 * 选择页:封存 Lua 版 home.lua renderHome 的 H5 复刻。
 *
 * 版式:顶栏(左罗盘返回钮 | 右书法标题)→ 主体(左朝代罗盘 | 右内容列)。
 * 右列:小标题「选择剧本」→ 手风琴卡条 + 抽屉。
 *
 * 2026-10-15 改版(用户拍板):
 * - 剧本卡不再叠放;默认窄条、占满右列整个高度,选中那张展宽、立绘完整显现;
 * - 难度选择(竖排胶囊)与入局漩涡收进一只「抽屉」,跟在选中卡旁边滑出;
 * - 朝代罗盘可拖可点(见 ui/wheel.ts);只有「秦」已开卷,其余朝代显示准备中,
 *   但难度与入局保持上一选中剧本的状态(Lua 原行为,抽屉照常挂在右侧);
 * - 难度名与注释取自剧本数据的 DIFFICULTY 表(选中剧本后异步加载填充);
 * - 选中态全部原地更新(不重建 DOM),手风琴与抽屉才有过渡动画。
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
import coverLisi from '../assets/cover/lisi.webp';
import coverJingke from '../assets/cover/jingke.webp';
import coverHanxin from '../assets/cover/hanxin.webp';
import coverXiangyu from '../assets/cover/xiangyu.webp';
import coverChensheng from '../assets/cover/chensheng.webp';

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

/** 剧本封面(带水墨背景),按剧本 key 取 */
const COVERS: Record<string, string> = {
  lisi: coverLisi,
  jingke: coverJingke,
  hanxin: coverHanxin,
  xiangyu: coverXiangyu,
  chensheng: coverChensheng,
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

  // ---------- 剧本卡(手风琴:默认窄条占满高度,选中展宽) ----------
  const cardEls: { s: ScenarioEntry; card: HTMLElement }[] = [];
  let drawerEl: HTMLElement | null = null;
  const capEls = new Map<DiffKey, HTMLButtonElement>();
  let descEl: HTMLElement | null = null;

  function scenCard(s: ScenarioEntry): HTMLElement {
    const juname = s.name.split(/[·・]/).slice(1).join('').trim() || s.name;
    const card = el('div', 'scard2');
    card.setAttribute('role', 'button');
    card.tabIndex = 0;
    // 封面:带水墨背景的完整立绘(2026-10-14 拍板,不再用白底抠图)
    const src = COVERS[s.key];
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
    // 压暗层常驻,选中时用 CSS 淡出(原地更新才有过渡)
    card.append(el('div', 'scard2__dim'));
    // 竖排局名匾额(素材:84×180 竖版匾额)
    const plate = el('div', 'scard2__plate');
    plate.style.backgroundImage = `url("${scenPlate}")`;
    plate.append(vText(juname, 'scard2__name'));
    card.append(plate);
    const pick = () => {
      if (s.key === curKey) return;
      curKey = s.key;
      curDiffTab = null;
      prefetch(s.key);
      syncSelection();
      syncDiffUI();
      void syncDiff();
    };
    card.addEventListener('click', pick);
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); }
    });
    return card;
  }

  /** 选中态与排序原地更新,不重建 DOM——手风琴与抽屉的过渡动画全靠这个 */
  function syncSelection(): void {
    const selIdx = Math.max(0, SCENARIOS.findIndex((x) => x.key === curKey));
    cardEls.forEach(({ s, card }, i) => {
      card.classList.toggle('is-on', s.key === curKey);
      card.style.order = String(i * 2);
    });
    // 抽屉跟在选中卡旁边(选中卡占偶数位,抽屉占其后的奇数位)
    if (drawerEl) drawerEl.style.order = String(selIdx * 2 + 1);
  }

  /** 难度胶囊选中态/名称/注释原地刷新 */
  function syncDiffUI(): void {
    for (const dk of DIFFICULTIES) {
      const cap = capEls.get(dk);
      if (!cap) continue;
      cap.classList.toggle('is-on', dk === curDiff);
      const nameEl = cap.querySelector('.seldiff__capname');
      if (nameEl) nameEl.textContent = curDiffTab?.[dk]?.n ?? DIFF_NAMES[dk];
    }
    if (descEl) descEl.textContent = curDiffTab?.[curDiff]?.desc ?? '';
  }

  // ---------- 右列 ----------
  function buildRight(): void {
    while (right.firstChild) right.removeChild(right.firstChild);
    cardEls.length = 0;
    capEls.clear();
    descEl = null;
    drawerEl = null;
    const cur = DYNASTIES[dynIdx]!;

    const scenGroup = el('div', 'selscen');
    scenGroup.append(selDivider('选 择 剧 本'));
    const stage = el('div', 'selstage');

    if (cur.hasData) {
      for (const s of SCENARIOS) {
        const card = scenCard(s);
        cardEls.push({ s, card });
        stage.append(card);
      }
    } else {
      const prep = el('div', 'selprep');
      prep.append(vText('准备中', 'selprep__v'),
        lbl('史 笔 未 至 · 此 卷 尚 在 修 撰', 'selprep__note'));
      stage.append(prep);
    }

    // 抽屉:竖排难度胶囊 + 入局漩涡,跟在选中卡旁边滑出。
    // 未开卷朝代没有卡,抽屉照常挂右侧(难度与入局保持上一选中剧本状态——Lua 原行为)
    const drawer = el('div', 'seldrawer');
    const din = el('div', 'seldrawer__in');
    din.append(lbl('难 度', 'seldrawer__title'));
    const caps = el('div', 'seldrawer__caps');
    for (const dk of DIFFICULTIES) {
      const cap = el('button', 'seldiff__cap') as HTMLButtonElement;
      cap.type = 'button';
      cap.append(lbl(DIFF_NAMES[dk], 'seldiff__capname'));
      cap.addEventListener('click', () => { curDiff = dk; syncDiffUI(); });
      capEls.set(dk, cap);
      caps.append(cap);
    }
    din.append(caps);
    descEl = lbl('', 'seldrawer__desc');
    din.append(descEl);
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
    din.append(enter);
    drawer.append(din);
    stage.append(drawer);
    drawerEl = drawer;

    scenGroup.append(stage);
    right.append(scenGroup);

    syncSelection();
    syncDiffUI();
    // 首帧后再挂 is-open,抽屉才有滑出动画(直接带类出生不会过渡)
    requestAnimationFrame(() => requestAnimationFrame(() => drawer.classList.add('is-open')));
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
      syncDiffUI();
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
