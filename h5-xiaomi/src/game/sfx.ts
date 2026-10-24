/**
 * 音效:与 H5 的 game/sfx.ts 同一套素材名与音量口径,底层换成 Platform.audio。
 *
 * 与 BGM/朗读的三点差异(照抄 H5):
 * 1. 并发短音,不用单元素串行:同一音可能连发(快速连点),按名字开小池轮询;
 * 2. 不做前后台暂停:全是 0.5~2.5s 的一次性音,让它自然响完;
 * 3. 音量与开关读设置项 sfx/sfxGain。
 *
 * 素材缺失(主包还没收全)时安静跳过 —— 音效是点缀,绝不影响玩法。
 */

import type { AudioHandle, Platform } from '../port/platform';

export const SFX_DIR = 'assets/sfx';

/** 可用的音效名 = 文件名(不含扩展)。新增素材丢进 assets/sfx 即可。 */
export type SfxName =
  | 'click' | 'card' | 'enter' | 'back' | 'dialog' | 'seal'
  | 'coin' | 'gain' | 'down' | 'dice-roll' | 'dice-land'
  | 'chapter' | 'ending' | 'fail';

/** 单个音的并发上限:连点超过这个数就轮回复用最老的那个(从头重播) */
const POOL_MAX = 3;

interface Pool {
  handles: AudioHandle[];
  idx: number;
}

export class Sfx {
  private readonly pools = new Map<SfxName, Pool>();
  private wanted = true;
  /** 音量由设置页滑杆驱动(sfxGain,默认 0.5) */
  private volume = 0.5;

  constructor(private readonly plat: Platform) {}

  get enabled(): boolean {
    return this.wanted;
  }

  setEnabled(on: boolean): void {
    this.wanted = on;
    if (!on) this.stopAll();
  }

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
  }

  /** 播一条。素材缺失/被策略拒绝都静默。 */
  play(name: SfxName): void {
    if (!this.wanted) return;
    const h = this.take(name);
    h.setVolume(this.volume);
    h.replay();
  }

  private stopAll(): void {
    for (const pool of this.pools.values()) {
      for (const h of pool.handles) h.stop();
    }
  }

  private take(name: SfxName): AudioHandle {
    let pool = this.pools.get(name);
    if (!pool) {
      pool = { handles: [], idx: 0 };
      this.pools.set(name, pool);
    }
    if (pool.handles.length < POOL_MAX) {
      const h = this.plat.audio(`${SFX_DIR}/${name}.webm`, { volume: this.volume });
      h.onError((msg) => this.drop(pool!, h, msg));
      pool.handles.push(h);
      return h;
    }
    const h = pool.handles[pool.idx % pool.handles.length] ?? pool.handles[0]!;
    pool.idx = (pool.idx + 1) % pool.handles.length;
    return h;
  }

  /** 加载失败的元素会永远哑掉,从池里摘掉,下次重建 */
  private drop(pool: Pool, h: AudioHandle, msg: string): void {
    const i = pool.handles.indexOf(h);
    if (i < 0) return;
    pool.handles.splice(i, 1);
    if (this.plat.kind === 'web') console.warn('[qingshi] 音效播放失败', msg);
    h.destroy();
  }
}
