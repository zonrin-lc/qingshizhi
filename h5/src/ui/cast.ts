/**
 * 出场立绘(cast row)。
 *
 * 立绘不是「一张主角大图」,而是扫叙事文本里的 ⟦NPC⟧ 标记:
 * 凡是在场、且有对应立绘的角色,都在标题下出一排圆形小像,点按开词条。
 * 这套规则对齐原型 js/ui-core.js 的 CHAR_IMG + renderCast——
 * 数据侧完全复用 prot 的 ⟦词条⟧ 标记,没有另造一套「谁出场」的元数据。
 *
 * 立绘按需加载:33 张全量进包会让首屏多 0.75 MB,
 * 所以用 import.meta.glob 的惰性版本,只有真正出场的那几张才会去下载。
 */
import { termsOf } from '../game/gloss';
import { el, lbl } from './kit';

/** NPC 名 → 立绘文件 id(对齐原型 ui-core.js 的 CHAR_IMG) */
export const CHAR_IMG: Record<string, string> = {
  李斯: 'lisi', 荆轲: 'jingke', 韩信: 'hanxin', 项羽: 'xiangyu', 陈胜: 'chensheng',
  吴广: 'wuguang', 范增: 'fanzeng', 樊於期: 'fanwuqi', 扶苏: 'fusu', 高渐离: 'gaojianli',
  韩非: 'hanfei', 胡亥: 'huhai', 季布: 'jibu', 蒯通: 'kuaitong', 刘邦: 'liubang',
  李左车: 'lizuoche', 龙且: 'longju', 蒙恬: 'mengtian', 漂母: 'piaomu', 秦舞阳: 'qinwuyang',
  太子丹: 'taizidan', 田光: 'tianguang', 王翦: 'wangjian', 武臣: 'wuchen', 项伯: 'xiangbo',
  项梁: 'xiangliang', 萧何: 'xiaohe', 嬴政: 'yingzheng', 虞姬: 'yuji', 章邯: 'zhanghan',
  赵高: 'zhaogao', 郑国: 'zhengguo', 钟离眜: 'zhonglimei',
};

// 立绘按需加载。
// eager:true 把 33 个 URL 打进主包(约 2 KB 字符串),但不内联图片数据——
// 图仍然按 <img> 实际用到才下载。这样既避免了 33 个 ~100 B 的碎分片,
// 又不会把 0.75 MB 的立绘塞进首屏。eager:false 会在 dist 里留下 33 个小 JS。
const loaders = import.meta.glob<{ default: string }>('../assets/char/*.webp', { eager: true });

/** 某角色有没有立绘 */
export function hasPortrait(name: string): boolean {
  const id = CHAR_IMG[name];
  return !!id && Object.prototype.hasOwnProperty.call(loaders, `../assets/char/${id}.webp`);
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
 * @param onPick 点击某个角色时的回调(通常是打开词条浮层)
 */
export function renderCast(names: readonly string[], onPick: (name: string) => void): HTMLElement | null {
  if (names.length === 0) return null;
  const row = el('div', 'castRow');
  for (const name of names) {
    const id = CHAR_IMG[name];
    if (!id) continue;
    const chip = el('button', 'castChip');
    chip.type = 'button';
    chip.title = name;
    chip.setAttribute('aria-label', `查看 ${name}`);
    const img = el('img', 'castChip__img');
    img.alt = '';
    img.loading = 'lazy';
    // eager glob:值就是 { default: url },同步取
    const mod = loaders[`../assets/char/${id}.webp`];
    if (mod) img.src = mod.default;
    chip.append(img, lbl(name, 'castChip__name'));
    chip.addEventListener('click', () => onPick(name));
    row.append(chip);
  }
  return row.childElementCount > 0 ? row : null;
}
