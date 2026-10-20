/* js/ui-core.js —— 基础工具与共享状态（自 index.html 内联脚本原样搬移，行为零变化） */

  var APP_VERSION = '1.0.0';   // 界面版本号唯一来源（与 package.json version 同步，test-ui-contract.js 校验）
  var D = window.GAME_DATA, E = window.QINGSHI_ENGINE;

  var selScen = 'lisi', selDiff = 'normal';
  /* 对局剧本 id：game 在手时以其为准，否则为当前所选（renderHome 不清 game，
   * 故此函数只可用于"对局内"语义，不可用于存档分区——存档分区一律显式传 scenKey） */
  function scenId(){ return game ? game.d.SCENARIO.id : selScen; }
  var game = null;
  var main = document.getElementById('main');
  var optBox = document.getElementById('options');
  var overlay = document.getElementById('overlay');
  var lastSettleText = null;   // 最近一次结算叙事（行动 res / 事件 res），回合页主区回显

  function el(tag, cls, html){ var e=document.createElement(tag); if(cls)e.className=cls; if(html!=null)e.innerHTML=html; return e; }  /* 转义全部 HTML 元字符（含属性引号）：文本走 innerHTML 拼串，缺一重转义即可破属性 */
  function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
  /* 叙事富文本：⟦词条⟧ → 可点按的百科入口（词条名同样过 esc，避免 " 破 data-t 属性） */
  function rich(s){ return esc(s).replace(/⟦(.+?)⟧/g, '<span class="gloss" data-t="$1">$1</span>'); }

  /* 关键 NPC 立绘（assets/char/char_<id>.png）：NPC 名 → 文件 id */
  var CHAR_IMG = {
    '李斯':'lisi','荆轲':'jingke','韩信':'hanxin','项羽':'xiangyu','陈胜':'chensheng',
    '吴广':'wuguang','范增':'fanzeng','樊於期':'fanwuqi','扶苏':'fusu','高渐离':'gaojianli',
    '韩非':'hanfei','胡亥':'huhai','季布':'jibu','蒯通':'kuaitong','刘邦':'liubang',
    '李左车':'lizuoche','龙且':'longju','蒙恬':'mengtian','漂母':'piaomu','秦舞阳':'qinwuyang',
    '太子丹':'taizidan','田光':'tianguang','王翦':'wangjian','武臣':'wuchen','项伯':'xiangbo',
    '项梁':'xiangliang','萧何':'xiaohe','嬴政':'yingzheng','虞姬':'yuji','章邯':'zhanghan',
    '赵高':'zhaogao','郑国':'zhengguo','钟离眜':'zhonglimei'
  };

  /* 「出场」立绘排：扫描叙事文本中的 ⟦NPC⟧，有立绘者在标题下出一排圆像（点按开百科弹卡） */
  function renderCast(strs){
    var seen = {}, names = [];
    (strs || []).forEach(function(s){
      var re = /⟦(.+?)⟧/g, m;
      while ((m = re.exec(s))) { var t = m[1]; if (CHAR_IMG[t] && !seen[t]) { seen[t] = 1; names.push(t); } }
    });
    if (!names.length) return null;
    var row = el('div','castRow');
    names.forEach(function(t){
      var chip = el('button','castChip');
      chip.innerHTML = '<img src="assets/char/char_'+CHAR_IMG[t]+'.png" alt="'+esc(t)+'"><span>'+esc(t)+'</span>';
      if (game.d.GLOSSARY && game.d.GLOSSARY[t]) chip.onclick = function(){ showGloss(t); };
      row.appendChild(chip);
    });
    return row;
  }
  function clear(n){ while(n.firstChild) n.removeChild(n.firstChild); if (n === main) cancelReveal(); }

  /* 防连点：点击即禁用当前选项区全部按钮（下一次渲染会重建新按钮，无需解锁） */
  function disableOpts(){ var bs = optBox.querySelectorAll('button'); for (var i = 0; i < bs.length; i++) bs[i].disabled = true; }
  /* 引擎返回 null（不可行动）时的解冻兜底（v2.0.4 P1）：
   * 此前 disableOpts() 先禁用全部按钮、随后 `if (!r) return;` 直接静默返回——
   * 引擎有多条 null 路径（未知行动 id / 硬门槛不过 / 无病治病 / 锁定或已烧毁选项），
   * 任何一次不一致都留下一个不可交互的死页，玩家只能刷新或靠顶栏回溯脱出。
   * 此处恢复按钮并给出可读原因。 */
  function thawOpts(msg){
    var bs = optBox.querySelectorAll('button');
    for (var i = 0; i < bs.length; i++) bs[i].disabled = false;
    var tip = optBox.querySelector('.optStuck');
    if (!tip) { tip = el('div','optStuck'); optBox.appendChild(tip); }
    tip.textContent = msg || '这一步眼下无法走通——请换一条路。';
  }

  /* ---------- 叙事逐句渐显（v1.5）：文本从底部区域一句一句出现；点击正文区（非词条/立绘/按钮）速显全部 ----------
   * v2.0.3 P0 修复（渲染代次 token）：原 clear(main) 先清 DOM 再 cancelReveal()，
   * 而 cancelReveal 会 flush() 把**未显示**的旧段落追加进刚被清空的 main 并执行上一页的 done()——
   * 于是章首渐显途中点「回溯」/「继续」，旧叙事的选项按钮会与新页叠加，且这些按钮作用于
   * 另一个 eventId。现引入 genGen（渲染代次）：cancel 时若代次已失效则只停计时，绝不落内容。 */
  var SEG_DELAY = 650;   // 每句间隔（ms）
  var revealing = null;  // 进行中的渐显 {cancel, gen}
  var revealGen = 0;     // 渲染代次计数器：每次新开渐显 +1
  function cancelReveal(){
    if (revealing){ revealing.cancel(); }
    if (typeof main !== 'undefined' && main) main.onclick = null;
  }
  function revealSegs(items, done){
    // items: [{cls, html}]；逐条追加到 main 并滚到底部；全部显完（或速显）后调 done
    cancelReveal();
    var gen = ++revealGen;
    var i = 0, timer = null, dead = false;
    function flush(){
      while (i < items.length){ var it = items[i++]; main.appendChild(el('div', it.cls, it.html)); }
      main.scrollTop = main.scrollHeight;
    }
    function finish(){ revealing = null; main.onclick = null; if (done) done(); }
    function step(){
      if (dead || gen !== revealGen) return;   // 本次渐显已被更新的一页取代：静默退出
      if (i >= items.length){ finish(); return; }
      var it = items[i++];
      main.appendChild(el('div', it.cls, it.html));
      main.scrollTop = main.scrollHeight;   // 新句从底部区域出现
      timer = setTimeout(step, SEG_DELAY);
    }
    revealing = {
      gen: gen,
      cancel: function(){
        clearTimeout(timer);
        if (gen !== revealGen){ dead = true; return; }   // 已失效：不 flush、不跑 done（否则污染新页）
        dead = true; flush(); finish();
      }
    };
    main.onclick = function(e){
      if (!revealing || revealing.gen !== revealGen) return;
      if (e.target && e.target.closest && e.target.closest('.gloss,.castChip,button,a')) return;
      revealing.cancel();
    };
    step();   // 首句即显
  }

  /* 收集品（图鉴/成就）跨局持久化（按剧本分区） */
  function loadCollection(scenKey){
    if (!scenKey) scenKey = scenId();
    try { var c = JSON.parse(localStorage.getItem('qingshi_collection_v1_' + scenKey)); if (c && c.gloss && c.ach) return c; } catch(e){ warnStorage('读取收集品失败'); }
    return { gloss: [], ach: [] };
  }
  function saveCollection(){
    if (!game) return;
    try { localStorage.setItem('qingshi_collection_v1_' + game.d.SCENARIO.id, JSON.stringify({ gloss: game.gloss, ach: game.ach })); }
    catch(e){ warnStorage('成就/图鉴未能保存'); }
  }

  /* localStorage 不可用时的一次性提示（v2.0.7）
   * 隐私模式与配额满会让 setItem 抛异常，此前六处全为空 catch —— 进度静默不落盘，
   * 主页照常显示「继续」入口、成就照常弹「解锁」，玩家无法察觉自己的进度从未保存。 */
  var storageWarned = false;
  function warnStorage(what){
    if (storageWarned) return;
    storageWarned = true;
    var t = document.createElement('div');
    t.className = 'storageWarn';
    t.setAttribute('role', 'alert');
    t.textContent = '⚠ 浏览器未允许本地存储，' + (what || '进度') + '无法保存（关闭隐私模式或清理站点数据后恢复）。';
    document.getElementById('app').appendChild(t);
    setTimeout(function(){ if (t.parentNode) t.parentNode.removeChild(t); }, 6000);
  }

  /* 跨会话存档（GDD 6.4）：章首存档点，引擎 exportSave/importSave 出纯数据，存取归 UI（按剧本分区） */
  function saveGame(){
    if (!game) return;
    if (game.d.SCENARIO.id === 'fate') return;   // 随机命局：每局即一生，不写跨会话存档（GDD 附录 R.3）
    var sv = game.exportSave();   // 硬核/无快照返回 null，不写
    if (sv) {
      try { localStorage.setItem('qingshi_save_v1_' + game.d.SCENARIO.id, JSON.stringify(sv)); }
      catch(e){ warnStorage('本局进度'); }
    }
  }
  /* 收集品分区：同 scenKey 显式传参，避免 renderHome 后 game 残留导致分区错位 */
  /* 存档读写按"显式剧本分区"（v2.0.3 P0 修复）：此前经 scenId() 隐式派生，
   * 而 renderHome() 不清 game，scenId() 返回的是上一局的剧本 id——在项羽页点「入局」
   * 会删掉李斯的存档，「继续」也会把李斯的档读进项羽对局。
   * 现在一律由调用方传入 scenKey（主页为 selScen，对局内为当前剧本 id）。 */
  function loadGameSave(scenKey){
    if (!scenKey) return null;
    try { var s = JSON.parse(localStorage.getItem('qingshi_save_v1_' + scenKey)); if (s && s.diffKey && s.snapshot) return s; }
    catch(e){ warnStorage('读取存档失败'); }
    return null;
  }
  function clearGameSave(scenKey){
    if (!scenKey) return;
    try { localStorage.removeItem('qingshi_save_v1_' + scenKey); } catch(e){ warnStorage('清除存档失败'); }
  }

  /* ---------- 配音朗读（Web Speech API；不支持时按钮隐藏、全域静默降级） ---------- */
  var tts = {
    supported: (typeof window.speechSynthesis !== 'undefined') && (typeof window.SpeechSynthesisUtterance !== 'undefined'),
    on: false, rate: 1.1
  };
  var TTS_KEY = 'qingshi_tts_v1';
  function loadTts(){
    try {
      var s = JSON.parse(localStorage.getItem(TTS_KEY));
      if (s){ tts.on = !!s.on; if (s.rate === 0.9 || s.rate === 1.1) tts.rate = s.rate; }
    } catch(e){}
  }
  function saveTts(){ try { localStorage.setItem(TTS_KEY, JSON.stringify({ on: tts.on, rate: tts.rate })); } catch(e){} }
  function ttsCancel(){ if (tts.supported) try { window.speechSynthesis.cancel(); } catch(e){} }
  function ttsSpeak(text){
    if (!tts.supported || !tts.on || !text) return;
    try {
      var u = new SpeechSynthesisUtterance(text);
      u.lang = 'zh-CN'; u.rate = tts.rate;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    } catch(e){}
  }
  /* 朗读当前叙事页：拼接主区可见纯文本（跳过按钮；选项区在 #options，天然不入） */
  function speakMain(){
    if (!tts.on) return;
    var parts = [];
    for (var i = 0; i < main.children.length; i++){
      var n = main.children[i];
      if (n.tagName === 'BUTTON') continue;
      var t = n.textContent;
      if (t) parts.push(t);
    }
    ttsSpeak(parts.join('。'));
  }
  function refreshTtsBtns(){
    var bT = document.getElementById('btnTts'), bR = document.getElementById('btnTtsRate');
    if (!tts.supported){ bT.style.display='none'; bR.style.display='none'; return; }
    bT.textContent = tts.on ? '🔊' : '🔇';
    bR.style.display = tts.on ? '' : 'none';
    bR.textContent = tts.rate < 1 ? '慢' : '常';
  }

  /* ---------- 顶栏 ---------- */
  function refreshTop(){
    document.getElementById('topbar').style.display='';
    document.getElementById('app').classList.remove('home-hero');
    var ch = game.chapter();
    var title = ch ? ch.title : '';
    // 章内进度（GDD 3.3）：回合/事件阶段显示「章节名 · 事件 x/n」，际遇/危机插入不计（引擎口径）
    if (ch && (game.phase === 'round' || game.phase === 'event')){
      var prog = game.chapterProgress();
      title += ' · 事件 ' + prog.done + '/' + prog.total;
    }
    document.getElementById('chapTitle').textContent = title;
    var band = game.devBand();
    var bd = game.d.DEV_BANDS[band];
    var fill = document.getElementById('devFill');
    fill.style.width = game.dev + '%';
    fill.style.background = bd.color;
    var bandEl = document.getElementById('devBand');
    bandEl.textContent = bd.name;
    bandEl.style.color = bd.color;
    document.getElementById('devSeal').src = 'assets/icons/icon_dev' + (band + 1) + '.png';
    var btnB = document.getElementById('btnBack');
    btnB.disabled = !game.canBacktrack();
    btnB.textContent = game.diff.backtrack>0 ? ('回溯 '+ (game.diff.backtrack - game.backtracksThisChapter)) : '回溯';
  }
