/**
 * 存档页:按剧本分栏的自动档列表。
 *
 * 版式对齐参考素材:标题 + 金线装饰 + 剧本选项卡(带右侧箭头)+ 槽位。
 *
 * 结构(2026-10-15 二次拍板):
 * - 原来的 6 个手动槽位改为展示该剧本的自动档(最多 AUTO_MAX 条,新→旧);
 *   自动档只在「对局页返回 → 确认存档」时写入,这里不再有「存入」按钮
 * - 暂存区:关页/刷新时的兜底,每剧本只留最近一条
 *
 * 两条如实告知(引擎硬约束,见 game/saves.ts 头注):
 * - 存档记录当前进度,精确到经营轮次(v2.2.0),读档从存档处继续
 * - 硬核难度不可存档
 *
 * 选项卡是活控件(2026-10-14 用户拍板):点击按剧本过滤;
 * 2026-10-15 起去掉「全部」页签,进页默认落在当前剧本(无对局时落第一个剧本)。
 * 删除存档需二次确认。
 */
import { backBtn, btn, el, lbl } from './kit';
import {
  AUTO_MAX, DIFF_LABEL, STASH_MAX, fmtRound, fmtTime, listAutoEntries, listStashEntries, removeAuto, removeStash, type Slot,
} from '../game/saves';
import { SCENARIOS } from '../data/scenarios';

export interface SavePageOpts {
  /** 当前对局所属剧本 key;有值时进页默认过滤到该剧本 */
  currentKey?: string;
  /** 点「读取」时的回调(自动档/暂存条目同口径) */
  onLoad?: (s: Slot) => void;
  onBack: () => void;
}

/** 当前过滤的剧本 key。仅页面内重绘(切选项卡/删档)时保持。 */
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
    lbl('档 案', 'page-title'),
    el('div', 'page-rule'),
    lbl('存档记录当前进度(精确到经营轮次),读取后从存档处继续;硬核难度不可存档', 'saves__hint'),
  );
  // 返回钮:全站统一的罗盘按钮(kit.backBtn),挂 .saves 根(绝对定位,见 base.css .pageback)
  root.append(backBtn(o.onBack, '返回主菜单'));

  // ---------- 剧本选项卡(点击过滤) ----------
  const tabs = el('div', 'saves__tabs');
  const counts = new Map<string, number>();
  for (const e of listAutoEntries()) {
    counts.set(e.slot.scenKey, (counts.get(e.slot.scenKey) ?? 0) + 1);
  }
  const mkTab = (key: string, name: string, cnt: number): HTMLElement => {
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
  for (const sc of SCENARIOS) {
    tabs.append(mkTab(sc.key, sc.name.split(/[·・]/)[0]?.trim() ?? sc.name, counts.get(sc.key) ?? 0));
  }

  // ---------- 自动档槽位(该剧本最多 AUTO_MAX 条,新→旧;空行无「存入」) ----------
  const list = el('div', 'saves__list');
  const entries = listAutoEntries(filterKey);
  for (let i = 0; i < AUTO_MAX; i += 1) {
    const e = entries[i];
    const s = e?.slot ?? null;
    const row = el('div', 'slot' + (s ? '' : ' is-empty'));
    const idx = el('div', 'slot__idx', `${i + 1}`);
    if (s && e) {
      const m = el('div', 'slot__main');
      m.append(
        lbl(`${s.scenName} · ${DIFF_LABEL[s.diffKey]}`, 'slot__title'),
        lbl(`${s.chapterTitle}${fmtRound(s.roundNo) ? ` · ${fmtRound(s.roundNo)}` : ''}`, 'slot__ch'),
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
        onClick: () => o.onLoad?.(s),
      });
      const delBtn = btn('删 除', {
        variant: 'ghost',
        cls: 'slot__btn',
        onClick: () => confirmDelete(root, () => {
          removeAuto(s.scenKey, e.idx);
          draw(host, o); // 重画,槽位立刻变空
        }, s),
      });
      acts.append(loadBtn, delBtn);
      row.append(acts);
    } else {
      const m = el('div', 'slot__main');
      m.append(lbl('空 档', 'slot__title u-dim'));
      row.append(idx, m);
    }
    list.append(row);
  }
  if (entries.length === 0) {
    list.prepend(lbl('该剧本暂无存档', 'saves__empty u-dim'));
  }

  // ---------- 暂存:关页/刷新时自动落档,每剧本只保留最近一条 ----------
  const stashEntries = listStashEntries(filterKey);
  const stashBox = el('div', 'saves__stash');
  stashBox.append(
    lbl('暂 存', 'saves__stashtitle u-kai'),
    lbl(`对局中直接关闭页面时自动暂存;每个剧本只保留最近 ${STASH_MAX} 条`, 'saves__hint'),
  );
  if (stashEntries.length === 0) {
    stashBox.append(lbl('暂无暂存', 'saves__empty u-dim'));
  } else {
    for (const { slot: s, idx } of stashEntries) {
      const row = el('div', 'slot slot--stash');
      const idxEl = el('div', 'slot__idx', '暂');
      const m = el('div', 'slot__main');
      m.append(
        lbl(`${s.scenName} · ${DIFF_LABEL[s.diffKey]}`, 'slot__title'),
        lbl(`${s.chapterTitle}${fmtRound(s.roundNo) ? ` · ${fmtRound(s.roundNo)}` : ''}`, 'slot__ch'),
        lbl(
          `年龄 ${s.age ?? '—'} · 本章可回溯 ${s.backtracksLeft} 次 · ${fmtTime(s.at)}`,
          'slot__meta',
        ),
      );
      row.append(idxEl, m);
      const acts = el('div', 'slot__acts');
      acts.append(
        btn('读 取', {
          variant: 'primary',
          cls: 'slot__btn',
          onClick: () => o.onLoad?.(s),
        }),
        btn('删 除', {
          variant: 'ghost',
          cls: 'slot__btn',
          onClick: () => confirmDelete(root, () => {
            removeStash(s.scenKey, idx);
            draw(host, o);
          }, s),
        }),
      );
      row.append(acts);
      stashBox.append(row);
    }
  }

  root.append(head, tabs, list, stashBox);
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
