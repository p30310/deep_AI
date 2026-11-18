/* ============================================================
 * 背单词365 · pet.js
 * 桌宠「单词小鲸鱼」：右下角浮动、可拖动（记忆位置）、
 * 单击弹气泡卡、右键弹菜单卡；每评完一个词吃一口。
 * ============================================================ */
(function (global) {
  'use strict';

  var db = null;
  var wrap = null;
  var bubble = null;
  var menu = null;
  var mounted = false;
  var bubbleTimer = null;
  var drag = null;

  function level() { return Math.floor((db.petState.totalBites || 0) / 120) + 1; }
  function target() { return (db.settings && db.settings.freshLimit) || 20; }

  /** 今日口数：按天计数（petState.today={date,count}，跨天自动重置）；等级仍按终身累计 totalBites */
  function todayCount() {
    var dk = global.Core.dayKey();
    var t = db.petState.today;
    if (!t || t.date !== dk) {
      db.petState.today = { date: dk, count: 0 };
      return 0;
    }
    return t.count || 0;
  }

  function addToday(n) {
    todayCount(); // 确保跨天已重置
    db.petState.today.count = Math.max(0, (db.petState.today.count || 0) + n);
  }

  var WHALE_SVG =
    '<svg viewBox="0 0 100 100" aria-hidden="true">' +
      '<ellipse class="pet-body" cx="48" cy="55" rx="34" ry="24" fill="#7cc4e8"/>' +
      '<ellipse cx="48" cy="55" rx="34" ry="24" fill="none" stroke="#4f9bc9" stroke-width="2"/>' +
      '<path class="pet-tail" d="M80 55 q12 -14 14 -2 q-2 2 -2 2 q0 0 2 2 q-2 12 -14 -2z" fill="#6ab3d8"/>' +
      '<path class="pet-mouth" d="M34 62 q10 8 22 0" stroke="#2d6f96" stroke-width="2.4" fill="none" stroke-linecap="round"/>' +
      '<circle cx="38" cy="48" r="3.4" fill="#1d3d52"/>' +
      '<circle cx="39" cy="47" r="1.2" fill="#fff"/>' +
      '<path d="M44 32 q6 -8 12 -1" stroke="#4f9bc9" stroke-width="2.5" fill="none" stroke-linecap="round"/>' +
      '<ellipse cx="52" cy="66" rx="12" ry="7" fill="#a9d9ef"/>' +
    '</svg>';

  function defaultPos() {
    return { x: window.innerWidth - 120, y: window.innerHeight - 160 };
  }

  function applyPos() {
    if (!wrap) { return; }
    var pos = db.petState.pos || defaultPos();
    var maxX = window.innerWidth - 90;
    var maxY = window.innerHeight - 90;
    wrap.style.left = Math.max(4, Math.min(pos.x, maxX)) + 'px';
    wrap.style.top = Math.max(4, Math.min(pos.y, maxY)) + 'px';
  }

  function mount() {
    if (mounted) { return; }
    var root = document.getElementById('petRoot');
    if (!root) { return; }
    wrap = document.createElement('div');
    wrap.className = 'pet-wrap';
    wrap.id = 'petWhale';
    wrap.title = '单词小鲸鱼';
    wrap.innerHTML = WHALE_SVG;
    root.appendChild(wrap);
    mounted = true;
    applyPos();
    bindEvents();
  }

  function unmount() {
    if (!mounted) { return; }
    hideBubble();
    hideMenu();
    if (wrap && wrap.parentNode) { wrap.parentNode.removeChild(wrap); }
    wrap = null;
    mounted = false;
  }

  function bindEvents() {
    wrap.addEventListener('pointerdown', function (e) {
      if (e.button === 2) { return; }
      var pos = db.petState.pos || defaultPos();
      drag = { sx: e.clientX, sy: e.clientY, ox: pos.x, oy: pos.y, moved: false };
      wrap.setPointerCapture(e.pointerId);
    });
    wrap.addEventListener('pointermove', function (e) {
      if (!drag) { return; }
      var dx = e.clientX - drag.sx;
      var dy = e.clientY - drag.sy;
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) { drag.moved = true; }
      db.petState.pos = { x: drag.ox + dx, y: drag.oy + dy };
      applyPos();
    });
    wrap.addEventListener('pointerup', function () {
      if (!drag) { return; }
      if (drag.moved) {
        global.Core.saveDB(db); // 拖动后保存位置
      } else {
        showBubble();
      }
      drag = null;
    });
    wrap.addEventListener('contextmenu', function (e) {
      e.preventDefault();
      showMenu();
    });
    window.addEventListener('resize', applyPos);
    document.addEventListener('click', function (e) {
      if (menu && !e.target.closest('.pet-menu') && !e.target.closest('.pet-wrap')) { hideMenu(); }
    });
  }

  function hideBubble() {
    if (bubble && bubble.parentNode) { bubble.parentNode.removeChild(bubble); }
    bubble = null;
    if (bubbleTimer) { clearTimeout(bubbleTimer); bubbleTimer = null; }
  }

  function showBubble() {
    hideMenu();
    hideBubble();
    var bites = todayCount();
    var fed = bites >= target();
    bubble = document.createElement('div');
    bubble.className = 'pet-bubble';
    bubble.setAttribute('role', 'status');
    bubble.innerHTML = fed
      ? '<div class="pb-title">吃饱啦 · Lv.' + level() + '</div>' +
        '<div>今天的口数 ' + bites + ' / 目标 ' + target() + '</div>'
      : '<div class="pb-title">今天的口数 ' + bites + ' / 目标 ' + target() + '</div>' +
        '<div>再喂 ' + Math.max(0, target() - bites) + ' 口就饱啦（Lv.' + level() + '）</div>';
    if (!wrap) { return; }
    var r = wrap.getBoundingClientRect();
    bubble.style.left = Math.max(6, r.left - 40) + 'px';
    bubble.style.top = Math.max(6, r.top - 84) + 'px';
    document.body.appendChild(bubble);
    bubbleTimer = setTimeout(hideBubble, 3000);
  }

  function hideMenu() {
    if (menu && menu.parentNode) { menu.parentNode.removeChild(menu); }
    menu = null;
  }

  function showMenu() {
    hideBubble();
    hideMenu();
    menu = document.createElement('div');
    menu.className = 'pet-menu';
    menu.innerHTML =
      '<div class="pm-row" style="pointer-events:none;color:var(--ink-faint)">今天的口数 ' +
        todayCount() + ' / 目标 ' + target() + ' · 累计 Lv.' + level() + '</div>' +
      '<button class="pm-row" data-pm="reset">重置位置</button>' +
      '<button class="pm-row" data-pm="bite">喂一口（演示）</button>' +
      '<button class="pm-row" data-pm="off">关闭桌宠</button>';
    document.body.appendChild(menu);
    var r = wrap.getBoundingClientRect();
    menu.style.left = Math.max(6, r.left - 30) + 'px';
    menu.style.top = Math.max(6, r.top - 130) + 'px';
    menu.querySelectorAll('[data-pm]').forEach(function (el) {
      el.addEventListener('click', function () {
        var act = el.getAttribute('data-pm');
        if (act === 'reset') {
          db.petState.pos = null;
          global.Core.saveDB(db);
          applyPos();
        } else if (act === 'bite') {
          bite();
        } else if (act === 'off') {
          setEnabled(false);
        }
        hideMenu();
      });
    });
  }

  /** 评完一个词吃一口：今日口数+1、张嘴摆尾 + 「+1」浮动 */
  function bite() {
    if (!db || !db.settings.pet) { return; }
    db.petState.totalBites = (db.petState.totalBites || 0) + 1;
    addToday(1);
    global.Core.saveDB(db);
    if (!mounted) { return; }
    if (bubble) { showBubble(); }
    wrap.classList.remove('eat');
    // 强制重启动画
    void wrap.offsetWidth;
    wrap.classList.add('eat');
    setTimeout(function () { wrap.classList.remove('eat'); }, 900);
    var plus = document.createElement('span');
    plus.className = 'pet-plus';
    plus.textContent = '+1';
    wrap.appendChild(plus);
    setTimeout(function () { if (plus.parentNode) { plus.parentNode.removeChild(plus); } }, 1000);
  }

  /** 撤销评级时回退一口（今日口数与累计同步回退） */
  function unbite() {
    if (!db) { return; }
    db.petState.totalBites = Math.max(0, (db.petState.totalBites || 0) - 1);
    addToday(-1);
    global.Core.saveDB(db);
    if (bubble) { showBubble(); }
  }

  function setEnabled(on) {
    if (db) {
      db.settings.pet = !!on;
      global.Core.saveDB(db);
    }
    if (on) { mount(); } else { unmount(); }
  }

  var Pet = {
    /** 应用启动时调用：传入整库 */
    init: function (database) {
      db = database;
      if (!db.petState) { db.petState = { totalBites: 0, pos: null }; }
      if (db.settings && db.settings.pet) { mount(); } else { unmount(); }
    },
    bite: bite,
    unbite: unbite,
    setEnabled: setEnabled,
    level: level
  };

  global.Pet = Pet;
  if (typeof module !== 'undefined' && module.exports) { module.exports = Pet; }
})(typeof window !== 'undefined' ? window : globalThis);
