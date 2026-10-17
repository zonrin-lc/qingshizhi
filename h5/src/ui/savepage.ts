/**
 * 存档页:左栏立绘卡 + 剧本缩略图,右栏摘要条 + 槽位 + 暂存。
 *
 * 版式对齐 assets/image/save/ 参考素材(2026-10-16 第三次拍板):
 * - 左栏:选中剧本的大立绘(封面图 + save-frame 金线外框),
 *   卡底叠人物名/年代/状态行;下方 5 枚缩略图切换剧本(替代旧选项卡)
 * - 右栏:save-bar 摘要条(剧本名 + 硬核提示 + 存档计数 + 最远进度);
 *   有档时 6 条槽位(save-slot/save-slot-empty 底图),无档时 save-guide 引导卡;
 *   最底部暂存区(标题复用摘要条剧名样式)
 * - 按钮底图:btn-gold(读取/主按钮) / btn-plain(删除/次按钮)
 *
 * 存档语义(v2.2.0 轮次存档,两条如实告知,见 game/saves.ts 头注):
 * - 存档记录当前进度,精确到经营轮次,读档从存档处继续(空档引导卡上说明)
 * - 硬核难度不可存档(摘要条剧名后小字)
 *
 * 缩略图是活控件:点击按剧本过滤;进页默认落在当前剧本(无对局时落第一个剧本)。
 * 删除存档需二次确认。
 */
import { backBtn, btn, el, lbl } from './kit';
import {
  AUTO_MAX, DIFF_LABEL, STASH_MAX, fmtRound, fmtTime, listAutoEntries, listStashEntries, removeAuto, removeStash, type Slot,
} from '../game/saves';
import { endingRecords } from '../game/collection';
import { SCENARIOS, type ScenarioMeta } from '../data/scenarios';
import imgFrame from '../assets/save/frame.webp';
import coverLisi from '../assets/cover/lisi.webp';
import coverJingke from '../assets/cover/jingke.webp';
import coverHanxin from '../assets/cover/hanxin.webp';
import coverXiangyu from '../assets/cover/xiangyu.webp';
import coverChensheng from '../assets/cover/chensheng.webp';

const COVERS: Record<string, string> = {
  lisi: coverLisi,
  jingke: coverJingke,
  hanxin: coverHanxin,
  xiangyu: coverXiangyu,
  chensheng: coverChensheng,
};

export interface SavePageOpts {
  /** 当前对局所属剧本 key;有值时进页默认过滤到该剧本 */
  currentKey?: string;
  /** 点「读取」时的回调(自动档/暂存条目同口径) */
  onLoad?: (s: Slot) => void;
  /** 空态引导卡「开始新局」:去选剧本页 */
  onStart?: () => void;
  onBack: () => void;
}

/** 当前过滤的剧本 key。仅页面内重绘(切缩略图/删档)时保持。 */
let filterKey = '';

export function renderSavePage(host: HTMLElement, o: SavePageOpts): void {
  // 每次进页重置过滤:对局中进来只看当前剧本,菜单进来落第一个剧本
  filterKey = o.currentKey && SCENARIOS.some((sc) => sc.key === o.currentKey)
    ? o.currentKey
    : (SCENARIOS[0]?.key ?? '');
  draw(host, o);
}

function draw(host: HTMLElement, o: SavePageOpts): void {
  host.querySelector('.saves')?.remove();
  const root = el('div', 'saves');

  // ---------- 标题 ----------
  const head = el('div', 'saves__head');
  head.append(
    lbl('青 史 存 档', 'page-title'),
    el('div', 'page-rule'),
  );
  // 返回钮:全站统一的罗盘按钮(kit.backBtn),挂 .saves 根(绝对定位,见 base.css .pageback)
  root.append(backBtn(o.onBack, '返回主菜单'));

  // ---------- 数据:各剧本存档计数 + 当前剧本的档位 ----------
  const counts = new Map<string, number>();
  for (const e of listAutoEntries()) {
    counts.set(e.slot.scenKey, (counts.get(e.slot.scenKey) ?? 0) + 1);
  }
  const meta = SCENARIOS.find((sc) => sc.key === filterKey) ?? SCENARIOS[0];
  const entries = listAutoEntries(filterKey);

  // ---------- 左栏:立绘卡 + 缩略图 ----------
  const left = el('div', 'saves__left');
  if (meta) left.append(portraitCard(meta, entries.map((e) => e.slot)));

  const thumbs = el('div', 'saves__thumbs');
  for (const sc of SCENARIOS) {
    const cnt = counts.get(sc.key) ?? 0;
    // 保留 stab/stab__cnt 类名:存档链路测试据此找页签与计数
    const tab = el('button', 'stab' + (sc.key === filterKey ? ' is-on' : ''));
    tab.type = 'button';
    tab.title = sc.name;
    const img = el('img', 'stab__img') as HTMLImageElement;
    img.src = COVERS[sc.key] ?? '';
    img.alt = sc.protag;
    img.draggable = false;
    tab.append(img, lbl(`${cnt} 个档`, 'stab__cnt'));
    tab.addEventListener('click', () => {
      if (sc.key === filterKey) return;
      filterKey = sc.key;
      draw(host, o);
    });
    thumbs.append(tab);
  }
  left.append(thumbs);

  // ---------- 右栏:摘要条 + 槽位/引导卡 + 指示格 + 暂存 ----------
  const right = el('div', 'saves__right');
  if (meta) right.append(summaryBar(meta, entries.map((e) => e.slot)));

  const list = el('div', 'saves__list');
  if (entries.length === 0 && meta) {
    list.append(guideCard(meta, o));
  } else {
    for (let i = 0; i < AUTO_MAX; i += 1) {
      const entry = entries[i];
      list.append(slotRow(i, entry?.slot ?? null, root, o, host, () => {
        if (entry) removeAuto(filterKey, entry.idx);
      }));
    }
  }
  right.append(list);

  // ---------- 暂存:关页/刷新时自动落档,每剧本只保留最近一条 ----------
  right.append(stashBox(filterKey, root, o, host));

  const body = el('div', 'saves__body');
  body.append(left, right);
  root.append(head, body);
  host.append(root);
}

