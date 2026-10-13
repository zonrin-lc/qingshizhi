/**
 * 设置页。
 *
 * 版式对齐 Lua 的 settingRow:一行标题 + 若干互斥选项。选项是离散档位
 * 而不是滑杆 —— Lua 那边就是三档,触屏上点三下比拖滑杆准。
 *
 * 音乐/朗读两项的开关与音量都立刻生效(改的是 Bgm/Voice 的实例状态),
 * 不需要重启页面。改完写回 localStorage,下次进来还在。
 */
import { btn, clear, el, lbl } from './kit';
import {
  APP_VERSION, MUSIC_GAIN_OPTS, ON_OFF, SCALE_OPTS, SPEED_OPTS, TEXT_OPTS, VOICE_GAIN_OPTS,
  applyVisual, loadSettings, updateSettings, type Settings,
} from '../game/settings';

export interface SettingsPage {
  root: HTMLElement;
  /** 外部(选剧本时)可预置当前值 */
  refresh(): void;
}

type Opt = { value: unknown; label: string };

export function renderSettingsPage(host: HTMLElement, onBack: () => void): SettingsPage {
  host.querySelector('.settings')?.remove();
  const root = el('div', 'settings');

  let cur = loadSettings();

  const head = el('div', 'settings__head');
  head.append(lbl('设 置', 'settings__title u-kai u-heavy'));

  const list = el('div', 'settings__list');
  /** 重画整张表:任何一项改动后都重画,免得各处 selected 状态不同步 */
  const paint = () => {
    clear(list);
    list.append(
      row('界面缩放', SCALE_OPTS, cur.scale, (v) => set({ scale: v as Settings['scale'] })),
      row('叙事速度', SPEED_OPTS, cur.segDelay, (v) => set({ segDelay: v as number })),
      row('正文字号', TEXT_OPTS, cur.textScale, (v) => set({ textScale: v as Settings['textScale'] })),
      row('剧情朗读', ON_OFF, cur.voice, (v) => set({ voice: v as boolean })),
      row('朗读音量', VOICE_GAIN_OPTS, cur.voiceGain, (v) => set({ voiceGain: v as number })),
      row('背景音乐', ON_OFF, cur.music, (v) => set({ music: v as boolean })),
      row('音乐音量', MUSIC_GAIN_OPTS, cur.musicGain, (v) => set({ musicGain: v as number })),
    );
  };

  const set = (patch: Partial<Settings>): void => {
    cur = updateSettings(patch);
    applyAll(cur);
    paint();
  };

  const foot = el('div', 'settings__foot');
  foot.append(
    lbl(`版本 ${APP_VERSION}`, 'settings__ver u-dim'),
    btn('返 回', { variant: 'primary', cls: 'settings__back', onClick: onBack }),
  );

  root.append(head, list, foot);
  host.append(root);
  paint();

  return {
    root,
    refresh() {
      cur = loadSettings();
      applyAll(cur);
      paint();
    },
  };
}

/** 一行设置:标题 + 互斥选项 */
function row(title: string, opts: readonly Opt[], current: unknown, onPick: (v: unknown) => void): HTMLElement {
  const r = el('div', 'srow');
  const t = el('div', 'srow__title', title);
  const g = el('div', 'srow__opts');
  for (const o of opts) {
    const b = el('button', `sopt${o.value === current ? ' is-on' : ''}`, o.label);
    b.type = 'button';
    b.addEventListener('click', () => onPick(o.value));
    g.append(b);
  }
  r.append(t, g);
  return r;
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
