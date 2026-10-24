/**
 * 资源层:图片缓存 + 音频预载清单。
 *
 * 路径一律相对「包根」:浏览器下就是站点根,快游戏下是 rpk 根,
 * 所以两边写同一串 'assets/…' 即可,不做二次拼接。
 */

import { Platform, ImageAsset } from './platform';

export interface LoadProgress {
  done: number;
  total: number;
  /** 最近一次失败的路径 */
  failed: string[];
}

export class AssetStore {
  private readonly images = new Map<string, ImageAsset>();
  private readonly pending = new Map<string, Promise<ImageAsset | null>>();
  readonly failed: string[] = [];

  constructor(private readonly plat: Platform) {}

  get(path: string): ImageAsset | null {
    return this.images.get(path) ?? null;
  }

  load(path: string): Promise<ImageAsset | null> {
    const hit = this.images.get(path);
    if (hit) return Promise.resolve(hit);
    const inflight = this.pending.get(path);
    if (inflight) return inflight;
    const p = this.plat
      .loadImage(path)
      .then((asset) => {
        this.images.set(path, asset);
        this.pending.delete(path);
        return asset;
      })
      .catch(() => {
        this.failed.push(path);
        this.pending.delete(path);
        return null;
      });
    this.pending.set(path, p);
    return p;
  }

  /** 并发预载一批图片,每完成一张回调一次进度 */
  async preload(paths: string[], onProgress?: (p: LoadProgress) => void): Promise<void> {
    let done = 0;
    const total = paths.length;
    const progress = (): void => {
      done += 1;
      onProgress?.({ done, total, failed: this.failed.slice() });
    };
    await Promise.all(paths.map((p) => this.load(p).then(() => progress())));
  }
}

/** 常用图片路径集中在这里,避免各处散落字符串 */
export const IMG = {
  // 对局屏
  bgGame: 'assets/bg/game.webp',
  panelScroll: 'assets/panel/scroll-main.webp',
  card: 'assets/card/card.webp',
  cardHi: 'assets/card/card-hi.webp',
  badge: 'assets/card/card-badge.webp',

  // 菜单线:主菜单 / 选剧本 / 存档 / 设置
  menuBg: 'assets/lua/menu-bg-1440.webp',
  title: 'assets/lua/title-calligraphy.webp',
  logoIcon: 'assets/lua/logo-icon.webp',
  logoYin: 'assets/lua/logo-yin.webp',
  bgSelect: 'assets/bg/select.webp',
  bgSave: 'assets/bg/save.webp',
  bgSettings: 'assets/bg/settings.webp',
  /** 选剧本页封面(384 见方,见 prepare-assets 的体积账) */
  cover: (key: string): string => `assets/cover/${key}-384.webp`,
} as const;

export const FONT = {
  family: 'QingshiKai',
  path: 'assets/fonts/qingshi-kai.ttf',
} as const;
