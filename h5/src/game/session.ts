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
import { castOf, renderCast } from '../ui/cast';
import { voice } from './voice';
import { bgm } from './audio';

/** 右栏要显示的属性(Lua 版「身外」那一组) */
const SHOWN_ATTRS: AttrKey[] = ['caifu', 'shengwang', 'quanshi', 'zhengji', 'junxin', 'weiji'];

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
  /** 上一次结算文案,回合页顶部回显(对齐 Lua 的 lastSettleText) */
  private lastSettleText: string | null = null;
  /** 浮层「继续」关闭后要接着推进的相位路由 */
  private pendingAfterSettle: (() => void) | null = null;
  private readonly onFinish: (() => void) | null;

  constructor(
    game: Game,
    mounts: { main: HTMLElement; opts: HTMLElement; chap: HTMLElement; band: HTMLElement; bar: HTMLElement; overlay: HTMLElement; stage: HTMLElement; deco: HTMLElement },
    onFinish?: () => void,
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
    this.backBtn = btn('回溯', { variant: 'ghost', cls: 'backbtn', onClick: () => this.doBacktrack() });
    mounts.bar.append(this.backBtn);
    // 有人说话时把 BGM 压下去,说完恢复。暂停更省事但听起来像断片。
    voice.onSpeakingChange = (speaking) => bgm.duck(speaking);
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

    const band = this.data.DEV_BANDS[g.devBand()];
    if (band) {
      this.bandEl.textContent = `${band.name}  偏离 ${g.dev}`;
      this.bandEl.className = 'stage__band';
      this.bandEl.style.color = band.color;
    }

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
    if (isNew) this.game.gloss.push(term);
    this.showSettle(`词条 ｜ ${term}${isNew ? '（新收录）' : ''}`, null, [], entry);
  }

  private clearMain(): void {
    clear(this.main);
  }
  private clearOpts(): void {
    clear(this.opts);
  }

  /**
   * 立绘。P3 只交付了李斯一张,其余剧本/章节走空态框——
   * 与用户确认过的取舍:不拿李斯顶替其他剧本,免得误导。
   */
  /**
   * 出场立绘排 + 主角像。
   *
   * 主角(剧本名里第一个字)用大图;同场出场的 NPC 由 ⟦词条⟧ 标记推出,
   * 出一排圆像。两者都点得开词条浮层。
   */
  private castBox(segs: readonly string[]): HTMLElement {
    const box = el('div', 'castbox');
    const lead = this.data.SCENARIO.name.split(/[·・]/)[0]?.trim() ?? this.data.SCENARIO.name;
    const names = castOf(segs).filter((n) => n !== lead);
    if (names.length > 0) {
      const row = renderCast(names, (n) => this.showGloss(n));
      if (row) box.append(row);
    }
    box.append(lbl(lead, 'portrait__name'));
    return box;
  }

  /** 叙事正文容器(与立绘并排) */
  private proseBody(): HTMLElement {
    return el('div', 'prose-body');
  }

  // ---------- 结算浮层 ----------

  private showSettle(title: string, text: string | null, changes: ChangeView[], body?: string): void {
    clear(this.overlay);
    this.overlay.className = 'overlay overlay--settle';
    const box = el('div', 'overlay__box panel-dialog--tall');
    if (title) box.append(lbl(title, 'overlay__title u-kai u-strong'));
    if (text) box.append(this.prose(text, 'prose overlay__text'));
    if (body) box.append(lbl(body, 'overlay__body'));

    if (changes.length > 0) {
      // 参考图里是「名称靠左 / 数值靠右」的两列行,涨跌分色:
      // 增益墨绿、损失赭红、偏离朱色。不能继续用居中的行内流。
      const list = el('div', 'chglist');
      for (const c of changes) {
        const up = c.delta > 0;
        const name = c.label || this.data.ATTR_NAMES[c.k];
        // 硬核模式只报状态词,不出数值(与 Lua hideAttrs 同口径)
        const shown = this.game.diff.hideAttrs
          ? this.game.attrWord(c.k)
          : `${up ? '+' : ''}${c.delta}`;
        const row = el('div', 'chgrow');
        row.append(
          el('span', 'chgrow__k', name),
          el('span', `chgrow__v ${up ? 'is-up' : 'is-down'}`, shown),
        );
        if (c.note) row.append(el('span', 'chgrow__note u-dim', c.note));
        list.append(row);
      }
      box.append(list);
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
    this.clearMain();
    this.clearOpts();
    const ch = this.game.chapter();
    if (!ch) return;
    this.lastSettleText = null;

    this.main.append(this.castBox(ch.intro ?? []));
    const body = this.proseBody();
    this.main.append(body);
    if (ch.sub) body.append(lbl(ch.sub, 'u-dim chapter__sub'));
    // 「第一章 ｜ 兰陵问道」取竖线后的主标题
    body.append(lbl(this.shortTitle(ch.title), 'chapter__title u-kai u-heavy'));
    body.append(el('div', 'rule'));
    for (const seg of ch.intro ?? []) body.append(this.prose(seg));
    for (const n of this.game.introNotes) body.append(lbl(n, 'intro-note u-qing'));
    // 回溯也要配音:但重念一遍 intro 很吵,只在正常进入时念。
    // base 要带上结尾下划线 —— 切片名是 intro_1,不是 intro1
    if (!fromBacktrack) this.speakSeq('intro_', (ch.intro ?? []).length);
    // 回溯回来要说清代价,否则玩家会以为回溯能刷成就(GDD 6.4)
    if (fromBacktrack) {
      body.append(lbl('【回溯】你回到了本章开头。偏离度与已解锁的成就、声望、图鉴都不会重置——史书会记得。', 'intro-note u-warn'));
    }

    this.opts.append(btn('继 续', { variant: 'primary', onClick: () => this.route(this.game.beginEvents()) }));
  }

  /** 「第一章 ｜ 兰陵问道」→「兰陵问道」;无竖线则原样返回 */
  private shortTitle(full: string): string {
    const parts = full.split('｜');
    return parts.length > 1 ? (parts[1] ?? full).trim() : full;
  }

  /** 「第一章 ｜ 兰陵问道」→「第一章」 */
  private chapterNo(full: string): string {
    const parts = full.split('｜');
    return parts.length > 1 ? (parts[0] ?? '').trim() : '';
  }

  // ---------- 回合 ----------

  renderRound(): void {
    this.skin('game', 'game');
    this.renderTop();
    this.clearMain();
    this.clearOpts();
    const g = this.game;
    const offer = g.getOffer();

    const ch = g.chapter();
    // 回合页也要立绘:否则剧情卷轴整块空着,右侧属性卷轴又满,
    // 视觉重心全偏在一半屏幕上(参考图的回合页同样有立绘与回显文案)。
    this.main.append(this.castBox([]));
    const body = this.proseBody();
    this.main.append(body);
    if (ch) body.append(lbl(ch.title, 'u-dim chapter__sub'));
    if (this.lastSettleText) {
      body.append(this.prose(this.lastSettleText, 'prose settle-recall u-dim'));
    }

    const key = offer.find((e) => e.type === 'key');
    if (key && key.type === 'key') {
      body.append(
        el(
          'div',
          'prompt',
          `经营以蓄势——关键事件「${key.title}」余 ${key.roundsLeft ?? 0} 轮后自动开启；届时抉择，须你亲定。`,
        ),
      );
    }

    for (let i = 0; i < offer.length; i += 1) {
      const e = offer[i];
      if (!e) continue;
      const body = el('div', 'card__body');
      if (e.type === 'key') {
        body.append(
          lbl(`${e.inserted ? '危机迫近' : '关键事件'} ｜ 余 ${e.roundsLeft ?? 0} 轮后开启`, 'card__kicker'),
          lbl(e.title ?? '', 'card__title u-kai u-strong'),
          lbl(e.inserted ? '〔！〕' : '〔关键〕', 'card__tag'),
        );
        if (e.enterable) body.append(lbl('此局已无可择之处——点此了断本章', 'card__hint u-warn'));
        const c = card({ cls: 'card--key', locked: !e.enterable, onClick: () => this.doPlayCard(i) });
        c.append(body);
        this.opts.append(c);
      } else {
        const a = e.action;
        body.append(lbl(`${a?.name ?? e.id ?? ''}${e.risky ? '  ⚠' : ''}`, 'card__title u-kai u-strong'));
        const desc = (g.diff.hideAttrs ? a?.descHidden : a?.desc) ?? '';
        if (desc) body.append(lbl(desc, 'card__desc u-dim'));
        if (e.risky) body.append(lbl(this.riskText(e.risky), 'card__risk u-warn'));
        if (e.locked && e.reason) body.append(lbl(`🔒 ${e.reason}`, 'card__lock u-zhu'));
        if (e.diminishing) body.append(lbl(`已用 ${e.usedCount ?? 0} 次 · 收益递减`, 'card__warn u-warn'));
        const c = card({ cls: 'card--action', locked: e.locked, onClick: () => this.doPlayCard(i) });
        c.append(body);
        this.opts.append(c);
      }
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
    const xcard = card({ cls: 'card--action', locked: g.xushi, onClick: () => this.doXushi() });
    xcard.append(xc);
    this.opts.append(xcard);
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
    this.clearMain();
    this.clearOpts();
    const g = this.game;
    const ev = g.eventId ? g.findEvent(g.eventId) : null;
    if (!ev) {
      this.main.append(lbl('此节无处可述（章节数据不一致）。', 'u-zhu'));
      return;
    }
const inserted = g.currentRandom != null;
    const ch = g.chapter();
    const kicker = inserted ? '际遇 · 随机事件' : this.chapterNo(ch?.title ?? '');
    this.main.append(this.castBox(ev.segs ?? []));
    const body = this.proseBody();
    this.main.append(body);
    if (kicker) body.append(lbl(kicker, 'u-dim chapter__sub'));
    body.append(lbl(ev.title, 'chapter__title u-kai u-heavy'));
    body.append(el('div', 'rule'));
    for (const seg of ev.segs ?? []) body.append(this.prose(seg));
    // 配音切片名:事件内用 <事件id>_s<N>;随机事件走 rand/<id>_s<N>
    // 随机事件试点没做配音,查不到就是静默,不影响游玩
    if (inserted) this.speakSeq(`rand/${g.eventId}`, (ev.segs ?? []).length, '_s');
    else this.speakSeq(ev.id, (ev.segs ?? []).length, '_s');
    this.renderOptions();
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

  // ---------- 抉择卡 ----------

  renderChoice(): void {
    this.skin('game', 'game');
    this.renderTop();
    this.clearMain();
    this.clearOpts();
    const v = this.game.getChoiceCard();
    if (!v || v.options.length === 0) {
      this.renderRound();
      return;
    }
    const body = this.proseBody();
    this.main.append(body);
    body.append(lbl('抉择 · 事有两端', 'u-gold chapter__sub'));
    body.append(lbl(v.title, 'chapter__title u-kai u-heavy'));
    body.append(el('div', 'rule'));
    for (const seg of v.segs ?? []) body.append(this.prose(seg));

    for (let i = 0; i < v.options.length; i += 1) {
      const o = v.options[i];
      if (!o) continue;
      const c = card({ cls: 'card--opt card--tappable', onClick: () => this.doChooseCardOpt(i) });
      c.append(el('div', 'card__body', o.t));
      this.opts.append(c);
    }
    const skip = card({ cls: 'card--action', onClick: () => this.doCancelChoice() });
    const skipBody = el('div', 'card__body');
    skipBody.append(lbl('且搁置', 'card__title u-dim'));
    skip.append(skipBody);
    this.opts.append(skip);
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
    this.clearMain();
    this.clearOpts();
    if (!ev) {
      this.route(this.game.proceedAfterEndEvent());
      return;
    }
    const body = this.proseBody();
    this.main.append(body);
    body.append(lbl(ev.title, 'chapter__title u-kai u-heavy'));
    body.append(el('div', 'rule'));
    for (const seg of ev.segs ?? []) body.append(this.prose(seg));

    for (let i = 0; i < ev.options.length; i += 1) {
      const o = ev.options[i];
      if (!o) continue;
      const gate = this.reqCheck(o.req);
      const cardBody = el('div', 'card__body', o.t);
      if (!gate.ok) cardBody.append(el('div', 'card__lock u-zhu', `🔒 ${gate.reason ?? ''}`));
      const c = card({
        cls: `card--opt${gate.ok ? ' card--tappable' : ''}`,
        locked: !gate.ok,
        onClick: () => this.doEndEventChoose(i),
      });
      c.append(cardBody);
      this.opts.append(c);
    }
  }

  private doEndEventChoose(i: number): void {
    const r = this.game.endEventChoose(i);
    if (!r) {
      this.thaw('这个选项眼下走不通（条件已变）。');
      return;
    }
    this.showSettle('', r.text, r.changes);
    this.pendingAfterSettle = () => this.route(this.game.proceedAfterEndEvent());
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
    this.afterCardSettle(r, r.kind === 'xushi' ? '蓄势' : '行动');
  }

  private doChoose(i: number): void {
    const r = this.game.choose(i);
    if (!r) {
      this.thaw('这个选项眼下走不通（已试过或条件已变）。');
      return;
    }
    // 选项结果配音:选了第 i 个(0 起)就播 <事件id>_o<i+1>
    if (this.game.eventId) this.speakOne(`${this.game.eventId}_o${i + 1}`);
    const title = r.bandUp && r.bandName ? `史书提示：偏离度已入「${r.bandName}」` : '';
    this.showSettle(title, r.text, r.changes, r.achNew ?? undefined);
    this.pendingAfterSettle = () => {
      if (r.failed) {
        // 失败且未致命:退回选项页重选(不推进相位)
        if (r.forcedEnding) this.route(this.game.proceed());
        else this.renderOptions();
        return;
      }
      this.route(this.game.proceed());
    };
  }

  private doChooseCardOpt(i: number): void {
    const r = this.game.chooseCardOption(i);
    if (!r) {
      this.thaw('这一抉择眼下走不通（状态已变）。');
      return;
    }
    this.afterCardSettle(r, '抉择');
  }

  private doXushi(): void {
    const r = this.game.playXushi();
    if (!r) {
      this.thaw('蓄势只在一个关键事件内生效一次。');
      return;
    }
    this.afterCardSettle(r, '蓄势');
  }

  /** 行动/抉择/蓄势三类牌共用的收尾:浮层 → 相位路由 */
  private afterCardSettle(r: CardResult, title: string): void {
    this.lastSettleText = r.text;
    this.showSettle(title, r.text, r.changes, r.achNew ?? undefined);
    this.pendingAfterSettle = () => {
      if (r.forcedEnding) this.route(this.game.proceed());
      else if (r.forcedKey) this.renderEvent();
      else this.route(r.route ?? { type: 'round' });
    };
  }

  private doCancelChoice(): void {
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
