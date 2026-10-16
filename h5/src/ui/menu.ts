/**
 * 主菜单:中轴居中竖向构图的 H5 版(2026-10-16 改版,参照 design/main-menu-v3.html)。
 *
 * 版式:整页水墨山水底(湖舟松竹,左右留白在中轴);自上而下——
 *   中央柔光层 → 组合主 logo(花纹 + 竖排书法 + 朱印,保留原有组合)→
 *   存档进度胶囊(继续旅程)→ 朱红大按钮「入 局」→ 横排次级项(存档/图鉴/设置/退出)。
 * 底部一条纸色渐隐带(pagefoot)给入口区做落点,不要题签行与卷脚行。
 *
 * 「退出游戏」是真退出(2026-10-16 拍板):确认后由 onExit 请求容器杀进程 /
 * 浏览器关页(game/tapcloud.ts requestExit);环境拒绝(非脚本打开的窗口等)
 * 时落幕页(青史长存,后会有期)兜底。落幕即停音乐(onExit),「再执笔」回
 * 菜单时恢复(onExitBack)。
 *
 * DOM 契约(h5 测试依赖,勿改):
 *   .menu__item--start / .menu__item--continue / .menu__item--exit 三个按钮类;
 *   次级项含「图 鉴」「设 置」文案;继续按钮无档时 disabled + .is-off;
 *   退出确认 .menu__confirm .menu__cbtn--yes;落幕页 .menu__farewell。
 */
import { el, lbl } from './kit';
import { getLatestAuto, DIFF_LABEL } from '../game/saves';

import titleImg from '../assets/lua/title-calligraphy.webp';
import logoIconImg from '../assets/lua/logo-icon.webp';
import logoYinImg from '../assets/lua/logo-yin.webp';

export interface MenuActions {
  /** 开始游戏 → 选择页 */
  onStart(): void;
  /** 继续旅程(有存档才可用):单档直接进,多档去存档页 */
  onContinue(): void;
  /** 查看存档(有存档才可用) */
  onSaves(): void;
  /** 青史图鉴:各剧本结局达成情况 */
  onGallery(): void;
  onSettings(): void;
  /** 退出游戏(落幕页出现):停掉音乐 */
  onExit(): void;
  /** 落幕页「再执笔」回到菜单:恢复 idle 曲 */
  onExitBack(): void;
  /** 是否有可用存档(决定继续/存档两项亮不亮) */
  hasSaves(): boolean;
}

export interface MenuPage {
  root: HTMLElement;
  destroy(): void;
}

export function renderMenu(host: HTMLElement, act: MenuActions): MenuPage {
  host.querySelector('.menu')?.remove();
  const root = el('div', 'menu');

  // ---------- 柔光层 + 底部纸色渐隐带 ----------
  root.append(el('div', 'menu__glow'), el('div', 'menu__pagefoot'));

  // ---------- 组合主 logo(花纹 + 书法 + 朱印),居中偏上 ----------
  const titleWrap = el('div', 'menu__titlewrap');
  const titleBox = el('div', 'menu__titlebox');
  const icon = el('img', 'menu__logoicon') as HTMLImageElement;
  icon.src = logoIconImg;
  icon.alt = '';
  icon.draggable = false;
  const art = el('img', 'menu__title') as HTMLImageElement;
  art.src = titleImg;
  art.alt = '青史志';
  art.draggable = false;
  const seal = el('img', 'menu__seal') as HTMLImageElement;
  seal.src = logoYinImg;
  seal.alt = '';
  seal.draggable = false;
  titleBox.append(icon, art, seal);
  titleWrap.append(titleBox);
  root.append(titleWrap);

  // ---------- 入口区:进度胶囊 + 入局 + 横排次级项 ----------
  const entry = el('div', 'menu__entry');

  // 存档进度胶囊(.menu__item--continue):永远渲染,无档时 disabled + is-off
  const latest = getLatestAuto();
  const canContinue = act.hasSaves() && latest !== null;
  const resume = el('button', 'menu__item menu__item--continue menu__resume');
  resume.type = 'button';
  resume.append(
    el('span', 'menu__resume-seal', canContinue ? latest.scenName.charAt(0) : '青'),
    el('span', 'menu__resume-t', canContinue ? `${latest.scenName} · ${latest.chapterTitle}` : '尚无存档 · 青史待启'),
  );
  if (canContinue) {
    resume.append(
      el('span', 'menu__resume-s', DIFF_LABEL[latest.diffKey]),
      el('span', 'menu__resume-go', '继续 ›'),
    );
    resume.addEventListener('click', act.onContinue);
  } else {
    resume.disabled = true;
    resume.classList.add('is-off');
  }
  entry.append(resume);

  // 朱红主按钮「入 局」(.menu__item--start)
  const enter = el('button', 'menu__item menu__item--start menu__enter');
  enter.type = 'button';
  enter.append(el('span', 'menu__enter-t', '入 局'), el('span', 'menu__enter-k', 'ENTER'));
  enter.addEventListener('click', act.onStart);
  entry.append(enter);

  // 横排次级项:存 档 ｜ 图 鉴 ｜ 设 置 ｜ 退 出
  const subnav = el('div', 'menu__subnav');
  const mkSub = (text: string, enabled: boolean, onClick?: () => void, cls = '') => {
    const it = el('button', `menu__item menu__item--sub ${cls}`.trim());
    it.type = 'button';
    it.append(el('span', 'menu__label', text));
    if (enabled && onClick) it.addEventListener('click', onClick);
    else {
      it.disabled = true;
      it.classList.add('is-off');
    }
    return it;
  };
  const sep = () => el('span', 'menu__subnav-sep');
  subnav.append(
    mkSub('存 档', act.hasSaves(), act.onSaves),
    sep(),
    mkSub('图 鉴', true, act.onGallery),
    sep(),
    mkSub('设 置', true, act.onSettings),
    sep(),
    mkSub('退 出', true, () => showExitConfirm(), 'menu__item--exit'),
  );
  entry.append(subnav);
  root.append(entry);
  host.append(root);

  // ---------- 退出确认 → 落幕 ----------
  function showExitConfirm(): void {
    const ov = el('div', 'menu__confirm');
    const box = el('div', 'menu__confirmbox');
    box.append(lbl('退出游戏？', 'menu__confirmtitle u-kai'),
      lbl('确定要放下笔,离开这卷青史吗？', 'menu__confirmtext'));
    const row = el('div', 'menu__confirmrow');
    const yes = el('button', 'menu__cbtn menu__cbtn--yes', '退 出');
    const no = el('button', 'menu__cbtn', '再 想 想');
    yes.type = 'button';
    no.type = 'button';
    yes.addEventListener('click', () => {
      ov.remove();
      root.classList.add('is-farewell');
      act.onExit();
      const fw = el('div', 'menu__farewell');
      const again = el('button', 'menu__cbtn menu__cbtn--yes', '再 执 笔');
      again.type = 'button';
      again.addEventListener('click', () => {
        fw.remove();
        root.classList.remove('is-farewell');
        act.onExitBack();
      });
      fw.append(lbl('青史长存 · 后会有期', 'menu__farewelltext u-kai'), again);
      root.append(fw);
    });
    no.addEventListener('click', () => ov.remove());
    row.append(yes, no);
    box.append(row);
    ov.append(box);
    root.append(ov);
  }

  return {
    root,
    destroy() {
      root.remove();
    },
  };
}
