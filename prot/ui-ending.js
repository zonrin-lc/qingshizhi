/* js/ui-ending.js —— 章末结算/结局页/雷达图/分享卡 canvas（自 index.html 内联脚本原样搬移，行为零变化） */

  /* 美术资产映射与预加载 */
  var SEAL_IMG = {'循史':'seal_xunshi','苟活':'seal_gouhuo','稳健':'seal_wenjian','逆天':'seal_nitian','败局':'seal_baiju'};
  var shareBg = new Image(); shareBg.src = 'assets/bg/bg_share.jpg';

/* 全局字体栈：黄令东齐伋体优先，数字/标点由后备字体接住（该字体只有 CJK 字形）。
   canvas 不继承 CSS，必须显式写字体名；且要等字体真正加载完再落字，
   否则会静默用后备字体画出一张字形不一致的分享卡。 */
var UI_FONT = '"QIJIFALLBACK","Noto Serif SC","Songti SC","STSong","SimSun",serif';
function uiFontReady(px, weight, sample){
  if (!document.fonts || !document.fonts.check) return Promise.resolve();
  return document.fonts.load((weight || '400') + ' ' + (px || 16) + 'px QIJIFALLBACK', sample || '青史')
    .catch(function(){ return []; });
}

  /* ---------- 章末结算页（GDD 5.4：偏离归因 + 属性总览 + 修正说明） ---------- */
  function renderSummary(s){
    ttsCancel();
    refreshTop(); clear(main); clear(optBox);
    main.appendChild(el('div','chapKicker','章 末 结 算'));
    main.appendChild(el('div','chapHead', esc(s.chapter.split('｜')[0].trim()) + ' 终'));
    main.appendChild(el('div','scoreHead','偏 离 归 因 ｜ 当前偏离 '+s.dev+'（'+esc(s.bandName)+'）'));
    if (s.devLog.length === 0){
      main.appendChild(el('div','sumEmpty','本章你循史而行，史官的笔尚跟得上你。'));
    } else {
      s.devLog.forEach(function(d){
        var it = el('div','reviewItem');
        it.innerHTML = '<div class="rr"><b>'+esc(d.ev)+'</b> ｜ '+esc(d.t.length>18?d.t.slice(0,18)+'…':d.t)+'</div><div class="rd">偏离 +'+d.dev+'</div>';
        main.appendChild(it);
      });
    }
    // 章末定制文案（GDD 3.1；引擎 notes 字段可能尚未就位，判空兼容）
    if (s.notes && s.notes.length){
      s.notes.forEach(function(n){ main.appendChild(el('div','noteSeg',esc(n))); });
    }
    main.appendChild(el('div','scoreHead','本 章 境 遇'));
    if (Object.keys(s.attrDelta).length === 0){
      main.appendChild(el('div','sumEmpty','六维如止水，无增无减。'));
    } else {
      game.d.ATTRS.forEach(function(a){
        var d = s.attrDelta[a.k];
        if (!d) return;
        var good = a.inverse ? d < 0 : d > 0;
        var val = game.diff.hideAttrs ? (game.attrWord(a.k) + '（' + (d > 0 ? '升' : '降') + '）') : ((d > 0 ? '+' : '') + d + ' → ' + game.attrs[a.k]);
        main.appendChild(el('div','scoreLine','<span>'+a.n+'</span><b style="color:'+(good?'#8fae7c':'#b0432f')+'">'+val+'</b>'));
      });
    }
    if (s.corrTitle) main.appendChild(el('div','sumEmpty','历史修正：'+esc(s.corrTitle)+'（见前文结算）'));
    var btn = el('button','bigBtn', s.nextTitle ? '进 入 下 一 章' : '继 续');
    btn.onclick = function(){ handleRoute(game.proceedSummary()); };
    optBox.appendChild(btn);
    main.scrollTop = 0;
  }

  /* ---------- 结局页 ---------- */
  function renderEnding(){
    ttsCancel();
    var en = game.ending;
    saveCollection();
    clearGameSave(scenId());   // 达成结局，本剧本跨会话存档失效（GDD 6.4；v2.0.3 显式传 scenKey）
    refreshTop(); clear(main); clear(optBox); overlay.style.display='none';
    var sealBox = el('div','endSealBox');
    sealBox.innerHTML = '<img class="sealImg" src="assets/seals/'+(SEAL_IMG[en.seal]||'seal_xunshi')+'.png" alt="'+esc(en.seal)+'"><span class="sealMeta">'+esc(en.seal)+' · '+esc(en.diffName)+'难度</span>';
    main.appendChild(sealBox);
    main.appendChild(el('div','endName', esc(en.name)));
    if (en.achNew) main.appendChild(el('div','', '<span style="color:var(--gold);font-size:13px;border:1px dashed var(--gold);padding:5px 10px;display:inline-block;margin-bottom:16px">成就解锁 ｜ '+esc(en.achNew)+'</span>'));
    main.appendChild(el('div','endZhuan', esc(en.zhuan)));
    if (en.aliveNote) main.appendChild(el('div','sumEmpty',esc(en.aliveNote)));
    main.appendChild(el('div','scoreHead','评 分'));
    var rw = el('div','', ''); rw.id='radarWrap'; main.appendChild(rw);
    drawRadar(rw, en.scores);
    var names = {gongye:'功业', cuncun:'存续', shiping:'史评', yingxiang:'影响'};
    Object.keys(names).forEach(function(k){
      main.appendChild(el('div','scoreLine','<span>'+names[k]+'</span><b>'+en.scores[k]+'</b>'));
    });
    var tl = el('div','', ''); tl.id='totalLine';
    tl.innerHTML = '<span style="font-size:13px;color:var(--ink-dim)">总分（含难度与回溯系数）</span><span id="totalScore">'+en.total+'</span><span id="gradeBadge">'+en.grade+'</span>';
    main.appendChild(tl);
    main.appendChild(el('div','scoreHead','复 盘'));
    if (en.review.length === 0) main.appendChild(el('div','seg','这一局太短，短到历史还没有来得及转向。'));
    en.review.forEach(function(r, i){
      var d = el('div','reviewItem');
      d.innerHTML = '<div class="rn">抉择 '+ (i+1) +' ｜ '+esc(r.node)+'</div>'+
        '<div class="rr">你的选择：<b>'+esc(r.you)+'</b>'+(r.isHist?' <span style="opacity:.5">（同史实）</span>':'')+'<br>史实的选择：'+esc(r.hist)+'</div>'+
        '<div class="rd">偏离贡献 +'+(r.dev||0)+'</div>';
      main.appendChild(d);
    });
    var epi = el('div',''); epi.id='epilogue'; epi.textContent = en.epilogue; main.appendChild(epi);
    var again = el('button','bigBtn','再 入 此 局');
    // 随机命局：SCENARIOS 无 'fate' 键，须复用 startFate 重开一局（同难度）
    again.onclick = function(){
      var dk = game.diffKey;
      if (game.d.SCENARIO.id === 'fate'){ selDiff = dk; startFate(); return; }
      newGame(scenId(), dk); game.start(); renderIntro();
    };
    main.appendChild(again);
    // 分享卡（GDD 11.3：结局页即分享卡，可保存为图片）
    var share = el('button','ghostBtn','分 享 此 局');
    share.onclick = function(){ showShareCard(en); };
    main.appendChild(share);
      // v2.0.5：结局页不再提供回溯。终局是这一局的结论——可撤销的话，
    // 死亡/达成结局后仍能回到本章开头，renderIntro 的 saveGame 又把「已结束」的
    // 进度写回跨会话存档。引擎 canBacktrack 亦已对 phase==='ending' 返回 false。
    // 若玩家想换个活法，用上面的「再入此局」。
    var home = el('button','ghostBtn','返 回 主 页');
    home.onclick = renderHome;
    main.appendChild(home);
    main.scrollTop = 0;
    ttsSpeak(en.name + '。' + en.zhuan);   // 结局史传朗读
  }

  function drawRadar(wrap, s){
    var size = 210, c = document.createElement('canvas');
    c.width = size; c.height = size;
    wrap.appendChild(c);                 // 先入 DOM，字体到位后再落笔，避免量到空图
    uiFontReady(12, '400', '功业存续史评影响').then(function(){
    var ctx = c.getContext('2d');
    var cx = size/2, cy = size/2, R = 72;
    var keys = ['gongye','cuncun','shiping','yingxiang'];
    var labels = ['功业','存续','史评','影响'];
    ctx.strokeStyle = '#3a3226'; ctx.fillStyle = '#a89a7c';
    ctx.font = '12px ' + UI_FONT; ctx.textAlign='center'; ctx.textBaseline='middle';
    [0.25,0.5,0.75,1].forEach(function(f){
      ctx.beginPath();
      for (var i=0;i<=4;i++){ var a=-Math.PI/2 + (i%4)*Math.PI/2; var x=cx+Math.cos(a)*R*f, y=cy+Math.sin(a)*R*f; i?ctx.lineTo(x,y):ctx.moveTo(x,y); }
      ctx.stroke();
    });
    for (var i=0;i<4;i++){
      var a=-Math.PI/2 + i*Math.PI/2;
      ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(cx+Math.cos(a)*R, cy+Math.sin(a)*R); ctx.stroke();
      ctx.fillText(labels[i], cx+Math.cos(a)*(R+20), cy+Math.sin(a)*(R+16));
    }
    ctx.beginPath();
    for (var i=0;i<=4;i++){
      var k = keys[i%4], a=-Math.PI/2 + (i%4)*Math.PI/2;
      var r = R * Math.max(0.03, s[k]/100);
      var x=cx+Math.cos(a)*r, y=cy+Math.sin(a)*r;
      i?ctx.lineTo(x,y):ctx.moveTo(x,y);
    }
    ctx.closePath();
    ctx.fillStyle='rgba(201,169,89,.25)'; ctx.fill();
    ctx.strokeStyle='#c9a959'; ctx.stroke();
    });
  }

  /* ---------- 结局分享卡（GDD 11.3：结局名 + 史传节选 + 评级，canvas 直出 PNG） ---------- */
  function wrapCanvasText(x, text, px, py, maxW, lh){
    var line = '', yy = py;
    for (var i = 0; i < text.length; i++){
      var t = line + text[i];
      if (x.measureText(t).width > maxW && line){ x.fillText(line, px, yy); line = text[i]; yy += lh; }
      else line = t;
    }
    if (line) x.fillText(line, px, yy);
    return yy;
  }
  function drawShareCard(en){
    var W = 480, H = 720, c = document.createElement('canvas');
    c.width = W; c.height = H;
    var x = c.getContext('2d');
    var SERIF = UI_FONT;
    if (shareBg.complete && shareBg.naturalWidth) x.drawImage(shareBg, 0, 0, W, H);
    else { x.fillStyle = '#17140f'; x.fillRect(0, 0, W, H); }
    x.textAlign = 'center';
    x.fillStyle = '#a89a7c'; x.font = '16px ' + SERIF;
    x.fillText('青史志 · ' + String(game.d.SCENARIO.name || '').replace(' · ', '「') + '」', W / 2, 66);
    x.fillStyle = '#e8dfc8'; x.font = 'bold 42px ' + SERIF;
    x.fillText(en.name, W / 2, 132);
    x.fillStyle = '#b0432f'; x.font = '17px ' + SERIF;
    x.fillText(en.seal + ' · ' + en.diffName + '难度', W / 2, 166);
    x.strokeStyle = '#3a3226'; x.beginPath(); x.moveTo(60, 190); x.lineTo(W - 60, 190); x.stroke();
    x.fillStyle = '#c9b98f'; x.font = '15px ' + SERIF; x.textAlign = 'left';
    var zh = en.zhuan.length > 105 ? en.zhuan.slice(0, 105) + '……' : en.zhuan;
    wrapCanvasText(x, zh, 52, 222, W - 104, 27);
    // 评级圆章
    x.strokeStyle = '#b0432f'; x.lineWidth = 3;
    x.beginPath(); x.arc(W / 2, 500, 52, 0, Math.PI * 2); x.stroke();
    x.fillStyle = '#b0432f'; x.font = 'bold 52px ' + SERIF; x.textAlign = 'center';
    x.fillText(en.grade, W / 2, 518);
    x.fillStyle = '#c9a959'; x.font = '24px ' + SERIF;
    x.fillText('总分 ' + en.total, W / 2, 590);
    x.fillStyle = '#a89a7c'; x.font = '13px ' + SERIF;
    x.fillText('功业 ' + en.scores.gongye + ' ｜ 存续 ' + en.scores.cuncun + ' ｜ 史评 ' + en.scores.shiping + ' ｜ 影响 ' + en.scores.yingxiang, W / 2, 622);
    x.fillText('历史偏离度 ' + en.dev, W / 2, 650);
    x.fillStyle = '#7fa8a0'; x.font = '14px ' + SERIF;
    x.fillText('你的历史偏离度是多少？', W / 2, 684);
    return c.toDataURL('image/png');
  }
  function showShareCard(en){
    /* 等字体到位再生成，否则 canvas 会用后备字体画出字形不一致的卡片 */
    uiFontReady(42, '400', en.name || '青史').then(function(){
    try {
      var url = drawShareCard(en);
      document.getElementById('shareImg').src = url;
      document.getElementById('shareDl').href = url;
      document.getElementById('shareDl').download = '青史志-' + en.name + '.png';
      document.getElementById('shareMask').className = 'open';
    } catch(e){
      // 分享卡生成失败不静默（v1.6.2）：canvas/资源异常时给玩家可见反馈
      console.error('分享卡生成失败', e);
      showSettle('', '分享卡生成失败，请重试。', [], 0, null, null, function(){});
    }
    });
  }
