/**
 * 选择页:封存 Lua 版 home.lua renderHome 的 H5 复刻。
 *
 * 版式:顶栏(左罗盘返回钮 | 右书法标题)→ 主体(左朝代罗盘 | 右内容列)。
 * 右列:手风琴卡条 + 横排条(「选择剧本」小标题已按 2026-10-15 拍板摘除)。
 *
 * 2026-10-15 改版(用户拍板):
 * - 剧本卡不再叠放;默认窄条、占满右列整个高度,选中那张展宽、立绘完整显现;
 * - 难度选择(横排胶囊,注释钉在各自按钮正下方)与入局漩涡排在卡条下方,同一横排;
 * - 朝代罗盘可拖可点(见 ui/wheel.ts);只有「秦」已开卷,其余朝代显示朝代预告页
 *   (见 ui/teaser.ts,2026-10-16 拍板,替代原「准备中」占位);回秦后难度状态保持;
 * - 难度名与注释取自剧本数据的 DIFFICULTY 表(选中剧本后异步加载填充);
 * - 选中态全部原地更新(不重建 DOM),手风琴才有过渡动画;
 * - 点漩涡直接入局(2026-10-17 二拍:漩涡放大 + 粒子穿梭转场已去,只留对局页自身淡入)。
 */
import type { DiffKey, ScenarioData } from '../../types/scenario';
import { loadScenario, prefetch, SCENARIOS, DIFFICULTIES, type ScenarioEntry } from '../data/scenarios';
import { lockReason } from '../game/collection';
import { backBtn, brandLogo, el, lbl, toast, vText } from './kit';
import { sfx } from '../game/sfx';
import { renderTeaser } from './teaser';
import { createWheel, type WheelHandle } from './wheel';

