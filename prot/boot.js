/* js/boot.js —— 剧本注册、初始化与全部顶层事件绑定（自 index.html 内联脚本原样搬移，行为零变化） */

  /* 剧本注册表（多剧本架构）：key = 剧本 id */
  var SCENARIOS = { lisi: window.GAME_DATA, jingke: window.JINGKE_DATA, hanxin: window.HANXIN_DATA, xiangyu: window.XIANGYU_DATA, chensheng: window.CHENSHENG_DATA };

  loadTts();

  document.getElementById('btnTts').onclick = function(){
    tts.on = !tts.on; saveTts(); refreshTtsBtns();
    if (tts.on) speakMain(); else ttsCancel();
  };
  document.getElementById('btnTtsRate').onclick = function(){
    tts.rate = (tts.rate < 1) ? 1.1 : 0.9;   // 两档循环：慢 0.9 / 常 1.1
    saveTts(); refreshTtsBtns();
  };

  document.getElementById('btnAttrs').onclick = function(){ openDrawer('attrs'); };
  document.getElementById('btnGloss').onclick = function(){ if (game) openDrawer('gloss'); };
  document.getElementById('drawerMask').onclick = closeMasks;
  /* 回溯确认态（UI 页面清单要求）：回溯会消耗本章额度且改写时间线，需二次确认 */
  document.getElementById('btnBack').onclick = function(){
    if (!game || !game.canBacktrack()) return;
    var left = game.diff.backtrack > 0 ? (game.diff.backtrack - game.backtracksThisChapter) : 0;
    var msg = '回溯到本章开头？\n\n· 剩余额度 ' + (game.diff.backtrack > 0 ? left : '不限') + ' 次\n· 本章进度将回到开头，偏离度与已解锁的成就、图鉴不会重置\n· 蓄势与险招烧毁会被清空';
    if (!window.confirm(msg)) return;
    game.backtrack(); renderIntro(true);
  };

  document.getElementById('glossClose').onclick = closeMasks;
  document.getElementById('glossMask').onclick = function(e){ if (e.target === this) closeMasks(); };

  bindGloss(main);
  bindGloss(document.getElementById('settleText'));

  document.getElementById('shareClose').onclick = closeMasks;
  document.getElementById('shareMask').onclick = function(e){ if (e.target === this) closeMasks(); };

  /* v2.0.7：Esc 关闭浮层。此前四层浮层只能点遮罩，键盘用户无路可退。
   * 结算浮层（#overlay）刻意不在此列——它是流程中的一步，Esc 跳过会吞掉结算与成就。 */
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape' && e.key !== 'Esc') return;
    if (document.getElementById('shareMask').className === 'open'
      || document.getElementById('glossMask').className === 'open'
      || document.getElementById('drawer').className === 'open') {
      closeMasks();
    }
  });

  refreshTtsBtns();
  renderHome();
