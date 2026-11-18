# 背单词365 · 阶段一 P0 增量设计 + 任务分解

> 文档角色：架构师（高见远 / Gao）
> 上游：产品经理许清楚（PRD `docs/prd-phase1-p0.md`）；交付总监齐活林（拍板 8 个 Open 问题）
> 下游：工程师（实现 C/I/J + 首屏文案）→ QA（回归 + 新功能验证）
> **本文件只做设计，不修改任何源码。** 所有验收以 PRD 为权威，Open 问题以 team-lead 拍板为准。

---

## 0. 设计原则与红线

- 纯逻辑进 `core.js`（禁 DOM，`window.Core` + `module.exports` 双暴露，可 node 单测）；`app.js` 只做路由/视图/DOM 编排；数据文件 `js/data/*` **不动**（Open-2 复用内置 460 词）。
- **红线**：阶段一**不替换** `LADDER_DAYS` 固定阶梯；C/I/J 全为叠加层；不引入新词频字段（Open-6）。
- 现有 25 项单测（`tests/core.test.mjs`）+ 数据校验（`tests/check-data.mjs`）必须全过，作为每个任务的交付门禁。
- 改动定位：C/I/J 全部是**增量叠加**到现有 SRS 之上，`todayPlan` 与 `defaultDB` 仅做**加法**（新键、新分支），不改变既有默认路径的语义。

---

## 1. 改动文件清单

| 文件 | 改动性质 | 关键内容 |
|---|---|---|
| `js/core.js` | **改** | ① `defaultSettings()` 增 6 字段；② `defaultDB()` 增 `goal/plan/baseline/returnGuard/onboarding`；③ `newRecord()` 增 `graduated`；④ 新增 `ensureSchema()`；⑤ 改造 `todayPlan()`（rebuild/pause/normal 三态 + 7:3 + 排除 graduated + 写 `planTarget`）；⑥ 新增 12 个纯函数（见 §3）；⑦ `importJSON()` 末尾调用 `ensureSchema()`；⑧ 导出新增 API |
| `js/app.js` | **改** | ① 启动：`ensureSchema` + `updateLastSeen` 钩子；② `render()` 增 `onboard` 路由；③ `renderHome()` 重写（hero/plan-nums/回归重建区块/计划卡/主按钮/再平衡 toast）；④ `doRate/doRateTyped` 答后 `updateLastSeen`；⑤ 新增 `renderOnboard`（三问向导）、`renderBaselineTest`（自适应测试）、`renderPlanCard`、`showRebalanceToast`、`redoGoal`、重测/反馈入口；⑥ `renderMine()` 增设置项；⑦ `renderStats()` 增有效完成率趋势（Open-7，可选 P1） |
| `js/phrases.js` | **新** | 所有「逐字文案」与枚举中文映射常量（`window.PHRASES`），消除魔法字符串，便于审阅与一致性 |
| `css/app.css` | **改（增）** | onboarding 向导、基线测试进度、计划卡、重建区块、再平衡 toast/卡片样式；复用既有 `.seg/.btn`（44px 命中 + `:focus-visible` 已全局具备）；无障碍与 `prefers-reduced-motion` 已全局覆盖，仅补充新组件 |
| `index.html` | **不改** | onboarding / rebuild / plan-card / toast 全部渲染至既有 `#view` / `#modalRoot` / `#toast`，无需新增静态容器（已确认 `#view` 有 `aria-live="polite"`） |
| `tests/core.test.phase1.mjs` | **新** | 阶段一新增纯函数的单测（determineReturn / buildRebuildPack / scoreBaseline / buildPlan / computeDailyBudget / weeklyRebalance / applyGraduation / ensureSchema / todayPlan 三态），独立于既有 `core.test.mjs` |
| `js/data/*.js` | **不改** | Open-2 明确复用内置 460 词，分层抽样以「书顺序」作频率分层代理 |

---

## 2. db schema 新增字段（精确类型 + 默认值）

> 现有顶层键：`schema/createdAt/updatedAt/settings/petState/books/customBooks/words/days` —— 下列全部为**新增键，不与任何现有键冲突**（已逐键核对 `defaultDB`）。

### 2.1 顶层新增（写入 `w365.db`）

