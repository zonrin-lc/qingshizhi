import { createPlatform } from './platform';
import { boot } from './screen';

console.log('[P0] main.js start');

const plat = createPlatform();
console.log(`[P0] platform ok kind=${plat.kind} screen=${plat.screenW}x${plat.screenH} dpr=${plat.dpr}`);

boot(plat)
  .then(() => console.log('[P0] boot resolved'))
  .catch((err: unknown) => {
    const msg = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err);
    console.error('[P0] boot failed', msg);

    // 启动失败也要在屏幕上留下痕迹:真机上看不到 console 时靠这行字定位
    const { ctx, dpr, screenW, screenH } = plat;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#2b2118';
    ctx.fillRect(0, 0, screenW, screenH);
    ctx.fillStyle = '#f0c9a0';
    ctx.font = `${Math.max(14, Math.round(screenW / 46))}px sans-serif`;
    ctx.textBaseline = 'top';
    const lines = msg.split('\n').slice(0, 8);
    lines.forEach((line, i) => ctx.fillText(line, 16, 40 + i * 26));
  });
