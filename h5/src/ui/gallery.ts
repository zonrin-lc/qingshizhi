/**
 * 青史图鉴:各剧本结局达成情况一览(2026-10-16 按效果图重排)。
 *
 * 版式:标题 + 金线;左栏三 panel(收集总览环 / 印章收集条 / 筛选),
 * 右栏按剧本分节的结局卡片(已达成实线卡 / 未达成虚线卡,同名同尺寸不跳动)。
 *
 * 数据 = 剧本 ENDINGS 定义(惰性加载,与入局同一条管线)+ collection.ts 的
 * 跨局达成记录(localStorage)。未达成的结局只留谜面,不剧透名字与赞文。
 *
 * 五个剧本 JSON 在这里会全部按需下载(与首屏瘦身是 trade-off):
 * 图鉴页本来就是「我要看全部剧本」的场景,且 loadScenario 有缓存,
 * 入过局的剧本不再重复下载。
 */
import { backBtn, el, lbl } from './kit';
import { SCENARIOS, loadScenario } from '../data/scenarios';
import { countEndings, endingRecords, type EndingRec } from '../game/collection';
import type { ScenarioData } from '../../types/scenario';
import sealXunshi from '../assets/gallery/seal-xunshi.png';
import sealGouhuo from '../assets/gallery/seal-gouhuo.png';
import sealWenjian from '../assets/gallery/seal-wenjian.png';
import sealNitian from '../assets/gallery/seal-nitian.png';
import sealBaiju from '../assets/gallery/seal-baiju.png';

export interface GalleryPage {
  root: HTMLElement;
  destroy(): void;
}

/** 五印:展示顺序与效果图一致;色值从印章 PNG 主色取样,给进度条用 */
const SEALS: readonly { name: string; img: string; color: string }[] = [
  { name: '循史', img: sealXunshi, color: '#6b7a86' },
  { name: '苟活', img: sealGouhuo, color: '#8a7a53' },
  { name: '稳健', img: sealWenjian, color: '#527159' },
  { name: '逆天', img: sealNitian, color: '#b34a36' },
  { name: '败局', img: sealBaiju, color: '#7b6b72' },
];
const SEAL_IMG: Record<string, string> = Object.fromEntries(SEALS.map((s) => [s.name, s.img]));

/** 筛选:全部 / 已达成 / 未达成 / 单印 */
type Filter = 'all' | 'done' | 'todo' | string;

interface Entry {
  key: string;
  name: string;
  seal: string;
  zhuan: string;
  rec: EndingRec | undefined;
}