```js
// defaultDB() 内新增：
goal: {
  type: 'free',          // 枚举见 Open-1：'cet46'|'kaoyan'|'ielts'|'toefl'|'job'|'free'
  deadline: null,        // 目标日 00:00 的时间戳(ms)；free 型为 null（视为长期）
  dailyMinutes: 20,      // 10 | 20 | 30
  createdAt: 0           // 落库时间戳(ms)
},
plan: {
  derivedAt: 0,          // 推导时间戳(ms)，0 表示尚未生成
  totalWords: 0,         // 词库总量（按 goal.type 映射后的内置书并集）
  mastered: 0,           // 已掌握扣除数（graduated || st==='known'，限范围内）
  dailyFresh: 0,         // 每日新学数（推导值）
  dailyReview: 0,        // 每日复习数（推导值，7:3 互补）
  estMinutes: 0,         // 预计每日时长 = (dailyFresh+dailyReview)*SEC_PER_WORD/60
  daysLeft: 0            // 距目标天数；free 型置 0 哨兵，展示「长期」
},
baseline: {
  level: 0,              // 估计词汇量等级 = 内置词累计下标（0..460）
  testedAt: 0,           // 测试时间戳(ms)
  words: [],             // 已毕业词 key 列表（J-AC5 落库，便于迁移）
  reestimateAt: 0        // 下次重估时间戳(ms) = testedAt + 14*DAY
},
returnGuard: {
  lastSeen: '',          // 最近活跃日期 'YYYY-MM-DD'（Open-3 按自然日差判定）
  backlogCount: 0,       // 最近一次统计的积压词数（reps>0 && due<=now）
  rebuiltAt: '',         // 已触发重建包的日期 'YYYY-MM-DD'（同日去重，避免重复弹）
  rebuildWords: [],      // 当日重建包词 key 列表（重建态下今日计划即此包）
  spreadDays: 0          // 剩余积压平滑摊派天数（展示用，3..5）
},
onboarding: {
  step: 0,               // 向导进度 0..3
  completed: false,      // 三问+测试是否完成（Open-4）
  skipped: false,        // 是否「稍后」跳过（回退现状首页）
  completedAt: 0         // 完成时间戳(ms)；拍板 hint 未含，此处增补以便 I-AC1 追溯
}
```

### 2.2 `settings` 内扩展（不新增顶层键）

```js
// defaultSettings() 内新增（均不与现有 freshLimit/reviewLimit/accent/rate/theme/pet/autoNext/coachSeen 冲突）：
dailyMinutes: 20,        // 每日可用时长旋钮 10/20/30（Open-1 默认 20）
returnDays: 3,           // 回归保护触发天数阈值（Open-3 确认 = 3）
rebuildCap: 40,          // 重建任务包上限（Open-3 锁定 = 40）
reviewRatio: 0.7,        // 复习/新词配比，复习占 70%（C-AC5）
pressureThreshold: 50,   // 复习压力熔断阈值 = 积压阈值 N（Open-3 确认 = 50）
                         //   —— 同时用于：① 回归重建包触发（积压≥50 才重建，C-AC1）
                         //              ② 熔断暂停新词（积压≥50 即暂停新词，C-AC4）
autoRebalance: true      // 每周再平衡是否自动调量（Open-5 默认 true）
```

### 2.3 `word` record 内扩展

```js
// newRecord() 内新增：
graduated: false   // 方案 J 测试批量毕业标记（区别于 SRS 自然 st==='known'）；true 即从每日新词计划裁剪
```

### 2.4 `days[dayKey]` 内扩展

```js
// 生成当日计划时（todayPlan 内）写入；现有 days[dk] 仅有 total/correct/fresh/review：
planTarget: 0      // 当日计划任务总数（北极星「次日有效复习完成率」分母，Open-7）
```

**冲突核对结论**：所有新增键名在 `defaultDB` 现有结构中均不存在；`graduated` 不在 `newRecord` 现有 14 字段中；`planTarget` 不在 `days[dk]` 现有 4 字段中。**无冲突。**

---

## 3. core.js 具体改动点

### 3.1 常量与既有函数小改

- 新增常量 `SEC_PER_WORD = 35`（30–40 秒中值，I-AC3「任务词数 × 30–40 秒」的确定取值）。导出 `Core.SEC_PER_WORD`。
- `defaultSettings()`：补 §2.2 六个字段。
- `defaultDB()`：补 §2.1 五个顶层对象。
- `newRecord()`：补 `graduated: false`。
- `importJSON()`：在校验/补默认后、返回前调用 `ensureSchema(data)`（J-AC5 兼容旧备份）。
- 导出对象 `Core`：追加本节所有新函数名。

### 3.2 `ensureSchema(db)` —— 旧库/导入迁移（J-AC5）

```js
function ensureSchema(db) {
  if (!db) return db;
  if (!db.goal)        db.goal        = { type:'free', deadline:null, dailyMinutes:20, createdAt:0 };
  if (!db.plan)        db.plan        = { derivedAt:0, totalWords:0, mastered:0, dailyFresh:0, dailyReview:0, estMinutes:0, daysLeft:0 };
  if (!db.baseline)    db.baseline    = { level:0, testedAt:0, words:[], reestimateAt:0 };
  if (!db.returnGuard) db.returnGuard = { lastSeen:'', backlogCount:0, rebuiltAt:'', rebuildWords:[], spreadDays:0 };
  if (!db.onboarding)  db.onboarding  = { step:0, completed:false, skipped:false, completedAt:0 };
  var s = db.settings || (db.settings = defaultSettings());
  if (s.dailyMinutes==null)        s.dailyMinutes=20;
  if (s.returnDays==null)          s.returnDays=3;
  if (s.rebuildCap==null)          s.rebuildCap=40;
  if (s.reviewRatio==null)         s.reviewRatio=0.7;
  if (s.pressureThreshold==null)   s.pressureThreshold=50;
  if (s.autoRebalance==null)       s.autoRebalance=true;
  var keys = Object.keys(db.words||{});
  for (var i=0;i<keys.length;i++){ if (db.words[keys[i]].graduated==null) db.words[keys[i]].graduated=false; }
  return db;
}
```
幂等、加法式；旧 `schema:3` 备份（无上述键）导入后自动补齐 → 不破坏旧键格式（J-AC5）。

