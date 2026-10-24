/**
 * 设置:与 H5 的 game/settings.ts 同一套键名与校验口径(scale/segDelay/
 * textScale/voice/voiceGain/music/musicGain/sfx/sfxGain),存储换成 platform。
 *
 * 与 H5 的两处差别:
 * - 没有 localStorage,读写走 Platform.get/setStorage(快游戏是小程序签名存储);
 * - 没有 CSS 变量可写,界面缩放/正文字号由 canvas 侧读值自己乘(不再 applyVisual)。
 *
 * 脏档(截断/手改/越界)一律回落默认值,与 Lua loadSettings 的守卫一致。
 */

import type { Platform } from '../port/platform';

export interface Settings {
  scale: 'small' | 'default' | 'large';
  /** 段间隔(毫秒):慢 1100 / 标准 650 / 快 300 */
  segDelay: number;
  textScale: 'small' | 'normal' | 'large';
  voice: boolean;
  voiceGain: number;
  music: boolean;
  musicGain: number;
  sfx: boolean;
  sfxGain: number;
}

export const DEFAULTS: Settings = {
  scale: 'default',
  segDelay: 650,
  textScale: 'normal',
  voice: true,
  voiceGain: 1.0,
  music: true,
  musicGain: 0.06,
  sfx: true,
  sfxGain: 0.5,
};

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

/** 逐字段校验:类型/区间不合就落回默认值,布尔只认真布尔(同 H5 2026-10-21 修) */
function num(v: unknown, dflt: number, min: number, max: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : dflt;
}
function bool(v: unknown, dflt: boolean): boolean {
  return typeof v === 'boolean' ? v : dflt;
}
function oneOf<T extends string>(v: unknown, allowed: readonly T[], dflt: T): T {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : dflt;
}

const SCALE_VALUES = ['small', 'default', 'large'] as const;
const TEXT_VALUES = ['small', 'normal', 'large'] as const;

type Listener = (s: Settings) => void;

export class SettingsStore {
  private cur: Settings;
  private readonly subs = new Set<Listener>();

  constructor(private readonly plat: Platform) {
    this.cur = this.read();
  }

  get value(): Settings {
    return this.cur;
  }

  /** 合并改动 → 持久化 → 广播。设置页每一项改动都走这里。 */
  update(patch: Partial<Settings>): Settings {
    this.cur = { ...this.cur, ...patch };
    this.persist();
    for (const cb of [...this.subs]) cb(this.cur);
    return this.cur;
  }

  onChange(cb: Listener): () => void {
    this.subs.add(cb);
    return () => {
      this.subs.delete(cb);
    };
  }

  private read(): Settings {
    try {
      const raw = this.plat.getStorage(KEY);
      if (!raw) return { ...DEFAULTS };
      const s: unknown = JSON.parse(raw);
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

  private persist(): void {
    // 写入失败(空间满)时设置只在本次会话生效,不阻断
    this.plat.setStorage(KEY, JSON.stringify(this.cur));
  }
}

/** 视觉倍率:canvas 排版用它把字号/行距乘上去(H5 是写 CSS 变量) */
export const SCALE_MUL = { small: 0.85, default: 1.0, large: 1.2 } as const;
export const TEXT_MUL = { small: 0.9, normal: 1.0, large: 1.15 } as const;
