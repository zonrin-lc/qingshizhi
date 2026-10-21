/**
 * 对局会话:驱动引擎相位并渲染视图。
 *
 * 控制流严格对齐 Lua 版 scripts/qingshi/ui/game.lua 的 handleRoute /
 * doPlayCard / doChoose 三处,避免两边玩法漂移。差异只在渲染层(DOM 而非 NanoVG)。
 *
 * 索引契约:引擎对外一律 0-based(见 engine.js 顶部契约 2),
 * 视图里 i 从 1 开始遍历时统一传 i-1。
 */
import type { AttrKey, CardResult, ChangeView, Game, Route, ScenarioData, SummaryView } from '../../types/scenario';
import { parseRuns } from './gloss';
import { btn, card, clear, divider, el, kv, lbl, meter, seal, toast } from '../ui/kit';
import { renderRadar, renderRadarTween, RADAR_AXES } from '../ui/radar';
import { castOf, renderCast, bigPortrait } from '../ui/cast';
import { voice } from './voice';
import { sfx } from './sfx';
import { nextFrame as scheduleFrame } from './raf';
import { clearAutos, listStashEntries, removeStash, type SecRec, type SecTag } from './saves';
import { recordEnding, saveCollection } from './collection';
import { sealImg } from '../data/seals';

/** 右栏要显示的属性(Lua 版「身外」那一组) */
const SHOWN_ATTRS: AttrKey[] = ['caifu', 'shengwang', 'quanshi', 'zhengji', 'junxin', 'weiji'];

// 行动卡类型角标（进取/守成/兑换/保身/抉择）：type 字段由 prot/game-data.js ACTIONS 提供；治病卡无 type 不渲染
const ACTION_TYPE_BADGE: Record<string, string> = { 进取: 't-jin', 守成: 't-shou', 兑换: 't-dui', 保身: 't-bao', 抉择: 't-jue' };

/** 险招的门槛缺口 */
type Risk = { rate: number; unmet: { name: string; need: number; have: number }[] };

/**
 * 把一段文本切成句子(逐行渐显的中间结构):
 * 在 。！？；… 后断句,紧随的闭引号(”’」』)并入前句;无标点尾巴自成一句。
 * 切不出句子时原样返回(保底一句,调用方不会拿到空数组)。
 */
const SENT_RE = /[^。！？；…]+[。！？；…]*[”’」』]*/g;
function splitSentences(text: string): string[] {
  const out = (text.match(SENT_RE) ?? []).filter((s) => s.length > 0);
  return out.length ? out : [text];
}

/**
 * 逐行渐显(2026-10-17 拍板:由逐句改为按排版逐行)的字符拆分:
 * 连续 ASCII 字母数字不拆(拆了会引入原本不存在的断行机会,量出来的行是错的),
 * 汉字/标点/空白逐字一个 span。
 */
const CH_RE = /[A-Za-z0-9]+|\s|./gu;

/** 把句子 span 的文本拆成字符级 span.prose__ch(全部 is-off 占位,版面不抖),
 *  返回字符 span 序列,供 revealSegs 分行。 */
function splitToChars(sent: HTMLElement): HTMLElement[] {
  const text = sent.textContent ?? '';
  sent.textContent = '';
  const out: HTMLElement[] = [];
  for (const m of text.matchAll(CH_RE)) {
    const c = el('span', 'prose__ch is-off', m[0]);
    sent.append(c);
    out.push(c);
  }
  return out;
}

/** 按 offsetTop 把字符 span 聚成视觉行(±1px 容忍)。必须在元素已挂载、已排版后调。 */
function groupIntoLines(chars: HTMLElement[]): HTMLElement[][] {
  const lines: HTMLElement[][] = [];
  let cur: HTMLElement[] = [];
  let top: number | null = null;
  for (const c of chars) {
    const t = c.offsetTop;
    if (top === null || Math.abs(t - top) > 1) {
      if (cur.length) lines.push(cur);
      cur = [];
      top = t;
    }
    cur.push(c);
  }
  if (cur.length) lines.push(cur);
  return lines;
}

export class Session {
  readonly game: Game;
  private readonly main: HTMLElement;
  private readonly opts: HTMLElement;
  private readonly chapEl: HTMLElement;
  private readonly bandEl: HTMLElement;
  private readonly overlay: HTMLElement;
  /** 背景/底板/装饰随页面切换 */
  private readonly stage: HTMLElement;
  private readonly deco: HTMLElement;
  /** 顶栏回溯按钮:常驻节点,只更新可用态与计数(对齐 Lua shell.lua 的 env_.backBox) */
  private readonly backBtn: HTMLElement;
  /** 剧情卷轴的正文容器:跨相位常驻,小节依次往下排(2026-10-14 累积式叙事) */
  private storyEl: HTMLElement | null = null;
  /** 浮层「继续」关闭后要接着推进的相位路由 */
  private pendingAfterSettle: (() => void) | null = null;
  /** 偶遇/随机事件内联选项所挂的小节正文(doChoose 内联结算时靠它重挂选项) */
  private inlineEvtBody: HTMLElement | null = null;
  /** 当前事件小节(renderEvent 推的):选项落定后结果与属性胶囊都封进这一节 */
  private evtHost: { sec: HTMLElement; body: HTMLElement; head: HTMLElement | null } | null = null;
  /** 当前抉择卡小节:落定后结果写回本节,题签封「——所选」 */
  private choiceHost: { sec: HTMLElement; body: HTMLElement; head: HTMLElement | null } | null = null;
  /** renderRound 延迟发牌的重入令牌:选中牌翻背面期间又进新回合时作废旧定时器 */
  private dealToken = 0;
  /** 选卡提醒的重入令牌(2026-10-18 拍板):章首第一轮发牌 3s 未点卡即亮提醒 */
  private pickHintToken = 0;
  /** 结算动画序列的重入令牌:飞卡/翻牌/自动推进的延时步都验它,dispose 或新结算即作废 */
  private settleToken = 0;
  /** 关键事件提示条宿主:独立网格行钉在画卷与选项卡之间(2026-10-20 拍板) */
  private readonly keybar: HTMLElement;
  /** 关键事件提示条的代际令牌:提示条只对「当前这一轮」成立,
   *  出了牌/换了相位就作废(结算动画期间点旧提示条会让引擎与界面的相位错开) */
  private keybarToken = 0;
  /** 统一登记的延时回调:dispose 时一次性清掉。
   *  发牌/选卡提醒/属性飞字这些回调都会往常驻壳(shell.foot / shell.side)写东西,
   *  离场后还在跑就会把旧对局的数据写进新一局(还会给新一局误挂 is-pickhint) */
  private timers = new Set<number>();
  /** 统一登记的一次性帧任务(共享调度器):dispose 时一次性清掉。
   *  这些任务是「下一帧做一次」的排版/动画起步动作,离场后还在跑就会写旧对局的壳 */
  private frames = new Set<() => void>();
  /** 会话是否已离场:离场后不再登记新的延时回调
   *  (requestAnimationFrame 等异步入口可能在 dispose 之后才跑) */
  private disposed = false;
  /**
   * 右栏待落定的属性(2026-10-21 修,§3.5):属性 → 仍在显示的旧值。
   *
   * 飞字落地前右栏要保持旧值(见 applySideDelta)。外壳补丁(main.ts)每次
   * renderTop 都会整块重画右栏,没有这张表就会把旧值冲成新值,
   * applySideDelta 的守卫(vEl.textContent !== oldShown)永远命中:
   * 飞字补间不执行、待定轴也清不掉。这张表既是「保持旧值」的依据,
   * 也是外壳判断「现在能不能整块重画右栏」的依据。
   */
  private sideHold: Partial<Record<AttrKey, number>> = {};
  /** 回合相位的活小节(无题签无正文):只为 CSS 的「最后一个小节撑满余高」而存在,
   *  同一时刻只留一个,新的顶上时旧的撤掉(卷轴里不该堆一串空 section) */
  private liveSec: HTMLElement | null = null;
  private readonly onFinish: (() => void) | null;
  /** 剧本 key(写自动档用);与选择页轻量表的 key 一致 */
  private readonly scenKey: string;
  /** 本已经营轮数:回合小节题签用「经营 · 第 N 轮」,不复用章名(否则与章首小节重名)。
   *  轮次存档(v2.2.0)随槽位元数据存取,读档时经 resume() 写回 */
  roundNo = 0;
  /** 具名引用,dispose 时才能把这个监听从常驻 main 上摘下来 */
  private readonly onSkipPointer = (): void => this.skipReveal();

  constructor(
    game: Game,
    mounts: { main: HTMLElement; opts: HTMLElement; chap: HTMLElement; band: HTMLElement; bar: HTMLElement; overlay: HTMLElement; stage: HTMLElement; deco: HTMLElement },
    onFinish?: () => void,
    opts?: { scenKey?: string },
  ) {
    this.game = game;
    this.main = mounts.main;
    this.opts = mounts.opts;
    this.chapEl = mounts.chap;
    this.bandEl = mounts.band;
    this.overlay = mounts.overlay;
    this.stage = mounts.stage;
    this.deco = mounts.deco;
    // 提示条宿主:cols 是 main 的父节点(shell.ts 里 main/side/foot 同挂 cols)
    this.keybar = el('div', 'stage__keybar');
    mounts.main.parentElement?.append(this.keybar);
    this.onFinish = onFinish ?? null;
    this.scenKey = opts?.scenKey ?? game.d.SCENARIO.id;
    this.backBtn = btn('回溯', { variant: 'ghost', cls: 'backbtn', onClick: () => this.doBacktrack() });
    mounts.bar.append(this.backBtn);
    // 点正文区 = 跳过渐显,把剩下的段落一次全亮出来。
    // 用 pointerdown 而不是 click:触屏上 click 会等到抬手,晚一拍。
    mounts.main.addEventListener('pointerdown', this.onSkipPointer);
  }

  /**
   * 对局离场时必须调:bar/main 都是常驻壳节点,挂上去的回溯按钮与
   * pointerdown 监听不摘掉的话,每开一局就叠一层 —— 旧按钮的闭包还绑着
   * 旧 Game,点了会污染正在进行的对局。
   */
  dispose(): void {
    this.skipReveal();
    this.settleToken += 1;
    // 发牌/选卡提醒/关键事件提示条也要作废:各自的令牌一作废,漏跑的回调也会直接退出
    this.dealToken += 1;
    this.pickHintToken += 1;
    this.keybarToken += 1;
    // 挂起的相位推进一并作废:离场后它再触发,会把旧对局的路由打进新一局
    this.pendingAfterSettle = null;
    this.backBtn.remove();
    this.keybar.remove();
    // 所有延时回调统一清掉:发牌/选卡提醒/属性飞字离场后还在跑的话,
    // 会往常驻壳(shell.foot / shell.side)写旧对局的数据,还会给新一局误挂 is-pickhint
    this.clearTimers();
    // 一次性帧任务也清掉:共享调度器里不能留着旧对局排的帧
    for (const c of this.frames) c();
    this.frames.clear();
    this.liveSec = null;
    this.disposed = true;
    this.main.removeEventListener('pointerdown', this.onSkipPointer);
  }

  /**
   * 登记一个延时回调:dispose 时统一清掉。
   * 发牌(520ms 后的重发牌)、选卡提醒(3s)、属性飞字这些回调都会往常驻壳里写东西,
   * 离场后不管就会把旧对局的数据写进新一局 —— 所以一律登记在册,离场一次清干净。
   */
  private later(fn: () => void, ms: number): void {
    // 已离场就不再登记:requestAnimationFrame 等异步入口可能在 dispose 之后才跑,
    // 那时登记的定时器就永远等不到被清
    if (this.disposed) return;
    const t = window.setTimeout(() => {
      this.timers.delete(t);
      fn();
    }, ms);
    this.timers.add(t);
  }

  /** 清掉所有登记在册的延时回调(dispose 时调) */
  private clearTimers(): void {
    for (const t of this.timers) window.clearTimeout(t);
    this.timers.clear();
  }

  /**
   * 登记一个一次性帧任务(共享调度器):下一帧做一次,dispose 时统一清掉。
   * 与 later() 的区别只是时基:这里是「下一帧」(排版量尺寸、动画起步),
   * later() 是「若干毫秒后」。两者都必须登记在册 —— 离场后才跑的任务会写旧对局的壳。
   */
  private nextFrame(fn: () => void): void {
    if (this.disposed) return;
    const cancel = scheduleFrame(() => {
      this.frames.delete(cancel);
      fn();
    });
    this.frames.add(cancel);
  }

  /** 当前剧本与章 id,配音切片路径靠它推导 */
  private voiceCtx(): { s: string; c: string } | null {
    const s = this.game.d.SCENARIO.id;
    const ch = this.game.chapter();
    return s && ch ? { s, c: ch.id } : null;
  }

  /** 播一条合并配音。切片不存在就静默 —— 未配音的剧本/节点无声是预期行为。 */
  private speakOne(clip: string): void {
    const ctx = this.voiceCtx();
    if (!ctx || !voice.enabled) return;
    voice.enqueue(ctx.s, ctx.c, clip);
  }

  /** 选项落定后的结果配音(2026-10-20 拍板):先掐断事件正文的朗读,立即切换到
   * 结果切片;切片不存在(主线/随机事件结算不配音)则只掐断 —— 结果已上屏,
   * 还在念事件正文只会让人出戏。 */
  private speakResult(clip: string | null): void {
    voice.stop();
    if (clip) this.speakOne(clip);
  }