### 3.3 计划与配比

```js
// 由 settings（+ 可选的 plan.dailyFresh）推导每日预算
function computeDailyBudget(s, planDailyFresh) {
  var freshTarget = (planDailyFresh && planDailyFresh > s.freshLimit) ? planDailyFresh : s.freshLimit; // 考试冲刺可超过 freshLimit
  var reviewTarget = Math.round(freshTarget * s.reviewRatio / (1 - s.reviewRatio)); // 7:3 互补
  if (reviewTarget > s.reviewLimit) reviewTarget = s.reviewLimit;                   // reviewLimit 为硬上限
  return { freshTarget: freshTarget, reviewTarget: reviewTarget };
}
```

```js
// todayPlan 改造：三态 + 7:3 + 排除 graduated + 写 planTarget
// 返回 { reviews, freshs, mode, pausedFresh, planTarget, text, rebuildWords }
function todayPlan(db, records) {
  var s = db.settings, t = now(), dk = dayKey(t);
  var reviews, freshs, mode = 'normal', pausedFresh = false, text = '', rebuildWords = [];

  // —— 态 1：回归重建（仅当当日已决策 rebuiltAt===今天）——
  if (db.returnGuard.rebuiltAt === dk && db.returnGuard.rebuildWords.length) {
    var rset = {}; db.returnGuard.rebuildWords.forEach(function(k){ rset[k]=1; });
    rebuildWords = records.filter(function(r){ return rset[wordKey(r.w)]; });
    reviews = []; freshs = []; mode = 'rebuild'; pausedFresh = true;
    text = '欢迎回来，帮你重新排好了，今天 18 分钟就能追上';
  } else {
    // 积压（复习压力）= 到期且未毕业
    var backlog = records.filter(function(r){ return r.reps>0 && r.due>0 && r.due<=t && !r.graduated; });
    if (backlog.length >= s.pressureThreshold) {
      // —— 态 2：高压力熔断（非回归，仅暂停新词）——
      mode = 'pause'; pausedFresh = true;
      reviews = backlog.sort(function(a,b){return a.due-b.due;}).slice(0, s.reviewLimit);
      freshs = [];
      text = '今天先把旧账清了，明天加新词';
    } else {
      // —— 态 3：正常（7:3 配比，排除 graduated）——
      var bud = computeDailyBudget(s, db.plan && db.plan.derivedAt ? db.plan.dailyFresh : 0);
      var day = db.days[dk] || { fresh:0 };
      var freshQuota = Math.max(0, bud.freshTarget - (day.fresh||0));
      reviews = backlog.sort(function(a,b){return a.due-b.due;}).slice(0, bud.reviewTarget);
      freshs  = records.filter(function(r){ return r.reps===0 && !r.graduated; }).slice(0, freshQuota);
    }
  }
  var planTarget = reviews.length + freshs.length;
  if (!db.days[dk]) db.days[dk] = { total:0, correct:0, fresh:0, review:0 };
  db.days[dk].planTarget = planTarget;            // Open-7：生成当日计划时写入
  return { reviews:reviews, freshs:freshs, mode:mode, pausedFresh:pausedFresh, planTarget:planTarget, text:text, rebuildWords:rebuildWords };
}
```

> **既有单测保护**：默认/旧数据 `returnGuard.rebuiltAt=''` 且 `backlog<50` → 走态 3，且 `db.plan.derivedAt=0` → `freshTarget=freshLimit`，`reviewTarget=min(round(20*0.7/0.3),60)=47`。既有 `todayPlan` 相关测试（reviewLimit 设为 2/3）不受影响；仅默认复习上限由 60 收为 47（即 C-AC5 7:3 的落地，已预期）。`graduated` 默认 false → 不影响 freshs 选取。`planTarget` 写入为**加法键**。

### 3.4 回归保护与重建包

```js
// 纯函数：是否回归（基于「当前」lastSeen 与积压）
function detectReturn(db) {
  var s = db.settings, t = now();
  var backlog = 0, keys = Object.keys(db.words);
  for (var i=0;i<keys.length;i++){ var r=db.words[keys[i]]; if (r.reps>0 && r.due>0 && r.due<=t && !r.graduated) backlog++; }
  var last = db.returnGuard.lastSeen;
  var daysGap = 0;
  if (last) { daysGap = Math.floor((t - new Date(last+'T00:00:00').getTime()) / DAY_MS); }
  return { isReturn: (daysGap >= s.returnDays) && (backlog >= s.pressureThreshold), daysGap: daysGap, backlog: backlog };
}

// 更新 lastSeen + 积压计数；若为回归日，则一次性决策并持久化重建包（同日去重）
function updateLastSeen(db) {
  var dk = dayKey();
  var det = detectReturn(db);              // 用「旧」lastSeen 判定
  db.returnGuard.lastSeen = dk;
  db.returnGuard.backlogCount = det.backlog;
  if (det.isReturn) {
    var pack = buildRebuildPack(db, db.settings.rebuildCap);
    db.returnGuard.rebuildWords = pack.rebuildWords;
    db.returnGuard.rebuiltAt    = dk;
    db.returnGuard.spreadDays   = pack.spreadDays;
  }
  return det;
}

// Open-6 代理算法：记忆强度最低（lvl 低 + due 越紧迫优先）+ 考纲高频（cet4 加权）
// 返回 { rebuildWords:[key], remaining, spreadDays } —— 不写库（由 updateLastSeen / app 持久化）
function buildRebuildPack(db, cap) {
  cap = cap || db.settings.rebuildCap || 40;
  var t = now(), cand = [];
  var keys = Object.keys(db.words);
  for (var i=0;i<keys.length;i++){
    var r = db.words[keys[i]];
    if (r.reps>0 && r.due>0 && r.due<=t && !r.graduated) {
      var strength = (3 - r.lvl);                       // 记忆强度最低代理：lvl 越低分越高
      if (r.srcBook === 'cet4') strength -= 1.5;        // 考纲高频加权（cet4 优先级提升）
      cand.push({ key: keys[i], score: strength, due: r.due });
    }
  }
  cand.sort(function(a,b){ return (b.score-a.score) || (a.due-b.due); }); // 强度降序，同档 due 升序（越逾期越前）
  var pick = cand.slice(0, cap);
  var remaining = Math.max(0, cand.length - pick.length);
  var avgDaily = db.settings.reviewLimit || 60;
  var spreadDays = Math.min(5, Math.max(3, Math.ceil(remaining / Math.max(1, avgDaily))));
  return { rebuildWords: pick.map(function(c){return c.key;}), remaining: remaining, spreadDays: spreadDays };
}
```

