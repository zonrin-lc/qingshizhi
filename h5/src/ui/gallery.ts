/**
 * 青史图鉴:各剧本结局达成情况一览。
 *
 * 版式(2026-10-17 对齐存档页):标题 + 金线;左栏大立绘卡(封面 + 金线外框 +
 * 卡底名签/年代/结局进度)+ 5 枚缩略图切换剧本;右栏顶部是跨剧本聚合(收集总览
 * 与印章收集,纯文字),其下是「当前选中剧本」的结局卡片列表(已达成实线卡 /
 * 未达成虚线卡,同尺寸;列表内部滚动,页面本体固定)。已达成卡可点击,弹出该结局
 * 的结算详情(评级/最佳总分/次数/太史公曰)。
 *
 * 数据 = 剧本 ENDINGS 定义(惰性加载,与入局同一条管线)+ collection.ts 的
 * 跨局达成记录(localStorage)。未达成的结局只留谜面,不剧透名字与赞文。
 *
 * 五个剧本 JSON 在这里会全部按需下载(聚合统计需要总量,与首屏瘦身是 trade-off):
 * 图鉴页本来就是「我要看全部剧本」的场景,且 loadScenario 有缓存,
 * 入过局的剧本不再重复下载。
 */
import { backBtn, brandLogo, btn, divider, el, lbl, openDialog, seal } from './kit';
import { SCENARIOS, loadScenario, type ScenarioMeta } from '../data/scenarios';
import { endingRecords, type EndingRec } from '../game/collection';
import type { ScenarioData } from '../../types/scenario';
import { SEALS, sealImg } from '../data/seals';
import imgFrame from '../assets/save/frame.webp';
import coverLisi from '../assets/cover/lisi.webp';
import coverJingke from '../assets/cover/jingke.webp';
import coverHanxin from '../assets/cover/hanxin.webp';
import coverXiangyu from '../assets/cover/xiangyu.webp';
import coverChensheng from '../assets/cover/chensheng.webp';

export interface GalleryPage {
  root: HTMLElement;
  destroy(): void;
}

/** 剧本封面(与存档页同一份) */
const COVERS: Record<string, string> = {
  lisi: coverLisi,
  jingke: coverJingke,
  hanxin: coverHanxin,
  xiangyu: coverXiangyu,
  chensheng: coverChensheng,
};

interface Entry {
  key: string;
  name: string;
  seal: string;
  /** 卡片一句话简介(数据侧 brief;旧数据没有时兜底截赞文首句) */
  intro: string;
  zhuan: string;
  rec: EndingRec | undefined;
}

/** 当前查看的剧本 key;进页重置为第一个剧本(与存档页同口径) */
let selKey = '';