  /**
   * 清掉关键事件提示条并作废它的代际令牌。
   * 提示条是「当前这一轮」才成立的活控件:出了牌、换了相位就必须失效 ——
   * 否则结算动画期间点它,引擎会提前切到 event 相位,而动画收尾又按 round 重绘,
   * 两边相位就此错开(之后 playCard 一律返回 null,界面看着有牌却点不动)。
   */
  private clearKeybar(): void {
    this.keybarToken += 1;
    this.keybar.replaceChildren();
  }

  /**
   * 换页面皮肤:背景图 + 卷轴底板 + 装饰枝叶。
   *
   * 对局各相位共用整幅剧情卷轴;章末结算与结局页改用「窄幅悬挂卷轴」,
   * 居中独立成页(参考图里它们本来就是另一套版式,不是同一页换个内容)。
   */
  private skin(bg: 'game' | 'summary' | 'ending', deco: 'game' | 'summary' | 'ending'): void {
    this.stage.setAttribute('data-bg', bg);
    // 提示条逐相位重挂:先清空(renderRound 里命中关键事件再回填),
    // 否则上一相位的倒计时条会一直挂到事件结束
    this.clearKeybar();
    const wide = deco === 'game';
    this.main.classList.toggle('stage__main--narrow', !wide);
    this.main.classList.toggle('panel-scroll', wide);
    this.main.classList.toggle('panel-scroll--summary', deco === 'summary');
    this.main.classList.toggle('panel-scroll--ending', deco === 'ending');
    // 装饰枝叶:不同页面用不同的梅枝/竹子素材
    this.deco.dataset.variant = deco;
    // 章末/结局是独立结算页,没有属性卷轴 —— 收掉窄卷轴才排得正
    this.main.parentElement?.classList.toggle('stage__cols--narrow', !wide);
  }

  get data(): ScenarioData {
    return this.game.d;
  }

  // ---------- 顶栏 ----------

  renderTop(): void {
    const g = this.game;
    const ch = g.chapter();
    // 顶栏格式对齐参考图:「李斯·仓鼠之局 ｜ 第五章 初见秦王」
    const sc = this.data.SCENARIO;
    let right = ch?.title ?? '';
    if (ch && (g.phase === 'round' || g.phase === 'event')) {
      const p = g.chapterProgress();
      right += ` · ${p.done}/${p.total}`;
    }
    this.chapEl.innerHTML = '';
    const left = el('span', 'stage__sc');
    left.textContent = sc.name;
    const sep = el('span', 'stage__sep', '｜');
    const r = el('span', 'stage__ch');
    r.textContent = right;
    this.chapEl.append(left, sep, r);

    // 顶栏右侧不再放段位小字(2026-10-14 对齐效果图:偏离只在右栏底部),
    // band 元素是常驻壳节点,隐藏即可,留给壳继续占位。
    this.bandEl.hidden = true;
    this.bandEl.textContent = '';

    // 回溯:常驻但不可用时压暗(对齐 Lua shell.lua:113-115);
    // 可用性只听引擎的 canBacktrack(prot/engine.js:1330):backtrack=-1(剧情)不限次,
    // backtrack>0 按次数封顶,0 是本难度根本没有回溯。
    // UI 不再另加「本章一旦回溯过就按不可点击处理」的一刀切 —— 那会把剧情难度的
    // 无限回溯砍成每章一次,与确认框里「本章可无限次回溯」的文案自相矛盾。
    const can = g.canBacktrack();
    const locked = !can;
    this.backBtn.textContent = '回溯';
    this.backBtn.classList.toggle('is-locked', locked);
    if (locked) this.backBtn.setAttribute('aria-disabled', 'true');
    else this.backBtn.removeAttribute('aria-disabled');
  }

  /**
   * 回溯:回到本章开头。对齐 Lua game.lua 的 renderIntro(true)——
   * 除渲染章首外,还要明说「偏离度与已解锁成就不重置」,否则玩家会误以为能刷成就。
   */
  private doBacktrack(): void {
    const g = this.game;
    // 受理条件只听引擎(canBacktrack):引擎的配额口径是 backtrack=-1 不限次、
    // backtrack>0 按次数封顶。UI 另立一套规则会让「本章还能回溯几次」在
    // 存读档后与引擎对不上(引擎把 backtracksThisChapter 随档存取)。
    if (!g.canBacktrack()) return;
    const quota = g.diff.backtrack;
    // quota=-1:本难度不限次(剧情难度);quota>0:每章的次数上限
    const unlimited = quota < 0;
    const left = quota > 0 ? Math.max(0, quota - g.backtracksThisChapter) : null;
    this.showConfirm(
      '回溯 ｜ 回到本章开头',
      [
        unlimited
          ? '本章可无限次回溯,但每回溯一次,本章收益便削减一分。'
          : `本章还剩 ${left} 次回溯机会。`,
        '偏离度与已解锁的成就、声望、图鉴都不会重置——史书会记得。',
      ],
      '回 溯',
      () => {
        // 作废结算动画序列的延时步(飞字收尾/翻牌/自动推进),否则回溯后旧定时器
        // 会拿着结算时的 CardResult 误触 routeAfterCard,把相位拽回去
        this.settleToken += 1;
        // 挂起的推进(如历史修正的 continuation)一并作废:相位已被拽回章首
        this.pendingAfterSettle = null;
        if (g.backtrack()) this.renderIntro(true);
      },
    );
  }

  /** 通用确认框(Lua Shell.confirm 的 DOM 版;2026-10-19 拍板:去水墨底图,压深色蒙版) */
  private showConfirm(title: string, lines: string[], okText: string, onOk: () => void): void {
    clear(this.overlay);
    sfx.play('dialog');
    this.overlay.className = 'overlay overlay--dim';
    const box = el('div', 'overlay__box panel-dialog');
    box.append(lbl(title, 'overlay__title u-kai u-heavy'));
    for (const line of lines) box.append(lbl(line, 'overlay__body'));
    const row = el('div', 'overlay__row');
    // 参考图顺序:确认(主)在左,再想想(次)在右
    row.append(
      btn(okText, {
        variant: 'primary',
        onClick: () => {
          this.hideOverlay();
          onOk();
        },
      }),
      btn('再 想 想', { variant: 'ghost', onClick: () => this.hideOverlay() }),
    );
    box.append(row);
    this.overlay.append(box);
    this.overlay.hidden = false;
  }

  // ---------- 叙事 ----------

  /**
   * 把文本渲染成段落。⟦词条⟧ 标记一律按纯文本渲染
   * (2026-10-16 拍板:对局页隐藏词条功能,不可点、不收录)。
   * 句子逐句包 span.prose__sent;渐显时 revealSegs 再把句子拆成字符级
   * span.prose__ch 按视觉行逐行亮(2026-10-17 拍板)。
   * 不进渐显的调用方(结算/回显)保持句子级纯文本,直接全显。
   */
  private prose(text: string, cls = 'prose'): HTMLElement {
    const p = el('p', cls);
    for (const run of parseRuns(text)) {
      for (const sent of splitSentences(run.text)) {
        p.append(el('span', 'prose__sent', sent));
      }
    }
    return p;
  }

  private clearMain(): void {
    // 换页前必须先把正在进行的渐显收掉,否则它的定时器会往新页里
    // 继续塞上一章的段落
    this.skipReveal();
    clear(this.main);
    this.storyEl = null;
    // 卷轴整页重建:旧的活小节已经不在文档里,别留着过期引用
    this.liveSec = null;
  }
  private clearOpts(): void {
    // 选卡提醒随选项区一并摘除,并作废可能还在倒计时的提醒定时器
    this.opts.classList.remove('is-pickhint');
    this.pickHintToken += 1;
    clear(this.opts);
  }

  /**
   * 选项区常驻(2026-10-15 拍板):本轮不需要选择时铺 4 张卡背占位,
   * 真选项/按钮来时先 clearOpts 再整体换掉。
   */
  private idleOpts(): void {
    this.clearOpts();
    for (let i = 0; i < 4; i += 1) {
      const back = el('div', 'card card--back');
      back.setAttribute('aria-hidden', 'true');
      this.opts.append(back);
    }
  }

  /**
   * 选定一张牌后的选项区:其余行动卡即刻翻到背面,
   * 选中的留正面(is-chosen),到结算动画收尾才翻(2026-10-17 拍板)。
   * 翻面是伪 3D:先侧立(is-flipped),半程换卡背贴图(is-back)再落回,不换 DOM。
   */
  private flipOpts(keep: HTMLElement | null): void {
    for (const c of Array.from(this.opts.querySelectorAll<HTMLElement>('.card--action'))) {
      // 翻面/留面都即刻摘掉可点性:否则结算相位里点旧卡会 thaw 误报「走不通」
      c.removeAttribute('role');
      c.removeAttribute('tabindex');
      c.setAttribute('aria-disabled', 'true');
      if (c === keep) c.classList.add('is-chosen');
      else this.flipCardToBack(c);
    }
  }

  private flipCardToBack(c: HTMLElement): void {
    if (c.classList.contains('is-flipped')) return;
    c.classList.add('is-flipped');
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.later(() => c.classList.add('is-back'), reduce ? 0 : 240);
  }

  /**
   * 出牌瞬间的飞卡残影(2026-10-17 拍板):克隆牌面从选项区飞向文本区中央,
   * 落定即散;原卡留在选项区(is-chosen),到结算收尾才翻背面。
   */
  private flyCardGhost(cardEl: HTMLElement): void {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;
    const from = cardEl.getBoundingClientRect();
    const to = this.main.getBoundingClientRect();
    const ghost = cardEl.cloneNode(true) as HTMLElement;
    ghost.classList.add('card-ghost');
    ghost.classList.remove('is-chosen');
    ghost.style.left = `${from.left}px`;
    ghost.style.top = `${from.top}px`;
    ghost.style.width = `${from.width}px`;
    ghost.style.height = `${from.height}px`;
    document.body.append(ghost);
    const dx = to.left + to.width / 2 - (from.left + from.width / 2);
    const dy = to.top + to.height * 0.42 - (from.top + from.height / 2);
    const anim = ghost.animate(
      [
        { transform: 'translate(0, 0) scale(1)', opacity: 1 },
        { transform: `translate(${dx}px, ${dy}px) scale(0.55)`, opacity: 0 },
      ],
      { duration: 560, easing: 'cubic-bezier(.3,.6,.3,1)' },
    );
    anim.onfinish = () => ghost.remove();
  }

  // ---------- 叙事渐显 ----------

  /**
   * 段落之间的间隔(ms)。对齐 Lua shell.lua 的 SEG_INTERVAL = 0.65,
   * 默认值由设置项 segDelay 提供(设置页可调 慢/标准/快)。
   */
  private static segInterval = 650;

  /** 接设置项的叙事速度。启动时与设置页改动时都会调。 */
  static setSegDelay(ms: number): void {
    if (Number.isFinite(ms) && ms > 0) Session.segInterval = ms;
  }

  private revealing: { steps: (() => void)[]; i: number; timer: number; done?: () => void } | null = null;

  /**
   * 立刻显示所有剩余内容并收尾。玩家点一下屏幕就该是这个反应,
   * 否则一句句等 0.65 秒很折磨。对齐 Lua Shell.cancelReveal / TapReveal。
   */
  skipReveal(): void {
    const rv = this.revealing;
    if (!rv) return;
    this.revealing = null;
    clearInterval(rv.timer);
    // i 的含义是「下一个要执行的步进下标」,先执行再前进。
    while (rv.i < rv.steps.length) {
      rv.steps[rv.i]!();
      rv.i += 1;
    }
    rv.done?.();
  }

  /** 渐显进行中 */
  get isRevealing(): boolean {
    return this.revealing !== null;
  }