### 3.5 词汇量基线（方案 J）

```js
// Open-2：按「书顺序」作频率分层代理（db.books 内置顺序 = cet4→cet6→kaoyan→ielts→job）
// 返回 [{key,w,tier,srcBook}]，分层抽样，硬上限 30
function selectBaselinePool(db) {
  var HARD_CAP = 30, perTier = 6, pool = [], n = 0;
  var books = (db.books||[]).filter(function(b){ return b.builtin; }); // 维持 seedBooks 顺序即频率层级
  for (var tier=0; tier<books.length && n<HARD_CAP; tier++) {
    var ws = books[tier].words || [];
    for (var i=0; i<ws.length && n<HARD_CAP; i+=Math.max(1, Math.floor(ws.length/perTier))) {
      pool.push({ key: wordKey(ws[i].w), w: ws[i].w, tier: tier, srcBook: books[tier].key }); n++;
    }
  }
  return pool; // 跨层抽样，约 24–30 题封顶（J-AC1）
}

// 阶梯收敛（J-AC2）：对 0..460 累计下标做二分搜索，答对升、答错降，收敛到 ±300（<=1 题即满足）
function scoreBaseline(answers) {
  var TOTAL = 460, lo = 0, hi = TOTAL;
  for (var i=0;i<answers.length;i++){
    var mid = Math.floor((lo+hi)/2);
    if (answers[i]) lo = mid; else hi = mid;   // 答对→上调估计，答错→下调
  }
  return { level: Math.floor((lo+hi)/2) };     // 估计词汇量等级（累计下标）
}

// 给定当前 level，从池中取最接近难度的词（供 app 出题）
function baselineQuestionForLevel(pool, level) {
  var tier = Math.min(pool.length? Math.floor(level/92):0, 4); // 460/5≈92 每层
  for (var i=0;i<pool.length;i++){ if (pool[i].tier===tier) return pool[i]; }
  return pool[Math.min(tier, pool.length-1)] || pool[0];
}

// 批量毕业裁剪（J-AC3）：把 level 以下的内置词标记 graduated，写 db.baseline
function applyGraduation(db, level) {
  var books = (db.books||[]).filter(function(b){ return b.builtin; });
  var cum = 0, keys = [], n = 0;
  for (var b=0;b<books.length && n<=level;b++){
    var ws = books[b].words||[];
    for (var i=0;i<ws.length && n<=level;i++){
      var k = wordKey(ws[i].w);
      if (db.words[k]) db.words[k].graduated = true;  // 仅标记已存在的记录；不存在则下次 ensureRecord 默认 false
      keys.push(k); n++;
    }
  }
  db.baseline = { level: level, testedAt: now(), words: keys, reestimateAt: now() + 14*DAY_MS };
  return keys;
}
```

### 3.6 目标 → 计划推导（方案 I）

```js
// Open-1 考试类型 → 内置书键映射
function goalBookKeys(type) {
  return ({ cet46:['cet4','cet6'], kaoyan:['kaoyan'], ielts:['ielts'],
            toefl:['ielts'], job:['job'], free:['cet4','cet6','kaoyan','ielts','job'] })[type] || ['cet4','cet6','kaoyan','ielts','job'];
}

// 推导六要素并落 db.plan（同时依赖 db.goal 已落库）；公式可复算（I-AC3）
function buildPlan(db) {
  var g = db.goal || { type:'free', deadline:null, dailyMinutes:20 };
  var keys = goalBookKeys(g.type);
  var total = 0, mastered = 0, t = now();
  keys.forEach(function(bk){
    var bkObj = bookByKey(db, bk); if (!bkObj) return;
    (bkObj.words||[]).forEach(function(e){
      total++;
      var r = db.words[wordKey(e.w)];
      if (r && (r.graduated || r.st==='known')) mastered++;
    });
  });
  var daysLeft = 0;
  if (g.deadline) daysLeft = Math.max(1, Math.ceil((g.deadline - t) / DAY_MS));
  var dailyFresh = (daysLeft>0)
    ? Math.ceil((total - mastered) / daysLeft)                       // 考试冲刺：均摊
    : db.settings.freshLimit;                                        // 自由/长期：沿用 freshLimit
  var dailyReview = Math.round(dailyFresh * db.settings.reviewRatio / (1 - db.settings.reviewRatio));
  if (dailyReview > db.settings.reviewLimit) dailyReview = db.settings.reviewLimit;
  var estMinutes = Math.round((dailyFresh + dailyReview) * SEC_PER_WORD / 60);
  db.plan = { derivedAt:t, totalWords:total, mastered:mastered, dailyFresh:dailyFresh,
              dailyReview:dailyReview, estMinutes:estMinutes, daysLeft:daysLeft };
  return db.plan;
}
```

