/* js/ui-event.js —— 章首/事件/章末事件与抉择、路由（自 index.html 内联脚本原样搬移，行为零变化） */

  /* ---------- 章首叙事（一小节一页：整页一次渲染全部段落，底部一个「继续」进入回合） ---------- */
  function renderIntro(fromBt){
    ttsCancel();
    refreshTop(); clear(main); clear(optBox);
    saveGame();   // 每次进入章首叙事即存档（GDD 6.4；回溯恢复的章首同样覆写，语义一致）
    lastSettleText = null;
    var ch = game.chapter();
    main.appendChild(el('div','chapKicker', ch.sub || ''));
    main.appendChild(el('div','chapHead', ch.title.split('｜')[1] ? ch.title.split('｜')[1].trim() : ch.title));
    var cast0 = renderCast(ch.intro); if (cast0) main.appendChild(cast0);
    var items0 = ch.intro.map(function(s){ return { cls: 'seg', html: rich(s) }; });
    (game.introNotes||[]).forEach(function(n){ items0.push({ cls: 'noteSeg', html: esc(n) }); });
    if (fromBt) items0.push({ cls: 'noteSeg', html: '【回溯】你回到了本章开头。偏离度与已解锁的成就、图鉴不会重置——做过的事，史书都记着。' });
    revealSegs(items0, function(){
      var btn = el('button','contBtn','继 续');
      btn.onclick = function(){ disableOpts(); handleRoute(game.beginEvents()); };   // beginEvents = beginRounds 别名 → {type:'round'}
      optBox.appendChild(btn);
      speakMain();
    });
    main.scrollTop = 0;
  }

  /* ---------- 事件（整页渲染全部段落，叙事之后直接跟选项区） ---------- */
  function renderEvent(){
    ttsCancel();
    refreshTop(); clear(main); clear(optBox);
    var ev = game.findEvent(game.eventId);
    // v2.0.4 P1：不可解析的事件曾直接 return 留下空白页（导入的脏档/数据不一致时可达）。
    // 走结算页兜底并给出可读说明，不把玩家留在无内容的一屏。
    if (!ev){ var tip = el('div','optStuck','此节无处可述（章节数据不一致）。用顶栏「回溯」回到本章开头，或返回主页。'); main.appendChild(tip); return; }
    main.appendChild(el('div','evKicker', game.currentRandom ? '际遇 · 随机事件' : game.chapter().title.split('｜')[0].trim()));
    main.appendChild(el('div','evTitle', esc(ev.title)));
    var segs = (ev.altSegs && game.flags[ev.altSegs.flag]) ? ev.altSegs.segs : ev.segs;
    var cast1 = renderCast(segs); if (cast1) main.appendChild(cast1);
    revealSegs(segs.map(function(s){ return { cls: 'seg', html: rich(s) }; }), function(){
      renderOptions();
      speakMain();
    });
    main.scrollTop = 0;
  }

  /* 险招（GDD 附录 J）：成功率展示——普通/剧情显示百分比，硬核显示档位词（隐藏数值口径）
   * withXushi=false 用于行动卡：蓄势只兑现"下一次事件抉择"（GDD 附录 N.1 / engine.js choose），
   * playCard 掷骰用原始 rate，故行动卡不得显示蓄势加成。
   * v2.0.5：档位词改用引擎单一实现（E.riskWord），此前此处与 engine.riskTitle、
   * ui-overlays 各存一份阶梯，已出现 rate=60 说成「五成」的漂移。 */
  function riskText(risky, withXushi){
    if (withXushi === undefined) withXushi = true;
    var xb = (withXushi && game.xushi) ? 10 : 0;
    var eff = Math.min(70, risky.rate + xb);
    var t = game.diff.hideAttrs ? ('成算 ' + E.riskWord(eff)) : ('成功率 '+eff+'%');
    if (xb) t += game.diff.hideAttrs ? '（蓄势生效）' : '（含蓄势+10）';
    var gaps = risky.unmet.map(function(u){
      return game.diff.hideAttrs ? u.name+'不足' : (u.name+' '+u.have+'/'+u.need);
    }).join('、');
    return '⚠ 险招 · '+t+'（'+gaps+'）';
  }

  function renderOptions(){
    clear(optBox);
    var opts = game.getOptions();
    // 一次性教学：首次出现「史实选项变险招」时提示——史实选择不保证史实结果（v1.6.1）
    if (!game._taughtHistRisk && opts.some(function(o){ return o.hist && o.risky; })){
      game._taughtHistRisk = true;
      optBox.appendChild(el('div','optTeach','史实选择并不保证史实结果——你继承了他的选择，却没有继承他当时的条件。'));
    }
    opts.forEach(function(o, i){
      var b = el('button','opt'+(o.locked?' locked':'')+(o.risky?' risky':''), esc(o.opt.t));
      if (o.hist) b.appendChild(el('span','histmark','史'));
      if (o.locked && o.reason) b.appendChild(el('span','lockreason','🔒 '+esc(o.reason)));
      if (o.risky) b.appendChild(el('span','riskline', esc(riskText(o.risky))));
      if (!o.locked) b.onclick = function(){ doChoose(i); };
      optBox.appendChild(b);
    });
  }

  /* ---------- 结算 ---------- */
  function doChoose(i){
    disableOpts();
    var r = game.choose(i);
    if (!r){ thawOpts('这个选项眼下走不通（已试过或条件已变）。'); return; }   // v2.0.4：解冻而非静默锁死
    lastSettleText = r.text;
    var title = r.risk ? game.riskTitle(r) : '';
    showSettle(title, r.text, r.changes, r.devDelta, r.achNew, r.bandUp ? r.bandName : null, function(){
      if (r.failed){
        if (r.forcedEnding){ routeAfter(); return; }   // 险招失败且惩罚致死：走结局收束
        renderOptions(); return;                        // 失败烧毁该选项，留在本事件改选
      }
      routeAfter();
    });
  }

  function routeAfter(){
    var n = game.proceed();
    handleRoute(n);
  }

  function handleRoute(n){
    // v2.0.4 P1：空路由静默 return 会把玩家留在已禁用按钮的死页（结算浮层的「继续」点完无反应）。
    // 与 type='none' 同口径兜底：有结局对象走结局页，否则回主页。
    if (!n){ if (game.ending) renderEnding(); else renderHome(); return; }
    if (n.type === 'round'){
      // 每回合结算后尝试际遇（GDD 4.1/附录C）；resumed 的回合（际遇 RETURN 回来）不重复触发
      if (!n.resumed){
        var rev = game.maybeRandom();
        if (rev){ renderEvent(); return; }   // 际遇触发：phase 已转 'event'，渲染事件页
      }
      renderRound();
    }
    else if (n.type === 'event') renderEvent();
    else if (n.type === 'ending') renderEnding();
    else if (n.type === 'chapter') renderIntro();
    else if (n.type === 'endEvent') renderEndEvent();
    else if (n.type === 'correction') showCorrection(n.correction);
    else if (n.type === 'summary') renderSummary(n.summary);
    else if (n.type === 'none') {
      // v2.0.4 P1：末章章末结算后的空路由此前落进 renderRound()，重发最后一章手牌而无出路。
      // 语义上此时应已抵达结局：走结局收束；若无结局对象则回主页，不把玩家留在死页。
      if (game.ending) renderEnding(); else renderHome();
    }
    else renderRound();
  }

  /* ---------- 章末事件 ---------- */
  function renderEndEvent(){
    ttsCancel();
    refreshTop(); clear(main); clear(optBox);
    var ev = game.currentEndEvent;
    // v2.0.4 P1：currentEndEvent 为空时整页中断（renderEvent 有判空、此处曾漏）。
    // 章末事件已被结算/清空却仍被路由到本页时，走章末结算页兜底，不留白屏。
    if (!ev || !ev.options || !ev.options.length){ game.currentEndEvent = null; handleRoute(game.proceedAfterEndEvent()); return; }
    main.appendChild(el('div','evTitle', esc(ev.title)));
    revealSegs(ev.segs.map(function(s){ return { cls: 'seg', html: rich(s) }; }), function(){
      ev.options.forEach(function(o, i){
        // 章末选项门槛展示（v1.6.2 P1 修复：与引擎 endEventChoose 的兜底校验同口径）
        var c = o.req ? game.check(o.req) : { ok: true, reason: null };
        var b = el('button','opt'+(c.ok ? '' : ' locked'), esc(o.t));
        if (!c.ok && c.reason) b.appendChild(el('span','lockreason','🔒 '+esc(c.reason)));
        if (c.ok) b.onclick = function(){
          disableOpts();
          var r = game.endEventChoose(i);
          if (!r){ thawOpts('这个选项眼下走不通（条件已变）。'); return; }   // v2.0.4
          showSettle('', r.text, r.changes, r.devDelta, null, null, function(){
            var n = game.proceedAfterEndEvent();
            handleRoute(n);
          });
        };
        optBox.appendChild(b);
      });
      speakMain();
    });
    main.scrollTop = 0;
  }
