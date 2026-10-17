/**
 * 主菜单:中轴居中竖向构图的 H5 版(2026-10-16 改版,参照 design/main-menu-v3.html)。
 *
 * 版式:整页水墨山水底(湖舟松竹,左右留白在中轴);自上而下——
 *   中央柔光层 → 组合主 logo(花纹 + 竖排书法 + 朱印,保留原有组合)→
 *   存档进度胶囊(继续旅程)→ 朱红大按钮「入 局」→ 横排次级项(存档/图鉴/设置/退出)。
 * 不要题签行、卷脚行与底部渐隐带。
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
import { el, lbl, btn } from './kit';
import { getLatestAuto, DIFF_LABEL } from '../game/saves';

import titleImg from '../assets/lua/title-calligraphy.webp';
import logoIconImg from '../assets/lua/logo-icon.webp';
import logoYinImg from '../assets/lua/logo-yin.webp';
import sceneBaseImg from '../assets/menu/scene-base.webp';
import rocksLImg from '../assets/menu/rocks-l.webp';
import rocksRImg from '../assets/menu/rocks-r.webp';
import boatImg from '../assets/menu/boat.webp';
import pineLoopVid from '../assets/menu/pine-loop.mp4';
import bambooTallLoopVid from '../assets/menu/bamboo-tall-loop.mp4';

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

  // ---------- 分层山水场景:20:9 底图 + 近岸礁石 + 两侧视频 + 湖面行舟 ----------
  // 素材来自美术分层(图片_分图层_1):底图已含远山与湖,礁石/舟为独立透明层。
  // 两块礁石素材按画面平衡互换了左右(rocks-r 放左侧,rocks-l 放右侧)。
  // 场景盒固定 20:9、contain 居中,层内元素全部用百分比定位,窗口拉伸不变形;
  // 超宽窗口的两侧空档由 stage 的模糊延展层(art.css)垫底。
  // 动效:左松右竹两段水墨视频循环(灰底经 CSS 提白 + multiply 融进纸面),
  //      小舟从左缓行到右(纯 CSS,见 menu.css)。
  const scene = el('div', 'menu__scene');
  const layer = (cls: string, src: string) => {
    const img = el('img', cls) as HTMLImageElement;
    img.src = src;
    img.alt = '';
    img.draggable = false;
    return img;
  };
  const boat = el('div', 'menu__boat');
  const boatBody = el('div', 'menu__boat-body');
  boatBody.append(layer('menu__boat-img', boatImg), layer('menu__boat-reflect', boatImg));
  boat.append(boatBody);
  // 松(左)/竹(右)水墨视频:循环静音播放,枝叶自带风中摇曳
  const vid = (cls: string, src: string) => {
    const v = el('video', cls) as HTMLVideoElement;
    v.src = src;
    v.autoplay = true;
    v.loop = true;
    v.muted = true;
    v.playsInline = true;
    v.setAttribute('disablepictureinpicture', '');
    return v;
  };
  // 白云:四朵由多层 radial-gradient 拼成的云团,贴着湖面缓缓左→右飘,
  // 在场景内置于底图之上、舟/礁石/松竹视频之下(前景层后面),参数见 menu.css
  const clouds = el('div', 'menu__clouds');
  for (let i = 0; i < 4; i++) clouds.append(el('i'));
  scene.append(
    layer('menu__scene-base', sceneBaseImg),
    clouds,
    boat,
    layer('menu__scene-rocks-l', rocksRImg),
    layer('menu__scene-rocks-r', rocksLImg),
    vid('menu__scene-vid menu__scene-vid--pine', pineLoopVid),
    vid('menu__scene-vid menu__scene-vid--bamboo', bambooTallLoopVid),
  );

  // ---------- 柔光层 ----------
  root.append(scene, el('div', 'menu__glow'));

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

  // 金色主按钮「入 局」(.menu__item--start)
  const enter = el('button', 'menu__item menu__item--start menu__enter');
  enter.type = 'button';
  enter.append(el('span', 'menu__enter-t', '入 局'));
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
  // 弹框与章末结算同口径(2026-10-17):深色蒙版 overlay--dim + 窄幅悬挂卷轴
  // panel-scroll--summary + 描金/幽灵按钮;.menu__confirm/.menu__cbtn--yes 是
  // 测试契约类,只作标记不再带样式。
  function showExitConfirm(): void {
    const ov = el('div', 'menu__confirm overlay overlay--dim');
    const box = el('div', 'menu__confirmbox overlay__box overlay__box--scroll panel-scroll--summary');
    box.append(
      lbl('退出游戏？', 'overlay__title u-kai u-strong'),
      lbl('确定要放下笔,离开这卷青史吗？', 'overlay__body'));
    const row = el('div', 'menu__confirmrow');
    const yes = btn('退 出', { variant: 'primary', cls: 'menu__cbtn menu__cbtn--yes' });
    const no = btn('返 回', { variant: 'ghost', cls: 'menu__cbtn' });
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
