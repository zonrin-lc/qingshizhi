/**
 * 选择页:朝代轮盘 + 五张剧本卡 + 难度选择 + 入局。
 *
 * 这是 H5 的入口。P2 之前 h5 直接起局,没有选择环节;
 * P3 补上这一页后,「选剧本 → 选难度 → 入局」才算完整动线。
 *
 * 立绘按剧本 key 映射到 char/*.webp(由 tools/build-assets.py 从原型 assets/char 转出)。
 * 没配立绘的剧本走空态卡,不拿别人的图顶替。
 */
import type { DiffKey } from '../../types/scenario';
import { prefetch, SCENARIOS, DIFFICULTIES, type ScenarioEntry } from '../data/scenarios';
import { el, lbl } from './kit';

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
  /** 当前选中的剧本 / 难度(供外部读) */
  readonly picked: () => SelectResult;
  /** 外部可预置(读档跳回时用) */
  select(key: string, diff: DiffKey): void;
}

export function renderSelectPage(
  host: HTMLElement,
  onEnter: (r: SelectResult) => void,
  onOpenSaves: () => void,
  onResume?: () => void,
): SelectPage {
  // ⚠ 不要 clear(host):host 是 .stage,清空会把 stage 自己的
  // bar / cols / foot / main / side 一起从 DOM 里摘掉,
  // 之后入局时 Session 再往那些(已成游离节点的)容器里 append,页面就永远空白。
  // 选择页只是 .stage 下的一个兄弟节点,退出时由调用方 remove 掉。
  host.querySelector('.select')?.remove();
  const root = el('div', 'select');

  let curKey = SCENARIOS[0]?.key ?? 'lisi';
  let curDiff: DiffKey = 'normal';

  // ---------- 品牌 ----------
  const brand = el('div', 'select__brand');
  brand.append(
    el('div', 'select__logo', '青史志'),
    lbl('悠悠千载 · 青史万卷', 'select__tagline'),
  );

  // ---------- 朝代轮盘 ----------
  const wheel = el('div', 'select__wheel');
  const wheelDyn = el('div', 'select__dynasty', '秦');
  const wheelSeal = el('div', 'select__seal', '秦');
  const wheelSpan = el('div', 'select__span');
  wheel.append(el('div', 'wheel__ring'), wheelDyn, wheelSeal, wheelSpan);

  // ---------- 剧本卡 ----------
  const cards = el('div', 'select__cards');
  const cardEls = new Map<string, HTMLElement>();
  for (const s of SCENARIOS) {
    const c = el('div', 'scard');
    const art = el('div', 'scard__art');
    const src = PORTRAITS[s.key];
    if (src) {
      const img = el('img', 'scard__img');
      img.src = src;
      img.alt = s.name;
      img.loading = 'lazy';
      art.append(img);
    } else {
      art.classList.add('scard__art--empty');
      art.append(lbl('立绘待补', 'scard__ph'));
    }
    // 竖排局名:「仓鼠之局」
    const name = s.name.split(/[·・]/).slice(1).join('').trim() || s.name;
    c.append(art, lbl(name, 'scard__name'), lbl(`${s.chapters} 章`, 'scard__ch'));
    c.addEventListener('click', () => {
      curKey = s.key;
      paint();
    });
    cardEls.set(s.key, c);
    cards.append(c);
  }

  // ---------- 难度 ----------
  const diff = el('div', 'select__diff');
  diff.append(lbl('难度选择', 'select__difflabel'));
  const diffRow = el('div', 'select__diffrow');
  const diffEls = new Map<DiffKey, HTMLElement>();
  for (const d of DIFFICULTIES) {
    const b = el('button', 'dbtn', DIFF_NAMES[d]);
    b.type = 'button';
    b.addEventListener('click', () => {
      curDiff = d;
      paint();
    });
    diffEls.set(d, b);
    diffRow.append(b);
  }
  diff.append(diffRow);

  // ---------- 档案 / 入局 ----------
  const actions = el('div', 'select__actions');
  const enter = el('button', 'enterbtn', '入 局');
  enter.type = 'button';
  enter.addEventListener('click', () => {
    const s = SCENARIOS.find((x) => x.key === curKey);
    if (s) onEnter({ scenario: s, diff: curDiff });
  });
  const saveBtn = el('button', 'savebtn', '档 案');
  saveBtn.type = 'button';
  saveBtn.addEventListener('click', onOpenSaves);
  actions.append(saveBtn, enter);
  // 有自动档才给「继续上局」——退出对局时自动留下的
  if (onResume) {
    const resume = el('button', 'resumebtn', '继 续 上 局');
    resume.type = 'button';
    resume.addEventListener('click', onResume);
    actions.prepend(resume);
  }

  root.append(brand, wheel, cards, diff, actions);
  host.append(root);

  function paint(): void {
    for (const [k, c] of cardEls) c.classList.toggle('is-on', k === curKey);
    for (const [k, b] of diffEls) b.classList.toggle('is-on', k === curDiff);
    const s = SCENARIOS.find((x) => x.key === curKey);
    if (s) {
      // 轮盘中央的朝代:剧本 key 直接映射,不再读剧本全文(那是入局才加载的)
      const DYNASTY: Record<string, string> = {
        lisi: '秦', jingke: '燕', hanxin: '汉', xiangyu: '楚', chensheng: '秦',
      };
      wheelDyn.textContent = DYNASTY[s.key] ?? '秦';
      wheelSpan.textContent = `${s.chapters} 章 · ${s.name.split(/[·・]/).pop()?.trim() ?? ''}`;
      // 选中即预热:点「入局」时就不用等 JSON 分片
      prefetch(s.key);
    }
  }
  paint();

  return {
    root,
    picked: () => ({ scenario: SCENARIOS.find((s) => s.key === curKey) ?? SCENARIOS[0]!, diff: curDiff }),
    select(key: string, d: DiffKey) {
      curKey = key;
      curDiff = d;
      paint();
    },
  };
}
