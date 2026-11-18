/* ============================================================
 * 背单词365 · core.js
 * 纯逻辑核心：SRS 复习阶梯、今日计划、每日额度、错词本、
 * 存储防抖、导入导出与旧键格式迁移。
 * 禁止依赖 DOM；浏览器暴露 window.Core，Node 兼容 module.exports。
 * ============================================================ */
(function (global) {
  'use strict';

  var DB_KEY = 'w365.db';
  var SCHEMA = 3;
  var DAY_MS = 24 * 60 * 60 * 1000;
  /** 固定复习阶梯（天） */
  var LADDER_DAYS = [1, 2, 4, 7, 15, 30, 60];

  /**
   * #031 阶段一 · 遗忘曲线观测契约（D-065）：显式化既有阶梯/分支/分段，数值零改动。
   * ladder 与 L14 同源（禁止另写死一份）；segments 顺序即 baselineReport 输出顺序。
   */
  var INTERVAL_CONTRACT = {
    ladder: LADDER_DAYS.slice(),
    branches: { unknown: '10m', fuzzy: 'nextDay+4h' },
    newWord: 'new',
    segments: ['new', '10m', '1d', '2d', '4d', '7d', '15d', '30d', '60d', 'other']
  };

  /** 单次作答预计耗时（秒），±300 词收敛公式中用于估算每日时长（I-AC3） */
  var SEC_PER_WORD = 35;

  /**
   * 每日时长档位集合（与 phrases.DAILY_MINUTE_OPTIONS 同源，OP-01：本批不扩展）。
   * 本地副本避免 core 与 phrases 的交叉耦合；结构纯粹、只读。
   * 用于 P1/P5 的查表与单调映射；与集合大小解耦。
   */
  var DAILY_MINUTE_OPTIONS = [10, 20, 30];

  /* ---------- 基础工具 ---------- */

  function now() { return Date.now(); }

  /** 单词归一：去首尾空白 + 小写 */
  function norm(w) { return String(w || '').trim().toLowerCase(); }

  /** 一词一记录主键 */
  function wordKey(w) { return 'w::' + norm(w); }

  function pad2(n) { return n < 10 ? '0' + n : '' + n; }

  /** 本地日期键 YYYY-MM-DD */
  function dayKey(ts) {
    var d = ts ? new Date(ts) : new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function clone(obj) { return JSON.parse(JSON.stringify(obj)); }

  /* ---------- 数据模型 ---------- */

  function defaultSettings() {
    return {
      freshLimit: 20,    // 每日新词上限
      reviewLimit: 60,   // 每日复习上限
      accent: 'us',      // us / uk / off
      rate: 1.0,         // 语速 0.5–1.6
      theme: 'light',
      pet: true,         // 桌宠开关
      autoNext: false,   // 写出英文「答对自动下一词」
      coachSeen: false,  // 首次教练提示只出现一次
      // —— 阶段一 P0 新增（方案 C / I）——
      dailyMinutes: 20,        // 每日可用时长旋钮 10/20/30（Open-1 默认 20）
      returnDays: 3,           // 回归保护触发天数阈值（Open-3 = 3）
      rebuildCap: 40,          // 重建任务包上限（Open-3 锁定 = 40）
      reviewRatio: 0.7,        // 复习/新词配比，复习占 70%（C-AC5）
      pressureThreshold: 50,   // 复习压力熔断阈值 = 积压阈值 N（Open-3 = 50）
      autoRebalance: true,     // 每周再平衡是否自动调量（Open-5 默认 true）
      confidenceWarmup: true,  // 缺口 C：首组是否注入 2 个信心热身词（默认开）
      strengthMode: 'off',     // #015 叠加式记忆强度引擎开关：缺省 OFF（D-037/D-038；写侧默认）
      strengthFrom: 0          // #020 逐词接管起点（D-043）：>0 时只有 last>=该时刻的词交给强度层；0=全部接管（旧行为/兼容）
    };
  }

  function defaultDB() {
    /* D-067：defaultDB 必须纯确定（不读时钟）——每次调用都取 now() 会让 MODE-AC10
     * 比较两个独立 defaultDB 时因毫秒差偶发失败（HEAD 版即有）。真实时间戳由
     * persist() 首次落盘时补：createdAt 只在仍为 0 时写一次。 */
    return {
      schema: SCHEMA,
      createdAt: 0,
      updatedAt: 0,
      settings: defaultSettings(),
      petState: { totalBites: 0, pos: null },
      books: [],
      customBooks: [],
      words: {},
      days: {},
      // —— 阶段一 P0 新增顶层键（均不与现有键冲突）——
      goal: {
        type: 'free',        // 考试类型枚举：cet46|kaoyan|ielts|toefl|job|free
        deadline: null,      // 目标日 00:00 时间戳(ms)；free 型为 null（长期）
        dailyMinutes: 20,    // 10 | 20 | 30
        createdAt: 0         // 落库时间戳(ms)
      },
      plan: {
        derivedAt: 0,        // 推导时间戳(ms)，0 表示尚未生成
        totalWords: 0,       // 词库总量（按 goal.type 映射后的内置书并集）
        mastered: 0,         // 已掌握扣除数（graduated || st==='known'，限范围内）
        dailyFresh: 0,       // 每日新学数（推导值）
        dailyReview: 0,      // 每日复习数（推导值，7:3 互补）
        estMinutes: 0,       // 预计每日时长 = (dailyFresh+dailyReview)*SEC_PER_WORD/60
        daysLeft: 0          // 距目标天数；free 型置 0 哨兵，展示「长期」
      },
      baseline: {
        level: 0,            // 估计词汇量等级 = 内置词累计下标（0..460）
        testedAt: 0,         // 测试时间戳(ms)
        words: [],           // 已毕业词 key 列表（J-AC5 落库，便于迁移）
        reestimateAt: 0      // 下次重估时间戳(ms) = testedAt + 14*DAY
      },
      returnGuard: {
        lastSeen: '',        // 最近活跃日期 'YYYY-MM-DD'（按自然日差判定）
        backlogCount: 0,     // 最近一次统计的积压词数（reps>0 && due<=now）
        rebuiltAt: '',       // 已触发重建包的日期 'YYYY-MM-DD'（同日去重）
        rebuildWords: [],    // 当日重建包词 key 列表
        spreadDays: 0        // 剩余积压平滑摊派天数（展示用，3..5）
      },
      onboarding: {
        step: 0,             // 向导进度 0..3
        completed: false,    // 三问+测试是否完成（Open-4）
        skipped: false,      // 是否「稍后」跳过（回退现状首页）
        completedAt: 0       // 完成时间戳(ms)
      },
      // —— v3.0 增量：已掌握词抽测（装订抽检）。加法键，旧库由 ensureSchema 补齐 ——
      exam: {
        records: [],         // 完整抽测记录（最近 10 条）
        flags: [],           // 待重读词 key 列表
        lastAt: 0            // 最近一次完整抽测时间戳(ms)，0 表示从未
      },
      // —— v3.0 第二批：装订凭据。issuedNoMax 单调，删除凭据后不重发同编号 ——
      binding: {
        totalPages: 0,       // 历史累计已掌握页数（单调，不因回落/删除而减少）
        issued: [],          // 凭据列表 [{no, at, pages, examAt, examSize, examKept}]
        issuedNoMax: 0       // 已发过的最大编号（删除 issued 项不回退）
      },
      // #005 T01/F1：默写阶梯开关（新增顶层对象，默认自动；老库由 ensureSchema 补齐）
      ladder: { mode: 'auto' },
      // #025 今日挑战（D-048/D-049）：只记三项事实，不存词表、不存对错明细
      challenge: { dateKey: '', size: 0, doneAt: 0 }
    };
  }

  function newRecord(w, srcBook) {
    return {
      w: norm(w),
      lvl: 0,
      st: 'learning',
      due: 0,
      reps: 0,
      correct: 0,
      wrong: 0,
      wfix: 0,
      star: false,
      note: '',
      last: 0,
      first: 0,
      lastRating: '',
      srcBook: srcBook || '',
      graduated: false,  // 方案 J 测试批量毕业标记（区别于 SRS 自然 st==='known'）
      evts: [],          // #015 逐次作答事件（观测加法层：只采集与只读，不改既有字段语义）
      s1: []             // #031 阶段一观测事件（D-065：与 evts 并列的词级新键，不改 SCHEMA/evts 四键）
    };
  }

  /** 取或建词条进度记录（会修改 db，调用后需 saveDB） */
  function ensureRecord(db, w, srcBook) {
    var k = wordKey(w);
    if (!db.words[k]) { db.words[k] = newRecord(w, srcBook); }
    return db.words[k];
  }

  /** 状态：'new' 未学 | 'learning' 学习中 | 'known' 已掌握 */
  function statusOf(db, w) {
    var rec = db.words[wordKey(w)];
    if (!rec || rec.reps === 0) { return 'new'; }
    return rec.st === 'known' ? 'known' : 'learning';
  }

  var STATUS_TEXT = { new: '未学', learning: '学习中', known: '已掌握' };

  /* ---------- SRS 复习阶梯 ---------- */

  /**
   * 对一个词作答评级。词条不存在时自动建档（新词首次作答）。
   * @param {string} key  db.words 的键（w::xxx）
   * @param {string} rating 'know' | 'fuzzy' | 'unknown'
   * @returns {Object|null} undo 快照 {key, rec, absent, dayKey, day}
   */
  /** #028 练法归因（D-057/D-058）：第 4 参可选；合法标签归一时只在此处收口，app.js 不判错 */
  var MODE_LABELS_ATTRIB = ['flash', 'type', 'choice', 'match', 'listen', 'ctx'];
  function attribMode(value) {
    return (typeof value === 'string' && MODE_LABELS_ATTRIB.indexOf(value) >= 0) ? value : null;
  }

  function rateWord(db, key, rating, mode, obs) {
    var absent = !db.words[key];
    if (absent) {
      db.words[key] = newRecord(key.indexOf('w::') === 0 ? key.slice(3) : key);
    }
    var rec = db.words[key];
    var t = now();
    var wasFresh = rec.reps === 0;
    var origDue = rec.due;
    var wasDue = rec.reps > 0 && origDue > 0 && origDue <= t;

    var snap = { key: key, rec: clone(rec), absent: absent, dayKey: null, day: null };

    rec.reps += 1;
    rec.last = t;
    if (!rec.first) { rec.first = t; }
    rec.lastRating = rating;

    if (rating === 'know') {
      rec.correct += 1;
      rec.lvl = Math.min(rec.lvl + 1, 6);
      var interval = LADDER_DAYS[Math.min(rec.lvl, 6)];
      rec.due = t + interval * DAY_MS;
      rec.st = (rec.lvl >= 3 && interval >= 7) ? 'known' : 'learning';
      // 错词连对毕业：答对 wfix+1，wfix>=2 自动移出错词本
      if (rec.wrong > 0) {
        rec.wfix += 1;
        if (rec.wfix >= 2) { rec.wrong = 0; rec.wfix = 0; }
      }
    } else if (rating === 'fuzzy') {
      rec.wrong += 1;
      rec.wfix = 0;
      rec.due = t + 28 * 60 * 60 * 1000; // 次日 +4 小时
      rec.lvl = rec.lvl;
      rec.st = 'learning';
    } else { // unknown
      rec.wrong += 1;
      rec.wfix = 0;
      rec.lvl = 0;
      rec.due = t + 10 * 60 * 1000; // 10 分钟后再来
      rec.st = 'learning';
    }

    // 每日额度计数（全局）
    var dk = dayKey(t);
    snap.dayKey = dk;
    snap.day = db.days[dk] ? clone(db.days[dk]) : null;
    var d = db.days[dk] || (db.days[dk] = { total: 0, correct: 0, fresh: 0, review: 0 });
    d.total += 1;
    if (rating === 'know') { d.correct += 1; }
    if (wasFresh) { d.fresh += 1; }
    else if (wasDue) { d.review += 1; }

    // #015（叠加式记忆强度引擎 · 观测层）：评级成功以加法写一条逐次事件。
    // 三分支对 lvl/due/st/wfix/wrong 的既有落库规则零改动；interval 直接读 rec.due - t
    // （不重算 ladder，保证事件与真实落库 due 严格一致）。
    // #028（D-058）：type 由可选第 4 参归因；缺省/非法一律 null → 三参调用逐字段等价旧行为。
    // snap.rec 在三分支之前克隆，故 undoRate 整体还原时本次事件天然回滚（D-038① OP-01）。
    if (!Array.isArray(rec.evts)) { rec.evts = []; }
    rec.evts.push({
      t: t,
      rating: rating,
      interval: rec.due - t,
      type: attribMode(mode)
    });

    // #031 阶段一（D-065）：与 evts 并列的词级 s1 观测事件。全程复用 L193 的 t（禁止二次 now()）。
    // obs 仅在合法值域内覆盖双信号，非法/缺失回落默认推导；prevIvl 在 push 前读上一条 newIvl。
    if (!Array.isArray(rec.s1)) { rec.s1 = []; }
    var o = (obs && typeof obs === 'object') ? obs : null;
    var s1Self = (o && (o.selfRating === 'know' || o.selfRating === 'fuzzy' || o.selfRating === 'unknown'))
      ? o.selfRating : rating;
    var s1Retrieved = (o && typeof o.retrievedOk === 'boolean') ? o.retrievedOk : (rating === 'know');
    var lastS1 = rec.s1.length ? rec.s1[rec.s1.length - 1] : null;
    var prevIvl = (lastS1 && typeof lastS1 === 'object' && typeof lastS1.newIvl === 'number') ? lastS1.newIvl : 0;
    /* D-066 / G0 裁决 方案 2'：s1 内三个「毫秒差值」字段归整到整秒——
     * 既有全库 JSON 快照断言只用 /\d{13}/ 归一时间戳，8 位毫秒差会跨会话抖动；
     * at/actualAt/plannedDue 仍是原始 13 位时间戳（被既有正则归一），不在此时钟。
     * 分档 seg 仍用归整前的 prevIvl（误差 ≤500ms，阶梯最短 1 天）。 */
    var s1Sec = function (ms) { return Math.round(ms / 1000) * 1000; };
    var rawLateMs = origDue > 0 ? Math.max(0, t - origDue) : 0;
    var rawNewIvl = rec.due - t;
    rec.s1.push({
      k: key,
      plannedDue: origDue,
      at: t,
      actualAt: t,
      lateMs: s1Sec(rawLateMs),
      prevIvl: s1Sec(prevIvl),
      newIvl: s1Sec(rawNewIvl),
      seg: intervalSeg(prevIvl, wasFresh),
      branch: rating === 'fuzzy' ? 'nextDay+4h' : (rating === 'unknown' ? '10m' : null),
      selfRating: s1Self,
      retrievedOk: s1Retrieved,
      first: wasFresh,
      cohort: 'fixed'
    });

    return snap;
  }

  /** 撤销一次评级：还原词条记录与当日计数 */
  function undoRate(db, snap) {
    if (!snap || !snap.key) { return false; }
    if (snap.absent) { delete db.words[snap.key]; }
    else { db.words[snap.key] = snap.rec; }
    if (snap.dayKey) {
      if (snap.day) { db.days[snap.dayKey] = snap.day; }
      else { delete db.days[snap.dayKey]; }
    }
    return true;
  }

  /* ---------- 今日计划与额度 ---------- */

  /**
   * 计算今日计划（阶段一三态：重建 / 暂停新词 / 正常）。
   * @param {Array} records 参与筛选的进度记录数组（scope 已定）
   * @returns {{reviews:Array, freshs:Array, mode:string, pausedFresh:boolean,
   *            planTarget:number, text:string, rebuildWords:Array}}
   *  mode='rebuild'：回归重建态（returnGuard.rebuiltAt===今天），今日仅重建包
   *  mode='pause'  ：高压力熔断态（积压≥pressureThreshold），暂停新词
   *  mode='normal' ：7:3 配比，排除 graduated 词
   *  该函数在 days[dk] 上仅新增 planTarget 一个加法键，不改变既有返回结构。
   */
  /**
   * 到期访问器（模块级，#025 由 todayPlan 内部 dueOf 等价提取，行为逐字段不变）：
   * OFF 短路返回 rec.due；ON 且 strengthFrom>0 时仅接管「开启后复习过」的词（#020 逐词接管）。
   */
  function dueOfWord(db, rec) {
    var s = db && db.settings;
    if (!s || s.strengthMode !== 'on') { return rec ? rec.due : 0; }
    var from = (typeof s.strengthFrom === 'number' && isFinite(s.strengthFrom)) ? s.strengthFrom : 0;
    if (from > 0) {
      var last = (rec && typeof rec.last === 'number' && isFinite(rec.last)) ? rec.last : 0;
      if (last < from) { return rec.due; }
    }
    return strengthDue(rec, Array.isArray(rec && rec.evts) ? rec.evts : [], null);
  }

  function todayPlan(db, records) {
    var s = db.settings, t = now(), dk = dayKey(t);
    var reviews, freshs, mode = 'normal', pausedFresh = false, text = '', rebuildWords = [];
    // #015（阶段二 · 叠加层）：到期访问器。OFF 缺省短路返回 r.due（逐字段等价基线、零额外开销）；
    // 仅 strengthMode==='on' 时读强度纯函数结果（C4：固定阶梯永为可回退基线）。
    // #020（D-043）：逐词接管 —— strengthFrom>0 时，只有「开启之后被复习过」(rec.last >= strengthFrom) 的词
    // 交给强度层，其余仍用固定阶梯写入的 r.due。理由见 Anki FSRS「Reschedule cards on change」默认不重算：
    // 「future reviews will use the new scheduling, but there will be no immediate change to your workload」。
    function dueOf(r) { return dueOfWord(db, r); }

    // —— 态 1：回归重建（仅当当日已决策 rebuiltAt===今天）——
    if (db.returnGuard.rebuiltAt === dk && db.returnGuard.rebuildWords.length) {
      var rset = {};
      db.returnGuard.rebuildWords.forEach(function (k) { rset[k] = 1; });
      rebuildWords = records.filter(function (r) { return rset[wordKey(r.w)]; });
      reviews = []; freshs = []; mode = 'rebuild'; pausedFresh = true;
      text = '欢迎回来，帮你重新排好了，今天 18 分钟就能追上';
    } else {
      // 积压（复习压力）= 到期且未毕业
      var backlog = records.filter(function (r) {
        return r.reps > 0 && dueOf(r) > 0 && dueOf(r) <= t && !r.graduated;
      });
      if (backlog.length >= s.pressureThreshold) {
        // —— 态 2：高压力熔断（非回归，仅暂停新词）——
        mode = 'pause'; pausedFresh = true;
        reviews = backlog.sort(function (a, b) { return dueOf(a) - dueOf(b); }).slice(0, s.reviewLimit);
        freshs = [];
        text = '今天先把旧账清了，明天加新词';
      } else {
        // —— 态 3：正常（7:3 配比，排除 graduated）——
        var bud = computeDailyBudget(s, db.plan && db.plan.derivedAt ? db.plan.dailyFresh : 0);
        var day = db.days[dk] || { fresh: 0 };
        var freshQuota = Math.max(0, bud.freshTarget - (day.fresh || 0));
        reviews = backlog.sort(function (a, b) { return dueOf(a) - dueOf(b); }).slice(0, bud.reviewTarget);
        freshs = records.filter(function (r) { return r.reps === 0 && !r.graduated; }).slice(0, freshQuota);
      }
    }
    var planTarget = reviews.length + freshs.length;
    // 缺口 B：rebuild 态（rebuiltAt===今天，与上方判定 rebuild 同源）时，
    // 当日实际仅重建包这 rebuildWords.length 个词，planTarget 应取其值而非 0，
    // 否则「次日有效复习完成率」分母为 0 计 0%，北极星失真。
    if (mode === 'rebuild' && db.returnGuard.rebuildWords.length) {
      planTarget = db.returnGuard.rebuildWords.length;
    }
    if (!db.days[dk]) { db.days[dk] = { total: 0, correct: 0, fresh: 0, review: 0 }; }
    db.days[dk].planTarget = planTarget;            // Open-7：生成当日计划时写入
    return {
      reviews: reviews,
      freshs: freshs,
      mode: mode,
      pausedFresh: pausedFresh,
      planTarget: planTarget,
      text: text,
      rebuildWords: rebuildWords
    };
  }

  /* ---------- 错词本 ---------- */

  /** 错词本中全部记录（wrong>0） */
  function wrongRecords(db) {
    var out = [];
    var keys = Object.keys(db.words);
    for (var i = 0; i < keys.length; i++) {
      if (db.words[keys[i]].wrong > 0) { out.push(db.words[keys[i]]); }
    }
    return out;
  }

  /** 手动移出错词本 */
  function removeWrong(db, key) {
    var rec = db.words[key];
    if (rec) { rec.wrong = 0; rec.wfix = 0; }
  }

  /** 一键清空错词本 */
  function clearWrong(db) {
    var recs = wrongRecords(db);
    for (var i = 0; i < recs.length; i++) { recs[i].wrong = 0; recs[i].wfix = 0; }
  }

  /* ---------- 存储（120ms 防抖） ---------- */

  var saveTimer = null;

  function persist(db) {
    /* D-067：单次取时；createdAt 仅在首次落盘时补一次（defaultDB 不再读时钟）。 */
    var t = now();
    if (!db.createdAt) { db.createdAt = t; }
    db.updatedAt = t;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(DB_KEY, JSON.stringify(db));
      }
    } catch (e) { /* 存储失败静默（如隐私模式） */ }
  }

  /** 防抖保存（120ms） */
  function saveDB(db) {
    if (saveTimer) { clearTimeout(saveTimer); }
    saveTimer = setTimeout(function () { persist(db); }, 120);
  }

  /** 立即落盘（导出前 / 页面卸载前用） */
  function persistNow(db) {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    persist(db);
  }

  /** 旧「词书::单词」键格式 → 「w::单词」幂等迁移 */
  function migrateOldKeys(db) {
    if (!db || !db.words) { return db; }
    var keys = Object.keys(db.words);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (k.indexOf('w::') === 0) { continue; }
      var sep = k.indexOf('::');
      if (sep < 0) { continue; }
      var word = k.slice(sep + 2);
      var nk = wordKey(word);
      if (!db.words[nk]) {
        var rec = db.words[k];
        rec.w = norm(word);
        db.words[nk] = rec;
      }
      delete db.words[k]; // 已存在 w:: 记录时直接丢弃旧键（幂等）
    }
    return db;
  }

  function loadDB() {
    try {
      if (typeof localStorage !== 'undefined') {
        var raw = localStorage.getItem(DB_KEY);
        if (raw) {
          var db = JSON.parse(raw);
          if (db && db.schema) { return migrateOldKeys(db); }
        }
      }
    } catch (e) { /* 损坏数据回落到全新库 */ }
    return defaultDB();
  }

  /* ---------- 导入导出 ---------- */

  function exportJSON(db) {
    var copy = clone(db);
    copy.updatedAt = now();
    return JSON.stringify(copy, null, 2);
  }

  /**
   * 导入整库 JSON。校验 schema 字段，自动迁移旧键格式。
   * @returns {{ok:boolean, db:(Object|null), error:(string|null)}}
   */
  function importJSON(text) {
    var data;
    try { data = JSON.parse(text); }
    catch (e) { return { ok: false, db: null, error: 'JSON 解析失败，不是有效的备份文件' }; }
    if (!data || typeof data !== 'object' || !data.schema) {
      return { ok: false, db: null, error: '缺少 schema 字段，不是背单词365的备份文件' };
    }
    data = migrateOldKeys(data);
    if (!data.settings) { data.settings = defaultSettings(); }
    if (!data.petState) { data.petState = { totalBites: 0, pos: null }; }
    if (!data.books) { data.books = []; }
    if (!data.customBooks) { data.customBooks = []; }
    if (!data.words) { data.words = {}; }
    if (!data.days) { data.days = {}; }
    ensureSchema(data); // J-AC5：补齐阶段一新增键（旧库/导入后首次打开）
    return { ok: true, db: data, error: null };
  }

  /**
   * 旧库 / 导入数据迁移：补齐阶段一新增键（幂等、加法式）。
   * 旧 schema:3 备份（无 goal/plan/baseline/returnGuard/onboarding、
   * word.graduated、days[dk].planTarget）导入后自动补齐默认 → 不破坏旧键。
   * @param {Object} db 可变
   * @returns {Object} 同一 db（便于链式调用）
   */
  /** days[dk].byType 最小分桶归一（F4，D-004 精确化）：逐题型 {n,ms} 数值兜底；脏值归一为 {n:0,ms:0} */
  function normalizeByType(byType) {
    if (!byType || typeof byType !== 'object') { return null; }
    var out = {};
    ['flash', 'type', 'choice'].forEach(function (k) {
      var t = byType[k];
      if (t && typeof t === 'object') {
        var n = (typeof t.n === 'number' && isFinite(t.n) && t.n >= 0) ? t.n : 0;
        var ms = (typeof t.ms === 'number' && isFinite(t.ms) && t.ms >= 0) ? t.ms : 0;
        out[k] = { n: n, ms: ms };
      } else {
        out[k] = { n: 0, ms: 0 };
      }
    });
    return out;
  }

  function ensureSchema(db) {
    if (!db) { return db; }
    if (!db.goal) { db.goal = { type: 'free', deadline: null, dailyMinutes: 20, createdAt: 0 }; }
    if (!db.plan) { db.plan = { derivedAt: 0, totalWords: 0, mastered: 0, dailyFresh: 0, dailyReview: 0, estMinutes: 0, daysLeft: 0 }; }
    if (!db.baseline) { db.baseline = { level: 0, testedAt: 0, words: [], reestimateAt: 0 }; }
    if (!db.returnGuard) { db.returnGuard = { lastSeen: '', backlogCount: 0, rebuiltAt: '', rebuildWords: [], spreadDays: 0 }; }
    if (!db.onboarding) { db.onboarding = { step: 0, completed: false, skipped: false, completedAt: 0 }; }
    // #005 T01/F1：默写阶梯开关（新增顶层对象，默认 auto；老库缺失/脏值归一为 auto）
    if (!db.ladder || typeof db.ladder !== 'object' || (db.ladder.mode !== 'auto' && db.ladder.mode !== 'manual')) {
      db.ladder = { mode: 'auto' };
    }
    // v3.0 增量：抽测键补齐（幂等；未知键一律保留，不清理用户数据）
    if (!db.exam) { db.exam = { records: [], flags: [], lastAt: 0 }; }
    if (!Array.isArray(db.exam.records)) { db.exam.records = []; }
    if (!Array.isArray(db.exam.flags)) { db.exam.flags = []; }
    if (typeof db.exam.lastAt !== 'number') { db.exam.lastAt = 0; }
    // #025 今日挑战键补齐（幂等；未知键保留；键集恒为 dateKey/size/doneAt 三项）
    if (!db.challenge || typeof db.challenge !== 'object' || Array.isArray(db.challenge)) {
      db.challenge = { dateKey: '', size: 0, doneAt: 0 };
    }
    if (typeof db.challenge.dateKey !== 'string') { db.challenge.dateKey = ''; }
    db.challenge.size = safeNonNeg(db.challenge.size);
    if (typeof db.challenge.doneAt !== 'number' || !isFinite(db.challenge.doneAt)) { db.challenge.doneAt = 0; }
    // v3.0 第二批：凭据键补齐（幂等；未知键保留，不清理用户数据）
    if (!db.binding) { db.binding = { totalPages: 0, issued: [], issuedNoMax: 0 }; }
    if (!Array.isArray(db.binding.issued)) { db.binding.issued = []; }
    db.binding.totalPages = safeNonNeg(db.binding.totalPages);
    db.binding.issuedNoMax = safeNonNeg(db.binding.issuedNoMax);
    var s = db.settings || (db.settings = defaultSettings());
    // #005 T02/F2：settings.dailyMinutes 缺失或非法 → 一次性并入 goal 的合法档；否则校验合法性（脏值兜底归 20，不取最近档、不扩集合）
    if (typeof s.dailyMinutes !== 'number' || !isFinite(s.dailyMinutes) || DAILY_MINUTE_OPTIONS.indexOf(s.dailyMinutes) < 0) {
      var gMin = (db.goal && typeof db.goal.dailyMinutes === 'number') ? db.goal.dailyMinutes : null;
      s.dailyMinutes = (gMin != null && DAILY_MINUTE_OPTIONS.indexOf(gMin) >= 0) ? gMin : 20;
    }
    if (s.returnDays == null) { s.returnDays = 3; }
    if (s.rebuildCap == null) { s.rebuildCap = 40; }
    if (s.reviewRatio == null) { s.reviewRatio = 0.7; }
    if (s.pressureThreshold == null) { s.pressureThreshold = 50; }
    if (s.autoRebalance == null) { s.autoRebalance = true; }
    if (s.confidenceWarmup == null) { s.confidenceWarmup = true; }
    // #015 步骤 A：strengthMode 缺失或非法（非 off/on）→ 归一 'off'（读侧兜底，缺省 OFF）
    if (s.strengthMode !== 'on' && s.strengthMode !== 'off') { s.strengthMode = 'off'; }
    // #020 步骤 A'：strengthFrom 缺失/非法 → 0（=「全部接管」旧行为；UI 开启时写入真实时刻，
    // 语义见 dueOf 注释；不读 now()，保证 ensureSchema 幂等且确定）
    if (typeof s.strengthFrom !== 'number' || !isFinite(s.strengthFrom) || s.strengthFrom < 0) { s.strengthFrom = 0; }
    var keys = Object.keys(db.words || {});
    for (var i = 0; i < keys.length; i++) {
      var wr = db.words[keys[i]];
      if (wr.graduated == null) { wr.graduated = false; }
      // #015 步骤 B：evts 缺失/非数组 → 补 []；已是数组（含非空）原样保留，不覆盖、不裁剪
      if (!Array.isArray(wr.evts)) { wr.evts = []; }
      // #031（D-066 / G0 裁决 方案 2'）：ensureSchema 不补 s1——空库/老库经此函数后
      // 记录键集与旧版逐字节一致（护 UI 全库 JSON 快照断言）；s1 由 rateWord 惰性创建。
    }
    // #015 步骤 C：db.schema 绝不赋值、不抬 4、不加版本标记（恒 3）
    // #005 T01/F4：days[dk].byType（最小分桶，D-004 精确化）存在则校验归一、不存在不强补（幂等、SCHEMA 恒 3）
    var dks = Object.keys(db.days || {});
    for (var di = 0; di < dks.length; di++) {
      var dd = db.days[dks[di]];
      if (dd && dd.byType) { dd.byType = normalizeByType(dd.byType); }
    }
    return db;
  }

  /* ---------- 词书 ---------- */

  /** 把内置词书定义注入 db.books（缺哪本补哪本） */
  function seedBooks(db, defs) {
    for (var i = 0; i < defs.length; i++) {
      var def = defs[i];
      var found = null;
      for (var j = 0; j < db.books.length; j++) {
        if (db.books[j].key === def.key) { found = db.books[j]; break; }
      }
      if (!found) { db.books.push(clone(def)); }
    }
    return db;
  }

  function allBooks(db) {
    return db.books.concat(db.customBooks || []);
  }

  function bookByKey(db, key) {
    var books = allBooks(db);
    for (var i = 0; i < books.length; i++) {
      if (books[i].key === key) { return books[i]; }
    }
    return null;
  }

  /** 词书词条（可按单元下标切片） */
  function entriesOf(book, unitIdx) {
    if (!book || !book.words) { return []; }
    if (unitIdx == null) { return book.words; }
    var unit = book.units && book.units[unitIdx];
    if (!unit) { return book.words; }
    return book.words.slice(unit.range[0], unit.range[1] + 1);
  }

  /** 词书进度：已学（reps>0）/ 总数 */
  function bookProgress(db, book) {
    var words = book && book.words ? book.words : [];
    var learned = 0;
    for (var i = 0; i < words.length; i++) {
      var rec = db.words[wordKey(words[i].w)];
      if (rec && rec.reps > 0) { learned += 1; }
    }
    return { learned: learned, total: words.length };
  }

  /**
   * 解析粘贴文本并创建自制词书。
   * 支持两种格式：
   *  1) 每行一个单词 → 先匹配内置词库，匹配不到建占位词条
   *  2) 每行 单词|音标|释义|例句|例句翻译
   * @param {Object} builtinIndex norm(word) → 内置词条
   * @returns {{book:Object, matched:number, unmatched:number}}
   */
  function createCustomBook(db, name, text, builtinIndex) {
    var lines = String(text || '').split(/\r?\n/);
    var words = [];
    var seen = {};
    var matched = 0;
    var unmatched = 0;
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) { continue; }
      var entry = null;
      if (line.indexOf('|') >= 0) {
        var parts = line.split('|');
        var w0 = norm(parts[0]);
        if (!w0 || seen[w0]) { continue; } // 书内去重先行，避免重复计数
        entry = {
          w: w0,
          p: (parts[1] || '').trim(),
          t: (parts[2] || '').trim(),
          e: (parts[3] || '').trim(),
          et: (parts[4] || '').trim()
        };
        unmatched += 1; // 自带完整词条，不算「匹配内置」
      } else {
        var w1 = norm(line);
        if (!w1 || seen[w1]) { continue; } // 书内去重先行
        if (builtinIndex[w1]) {
          entry = clone(builtinIndex[w1]);
          matched += 1;
        } else {
          entry = { w: w1, p: '', t: '', e: '', et: '' }; // 占位词条，详情可补
          unmatched += 1;
        }
      }
      seen[entry.w] = true;
      words.push(entry);
    }
    var book = {
      key: 'custom_' + now().toString(36),
      name: String(name || '我的词书').trim() || '我的词书',
      createdAt: now(),
      words: words
    };
    db.customBooks.push(book);
    return { book: book, matched: matched, unmatched: unmatched };
  }

  /** 删除自制词书（不影响已学词记录，db.words 不动） */
  function deleteCustomBook(db, key) {
    var idx = -1;
    for (var i = 0; i < db.customBooks.length; i++) {
      if (db.customBooks[i].key === key) { idx = i; break; }
    }
    if (idx >= 0) { db.customBooks.splice(idx, 1); }
    return idx >= 0;
  }

  /* ---------- 统计 ---------- */

  /**
   * 汇总统计：连续天数 / 总正确率 / 已学词数 / 错词数 / 累计作答
   */
  function stats(db) {
    var keys = Object.keys(db.words);
    var learned = 0;
    var correctSum = 0;
    var wrongCnt = 0;
    for (var i = 0; i < keys.length; i++) {
      var r = db.words[keys[i]];
      if (r.reps > 0) { learned += 1; }
      correctSum += r.correct || 0;
      if (r.wrong > 0) { wrongCnt += 1; }
    }
    var totalAnswers = 0;
    var totalCorrect = 0;
    var dks = Object.keys(db.days);
    for (var j = 0; j < dks.length; j++) {
      totalAnswers += db.days[dks[j]].total || 0;
      totalCorrect += db.days[dks[j]].correct || 0;
    }
    // 连续天数：今天没作答则从昨天起算
    var streak = 0;
    var cursor = new Date();
    if (!db.days[dayKey(cursor.getTime())]) { cursor.setTime(cursor.getTime() - DAY_MS); }
    while (db.days[dayKey(cursor.getTime())] && (db.days[dayKey(cursor.getTime())].total || 0) > 0) {
      streak += 1;
      cursor.setTime(cursor.getTime() - DAY_MS);
    }
    return {
      streak: streak,
      accuracy: totalAnswers > 0 ? totalCorrect / totalAnswers : 0,
      learned: learned,
      wrongCount: wrongCnt,
      totalAnswers: totalAnswers,
      correctSum: correctSum
    };
  }

  /**
   * 跨词书搜索：按单词前缀/包含、或中文释义包含。
   * @returns {Array<{entry:Object, book:Object}>}
   */
  function searchEntries(db, q, limit) {
    q = norm(q);
    if (!q) { return []; }
    limit = limit || 10;
    var out = [];
    var books = allBooks(db);
    for (var b = 0; b < books.length && out.length < limit; b++) {
      var words = books[b].words || [];
      for (var i = 0; i < words.length && out.length < limit; i++) {
        var e = words[i];
        if (e.w.indexOf(q) === 0 || e.t.indexOf(q) >= 0) {
          out.push({ entry: e, book: books[b] });
        }
      }
    }
    // 前缀命中排前
    out.sort(function (a, c) {
      var pa = a.entry.w.indexOf(q) === 0 ? 0 : 1;
      var pc = c.entry.w.indexOf(q) === 0 ? 0 : 1;
      return pa - pc;
    });
    return out;
  }

  /* ---------- #015 叠加式记忆强度引擎 · 纯函数（无 DOM / 不改入参 / 可复算） ----------
   * 阶段一观测层：strengthOf（只读强度看板）；阶段二叠加层：strengthDue（到期纯函数）。
   * 依 D-037/D-038；公式为可解释启发式（非 ML、不展示百分比），口径见 docs/design-strength.md §2.1/§2.2。
   * 确定性：锚点取事件 t 或 rec.last，绝不读 now()；同输入恒同输出。
   * ---------------------------------------------------------------- */
  var STRENGTH_LEVEL = { HIGH: 'high', MID: 'mid', LOW: 'low' };
  var STRENGTH_BASIS = { EVENTS: 'events', LVL_PROXY: 'lvl-proxy' };

  /** 整数钳位；非有限值回退下界（用于档位 score 0..6，杜绝 NaN / Infinity）。 */
  function clampInt(v, lo, hi) {
    if (typeof v !== 'number' || !isFinite(v)) { return lo; }
    return Math.max(lo, Math.min(hi, Math.floor(v)));
  }

  /** 合法事件校验：阶段一不消费 type（D-038③）；只看 t / rating / interval。 */
  function validStrengthEvent(e) {
    return !!(e && typeof e === 'object'
      && typeof e.t === 'number' && isFinite(e.t) && e.t >= 0
      && (e.rating === 'know' || e.rating === 'fuzzy' || e.rating === 'unknown')
      && typeof e.interval === 'number' && isFinite(e.interval) && e.interval >= 0);
  }

  /** LADDER_DAYS 中 <= gapDays 的最大下标，钳到 0..len-1（超大间隔钳末档）。 */
  function strengthLadderIndex(gapDays, ladder) {
    var L = ladder && ladder.length ? ladder : LADDER_DAYS;
    var g = (typeof gapDays === 'number' && isFinite(gapDays)) ? gapDays : 0;
    var idx = 0;
    for (var i = 0; i < L.length; i++) { if (L[i] <= g) { idx = i; } }
    return Math.max(0, Math.min(L.length - 1, idx));
  }

  /** 事件打分：base(历史最大成功间隔) + sign(对错净反馈) + trend(成功间隔非下降)，clamp 0..6。 */
  function strengthEventScore(events, ladder) {
    var es = events.slice().sort(function (a, b) { return a.t - b.t; });
    var knows = [], unknowns = 0, maxGap = 0;
    for (var i = 0; i < es.length; i++) {
      if (es[i].rating === 'know') {
        knows.push(es[i]);
        if (es[i].interval > maxGap) { maxGap = es[i].interval; } // 历史被证实可记住的最长间隔(ms)
      } else if (es[i].rating === 'unknown') { unknowns += 1; }
    }
    var base = strengthLadderIndex(maxGap / DAY_MS, ladder);
    var net = knows.length - unknowns;
    var sign = net > 0 ? 1 : (net < 0 ? -1 : 0);              // fuzzy 中性
    var trend = (knows.length >= 2 && knows[knows.length - 1].interval >= knows[knows.length - 2].interval) ? 1 : 0;
    return clampInt(base + sign + trend, 0, 6);
  }

  function strengthLevelOf(score) {
    if (score >= 4) { return STRENGTH_LEVEL.HIGH; }
    if (score >= 2) { return STRENGTH_LEVEL.MID; }
    return STRENGTH_LEVEL.LOW;
  }

  /** 无事件回退：lvl 越高强度越高（与 (3-lvl) 重建优先级反相代理同信息、反向可换算）。 */
  function lvlProxyScore(lvl) {
    return clampInt((typeof lvl === 'number' && isFinite(lvl)) ? lvl : 0, 0, 6);
  }

  /**
   * P1 · strengthOf(db, key) —— 可解释强度看板（纯只读，不写真源）。
   * @returns {{level:'high'|'mid'|'low', score:(number|null), basis:'events'|'lvl-proxy', n:number}}
   * 边界：db/words/key 缺失或无真源 → {level:'low', score:null, basis:'lvl-proxy', n:0}；
   *       无合法事件回退 lvl 代理；异常事件跳过不抛错；score 为 0..6 整数或 null。
   */
  function strengthOf(db, key) {
    var empty = { level: STRENGTH_LEVEL.LOW, score: null, basis: STRENGTH_BASIS.LVL_PROXY, n: 0 };
    if (!db || !db.words || typeof key !== 'string') { return empty; }
    var rec = db.words[key];
    if (!rec || typeof rec !== 'object') { return empty; }
    var raw = Array.isArray(rec.evts) ? rec.evts : [];
    var valid = raw.filter(validStrengthEvent); // 异常事件跳过，不抛错
    if (valid.length === 0) {
      var ps = lvlProxyScore(rec.lvl);
      return { level: strengthLevelOf(ps), score: ps, basis: STRENGTH_BASIS.LVL_PROXY, n: 0 };
    }
    var score = strengthEventScore(valid, LADDER_DAYS);
    return { level: strengthLevelOf(score), score: score, basis: STRENGTH_BASIS.EVENTS, n: valid.length };
  }

  /**
   * P2 · strengthDue(rec, events, opts) —— 强度接管下的到期时间（纯函数，不读 now）。
   * @param {Object} rec 词条记录（只读 lvl/last）
   * @param {Array} events rec.evts（只读）
   * @param {{ladder?:number[], dayMs?:number}} opts 仅测试/解耦注入；不设 now 入参
   * @returns {number} 有限到期毫秒时间戳，与 rec.due 同量纲
   */
  function strengthDue(rec, events, opts) {
    opts = opts || {};
    var L = (opts.ladder && opts.ladder.length) ? opts.ladder : LADDER_DAYS;
    var MS = (typeof opts.dayMs === 'number' && isFinite(opts.dayMs) && opts.dayMs > 0) ? opts.dayMs : DAY_MS;
    var valid = (Array.isArray(events) ? events : []).filter(validStrengthEvent)
      .sort(function (a, b) { return a.t - b.t; });
    var score, anchor;
    if (valid.length >= 1) {
      score = strengthEventScore(valid, L);
      anchor = valid[valid.length - 1].t; // 最后一次合法事件时刻
    } else {
      score = lvlProxyScore(rec && rec.lvl);
      anchor = (rec && typeof rec.last === 'number' && isFinite(rec.last) && rec.last > 0) ? rec.last : 0;
    }
    var gapDays = L[clampInt(score, 0, L.length - 1)];
    if (typeof gapDays !== 'number' || !isFinite(gapDays)) { gapDays = L[Math.min(6, L.length - 1)]; }
    return anchor + gapDays * MS;
  }

  /* ---------- N4/N2 纯函数（#005 T01/T02 · 契约 §3.1 五纯函数） ----------
   * 全部为无 DOM、不修改入参的纯函数，经 Core 对象双暴露。
   * 与 phrases.DAILY_MINUTE_OPTIONS 同源的档位集合见 DAILY_MINUTE_OPTIONS。
   * ---------------------------------------------------------------- */

  /**
   * P1 · minutesFreshCap(dailyMinutes, options) —— N4 接线核心：时长侧新词上限。
   * 入参：dailyMinutes 来自 settings.dailyMinutes（唯一真源）；options 为有序档位集合。
   * 出参：该档位对应的「时长侧新词上限」(number)。
   * 不变式：随 dailyMinutes 单调不减；dailyMinutes 为默认档(20)时返回值 ≥ freshLimit(20)，
   *         此不变量保证既有 computeDailyBudget 系列断言零改动；非法/缺失值返回 Infinity
   *         （不封顶），交由 P2 的 freshLimit 兜底。
   * 说明：分钟数即该档新词配额（约 1 词/分钟），与集合大小解耦（OP-01）。
   */
  function minutesFreshCap(dailyMinutes, options) {
    if (typeof dailyMinutes !== 'number' || !isFinite(dailyMinutes) || dailyMinutes <= 0) {
      return Infinity; // 非法/缺失 → 不封顶
    }
    return dailyMinutes; // 单调不减：档位越高配额越高
  }

  /**
   * P2 · resolveFreshTarget(s, planDailyFresh) —— 全仓唯一 freshLimit 封顶点。
   * 入参：s = db.settings（含 dailyMinutes / freshLimit / reviewRatio）；
   *       planDailyFresh = db.plan.dailyFresh（可为空/0）。
   * 出参：今日新词配额 freshTarget(number)。
   * 不变式：① 由 s.dailyMinutes 经 P1 得时长侧新词上限；
   *         ② planDaily = planDailyFresh>0 ? planDailyFresh : s.freshLimit；
   *         ③ freshTarget = min(planDaily, s.freshLimit, P1) —— 唯一封顶点；
   *         ④ 当 s.dailyMinutes===20 时 P1≥freshLimit，退化为既有 Math.min(planDaily, freshLimit)。
   */
  function resolveFreshTarget(s, planDailyFresh) {
    var hasPlan = (typeof planDailyFresh === 'number' && planDailyFresh > 0);
    var planDaily = hasPlan ? planDailyFresh : s.freshLimit;
    var cap = minutesFreshCap(s.dailyMinutes, DAILY_MINUTE_OPTIONS);
    return Math.min(planDaily, s.freshLimit, cap);
  }

  /**
   * P3 · weightedEstMinutes(dailyFresh, dailyReview, typeMix) —— 估时题型敏感。
   * 入参：dailyFresh/dailyReview 为计划词数；typeMix 为 F4 最小 byType 分桶聚合的
   *       加权均时对象 {flash:{n,ms}, type:{n,ms}, choice:{n,ms}}（n 作答数 / ms 累计毫秒）。
   * 出参：预计每日时长分钟数(number)。
   * 不变式：① 不传 typeMix → 回退单一 SEC_PER_WORD=35 公式（保证既有 buildPlan 断言零改动）；
   *         ② 传 typeMix → 按题型加权均时（全写出英文 > 全英文选义，差值>0）；
   *         ③ typeMix 只影响展示用估时，不进入 computeDailyBudget / 派词配额。
   * 参照 v3.0 §2.1 题型均时：选义 ~15s / 写英 ~50s / 快过 ~35s。
   */
  function weightedEstMinutes(dailyFresh, dailyReview, typeMix) {
    var total = (dailyFresh || 0) + (dailyReview || 0);
    if (!typeMix) {
      return Math.round(total * SEC_PER_WORD / 60);
    }
    var types = ['flash', 'type', 'choice'];
    var totN = 0, totMs = 0;
    for (var i = 0; i < types.length; i++) {
      var t = typeMix[types[i]];
      if (t && typeof t.n === 'number' && typeof t.ms === 'number' && t.n > 0) {
        totN += t.n;
        totMs += t.ms;
      }
    }
    if (totN === 0) {
      return Math.round(total * SEC_PER_WORD / 60); // 无 byType 数据 → 回退 35s
    }
    var avgSec = totMs / totN / 1000;
    return Math.round(total * avgSec / 60);
  }

  /**
   * P4 · resolveLadderMode(ctx) —— N2 题型阶梯。
   * 入参：ctx = { lvl, ladderMode:'auto'|'manual', cardKind:'fresh'|'review',
   *              sessionMode, userMode }。
   * 出参：{ mode:'flash'|'choice'|'type'|'match', hint:boolean }。
   * 护栏：只返回题型 + 提示开关，绝不改 lvl/due/wfix/why/st/wrong（N2L-AC07）。
   * 无状态（不缓存、不写库）→ 天然满足 N2L-AC09「切 manual 不回滚」。
   */
  function resolveLadderMode(ctx) {
    ctx = ctx || {};
    var lvl = ctx.lvl || 0;
    var ladderMode = ctx.ladderMode;
    var cardKind = ctx.cardKind;        // 'fresh' | 'review'
    var sessionMode = ctx.sessionMode;  // 当前会话题型（'match' 短路）
    var userMode = ctx.userMode;        // manual 时沿用用户手选题型

    // 1. 对对碰（match）：不评级、不计额度、不进错词本（N2L-AC06）
    if (sessionMode === 'match') {
      return { mode: 'match', hint: false };
    }
    // 2. 新词卡（reps=0）：一律快过，不进阶梯（N2L-AC05）
    if (cardKind === 'fresh') {
      return { mode: 'flash', hint: false };
    }
    // 3. 手动模式：沿用用户手选题型，不上移（N2L-AC01/09）
    if (ladderMode === 'manual') {
      return { mode: (userMode || 'flash'), hint: false };
    }
    // 4. 自动 + lvl 0：英文选义，无拼写框（N2L-AC02）
    if (lvl <= 0) {
      return { mode: 'choice', hint: false };
    }
    // 5. 自动 + lvl 1|2：写出英文，保留逐字母空格提示（N2L-AC03）
    if (lvl === 1 || lvl === 2) {
      return { mode: 'type', hint: true };
    }
    // 6. 自动 + lvl >=3：写出英文，关闭提示（N2L-AC04，与上唯一差别是提示开关）
    return { mode: 'type', hint: false };
  }

  /**
   * P5 · previousMinuteOption(currentMin, options) —— D-3 查表降量。
   * 入参：currentMin 当前档；options 有序档位集合。
   * 出参：集合中严格小于 currentMin 的最大档；若 currentMin 已是集合最小档 → null。
   * 不变式：结果 ∈ options、严格小于输入、不等于 25；
   *         全仓不出现 dailyMinutes-5 / Math.max(10,…) 兜底（N4W-AC06③）。
   */
  function previousMinuteOption(currentMin, options) {
    var opts = (options && options.length) ? options.slice().sort(function (a, b) { return a - b; }) : DAILY_MINUTE_OPTIONS.slice().sort(function (a, b) { return a - b; });
    var prev = null;
    for (var i = 0; i < opts.length; i++) {
      if (opts[i] < currentMin) { prev = opts[i]; }
    }
    return prev; // 无更小档 → null
  }

  /* ---------- 阶段一 P0：方案 C / I / J 纯逻辑（无 DOM 依赖） ---------- */

  /**
   * 由 settings（+ 可选的 plan.dailyFresh）推导每日预算。
   * 方案 I / Gap#2（用户决策：以计划值为准、freshLimit 作上限）：
   *   - 有导出计划（planDailyFresh>0）→ freshTarget = min(planDailyFresh, freshLimit)
   *   - 无计划（planDailyFresh 为空/0）→ 沿用 freshLimit
   * 复习数按 7:3 互补，且不超过 reviewLimit 硬上限（C-AC5）。
   */
  function computeDailyBudget(s, planDailyFresh) {
    // #005 T02：freshTarget 委托 P2（唯一封顶点，D-034）；reviewTarget 完全沿用既有 7:3 口径（OP-05）
    var freshTarget = resolveFreshTarget(s, planDailyFresh);
    var reviewTarget = Math.round(freshTarget * s.reviewRatio / (1 - s.reviewRatio));
    if (reviewTarget > s.reviewLimit) { reviewTarget = s.reviewLimit; }
    return { freshTarget: freshTarget, reviewTarget: reviewTarget };
  }

  /** Open-1 考试类型 → 内置书键映射 */
  function goalBookKeys(type) {
    return ({
      cet46: ['cet4', 'cet6'],
      kaoyan: ['kaoyan'],
      ielts: ['ielts'],
      toefl: ['ielts'],
      job: ['job'],
      free: ['cet4', 'cet6', 'kaoyan', 'ielts', 'job']
    })[type] || ['cet4', 'cet6', 'kaoyan', 'ielts', 'job'];
  }

  /**
   * 推导六要素并落 db.plan（依赖 db.goal 已落库）；公式可复算（I-AC3）。
   * @returns {Object} db.plan
   */
  function buildPlan(db, typeMix) {
    var g = db.goal || { type: 'free', deadline: null, dailyMinutes: 20 };
    var keys = goalBookKeys(g.type);
    var total = 0, mastered = 0, t = now();
    keys.forEach(function (bk) {
      var bkObj = bookByKey(db, bk);
      if (!bkObj) { return; }
      (bkObj.words || []).forEach(function (e) {
        total += 1;
        var r = db.words[wordKey(e.w)];
        if (r && (r.graduated || r.st === 'known')) { mastered += 1; }
      });
    });
    var daysLeft = 0;
    if (g.deadline) { daysLeft = Math.max(1, Math.ceil((g.deadline - t) / DAY_MS)); }
    var dailyFresh = (daysLeft > 0)
      ? Math.ceil((total - mastered) / daysLeft)                    // 考试冲刺：均摊
      : db.settings.freshLimit;                                     // 自由/长期：沿用 freshLimit
    var dailyReview = Math.round(dailyFresh * db.settings.reviewRatio / (1 - db.settings.reviewRatio));
    if (dailyReview > db.settings.reviewLimit) { dailyReview = db.settings.reviewLimit; }
    // #005 T02：estMinutes 委托 P3（不传 typeMix 回退 35s 单一公式，保证既有断言零改动）
    var estMinutes = weightedEstMinutes(dailyFresh, dailyReview, typeMix);
    db.plan = {
      derivedAt: t,
      totalWords: total,
      mastered: mastered,
      dailyFresh: dailyFresh,
      dailyReview: dailyReview,
      estMinutes: estMinutes,
      daysLeft: daysLeft
    };
    return db.plan;
  }

  /**
   * 纯函数：是否回归（基于当前 lastSeen 与积压）。
   * @returns {{isReturn:boolean, daysGap:number, backlog:number}}
   */
  function detectReturn(db) {
    var s = db.settings, t = now();
    var backlog = 0, keys = Object.keys(db.words);
    for (var i = 0; i < keys.length; i++) {
      var r = db.words[keys[i]];
      if (r.reps > 0 && r.due > 0 && r.due <= t && !r.graduated) { backlog += 1; }
    }
    var last = db.returnGuard.lastSeen;
    var daysGap = 0;
    if (last) { daysGap = Math.floor((t - new Date(last + 'T00:00:00').getTime()) / DAY_MS); }
    return {
      isReturn: (daysGap >= s.returnDays) && (backlog >= s.pressureThreshold),
      daysGap: daysGap,
      backlog: backlog
    };
  }

  /** 更新 lastSeen + 积压计数；回归日一次性决策并持久化重建包（同日去重）。
   *  @returns {Object} detectReturn 返回的判定结果（用「旧」lastSeen 计算） */
  function updateLastSeen(db) {
    var dk = dayKey();
    var det = detectReturn(db);
    db.returnGuard.lastSeen = dk;
    db.returnGuard.backlogCount = det.backlog;
    if (det.isReturn) {
      var pack = buildRebuildPack(db, db.settings.rebuildCap);
      db.returnGuard.rebuildWords = pack.rebuildWords;
      db.returnGuard.rebuiltAt = dk;
      db.returnGuard.spreadDays = pack.spreadDays;
    }
    return det;
  }

  /**
   * 回归重建包（Open-6 代理：记忆强度最低 lvl 低 + due 越紧迫优先，cet4 加权）。
   * 不写库（由 updateLastSeen / app 持久化）。
   * @returns {{rebuildWords:Array<string>, remaining:number, spreadDays:number}}
   */
  function buildRebuildPack(db, cap) {
    cap = cap || db.settings.rebuildCap || 40;
    var t = now(), cand = [];
    var keys = Object.keys(db.words);
    for (var i = 0; i < keys.length; i++) {
      var r = db.words[keys[i]];
      if (r.reps > 0 && r.due > 0 && r.due <= t && !r.graduated) {
        var strength = (3 - r.lvl);                  // 记忆强度最低代理：lvl 越低分越高
        if (r.srcBook === 'cet4') { strength -= 1.5; } // 考纲高频加权（cet4 优先级提升）
        cand.push({ key: keys[i], score: strength, due: r.due });
      }
    }
    cand.sort(function (a, b) { return (b.score - a.score) || (a.due - b.due); }); // 强度降序，同档 due 升序
    var pick = cand.slice(0, cap);
    var remaining = Math.max(0, cand.length - pick.length);
    var avgDaily = db.settings.reviewLimit || 60;
    var spreadDays = Math.min(5, Math.max(3, Math.ceil(remaining / Math.max(1, avgDaily))));
    return {
      rebuildWords: pick.map(function (c) { return c.key; }),
      remaining: remaining,
      spreadDays: spreadDays
    };
  }

  /**
   * Open-2：按「书顺序」作频率分层代理（db.books 内置顺序 = cet4→cet6→kaoyan→ielts→job）。
   * 跨层抽样，硬上限 30 题（J-AC1）。
   * @returns {Array<{key,w,tier,srcBook}>}
   */
  function selectBaselinePool(db) {
    var HARD_CAP = 30, perTier = 6, pool = [], n = 0;
    var books = (db.books || []).filter(function (b) { return b.builtin; });
    for (var tier = 0; tier < books.length && n < HARD_CAP; tier++) {
      var ws = books[tier].words || [];
      var step = Math.max(1, Math.floor(ws.length / perTier));
      for (var i = 0; i < ws.length && n < HARD_CAP; i += step) {
        pool.push({ key: wordKey(ws[i].w), w: ws[i].w, tier: tier, srcBook: books[tier].key });
        n += 1;
      }
    }
    return pool; // 跨层抽样，约 24–30 题封顶
  }

  /**
   * 阶梯收敛（J-AC2）：对 0..460 累计下标做二分搜索，答对升、答错降，收敛到 ±300。
   * @param {Array<boolean>} answers 每题是否正确（true=答对）
   * @returns {{level:number}}
   */
  function scoreBaseline(answers) {
    var TOTAL = 460, lo = 0, hi = TOTAL;
    for (var i = 0; i < answers.length; i++) {
      var mid = Math.floor((lo + hi) / 2);
      if (answers[i]) { lo = mid; } else { hi = mid; } // 答对→上调估计，答错→下调
    }
    return { level: Math.floor((lo + hi) / 2) }; // 估计词汇量等级（累计下标）
  }

  /** 给定当前 level，从池中取最接近难度的词（供 app 出题）。
   *  @returns {Object|undefined} pool 中的一项 */
  function baselineQuestionForLevel(pool, level) {
    if (!pool || !pool.length) { return undefined; }
    var tier = Math.min(pool.length ? Math.floor(level / 92) : 0, 4); // 460/5≈92 每层
    for (var i = 0; i < pool.length; i++) { if (pool[i].tier === tier) { return pool[i]; } }
    return pool[Math.min(tier, pool.length - 1)] || pool[0];
  }

  /**
   * 批量毕业裁剪（J-AC3 / Gap#1 冷启动修复）：
   * 按内置词书频率层序（db.books 中 builtin 顺序 = cet4→cet6→kaoyan→ielts→job，
   * 与 selectBaselinePool 同序）将下标 0..level-1 的词标记 graduated，并写 db.baseline。
   * 冷启动（db.words 为空）修复（Gap#1）：不存在的记录用 newRecord 默认值创建最小记录
   * 并置 graduated=true（reps:0, lvl:6, st:'known', due:远未来），使 todayPlan 的
   * word.graduated 过滤对冷启用户也生效（J-AC3：起点 i+1、首日不面对 abandon）。
   * @param {number} level scoreBaseline 返回、表示已掌握词数估计（0..N）
   * @returns {Array<string>} 被标记毕业的词 key 列表
   */
  function applyGraduation(db, level) {
    var books = (db.books || []).filter(function (b) { return b.builtin; });
    var keys = [], n = 0;
    /* D-068：同一决策只取一次当前时间——testedAt 与 reestimateAt 若分两次 now()，
     * 跨毫秒边界会让 `reestimateAt - testedAt === 14*DAY` 偶发失败（C3 单次基准）。 */
    var t = now();
    var farFuture = t + 365 * DAY_MS; // 远未来 due（毕业词不再进入复习）
    for (var b = 0; b < books.length && n < level; b++) {
      var ws = books[b].words || [];
      for (var i = 0; i < ws.length && n < level; i++) {
        var w = ws[i].w;
        var k = wordKey(w);
        var rec = db.words[k];
        if (!rec) {
          // 冷启动：创建最小毕业记录（其余字段取 newRecord 默认）
          rec = newRecord(w, books[b].key);
          rec.lvl = 6;
          rec.st = 'known';
          rec.due = farFuture;
          db.words[k] = rec;
        }
        rec.graduated = true;                       // 已存在则置 true；新建亦置 true
        keys.push(k);
        n += 1;
      }
    }
    db.baseline = {
      level: level,
      testedAt: t,
      words: keys,
      reestimateAt: t + 14 * DAY_MS
    };
    return keys;
  }

  /** 当日有效完成率（Open-7 / #005 T02 §3.2 判定表 0/null 精确切分）：
   *  序1 无 days[dk] → 0
   *  序2 planTarget 字段存在（含 0）→ Math.min(1, total/target)；target=0 → 0
   *  序3 planTarget 缺失且 total===0 → null（空打开日，N4W-AC04）
   *  序4 planTarget 缺失且 total>0 → 0
   *  返回类型由 number 扩展为 number|null（OP-03）；不新增第二个完成率函数。
   */
  function dailyCompletionRate(db, dk) {
    var d = db.days[dk];
    if (!d) { return 0; }                       // 序1：无 days[dk]
    if (d.planTarget != null) {                 // 序2：planTarget 字段存在（含 0）
      if (d.planTarget === 0) { return 0; }
      return Math.min(1, d.total / d.planTarget);
    }
    if (d.total === 0) { return null; }         // 序3：空打开日 → null（不产生 NaN）
    return 0;                                   // 序4：total>0 无 planTarget
  }

  /**
   * 每周再平衡（I-AC4）：仅给建议/在 autoRebalance 时微调整 dailyMinutes，不动 words 进度。
   * @returns {{suggested:boolean, kind?:string, rate:number, ...}}
   */
  function weeklyRebalance(db) {
    var s = db.settings, t = now(), rates = [];
    for (var j = 6; j >= 0; j--) {
      var dk = dayKey(t - j * DAY_MS);
      var r = dailyCompletionRate(db, dk);   // 现返回 0 或 null
      if (r !== null) { rates.push(r); }      // 空打开日(null)不参与均值（N4W-AC04/05）
    }
    if (rates.length === 0) {
      return { suggested: false, rate: null }; // 有效样本不足 → 不提示、不写真源
    }
    var rate = rates.reduce(function (a, b) { return a + b; }, 0) / rates.length;
    if (rate < 0.70) {
      // 降量建议值由 P5 档位查表给出；不写真源、不读 autoRebalance（D-004/F5、N4W-AC05/06）
      var suggMin = previousMinuteOption(s.dailyMinutes, DAILY_MINUTE_OPTIONS);
      if (suggMin == null) {
        return { suggested: false, rate: rate }; // 已在最小档：不反向升档、不产出降量建议（N4W-AC06②）
      }
      var msg = '按当前节奏，考试前可覆盖 ' + Math.round(rate * 100) + '%，是否把每日时长调到 ' + suggMin + ' 分钟？';
      return { suggested: true, kind: 'lower', rate: rate, suggestedDailyMinutes: suggMin, message: msg };
    }
    if (rate > 0.95) {
      var avg = rates.reduce(function (a, b) { return a + b; }, 0) / rates.length * (db.plan.dailyFresh || s.freshLimit);
      var ahead = db.plan.daysLeft
        ? Math.max(0, Math.round((db.plan.totalWords - db.plan.mastered) / Math.max(1, avg)) - db.plan.daysLeft)
        : 0;
      return { suggested: true, kind: 'faster', rate: rate, aheadDays: ahead, message: '你比计划快 ' + ahead + ' 天' };
    }
    return { suggested: false, rate: rate };
  }

  /** 供 Open-7 统计与测试使用；自身聚合全量记录后调用 todayPlan。 */
  function computePlanTarget(db) {
    var recs = Object.keys(db.words).map(function (k) { return db.words[k]; });
    return todayPlan(db, recs).planTarget;
  }

  /* ---------- 缺口 A / C 纯函数（阶段一 P0 遗留补丁） ---------- */

  /**
   * 缺口 A：计划卡「每日新学」应展示的值。
   * 冲刺型计划可能推导 dailyFresh 高于本机 freshLimit（如 34），
   * 但今日实际新词已被 computeDailyBudget 封顶在 freshLimit（20），
   * 计划卡须与今日实际一致，故取 min(planDaily, freshLimit)；无计划时回退 freshLimit。
   * @param {Object|undefined} plan db.plan
   * @param {number} freshLimit settings.freshLimit
   * @returns {number} 计划卡应展示的每日新学数
   */
  function planCardDailyFresh(plan, freshLimit) {
    var planDaily = (plan && plan.dailyFresh > 0) ? plan.dailyFresh : freshLimit;
    return Math.min(planDaily, freshLimit);
  }

  /**
   * 缺口 C：首组信心词注入（PRD §4 条目 5 / 工程师已知限制 #1）。
   * 在今日计划（today scope）且当日尚未学任何词（days[今天].total===0）
   * 且 settings.confidenceWarmup !== false 时，从 cet4 内置词表顺序取
   * 最简单/最高频的前 2 个词（已 graduated/已掌握/已有记录者顺延取下一个），
   * 在最前 unshift 进学习序列并标记 .warmup=true。
   * 纯函数：入参不修改，返回含热身词的新序列；无可用词时原样返回 words。
   * @param {Array<Object>} words 当前学习序列（entry 对象数组）
   * @param {Object} db 只读引用（不修改）
   * @param {Object} settings db.settings
   * @returns {Array<Object>} 注入后的新序列（热身词在前、带 warmup 标记）
   */
  function injectWarmup(words, db, settings) {
    if (!words || !db) { return words || []; }
    if (settings && settings.confidenceWarmup === false) { return words; }
    var dk = dayKey();
    var day = db.days[dk];
    if (day && day.total > 0) { return words; } // 当日已学任何词则不注入（防同日重复）
    var bk = bookByKey(db, 'cet4');
    if (!bk || !bk.words || !bk.words.length) { return words; }
    var picked = [];
    for (var i = 0; i < bk.words.length && picked.length < 2; i++) {
      var w0 = bk.words[i];
      if (!w0 || !w0.w) { continue; }
      var k = wordKey(w0.w);
      if (db.words[k]) { continue; } // 已 graduated/已掌握/已有记录 → 顺延取下一个
      picked.push({ w: norm(w0.w), p: w0.p || '', t: w0.t || '', e: w0.e || '', et: w0.et || '', warmup: true });
    }
    if (!picked.length) { return words; }
    return picked.concat(words);
  }

  /* ---------- v3.0 增量 A：已掌握词抽测（装订抽检） ----------
   * 目标：给「已掌握」状态补一个产出型出口，检验「能认」是否等于「会写」。
   * 使用条件：已掌握池 ≥ minPool(10) 且距上次完整抽测 ≥ cooldownDays(14)，
   *           由用户在「学习统计」页主动发起；不自动触发、不提醒。
   * 兼容约束（不引入无关重构 / 不改变既有行为）：
   *   - 不读写 db.words 的任何既有字段（lvl/due/wfix/wrong/st/star 一律不动）
   *   - 不写 db.days、db.settings、db.goal、db.plan
   *   - 只有 commitExam / markReviewed 会写新增的 db.exam
   *   - 筛选、判定、会话生成均为纯函数，便于 node:test 直接断言
   * ---------------------------------------------------------- */

  var EXAM_DEFAULTS = { size: 10, minPool: 10, cooldownDays: 14, keepRecords: 10 };

  /** 数值型可选项兜底：非有限数值（NaN / Infinity / 非 number）回退默认值。 */
  function optNum(v, dflt) {
    return (v == null || typeof v !== 'number' || !isFinite(v)) ? dflt : v;
  }

  /** 库中计数字段兜底：NaN / 负数 / 非 number 一律归零，避免脏值落盘成 null。 */
  function safeNonNeg(v) {
    return (typeof v === 'number' && isFinite(v) && v >= 0) ? v : 0;
  }

  /**
   * 已掌握词池。
   * 输入：db
   * 输出：Array<string> 词 key（'w::xxx'），按字典序稳定排序
   * 边界：db/db.words 缺失 → []；st!=='known'、未作答、已毕业（graduated）一律排除
   */
  function examPool(db) {
    if (!db || !db.words) { return []; }
    return Object.keys(db.words).filter(function (k) {
      var r = db.words[k];
      return !!(r && r.reps > 0 && r.st === 'known' && !r.graduated);
    }).sort();
  }

  /**
   * 是否可发起抽测（纯函数）。
   * 输入：db；opts = {minPool, cooldownDays, at}（at 为当前时间戳 ms，缺省 now()）
   * 输出：{eligible, poolSize, minPool, reason, daysSinceLast, cooldownDays}
   *        reason: 'ok' | 'pool-too-small' | 'cooldown'
   * 边界：从未抽测（lastAt=0）时 daysSinceLast=-1 且冷却判定直接通过；
   *       未来时间戳/at 非法时按数值比较处理，不抛错；db.exam 缺失视为从未。
   */
  function examEligibility(db, opts) {
    opts = opts || {};
    var minPool = Math.max(1, Math.floor(optNum(opts.minPool, EXAM_DEFAULTS.minPool)));
    var cooldown = Math.max(0, optNum(opts.cooldownDays, EXAM_DEFAULTS.cooldownDays));
    var at = optNum(opts.at, now());
    var pool = examPool(db);
    var lastAt = (db && db.exam && typeof db.exam.lastAt === 'number') ? db.exam.lastAt : 0;
    var days = lastAt ? (at - lastAt) / DAY_MS : Infinity;
    var reason = 'ok';
    if (pool.length < minPool) { reason = 'pool-too-small'; }
    else if (days < cooldown) { reason = 'cooldown'; }
    return {
      eligible: reason === 'ok',
      poolSize: pool.length,
      minPool: minPool,
      reason: reason,
      daysSinceLast: lastAt ? Math.floor(days) : -1,
      cooldownDays: cooldown
    };
  }

  /**
   * 生成一次抽测会话（纯函数，不写 db）。
   * 输入：db；opts = {size, minPool, cooldownDays, at}
   * 输出：成功 {ok:true, id, keys, at, size, dateKey}；失败 {ok:false, reason, poolSize}
   * 边界：不可发起时返回 ok:false 且不抛错；size 被池大小收敛且至少 1；
   *       同一 at 且池不变时重复调用得到完全相同的 keys（词表固化、可复现，
   *       避免「点开→退出→重开」刷题）；池发生变化时 keys 会随之改变，
   *       这是预期行为；不使用 Math.random，保证可测。
   */
  function startExam(db, opts) {
    opts = opts || {};
    var at = optNum(opts.at, now());
    var elig = examEligibility(db, { at: at, minPool: opts.minPool, cooldownDays: opts.cooldownDays });
    if (!elig.eligible) { return { ok: false, reason: elig.reason, poolSize: elig.poolSize }; }
    var size = Math.max(1, Math.floor(optNum(opts.size, EXAM_DEFAULTS.size)));
    var pool = examPool(db).slice();
    var dk = dayKey(at);
    var seed = 0;
    for (var i = 0; i < dk.length; i++) { seed = (seed * 31 + dk.charCodeAt(i)) >>> 0; }
    var s = seed || 1;
    function rnd() {
      s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    }
    for (var j = pool.length - 1; j > 0; j--) {
      var r = Math.floor(rnd() * (j + 1));
      var tmp = pool[j]; pool[j] = pool[r]; pool[r] = tmp;
    }
    var keys = pool.slice(0, Math.min(size, pool.length));
    return { ok: true, id: 'exam_' + dk + '_' + keys.length, keys: keys, at: at, size: keys.length, dateKey: dk };
  }

  /**
   * 判定一次抽测（纯函数，不写 db）。
   * 输入：db；session = startExam 返回值；answers = [{key, answer}]
   * 输出：{id, at, size, correct, weakKeys, items:[{key,w,ok}]}；session 非法 → null
   * 边界：只认 session.keys 内的 key，answers 顺序无关、多余项忽略；
   *       缺答/空答/不在词表 → 记未写对；判定用 norm() 忽略大小写与首尾空白；
   *       词条已被删除时从 key 反推 w，不抛错。
   */
  function gradeExam(db, session, answers) {
    if (!session || !Array.isArray(session.keys)) { return null; }
    var map = {};
    (answers || []).forEach(function (a) { if (a && a.key) { map[a.key] = a.answer; } });
    var words = (db && db.words) || {};
    var items = session.keys.map(function (k) {
      var rec = words[k];
      var w = rec ? rec.w : (k.indexOf('w::') === 0 ? k.slice(3) : k);
      var ans = norm(map[k]);
      return { key: k, w: w, ok: !!ans && ans === norm(w) };
    });
    var weak = items.filter(function (x) { return !x.ok; }).map(function (x) { return x.key; });
    return {
      id: session.id,
      at: session.at || now(),
      size: items.length,
      correct: items.length - weak.length,
      weakKeys: weak,
      items: items
    };
  }

  /**
   * 落库一次完整抽测（唯一写 db.exam 的入口）。
   * 输入：db；record = gradeExam 返回值
   * 输出：record 本身；db/record 非法 → null
   * 边界：db.exam 缺失或字段类型异常时自动补齐；records 保留最近 keepRecords(10) 条；
   *       flags 被本次 weakKeys 整体替换（不是累加）；lastAt 取 record.at；
   *       不触碰 db.words / db.days / db.settings。
   */
  function commitExam(db, record) {
    if (!db || !record || !Array.isArray(record.weakKeys)) { return null; }
    if (!db.exam) { db.exam = { records: [], flags: [], lastAt: 0 }; }
    if (!Array.isArray(db.exam.records)) { db.exam.records = []; }
    if (!Array.isArray(db.exam.flags)) { db.exam.flags = []; }
    db.exam.records.unshift(record);
    if (db.exam.records.length > EXAM_DEFAULTS.keepRecords) {
      db.exam.records.length = EXAM_DEFAULTS.keepRecords;
    }
    db.exam.flags = record.weakKeys.slice();
    db.exam.lastAt = record.at;
    return record;
  }

  /**
   * 待重读词 key 列表（纯读，返回副本）。
   * 输入：db；输出：Array<string>
   * 边界：db.exam 缺失 / flags 非数组 → []；过滤掉已从 db.words 删除的词；
   *       返回副本，调用方修改不影响库。
   */
  function pendingReviewKeys(db) {
    if (!db || !db.exam || !Array.isArray(db.exam.flags)) { return []; }
    return db.exam.flags.filter(function (k) { return !!(db.words && db.words[k]); });
  }

  /**
   * 标记待重读词已完成（只改 db.exam.flags）。
   * 输入：db；keys = Array<string>；输出：被清除的条数
   * 边界：keys 为空/非数组 → 0 且不改库；db.exam 缺失 → 0；不动 db.words。
   */
  function markReviewed(db, keys) {
    if (!db || !db.exam || !Array.isArray(db.exam.flags) || !Array.isArray(keys)) { return 0; }
    var set = {};
    keys.forEach(function (k) { set[k] = 1; });
    var before = db.exam.flags.length;
    db.exam.flags = db.exam.flags.filter(function (k) { return !set[k]; });
    return before - db.exam.flags.length;
  }

  /* ---------- v3.0 增量 B：学习节律摘要（纯读） ----------
   * 目标：把「活跃」从单一的连续天数，扩到近 N 天的有效学习日占比与间隔。
   * 使用条件：「学习统计」页渲染时调用；无副作用。
   * ------------------------------------------------------ */

  /**
   * 近 N 个自然日的学习节律摘要（纯读 db.days，不写任何字段）。
   * 输入：db；opts = {windowDays=28, minAnswers=1, at}
   * 输出：{windowDays, activeDays, emptyDays, ratio, medianGap, longestGap, activeKeys}
   *       activeDays：当日 total >= minAnswers 的天数
   *       emptyDays ：存在 days[dk] 键但 total=0 的天数（打开未学习）
   *       ratio     ：activeDays / windowDays（0..1）
   *       medianGap ：相邻有效学习日间隔天数中位数（不足 2 个有效日为 0）
   *       longestGap：窗口内最长连续无有效学习天数（含窗口首尾）
   * 边界：db/db.days 缺失或全无记录 → activeDays=0、ratio=0、medianGap=0、
   *       longestGap=windowDays；只按 db.days[dk].total 判定，与 planTarget 无关；
   *       窗口外日期一律忽略；返回 activeKeys 为新数组，不暴露内部引用。
   */
  function rhythmSummary(db, opts) {
    opts = opts || {};
    var win = Math.max(1, Math.floor(optNum(opts.windowDays, 28)));
    var minA = Math.max(1, Math.floor(optNum(opts.minAnswers, 1)));
    var at = optNum(opts.at, now());
    var days = (db && db.days) || {};
    var activeKeys = [], emptyDays = 0, longest = 0, run = 0;
    for (var i = win - 1; i >= 0; i--) {
      var dk = dayKey(at - i * DAY_MS);
      var d = days[dk];
      var total = d && d.total ? d.total : 0;
      if (total >= minA) {
        activeKeys.push(dk);
        if (run > longest) { longest = run; }
        run = 0;
      } else {
        // emptyDays 只记「存在日记录但 total=0」；有作答但未达 minAnswers 不计入
        if (d && !total) { emptyDays += 1; }
        run += 1;
      }
    }
    if (run > longest) { longest = run; }
    var gaps = [];
    for (var j = 1; j < activeKeys.length; j++) {
      var a = new Date(activeKeys[j - 1] + 'T00:00:00').getTime();
      var b = new Date(activeKeys[j] + 'T00:00:00').getTime();
      gaps.push(Math.round((b - a) / DAY_MS));
    }
    gaps.sort(function (x, y) { return x - y; });
    var median = 0;
    if (gaps.length) {
      var mid = Math.floor(gaps.length / 2);
      median = gaps.length % 2 ? gaps[mid] : Math.round((gaps[mid - 1] + gaps[mid]) / 2);
    }
    return {
      windowDays: win,
      activeDays: activeKeys.length,
      emptyDays: emptyDays,
      ratio: activeKeys.length / win,
      medianGap: median,
      longestGap: longest,
      activeKeys: activeKeys
    };
  }

  /* ---------- v3.0 第二批 D：抽测记录（纯读） ----------
   * 目标：让已落库的 db.exam.records 可见，形成「效果的痕迹」。
   * 使用条件：学习统计页；无记录时不展示入口。
   * ------------------------------------------------------ */

  /**
   * 抽测历史（规范化副本，纯读）。
   * 输入：db；opts = {limit=10}
   * 输出：Array<{id, at, dateKey, size, correct, weakCount}>，按落库顺序（新→旧）
   * 边界：db / db.exam 缺失、records 非数组 → []；单条字段异常按 0/'' 兜底；
   *       limit 收敛到 [1, EXAM_DEFAULTS.keepRecords]；不含 items 逐题明细；
   *       返回新对象数组，调用方修改不影响库。
   */
  function examHistory(db, opts) {
    opts = opts || {};
    var limit = Math.max(1, Math.floor(optNum(opts.limit, EXAM_DEFAULTS.keepRecords)));
    if (limit > EXAM_DEFAULTS.keepRecords) { limit = EXAM_DEFAULTS.keepRecords; }
    var raw = (db && db.exam && Array.isArray(db.exam.records)) ? db.exam.records : [];
    return raw.slice(0, limit).map(function (r) {
      r = r || {};
      var at = typeof r.at === 'number' ? r.at : 0;
      var size = typeof r.size === 'number' ? r.size : (Array.isArray(r.items) ? r.items.length : 0);
      var correct = typeof r.correct === 'number' ? r.correct : 0;
      var weak = Array.isArray(r.weakKeys) ? r.weakKeys.length : Math.max(0, size - correct);
      return {
        id: String(r.id || ''),
        at: at,
        dateKey: at ? dayKey(at) : '',
        size: size,
        correct: correct,
        weakCount: weak
      };
    });
  }

  /* ---------- v3.0 第二批 E：装订凭据（本机，纯加法） ----------
   * 目标：把「已掌握」的累积变成本机可留存、可随备份带走的事实。
   * 使用条件：已掌握页数达到下一个 50 的倍数，且已有一次完整抽测结论；
   *           打开「学习统计」页时结算，其余页面不触发。
   * 兼容约束：只写新增的 db.binding；不动 db.words / db.exam / db.days / settings。
   * ------------------------------------------------------------ */

  var BINDING_STEP = 50;

  /** 当前已掌握页数（与 examPool 同口径，纯读）。 */
  function masteredPages(db) { return examPool(db).length; }

  /**
   * 凭据进度（纯读）。
   * 输入：db
   * 输出：{mastered, step, issuedCount, maxNo, totalPages, nextNo, needed, canIssue}
   *       needed = nextNo * 50；canIssue = 有抽测结论且 mastered >= needed
   * 边界：db.binding 缺失/字段异常按默认兜底；maxNo 取 issued 与 issuedNoMax 的
   *       较大值，因此删除单张凭据后不会重发同编号；totalPages 单调不回退。
   */
  function bindingProgress(db) {
    var mastered = masteredPages(db);
    var b = (db && db.binding) || {};
    var issued = Array.isArray(b.issued) ? b.issued : [];
    var totalPages = safeNonNeg(b.totalPages);
    var issuedNoMax = safeNonNeg(b.issuedNoMax);
    var maxNo = issuedNoMax;
    issued.forEach(function (x) {
      if (x && typeof x.no === 'number' && x.no > maxNo) { maxNo = x.no; }
    });
    var nextNo = maxNo + 1;
    var needed = nextNo * BINDING_STEP;
    var hasExam = !!(db && db.exam && Array.isArray(db.exam.records) && db.exam.records.length);
    return {
      mastered: mastered,
      step: BINDING_STEP,
      issuedCount: issued.length,
      maxNo: maxNo,
      totalPages: totalPages,
      nextNo: nextNo,
      needed: needed,
      canIssue: hasExam && mastered >= needed
    };
  }

  /**
   * 结算凭据（唯一写 db.binding 的入口）。
   * 输入：db；opts = {at}
   * 输出：{created:Array<Object>, totalPages, nextNo}
   * 边界：
   *   - 无抽测结论 / 未达门槛 → created=[]，仅把 totalPages 单调更新，不生成
   *   - 每次最多生成 1 张（跳号由后续访问逐张补齐），不批量补历史缺口
   *   - totalPages 单调（取 max(已存, 当前已掌握)），不因回落、删除而减少
   *   - issuedNoMax 单调推进，删除凭据后不重发同编号
   *   - 凭据只存计数类字段（编号/日期/页数/最近抽测页数），无百分比、无评价
   *   - db.binding 缺失或字段类型异常时自动补齐；不写 db.exam
   */
  function syncBinding(db, opts) {
    opts = opts || {};
    var at = optNum(opts.at, now());
    if (!db) { return { created: [], totalPages: 0, nextNo: 1 }; }
    if (!db.binding) { db.binding = { totalPages: 0, issued: [], issuedNoMax: 0 }; }
    if (!Array.isArray(db.binding.issued)) { db.binding.issued = []; }
    db.binding.totalPages = safeNonNeg(db.binding.totalPages);
    db.binding.issuedNoMax = safeNonNeg(db.binding.issuedNoMax);

    var mastered = masteredPages(db);
    if (mastered > db.binding.totalPages) { db.binding.totalPages = mastered; }
    var p = bindingProgress(db);
    if (!p.canIssue) { return { created: [], totalPages: db.binding.totalPages, nextNo: p.nextNo }; }

    var lastExam = (db.exam && db.exam.records && db.exam.records[0]) || {};
    var item = {
      no: p.nextNo,
      at: at,
      pages: db.binding.totalPages,
      examAt: typeof lastExam.at === 'number' ? lastExam.at : 0,
      examSize: typeof lastExam.size === 'number' ? lastExam.size : 0,
      examKept: typeof lastExam.correct === 'number' ? lastExam.correct : 0
    };
    db.binding.issued.unshift(item);
    db.binding.issuedNoMax = p.nextNo;
    return { created: [item], totalPages: db.binding.totalPages, nextNo: p.nextNo };
  }

  /**
   * 本机删除单张凭据（只改 db.binding.issued）。
   * 输入：db；no = 编号；输出：被删除条数
   * 边界：db.binding 缺失/issued 非数组 → 0；no 不存在 → 0；
   *       不回退 totalPages、不回退 issuedNoMax（因此不重发同编号）。
   */
  function deleteBinding(db, no) {
    if (!db || !db.binding || !Array.isArray(db.binding.issued)) { return 0; }
    var before = db.binding.issued.length;
    db.binding.issued = db.binding.issued.filter(function (x) { return !x || x.no !== no; });
    return before - db.binding.issued.length;
  }

  /* ---------- v3.0 第二批 F：星标词（纯读） ----------
   * 目标：让「星标」从被动筛选标记变成可一键进入的精学动作。
   * 使用条件：存在星标词；复用既有 #/study?scope=star&mode=type，不改学习流程。
   * -------------------------------------------------- */

  /**
   * 星标词 key 列表（纯读，稳定排序）。
   * 输入：db；输出：Array<string>
   * 边界：db / db.words 缺失 → []；star 非真值一律排除；
   *       返回新数组，调用方修改不影响库。
   */
  function starredKeys(db) {
    if (!db || !db.words) { return []; }
    return Object.keys(db.words).filter(function (k) {
      return !!(db.words[k] && db.words[k].star);
    }).sort();
  }

  /* ---------- #016 义项提示增强 · 纯函数（无 DOM / 不改入参 / 无随机） ----------
   * 依 docs/design-senses.md §2：sensesOf / pickSense / gradeSense。
   * 义项只从 t 实时派生，不写 db；选中义项仅存会话内存（G4）。
   * 确定性：pickSense 种子由调用方显式传入，内部不读 now()、无 Math.random。
   * ---------------------------------------------------------------- */
  /** 词性标签 token；斜杠组合（如 v./n.、a./ad.）视为一个标签，不拆义项。 */
  var SENSE_POS_TOKEN = '(?:adj|adv|prep|conj|pron|num|art|int|vi|vt|ad|n|v|a)\\.';
  var SENSE_POS_COMBO = SENSE_POS_TOKEN + '(?:\\s*\\/\\s*' + SENSE_POS_TOKEN + ')*';
  var SENSE_POS_ANY = new RegExp('(' + SENSE_POS_COMBO + ')', 'g'); // 段中/段尾词性标签（捕获组1=标签）
  var SENSE_POS_TEST = new RegExp(SENSE_POS_COMBO);        // 是否含词性标签（无 g，test 无状态）
  var SENSE_POS_LEAD = new RegExp('^(' + SENSE_POS_COMBO + ')\\s*([\\s\\S]*)$');
  var SENSE_MAX = 200; // 超长 t 的确定性输出上限（防御性，正常词条远低于此）

  /**
   * P1 · sensesOf(entry) —— 义项解析（纯）。
   * 切分：全角 ； 优先（半角 ; 兜底）→ 词性标签段首归属 / 沿用 / 中途切换 →
   *       仅当整串无 ；且无词性标签时，/ 降级为义项分隔符；全角 ， 永不切义项。
   * 输出保序、元素 text 去掉前导词性并 trim、pos 缺省时省略；t 非串/空 → [{text:''}]。
   */
  function sensesOf(entry) {
    var raw = (entry && typeof entry === 'object') ? entry.t : (typeof entry === 'string' ? entry : null);
    if (typeof raw !== 'string' || !raw.trim()) { return [{ text: '' }]; }
    var str = raw.trim();
    var hasSemi = /[；;]/.test(str);
    var hasPos = SENSE_POS_TEST.test(str);
    var segments = (!hasSemi && !hasPos && str.indexOf('/') >= 0)
      ? str.split('/')
      : str.split(/[；;]/);

    var senses = [];
    var currentPos = '';
    for (var si = 0; si < segments.length; si++) {
      var seg = segments[si].trim();
      if (!seg) { continue; }
      var lead = seg.match(SENSE_POS_LEAD);
      if (lead) {
        currentPos = lead[1];
        seg = lead[2].trim();
        if (!seg) { continue; } // 只有词性标签、无释义 → 不产生义项
      }
      var before = '', tail = '', last = 0, mm;
      SENSE_POS_ANY.lastIndex = 0;
      while ((mm = SENSE_POS_ANY.exec(seg)) !== null) {
        before = seg.slice(last, mm.index).trim();
        if (before) {
          senses.push(currentPos ? { text: before, pos: currentPos } : { text: before });
          if (senses.length >= SENSE_MAX) { return senses; }
        }
        currentPos = mm[1]; // 中途出现的词性标签触发新义项并切换 pos
        last = mm.index + mm[0].length;
      }
      tail = seg.slice(last).trim();
      if (tail) {
        senses.push(currentPos ? { text: tail, pos: currentPos } : { text: tail });
        if (senses.length >= SENSE_MAX) { return senses; }
      }
    }
    return senses.length ? senses : [{ text: '' }];
  }

  /**
   * P2 · pickSense(senses, seed) —— 抽义项（纯、确定性）。
   * seed 由调用方显式传（推荐 dateKey + wordKey）；字符串按 startExam 同款
   * charCode 哈希（h*31+c）+ xorshift32 归一化，返回 [0, len-1] 内整数。
   */
  function pickSense(senses, seed) {
    if (!Array.isArray(senses) || senses.length === 0) { return 0; }
    var s0;
    if (typeof seed === 'string') {
      s0 = 0;
      for (var i = 0; i < seed.length; i++) { s0 = (s0 * 31 + seed.charCodeAt(i)) >>> 0; }
    } else if (typeof seed === 'number' && isFinite(seed)) {
      s0 = seed;
    } else {
      s0 = 1;
    }
    var s = (s0 >>> 0) || 1;
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17; s ^= s << 5; s >>>= 0;
    var idx = Math.floor((s / 4294967296) * senses.length);
    if (!isFinite(idx)) { idx = 0; }
    return Math.max(0, Math.min(senses.length - 1, idx));
  }

  /**
   * P3 · gradeSense(entry, senseIdx, answer) —— 按义项判定（纯，不写 db）。
   * 维持「看义项提示 → 写英文词」方向：expected = norm(entry.w)（与 gradeExam 同款）。
   * 结果绑定所选义项 senseIdx/senseText；越界 idx 钳到合法范围，不写真源。
   */
  function gradeSense(entry, senseIdx, answer) {
    var senses = sensesOf(entry);
    var idx = (typeof senseIdx === 'number' && isFinite(senseIdx)) ? Math.floor(senseIdx) : 0;
    idx = Math.max(0, Math.min(senses.length - 1, idx));
    var sense = senses[idx] || { text: '' };
    var expected = norm(entry && typeof entry === 'object' ? entry.w : '');
    var ok = !!(typeof answer === 'string' && answer && norm(answer) === expected && expected !== '');
    return { ok: ok, senseIdx: idx, senseText: sense.text, expected: expected };
  }

  /**
   * P5 · gradeCtx(entry, answer) —— #026 例句语境练习判定（D-051/D-052，纯，不写 db）。
   * 单答案口径（D-052 终审）：ok = norm(answer) === norm(entry.w)。无 surface 参数、
   * 无双答案、无词干化/编辑距离；进入 ctx 题面的词由 ctxPrompt 词边界检测保证例句含独立原形。
   * 签名不含 db，从类型上杜绝误写 SRS（对齐 #025 challengeGrade 做法）。
   */
  function gradeCtx(entry, answer) {
    var expected = norm(entry && typeof entry === 'object' ? entry.w : '');
    var ok = !!(typeof answer === 'string' && answer && norm(answer) === expected && expected !== '');
    return { ok: ok, expected: expected };
  }

  /**
   * #027 长期答对情况（D-054/D-055；G2 契约 v1.0）：**只读纯函数**——只读 db.words[*].evts，
   * 不写 db、不调任何写函数、不新增 db 键、不读 db.exam；不读 now() → 同 db 两次调用必深度相等。
   * 口径：相邻事件对 (e_i, e_{i+1})，起点须 know 且间隔 >= 窗口天数（毫秒差，不跨事件累加）；
   *       每词一票、取**最近一次**合格观察；无合格观察的 know 词计入 pending（单位＝词，不入分母）。
   */
  var RETENTION_MIN_SAMPLES = 10;

  function retentionStats(db, opts) {
    var days = 30;
    if (opts && typeof opts === 'object') {
      var d = opts.days;
      if (typeof d === 'number' && isFinite(d) && d > 0) { days = Math.floor(d); }
    }
    var windowMs = days * DAY_MS;
    var out = {
      window: days, samples: 0, retained: 0, lost: 0, pending: 0,
      rate: null, ratePct: null, state: 'empty'
    };
    var words = (db && typeof db === 'object' && db.words && typeof db.words === 'object') ? db.words : null;
    if (!words) { return out; }
    var keys = Object.keys(words);
    for (var i = 0; i < keys.length; i++) {
      var rec = words[keys[i]];
      if (!rec || typeof rec !== 'object') { continue; }
      var raw = rec.evts;
      if (!Array.isArray(raw) || !raw.length) { continue; }
      // 清洗：剔除非对象与脏 t（NaN/Infinity/非数字）；脏事件不参与判定、不打断相邻关系
      var evs = [];
      for (var j = 0; j < raw.length; j++) {
        var e = raw[j];
        if (!e || typeof e !== 'object') { continue; }
        if (typeof e.t !== 'number' || !isFinite(e.t)) { continue; }
        evs.push(e);
      }
      if (!evs.length) { continue; }
      evs.sort(function (a, b) { return a.t - b.t; });   // ES2019 起稳定：同一 t 保持原写入序
      var hasKnow = false;
      for (var k = 0; k < evs.length; k++) { if (evs[k].rating === 'know') { hasKnow = true; break; } }
      if (!hasKnow) { continue; }                        // 从未 know 过的词不在观察总体
      // 相邻对里找合格观察；按起点 t 升序遍历 → 最后一次命中即「最近一次」
      var obs = null;
      for (var m = 0; m < evs.length - 1; m++) {
        var a = evs[m], b = evs[m + 1];
        if (a.rating !== 'know') { continue; }
        if (b.t - a.t >= windowMs) { obs = b.rating === 'know'; }
      }
      if (obs === null) { out.pending += 1; continue; }  // 未到观察期：不入分母
      out.samples += 1;
      if (obs) { out.retained += 1; } else { out.lost += 1; }
    }
    if (out.samples > 0) {
      out.rate = out.retained / out.samples;              // 未取整原始值（UI 判 <1% 用它）
      out.ratePct = Math.round(out.rate * 100);
      out.state = out.samples < RETENTION_MIN_SAMPLES ? 'insufficient' : 'ok';
    }
    return out;
  }

  /* ---------- 导出 API ---------- */

  /* ---------- #025 今日挑战 · 纯函数（D-048/D-049；G2 契约 v1.1） ----------
   * 约束：只判对错，不写 SRS（不调 rateWord，不碰 lvl/due/st/wrong/evts）；
   *      无 Math.random（同 seed 同输出）；无 DOM；不新增路由；不产文案。
   * ---------------------------------------------------------------- */
  var CHALLENGE_DEFAULTS = { size: 5, optionCount: 4, optionMin: 2 };

  function challengeEndOfDay(ts) {
    var d = new Date(ts);
    d.setHours(23, 59, 59, 999);
    return d.getTime();
  }

  function challengeHash(str) {
    var s = 0;
    for (var i = 0; i < str.length; i++) { s = (s * 31 + str.charCodeAt(i)) >>> 0; }
    return s || 1;
  }

  function challengeShuffle(arr, seed) {
    var a = arr.slice();
    var s = (seed >>> 0) || 1;
    for (var i = a.length - 1; i > 0; i--) {
      s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
      var j = s % (i + 1);
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function isDayKeyStr(str) {
    if (typeof str !== 'string' || str.length !== 10) { return false; }
    if (str.charAt(4) !== '-' || str.charAt(7) !== '-') { return false; }
    for (var i = 0; i < 10; i++) {
      if (i === 4 || i === 7) { continue; }
      var c = str.charCodeAt(i);
      if (c < 48 || c > 57) { return false; }
    }
    return true;
  }

  /** 全库可用词条（按 norm(w) 去重；w 与首义项文本均非空）；顺序＝书序＋书内序，确定性 */
  function challengeEntries(db) {
    var out = [], seen = {};
    var books = allBooks(db);
    for (var i = 0; i < books.length; i++) {
      var ws = (books[i] && books[i].words) || [];
      for (var j = 0; j < ws.length; j++) {
        var e = ws[j];
        if (!e || !e.w) { continue; }
        var k = norm(e.w);
        if (seen[k]) { continue; }
        var senses = sensesOf(e);
        if (!senses.length || !senses[0].text) { continue; }
        seen[k] = 1;
        out.push({ key: wordKey(e.w), entry: e });
      }
    }
    return out;
  }

  /** 一次构建的索引（G10 F03：原实现对每个候选都重建全库，460 词时 challengeState 约 238ms） */
  function challengeIndex(db) {
    var list = challengeEntries(db);
    var map = {};
    for (var i = 0; i < list.length; i++) { map[norm(list[i].entry.w)] = list[i].entry; }
    return { list: list, map: map, capacity: list.length };
  }

  function challengeKeyWord(key) {
    var raw = String(key == null ? '' : key);
    return norm(raw.indexOf('w::') === 0 ? raw.slice(3) : raw);
  }

  function challengeEntryOf(db, key) {
    var map = challengeIndex(db).map;
    return map[challengeKeyWord(key)] || null;
  }

  /**
   * challengePool(db, at) —— 今日送分池 =（到期 ∪ 错词）∩ reps>0 ∩ 未毕业 ∩ 有释义。
   * 到期口径复用 dueOfWord（含强度层逐词接管），不另写 due 比较；上限到「当日 23:59:59.999」。
   * 返回 total＝三重排除后未截断的候选数（G2 v1.1 I5 的 poolSize 口径），size＝min(5,total)。
   */
  function challengePool(db, at) {
    var ts = (typeof at === 'number' && isFinite(at)) ? at : now();
    var end = challengeEndOfDay(ts);
    var idx = challengeIndex(db);
    var seen = {}, cands = [];
    function consider(k, rec) {
      if (!k || seen[k] || !rec) { return; }
      if (!(rec.reps > 0) || rec.graduated) { return; }
      var e = idx.map[challengeKeyWord(k)];
      if (!e) { return; }
      var senses = sensesOf(e);
      if (!senses.length || !senses[0].text) { return; }
      seen[k] = 1;
      cands.push(k);
    }
    var recKeys = Object.keys(db.words || {}).sort();
    for (var i = 0; i < recKeys.length; i++) {
      var rec = db.words[recKeys[i]];
      var due = dueOfWord(db, rec);
      if (due > 0 && due <= end) { consider(recKeys[i], rec); }
    }
    var wrongKeys = wrongRecords(db).map(function (r) { return wordKey(r.w); }).sort();
    for (var j = 0; j < wrongKeys.length; j++) { consider(wrongKeys[j], db.words[wrongKeys[j]]); }
    if (!cands.length) { return { ok: false, keys: [], total: 0, size: 0, capacity: idx.capacity, reason: 'empty' }; }
    var dk = dayKey(ts);
    var picked = challengeShuffle(cands, challengeHash(dk + ':pool'))
      .slice(0, CHALLENGE_DEFAULTS.size).sort();
    return { ok: true, keys: picked, total: cands.length, size: picked.length, capacity: idx.capacity, reason: '' };
  }

  /** challengeState(db, at) —— 首页卡唯一门面；mode 优先级 done > empty > not-enough > ready */
  function challengeState(db, at) {
    var ts = (typeof at === 'number' && isFinite(at)) ? at : now();
    var dk = dayKey(ts);
    var c = (db && db.challenge) ? db.challenge : null;
    var recSize = (c && typeof c.size === 'number' && isFinite(c.size) && c.size > 0) ? Math.floor(c.size) : 0;
    var played = !!(c && c.dateKey === dk && recSize >= 1);
    var pool = challengePool(db, ts);
    var cap = pool.capacity;
    var mode = played ? 'done' : (pool.total === 0 ? 'empty' : (cap < CHALLENGE_DEFAULTS.optionMin ? 'not-enough' : 'ready'));
    return {
      dateKey: dk,
      played: played,
      size: played ? recSize : pool.size,
      // G2 D6：未玩时不暴露跨日残留的 doneAt
      doneAt: (played && c && typeof c.doneAt === 'number') ? c.doneAt : 0,
      mode: mode,
      poolSize: pool.total,
      optionCapacity: cap
    };
  }

  /** challengeStart(db, at) —— 开局；dateKey 在此算一次并随会话传递（I3），不回放题面 */
  function challengeStart(db, at) {
    var ts = (typeof at === 'number' && isFinite(at)) ? at : now();
    var st = challengeState(db, ts);
    var base = { dateKey: st.dateKey, size: 0, keys: [], replayed: false, record: null, reason: '' };
    if (st.played) {
      base.ok = true; base.replayed = true; base.size = st.size; base.record = db.challenge;
      return base;
    }
    if (st.mode === 'empty' || st.mode === 'not-enough') {
      base.ok = false; base.reason = st.mode;
      return base;
    }
    var pool = challengePool(db, ts);
    if (!pool.ok) { base.ok = false; base.reason = pool.reason || 'empty'; return base; }
    base.ok = true; base.size = pool.size; base.keys = pool.keys;
    return base;
  }

  /** challengeQuestion(db, key, dateKey) —— 造 1 题：中文义项 → 4 选 1（容量不足降为 3/2 项） */
  function challengeQuestion(db, key, dateKey) {
    var idx = challengeIndex(db);
    var entry = idx.map[challengeKeyWord(key)];
    if (!entry) { return null; }
    var senses = sensesOf(entry);
    var seedStr = String(dateKey == null ? '' : dateKey) + String(key == null ? '' : key);
    var senseIdx = pickSense(senses, seedStr);
    var prompt = (senses[senseIdx] && senses[senseIdx].text) || (senses[0] && senses[0].text) || '';
    if (!prompt) { return null; }
    var target = norm(entry.w);
    var cap = idx.list;
    if (cap.length < CHALLENGE_DEFAULTS.optionMin) { return null; }
    var distractors = [];
    for (var i = 0; i < cap.length; i++) {
      var e = cap[i].entry;
      if (norm(e.w) === target) { continue; }
      if (sensesOf(e)[0].text === prompt) { continue; }
      distractors.push(e.w);
    }
    var total = Math.min(CHALLENGE_DEFAULTS.optionCount, cap.length);
    var need = Math.max(0, total - 1);
    var chosen = challengeShuffle(distractors, challengeHash(seedStr + ':d')).slice(0, need);
    var mixed = challengeShuffle([entry.w].concat(chosen), challengeHash(seedStr + ':o'));
    var options = mixed.map(function (w, idx) { return { i: idx, w: w }; });
    var answerIdx = -1;
    for (var k = 0; k < options.length; k++) {
      if (norm(options[k].w) === target) { answerIdx = k; break; }
    }
    if (answerIdx < 0) { return null; }
    return { key: wordKey(entry.w), w: entry.w, prompt: prompt, options: options, answerIdx: answerIdx, senseIdx: senseIdx };
  }

  /** challengeGrade(question, picked) —— 只判对错；签名不含 db，从类型上杜绝误写 SRS */
  function challengeGrade(question, picked) {
    var expectedWord = (question && question.w) ? question.w : '';
    var empty = { ok: false, pickedWord: '', expectedWord: expectedWord };
    if (!question || !Array.isArray(question.options) || !question.options.length) { return empty; }
    var idx = -1;
    // G2 D2：非整数下标一律判错（API 层防线；UI 只传整数）
    if (typeof picked === 'number' && isFinite(picked) && picked % 1 === 0) { idx = picked; }
    else if (typeof picked === 'string') {
      for (var i = 0; i < question.options.length; i++) {
        if (norm(question.options[i].w) === norm(picked)) { idx = i; break; }
      }
    }
    if (idx < 0 || idx >= question.options.length) { return empty; }
    var o = question.options[idx];
    return { ok: norm(o.w) === norm(question.w), pickedWord: o.w, expectedWord: question.w };
  }

  /** challengeSummarize(dateKey, size, results, at) —— 汇总三项事实（kept 恒 <= size；漏答计未对） */
  function challengeSummarize(dateKey, size, results, at) {
    var n = (typeof size === 'number' && isFinite(size) && size > 0) ? Math.floor(size) : 0;
    var list = Array.isArray(results) ? results : [];
    var kept = 0;
    for (var i = 0; i < list.length && i < n; i++) { if (list[i] && list[i].ok) { kept += 1; } }
    if (kept > n) { kept = n; }
    return {
      dateKey: String(dateKey == null ? '' : dateKey),
      size: n,
      kept: kept,
      doneAt: (typeof at === 'number' && isFinite(at)) ? at : now()
    };
  }

  /** commitChallenge(db, summary) —— 唯一写入口；整对象覆盖（同日重玩不累加），只写 db.challenge */
  function commitChallenge(db, summary) {
    if (!db || !summary || !isDayKeyStr(summary.dateKey)) { return null; }
    // G10 F04：形状合法不等于日期存在（'2026-13-45' 曾是漏网），再验月/日范围
    var yy = Number(summary.dateKey.slice(0, 4));
    var mm = Number(summary.dateKey.slice(5, 7));
    var dd = Number(summary.dateKey.slice(8, 10));
    // 用真实日历回验：'2026-02-30' 这类「形状合法、日期不存在」也必须拒绝（G10 P3）
    var probe = new Date(yy, mm - 1, dd);
    if (probe.getFullYear() !== yy || probe.getMonth() !== mm - 1 || probe.getDate() !== dd) { return null; }
    // 题数上限：超过当次默认 5 词即拒绝（防脏导入写出 size:999）
    if (!(typeof summary.size === 'number' && isFinite(summary.size)
      && summary.size >= 1 && summary.size <= CHALLENGE_DEFAULTS.size)) { return null; }
    var rec = {
      dateKey: summary.dateKey,
      size: Math.floor(summary.size),
      doneAt: (typeof summary.doneAt === 'number' && isFinite(summary.doneAt)) ? summary.doneAt : now()
    };
    db.challenge = rec;
    return rec;
  }

  /* ---------- #031 阶段一 · 遗忘曲线观测纯函数（D-065；只读、不改入参、不读 now） ---------- */

  /**
   * 摊平各词 s1[]：按词键字典序遍历，逐元素浅拷贝并注入词键 k（覆盖脏 k）。
   * 纯只读：不写 db、不原地改任何 s1 数组或元素；db/words 缺失或非对象 → []。
   */
  function collectS1Events(db) {
    var out = [];
    if (!db || typeof db !== 'object' || !db.words || typeof db.words !== 'object' || Array.isArray(db.words)) { return out; }
    var keys = Object.keys(db.words);
    for (var i = 0; i < keys.length; i++) {
      var rec = db.words[keys[i]];
      if (!rec || typeof rec !== 'object' || Array.isArray(rec)) { continue; }
      var arr = Array.isArray(rec.s1) ? rec.s1 : [];
      for (var j = 0; j < arr.length; j++) {
        var e = arr[j];
        var c = (e && typeof e === 'object') ? Object.assign({}, e) : {};
        c.k = keys[i];
        out.push(c);
      }
    }
    return out;
  }

  /**
   * 排定间隔（毫秒）→ 段名。首次作答恒 'new'；非有限/非正 → '10m'；
   * 否则按 round(ivl/DAY_MS) 归阶梯天段，非阶梯 → 'other'。
   */
  function intervalSeg(ivl, isFirst) {
    if (isFirst === true) { return INTERVAL_CONTRACT.newWord; }
    if (typeof ivl !== 'number' || !isFinite(ivl) || ivl <= 0) { return '10m'; }
    var d = Math.round(ivl / DAY_MS);
    if (d === 0) { return '10m'; }
    if (LADDER_DAYS.indexOf(d) >= 0) { return d + 'd'; }
    return 'other';
  }

  /**
   * 十段保持率基线：同词同段只取 at 最早一次；retrievedOk 非 boolean 整条跳过；
   * 空段 retained=null（非 0）。与 retentionStats「取最近一次」口径相反，互不包装。
   */
  function baselineReport(events) {
    var segs = INTERVAL_CONTRACT.segments;
    var stat = Object.create(null), seen = Object.create(null), i;
    for (i = 0; i < segs.length; i++) { stat[segs[i]] = { count: 0, retained: 0 }; }
    var arr = Array.isArray(events) ? events : [];
    var cleaned = [];
    for (i = 0; i < arr.length; i++) {
      var e = arr[i];
      if (!e || typeof e !== 'object') { continue; }
      if (typeof e.at !== 'number' || !isFinite(e.at)) { continue; }
      if (segs.indexOf(e.seg) < 0) { continue; }
      if (typeof e.retrievedOk !== 'boolean') { continue; }
      cleaned.push(e);
    }
    cleaned.sort(function (a, b) { return a.at - b.at; }); // ES2019 稳定排序；slice 语义已由 cleaned 保证不改入参
    for (i = 0; i < cleaned.length; i++) {
      var ev = cleaned[i];
      var k = (typeof ev.k === 'string') ? ev.k : '';
      var dedup = k + '|' + ev.seg;
      if (seen[dedup]) { continue; }
      seen[dedup] = true;
      stat[ev.seg].count += 1;
      if (ev.retrievedOk === true) { stat[ev.seg].retained += 1; }
    }
    var out = [];
    for (i = 0; i < segs.length; i++) {
      var s = stat[segs[i]];
      out.push({
        seg: segs[i],
        sampleSize: s.count,
        retainedCount: s.retained,
        retained: s.count > 0 ? s.retained / s.count : null
      });
    }
    return out;
  }

  /** 假认识候选：selfRating==='know' 且 retrievedOk===false（严格；D-069 与 rating 三值统一），只读不改词状态。 */
  function falseKnownCandidates(events) {
    var out = [];
    var arr = Array.isArray(events) ? events : [];
    for (var i = 0; i < arr.length; i++) {
      var e = arr[i];
      if (!e || typeof e !== 'object') { continue; }
      if (e.selfRating === 'know' && e.retrievedOk === false) {
        out.push({ k: e.k || '', at: e.at || 0, seg: e.seg || 'other' });
      }
    }
    return out;
  }

  /**
   * 到期队列快照：纯只读推导 due<=at && st!=='known' 的词键，字典序；
   * at 必填、不读 now()；非有限 at 按 0 处理（keys 必空）；不写 days、不参与 todayPlan。
   */
  function dueSnapshot(db, at) {
    var t = (typeof at === 'number' && isFinite(at)) ? at : 0;
    var out = { at: t, keys: [], count: 0 };
    if (!db || typeof db !== 'object' || !db.words || typeof db.words !== 'object' || Array.isArray(db.words)) { return out; }
    var keys = Object.keys(db.words);
    for (var i = 0; i < keys.length; i++) {
      var r = db.words[keys[i]];
      if (!r || typeof r !== 'object') { continue; }
      if (typeof r.due !== 'number' || !isFinite(r.due) || r.due <= 0 || r.due > t || r.st === 'known') { continue; }
      out.keys.push(keys[i]);
    }
    out.keys.sort();
    out.count = out.keys.length;
    return out;
  }

  var Core = {
    DB_KEY: DB_KEY,
    SCHEMA: SCHEMA,
    LADDER_DAYS: LADDER_DAYS,
    // #031 阶段一（D-065）：观测契约与 5 个纯函数（追加导出，既有导出零改动）
    INTERVAL_CONTRACT: INTERVAL_CONTRACT,
    collectS1Events: collectS1Events,
    intervalSeg: intervalSeg,
    baselineReport: baselineReport,
    falseKnownCandidates: falseKnownCandidates,
    dueSnapshot: dueSnapshot,
    DAY_MS: DAY_MS,
    SEC_PER_WORD: SEC_PER_WORD,
    STATUS_TEXT: STATUS_TEXT,
    now: now,
    norm: norm,
    wordKey: wordKey,
    dayKey: dayKey,
    clone: clone,
    defaultDB: defaultDB,
    defaultSettings: defaultSettings,
    newRecord: newRecord,
    ensureRecord: ensureRecord,
    statusOf: statusOf,
    rateWord: rateWord,
    undoRate: undoRate,
    todayPlan: todayPlan,
    computeDailyBudget: computeDailyBudget,
    // #005 T01/T02：N4 接线 + N2 阶梯 5 个纯函数（契约 §3.1，双暴露）
    minutesFreshCap: minutesFreshCap,
    resolveFreshTarget: resolveFreshTarget,
    weightedEstMinutes: weightedEstMinutes,
    resolveLadderMode: resolveLadderMode,
    previousMinuteOption: previousMinuteOption,
    goalBookKeys: goalBookKeys,
    buildPlan: buildPlan,
    detectReturn: detectReturn,
    updateLastSeen: updateLastSeen,
    buildRebuildPack: buildRebuildPack,
    selectBaselinePool: selectBaselinePool,
    scoreBaseline: scoreBaseline,
    baselineQuestionForLevel: baselineQuestionForLevel,
    applyGraduation: applyGraduation,
    dailyCompletionRate: dailyCompletionRate,
    weeklyRebalance: weeklyRebalance,
    computePlanTarget: computePlanTarget,
    planCardDailyFresh: planCardDailyFresh,
    injectWarmup: injectWarmup,
    // v3.0 增量（纯加法）
    EXAM_DEFAULTS: EXAM_DEFAULTS,
    examPool: examPool,
    examEligibility: examEligibility,
    startExam: startExam,
    gradeExam: gradeExam,
    commitExam: commitExam,
    pendingReviewKeys: pendingReviewKeys,
    markReviewed: markReviewed,
    rhythmSummary: rhythmSummary,
    // v3.0 第二批（纯加法）
    BINDING_STEP: BINDING_STEP,
    examHistory: examHistory,
    masteredPages: masteredPages,
    bindingProgress: bindingProgress,
    syncBinding: syncBinding,
    deleteBinding: deleteBinding,
    starredKeys: starredKeys,
    // #015 叠加式记忆强度引擎（纯函数，双暴露；不改暴露机制）
    strengthOf: strengthOf,
    strengthDue: strengthDue,
    // #025 今日挑战（纯函数；只判对错，不写 SRS）
    CHALLENGE_DEFAULTS: CHALLENGE_DEFAULTS,
    dueOfWord: dueOfWord,
    challengeState: challengeState,
    challengePool: challengePool,
    challengeStart: challengeStart,
    challengeQuestion: challengeQuestion,
    challengeGrade: challengeGrade,
    challengeSummarize: challengeSummarize,
    commitChallenge: commitChallenge,
    // #016 义项提示增强（纯函数，双暴露；不写真源）
    sensesOf: sensesOf,
    pickSense: pickSense,
    gradeSense: gradeSense,
    gradeCtx: gradeCtx,
    retentionStats: retentionStats,
    RETENTION_MIN_SAMPLES: RETENTION_MIN_SAMPLES,
    ensureSchema: ensureSchema,
    wrongRecords: wrongRecords,
    removeWrong: removeWrong,
    clearWrong: clearWrong,
    saveDB: saveDB,
    persistNow: persistNow,
    loadDB: loadDB,
    migrateOldKeys: migrateOldKeys,
    exportJSON: exportJSON,
    importJSON: importJSON,
    seedBooks: seedBooks,
    allBooks: allBooks,
    bookByKey: bookByKey,
    entriesOf: entriesOf,
    bookProgress: bookProgress,
    createCustomBook: createCustomBook,
    deleteCustomBook: deleteCustomBook,
    stats: stats,
    searchEntries: searchEntries
  };

  global.Core = Core;
  if (typeof module !== 'undefined' && module.exports) { module.exports = Core; }
})(typeof window !== 'undefined' ? window : globalThis);
