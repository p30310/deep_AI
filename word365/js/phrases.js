/* ============================================================
 * 背单词365 · phrases.js
 * 所有「逐字文案」与枚举中文映射常量。消除魔法字符串，便于审阅与一致性。
 * 浏览器暴露 window.PHRASES；Node 兼容 module.exports。
 * 文案逐字以 docs/design-phase1-p0.md / docs/prd-phase1-p0.md §4 为准。
 * ============================================================ */
(function (global) {
  'use strict';

  /** 考试类型枚举 → 中文标签（Open-1） */
  var GOAL_TYPES = [
    { key: 'cet46',  label: '四六级',     desc: '大学英语四六级考试' },
    { key: 'kaoyan', label: '考研',       desc: '全国硕士研究生招生考试' },
    { key: 'ielts',  label: '雅思',       desc: 'IELTS 留学/移民' },
    { key: 'toefl',  label: '托福',       desc: 'TOEFL 北美留学' },
    { key: 'job',    label: '职场求职',   desc: '工作常用英语' },
    { key: 'free',   label: '自由学习',   desc: '没有明确考试，长期积累' }
  ];

  /** 每日时长档位（Open-1） */
  var DAILY_MINUTE_OPTIONS = [10, 20, 30];

  /**
   * 首屏 / 计划页文案清单（PRD §4 逐字）。
   * 模板函数返回最终字符串，便于 app.js 直接渲染。
   */
  var HOME = {
    /** 条目 1：hero 标题 */
    heroTitleWithExam: function (daysLeft) { return '距考试 ' + daysLeft + ' 天 · 今日计划'; },
    heroTitleDefault: '今日计划',

    /** 条目 2：回归重建态 plan-nums */
    rebuildNums: function (n, m, spread) {
      return '今日重建任务 ' + n + ' 词 · 帮你重新排好，剩余 ' + m + ' 词分 ' + spread + ' 天消化';
    },

    /** 条目 3：回归主文案（逐字，Open-3 统一） */
    returnMain: '欢迎回来，帮你重新排好了，今天 18 分钟就能追上',

    /** 条目 4：首启主按钮 */
    startPlanCta: '花 3 分钟，定制你的计划',
    startLearn: '开始学习',

    /** 条目 6：熔断态 plan-nums */
    pauseNums: function (reviewCount) { return '复习 ' + reviewCount + '（新词暂停）'; },
    pauseText: '今天先把旧账清了，明天加新词',

    /** 正常态 plan-nums */
    normalNums: function (fresh, review, total) {
      return '新词 ' + fresh + ' + 复习 ' + review + '（计划总数 ' + total + '）';
    },

    /** 条目 7：六要素可解释计划卡（I-AC2） */
    planCard: function (p) {
      var daysText = p.daysLeft > 0 ? ('距考试 ' + p.daysLeft + ' 天') : '长期';
      return daysText + '，词库 ' + p.totalWords + ' 词，扣除已掌握约 ' + p.mastered +
        ' 词，需每日新学 ' + p.dailyFresh + ' 词 + 复习约 ' + p.dailyReview +
        ' 词，约 ' + p.estMinutes + ' 分钟';
    }
  };

  /** 引导 / 测试文案（Open-8 串联 I→J） */
  var ONBOARD = {
    title: '定制你的学习计划',
    stepLabels: ['目标', '截止', '时长', '测试'],
    step0Hint: '你想为什么目标学单词？',
    step1Hint: '你的考试（或目标）是什么时候？',
    step2Hint: '每天大概能花多少时间？',
    step3Hint: '最后做个 3 分钟小测试，帮你跳过已会的词',
    skip: '稍后再说',
    finish: '开始学习',
    warmup: '热身 · 已会',        // 缺口 C：首组信心热身词胶囊文案

    deadlineLongTerm: '长期（不设定日期）',
    testTitle: '词汇量小测试',
    testHint: '凭第一感觉选，答错也没关系',
    testProgress: function (i, total) { return '第 ' + i + ' / ' + total + ' 题'; },
    testDone: '测试完成',
    retest: '重做词汇量测试',
    feedbackTooEasy: '太简单了',
    feedbackTooHard: '太难了'
  };

  /** 再平衡提示（Open-5 / I-AC4 / 条目 8） */
  var REBALANCE = {
    lower: function (rate, newMin) {
      return '按当前节奏，考试前可覆盖 ' + Math.round(rate * 100) + '%，是否把每日时长调到 ' + newMin + ' 分钟？';
    },
    faster: function (ahead) { return '你比计划快 ' + ahead + ' 天'; },
    confirmLower: '已为你下调每日时长'
  };

  /** 设置项标题（T04 / Open-5） */
  var SETTINGS = {
    planSection: '计划与节奏',
    dailyMinutes: '每日可用时长',
    // T01（#005）：设置页副标题派生，替代 app.js:2082 写死的 '10 / 20 / 30 分钟'
    // 由 DAILY_MINUTE_OPTIONS 常量生成，集合变化（OP-01 本批不扩）时副标题自动同步。
    dailyMinutesSubtitle: function (opts) {
      return (opts || DAILY_MINUTE_OPTIONS).join(' / ') + ' 分钟';
    },
    returnDays: '回归保护触发天数',
    rebuildCap: '重建任务包上限',
    pressureThreshold: '压力熔断阈值（积压词数）',
    reviewRatio: '复习/新词配比',
    autoRebalance: '每周自动再平衡',
    redoGoal: '重做目标设置',
    // N2 默写阶梯开关标签（T01 #005 / N2L-AC01）
    ladderSection: '默写阶梯',
    ladderAuto: '自动',
    ladderManual: '手动'
  };

  /** 计划态枚举（todayPlan 返回 mode） */
  var PLAN_MODE = {
    NORMAL: 'normal',
    PAUSE: 'pause',
    REBUILD: 'rebuild',
    /** 缺口 A：计划原定值高于本机上限时的封顶说明小字 */
    capNote: function (planDaily, limit) {
      return '计划原定每日 ' + planDaily + ' 词，已按本机上限 ' + limit + ' 封顶';
    },
    // T01（#005 / N4W-AC11）：「当初答的时长」回显文案（goal.dailyMinutes 只读快照）
    goalMinutesLabel: '当初答的时长',
    goalMinutesText: function (x) { return '当初答的时长：' + x + ' 分钟'; }
  };

  /* ---------- N2 默写阶梯逐字文案（T01 #005 / N2L-AC01/03/04/09） ----------
   * 约束：只描述题型选择与提示开关，不评价、不催促。
   */
  var LADDER = {
    section: '默写阶梯',
    auto: '自动',
    manual: '手动',
    autoDesc: '复习时按记忆等级自动升级题型（再认 → 写出英文）',
    manualDesc: '沿用你选择的题型，不自动升级',
    hintLabel: '逐字母空格提示',     // 阶梯提示开关标签
    autoOnHint: '显示逐字母提示',
    autoOffHint: '不显示提示',
    switchToManual: '改用固定题型',
    switchToAuto: '恢复自动升级',
    modeChoiceLabel: '题型',
    emptyDayTitle: '空打开日'
  };

  /* ---------- v3.0 增量：已掌握词抽测（装订抽检）逐字文案 ----------
   * 约束：只写「书页状态的变化」，不出现得分 / 正确率 / 达标 / 鼓励句。
   */
  var EXAM = {
    sectionTitle: '已掌握词抽测',
    sectionHint: '从已掌握的词里随机抽 10 个默写英文，看看是不是真的会写。不改动学习进度。',
    start: '开始抽测',
    notReadyPool: function (n) { return '已掌握词满 ' + n + ' 个后可抽测'; },
    notReadyCooldown: function (d) { return '距下次抽测还有 ' + d + ' 天'; },
    modalTitle: '写出这一页',
    question: function (i, n, meaning) { return '第 ' + i + ' / ' + n + ' 页 · ' + meaning; },
    placeholder: '写下这个词的英文',
    submit: '下一页',
    quit: '先合上',
    quitHint: '中途合上不会记入结果，也不会消耗这次机会',
    resultAll: function (n) { return '这 ' + n + ' 页仍是已掌握'; },
    resultWeak: function (n) { return n + ' 页已回到待重读，已记在本周册页'; },
    review: '去复习',
    markReviewed: '标记已重读',
    close: '合上',
    pending: function (n) { return '待重读（' + n + '）'; },
    pendingEmpty: '暂无待重读的词',
    pendingTitle: '待重读的书页',
    detailTitle: '逐页看',
    itemKept: '仍是已掌握',
    itemWeak: '待重读',
    noMeaning: '（暂无释义）',
    markedToast: '已标记重读完成',
    quitToast: '已合上，这次不计入结果'
  };

  /* ---------- v3.0 增量：学习节律摘要逐字文案 ----------
   * 约束：陈述事实，不评价、不催促。
   */
  var RHYTHM = {
    title: '近 28 天学习节律',
    hint: '有作答即记为有效学习日；空打开日单列，不等于活跃。',
    labelActive: '有效学习日',
    labelEmpty: '空打开日',
    labelMedian: '间隔中位数（天）',
    labelLongest: '最长间隔（天）'
  };

  /* ---------- v3.0 第二批：抽测记录逐字文案 ----------
   * 约束：只陈述页数，不出现得分 / 正确率 / 达标 / 鼓励句。
   */
  var HISTORY = {
    title: '抽测记录',
    hint: '只陈述页数，不评分。',
    entry: function (n) { return '抽测记录（' + n + '）'; },
    row: function (dk, size, kept, weak) {
      return dk + ' · 抽看 ' + size + ' 页，' + kept + ' 页仍是已掌握，' + weak + ' 页待重读';
    },
    empty: '还没有抽测记录',
    close: '合上'
  };

  /* ---------- v3.0 第二批：装订凭据 / 星标精读逐字文案 ----------
   * 约束：凭据只记计数类事实；不生成图片、不分享、不评级。
   */
  var BINDING = {
    sectionTitle: '装订记录',
    hint: '每掌握 50 个词，且完成过一次抽测，就在这里留下一张本机凭据。只随备份带走，不生成图片、不分享。',
    progress: function (pages, needed) {
      return '已装订 ' + pages + ' 页 · 下一张在 ' + needed + ' 页';
    },
    noExam: '完成一次已掌握词抽测后可生成凭据',
    list: function (n) { return '查看凭据（' + n + '）'; },
    listTitle: '装订记录',
    empty: '还没有凭据',
    rowTitle: function (no) { return '第 ' + no + ' 张'; },
    rowDetail: function (pages, examSize, examKept) {
      return '已装订 ' + pages + ' 页 · 最近抽测 ' + examSize + ' 页，其中 ' + examKept + ' 页仍是已掌握';
    },
    date: function (dk) { return dk + ' 生成'; },
    del: '从本机删除',
    delToast: '已从本机删除这张记录',
    starTitle: '星标精读',
    starHint: '把加过星标的词用「写出英文」再过一遍。',
    star: function (n) { return '星标精读（' + n + '）'; },
    starEmpty: '还没有加星标的词',
    close: '合上'
  };

  /* ---------- #015 叠加式记忆强度引擎逐字文案（先落键，供后续只读展示引用） ----------
   * 约束：陈述事实、可解释；不出现百分比、不评价、不催促；强度只读，不改复习节奏。
   * 依 D-038 OP-03：本阶段不做独立 UI，此处仅落文案键，不预留页面/路由/控件钩子。
   */
  var STRENGTH = {
    section: '记忆强度',
    modeSection: '记忆强度叠加',
    modeOn: '开启',
    modeOff: '关闭',
    modeHint: '开启后按你的作答历史决定复习到期时间；关闭即回到固定复习阶梯。',
    levelHigh: '记得牢',
    levelMid: '在巩固',
    levelLow: '需多复习',
    basisEvents: '依据作答记录',
    basisLvlProxy: '依据当前等级',
    boardTitle: '记忆强度（只读）',
    boardHint: '强度按作答历史估计，只作查看，不改变复习安排。',
    boardCount: function (n) { return '已记录 ' + n + ' 次作答'; },
    /* #019 设置页开关（D-042）：状态/回退/风险/提示，逐字可测；阶梯数字由 Core.LADDER_DAYS 派生 */
    modeState: function (on) {
      return on ? '当前：已开启（逐词接管中）' : '当前：未开启（按固定阶梯）';
    },
    /* #020 逐词接管（D-043）：开启不会一次重算历史，从下次复习该词起接管 */
    takeover: function (done, pending) {
      return '已接管 ' + done + ' 词 · 待接管 ' + pending + ' 词';
    },
    modeFallback: function (days) {
      return '回退基线不变：固定阶梯 ' + days + ' 天永远可用，关闭即回到它。';
    },
    modeWarn: '开启不会改动已有到期：老词仍按原日期，直到你下次复习它才逐词接管。',
    modeToastOn: '已开启记忆强度叠加：到期按作答历史估计',
    modeToastOff: '已关闭：已回到固定复习阶梯'
  };

  /* ---------- #018 统计页入口卡逐字文案（D-041；G4 只读引用，不硬编码中文） ----------
   * 约束：陈述事实、不评价、不催促；仪表盘为只读视图，不改变复习安排。
   */
  var STRENGTH_ENTRY = {
    title: '记忆强度 · 遗忘曲线',
    hint: '把已学词按估计的保持率摊在一条曲线上，看遗忘风险落在哪一段。',
    open: '打开仪表盘',
    metricWords: '有作答记录',
    metricEvents: '累计作答',
    empty: '还没有作答记录：完成一次学习或复习后，这里开始积累。',
    note: '只读视图，按作答历史估计，不改变复习安排。'
  };

  /* ---------- #023 听写模式逐字文案（D-046）：与「写出英文」同一判定路径，只换提示方式 ---------- */
  /* ---------- #026 例句语境练习逐字文案（D-051/D-052；G1 PRD v1.1 §4 为唯一真源，5 键） ----------
   * 红线：无评分/正确率/达标/评级/分数语汇；反馈复用 type 既有文案，零新键。 */
  var CTX = {
    tab: '例句填空',
    ask: '写出例句空格处的单词（用原形）',
    hintLen: function (n) { return '原形 ' + n + ' 个字母 · 空格逐字母提示'; },
    placeholder: '写出原形',
    gapAria: '例句中的空格，缺一个单词'
  };

  /* ---------- #027 长期答对情况逐字文案（D-054/D-055；G1 PRD v1.2 + G0 D-055 终裁，8 键） ----------
   * 红线：零评价/零鼓励/零排名/零达标；禁把样本外推到用户整体（不写「你的记忆力」等）；
   * 命名禁与仪表盘「估计的保持率」混用（本段全文无「保持」二字）。
   * 副标拆三段（窗口段始终、样本段 M>0、缺口段 C>0），由视图层按状态条件拼接。 */
  var RETENTION = {
    title: '长期答对情况',
    lead: function (m, p) { return '已观察到的 ' + m + ' 个词里，有 ' + p + ' 在观察窗口过去后仍然答对。'; },
    leadInsufficient: function (m, min) { return '样本 ' + m + ' 个词，满 ' + min + ' 个才显示比例。'; },
    leadEmpty: function (n) { return '还没有可观察的复习：某个词隔 ' + n + ' 天以上再考一次、并且那一次也记下来，这里才会有数据。'; },
    subWindow: function (n) { return '窗口 ' + n + ' 天'; },
    subSample: function (m) { return '样本 ' + m + ' 个词'; },
    subPending: function (c) { return '另有 ' + c + ' 个词尚未到观察期，未计入分母'; },
    note: '只读统计，不改变复习安排；「模糊」和「不认识」都算未答对。'
  };

  var LISTEN = {
    tab: '听写',
    title: '听音写词',
    hint: '按 R 或点喇叭重听；写不出来可先看中文提示',
    replay: '重听',
    reveal: '看中文提示',
    placeholder: '听到什么写什么',
    noAudio: '本设备无法播放发音，可点「看中文提示」继续'
  };

  /* ---------- #025 今日挑战逐字文案（D-048；G1 PRD §5 为唯一真源，实现不得内联改字） ----------
   * 红线：无得分/正确率/达标/评级/分数；不催促、不评价；结果句必须带「学习进度没有改动」。
   */
  var CHALLENGE = {
    title: '今日挑战',
    sub: '5 个词，约 2 分钟。不改动学习进度。',
    subShort: function (n) { return '今天只有 ' + n + ' 个词可挑战'; },
    start: '开始挑战',
    done: function (n) { return '今天已完成 · ' + n + ' 个词'; },
    empty: '今天没有到期的词，也没有错词',
    emptyHint: '明天再来看看',
    notEnough: '词库可用词不足 2 个',
    qLabel: function (i, n) { return '第 ' + i + ' / ' + n + ' 题'; },
    ask: '选出下面释义对应的英文',
    optionAria: function (i, word) { return '选项 ' + i + '，' + word; },
    right: '选对了',
    rightDetail: function (word, meaning) { return word + ' · ' + meaning; },
    wrongDetail: function (word, meaning) { return '这个词是 ' + word + ' · ' + meaning; },
    next: '下一题',
    last: '看结果',
    quit: '先合上',
    quitHint: '中途合上不算今天完成，也不改动学习进度',
    quitToast: '已合上，这次不算今天完成',
    resultPart: function (n, k) {
      return '今天这 ' + n + ' 个词，' + k + ' 个选对，' + (n - k) + ' 个没选对。学习进度没有改动。';
    },
    resultAll: function (n) { return '今天这 ' + n + ' 个词都选对了。学习进度没有改动。'; },
    resultNone: function (n) { return '今天这 ' + n + ' 个词都没选对。学习进度没有改动。'; },
    close: '合上'
  };

  /* ---------- #016 义项提示增强逐字文案（先落键，供 G4 只读引用，不双写） ---------- */
  var SENSES = {
    noMeaning: '（暂无释义）',
    senseLabel: '义项',
    hintLabel: '本次义项：'
  };

  var PHRASES = {
    GOAL_TYPES: GOAL_TYPES,
    DAILY_MINUTE_OPTIONS: DAILY_MINUTE_OPTIONS,
    HOME: HOME,
    ONBOARD: ONBOARD,
    REBALANCE: REBALANCE,
    SETTINGS: SETTINGS,
    PLAN_MODE: PLAN_MODE,
    // T01（#005）：N2 默写阶梯逐字文案（N2L-AC01/03/04/09）
    LADDER: LADDER,
    // v3.0 增量（纯加法）
    EXAM: EXAM,
    RHYTHM: RHYTHM,
    // v3.0 第二批（纯加法）
    HISTORY: HISTORY,
    BINDING: BINDING,
    // #015 叠加式记忆强度引擎（纯加法，先落键）
    STRENGTH: STRENGTH,
    // #016 义项提示增强（纯加法，先落键）
    SENSES: SENSES,
    // #018 统计页入口卡（纯加法）
    STRENGTH_ENTRY: STRENGTH_ENTRY,
    // #023 听写模式（纯加法）
    LISTEN: LISTEN,
    RETENTION: RETENTION,
    CTX: CTX,
    // #025 今日挑战（纯加法）
    CHALLENGE: CHALLENGE
  };

  global.PHRASES = PHRASES;
  if (typeof module !== 'undefined' && module.exports) { module.exports = PHRASES; }
})(typeof window !== 'undefined' ? window : globalThis);
