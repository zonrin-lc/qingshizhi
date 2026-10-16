/**
 * 设置页。
 *
 * 音频三项(音乐/音效/朗读)各一条横向滑杆:拖到最左即静音,没有独立开关键
 * (2026-10-15 用户拍板,参照常见音量滑杆的交互)。滑杆左侧的喇叭图标随
 * 音量档位变化:0 打叉 / 低无波 / 中一波 / 高两波。
 *
 * 设置模型不变:music/musicGain 等键照旧持久化 —— 滑杆值 0 即 enabled=false,
 * 大于 0 时 gain=值/100。老存档里的三档值(0.3/0.6/0.9)映射为滑杆位置 30/60/90,
 * 无需迁移。
 *
 * 拖动期间不重画整行(重画会销毁滑杆、打断拖拽),只就地更新图标与填充。
 * 音乐/朗读的改动立刻生效(推给 Bgm/Voice 实例);音效暂只持久化(尚无播放点)。
 */
import { backBtn, clear, el, lbl } from './kit';
import {
  APP_VERSION, applyVisual, loadSettings, updateSettings, type Settings,
} from '../game/settings';
import { fmtTime } from '../game/saves';
import { getStatus, onStatus, syncNow } from '../game/tapcloud';

export interface SettingsPage {
  root: HTMLElement;
  /** 外部(选剧本时)可预置当前值 */
  refresh(): void;
}

/** 喇叭图标的三段声波 + 静音叉,随档位显隐(见 CSS 的 .vol--m* 态) */
const SPEAKER_SVG = `
<svg viewBox="0 0 24 24" aria-hidden="true">
  <path class="vol__body" d="M3 9v6h4l5 4V5L7 9H3z"/>
  <path class="vol__w1" d="M15.5 9.2a4 4 0 0 1 0 5.6"/>
  <path class="vol__w2" d="M18 6.6a8.4 8.4 0 0 1 0 10.8"/>
  <path class="vol__x" d="M15 9.5l6 5.6M21 9.5l-6 5.6"/>
</svg>`;

/** 音量 → 图标档位:0 静音 / 1 低 / 2 中 / 3 高 */
const markOf = (v: number): number => (v <= 0 ? 0 : v < 40 ? 1 : v < 75 ? 2 : 3);

