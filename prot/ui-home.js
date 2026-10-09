/* js/ui-home.js —— 主页：开局与剧本/难度/存档入口（自 index.html 内联脚本原样搬移，行为零变化） */

  /* newGame(scenKey, diffKey, data)：data 非空时用它替代 SCENARIOS[scenKey]——
   * 随机命局（v1.7.0 附录 R）的剧本对象是现生成的，boot.js 的 SCENARIOS 里没有 'fate' 键，
   * 「再入此局」必须走这条路，否则 new E.Game(undefined) 直接抛错。 */
  function newGame(scenKey, diffKey, data){
    game = new E.Game(data || SCENARIOS[scenKey], diffKey);
    var col = loadCollection(scenKey);
    game.gloss = col.gloss.slice();
    game.ach = col.ach.slice();
    return game;
  }

  /* ---------- 主页（v1.6.9 两级化：朝代页 → 剧本页） ----------
   * 朝代页：游戏名 + 卷轴式朝代选择（当前朝代居中朱印，左右露角可横移切换）。
   *   五个朝代均可选中；仅秦有剧本，未开放者点「立即启程」只作提示。
   * 年代线：随卷轴同步横移，中心菱形指针固定，压住当前朝代的起讫年份。
   * 点秦 → 剧本页：剧本选择 + 难度选择 + 入局 + 继续（存档）。 */
  var homeStage = 'dynasty';
  var selFate = false;   // 剧本页是否选中「随机命局」（v1.7.0）

  /* 朝代数据：bg 为预留的每朝代底图（当前仅秦有图，占位朝代回落到通用水墨）。
     将来补画只需在此登记，不必改渲染逻辑。 */
  var DYNASTIES = [
    { name: '秦', era: '前 221 — 前 207', open: true,  bg: 'assets/ui/bg_ink.jpg' },
    { name: '汉', era: '前 202 — 220',   open: false, bg: null },
    { name: '唐', era: '618 — 907',      open: false, bg: null },
    { name: '宋', era: '960 — 1279',     open: false, bg: null },
    { name: '明', era: '1368 — 1644',    open: false, bg: null }
  ];
  var dynIdx = 0;          // 当前朝代下标
  var DYN_ON = 0;          // 卷轴中央（当前）刻度的位置，切换后对齐到这里
  var DYN_STEP = 104;      // 刻度间距，须与 CSS .dynTick width 一致

  function homeDivider(text){
    var d = el('div','homeDivider');
    d.innerHTML = '<img src="assets/ui/divider.png" alt=""><span>'+esc(text)+'</span><img class="r" src="assets/ui/divider.png" alt="">';
    return d;
  }

  /* ---------- 朝代页：卷轴横移选择 ----------
   * 布局：一条横向刻度带，5 个朝代等距排列；卷面可拖动，松手吸附到最近刻度。
   * 当前朝代居中且盖红印；相邻朝代露出窄条；不可用（未开放）朝代字为淡墨且阻尼不可停。 */
  var dynUI = null;         // 年代线 / 启程按钮的 DOM 引用，供 dynGo 就地更新（避免整页重绘打断手势）

  function renderDynastyPage(){
    main.appendChild(el('div','homeTitleTxt zhi','青史志'));
    main.appendChild(el('div','homeSub ink','悠悠千载　青史万卷<br>若置身棋局　当如何落子'));
    main.appendChild(homeDivider('选 择 朝 代'));

    var cur = DYNASTIES[dynIdx];
    var strip = el('div','dynStrip');
    var track = el('div','dynTrack');
    DYNASTIES.forEach(function(d, i){
      var t = el('div','dynTick'+(d.open ? ' open':'')+(i === dynIdx ? ' cur':''), d.name);
      t.dataset.i = i;
      t.onclick = function(){ dynGo(i); };
      track.appendChild(t);
    });
    // 朱印：独立轨道。它黏在当前朝代的刻度上 —— 静止时居中，滑动时随朝代一起走
    var sealTrack = el('div','dynSealTrack');
    var seal = el('div','dynSeal' + (cur.open ? '' : ' locked'));
    seal.innerHTML = '<img src="assets/ui/frame_red.png" alt=""><span>'+esc(cur.name)+'</span>';
    sealTrack.appendChild(seal);
    strip.appendChild(sealTrack);
    strip.appendChild(track);
    main.appendChild(strip);

    // 年代线：整条与刻度带同步横移，中心菱形指针固定 → 指针始终压住当前朝代那一段
    var axis = el('div','dynAxis');
    var axisTrack = el('div','dynAxisTrack');
    var axisCells = DYNASTIES.map(function(d, i){
      var c = el('div','dynAxisCell'+(i === dynIdx ? ' cur':''), esc(d.era));
      axisTrack.appendChild(c);
      return c;
    });
    axis.appendChild(axisTrack);
    axis.appendChild(el('div','dynAxisMark'));
    main.appendChild(axis);

    // 立即启程：仅已开放朝代可入局，其余明示「暂未开启」
    var go = el('button','goBtn' + (cur.open ? '' : ' off'), cur.open ? '立 即 启 程' : '暂 未 开 启');
    main.appendChild(go);

    // v2.0.7：一并缓存两条平移轨道，避免手势每帧 querySelector 触发强制样式重算
    dynUI = { ticks: track.children, axisCells: axisCells, seal: seal, go: go, axisTrack: axisTrack, sealTrack: sealTrack };
    /* 未开放朝代：点红印或点按钮都只是「晃一下」提示，不放行。
       注意读的是实时 dynIdx —— 不可闭包捕获渲染时的 cur，否则切换朝代后判断会失真。 */
    var tryGo = function(){
      if (DYNASTIES[dynIdx].open){ homeStage = 'scen'; renderHome(); } else nudgeGo();
    };
    seal.onclick = tryGo;
    go.onclick = tryGo;

    bindDynScroll(strip, track);
    dynLayout(true);
  }

  /* 「暂未开启」反馈：按钮左右轻晃 */
  function nudgeGo(){
    if (!dynUI) return;
    var b = dynUI.go;
    b.classList.remove('nudge'); void b.offsetWidth;   // 强制重排以重启动画
    b.classList.add('nudge');
  }

  /* 卷面位置 → 刻度偏移（像素） */
  function dynOffset(){ return -(dynIdx - DYN_ON) * DYN_STEP; }

  /* 应用当前卷面位移。
     刻度带与年代线取同值；红印则黏在当前朝代上 —— 静止时偏移恒为 0（正好居中），
     切换/松手回弹时它随手指一起滑过去，再滑回屏心。 */
  function dynLayout(instant){
    var off = dynOffset();
    var tr = instant ? 'none' : 'transform .38s cubic-bezier(.22,.61,.36,1)';
    var u = dynUI;   // v2.0.7：轨道已缓存，不再每次布局查三遍 DOM
    var track = main.querySelector('.dynTrack');   // 刻度带未随 dynUI 缓存（strip 内的 track）
    if (track){ track.style.transition = tr; track.style.transform = 'translateX(' + off + 'px)'; }
    if (u && u.axisTrack){ u.axisTrack.style.transition = tr; u.axisTrack.style.transform = 'translateX(' + off + 'px)'; }
    if (u && u.sealTrack){ u.sealTrack.style.transition = tr; u.sealTrack.style.transform = 'translateX(0px)'; }
  }

  /* 切换到第 i 个朝代。所有朝代均可选中（尚未开放的只是无剧本，提示「暂未开启」）。 */
  function dynGo(i){
    i = Math.max(0, Math.min(DYNASTIES.length - 1, i));
    dynIdx = i;
    var cur = DYNASTIES[dynIdx];
    var u = dynUI;
    if (!u) return;
    // 朱印：文字、配色、可点状态
    u.seal.querySelector('span').textContent = cur.name;
    u.seal.className = 'dynSeal' + (cur.open ? '' : ' locked');
    // 当前刻度随朱印移动 → 字隐去，避免与印内文字重影
    for (var ti = 0; ti < u.ticks.length; ti++) u.ticks[ti].classList.toggle('cur', ti === dynIdx);
    // 年代线：指针固定，读数随之高亮
    for (var ai = 0; ai < u.axisCells.length; ai++) u.axisCells[ai].classList.toggle('cur', ai === dynIdx);
    // 立即启程：已开放可入局，其余明示暂未开启
    u.go.className = 'goBtn' + (cur.open ? '' : ' off');
    u.go.textContent = cur.open ? '立 即 启 程' : '暂 未 开 启';
    dynLayout(false);
  }

  /* 手势：拖动卷面，松手吸附到最近刻度；拖到首/末朝代之外时阻尼（拉不动） */
  var dynCleanup = null;
  function bindDynScroll(strip, track){
    if (dynCleanup) dynCleanup();          // 重新渲染前先摘掉上一轮的 window 监听
    var sealTrack = strip.querySelector('.dynSealTrack');
    var x0 = null, y0 = null, dx = 0, moved = false, justDragged = false, dragTimer = 0;
    function down(e){
      var p = e.touches ? e.touches[0] : e;
      x0 = p.clientX; y0 = p.clientY; dx = 0; moved = false;
      track.style.transition = 'none';
      if (sealTrack) sealTrack.style.transition = 'none';
    }
    function move(e){
      if (x0 === null) return;
      var p = e.touches ? e.touches[0] : e;
      var ddx = p.clientX - x0, ddy = p.clientY - y0;
      if (!moved){
        if (Math.abs(ddy) > Math.abs(ddx) && Math.abs(ddy) > 8){ x0 = null; return; }  // 纵向意图 → 交还页面滚动
        if (Math.abs(ddx) > 6) moved = true;
        else return;
      }
      if (e.cancelable) e.preventDefault();
      dx = ddx;
      // 阻尼：越出可用范围时位移按 0.32 衰减，边缘"拉不动"
      var raw = dynOffset() + dx;
      var min = -(DYNASTIES.length - 1 - DYN_ON) * DYN_STEP;
      var max = DYN_ON * DYN_STEP;
      if (raw > max) raw = max + (raw - max) * 0.32;
      else if (raw < min) raw = min + (raw - min) * 0.32;
track.style.transform = 'translateX(' + raw + 'px)';
      var u = dynUI;                        // v2.0.7：读缓存轨道，不再每帧 querySelector
      var ax = u && u.axisTrack;
      if (ax) ax.style.transform = 'translateX(' + raw + 'px)';
      /* 红印黏在当前朝代上：相对吸附点的位移 = raw - dynOffset()。
         静止时为 0（居中），拖动时等于手指位移，于是红印跟着朝代一起走。 */
      if (sealTrack) sealTrack.style.transform = 'translateX(' + (raw - dynOffset()) + 'px)';
    }
    function up(){
      if (x0 === null) return;
      x0 = null;
      if (!moved) return;                    // 轻点：交给 click 处理
      /* 拖动收尾：只吞掉紧随其后的那一次 click（浏览器几乎同帧派发，250ms 足够）。
         若抬手在 strip 外，浏览器可能根本不派发 click —— 此时不能把标记一直挂着，
         否则下一次点朱印/点刻度会被吞掉（表现为「第一下点击没反应」）。故用时间窗兜底。 */
      justDragged = true;
      clearTimeout(dragTimer);
      dragTimer = setTimeout(function(){ justDragged = false; }, 250);
      // 卷面实际停在 raw 处（已被阻尼裁剪），换算回目标刻度下标
      var raw = dynOffset() + dx;
      var t = Math.round(DYN_ON - raw / DYN_STEP);
      dynGo(Math.max(0, Math.min(DYNASTIES.length - 1, t)));
    }
    function swallow(e){
      if (justDragged){ e.stopPropagation(); e.preventDefault(); justDragged = false; }
    }
    strip.addEventListener('mousedown', down);
    strip.addEventListener('touchstart', down, { passive: true });
    window.addEventListener('mousemove', move);
    window.addEventListener('touchmove', move, { passive: false });
    window.addEventListener('mouseup', up);
    window.addEventListener('touchend', up);
    strip.addEventListener('click', swallow, true);

    dynCleanup = function(){
      clearTimeout(dragTimer);
      strip.removeEventListener('mousedown', down);
      strip.removeEventListener('touchstart', down);
      window.removeEventListener('mousemove', move);
      window.removeEventListener('touchmove', move);
      window.removeEventListener('mouseup', up);
      window.removeEventListener('touchend', up);
      strip.removeEventListener('click', swallow, true);
      dynCleanup = null;
    };
  }


  function renderScenarioPage(){
    main.appendChild(el('div','homeTitleTxt','青史志'));
    // 剧本：横排竖条卡（主角立绘满铺 + 局名；选中金框高亮）
    main.appendChild(homeDivider('选 择 剧 本'));
    var scenRow = el('div','scenRow');
    Object.keys(SCENARIOS).forEach(function(k){
      var sc = SCENARIOS[k].SCENARIO;
      var juname = sc.name.split('·')[1] ? sc.name.split('·')[1].trim() : sc.name;
      var c = el('button','scenCard'+(k===selScen?' sel':''));
      c.innerHTML = '<img class="scenChar" src="assets/char/char_'+k+'.png" alt="" loading="lazy" decoding="async">'+
        '<div class="scenName">'+esc(juname)+'</div>'+
        (sc.recommend && sc.recommend.indexOf('推荐') >= 0 ? '<div class="scenRec">推荐</div>' : '');
      c.onclick = function(){ selScen = k; selFate = false; renderHome(); };
      scenRow.appendChild(c);
    });
    // 随机命局（v1.7.0，GDD 附录 R）：系统自己涌出的剧本——人物/初始属性/际遇池全随机
    var fc = el('button','scenCard fate'+(selFate ? ' sel' : ''));
    fc.innerHTML = '<div class="dynPlaceholder dynPlayable">命</div><div class="scenName">随机命局</div>';
    fc.onclick = function(){ selFate = true; renderHome(); };
    scenRow.appendChild(fc);
    main.appendChild(scenRow);
    // 难度：横排三钮（图底 + 名）
    main.appendChild(homeDivider('选 择 难 度'));
    var diffRow = el('div','diffRow');
    ['story','normal','hardcore'].forEach(function(k){
      var df = SCENARIOS[selScen].DIFFICULTY[k];
      var b = el('button','diffBtn'+(k===selDiff?' sel':''), esc(df.n));
      b.onclick = function(){ selDiff = k; renderHome(); };
      diffRow.appendChild(b);
    });
    main.appendChild(diffRow);
    var start = el('button','startImgBtn','<img src="assets/ui/btn_ruju.png" alt="入局">');
    start.onclick = function(){
      if (selFate){ startFate(); return; }
      clearGameSave(selScen); newGame(selScen, selDiff); game.start(); renderIntro();
    };
    main.appendChild(start);
    // 跨会话存档（GDD 6.4）：当前所选剧本（显式 selScen，非隐式 scenId）有有效存档则给「继续」入口，
    // 按存档难度恢复（随机命局无存档入口）
    var sv = loadGameSave(selScen);
    if (sv && !selFate){
      var SD = SCENARIOS[selScen];
      var svdf = SD.DIFFICULTY[sv.diffKey], svch = SD.CHAPTERS[sv.chapterIdx];
      var svLabel = '继 续 · 本章开局';
      if (svdf && svch) svLabel += '（'+svdf.n+' · '+svch.title.split('｜')[0].trim()+'）';
      var cont = el('button','contImgBtn', esc(svLabel));
      cont.onclick = function(){
        newGame(selScen, sv.diffKey);
        if (game.importSave(sv)) renderIntro();
        else { clearGameSave(selScen); renderHome(); }   // 坏存档：清除并回到主页
      };
      main.appendChild(cont);
    }
    // 返回朝代页
    var back = el('button','homeBack','‹ 改选朝代');
    back.onclick = function(){ homeStage = 'dynasty'; renderHome(); };
    main.appendChild(back);
  }

  /* 随机命局开局（v1.7.0，GDD 附录 R）：fate.js 生成"第六剧本"——人物/初始属性/际遇池全随机；
   * 每次点击都是新种子，命局不可复现、无存档，每局即一生 */
  function startFate(){
    var seed = ((Date.now() % 2147483647) ^ Math.floor(Math.random() * 2147483647)) >>> 0;
    var r = QINGSHI_FATE.makeFate(SCENARIOS, QINGSHI_FATE.mulberry32(seed));
    newGame('fate', selDiff, r.data);
    game.start();
    renderIntro();
  }

  function renderHome(){
    ttsCancel();
    // v2.0.7：离页即摘掉卷面手势的 window 监听。此前 dynCleanup 只在「下次进朝代页」
    // 才跑——切到剧本页/对局后 mousemove/touchmove({passive:false}) 仍挂在 window 上，
    // 且 dynUI 指向已卸载节点；移动端在卷面按下后滑离，move 仍 preventDefault()
    // 吞掉页面滚动，「进朝代页→返回」每轮留下一套僵尸监听。
    if (dynCleanup) dynCleanup();
    document.getElementById('topbar').style.display='none';
    var app = document.getElementById('app');
    app.classList.add('home-hero');
    app.classList.toggle('home-ink', homeStage === 'dynasty');
    clear(main); clear(optBox); overlay.style.display='none';
    if (homeStage === 'dynasty') renderDynastyPage();
    else renderScenarioPage();
  }
