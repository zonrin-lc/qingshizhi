/**
 * 五印(循史/苟活/稳健/逆天/败局)的印章图,图鉴页与对局结算共用一份。
 * 原在 ui/gallery.ts 里私有;2026-10-19 结局/详情浮层顶端类型也要换成印章图,
 * 抽到这里避免 game 层反向 import ui 层。
 */
import sealXunshi from '../assets/gallery/seal-xunshi.png';
import sealGouhuo from '../assets/gallery/seal-gouhuo.png';
import sealWenjian from '../assets/gallery/seal-wenjian.png';
import sealNitian from '../assets/gallery/seal-nitian.png';
import sealBaiju from '../assets/gallery/seal-baiju.png';

/** 五印:展示顺序与效果图一致 */
export const SEALS: readonly { name: string; img: string }[] = [
  { name: '循史', img: sealXunshi },
  { name: '苟活', img: sealGouhuo },
  { name: '稳健', img: sealWenjian },
  { name: '逆天', img: sealNitian },
  { name: '败局', img: sealBaiju },
];

export const SEAL_IMG: Record<string, string> = Object.fromEntries(SEALS.map((s) => [s.name, s.img]));

/** 印名取图,认不得的印名回退循史印 */
export function sealImg(name: string): string {
  return SEAL_IMG[name] ?? sealXunshi;
}
