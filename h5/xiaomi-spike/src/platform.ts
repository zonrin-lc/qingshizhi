/**
 * P0 平台适配层:同一份渲染代码,浏览器与小米快游戏(qg)共跑。
 *
 * 只包住「小游戏没有 DOM」这件事涉及的六类能力:
 * 画布 / 图片 / 字体 / 音频 / 存储 / 触摸与前后台。
 * 业务侧不出现 document、Image、Audio、localStorage。
 */

declare const qg: any;

export const DESIGN_W = 1280;
export const DESIGN_H = 720;

export type PlatformKind = 'qg' | 'web';

export interface ImageAsset {
  readonly img: any;
  readonly w: number;
  readonly h: number;
}

export interface AudioHandle {
  play(): void;
  replay(): void;
  stop(): void;
  setVolume(v: number): void;
  state(): 'loading' | 'ready' | 'error';
  errorText(): string;
  duration(): number;
}

export interface PointerHandlers {
  down(x: number, y: number, id: number): void;
  move(x: number, y: number, id: number): void;
  up(x: number, y: number, id: number): void;
}

export interface Platform {
  readonly kind: PlatformKind;
  readonly canvas: any;
  readonly ctx: CanvasRenderingContext2D;
  readonly screenW: number;
  readonly screenH: number;
  readonly dpr: number;
  readonly scale: number;
  readonly offsetX: number;
  readonly offsetY: number;
  loadImage(path: string): Promise<ImageAsset>;
  loadFont(family: string, path: string): Promise<string | null>;
  audio(path: string, opts?: { loop?: boolean; volume?: number }): AudioHandle;
  createOffscreen(w: number, h: number): any;
  getStorage(key: string): string | null;
  setStorage(key: string, value: string): boolean;
  onPointer(h: PointerHandlers): void;
  onShow(cb: () => void): void;
  onHide(cb: () => void): void;
  toDesign(sx: number, sy: number): { x: number; y: number };
}

// 真机实测:运行时把 qg 注入成裸全局变量,并不一定挂在 globalThis 上,
// 只查 globalThis 会误判成 web 分支(表现就是 localStorage 存储失败)。
function getQg(): any {
  try {
    if (typeof qg !== 'undefined') return qg;
  } catch { /* ignore */ }
  return (globalThis as any).qg;
}

function hasQg(): boolean {
  return typeof getQg() !== 'undefined';
}

function fitScale(sw: number, sh: number): { scale: number; ox: number; oy: number } {
  const scale = Math.min(sw / DESIGN_W, sh / DESIGN_H);
  return {
    scale,
    ox: Math.round((sw - DESIGN_W * scale) / 2),
    oy: Math.round((sh - DESIGN_H * scale) / 2),
  };
}

/* ----------------------------------------------------------------------------
 * 浏览器实现
 * -------------------------------------------------------------------------- */

