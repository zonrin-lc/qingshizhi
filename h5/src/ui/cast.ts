/**
 * 出场立绘(cast row + 大立绘切换)。
 *
 * 出场角色不是配置出来的,而是扫叙事文本里的 ⟦NPC⟧ 标记:
 * 凡是在场、且有对应立绘的角色,都在大立绘下出一排圆形小像。
 * 这套规则对齐原型 js/ui-core.js 的 CHAR_IMG + renderCast——
 * 数据侧完全复用 prot 的 ⟦词条⟧ 标记,没有另造一套「谁出场」的元数据。
 *
 * 两套图:
 * - 圆像 src/assets/char/*.webp(33 张,来自原型,头肩取景)
 * - 大立绘 src/assets/portrait/*.webp(68 张,本仓库 assets/image/portraits 转)
 * 圆像缺图时用大立绘顶(cover + 上方取景,CSS 已按全身图裁头肩);
 * 大立绘缺图的角色(liubang/jibu)只有圆像,点了开词条、不切换大立绘。
 *
 * 立绘按需加载:eager glob 只把 URL 字符串打进包,
 * 图仍然按 <img> 实际用到才下载。
 */
import { termsOf } from '../game/gloss';
import { el, lbl } from './kit';

/** NPC 名 → 立绘文件 id(对齐原型 ui-core.js 的 CHAR_IMG,2026-10-14 扩到全出场角色) */
export const CHAR_IMG: Record<string, string> = {
  李斯: 'lisi', 荆轲: 'jingke', 韩信: 'hanxin', 项羽: 'xiangyu', 陈胜: 'chensheng',
  吴广: 'wuguang', 范增: 'fanzeng', 樊於期: 'fanwuqi', 扶苏: 'fusu', 高渐离: 'gaojianli',
  韩非: 'hanfei', 胡亥: 'huhai', 季布: 'jibu', 蒯通: 'kuaitong', 刘邦: 'liubang',
  李左车: 'lizuoche', 龙且: 'longju', 蒙恬: 'mengtian', 漂母: 'piaomu', 秦舞阳: 'qinwuyang',
  太子丹: 'taizidan', 田光: 'tianguang', 王翦: 'wangjian', 武臣: 'wuchen', 项伯: 'xiangbo',
  项梁: 'xiangliang', 萧何: 'xiaohe', 嬴政: 'yingzheng', 虞姬: 'yuji', 章邯: 'zhanghan',
  赵高: 'zhaogao', 郑国: 'zhengguo', 钟离眜: 'zhonglimei',
  // —— 2026-10-14 扩充:五本 ⟦NPC⟧ 标记里真实出场的其余人物 ——
  曹沫: 'caomo', 曹无伤: 'caowushang', 陈平: 'chenping', 陈豨: 'chenxi',
  春申君: 'chunshenjun', 淳于越: 'chunyuyue', 樊哙: 'fankuai', 盖聂: 'genie',
  葛婴: 'geying', 侯公: 'hougong', 景驹: 'jingju', 孔鲋: 'kongfu',
  嫪毐: 'laoai', 李园: 'liyuan', 李由: 'liyou', 鲁句践: 'lujujian',
  吕后: 'lvhou', 吕马童: 'lvmatong', 蒙嘉: 'mengjia', 彭越: 'pengyue',
  宋义: 'songyi', 滕公: 'tenggong', 田荣: 'tianrong', 王离: 'wangli',
  夏无且: 'xiawuju', 襄强: 'xiangqiang', 项燕: 'xiangyan', 项庄: 'xiangzhuang',
  徐夫人: 'xufuren', 荀卿: 'xunqing', 义帝: 'yidi', 英布: 'yingbu',
  殷通: 'yintong', 张良: 'zhangliang', 周青臣: 'zhouqingchen', 周文: 'zhouwen',
  庄贾: 'zhuangjia',
};

// eager glob:值就是 { default: url },同步取;只把 URL 字符串打进包
const SMALL = import.meta.glob<{ default: string }>('../assets/char/*.webp', { eager: true });
const BIG = import.meta.glob<{ default: string }>('../assets/portrait/*.webp', { eager: true });

/** 圆像 URL;没有圆像时退回大立绘(CSS 圆裁 + 上方取景,效果等价) */
export function smallPortrait(name: string): string | null {
  const id = CHAR_IMG[name];
  if (!id) return null;
  const mod = SMALL[`../assets/char/${id}.webp`] ?? BIG[`../assets/portrait/${id}.webp`];
  return mod ? mod.default : null;
}

/** 大立绘 URL(liubang/jibu 等无大立绘源的角色返回 null) */
export function bigPortrait(name: string): string | null {
  const id = CHAR_IMG[name];
  if (!id) return null;
  const mod = BIG[`../assets/portrait/${id}.webp`];
  return mod ? mod.default : null;
}

/** 某角色有没有立绘(圆像或大立绘任一) */
export function hasPortrait(name: string): boolean {
  const id = CHAR_IMG[name];
  if (!id) return false;
  return (
    Object.prototype.hasOwnProperty.call(SMALL, `../assets/char/${id}.webp`)
    || Object.prototype.hasOwnProperty.call(BIG, `../assets/portrait/${id}.webp`)
  );
}

/**
 * 从若干段叙事文本里收集「在场且有立绘」的角色,顺序按首次出现。
 * 没有 ⟦NPC⟧ 标记的段落不贡献任何角色。
 */
export function castOf(segs: readonly string[]): string[] {
  const seen: string[] = [];
  for (const s of segs) {
    for (const t of termsOf(s)) {
      if (hasPortrait(t) && !seen.includes(t)) seen.push(t);
    }
  }
  return seen;
}

/**
 * 渲染出场立绘排。
 * @param focus  当前大立绘展示的角色(对应圆像高亮)
 * @param onFocus 点有大立绘的角色:切换大立绘焦点
 * @param onGloss 点没有大立绘的角色:直接开词条
 */
export function renderCast(
  names: readonly string[],
  focus: string,
  onFocus: (name: string) => void,
  onGloss: (name: string) => void,
): HTMLElement | null {
  if (names.length === 0) return null;
  const row = el('div', 'castRow');
  for (const name of names) {
    const src = smallPortrait(name);
    if (!src) continue;
    const chip = el('button', 'castChip' + (name === focus ? ' is-on' : ''));
    chip.type = 'button';
    chip.title = name;
    chip.setAttribute('aria-label', `查看 ${name}`);
    const img = el('img', 'castChip__img');
    img.alt = '';
    img.loading = 'lazy';
    img.src = src;
    chip.append(img, lbl(name, 'castChip__name'));
    chip.addEventListener('click', () => {
      if (bigPortrait(name)) onFocus(name);
      else onGloss(name);
    });
    row.append(chip);
  }
  return row.childElementCount > 0 ? row : null;
}