### 3.7 北极星埋点 + 周再平衡（Open-7 / I-AC4）

```js
// 当日有效完成率（Open-7）：完成数 ≥ 80% × planTarget 视为有效
function dailyCompletionRate(db, dk) {
  var d = db.days[dk]; if (!d) return 0;
  var target = (d.planTarget || 0); if (!target) return 0;
  return Math.min(1, d.total / target);
}

// 每周再平衡（I-AC4）：仅给建议/在 autoRebalance 时微调整 dailyMinutes，不动 words 进度（I-AC5）
function weeklyRebalance(db) {
  var s = db.settings, t = now(), rates = [];
  for (var j=6;j>=0;j--){
    var dk = dayKey(t - j*DAY_MS);
    rates.push(dailyCompletionRate(db, dk));
  }
  var rate = rates.reduce(function(a,b){return a+b;},0) / rates.length;
  if (rate < 0.70) {
    var newMin = Math.max(10, s.dailyMinutes - 5);
    var msg = '按当前节奏，考试前可覆盖 ' + Math.round(rate*100) + '%，是否把每日时长调到 ' + newMin + ' 分钟？';
    if (s.autoRebalance) s.dailyMinutes = newMin;
    return { suggested:true, kind:'lower', rate:rate, newDailyMinutes:newMin, message:msg };
  }
  if (rate > 0.95) {
    // 估算「比计划快 X 天」：以日均实际完成数反推剩余天数
    var avg = rates.reduce(function(a,b){return a+b;},0)/7 * (db.plan.dailyFresh||s.freshLimit);
    var ahead = db.plan.daysLeft ? Math.max(0, Math.round((db.plan.totalWords-db.plan.mastered)/Math.max(1,avg)) - db.plan.daysLeft) : 0;
    return { suggested:true, kind:'faster', rate:rate, aheadDays:ahead, message:'你比计划快 ' + ahead + ' 天' };
  }
  return { suggested:false, rate:rate };
}
```

### 3.8 独立投影 `computePlanTarget(db)`

```js
// 供 Open-7 统计与测试使用；自身聚合全量记录后调用 todayPlan
function computePlanTarget(db) {
  var recs = Object.keys(db.words).map(function(k){ return db.words[k]; });
  return todayPlan(db, recs).planTarget;
}
```

> **挂载与兼容**：以上函数全部挂到 `Core` 导出对象；`todayPlan` 仍为纯逻辑（仅写加法键 `planTarget`）；`buildRebuildPack/scoreBaseline/detectReturn/computeDailyBudget/buildPlan/weeklyRebalance/applyGraduation/selectBaselinePool/baselineQuestionForLevel/dailyCompletionRate/ensureSchema/computePlanTarget/updateLastSeen/goalBookKeys/SEC_PER_WORD` 均为无 DOM 依赖、可 node 单测的纯函数。

---

## 4. app.js 具体改动点

### 4.1 启动流程（冷启动编排，Open-4 / Open-8）

```js
// 现有：var db = Core.loadDB(); Core.seedBooks(db, BOOK_DEFS); Core.saveDB(db);
// 改为：
var db = Core.loadDB();
Core.seedBooks(db, BOOK_DEFS);
Core.ensureSchema(db);          // J-AC5：补齐新键（旧库/导入后首次打开）
Core.updateLastSeen(db);        // C-AC7：打开即更新 lastSeen；回归日在此一次性决策重建包
Core.saveDB(db);

// init() 内「若未设置目标 → 强制进入引导」：
if (!location.hash) {
  if (!db.onboarding.completed && !db.onboarding.skipped) location.hash = '#/onboard';
  else location.hash = '#/learn';
}

// render() 增加路由分支：
case 'onboard': destroySession(); renderOnboard(); break;
```

### 4.2 首页 `renderHome()` 改造（§4 文案清单逐字落地）

- **hero `h2`**（条目 1）：`db.goal.type!=='free' && db.goal.deadline` → `距考试 X 天 · 今日计划`（`X = db.plan.daysLeft`）；否则 `今日计划`。
- **plan-nums / 重建区块**（条目 2、3）：
  - `plan.mode==='rebuild'`：`今日重建任务 N 词 · 帮你重新排好了，剩余 M 词分 3–5 天消化` + 重建词列表；并渲染首屏主文案卡片 **`欢迎回来，帮你重新排好了，今天 18 分钟就能追上`**（Open-3 统一逐字）。
  - `plan.mode==='pause'`（条目 6）：`今天先把旧账清了，明天加新词`；plan-nums 显示 `复习 Y（新词暂停）`。
  - 正常：`新词 X + 复习 Y（计划总数 Z）`。