export function renderGalleryPage(host: HTMLElement, onBack: () => void): GalleryPage {
  host.querySelector('.gallery')?.remove();
  const root = el('div', 'gallery');

  const head = el('div', 'gallery__head');
  head.append(
    lbl('青 史 图 鉴', 'page-title'),
    el('div', 'page-rule'),
    lbl('各本结局达成情况 · 跨局累计 · 未达成的结局只留残迹', 'gallery__hint'),
  );
  root.append(backBtn(onBack, '返回主菜单'), head);

  const body = el('div', 'gallery__body');
  root.append(body);
  host.append(root);

  // ---------- 左栏 ----------
  const side = el('div', 'gallery__side');
  body.append(side);

  // 收集总览:环轨贴图固定,达成进度用同半径圆弧叠加(SVG 内绘,不为每个百分比出图)
  const overview = el('section', 'galpanel');
  overview.append(lbl('收 集 总 览', 'galpanel__cap'));
  const ring = el('div', 'galring');
  const arc = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  arc.setAttribute('class', 'galring__arc');
  arc.setAttribute('cx', '120');
  arc.setAttribute('cy', '120');
  arc.setAttribute('r', '106');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 240 240');
  svg.append(arc);
  const ringCenter = el('div', 'galring__center');
  ringCenter.append(lbl('—', 'galring__pct u-kai'), lbl('已达成', 'galring__pctcap u-dim'));
  ring.append(svg, ringCenter);
  const bigNum = el('div', 'galov__big');
  const bigB = el('b', 'u-kai');
  bigB.textContent = '—';
  bigNum.append(bigB, lbl(' / —', 'galov__of u-dim'));
  const ovCaps = el('div', 'galov__caps');
  ovCaps.append(lbl('', 'u-dim'), lbl('', 'u-dim'));
  overview.append(ring, bigNum, ovCaps);
  side.append(overview);

  // 印章收集:五印各一行,图标 + 进度条 + n/m
  const sealPanel = el('section', 'galpanel');
  sealPanel.append(lbl('印 章 收 集', 'galpanel__cap'));
  const sealRows = new Map<string, { fill: HTMLElement; num: HTMLElement }>();
  for (const s of SEALS) {
    const row = el('div', 'galseal');
    const icon = el('img', 'galseal__icon') as HTMLImageElement;
    icon.src = s.img;
    icon.alt = s.name;
    icon.draggable = false;
    const track = el('div', 'galseal__track');
    const fill = el('i', 'galseal__fill');
    fill.style.background = s.color;
    track.append(fill);
    const num = lbl('—/—', 'galseal__num u-dim');
    row.append(icon, lbl(s.name, 'galseal__name u-kai'), track, num);
    sealPanel.append(row);
    sealRows.set(s.name, { fill, num });
  }
  side.append(sealPanel);

  // 筛选:状态三枚 + 五印
  const filterPanel = el('section', 'galpanel');
  filterPanel.append(lbl('筛 选', 'galpanel__cap'));
  const chipBox = el('div', 'galfilter');
  filterPanel.append(chipBox);
  side.append(filterPanel);

  // ---------- 右栏:剧本分节 ----------
  const main = el('div', 'gallery__main');
  body.append(main);

  let filter: Filter = 'all';
  /** 当前筛选下卡片显隐;藏空节,免得整节只剩个标题 */
  const applyFilter = (): void => {
    for (const card of Array.from(main.querySelectorAll<HTMLElement>('.galent'))) {
      const done = card.dataset.done === '1';
      const show =
        filter === 'all' ||
        (filter === 'done' && done) ||
        (filter === 'todo' && !done) ||
        card.dataset.seal === filter;
      card.style.display = show ? '' : 'none';
    }
    for (const sec of Array.from(main.querySelectorAll<HTMLElement>('.galsec'))) {
      const any = Array.from(sec.querySelectorAll<HTMLElement>('.galent')).some((c) => c.style.display !== 'none');
      sec.style.display = any ? '' : 'none';
    }
  };
  const chips: { key: Filter; text: string }[] = [
    { key: 'all', text: '全部' },
    { key: 'done', text: '已达成' },
    { key: 'todo', text: '未达成' },
    ...SEALS.map((s) => ({ key: s.name as Filter, text: s.name })),
  ];
  for (const c of chips) {
    const chip = el('button', `galfilter__chip${c.key === 'all' ? ' is-on' : ''}`) as HTMLButtonElement;
    chip.type = 'button';
    chip.textContent = c.text;
    chip.onclick = () => {
      filter = c.key;
      chipBox.querySelectorAll('.galfilter__chip').forEach((x) => x.classList.toggle('is-on', x === chip));
      applyFilter();
    };
    chipBox.append(chip);
  }

  // 页面销毁后迟到的 resolve 不许再往里写(与 main.ts 的 navToken 同思路)
  let alive = true;

  // 五本全部加载完后一次性算左栏统计(总量/达成量/五印分布)
  const loaded = SCENARIOS.map((sc) => {
    const sec = el('section', 'galsec');
    const headRow = el('div', 'galsec__head');
    headRow.append(lbl(sc.name, 'galsec__name u-kai'), lbl('载入中…', 'galsec__prog u-dim'));
    sec.append(headRow);
    main.append(sec);
    return loadScenario(sc.key).then((data) => {
      if (!alive) return null;
      return fillSection(sec, data);
    });
  });

  void Promise.all(loaded).then((results) => {
    if (!alive) return;
    const all = results.filter((r): r is Entry[] => !!r);
    if (all.length === 0) return;
    const flat = all.flat();
    const total = flat.length;
    const reached = flat.filter((e) => e.rec).length;
    // 总览环:106 是环轨贴图(240×240)的实测带半径,别改
    const C = 2 * Math.PI * 106;
    const pct = total > 0 ? reached / total : 0;
    arc.setAttribute('stroke-dasharray', `${(C * pct).toFixed(1)} ${C.toFixed(1)}`);
    ringCenter.querySelector('.galring__pct')!.textContent = `${Math.round(pct * 100)}%`;
    bigB.textContent = String(reached);
    bigNum.querySelector('.galov__of')!.textContent = ` / ${total}`;
    const [c1, c2] = Array.from(ovCaps.children);
    if (c1) c1.textContent = `五局共 ${total} 种结局`;
    if (c2) c2.textContent = `已收录 ${reached} 种`;
    // 五印进度
    for (const s of SEALS) {
      const ofSeal = flat.filter((e) => e.seal === s.name);
      const got = ofSeal.filter((e) => e.rec).length;
      const row = sealRows.get(s.name);
      if (!row) continue;
      row.fill.style.width = ofSeal.length ? `${(got / ofSeal.length) * 100}%` : '0';
      row.num.textContent = `${got}/${ofSeal.length}`;
    }
  });

  return {
    root,
    destroy() {
      alive = false;
      root.remove();
    },
  };
}