export function renderGalleryPage(host: HTMLElement, onBack: () => void): GalleryPage {
  host.querySelector('.gallery')?.remove();
  selKey = SCENARIOS[0]?.key ?? '';
  const root = el('div', 'gallery');

  const head = el('div', 'gallery__head');
  head.append(
    lbl('青 史 图 鉴', 'page-title'),
    el('div', 'page-rule'),
    lbl('各本结局达成情况 · 跨局累计 · 未达成的结局只留残迹', 'gallery__hint'),
  );
  root.append(backBtn(onBack, '返回主菜单'), head);
  // 右上品牌 logo(2026-10-18 拍板):与选择页同组,.brandcorner 钉到右上
  const corner = brandLogo();
  corner.classList.add('brandcorner');
  root.append(corner);

  const body = el('div', 'gallery__body');
  root.append(body);
  host.append(root);

  // ---------- 左栏:立绘卡 + 缩略图(完全复用存档页 saves__left 一套) ----------
  const side = el('div', 'saves__left');
  body.append(side);
  const portraitSlot = el('div', 'gallery__portrait');
  side.append(portraitSlot);

  const thumbs = el('div', 'saves__thumbs');
  side.append(thumbs);

  // ---------- 右栏:聚合条 + 选中剧本分节 ----------
  const main = el('div', 'gallery__main');
  body.append(main);

  // 聚合条:收集总览 + 印章收集(跨五剧本,不随切换变化;纯文字,不出图)
  const aggr = el('div', 'gallery__aggr');
  main.append(aggr);

  // 收集总览:一行 —— 大数字 n/m + 宽进度条
  const overview = el('section', 'galpanel');
  overview.append(lbl('收 集 总 览', 'galpanel__cap'));
  const stat = el('div', 'galstat');
  const statRow = el('div', 'galstat__row');
  const statBig = el('b', 'galstat__n u-kai');
  statBig.textContent = '—';
  const statOf = lbl(' / —', 'galstat__of u-dim');
  const statTrack = el('div', 'galstat__track');
  const statFill = el('i', 'galstat__fill');
  statTrack.append(statFill);
  statRow.append(statBig, statOf, statTrack);
  stat.append(statRow);
  overview.append(stat);
  aggr.append(overview);

  // 印章收集:五印横排,图标 + 名 + n/m(纯文字)
  const sealPanel = el('section', 'galpanel');
  sealPanel.append(lbl('印 章 收 集', 'galpanel__cap'));
  const sealList = el('div', 'galseals');
  const sealRows = new Map<string, HTMLElement>();
  for (const s of SEALS) {
    const row = el('div', 'galseal');
    const icon = el('img', 'galseal__icon') as HTMLImageElement;
    icon.src = s.img;
    icon.alt = s.name;
    icon.draggable = false;
    const num = lbl('—/—', 'galseal__num u-dim');
    row.append(icon, num);
    sealList.append(row);
    sealRows.set(s.name, num);
  }
  sealPanel.append(sealList);
  aggr.append(sealPanel);

  // 选中剧本的分节容器
  const secSlot = el('div', 'gallery__secs');
  main.append(secSlot);

  // 已达成卡的结算详情浮层(2026-10-20 拍板:复用主菜单退出确认的皮——
  // 深色蒙版 overlay--dim + 窄幅悬挂卷轴 panel-scroll--summary)
  const overlay = el('div', 'overlay overlay--dim');
  overlay.hidden = true;
  root.append(overlay);
  /** 焦点还给刚才点开的那张结局卡(浮层一关,焦点会掉回 body) */
  let detailTrigger: HTMLElement | null = null;
  const closeDetail = (): void => {
    overlay.hidden = true;
    while (overlay.firstChild) overlay.removeChild(overlay.firstChild);
    detailTrigger?.focus?.();
    detailTrigger = null;
  };
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeDetail();
  });
  const showDetail = (e: Entry, trigger?: HTMLElement): void => {
    const rec = e.rec;
    if (!rec) return;
    // 2026-10-21 修:先清空再摆新的 —— 结局卡可聚焦(tabIndex=0),
    // 按住 Enter 的按键重复会连开两次,浮层被挤成两个卷轴盒。
    while (overlay.firstChild) overlay.removeChild(overlay.firstChild);
    const box = el('div', 'overlay__box overlay__box--scroll panel-scroll--summary galdetail');
    // 头部区(2026-10-19 四拍):印章图标在前,结局名 + 成绩/等级 + 达成回数
    // 组成信息列跟在后面,横向一排;名称下的宽幅分隔线一并去掉
    const head = el('div', 'galdetail__head');
    const sealImgEl = el('img', 'galdetail__seal') as HTMLImageElement;
    sealImgEl.src = sealImg(rec.s || e.seal);
    sealImgEl.alt = rec.s || e.seal;
    sealImgEl.draggable = false;
    head.append(sealImgEl);
    const info = el('div', 'galdetail__info');
    info.append(lbl(rec.n || e.name, 'overlay__title u-kai'));
    const total = el('div', 'score score--total');
    total.append(
      el('span', 'score__k u-strong', '最佳'),
      el('span', 'score__v score__v--big u-kai u-strong', String(rec.b)),
      seal(rec.g, 'seal--big'),
    );
    info.append(total);
    head.append(info);
    box.append(head);
    if (e.zhuan) {
      box.append(divider('太史公曰'));
      box.append(lbl(e.zhuan, 'prose u-qing galdetail__zhuan'));
    }
    // 累计达成(2026-10-20 拍板):从头部信息列移出,落在太史公曰与按钮之间,
    // 字号随 .galdetail__meta 对齐正文
    box.append(lbl(`累计达成${rec.c}回`, 'galdetail__meta u-dim'));
    const row = el('div', 'overlay__row');
    const closeBtn = btn('收 起', { variant: 'primary', onClick: () => closeDetail() });
    row.append(closeBtn);
    box.append(row);
    overlay.append(box);
    overlay.hidden = false;
    detailTrigger = trigger ?? null;
    // 无障碍:role/aria-modal 挂盒上,焦点移到主按钮,Esc 关闭(见 kit.openDialog)
    openDialog(overlay, box, { focus: closeBtn, onClose: closeDetail });
  };

  // 页面销毁后迟到的 resolve 不许再往里写(与 main.ts 的 navToken 同思路)
  let alive = true;

  // 每本加载结果缓存:entries 供右栏渲染与聚合统计,thumbCnt 供缩略图小字
  const cache = new Map<string, Entry[] | null>();
  const thumbCnt = new Map<string, HTMLElement>();

  /** 重画立绘卡 + 缩略图选中态 + 右栏分节(切剧本/数据到达时调用) */
  const drawSel = (): void => {
    const meta = SCENARIOS.find((sc) => sc.key === selKey);
    if (!meta) return;
    const entries = cache.get(selKey);

    // 立绘卡(复用存档页 saves__portrait 一套样式)
    portraitSlot.replaceChildren(portrait(meta, entries));

    // 缩略图选中态
    for (const t of Array.from(thumbs.querySelectorAll<HTMLElement>('.stab'))) {
      t.classList.toggle('is-on', t.dataset.key === selKey);
    }

    // 右栏分节
    const sec = el('section', 'galsec');
    const headRow = el('div', 'galsec__head');
    headRow.append(lbl(meta.name, 'galsec__name u-kai'));
    const prog = lbl('载入中…', 'galsec__prog u-dim');
    if (entries) {
      const reached = entries.filter((e) => e.rec).length;
      prog.textContent = `结局 ${reached}/${entries.length}`;
    } else if (cache.has(selKey)) {
      prog.textContent = '剧本数据加载失败';
    }
    headRow.append(prog);
    sec.append(headRow);
    if (entries) {
      const grid = el('div', 'galsec__entries');
      for (const ent of entries) {
        grid.append(entry(ent, ent.key.includes(':'), showDetail));
      }
      sec.append(grid);
    }
    secSlot.replaceChildren(sec);
  };

  // 缩略图:封面小图 + 隐藏计数小字(供测试读取,与存档页 stab__cnt 同口径)
  for (const sc of SCENARIOS) {
    const tab = el('button', 'stab') as HTMLButtonElement;
    tab.type = 'button';
    tab.title = sc.name;
    tab.dataset.key = sc.key;
    const img = el('img', 'stab__img') as HTMLImageElement;
    img.src = COVERS[sc.key] ?? '';
    img.alt = sc.protag;
    img.draggable = false;
    const cnt = lbl('—/—', 'stab__cnt');
    thumbCnt.set(sc.key, cnt);
    tab.append(img, cnt);
    tab.addEventListener('click', () => {
      if (sc.key === selKey) return;
      selKey = sc.key;
      drawSel();
    });
    thumbs.append(tab);
  }
  drawSel();

  // 五本全部按需加载;每到一本:缓存条目、刷缩略图计数,若是当前选中本则重画右栏
  const loaded = SCENARIOS.map((sc) =>
    loadScenario(sc.key).then((data) => {
      if (!alive) return null;
      const entries = data ? buildEntries(data) : null;
      cache.set(sc.key, entries);
      const cnt = thumbCnt.get(sc.key);
      if (cnt) {
        cnt.textContent = entries
          ? `结局 ${entries.filter((e) => e.rec).length}/${entries.length}`
          : '加载失败';
      }
      if (sc.key === selKey) drawSel();
      return entries;
    }),
  );

  // 五本全部加载完后一次性算聚合统计(总量/达成量/五印分布)
  void Promise.all(loaded).then((results) => {
    if (!alive) return;
    const all = results.filter((r): r is Entry[] => !!r);
    if (all.length === 0) return;
    const flat = all.flat();
    const total = flat.length;
    const reached = flat.filter((e) => e.rec).length;
    statBig.textContent = String(reached);
    statOf.textContent = ` / ${total}`;
    statFill.style.width = total > 0 ? `${(reached / total) * 100}%` : '0';
    // 五印计数
    for (const s of SEALS) {
      const ofSeal = flat.filter((e) => e.seal === s.name);
      const got = ofSeal.filter((e) => e.rec).length;
      const num = sealRows.get(s.name);
      if (num) num.textContent = `${got}/${ofSeal.length}`;
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

/** 左栏立绘卡:封面铺底 + 金线外框,卡底叠人物名/年代/结局进度(结构与存档页一致) */
function portrait(meta: ScenarioMeta, entries: Entry[] | null | undefined): HTMLElement {
  const card = el('div', 'saves__portrait');
  const cover = el('img', 'saves__cover') as HTMLImageElement;
  cover.src = COVERS[meta.key] ?? '';
  cover.alt = meta.protag;
  cover.draggable = false;
  const frame = el('img', 'saves__frame') as HTMLImageElement;
  frame.src = imgFrame;
  frame.alt = '';
  frame.draggable = false;

  const plate = el('div', 'saves__plate');
  const total = entries ? entries.length : meta.endings;
  const reached = entries ? entries.filter((e) => e.rec).length : 0;
  plate.append(
    lbl(meta.protag.split('').join(' '), 'saves__name u-kai'),
    lbl(`${meta.era} · ${meta.chapters} 章`, 'saves__era'),
    lbl(entries ? `结局 ${reached}/${total}` : '载入中…', 'saves__status'),
  );
  card.append(cover, frame, plate);
  return card;
}

/** 从剧本数据铺出全部结局条目(本体 + 变体),不建 DOM */
function buildEntries(data: ScenarioData): Entry[] {
  const recs = endingRecords(data.SCENARIO.id);
  const out: Entry[] = [];
  for (const [id, def] of Object.entries(data.ENDINGS)) {
    out.push({ key: id, name: def.name, seal: def.seal, intro: def.brief ?? brief(def.zhuan ?? ''), zhuan: def.zhuan ?? '', rec: recs[id] });
    for (const [vk, v] of Object.entries(def.variants ?? {})) {
      out.push({ key: `${id}:${vk}`, name: v.name, seal: def.seal, intro: v.brief ?? brief(v.zhuan ?? ''), zhuan: v.zhuan ?? '', rec: recs[`${id}:${vk}`] });
    }
  }
  return out;
}

/**
 * 兜底简介:数据没有 brief 字段时,取赞文首句(去「太史公曰：」前缀,截到第一个句读)。
 * 只给已达成卡用 —— 未达成卡仍只留谜面,不剧透。
 */
function brief(zhuan: string): string {
  const t = zhuan.replace(/^太史公曰[::]?\s*/, '');
  const m = t.match(/^[^。；;！!？?]+[。；;！!？?]?/);
  return (m ? m[0] : t).trim();
}

/** 一张结局卡:已达成 = 实线白底卡(印 + 名 + 简介 + 达成次数/最佳 + 评级),可点击弹出结算详情;
 * 未达成 = 虚线浅底卡(? + 未达成)。两卡同底图尺寸。
 * 变体卡带 galent--variant 类(不再缩进,宽度与本体卡统一);data-ending 落结局键供测试与排查。 */
function entry(ent: Entry, variant: boolean, onDetail: (e: Entry, trigger: HTMLElement) => void): HTMLElement {
  const { key, name, seal: sealName, rec } = ent;
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
  icon.src = sealImg(rec.s || sealName);
  icon.alt = rec.s || sealName;
  icon.draggable = false;
  const col = el('div', 'galent__col');
  col.append(lbl(rec.n || name, 'galent__name u-kai'));
  if (ent.intro) col.append(lbl(ent.intro, 'galent__quote u-dim'));
  const meta = lbl(`达成 ${rec.c} 回`, 'galent__meta u-dim');
  // 「· 最佳 N」独立成段(2026-10-21 拍板):移动端整体隐藏,PC 保持原样
  meta.append(lbl(` · 最佳 ${rec.b}`, 'galent__best'));
  col.append(meta);
  row.append(icon, col);
  if (rec.g) row.append(lbl(rec.g, `galent__grade u-kai${rec.g === '甲上' ? ' is-top' : ''}`));
  row.classList.add('is-done');
  row.setAttribute('role', 'button');
  row.tabIndex = 0;
  const fire = (e: Event): void => {
    e.preventDefault();
    onDetail(ent, row);
  };
  row.addEventListener('click', fire);
  row.addEventListener('keydown', (e) => {
    // 按住不放会重复触发 keydown,一次按键弹出两个浮层(2026-10-21 修)
    if (e.repeat) return;
    if (e.key === 'Enter' || e.key === ' ') fire(e);
  });
  return row;
}