- **主按钮**（条目 4）：`!db.onboarding.completed` → `花 3 分钟，定制你的计划`（→ `#/onboard`）；否则 `开始学习`。
- **六要素计划卡**（条目 7，I-AC2）：当 `db.plan.derivedAt>0` 渲染可解释卡：① 距目标 `daysLeft` 天（free 显「长期」）② 词库 `totalWords` 词 ③ 已掌握扣除 `mastered` ④ 每日新学 `dailyFresh` ⑤ 每日复习 `dailyReview` ⑥ 约 `estMinutes` 分钟。文案模板：`距考试 {daysLeft} 天，词库 {totalWords} 词，扣除已掌握约 {mastered} 词，需每日新学 {dailyFresh} 词 + 复习约 {dailyReview} 词，约 {estMinutes} 分钟`。
- **再平衡非阻塞提示**（Open-5）：进入首页时若 `weeklyRebalance(db).suggested` → 调用 `showRebalanceToast(msg)`（复用 `#toast` 通道，非阻塞，可关闭卡片）。
- **负向文案**：移除/不新增任何「已断签 N 天」式文案（保留现有的中性「连续学习 X 天 · 已学 Y 词」）。

### 4.3 新增视图 / 弹窗

| 视图 | 路由/触发 | 内容 |
|---|---|---|
| `renderOnboard()` | `#/onboard` | 三问向导 host + 进度条；步骤 state：`step0 目标类型`(6 卡，含中文标签) → `step1 截止日期`(date 选择，free 提供「长期」开关) → `step2 每日时长`(10/20/30 分段) → `step3 基线测试` |
| `renderBaselineTest()` | onboard step3 | 自适应测试：**复用现有选义组件思路**（`buildChoiceOptions` 风格），听音/看词选义；每题基于 `scoreBaseline(answers)` 当前 level 用 `baselineQuestionForLevel(pool, level)` 取词；**硬上限 30 题**（J-AC1），收敛即止 |
| 测试结束 | — | `applyGraduation(db, level)` 标记毕业 → `buildPlan(db)` 落计划 → `db.onboarding={step:3,completed:true,completedAt:now}` → `nav('#/learn')` |
| `renderPlanCard()` | 首页卡 / 「我的」查看 | 六要素逐字展示（见 4.2） |
| 「重做目标设置」 | 「我的」页按钮 | `redoGoal()`：`db.onboarding.completed=false; db.onboarding.step=0; nav('#/onboard')`（**保留** baseline/graduated，仅重答三问 + 重新 `buildPlan`） |
| 重测 / 反馈 | 「我的」或测试页 | `needsReestimate(db)`（`now>=reestimateAt`）提示重测；「太简单 / 太难」一键按钮 → 直接 `nav('#/onboard')` 仅跑 step3 测试（J-AC4） |

### 4.4 设置项（`renderMine()` 增）

新增区块「计划与节奏」：
- 每日时长 `dailyMinutes`：10/20/30 分段（复用 `.seg`）。
- `returnDays`（数字，默认 3）、`rebuildCap`（默认 40）、`pressureThreshold`（默认 50）、`reviewRatio`（默认 0.7，P1 可隐藏为高级）。
- `autoRebalance` 开关（Open-5，默认 true）。
- 「重做目标设置」按钮（Open-4）。
- 改动后 `Core.saveDB(db)`，并（若影响计划）`Core.buildPlan(db)` 重算 `db.plan`。

### 4.5 统计页（Open-7，可选 P1）

`renderStats()` 增「近 14 天有效完成率」小趋势：对每天 `dailyCompletionRate(db, dk)` 画柱/点（复用现有 `.bar-chart` 样式），本地计算无上报。

### 4.6 答后钩子（C-AC7）

`doRate` 与 `doRateTyped` 在 `Core.rateWord` 之后追加 `Core.updateLastSeen(db);`（更新 `lastSeen` + `backlogCount`；回归日已在启动决策，此处只刷新计数）。

---

## 5. index.html / css/app.css

### 5.1 index.html

**无需新增容器**。onboarding / rebuild 区块 / plan 卡 / 再平衡提示均渲染至既有 `#view` / `#modalRoot` / `#toast`；`#view` 已带 `aria-live="polite"`。若后续要做全屏 onboarding，仍在 `#view` 内渲染，不改 index.html。

### 5.2 css/app.css（新增样式，复用既有设计令牌与无障碍）

- `.onboard-wrap / .onboard-progress / .goal-grid / .goal-card`：`goal-card` 用 `min-height:64px` 满足 44px 命中；`.goal-card` 选中态用 `--brand-soft`。
- `.test-progress / .plan-card / .plan-row`：`plan-card` 用 `.card` 基底，`.plan-row` 两列（要素名/值）。
- `.rebuild-block / .rebuild-list / .rebuild-item`：回归重建区块高亮卡片（`--warn-soft` 边框）。
- `.rebalance-toast`：非阻塞提示卡片（fixed 顶部或底部，`pointer-events:auto`，含关闭按钮，2.5s 自动消失，复用 `prefers-reduced-motion` 已覆盖）。
- 无障碍：新交互元素均 `min-height:44px`；焦点环复用全局 `:focus-visible`；弹窗/卡片补 `role="dialog"/aria-modal` 或 `role="status"`；`prefers-reduced-motion` 已在文件末尾全局处理（动画/过渡归零），无需为新组件重复。

