/**
 * 存档页:按剧本分栏的槽位列。
 *
 * 版式对齐参考素材:标题 + 金线装饰 + 剧本选项卡(带右侧箭头)+ 槽位。
 *
 * 两条如实告知(引擎硬约束,见 game/saves.ts 头注):
 * - 存档只存「章首快照」,读档是回到本章开头,不是精确续玩
 * - 硬核难度不可存档
 */
import { btn, el, lbl } from './kit';
import {
  DIFF_LABEL, SLOTS, fmtTime, listSlots, removeSlot, type Slot,
} from '../game/saves';
import { SCENARIOS } from '../data/scenarios';

export interface SavePageOpts {
  /** 当前对局所属剧本 key;有值时该剧本的选项卡高亮并提示可存 */
  currentKey?: string;
  /** 点「存入」时的回调(slot) */
  onSave?: (slot: number) => void;
  /** 点「读取」时的回调(slot,已校验非空) */
  onLoad?: (slot: number, s: Slot) => void;
  onBack: () => void;
}

export function renderSavePage(host: HTMLElement, o: SavePageOpts): void {
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

  // ---------- 剧本选项卡 ----------
  const tabs = el('div', 'saves__tabs');
  const slots = listSlots();
  const counts = new Map<string, number>();
  for (const s of slots) if (s) counts.set(s.scenKey, (counts.get(s.scenKey) ?? 0) + 1);

  for (const sc of SCENARIOS) {
    const tab = el('button', 'stab' + (sc.key === o.currentKey ? ' is-on' : ''));
    tab.type = 'button';
    tab.append(
      lbl(sc.name.split(/[·・]/)[0]?.trim() ?? sc.name, 'stab__name'),
      lbl(`${counts.get(sc.key) ?? 0} 个档`, 'stab__cnt'),
      el('span', 'stab__arrow'),
    );
    tabs.append(tab);
  }

  // ---------- 槽位 ----------
  const list = el('div', 'saves__list');
  for (let i = 0; i < SLOTS; i += 1) {
    const s = slots[i] ?? null;
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
        onClick: () => {
          removeSlot(i);
          renderSavePage(host, o); // 重画,槽位立刻变空
        },
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

  root.append(head, tabs, list);
  host.append(root);
}