/** 左栏立绘卡:封面铺底 + 金线外框,卡底叠人物名/年代/状态行 */
function portraitCard(meta: ScenarioMeta, slots: Slot[]): HTMLElement {
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
  plate.append(
    lbl(meta.protag.split('').join(' '), 'saves__name u-kai'),
    lbl(`${meta.era} · ${meta.chapters} 章`, 'saves__era'),
    lbl(statusLine(meta, slots), 'saves__status'),
  );
  card.append(cover, frame, plate);
  return card;
}

/** 状态行:空=「尚无存档 · 推荐首局」;有=「N 个存档 · 结局 X/Y · 最远 章名」 */
function statusLine(meta: ScenarioMeta, slots: Slot[]): string {
  if (slots.length === 0) return '尚无存档 · 推荐首局';
  const reached = Object.keys(endingRecords(meta.id)).length;
  const far = furthest(slots);
  return `${slots.length} 个存档 · 结局 ${reached}/${meta.endings} · 最远 ${far}`;
}

/** 最远进度:chapterIdx 最大的那一条的章题 */
function furthest(slots: Slot[]): string {
  let best: Slot | undefined;
  for (const s of slots) {
    if (!best || s.chapterIdx > best.chapterIdx) best = s;
  }
  return best?.chapterTitle ?? '—';
}

/** 右栏顶部摘要条:剧本名 + 硬核提示 | 存档计数 + 最远进度 */
function summaryBar(meta: ScenarioMeta, slots: Slot[]): HTMLElement {
  const bar = el('div', 'saves__bar');
  const l = el('div', 'saves__barl');
  l.append(
    lbl(meta.name, 'saves__barname u-kai'),
    lbl('硬核难度不可存档', 'saves__barhint u-dim'),
  );
  const r = el('div', 'saves__barr');
  r.append(lbl('存 档', 'saves__barcap'), lbl(`${slots.length} / ${AUTO_MAX}`, 'saves__barnum u-kai'));
  if (slots.length > 0) {
    r.append(lbl('最 远', 'saves__barcap'), lbl(furthest(slots), 'saves__barfar u-kai'));
  }
  bar.append(l, r);
  return bar;
}

/** 一条槽位:序号 + 题签/章/元信息 + 读取/删除 */
function slotRow(
  i: number, s: Slot | null, root: HTMLElement, o: SavePageOpts, host: HTMLElement, onDel: () => void,
): HTMLElement {
  const row = el('div', 'slot' + (s ? '' : ' is-empty'));
  const idx = el('div', 'slot__idx', `${i + 1}`);
  if (!s) {
    const m = el('div', 'slot__main');
    m.append(lbl('空 档', 'slot__title u-dim'));
    row.append(idx, m);
    return row;
  }
  const m = el('div', 'slot__main');
  m.append(
    lbl(`${s.scenName} · ${DIFF_LABEL[s.diffKey]}`, 'slot__title'),
    // 题签行:章名 · 轮次 · 年龄/回溯/时间(2026-10-17 拍板:原第三行并到第二行末尾)
    lbl(
      `${s.chapterTitle}${fmtRound(s.roundNo) ? ` · ${fmtRound(s.roundNo)}` : ''} · 年龄 ${s.age ?? '—'} · 本章可回溯 ${s.backtracksLeft} 次 · ${fmtTime(s.at)}`,
      'slot__ch',
    ),
  );
  const acts = el('div', 'slot__acts');
  acts.append(
    btn('读 取', { variant: 'primary', cls: 'slot__btn', onClick: () => o.onLoad?.(s) }),
    btn('删 除', {
      variant: 'ghost',
      cls: 'slot__btn',
      onClick: () => confirmDelete(root, () => {
        onDel();
        draw(host, o); // 重画,槽位立刻变空
      }, s),
    }),
  );
  row.append(idx, m, acts);
  return row;
}

