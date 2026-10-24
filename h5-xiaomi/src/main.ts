/**
 * 小米小游戏移植线入口。
 *
 * 与 h5/ 的区别只有一处:这里没有 DOM,所有界面在 canvas 2D 上重画。
 * 剧本数据、素材、规则引擎仍然指向同一份真源,不复制。
 */

import { createPlatform } from './port/platform';
import { AssetStore, FONT, IMG } from './port/assets';
import { COLOR, DESIGN_H, DESIGN_W } from './port/theme';
import { App } from './game/app';
import { SCENARIOS } from './data/scenarios';
import { APP_VERSION } from './port/version';
import { SettingsStore } from './game/settings';
import { SaveStore } from './game/saves';
import { Bgm } from './game/audio';
import { Voice } from './game/voice';
import { Sfx } from './game/sfx';

const raf = (cb: () => void): void => {
  if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(() => cb());
  else setTimeout(cb, 16);
};

function bootError(plat: ReturnType<typeof createPlatform>, err: unknown): void {
  const text = String((err as Error)?.message ?? err);
  // eslint-disable-next-line no-console
  console.error('[qingshi] boot failed', text);
  const { ctx, dpr, screenW, screenH } = plat;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = COLOR.app;
  ctx.fillRect(0, 0, screenW, screenH);
  ctx.fillStyle = COLOR.zhu;
  ctx.font = `${Math.round(screenH / 18)}px serif`;
  ctx.textAlign = 'center';
  ctx.fillText('启动失败', screenW / 2, screenH / 2 - 20);
  ctx.fillStyle = COLOR.ink;
  ctx.font = `${Math.round(screenH / 34)}px serif`;
  ctx.fillText(text.slice(0, 60), screenW / 2, screenH / 2 + 20);
  ctx.textAlign = 'left';
}

async function main(): Promise<void> {
  const plat = createPlatform();
  console.log(`[qingshi] start kind=${plat.kind} screen=${plat.screenW}x${plat.screenH} dpr=${plat.dpr}`);

  // 首屏:先把底色铺上,避免启动瞬间黑屏
  const paintLoading = (): void => {
    const { ctx, dpr, screenW, screenH } = plat;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = COLOR.app;
    ctx.fillRect(0, 0, screenW, screenH);
    ctx.fillStyle = COLOR.inkDim;
    ctx.font = `${Math.round(screenH / 26)}px serif`;
    ctx.textAlign = 'center';
    ctx.fillText(`青史志 · 正在载入 ${APP_VERSION}`, screenW / 2, screenH / 2 - 10);
    ctx.textAlign = 'left';
  };
  paintLoading();

  try {
    const fontFamily = await plat.loadFont(FONT.family, FONT.path);
    console.log(`[qingshi] font=${fontFamily}`);

    // 菜单线四屏与对局屏的底图一次性预载:体积已核过(见 prepare-assets 的体积账)
    const assets = new AssetStore(plat);
    await assets.preload([
      IMG.menuBg,
      IMG.title,
      IMG.logoIcon,
      IMG.logoYin,
      IMG.bgSelect,
      IMG.bgSave,
      IMG.bgSettings,
      ...SCENARIOS.map((s) => IMG.cover(s.key)),
      IMG.bgGame,
      IMG.panelScroll,
      IMG.card,
      IMG.badge,
    ]);
    console.log(`[qingshi] assets ok=${assets.failed.length === 0 ? 'yes' : assets.failed.join(',')}`);

    // 设置与三条音频通道:BGM(双轨轮播)/ 配音(串行)/ 音效(池)
    const settings = new SettingsStore(plat);
    const bgm = new Bgm(plat);
    const voice = new Voice(plat);
    const sfx = new Sfx(plat);
    const saves = new SaveStore(plat);
    const applyAudio = (s: typeof settings.value): void => {
      bgm.setEnabled(s.music);
      bgm.setVolume(s.musicGain);
      sfx.setEnabled(s.sfx);
      sfx.setVolume(s.sfxGain);
      voice.setEnabled(s.voice);
      voice.setVolume(s.voiceGain);
    };
    applyAudio(settings.value);
    settings.onChange(applyAudio);

    const app = new App({ plat, assets, fontFamily, settings, saves, bgm, voice, sfx });

    plat.onPointer({
      down: (x, y, id) => app.pointerDown(x, y, id),
      move: (x, y, id) => app.pointerMove(x, y, id),
      up: (x, y, id) => app.pointerUp(x, y, id),
    });

    (globalThis as any).__qingshi = {
      plat,
      assets,
      settings,
      saves,
      bgm,
      voice,
      sfx,
      app,
      DESIGN_W,
      DESIGN_H,
      get scene() {
        return app;
      },
      get run() {
        return app.currentRun;
      },
    };

    const loop = (): void => {
      try {
        app.draw();
      } catch (e) {
        console.error('[qingshi] draw error', String(e));
        return;
      }
      raf(loop);
    };
    loop();
  } catch (e) {
    bootError(plat, e);
  }
}

void main();
