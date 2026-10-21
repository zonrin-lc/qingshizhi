/**
 * 设置:封存 Lua 版 home.lua showSettings 的 H5 对应。
 *
 * 键名与 Lua 一致(scale/segDelay/textScale/voice/voiceGain/music/musicGain),
 * 存 localStorage;脏档(截断/手改)回落默认值,与 Lua loadSettings 的守卫一致。
 *
 * 生效路径分三类:
 * - 音频(音乐/音效/朗读开关与音量)→ 由 ui/settings.ts 的 applyAll 推给 bgm/sfx/voice
 *   (那边是异步 import,避免 voice → session → settings 的循环依赖);
 * - 叙事速度(segDelay,毫秒)→ 订阅制:main.ts 用 onSegDelay 接到 Session.setSegDelay;
 * - 视觉(界面缩放/正文字号)→ applyVisual 写 CSS var(--user-scale / --text-scale)。
 */
/**
 * 版本号唯一真源是 prot/package.json,由 vite.config.ts 在构建期注入 __APP_VERSION__
 * (那边的注释解释了为什么不能手抄第三份 —— ui-core.js 的契约上次就漂过了)。
 */
export const APP_VERSION = `v${__APP_VERSION__}`;

export interface Settings {
  scale: 'small' | 'default' | 'large';
  /** 段间隔(毫秒):慢 1100 / 标准 650 / 快 300(Lua 里是秒,这里直接存毫秒) */
  segDelay: number;
  textScale: 'small' | 'normal' | 'large';
  voice: boolean;
  voiceGain: number;
  music: boolean;
  musicGain: number;
  /**
   * 音效开关与音量。2026-10-20 起已接入 game/sfx.ts(按钮/卡牌/骰子/结算等
   * 交互反馈音),由设置页滑杆经 applyAll 推给 Sfx 实例;0 即关。
   */
  sfx: boolean;
  sfxGain: number;
}

export const DEFAULTS: Settings = {
  scale: 'default', segDelay: 650, textScale: 'normal',
  voice: true, voiceGain: 1.0, music: true, musicGain: 0.06,
  sfx: true, sfxGain: 0.5,
};

/** 选项表(界面缩放/叙事速度/正文字号)与 Lua home.lua 的 *_OPTS 一一对应;
 * 音频三项自 2026-10-15 起是 0-100 滑杆,不再有三档选项表 */
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

const KEY = 'qingshi.settings.v1';

/**
 * 逐字段校验(2026-10-21 修)。
 *
 * 原来只用 `??` 兜底,只挡 null/undefined —— 字符串 "abc"、NaN、越界值会原样
 * 通过:musicGain="abc" → audio 的 Math.min(1,"abc")=NaN → el.volume=NaN 按
 * WebIDL 抛 TypeError;segDelay 被改成 1e9 会让叙事看起来卡死。而且
 * updateSettings 以 loadSettings() 为基底,坏值会被永久写回。
 * 现在:类型/区间不合就落回默认值,布尔只认真布尔。
 */
function num(v: unknown, dflt: number, min: number, max: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : dflt;
}
function bool(v: unknown, dflt: boolean): boolean {
  return typeof v === 'boolean' ? v : dflt;
}
function oneOf<T extends string>(v: unknown, allowed: readonly T[], dflt: T): T {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : dflt;
}
/** 合法取值:与上面的 SCALE_OPTS / TEXT_OPTS 同源 */
const SCALE_VALUES = ['small', 'default', 'large'] as const;
const TEXT_VALUES = ['small', 'normal', 'large'] as const;

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    const s: unknown = raw ? JSON.parse(raw) : null;
    if (!s || typeof s !== 'object') return { ...DEFAULTS };
    const o = s as Partial<Settings>;
    return {
      scale: oneOf(o.scale, SCALE_VALUES, DEFAULTS.scale),
      segDelay: num(o.segDelay, DEFAULTS.segDelay, 0, 5000),
      textScale: oneOf(o.textScale, TEXT_VALUES, DEFAULTS.textScale),
      voice: bool(o.voice, DEFAULTS.voice),
      voiceGain: num(o.voiceGain, DEFAULTS.voiceGain, 0, 1),
      music: bool(o.music, DEFAULTS.music),
      musicGain: num(o.musicGain, DEFAULTS.musicGain, 0, 1),
      sfx: bool(o.sfx, DEFAULTS.sfx),
      sfxGain: num(o.sfxGain, DEFAULTS.sfxGain, 0, 1),
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
