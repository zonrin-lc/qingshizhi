/* js/ui-round.js —— 回合页与出牌/蓄势（自 index.html 内联脚本原样搬移，行为零变化） */

  // 行动卡类型角标（v2.2.1）：进取/守成/兑换/保身/抉择，见 game-data.js ACTIONS[].type；治病卡无 type，不渲染
  var TYPE_BADGE = { '进取': 't-jin', '守成': 't-shou', '兑换': 't-dui', '保身': 't-bao', '抉择': 't-jue' };


  /* ---------- 回合页（行动卡回合制主界面：关键事件卡 ×1 + 行动卡 ×3） ---------- */
  function renderRound(){
    ttsCancel();
    refreshTop(); clear(main); clear(optBox);
    var offer = game.getOffer();
    var key = null;
    offer.forEach(function(e){ if (e.type === 'key') key = e; });
    main.appendChild(el('div','chapKicker', game.chapter().title));
    if (lastSettleText) main.appendChild(el('div','settleEcho', rich(lastSettleText)));
    main.appendChild(el('div','roundGuide',
      '经营以蓄势——关键事件「'+esc(key ? key.title : '')+'」余 '+(key ? key.roundsLeft : 0)+' 轮后自动开启；届时抉择，须你亲定。'+
      (lastSettleText ? '' : '行动卡用完即开。')));
    offer.forEach(function(e, i){
      if (e.type === 'key'){
        // 关键事件卡（v1.5 起被动）：金边（危机插入事件赤边）+ 「史」/「！」徽标 + 倒计时——不可点，行动卡用尽（倒计时归零）自动开启抉择页
        var ev = game.findEvent(e.eventId);
        var isHist = ev && ev.options && ev.options.some(function(o){ return o.hist; });
        // v2.0.4 P1 死锁修复：本事件无任何可解锁选项时（enterable）转为可点，
        // 否则「全锁事件 + 行动池也空」会让玩家零合法行动。
        var c = el(e.enterable ? 'button' : 'div', 'card key ' + (e.enterable ? 'enterable' : 'passive') + (e.inserted ? ' crisis' : ''));
        c.innerHTML = '<div class="cardKicker">'+(e.inserted ? '危机迫近 · 插入事件' : '关键事件')+' ｜ 余 '+e.roundsLeft+' 轮后开启</div>'+
          '<div class="cardTitle">'+esc(e.title)+'</div>'+
          '<span class="cardBadge">'+(e.inserted || !isHist ? '!' : '史')+'</span>'+
          (e.enterable ? '<div class="cardLock">此局已无可择之处——点此了断本章</div>' : '');
        if (e.enterable) c.onclick = function(){ disableOpts(); doPlayCard(i); };
        optBox.appendChild(c);
      } else {
        // 行动卡：名称 + desc + 收益递减提示；locked 防御渲染（硬门槛不入池）；risky 险招徽章（属性软门槛）
        var a = e.action;
        var b = el('button','card'+(e.locked ? ' locked' : '')+(e.risky ? ' risky' : ''));
        var h = '<div class="cardTitle">'+esc(a ? a.name : String(e.id))+'</div>';
        if (a && a.type && TYPE_BADGE[a.type]) h += '<span class="cardTypeBadge ' + TYPE_BADGE[a.type] + '">' + a.type + '</span>';
        if (a && a.desc) h += '<div class="cardDesc">'+esc(game.cardDesc(game.diff.hideAttrs && a.descHidden ? a.descHidden : a.desc))+'</div>';
        if (e.diminishing) h += '<div class="cardDim">已用 '+e.usedCount+' 次 · 收益递减</div>';
        if (e.locked && e.reason) h += '<div class="cardLock">🔒 '+esc(e.reason)+'</div>';
        if (e.risky) h += '<div class="riskline">'+esc(riskText(e.risky, false))+'</div>';
        b.innerHTML = h;
        // v2.0.4：锁定项是真禁用（此前仅视觉置灰，键盘可聚焦、读屏播报为可用、点击无反应）
        if (e.locked){ b.disabled = true; b.setAttribute('aria-disabled', 'true'); }
        else b.onclick = function(){ doPlayCard(i); };
        optBox.appendChild(b);
      }
    });
    // 蓄势卡（v1.6）：放弃本轮出牌，为下一次事件抉择蓄一分胜算（险招 +10，限一次）
    var xs = el('button','card xushi'+(game.xushi ? ' active' : ''));
    xs.innerHTML = '<div class="cardTitle">蓄势 · 静观其变</div>'+
      '<span class="cardTypeBadge t-xu">蓄势</span>'+
      '<div class="cardDesc">'+(game.xushi ? '已蓄势——下一次事件抉择的险招成功率 +10' : '不出手牌，为下一次事件抉择蓄一分胜算（险招成功率 +10，无险招则落空）')+'</div>';
    if (!game.xushi) xs.onclick = function(){ disableOpts(); doXushi(); };
    optBox.appendChild(xs);
    main.scrollTop = 0;
  }

  function doXushi(){
    var r = game.playXushi();
    if (!r){ thawOpts('蓄势只在一个关键事件内生效一次。'); return; }
    showSettle('蓄势', r.text, r.changes, 0, null, null, function(){
      if (r.forcedEnding){ handleRoute(game.proceed()); return; }
      if (r.forcedKey){ renderEvent(); return; }   // 倒计时归零：进入关键事件抉择页
      handleRoute(r.route || { type: 'round' });
    });
  }

  /* ---------- 出牌 ---------- */
  function doPlayCard(i){
    disableOpts();
    var r = game.playCard(i);
    if (!r){ thawOpts('这张牌眼下走不通（门槛已变或状态不同步）。'); return; }   // v2.0.4：解冻而非静默锁死
    // 关键事件卡 → 现有事件决策流；chapterEnd 表示该事件已无路可择，直接收束本章（死锁兜底）
    if (r.kind === 'key'){ if (r.chapterEnd) handleRoute(game.proceed()); else renderEvent(); return; }
    // 抉择卡（次级关键事件）：先叙事页后抉择
    if (r.kind === 'choice'){ renderCardChoice(); return; }
    // 行动卡：先弹行动结算
    lastSettleText = r.text;
    var actTitle = r.risk ? game.riskTitle(r) : '行动';
    showSettle(actTitle, r.text, r.changes, r.devDelta, r.achNew, null, function(){
      if (r.forcedEnding){ handleRoute(game.proceed()); return; }   // 行动致死：phase='settle'，需再 proceed 收束
      if (r.forcedKey){ renderEvent(); return; }   // 倒计时归零：强制进入关键事件，玩家亲自抉择
      handleRoute(r.route || { type: 'round' });
    });
  }

  /* ---------- 抉择卡（次级关键事件）：行动卡点击后先叙事、再抉择 ---------- */
  function renderCardChoice(){
    ttsCancel();
    refreshTop(); clear(main); clear(optBox);
    var v = game.getChoiceCard();
    if (!v){ renderRound(); return; }
    main.appendChild(el('div','evKicker','抉择 · 事有两端'));
    main.appendChild(el('div','evTitle', esc(v.title)));
    var cast1 = renderCast(v.segs); if (cast1) main.appendChild(cast1);
    revealSegs((v.segs || []).map(function(s){ return { cls: 'seg', html: rich(s) }; }), function(){
      clear(optBox);
      (v.options || []).forEach(function(o, i){
        var b = el('button','opt', esc(o.t));
        b.onclick = function(){ doChooseCardOpt(i); };
        optBox.appendChild(b);
      });
      var back = el('button','opt', '且搁置');
      back.onclick = function(){ if (game.cancelChoice()) renderRound(); };
      optBox.appendChild(back);
      speakMain();
    });
    main.scrollTop = 0;
  }

  function doChooseCardOpt(i){
    disableOpts();
    var r = game.chooseCardOption(i);
    if (!r){ thawOpts('这一抉择眼下走不通（状态已变）。'); return; }
    lastSettleText = r.text;
    showSettle('抉择', r.text, r.changes, r.devDelta, r.achNew, null, function(){
      if (r.forcedEnding){ handleRoute(game.proceed()); return; }
      if (r.forcedKey){ renderEvent(); return; }
      handleRoute(r.route || { type: 'round' });
    });
  }
