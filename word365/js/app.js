/* ============================================================
 * 背单词365 · app.js
 * 视图层与交互：路由、首页、词书、学习四模式、错词本、统计、我的。
 * 纯逻辑全部在 core.js，本文件只做 DOM 编排。
 * ============================================================ */
(function () {
  'use strict';

  /* ---------- 启动数据 ---------- */

  var BOOK_DEFS = [
    window.W365_BOOK_CET4,
    window.W365_BOOK_CET6,
    window.W365_BOOK_KAOYAN,
    window.W365_BOOK_IELTS,
    window.W365_BOOK_JOB
  ];

  var db = Core.loadDB();
  Core.seedBooks(db, BOOK_DEFS);
  Core.ensureSchema(db);   // J-AC5：补齐阶段一新增键（旧库/导入后首次打开）
  Core.updateLastSeen(db); // C-AC7：打开即更新 lastSeen；回归日在此一次性决策重建包
  Core.saveDB(db);

  /* ---------- 索引 ---------- */

  // 内置词库索引（自制词书粘贴单词表时优先匹配）
  var BUILTIN_INDEX = {};
  BOOK_DEFS.forEach(function (b) {
    b.words.forEach(function (e) { BUILTIN_INDEX[Core.norm(e.w)] = e; });
  });

  // 全量词条索引：norm(w) → {entry, book}（含自制词书，变更后重建）
  var ALL_ENTRY_MAP = {};
  function rebuildIndex() {
    ALL_ENTRY_MAP = {};
    Core.allBooks(db).forEach(function (b) {
      (b.words || []).forEach(function (e) {
        if (!ALL_ENTRY_MAP[Core.norm(e.w)]) { ALL_ENTRY_MAP[Core.norm(e.w)] = { entry: e, book: b }; }
      });
    });
  }
  rebuildIndex();

  /** 由进度记录反查词条（词被删书时给出占位） */
  function entryForWord(w) {
    var hit = ALL_ENTRY_MAP[Core.norm(w)];
    if (hit) { return hit.entry; }
    return { w: Core.norm(w), p: '', t: '', e: '', et: '' };
  }

  /* ---------- 小工具 ---------- */

  function $(sel) { return document.querySelector(sel); }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function recOf(w) { return db.words[Core.wordKey(w)] || null; }

  var RATE_TEXT = { know: '认识', fuzzy: '模糊', unknown: '不认识' };

  function statusBadge(w) {
    var st = Core.statusOf(db, w);
    var rec = recOf(w);
    var extra = '';
    if (rec && rec.wrong > 0) { extra = '<span class="badge st-wrong">错词</span> '; }
    if (rec && rec.star) { extra += '<span class="badge st-star">★ 星标</span>'; }
    return '<span class="badge st-' + st + '">' + Core.STATUS_TEXT[st] + '</span> ' + extra;
  }

  function toast(msg) {
    var el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { el.classList.remove('show'); }, 2200);
  }

  /* ---------- 弹窗 ---------- */

  function modalOpen() { return !!$('#modalRoot .modal-mask'); }

  function openModal(innerHtml) {
    $('#modalRoot').innerHTML =
      '<div class="modal-mask">' +
      '<div class="modal" role="dialog" aria-modal="true">' +
      '<button class="modal-close" data-modal-close aria-label="关闭">✕</button>' +
      innerHtml +
      '</div></div>';
    $('#modalRoot .modal-mask').addEventListener('click', function (e) {
      if (e.target === e.currentTarget || e.target.closest('[data-modal-close]')) { closeModal(); }
    });
  }

  function closeModal() {
    $('#modalRoot').innerHTML = '';
    if (state.session && state.session.mode === 'type') {
      var inp = $('#typeInput');
      if (inp) { inp.focus(); }
    }
  }

  /* ---------- 发音 ---------- */

  function localSpeak(text) {
    try {
      var u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-US';
      u.rate = db.settings.rate || 1.0;
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
    } catch (e) { /* 浏览器不支持时静默 */ }
  }

  /** 单词发音：有道 TTS（type=2 美音 / type=1 英音），口音关闭则不发声 */
  function speakWord(word) {
    if (db.settings.accent === 'off') { return; }
    var type = db.settings.accent === 'uk' ? 1 : 2;
    var url = 'https://dict.youdao.com/dictvoice?audio=' + encodeURIComponent(word) + '&type=' + type;
    try {
      var audio = new Audio(url);
      audio.onerror = function () {
        toast('发音加载失败，已切到本机朗读');
        localSpeak(word);
      };
      audio.play().catch(function () {
        toast('发音加载失败，已切到本机朗读');
        localSpeak(word);
      });
    } catch (e) { localSpeak(word); }
  }

  /** #023 听写模式专用：口音设为「关闭」时仍要出声，否则提示为空 → 回退本机朗读 */
  function speakForDictation(word) {
    if (db.settings.accent === 'off') { localSpeak(word); return; }
    speakWord(word);
  }

  function speakSentence(text) { localSpeak(text); }

  var SVG_SPEAKER = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 10v4h4l5 4V6L7 10H3z" fill="currentColor"/><path d="M16 8.5a5 5 0 010 7M18.5 6a8.5 8.5 0 010 12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
  var SVG_STAR_ON = '★';
  var SVG_STAR_OFF = '☆';

  /* ---------- 全局状态 ---------- */

  var state = {
    returnHash: '#/learn',   // 进入学习页前的来源路由
    pendingWords: null,      // 错词本等入口指定的词单（entry 数组）
    session: null,           // 当前学习会话
    timers: [],              // 需随路由销毁的定时器
    matchTimer: null
  };

  function addTimer(id) { state.timers.push(id); return id; }
  function clearTimers() {
    state.timers.forEach(function (t) { clearTimeout(t); clearInterval(t); });
    state.timers = [];
    if (state.matchTimer) { clearInterval(state.matchTimer); state.matchTimer = null; }
  }

  /* ---------- 路由 ---------- */

  function parseRoute() {
    var hash = location.hash || '#/learn';
    var m = hash.match(/^#\/study\?(.*)$/);
    if (m) {
      var params = {};
      m[1].split('&').forEach(function (kv) {
        var p = kv.split('=');
        params[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || '');
      });
      return { name: 'study', params: params };
    }
    m = hash.match(/^#\/book\/([^?]+)$/);
    if (m) { return { name: 'book', params: { key: decodeURIComponent(m[1]) } }; }
    m = hash.match(/^#\/([a-z]+)$/);
    if (m) { return { name: m[1], params: {} }; }
    return { name: 'learn', params: {} };
  }

  function nav(hash) {
    if (location.hash === hash) { render(); }
    else { location.hash = hash; }
  }

  function render() {
    // 弹层已关但挑战会话残留（浏览器后退 / 外部关闭）→ 清掉，避免留下可作答的孤儿状态
    if (state.challengeFlow && !modalOpen()) { state.challengeFlow = null; }
    var route = parseRoute();
    clearTimers();

    // 导航高亮
    var navKey = route.name === 'book' ? 'books' : (route.name === 'wrong' ? 'learn' : route.name);
    document.querySelectorAll('#mainNav .nav-link').forEach(function (a) {
      if (a.getAttribute('data-nav') === navKey) { a.setAttribute('aria-current', 'page'); }
      else { a.removeAttribute('aria-current'); }
    });

    switch (route.name) {
      case 'learn': destroySession(); renderHome(); break;
      case 'books': destroySession(); renderBooks(); break;
      case 'book': destroySession(); renderBookDetail(route.params.key); break;
      case 'study': renderStudy(route.params); break;
      case 'wrong': destroySession(); renderWrong(); break;
      case 'stats': destroySession(); renderStats(); break;
      case 'mine': destroySession(); renderMine(); break;
      case 'onboard': destroySession(); renderOnboard(); break;
      default: destroySession(); renderHome();
    }
  }

  function destroySession() {
    state.session = null;
    state.pendingWords = null;
    clearTimers();
  }

  /* ---------- #025 今日挑战（D-048/D-049）----------
   * 文案：PHRASES.CHALLENGE（G1 唯一真源）；状态：Core.challengeState().mode（四态，不自行拼条件）；
   * 视觉：G5 v2（整卡一个 button、无红块、无点阵成绩单）；挑战全程不写 SRS。
   * ------------------------------------------------------------------ */

  function challengeDots(n, doneCount, currentIdx) {
    // 装饰性点阵：进度已由「第 i / N 题」文字播报，再给 role=img 会重复读一遍（G5 建议，采纳）
    var html = '<span class="cc-dots" aria-hidden="true">';
    for (var i = 0; i < n; i++) {
      var cls = 'cc-dot';
      if (i < doneCount) { cls += ' is-done'; }
      else if (typeof currentIdx === 'number' && i === currentIdx) { cls += ' is-current'; }
      html += '<span class="' + cls + '" aria-hidden="true"></span>';
    }
    return html + '</span>';
  }

  function challengeCardHtml() {
    var P = window.PHRASES.CHALLENGE;
    var st = Core.challengeState(db);
    var tag = 'div';
    var attrs = '';
    var aria = '';
    var sub = '';
    var right = '';

    if (st.mode === 'ready') {
      var n = st.size;                       // G1 v1.2：n = min(5, poolSize)
      sub = '<span class="cc-sub">' + esc(n < 5 ? P.subShort(n) : P.sub) + '</span>';
      // G1 否决卡面点阵：完成态「5 个实心点」会被读成 5/5，点阵只留在覆层题头
      right = '<span class="btn cc-cta" aria-hidden="true">' + esc(P.start) + '</span>';
      tag = 'button';
      attrs = ' type="button" data-act="challenge-open"';
      // G1 逐字：满 5 时「开始挑战：5 个词」，不足 5 时才用「今天有 n 个词」
      aria = ' aria-label="' + esc(P.start + '：' + (n >= 5 ? n + ' 个词' : '今天有 ' + n + ' 个词')) + '"';
    } else if (st.mode === 'not-enough') {
      sub = '<span class="cc-sub">' + esc(P.notEnough) + '</span>';
      right = '<span class="btn cc-cta" aria-hidden="true">' + esc(P.start) + '</span>';
      tag = 'button';
      // G5 v4：不用原生 disabled（会把原因从 Tab 序列里摘掉），改 aria-disabled；无 data-act 即不绑事件
      attrs = ' type="button" aria-disabled="true"';
      aria = ' aria-label="' + esc(P.start + '：' + P.notEnough) + '"';
    } else if (st.mode === 'empty') {
      sub = '<span class="cc-sub">' + esc(P.empty) +
        '<span class="cc-hint">' + esc(P.emptyHint) + '</span></span>';
    } else {
      sub = '<span class="cc-sub">' + esc(P.done(st.size)) + '</span>';
      right = '';
    }

    // 非 button 态（done/empty/not-enough）给 tabindex="-1"：可被程序聚焦，不进 Tab 序列
    var tabAttr = tag === 'button' ? '' : ' tabindex="-1"';
    return '<' + tag + ' class="challenge-card is-' + st.mode + '"' + attrs + tabAttr + aria + '>' +
      '<span class="cc-title">' + esc(P.title) + '</span>' + sub + right +
      '</' + tag + '>';
  }

  function openChallenge() {
    var P = window.PHRASES.CHALLENGE;
    var at = Core.now();
    var start = Core.challengeStart(db, at);
    if (!start.ok) {
      toast(start.reason === 'not-enough' ? P.notEnough : P.empty);
      return;
    }
    if (start.replayed) { toast(P.done(start.size)); return; }
    state.challengeFlow = { at: at, dateKey: start.dateKey, keys: start.keys, idx: 0, results: [], graded: null, current: null };
    renderChallengeQuestion();
  }

  function renderChallengeQuestion() {
    var f = state.challengeFlow;
    if (!f) { return; }
    if (f.idx >= f.keys.length) { finishChallenge(); return; }
    var P = window.PHRASES.CHALLENGE;
    var q = Core.challengeQuestion(db, f.keys[f.idx], f.dateKey);
    if (!q) { f.idx += 1; renderChallengeQuestion(); return; }
    f.current = q;

    var isLast = f.idx === f.keys.length - 1;
    var graded = f.graded;
    var opts = q.options.map(function (o) {
      var cls = 'ch-opt';
      if (graded) {
        if (o.i === q.answerIdx) { cls += ' is-correct'; }
        else if (o.i === graded.picked) { cls += ' is-picked-wrong'; }
        else { cls += ' is-dim'; }
      }
      var mark = '';
      if (graded && o.i === q.answerIdx) { mark = '<span class="ch-mark">✓</span>'; }
      if (graded && o.i === graded.picked && !graded.ok) { mark = '<span class="ch-mark">✕</span>'; }
      return '<button type="button" class="' + cls + '" data-ch-idx="' + o.i + '"' +
        (graded ? ' disabled' : '') +
        ' aria-label="' + esc(P.optionAria(o.i + 1, o.w)) + '">' +
        '<span class="co-key">' + (o.i + 1) + '</span>' +
        '<span class="ch-word">' + esc(o.w) + '</span>' + mark + '</button>';
    }).join('');

    var fb = '';
    if (graded) {
      fb = graded.ok
        ? '<span class="ch-fb-good">' + esc(P.right) + '</span>' +
          '<span class="ch-fb-detail">' + esc(P.rightDetail(q.w, q.prompt)) + '</span>'
        : '<span class="ch-fb-detail">' + esc(P.wrongDetail(q.w, q.prompt)) + '</span>';
    }

    openModal(
      '<div class="ch-modal">' +
        '<div class="ch-head">' +
          '<span class="ch-step">' + esc(P.qLabel(f.idx + 1, f.keys.length)) + '</span>' +
          '<span class="ch-steps">' + challengeDots(f.keys.length, f.idx, f.idx) + '</span>' +
          '<button class="btn ch-quit" data-ch-quit>' + esc(P.quit) + '</button>' +
        '</div>' +
        '<div class="ch-prompt">' +
          '<span class="ch-ask">' + esc(P.ask) + '</span>' +
          '<span class="ch-meaning">' + esc(q.prompt) + '</span>' +
        '</div>' +
        '<div class="ch-opts">' + opts + '</div>' +
        '<div class="ch-feedback" aria-live="polite">' + fb + '</div>' +
        '<div class="ch-foot">' +
          '<span class="ch-quit-hint">' + esc(P.quitHint) + '</span>' +
          '<button class="btn ch-next" data-ch-next' + (graded ? '' : ' disabled') + '>' +
            esc(isLast ? P.last : P.next) + '</button>' +
        '</div>' +
      '</div>'
    );

    var closeX = $('#modalRoot .modal-close');
    if (closeX) { closeX.hidden = true; }
    var mask = $('#modalRoot .modal-mask');
    if (mask) { mask.addEventListener('click', function (ev) { if (ev.target === mask) { quitChallenge(); } }); }

    document.querySelectorAll('[data-ch-idx]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        answerChallenge(Number(btn.getAttribute('data-ch-idx')));
      });
    });
    // 答完后四项已 disabled，聚焦首选项会落空 → 焦点必须给「下一题」（G10 F02）
    var focusTarget = graded ? $('#modalRoot [data-ch-next]') : $('#modalRoot .ch-opt');
    if (focusTarget && typeof focusTarget.focus === 'function') { focusTarget.focus(); }
    var quit = $('[data-ch-quit]');
    if (quit) { quit.addEventListener('click', quitChallenge); }
    var next = $('[data-ch-next]');
    if (next) {
      next.addEventListener('click', advanceChallenge);
    }
  }

  function advanceChallenge() {
    var f = state.challengeFlow;
    if (!f || !f.graded) { return; }
    f.idx += 1;
    f.graded = null;
    f.current = null;
    renderChallengeQuestion();
  }

  function answerChallenge(picked) {
    var f = state.challengeFlow;
    if (!f || f.graded || !f.current) { return; }
    var g = Core.challengeGrade(f.current, picked);
    f.results.push({ key: f.current.key, ok: g.ok });
    f.graded = { picked: picked, ok: g.ok };
    renderChallengeQuestion();
  }

  /**
   * 挑战覆层的唯一退出收口（G5 §9-3 / G1 G3）：
   * 遮罩点击 / Esc / 「先合上」三条路径都走这里——清 flow、必要时 toast、焦点回入口卡。
   * 结果页（flow 已清）调用时只关闭、不 toast。
   */
  function quitChallenge() {
    var hadFlow = !!state.challengeFlow;
    state.challengeFlow = null;
    closeModal();
    if (hadFlow) { toast(window.PHRASES.CHALLENGE.quitToast); }
    focusChallengeCard();
  }

  /** 关闭后把焦点还给入口卡（G5 §9-2） */
  function focusChallengeCard() {
    // 卡片本体在所有五态都存在（ready 是 button，其余是 tabindex=-1 的 div），优先它
    var el = $('.challenge-card') || $('[data-act="challenge-open"]');
    if (el && typeof el.focus === 'function') { el.focus(); }
  }

  function finishChallenge() {
    var f = state.challengeFlow;
    if (!f) { return; }
    var P = window.PHRASES.CHALLENGE;
    var sum = Core.challengeSummarize(f.dateKey, f.keys.length, f.results, f.at);
    Core.commitChallenge(db, sum);
    Core.saveDB(db);
    state.challengeFlow = null;
    // G1 v1.4：三支互斥——全对 / 全错 / 部分对；后两支不得渲染 0 或 n
    var closeX = null;
    var line = sum.kept === sum.size
      ? P.resultAll(sum.size)
      : (sum.kept === 0 ? P.resultNone(sum.size) : P.resultPart(sum.size, sum.kept));
    openModal(
      '<div class="ch-modal ch-result" aria-live="polite">' +
        '<p class="ch-result-line">' + esc(line) + '</p>' +
        '<div class="ch-result-foot">' +
          '<button class="btn" id="chResultClose">' + esc(P.close) + '</button>' +
        '</div>' +
      '</div>'
    );
    closeX = $('#modalRoot .modal-close');
    if (closeX) { closeX.hidden = true; }
    var mask = $('#modalRoot .modal-mask');
    if (mask) { mask.addEventListener('click', function (ev) { if (ev.target === mask) { quitChallenge(); } }); }
    var resClose = $('#chResultClose');
    if (resClose) {
      resClose.addEventListener('click', function () { closeModal(); focusChallengeCard(); });
    }
    render();
    // 开 → 焦点进对话框（否则 Tab 到不了「合上」）；关 → 回卡片，方向成对
    if (resClose && typeof resClose.focus === 'function') { resClose.focus(); }
    else { focusChallengeCard(); }
  }

  /* ---------- 视图：首页 ---------- */

  function renderHome() {
    var allRecs = Object.keys(db.words).map(function (k) { return db.words[k]; });
    var plan = Core.todayPlan(db, allRecs);
    var planTotal = plan.reviews.length + plan.freshs.length;
    var day = db.days[Core.dayKey()] || { total: 0 };
    var done = day.total || 0;
    var denom = planTotal + done;
    var pct = denom > 0 ? done / denom : 0;
    var C = 2 * Math.PI * 54;
    var stats = Core.stats(db);
    var wrongCnt = stats.wrongCount;
    var P = window.PHRASES;

    // 条目 1：hero 标题（已设备考目标则显示倒计时）
    var heroTitle = (db.goal.type !== 'free' && db.goal.deadline)
      ? P.HOME.heroTitleWithExam(db.plan.daysLeft)
      : P.HOME.heroTitleDefault;

    // 条目 2/3/6：plan-nums、重建区块、主文案（三态）
    var planNumsHtml = '';
    var rebuildHtml = '';
    var mainCopyHtml = '';
    if (plan.mode === 'rebuild') {
      var rbCount = plan.rebuildWords.length;
      var remaining = Math.max(0, (db.returnGuard.backlogCount || 0) - rbCount);
      planNumsHtml = P.HOME.rebuildNums(rbCount, remaining, db.returnGuard.spreadDays || 3);
      mainCopyHtml = '<div class="return-main" role="status">' + esc(P.HOME.returnMain) + '</div>';
      var rbItems = plan.rebuildWords.slice(0, 14).map(function (r) {
        return '<span class="rebuild-item">' + esc(r.w) + '</span>';
      }).join('');
      rebuildHtml =
        '<div class="rebuild-block">' +
          '<div class="rebuild-title">今日重建任务</div>' +
          (rbItems ? '<div class="rebuild-list">' + rbItems + '</div>' : '') +
        '</div>';
    } else if (plan.mode === 'pause') {
      planNumsHtml = P.HOME.pauseNums(plan.reviews.length);
      mainCopyHtml = '<div class="pause-main" role="status">' + esc(P.HOME.pauseText) + '</div>';
    } else {
      planNumsHtml = P.HOME.normalNums(plan.freshs.length, plan.reviews.length, planTotal);
    }

    // 条目 7：六要素可解释计划卡（I-AC2）
    // 缺口 A：计划卡「每日新学」封顶到本机 freshLimit，与今日实际一致；
    // 原定值高于上限时，卡片底部加一行封顶说明小字（PLAN_MODE.capNote）。
    var planCardHtml = '';
    if (db.plan.derivedAt > 0) {
      var freshLimitA = db.settings.freshLimit;
      var shownFreshA = Core.planCardDailyFresh(db.plan, freshLimitA);
      var shownPlanA = db.plan;
      if (shownFreshA !== db.plan.dailyFresh) {
        shownPlanA = Core.clone(db.plan);
        shownPlanA.dailyFresh = shownFreshA;
      }
      planCardHtml = '<div class="plan-card">' + esc(P.HOME.planCard(shownPlanA)) + '</div>';
      if (db.plan.dailyFresh > freshLimitA) {
        planCardHtml += '<div class="plan-cap-note muted">' +
          esc(P.PLAN_MODE.capNote(db.plan.dailyFresh, freshLimitA)) + '</div>';
      }
    }

    // 条目 4：主按钮（未完成目标三问 → 引导；否则开始学习）
    var startLabel = db.onboarding.completed ? P.HOME.startLearn : P.HOME.startPlanCta;
    var startHash = db.onboarding.completed ? '#/study?scope=today&mode=flash' : '#/onboard';

    var bookCards = Core.allBooks(db).map(function (b) {
      var pr = Core.bookProgress(db, b);
      var p = pr.total > 0 ? Math.round(pr.learned / pr.total * 100) : 0;
      return '<button class="entry-card" data-nav-book="' + esc(b.key) + '">' +
        '<span><span class="ec-name">' + esc(b.name) + '</span>' +
        '<span class="ec-sub">' + pr.learned + ' / ' + pr.total + ' 已学</span></span>' +
        '<span class="badge">' + p + '%</span></button>';
    }).join('');

    $('#view').innerHTML =
      '<div class="card home-hero">' +
        '<div class="ring-wrap">' +
          '<svg width="150" height="150" viewBox="0 0 150 150">' +
            '<circle cx="75" cy="75" r="54" fill="none" stroke="var(--bg-soft)" stroke-width="12"/>' +
            '<circle cx="75" cy="75" r="54" fill="none" stroke="var(--brand)" stroke-width="12" stroke-linecap="round"' +
              ' stroke-dasharray="' + C.toFixed(1) + '" stroke-dashoffset="' + (C * (1 - pct)).toFixed(1) + '"' +
              ' transform="rotate(-90 75 75)" style="transition:stroke-dashoffset .5s"/>' +
            '<text x="75" y="72" text-anchor="middle" class="ring-num">' + Math.round(pct * 100) + '%</text>' +
            '<text x="75" y="92" text-anchor="middle" class="ring-sub">今日已完成 ' + done + '</text>' +
          '</svg>' +
        '</div>' +
        '<div class="home-plan">' +
          '<h2>' + esc(heroTitle) + '</h2>' +
          '<div class="plan-nums">' + esc(planNumsHtml) + '</div>' +
          mainCopyHtml +
          planCardHtml +
          '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:6px">' +
            '<button class="btn btn-primary" data-act="start-today">' + esc(startLabel) + '</button>' +
            '<button class="btn" data-act="goto-wrong">错词本（' + wrongCnt + '）</button>' +
          '</div>' +
          '<div class="muted" style="margin-top:10px">连续学习 ' + stats.streak + ' 天 · 已学 ' + stats.learned + ' 词</div>' +
        '</div>' +
      '</div>' +
      rebuildHtml +
      challengeCardHtml() +
      '<div class="section-gap"></div>' +
      '<div class="home-cards">' + bookCards + '</div>';

    var startBtn = $('[data-act="start-today"]');
    if (startBtn) {
      startBtn.addEventListener('click', function () {
        state.returnHash = '#/learn';
        nav(startHash);
      });
    }
    var chalBtn = $('[data-act="challenge-open"]');
    if (chalBtn && chalBtn.getAttribute && chalBtn.getAttribute('aria-disabled') !== 'true') {
      chalBtn.addEventListener('click', openChallenge);
    }
    var wrongBtn = $('[data-act="goto-wrong"]');
    if (wrongBtn) { wrongBtn.addEventListener('click', function () { nav('#/wrong'); }); }
    document.querySelectorAll('[data-nav-book]').forEach(function (el) {
      el.addEventListener('click', function () { nav('#/book/' + encodeURIComponent(el.getAttribute('data-nav-book'))); });
    });
  }

  /* ---------- 视图：首启引导（I/J 串联，Open-8） ---------- */

  function renderOnboard() {
    var P = window.PHRASES;
    var isRedo = db.onboarding.completed; // 重做目标时保留原 completed 语意
    var ob = {
      step: 0,
      type: db.goal.type || 'free',
      deadline: db.goal.deadline || null,
      longTerm: !db.goal.deadline,
      dailyMinutes: db.goal.dailyMinutes || 20
    };

    function commitGoal() {
      db.goal = {
        type: ob.type,
        deadline: ob.longTerm ? null : ob.deadline,
        dailyMinutes: ob.dailyMinutes,
        createdAt: db.goal.createdAt || Core.now()
      };
      Core.saveDB(db);
    }

    function paint() {
      var labels = P.ONBOARD.stepLabels;
      var prog = labels.map(function (l, i) {
        var cls = 'ob-step' + (i === ob.step ? ' active' : (i < ob.step ? ' done' : ''));
        return '<span class="' + cls + '">' + (i + 1) + '. ' + esc(l) + '</span>';
      }).join('<span class="ob-sep">›</span>');

      var body;
      if (ob.step === 0) { body = stepGoal(); }
      else if (ob.step === 1) { body = stepDeadline(); }
      else if (ob.step === 2) { body = stepMinutes(); }
      else { ob.testing = true; renderBaselineTest(false); return; }

      $('#view').innerHTML =
        '<div class="onboard-wrap card" role="dialog" aria-label="目标三问">' +
          '<h2>' + esc(P.ONBOARD.title) + '</h2>' +
          '<div class="onboard-progress">' + prog + '</div>' +
          '<div class="onboard-body">' + body + '</div>' +
          '<div class="onboard-actions">' +
            (ob.step > 0 ? '<button class="btn" data-ob="prev">上一步</button>' : '') +
            (ob.step < 2 ? '<button class="btn btn-primary" data-ob="next">下一步</button>' : '') +
            '<button class="btn btn-ghost" data-ob="skip">' + esc(P.ONBOARD.skip) + '</button>' +
          '</div>' +
        '</div>';
      bind();
    }

    function stepGoal() {
      var cards = P.GOAL_TYPES.map(function (g) {
        var sel = g.key === ob.type ? ' selected' : '';
        return '<button class="goal-card' + sel + '" data-ob-type="' + g.key + '" aria-pressed="' + (g.key === ob.type) + '">' +
          '<span class="goal-label">' + esc(g.label) + '</span>' +
          '<span class="goal-desc">' + esc(g.desc) + '</span></button>';
      }).join('');
      return '<p class="onboard-hint">' + esc(P.ONBOARD.step0Hint) + '</p>' +
        '<div class="goal-grid">' + cards + '</div>';
    }

    function stepDeadline() {
      var disabled = ob.longTerm ? 'disabled' : '';
      var val = ob.deadline ? new Date(ob.deadline).toISOString().slice(0, 10) : '';
      return '<p class="onboard-hint">' + esc(P.ONBOARD.step1Hint) + '</p>' +
        '<label class="ob-check"><input type="checkbox" id="obLong" ' + (ob.longTerm ? 'checked' : '') + '/> ' +
          esc(P.ONBOARD.deadlineLongTerm) + '</label>' +
        '<input type="date" id="obDate" ' + disabled + ' value="' + val + '" style="margin-top:10px"/>';
    }

    function stepMinutes() {
      var opts = P.DAILY_MINUTE_OPTIONS.map(function (m) {
        var sel = m === ob.dailyMinutes ? ' active' : '';
        return '<button class="seg-btn' + sel + '" data-ob-min="' + m + '">' + m + ' 分钟</button>';
      }).join('');
      return '<p class="onboard-hint">' + esc(P.ONBOARD.step2Hint) + '</p>' +
        '<div class="seg">' + opts + '</div>';
    }

    function bind() {
      document.querySelectorAll('[data-ob-type]').forEach(function (el) {
        el.addEventListener('click', function () {
          ob.type = el.getAttribute('data-ob-type');
          paint();
        });
      });
      var nextBtn = $('[data-ob="next"]');
      if (nextBtn) {
        nextBtn.addEventListener('click', function () {
          if (ob.step === 1) {
            if (!ob.longTerm) {
              var v = $('#obDate').value;
              if (!v) { toast('请选择考试日期，或勾选「长期」'); return; }
              ob.deadline = new Date(v + 'T00:00:00').getTime();
            }
            commitGoal();
          } else if (ob.step === 2) {
            commitGoal();
          }
          ob.step += 1;
          paint();
        });
      }
      var prevBtn = $('[data-ob="prev"]');
      if (prevBtn) {
        prevBtn.addEventListener('click', function () { ob.step -= 1; paint(); });
      }
      var skipBtn = $('[data-ob="skip"]');
      if (skipBtn) {
        skipBtn.addEventListener('click', function () {
          if (!isRedo) { db.onboarding.skipped = true; Core.saveDB(db); }
          nav('#/learn');
        });
      }
      var longChk = $('#obLong');
      if (longChk) {
        longChk.addEventListener('change', function () {
          ob.longTerm = longChk.checked;
          paint();
        });
      }
      document.querySelectorAll('[data-ob-min]').forEach(function (el) {
        el.addEventListener('click', function () {
          ob.dailyMinutes = parseInt(el.getAttribute('data-ob-min'), 10);
          paint();
        });
      });
    }

    paint();
  }

  /* ---------- 视图：词汇量自适应测试（方案 J） ---------- */

  /**
   * 3 分钟自适应测试：按书顺序分层抽样，答对升/答错降，阶梯收敛。
   * @param {boolean} isRetest 重测/反馈入口（保留 goal，仅重新毕业裁剪）
   */
  function renderBaselineTest(isRetest) {
    var P = window.PHRASES;
    var pool = Core.selectBaselinePool(db);
    if (!pool.length) {
      // 无内置词（极端情况）：直接跳过测试
      finishBaseline(0, isRetest);
      return;
    }
    var HARD_CAP = 30;
    var answers = [];
    var idx = 0;
    var lastLevel = -1, convergeCount = 0;

    function currentLevel() { return Core.scoreBaseline(answers).level; }

    function nextQuestion() {
      var level = currentLevel();
      // 收敛即止：近 5 题 level 不变，或达到硬上限，或题池用尽
      if (level === lastLevel) { convergeCount += 1; } else { convergeCount = 0; }
      lastLevel = level;
      if (idx >= HARD_CAP || idx >= pool.length || convergeCount >= 5) {
        finishBaseline(level, isRetest);
        return;
      }
      var item = Core.baselineQuestionForLevel(pool, level) || pool[idx % pool.length];
      var entry = ALL_ENTRY_MAP[Core.norm(item.w)] ? ALL_ENTRY_MAP[Core.norm(item.w)].entry
        : { w: item.w, t: item.t || '', p: item.p || '' };
      // 选项：正确释义 + 3 个干扰
      var distract = Object.keys(ALL_ENTRY_MAP)
        .map(function (k) { return ALL_ENTRY_MAP[k].entry; })
        .filter(function (e) { return e.w !== entry.w && e.t; });
      distract = shuffle(distract).slice(0, 3);
      var opts = shuffle(distract.concat([entry]));

      $('#view').innerHTML =
        '<div class="onboard-wrap card" role="dialog" aria-label="词汇量测试">' +
          '<h2>' + esc(P.ONBOARD.testTitle) + '</h2>' +
          '<div class="test-progress">' +
            '<div class="tp-bar"><i style="width:' + Math.round(idx / HARD_CAP * 100) + '%"></i></div>' +
            '<span class="tp-text">' + esc(P.ONBOARD.testProgress(Math.min(idx + 1, HARD_CAP), HARD_CAP)) + '</span>' +
          '</div>' +
          '<p class="onboard-hint">' + esc(P.ONBOARD.testHint) + '</p>' +
          '<div class="choice-word">' + esc(entry.w) + '</div>' +
          (entry.p ? '<div class="phonetic">' + esc(entry.p) + '</div>' : '') +
          '<div class="choice-grid">' +
            opts.map(function (o, i) {
              return '<button class="choice-opt" data-bopt="' + i + '">' +
                '<span class="co-key">' + (i + 1) + '</span><span>' + esc(o.t) + '</span></button>';
            }).join('') +
          '</div>' +
        '</div>';

      document.querySelectorAll('[data-bopt]').forEach(function (el) {
        el.addEventListener('click', function () {
          var picked = opts[parseInt(el.getAttribute('data-bopt'), 10)];
          answers.push(picked.w === entry.w);
          idx += 1;
          nextQuestion();
        });
      });
    }

    function finishBaseline(level, retest) {
      Core.applyGraduation(db, level);          // J-AC3 批量毕业裁剪
      if (!retest) { Core.buildPlan(db); }       // I：落计划（goal 已落库）
      else { Core.buildPlan(db); }               // 重测后仍重算计划
      db.onboarding = { step: 3, completed: true, skipped: false, completedAt: Core.now() };
      Core.saveDB(db);
      toast(retest ? '已重新评估词汇量' : '计划已生成，开始学习吧');
      nav('#/learn');
    }

    nextQuestion();
  }

  /** 14 天重估是否已到期（J-AC4） */
  function needsReestimate() {
    return db.baseline && db.baseline.testedAt > 0 && Core.now() >= db.baseline.reestimateAt;
  }

  /** 重做目标三问（「我的」页入口，Open-4）。保留 completed 以让向导识别为「重做」，
   *  跳过时不会误标 skipped（isRedo 由 db.onboarding.completed 推导）。 */
  function redoGoal() {
    db.onboarding.step = 0;
    db.onboarding.skipped = false;
    Core.saveDB(db);
    nav('#/onboard');
  }

  /** 重测词汇量（保留 goal，仅重新毕业裁剪，J-AC4） */
  function startRetest() {
    renderBaselineTest(true);
  }

  /* ---------- 视图：词书列表 ---------- */

  function renderBooks() {
    var cards = Core.allBooks(db).map(function (b) {
      var pr = Core.bookProgress(db, b);
      var p = pr.total > 0 ? Math.round(pr.learned / pr.total * 100) : 0;
      var tag = b.builtin ? '' : '<span class="badge">自制</span>';
      return '<button class="book-card" data-nav-book="' + esc(b.key) + '">' +
        '<div class="book-cover" style="' + coverStyle(b.color) + '">' + esc(shortName(b.name)) + '</div>' +
        '<div class="bc-name">' + esc(b.name) + ' ' + tag + '</div>' +
        '<div class="bc-desc">' + esc(b.desc || '自制词书 · ' + b.words.length + ' 词') + '</div>' +
        '<div class="progress"><i style="width:' + p + '%"></i></div>' +
        '<div class="bc-meta"><span>' + pr.learned + ' / ' + pr.total + ' 已学</span><span>' + p + '%</span></div>' +
      '</button>';
    }).join('');

    $('#view').innerHTML =
      '<div class="page-title">词书</div>' +
      '<div class="page-sub">选择一本词书开始，进度全局共享；内置词库为精编版，完整考纲词表可通过自制词书导入。</div>' +
      '<div class="book-grid">' + cards +
        '<button class="book-card" data-act="new-book" style="border-style:dashed;display:flex;align-items:center;justify-content:center;min-height:150px">' +
          '<span style="font-size:40px;color:var(--ink-faint)">＋</span>' +
          '<span class="bc-name" style="margin-left:10px">新建自制词书</span>' +
        '</button>' +
      '</div>';

    document.querySelectorAll('[data-nav-book]').forEach(function (el) {
      el.addEventListener('click', function () { nav('#/book/' + encodeURIComponent(el.getAttribute('data-nav-book'))); });
    });
    $('[data-act="new-book"]').addEventListener('click', openNewBookModal);
  }

  function shortName(name) {
    if (name.length <= 4) { return name; }
    return name.slice(0, 4);
  }

  function openNewBookModal() {
    openModal(
      '<h3 style="margin-bottom:12px">新建自制词书</h3>' +
      '<div style="margin-bottom:10px"><input id="nbName" placeholder="词书名称，如：GRE 佛脚词" style="width:100%"/></div>' +
      '<div style="margin-bottom:6px" class="muted">每行一个单词（自动匹配内置 460 词库），或每行「单词 | 音标 | 释义 | 例句 | 例句翻译」完整词条。</div>' +
      '<textarea id="nbWords" style="width:100%;min-height:180px" placeholder="apple&#10;banana | /bəˈnænə/ | n. 香蕉 | Monkeys love bananas. | 猴子爱香蕉。"></textarea>' +
      '<div style="display:flex;gap:10px;margin-top:14px;justify-content:flex-end">' +
        '<button class="btn" data-modal-close>取消</button>' +
        '<button class="btn btn-primary" id="nbCreate">创建词书</button>' +
      '</div>'
    );
    $('#nbCreate').addEventListener('click', function () {
      var name = $('#nbName').value.trim();
      var text = $('#nbWords').value;
      if (!name) { toast('请先填写词书名称'); return; }
      if (!text.trim()) { toast('请粘贴单词表'); return; }
      var res = Core.createCustomBook(db, name, text, BUILTIN_INDEX);
      rebuildIndex();
      Core.saveDB(db);
      closeModal();
      toast('已创建「' + res.book.name + '」：' + res.book.words.length + ' 词（内置匹配 ' + res.matched + '）');
      render();
    });
  }

  /* ---------- 视图：词书详情 ---------- */

  function renderBookDetail(key) {
    var book = Core.bookByKey(db, key);
    if (!book) { $('#view').innerHTML = '<div class="card">词书不存在。<a href="#/books">返回词书列表</a></div>'; return; }

    var pr = Core.bookProgress(db, book);
    var ratio = pr.total > 0 ? pr.learned / pr.total : 0;
    var MODES = [
      { m: 'flash', label: '单词快过' },
      { m: 'type', label: '写出英文' },
      { m: 'choice', label: '英文选义' },
      { m: 'match', label: '单词对对碰' }
    ];

    var guide = '';
    if (ratio > 0.3 && ratio < 1) {
      guide =
        '<div class="guide-bar">' +
          '<span class="gb-text">这 ' + pr.total + ' 词里你已经背过 ' + pr.learned + ' 个，直接学剩下的</span>' +
          '<button class="btn btn-primary btn-small" data-act="rest">学剩下的</button>' +
          '<button class="btn btn-small" data-act="bookall">全量过一遍</button>' +
        '</div>';
    }

    var unitRows = (book.units || []).map(function (u, i) {
      var entries = Core.entriesOf(book, i);
      var learned = entries.filter(function (e) { var r = recOf(e.w); return r && r.reps > 0; }).length;
      var p = entries.length ? Math.round(learned / entries.length * 100) : 0;
      return '<button class="unit-row" data-act-unit="' + i + '">' +
        '<span><span class="ur-name">' + esc(u.name) + '</span>' +
        '<span class="ur-range">　第 ' + (u.range[0] + 1) + '–' + (u.range[1] + 1) + ' 词</span></span>' +
        '<span class="ur-right"><span class="muted">' + learned + '/' + entries.length + '</span>' +
        '<span class="progress" style="width:90px"><i style="width:' + p + '%"></i></span>' +
        '<span class="badge">' + p + '%</span></span>' +
      '</button>';
    }).join('');

    var customDel = book.builtin ? '' :
      '<button class="btn btn-danger btn-small" data-act="del-book" style="margin-left:auto">删除词书</button>';

    $('#view').innerHTML =
      '<div class="card">' +
        '<div class="book-head">' +
          '<div class="book-cover" style="' + coverStyle(book.color) + ';width:64px;height:84px;font-size:14px">' + esc(shortName(book.name)) + '</div>' +
          '<div class="bh-info">' +
            '<div class="page-title" style="margin-bottom:2px">' + esc(book.name) + (book.builtin ? '' : ' <span class="badge">自制</span>') + '</div>' +
            '<div class="muted">' + esc(book.desc || '') + '</div>' +
            '<div class="bh-progress"><div class="progress"><i style="width:' + Math.round(ratio * 100) + '%"></i></div>' +
            '<div class="muted" style="margin-top:6px">已学 ' + pr.learned + ' / ' + pr.total + ' 词 · ' + Math.round(ratio * 100) + '%</div></div>' +
            '<div style="display:flex;gap:10px;flex-wrap:wrap">' +
              '<button class="btn btn-small" data-act="word-table">单词表</button>' +
              customDel +
            '</div>' +
          '</div>' +
        '</div>' +
        guide +
        '<div class="mode-row">' +
          MODES.map(function (md) {
            return '<button class="btn" data-act-mode="' + md.m + '">' + md.label + '</button>';
          }).join('') +
        '</div>' +
        '<h3 style="font-size:15px;color:var(--ink-soft)">单元列表</h3>' +
        '<div class="unit-list">' + (unitRows || '<div class="muted">自制词书没有单元划分</div>') + '</div>' +
      '</div>';

    MODES.forEach(function (md) {
      $('[data-act-mode="' + md.m + '"]').addEventListener('click', function () {
        state.returnHash = '#/book/' + encodeURIComponent(key);
        nav('#/study?scope=book&book=' + encodeURIComponent(key) + '&mode=' + md.m);
      });
    });
    var restBtn = $('[data-act="rest"]');
    if (restBtn) {
      restBtn.addEventListener('click', function () {
        state.returnHash = '#/book/' + encodeURIComponent(key);
        nav('#/study?scope=rest&book=' + encodeURIComponent(key) + '&mode=flash');
      });
      $('[data-act="bookall"]').addEventListener('click', function () {
        state.returnHash = '#/book/' + encodeURIComponent(key);
        nav('#/study?scope=bookall&book=' + encodeURIComponent(key) + '&mode=flash');
      });
    }
    $('[data-act="word-table"]').addEventListener('click', function () { openWordTable(book); });
    var delBtn = $('[data-act="del-book"]');
    if (delBtn) {
      delBtn.addEventListener('click', function () {
        openModal(
          '<h3 style="margin-bottom:10px">删除词书</h3>' +
          '<p>确定删除自制词书「' + esc(book.name) + '」吗？已学过的词记录会保留。</p>' +
          '<div style="display:flex;gap:10px;margin-top:16px;justify-content:flex-end">' +
          '<button class="btn" data-modal-close>取消</button>' +
          '<button class="btn btn-danger" id="delConfirm">删除</button></div>'
        );
        $('#delConfirm').addEventListener('click', function () {
          Core.deleteCustomBook(db, key);
          rebuildIndex();
          Core.saveDB(db);
          closeModal();
          toast('词书已删除，已学记录保留');
          nav('#/books');
        });
      });
    }
    document.querySelectorAll('[data-act-unit]').forEach(function (el) {
      el.addEventListener('click', function () {
        state.returnHash = '#/book/' + encodeURIComponent(key);
        nav('#/study?scope=unit&book=' + encodeURIComponent(key) + '&unit=' + el.getAttribute('data-act-unit') + '&mode=flash');
      });
    });
  }

  /* ---------- 学习页 ---------- */

  var MODE_LABELS = { flash: '单词快过', type: '写出英文', choice: '英文选义', match: '单词对对碰' };

  /* ---------- #024 书封配色（D-047）----------
   * 书封底色由词书数据内联写入（非令牌），白字在其上对比不可控（实测：蓝 3.71 / 紫 4.23 /
   * 绿 2.79 / 橙 3.01 / 琥珀 2.18，除蓝外全部低于 AA 4.5）。
   * 策略＝最小改动：深字先达标就不动底色（保住 5 本书的辨识色）；
   * 两种文字色都不达标时才逐步压暗底色（上限 24%），仍不达标则取对比更高者兜底。
   * ------------------------------------------------------------------ */
  var COVER_INK = '#0a1512';

  function relLuminance(hex) {
    var n = parseInt(hex.slice(1), 16);
    function ch(v) { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
    return 0.2126 * ch(n >> 16 & 255) + 0.7152 * ch(n >> 8 & 255) + 0.0722 * ch(n & 255);
  }

  function contrastRatio(a, b) {
    var x = relLuminance(a), y = relLuminance(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  }

  /** 向黑混合 t（0~1），保持色相 */
  function mixTowardBlack(hex, t) {
    var n = parseInt(hex.slice(1), 16);
    var parts = [n >> 16 & 255, n >> 8 & 255, n & 255].map(function (v) {
      var s = Math.round(v * (1 - t)).toString(16);
      return s.length < 2 ? '0' + s : s;
    });
    return '#' + parts.join('');
  }

  /** 返回可直接拼进 style 的 "background:…;color:…"（对任意 6 位 hex 都保证 ≥4.5:1） */
  function coverStyle(bgHex) {
    var bg = (typeof bgHex === 'string' && /^#[0-9a-fA-F]{6}$/.test(bgHex)) ? bgHex : '#4f7cff';
    var white = contrastRatio('#ffffff', bg);
    if (white >= 4.5) { return 'background:' + bg + ';color:#ffffff'; }
    if (contrastRatio(COVER_INK, bg) >= 4.5) { return 'background:' + bg + ';color:' + COVER_INK; }
    for (var t = 0.02; t <= 0.2401; t += 0.02) {
      var nb = mixTowardBlack(bg, t);
      if (contrastRatio('#ffffff', nb) >= 4.5) { return 'background:' + nb + ';color:#ffffff'; }
      if (contrastRatio(COVER_INK, nb) >= 4.5) { return 'background:' + nb + ';color:' + COVER_INK; }
    }
    return 'background:' + bg + ';color:' + (white >= contrastRatio(COVER_INK, bg) ? '#ffffff' : COVER_INK);
  }

  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function escapeReg(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  /** 解析 scope → 词条数组 */
  function scopeEntries(params) {
    var scope = params.scope || 'today';
    var bookKey = params.book || '';
    var book = bookKey ? Core.bookByKey(db, bookKey) : null;
    var allRecs = Object.keys(db.words).map(function (k) { return db.words[k]; });

    function recsToEntries(recs) {
      return recs.map(function (r) { return entryForWord(r.w); });
    }

    if (scope === 'wrong') {
      if (state.pendingWords && state.pendingWords.length) { return state.pendingWords.slice(); }
      return recsToEntries(Core.wrongRecords(db));
    }
    if (scope === 'star') {
      return recsToEntries(allRecs.filter(function (r) { return r.star; }));
    }
    if (scope === 'fuzzy') {
      return recsToEntries(allRecs.filter(function (r) { return r.wrong > 0 && r.lastRating === 'fuzzy'; }));
    }
    if (scope === 'unknown') {
      return recsToEntries(allRecs.filter(function (r) { return r.wrong > 0 && r.lastRating === 'unknown'; }));
    }
    if (scope === 'rest' && book) {
      var bk = book;
      return recsToEntries(allRecs.filter(function (r) {
        return bk.words.some(function (e) { return Core.norm(e.w) === r.w; }) && r.reps === 0;
      }));
    }
    if (scope === 'bookall' && book) {
      return book.words.slice();
    }
    if (scope === 'book' && book) {
      var recs = allRecs.filter(function (r) {
        return book.words.some(function (e) { return Core.norm(e.w) === r.w; });
      });
      var plan = Core.todayPlan(db, recs);
      return recsToEntries(plan.reviews.concat(plan.freshs));
    }
    if (scope === 'unit' && book) {
      var ui = parseInt(params.unit || '0', 10);
      var uEntries = Core.entriesOf(book, ui);
      var urecs = allRecs.filter(function (r) {
        return uEntries.some(function (e) { return Core.norm(e.w) === r.w; });
      });
      var uplan = Core.todayPlan(db, urecs);
      return recsToEntries(uplan.reviews.concat(uplan.freshs));
    }
    // today / new / review：全库
    var p = Core.todayPlan(db, allRecs);
    var entries;
    if (scope === 'new') { entries = recsToEntries(p.freshs); }
    else if (scope === 'review') { entries = recsToEntries(p.reviews); }
    // 重建态：当日应学「重建包」（reviews/freshs 为空，重建词在 p.rebuildWords）
    else if (p.mode === 'rebuild' && p.rebuildWords.length) {
      entries = recsToEntries(p.rebuildWords.concat(p.reviews).concat(p.freshs));
    }
    else { entries = recsToEntries(p.reviews.concat(p.freshs)); }
    // 缺口 C：今日计划首组（正常态）且当日尚未学任何词、开关开启时，
    // 在最前注入 2 个 cet4 热身词（injectWarmup 内部已做 day.total>0 / 开关 判定）。
    if (scope === 'today' && p.mode === 'normal') {
      entries = Core.injectWarmup(entries, db, db.settings);
    }
    return entries;
  }

  /** 顶部范围下拉的选项清单 */
  function scopeOptions(params) {
    var mode = params.mode || 'flash';
    function mk(scope, label, extra) {
      var h = '#/study?scope=' + scope + '&mode=' + mode + (params.listen ? '&listen=1' : '') + (params.ctx ? '&ctx=1' : '') + (extra || '');
      return { hash: h, label: label, scope: scope, unit: scope === 'unit' ? extra : null };
    }
    var opts = [
      mk('today', '今日计划'),
      mk('new', '待学新词'),
      mk('review', '待复习'),
      mk('star', '星标'),
      mk('fuzzy', '模糊'),
      mk('unknown', '不认识')
    ];
    var book = params.book ? Core.bookByKey(db, params.book) : null;
    if (book) {
      if (book.units) {
        book.units.forEach(function (u, i) {
          opts.push(mk('unit', '第 ' + (i + 1) + ' 单元 · ' + u.name,
            '&book=' + encodeURIComponent(params.book) + '&unit=' + i));
        });
      }
      opts.push(mk('bookall', '全书过一遍', '&book=' + encodeURIComponent(params.book)));
    }
    return opts;
  }

  function buildSession(params, baseWords) {
    var words = baseWords ? baseWords.slice() : scopeEntries(params);
    return {
      routeKey: location.hash,
      mode: params.mode || 'flash',
      params: params,
      originalWords: words.slice(),
      words: words,
      idx: 0,
      revealed: false,
      fuzzy: 0,
      unknown: 0,
      answered: 0,
      correct: 0,
      undoSnap: null,
      undoTimer: null,
      lastClick: 0,
      finished: false,
      typing: null,
      choice: null,
      match: null,
      // #023 听写（D-046）：与 mode='type' 共用判定，仅换提示方式；下列状态只在本次会话内有效
      listen: params.listen ? 1 : 0,
      listenReveal: -1,   // 已揭示中文提示的词下标
      listenSpoken: -1,   // 已自动发音的词下标（每词只自动播一次）
      // #026 例句语境（D-051）：type 子模式标志，会话内存不落库；与 listen 互斥，listen 优先
      ctx: (params.ctx && !params.listen) ? 1 : 0
    };
  }

  function renderStudy(params) {
    var hash = location.hash;
    if (!state.session || state.session.routeKey !== hash) {
      if (state.session && state.session.routeKey !== hash) {
        state.session = null;
      }
      state.session = buildSession(params);
      if (!db.settings.coachSeen) { state.returnHash = state.returnHash || '#/learn'; }
    }
    var s = state.session;

    var opts = scopeOptions(params);
    var curScope = params.scope || 'today';
    var curUnit = (curScope === 'unit' && params.unit != null)
      ? '&book=' + encodeURIComponent(params.book || '') + '&unit=' + params.unit
      : null;
    var curIdx = opts.findIndex(function (o) { return o.scope === curScope && o.unit === curUnit; });
    if (curIdx < 0) { curIdx = 0; }

    var isFromBook = state.returnHash.indexOf('#/book/') === 0;
    var backLabel = isFromBook ? '‹ 返回单元列表' : '⌂ 返回首页';

    // #023 听写＝type 的子模式（mode 仍为 'type'，故既有评定/键盘/撤销链路零改动）
    var tabDefs = [
      { m: 'flash' }, { m: 'type' }, { m: 'type', listen: 1, label: window.PHRASES.LISTEN.tab },
      { m: 'type', ctx: 1, label: window.PHRASES.CTX.tab },
      { m: 'choice' }, { m: 'match' }
    ];
    var tabs = tabDefs.map(function (d) {
      // #026：ctx × listen 互斥（D-051），active 三分支——子模式标签只在自己单独开启时亮
      var active = s.mode === d.m &&
        (d.listen ? (!!s.listen && !s.ctx) : d.ctx ? (!!s.ctx && !s.listen) : (!s.listen && !s.ctx));
      return '<button class="tab' + (active ? ' active' : '') + '" data-sact="tab" data-mode="' + d.m + '"' +
        (d.listen ? ' data-listen="1"' : '') + (d.ctx ? ' data-ctx="1"' : '') + ' aria-pressed="' + active + '">' +
        (d.label || MODE_LABELS[d.m]) + '</button>';
    }).join('');

    var scopeSel = '<select id="scopeSelect" aria-label="切换学习范围">' +
      opts.map(function (o, i) {
        return '<option value="' + i + '"' + (i === curIdx ? ' selected' : '') + '>' + esc(o.label) + '</option>';
      }).join('') + '</select>';

    $('#view').innerHTML =
      '<div class="study-top">' +
        '<button class="back-link" data-sact="exit">' + backLabel + '</button>' +
        scopeSel +
        '<span class="scope-arrows">' +
          '<button data-sact="scope-prev" aria-label="上一范围">◀</button>' +
          '<button data-sact="scope-next" aria-label="下一范围">▶</button>' +
        '</span>' +
      '</div>' +
      '<div class="study-tabs">' + tabs + '</div>' +
      '<div class="tool-row">' +
        '<button class="btn btn-small" data-sact="restart">↻ 重学本组</button>' +
        '<button class="btn btn-small" data-sact="shuffle">⤨ 打乱顺序</button>' +
        '<button class="btn btn-small" data-sact="kbd">⌨ 快捷键</button>' +
      '</div>' +
      '<div id="studyBody"></div>';

    $('#scopeSelect').addEventListener('change', function () {
      var o = opts[parseInt(this.value, 10)];
      nav(o.hash);
    });

    if (s.words.length === 0) {
      $('#studyBody').innerHTML =
        '<div class="card" style="text-align:center;padding:50px 20px">' +
        '<div style="font-size:40px">🌱</div>' +
        '<p style="margin:10px 0">本组没有要学的词，先去别处逛逛吧。</p>' +
        '<button class="btn" data-sact="exit">返回</button></div>';
      return;
    }

    if (s.finished) { renderFinish(); return; }

    if (s.mode === 'flash') { renderFlash(); }
    else if (s.mode === 'type') { renderType(); }
    else if (s.mode === 'choice') { renderChoice(); }
    else { renderMatch(); }
  }

  /** 学习页底部状态条 + 撤销条 + 教练提示 */
  function studyChrome() {
    var s = state.session;
    var pct = s.words.length ? Math.round(s.idx / s.words.length * 100) : 0;
    var html =
      '<div class="status-bar">' +
        '<span>模糊 ' + s.fuzzy + ' · 不认识 ' + s.unknown + '</span>' +
        '<span class="progress-line" role="progressbar" aria-valuemin="0" aria-valuemax="' + s.words.length + '" aria-valuenow="' + s.idx + '">' +
          '<span class="progress"><i style="width:' + pct + '%"></i></span>' +
        '</span>' +
        '<span>学习进度 ' + s.idx + '/' + s.words.length + '</span>' +
      '</div>';
    if (s.undoSnap) {
      html += '<div class="undo-bar" role="status">已记为「' + RATE_TEXT[s.undoSnap.rating] + '」' +
        '<button data-sact="undo">撤销</button></div>';
    }
    if (!db.settings.coachSeen && s.mode === 'flash') {
      html += '<div class="coach-tip">空格 翻转 · 1/2/3 评级 · ← → 换词</div>';
    }
    return html;
  }

  /** #026 正则元字符转义（ctxPrompt 词边界检测用；自研词书 w 理论可含 . 等字符） */
  function escapeRegExp(str) {
    return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * #026 例句语境练习（D-051/D-052；G2 契约 v1.2 §2）：纯函数、无 DOM。
   * 词边界定位例句中第一处「独立原形」（大小写不敏感，覆盖 16 个句首大写词）；
   * 未命中（缺 e / 只有屈折形 admitted / Bees 类，实测 94 词）→ {found:false}，
   * 由 renderType 按普通 type 题面逐词降级，会话不中断。禁止屈折后缀/候选形/词干化。
   * 与 clozeHtml 的关系：只借鉴「先按原样切分、再分别转义」的次序；clozeHtml 零改动。
   */
  function ctxPrompt(e) {
    var w = (e && typeof e.w === 'string') ? e.w : '';
    var ex = (e && typeof e.e === 'string') ? e.e : '';
    if (!w.trim() || !ex.trim()) { return { found: false }; }
    var m = new RegExp('\\b' + escapeRegExp(w) + '\\b', 'i').exec(ex);
    if (!m) { return { found: false }; }
    // G10 R26-F01（AC05）：例句含第二处独立原形时，挖空外会泄漏原形明文 → 双命中整词降级。
    // 内置 460 词零双命中（回归测试 found=366 守住），仅自制词书可能触发。
    var rest = ex.slice(m.index + w.length);
    if (new RegExp('\\b' + escapeRegExp(w) + '\\b', 'i').test(rest)) { return { found: false }; }
    return {
      found: true,
      before: ex.slice(0, m.index),
      gap: ex.slice(m.index, m.index + w.length),
      after: ex.slice(m.index + w.length)
    };
  }

  function clozeHtml(e) {
    var ex = e.e || '';
    if (!ex) { return '<div class="cloze muted">（该词暂无例句，可在单词详情中补充）</div>'; }
    // 先按原样切分再分别转义，避免破坏挖空占位标签
    var lower = ex.toLowerCase();
    var pos = lower.indexOf(e.w.toLowerCase());
    var before, after;
    if (pos >= 0) {
      before = ex.slice(0, pos);
      after = ex.slice(pos + e.w.length);
    } else {
      before = ex;
      after = '';
    }
    return '<div class="cloze">' + esc(before) + '<span class="gap">＿＿</span>' + esc(after) + '</div>';
  }

  /** #016：义项列表渲染（全部义项可读展示；音标/例句/发音由调用点保留） */
  function sensesHtml(e) {
    var P = window.PHRASES;
    var senses = Core.sensesOf(e || {});
    if (!senses.length || (senses.length === 1 && !senses[0].text)) {
      return '<span class="sense-empty">' + esc(P.SENSES.noMeaning) + '</span>';
    }
    return senses.map(function (s) {
      return '<div class="sense-item">' +
        (s.pos ? '<span class="sense-pos">' + esc(s.pos) + '</span>' : '') +
        '<span class="sense-text">' + esc(s.text) + '</span></div>';
    }).join('');
  }

  /** #016：抽义项种子 = 日期 + 词（与 startExam 同款 charCode 哈希策略，不含随机时间） */
  function senseSeed(e, at) {
    return Core.dayKey(at) + Core.wordKey(e.w);
  }

  /** #016：默写题面 = 所选义项提示（文案取自 P.SENSES，不双写） */
  function typeSensePrompt(e, senseIdx) {
    var P = window.PHRASES;
    var senses = Core.sensesOf(e || {});
    var sense = senses[senseIdx] || { text: '' };
    return P.SENSES.hintLabel + (sense.text || P.SENSES.noMeaning);
  }

  function renderFlash() {
    var s = state.session;
    var e = s.words[s.idx];
    var rec = recOf(e.w);
    var starred = !!(rec && rec.star);
    var showSpeaker = db.settings.accent !== 'off';

    $('#studyBody').innerHTML =
      '<div class="flash-stage">' +
        '<button class="nav-arrow left" data-sact="prev" aria-label="上一个">‹</button>' +
        '<div class="flashcard" id="flashcard" data-reveal="' + (s.revealed ? 1 : 0) + '" tabindex="0">' +
          '<button class="star-capsule' + (starred ? ' on' : '') + '" data-sact="star" aria-label="星标">' +
            (starred ? SVG_STAR_ON + ' 已星标' : SVG_STAR_OFF + ' 星标') +
          '</button>' +
          (e.warmup ? '<span class="warmup-capsule" aria-label="' + esc(window.PHRASES.ONBOARD.warmup) + '">' + esc(window.PHRASES.ONBOARD.warmup) + '</span>' : '') +
          '<div class="fc-inner">' +
            '<div class="fc-face fc-front">' +
              clozeHtml(e) +
              '<div class="big-word">' + esc(e.w) + '</div>' +
              (e.p ? '<div class="phonetic">' + esc(e.p) + '</div>' : '') +
              (showSpeaker ? '<button class="speaker" data-sact="speak" aria-label="发音">' + SVG_SPEAKER + '</button>' : '') +
            '</div>' +
            '<div class="fc-face fc-back">' +
              '<div class="big-word" style="font-size:34px">' + esc(e.w) + '</div>' +
              '<div class="def-line senses-list">' + sensesHtml(e) + '</div>' +
              '<div class="ex-line">' + esc(e.e || '') + '</div>' +
              '<div class="ex-line">' + esc(e.et || '') + '</div>' +
              (showSpeaker ? '<button class="speaker" data-sact="speak-ex" aria-label="例句发音">' + SVG_SPEAKER + '</button>' : '') +
            '</div>' +
          '</div>' +
        '</div>' +
        '<button class="nav-arrow right" data-sact="next" aria-label="下一个">›</button>' +
      '</div>' +
      '<div class="rate-row">' +
        '<button class="rate-btn r-unknown" data-sact="rate" data-rating="unknown">不认识<span class="kbd">1</span></button>' +
        '<button class="rate-btn r-fuzzy" data-sact="rate" data-rating="fuzzy">模糊<span class="kbd">2</span></button>' +
        (s.revealed ? '<button class="rate-btn r-know" data-sact="rate" data-rating="know">认识<span class="kbd">3</span></button>' : '') +
      '</div>' +
      studyChrome();

    $('#flashcard').addEventListener('click', function (ev) {
      if (ev.target.closest('[data-sact]')) { return; }
      toggleReveal();
    });
  }

  function toggleReveal() {
    var s = state.session;
    s.revealed = !s.revealed;
    renderFlash();
  }

  function stepWord(delta) {
    var s = state.session;
    var n = s.words.length;
    s.idx = (s.idx + delta + n) % n;
    s.revealed = false;
    s.typing = null;
    s.choice = null;
    renderFlash();
  }

  function toggleStar() {
    var s = state.session;
    var e = s.words[s.idx];
    var rec = Core.ensureRecord(db, e.w);
    rec.star = !rec.star;
    Core.saveDB(db);
    if (s.mode === 'flash') { renderFlash(); } else { render(); }
  }

  /** 评级 + 推进 + 撤销快照 */
  /** #028 练法归因（D-058）：listen/ctx 都是 mode='type' 下的子模式标志，须派生命名；listen 优先 */
  function attributionMode(s) {
    if (!s) { return null; }
    if (s.listen === 1) { return 'listen'; }
    if (s.ctx === 1) { return 'ctx'; }
    return s.mode || null;
  }

  function doRate(rating) {
    var s = state.session;
    if (!s || s.finished) { return; }
    var t = Date.now();
    if (t - s.lastClick < 180) { return; } // 防误触 180ms
    s.lastClick = t;

    var e = s.words[s.idx];
    var key = Core.wordKey(e.w);
    var wasNewWord = !db.words[key]; // 热身词注入时已跳过已存在记录，故必为新词（wasFresh）
    var snap = Core.rateWord(db, key, rating, attributionMode(s));
    if (!snap) { return; }
    // 缺口 C：热身词评级不计入新词额度（仍正常写该词进度）
    if (e.warmup && wasNewWord && db.days[snap.dayKey]) {
      db.days[snap.dayKey].fresh = Math.max(0, db.days[snap.dayKey].fresh - 1);
    }
    Core.updateLastSeen(db); // C-AC7：每次作答刷新 lastSeen + 积压计数
    snap.rating = rating;
    snap.atIdx = s.idx; // 评级时所在下标，撤销时据此回退
    s.undoSnap = snap;
    clearTimeout(s.undoTimer);
    s.undoTimer = setTimeout(function () {
      if (state.session === s) { s.undoSnap = null; render(); }
    }, 2600);

    s.answered += 1;
    if (rating === 'know') { s.correct += 1; }
    else if (rating === 'fuzzy') { s.fuzzy += 1; }
    else { s.unknown += 1; }

    if (!db.settings.coachSeen) {
      db.settings.coachSeen = true;
    }
    if (window.Pet) { window.Pet.bite(); }
    Core.saveDB(db);

    s.idx += 1;
    s.revealed = false;
    s.typing = null;
    s.choice = null;
    if (s.idx >= s.words.length) { s.finished = true; }
    render();
  }

  function undoRating() {
    var s = state.session;
    if (!s || !s.undoSnap) { return; }
    Core.undoRate(db, s.undoSnap);
    var rating = s.undoSnap.rating;
    s.answered = Math.max(0, s.answered - 1);
    if (rating === 'know') { s.correct = Math.max(0, s.correct - 1); }
    else if (rating === 'fuzzy') { s.fuzzy = Math.max(0, s.fuzzy - 1); }
    else { s.unknown = Math.max(0, s.unknown - 1); }
    if (window.Pet) { window.Pet.unbite(); }
    Core.saveDB(db);
    var ratedIdx = (s.undoSnap.atIdx != null) ? s.undoSnap.atIdx : -1; // 评级时所在下标
    s.undoSnap = null;
    clearTimeout(s.undoTimer);
    s.finished = false;
    if (s.mode === 'flash') {
      // flash 模式撤销恒回到被评级的词：撤销窗口内若用 ←→ 导航过，
      // idx-1 会落到「当前词的前一词」而非被评级的词，故用 ratedIdx
      s.idx = ratedIdx >= 0 ? ratedIdx : Math.max(0, s.idx - 1);
    } else if (ratedIdx >= 0 && s.idx > ratedIdx) {
      // type/choice 默认路径评级不推进 idx：停留在原词重答（不回退）
      // 但 type+autoNext 的 450ms 定时器可能已 advance（idx 越过评级时下标），
      // 或用户已按 Enter 手动前进——此时仍回退到刚评级那个词，避免跳词。
      s.idx = ratedIdx;
    }
    s.revealed = false;
    s.typing = null;   // type 模式：重建后输入框为空，可重答当前词
    s.choice = null;   // choice 模式：重建选项，可重新点选
    render();
  }

  function advance() {
    var s = state.session;
    s.idx += 1;
    s.revealed = false;
    s.typing = null;
    s.choice = null;
    if (s.idx >= s.words.length) { s.finished = true; }
    render();
  }

  function exitStudy() {
    var s = state.session;
    if (s && !db.settings.coachSeen) { db.settings.coachSeen = true; Core.saveDB(db); }
    state.session = null;
    state.pendingWords = null;
    nav(state.returnHash || '#/learn');
  }

  function restartSession(shuffleWords) {
    var s = state.session;
    if (!s) { return; }
    state.session = buildSession(s.params, shuffleWords ? shuffle(s.originalWords) : s.originalWords);
    render();
  }

  /* ---------- 写出英文 ---------- */

  function renderType() {
    var s = state.session;
    var e = s.words[s.idx];
    if (!s.typing) {
      var senses = Core.sensesOf(e || {});
      s.typing = {
        input: '', revealed: 0, done: false, ok: false,
        senseIdx: Core.pickSense(senses, senseSeed(e))
      };
    }
    var t = s.typing;
    var slots = '';
    for (var i = 0; i < e.w.length; i++) {
      var ch = e.w[i];
      var shown = t.done || i < t.revealed;
      slots += '<span class="slot' + (shown ? ' filled' : '') + '">' + (shown ? esc(ch) : '＿') + '</span>';
    }
    // #023 听写：未揭示时不给中文，只给发音与重听入口
    var listening = !!s.listen && s.listenReveal !== s.idx;
    if (s.listen && !t.done && s.listenSpoken !== s.idx) {
      s.listenSpoken = s.idx;
      speakForDictation(e.w);
    }
    // #026 例句语境（D-051/D-052）：s.ctx 且词边界检测命中才渲染 ctx 题面；
    // 未命中（缺 e / 94 屈折词）静默降级为普通 type 题面（AC09 逐字符一致）
    var ctxP = (s.ctx && !listening) ? ctxPrompt(e) : { found: false };
    var ctxOn = !!ctxP.found;
    var questionHtml = listening
      ? '<div class="listen-stage">' +
          '<div class="listen-title">' + esc(window.PHRASES.LISTEN.title) + '</div>' +
          '<button class="btn listen-play" data-sact="listen-play">' + SVG_SPEAKER +
            '<span>' + esc(window.PHRASES.LISTEN.replay) + '</span></button>' +
          '<div class="listen-hint">' + esc(window.PHRASES.LISTEN.hint) + '</div>' +
          '<button class="btn btn-small" data-sact="listen-reveal">' + esc(window.PHRASES.LISTEN.reveal) + '</button>' +
        '</div>'
      : ctxOn
      ? ctxQuestionHtml(e, ctxP, t)
      : '<div class="type-question">' + esc(typeSensePrompt(e, t.senseIdx)) + '</div>';

    var fb = '';
    if (t.done) {
      fb = t.ok
        ? '<div class="type-feedback good">回答正确！' + (db.settings.autoNext ? '' : '按 Enter 下一词') + '</div>'
        : '<div class="type-feedback bad">再接再厉，正确答案是：</div><div class="type-answer-reveal">' + esc(e.w) + '</div><div class="type-feedback">按 Enter 下一词</div>';
    }

    $('#studyBody').innerHTML =
      '<div class="type-stage' + (t.done && !t.ok ? ' shake-target' : '') + '">' +
        questionHtml +
        '<div class="type-hint-len">' + (ctxOn
          ? esc(window.PHRASES.CTX.hintLen(e.w.length))
          : e.w.length + ' 个字母 · 空格逐字母提示') + '</div>' +
        '<div class="type-slots' + (t.ok ? ' ok' : '') + '" id="typeSlots">' + slots + '</div>' +
        '<div class="type-input-row">' +
          '<input id="typeInput" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="' +
            esc(listening ? window.PHRASES.LISTEN.placeholder : (ctxOn ? window.PHRASES.CTX.placeholder : '写出英文')) + '" value="' + esc(t.input) + '"/>' +
          '<button class="btn btn-primary" data-sact="type-submit">提交（Enter）</button>' +
        '</div>' +
        '<div id="typeFb">' + fb + '</div>' +
      '</div>' +
      studyChrome();

    var inp = $('#typeInput');
    inp.addEventListener('input', function () { s.typing.input = this.value; });
    inp.focus();
    if (t.done && !t.ok) {
      inp.classList.add('shake');
      var row = document.querySelector('.type-stage');
      if (row) { row.classList.add('shake'); }
    }
  }

  /**
   * #026 ctx 题面（G5 规格 v1.2 §2/§3）：ask → 例句挖空 → 释义提示，三段同 stage。
   * 判对：gap 补句中词形（--brand-deep）+ et 揭示（AC05：判对才可出 et）；
   * 判错：gap 补原形（中性 --ink，无 et）；作答前：空 gap、无占位字符、无 et。
   */
  function ctxQuestionHtml(e, ctxP, t) {
    var P = window.PHRASES.CTX;
    var gapCls = 'gap';
    var gapWord = '';
    if (t.done) {
      gapCls += t.ok ? ' is-good' : ' is-miss';
      gapWord = t.ok ? ctxP.gap : e.w;
    }
    var sent = esc(ctxP.before) +
      (t.done
        ? '<span class="' + gapCls + '"><span class="ctx-fill">' + esc(gapWord) + '</span></span>'
        : '<span class="' + gapCls + '" role="img" aria-label="' + esc(P.gapAria) + '"></span>') +
      esc(ctxP.after);
    return '<div class="ctx-stage">' +
      '<div class="ctx-label">' + esc(P.ask) + '</div>' +
      '<div class="ctx-sent">' + sent + '</div>' +
      '<div class="ctx-sense">' + esc(typeSensePrompt(e, t.senseIdx)) + '</div>' +
      (t.done && t.ok && e.et ? '<div class="ctx-sense">' + esc(e.et) + '</div>' : '') +
    '</div>';
  }

  function typeHint() {
    var s = state.session;
    var t = s.typing;
    var e = s.words[s.idx];
    if (t.done) { return; }
    if (t.revealed < e.w.length) {
      t.revealed += 1;
      renderType();
    }
  }

  function typeEnter() {
    var s = state.session;
    var t = s.typing;
    var e = s.words[s.idx];
    if (t.done) { advance(); return; }
    var val = t.input.trim().toLowerCase();
    if (!val) { return; }
    // #026：ctx 档判原形（D-052 单答案）；降级词即使误入此分支，gradeCtx 亦只判 norm(w)，与 gradeSense 等效
    var graded = s.ctx ? Core.gradeCtx(e, val) : Core.gradeSense(e, t.senseIdx, val);
    if (graded.ok) {
      t.done = true;
      t.ok = true;
      doRateTyped('know');
      if (db.settings.autoNext) {
        addTimer(setTimeout(function () { if (state.session && !state.session.finished) { advance(); } }, 450));
      }
    } else {
      t.done = true;
      t.ok = false;
      doRateTyped('unknown');
    }
  }

  /** 写出英文/选义共用：评级但不切换视图（保持反馈可见） */
  function doRateTyped(rating) {
    var s = state.session;
    var t = Date.now();
    if (t - s.lastClick < 180) { s.lastClick = t - 200; } // 输入提交不受防误触限制
    var e = s.words[s.idx];
    var snap = Core.rateWord(db, Core.wordKey(e.w), rating, attributionMode(s));
    if (!snap) { return; }
    Core.updateLastSeen(db); // C-AC7：每次作答刷新 lastSeen + 积压计数
    snap.rating = rating;
    snap.atIdx = s.idx; // 评级时所在下标，撤销时据此回退
    s.undoSnap = snap;
    clearTimeout(s.undoTimer);
    s.undoTimer = setTimeout(function () {
      if (state.session === s) { s.undoSnap = null; render(); }
    }, 2600);
    s.answered += 1;
    if (rating === 'know') { s.correct += 1; }
    else if (rating === 'fuzzy') { s.fuzzy += 1; }
    else { s.unknown += 1; }
    if (!db.settings.coachSeen) { db.settings.coachSeen = true; }
    if (window.Pet) { window.Pet.bite(); }
    Core.saveDB(db);
    if (s.mode === 'type') { renderType(); } else { renderChoice(); }
  }

  /* ---------- 英文选义 ---------- */

  function buildChoiceOptions(e) {
    var pool = Object.keys(ALL_ENTRY_MAP).map(function (k) { return ALL_ENTRY_MAP[k].entry; })
      .filter(function (x) { return x.w !== e.w && x.t; });
    pool = shuffle(pool).slice(0, 3);
    var opts = pool.concat([e]);
    while (opts.length < 4) { opts.push({ w: e.w, t: e.t, p: e.p }); }
    return shuffle(opts);
  }

  function renderChoice() {
    var s = state.session;
    var e = s.words[s.idx];
    if (!s.choice) {
      s.choice = { opts: buildChoiceOptions(e), picked: -1, done: false };
    }
    var c = s.choice;
    var showSpeaker = db.settings.accent !== 'off';
    var grid = c.opts.map(function (o, i) {
      var cls = 'choice-opt';
      if (c.done) {
        if (o.w === e.w) { cls += ' ok'; }
        else if (i === c.picked) { cls += ' err'; }
        else { cls += ' dim'; }
      }
      return '<button class="' + cls + '" data-sact="choice" data-opt="' + i + '">' +
        '<span class="co-key">' + (i + 1) + '</span><span>' + esc(o.t) + '</span></button>';
    }).join('');

    $('#studyBody').innerHTML =
      '<div class="choice-stage">' +
        '<div class="muted">选出正确的中文释义</div>' +
        '<div class="choice-word">' + esc(e.w) + '</div>' +
        (showSpeaker ? '<button class="speaker" data-sact="speak" aria-label="发音">' + SVG_SPEAKER + '</button>' : '') +
        '<div class="choice-grid">' + grid + '</div>' +
        (c.done ? '<div class="type-feedback ' + (c.opts[c.picked] && c.opts[c.picked].w === e.w ? 'good' : 'bad') + '" style="margin-top:16px">' +
          (c.opts[c.picked] && c.opts[c.picked].w === e.w ? '回答正确！' : '正确答案：' + esc(e.t || '')) +
          '　按 Enter 下一词</div>' : '') +
      '</div>' +
      studyChrome();
  }

  function choicePick(i) {
    var s = state.session;
    var c = s.choice;
    if (!c || c.done) { return; }
    var e = s.words[s.idx];
    var picked = c.opts[i];
    if (!picked) { return; }
    c.picked = i;
    c.done = true;
    doRateTyped(picked.w === e.w ? 'know' : 'unknown');
  }

  /* ---------- 单词对对碰 ---------- */

  function buildMatchCells() {
    var s = state.session;
    var pool = s.words.filter(function (e) { return e.t; }).slice(0, 6);
    if (pool.length < 4) {
      var extra = Object.keys(ALL_ENTRY_MAP).map(function (k) { return ALL_ENTRY_MAP[k].entry; })
        .filter(function (e) { return e.t; });
      pool = pool.concat(shuffle(extra)).slice(0, 6);
    }
    var cells = [];
    pool.forEach(function (e, i) {
      cells.push({ id: i, side: 'eng', entry: e, done: false, missed: false });
      cells.push({ id: i, side: 'chn', entry: e, done: false, missed: false });
    });
    return shuffle(cells);
  }

  function renderMatch() {
    var s = state.session;
    if (!s.match) {
      s.match = {
        cells: buildMatchCells(),
        picked: -1,
        matched: 0,
        attempts: 0,
        firstTry: 0,
        start: Date.now(),
        done: false
      };
      state.matchTimer = setInterval(function () {
        var el = $('#matchTime');
        if (el && state.session && state.session.match && !state.session.match.done) {
          el.textContent = matchElapsed();
        }
      }, 500);
      addTimer(state.matchTimer);
    }
    var m = s.match;
    var grid = m.cells.map(function (cell, i) {
      var cls = 'match-cell ' + cell.side;
      if (cell.done) { cls += ' done'; }
      else if (i === m.picked) { cls += ' picked'; }
      return '<button class="' + cls + '" data-sact="match" data-cell="' + i + '">' +
        esc(cell.side === 'eng' ? cell.entry.w : cell.entry.t) + '</button>';
    }).join('');

    var total = m.cells.length / 2;
    $('#studyBody').innerHTML =
      '<div class="match-stage">' +
        '<div class="match-meta">' +
          '<span>⏱ <span id="matchTime">' + matchElapsed() + '</span></span>' +
          '<span>已配对 ' + m.matched + ' / ' + total + '</span>' +
          '<span>尝试 ' + m.attempts + ' 次</span>' +
        '</div>' +
        '<div class="match-grid">' + grid + '</div>' +
        '<div class="match-note">放松小游戏，不推进复习进度 · 不参与评级、不计额度、不进错词本</div>' +
        (m.done ? matchResult() : '') +
      '</div>';
  }

  function matchElapsed() {
    var m = state.session && state.session.match;
    if (!m) { return '0:00'; }
    var sec = Math.floor(((m.done ? m.end : Date.now()) - m.start) / 1000);
    return Math.floor(sec / 60) + ':' + ('0' + (sec % 60)).slice(-2);
  }

  function matchResult() {
    var m = state.session.match;
    var total = m.cells.length / 2;
    var acc = total ? Math.round(m.firstTry / total * 100) : 0;
    return '<div class="finish-card" style="margin:24px auto 0">' +
      '<div class="fc-emoji">🎈</div>' +
      '<h2>配对完成！</h2>' +
      '<div class="fc-rate">首次命中正确率 ' + acc + '%（' + m.firstTry + '/' + total + ' 对）</div>' +
      '<div class="fc-count">用时 ' + matchElapsed() + ' · 本游戏不参与评级、不计额度</div>' +
      '<div style="display:flex;gap:10px;justify-content:center">' +
      '<button class="btn" data-sact="rematch">再来一组</button>' +
      '<button class="btn" data-sact="exit">返回</button></div></div>';
  }

  function matchClick(i) {
    var s = state.session;
    var m = s.match;
    if (m.done) { return; }
    var cell = m.cells[i];
    if (!cell || cell.done) { return; }
    if (m.picked === -1) { m.picked = i; renderMatch(); return; }
    if (m.picked === i) { m.picked = -1; renderMatch(); return; }
    var other = m.cells[m.picked];
    m.attempts += 1;
    if (other.id === cell.id) {
      cell.done = true;
      other.done = true;
      m.matched += 1;
      if (!cell.missed && !other.missed) { m.firstTry += 1; }
      m.picked = -1;
      if (m.matched === m.cells.length / 2) {
        m.done = true;
        m.end = Date.now();
        if (state.matchTimer) { clearInterval(state.matchTimer); state.matchTimer = null; }
      }
      renderMatch();
    } else {
      cell.missed = true;
      other.missed = true;
      m.picked = -1;
      renderMatch();
      addTimer(setTimeout(function () { render(); }, 450));
    }
  }

  /* ---------- 完成页 ---------- */

  function renderFinish() {
    var s = state.session;
    var P = window.PHRASES.FINISH;
    var n = (s.words && s.words.length) || 0;   // 白名单①：总词数（脏会话兜底 0）
    var m = s.answered || 0;                    // 白名单②：记下数（作答+1/撤销-1，与评级无关；脏值兜底 0）
    var lead = m > 0 ? (P.title + ' · ' + P.summary(n, m)) : P.empty;
    $('#studyBody').innerHTML =
      '<div class="finish-card card">' +
        '<h2 class="fc-lead">' + esc(lead) + '</h2>' +
        (m > 0 ? '<div class="fc-count">' + esc(P.count) + '</div>' : '') +
        '<div class="fc-actions">' +
          '<button class="btn btn-primary" data-sact="finish-home">' + esc(P.btnHome) + '</button>' +
          '<button class="btn" data-sact="finish-stats">' + esc(P.btnStats) + '</button>' +
        '</div>' +
      '</div>';
  }


  /* ---------- 学习页统一点击分发 ---------- */

  document.addEventListener('keydown', function (ev) {
    // Esc 必须最先判：结果页（flow 已清）也要能关，否则 AC17 在结果页不成立（G1 方案 B）
    if (ev.key === 'Escape') {
      // 用「挑战弹层是否存在」判定，而不是 modalOpen()：后者会把抽测/单词表等
      // 其它弹层的 Esc 也变成「关闭并聚焦挑战卡」（G5 §9 意图正确，写法需收窄）
      if (state.challengeFlow || $('#modalRoot .ch-modal')) { quitChallenge(); }
      return;
    }
    var f = state.challengeFlow;
    if (!f) { return; }
    if (f.graded) { if (ev.key === 'Enter') { advanceChallenge(); } return; }
    var n = parseInt(ev.key, 10);
    if (n >= 1 && f.current && n <= f.current.options.length) { answerChallenge(n - 1); }
  });

  document.addEventListener('click', function (ev) {
    var el = ev.target.closest('[data-sact]');
    if (!el) { return; }
    var act = el.getAttribute('data-sact');
    var s = state.session;
    switch (act) {
      case 'exit': exitStudy(); break;
      case 'tab': {
        var params = s ? s.params : {};
        var np = {};
        Object.keys(params).forEach(function (k) { np[k] = params[k]; });
        np.mode = el.getAttribute('data-mode');
        // #026：ctx × listen 单选互斥——点谁清另一个，普通标签双删
        if (el.getAttribute('data-listen') === '1') { np.listen = 1; delete np.ctx; }
        else if (el.getAttribute('data-ctx') === '1') { np.ctx = 1; delete np.listen; }
        else { delete np.listen; delete np.ctx; }
        var h = '#/study?';
        h += Object.keys(np).map(function (k) { return k + '=' + encodeURIComponent(np[k]); }).join('&');
        nav(h);
        break;
      }
      case 'restart': restartSession(false); break;
      case 'shuffle': restartSession(true); break;
      case 'kbd': openKbdHelp(); break;
      case 'scope-prev': cycleScope(-1); break;
      case 'scope-next': cycleScope(1); break;
      case 'prev': if (s && s.mode === 'flash') { stepWord(-1); } break;
      case 'next': if (s && s.mode === 'flash') { stepWord(1); } break;
      case 'star': if (s) { toggleStar(); } break;
      case 'speak': if (s) { speakWord(s.words[s.idx].w); } break;
      case 'speak-ex': if (s) { speakSentence(s.words[s.idx].e || ''); } break;
      case 'rate': if (s) { doRate(el.getAttribute('data-rating')); } break;
      case 'undo': undoRating(); break;
      case 'type-submit': if (s && s.mode === 'type') { typeEnter(); } break;
      case 'listen-play': if (s && s.words[s.idx]) { speakForDictation(s.words[s.idx].w); } break;
      case 'listen-reveal': if (s && s.listen) { s.listenReveal = s.idx; renderType(); } break;
      case 'choice': if (s && s.mode === 'choice') { choicePick(parseInt(el.getAttribute('data-opt'), 10)); } break;
      case 'match': if (s && s.mode === 'match') { matchClick(parseInt(el.getAttribute('data-cell'), 10)); } break;
      case 'rematch': if (s) { s.match = null; render(); } break;
      case 'finish-home': state.session = null; nav('#/learn'); break;
      case 'finish-stats': state.session = null; nav('#/stats'); break;
      default: break;
    }
  });

  function cycleScope(delta) {
    var params = state.session ? state.session.params : {};
    var opts = scopeOptions(params);
    var curScope = params.scope || 'today';
    var curUnit = (curScope === 'unit' && params.unit != null)
      ? '&book=' + encodeURIComponent(params.book || '') + '&unit=' + params.unit
      : null;
    var idx = opts.findIndex(function (o) { return o.scope === curScope && o.unit === curUnit; });
    if (idx < 0) { idx = 0; }
    var next = (idx + delta + opts.length) % opts.length;
    nav(opts[next].hash);
  }

  function openKbdHelp() {
    openModal(
      '<h3 style="margin-bottom:14px">⌨ 快捷键</h3>' +
      '<div class="kbd-help">' +
        '<div class="kh-row"><span>翻面</span><kbd>空格</kbd></div>' +
        '<div class="kh-row"><span>正面 Enter / 背面 Enter</span><kbd>翻面 / 认识</kbd></div>' +
        '<div class="kh-row"><span>不认识</span><kbd>1</kbd></div>' +
        '<div class="kh-row"><span>模糊</span><kbd>2</kbd></div>' +
        '<div class="kh-row"><span>认识（背面）</span><kbd>3</kbd></div>' +
        '<div class="kh-row"><span>星标（正面）</span><kbd>3</kbd></div>' +
        '<div class="kh-row"><span>重读</span><kbd>R</kbd></div>' +
        '<div class="kh-row"><span>换词</span><kbd>← →</kbd></div>' +
        '<div class="kh-row"><span>退出本组</span><kbd>Esc</kbd></div>' +
        '<div class="kh-row"><span>写出英文：逐字母提示</span><kbd>空格</kbd></div>' +
        '<div class="kh-row"><span>写出英文：提交</span><kbd>Enter</kbd></div>' +
        '<div class="kh-row"><span>英文选义：选择</span><kbd>1–4</kbd></div>' +
        '<div class="kh-row"><span>下一词</span><kbd>Enter</kbd></div>' +
        '<div class="kh-row"><span>关闭弹窗</span><kbd>Esc</kbd></div>' +
      '</div>'
    );
  }

  /* ---------- 视图：错词本 ---------- */

  function wrongEntries() {
    return Core.wrongRecords(db).map(function (r) { return entryForWord(r.w); });
  }

  function renderWrong() {
    var entries = wrongEntries();
    var startBtns =
      '<div class="mode-entry-row">' +
        '<button class="btn btn-primary" data-wact="flash">闪卡复习</button>' +
        '<button class="btn" data-wact="type">拼写复习</button>' +
        '<button class="btn" data-wact="choice">选义复习</button>' +
        '<button class="btn btn-danger" data-wact="clear" style="margin-left:auto">一键清空</button>' +
      '</div>';

    var body = '';
    if (entries.length === 0) {
      body = '<div class="card" style="text-align:center;padding:50px 20px">' +
        '<div style="font-size:40px">✨</div><p style="margin:10px 0">错词本是空的，太棒了！</p>' +
        '<a class="btn" href="#/learn">回首页</a></div>';
    } else {
      // 按词书分组
      var groups = {};
      entries.forEach(function (e) {
        var hit = ALL_ENTRY_MAP[Core.norm(e.w)];
        var gname = hit ? hit.book.name : '其他';
        (groups[gname] = groups[gname] || []).push(e);
      });
      body = Object.keys(groups).map(function (g) {
        var rows = groups[g].map(function (e) {
          var rec = recOf(e.w);
          var fix = rec ? rec.wfix : 0;
          return '<div class="wrong-row" data-wdetail="' + esc(e.w) + '" role="button" tabindex="0">' +
            '<span class="wr-w">' + esc(e.w) + '</span>' +
            '<span class="wr-t">' + esc(e.t || '（暂无释义）') + '</span>' +
            '<span class="badge st-wrong">连对 ' + fix + '/2</span>' +
            '<span class="wr-actions"><button class="btn btn-small" data-wremove="' + esc(e.w) + '">移出</button></span>' +
          '</div>';
        }).join('');
        return '<div class="wrong-group card"><div class="wg-title">' + esc(g) +
          ' <span class="badge">' + groups[g].length + ' 词</span></div>' + rows + '</div>';
      }).join('');
    }

    $('#view').innerHTML =
      '<div class="page-title">错词本</div>' +
      '<div class="page-sub">「模糊 / 不认识」及拼写、选义答错的词会自动收进；连对 2 次自动毕业移出。</div>' +
      startBtns + body;

    document.querySelectorAll('[data-wact]').forEach(function (el) {
      el.addEventListener('click', function () {
        var act = el.getAttribute('data-wact');
        if (act === 'clear') {
          openModal(
            '<h3 style="margin-bottom:10px">清空错词本</h3>' +
            '<p>确定清空全部 ' + entries.length + ' 个错词吗？此操作不影响学习进度。</p>' +
            '<div style="display:flex;gap:10px;margin-top:16px;justify-content:flex-end">' +
            '<button class="btn" data-modal-close>取消</button>' +
            '<button class="btn btn-danger" id="clearWrongConfirm">清空</button></div>'
          );
          $('#clearWrongConfirm').addEventListener('click', function () {
            Core.clearWrong(db);
            Core.saveDB(db);
            closeModal();
            toast('错词本已清空');
            render();
          });
          return;
        }
        if (entries.length === 0) { toast('错词本是空的'); return; }
        state.pendingWords = entries;
        state.returnHash = '#/wrong';
        nav('#/study?scope=wrong&mode=' + act);
      });
    });
    document.querySelectorAll('[data-wremove]').forEach(function (el) {
      el.addEventListener('click', function (ev) {
        ev.stopPropagation();
        Core.removeWrong(db, Core.wordKey(el.getAttribute('data-wremove')));
        Core.saveDB(db);
        toast('已移出错词本');
        render();
      });
    });
    document.querySelectorAll('[data-wdetail]').forEach(function (el) {
      el.addEventListener('click', function () { openWordDetailByKey(el.getAttribute('data-wdetail')); });
    });
  }

  /* ---------- v3.0 增量：已掌握词抽测 / 学习节律（纯加法） ----------
   * 目标、使用条件、输入输出、边界见 core.js 对应函数 JSDoc。
   * 本节只负责视图与交互：所有状态写入都走 Core 的增量 API，
   * 不修改既有视图的 HTML、不改动学习流程、不新增路由。
   * ------------------------------------------------------------------ */

  var examFlow = null; // {session, answers, idx}，仅当前弹窗生命周期内有效

  /** 统计页附加区块 HTML：节律摘要 + 抽测入口 + 待重读入口。 */
  function examAndRhythmHtml() {
    var P = window.PHRASES;
    var elig = Core.examEligibility(db);
    var pending = Core.pendingReviewKeys(db);
    var rhy = Core.rhythmSummary(db);

    var actionHtml;
    if (!elig.eligible) {
      var why = elig.reason === 'pool-too-small'
        ? P.EXAM.notReadyPool(elig.minPool)
        : P.EXAM.notReadyCooldown(Math.max(1, elig.cooldownDays - Math.max(0, elig.daysSinceLast)));
      actionHtml = '<span class="muted">' + esc(why) + '</span>';
    } else {
      actionHtml = '<button class="btn btn-primary" data-act="exam-start">' + esc(P.EXAM.start) + '</button>';
    }

    var rhythmHtml =
      '<div class="section-gap"></div>' +
      '<div class="card"><h3 style="margin-bottom:8px;font-size:15px;color:var(--ink-soft)">' + esc(P.RHYTHM.title) + '</h3>' +
        '<div class="muted" style="margin-bottom:12px">' + esc(P.RHYTHM.hint) + '</div>' +
        '<div class="stat-cards">' +
          '<div class="card stat-card"><div class="sc-num">' + rhy.activeDays + '</div><div class="sc-label">' + esc(P.RHYTHM.labelActive) + '</div></div>' +
          '<div class="card stat-card"><div class="sc-num">' + rhy.emptyDays + '</div><div class="sc-label">' + esc(P.RHYTHM.labelEmpty) + '</div></div>' +
          '<div class="card stat-card"><div class="sc-num">' + rhy.medianGap + '</div><div class="sc-label">' + esc(P.RHYTHM.labelMedian) + '</div></div>' +
          '<div class="card stat-card"><div class="sc-num">' + rhy.longestGap + '</div><div class="sc-label">' + esc(P.RHYTHM.labelLongest) + '</div></div>' +
        '</div></div>';

    var examHtml =
      '<div class="section-gap"></div>' +
      '<div class="card"><h3 style="margin-bottom:8px;font-size:15px;color:var(--ink-soft)">' + esc(P.EXAM.sectionTitle) + '</h3>' +
        '<div class="muted">' + esc(P.EXAM.sectionHint) + '</div>' +
        '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:12px">' +
          actionHtml +
          (pending.length ? '<button class="btn" data-act="exam-pending">' + esc(P.EXAM.pending(pending.length)) + '</button>' : '') +
        '</div></div>';

    return rhythmHtml + examHtml;
  }

  /** 绑定附加区块按钮（视图渲染后调用）。 */
  function bindExamAndRhythm() {
    var start = $('[data-act="exam-start"]');
    if (start) { start.addEventListener('click', openExamFlow); }
    var pend = $('[data-act="exam-pending"]');
    if (pend) { pend.addEventListener('click', openPendingModal); }
  }

  /** 弹窗内的词行，复用既有 .wrong-row 样式。 */
  function examRow(w, meaning, stateText) {
    return '<div class="wrong-row"><span class="wr-w">' + esc(w) + '</span>' +
      '<span class="wr-t">' + esc(meaning) + '</span>' +
      '<span class="badge">' + esc(stateText) + '</span></div>';
  }

  /** 待重读 key → 既有学习序列 entry（供 scope=wrong 复用）。 */
  function examReviewEntries(keys) {
    return keys.map(function (k) {
      var r = db.words[k];
      return r ? entryForWord(r.w) : null;
    }).filter(function (e) { return !!e; });
  }

  /** 复用既有 pendingWords 机制进入「写出英文」复习，不改学习流程。 */
  function enterExamReview(keys) {
    var P = window.PHRASES;
    var entries = examReviewEntries(keys);
    closeModal();
    if (!entries.length) { toast(P.EXAM.pendingEmpty); return; }
    state.pendingWords = entries;
    state.returnHash = '#/stats';
    nav('#/study?scope=wrong&mode=type');
  }

  /** 发起一次抽测（仅用户主动点击）。 */
  function openExamFlow() {
    var P = window.PHRASES;
    var sess = Core.startExam(db);
    if (!sess.ok) {
      toast(sess.reason === 'pool-too-small' ? P.EXAM.notReadyPool(Core.EXAM_DEFAULTS.minPool) : P.EXAM.notReadyCooldown(1));
      return;
    }
    examFlow = { session: sess, answers: [], idx: 0 };
    renderExamQuestion();
  }

  /** 渲染当前一题（弹窗内，Enter 提交，Esc 由既有全局处理关闭）。 */
  function renderExamQuestion() {
    var P = window.PHRASES;
    if (!examFlow) { return; }
    var f = examFlow;
    if (f.idx >= f.session.keys.length) { finishExamFlow(); return; }
    var key = f.session.keys[f.idx];
    var rec = db.words[key];
    var w = rec ? rec.w : (key.indexOf('w::') === 0 ? key.slice(3) : key);
    var e = entryForWord(w);
    var senses = Core.sensesOf(e || {});
    var senseIdx = Core.pickSense(senses, senseSeed(e, f.session.at));
    var sense = senses[senseIdx] || { text: '' };
    var meaning = sense.text || P.SENSES.noMeaning;
    f.currentSenseIdx = senseIdx;
    f.currentSenseText = meaning;

    openModal(
      '<h3 style="margin-bottom:8px">' + esc(P.EXAM.modalTitle) + '</h3>' +
      '<div class="muted" style="margin-bottom:14px">' + esc(P.EXAM.question(f.idx + 1, f.session.keys.length, meaning)) + '</div>' +
      '<input id="examAnswer" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" ' +
        'aria-label="' + esc(P.EXAM.placeholder) + '" placeholder="' + esc(P.EXAM.placeholder) + '" ' +
        'style="width:100%;padding:11px 12px;font-size:17px;text-align:center" />' +
      '<div class="muted" style="margin-top:8px;font-size:12px">' + esc(P.EXAM.quitHint) + '</div>' +
      '<div style="display:flex;gap:10px;justify-content:flex-end;margin-top:18px">' +
        '<button class="btn" id="examQuit">' + esc(P.EXAM.quit) + '</button>' +
        '<button class="btn btn-primary" id="examNext">' + esc(P.EXAM.submit) + '</button>' +
      '</div>'
    );
    var inp = $('#examAnswer');
    if (inp) {
      inp.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter') { ev.preventDefault(); submitExamAnswer(); }
      });
      inp.focus();
    }
    $('#examNext').addEventListener('click', submitExamAnswer);
    $('#examQuit').addEventListener('click', function () {
      examFlow = null;
      closeModal();
      toast(P.EXAM.quitToast);
    });
  }

  /** 提交当前一题，进入下一题或结案。 */
  function submitExamAnswer() {
    if (!examFlow) { return; }
    var f = examFlow;
    var inp = $('#examAnswer');
    f.answers.push({
      key: f.session.keys[f.idx],
      answer: inp ? inp.value : '',
      senseIdx: f.currentSenseIdx,
      senseText: f.currentSenseText
    });
    f.idx += 1;
    renderExamQuestion();
  }

  /** 结案：判定 → 落库 → 结果弹窗（结果只陈述页数，不出现分数）。 */
  function finishExamFlow() {
    var P = window.PHRASES;
    var f = examFlow;
    if (!f) { return; }
    var record = Core.gradeExam(db, f.session, f.answers);
    Core.commitExam(db, record);
    Core.saveDB(db);
    examFlow = null;

    var weak = record.weakKeys;
    var title = weak.length ? P.EXAM.resultWeak(weak.length) : P.EXAM.resultAll(record.size);
    var detail = record.items.map(function (it) {
      var e = entryForWord(it.w);
      var ans = f.answers.filter(function (a) { return a.key === it.key; })[0] || {};
      // #016：按所选义项判定并绑定 senseIdx/senseText（纯函数，不写库）；
      // 落库仍由 gradeExam / commitExam 按词粒度维持（C10 抽测不改写状态）。
      var graded = Core.gradeSense(e, ans.senseIdx, ans.answer);
      return examRow(it.w, graded.senseText || P.SENSES.noMeaning, graded.ok ? P.EXAM.itemKept : P.EXAM.itemWeak);
    }).join('');

    openModal(
      '<h3 style="margin-bottom:10px">' + esc(title) + '</h3>' +
      '<details style="margin-top:10px"><summary style="cursor:pointer">' + esc(P.EXAM.detailTitle) + '</summary>' +
        '<div style="margin-top:8px">' + detail + '</div></details>' +
      '<div style="display:flex;gap:10px;justify-content:flex-end;margin-top:18px">' +
        (weak.length ? '<button class="btn" id="examReview">' + esc(P.EXAM.review) + '</button>' : '') +
        '<button class="btn btn-primary" data-modal-close>' + esc(P.EXAM.close) + '</button>' +
      '</div>'
    );
    if (weak.length) {
      $('#examReview').addEventListener('click', function () { enterExamReview(weak); });
    }
  }

  /** 待重读清单弹窗：可去复习，或标记已重读。 */
  function openPendingModal() {
    var P = window.PHRASES;
    var keys = Core.pendingReviewKeys(db);
    if (!keys.length) { toast(P.EXAM.pendingEmpty); return; }
    var rows = keys.map(function (k) {
      var r = db.words[k];
      var w = r ? r.w : (k.indexOf('w::') === 0 ? k.slice(3) : k);
      var e = entryForWord(w);
      return examRow(w, (e && e.t) ? e.t : P.EXAM.noMeaning, P.EXAM.itemWeak);
    }).join('');
    openModal(
      '<h3 style="margin-bottom:10px">' + esc(P.EXAM.pendingTitle) + ' · ' + esc(P.EXAM.pending(keys.length)) + '</h3>' +
      '<div>' + rows + '</div>' +
      '<div style="display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;margin-top:18px">' +
        '<button class="btn" id="examMark">' + esc(P.EXAM.markReviewed) + '</button>' +
        '<button class="btn" id="examGo">' + esc(P.EXAM.review) + '</button>' +
        '<button class="btn btn-primary" data-modal-close>' + esc(P.EXAM.close) + '</button>' +
      '</div>'
    );
    $('#examMark').addEventListener('click', function () {
      Core.markReviewed(db, keys);
      Core.saveDB(db);
      closeModal();
      render();
      toast(P.EXAM.markedToast);
    });
    $('#examGo').addEventListener('click', function () { enterExamReview(keys); });
  }

  /* ---------- v3.0 第二批：抽测记录 / 装订凭据 / 星标精读（纯加法） ----------
   * 目标、使用条件、输入输出、边界见 core.js 对应函数 JSDoc。
   * 不修改上一轮新增的任何函数；仅在统计页末尾再拼接一个区块。
   * ---------------------------------------------------------------------- */

  /** 统计页第二附加区块；同时是 db.binding 的唯一结算点（打开统计页时）。 */
  function bindingAndStarHtml() {
    var P = window.PHRASES;
    Core.syncBinding(db);
    Core.saveDB(db);

    var bp = Core.bindingProgress(db);
    var history = Core.examHistory(db);
    var stars = Core.starredKeys(db);
    var notes = (db.binding && Array.isArray(db.binding.issued)) ? db.binding.issued : [];

    var noteBtn = notes.length
      ? '<button class="btn" data-act="binding-list">' + esc(P.BINDING.list(notes.length)) + '</button>' : '';
    var historyBtn = history.length
      ? '<button class="btn" data-act="history-list">' + esc(P.HISTORY.entry(history.length)) + '</button>' : '';
    var starBtn = stars.length
      ? '<button class="btn" data-act="star-review">' + esc(P.BINDING.star(stars.length)) + '</button>'
      : '<span class="muted">' + esc(P.BINDING.starEmpty) + '</span>';
    var statusText = history.length
      ? P.BINDING.progress(bp.totalPages, bp.needed) : P.BINDING.noExam;

    return '<div class="section-gap"></div>' +
      '<div class="card"><h3 style="margin-bottom:8px;font-size:15px;color:var(--ink-soft)">' +
        esc(P.BINDING.sectionTitle) + '</h3>' +
        '<div class="muted">' + esc(P.BINDING.hint) + '</div>' +
        '<div class="muted" style="margin-top:8px">' + esc(statusText) + '</div>' +
        '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:12px">' +
          noteBtn + historyBtn +
        '</div></div>' +
      '<div class="section-gap"></div>' +
      '<div class="card"><h3 style="margin-bottom:8px;font-size:15px;color:var(--ink-soft)">' +
        esc(P.BINDING.starTitle) + '</h3>' +
        '<div class="muted">' + esc(P.BINDING.starHint) + '</div>' +
        '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px">' + starBtn + '</div>' +
      '</div>';
  }

  /** 绑定第二附加区块按钮。 */
  function bindBindingAndStar() {
    var h = $('[data-act="history-list"]');
    if (h) { h.addEventListener('click', openHistoryModal); }
    var b = $('[data-act="binding-list"]');
    if (b) { b.addEventListener('click', openBindingModal); }
    var s = $('[data-act="star-review"]');
    if (s) { s.addEventListener('click', enterStarReview); }
  }

  /** 抽测记录弹窗（只陈述页数）。 */
  function openHistoryModal() {
    var P = window.PHRASES;
    var rows = Core.examHistory(db);
    if (!rows.length) { toast(P.HISTORY.empty); return; }
    var body = rows.map(function (r) {
      return '<div class="wrong-row"><span class="wr-t">' +
        esc(P.HISTORY.row(r.dateKey || '—', r.size, r.correct, r.weakCount)) + '</span></div>';
    }).join('');
    openModal(
      '<h3 style="margin-bottom:6px">' + esc(P.HISTORY.title) + '</h3>' +
      '<div class="muted" style="margin-bottom:12px">' + esc(P.HISTORY.hint) + '</div>' +
      '<div>' + body + '</div>' +
      '<div style="display:flex;justify-content:flex-end;margin-top:18px">' +
        '<button class="btn btn-primary" data-modal-close>' + esc(P.HISTORY.close) + '</button>' +
      '</div>'
    );
  }

  /** 凭据清单弹窗（可本机删除，不生成图片、不分享）。 */
  function openBindingModal() {
    var P = window.PHRASES;
    var notes = (db.binding && Array.isArray(db.binding.issued)) ? db.binding.issued : [];
    if (!notes.length) { toast(P.BINDING.empty); return; }
    var body = notes.map(function (n) {
      var dk = n.at ? Core.dayKey(n.at) : '—';
      return '<div class="wrong-row">' +
        '<span class="wr-w">' + esc(P.BINDING.rowTitle(n.no)) + '</span>' +
        '<span class="wr-t">' + esc(P.BINDING.date(dk)) + ' · ' +
          esc(P.BINDING.rowDetail(n.pages || 0, n.examSize || 0, n.examKept || 0)) + '</span>' +
        '<span class="wr-actions"><button class="btn btn-small" data-binding-del="' + Number(n.no) + '">' +
          esc(P.BINDING.del) + '</button></span>' +
      '</div>';
    }).join('');
    openModal(
      '<h3 style="margin-bottom:10px">' + esc(P.BINDING.listTitle) + '</h3>' +
      '<div>' + body + '</div>' +
      '<div style="display:flex;justify-content:flex-end;margin-top:18px">' +
        '<button class="btn btn-primary" data-modal-close>' + esc(P.BINDING.close) + '</button>' +
      '</div>'
    );
    document.querySelectorAll('[data-binding-del]').forEach(function (el) {
      el.addEventListener('click', function (ev) {
        ev.stopPropagation();
        Core.deleteBinding(db, Number(el.getAttribute('data-binding-del')));
        Core.saveDB(db);
        closeModal();
        render();
        toast(P.BINDING.delToast);
      });
    });
  }

  /** 星标精读：复用既有 scope=star&mode=type，不新增路由、不改学习流程。 */
  function enterStarReview() {
    var P = window.PHRASES;
    if (!Core.starredKeys(db).length) { toast(P.BINDING.starEmpty); return; }
    state.returnHash = '#/stats';
    nav('#/study?scope=star&mode=type');
  }

  /* ---------- #018 统计页入口卡（D-041） ----------
   * 纯锚点：零事件绑定、零新路由、零写入；仪表盘为独立只读页。
   * 数字只做 db.words[*].evts 的 O(n) 聚合，不逐词调 strengthOf（控渲染开销）。
   * ------------------------------------------------------------------ */

  function strengthEntryHtml() {
    var P = window.PHRASES.STRENGTH_ENTRY;
    var withEvts = 0;
    var events = 0;
    var keys = Object.keys(db.words);
    for (var i = 0; i < keys.length; i++) {
      var rec = db.words[keys[i]];
      if (!rec) { continue; }
      var n = Array.isArray(rec.evts) ? rec.evts.length : 0;
      if (n > 0) { withEvts++; events += n; }
    }
    var href = encodeURI('遗忘曲线仪表盘.html');
    return '<div class="section-gap"></div>' +
      '<div class="card">' +
        '<div style="display:flex;gap:12px;justify-content:space-between;align-items:flex-start;flex-wrap:wrap">' +
          '<div style="flex:1 1 220px;min-width:0">' +
            '<h3 style="margin-bottom:8px;font-size:15px;color:var(--ink-soft)">' + esc(P.title) + '</h3>' +
            '<div class="muted">' + esc(P.hint) + '</div>' +
          '</div>' +
          /* 不用 .btn-primary：实测白字对 --brand 仅 2.79:1（AA 需 4.5），属既有全局设计债，
             本卡不新造同类违规；.btn 默认墨色文字 13.50:1（暗色 12.77:1） */
          '<a class="btn" style="font-weight:600" href="' + href + '" target="_blank" rel="noopener">' +
            esc(P.open) + ' ›</a>' +
        '</div>' +
        '<div class="stat-cards" style="margin:14px 0 0">' +
          '<div class="card stat-card"><div class="sc-num">' + withEvts + '</div>' +
            '<div class="sc-label">' + esc(P.metricWords) + '</div></div>' +
          '<div class="card stat-card"><div class="sc-num">' + events + '</div>' +
            '<div class="sc-label">' + esc(P.metricEvents) + '</div></div>' +
        '</div>' +
        '<div class="muted" style="margin-top:10px">' + esc(withEvts ? P.note : P.empty) + '</div>' +
      '</div>';
  }

  /* ---------- 视图：学习统计 ---------- */

  /** #027：把主句里的比例渲染为行内强调（.ret-num）——同一百分比只出现一次，不做独立比例块 */
  function retLeadHtml(RP, samples, pNum) {
    var txt = RP.lead(samples, pNum);
    var token = esc(pNum);
    var full = esc(txt);
    var at = full.indexOf(token);
    if (at < 0) { return full; }
    return full.slice(0, at) + '<span class="ret-num">' + token + '</span>' + full.slice(at + token.length);
  }

  function renderStats() {
    var st = Core.stats(db);
    var accPct = Math.round(st.accuracy * 100);

    // 26 周热力图（26 列 × 7 行）
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var cellsHtml = '';
    var start = new Date(today.getTime() - (26 * 7 - 1) * Core.DAY_MS);
    for (var i = 0; i < 26 * 7; i++) {
      var d = new Date(start.getTime() + i * Core.DAY_MS);
      var dk = Core.dayKey(d.getTime());
      var total = (db.days[dk] && db.days[dk].total) || 0;
      var lvl = total >= 40 ? 'l4' : total >= 20 ? 'l3' : total >= 10 ? 'l2' : total >= 1 ? 'l1' : '';
      cellsHtml += '<div class="heat-cell ' + lvl + '" title="' + dk + ' · ' + total + ' 次"></div>';
    }

    // 最近 14 天柱状图
    var bars = '';
    var maxTotal = 1;
    var last14 = [];
    for (var j = 13; j >= 0; j--) {
      var dd = new Date(today.getTime() - j * Core.DAY_MS);
      var k2 = Core.dayKey(dd.getTime());
      var t2 = (db.days[k2] && db.days[k2].total) || 0;
      maxTotal = Math.max(maxTotal, t2);
      last14.push({ key: k2, total: t2 });
    }
    bars = last14.map(function (x) {
      var hPct = Math.round(x.total / maxTotal * 100);
      return '<div class="bar-col"><span class="bar-num">' + (x.total || '') + '</span>' +
        '<div class="bar" style="height:' + hPct + '%"></div>' +
        '<span class="bar-day">' + x.key.slice(5) + '</span></div>';
    }).join('');

    // 近 14 天「有效完成率」（Open-7 北极星）：完成数 ≥ 80% × planTarget 计为有效
    var compBars = '';
    for (var c = 13; c >= 0; c--) {
      var cd = new Date(today.getTime() - c * Core.DAY_MS);
      var ck = Core.dayKey(cd.getTime());
      var crate = Core.dailyCompletionRate(db, ck);
      // N4W-AC09：空打开日（null）渲染中性态，不显示数字 / 不显示 0% / 不报 NaN，不得误判为 0%
      if (crate === null) {
        compBars += '<div class="empty-day"><span class="bar-empty" title="' + esc(window.PHRASES.LADDER.emptyDayTitle) + '">·</span>' +
          '<span class="bar-day">' + ck.slice(5) + '</span></div>';
      } else {
        var ch = Math.round(crate * 100);
        compBars += '<div class="bar-col"><span class="bar-num">' + (ch || '') + '</span>' +
          '<div class="bar comp' + (crate >= 0.8 ? ' ok' : '') + '" style="height:' + ch + '%"></div>' +
          '<span class="bar-day">' + ck.slice(5) + '</span></div>';
      }
    }

    // #027 长期答对情况（D-054/D-055）：只读观测——纯分析层，不写库、不改 SRS、不新增路由
    var ret = Core.retentionStats(db);
    var RP = window.PHRASES.RETENTION;
    var retMin = Core.RETENTION_MIN_SAMPLES;
    // 比例未取整判定：真实值 >0 但四舍五入为 0 时显示 <1%（禁 0%）
    // G10 R27-F02：上端与下端对称保护——999/1000 不得显示 100%（实际有 1 词未答对）
    var pNum = '';
    if (ret.rate !== null) {
      if (ret.rate > 0 && ret.ratePct === 0) { pNum = '<1%'; }
      else if (ret.rate < 1 && ret.ratePct === 100) { pNum = '>99%'; }
      else { pNum = ret.ratePct + '%'; }
    }
    var retLead;
    if (ret.state === 'ok') {
      retLead = '<div class="ret-lead">' + retLeadHtml(RP, ret.samples, pNum) + '</div>';
    } else if (ret.state === 'insufficient') {
      retLead = '<div class="ret-lead">' + esc(RP.leadInsufficient(ret.samples, retMin)) + '</div>';
    } else {
      retLead = '<div class="ret-lead">' + esc(RP.leadEmpty(ret.window)) + '</div>';
    }
    // 副标三段条件拼接：窗口段始终、样本段 M>0、缺口段 C>0（避免出现「样本 0 个词」）
    var retSub = [RP.subWindow(ret.window)];
    // G10 R27-F01：insufficient 态主句已写「样本 M 个词，满 10 个才显示比例。」→ 副标不再重复样本段
    if (ret.state === 'ok' && ret.samples > 0) { retSub.push(RP.subSample(ret.samples)); }
    if (ret.pending > 0) { retSub.push(RP.subPending(ret.pending)); }
    var retCardHtml =
      '<div class="section-gap"></div>' +
      '<div class="card ret-card">' +
        '<h3 style="margin-bottom:8px;font-size:15px;color:var(--ink-soft)">' + esc(RP.title) + '</h3>' +
        retLead +
        '<div class="muted" style="margin-top:10px">' + esc(retSub.join(' · ')) + '</div>' +
        '<div class="muted" style="margin-top:4px">' + esc(RP.note) + '</div>' +
      '</div>';

    $('#view').innerHTML =
      '<div class="page-title">学习统计</div>' +
      '<div class="page-sub">坚持看见自己的轨迹</div>' +
      '<div class="stat-cards">' +
        '<div class="card stat-card"><div class="sc-num">' + st.streak + '</div><div class="sc-label">连续天数</div></div>' +
        '<div class="card stat-card"><div class="sc-num">' + accPct + '%</div><div class="sc-label">总正确率</div></div>' +
        '<div class="card stat-card"><div class="sc-num">' + st.learned + '</div><div class="sc-label">已学词数</div></div>' +
        '<button class="card stat-card clickable" data-act="stat-wrong"><div class="sc-num">' + st.wrongCount + '</div><div class="sc-label">错词本 ›</div></button>' +
      '</div>' +
      '<div class="card"><h3 style="margin-bottom:12px;font-size:15px;color:var(--ink-soft)">26 周热力图</h3>' +
      '<div class="heat-wrap"><div class="heat-grid">' + cellsHtml + '</div></div></div>' +
      '<div class="section-gap"></div>' +
      '<div class="card"><h3 style="margin-bottom:12px;font-size:15px;color:var(--ink-soft)">最近 14 天</h3>' +
      '<div class="bar-chart">' + bars + '</div></div>' +

      '<div class="section-gap"></div>' +
      '<div class="card"><h3 style="margin-bottom:8px;font-size:15px;color:var(--ink-soft)">近 14 天有效完成率</h3>' +
      '<div class="muted" style="margin-bottom:10px">完成数 ≥ 计划 ' + Math.round(0.8 * 100) + '% 记为有效（次日有效复习完成率 · 北极星指标）</div>' +
      '<div class="bar-chart">' + compBars + '</div></div>' +
      retCardHtml +
      strengthEntryHtml() +
      examAndRhythmHtml() +
      bindingAndStarHtml();

    $('[data-act="stat-wrong"]').addEventListener('click', function () { nav('#/wrong'); });
    bindExamAndRhythm();
    bindBindingAndStar();
  }

  /* ---------- 视图：我的 ---------- */

  function applyTheme() {
    document.documentElement.setAttribute('data-theme', db.settings.theme || 'light');
  }

  /** 当前目标类型的中文标签 */
  function goalLabel() {
    var types = window.PHRASES.GOAL_TYPES;
    for (var i = 0; i < types.length; i++) {
      if (types[i].key === db.goal.type) { return types[i].label; }
    }
    return '自由学习';
  }

  function renderMine() {
    var s = db.settings;
    var P = window.PHRASES;
    var notesCount = Object.keys(db.words).filter(function (k) { return db.words[k].note; }).length;
    // #019 记忆强度叠加（D-042）；活动态样式由 .seg button.active 统一提供
    // （#021/D-044 起 --brand-deep 已深一档，对比 5.37:1，不再需要内联 color 规避）
    var strengthOn = s.strengthMode === 'on';
    var segOnAttr = strengthOn ? ' class="active"' : '';
    var segOffAttr = strengthOn ? '' : ' class="active"';
    // #020 逐词接管计数（D-043）：仅统计已学词（reps>0）；strengthFrom=0（旧库）时全部视为已接管
    var strengthFrom = (typeof s.strengthFrom === 'number' && isFinite(s.strengthFrom)) ? s.strengthFrom : 0;
    var takenCount = 0;
    var pendingCount = 0;
    if (strengthOn) {
      Object.keys(db.words).forEach(function (k) {
        var rec = db.words[k];
        if (!rec || !(rec.reps > 0)) { return; }
        if (strengthFrom > 0 && !(rec.last >= strengthFrom)) { pendingCount++; } else { takenCount++; }
      });
    }

    $('#view').innerHTML =
      '<div class="page-title">我的</div>' +
      '<div class="card settings-group" style="margin-top:14px">' +
        '<b style="font-size:18px">背单词365</b>' +
        '<div class="muted">365天，每天进步一点 · v2.0</div>' +
      '</div>' +

      '<div class="card settings-group">' +
        '<h3>学习设置</h3>' +
        '<div class="settings-row"><span class="sr-label">每日新词上限<span class="sr-sub">默认 20，全局每日额度</span></span>' +
          '<input type="number" id="setFresh" min="1" max="200" value="' + s.freshLimit + '"/></div>' +
        '<div class="settings-row"><span class="sr-label">每日复习上限<span class="sr-sub">默认 60</span></span>' +
          '<input type="number" id="setReview" min="1" max="500" value="' + s.reviewLimit + '"/></div>' +
        '<div class="settings-row"><span class="sr-label">写出英文「答对自动下一词」</span>' +
          '<button class="switch' + (s.autoNext ? ' on' : '') + '" id="setAutoNext" role="switch" aria-checked="' + s.autoNext + '" aria-label="答对自动下一词"></button></div>' +
      '</div>' +

      '<div class="card settings-group">' +
        '<h3>' + esc(P.SETTINGS.planSection) + '</h3>' +
        '<div class="settings-row"><span class="sr-label">' + esc(P.SETTINGS.dailyMinutes) +
          '<span class="sr-sub">' + esc(P.SETTINGS.dailyMinutesSubtitle()) + '</span></span>' +
          '<span class="seg" id="setDailyMin">' +
            P.DAILY_MINUTE_OPTIONS.map(function (m) {
              return '<button data-min="' + m + '" class="' + (s.dailyMinutes === m ? 'active' : '') + '">' + m + '</button>';
            }).join('') +
          '</span></div>' +
        /* N4W-AC05/06/12：只读「建议调档」提示，绝不自动写真源；用户点档位仍走 setDailyMin 手动保存路径 */
        (function () {
          var rb = Core.weeklyRebalance(db);
          if (rb.suggested && rb.suggestedDailyMinutes != null) {
            return '<div class="rebalance-hint muted">' + esc('建议把每日时长调到 ' + rb.suggestedDailyMinutes + ' 分钟') + '</div>';
          }
          return '';
        })() +
        '<div class="settings-row"><span class="sr-label">' + esc(P.SETTINGS.returnDays) + '</span>' +
          '<input type="number" id="setReturnDays" min="1" max="30" value="' + s.returnDays + '"/></div>' +
        '<div class="settings-row"><span class="sr-label">' + esc(P.SETTINGS.rebuildCap) + '</span>' +
          '<input type="number" id="setRebuildCap" min="1" max="100" value="' + s.rebuildCap + '"/></div>' +
        '<div class="settings-row"><span class="sr-label">' + esc(P.SETTINGS.pressureThreshold) + '</span>' +
          '<input type="number" id="setPressure" min="1" max="200" value="' + s.pressureThreshold + '"/></div>' +
        '<div class="settings-row"><span class="sr-label">' + esc(P.SETTINGS.reviewRatio) +
          '<span class="sr-sub">复习占 ' + Math.round(s.reviewRatio * 100) + '%</span></span>' +
          '<input type="number" id="setReviewRatio" min="0.1" max="0.9" step="0.05" value="' + s.reviewRatio + '"/></div>' +
      '</div>' +

      /* N2 默写阶梯（N2L-AC01/03/04/09）：只读展示 + 点击切换写入 db.ladder.mode（不新建存储） */
      '<div class="card settings-group">' +
        '<h3>' + esc(P.LADDER.section) + '</h3>' +
        '<div class="settings-row"><span class="sr-label">' + esc(P.LADDER.auto) + ' / ' + esc(P.LADDER.manual) +
          '<span class="sr-sub">' + esc(db.ladder.mode === 'auto' ? P.LADDER.autoDesc : P.LADDER.manualDesc) + '</span></span>' +
          '<span class="seg" id="setLadder">' +
            '<button data-ladder="auto" class="' + (db.ladder.mode === 'auto' ? 'active' : '') + '">' + esc(P.LADDER.auto) + '</button>' +
            '<button data-ladder="manual" class="' + (db.ladder.mode === 'manual' ? 'active' : '') + '">' + esc(P.LADDER.manual) + '</button>' +
          '</span></div>' +
        '<div class="settings-row" style="border-bottom:none"><span class="sr-label">' + esc(P.LADDER.modeChoiceLabel) + '</span>' +
          '<span class="muted">' + (function () {
            var lr = Core.resolveLadderMode({ lvl: 1, ladderMode: db.ladder.mode, cardKind: 'review', sessionMode: 'choice', userMode: 'choice' });
            var label = lr.mode === 'type' ? '写出英文' : lr.mode === 'choice' ? '英文选义' : lr.mode === 'flash' ? '单词快过' : '对对碰';
            return esc(label) + (lr.hint ? esc('（' + P.LADDER.hintLabel + '）') : '');
          })() + '</span></div>' +
      '</div>' +

      /* #019 记忆强度叠加开关（D-042）：只写 db.settings.strengthMode（已有字段，缺省 OFF）；
         LADDER_DAYS 与 rateWord 零改动，关闭即回到固定阶梯（C4 可回退基线） */
      '<div class="card settings-group">' +
        '<h3>' + esc(P.STRENGTH.modeSection) + '</h3>' +
        '<div class="settings-row"><span class="sr-label">' + esc(P.STRENGTH.modeOn) + ' / ' + esc(P.STRENGTH.modeOff) +
          '<span class="sr-sub">' + esc(P.STRENGTH.modeState(strengthOn)) + '</span></span>' +
          '<span class="seg" id="setStrength" role="group" aria-label="' + esc(P.STRENGTH.modeSection) + '">' +
            '<button data-strength="off" aria-pressed="' + (!strengthOn) + '"' + segOffAttr + '>' + esc(P.STRENGTH.modeOff) + '</button>' +
            '<button data-strength="on" aria-pressed="' + strengthOn + '"' + segOnAttr + '>' + esc(P.STRENGTH.modeOn) + '</button>' +
          '</span></div>' +
        '<p class="muted" style="margin-top:10px">' + esc(P.STRENGTH.modeHint) + '</p>' +
        (strengthOn ? '<p class="muted" style="margin-top:4px">' + esc(P.STRENGTH.takeover(takenCount, pendingCount)) + '</p>' : '') +
        '<p class="muted" style="margin-top:4px">' + esc(P.STRENGTH.modeWarn) + '</p>' +
        '<p class="muted" style="margin-top:4px">' + esc(P.STRENGTH.modeFallback(Core.LADDER_DAYS.join(' / '))) + '</p>' +
      '</div>' +

      '<div class="card settings-group">' +
        '<h3>目标与计划</h3>' +
        (db.onboarding.completed ? '<div class="settings-row"><span class="sr-label">当前目标</span><span>' + esc(goalLabel()) + '</span></div>' : '') +
        (db.plan.derivedAt > 0 ? '<div class="settings-row"><span class="sr-label">计划概览</span><span class="muted plan-overview">' + esc(P.HOME.planCard(db.plan)) + '</span></div>' : '') +
        '<div class="settings-row" style="border-bottom:none"><span class="sr-label">重做 / 重测</span>' +
          '<span style="display:flex;gap:8px;flex-wrap:wrap">' +
            '<button class="btn btn-small" id="btnRedoGoal">' + esc(P.SETTINGS.redoGoal) + '</button>' +
            (db.baseline.testedAt > 0 ? '<button class="btn btn-small" id="btnRetest">' + esc(P.ONBOARD.retest) + '</button>' : '') +
          '</span></div>' +
        (needsReestimate() ? '<div class="reestimate-tip">词汇量已过 14 天，建议重测。</div>' : '') +
        (db.baseline.testedAt > 0 ? '<div class="settings-row" style="border-bottom:none"><span class="sr-label">测试反馈</span>' +
          '<span style="display:flex;gap:8px;flex-wrap:wrap">' +
            '<button class="btn btn-small" id="btnTooEasy">' + esc(P.ONBOARD.feedbackTooEasy) + '</button>' +
            '<button class="btn btn-small" id="btnTooHard">' + esc(P.ONBOARD.feedbackTooHard) + '</button>' +
          '</span></div>' : '') +
      '</div>' +

      '<div class="card settings-group">' +
        '<h3>发音设置</h3>' +
        '<div class="settings-row"><span class="sr-label">口音</span>' +
          '<span class="seg">' +
            '<button data-seg-accent="us" class="' + (s.accent === 'us' ? 'active' : '') + '">美音</button>' +
            '<button data-seg-accent="uk" class="' + (s.accent === 'uk' ? 'active' : '') + '">英音</button>' +
            '<button data-seg-accent="off" class="' + (s.accent === 'off' ? 'active' : '') + '">关闭</button>' +
          '</span></div>' +
        '<div class="settings-row"><span class="sr-label">语速<span class="sr-sub" id="rateVal">' + s.rate.toFixed(1) + 'x</span></span>' +
          '<input type="range" id="setRate" min="0.5" max="1.6" step="0.1" value="' + s.rate + '"/></div>' +
      '</div>' +

      '<div class="card settings-group">' +
        '<h3>外观</h3>' +
        '<div class="settings-row"><span class="sr-label">主题</span>' +
          '<span class="seg">' +
            '<button data-seg-theme="light" class="' + (s.theme !== 'dark' ? 'active' : '') + '">浅色</button>' +
            '<button data-seg-theme="dark" class="' + (s.theme === 'dark' ? 'active' : '') + '">深色</button>' +
          '</span></div>' +
        '<div class="settings-row"><span class="sr-label">桌宠「单词小鲸鱼」</span>' +
          '<button class="switch' + (s.pet ? ' on' : '') + '" id="setPet" role="switch" aria-checked="' + s.pet + '" aria-label="桌宠开关"></button></div>' +
      '</div>' +

      '<div class="card settings-group">' +
        '<h3>数据</h3>' +
        '<div class="settings-row"><span class="sr-label">导出备份<span class="sr-sub">整库 JSON，可再导入恢复</span></span>' +
          '<button class="btn btn-small" id="btnExport">导出 JSON</button></div>' +
        '<div class="settings-row"><span class="sr-label">导入备份<span class="sr-sub">自动校验并迁移旧格式</span></span>' +
          '<button class="btn btn-small" id="btnImport">导入 JSON</button>' +
          '<input type="file" id="fileImport" accept=".json,application/json" hidden/></div>' +
        '<div class="settings-row"><span class="sr-label">清空全部数据</span>' +
          '<button class="btn btn-danger btn-small" id="btnClear">清空</button></div>' +
        '<div class="settings-row"><span class="sr-label">我的笔记<span class="sr-sub">' + notesCount + ' 条笔记</span></span>' +
          '<button class="btn btn-small" id="btnNotes">查看笔记</button></div>' +
      '</div>' +

      '<div class="card settings-group">' +
        '<h3>说明</h3>' +
        '<p class="muted">· 数据只存本机（localStorage），不会上传任何服务器。</p>' +
        '<p class="muted">· 内置词库为精编版，完整考纲词表请用自制词书导入。</p>' +
      '</div>';

    $('#setFresh').addEventListener('change', function () {
      var v = parseInt(this.value, 10);
      if (!v || v < 1) { v = 20; }
      db.settings.freshLimit = v;
      this.value = v;
      Core.saveDB(db);
      toast('每日新词上限已设为 ' + v);
    });
    $('#setReview').addEventListener('change', function () {
      var v = parseInt(this.value, 10);
      if (!v || v < 1) { v = 60; }
      db.settings.reviewLimit = v;
      this.value = v;
      Core.saveDB(db);
      toast('每日复习上限已设为 ' + v);
    });
    $('#setAutoNext').addEventListener('click', function () {
      db.settings.autoNext = !db.settings.autoNext;
      this.classList.toggle('on', db.settings.autoNext);
      this.setAttribute('aria-checked', db.settings.autoNext);
      Core.saveDB(db);
    });
    document.querySelectorAll('[data-seg-accent]').forEach(function (el) {
      el.addEventListener('click', function () {
        db.settings.accent = el.getAttribute('data-seg-accent');
        Core.saveDB(db);
        renderMine();
      });
    });
    $('#setRate').addEventListener('input', function () {
      db.settings.rate = parseFloat(this.value);
      $('#rateVal').textContent = db.settings.rate.toFixed(1) + 'x';
      Core.saveDB(db);
    });
    document.querySelectorAll('[data-seg-theme]').forEach(function (el) {
      el.addEventListener('click', function () {
        db.settings.theme = el.getAttribute('data-seg-theme');
        applyTheme();
        Core.saveDB(db);
        renderMine();
      });
    });
    $('#setPet').addEventListener('click', function () {
      db.settings.pet = !db.settings.pet;
      this.classList.toggle('on', db.settings.pet);
      this.setAttribute('aria-checked', db.settings.pet);
      if (window.Pet) { window.Pet.setEnabled(db.settings.pet); }
      Core.saveDB(db);
    });
    var strengthSeg = $('#setStrength');
    if (strengthSeg) {
      strengthSeg.addEventListener('click', function (ev) {
        var t = ev && ev.target;
        var v = (t && typeof t.getAttribute === 'function') ? t.getAttribute('data-strength') : null;
        if (v !== 'on' && v !== 'off') { return; }
        if (db.settings.strengthMode === v) { return; }
        db.settings.strengthMode = v;
        // #020（D-043）：开启时记录接管起点——只有此后复习过的词才交给强度层，已有到期不动
        if (v === 'on') { db.settings.strengthFrom = Date.now(); }
        Core.saveDB(db);
        toast(v === 'on' ? P.STRENGTH.modeToastOn : P.STRENGTH.modeToastOff);
        renderMine();
      });
    }
    $('#btnExport').addEventListener('click', function () {
      Core.persistNow(db);
      var blob = new Blob([Core.exportJSON(db)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'word365-backup-' + Core.dayKey() + '.json';
      a.click();
      URL.revokeObjectURL(a.href);
      toast('备份已导出');
    });
    $('#btnImport').addEventListener('click', function () { $('#fileImport').click(); });
    $('#fileImport').addEventListener('change', function () {
      var file = this.files[0];
      if (!file) { return; }
      var reader = new FileReader();
      reader.onload = function () {
        var res = Core.importJSON(String(reader.result));
        if (!res.ok) { toast(res.error || '导入失败'); return; }
        db = res.db;
        Core.seedBooks(db, BOOK_DEFS);
        Core.saveDB(db);
        rebuildIndex();
        applyTheme();
        if (window.Pet) { window.Pet.init(db); }
        toast('导入成功，学习进度已恢复');
        render();
      };
      reader.readAsText(file);
    });
    $('#btnClear').addEventListener('click', function () {
      openModal(
        '<h3 style="margin-bottom:10px">清空全部数据</h3>' +
        '<p>建议先「导出 JSON」备份。清空后所有学习记录、词书与设置都会删除，且无法恢复。</p>' +
        '<div style="display:flex;gap:10px;margin-top:16px;justify-content:flex-end">' +
        '<button class="btn" data-modal-close>先不删</button>' +
        '<button class="btn btn-danger" id="clearStep1">继续</button></div>'
      );
      $('#clearStep1').addEventListener('click', function () {
        openModal(
          '<h3 style="margin-bottom:10px">再次确认</h3>' +
          '<p>真的要清空全部数据吗？这是最后一次确认。</p>' +
          '<div style="display:flex;gap:10px;margin-top:16px;justify-content:flex-end">' +
          '<button class="btn" data-modal-close>取消</button>' +
          '<button class="btn btn-danger" id="clearStep2">确认清空</button></div>'
        );
        $('#clearStep2').addEventListener('click', function () {
          db = Core.defaultDB();
          Core.seedBooks(db, BOOK_DEFS);
          Core.persistNow(db);
          rebuildIndex();
          applyTheme();
          if (window.Pet) { window.Pet.init(db); }
          closeModal();
          toast('已清空全部数据');
          render();
        });
      });
    });
    $('#btnNotes').addEventListener('click', openNotesModal);

    /* —— 阶段一：计划与节奏设置（T04） —— */
    var dailyMinSeg = $('#setDailyMin');
    if (dailyMinSeg) {
      dailyMinSeg.querySelectorAll('[data-min]').forEach(function (el) {
        el.addEventListener('click', function () {
          db.settings.dailyMinutes = parseInt(el.getAttribute('data-min'), 10);
          Core.buildPlan(db); // 时长影响计划概览
          Core.saveDB(db);
          renderMine();
        });
      });
    }
    var setReturnDays = $('#setReturnDays');
    if (setReturnDays) {
      setReturnDays.addEventListener('change', function () {
        var v = parseInt(this.value, 10); if (!v || v < 1) { v = 3; }
        db.settings.returnDays = v; this.value = v; Core.saveDB(db);
      });
    }
    var setRebuildCap = $('#setRebuildCap');
    if (setRebuildCap) {
      setRebuildCap.addEventListener('change', function () {
        var v = parseInt(this.value, 10); if (!v || v < 1) { v = 40; }
        db.settings.rebuildCap = v; this.value = v; Core.saveDB(db);
      });
    }
    var setPressure = $('#setPressure');
    if (setPressure) {
      setPressure.addEventListener('change', function () {
        var v = parseInt(this.value, 10); if (!v || v < 1) { v = 50; }
        db.settings.pressureThreshold = v; this.value = v; Core.saveDB(db);
      });
    }
    var setReviewRatio = $('#setReviewRatio');
    if (setReviewRatio) {
      setReviewRatio.addEventListener('change', function () {
        var v = parseFloat(this.value); if (!v || v <= 0 || v >= 1) { v = 0.7; }
        db.settings.reviewRatio = v; this.value = v;
        Core.buildPlan(db); Core.saveDB(db); renderMine();
      });
    }
    var setLadder = $('#setLadder');
    if (setLadder) {
      setLadder.querySelectorAll('[data-ladder]').forEach(function (el) {
        el.addEventListener('click', function () {
          db.ladder.mode = el.getAttribute('data-ladder');
          Core.saveDB(db);
          renderMine();
        });
      });
    }
    var btnRedoGoal = $('#btnRedoGoal');
    if (btnRedoGoal) {
      btnRedoGoal.addEventListener('click', redoGoal);
    }
    var btnRetest = $('#btnRetest');
    if (btnRetest) {
      btnRetest.addEventListener('click', function () { startRetest(); });
    }
    var btnTooEasy = $('#btnTooEasy');
    if (btnTooEasy) {
      btnTooEasy.addEventListener('click', function () {
        toast('已记录「太简单」，即将重测');
        startRetest();
      });
    }
    var btnTooHard = $('#btnTooHard');
    if (btnTooHard) {
      btnTooHard.addEventListener('click', function () {
        toast('已记录「太难」，即将重测');
        startRetest();
      });
    }
  }

  function openNotesModal() {
    var rows = Object.keys(db.words).filter(function (k) { return db.words[k].note; })
      .map(function (k) {
        var r = db.words[k];
        return '<button class="wt-row" data-note-word="' + esc(r.w) + '">' +
          '<span class="wt-w">' + esc(r.w) + '</span>' +
          '<span class="wt-t">' + esc(r.note) + '</span>' +
          '<span class="badge st-' + r.st + '">' + (Core.STATUS_TEXT[r.st] || '') + '</span></button>';
      }).join('');
    openModal('<h3 style="margin-bottom:12px">我的笔记</h3>' +
      (rows || '<p class="muted">还没有笔记。在单词详情里可以记笔记。</p>'));
    document.querySelectorAll('[data-note-word]').forEach(function (el) {
      el.addEventListener('click', function () { openWordDetailByKey(el.getAttribute('data-note-word')); });
    });
  }

  /* ---------- 单词表弹窗 ---------- */

  var WT_FILTERS = [
    { k: 'all', label: '全部' },
    { k: 'new', label: '未学' },
    { k: 'learning', label: '学习中' },
    { k: 'known', label: '已掌握' },
    { k: 'wrong', label: '错词' },
    { k: 'star', label: '星标' }
  ];

  function openWordTable(book) {
    var filter = 'all';
    var query = '';

    function rowsHtml() {
      var entries = book.words.filter(function (e) {
        if (query && e.w.indexOf(query) < 0 && (e.t || '').indexOf(query) < 0) { return false; }
        if (filter === 'all') { return true; }
        var rec = recOf(e.w);
        if (filter === 'new') { return !rec || rec.reps === 0; }
        if (filter === 'learning') { return rec && rec.reps > 0 && rec.st === 'learning'; }
        if (filter === 'known') { return rec && rec.st === 'known'; }
        if (filter === 'wrong') { return rec && rec.wrong > 0; }
        if (filter === 'star') { return rec && rec.star; }
        return true;
      });
      if (!entries.length) { return '<p class="muted" style="padding:14px 0">没有符合条件的单词</p>'; }
      return entries.map(function (e) {
        return '<button class="wt-row" data-wt-word="' + esc(e.w) + '">' +
          '<span class="wt-w">' + esc(e.w) + '</span>' +
          '<span class="wt-t">' + esc(e.t || '（暂无释义）') + '</span>' +
          statusBadge(e.w) + '</button>';
      }).join('');
    }

    function paintList() { $('#wtList').innerHTML = rowsHtml(); bindRows(); }

    function bindRows() {
      document.querySelectorAll('[data-wt-word]').forEach(function (el) {
        el.addEventListener('click', function () {
          openWordDetailByKey(el.getAttribute('data-wt-word'));
        });
      });
    }

    openModal(
      '<h3 style="margin-bottom:12px">单词表 · ' + esc(book.name) + '</h3>' +
      '<div class="wt-filters">' +
        WT_FILTERS.map(function (f) {
          return '<button class="chip' + (f.k === 'all' ? ' active' : '') + '" data-wt-filter="' + f.k + '">' + f.label + '</button>';
        }).join('') +
      '</div>' +
      '<input id="wtSearch" type="search" placeholder="筛选单词或释义" style="width:100%;margin-bottom:10px"/>' +
      '<div id="wtList"></div>'
    );
    paintList();
    document.querySelectorAll('[data-wt-filter]').forEach(function (el) {
      el.addEventListener('click', function () {
        filter = el.getAttribute('data-wt-filter');
        document.querySelectorAll('[data-wt-filter]').forEach(function (x) {
          x.classList.toggle('active', x === el);
        });
        paintList();
      });
    });
    $('#wtSearch').addEventListener('input', function () {
      query = this.value.trim().toLowerCase();
      paintList();
    });
  }

  /* ---------- 单词详情弹窗 ---------- */

  function openWordDetailByKey(w) {
    var hit = ALL_ENTRY_MAP[Core.norm(w)];
    var entry = hit ? hit.entry : entryForWord(w);
    var bookName = hit ? hit.book.name : '';
    openWordDetail(entry, bookName);
  }

  function openWordDetail(entry, bookName) {
    var rec = recOf(entry.w);
    var starred = !!(rec && rec.star);
    var showSpeaker = db.settings.accent !== 'off';
    var isCustomEntry = !!(function () {
      var hit = ALL_ENTRY_MAP[Core.norm(entry.w)];
      return hit && !hit.book.builtin;
    })();

    openModal(
      '<div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">' +
        '<div class="wd-word">' + esc(entry.w) + '</div>' +
        (showSpeaker ? '<button class="speaker" id="wdSpeak" aria-label="发音">' + SVG_SPEAKER + '</button>' : '') +
        '<button class="star-capsule' + (starred ? ' on' : '') + '" id="wdStar" style="position:static">' +
          (starred ? SVG_STAR_ON + ' 已星标' : SVG_STAR_OFF + ' 星标') + '</button>' +
      '</div>' +
      (entry.p ? '<div class="wd-phon">' + esc(entry.p) + '</div>' : '') +
      '<div class="wd-def">' + esc(entry.t || '（暂无释义）') + '</div>' +
      (entry.e ? '<div class="wd-ex">' + esc(entry.e) + (showSpeaker ? ' <button class="btn btn-small" id="wdSpeakEx">例句发音</button>' : '') + '</div>' : '') +
      (entry.et ? '<div class="wd-ex-tr">' + esc(entry.et) + '</div>' : '') +
      '<div class="wd-meta">' + statusBadge(entry.w) +
        (bookName ? '<span class="badge">所属词书：' + esc(bookName) + '</span>' : '') +
      '</div>' +
      (isCustomEntry && !entry.t ?
        '<div class="wd-note"><div class="muted">自制词书占位词条，可在此补全（每行「音标 | 释义 | 例句 | 例句翻译」可只填释义）：</div>' +
        '<textarea id="wdFix" placeholder="n. 苹果 | I eat an apple. | 我吃苹果。">' +
          esc([entry.p, entry.t, entry.e, entry.et].join(' | ')) + '</textarea>' +
        '<button class="btn btn-small btn-primary" id="wdFixSave" style="margin-top:8px">保存补全</button></div>' : '') +
      '<div class="wd-note"><div class="muted">笔记</div>' +
        '<textarea id="wdNote" placeholder="给这个词写点笔记……">' + esc(rec ? rec.note : '') + '</textarea></div>' +
      '<div class="wd-actions"><button class="btn btn-small btn-primary" id="wdNoteSave">保存笔记</button>' +
        '<button class="btn btn-small" data-modal-close>关闭</button></div>'
    );

    var sp = $('#wdSpeak');
    if (sp) { sp.addEventListener('click', function () { speakWord(entry.w); }); }
    var spEx = $('#wdSpeakEx');
    if (spEx) { spEx.addEventListener('click', function () { speakSentence(entry.e || ''); }); }
    $('#wdStar').addEventListener('click', function () {
      var r = Core.ensureRecord(db, entry.w);
      r.star = !r.star;
      Core.saveDB(db);
      openWordDetail(entry, bookName);
    });
    var fixSave = $('#wdFixSave');
    if (fixSave) {
      fixSave.addEventListener('click', function () {
        var parts = $('#wdFix').value.split('|').map(function (x) { return x.trim(); });
        entry.p = parts[0] || '';
        entry.t = parts[1] || '';
        entry.e = parts[2] || '';
        entry.et = parts[3] || '';
        Core.saveDB(db);
        toast('词条已补全');
        openWordDetail(entry, bookName);
      });
    }
    $('#wdNoteSave').addEventListener('click', function () {
      var r = Core.ensureRecord(db, entry.w);
      r.note = $('#wdNote').value.trim();
      Core.saveDB(db);
      toast('笔记已保存');
    });
  }

  /* ---------- 全局搜索 ---------- */

  function bindSearch() {
    var input = $('#globalSearch');
    var drop = $('#searchDrop');
    input.addEventListener('input', function () {
      var q = input.value.trim();
      if (!q) { drop.hidden = true; input.setAttribute('aria-expanded', 'false'); return; }
      var res = Core.searchEntries(db, q, 10);
      if (!res.length) {
        drop.innerHTML = '<div class="search-item muted" style="cursor:default">没有找到相关单词</div>';
      } else {
        drop.innerHTML = res.map(function (r) {
          return '<button class="search-item" data-search-w="' + esc(r.entry.w) + '">' +
            '<span class="si-w">' + esc(r.entry.w) + '</span>' +
            '<span class="si-t">' + esc(r.entry.t || '') + '</span>' +
            '<span class="si-b">' + esc(r.book.name) + '</span></button>';
        }).join('');
      }
      drop.hidden = false;
      input.setAttribute('aria-expanded', 'true');
      document.querySelectorAll('[data-search-w]').forEach(function (el) {
        el.addEventListener('click', function () {
          drop.hidden = true;
          input.setAttribute('aria-expanded', 'false');
          openWordDetailByKey(el.getAttribute('data-search-w'));
        });
      });
    });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { drop.hidden = true; input.blur(); }
      if (e.key === 'Enter') {
        var first = drop.querySelector('[data-search-w]');
        if (first) { first.click(); }
      }
    });
    document.addEventListener('click', function (e) {
      if (!e.target.closest('.search-wrap')) { drop.hidden = true; }
    });
  }

  /* ---------- 启动 ---------- */

  function init() {
    applyTheme();
    if (window.Pet) { window.Pet.init(db); }
    bindSearch();

    window.addEventListener('hashchange', render);
    window.addEventListener('beforeunload', function () { Core.persistNow(db); });
    document.addEventListener('keydown', function (e) {
      if (modalOpen()) {
        if (e.key === 'Escape') { e.preventDefault(); closeModal(); }
        return;
      }
      var route = parseRoute();
      var s = state.session;
      if (!s || route.name !== 'study') { return; }
      var tag = (e.target.tagName || '').toLowerCase();
      var inField = tag === 'input' || tag === 'textarea' || tag === 'select';
      var e0 = s.words[s.idx];
      if (!e0) { return; }
      var k = e.key;

      if (k === 'Escape') { exitStudy(); return; }

      if (s.mode === 'flash') {
        if (k === ' ') { e.preventDefault(); toggleReveal(); }
        else if (k === 'Enter') { if (!s.revealed) { toggleReveal(); } else { doRate('know'); } }
        else if (k === 'r' || k === 'R') { speakWord(e0.w); }
        else if (k === '1') { doRate('unknown'); }
        else if (k === '2') { doRate('fuzzy'); }
        else if (k === '3') { if (s.revealed) { doRate('know'); } else { toggleStar(); } }
        else if (k === 'ArrowLeft') { stepWord(-1); }
        else if (k === 'ArrowRight') { stepWord(1); }
      } else if (s.mode === 'type') {
        if (k === 'Enter') { e.preventDefault(); typeEnter(); }
        else if (k === ' ') { e.preventDefault(); typeHint(); }
        else if ((k === 'r' || k === 'R') && !inField) { speakWord(e0.w); }
      } else if (s.mode === 'choice') {
        if (k >= '1' && k <= '4') { choicePick(parseInt(k, 10) - 1); }
        else if (k === 'Enter') { if (s.choice && s.choice.done) { advance(); } }
        else if (k === 'r' || k === 'R') { speakWord(e0.w); }
      }
    });

    if (!location.hash) {
      // 首启引导：未完成且未跳过 → 强制进入目标三问（Open-4 / Open-8）
      if (!db.onboarding.completed && !db.onboarding.skipped) {
        location.hash = '#/onboard';
      } else {
        location.hash = '#/learn';
      }
    }
    render();
  }

  init();

})();

