/* js/ui-overlays.js —— 结算浮层/修正/百科弹卡/属性与图鉴抽屉（自 index.html 内联脚本原样搬移，行为零变化） */

  /* 升段史书提示（GDD 6.3）：按升到的偏离段区分文案（循史为最低段，不会触发升段） */
  var BAND_WARNS = {
    '微澜': '史书提示：偏离度已入「微澜」——史书的正文尚未改，页边已多了几行你的批注。',
    '改流': '史书提示：偏离度已入「改流」——河已改道，史官的笔开始跟不上你了。',
    '逆天': '史书提示：偏离度已入「逆天」——这是一段无人见过的新历史，天命将以反噬索价。'
  };

  function showSettle(title, text, changes, devDelta, achNew, bandName, cb){
    ttsCancel();
    refreshTop();
    document.getElementById('corrTitleBox').innerHTML = title ? '<div class="corrTitle">'+esc(title).replace('🎲','<img src="assets/icons/icon_risk.png" style="width:18px;height:18px;vertical-align:-3px">')+'</div>' : '';
    document.getElementById('settleText').innerHTML = rich(text || '');
    var cl = document.getElementById('chgList'); clear(cl);
    var list = (changes||[]).slice();
    if (devDelta) list.push({dev:true, delta:devDelta});
    list.forEach(function(c, idx){
      var d = el('div','chg');
      d.style.animationDelay = (idx*0.15)+'s';
      if (c.dev){
        d.innerHTML = '<span class="dev">偏离 '+(c.delta>0?'+':'')+c.delta+'</span>';
      } else {
        var cls = c.delta>=0 ? 'plus' : 'minus';
        var inv = (c.k==='weiji');
        if (inv) cls = c.delta>0 ? 'minus' : 'plus';
        if (game.diff.hideAttrs){
          // 硬核（GDD 4.4）：不显示具体数值，以「升/降 + 结算后状态词」呈现；危机为逆向属性，升即恶化
          d.innerHTML = '<span class="'+cls+'">'+esc(c.label)+' '+(c.delta>0?'升':'降')+' · '+esc(game.attrWord(c.k))+'</span>'+(c.note?'<span class="note">'+esc(c.note)+'</span>':'');
        } else {
          d.innerHTML = '<span class="'+cls+'">'+esc(c.label)+' '+(c.delta>0?'+':'')+c.delta+'</span>'+(c.note?'<span class="note">'+esc(c.note)+'</span>':'');
        }
      }
      cl.appendChild(d);
    });
    var ap = document.getElementById('achPop');
    if (achNew){ ap.style.display='inline-block'; ap.textContent = '成就解锁 ｜ '+achNew; } else ap.style.display='none';
    var bw = document.getElementById('bandWarn');
    if (bandName){
      bw.style.display='block'; bw.textContent = BAND_WARNS[bandName] || ('史书提示：偏离度已入「'+bandName+'」段——史官的笔，开始跟不上你了。');
      // 升段全屏边缘色光（GDD 6.3）
      var bd = null;
      game.d.DEV_BANDS.forEach(function(b){ if (b.name === bandName) bd = b; });
      var fl = document.getElementById('bandFlash');
      fl.style.boxShadow = 'inset 0 0 90px 26px ' + (bd ? bd.color : '#c9a959');
      fl.className = ''; void fl.offsetWidth; fl.className = 'on';
    } else bw.style.display='none';
    overlay.style.display='flex';
    var btn = document.getElementById('settleContinue');
    btn.onclick = function(){ overlay.style.display='none'; saveCollection(); cb(); };
  }

  /* ---------- 修正事件 ---------- */
  function showCorrection(c){
    showSettle(c.title, c.segs.join(''), c.changes, 0, null, null, function(){
      var n = game.correctionContinue();
      handleRoute(n);
    });
  }

  /* ---------- 抽屉（属性面板 / 百科图鉴） ---------- */
  /* 属性面板自身两节的标题（v2.0.5）：此前靠 querySelectorAll('#drawerBody h3') 取
   * [0]/[1] 下标索引，与 index.html 的元素顺序强耦合——插入或调序一个 h3 就静默错位，
   * 属性面板标题与成就区标题会互串。改为按 id 直接取，结构变动不再影响。 */
  function openDrawer(mode){
    var hAttrs = document.getElementById('drawerHeadAttrs');
    var hAch = document.getElementById('drawerHeadAch');
    var list = document.getElementById('attrList'); clear(list);
    var meta = document.getElementById('drawerMeta');
    var al = document.getElementById('achList');
    if (mode === 'attrs'){
      hAttrs.textContent = '属 性 面 板';
      hAch.style.display = ''; al.style.display = ''; meta.style.display = '';
      var SELF_KEYS = ['tupo', 'wuli', 'caixue', 'moulue', 'biancai'];   // 自身（天赋线）
      game.d.ATTRS.forEach(function(a){
        if (a.k === SELF_KEYS[0]) list.appendChild(el('div','attrGroup','自 身 ｜ 天赋'));
        else if (a.k === 'caifu') list.appendChild(el('div','attrGroup','身 外 ｜ 经营'));
        var row = el('div','attrRow');
        var valText = game.diff.hideAttrs ? game.attrWord(a.k) : (game.attrs[a.k] + ' · ' + game.attrWord(a.k));
        var pct = Math.round(game.attrs[a.k] / game.attrMax(a.k) * 100);   // per-attr 上限（v1.8：财富万位标尺）
        if (game.diff.hideAttrs){
          // 硬核（GDD 4.4）：条形不按真实百分比，按状态词命中档位四档均分渲染
          var tier = a.words.length - 1;
          for (var wi = 0; wi < a.words.length; wi++){ if (game.attrs[a.k] >= a.words[wi][0]){ tier = wi; break; } }
          pct = (a.words.length - tier) * (100 / a.words.length);
        }
        row.innerHTML = '<div class="lab"><span><img class="attrIcon" src="assets/icons/icon_'+a.k+'.png" alt="" onerror="this.style.display=\'none\'">'+a.n+'</span><span class="val">'+valText+'</span></div>'+
          '<div class="attrBar'+(a.inverse?' inv':'')+'"><i style="width:'+pct+'%"></i></div>';
        list.appendChild(row);
      });
      meta.innerHTML = '偏离度 '+game.dev+'（'+game.d.DEV_BANDS[game.devBand()].name+'）<br>难度 '+game.diff.n+' ｜ 功业标记：'+(game.merits.join('、')||'无');
      // 年龄与病况（v1.8，剧本 AGE/ILLNESS 配置；GDD 附录 T）
      if (game.age != null) meta.innerHTML += '<br>年 '+game.age+' 岁'+(game.ill ? ' ｜ '+(game.ill.type==='major'?'沉疴缠身（大病，须「求医问药」）':'偶感风寒（小病，静养可愈）') : ' ｜ 身体无恙');
      // 寿元（v2.1.3，剧本 AGE.longevity 配置；GDD 附录 U.14）：体魄达阈值得折寿点数，衰老与疾病皆缓之。
      // 阈值按本剧本实测分布定档，故逐本不同——显示当前已得点数与下一档差额，玩家才可能朝它经营体魄。
      if (game.d.AGE && game.d.AGE.longevity && game.d.AGE.longevity.length) {
        var cred = game._longevity(), lon = game.d.AGE.longevity;
        var nextAt = null;
        for (var li = 0; li < lon.length; li++) if (game.attrs.tupo < lon[li][0]) { nextAt = lon[li]; break; }
        meta.innerHTML += '<br>寿元 +' + cred + (nextAt ? '（体魄再 ' + (nextAt[0] - game.attrs.tupo) + ' 至 ' + nextAt[0] + ' 可得 +' + nextAt[1] + '）' : '（已至顶）');
      }
      // 主敌威胁/戒心（隐藏值，剧本 HIDDEN 配置；硬核不显示）
      if (game.d.HIDDEN && game.diffKey !== 'hardcore' && game.chapterIdx >= (game.d.HIDDEN.showFrom != null ? game.d.HIDDEN.showFrom : 3)) meta.innerHTML += '<br>'+game.d.HIDDEN.name+'：'+game.zgWord();
      clear(al);
      if (game.ach.length===0) al.innerHTML = '<span style="opacity:.4;border:none">尚未解锁</span>';
      game.ach.forEach(function(a){
        var s = el('span','');
        s.innerHTML = '<img class="achIcon" src="assets/ach/ach_'+a+'.png" alt="" onerror="this.style.display=\'none\'">'+esc(game.d.ACHIEVEMENTS[a]||a);
        al.appendChild(s);
      });
    } else {
      hAttrs.textContent = '百 科 图 鉴';
      hAch.style.display = 'none'; al.style.display = 'none';
      meta.style.display = '';
      var total = Object.keys(game.d.GLOSSARY).length;
      meta.innerHTML = '已收录 '+game.gloss.length+' / '+total+' 条。叙事中带下划线的词条，点按即可收录。';
      Object.keys(game.d.GLOSSARY).forEach(function(t){
        var has = game.gloss.indexOf(t) >= 0;
        var b = el('button','glossItem'+(has?'':' glocked'), has ? esc(t) : '？？？');
        if (has) b.onclick = function(){ showGloss(t); };
        list.appendChild(b);
      });
    }
    var dr = document.getElementById('drawer');
    dr.className = 'open';
    dr.setAttribute('aria-hidden', 'false');   // v2.0.7：开时同步 aria-hidden
    var firstClose = dr.querySelector('button, [tabindex]');   // 焦点移入浮层（键盘用户不至于留在底层）
    if (firstClose) firstClose.focus();
  }

  /* ---------- 百科弹卡（点按词条即收录，GDD 5.6） ---------- */
  function showGloss(term){
    var g = game.d.GLOSSARY[term];
    if (!g || !game) return;
    var isNew = game.gloss.indexOf(term) < 0;
    if (isNew){ game.gloss.push(term); saveCollection(); }
    document.getElementById('glossTerm').textContent = term;
    document.getElementById('glossBody').textContent = g;
    var gc = document.getElementById('glossChar');
    if (CHAR_IMG[term]){ gc.src = 'assets/char/char_'+CHAR_IMG[term]+'.png'; gc.style.display = 'block'; }
    else { gc.style.display = 'none'; }
    document.getElementById('glossNew').style.display = isNew ? 'block' : 'none';
    var gm = document.getElementById('glossMask');
    gm.className = 'open';
    gm.setAttribute('aria-hidden', 'false');        // v2.0.7：开时同步 aria-hidden
    var gClose = document.getElementById('glossClose');
    if (gClose) gClose.focus();                      // 焦点入浮层
  }

  /* 浮层关闭的统一入口（v2.0.7）：抽屉/百科/分享三处此前各自写 className=''，
   * 忘同步 aria-hidden —— 读屏器会把已关闭的浮层仍当作可见。 */
  function closeMasks(){
    ['drawer', 'glossMask', 'shareMask'].forEach(function (id) {
      var n = document.getElementById(id);
      if (n){ n.className = ''; n.setAttribute('aria-hidden', 'true'); }
    });
  }

  function bindGloss(elm){
    elm.addEventListener('click', function(e){
      var t = e.target && e.target.closest ? e.target.closest('.gloss') : null;
      if (t) showGloss(t.getAttribute('data-t'));
    });
  }