---

## 6. 任务分解（有序，依赖清晰，含验收钩子）

> 约束：≤5 个任务、每任务 ≥3 个相关文件、T01 为「基础设施」、尽量并行少线性依赖。本工程无构建/配置文件，故「基础设施」= 数据契约 + 迁移 + 核心纯逻辑 + 启动钩子 + 单测。

### T01 · 数据契约与核心纯逻辑（P0，依赖：无）
- **文件**：`js/core.js`、`js/app.js`（仅启动钩子 `ensureSchema`/`updateLastSeen`）、`tests/core.test.phase1.mjs`（新）
- **内容**：§2 schema 落库（defaultSettings/defaultDB/newRecord）；`ensureSchema`；`importJSON` 兼容；§3.3–3.8 全部新增纯函数；`todayPlan` 三态改造；`Core` 导出补齐；app 启动两钩子。
- **验收钩子**：C-AC1/2/3（detectReturn/buildRebuildPack）、C-AC4（todayPlan pause）、C-AC5（computeDailyBudget 7:3）、C-AC6（上限顺延，天然）、C-AC7（updateLastSeen）、I-AC3（buildPlan 公式复算）、I-AC5/J-AC5（ensureSchema/importJSON）、J-AC1（selectBaselinePool 上限 30）、J-AC2（scoreBaseline 收敛）、J-AC3（applyGraduation）。**门禁：`node --test tests/` 全过（含既有 25 项）。**

### T02 · 文案常量与首页重构（P0，依赖：T01）
- **文件**：`js/phrases.js`（新，所有逐字文案 + 枚举中文映射）、`js/app.js`（`renderHome` 重写）、`css/app.css`（home/plan/rebuild 样式）
- **内容**：`PHRASES` 常量（Open-1 中文标签、§4 八条逐字）；`renderHome` 三态文案/计划卡/重建区块/主按钮/移除负向文案；对应样式。
- **验收钩子**：§4 八条文案逐字可审阅（条目 1–8）、C-AC1 首屏不展示全量积压、C-AC3 平滑摊派文案、I-AC2 六要素齐备。

### T03 · 引导流与词汇量自适应测试（P0，依赖：T01，复用 T02 `phrases`）
- **文件**：`js/app.js`（`renderOnboard` + `renderBaselineTest` + 路由 `onboard` + 裁剪/生成计划/进入学习）、`css/app.css`（wizard/test 样式）、`js/phrases.js`（复用）
- **内容**：三问向导（目标/截止/时长）、自适应测试（硬上限 30、阶梯收敛、复用选义组件）、`applyGraduation`+`buildPlan`+落 `onboarding.completed`、Open-8 一次性串联（`花 3 分钟，定制你的计划`）。
- **验收钩子**：I-AC1（首启强制三问 + 落库 `db.goal`）、Open-4（稍后跳过回退现状、`我的` 重做）、J-AC1（≤30 题）、J-AC2（±300 收敛）、J-AC3（毕业裁剪、`todayPlan` 起点 i+1）、Open-8（I→J→裁剪→计划→学习）。

### T04 · 设置项 / 统计趋势 / 无障碍收尾（P1，依赖：T01）
- **文件**：`js/app.js`（`renderMine` 设置项 + 重做目标 + 重测/反馈入口；`renderStats` 有效完成率趋势）、`css/app.css`（settings/toast/a11y）、`js/phrases.js`（复用）
- **内容**：dailyMinutes/returnDays/rebuildCap/pressureThreshold/reviewRatio/autoRebalance 设置项 + 重做目标；Open-5 非阻塞再平衡提示接入；J-AC4 周期重估 + 太简单/太难反馈；Open-7 趋势图。
- **验收钩子**：I-AC4（周再平衡提示 <70% / >95%）、I-AC5（仅调 dailyMinutes/freshLimit 建议，不动 words）、Open-5（autoRebalance 默认 true 可关）、J-AC4（14 天重估 + 反馈入口）、Open-7（本地有效完成率趋势）。

### T05 · 回归自测与集成验收（P0，依赖：T01–T04）
- **文件**：`tests/core.test.mjs`（既有，必须全过）、`tests/core.test.phase1.mjs`（新功能单测）、`js/app.js`（集成冒烟：打开→引导→测试→首页→学习 全链路手测）
- **内容**：运行全量 node 单测（既有 + 阶段一）；按 PRD §7 验收总览逐项手测（C-AC1~7 / I-AC1~5 / J-AC1~5 / §4 八条文案）；检查 `localStorage` 旧库升级、JSON 导入导出兼容。
- **验收钩子**：PRD §7 全部锚点；既有 25 项单测 100% 通过；J-AC5 旧备份导入后新键补齐且不报错。

**依赖关系**：T01 → {T02, T03, T04} → T05；T02/T03/T04 之间基本并行（共享 `phrases.js` 与 T01 的 Core API）。

