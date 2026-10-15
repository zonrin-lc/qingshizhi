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
import { btn, card, clear, divider, el, kv, lbl, meter, seal } from '../ui/kit';
import { renderRadar } from '../ui/radar';
import { castOf, renderCast, bigPortrait } from '../ui/cast';
import { voice } from './voice';
import { bgm } from './audio';
import { clearAuto, saveAuto } from './saves';
import { saveCollection } from './collection';

/** 右栏要显示的属性(Lua 版「身外」那一组) */
const SHOWN_ATTRS: AttrKey[] = ['caifu', 'shengwang', 'quanshi', 'zhengji', 'junxin', 'weiji'];

// 行动卡类型角标（进取/守成/兑换/保身/抉择）：type 字段由 prot/game-data.js ACTIONS 提供；治病卡无 type 不渲染
const ACTION_TYPE_BADGE: Record<string, string> = { 进取: 't-jin', 守成: 't-shou', 兑换: 't-dui', 保身: 't-bao', 抉择: 't-jue' };

/** 险招的门槛缺口 */
type Risk = { rate: number; unmet: { name: string; need: number; have: number }[] };

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
  private readonly onFinish: (() => void) | null;
  /** 剧本 key(写自动档用);与选择页轻量表的 key 一致 */
  private readonly scenKey: string;
  /** 本已经营轮数:回合小节题签用「经营 · 第 N 轮」,不复用章名(否则与章首小节重名) */
  private roundNo = 0;
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
    this.onFinish = onFinish ?? null;
    this.scenKey = opts?.scenKey ?? game.d.SCENARIO.id;
    this.backBtn = btn('回溯', { variant: 'ghost', cls: 'backbtn', onClick: () => this.doBacktrack() });
    mounts.bar.append(this.backBtn);
    // 有人说话时把 BGM 压下去,说完恢复。暂停更省事但听起来像断片。
    voice.onSpeakingChange = (speaking) => bgm.duck(speaking);

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
    this.backBtn.remove();
    this.main.removeEventListener('pointerdown', this.onSkipPointer);
    if (voice.onSpeakingChange) voice.onSpeakingChange = null;
    bgm.duck(false);
  }

  /** 当前剧本与章 id,配音切片路径靠它推导 */
  private voiceCtx(): { s: string; c: string } | null {
    const s = this.game.d.SCENARIO.id;
    const ch = this.game.chapter();
    return s && ch ? { s, c: ch.id } : null;
  }

  /**
   * 顺序播一段配音。切片名 <base><suffix><N>,N 从 1 起。
   * 找不到切片就什么都不做 —— 试点只做了李斯 c1,其余章节无声是预期行为。
   */
  private speakSeq(base: string, count: number, suffix = ''): void {
    const ctx = this.voiceCtx();
    if (!ctx || !voice.enabled) return;
    const names: string[] = [];
    for (let i = 1; i <= count; i += 1) names.push(`${base}${suffix}${i}`);
    if (!names.length) return;
    voice.enqueue(ctx.s, ctx.c, names[0] as string, names.slice(1));
  }

  private speakOne(clip: string): void {
    const ctx = this.voiceCtx();
    if (!ctx || !voice.enabled) return;
    voice.enqueue(ctx.s, ctx.c, clip);
  }

  /**
   * 换页面皮肤:背景图 + 卷轴底板 + 装饰枝叶。
   *
   * 对局各相位共用整幅剧情卷轴;章末结算与结局页改用「窄幅悬挂卷轴」,
   * 居中独立成页(参考图里它们本来就是另一套版式,不是同一页换个内容)。
   */
  private skin(bg: 'game' | 'summary' | 'ending', deco: 'game' | 'summary' | 'ending'): void {
    this.stage.setAttribute('data-bg', bg);
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

    // 回溯:常驻但不可用时压暗(对齐 Lua shell.lua:113-115)
    const can = g.canBacktrack();
    const quota = g.diff.backtrack;
    const left2 = quota > 0 ? Math.max(0, quota - g.backtracksThisChapter) : null;
    this.backBtn.textContent = left2 === null ? '回溯' : `回溯 ${left2}`;
    this.backBtn.classList.toggle('is-locked', !can);
    if (can) this.backBtn.removeAttribute('aria-disabled');
    else this.backBtn.setAttribute('aria-disabled', 'true');
  }

  /**
   * 回溯:回到本章开头。对齐 Lua game.lua 的 renderIntro(true)——
   * 除渲染章首外,还要明说「偏离度与已解锁成就不重置」,否则玩家会误以为能刷成就。
   */
  private doBacktrack(): void {
    const g = this.game;
    if (!g.canBacktrack()) return;
    const quota = g.diff.backtrack;
    const left = quota > 0 ? Math.max(0, quota - g.backtracksThisChapter) : null;
    this.showConfirm(
      '回溯 ｜ 回到本章开头',
      [
        left === null
          ? '本章可无限次回溯,但每回溯一次,本章收益便削减一分。'
          : `本章还剩 ${left} 次回溯机会。`,
        '偏离度与已解锁的成就、声望、图鉴都不会重置——史书会记得。',
      ],
      '回 溯',
      () => {
        if (g.backtrack()) this.renderIntro(true);
      },
    );
  }

  /** 通用确认框(Lua Shell.confirm 的 DOM 版) */
  private showConfirm(title: string, lines: string[], okText: string, onOk: () => void): void {
    clear(this.overlay);
    this.overlay.className = 'overlay overlay--confirm';
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

  /** 把带 ⟦词条⟧ 的文本渲染成节点;词条可点,点开看释义 */
  private prose(text: string, cls = 'prose'): HTMLElement {
    const p = el('p', cls);
    for (const run of parseRuns(text)) {
      if (!run.gloss) {
        p.append(document.createTextNode(run.text));
      } else {
        const term = run.gloss;
        const node = el('button', 'gloss', run.text);
        node.type = 'button';
        node.title = this.data.GLOSSARY[term] ?? '词条';
        node.addEventListener('click', () => this.showGloss(term));
        p.append(node);
      }
    }
    return p;
  }

  private showGloss(term: string): void {
    const entry = this.data.GLOSSARY[term];
    if (!entry) return;
    const isNew = !this.game.gloss.includes(term);
    // 新词条立刻落跨局收藏(对齐 Lua game.lua showGloss):收藏是跨局的,
    // 只在结局写回会让中途退出的玩家丢掉本局新收录的词条
    if (isNew) {
      this.game.gloss.push(term);
      saveCollection(this.game);
    }
    this.showSettle(`词条 ｜ ${term}${isNew ? '（新收录）' : ''}`, null, [], entry);
  }

  private clearMain(): void {
    // 换页前必须先把正在进行的渐显收掉,否则它的定时器会往新页里
    // 继续塞上一章的段落
    this.skipReveal();
    clear(this.main);
    this.storyEl = null;
  }
  private clearOpts(): void {
    clear(this.opts);
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

  private revealing: { box: HTMLElement; items: HTMLElement[]; i: number; timer: number; done?: () => void } | null = null;

  /**
   * 立刻显示所有剩余段落并收尾。玩家点一下屏幕就该是这个反应,
   * 否则一段段等 0.65 秒很折磨。对齐 Lua Shell.cancelReveal / TapReveal。
   */
  skipReveal(): void {
    const rv = this.revealing;
    if (!rv) return;
    this.revealing = null;
    clearInterval(rv.timer);
    // i 的含义是「下一个要追加的下标」,所以先追加再前进。
    // 顺序反了会每隔一段漏掉一条,而且循环末尾还会 append(undefined),
    // 那个 undefined 会被当成文本节点直接插进正文里。
    while (rv.i < rv.items.length) {
      const it = rv.items[rv.i] as HTMLElement;
      rv.box.append(it);
      rv.i += 1;
    }
    rv.done?.();
  }

  /** 渐显进行中 */
  get isRevealing(): boolean {
    return this.revealing !== null;
  }

  /**
   * 逐段浮现。段落先放第一段,其余按间隔追加,最后调 done。
   * done 里才挂选项/继续按钮 —— 所以在渐显结束前点不到那些按钮,
   * 这跟 Lua 版一致,也顺带防止玩家在没读完时就做了选择。
   *
   * box 是段落容器(prose-body),不是 main:main 只允许挂 castbox/prose-body,
   * 往 main 里直接塞段落会破坏版式不变量(chain 测试盯着这条)。
   */
  private revealSegs(box: HTMLElement, items: HTMLElement[], done?: () => void): void {
    this.skipReveal();
    if (!items.length) { done?.(); return; }
    // 系统开了「减少动态效果」就别演了,直接全给出来
    if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) {
      for (const it of items) box.append(it);
      done?.();
      return;
    }
    // i = 下一个要追加的下标。items[0] 当场出,定时器接着补后面的。
    const rv: NonNullable<Session['revealing']> = { box, items, i: 1, timer: 0, done };
    this.revealing = rv;
    box.append(items[0] as HTMLElement);
    this.scrollMainBottom();
    rv.timer = window.setInterval(() => {
      if (this.revealing !== rv) return; // 已被取消/换页
      if (rv.i >= rv.items.length) {
        this.revealing = null;
        clearInterval(rv.timer);
        rv.done?.();
        return;
      }
      box.append(rv.items[rv.i] as HTMLElement);
      rv.i += 1;
      this.scrollMainBottom();
    }, Session.segInterval);
  }

  /** 渐显到新段落时把正文卷到可见处,否则长段落会追加到视口外看不见 */
  private scrollMainBottom(): void {
    const box = this.main;
    if (box.scrollHeight <= box.clientHeight) return;
    box.scrollTop = box.scrollHeight;
  }

  /**
   * 出场立绘:大立绘 + 圆像排。
   *
   * 大立绘展示「当前在场」的角色:⟦NPC⟧ 标记推出、且有大立绘的第一个;
   * 无出场角色时展示主角(2026-10-14 用户拍板:出现这个人物就展示他的立绘)。
   * 圆像排第一个是主角、其后是出场角色;点圆像切换大立绘焦点,
   * 点大立绘开当前焦点角色的词条。没有大立绘的角色(liubang/jibu)
   * 只有圆像,点了直接开词条。
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
      // 点像开焦点角色的词条(无论主角还是 NPC,同口径)
      img.style.cursor = 'pointer';
      img.addEventListener('click', () => this.showGloss(focus));
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
    const row = renderCast([lead, ...others], focus, setFocus, (n) => this.showGloss(n));
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
    this.clearOpts();
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

  /** 推一个新小节:旧小节全部收起只留题签(可点开重读),新小节展开排在最后 */
  private pushSec(title?: string): { sec: HTMLElement; body: HTMLElement; head: HTMLElement | null } {
    const story = this.storyEl ?? this.ensureStory([]);
    for (const s of story.querySelectorAll('.sec')) {
      s.classList.add('is-collapsed');
      // 收起即失效:旧小节里的一次性「继 续」若留着,重开旧节点击会误触当前相位的 proceed
      for (const b of s.querySelectorAll('.btn--primary')) b.remove();
    }
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
    // 新小节追加后滚到可视区:小节题签在尾部,不滚的话新内容出现在视口外,
    // 玩家只看到一片旧空白(2026-10-14 截图反馈)。等一帧让浏览器先排完版再量。
    requestAnimationFrame(() => this.scrollMainBottom());
    return { sec, body, head };
  }

  /** 结算的属性增减列表(showSettle 浮层与内联结算共用);行带 data-attr 供飞行动画定位 */
  private chgList(changes: ChangeView[]): HTMLElement | null {
    if (changes.length === 0) return null;
    const list = el('div', 'chglist');
    for (const c of changes) {
      const up = c.delta > 0;
      const name = c.label || this.data.ATTR_NAMES[c.k];
      const shown = this.game.diff.hideAttrs ? this.game.attrWord(c.k) : `${up ? '+' : ''}${c.delta}`;
      const row = el('div', 'chgrow');
      row.dataset.attr = c.k;
      row.append(el('span', 'chgrow__k', name), el('span', `chgrow__v ${up ? 'is-up' : 'is-down'}`, shown));
      if (c.note) row.append(el('span', 'chgrow__note u-dim', c.note));
      list.append(row);
    }
    return list;
  }

  /** 题签内联的属性胶囊:容器是 span(head 为 button,只容 phrasing content);
   * 每枚仍叫 .chgrow[data-attr],flyChanges 的高亮/飞字钩子原样生效 */
  private chgTags(changes: ChangeView[]): HTMLElement | null {
    if (changes.length === 0) return null;
    const wrap = el('span', 'chglist chglist--tags');
    for (const c of changes) {
      const up = c.delta > 0;
      const name = c.label || this.data.ATTR_NAMES[c.k];
      const shown = this.game.diff.hideAttrs ? this.game.attrWord(c.k) : `${up ? '+' : ''}${c.delta}`;
      const tag = el('span', 'chgrow');
      tag.dataset.attr = c.k;
      tag.append(el('span', 'chgrow__k', name), el('span', `chgrow__v ${up ? 'is-up' : 'is-down'}`, shown));
      if (c.note) tag.title = c.note;
      wrap.append(tag);
    }
    return wrap;
  }

  /** 落定后封题签:追加「——所选」小字与属性胶囊;胶囊同时做飞字锚点 */
  private sealHead(head: HTMLElement | null, suffix: string, changes: ChangeView[]): void {
    if (!head) return;
    if (suffix) head.append(el('span', 'sec__result u-dim', `——${suffix}`));
    const tags = this.chgTags(changes);
    if (tags) {
      head.append(tags);
      this.flyChanges(tags);
    }
  }

  /** 属性变化动效:结算行高亮 + 浮字飞到右栏对应属性条;reduced-motion 只高亮不飞 */
  private flyChanges(list: HTMLElement): void {
    requestAnimationFrame(() => {
      const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
      for (const row of list.querySelectorAll<HTMLElement>('.chgrow')) {
        row.classList.add('is-flash');
        const k = row.dataset.attr ?? '';
        const hit = this.stage.querySelector<HTMLElement>(`.stage__side [data-attr="${k}"]`)
          ?? this.stage.querySelector<HTMLElement>('.stage__side .radar');
        if (!hit) continue;
        const trow = (hit.closest('.kv') as HTMLElement | null) ?? hit;
        trow.classList.add('is-flash');
        window.setTimeout(() => trow.classList.remove('is-flash'), 1200);
        if (reduced) continue;
        const from = row.getBoundingClientRect();
        const to = trow.getBoundingClientRect();
        const vEl = row.querySelector('.chgrow__v');
        const ghost = el('span', `flychg ${vEl?.classList.contains('is-down') ? 'is-down' : 'is-up'}`,
          `${row.querySelector('.chgrow__k')?.textContent ?? ''} ${vEl?.textContent ?? ''}`);
        ghost.style.left = `${from.left + from.width / 2}px`;
        ghost.style.top = `${from.top + from.height / 2}px`;
        document.body.append(ghost);
        const dx = to.left + to.width / 2 - (from.left + from.width / 2);
        const dy = to.top + to.height / 2 - (from.top + from.height / 2);
        const anim = ghost.animate(
          [{ transform: 'translate(-50%,-50%) scale(1)', opacity: 0.95 },
           { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(.7)`, opacity: 0.15 }],
          { duration: 720, easing: 'cubic-bezier(.25,.7,.3,1)' });
        anim.onfinish = () => ghost.remove();
      }
    });
  }

  // ---------- 结算浮层 ----------

  private showSettle(title: string, text: string | null, changes: ChangeView[], body?: string): void {
    clear(this.overlay);
    this.overlay.className = 'overlay overlay--settle';
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
    this.overlay.hidden = true;
    clear(this.overlay);
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

    // 章首即写自动档(对齐 Lua game.lua renderIntro → S.saveGame):
    // 玩家中途关页面/切后台被杀,自动档也停在当前章首,而不是上一次退出时的旧章。
    // 硬核 / noSave 剧本的 exportSave 返回 null,saveAuto 安静跳过,不报错。
    saveAuto(this.game, this.scenKey, this.data.SCENARIO.name);

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
    for (const n of this.game.introNotes) items.push(lbl(n, 'intro-note u-qing'));
    // 回溯回来要说清代价,否则玩家会以为回溯能刷成就(GDD 6.4)
    if (fromBacktrack) {
      items.push(lbl('【回溯】你回到了本章开头。偏离度与已解锁的成就、声望、图鉴都不会重置——史书会记得。', 'intro-note u-warn'));
    }
    // 回溯也要配音:但重念一遍 intro 很吵,只在正常进入时念。
    // base 要带上结尾下划线 —— 切片名是 intro_1,不是 intro1
    if (!fromBacktrack) this.speakSeq('intro_', (ch.intro ?? []).length);
    this.revealSegs(body, items, () => {
      this.opts.append(btn('继 续', { variant: 'primary', onClick: () => this.route(this.game.beginEvents()) }));
    });
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
    // 回合相位的卷轴只挂关键事件提示条——无题签小节,收起即隐,不再凭空多出第 1 轮
    const { body } = this.pushSec();

    // 关键事件不占底部选项位(2026-10-14 用户拍板):改为文本区底部的提示条,
    // 可开启时是醒目的可点提示,不可开启时是倒计时说明。
    const keyIdx = offer.findIndex((e) => e.type === 'key');
    const key = keyIdx >= 0 ? offer[keyIdx] : null;
    if (key && key.type === 'key') {
      const p = el(
        'div',
        `prompt prompt--key${key.enterable ? ' is-live' : ''}`,
        key.enterable
          ? `关键事件「${key.title}」已至——点此了断本章`
          : `关键事件「${key.title}」余 ${key.roundsLeft ?? 0} 轮后自动开启`,
      );
      if (key.enterable) {
        p.setAttribute('role', 'button');
        p.tabIndex = 0;
        p.dataset.offerIdx = String(keyIdx);
        const fire = (): void => this.doPlayCard(keyIdx);
        p.addEventListener('click', fire);
        p.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fire(); }
        });
      }
      body.append(p);
    }

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
      // 行动卡类型皮肤（进取/守成/兑换/保身/抉择）：数据驱动 prot ACTIONS[].type，
      // 治病卡无 type 走默认纸面+边框，不挂角签
      const typeCls = a?.type ? ACTION_TYPE_BADGE[a.type] : undefined;
      const c = card({ cls: `card--action${typeCls ? ` ${typeCls}` : ''}`, locked: e.locked, onClick: () => this.doPlayCard(i) });
      c.dataset.offerIdx = String(i);
      if (a?.type && typeCls) c.append(el('span', `card__badge ${typeCls}`, a.type));
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
    this.scrollMainBottom();
  }

  private riskText(risky: Risk): string {
    const eff = Math.min(70, risky.rate + (this.game.xushi ? 10 : 0));
    const gaps = risky.unmet.map((u) => (this.game.diff.hideAttrs ? `${u.name}不足` : `${u.name} ${u.have}/${u.need}`)).join('、');
    const rate = this.game.diff.hideAttrs ? '成算' : '成功率';
    return `⚠ 险招 · ${rate} ${eff}%（${gaps}）`;
  }

  // ---------- 事件 ----------

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
    this.ensureStory(ev.segs ?? []);
    // 题签即分类:际遇不带选项名(结果直接续正文),关键事件落定后由 sealHead 补「——所选」
    const host = this.pushSec(inserted ? `际遇 · 随机事件——${ev.title}` : `关键事件 · ${ev.title}`);
    this.evtHost = host;
    const { body } = host;
    // 配音切片名:事件内用 <事件id>_s<N>;随机事件走 rand/<id>_s<N>
    // 随机事件试点没做配音,查不到就是静默,不影响游玩
    if (inserted) this.speakSeq(`rand/${g.eventId}`, (ev.segs ?? []).length, '_s');
    else this.speakSeq(ev.id, (ev.segs ?? []).length, '_s');
    // 选项等渐显结束再挂:没读完就做选择不是我们要的
    const items = (ev.segs ?? []).map((seg) => this.prose(seg));
    // 偶遇/随机事件(含危机插入):选项与结算都内联在文本区,不占底部决策区、不弹浮层
    // (2026-10-14 用户拍板);非插入的关键事件维持 foot 选项 + 浮层结算
    if (inserted) {
      this.inlineEvtBody = body;
      this.revealSegs(body, items, () => this.renderEventOptsInline(body));
    } else {
      this.inlineEvtBody = null;
      this.revealSegs(body, items, () => this.renderOptions());
    }
  }

  renderOptions(): void {
    this.clearOpts();
    const opts = this.game.getOptions();
    for (let i = 0; i < opts.length; i += 1) {
      const o = opts[i];
      if (!o) continue;
      const body = el('div', 'card__body');
      body.append(lbl(o.opt.t, 'card__title u-kai'));
      if (o.hist) body.append(lbl('〔史〕', 'card__tag u-qing'));
      if (o.locked && o.reason) body.append(lbl(`🔒 ${o.reason}`, 'card__lock u-zhu'));
      if (o.risky) body.append(lbl(this.riskText(o.risky), 'card__risk u-warn'));
      const c = card({
        cls: `card--opt${o.locked ? '' : ' card--tappable'}`,
        locked: o.locked,
        onClick: () => this.doChoose(i),
      });
      c.append(body);
      this.opts.append(c);
    }
  }

  /** 偶遇/随机事件的选项:挂在事件小节正文里,等渐显完再挂 */
  private renderEventOptsInline(body: HTMLElement): void {
    this.clearOpts();
    const opts = this.game.getOptions();
    for (let i = 0; i < opts.length; i += 1) {
      const o = opts[i];
      if (!o) continue;
      const cardBody = el('div', 'card__body');
      cardBody.append(lbl(o.opt.t, 'card__title u-kai'));
      if (o.hist) cardBody.append(lbl('〔史〕', 'card__tag u-qing'));
      if (o.locked && o.reason) cardBody.append(lbl(`🔒 ${o.reason}`, 'card__lock u-zhu'));
      if (o.risky) cardBody.append(lbl(this.riskText(o.risky), 'card__risk u-warn'));
      const c = card({
        cls: `card--opt${o.locked ? '' : ' card--tappable'}`,
        locked: o.locked,
        onClick: () => this.doChoose(i),
      });
      c.append(cardBody);
      body.append(c);
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
    this.ensureStory(v.segs ?? []);
    const host = this.pushSec(`抉择 · ${v.title}`);
    this.choiceHost = host;
    const { body } = host;

    const items = (v.segs ?? []).map((seg) => this.prose(seg));
    this.revealSegs(body, items, () => {
      for (let i = 0; i < v.options.length; i += 1) {
        const o = v.options[i];
        if (!o) continue;
        const c = card({ cls: 'card--opt card--tappable', onClick: () => this.doChooseCardOpt(i) });
        const optBody = el('div', 'card__body');
        optBody.append(lbl(o.t, 'card__title u-kai'));
        c.append(optBody);
        this.opts.append(c);
      }
      const skip = card({ cls: 'card--action', onClick: () => this.doCancelChoice() });
      const skipBody = el('div', 'card__body');
      skipBody.append(lbl('且搁置', 'card__title u-dim'));
      skip.append(skipBody);
      this.opts.append(skip);
    });
  }

  // ---------- 章末结算 ----------

  renderSummary(summary: SummaryView): void {
    this.skin('summary', 'summary');
    this.renderTop();
    this.clearMain();
    this.clearOpts();

    const body = this.proseBody();
    this.main.append(body);


    body.append(lbl('章 末 结 算', 'u-dim chapter__sub'));
    body.append(lbl(`${this.shortTitle(summary.chapter)} 终`, 'chapter__title u-kai u-heavy'));
    body.append(el('div', 'rule'));
    body.append(lbl(`偏离归因 ｜ 当前偏离 ${summary.dev}（${summary.bandName}）`, 'u-warn u-strong'));

    if (summary.devLog.length === 0) {
      body.append(lbl('本章你循史而行，史官的笔尚跟得上你。', 'u-dim'));
    } else {
      for (const d of summary.devLog) {
        const row = el('div', 'devrow');
        row.append(lbl(`${d.ev} ｜ ${d.t}`, 'u-dim'), lbl(`偏离 +${d.dev}`, 'u-warn u-kai'));
        body.append(row);
      }
    }
    for (const n of summary.notes) body.append(lbl(n, 'intro-note u-qing'));
    if (summary.corrTitle) body.append(lbl(`历史修正 ｜ ${summary.corrTitle}`, 'intro-note u-qing'));

    body.append(divider('本 章 境 遇'));
    // 参考图底部是一排四格统计(横排 + 竖分隔),不是纵向 kv 列表。
    const deltas = this.data.ATTRS.filter((a) => summary.attrDelta[a.k]);
    if (deltas.length === 0) {
      body.append(lbl('诸维如止水，无增无减。', 'u-dim'));
    } else {
      const strip = el('div', 'statrow');
      for (const a of deltas) {
        const d = summary.attrDelta[a.k] ?? 0;
        const good = a.inverse ? d < 0 : d > 0;
        const cell = el('div', 'statrow__cell');
        cell.append(
          lbl(a.n, 'statrow__k'),
          el('span', `statrow__v ${good ? 'is-up' : 'is-down'}`,
            this.game.diff.hideAttrs ? (d > 0 ? '升' : '降') : `${d > 0 ? '+' : ''}${d}`),
        );
        strip.append(cell);
      }
      body.append(strip);
    }

    this.opts.append(
      btn(summary.nextTitle ? '进 入 下 一 章' : '继 续', {
        variant: 'primary',
        onClick: () => this.route(this.game.proceedSummary()),
      }),
    );
  }

  // ---------- 结局 ----------

  renderEnding(): void {
    this.skin('ending', 'ending');
    this.renderTop();
    this.clearMain();
    this.clearOpts();
    const e = this.game.ending;
    const body = this.proseBody();
    this.main.append(body);
    if (!e) {
      body.append(lbl('局终。', 'u-dim'));
      return;
    }

    // 结局落地(对齐 Lua game.lua renderEnding):跨局收藏写回,并清掉自动档 ——
    // 已结束的局不该再从「继续旅程」里复活。在这里做而不是在退出时做,
    // 是因为玩家可能直接停在结局页关掉浏览器。
    saveCollection(this.game);
    clearAuto();

    body.append(lbl(`〔${e.seal} · ${e.diffName}〕`, 'u-zhu u-center chapter__sub'));
    body.append(lbl(e.name, 'chapter__title u-kai u-heavy u-center'));
    body.append(divider('评 分'));
    const names: Record<string, string> = { gongye: '功业', cuncun: '存续', shiping: '史评', yingxiang: '影响' };
    for (const k of ['gongye', 'cuncun', 'shiping', 'yingxiang'] as const) {
      const v = e.scores[k];
      const row = el('div', 'score');
      row.append(
        el('span', 'score__k u-dim', names[k] ?? k),
        meter(v, 'var(--gold)'),
        el('span', 'score__v u-kai', String(v)),
      );
      body.append(row);
    }
    const total = el('div', 'score score--total');
    total.append(
      el('span', 'score__k u-strong', '总分'),
      el('span', 'score__v score__v--big u-kai u-strong', String(e.total)),
      seal(e.grade, 'seal--big'),
    );
    body.append(total);
    if (e.zhuan) body.append(lbl(e.zhuan, 'prose u-qing'));
    if (e.epilogue) body.append(this.prose(e.epilogue, 'prose u-qing'));

    this.opts.append(btn('返 回 主 页', { variant: 'primary', onClick: () => this.onFinish?.() }));
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
    this.ensureStory(ev.segs ?? []);
    const { body } = this.pushSec(ev.title);
    body.append(el('div', 'rule'));

    // 选项卡不再走底部决策区、结算不再弹浮层:全部内联在文本区里,
    // 且等剧情渐显完再挂,免得没读完就点了
    const items = (ev.segs ?? []).map((seg) => this.prose(seg));
    this.revealSegs(body, items, () => {
      for (let i = 0; i < ev.options.length; i += 1) {
        const o = ev.options[i];
        if (!o) continue;
        const gate = this.reqCheck(o.req);
        const cardBody = el('div', 'card__body');
        cardBody.append(lbl(o.t, 'card__title u-kai'));
        if (!gate.ok) cardBody.append(el('div', 'card__lock u-zhu', `🔒 ${gate.reason ?? ''}`));
        const c = card({
          cls: `card--opt${gate.ok ? ' card--tappable' : ''}`,
          locked: !gate.ok,
          onClick: () => this.doEndEventChoose(i),
        });
        c.append(cardBody);
        body.append(c);
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
    body.append(btn('继 续', {
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
    this.pendingAfterSettle = () => this.route(this.game.correctionContinue());
  }

  // ---------- 动作 ----------

  private doPlayCard(i: number): void {
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
    if (r.kind === 'choice') {
      this.renderChoice();
      return;
    }
    // xushi 不走这里(走 doXushi)
    this.afterCardSettle(r, cardName);
  }

  private doChoose(i: number): void {
    // 选项文本要在 choose 前取(落定后 getOptions 可能已变),关键事件题签要封「——所选」
    const optText = this.game.getOptions()[i]?.opt.t ?? '';
    const r = this.game.choose(i);
    if (!r) {
      this.thaw('这个选项眼下走不通（已试过或条件已变）。');
      return;
    }
    // 选项结果配音:选了第 i 个(0 起)就播 <事件id>_o<i+1>
    if (this.game.eventId && !r.forcedEnding) this.speakOne(`${this.game.eventId}_o${i + 1}`);
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
    this.clearOpts();
    const appendResult = (): void => {
      // 剧情与结果之间一道金线分层(2026-10-14 拍板)
      host.body.append(el('div', 'rule'));
      if (title) host.body.append(lbl(title, 'u-warn u-strong'));
      host.body.append(this.prose(r.text));
      if (r.achNew) host.body.append(lbl(r.achNew, 'intro-note u-gold'));
    };
    if (r.failed && !r.forcedEnding) {
      // 失败且未致命:结果与增减先写正文(题签不封,重选落定后才封),选项重挂回底部
      appendResult();
      const list = this.chgList(r.changes);
      if (list) {
        host.body.append(list);
        this.flyChanges(list);
      }
      this.renderOptions();
      this.scrollMainBottom();
      return;
    }
    appendResult();
    this.sealHead(host.head, optText, r.changes);
    this.evtHost = null;
    host.body.append(btn('继 续', {
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
   * 属性增减以胶囊封进题签;险招失败可原地重选(失败回显暂写正文,落定才封题签) */
  private doChooseInline(r: CardResult, evtBody: HTMLElement, title: string): void {
    for (const c of Array.from(evtBody.querySelectorAll('.card--opt'))) c.remove();
    const appendResult = (host: HTMLElement): void => {
      // 剧情与结果之间一道金线分层
      host.append(el('div', 'rule'));
      if (title) host.append(lbl(title, 'u-warn u-strong'));
      host.append(this.prose(r.text));
      if (r.achNew) host.append(lbl(r.achNew, 'intro-note u-gold'));
    };
    if (r.failed && !r.forcedEnding) {
      appendResult(evtBody);
      const list = this.chgList(r.changes);
      if (list) {
        evtBody.append(list);
        this.flyChanges(list);
      }
      this.renderEventOptsInline(evtBody);
      this.scrollMainBottom();
      return;
    }
    appendResult(evtBody);
    this.sealHead(this.evtHost?.head ?? null, '', r.changes);
    const contBtn = btn('继 续', {
      variant: 'primary',
      onClick: (e) => {
        (e.currentTarget as HTMLButtonElement).remove();
        this.route(this.game.proceed());
      },
    });
    evtBody.append(contBtn);
    this.inlineEvtBody = null;
    this.evtHost = null;
    this.scrollMainBottom();
  }

  private doChooseCardOpt(i: number): void {
    // 选项文本要在 choose 前取:题签封「——所选」用
    const optText = this.game.getChoiceCard()?.options[i]?.t ?? '';
    const r = this.game.chooseCardOption(i);
    if (!r) {
      this.thaw('这一抉择眼下走不通（状态已变）。');
      return;
    }
    // 抉择落定:结果续进抉择小节正文,题签封「——所选 +属性胶囊」,不新开小节、不弹浮层
    const host = this.choiceHost;
    this.clearOpts();
    if (!host) {
      this.routeAfterCard(r);
      return;
    }
    // 剧情与结果之间一道金线分层
    host.body.append(el('div', 'rule'));
    if (r.risk) host.body.append(lbl(this.game.riskTitle(r), 'u-warn u-strong'));
    host.body.append(this.prose(r.text));
    if (r.achNew) host.body.append(lbl(r.achNew, 'intro-note u-gold'));
    this.sealHead(host.head, optText, r.changes);
    this.choiceHost = null;
    host.body.append(btn('继 续', {
      variant: 'primary',
      onClick: (e) => {
        (e.currentTarget as HTMLButtonElement).remove();
        this.routeAfterCard(r);
      },
    }));
    this.scrollMainBottom();
  }

  private doXushi(): void {
    const r = this.game.playXushi();
    if (!r) {
      this.thaw('蓄势只在一个关键事件内生效一次。');
      return;
    }
    this.afterCardSettle(r, '蓄势 · 静观其变');
  }

  /** 行动/蓄势牌的收尾:新开「经营 · 第N轮——卡名」小节内联结算(2026-10-14 起不再弹浮层);
   * 轮数在此递增——只有真正做了经营动作,卷轴上才出现这一轮 */
  private afterCardSettle(r: CardResult, cardName: string): void {
    this.clearOpts();
    const { body, head } = this.pushSec(`经营 · 第 ${(this.roundNo += 1)} 轮——${cardName}`);
    // 险招优先亮骰点(对齐 Lua:卡名让位给 riskTitle)
    if (r.risk) body.append(lbl(this.game.riskTitle(r), 'u-warn u-strong'));
    body.append(this.prose(r.text));
    if (r.achNew) body.append(lbl(r.achNew, 'intro-note u-gold'));
    this.sealHead(head, '', r.changes);
    body.append(btn('继 续', {
      variant: 'primary',
      onClick: (e) => {
        (e.currentTarget as HTMLButtonElement).remove();
        this.routeAfterCard(r);
      },
    }));
    this.scrollMainBottom();
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

  /** 选项走不通时的解冻兜底(对齐 Lua thawOpts:不留静默锁死) */
  private thaw(msg: string): void {
    this.opts.append(lbl(msg, 'u-zhu thaw'));
  }

  // ---------- 路由 ----------

  private route(n: Route | null | undefined): void {
    // 换相位就掐断上一段配音:否则第一章的旁白会跟着你念到第二章去。
    // 各个 render 会在自己渲染完后重新入队,所以这里停是安全的。
    voice.stop();
    if (!n || n.type === 'none') {
      if (this.game.ending) this.renderEnding();
      // 无结局的局终(对齐 Lua game.lua:回主页):此时引擎停在 summary,
      // 渲染回合页会出现「牌可点但 playCard 一律 null」的软异常态
      else if (this.onFinish) this.onFinish();
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
   * 右栏内容:雷达(自身五维) + 条形(身外六维) + 页脚(偏离/年龄)。
   * 对应参考图右栏的属性卷轴布局。
   */
  sideContent(): Element[] {
    const nodes: Element[] = [lbl('属 性', 'side__title u-kai'), renderRadar(this.game)];
    for (const k of SHOWN_ATTRS) {
      const v = this.game.attrs[k] ?? 0;
      const shown = this.game.diff.hideAttrs ? this.game.attrWord(k) : String(v);
      const row = kv(this.data.ATTR_NAMES[k], shown);
      row.dataset.attr = k;
      row.append(meter((v / this.game.attrMax(k)) * 100));
      nodes.push(row);
    }
    // 页脚:偏离(段位) · 年岁
    const band = this.data.DEV_BANDS[this.game.devBand()];
    const foot = el('div', 'side__foot');
    const ageTxt = this.game.age != null ? ` · ${this.game.age} 岁` : '';
    foot.append(
      el('span', 'u-zhu u-strong', `偏离 ${this.game.dev}`),
      lbl(`(${band ? band.name : '—'})${ageTxt}`),
    );
    nodes.push(foot);
    return nodes;
  }
}

/** 修正浮层的 continuation 在 Game 声明里已含 endEvent/correction 分支,此处无需再扩展 */