function webPlatform(): Platform {
  const canvas = document.createElement('canvas');
  canvas.style.position = 'fixed';
  canvas.style.inset = '0';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.touchAction = 'none';
  document.body.append(canvas);

  let screenW = window.innerWidth;
  let screenH = window.innerHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  let fit = fitScale(screenW, screenH);

  const applySize = (): void => {
    screenW = window.innerWidth;
    screenH = window.innerHeight;
    fit = fitScale(screenW, screenH);
    canvas.width = Math.round(screenW * dpr);
    canvas.height = Math.round(screenH * dpr);
  };
  applySize();
  window.addEventListener('resize', applySize);

  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;

  const toDesign = (sx: number, sy: number) => ({
    x: (sx - fit.ox) / fit.scale,
    y: (sy - fit.oy) / fit.scale,
  });

  const platform: Platform = {
    kind: 'web',
    canvas,
    ctx,
    get screenW() { return screenW; },
    get screenH() { return screenH; },
    get dpr() { return dpr; },
    get scale() { return fit.scale; },
    get offsetX() { return fit.ox; },
    get offsetY() { return fit.oy; },
    toDesign,
    loadImage(path) {
      return new Promise<ImageAsset>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve({ img, w: img.naturalWidth, h: img.naturalHeight });
        img.onerror = () => reject(new Error(`image load failed: ${path}`));
        img.src = path;
      });
    },
    async loadFont(family, path) {
      try {
        const face = new FontFace(family, `url(${path})`);
        await face.load();
        (document as any).fonts.add(face);
        return family;
      } catch {
        return null;
      }
    },
    audio(path, opts) {
      const el = new Audio(path);
      el.loop = !!opts?.loop;
      el.volume = opts?.volume ?? 1;
      el.preload = 'auto';
      let failed = '';
      el.addEventListener('error', () => { failed = `media error (${el.error?.code ?? '?'})`; });
      el.load();
      return {
        play() { void el.play().catch(() => { /* 自动播放策略:忽略,等手势 */ }); },
        replay() {
          try { el.currentTime = 0; } catch { /* 元数据未到 */ }
          void el.play().catch(() => {});
        },
        stop() { el.pause(); },
        setVolume(v) { el.volume = Math.max(0, Math.min(1, v)); },
        state() {
          if (failed) return 'error';
          return el.readyState >= 2 ? 'ready' : 'loading';
        },
        errorText() { return failed; },
        duration() { return Number.isFinite(el.duration) ? el.duration : 0; },
      };
    },
    createOffscreen(w, h) {
      const c = document.createElement('canvas');
      c.width = Math.ceil(w);
      c.height = Math.ceil(h);
      return c;
    },
    getStorage(key) {
      try { return localStorage.getItem(key); } catch { return null; }
    },
    setStorage(key, value) {
      try { localStorage.setItem(key, value); return true; } catch { return false; }
    },
    onPointer(h) {
      canvas.addEventListener('pointerdown', (e) => {
        try { canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }
        const p = toDesign(e.clientX, e.clientY);
        h.down(p.x, p.y, e.pointerId);
      });
      canvas.addEventListener('pointermove', (e) => {
        const p = toDesign(e.clientX, e.clientY);
        h.move(p.x, p.y, e.pointerId);
      });
      const up = (e: PointerEvent) => {
        const p = toDesign(e.clientX, e.clientY);
        h.up(p.x, p.y, e.pointerId);
      };
      canvas.addEventListener('pointerup', up);
      canvas.addEventListener('pointercancel', up);
    },
    onShow(cb) {
      document.addEventListener('visibilitychange', () => {
        if (!(document as any).hidden) cb();
      });
    },
    onHide(cb) {
      document.addEventListener('visibilitychange', () => {
        if ((document as any).hidden) cb();
      });
    },
  };
  return platform;
}

/* ----------------------------------------------------------------------------
 * qg(小米快游戏)实现
 * -------------------------------------------------------------------------- */