---

## 7. 共享约定与风险

### 7.1 core / app 接口边界
- **core = 纯逻辑，app = DOM 编排**：所有新算法（detectReturn / buildRebuildPack / scoreBaseline / buildPlan / weeklyRebalance / applyGraduation / computeDailyBudget / selectBaselinePool 等）均在 `core.js`，无 DOM、`window` 仅用于双暴露；`app.js` 只调用 `Core.*` 与渲染。沿用现有风格（IIFE + `window.Core`/`module.exports`）。
- **事件名**：现有代码无自定义事件（直接用函数调用 + 现有 `#toast`）。阶段一不引入新全局事件；再平衡提示复用 `toast()`。
- **todayPlan 纯净度**：仅新增 `days[dk].planTarget` 一个加法键；重建包决策在 `updateLastSeen` 内一次性持久化（同日去重），`todayPlan` 读取 `returnGuard.rebuiltAt===今天` 判定重建态，避免重复触发与双重副作用。

### 7.2 localStorage 防抖
- 现有 120ms 防抖（`saveDB`）**足够**，无需扩展：① `updateLastSeen` 仅写字符串，每次打开/作答一次；② 毕业裁剪一次性写 ~N 条（一次 `saveDB`）；③ 引导/设置改动频率低。无需新增防抖通道。

### 7.3 导入导出迁移（J-AC5）
- `importJSON` 末尾调用 `ensureSchema(data)`：旧 `schema:3` 备份（无 `goal/plan/baseline/returnGuard/onboarding`、`word.graduated`、`days[dk].planTarget`）导入后自动补齐默认 → 不破坏旧键。导出天然包含新键（JSON 全量序列化）。

### 7.4 回归保护与现有 todayPlan 兼容
- 旧/新库 `returnGuard.lastSeen=''` → `detectReturn` 首开前 `daysGap=0` → 不触发重建；`backlog` 新用户=0 < 50 → 不熔断；`graduated` 默认 false → freshs 不受影响。**默认路径语义与改造前一致**，故既有 25 项单测不受影响（仅默认复习上限由 60→47，是 C-AC5 7:3 的落地，已被 reviewLimit 小值测试覆盖）。

### 7.5 避免破坏现有 25 项单测的注意点
- 不删除/不改 `todayPlan`、`rateWord` 等既有函数签名与返回结构（仅给 `todayPlan` 返回对象加字段，旧断言只取 `reviews/freshs` 仍成立）。
- `defaultDB/defaultSettings/newRecord` 仅**加字段**，不删不改默认值（`freshLimit=20` 等保持）。
- 新单测写在独立文件 `tests/core.test.phase1.mjs`，**不改动** `tests/core.test.mjs`。
- **交付门禁**：每个任务完成均跑 `node --test tests/`，要求既有 + 新增全绿。

### 7.6 关键风险与待确认（需 team-lead / PM 拍板）
1. **`dailyMinutes` 与计数的映射（产品影响最大）**：本设计令 `freshLimit`（默认 20）仍为「每日新词数」主来源（贴合 v2 §3.3 示例「每日新学 21 词」），`dailyMinutes` 主要驱动 `estMinutes` 估算与周再平衡建议（Open-1 给的默认 20 未明确「20 分钟 = 多少词」）。若产品希望「20 分钟严格≈34 词且新词降至 ~10」，需把 `computeDailyBudget` 改为以 `dailyMinutes` 为主、以 `freshLimit` 为上限——此变更会降低默认新词量，须 PM 确认。**当前默认按「保留 20 新词」实现。**
2. **`estMinutes` 与 PRD 示例「约 22 分钟」不一致**：v2 示例数值为示意，本设计按 I-AC3「公式与文案数值必须一致、可单测复算」要求，统一 `estMinutes = (dailyFresh+dailyReview)*35/60`，示例 22 分钟不作为硬约束（已在 §3.6 标注 `SEC_PER_WORD=35`）。
3. **复原/熔断阈值共用 `pressureThreshold=50`**：Open-3 的「积压阈值 N=50」与 C-AC4 熔断阈值合并为一设置项（避免超出 PRD §3.2 规定的 6 个 settings 字段）。若 PM 希望两者独立，需增字段（将突破既有 settings 设计）。
4. **毕业词是否排除出复习队列**：本设计 `todayPlan` 对 `graduated` 词在 reviews 与 freshs **均排除**（已掌握不再复习）。若希望仅排除新词、保留其复习，需调整过滤（J-AC3 原文只说「移出每日新词计划」）。
5. **`onboarding.completedAt`**：拍板 hint 为 `{step,completed,skipped}`，本设计增补 `completedAt:0` 以支撑 I-AC1「落库」追溯，属加法，无冲突。
6. **`selectBaselinePool` 抽样步长**：按每层 `perTier≈6`、跨 5 层抽样得 ~24–30 题（J-AC1「约 20–30 题」）。具体步长为实现细节，可在 T03 微调以更贴合「3 分钟」体验。

---

> 落盘完成。下一步：工程师按 T01→T05 顺序实现，每个任务以 `node --test tests/` 全绿 + 对应 AC 钩子为完成判据；风险项 7.6 建议在 T01 启动前由 team-lead/PM 闭环。