import wheelRing from '../assets/lua/wheel-ring.webp';
import archQin from '../assets/lua/arch-qin.webp';
import archHan from '../assets/lua/arch-han.webp';
import archTang from '../assets/lua/arch-tang.webp';
import archSong from '../assets/lua/arch-song.webp';
import archMing from '../assets/lua/arch-ming.webp';
import scenPlate from '../assets/lua/scen-plate.webp';
import vortexImg from '../assets/lua/vortex-gold.webp';
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

  // ---------- 顶栏:左返回(罗盘,挂 .select 根,脱出 seltop 流)| 右标题 ----------
  const top = el('div', 'seltop');
  // .pageback 相对最近的定位祖先(.select)定位;挂进 seltop 会与其 top:3vh 双重偏移
  const back = backBtn(onBack, '返回主菜单');
  // 品牌 logo(圆徽 + 书法标题 + 落款印 + 副题)走 kit.brandLogo 工厂,
  // 与存档/图鉴/设置页的右上 logo 同一份(2026-10-18 拍板)
  top.append(brandLogo());
  root.append(back, top);

  // ---------- 页首标题:复用存档页/设置页全站样式(page-title + 金线,2026-10-17 拍板) ----------
  const head = el('div', 'selhead');
  head.append(lbl('选 择 剧 本', 'page-title'), el('div', 'page-rule'));
  root.append(head);

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
  const capEls = new Map<DiffKey, HTMLButtonElement>();
  const hintEls = new Map<DiffKey, HTMLElement>();
  /** 共享提示位:当前选中难度的说明,集中显示在开始按钮上方(2026-10-19 拍板,移动端) */
  let allHintEl: HTMLElement | null = null;

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
      // 未解锁的剧本也允许选中预览(2026-10-20 拍板):拦截放在「开始」入局时
      curKey = s.key;
      curDiffTab = null;
      prefetch(s.key);
      syncSelection();
      syncDiffUI();
      void syncDiff();
    };
    card.addEventListener('click', pick);
    card.addEventListener('click', () => sfx.play('card'));
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); }
    });
    return card;
  }

  /** 选中态原地更新,不重建 DOM——手风琴的过渡动画全靠这个 */
  function syncSelection(): void {
    cardEls.forEach(({ s, card }) => {
      card.classList.toggle('is-on', s.key === curKey);
    });
  }

  /** 难度胶囊选中态/名称/注释原地刷新(注释钉在各自按钮正下方) */
  function syncDiffUI(): void {
    for (const dk of DIFFICULTIES) {
      const cap = capEls.get(dk);
      if (cap) {
        cap.classList.toggle('is-on', dk === curDiff);
        const nameEl = cap.querySelector('.seldiff__capname');
        if (nameEl) nameEl.textContent = curDiffTab?.[dk]?.n ?? DIFF_NAMES[dk];
      }
      const hint = hintEls.get(dk);
      if (hint) hint.textContent = curDiffTab?.[dk]?.desc ?? '';
    }
    // 共享提示位只显示当前选中难度的说明(跟随 is-on 切换)
    if (allHintEl) allHintEl.textContent = curDiffTab?.[curDiff]?.desc ?? '';
  }

  // ---------- 右列 ----------
  function buildRight(): void {
    while (right.firstChild) right.removeChild(right.firstChild);
    cardEls.length = 0;
    capEls.clear();
    hintEls.clear();
    allHintEl = null;
    const cur = DYNASTIES[dynIdx]!;

    // 未开卷朝代(汉/唐/宋/明):整列换成朝代预告页(2026-10-16 拍板,见 ui/teaser.ts),
    // 剧本卡条与难度/入局横排条一律不渲染。
    if (!cur.hasData) {
      const teaser = renderTeaser(cur.name);
      if (teaser) right.append(teaser);
      return;
    }

    const scenGroup = el('div', 'selscen');
    const stage = el('div', 'selstage');

    for (const s of SCENARIOS) {
      const card = scenCard(s);
      cardEls.push({ s, card });
      stage.append(card);
    }

    // 横排条:难度胶囊(每枚自带注释) + 入局漩涡,排在卡条下方(2026-10-15 拍板)。
    const drawer = el('div', 'seldrawer');
    const din = el('div', 'seldrawer__in');
    const caps = el('div', 'seldrawer__caps');
    for (const dk of DIFFICULTIES) {
      const item = el('div', 'seldiff');
      const cap = el('button', 'seldiff__cap') as HTMLButtonElement;
      cap.type = 'button';
      cap.append(lbl(DIFF_NAMES[dk], 'seldiff__capname'));
      cap.addEventListener('click', () => { sfx.play('click'); curDiff = dk; syncDiffUI(); });
      capEls.set(dk, cap);
      const hint = lbl('', 'seldiff__hint');
      hintEls.set(dk, hint);
      item.append(cap, hint);
      caps.append(item);
    }
    din.append(caps);
    // 共享提示位(2026-10-19 拍板):选中难度的说明统一显示在开始按钮上方,
    // 替代逐枚胶囊下方的注释(移动端竖排口径);桌面仍用胶囊下注释
    allHintEl = lbl('', 'seldrawer__allhint');
    din.append(allHintEl);
    // 入局:暗金水墨漩涡(自转 + 呼吸),白色「开始」常显于漩涡正中
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
    enter.append(spin, lbl('开始', 'selenter__lbl'));
    enter.addEventListener('click', () => {
      // 开放限制(2026-10-20 拍板):点「开始」入局时校验,未解锁弹 toast 拦下
      const reason = lockReason(curKey);
      if (reason) { sfx.play('fail'); toast(root, reason, true); return; }
      sfx.play('enter');
      const s = SCENARIOS.find((x) => x.key === curKey);
      if (s) onEnter({ scenario: s, diff: curDiff });
    });
    din.append(enter);
    drawer.append(din);

    scenGroup.append(stage, drawer);
    right.append(scenGroup);

    syncSelection();
    syncDiffUI();
    // 首帧后再挂 is-open,横排条才有展开动画(直接带类出生不会过渡)
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
      // 朝代切换:右栏淡入(类删了再加,动画才重播;与中心盘 is-swap 同手法)
      right.classList.remove('is-swap');
      void right.offsetWidth;
      right.classList.add('is-swap');
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