function qgPlatform(): Platform {
  const games = getQg();
  const info = games.getSystemInfoSync();
  const screenW: number = info.screenWidth ?? info.windowWidth;
  const screenH: number = info.screenHeight ?? info.windowHeight;
  const dpr: number = info.pixelRatio ?? 1;

  // 真机实测:qg.createCanvas() 返回的是离屏画布,只有运行时预置的主画布才会被显示。
  // 主画布以全局 canvas / GameGlobal.canvas 暴露,拿不到时才退化为新建离屏画布。
  const host = globalThis as any;
  const canvas = host.canvas ?? host.GameGlobal?.canvas ?? games.createCanvas();
  canvas.width = Math.round(screenW * dpr);
  canvas.height = Math.round(screenH * dpr);

  const fit = fitScale(screenW, screenH);
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;

  const toDesign = (sx: number, sy: number) => ({
    x: (sx - fit.ox) / fit.scale,
    y: (sy - fit.oy) / fit.scale,
  });

  const platform: Platform = {
    kind: 'qg',
    canvas,
    ctx,
    screenW,
    screenH,
    dpr,
    scale: fit.scale,
    offsetX: fit.ox,
    offsetY: fit.oy,
    toDesign,
    loadImage(path) {
      return new Promise<ImageAsset>((resolve, reject) => {
        const img = games.createImage();
        img.onload = () => resolve({ img, w: img.width, h: img.height });
        img.onerror = (e: unknown) => reject(new Error(`image load failed: ${path} ${String(e)}`));
        img.src = path;
      });
    },
    async loadFont(_family, path) {
      try {
        // qg.loadFont 同步返回 family,失败返回 null
        const got = games.loadFont(path);
        return got ? String(got) : null;
      } catch {
        return null;
      }
    },
    audio(path, opts) {
      const a = games.createInnerAudioContext();
      a.src = path;
      a.loop = !!opts?.loop;
      a.volume = opts?.volume ?? 1;
      a.obeyMuteSwitch = false;
      let failed = '';
      a.onError((e: any) => { failed = `${e?.errCode ?? '?'} ${e?.errMsg ?? ''}`; });
      return {
        play() { try { a.play(); } catch { /* 手势前调用会被拒 */ } },
        replay() {
          try { a.stop(); } catch { /* ignore */ }
          try { a.play(); } catch { /* ignore */ }
        },
        stop() { try { a.stop(); } catch { /* ignore */ } },
        setVolume(v) { a.volume = Math.max(0, Math.min(1, v)); },
        state() {
          if (failed) return 'error';
          try { return a.duration > 0 ? 'ready' : 'loading'; } catch { return 'loading'; }
        },
        errorText() { return failed; },
        duration() {
          try { return Number.isFinite(a.duration) ? a.duration : 0; } catch { return 0; }
        },
      };
    },
    createOffscreen(w, h) {
      const c = games.createCanvas();
      c.width = Math.ceil(w);
      c.height = Math.ceil(h);
      return c;
    },
    getStorage(key) {
      // 真机实测:该运行时是「小程序签名」,getStorageSync(key) 只接受字符串 key,
      // 传 {key} 会抛 TypeError: key must be a string。
      try {
        const r = games.getStorageSync(key);
        return r == null ? null : String(r);
      } catch {
        try {
          const r = games.getStorageSync({ key });
          if (r && typeof r === 'object' && 'data' in r) return String(r.data);
          return r == null ? null : String(r);
        } catch { return null; }
      }
    },
    setStorage(key, value) {
      try { games.setStorageSync(key, value); return true; } catch { /* 继续试对象签名 */ }
      try { games.setStorageSync({ key, data: value }); return true; } catch { return false; }
    },
    onPointer(h) {
      games.onTouchStart((e: any) => {
        const t = e.touches?.[0] ?? e.changedTouches?.[0];
        if (!t) return;
        const p = toDesign(t.clientX, t.clientY);
        h.down(p.x, p.y, t.identifier ?? 0);
      });
      games.onTouchMove((e: any) => {
        const t = e.touches?.[0] ?? e.changedTouches?.[0];
        if (!t) return;
        const p = toDesign(t.clientX, t.clientY);
        h.move(p.x, p.y, t.identifier ?? 0);
      });
      const end = (e: any) => {
        const t = e.changedTouches?.[0] ?? e.touches?.[0];
        if (!t) return;
        const p = toDesign(t.clientX, t.clientY);
        h.up(p.x, p.y, t.identifier ?? 0);
      };
      games.onTouchEnd(end);
      games.onTouchCancel?.(end);
    },
    onShow(cb) { games.onShow?.(cb); },
    onHide(cb) { games.onHide?.(cb); },
  };
  return platform;
}

export function createPlatform(): Platform {
  return hasQg() ? qgPlatform() : webPlatform();
}