  /**
   * 逐行浮现(2026-10-17 拍板:由逐句改为按排版逐行)。
   * prose 段落的句子先拆成字符级 span 并打 is-off(visibility:hidden 占位,
   * 版面不抖动),追加进容器后按 offsetTop 聚成视觉行,每个间隔亮一行;
   * 非 prose 元素(题注/分割线等)整项出。全部亮完调 done。
   * done 里才挂选项/继续按钮 —— 所以在渐显结束前点不到那些按钮,
   * 这跟 Lua 版一致,也顺带防止玩家在没读完时就做了选择。
   *
   * 行分组要在追加进容器后才量得出来(offsetTop 需要真实排版),
   * 所以首行步进会把后续行的步进当场补进 rv.steps —— skipReveal 的
   * while 循环与定时器的 i>=length 判断都天然兼容这种增长。
   *
   * box 是段落容器(prose-body),不是 main:main 只允许挂 castbox/prose-body,
   * 往 main 里直接塞段落会破坏版式不变量(chain 测试盯着这条)。
   */
  private revealSegs(box: HTMLElement, items: HTMLElement[], done?: () => void): void {
    this.skipReveal();
    if (!items.length) { done?.(); return; }
    // i = 下一个要执行的步进下标。steps 会随分行测量增长(见上)。
    const rv: NonNullable<Session['revealing']> = { steps: [], i: 0, timer: 0, done };
    for (const it of items) {
      const sents = [...it.querySelectorAll<HTMLElement>('.prose__sent')];
      if (sents.length === 0) {
        rv.steps.push(() => {
          box.append(it);
          this.scrollMainBottom();
        });
        continue;
      }
      const chars = sents.flatMap((s) => splitToChars(s));
      rv.steps.push(() => {
        box.append(it);
        const lines = groupIntoLines(chars);
        const revealLine = (k: number): void => {
          for (const c of lines[k] ?? []) c.classList.remove('is-off');
          this.scrollMainBottom();
        };
        revealLine(0);
        // 后续行插到当前步进之后(不是队尾):否则下一段会在本段亮完前先追加
        const rest: (() => void)[] = [];
        for (let k = 1; k < lines.length; k += 1) {
          const kk = k;
          rest.push(() => revealLine(kk));
        }
        rv.steps.splice(rv.i + 1, 0, ...rest);
      });
    }
    // 系统开了「减少动态效果」就别演了,直接全给出来
    if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) {
      while (rv.i < rv.steps.length) {
        rv.steps[rv.i]!();
        rv.i += 1;
      }
      done?.();
      return;
    }
    // 第一步当场出,定时器接着补后面的。
    this.revealing = rv;
    rv.steps[rv.i]!();
    rv.i += 1;
    rv.timer = window.setInterval(() => {
      if (this.revealing !== rv) return; // 已被取消/换页
      if (rv.i >= rv.steps.length) {
        this.revealing = null;
        clearInterval(rv.timer);
        rv.done?.();
        return;
      }
      rv.steps[rv.i]!();
      rv.i += 1;
    }, Session.segInterval);
  }

  /** 渐显到新段落时把正文卷到可见处,否则长段落会追加到视口外看不见。
   *  滚动容器是正文列 .prose-body(立绘列不动,2026-10-15 拍板) */
  private scrollMainBottom(): void {
    const box = (this.main.querySelector('.prose-body') as HTMLElement | null) ?? this.main;
    if (box.scrollHeight <= box.clientHeight) return;
    box.scrollTop = box.scrollHeight;
  }

  /** 文本区底部停靠带(2026-10-17 拍板):抉择/随机事件/关键事件的选项卡与「继续」钮
   *  统一钉在画卷可视底部。挂在 prose-body 末尾(不挂进小节正文):
   *  短内容被 live 小节的 flex-grow 顶到底;长内容靠 sticky bottom 吸住可视下沿,
   *  往上回读正文时选项仍可用。同一时刻只有一条 dock,先清旧再加新。 */
  private dock(): HTMLElement {
    const story = this.storyEl ?? this.ensureStory([]);
    this.clearDock();
    const d = el('div', 'dock');
    story.append(d);
    return d;
  }

  /** 摘走停靠带:选项落定/新小节推出时调用,旧选项与一次性按钮随带一起失效 */
  private clearDock(): void {
    if (!this.storyEl) return;
    for (const d of Array.from(this.storyEl.querySelectorAll(':scope > .dock'))) d.remove();
  }

  /**
   * 出场立绘:大立绘 + 圆像排。
   *
   * 大立绘展示「当前在场」的角色:⟦NPC⟧ 标记推出、且有大立绘的第一个;
   * 无出场角色时展示主角(2026-10-14 用户拍板:出现这个人物就展示他的立绘)。
   * 圆像排第一个是主角、其后是出场角色;点圆像切换大立绘焦点。
   * (2026-10-16 起对局页隐藏词条功能:立绘/圆像不再点开词条。)
   */
  private castBox(segs: readonly string[]): HTMLElement {
    const box = el('div', 'castbox');
    const lead = this.data.SCENARIO.name.split(/[·・]/)[0]?.trim() ?? this.data.SCENARIO.name;
    const others = castOf(segs).filter((n) => n !== lead);
    let focus = others.find((n) => bigPortrait(n)) ?? lead;

    const src0 = bigPortrait(focus);
    const p = el('div', 'portrait' + (src0 ? '' : ' portrait--empty'));
    let img: HTMLImageElement | null = null;
    if (src0) {
      img = el('img', 'portrait__img') as HTMLImageElement;
      img.src = src0;
      img.alt = focus;
      p.append(img);
    }
    const tag = lbl(`— ${focus} —`, 'portrait__name');
    p.append(tag);
    box.append(p);

    let chips: HTMLElement[] = [];
    const setFocus = (name: string): void => {
      const src = bigPortrait(name);
      if (!src || !img) return;
      focus = name;
      img.src = src;
      img.alt = name;
      tag.textContent = `— ${name} —`;
      for (const c of chips) c.classList.toggle('is-on', c.title === name);
    };
    const row = renderCast([lead, ...others], focus, setFocus);
    if (row) {
      chips = [...row.children] as HTMLElement[];
      box.append(row);
    }
    return box;
  }

  /** 叙事正文容器(与立绘并排) */
  private proseBody(): HTMLElement {
    return el('div', 'prose-body');
  }

  /**
   * 取正文容器。hard(章首/结算/结局)或容器丢失时整页重建;
   * 否则立绘原地换新、正文保留 —— 剧情文字不消失(2026-10-14 用户拍板)。
   */
  private ensureStory(segs: readonly string[], hard = false): HTMLElement {
    // 有选定牌(is-chosen)时不动选项区:其余卡已是背面,选定的留到
    // 下回合 renderRound 发牌前才翻(2026-10-16 拍板),中途事件不把它收走
    if (!this.opts.querySelector('.card--action.is-chosen')) this.idleOpts();
    if (hard || !this.storyEl || !this.storyEl.isConnected) {
      this.clearMain();
      this.main.append(this.castBox(segs));
      this.storyEl = this.proseBody();
      this.main.append(this.storyEl);
      return this.storyEl;
    }
    const old = this.main.querySelector('.castbox');
    const fresh = this.castBox(segs);
    if (old) old.replaceWith(fresh);
    else this.main.prepend(fresh);
    return this.storyEl;
  }

  /** 推一个新小节:旧小节保持展开(2026-10-19 拍板:之前轮次的内容不再自动折叠,
   * 题签仍可手动点按收起),新小节排在最后 */
  private pushSec(title?: string): { sec: HTMLElement; body: HTMLElement; head: HTMLElement | null } {
    const story = this.storyEl ?? this.ensureStory([]);
    // 停靠带随新小节整带摘除:上一相位的一次性「继 续」/选项卡都在带里,
    // 留着它,点击会误触当前相位的 proceed(与折叠无关,保留该清理)
    this.clearDock();
    // 新的小节顶上时,先把上一轮留下的活小节撤掉:它既无题签也无正文,
    // 只为 CSS 的「最后一个小节撑满余高」而存在 —— 留着只会在长章里堆出一串空 section
    this.dropLiveSec();
    const sec = el('section', 'sec');
    let head: HTMLElement | null = null;
    if (title) {
      head = el('button', 'sec__head u-kai', title);
      head.setAttribute('type', 'button');
      head.addEventListener('click', () => sec.classList.toggle('is-collapsed'));
      sec.append(head);
    }
    const body = el('div', 'sec__body');
    sec.append(body);
    story.append(sec);
    // 无题签的那节就是「活小节」:同一时刻只留一个,新的顶上时旧的撤掉,
    // 卷轴里因此不会攒下一串空 section(DOM 与布局成本照付)
    this.liveSec = title ? null : sec;
    // 新小节追加后滚到可视区:小节题签在尾部,不滚的话新内容出现在视口外,
    // 玩家只看到一片旧空白(2026-10-14 截图反馈)。等一帧让浏览器先排完版再量。
    // 走共享调度器的一次性帧任务(下一帧):时序与原来的裸 rAF 一致,
    // 页面被容器挂后台时这一帧会等到回前台再补(不会在看不见时把滚动做掉)。
    this.nextFrame(() => this.scrollMainBottom());
    return { sec, body, head };
  }

  /** 撤掉活小节(回合相位的无题签空小节):它没有内容,留着只占卷轴的位置 */
  private dropLiveSec(): void {
    if (!this.liveSec) return;
    this.liveSec.remove();
    this.liveSec = null;
  }

  /**
   * 刮下当前卷轴上的题签历史(v2.3.0):每个带题签的小节记一条
   * {题签(含「——所选」), 属性胶囊, 正文纯文本},存档时随槽位元数据存下,
   * 读档后由 restoreHistory 摆回。无题签的小节(回合相位的关键事件提示条)
   * 是活控件,不记入。按钮(继续/选项卡)不落历史:它们属于当时那一刻的相位。
   */
  collectHistory(): SecRec[] {
    const out: SecRec[] = [];
    if (!this.storyEl) return out;
    for (const sec of Array.from(this.storyEl.querySelectorAll('.sec'))) {
      const head = sec.querySelector('.sec__head');
      if (!head) continue;
      // 属性胶囊在正文下方(2026-10-19 起不在题签里),从整个小节范围取
      const tags: SecTag[] = Array.from(sec.querySelectorAll<HTMLElement>('.chgrow')).map((row) => {
        const v = row.querySelector('.chgrow__v');
        return {
          k: row.dataset.attr ?? '',
          name: row.querySelector('.chgrow__k')?.textContent ?? '',
          v: v?.textContent ?? '',
          up: v?.classList.contains('is-up') ?? false,
        };
      });
      // 题签文本:题字(含「——所选」后缀),胶囊不在 head 里,直接取文本
      const t = (head.textContent ?? '').trim();
      // 正文:逐块取纯文本,跳过按钮与属性胶囊排;每节封顶 2000 字,本地存储不是无底洞
      const bodyEl = sec.querySelector('.sec__body');
      const paras: string[] = [];
      for (const node of Array.from(bodyEl?.children ?? [])) {
        if (node.tagName === 'BUTTON' || node.classList.contains('chglist')) continue;
        const txt = (node.textContent ?? '').trim();
        if (txt) paras.push(txt);
      }
      out.push({ t, tags, body: paras.join('\n').slice(0, 2000) });
    }
    return out;
  }

  /**
   * 读档时把题签历史铺回卷轴(展开态,2026-10-19 起不再自动收起,可手动点题签收起)。
   * 在相位渲染之后调用:插到 live 小节之前,保住时间序。
   * 去重规则:当前相位会重推一个带题签的小节(章首/事件/抉择/结尾事件),
   * 刮下来的末条就是它的前身,丢弃;回合/结算/历史修正相位不重推题签小节,全保留。
   * 章末结算是整页重建(clearMain)且题签结构不同,历史摆不进去,直接跳过。
   */
  private restoreHistory(ui?: SecRec[]): void {
    if (!ui || ui.length === 0 || this.game.phase === 'summary') return;
    const reRenders = ['intro', 'event', 'choice', 'endEvent'].includes(this.game.phase);
    // 存档是 localStorage 里的不可信输入:逐条校验,不合法的整条丢掉而不是抛。
    // 抛出去的话异常会一路逃出 resume() → mountGame,读档页直接白屏。
    const recs = (reRenders ? ui.slice(0, -1) : ui).filter((r) => this.validSecRec(r));
    if (recs.length === 0) return;
    const story = this.storyEl ?? this.ensureStory([]);
    const firstSec = story.querySelector('.sec');
    try {
      for (const r of recs) story.insertBefore(this.historySec(r), firstSec);
    } catch {
      // 摆历史失败也不能让整局崩掉:这一段只是回放,不摆而已
    }
  }

  /**
   * 一条题签历史记录是否可用(存档是 localStorage 里的不可信输入):
   * 题签/正文必须是字符串,属性胶囊必须是数组(且每枚胶囊的字段也得是字符串)——
   * 任一不满足就整条丢弃,不能让一条脏数据把读档页炸成白屏。
   */
  private validSecRec(r: unknown): r is SecRec {
    if (!r || typeof r !== 'object') return false;
    const rec = r as Partial<SecRec>;
    if (typeof rec.t !== 'string' || typeof rec.body !== 'string') return false;
    if (!Array.isArray(rec.tags)) return false;
    return rec.tags.every((t) =>
      !!t && typeof t === 'object' &&
      typeof t.k === 'string' && typeof t.name === 'string' && typeof t.v === 'string');
  }

  /** 一条恢复出来的历史小节:题签 + 正文 + 正文下方属性胶囊(无渐显、无按钮) */
  private historySec(r: SecRec): HTMLElement {
    const sec = el('section', 'sec');
    const head = el('button', 'sec__head u-kai', r.t);
    head.setAttribute('type', 'button');
    head.addEventListener('click', () => sec.classList.toggle('is-collapsed'));
    sec.append(head);
    const body = el('div', 'sec__body');
    for (const para of r.body.split('\n').filter(Boolean)) body.append(el('p', 'prose', para));
    if (r.tags.length > 0) {
      const wrap = el('div', 'chglist');
      for (const t of r.tags) {
        const tag = el('span', 'chgrow');
        tag.dataset.attr = t.k;
        tag.append(el('span', 'chgrow__k', t.name), el('span', `chgrow__v ${t.up ? 'is-up' : 'is-down'}`, t.v));
        wrap.append(tag);
      }
      body.append(wrap);
    }
    sec.append(body);
    return sec;
  }

  /** 0 增量状态条目(2026-10-21 拍板)并入同属性的真实增减:
   * 引擎的阈值标记(weiji≥70「流言四起」/≥90「命悬一线」)与疾病自愈都是 delta 0,
   * 和真实增减并排出现观感像「出了两条危机」——合并进真实条目的注记,无真实条目才单列。
   *
   * 纯函数:不原地改引擎返回的对象(那条数组是引擎的结算结果,改了会污染后续读档),
   * 也不依赖「真实增减排在 0 增量条目之前」这种数组顺序 —— 先建 k→真实条目的映射再合并。 */
  private mergeZeroChanges(changes: ChangeView[]): ChangeView[] {
    // 先扫一遍:每个属性键的第一条真实增减(0 增量条目的注记要贴到它身上)
    const realIdx = new Map<string, number>();
    changes.forEach((c, i) => {
      if (c.delta !== 0 && !realIdx.has(c.k)) realIdx.set(c.k, i);
    });
    if (!realIdx.size) return changes;
    // 第二遍:0 增量条目摘出来(注记按属性键归堆),其余原样带出
    const notes = new Map<string, string[]>();
    const out: ChangeView[] = [];
    const outRealIdx = new Map<string, number>();
    for (const c of changes) {
      if (c.delta === 0 && realIdx.has(c.k)) {
        if (c.note) {
          const list = notes.get(c.k) ?? [];
          list.push(c.note);
          notes.set(c.k, list);
        }
        continue;
      }
      if (c.delta !== 0 && !outRealIdx.has(c.k)) outRealIdx.set(c.k, out.length);
      out.push(c);
    }
    if (!notes.size) return out;
    // 第三遍:把归堆的注记贴回该属性的第一条真实条目(复制出新对象,不改引擎那份)
    return out.map((c, i) => {
      const list = notes.get(c.k);
      if (!list || !list.length) return c;
      if (outRealIdx.get(c.k) !== i) return c;
      const note = list.join('；');
      return { ...c, note: c.note ? `${c.note}；${note}` : note };
    });
  }

  /** 结算的属性增减列表(showSettle 浮层与内联结算共用);行带 data-attr 供飞行动画定位 */
  private chgList(changes: ChangeView[]): HTMLElement | null {
    changes = this.mergeZeroChanges(changes);
    if (changes.length === 0) return null;
    const list = el('div', 'chglist');
    for (const c of changes) {
      const up = c.delta > 0;
      const name = c.label || this.data.ATTR_NAMES[c.k];
      const shown = this.game.diff.hideAttrs ? this.game.attrWord(c.k) : `${up ? '+' : ''}${c.delta}`;
      const row = el('div', 'chgrow');
      row.dataset.attr = c.k;
      row.dataset.delta = String(c.delta);
      row.append(el('span', 'chgrow__k', name), el('span', `chgrow__v ${up ? 'is-up' : 'is-down'}`, shown));
      if (c.note) row.append(el('span', 'chgrow__note u-dim', c.note));
      list.append(row);
    }
    return list;
  }

  /** 属性胶囊:挂在正文下方的块级胶囊排(2026-10-19 拍板,不再内联进题签);
   * 每枚仍叫 .chgrow[data-attr],flyChanges 的高亮/飞字钩子原样生效 */
  private chgTags(changes: ChangeView[]): HTMLElement | null {
    changes = this.mergeZeroChanges(changes);
    if (changes.length === 0) return null;
    const wrap = el('div', 'chglist');
    for (const c of changes) {
      const up = c.delta > 0;
      const name = c.label || this.data.ATTR_NAMES[c.k];
      const shown = this.game.diff.hideAttrs ? this.game.attrWord(c.k) : `${up ? '+' : ''}${c.delta}`;
      const tag = el('span', 'chgrow');
      tag.dataset.attr = c.k;
      tag.dataset.delta = String(c.delta);
      tag.append(el('span', 'chgrow__k', name), el('span', `chgrow__v ${up ? 'is-up' : 'is-down'}`, shown));
      if (c.note) tag.title = c.note;
      wrap.append(tag);
    }
    return wrap;
  }

  /** 落定后封题签:「——所选」小字追在题签后;属性胶囊挂到正文下方
   * (2026-10-19 拍板:各轮数字变化胶囊放剧情文本下面)。
   * 胶囊默认同时做飞字锚点,传 fly:false 时只封胶囊不飞(2026-10-18 拍板:行动卡结算恢复胶囊起飞) */
  private sealHead(
    head: HTMLElement | null,
    body: HTMLElement | null,
    suffix: string,
    changes: ChangeView[],
    opts?: { fly?: boolean },
  ): void {
    if (head && suffix) head.append(el('span', 'sec__result u-dim', `——${suffix}`));
    const tags = this.chgTags(changes);
    if (body && tags) {
      body.append(tags);
      if (opts?.fly !== false) this.flyChanges(tags);
    }
  }

  /** 属性变化动效(2026-10-18 拍板):结算行高亮 + 浮字逐条错峰飞到右栏对应行;
   * 落定后增减徽标浮现(自身属性在雷达数值旁,身外属性在进度条中央),
   * 一拍之后该属性的数值/进度条/雷达即时更新——不等下一次渲染,更不点点点按钮才变。
   * reduced-motion 不飞不演,数值即时更新。 */
  private flyChanges(list: HTMLElement): void {
    // 下一帧起飞(飞卡/飞字的起步):走共享调度器的一次性帧任务,
    // 时序与原来的裸 rAF 一帧不差(chain 测试盯着这条)。
    this.nextFrame(() => {
      // 离场后不再写右栏:这一帧若落在 dispose 之后,会把旧对局的数值写进新一局
      if (this.disposed) return;
      const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
      const rows = [...list.querySelectorAll<HTMLElement>('.chgrow')];
      // 引擎在出牌/选项落定时已结算,右栏此刻还显示旧值;
      // 同一属性可能有多行增减,先汇总:旧值 = 现值 − 总增减
      const totalDelta = new Map<string, number>();
      for (const row of rows) {
        const k = row.dataset.attr ?? '';
        totalDelta.set(k, (totalDelta.get(k) ?? 0) + (Number(row.dataset.delta) || 0));
      }
      const g = this.game;
      const oldVal = (k: string): number => (g.attrs[k as AttrKey] ?? 0) - (totalDelta.get(k) ?? 0);
      // 自身属性的待定旧值表:落定一根轴放出一根轴,其余轴保持旧值
      const pending: Partial<Record<AttrKey, number>> = {};
      for (const k of totalDelta.keys()) {
        if ((RADAR_AXES as string[]).includes(k)) pending[k as AttrKey] = oldVal(k);
      }
      // 右栏整体的待定表(2026-10-21 修,§3.5):所有变化的属性在飞字落定前
      // 都保持旧值。sideContent 靠它取旧值,外壳靠 hasSidePending() 判断
      // 此刻该不该整块重画右栏 —— 否则旧值会被冲成新值,补间与守卫全废。
      this.sideHold = {};
      for (const k of totalDelta.keys()) this.sideHold[k as AttrKey] = oldVal(k);
      let idx = 0;
      for (const row of rows) {
        row.classList.add('is-flash');
        const k = row.dataset.attr ?? '';
        const hit = this.stage.querySelector<HTMLElement>(`.stage__side [data-attr="${k}"]`)
          ?? this.stage.querySelector<HTMLElement>('.stage__side .radar');
        if (!hit) continue;
        const trow = (hit.closest('.kv') as HTMLElement | null) ?? hit;
        const delay = idx * 150;
        idx += 1;
        const vTxt = row.querySelector('.chgrow__v')?.textContent ?? '';
        const isUp = !row.querySelector('.chgrow__v')?.classList.contains('is-down');
        const oldShown = String(oldVal(k));
        // 属性音效与飞字同步起飞(2026-10-20 接入):财富进账响铜钱,其余涨落玉磬/墨滴
        const snd = isUp ? (k === 'caifu' ? 'coin' : 'gain') : 'down';
        // 一律登记在册:这些延时步写的是常驻的 shell.side(右栏),
        // 离场后还在跑就会把旧对局的数据写进新一局
        this.later(() => sfx.play(snd), reduced ? 0 : delay);
        this.later(() => trow.classList.add('is-flash'), reduced ? 0 : delay + 950);
        this.later(() => trow.classList.remove('is-flash'), (reduced ? 0 : delay + 950) + 2400);
        if (reduced) { this.applySideDelta(k, oldShown, pending); continue; }
        const from = row.getBoundingClientRect();
        const vEl = row.querySelector('.chgrow__v');
        const ghost = el('span', `flychg ${vEl?.classList.contains('is-down') ? 'is-down' : 'is-up'}`,
          `${row.querySelector('.chgrow__k')?.textContent ?? ''} ${vEl?.textContent ?? ''}`);
        ghost.style.left = `${from.left + from.width / 2}px`;
        ghost.style.top = `${from.top + from.height / 2}px`;
        ghost.style.visibility = 'hidden';
        document.body.append(ghost);
        this.later(() => {
          const to = trow.getBoundingClientRect();
          const dx = to.left + to.width / 2 - (from.left + from.width / 2);
          const dy = to.top + to.height / 2 - (from.top + from.height / 2);
          ghost.style.visibility = '';
          const anim = ghost.animate(
            [{ transform: 'translate(-50%,-50%) scale(1)', opacity: 0.95 },
             { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(.7)`, opacity: 0.15 }],
            { duration: 1150, easing: 'cubic-bezier(.25,.7,.3,1)' });
          anim.onfinish = () => ghost.remove();
        }, delay);
        // 飞字落定(1150ms):+N 徽标浮现;再过一拍(550ms)数值/进度条/雷达更新
        this.later(() => this.showSideDelta(k, vTxt, isUp), delay + 1150);
        this.later(() => this.applySideDelta(k, oldShown, pending), delay + 1700);
      }
    });
  }

  /** 飞字落定时的增减徽标:身外属性浮在进度条中央,自身属性浮在雷达数值旁(SVG text) */
  private showSideDelta(k: string, text: string, up: boolean): void {
    if (!text) return;
    const side = this.stage.querySelector<HTMLElement>('.stage__side');
    if (!side) return;
    const kvRow = side.querySelector<HTMLElement>(`.kv[data-attr="${k}"]`);
    if (kvRow) {
      const track = kvRow.querySelector<HTMLElement>('.meter');
      if (!track) return;
      const b = el('span', `attrdelta ${up ? 'is-up' : 'is-down'}`, text);
      track.append(b);
      this.later(() => b.remove(), 1300);
      return;
    }
    const radar = side.querySelector<SVGSVGElement>('svg.radar');
    const lab = radar?.querySelector<SVGTextElement>(`text[data-attr="${k}"]`);
    if (!radar || !lab) return;
    const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    t.setAttribute('class', `radar__delta ${up ? 'is-up' : 'is-down'}`);
    t.setAttribute('x', String(parseFloat(lab.getAttribute('x') ?? '0') + 15));
    t.setAttribute('y', lab.getAttribute('y') ?? '0');
    t.textContent = text;
    radar.append(t);
    // 数值更新会整幅重绘雷达、顺带带走徽标;这里兜底清一次
    this.later(() => t.remove(), 1700);
  }

  /** 增减生效:身外属性更新数值与进度条(自身属性重绘雷达,未落定的轴仍用旧值)。
   * 右栏若已被后续渲染翻新(显示的已是新值),跳过以免回跳 */
  private applySideDelta(k: string, oldShown: string, pending: Partial<Record<AttrKey, number>>): void {
    try {
      const g = this.game;
      const ak = k as AttrKey;
      const side = this.stage.querySelector<HTMLElement>('.stage__side');
      if (!side) return;
      const kvRow = side.querySelector<HTMLElement>(`.kv[data-attr="${k}"]`);
      if (kvRow) {
        const vEl = kvRow.querySelector<HTMLElement>('.kv__v');
        const fill = kvRow.querySelector<HTMLElement>('.meter__fill');
        if (!g.diff.hideAttrs && vEl && vEl.textContent !== oldShown) return;
        if (vEl) {
          vEl.textContent = g.diff.hideAttrs ? g.attrWord(ak) : String(g.attrs[ak] ?? 0);
          vEl.classList.remove('is-pop');
          void vEl.offsetWidth;
          vEl.classList.add('is-pop');
        }
        if (fill) {
          const max = g.attrMax(ak);
          const pct = max > 0 ? ((g.attrs[ak] ?? 0) / max) * 100 : 0;
          // 与 kit.meter 同口径:scaleX 而非 width(transform 过渡,不触发 layout)
          fill.style.transform = `scaleX(${Math.max(0, Math.min(100, pct)) / 100})`;
        }
        return;
      }
      if (!(ak in pending)) return;
      const radar = side.querySelector<SVGSVGElement>('svg.radar');
      const lab = radar?.querySelector<SVGTextElement>(`text[data-attr="${k}"]`);
      if (!radar || !lab) return;
      if (!g.diff.hideAttrs && lab.textContent !== oldShown) return;
      delete pending[ak];
      // 数值落定改为补间滑入(motion-design):多边形从旧值滑到新值,
      // 与飞字「落定即更新」的节奏衔接,替代原先的整幅瞬跳重绘
      radar.replaceWith(renderRadarTween(g, Object.keys(pending).length > 0 ? pending : undefined));
    } finally {
      // 这一条属性落定了:不再保持旧值(2026-10-21 修,§3.5)。
      // 必须放在 finally 里 —— 守卫命中(右栏已被别的渲染翻新)时也要放行,
      // 否则待定表永远非空,外壳就再也不整块重画右栏了。
      delete this.sideHold[k as AttrKey];
    }
  }

  // ---------- 结算浮层 ----------

  private showSettle(title: string, text: string | null, changes: ChangeView[], body?: string): void {
    clear(this.overlay);
    sfx.play('dialog');
    // 深色蒙版弹框(2026-10-17 拍板):与章末/最终结算同口径,不再铺水墨底图
    this.overlay.className = 'overlay overlay--dim';
    const box = el('div', 'overlay__box panel-dialog--tall');
    if (title) box.append(lbl(title, 'overlay__title u-kai u-strong'));
    if (text) box.append(this.prose(text, 'prose overlay__text'));
    if (body) box.append(lbl(body, 'overlay__body'));

    // 变化行统一走 chgList(带 data-attr,供飞行锚定),涨跌分色与硬核口径都在里面
    const list = this.chgList(changes);
    if (list) {
      box.append(list);
      this.flyChanges(list);
    }

    box.append(
      btn('阅', {
        variant: 'primary',
        cls: 'btn--read',
        sound: 'seal',
        onClick: () => {
          this.hideOverlay();
          this.settleClosed();
        },
      }),
    );
    this.overlay.append(box);
    this.overlay.hidden = false;
  }

  private hideOverlay(): void {
    if (this.overlay.hidden) return;
    // 出场动画(motion-design):原浮层同步置 hidden——状态机、连点与浏览器验收
    // 都不用等;视觉退场由冻结克隆体接管,播 200ms 淡出后自毁。
    // 克隆体挂 .is-exiting,不再重播弹框入场动画(见 art.css)。
    if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.overlay.hidden = true;
      clear(this.overlay);
      return;
    }
    const ghost = this.overlay.cloneNode(true) as HTMLElement;
    ghost.classList.add('is-exiting');
    const parent = this.overlay.parentElement;
    this.overlay.hidden = true;
    clear(this.overlay);
    if (parent) {
      parent.append(ghost);
      const drop = (): void => ghost.remove();
      ghost.addEventListener('animationend', drop, { once: true });
      // 兜底:后台标签页 animationend 可能被冻结,400ms 后无论如何收掉
      this.later(drop, 400);
    }
  }

  /** 浮层关闭后执行挂起的相位推进 */
  settleClosed(): void {
    const fn = this.pendingAfterSettle;
    this.pendingAfterSettle = null;
    fn?.();
  }

  // ---------- 章首 ----------

  renderIntro(fromBacktrack = false): void {
    this.skin('game', 'game');
    this.renderTop();
    const ch = this.game.chapter();
    if (!ch) return;
    this.inlineEvtBody = null;
    this.evtHost = null;
    this.choiceHost = null;

    // 章首不再自动写档(2026-10-15 二次拍板):自动档只在玩家点「返回」时写
    // (2026-10-17 起:未满 5 轮不写,有空位自动写,满员才确认覆盖),
    // 关页/刷新由暂存(pagehide)兜底,章首静默写会冲乱「每剧本 6 条」的语义。

    // 章首硬重置累积正文,新章从干净卷轴起;经营轮数同步归零
    this.roundNo = 0;
    this.ensureStory(ch.intro ?? [], true);
    // 年代从 sub 摘出来缀到章名后(「教学章 · 约前280—前270」→「上蔡之鼠 · 约前280—前270」),
    // 标签段(教学章/历史节点等)不再单独成行;剧情上方的金线一并去掉(2026-10-14 拍板)
    const era = (ch.sub ?? '')
      .split('·')
      .map((s) => s.trim())
      .filter((s) => s && !/^(教学章|历史节点预备|历史节点|全剧本枢纽)$/.test(s))
      .join(' · ');
    const { body } = this.pushSec(`${this.shortTitle(ch.title)}${era ? ` · ${era}` : ''}`);

    // 题签(小节头)/副题/分割线立即出,只有正文段落走渐显 —— 对齐 Lua renderIntro:
    // 那几行是 mainAdd 直接加的,只有 segs/notes 进 revealSegs 的 items。
    const items: HTMLElement[] = [];
    for (const seg of ch.intro ?? []) items.push(this.prose(seg));
    // 数据值增减提示(【…】行,2026-10-20 拍板):先 toast,队列走完再在正文原位淡入;
    // is-pending 只是透明,占位不抖,落位动画见 .intro-note 的 transition
    const pendingNotes: HTMLElement[] = [];
    for (const n of this.game.introNotes) {
      const line = lbl(n, 'intro-note u-qing is-pending');
      pendingNotes.push(line);
      items.push(line);
    }
    // 回溯回来要说清代价,否则玩家会以为回溯能刷成就(GDD 6.4)
    if (fromBacktrack) {
      items.push(lbl('【回溯】你回到了本章开头。偏离度与已解锁的成就、声望、图鉴都不会重置——史书会记得。', 'intro-note u-warn'));
    }
    // 回溯也要配音:但重念一遍 intro 很吵,只在正常进入时念。
    // intro 各段已合并成一条切片(2026-10-17 合并口径)
    if (!fromBacktrack) this.speakOne('intro');
    this.revealSegs(body, items, () => {
      // 继续钮钉在画卷可视底部(2026-10-17 拍板,dock 沉底),不进底部选项区;
      // 选项区保持卡背占位(ensureStory → idleOpts 已铺)。
      this.dock().append(btn('继 续', {
        variant: 'primary',
        onClick: (e) => {
          // 一次性按钮:与其他内联继续同口径,点击即摘,避免旧节重开时误触
          (e.currentTarget as HTMLButtonElement).remove();
          this.route(this.game.beginEvents());
        },
      }));
      this.scrollMainBottom();
    });
    this.toastThenSettle(pendingNotes);
  }

  /**
   * 章首「【…】」数据值增减提示:先 toast 再落位(2026-10-20 拍板)。
   * 逐条错峰 toast(展示时长与 kit.toast 的 2600ms 对齐),队列走完后
   * 一次性摘 is-pending,各条在正文原位淡入。reduced-motion 不演,直接落位。
   */
  private toastThenSettle(notes: HTMLElement[]): void {
    if (notes.length === 0) return;
    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      for (const n of notes) n.classList.remove('is-pending');
      return;
    }
    const STEP = 2600;
    notes.forEach((n, i) => {
      this.later(() => toast(this.stage, n.textContent ?? ''), i * STEP);
    });
    this.later(() => {
      for (const n of notes) n.classList.remove('is-pending');
      this.scrollMainBottom();
    }, notes.length * STEP);
  }

  /** 「第一章 ｜ 兰陵问道」→「兰陵问道」;无竖线则原样返回 */
  private shortTitle(full: string): string {
    const parts = full.split('｜');
    return parts.length > 1 ? (parts[1] ?? full).trim() : full;
  }

  // ---------- 回合 ----------

  renderRound(): void {
    this.skin('game', 'game');
    this.renderTop();
    this.inlineEvtBody = null;
    const g = this.game;
    const offer = g.getOffer();

    // 回合页也要立绘:否则剧情卷轴整块空着,右侧属性卷轴又满,
    // 视觉重心全偏在一半屏幕上(参考图的回合页同样有立绘与回显文案)。
    this.ensureStory([]);
    this.evtHost = null;
    // 「经营 · 第N轮」小节只在行动/蓄势真正落定时才推(afterCardSettle),
    // 回合相位只留一个无题签的活小节(给 CSS 的「最后一个小节撑满余高」用):
    // 它既无题签也无正文,新的顶上时旧的撤掉,长章里不会堆出一串空 section
    this.pushSec();

    // 关键事件不占底部选项位(2026-10-14 用户拍板):可开启时改为文本区底部的可点提示条。
    // 2026-10-21 拍板:「余 N 轮」倒计时提示条去掉——未到点不打扰,只留可了断的那一条。
    for (const old of this.storyEl?.querySelectorAll('.prompt--key') ?? []) old.remove();
    // 提示条只对「当前这一轮」成立:先作废旧代际,再按当前手牌挂新的。
    // (结算动画期间引擎相位虽已回到 round,但手牌已经换过一轮,
    //  旧提示条再被点中就会让引擎提前切到 event 相位,而动画收尾又按 round 重绘,
    //  两边相位就此错开 —— 之后 playCard 全返回 null。)
    const keyToken = (this.keybarToken += 1);
    const keyIdx = offer.findIndex((e) => e.type === 'key');
    const key = keyIdx >= 0 ? offer[keyIdx] : null;
    if (key && key.type === 'key' && key.enterable) {
      const p = el('div', 'prompt prompt--key is-live', `关键事件「${key.title}」已至——点此了断本章`);
      p.setAttribute('role', 'button');
      p.tabIndex = 0;
      p.dataset.offerIdx = String(keyIdx);
      const fire = (): void => {
        // 三道闸:代际(这一轮还是不是这条提示条)、相位、当前手牌里它还是不是关键卡
        if (keyToken !== this.keybarToken) return;
        if (this.game.phase !== 'round') return;
        const cur = this.game.getOffer();
        const e = cur[keyIdx];
        if (!e || e.type !== 'key' || !e.enterable) return;
        this.doPlayCard(keyIdx);
      };
      p.addEventListener('click', fire);
      p.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fire(); }
      });
      // 提示条不再进画卷文本区:独立行钉在画卷与选项卡之间(2026-10-20 拍板)
      this.keybar.replaceChildren(p);
    }

    // 上回合选定的牌在结算动画收尾已翻背面(2026-10-17 拍板),此处兜底翻完再发新牌。
    // dealToken 防重入:520ms 内若又进了一次 renderRound,旧定时器作废。
    const chosen = this.opts.querySelector<HTMLElement>('.card--action.is-chosen');
    const dealToken = (this.dealToken += 1);
    const deal = (): void => {
      if (dealToken !== this.dealToken) return;
      // 卡背占位/旧牌换成真手牌(选项区常驻,2026-10-15)
      this.clearOpts();
      for (let i = 0; i < offer.length; i += 1) {
        const e = offer[i];
        if (!e || e.type === 'key') continue;
        const body = el('div', 'card__body');
        const a = e.action;
        body.append(lbl(`${a?.name ?? e.id ?? ''}${e.risky ? '  ⚠' : ''}`, 'card__title u-kai u-strong'));
        const desc = (g.diff.hideAttrs ? a?.descHidden : a?.desc) ?? '';
        if (desc) body.append(lbl(desc, 'card__desc u-dim'));
        if (e.risky) body.append(lbl(this.riskText(e.risky), 'card__risk u-warn'));
        if (e.locked && e.reason) body.append(lbl(`🔒 ${e.reason}`, 'card__lock u-zhu'));
        if (e.diminishing) body.append(lbl(`已用 ${e.usedCount ?? 0} 次 · 收益递减`, 'card__warn u-warn'));
        // 行动卡类型皮肤（进取/守成/兑换/保身/抉择）：数据驱动 prot ACTIONS[].type；
        // 治病卡由引擎现组（prot/engine.js __cure__，不在 ACTIONS），按「保身」挂签(2026-10-17 拍板)
        const aType = a?.type ?? (a?.id === '__cure__' ? '保身' : undefined);
        const typeCls = aType ? ACTION_TYPE_BADGE[aType] : undefined;
        const c = card({ cls: `card--action${typeCls ? ` ${typeCls}` : ''}`, locked: e.locked, onClick: () => this.doPlayCard(i) });
        c.dataset.offerIdx = String(i);
        if (aType && typeCls) c.append(el('span', `card__badge ${typeCls}`, aType));
        c.append(body);
        this.opts.append(c);
      }

      // 蓄势
      const xc = el('div', 'card__body');
      xc.append(
        lbl('蓄势 · 静观其变', 'card__title u-kai u-strong'),
        lbl(
          g.xushi
            ? '已蓄势——下一次抉择的险招成功率 +10'
            : '不出手牌，为下一次抉择蓄一分胜算（险招 +10）',
          'card__desc u-dim',
        ),
      );
      const xcard = card({ cls: 'card--action t-xu', locked: g.xushi, onClick: () => this.doXushi() });
      xcard.append(el('span', 'card__badge t-xu', '蓄势'));
      xcard.append(xc);
      this.opts.append(xcard);

      // 章首 intro 后的第一轮(roundNo 还是 0):3s 内没点卡就亮选择提醒
      if (this.roundNo === 0) this.armPickHint(dealToken);
    };
    if (chosen) {
      this.flipCardToBack(chosen);
      // 登记在册:离场后这个延时步不能再往常驻的 shell.foot 里写旧对局的牌
      this.later(deal, 520);
    } else {
      deal();
    }
    this.scrollMainBottom();
  }

  /**
   * 章首 intro 朗读结束后的第一轮(roundNo===0):发牌 3s 内玩家没有点卡,
   * 选项区亮选择提醒,防止不知道怎么进行下一步(2026-10-18 拍板)。
   * 摘除统一走 clearOpts(点卡后的下一次渲染/换相位都会经过),
   * 点卡当下由 doPlayCard/doXushi 立即摘。
   */
  private armPickHint(dealToken: number): void {
    const token = (this.pickHintToken += 1);
    // 登记在册:离场后它再跑就会给新一局的选项区误挂 is-pickhint
    this.later(() => {
      if (token !== this.pickHintToken || dealToken !== this.dealToken) return;
      if (this.game.phase !== 'round') return;
      if (!this.opts.querySelector('.card--action[role="button"]')) return;
      this.opts.classList.add('is-pickhint');
    }, 3000);
  }

  private riskText(risky: Risk): string {    const eff = Math.min(70, risky.rate + (this.game.xushi ? 10 : 0));
    const gaps = risky.unmet.map((u) => (this.game.diff.hideAttrs ? `${u.name}不足` : `${u.name} ${u.have}/${u.need}`)).join('、');
    const rate = this.game.diff.hideAttrs ? '成算' : '成功率';
    return `⚠ 险招 · ${rate} ${eff}%（${gaps}）`;
  }

  /** 险招骰点动画:先快速翻滚假骰点约 0.9s,再落定真实结果(对齐 Lua showSettle 摇骰)。
   * 硬核难度隐去数字只摇 🎲(hideAttrs 数值口径);纯视觉,不动引擎。
   * ok 传入险招结果:落定音后,败者再补一声低鼓(2026-10-20 音效)。 */
  private diceTitle(host: HTMLElement, finalText: string, ok?: boolean): void {
    const lab = lbl('', 'u-warn u-strong dice-rolling');
    host.append(lab);
    sfx.play('dice-roll');
    const hide = this.game.diff.hideAttrs;
    const t0 = performance.now();
    const timer = setInterval(() => {
      if (!lab.isConnected) { clearInterval(timer); return; }
      if (performance.now() - t0 >= 900) {
        clearInterval(timer);
        lab.textContent = finalText;
        lab.classList.remove('dice-rolling');
        lab.classList.add('dice-land');
        sfx.play('dice-land');
        if (ok === false) this.later(() => sfx.play('fail'), 350);
        return;
      }
      lab.textContent = hide ? '🎲 掷骰 …' : `🎲 掷骰 ${1 + Math.floor(Math.random() * 100)} …`;
    }, 70);
  }

  // ---------- 事件 ----------

  /** 该事件的节点异变(altSegs)是否生效。mutations 在章首按条件置 flag。 */
  private altActive(ev: { altSegs?: { flag: string } }): boolean {
    return !!(ev.altSegs && this.game.flags[ev.altSegs.flag]);
  }

  /** 事件叙事文本:异变生效时用变体。封存 Lua(game.lua:374)与旧 JS UI(ui-event.js:35)
   *  同口径;H5 移植时只读 segs,导致五本共 20 处变体文案永不显示。 */
  private eventSegs(ev: { segs?: string[]; altSegs?: { flag: string; segs: string[] } }): string[] {
    return this.altActive(ev) ? ev.altSegs!.segs : ev.segs ?? [];
  }

  renderEvent(): void {
    this.skin('game', 'game');
    this.renderTop();
    const g = this.game;
    const ev = g.eventId ? g.findEvent(g.eventId) : null;
    if (!ev) {
      this.ensureStory([]);
      this.pushSec().body.append(lbl('此节无处可述（章节数据不一致）。', 'u-zhu'));
      return;
    }
    const inserted = g.currentRandom != null;
    const segs = this.eventSegs(ev);
    this.ensureStory(segs);
    // 题签即分类:际遇不带选项名(结果直接续正文),关键事件落定后由 sealHead 补「——所选」
    const host = this.pushSec(inserted ? `际遇 · 随机事件——${ev.title}` : `关键事件 · ${ev.title}`);
    this.evtHost = host;
    const { body } = host;
    // 配音(2026-10-17 合并口径):主线事件播 <事件id>(segs 已合并为一条);
    // 危机插入(id 以 C- 开头)播 _shared 的 crisis_<id>;随机事件(R-*)不配音。
    // 异变文案没有对应录音(build-voice.py 只按基础 segs 合成),宁可静音也不放另一版的词。
    if (inserted) {
      if (g.eventId?.startsWith('C-')) this.speakOne(`crisis_${g.eventId}`);
    } else if (!this.altActive(ev)) {
      this.speakOne(ev.id);
    }
    // 选项等渐显结束再挂:没读完就做选择不是我们要的
    const items = segs.map((seg) => this.prose(seg));
    // 偶遇/随机事件(含危机插入)与关键事件:选项都内联在文本区、跟在剧情文本下居中,
    // 不占底部决策区、不弹浮层(2026-10-14/15 用户拍板;关键事件 10-15 起同口径——
    // 「赵高来访」「蒙嘉之门」等 5 选项事件在底部会撑出第 5 张卡,内联竖排无此约束)。
    if (inserted) this.inlineEvtBody = body;
    else this.inlineEvtBody = null;
    this.revealSegs(body, items, () => this.renderEventOptsInline());
  }

  /** 事件选项(偶遇/随机/关键事件同口径,2026-10-15):挂进文本区底部停靠带,等渐显完再挂;
   *  底部选项区保持卡背占位不清(选项区常驻,2026-10-15) */
  private renderEventOptsInline(): void {
    const opts = this.game.getOptions();
    const dock = this.dock();
    for (let i = 0; i < opts.length; i += 1) {
      const o = opts[i];
      if (!o) continue;
      const cardBody = el('div', 'card__body');
      // 附加信息(锁因/险招)不换行,内联跟在选项文字后(2026-10-21 拍板)
      const line = el('div', 'card__optline');
      line.append(lbl(o.opt.t, 'card__title u-kai'));
      if (o.locked && o.reason) line.append(el('span', 'card__lock u-zhu', `🔒 ${o.reason}`));
      if (o.risky) line.append(el('span', 'card__risk u-warn', this.riskText(o.risky)));
      cardBody.append(line);
      const c = card({
        // 事件选项不带菱纹装饰(2026-10-19 拍板:card--plain 去 ◇)
        cls: `card--opt card--plain${o.locked ? '' : ' card--tappable'}`,
        locked: o.locked,
        onClick: () => this.doChoose(i),
      });
      // 引擎选项下标随卡走:有锁定选项在前时,可点卡 DOM 序 ≠ 引擎下标,
      // 测试驱动(e2e)按此定位,不按下标数
      c.dataset.offerIdx = String(i);
      c.append(cardBody);
      // 「史」改角标(2026-10-19 拍板):不占正文一行,贴在卡右上角
      if (o.hist) c.append(el('span', 'card__hist', '史'));
      dock.append(c);
    }
    this.scrollMainBottom();
  }

  // ---------- 抉择卡 ----------

  renderChoice(): void {
    this.skin('game', 'game');
    this.renderTop();
    this.inlineEvtBody = null;
    const v = this.game.getChoiceCard();
    if (!v || v.options.length === 0) {
      // 兜底也要把引擎从 choice 相位带出来:不 cancel 的话 phase 卡住,
      // 之后所有 playCard 都因相位不符返回 null,对局软锁
      this.game.cancelChoice();
      this.renderRound();
      return;
    }
    const segs = this.eventSegs(v);
    this.ensureStory(segs);
    const host = this.pushSec(`抉择 · ${v.title}`);
    this.choiceHost = host;
    const { body } = host;

    const items = segs.map((seg) => this.prose(seg));
    this.revealSegs(body, items, () => {
      // 抉择卡剧情配音:segs 已合并为一条 choice_<id>(2026-10-17 合并口径)
      this.speakOne(`choice_${v.id}`);
      this.renderChoiceOpts();
    });
  }

  /**
   * 抉择卡的选项:内联在文本区、跟在剧情文本下(2026-10-16 拍板),与际遇/关键事件同口径;
   * 底部选项区不动——其余卡出牌时已翻背面,选中的抉择卡留正面到下回合发牌前(2026-10-16 拍板)。
   * 单独成方法:引擎拒绝一次落定后要重挂选项,重挂不该再推一个小节(否则卷轴里出现两个同题签的小节)。
   */
  private renderChoiceOpts(): void {
    const v = this.game.getChoiceCard();
    if (!v) return;
    const dock = this.dock();
    for (let i = 0; i < v.options.length; i += 1) {
      const o = v.options[i];
      if (!o) continue;
      // 财富见底锁(2026-10-16):引擎 getChoiceCard 已按财富 ≤ 0 打上 locked/reason
      const locked = !!o.locked;
      const c = card({
        cls: `card--opt${locked ? '' : ' card--tappable'}`,
        locked,
        onClick: () => this.doChooseCardOpt(i),
      });
      c.dataset.offerIdx = String(i);
      const optBody = el('div', 'card__body');
      // 锁因内联跟在选项文字后,不单独占一行(与事件选项同口径,2026-10-21 拍板)
      const line = el('div', 'card__optline');
      line.append(lbl(o.t, 'card__title u-kai'));
      if (locked && o.reason) line.append(el('span', 'card__lock u-zhu', `🔒 ${o.reason}`));
      optBody.append(line);
      c.append(optBody);
      dock.append(c);
    }
    const skip = card({ cls: 'card--opt card--tappable', onClick: () => this.doCancelChoice() });
    const skipBody = el('div', 'card__body');
    skipBody.append(lbl('且搁置', 'card__title u-dim'));
    skip.append(skipBody);
    dock.append(skip);
    this.scrollMainBottom();
  }

  // ---------- 章末结算 ----------

  renderSummary(summary: SummaryView): void {
    // 章末结算改弹框(2026-10-17 拍板):对局页留在原地,深色蒙版上叠窄幅卷轴弹框,
    // 不再整页重建(clearMain/clearOpts 都不动)。
    // 读档直接落在 summary 相位时底层还没渲染过,补出空卷轴与皮肤垫底。
    this.skin('game', 'game');
    this.ensureStory([]);
    this.renderTop();
    sfx.play('chapter');
    clear(this.overlay);
    this.overlay.className = 'overlay overlay--dim';
    const body = el('div', 'overlay__box overlay__box--scroll panel-scroll--summary');

    // 「章末结算」与章节名同行同号(2026-10-18 拍板),不再一大一小两行
    body.append(lbl(`章末结算 ｜ ${this.shortTitle(summary.chapter)} 终`, 'page-title'));
    body.append(el('div', 'page-rule'));
    body.append(lbl(`偏离归因 ｜ 当前偏离 ${summary.dev}（${summary.bandName}）`, 'u-warn u-strong u-center summary__dev'));

    if (summary.devLog.length === 0) {
      body.append(lbl('本章你循史而行，史官的笔尚跟得上你。', 'u-dim u-center'));
    } else {
      for (const d of summary.devLog) {
        const row = el('div', 'devrow');
        row.append(lbl(`${d.ev} ｜ ${d.t}`, 'u-dim'));
        body.append(row);
      }
    }
    // 教学引导不上结算页(2026-10-18 拍板):数据里 c0 的【教学】注记就地滤掉
    for (const n of summary.notes.filter((t) => !t.startsWith('【教学】'))) body.append(lbl(n, 'intro-note u-qing'));
    if (summary.corrTitle) body.append(lbl(`历史修正 ｜ ${summary.corrTitle}`, 'intro-note u-qing'));

    // 「本章境遇」段(题签 + 属性变化胶囊)包进一个容器:移动端整体隐藏
    // (2026-10-20 拍板),DOM 保留——chain 测试按 .chglist--summary 断言不受影响
    const attrs = el('div', 'summary__attrs');
    attrs.append(divider('本 章 境 遇'));
    // 属性变化改胶囊横排(2026-10-18 拍板,替掉四格 statrow)
    const deltas = this.data.ATTRS.filter((a) => summary.attrDelta[a.k]);
    if (deltas.length === 0) {
      attrs.append(lbl('诸维如止水，无增无减。', 'u-dim'));
    } else {
      const list = el('div', 'chglist chglist--summary');
      for (const a of deltas) {
        const d = summary.attrDelta[a.k] ?? 0;
        // 增减一律按符号:增=is-up(朱红),减=is-down(墨绿),不再按好坏翻转(2026-10-18 拍板)
        const up = d > 0;
        const pill = el('span', `chgrow ${up ? 'is-up' : 'is-down'}`);
        pill.append(
          el('span', 'chgrow__k', a.n),
          el('span', `chgrow__v ${up ? 'is-up' : 'is-down'}`,
            this.game.diff.hideAttrs ? (d > 0 ? '升' : '降') : `${d > 0 ? '+' : ''}${d}`),
        );
        list.append(pill);
      }
      attrs.append(list);
    }
    body.append(attrs);

    const row = el('div', 'overlay__row');
    row.append(
      btn(summary.nextTitle ? '进 入 下 一 章' : '继 续', {
        variant: 'primary',
        onClick: () => {
          this.hideOverlay();
          this.route(this.game.proceedSummary());
        },
      }),
    );
    body.append(row);
    this.overlay.append(body);
    this.overlay.hidden = false;
  }

  // ---------- 结局 ----------

  renderEnding(): void {
    // 最终结算改弹框(2026-10-17 拍板):与章末结算同口径,对局页原地压深色蒙版;
    // 读档直落 ending 相位时先补出底层卷轴与皮肤
    this.skin('game', 'game');
    this.ensureStory([]);
    this.renderTop();
    const e = this.game.ending;
    if (!e) return;
    sfx.play('ending');
    // 结局「太史公曰」配音:ending_<id>[_<变体>](2026-10-17 合并口径)
    this.speakOne(`ending_${e.id}${e.variant ? `_${e.variant}` : ''}`);

    // 结局落地(对齐 Lua game.lua renderEnding):跨局收藏写回(含结局达成记录),
    // 并清掉该剧本的自动档 —— 已结束的局不该再从「继续旅程」里复活。在这里做而
    // 不是在退出时做,是因为玩家可能直接停在结局页关掉浏览器。
    const prog = recordEnding(this.game);
    clearAutos(this.scenKey);

    clear(this.overlay);
    this.overlay.className = 'overlay overlay--dim';
    // 最终结算(2026-10-20 拍板):完全复用图鉴成就详情弹框 —— 同皮
    // (panel-scroll--summary + galdetail)同结构(头部印章+结局名·评级 /
    // 太史公曰 / 累计达成 / 按钮),移动端的隐藏分数·收紧居中等规则全部自动继承
    const body = el('div', 'overlay__box overlay__box--scroll panel-scroll--summary galdetail');

    // 头部区:与 gallery.ts showDetail 同构 —— 印章图在前,信息列(结局名+总分/评级)跟后
    const head = el('div', 'galdetail__head');
    const sealTop = el('img', 'galdetail__seal') as HTMLImageElement;
    sealTop.src = sealImg(e.seal);
    sealTop.alt = `${e.seal} · ${e.diffName}`;
    sealTop.draggable = false;
    head.append(sealTop);
    const info = el('div', 'galdetail__info');
    info.append(lbl(e.name, 'overlay__title u-kai'));
    const total = el('div', 'score score--total');
    total.append(
      el('span', 'score__k u-strong', '总分'),
      el('span', 'score__v score__v--big u-kai u-strong', String(e.total)),
      seal(e.grade, 'seal--big'),
    );
    info.append(total);
    head.append(info);
    body.append(head);

    if (e.zhuan) {
      body.append(divider('太史公曰'));
      body.append(lbl(e.zhuan, 'prose u-qing galdetail__zhuan'));
    }
    if (prog) body.append(lbl(`累计达成${prog.rec.c}回`, 'galdetail__meta u-dim'));

    const btnRow = el('div', 'overlay__row');
    btnRow.append(btn('返 回 主 页', {
      variant: 'primary',
      onClick: () => {
        this.hideOverlay();
        this.onFinish?.();
      },
    }));
    body.append(btnRow);
    this.overlay.append(body);
    this.overlay.hidden = false;
  }

  // ---------- 章末事件 ----------

  private renderEndEvent(): void {
    this.skin('game', 'game');
    const ev = this.game.currentEndEvent;
    this.renderTop();
    if (!ev) {
      this.route(this.game.proceedAfterEndEvent());
      return;
    }
    const segs = this.eventSegs(ev);
    this.ensureStory(segs);
    // 章末事件配音:segs 已合并为一条 <事件id>(如 cj-yaojia,2026-10-17 合并口径)。
    // 异变文案同理没有录音,静音处理(见 renderEvent)。
    if (!this.altActive(ev)) this.speakOne(ev.id);
    const { body } = this.pushSec(ev.title);
    body.append(el('div', 'rule'));

    // 选项卡不再走底部决策区、结算不再弹浮层:全部内联在文本区里,
    // 且等剧情渐显完再挂,免得没读完就点了
    const items = segs.map((seg) => this.prose(seg));
    this.revealSegs(body, items, () => {
      const dock = this.dock();
      for (let i = 0; i < ev.options.length; i += 1) {
        const o = ev.options[i];
        if (!o) continue;
        // 门槛 = req 硬门槛 + 财富见底锁(2026-10-16:财富 ≤ 0 时扣财选项不可执行)
        const gate = this.reqCheck(o.req);
        const broke = this.game.attrs.caifu <= 0 && ((o.eff?.attrs?.caifu ?? 0) < 0);
        const ok = gate.ok && !broke;
        const reason = gate.ok ? (broke ? '财富见底，无力为之' : null) : gate.reason;
        const cardBody = el('div', 'card__body');
        cardBody.append(lbl(o.t, 'card__title u-kai'));
        if (!ok) cardBody.append(el('div', 'card__lock u-zhu', `🔒 ${reason ?? ''}`));
        const c = card({
          // 结尾事件选项同口径:card--plain 去 ◇(2026-10-19 拍板)
          cls: `card--opt card--plain${ok ? ' card--tappable' : ''}`,
          locked: !ok,
          onClick: () => this.doEndEventChoose(i),
        });
        c.append(cardBody);
        dock.append(c);
      }
      this.scrollMainBottom();
    });
  }

  private doEndEventChoose(i: number): void {
    const r = this.game.endEventChoose(i);
    if (!r) {
      this.thaw('这个选项眼下走不通（条件已变）。');
      return;
    }
    // 内联结算:新开一节「结果」,变化行带飞行动效,然后原地「继续」
    const { body } = this.pushSec('结果');
    if (r.text) body.append(this.prose(r.text));
    const list = this.chgList(r.changes);
    if (list) {
      body.append(list);
      this.flyChanges(list);
    }
    this.dock().append(btn('继 续', {
      variant: 'primary',
      onClick: (e) => {
        // 一次性按钮:小节收起后按钮仍留在 DOM,重复点击会在新相位里误触 proceed
        (e.currentTarget as HTMLButtonElement).remove();
        this.route(this.game.proceedAfterEndEvent());
      },
    }));
    this.scrollMainBottom();
  }

  /** check() 在无条件时返回 true,统一收口成 {ok, reason} */
  private reqCheck(req: Record<string, unknown> | undefined): { ok: boolean; reason: string | null } {
    if (!req) return { ok: true, reason: null };
    const r = this.game.check(req);
    return r === true ? { ok: true, reason: null } : r;
  }

  // ---------- 历史修正 ----------

  private renderCorrection(c: { title: string; segs: string[]; changes?: ChangeView[] } | null | undefined): void {
    this.showSettle(`历史修正 ｜ ${c?.title ?? ''}`, (c?.segs ?? []).join(''), c?.changes ?? []);
    // 修正配音:corr_<N>,N 是 CORRECTIONS 里的下标(修正浮层不带 id,按 title 反查);
    // 修正页整页替换,旧朗读一并掐断再切结果切片
    const idx = c ? this.game.d.CORRECTIONS.findIndex((corr) => corr.title === c.title) : -1;
    this.speakResult(idx >= 0 ? `corr_${idx}` : null);
    this.pendingAfterSettle = () => this.route(this.game.correctionContinue());
  }

  // ---------- 动作 ----------

  /**
   * 引擎消耗掉一轮时,同步推进 UI 的轮次计数。
   *
   * 引擎的「一轮」= 关键事件倒计时 -1 的那一次,发生在 playCard(行动/治病)、
   * playXushi、chooseCardOption 三处(prot/engine.js 的 _advanceRound)。
   * 抉择卡出牌本身不消耗轮次(引擎停在 choice 相位),是「落定」那一刻才消耗 ——
   * UI 若只在出牌时计数,抉择卡就会让两边错开一轮,卷轴题签与存档轮次都偏低。
   * 所以计数点必须与引擎的消耗点一一对应,不在 UI 侧另算一套。
   */
  private advanceRound(): number {
    this.roundNo += 1;
    return this.roundNo;
  }

  private doPlayCard(i: number): void {
    // 点卡当下摘掉选卡提醒并作废其定时器
    this.opts.classList.remove('is-pickhint');
    this.pickHintToken += 1;
    // 出了牌就作废关键事件提示条:提示条只对当前这一轮成立,
    // 留着它,玩家就能在结算动画期间点它 —— 引擎会提前切到 event 相位,
    // 而动画收尾又按 round 重绘,两边相位就此错开(界面有牌却点不动)
    this.clearKeybar();
    // 已翻面/已选定的卡不吃点击(合成 click 与键盘都会绕过 pointer-events)
    const cardEl = this.opts.querySelector<HTMLElement>(`.card[data-offer-idx="${i}"]`);
    if (cardEl?.classList.contains('is-flipped') || cardEl?.classList.contains('is-chosen')) return;
    // 卡名要在 playCard 前取:落定后引擎会重算 offer,同一下标指向的已是另一张牌
    const cardName = this.game.getOffer()[i]?.action?.name ?? '行动';
    const r = this.game.playCard(i);
    if (!r) {
      this.thaw('这张牌眼下走不通（门槛已变或状态不同步）。');
      return;
    }
    if (r.kind === 'key') {
      if (r.chapterEnd) this.route(this.game.proceed());
      else this.renderEvent();
      return;
    }
    // 选定即翻:其余行动卡翻背面,这张留正面到结算动画收尾才翻(2026-10-17 拍板);
    // key 不占底部选项位(是文本区提示条),无卡可翻
    this.flipOpts(cardEl ?? null);
    if (r.kind === 'choice') {
      // 抉择卡出牌不消耗轮次(引擎停在 choice 相位),轮次在落定那一刻才推进
      this.renderChoice();
      return;
    }
    // xushi 不走这里(走 doXushi)
    this.afterCardSettle(r, cardName, cardEl ?? null);
  }

  private doChoose(i: number): void {
    // 选项文本要在 choose 前取(落定后 getOptions 可能已变),关键事件题签要封「——所选」
    const optText = this.game.getOptions()[i]?.opt.t ?? '';
    const r = this.game.choose(i);
    if (!r) {
      this.thaw('这个选项眼下走不通（已试过或条件已变）。');
      return;
    }
    // 选项结果配音:只有危机事件(C-*)有结算切片 crisis_<id>_o<N>;
    // 主线/随机事件的选项结算不配音(2026-10-17 拍板)。三档都先掐正文朗读再切结果
    this.speakResult(
      this.game.eventId?.startsWith('C-') && !r.forcedEnding
        ? `crisis_${this.game.eventId}_o${i + 1}`
        : null,
    );
    // 险招要亮骰点(Lua 的 riskTitle):掷骰 63 ＞ 50 · 败 / 硬核的「成算五成 · 败」。
    const title = [
      r.risk ? this.game.riskTitle(r) : '',
      r.bandUp && r.bandName ? `史书提示：偏离度已入「${r.bandName}」` : '',
    ].filter(Boolean).join(' ｜ ');
    // 偶遇/随机事件:结算内联在事件小节正文(与 renderEvent 的内联选项配套)
    const inlineBody = this.game.currentRandom != null ? this.inlineEvtBody : null;
    if (inlineBody) {
      this.doChooseInline(r, inlineBody, title);
      return;
    }
    // 关键事件:同样内联——结果续进事件小节,题签封「——所选 +属性胶囊」(2026-10-14 拍板,不再弹浮层)
    const host = this.evtHost;
    if (!host) {
      this.route(this.game.proceed());
      return;
    }
    // 事件落定:先摘走停靠带(结果续进小节正文,旧选项不留),选项区回到卡背占位(2026-10-15)
    this.clearDock();
    // 有选定牌时选项区不动(它留到下回合发牌前才翻);否则回到卡背占位
    if (!this.opts.querySelector('.card--action.is-chosen')) this.idleOpts();
    const appendResult = (): void => {
      // 剧情与结果之间一道金线分层(2026-10-14 拍板)
      host.body.append(el('div', 'rule'));
      if (title) {
        if (r.risk) this.diceTitle(host.body, title, !r.failed);
        else host.body.append(lbl(title, 'u-warn u-strong'));
      }
      host.body.append(this.prose(r.text));
    };
    if (r.failed && !r.forcedEnding) {
      // 险招失败即事件终结(2026-10-21 拍板):不再原地重选,题签封口后与成功同流程推进。
      // 属性变化只走 sealHead 胶囊一路(2026-10-21 补拍:chgList+sealHead 各渲染一遍会出双份)
      appendResult();
      this.sealHead(host.head, host.body, optText, r.changes);
      this.evtHost = null;
      this.dock().append(btn('继 续', {
        variant: 'primary',
        onClick: (e) => {
          (e.currentTarget as HTMLButtonElement).remove();
          this.route(this.game.abandonEvent());
        },
      }));
      this.scrollMainBottom();
      return;
    }
    appendResult();
    this.sealHead(host.head, host.body, optText, r.changes);
    this.evtHost = null;
    this.dock().append(btn('继 续', {
      variant: 'primary',
      onClick: (e) => {
        // 一次性按钮:小节收起后按钮仍留在 DOM,重复点击会在新相位里误触 proceed
        (e.currentTarget as HTMLButtonElement).remove();
        this.route(this.game.proceed());
      },
    }));
    this.scrollMainBottom();
  }

  /** 偶遇/随机事件的内联结算:结果直接续在事件小节正文后(不再单开「结果」小节),
   * 属性增减以胶囊封进题签;险招失败即事件终结,不再原地重选(2026-10-21 拍板)。
   * 落定后不再有「继 续」钮(2026-10-17 拍板):结果亮出后自动推进。 */
  private doChooseInline(r: CardResult, evtBody: HTMLElement, title: string): void {
    this.clearDock();
    const appendResult = (host: HTMLElement): void => {
      host.append(el('div', 'rule'));
      if (title) host.append(lbl(title, 'u-warn u-strong'));
      host.append(this.prose(r.text));
    };
    if (r.failed && !r.forcedEnding) {
      appendResult(evtBody);
      // 属性变化只走 sealHead 胶囊一路,不再叠加 chgList 行(同 key-event 失败分支口径)
      this.sealHead(this.evtHost?.head ?? null, evtBody, '', r.changes);
      this.inlineEvtBody = null;
      this.evtHost = null;
      this.scrollMainBottom();
      // 险招失败即事件终结:与成功同口径自动推进,abandonEvent 负责收束路由
      const token = (this.settleToken += 1);
      this.later(() => {
        if (token !== this.settleToken) return;
        this.route(this.game.abandonEvent());
      }, 2600);
      return;
    }
    appendResult(evtBody);
    this.sealHead(this.evtHost?.head ?? null, evtBody, '', r.changes);
    this.inlineEvtBody = null;
    this.evtHost = null;
    this.scrollMainBottom();
    // 自动推进:留足一拍给玩家看清逐条飞字与右栏高亮(2026-10-17 二拍放慢);
    // 令牌防止回溯/离场后旧定时器误触
    const token = (this.settleToken += 1);
    this.later(() => {
      if (token !== this.settleToken) return;
      this.route(this.game.proceed());
    }, 2600);
  }

  private doChooseCardOpt(i: number): void {
    // 选项文本与卡 id 要在 choose 前取(落定后 getChoiceCard 可能已变):题签封「——所选」、结算配音用
    const cardId = this.game.getChoiceCard()?.id ?? '';
    const optText = this.game.getChoiceCard()?.options[i]?.t ?? '';
    const r = this.game.chooseCardOption(i);
    if (!r) {
      this.thaw('这一抉择眼下走不通（状态已变）。');
      return;
    }
    // 抉择落定 = 引擎消耗一轮(chooseCardOption 走 _advanceRound,见 advanceRound 注释):
    // 轮次在这里推进,后面的「经营 · 第 N 轮」才与引擎的轮次对得上,
    // 存档里的经营轮次也不再偏低(出牌那一刻引擎并没有消耗轮次)。
    // 例外:forcedEnding(致死)那条路引擎在 _advanceRound 之前就收束了,那一轮没消耗
    if (!r.forcedEnding) this.advanceRound();
    // 抉择卡结算配音:choice_<id>_o<N>(2026-10-17 合并口径);先掐正文朗读再切结果
    this.speakResult(cardId ? `choice_${cardId}_o${i + 1}` : null);
    // 抉择落定:结果续进抉择小节正文,题签封「——所选 +属性胶囊」,不新开小节、不弹浮层
    const host = this.choiceHost;
    // 底部选项区不动:其余卡在出牌时已翻背面,选中的留到下回合发牌前(2026-10-16 拍板)
    if (!host) {
      this.routeAfterCard(r);
      return;
    }
    // 先摘走停靠带(含「且搁置」),结果续进抉择小节正文(2026-10-16 内联化)
    this.clearDock();
    // 剧情与结果之间一道金线分层
    host.body.append(el('div', 'rule'));
    if (r.risk) this.diceTitle(host.body, this.game.riskTitle(r), !r.failed);
    host.body.append(this.prose(r.text));
    this.sealHead(host.head, host.body, optText, r.changes);
    this.choiceHost = null;
    this.dock().append(btn('继 续', {
      variant: 'primary',
      onClick: (e) => {
        (e.currentTarget as HTMLButtonElement).remove();
        this.routeAfterCard(r);
      },
    }));
    this.scrollMainBottom();
  }

  private doXushi(): void {
    // 点卡当下摘掉选卡提醒并作废其定时器
    this.opts.classList.remove('is-pickhint');
    this.pickHintToken += 1;
    // 出了牌就作废关键事件提示条(与 doPlayCard 同口径):提示条只对当前这一轮成立
    this.clearKeybar();
    const xcard = this.opts.querySelector<HTMLElement>('.card--action.t-xu');
    if (xcard?.classList.contains('is-flipped') || xcard?.classList.contains('is-chosen')) return;
    const r = this.game.playXushi();
    if (!r) {
      this.thaw('蓄势只在一个关键事件内生效一次。');
      return;
    }
    // 与行动卡同口径:其余卡翻背面,蓄势卡留到结算动画收尾才翻(2026-10-17 拍板)
    this.flipOpts(xcard ?? null);
    this.afterCardSettle(r, '蓄势 · 静观其变', xcard ?? null);
  }

  /**
   * 行动/蓄势牌的收尾(2026-10-17 拍板版,不再有「继 续」钮):
   * 出牌残影先飞进文本区,落定后新开「经营 · 第N轮——卡名」小节——
   * 题签渐入 → 正文逐行渐显 → 属性变化封进题签胶囊并逐条飞向右栏对应行
   * (右栏先翻到新值,行级高亮 + 数值弹出) → 选中的卡翻回背面 → 自动推进。
   * 轮数在此递增——只有真正做了经营动作,卷轴上才出现这一轮。
   * 读档恢复走 resume() 的 settle 分支直接 proceed,这套动画只在正常打牌路径播。
   */
  private afterCardSettle(r: CardResult, cardName: string, cardEl: HTMLElement | null = null): void {
    // 结算期间底部不再铺卡背占位:其余卡已在出牌时翻背面,选中的留正面到收尾才翻
    const token = (this.settleToken += 1);
    // 轮数在出牌成功时即刻递增,不等飞卡落定:存档/暂存以 roundNo 判定进度,
    // 残影窗口(560ms)里离场不能丢掉这一轮。
    // 计数点与引擎的轮次消耗点一一对应(见 advanceRound)
    const round = this.advanceRound();
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const begin = (): void => {
      if (token !== this.settleToken) return;
      const { body, head } = this.pushSec(`经营 · 第 ${round} 轮——${cardName}`);
      // 题签渐入:飞卡落定后标题先浮出,正文再逐行来
      head?.classList.add('is-enter');
      // 险招优先亮骰点(对齐 Lua:卡名让位给 riskTitle),带摇骰动画
      if (r.risk) this.diceTitle(body, this.game.riskTitle(r), !r.failed);
      const items: HTMLElement[] = [this.prose(r.text)];
this.revealSegs(body, items, () => {
          if (token !== this.settleToken) return;
        // 文本落定:属性胶囊挂在正文下方(2026-10-19 拍板),
        // 飞字从胶囊起飞;落定徽标 → 即时变值的机制在 flyChanges 内部,不随锚点变
        this.sealHead(head, body, '', r.changes);
        this.scrollMainBottom();
        // 收尾:飞字落定后选中的卡翻回背面,翻面半程后自动推进到下一相位
        this.later(() => {
          if (token !== this.settleToken) return;
          const chosen = this.opts.querySelector<HTMLElement>('.card--action.is-chosen');
          if (chosen) this.flipCardToBack(chosen);
          this.later(() => {
            if (token !== this.settleToken) return;
            this.routeAfterCard(r);
          }, chosen && !reduce ? 560 : 0);
        }, r.changes.length > 0 && !reduce ? 2100 : 120);
      });
      this.scrollMainBottom();
    };
    // 有出牌残影时等它落定(560ms)再开结算小节,视觉上是「卡飞进卷轴、卷起一段新文书」
    if (cardEl && !reduce) {
      this.flyCardGhost(cardEl);
      this.later(begin, 560);
    } else {
      begin();
    }
  }

  /** 牌落定后的相位路由:强制结局 > 强制关键事件 > 引擎给的路由(默认回回合) */
  private routeAfterCard(r: CardResult): void {
    if (r.forcedEnding) this.route(this.game.proceed());
    else if (r.forcedKey) this.renderEvent();
    else this.route(r.route ?? { type: 'round' });
  }

  private doCancelChoice(): void {
    this.choiceHost = null;
    if (this.game.cancelChoice()) this.renderRound();
  }

  /**
   * 选项走不通时的解冻兜底(对齐 Lua thawOpts:不留静默锁死)
   *
   * 只把选项区清空是不够的:引擎拒绝一次操作后,界面上往往就再也没有任何可点的牌
   * (引擎仍停在 round 相位、手牌还在),玩家只能退出或回溯 —— 硬核难度即报废。
   * 所以这里按引擎的当前相位把界面重绘回去:在 round 就重发牌,在 event/choice
   * 就渲染对应界面,保证「引擎相位」与「界面相位」始终一致、玩家还有牌可点。
   * (重绘入口自身不会再触发 thaw,不成递归)
   */
  private thaw(msg: string): void {
    sfx.play('fail');
    // 提示语走 toast:重绘会把选项区整个换掉,写在选项区里的字会被立刻冲掉
    toast(this.stage, msg);
    const g = this.game;
    switch (g.phase) {
      case 'round':
        // 重发牌:引擎仍在回合相位,手牌还在 —— 界面按当前手牌重画一遍,
        // 玩家就还有牌可点(不再只剩一句「走不通」)
        this.renderRound();
        break;
      case 'event':
        // 重挂事件选项(不重推小节):引擎的选项表才是真相(可能有选项刚被锁掉/烧毁)
        if (g.getOptions().some((o) => o && !o.locked)) {
          this.renderEventOptsInline();
        } else {
          // 一个能点的都没有:按引擎的收束口离开本事件,
          // 否则玩家对着一页灰选项,又是死局
          this.route(g.abandonEvent());
        }
        break;
      case 'choice':
        // 重挂抉择选项:引擎的 getChoiceCard 才是真相(财富见底锁等)
        this.renderChoiceOpts();
        break;
      default:
        // 引擎不在可操作相位(章末事件/结算等):没有牌可重发,
        // 只把提示留在选项区,其余界面不动
        this.clearOpts();
        this.opts.append(lbl(msg, 'u-zhu thaw'));
        break;
    }
  }

  // ---------- 路由 ----------

  /**
   * 一局走到「引擎没给去向」时的收尾(末章没有下一章 → proceedSummary 返回 none)。
   * 这局其实已经通关,不能让它再以「未完成的一局」出现在「继续旅程」里:
   * 结局记录写跨局收藏,自动档/暂存按剧本清掉(与 renderEnding 的落地口径一致)。
   */
  private finishRun(): void {
    // 引擎没落定结局对象时 recordEnding 是空操作(它只认 game.ending)
    recordEnding(this.game);
    // 成就/词条也要落盘(2026-10-21 修):saveCollection 此前**全仓没有调用点**,
    // 中途退出的局里解锁的成就随页面一起蒸发,图鉴永远是空的
    this.persistCollection();
    clearAutos(this.scenKey);
    // 暂存同口径清掉:非 ending 相位下 pagehide 也会把这一局暂存下来,
    // 留着就等于把已通关的一局留在存档页里当进行中的进度
    const stash = listStashEntries(this.scenKey).sort((a, b) => b.idx - a.idx);
    for (const e of stash) removeStash(this.scenKey, e.idx);
  }

  /**
   * 把本局解锁的成就/词条写回跨局收藏(2026-10-21 加)。
   * 中途退出也要调:玩家半路离开时解锁的东西不该丢。
   */
  persistCollection(): void {
    try {
      saveCollection(this.game);
    } catch { /* 收藏写不进去不许砸对局 */ }
  }

  private route(n: Route | null | undefined): void {
    // 换相位就掐断上一段配音:否则第一章的旁白会跟着你念到第二章去。
    // 各个 render 会在自己渲染完后重新入队,所以这里停是安全的。
    voice.stop();
    // 换相位就作废挂起的推进(pendingAfterSettle):上一相位挂的 continuation
    // 再触发会把路由带偏(比如回溯之后仍去 correctionContinue,而引擎已不在修正相位)
    this.pendingAfterSettle = null;
    if (!n || n.type === 'none') {
      if (this.game.ending) {
        this.renderEnding();
        return;
      }
      // 引擎说「没有下一相位」(none)= 本剧本已走到尽头(末章之后没有下一章):
      // 这一局算通关,得先落库收尾,否则「继续旅程」还能把它当未完成的一局重载。
      // (n 为 null 只是「引擎没给去向」的防御分支,不当作通关处理)
      if (n) this.finishRun();
      // 无结局的局终(对齐 Lua game.lua:回主页):此时引擎停在 summary,
      // 渲染回合页会出现「牌可点但 playCard 一律 null」的软异常态
      if (this.onFinish) this.onFinish();
      else this.renderRound();
      return;
    }
    switch (n.type) {
      case 'round': {
        // 际遇判定:命中则引擎已切到 event 相位并回填 currentRandom
        if (this.game.maybeRandom()) this.renderEvent();
        else this.renderRound();
        break;
      }
      case 'event':
        this.renderEvent();
        break;
      case 'ending':
        this.renderEnding();
        break;
      case 'chapter':
        this.renderIntro();
        break;
      case 'summary':
        this.renderSummary(n.summary);
        break;
      case 'endEvent':
        this.renderEndEvent();
        break;
      case 'correction':
        this.renderCorrection(n.correction);
        break;
      default:
        this.renderRound();
        break;
    }
  }

  start(): void {
    this.game.start();
    this.renderIntro();
  }

  /**
   * 读档恢复(v2.2.0 轮次存档):引擎 importSave 已把状态摆回存档那一刻,
   * 这里按相位把页面渲染回同一位置;roundNo 随槽位元数据写回。
   * ui(v2.3.0)是存档时刮下的题签历史:先把它作为已收起的小节铺回卷轴,
   * 再渲染当前相位 —— 读档不该把玩家已经走过的经营轮次从卷轴上抹掉。
   * 旧版章首档(v1)经 importSave 落在 intro 相位,走 renderIntro,行为同旧。
   * settle 相位是「结算已出、待推进」,直接 proceed 到下一相位(结算回显不重播)。
   */
  resume(roundNo = 0, ui?: SecRec[]): void {
    this.roundNo = roundNo;
    const g = this.game;
    switch (g.phase) {
      case 'round':
        this.renderRound();
        break;
      case 'event':
        this.renderEvent();
        break;
      case 'choice':
        this.renderChoice();
        break;
      case 'summary':
        if (g.summaryView) { this.renderSummary(g.summaryView); break; }
        this.route(g.proceedSummary());
        break;
      case 'correction':
        this.renderCorrection(g.correction);
        break;
      case 'endEvent':
        this.renderEndEvent();
        break;
      case 'settle':
        this.route(g.proceed());
        break;
      case 'ending':
        // 结局相位:直接渲染结局界面(与 renderEnding 同一入口)。
        // 少了这一支就会落到 default → renderIntro,而引擎仍停在 ending 相位,
        // 之后任何 playCard 都返回 null(读档读到一个点不动的死局)
        this.renderEnding();
        break;
      default:
        this.renderIntro();
        break;
    }
    // 题签历史在相位渲染之后铺:章首/结算会整页重建,先渲染再插到 live 小节之前,
    // 才不会被 clearMain 抹掉
    this.restoreHistory(ui);
  }

  /**
   * 右栏此刻还有没有属性等着落定(2026-10-21 修,§3.5)。
   *
   * 外壳(main.ts)在 renderTop 之后会整块重画右栏。飞字落定前这段时间里
   * 整块重画会把「旧值保持到落定」冲成新值,applySideDelta 的守卫就永远命中,
   * 飞字补间不执行、待定轴也清不掉。外壳据此在待定期间跳过整块重画。
   */
  hasSidePending(): boolean {
    return Object.keys(this.sideHold).length > 0;
  }

  /**
   * 右栏内容:雷达(自身五维) + 条形(身外六维) + 页脚(偏离/年龄)。
   * 对应参考图右栏的属性卷轴布局。
   *
   * 待落定的属性取旧值(sideHold):飞字落地前右栏不提前露新值。
   */
  sideContent(): Element[] {
    const g = this.game;
    const nodes: Element[] = [lbl('属 性', 'side__title u-kai'), renderRadar(g, this.sideHold)];
    for (const k of SHOWN_ATTRS) {
      const v = this.sideHold[k] ?? g.attrs[k] ?? 0;
      const shown = g.diff.hideAttrs ? g.attrWord(k) : String(v);
      const row = kv(this.data.ATTR_NAMES[k], shown);
      row.dataset.attr = k;
      row.append(meter((v / g.attrMax(k)) * 100));
      nodes.push(row);
    }
    // 页脚:偏离(段位) · 年岁
    const band = this.data.DEV_BANDS[g.devBand()];
    const foot = el('div', 'side__foot');
    const ageTxt = g.age != null ? ` · ${g.age} 岁` : '';
    foot.append(
      el('span', 'u-zhu u-strong', `偏离 ${g.dev}`),
      lbl(`(${band ? band.name : '—'})${ageTxt}`),
    );
    nodes.push(foot);
    return nodes;
  }
}

/** 修正浮层的 continuation 在 Game 声明里已含 endEvent/correction 分支,此处无需再扩展 */