export function renderSettingsPage(host: HTMLElement, onBack: () => void): SettingsPage {
  host.querySelector('.settings')?.remove();
  const root = el('div', 'settings');

  let cur = loadSettings();

  // 界面装饰:梅在右上、竹在左下,不挡交互(pointer-events:none,见 CSS)
  const decoPlum = el('img', 'settings__deco settings__deco--plum') as HTMLImageElement;
  decoPlum.src = new URL('../assets/deco/plum.webp', import.meta.url).href;
  decoPlum.alt = '';
  const decoBamboo = el('img', 'settings__deco settings__deco--bamboo') as HTMLImageElement;
  decoBamboo.src = new URL('../assets/deco/bamboo.webp', import.meta.url).href;
  decoBamboo.alt = '';

  const head = el('div', 'settings__head');
  head.append(lbl('设 置', 'page-title'), el('div', 'page-rule'));

  const list = el('div', 'settings__list');

  /**
   * 一条音量行:标题 + 喇叭图标 + 横向滑杆。
   * read() 返回 (enabled, gain),write(v) 把滑杆值(0-100)写回设置。
   */
  const volRow = (
    title: string,
    read: (s: Settings) => { on: boolean; gain: number },
    write: (v: number) => Partial<Settings>,
  ): HTMLElement => {
    const r = el('div', 'srow srow--vol');
    r.append(el('div', 'srow__title', title));

    const box = el('div', 'vol');
    const icon = el('span', 'vol__icon');
    icon.innerHTML = SPEAKER_SVG;
    const range = el('input', 'vol__range') as HTMLInputElement;
    range.type = 'range';
    range.min = '0';
    range.max = '100';
    range.step = '1';
    range.setAttribute('aria-label', title);

    const paintVol = (v: number): void => {
      range.value = String(v);
      range.style.setProperty('--p', `${v}%`);
      icon.className = `vol__icon vol--m${markOf(v)}`;
    };

    range.addEventListener('input', () => {
      const v = Number(range.value);
      paintVol(v);
      cur = updateSettings(write(v));
      applyAll(cur);
      // 注意不 paint():拖动中重画会销毁这个 input,拖一下就断
    });

    const st = read(cur);
    paintVol(st.on ? Math.round(st.gain * 100) : 0);

    box.append(icon, range);
    r.append(box);
    // refresh() 时要能重读设置:把重绘闭包挂到行上
    (r as HTMLElement & { repaint?: () => void }).repaint = () => {
      const s = read(cur);
      paintVol(s.on ? Math.round(s.gain * 100) : 0);
    };
    return r;
  };

  const paint = () => {
    clear(list);
    list.append(
      volRow('背景音乐', (s) => ({ on: s.music, gain: s.musicGain }),
        (v) => (v > 0 ? { music: true, musicGain: v / 100 } : { music: false })),
      volRow('游戏音效', (s) => ({ on: s.sfx, gain: s.sfxGain }),
        (v) => (v > 0 ? { sfx: true, sfxGain: v / 100 } : { sfx: false })),
      volRow('剧情朗读', (s) => ({ on: s.voice, gain: s.voiceGain }),
        (v) => (v > 0 ? { voice: true, voiceGain: v / 100 } : { voice: false })),
    );
  };

  // ---------- TapTap 云存档(2026-10-16) ----------
  // 只反映状态,不造状态:同步本体在 game/tapcloud.ts。非 TapTap 容器里
  // 按钮藏起来,只留一行说明;容器内显示登录/同步状态 + 「立即同步」。
  const tapRow = el('div', 'srow srow--tap');
  tapRow.append(el('div', 'srow__title', '云存档同步'));
  const tapBox = el('div', 'tapsync');
  const tapText = el('span', 'tapsync__status');
  const tapBtn = el('button', 'tapsync__btn', '立即同步') as HTMLButtonElement;
  tapBtn.type = 'button';
  const paintTap = (): void => {
    const s = getStatus();
    if (!s.env) {
      tapText.textContent = '仅在 TapTap 客户端内可用,当前为本地存档';
      tapBtn.hidden = true;
      return;
    }
    tapBtn.hidden = false;
    tapText.textContent = !s.online ? '未连接 TapTap'
      : s.syncing ? '同步中…'
        : s.pending ? '有改动待同步'
          : s.lastSync ? `已同步 · ${fmtTime(s.lastSync)}`
            : '已连接 TapTap';
  };
  tapBtn.addEventListener('click', () => {
    tapBtn.disabled = true;
    // 官方频控一分钟一次;撞上窗口时这次按 false 收,状态行照常刷新
    void syncNow().then(() => {
      tapBtn.disabled = false;
      paintTap();
    });
  });
  tapBox.append(tapText, tapBtn);
  tapRow.append(tapBox);
  // 设置页没有 destroy 钩子(.hidePages 直接 remove),断开时自我退订
  const offStatus = onStatus(() => {
    if (!root.isConnected) { offStatus(); return; }
    paintTap();
  });
  paintTap();

  const foot = el('div', 'settings__foot');
  foot.append(lbl(`版本 ${APP_VERSION}`, 'settings__ver u-dim'));

  // 返回钮:全站统一的罗盘按钮(kit.backBtn / .pageback)
  const back = backBtn(onBack, '返回主菜单');

  root.append(decoPlum, decoBamboo, back, head, list, foot);
  host.append(root);
  paint();
  // 云同步行不进 paint():它不是设置项,refresh() 重绘滑杆时不能把它抹掉
  list.append(tapRow);

  return {
    root,
    refresh() {
      cur = loadSettings();
      applyAll(cur);
      for (const r of list.querySelectorAll('.srow--vol')) {
        (r as HTMLElement & { repaint?: () => void }).repaint?.();
      }
    },
  };
}

/**
 * 把设置推给音频模块。
 *
 * 放在这个文件里而不是 main.ts:设置页是唯一同时碰 Bgm 和 Voice 的地方,
 * 放这儿,加一项设置时不用再去别处补一次应用逻辑。
 */
function applyAll(s: Settings): void {
  // 视觉项是同步的(CSS 变量),当场生效
  applyVisual(s);
  // 延迟 import 会造成循环依赖(voice → session → ...),这里用静态 import
  void (async () => {
    const [{ bgm }, { voice }] = await Promise.all([
      import('../game/audio'),
      import('../game/voice'),
    ]);
    bgm.setVolume(s.musicGain);
    bgm.setEnabled(s.music);
    voice.setVolume(s.voiceGain);
    voice.setEnabled(s.voice);
  })();
}

/** 进设置页时先按存档里的设置校准一次,避免首次进来对不上 */
export function syncFromStorage(): void {
  const s = loadSettings();
  applyAll(s);
}
