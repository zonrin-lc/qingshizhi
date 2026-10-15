/**
 * 存档页:按剧本分栏的槽位列。
 *
 * 版式对齐参考素材:标题 + 金线装饰 + 剧本选项卡(带右侧箭头)+ 槽位。
 *
 * 两条如实告知(引擎硬约束,见 game/saves.ts 头注):
 * - 存档只存「章首快照」,读档是回到本章开头,不是精确续玩
 * - 硬核难度不可存档
 *
 * 选项卡是活控件(2026-10-14 用户拍板):点击按剧本过滤槽位,「全部」显示所有;
 * 空档不受过滤影响(任何剧本都能存入)。删除存档需二次确认。
 */
import { btn, el, lbl } from './kit';
import {
  DIFF_LABEL, SLOTS, fmtTime, listSlots, removeSlot, type Slot,
} from '../game/saves';
import { SCENARIOS } from '../data/scenarios';

export interface SavePageOpts {
  /** 当前对局所属剧本 key;有值时进页默认过滤到该剧本 */
  currentKey?: string;
  /** 点「存入」时的回调(slot) */
  onSave?: (slot: number) => void;
  /** 点「读取」时的回调(slot,已校验非空) */
  onLoad?: (slot: number, s: Slot) => void;
  onBack: () => void;
}

/** 当前过滤的剧本 key;null = 全部。仅页面内重绘(切选项卡/删档)时保持。 */
let filterKey: string | null = null;

export function renderSavePage(host: HTMLElement, o: SavePageOpts): void {
  // 每次进页重置过滤:对局中进来只看当前剧本,菜单进来默认全部(curKey 初值是 '')
  filterKey = o.currentKey || null;
  draw(host, o);
}

function draw(host: HTMLElement, o: SavePageOpts): void {
  host.querySelector('.saves')?.remove();
  const root = el('div', 'saves');

  // ---------- 标题 ----------
  const head = el('div', 'saves__head');
  head.append(
    lbl('档 案', 'saves__title'),
    el('div', 'saves__rule'),
    lbl('存档记录的是章首快照,读取后回到该章开头;硬核难度不可存档', 'saves__hint'),
  );
  const backBtn = el('button', 'topbtn topbtn--back', '返 回');
  backBtn.type = 'button';
  backBtn.addEventListener('click', o.onBack);
  head.prepend(backBtn);

  // ---------- 剧本选项卡(点击过滤) ----------
  const tabs = el('div', 'saves__tabs');
  const slots = listSlots();
  const counts = new Map<string, number>();
  let total = 0;
  for (const s of slots) {
    if (s) {
      counts.set(s.scenKey, (counts.get(s.scenKey) ?? 0) + 1);
      total += 1;
    }
  }
  const mkTab = (key: string | null, name: string, cnt: number): HTMLElement => {
    const tab = el('button', 'stab' + (key === filterKey ? ' is-on' : ''));
    tab.type = 'button';
    tab.append(
      lbl(name, 'stab__name'),
      lbl(`${cnt} 个档`, 'stab__cnt'),
      el('span', 'stab__arrow'),
    );
    tab.addEventListener('click', () => {
      if (key === filterKey) return;
      filterKey = key;
      draw(host, o);
    });
    return tab;
  };
  tabs.append(mkTab(null, '全部', total));
  for (const sc of SCENARIOS) {
    tabs.append(mkTab(sc.key, sc.name.split(/[·・]/)[0]?.trim() ?? sc.name, counts.get(sc.key) ?? 0));
  }

  // ---------- 槽位 ----------
  const list = el('div', 'saves__list');
  let matched = 0;
  for (let i = 0; i < SLOTS; i += 1) {
    const s = slots[i] ?? null;
    if (s && filterKey && s.scenKey !== filterKey) continue; // 过滤只筛非空档
    if (s) matched += 1;
    const row = el('div', 'slot' + (s ? '' : ' is-empty'));
    const idx = el('div', 'slot__idx', `${i + 1}`);
    if (s) {
      const m = el('div', 'slot__main');
      m.append(
        lbl(`${s.scenName} · ${DIFF_LABEL[s.diffKey]}`, 'slot__title'),
        lbl(s.chapterTitle, 'slot__ch'),
        lbl(
          `年龄 ${s.age ?? '—'} · 本章可回溯 ${s.backtracksLeft} 次 · ${fmtTime(s.at)}`,
          'slot__meta',
        ),
      );
      row.append(idx, m);
      const acts = el('div', 'slot__acts');
      const loadBtn = btn('读 取', {
        variant: 'primary',
        cls: 'slot__btn',
        onClick: () => o.onLoad?.(i, s),
      });
      const delBtn = btn('删 除', {
        variant: 'ghost',
        cls: 'slot__btn',
        onClick: () => confirmDelete(root, () => {
          removeSlot(i);
          draw(host, o); // 重画,槽位立刻变空
        }, s),
      });
      acts.append(loadBtn, delBtn);
      row.append(acts);
    } else {
      const m = el('div', 'slot__main');
      m.append(lbl('空 档', 'slot__title u-dim'));
      row.append(idx, m);
      if (o.onSave) {
        row.append(
          btn('存 入', { variant: 'ghost', cls: 'slot__btn', onClick: () => o.onSave?.(i) }),
        );
      }
    }
    list.append(row);
  }
  if (filterKey && matched === 0) {
    list.prepend(lbl('该剧本暂无存档', 'saves__empty u-dim'));
  }

  root.append(head, tabs, list);
  host.append(root);
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
