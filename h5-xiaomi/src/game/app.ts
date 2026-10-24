/**
 * 场景路由:主菜单 ⇄ 选剧本 / 存档 / 设置 → 对局 → 主菜单。
 *
 * 对局的生命周期(建 Run、start/resume、换 BGM、离开时落自动档)全部收在这里,
 * 各个 Scene 只管画和收点,不碰存储也不碰音频。
 */

import type { Platform } from '../port/platform';
import type { AssetStore } from '../port/assets';
import type { SettingsStore } from './settings';
import type { SaveStore, Slot } from './saves';
import { SAVE_MIN_ROUND } from './saves';
import type { Bgm } from './audio';
import type { Voice } from './voice';
import type { Sfx } from './sfx';
import type { DiffKey } from '../../types/scenario';
import { scenarioData } from '../data/library';
import { PlayScene } from '../scenes/play';
import { HomeScene } from '../scenes/home';
import { SelectScene } from '../scenes/select';
import { SavesScene } from '../scenes/saves';
import { SettingsScene } from '../scenes/settings';
import { Run } from './run';

export interface GameScene {
  draw(): void;
  pointerDown(x: number, y: number, id: number): void;
  pointerMove(x: number, y: number, id: number): void;
  pointerUp(x: number, y: number, id: number): void;
  dispose?(): void;
  debug?(): unknown;
}

export interface AppDeps {
  plat: Platform;
  assets: AssetStore;
  fontFamily: string | null;
  settings: SettingsStore;
  saves: SaveStore;
  bgm: Bgm;
  voice: Voice;
  sfx: Sfx;
}

export class App implements GameScene {
  private cur: GameScene | null = null;
  /** 当前对局的剧本键(结局落地时用来清自动档) */
  private curKey: string | null = null;

  constructor(private readonly d: AppDeps) {
    this.toHome();
    this.d.plat.onHide?.(() => this.stashOnHide());
  }

  // ---------- 指针/渲染转发 ----------

  draw(): void {
    this.cur?.draw();
  }

  pointerDown(x: number, y: number, id: number): void {
    this.cur?.pointerDown(x, y, id);
  }

  pointerMove(x: number, y: number, id: number): void {
    this.cur?.pointerMove(x, y, id);
  }

  pointerUp(x: number, y: number, id: number): void {
    this.cur?.pointerUp(x, y, id);
  }

  debug(): unknown {
    return this.cur?.debug?.() ?? { screen: 'none', hits: [] };
  }

  /** 外部改了引擎状态(冒烟/调试)后手动同步一次视图 */
  refresh(): void {
    const s = this.cur as GameScene & { refresh?: () => void };
    s?.refresh?.();
  }

  /** 当前对局的 Run(菜单页为 null):冒烟脚本与调试口读它 */
  get currentRun(): Run | null {
    return this.cur instanceof PlayScene ? this.cur.run : null;
  }

  private swap(s: GameScene): void {
    this.cur?.dispose?.();
    this.cur = s;
  }

  // ---------- 场景 ----------

  toHome(): void {
    this.d.bgm.idle();
    this.curKey = null;
    this.swap(
      new HomeScene(this.d.plat, this.d.assets, this.d.fontFamily, this.d.saves, this.d.sfx, {
        onStart: () => this.toSelect(),
        onContinue: (slot) => this.play(slot.scenKey, slot.diffKey, slot),
        onSaves: () => this.toSaves(),
        onSettings: () => this.toSettings(),
      }),
    );
  }

  toSelect(): void {
    this.swap(
      new SelectScene(this.d.plat, this.d.assets, this.d.fontFamily, this.d.sfx, {
        onEnter: (key, diff) => this.play(key, diff),
        onBack: () => this.toHome(),
      }),
    );
  }

  toSaves(): void {
    this.swap(
      new SavesScene(this.d.plat, this.d.assets, this.d.fontFamily, this.d.saves, this.d.sfx, {
        onLoad: (slot, key) => this.play(key, slot.diffKey, slot),
        onBack: () => this.toHome(),
      }),
    );
  }

  toSettings(): void {
    this.swap(
      new SettingsScene(this.d.plat, this.d.assets, this.d.fontFamily, this.d.settings, this.d.sfx, {
        onBack: () => this.toHome(),
      }),
    );
  }

  // ---------- 对局 ----------

  private play(key: string, diff: DiffKey, slot?: Slot): void {
    const data = scenarioData(key);
    if (!data) {
      console.error(`[qingshi] 找不到剧本数据:${key}`);
      return;
    }
    const run = new Run(data, diff, this.d.voice, this.d.sfx);
    if (slot) {
      if (!run.resume(slot.payload, slot.roundNo ?? 0)) run.start();
    } else {
      run.start();
    }
    this.d.bgm.play(data.SCENARIO.id);
    this.curKey = key;
    this.swap(
      new PlayScene(this.d.plat, this.d.assets, run, this.d.fontFamily, {
        settings: this.d.settings,
        onFinish: () => this.finishRun(),
        onMenu: () => this.leaveRun(),
      }),
    );
  }

  /** 顶栏「菜单」:够存档门槛就先落一条自动档,再回主菜单 */
  private leaveRun(): void {
    const p = this.cur instanceof PlayScene ? this.cur : null;
    if (p) {
      const run = p.run;
      if (run.roundNo >= SAVE_MIN_ROUND) {
        const id = run.game.d.SCENARIO.id;
        const name = run.game.d.SCENARIO.name;
        const r = this.d.saves.saveAuto(run.game, id, name, { roundNo: run.roundNo });
        // 已满 6 条:覆盖最旧的一条(自动档本来就该滚动,不拿弹框打断退出)
        if (!r.ok && r.full) {
          this.d.saves.saveAuto(run.game, id, name, { roundNo: run.roundNo, overwriteOldest: true });
        }
      }
    }
    this.toHome();
  }

  /** 结局落地:本局自动档不再复活 */
  private finishRun(): void {
    if (this.curKey) this.d.saves.clearAutos(this.curKey);
    this.toHome();
  }

  /** 切后台:不够存档门槛也留一份暂存,防手滑丢进度 */
  private stashOnHide(): void {
    const p = this.cur instanceof PlayScene ? this.cur : null;
    if (!p) return;
    const run = p.run;
    if (run.screen === 'ending' || run.screen === 'finished') return;
    if (run.roundNo < SAVE_MIN_ROUND) return;
    const id = run.game.d.SCENARIO.id;
    this.d.saves.stashSave(run.game, id, run.game.d.SCENARIO.name, run.roundNo);
  }
}

