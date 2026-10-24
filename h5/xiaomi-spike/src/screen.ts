/**
 * P0 演示屏:一屏真实素材 + 真实剧本文字 + 自检面板。
 *
 * 目的只有一个:在小米真机上用眼睛回答三个未知点
 *   1) webp 能不能解码
 *   2) opus/webm 的音频能不能播放
 *   3) 自绘字体在 canvas 里的行高与断行是否可用
 * 其余四类能力(画布/存储/触摸/前后台)顺带验证。
 */

import { Platform, ImageAsset, AudioHandle } from './platform';
import { parseRuns, layoutParagraphs, renderTextCanvas, TextLayout } from './text';

const INK = '#241c14';
const ACCENT = '#8c2b1d';
const MUTED = '#7c6a55';
const PAPER = '#efe3c8';
const OK = '#2f7d4f';
const BAD = '#a83224';
const WAIT = '#b18125';

const FONT_SIZE = 26;
const LINE_H = 40;
const TEXT_W = 616;
const TEXT_H = 330;
const TEXT_X = 132;
const TEXT_Y = 172;

const INTRO: string[][] = [
  [
    '战国之末，七雄只剩一口气。秦在东边磨刀，六国在西边发抖——诸侯的宫里夜夜点着灯，商议的都是同一件事：下一个，会轮到谁。',
  ],
  [
    '你是⟦卫⟧国人，人称庆卿。好读书，击剑，以术说卫元君——卫元君不用。卫太小，容不下你的剑。这一年初春，你负剑东游，腰间一柄剑，囊中几卷书，身后一个留不住你的故国。史书上还没有你的名字——它要等六年，等一把匕首，等易水边一场白衣的雪。',
  ],
  [
    '⟦榆次⟧大侠⟦盖聂⟧的地盘。你与他论剑，话不投机，他忽然住口，怒目而视——满堂的酒碗都停在半空。他的剑已在手，你的还在鞘中。烛火跳了一下，没有人敢扶——这一瞬，定得下生死。',
  ],
];

const CARD_DEFS = [
  { title: '还以眼色', sub: '徐步而出', face: 'assets/card/card-face-jin.webp' },
  { title: '长揖称谢', sub: '请教过失', face: 'assets/card/card-face-shou.webp' },
  { title: '邀他同饮', sub: '化敌为友', face: 'assets/card/card-face-bao.webp' },
];

const CARD_RECTS = CARD_DEFS.map((_, i) => ({
  x: 60 + i * 260,
  y: 570,
  w: 240,
  h: 112,
}));

interface Check {
  name: string;
  ok: boolean | null;
  detail: string;
}

