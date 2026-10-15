/**
 * 设置:封存 Lua 版 home.lua showSettings 的 H5 对应。
 *
 * 键名与 Lua 一致(scale/segDelay/textScale/voice/voiceGain/music/musicGain),
 * 存 localStorage;脏档(截断/手改)回落默认值,与 Lua loadSettings 的守卫一致。
 *
 * 生效路径分三类:
 * - 音频(音乐/朗读开关与音量)→ 由 ui/settings.ts 的 applyAll 推给 bgm/voice
 *   (那边是异步 import,避免 voice → session → settings 的循环依赖);
 * - 叙事速度(segDelay,毫秒)→ 订阅制:main.ts 用 onSegDelay 接到 Session.setSegDelay;
 * - 视觉(界面缩放/正文字号)→ applyVisual 写 CSS var(--user-scale / --text-scale)。
 */
/**
 * 版本号唯一真源是 prot/package.json,由 vite.config.ts 在构建期注入 __APP_VERSION__
 * (那边的注释解释了为什么不能手抄第三份 —— ui-core.js 的契约上次就漂过了)。
 */
export const APP_VERSION = `v${__APP_VERSION__} · H5 版`;

export interface Settings {
  scale: 'small' | 'default' | 'large';
  /** 段间隔(毫秒):慢 1100 / 标准 650 / 快 300(Lua 里是秒,这里直接存毫秒) */
  segDelay: number;
  textScale: 'small' | 'normal' | 'large';
  voice: boolean;
  voiceGain: number;
  music: boolean;
  musicGain: number;
}

export const DEFAULTS: Settings = {
  scale: 'default', segDelay: 650, textScale: 'normal',
  voice: true, voiceGain: 1.0, music: true, musicGain: 0.6,
};

/** 选项表与 Lua home.lua 的 *_OPTS 一一对应 */
export const SCALE_OPTS = [
  { value: 'small', label: '小' },
  { value: 'default', label: '标准' },
  { value: 'large', label: '大' },
] as const;
export const SPEED_OPTS = [
  { value: 1100, label: '慢' },
  { value: 650, label: '标准' },
  { value: 300, label: '快' },
] as const;
export const TEXT_OPTS = [
  { value: 'small', label: '小' },
  { value: 'normal', label: '标准' },
  { value: 'large', label: '大' },
] as const;
export const ON_OFF = [
  { value: true, label: '开' },
  { value: false, label: '关' },
] as const;
export const VOICE_GAIN_OPTS = [
  { value: 0.5, label: '轻' },
  { value: 0.8, label: '标准' },
  { value: 1.0, label: '响' },
] as const;
export const MUSIC_GAIN_OPTS = [
  { value: 0.3, label: '轻' },
  { value: 0.6, label: '标准' },
  { value: 0.9, label: '响' },
] as const;

const KEY = 'qingshi.settings.v1';

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    const s: unknown = raw ? JSON.parse(raw) : null;
    if (!s || typeof s !== 'object') return { ...DEFAULTS };
    const o = s as Partial<Settings>;
    return {
      scale: o.scale ?? DEFAULTS.scale,
      segDelay: o.segDelay ?? DEFAULTS.segDelay,
      textScale: o.textScale ?? DEFAULTS.textScale,
      voice: o.voice ?? DEFAULTS.voice,
      voiceGain: o.voiceGain ?? DEFAULTS.voiceGain,
      music: o.music ?? DEFAULTS.music,
      musicGain: o.musicGain ?? DEFAULTS.musicGain,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

function persist(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // 隐私模式等:设置只在本次会话生效,不阻断
  }
}

// ---------- 叙事速度订阅(Session 是静态类,用订阅避免循环 import) ----------
const segDelaySubs: Array<(ms: number) => void> = [];

export function onSegDelay(cb: (ms: number) => void): void {
  segDelaySubs.push(cb);
}

/** 把设置的受影响面广播出去(目前只有叙事速度;音频由设置页直接推) */
export function broadcastSettings(s: Settings): void {
  for (const cb of segDelaySubs) cb(s.segDelay);
}

/** 合并改动 → 持久化 → 广播。设置页每一项改动都走这里。 */
export function updateSettings(patch: Partial<Settings>): Settings {
  const next = { ...loadSettings(), ...patch };
  persist(next);
  broadcastSettings(next);
  return next;
}

// ---------- 视觉项:界面缩放 / 正文字号 ----------

const SCALE_MUL = { small: 0.85, default: 1.0, large: 1.2 } as const;
const TEXT_MUL = { small: 0.9, normal: 1.0, large: 1.15 } as const;

/**
 * 把视觉项写进 CSS 变量(乘进 body 根字号与 .prose 字号,见 base.css)。
 * 保护:与 Lua 一样对最终倍率取下限,避免异常环境把 UI 缩没。
 */
export function applyVisual(s: Settings): void {
  const root = document.documentElement;
  const scale = Math.max(0.5, SCALE_MUL[s.scale] ?? 1);
  root.style.setProperty('--user-scale', String(scale));
  root.style.setProperty('--text-scale', String(TEXT_MUL[s.textScale] ?? 1));
}
