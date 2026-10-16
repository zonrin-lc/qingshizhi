/**
 * 朝代预告页(2026-10-16 设计稿 dynasty-teaser.html 落地)。
 *
 * 未开卷朝代(汉/唐/宋/明)在选择页右列展示的内容,替代原先的竖排「准备中」:
 *   ① 题头(朝代大字 + 年代 + 英文 + 金线)
 *   ② 一句话定位(lede,可带朱色高亮段)
 *   ③ 时代关键词(胶囊样式)
 *   ④ 开卷进度(考据/编纂/校验/开卷 四节点三态图)
 *   ⑤ 即将登场(teaser-card.png 底板的剧本占位卡:只显示四字剧名+年代,
 *      不显示人物名、无人立绘——2026-10-16 用户拍板)
 *   ⑥ 底注(回秦提示 + 罗盘提示)
 *
 * 数据全部内建在本文件:朝代预告是展示层内容,没有剧本数据文件可挂。
 */
import { el, lbl } from './kit';

import teaserCard from '../assets/teaser/teaser-card.png';
import stepDone from '../assets/teaser/step-done.png';
import stepNow from '../assets/teaser/step-now.png';
import stepTodo from '../assets/teaser/step-todo.png';

/** 开卷进度四节点:0 考据 / 1 编纂 / 2 校验 / 3 开卷 */
const STEPS = ['考据', '编纂', '校验', '开卷'] as const;
const STEP_IMG = [stepDone, stepNow, stepTodo] as const;

export interface TeaserCard {
  /** 四字剧名(「××之局」),不出现人物名 */
  name: string;
  /** 年代范围(人物生卒,剧本时间跨度) */
  era: string;
}

export interface Teaser {
  /** 朝代大字 */
  glyph: string;
  /** 年代,如「前 202 — 220」 */
  era: string;
  /** 国祚口语,如「四百年」 */
  span: string;
  /** 英文题签 */
  en: string;
  /** 定位句:段数组,[文本, 是否朱色高亮] */
  lede: [string, boolean?][];
  /** 时代关键词 */
  tags: string[];
  /** 进度当前节点下标(0-3),之前的节点为已完成 */
  step: number;
  /** 进度注记,如「三卷待启 · 此卷编纂中」 */
  progNote: string;
  cards: TeaserCard[];
}

/** 汉:即将登场人物(2026-10-16 暂定 7 人,当前只展示前 3 位,其余暂不曝光)。
 *  按用户拍板,卡上只落四字剧名与生卒年,人物名只留在本注释里备查。
 *  待曝光:王莽「新莽之局 前 45 — 23」/王昭君「出塞之局 约前 52 — 前 19」
 *        /华佗「青囊之局 约 145 — 208」/东方朔「滑稽之局 约前 161 — 前 93」 */
const HAN_CARDS: TeaserCard[] = [
  { name: '轮台之局', era: '前 156 — 前 87' },   // 刘彻
  { name: '冠军之局', era: '前 140 — 前 117' },  // 霍去病
  { name: '难封之局', era: '约前 186 — 前 119' }, // 李广
];

/** 唐/宋/明人物未定:三张空白占位卡 */
const TBD_CARDS: TeaserCard[] = [
  { name: '剧 名 待 定', era: '年 代 待 定' },
  { name: '剧 名 待 定', era: '年 代 待 定' },
  { name: '剧 名 待 定', era: '年 代 待 定' },
];