interface Scene {
  fontFamily: string | null;
  font: string;
  bg: ImageAsset | null;
  panel: ImageAsset | null;
  card: ImageAsset | null;
  faces: (ImageAsset | null)[];
  portrait: ImageAsset | null;
  textCanvas: any;
  layout: TextLayout | null;
  bgm: AudioHandle;
  click: AudioHandle;
  scrollY: number;
  maxScroll: number;
  drag: { id: number; startY: number; startScroll: number } | null;
  selected: number;
  toast: string;
  toastAt: number;
  lastTap: { x: number; y: number } | null;
  events: string[];
  storageOk: boolean;
  storageValue: string;
  imageErrors: string[];
  audioStarted: boolean;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function fitCover(sw: number, sh: number, iw: number, ih: number): { x: number; y: number; w: number; h: number } {
  const s = Math.max(sw / iw, sh / ih);
  const w = iw * s;
  const h = ih * s;
  return { x: (sw - w) / 2, y: (sh - h) / 2, w, h };
}

async function loadAll(plat: Platform, errors: string[]): Promise<{
  bg: ImageAsset | null;
  panel: ImageAsset | null;
  card: ImageAsset | null;
  faces: (ImageAsset | null)[];
  portrait: ImageAsset | null;
}> {
  const safe = async (path: string): Promise<ImageAsset | null> => {
    try {
      return await plat.loadImage(path);
    } catch (e) {
      errors.push(path);
      return null;
    }
  };
  const [bg, panel, card, portrait, ...faces] = await Promise.all([
    safe('assets/bg/game.webp'),
    safe('assets/panel/scroll-main.webp'),
    safe('assets/card/card.webp'),
    safe('assets/portrait/jingke.webp'),
    ...CARD_DEFS.map((c) => safe(c.face)),
  ]);
  return { bg, panel, card, faces, portrait };
}

export async function boot(plat: Platform): Promise<void> {
  const errors: string[] = [];
  console.log('[P0] boot: loadFont start');
  const fontFamily = await plat.loadFont('QSKai', 'assets/fonts/qingshi-kai.ttf');
  console.log(`[P0] boot: loadFont done family=${fontFamily}`);
  const font = `${FONT_SIZE}px ${fontFamily ? `"${fontFamily}", ` : ''}serif`;

  const [assets] = await Promise.all([loadAll(plat, errors)]);
  console.log(`[P0] boot: images done errors=${errors.join(',')}`);

  const bgm = plat.audio('assets/audio/idle.webm', { loop: true, volume: 0.5 });
  const click = plat.audio('assets/audio/click.webm', { volume: 0.8 });

  const storageKey = 'qingshi.spike.probe';
  const probe = `${Date.now()}`;
  const storageSetOk = plat.setStorage(storageKey, probe);
  const storageRead = plat.getStorage(storageKey);
  const storageOk = storageSetOk && storageRead === probe;

  const paras = INTRO.map((p) => parseRuns(p.join(''), INK, ACCENT));
  const layout = layoutParagraphs(plat.ctx, font, paras, TEXT_W, FONT_SIZE, LINE_H);
  const textCanvas = renderTextCanvas(
    plat,
    layout,
    Math.ceil(TEXT_W),
    Math.ceil(layout.height),
    font,
    INK,
  );

  const scene: Scene = {
    fontFamily,
    font,
    bg: assets.bg,
    panel: assets.panel,
    card: assets.card,
    faces: assets.faces,
    portrait: assets.portrait,
    textCanvas,
    layout,
    bgm,
    click,
    scrollY: 0,
    maxScroll: Math.max(0, layout.height - TEXT_H),
    drag: null,
    selected: -1,
    toast: '',
    toastAt: 0,
    lastTap: null,
    events: [],
    storageOk,
    storageValue: storageOk ? probe : '',
    imageErrors: errors,
    audioStarted: false,
  };

  const toast = (msg: string): void => {
    scene.toast = msg;
    scene.toastAt = Date.now();
  };

  const logEvent = (type: string, x: number, y: number): void => {
    scene.events.push(`${type}(${Math.round(x)},${Math.round(y)})`);
    if (scene.events.length > 3) scene.events.shift();
  };

  const inRect = (x: number, y: number, r: { x: number; y: number; w: number; h: number }): boolean =>
    x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

  plat.onPointer({
    down(x, y, id) {
      scene.lastTap = { x, y };
      logEvent('down', x, y);
      if (!scene.audioStarted) {
        scene.audioStarted = true;
        scene.bgm.play();
      }
      if (inRect(x, y, { x: TEXT_X, y: TEXT_Y, w: TEXT_W, h: TEXT_H })) {
        scene.drag = { id, startY: y, startScroll: scene.scrollY };
        return;
      }
      CARD_RECTS.forEach((r, i) => {
        if (inRect(x, y, r)) {
          scene.selected = i;
          scene.click.replay();
          toast(`命中卡片 ${i + 1}:${CARD_DEFS[i].title}`);
        }
      });
    },
    move(x, y, id) {
      if (!scene.drag || scene.drag.id !== id) return;
      logEvent('move', x, y);
      const next = scene.drag.startScroll - (y - scene.drag.startY);
      scene.scrollY = Math.max(0, Math.min(scene.maxScroll, next));
    },
    up(_x, _y, id) {
      logEvent('up', _x, _y);
      if (scene.drag && scene.drag.id === id) scene.drag = null;
    },
  });

  plat.onHide(() => {
    scene.bgm.stop();
    toast('已进入后台:音频停止');
  });
  plat.onShow(() => {
    if (scene.audioStarted) scene.bgm.play();
  });

  const raf = (cb: () => void): void => {
    if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(() => cb());
    else setTimeout(cb, 16);
  };

  const drawFrame = (): void => {
    const { ctx, dpr, screenW, screenH } = plat;

    // 屏幕空间:背景铺满(cover),避免审核意义上的黑边
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, screenW, screenH);
    if (scene.bg) {
      const r = fitCover(screenW, screenH, scene.bg.w, scene.bg.h);
      ctx.drawImage(scene.bg.img, r.x, r.y, r.w, r.h);
    }

    // 设计空间
    ctx.setTransform(dpr * plat.scale, 0, 0, dpr * plat.scale, dpr * plat.offsetX, dpr * plat.offsetY);

    ctx.textBaseline = 'top';

    // 标题
    ctx.fillStyle = INK;
    ctx.font = `30px ${scene.fontFamily ? `"${scene.fontFamily}", ` : ''}serif`;
    ctx.fillText('P0 技术验证 · 青史志 × 小米小游戏', 60, 26);
    ctx.fillStyle = MUTED;
    ctx.font = `16px ${scene.fontFamily ? `"${scene.fontFamily}", ` : ''}serif`;
    ctx.fillText('拖动正文可滚动 · 点击卡片有反馈与音效 · 右上角为平台自检', 60, 68);

    if (scene.events.length) {
      ctx.fillStyle = '#5a4a3a';
      ctx.font = '13px sans-serif';
      ctx.fillText(`输入事件:${scene.events.join('  ')}`, 60, 88);
    }

    // 正文卷轴
    if (scene.panel) ctx.drawImage(scene.panel.img, 60, 100, 760, 450);
    else {
      ctx.fillStyle = '#fff8e8';
      roundRect(ctx, 60, 100, 760, 450, 12);
      ctx.fill();
    }
    ctx.save();
    ctx.beginPath();
    ctx.rect(TEXT_X, TEXT_Y, TEXT_W, TEXT_H);
    ctx.clip();
    ctx.drawImage(scene.textCanvas, TEXT_X, TEXT_Y - scene.scrollY, TEXT_W, layout.height);
    ctx.restore();

    if (scene.maxScroll > 0) {
      const trackH = TEXT_H;
      const barH = Math.max(28, trackH * (TEXT_H / layout.height));
      const barY = TEXT_Y + (trackH - barH) * (scene.scrollY / scene.maxScroll);
      ctx.fillStyle = 'rgba(140,43,29,0.55)';
      roundRect(ctx, TEXT_X + TEXT_W + 12, barY, 5, barH, 2.5);
      ctx.fill();
    }

    // 立绘
    if (scene.portrait) {
      const p = scene.portrait;
      ctx.drawImage(p.img, 900, 410, 200, 300);
    }

    // 三张卡
    CARD_RECTS.forEach((r, i) => {
      if (scene.card) ctx.drawImage(scene.card.img, r.x, r.y, r.w, r.h);
      else {
        ctx.fillStyle = i === scene.selected ? '#e8cb9a' : '#f8efda';
        roundRect(ctx, r.x, r.y, r.w, r.h, 10);
        ctx.fill();
      }
      if (i === scene.selected) {
        ctx.strokeStyle = ACCENT;
        ctx.lineWidth = 3;
        roundRect(ctx, r.x + 2, r.y + 2, r.w - 4, r.h - 4, 9);
        ctx.stroke();
      }
      const face = scene.faces[i];
      if (face) ctx.drawImage(face.img, r.x + 16, r.y + 22, 68, 68);
      ctx.fillStyle = INK;
      ctx.font = `20px ${scene.fontFamily ? `"${scene.fontFamily}", ` : ''}serif`;
      ctx.fillText(CARD_DEFS[i].title, r.x + 96, r.y + 30);
      ctx.fillStyle = MUTED;
      ctx.font = `16px ${scene.fontFamily ? `"${scene.fontFamily}", ` : ''}serif`;
      ctx.fillText(CARD_DEFS[i].sub, r.x + 96, r.y + 60);
    });

    // 自检面板
    plat.ctx.font = scene.font;
    const measured = plat.ctx.measureText('青').width;
    const audioState = scene.bgm.state();
    const checks: Check[] = [
      {
        name: '画布',
        ok: screenW > 0 && screenH > 0,
        detail: `${plat.kind} · ${Math.round(screenW)}×${Math.round(screenH)} @${dpr}x · 缩放${plat.scale.toFixed(2)}`,
      },
      {
        name: 'webp 解码',
        ok: !!scene.bg && !!scene.portrait && scene.bg.w > 0,
        detail: scene.bg ? `背景 ${scene.bg.w}×${scene.bg.h} · 立绘 ${scene.portrait?.w ?? 0}×${scene.portrait?.h ?? 0}` : `失败:${scene.imageErrors.join(',') || '未知'}`,
      },
      {
        name: '字体度量',
        ok: !!scene.fontFamily && measured > 0,
        detail: `${scene.fontFamily ?? '未加载,回退 serif'} · “青”${measured.toFixed(1)}px`,
      },
      {
        name: 'opus 音频',
        ok: audioState === 'ready' && scene.bgm.duration() > 0,
        detail: audioState === 'error' ? scene.bgm.errorText() : `${scene.bgm.duration().toFixed(2)}s · ${audioState}`,
      },
      {
        name: '存储回环',
        ok: scene.storageOk,
        detail: scene.storageOk ? `已写入 ${scene.storageValue.slice(-6)}` : `set=${storageSetOk} read=${storageRead ?? 'null'}`,
      },
      {
        name: '触摸坐标',
        ok: !!scene.lastTap,
        detail: scene.lastTap ? `(${Math.round(scene.lastTap.x)}, ${Math.round(scene.lastTap.y)}) 设计坐标` : '尚未点击',
      },
    ];

    if (typeof console !== 'undefined') {
      console.log('[P0]', checks.map((c) => `${c.name}=${c.ok === true ? 'OK' : c.ok === false ? 'FAIL' : 'WAIT'} (${c.detail})`).join(' | '));
    }

    const px = 850;
    const py = 40;
    const pw = 390;
    const ph = 42 + checks.length * 46;
    ctx.fillStyle = 'rgba(252,246,232,0.94)';
    roundRect(ctx, px, py, pw, ph, 10);
    ctx.fill();
    ctx.strokeStyle = 'rgba(120,95,65,0.5)';
    ctx.lineWidth = 1;
    roundRect(ctx, px, py, pw, ph, 10);
    ctx.stroke();

    ctx.fillStyle = INK;
    ctx.font = `20px ${scene.fontFamily ? `"${scene.fontFamily}", ` : ''}serif`;
    ctx.fillText(`平台自检 · ${plat.kind === 'qg' ? '小米快游戏' : '浏览器'}`, px + 18, py + 12);

    checks.forEach((c, i) => {
      const y = py + 48 + i * 46;
      ctx.fillStyle = c.ok === true ? OK : c.ok === false ? BAD : WAIT;
      ctx.beginPath();
      ctx.arc(px + 24, y + 9, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = INK;
      ctx.font = `17px ${scene.fontFamily ? `"${scene.fontFamily}", ` : ''}serif`;
      ctx.fillText(c.name, px + 38, y);
      ctx.fillStyle = MUTED;
      ctx.font = `14px ${scene.fontFamily ? `"${scene.fontFamily}", ` : ''}serif`;
      ctx.fillText(c.detail.slice(0, 44), px + 38, y + 20);
    });

    // 提示条
    if (scene.toast && Date.now() - scene.toastAt < 4000) {
      ctx.font = `18px ${scene.fontFamily ? `"${scene.fontFamily}", ` : ''}serif`;
      const tw = ctx.measureText(scene.toast).width + 36;
      ctx.fillStyle = 'rgba(36,28,20,0.82)';
      roundRect(ctx, 640 - tw / 2, 522, tw, 40, 20);
      ctx.fill();
      ctx.fillStyle = '#f6ecd6';
      ctx.textAlign = 'center';
      ctx.fillText(scene.toast, 640, 532);
      ctx.textAlign = 'left';
    }

  };

  const draw = (): void => {
    try {
      drawFrame();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (typeof console !== 'undefined') console.error('[P0] draw failed', e);
      const { ctx, dpr, screenW, screenH } = plat;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#2b2118';
      ctx.fillRect(0, 0, screenW, screenH);
      ctx.fillStyle = '#ffb4a0';
      ctx.font = '20px sans-serif';
      ctx.textBaseline = 'top';
      ctx.fillText(`渲染异常:${msg}`, 24, 60);
      return;
    }
    raf(draw);
  };

  raf(draw);
}