/** 填一节剧本:返回该节全部条目(供左栏聚合统计) */
function fillSection(sec: HTMLElement, data: ScenarioData | null): Entry[] | null {
  const prog = sec.querySelector('.galsec__prog');
  if (!data) {
    if (prog) prog.textContent = '剧本数据加载失败';
    return null;
  }
  const recs = endingRecords(data.SCENARIO.id);
  const total = countEndings(data.ENDINGS);
  const reached = Object.keys(recs).length;
  if (prog) prog.textContent = `结局 ${reached}/${total}`;

  const entries = el('div', 'galsec__entries');
  const out: Entry[] = [];
  const push = (key: string, name: string, sealName: string, zhuan: string, variant = false): void => {
    const rec = recs[key];
    out.push({ key, name, seal: sealName, zhuan, rec });
    entries.append(entry(key, name, sealName, zhuan, rec, variant));
  };
  for (const [id, def] of Object.entries(data.ENDINGS)) {
    push(id, def.name, def.seal, def.zhuan ?? '');
    for (const [vk, v] of Object.entries(def.variants ?? {})) {
      push(`${id}:${vk}`, v.name, def.seal, v.zhuan ?? '', true);
    }
  }
  sec.append(entries);
  return out;
}

/** 一张结局卡:已达成 = 实线白底卡(印 + 名 + 太史公曰摘录 + 达成次数/最佳 + 评级);
 * 未达成 = 虚线浅底卡(? + 未达成)。两卡同底图尺寸,筛选切换不跳动。
 * 变体卡带 galent--variant 从属缩进;data-ending 落结局键供测试与排查。 */
function entry(key: string, name: string, sealName: string, zhuan: string, rec: EndingRec | undefined, variant: boolean): HTMLElement {
  const row = el('div', `galent${variant ? ' galent--variant' : ''}${rec ? '' : ' is-unknown'}`);
  row.dataset.ending = key;
  row.dataset.seal = sealName;
  row.dataset.done = rec ? '1' : '0';
  if (!rec) {
    const col = el('div', 'galent__col');
    col.append(
      lbl('未 达 成', 'galent__name galent__name--unk u-kai'),
      lbl('此结局尚未在任一局中达成', 'galent__quote u-dim'),
    );
    row.append(lbl('?', 'galent__unk'), col);
    return row;
  }
  const icon = el('img', 'galent__seal') as HTMLImageElement;
  icon.src = SEAL_IMG[rec.s || sealName] ?? sealXunshi;
  icon.alt = rec.s || sealName;
  icon.draggable = false;
  const col = el('div', 'galent__col');
  col.append(
    lbl(rec.n || name, 'galent__name u-kai'),
    lbl(zhuan, 'galent__quote u-dim'),
    lbl(`达成 ${rec.c} 回 · 最佳 ${rec.b}`, 'galent__meta u-dim'),
  );
  row.append(icon, col);
  if (rec.g) row.append(lbl(rec.g, `galent__grade u-kai${rec.g === 'S' ? ' is-s' : ''}`));
  return row;
}