const TEASERS: Record<string, Teaser> = {
  汉: {
    glyph: '汉',
    era: '前 202 — 220',
    span: '四百年',
    en: 'H A N   D Y N A S T Y',
    lede: [
      ['布衣提三尺剑取天下,'],
      ['汉承秦制', true],
      ['而定四百年基业——从白马之盟到丝绸之路,从文景之治到党锢之祸。'],
    ],
    tags: ['楚汉相争', '白马之盟', '文景之治', '汉武拓边', '丝绸之路', '外戚与宦官'],
    step: 1,
    progNote: '三卷待启 · 此卷编纂中',
    cards: HAN_CARDS,
  },
  唐: {
    glyph: '唐',
    era: '618 — 907',
    span: '近三百年',
    en: 'T A N G   D Y N A S T Y',
    lede: [
      ['以关中本位揽天下英才,开'],
      ['贞观、开元', true],
      ['两世之盛——从玄武门到马嵬驿,从诗酒盛唐到藩镇残照。'],
    ],
    tags: ['贞观之治', '开元盛世', '玄奘西行', '安史之乱', '藩镇割据', '黄巢起义'],
    step: 0,
    progNote: '此卷考据中',
    cards: TBD_CARDS,
  },
  宋: {
    glyph: '宋',
    era: '960 — 1279',
    span: '三百二十年',
    en: 'S O N G   D Y N A S T Y',
    lede: [
      ['陈桥兵变黄袍加身,'],
      ['以文治立国', true],
      ['三百二十年——从杯酒释兵权到靖康之耻,从汴梁梦华到崖山落日。'],
    ],
    tags: ['陈桥兵变', '杯酒释兵权', '澶渊之盟', '王安石变法', '靖康之耻', '崖山海战'],
    step: 0,
    progNote: '此卷考据中',
    cards: TBD_CARDS,
  },
  明: {
    glyph: '明',
    era: '1368 — 1644',
    span: '二百七十六年',
    en: 'M I N G   D Y N A S T Y',
    lede: [
      ['起于布衣而驱逐胡虏,'],
      ['复我中华衣冠', true],
      ['——从洪武建制到永乐远航,从土木堡之变到煤山余烬。'],
    ],
    tags: ['洪武建制', '永乐远航', '土木堡之变', '张居正改革', '万历三大征', '崇祯殉国'],
    step: 0,
    progNote: '此卷考据中',
    cards: TBD_CARDS,
  },
};

/** 渲染朝代预告面板;数据缺失时回退为 null(调用方兜底) */
export function renderTeaser(dynasty: string): HTMLElement | null {
  const t = TEASERS[dynasty];
  if (!t) return null;
  const root = el('div', 'teaser');

  // ① 题头:大字 + 年代/英文 + 金线
  const head = el('div', 'teaser__head');
  head.append(el('span', 'teaser__glyph', t.glyph));
  const meta = el('div', 'teaser__meta');
  meta.append(
    lbl(`${t.era} · ${t.span}`, 'teaser__era'),
    lbl(t.en, 'teaser__en'),
  );
  head.append(meta, el('i', 'teaser__hline'));
  root.append(head);

  // ② 定位句
  const lede = el('p', 'teaser__lede');
  for (const [seg, hi] of t.lede) {
    lede.append(hi ? el('b', 'teaser__hi', seg) : document.createTextNode(seg));
  }
  root.append(lede);

  // ③ 时代关键词
  const tags = el('div', 'teaser__tags');
  for (const name of t.tags) {
    tags.append(el('span', 'teaser__tag', name));
  }
  root.append(tags);

  // ④ 开卷进度:节点三态图
  const prog = el('div', 'teaser__prog');
  const phead = el('div', 'teaser__phead');
  phead.append(lbl('开 卷 进 度', 'teaser__pk'), lbl(t.progNote, 'teaser__pv'));
  const steps = el('div', 'teaser__steps');
  STEPS.forEach((name, i) => {
    if (i > 0) steps.append(el('i', 'teaser__bar'));
    const step = el('span', 'teaser__step' + (i < t.step ? ' is-done' : i === t.step ? ' is-now' : ''));
    const dot = el('img', 'teaser__dot') as HTMLImageElement;
    dot.src = STEP_IMG[i < t.step ? 0 : i === t.step ? 1 : 2];
    dot.alt = '';
    dot.draggable = false;
    step.append(dot, lbl(name, 'teaser__st'));
    steps.append(step);
  });
  prog.append(phead, steps);
  root.append(prog);

  // ⑤ 即将登场:剧本占位卡(四字剧名 + 年代,无人物名/立绘)
  const soon = el('div', 'teaser__soon');
  const stitle = el('div', 'teaser__stitle');
  stitle.append(lbl('即 将 登 场', 'teaser__stxt'));
  stitle.append(lbl('剧本征集中', 'teaser__snote'));
  soon.append(stitle);
  const cards = el('div', 'teaser__cards' + (t.cards.length > 3 ? ' teaser__cards--x4' : ''));
  for (const c of t.cards) {
    const card = el('div', 'teaser__tcard');
    card.style.backgroundImage = `url("${teaserCard}")`;
    const body = el('div', 'teaser__tbody');
    body.append(lbl(c.name, 'teaser__tname'), lbl(c.era, 'teaser__tera'));
    card.append(body);
    cards.append(card);
  }
  soon.append(cards);
  root.append(soon);

  // ⑥ 底注
  const foot = el('div', 'teaser__foot');
  const hint = el('span', 'teaser__fhint');
  hint.append(el('i', 'teaser__fdot'), document.createTextNode('此卷尚未开卷,可先回「秦」入局'));
  foot.append(hint, lbl('转动罗盘可查看其它朝代', 'teaser__fnote'));
  root.append(foot);

  return root;
}