/** 无存档引导卡(save-guide 底图):印章 + 题字 + 说明 + 开始新局 */
function guideCard(meta: ScenarioMeta, o: SavePageOpts): HTMLElement {
  const g = el('div', 'saves__guide');
  g.append(
    el('span', 'saves__guideseal u-kai', '空'),
    lbl('尚 未 落 笔', 'saves__guidetitle u-kai'),
    el('div', 'saves__guiderule'),
    // .saves__empty 类名留给存档链路测试辨认「过滤为空」态
    lbl(`「${meta.name}」这一卷还空着。`, 'saves__empty'),
    lbl('开局之后,你的进度就会留在这里。', 'saves__guidetext u-dim'),
    btn('开 始 新 局', { variant: 'primary', cls: 'saves__start', onClick: () => o.onStart?.() }),
    lbl(`· 存档记录当前进度(精确到经营轮次)　· 硬核难度不可存档　· 共 ${AUTO_MAX} 个槽位`, 'saves__guidehints u-dim'),
  );
  return g;
}

/** 暂存区:题签 + 说明(同行跟在标题后)+ 最近一条(暂字 badge) */
function stashBox(key: string, root: HTMLElement, o: SavePageOpts, host: HTMLElement): HTMLElement {
  const stashEntries = listStashEntries(key);
  const box = el('div', 'saves__stash');
  // 标题复用摘要条剧名样式(saves__barname),说明小字跟在同一行
  const st = el('div', 'saves__stashhead');
  st.append(
    lbl('暂 存', 'saves__stashtitle saves__barname u-kai'),
    lbl(`对局中直接关闭页面时自动暂存 · 每个剧本只保留最近 ${STASH_MAX} 条`, 'saves__hint'),
  );
  box.append(st);
  if (stashEntries.length === 0) {
    // 空态与上方存档槽位同款:暂字 badge + 虚线空档(2026-10-17 拍板)
    const row = el('div', 'slot slot--stash is-empty');
    const m = el('div', 'slot__main');
    m.append(lbl('空 档', 'slot__title u-dim'));
    row.append(el('div', 'slot__idx slot__idx--stash', '暂'), m);
    box.append(row);
    return box;
  }
  for (const { slot: s, idx } of stashEntries) {
    const row = el('div', 'slot slot--stash');
    const idxEl = el('div', 'slot__idx slot__idx--stash', '暂');
    const m = el('div', 'slot__main');
    m.append(
      lbl(`${s.scenName} · ${DIFF_LABEL[s.diffKey]}`, 'slot__title'),
      lbl(
        `${s.chapterTitle}${fmtRound(s.roundNo) ? ` · ${fmtRound(s.roundNo)}` : ''} · 年龄 ${s.age ?? '—'} · 本章可回溯 ${s.backtracksLeft} 次 · ${fmtTime(s.at)}`,
        'slot__ch',
      ),
    );
    const acts = el('div', 'slot__acts');
    acts.append(
      btn('读 取', { variant: 'primary', cls: 'slot__btn', onClick: () => o.onLoad?.(s) }),
      btn('删 除', {
        variant: 'ghost',
        cls: 'slot__btn',
        onClick: () => confirmDelete(root, () => {
          removeStash(s.scenKey, idx);
          draw(host, o);
        }, s),
      }),
    );
    row.append(idxEl, m, acts);
    box.append(row);
  }
  return box;
}

/** 删除存档的二次确认浮层(2026-10-14 用户拍板:删除不可一键完成) */
function confirmDelete(root: HTMLElement, onYes: () => void, s: Slot): void {
  root.querySelector('.saves__confirm')?.remove();
  const ov = el('div', 'saves__confirm');
  const box = el('div', 'saves__confirmbox');
  box.append(
    lbl('删除存档？', 'saves__confirmtitle u-kai'),
    lbl(`「${s.scenName} · ${s.chapterTitle}」`, 'saves__confirmtext'),
    lbl('删除后不可恢复。', 'saves__confirmtext u-dim'),
  );
  const row = el('div', 'saves__confirmrow');
  row.append(
    btn('删 除', { variant: 'primary', onClick: onYes }),
    btn('再 想 想', { variant: 'ghost', onClick: () => ov.remove() }),
  );
  box.append(row);
  ov.append(box);
  // 点遮罩空白处视为取消
  ov.addEventListener('click', (e) => {
    if (e.target === ov) ov.remove();
  });
  root.append(ov);
}
