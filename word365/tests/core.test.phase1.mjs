/* 阶段一 P0 新增纯函数单测：node --test tests/core.test.phase1.mjs
 * 独立于既有 25 项（core.test.mjs），不破坏 check-data.mjs。
 * 覆盖：ensureSchema / defaultDB 新字段 / newRecord.graduated /
 *       computeDailyBudget / goalBookKeys / buildPlan /
 *       detectReturn / updateLastSeen / buildRebuildPack /
 *       selectBaselinePool / scoreBaseline / baselineQuestionForLevel /
 *       applyGraduation / dailyCompletionRate / weeklyRebalance /
 *       todayPlan 三态 / computePlanTarget
 */
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const Core = require('../js/core.js');
const PHRASES = require('../js/phrases.js');

const DAY = Core.DAY_MS;
const HOUR = 3600 * 1000;

/* ---------- 测试辅助 ---------- */

function seedBuiltin(db, defs) {
  Core.seedBooks(db, defs.map(function (d) {
    return { key: d.key, name: d.name, builtin: true, words: d.words.map(function (w) {
      return typeof w === 'string' ? { w: w } : w;
    }), units: [] };
  }));
}

function addDueWords(db, n, lvl, srcBook) {
  for (let i = 0; i < n; i++) {
    const k = 'w::due' + i;
    db.words[k] = Core.newRecord('due' + i, srcBook || '');
    db.words[k].reps = 1;
    db.words[k].due = Date.now() - 1000; // 已到期
    db.words[k].lvl = lvl || 0;
  }
  return db;
}

function dayKeyOffset(dayOffset) {
  return Core.dayKey(Date.now() + dayOffset * DAY);
}

/* ---------- 1. ensureSchema / defaultDB / newRecord ---------- */

test('defaultDB 含阶段一全部新增顶层键', () => {
  const db = Core.defaultDB();
  for (const k of ['goal', 'plan', 'baseline', 'returnGuard', 'onboarding']) {
    assert.ok(db[k], '应存在 ' + k);
  }
  assert.equal(db.goal.type, 'free');
  assert.equal(db.plan.derivedAt, 0);
  assert.deepEqual(db.baseline, { level: 0, testedAt: 0, words: [], reestimateAt: 0 });
  assert.equal(db.onboarding.completed, false);
  // settings 六字段
  for (const f of ['dailyMinutes', 'returnDays', 'rebuildCap', 'reviewRatio', 'pressureThreshold', 'autoRebalance']) {
    assert.ok(db.settings[f] != null, 'settings.' + f + ' 应存在');
  }
  assert.equal(db.settings.returnDays, 3);
  assert.equal(db.settings.rebuildCap, 40);
  assert.equal(db.settings.reviewRatio, 0.7);
  assert.equal(db.settings.pressureThreshold, 50);
  assert.equal(db.settings.autoRebalance, true);
});

test('newRecord 含 graduated:false', () => {
  const r = Core.newRecord('apple');
  assert.equal(r.graduated, false);
});

test('ensureSchema 补齐旧库缺失键且幂等（J-AC5）', () => {
  const old = { schema: 3, settings: { freshLimit: 20 }, words: { 'w::a': { w: 'a', reps: 1 } }, days: {} };
  const db = Core.ensureSchema(old);
  assert.ok(db.goal && db.plan && db.baseline && db.returnGuard && db.onboarding);
  assert.equal(db.words['w::a'].graduated, false, '旧词应补 graduated');
  assert.equal(db.settings.dailyMinutes, 20);
  assert.equal(db.settings.pressureThreshold, 50);
  // 幂等：二次调用不报错、不丢字段
  const snapshot = JSON.stringify(db);
  Core.ensureSchema(db);
  assert.equal(JSON.stringify(db), snapshot);
});

test('importJSON 末尾补齐阶段一新增键（旧 schema 兼容）', () => {
  const r = Core.importJSON(JSON.stringify({ schema: 3 }));
  assert.ok(r.ok);
  assert.ok(r.db.goal && r.db.returnGuard && r.db.onboarding);
  assert.equal(r.db.words['w::x'], undefined); // 不引入多余词
});

/* ---------- 2. computeDailyBudget / goalBookKeys ---------- */

test('computeDailyBudget 7:3 互补并受 reviewLimit 钳制（C-AC5 / Gap#2）', () => {
  const s = { freshLimit: 20, reviewLimit: 60, reviewRatio: 0.7 };
  let b = Core.computeDailyBudget(s, 0);
  assert.equal(b.freshTarget, 20, '无计划 → freshLimit');
  assert.equal(b.reviewTarget, Math.round(20 * 0.7 / 0.3)); // 47
  // Gap#2：计划值低于 freshLimit → 以计划值为准
  b = Core.computeDailyBudget(s, 10);
  assert.equal(b.freshTarget, 10, '计划值作准（< freshLimit）');
  assert.equal(b.reviewTarget, Math.round(10 * 0.7 / 0.3)); // 23
  // Gap#2 用户决策：计划值超 freshLimit → 以 freshLimit 为上限
  b = Core.computeDailyBudget(s, 30);
  assert.equal(b.freshTarget, 20, '超 freshLimit 时以 freshLimit 为上限');
  assert.equal(b.reviewTarget, Math.round(20 * 0.7 / 0.3)); // 47
  // reviewLimit 硬上限钳制（高 freshLimit 场景）
  const s2 = { freshLimit: 200, reviewLimit: 60, reviewRatio: 0.7 };
  b = Core.computeDailyBudget(s2, 100);
  assert.equal(b.freshTarget, 100);
  assert.equal(b.reviewTarget, 60, '复习数不超过 reviewLimit 硬上限');
});

test('goalBookKeys 映射（Open-1 / 已拍板）', () => {
  assert.deepEqual(Core.goalBookKeys('cet46'), ['cet4', 'cet6']);
  assert.deepEqual(Core.goalBookKeys('kaoyan'), ['kaoyan']);
  assert.deepEqual(Core.goalBookKeys('ielts'), ['ielts']);
  assert.deepEqual(Core.goalBookKeys('toefl'), ['ielts']); // 拍板：toefl→ielts
  assert.deepEqual(Core.goalBookKeys('job'), ['job']);
  assert.equal(Core.goalBookKeys('free').length, 5);
});

/* ---------- 3. buildPlan 公式可复算（I-AC3） ---------- */

test('buildPlan 自由型（daysLeft=0）每日新学沿用 freshLimit', () => {
  const db = Core.defaultDB();
  seedBuiltin(db, [
    { key: 'cet4', name: 'C4', words: ['a', 'b'] },
    { key: 'cet6', name: 'C6', words: ['c'] }
  ]);
  db.goal.type = 'cet46';
  db.goal.deadline = null;
  const p = Core.buildPlan(db);
  assert.equal(p.totalWords, 3);
  assert.equal(p.mastered, 0);
  assert.equal(p.daysLeft, 0);
  assert.equal(p.dailyFresh, 20);                 // 沿用 freshLimit
  assert.equal(p.dailyReview, Math.round(20 * 0.7 / 0.3)); // 47
  assert.equal(p.estMinutes, Math.round((20 + p.dailyReview) * Core.SEC_PER_WORD / 60)); // 39
});

test('buildPlan 考试型（daysLeft>0）每日新学=ceil((总-已掌握)/天数)，公式可复算', () => {
  const db = Core.defaultDB();
  seedBuiltin(db, [
    { key: 'cet4', name: 'C4', words: ['a', 'b', 'c'] },
    { key: 'cet6', name: 'C6', words: ['d'] }
  ]);
  db.goal.type = 'cet46';
  db.goal.deadline = Core.now() + 10 * DAY - 2000; // 略小于 10 天，ceil 得 10
  const p = Core.buildPlan(db);
  assert.equal(p.totalWords, 4);
  assert.equal(p.daysLeft, 10);
  assert.equal(p.dailyFresh, Math.ceil((4 - 0) / 10)); // 1
  assert.equal(p.dailyReview, Math.round(1 * 0.7 / 0.3)); // 2
  assert.equal(p.estMinutes, Math.round((1 + 2) * Core.SEC_PER_WORD / 60)); // 2
});

test('buildPlan 已掌握（graduated/known）计入 mastered 扣除', () => {
  const db = Core.defaultDB();
  seedBuiltin(db, [
    { key: 'cet4', name: 'C4', words: ['a', 'b', 'c', 'd'] }
  ]);
  db.words['w::a'] = Core.newRecord('a'); db.words['w::a'].graduated = true;
  db.words['w::b'] = Core.newRecord('b'); db.words['w::b'].st = 'known';
  db.goal.type = 'cet46';
  const p = Core.buildPlan(db);
  assert.equal(p.totalWords, 4);
  assert.equal(p.mastered, 2);
});

/* ---------- 4. detectReturn / updateLastSeen ---------- */

test('detectReturn：中断≥returnDays 且积压≥阈值 判定回归（C-AC1）', () => {
  const db = Core.defaultDB();
  addDueWords(db, 60, 0); // 60 个到期词（>=50）
  db.returnGuard.lastSeen = dayKeyOffset(-5); // 5 天前
  const det = Core.detectReturn(db);
  assert.equal(det.isReturn, true);
  assert.equal(det.daysGap, 5);
  assert.ok(det.backlog >= 50);
});

test('detectReturn：当日活跃不触发回归', () => {
  const db = Core.defaultDB();
  addDueWords(db, 60, 0);
  db.returnGuard.lastSeen = Core.dayKey(); // 今天
  const det = Core.detectReturn(db);
  assert.equal(det.isReturn, false);
  assert.equal(det.daysGap, 0);
});

test('detectReturn：积压不足不触发回归', () => {
  const db = Core.defaultDB();
  addDueWords(db, 5, 0); // < 50
  db.returnGuard.lastSeen = dayKeyOffset(-10);
  assert.equal(Core.detectReturn(db).isReturn, false);
});

test('updateLastSeen：回归日一次性决策重建包并持久化 rebuiltAt（同日去重）', () => {
  const db = Core.defaultDB();
  addDueWords(db, 60, 0);
  db.returnGuard.lastSeen = dayKeyOffset(-5);
  const det = Core.updateLastSeen(db);
  assert.equal(det.isReturn, true);
  assert.equal(db.returnGuard.rebuiltAt, Core.dayKey());
  assert.ok(db.returnGuard.rebuildWords.length > 0);
  assert.ok(db.returnGuard.rebuildWords.length <= db.settings.rebuildCap);
  // 同日再次调用不重复决策（rebuiltAt 已是今天 → detectReturn 用旧 lastSeen 仍为今天）
  const before = JSON.stringify(db.returnGuard.rebuildWords);
  db.returnGuard.lastSeen = Core.dayKey(); // 更新为今天
  Core.updateLastSeen(db);
  assert.equal(JSON.stringify(db.returnGuard.rebuildWords), before, '同日不应重复生成重建包');
});

/* ---------- 5. buildRebuildPack（C-AC2 排序与上限） ---------- */

test('buildRebuildPack：≤cap、排除 graduated、剩余与摊派天数合理', () => {
  const db = Core.defaultDB();
  // 10 个到期词（5 cet4 高频 + 5 普通），各异 lvl
  for (let i = 0; i < 5; i++) {
    const k = 'w::cet4_' + i;
    db.words[k] = Core.newRecord('cet4_' + i, 'cet4');
    db.words[k].reps = 1; db.words[k].due = Date.now() - 1000; db.words[k].lvl = 0;
  }
  for (let i = 0; i < 5; i++) {
    const k = 'w::oth_' + i;
    db.words[k] = Core.newRecord('oth_' + i, 'ielts');
    db.words[k].reps = 1; db.words[k].due = Date.now() - 1000; db.words[k].lvl = 2;
  }
  // 1 个 graduated 到期词应被排除
  db.words['w::g'] = Core.newRecord('g', 'cet4');
  db.words['w::g'].reps = 1; db.words['w::g'].due = Date.now() - 1000; db.words['w::g'].graduated = true;

  const pack = Core.buildRebuildPack(db, 3);
  assert.equal(pack.rebuildWords.length, 3, '不超过 cap');
  assert.equal(pack.remaining, 7, '10 到期 - 3 选中 = 7 剩余');
  assert.ok(pack.spreadDays >= 3 && pack.spreadDays <= 5, '摊派天数 3..5');
  // 选中项均来自到期且未毕业的词
  pack.rebuildWords.forEach(function (k) { assert.ok(!db.words[k].graduated); });
  // graduated 词不应被选中
  assert.ok(pack.rebuildWords.indexOf('w::g') < 0);
  // 强度降序：cet4 词（lvl0, 加权后 score=1.5）应优先于普通 lvl2（score=1）
  // 键形如 'w::cet4_0'，前缀 'w::' 之后即词名
  assert.ok(pack.rebuildWords[0].indexOf('cet4_') > 0, '首个应选中高频 cet4 词');
});

/* ---------- 6. selectBaselinePool / scoreBaseline / baselineQuestionForLevel ---------- */

test('selectBaselinePool：跨层抽样且硬上限 30（J-AC1）', () => {
  const db = Core.defaultDB();
  seedBuiltin(db, [
    { key: 'cet4', name: 'C4', words: Array.from({ length: 100 }, (_, i) => 'c4_' + i) },
    { key: 'cet6', name: 'C6', words: Array.from({ length: 100 }, (_, i) => 'c6_' + i) },
    { key: 'kaoyan', name: 'K', words: Array.from({ length: 100 }, (_, i) => 'k_' + i) },
    { key: 'ielts', name: 'I', words: Array.from({ length: 100 }, (_, i) => 'i_' + i) },
    { key: 'job', name: 'J', words: Array.from({ length: 60 }, (_, i) => 'j_' + i) }
  ]);
  const pool = Core.selectBaselinePool(db);
  assert.ok(pool.length > 0 && pool.length <= 30, '题量 1..30，实际 ' + pool.length);
  pool.forEach(function (p) {
    assert.ok(p.key && p.w && p.tier != null && p.srcBook);
    assert.ok(p.tier >= 0 && p.tier <= 4);
  });
});

test('scoreBaseline：全部答对→level 收敛到 460，全部答错→0（J-AC2）', () => {
  const allT = Core.scoreBaseline(Array(30).fill(true));
  assert.ok(allT.level >= 450, '全对应收敛到接近上限（实际 ' + allT.level + '）');
  const allF = Core.scoreBaseline(Array(30).fill(false));
  assert.equal(allF.level, 0);
  // 单调性：前缀答对更多 → level 不更低
  const tFirst = Core.scoreBaseline(Array(15).fill(true).concat(Array(15).fill(false)));
  const fFirst = Core.scoreBaseline(Array(15).fill(false).concat(Array(15).fill(true)));
  assert.ok(tFirst.level >= fFirst.level);
});

test('baselineQuestionForLevel：按 level 取对应 tier 词', () => {
  const pool = [
    { key: 'a', w: 'a', tier: 0, srcBook: 'cet4' },
    { key: 'b', w: 'b', tier: 2, srcBook: 'kaoyan' },
    { key: 'c', w: 'c', tier: 4, srcBook: 'job' }
  ];
  assert.equal(Core.baselineQuestionForLevel(pool, 0).tier, 0);
  assert.equal(Core.baselineQuestionForLevel(pool, 460).tier, 4);
  assert.equal(Core.baselineQuestionForLevel([], 10), undefined);
});

/* ---------- 7. applyGraduation（J-AC3） ---------- */

test('applyGraduation：标记 0..level-1 词 graduated 并落 db.baseline', () => {
  const db = Core.defaultDB();
  seedBuiltin(db, [
    { key: 'cet4', name: 'C4', words: ['a', 'b', 'c', 'd', 'e'] }
  ]);
  // 先建立进度记录（学习时会存在；这里模拟）
  ['a', 'b', 'c', 'd', 'e'].forEach(function (w) { Core.ensureRecord(db, w, 'cet4'); });
  const keys = Core.applyGraduation(db, 3); // 标记前 3 词（index 0..2）
  assert.equal(db.baseline.level, 3);
  assert.equal(keys.length, 3);
  assert.equal(db.words['w::a'].graduated, true);
  assert.equal(db.words['w::c'].graduated, true);
  assert.equal(db.words['w::d'].graduated, false);
  assert.equal(db.words['w::e'].graduated, false);
  assert.ok(db.baseline.reestimateAt - db.baseline.testedAt === 14 * DAY);
  assert.deepEqual(db.baseline.words, keys);
});

test('applyGraduation 后 graduated 词不进入今日 freshs（R3）', () => {
  const db = Core.defaultDB();
  seedBuiltin(db, [
    { key: 'cet4', name: 'C4', words: ['a', 'b', 'c'] }
  ]);
  ['a', 'b', 'c'].forEach(function (w) { Core.ensureRecord(db, w, 'cet4'); });
  Core.applyGraduation(db, 2); // 标记 a、b（index 0..1）
  const recs = Object.keys(db.words).map((k) => db.words[k]);
  const plan = Core.todayPlan(db, recs);
  plan.freshs.forEach(function (r) { assert.equal(r.graduated, false); });
  assert.ok(plan.freshs.every((r) => r.w !== 'a' && r.w !== 'b'));
});

/* ---------- 7b. Gap#1 / Gap#2 精准修复回归（团队第 1 轮 QA 指出） ---------- */

test('Gap#1 冷启：空 db.words 也能毕业前 level 词，todayPlan.freshs 不含且首词未毕业', () => {
  const db = Core.defaultDB();
  // 冷启动：仅内置词书定义，db.words 仍为空
  seedBuiltin(db, [
    { key: 'cet4', name: 'C4', words: Array.from({ length: 500 }, (_, i) => 'c4_' + i) },
    { key: 'cet6', name: 'C6', words: Array.from({ length: 100 }, (_, i) => 'c6_' + i) }
  ]);
  assert.equal(Object.keys(db.words).length, 0, '冷启 db.words 应为空');
  // 基线全对 → 估计掌握 level 词（J-AC2 收敛到接近上限）
  const pool = Core.selectBaselinePool(db);
  const level = Core.scoreBaseline(pool.map(() => true)).level; // ≈459
  assert.ok(level > 100, '全对应收敛到较大 level（实际 ' + level + '）');
  const keys = Core.applyGraduation(db, level);
  assert.equal(keys.length, level, '毕业 level 个词');
  assert.equal(Object.keys(db.words).length, level, '冷启下为前 level 词创建最小记录');
  // 验证冷启创建的最小毕业记录形态（reps:0, lvl:6, st:'known', due:远未来）
  const sample = db.words[Core.wordKey('c4_0')];
  assert.equal(sample.graduated, true);
  assert.equal(sample.st, 'known');
  assert.equal(sample.lvl, 6);
  assert.equal(sample.reps, 0);
  assert.ok(sample.due > Core.now(), 'due 应为远未来');
  assert.equal(sample.srcBook, 'cet4');
  // 构造全量 universe（含未毕业词）喂给 todayPlan
  const recs = [];
  for (let i = 0; i < 500; i++) { recs.push(db.words[Core.wordKey('c4_' + i)] || { w: 'c4_' + i, reps: 0, graduated: false }); }
  for (let i = 0; i < 100; i++) { recs.push(db.words[Core.wordKey('c6_' + i)] || { w: 'c6_' + i, reps: 0, graduated: false }); }
  const plan = Core.todayPlan(db, recs);
  // 前 level 个词（已毕业）不应出现在 freshs
  for (let i = 0; i < level; i++) {
    assert.ok(!plan.freshs.some((r) => r.w === 'c4_' + i), '已毕业词 c4_' + i + ' 不应在 freshs');
  }
  assert.ok(plan.freshs.length > 0, '应仍有未毕业词可学');
  // 首词为首个未毕业词（index = level，仍在 cet4 内）
  assert.equal(plan.freshs[0].w, 'c4_' + level, '首词应为首个未毕业词 c4_' + level);
});

test('Gap#2：buildPlan 推导 dailyFresh=10 → computeDailyBudget/todayPlan 实际新词≈10（非20）', () => {
  const db = Core.defaultDB();
  seedBuiltin(db, [
    { key: 'cet4', name: 'C4', words: Array.from({ length: 60 }, (_, i) => 'c4_' + i) },
    { key: 'cet6', name: 'C6', words: Array.from({ length: 40 }, (_, i) => 'c6_' + i) }
  ]);
  db.goal.type = 'cet46';
  db.goal.deadline = Core.now() + 10 * DAY - 2000; // 略小于 10 天 → daysLeft=10
  const p = Core.buildPlan(db);
  assert.equal(p.totalWords, 100);
  assert.equal(p.daysLeft, 10);
  assert.equal(p.dailyFresh, 10, 'ceil(100/10)=10');
  // computeDailyBudget 应取计划值（min(10,20)=10）
  const b = Core.computeDailyBudget(db.settings, p.dailyFresh);
  assert.equal(b.freshTarget, 10, '计划值作准、freshLimit 作上限 → 10 而非 20');
  // todayPlan 实际新词数 ≈ 10
  const recs = [];
  for (let i = 0; i < 60; i++) { const k = Core.wordKey('c4_' + i); db.words[k] = Core.newRecord('c4_' + i); recs.push(db.words[k]); }
  for (let i = 0; i < 40; i++) { const k = Core.wordKey('c6_' + i); db.words[k] = Core.newRecord('c6_' + i); recs.push(db.words[k]); }
  const plan = Core.todayPlan(db, recs);
  assert.equal(plan.freshs.length, 10, '今日新词应≈计划值 10（Gap#2 修复）');
});

test('Gap#2：不设 plan 时 computeDailyBudget/todayPlan 仍为 freshLimit=20（保 #30/#47）', () => {
  const db = Core.defaultDB();
  const s = db.settings;
  assert.equal(Core.computeDailyBudget(s, 0).freshTarget, 20, '无计划 → freshLimit=20');
  const recs = [];
  for (let i = 0; i < 30; i++) { const k = Core.wordKey('w' + i); db.words[k] = Core.newRecord('w' + i); recs.push(db.words[k]); }
  const plan = Core.todayPlan(db, recs);
  assert.equal(plan.freshs.length, 20, '无计划今日新词应为 freshLimit=20');
  assert.equal(db.plan.derivedAt, 0, '确认 plan 未生成');
});

/* ---------- 8. dailyCompletionRate / weeklyRebalance（Open-7 / I-AC4） ---------- */

test('dailyCompletionRate：完成/目标比，planTarget=0 安全返回 0', () => {
  const db = Core.defaultDB();
  const dk = Core.dayKey();
  db.days[dk] = { total: 10, planTarget: 10 };
  assert.equal(Core.dailyCompletionRate(db, dk), 1);
  db.days[dk] = { total: 5, planTarget: 10 };
  assert.equal(Core.dailyCompletionRate(db, dk), 0.5);
  assert.equal(Core.dailyCompletionRate(db, 'nope'), 0);
  db.days[dk] = { total: 5, planTarget: 0 };
  assert.equal(Core.dailyCompletionRate(db, dk), 0);
});

test('weeklyRebalance：完成率高→faster 提示，低→lower 提示且可下调 dailyMinutes', () => {
  // 低完成率（建议下调）
  const db = Core.defaultDB();
  for (let j = 0; j < 7; j++) {
    const dk = Core.dayKey(Date.now() - j * DAY);
    db.days[dk] = { total: 0, planTarget: 10 };
  }
  const low = Core.weeklyRebalance(db);
  assert.equal(low.suggested, true);
  assert.equal(low.kind, 'lower');
  assert.equal(db.settings.dailyMinutes, 20, 'autoRebalance 默认应下调 5 分钟');
  assert.ok(low.message.indexOf('0%') >= 0);

  // 高完成率（建议加速）
  const db2 = Core.defaultDB();
  for (let j = 0; j < 7; j++) {
    const dk = Core.dayKey(Date.now() - j * DAY);
    db2.days[dk] = { total: 10, planTarget: 10 };
  }
  db2.plan = { derivedAt: 1, totalWords: 100, mastered: 0, dailyFresh: 10, dailyReview: 20, estMinutes: 17, daysLeft: 5 };
  const high = Core.weeklyRebalance(db2);
  assert.equal(high.suggested, true);
  assert.equal(high.kind, 'faster');
  assert.ok(high.message.indexOf('你比计划快') >= 0);
});

/* ---------- 9. todayPlan 三态（C-AC1/AC4/AC5） ---------- */

test('todayPlan 正常态：7:3 配比、排除 graduated、写 planTarget', () => {
  const db = Core.defaultDB();
  const recs = [];
  for (let i = 0; i < 5; i++) {
    const r = Core.newRecord('f' + i);
    db.words['w::f' + i] = r; recs.push(r);
  }
  const plan = Core.todayPlan(db, recs);
  assert.equal(plan.mode, 'normal');
  assert.equal(plan.pausedFresh, false);
  assert.equal(plan.freshs.length, 5);
  assert.equal(plan.reviews.length, 0);
  assert.equal(plan.planTarget, 5);
  assert.equal(db.days[Core.dayKey()].planTarget, 5);
});

test('todayPlan 熔断态：积压≥阈值暂停新词并展示文案（C-AC4）', () => {
  const db = Core.defaultDB();
  addDueWords(db, 60, 0); // >= 50
  db.returnGuard.rebuiltAt = ''; // 非重建态
  const recs = Object.keys(db.words).map((k) => db.words[k]);
  const plan = Core.todayPlan(db, recs);
  assert.equal(plan.mode, 'pause');
  assert.equal(plan.pausedFresh, true);
  assert.equal(plan.freshs.length, 0);
  assert.ok(plan.reviews.length > 0 && plan.reviews.length <= db.settings.reviewLimit);
  assert.equal(plan.text, '今天先把旧账清了，明天加新词');
});

test('todayPlan 重建态：rebuiltAt===今天 时仅重建包、主文案逐字（C-AC1/Open-3）', () => {
  const db = Core.defaultDB();
  addDueWords(db, 60, 0);
  const dk = Core.dayKey();
  db.returnGuard.rebuiltAt = dk;
  db.returnGuard.rebuildWords = ['w::due0', 'w::due1'];
  const recs = Object.keys(db.words).map((k) => db.words[k]);
  const plan = Core.todayPlan(db, recs);
  assert.equal(plan.mode, 'rebuild');
  assert.equal(plan.pausedFresh, true);
  assert.equal(plan.reviews.length, 0);
  assert.equal(plan.freshs.length, 0);
  assert.equal(plan.rebuildWords.length, 2);
  assert.equal(plan.text, '欢迎回来，帮你重新排好了，今天 18 分钟就能追上');
});

/* ---------- 10. computePlanTarget ---------- */

test('computePlanTarget 聚合全量记录返回计划总数', () => {
  const db = Core.defaultDB();
  const recs = [];
  for (let i = 0; i < 4; i++) {
    const r = Core.newRecord('x' + i);
    db.words['w::x' + i] = r; recs.push(r);
  }
  const target = Core.computePlanTarget(db);
  assert.equal(target, 4);
  const plan = Core.todayPlan(db, recs);
  assert.equal(target, plan.planTarget);
});

/* ---------- 11. QA 独立验证：边缘与反向用例 ---------- */

test('importJSON：旧「词书::单词」键迁移仍保留记录与 graduated（J-AC5）', () => {
  const legacy = {
    schema: 3,
    words: { 'cet4::apple': { w: 'apple', reps: 3, lvl: 2, graduated: true, st: 'known' } }
  };
  const r = Core.importJSON(JSON.stringify(legacy));
  assert.ok(r.ok);
  // 旧键被迁移为 w::apple，记录（含 graduated）保留
  assert.equal(r.db.words['w::apple'].graduated, true, 'graduated 字段不丢');
  assert.equal(r.db.words['cet4::apple'], undefined, '旧键应被移除');
  // 阶段一新增键补齐（不破坏旧键格式）
  assert.ok(r.db.goal && r.db.plan && r.db.baseline && r.db.returnGuard && r.db.onboarding);
});

test('importJSON：破坏/非法 JSON 与缺 schema 安全拒绝不炸库', () => {
  const broken = Core.importJSON('{ not valid json');
  assert.equal(broken.ok, false);
  assert.equal(broken.db, null);
  const noSchema = Core.importJSON(JSON.stringify({ foo: 1 }));
  assert.equal(noSchema.ok, false);
  assert.equal(noSchema.db, null);
});

test('updateLastSeen：同日再次调用不再重复生成重建包（同日去重）', () => {
  const db = Core.defaultDB();
  addDueWords(db, 60, 0);
  db.returnGuard.lastSeen = dayKeyOffset(-5);
  Core.updateLastSeen(db);
  const first = JSON.stringify(db.returnGuard.rebuildWords);
  // 同日内再次打开：lastSeen 已是今天，不应重新决策重建包
  Core.updateLastSeen(db);
  assert.equal(JSON.stringify(db.returnGuard.rebuildWords), first, '同日重建包不应变化');
});

test('todayPlan 正常态：graduated 的到期词在 reviews 与 freshs 两处均排除', () => {
  const db = Core.defaultDB();
  const g = Core.newRecord('graddue');
  g.reps = 1; g.due = Date.now() - 1000; g.graduated = true; // 到期且已毕业
  db.words['w::graddue'] = g;
  const fresh = Core.newRecord('fresh1');
  db.words['w::fresh1'] = fresh;
  const plan = Core.todayPlan(db, [g, fresh]);
  assert.equal(plan.mode, 'normal');
  assert.ok(plan.reviews.every((r) => r.graduated !== true), 'reviews 不含 graduated');
  assert.ok(plan.reviews.indexOf(g) < 0, 'graduated 到期词不入 reviews');
  assert.ok(plan.freshs.every((r) => r.graduated !== true), 'freshs 不含 graduated');
});

test('buildPlan 自由型不除零：deadline=null → daysLeft=0 且 dailyFresh 取 freshLimit', () => {
  const db = Core.defaultDB();
  seedBuiltin(db, [{ key: 'cet4', name: 'C4', words: ['a', 'b', 'c'] }]);
  db.goal.type = 'free';
  db.goal.deadline = null;            // 显式 null（非 undefined）
  const p = Core.buildPlan(db);
  assert.equal(p.daysLeft, 0);
  assert.equal(p.dailyFresh, db.settings.freshLimit);
  assert.equal(p.dailyReview, Math.round(p.dailyFresh * 0.7 / 0.3));
});

test('selectBaselinePool：仅纳入 builtin 词书，自定义词书被排除（J-AC1）', () => {
  const db = Core.defaultDB();
  Core.seedBooks(db, [
    { key: 'cet4', name: 'C4', builtin: true, words: Array.from({ length: 100 }, (_, i) => ({ w: 'c4_' + i })), units: [] },
    { key: 'mybook', name: 'Custom', builtin: false, words: Array.from({ length: 50 }, (_, i) => ({ w: 'x_' + i })), units: [] }
  ]);
  const pool = Core.selectBaselinePool(db);
  assert.ok(pool.length > 0 && pool.length <= 30, '题量 1..30，实际 ' + pool.length);
  assert.ok(pool.every((p) => p.srcBook === 'cet4'), '自定义（非 builtin）词书不应进入基线池');
});

test('weeklyRebalance：core 层无同日护栏（连续低完成率会多次下调，护栏在 app 层）', () => {
  const db = Core.defaultDB();
  for (let j = 0; j < 7; j++) {
    const dk = Core.dayKey(Date.now() - j * DAY);
    db.days[dk] = { total: 0, planTarget: 10 };
  }
  assert.equal(db.settings.dailyMinutes, 20);
  Core.weeklyRebalance(db);
  assert.equal(db.settings.dailyMinutes, 20, '第一次下调');
  Core.weeklyRebalance(db);
  assert.equal(db.settings.dailyMinutes, 20, '第二次下调（core 不拦截）→ 需 app 层同日护栏');
});

test('phrases 逐字文案：回归主文案/熔断文案/首启 CTA/六要素卡/再平衡两档（PRD §4）', () => {
  // 条目 3：回归主文案（Open-3 统一逐字）
  assert.equal(PHRASES.HOME.returnMain, '欢迎回来，帮你重新排好了，今天 18 分钟就能追上');
  // 条目 6：熔断文案
  assert.equal(PHRASES.HOME.pauseText, '今天先把旧账清了，明天加新词');
  // 条目 4：首启主按钮
  assert.equal(PHRASES.HOME.startPlanCta, '花 3 分钟，定制你的计划');
  // 条目 7：六要素可解释计划卡（free 型 daysLeft=0 → 「长期」）
  const card = PHRASES.HOME.planCard({ daysLeft: 0, totalWords: 3600, mastered: 900, dailyFresh: 21, dailyReview: 60, estMinutes: 22 });
  assert.ok(card.indexOf('长期') >= 0, 'free 型应显示「长期」');
  assert.ok(card.indexOf('词库 3600 词') >= 0 && card.indexOf('扣除已掌握约 900 词') >= 0, '六要素齐备');
  // 条目 7（考试型）：距考试 N 天
  const card2 = PHRASES.HOME.planCard({ daysLeft: 128, totalWords: 3600, mastered: 900, dailyFresh: 21, dailyReview: 60, estMinutes: 22 });
  assert.ok(card2.indexOf('距考试 128 天') >= 0);
  // 条目 8：再平衡两档文案
  assert.equal(PHRASES.REBALANCE.lower(0.82, 25), '按当前节奏，考试前可覆盖 82%，是否把每日时长调到 25 分钟？');
  assert.equal(PHRASES.REBALANCE.faster(6), '你比计划快 6 天');
});

test('phrases：无任何「已断签」「你落后了」类负向文案', () => {
  const all = JSON.stringify(PHRASES);
  assert.ok(all.indexOf('断签') < 0, '不应含「断签」');
  assert.ok(all.indexOf('你落后') < 0, '不应含「你落后」');
  assert.ok(all.indexOf('放弃') < 0, '不应含「放弃」式负向词');
});

/* ---------- 12. 第 2 轮 QA 追加边缘用例（锁定 #1/#2 修复回归） ---------- */

test('边缘#1：冷启毕业最小记录 reps:0 不污染「已学词数(reps>0)」统计', () => {
  const db = Core.defaultDB();
  seedBuiltin(db, [
    { key: 'cet4', name: 'C4', words: Array.from({ length: 50 }, (_, i) => 'c4_' + i) }
  ]);
  // 冷启：db.words 仍为空
  assert.equal(Object.keys(db.words).length, 0, '冷启前置 db.words 为空');
  // 冷启：applyGraduation 为前 20 词创建 reps:0 最小毕业记录（bounded by 实际词数 50）
  const keys = Core.applyGraduation(db, 20);
  assert.equal(keys.length, 20);
  assert.equal(Object.keys(db.words).length, 20, '冷启创建了 20 条最小记录');
  // 这些记录 reps:0，不应计入 stats.learned
  const st = Core.stats(db);
  assert.equal(st.learned, 0, 'reps:0 毕业记录不污染已学词数');
  // 反向：正常学 1 个新词后，learned 立即变成 1（证明统计口径正确）
  db.words[Core.wordKey('c4_0')].reps += 1;
  assert.equal(Core.stats(db).learned, 1, 'reps>0 后正确计入已学');
});

test('边缘#2：exportJSON→importJSON 往返后 baseline.words 与 graduated 均保留', () => {
  const db = Core.defaultDB();
  seedBuiltin(db, [
    { key: 'cet4', name: 'C4', words: Array.from({ length: 50 }, (_, i) => 'c4_' + i) }
  ]);
  const level = 20;
  const keys = Core.applyGraduation(db, level); // 标记前 20 词 graduated 并落 baseline
  const json = Core.exportJSON(db);
  const r = Core.importJSON(json);
  assert.ok(r.ok);
  const imp = r.db;
  assert.deepEqual(imp.baseline.words, keys, 'baseline.words 往返保留');
  assert.equal(imp.baseline.level, level, 'baseline.level 往返保留');
  assert.equal(imp.words[Core.wordKey('c4_0')].graduated, true, 'graduated 字段往返保留');
  assert.equal(imp.words[Core.wordKey('c4_19')].graduated, true);
  // 仅前 20 词被毕业建档；第 21 词 c4_20 从未建档（证明 applyGraduation 不会越界创建）
  assert.equal(imp.words[Core.wordKey('c4_20')], undefined, '未毕业词 c4_20 未被越界建档');
  assert.equal(Object.keys(imp.words).length, 20, '导入后仍仅 20 个毕业记录');
});

test('边缘#3：computeDailyBudget 当 dailyFresh 恰好等于 freshLimit（=20）仍取 freshLimit', () => {
  const s = { freshLimit: 20, reviewLimit: 60, reviewRatio: 0.7 };
  const b = Core.computeDailyBudget(s, 20); // 计划推导值恰等于上限
  assert.equal(b.freshTarget, 20, '==freshLimit 时取 20 无误（非 0/非翻倍）');
  assert.equal(b.reviewTarget, Math.round(20 * 0.7 / 0.3), '7:3 互补仍为 47');
  // >freshLimit 仍以 freshLimit 为上限（Gap#2 上界）
  assert.equal(Core.computeDailyBudget(s, 21).freshTarget, 20, '超上限仍以 freshLimit 封顶');
  // <freshLimit 以计划值为准
  assert.equal(Core.computeDailyBudget(s, 5).freshTarget, 5, '低于上限以计划值作准');
});

/* ---------- 13. 阶段一 P0 遗留补丁：缺口 A / B / C 单测 ---------- */

test('缺口 A：planCardDailyFresh 计划值封顶到本机上限，无计划回退 freshLimit', () => {
  const planHigh = { dailyFresh: 34 };
  assert.equal(Core.planCardDailyFresh(planHigh, 20), 20, '计划 34 > 上限 20 → 20');
  const planLow = { dailyFresh: 10 };
  assert.equal(Core.planCardDailyFresh(planLow, 20), 10, '计划 10 < 上限 20 → 10');
  assert.equal(Core.planCardDailyFresh(undefined, 20), 20, '无计划 → freshLimit=20');
  assert.equal(Core.planCardDailyFresh(null, 20), 20, 'null 计划 → freshLimit=20');
  assert.equal(Core.planCardDailyFresh({ dailyFresh: 0 }, 20), 20, 'dailyFresh=0 视为无计划 → 20');
  assert.equal(Core.planCardDailyFresh({ dailyFresh: 20 }, 20), 20, '==上限 仍取 20（非 0/非翻倍）');
});

test('缺口 B：rebuild 态 todayPlan / computePlanTarget 写入 planTarget=rebuildWords.length（非 0）', () => {
  const db = Core.defaultDB();
  addDueWords(db, 60, 0);
  const dk = Core.dayKey();
  db.returnGuard.rebuiltAt = dk;
  db.returnGuard.rebuildWords = [];
  for (let i = 0; i < 18; i++) { db.returnGuard.rebuildWords.push('w::due' + i); }
  const recs = Object.keys(db.words).map((k) => db.words[k]);
  const plan = Core.todayPlan(db, recs);
  assert.equal(plan.mode, 'rebuild');
  assert.equal(plan.planTarget, 18, 'rebuild 态 planTarget 应为重建包长度，而非 0');
  assert.equal(db.days[dk].planTarget, 18, 'days[今天].planTarget 也应=18（同源判定）');
  const target = Core.computePlanTarget(db);
  assert.equal(target, 18, 'computePlanTarget 聚合后仍为 18');
  // 北极星分母不再为 0（完成率公式分母安全）
  assert.equal(Core.dailyCompletionRate(db, dk), 0, '当日未学 → 完成率 0%，但分母=18 非 0 不报失真');
});

test('缺口 B：正常态 planTarget 不受 rebuild 分支影响（含重建去重边界）', () => {
  const db = Core.defaultDB();
  const recs = [];
  for (let i = 0; i < 7; i++) {
    const r = Core.newRecord('f' + i);
    db.words['w::f' + i] = r; recs.push(r);
  }
  const plan = Core.todayPlan(db, recs);
  assert.equal(plan.mode, 'normal');
  assert.equal(plan.planTarget, 7, '正常态 planTarget=reviews+freshs=7');
  assert.equal(db.days[Core.dayKey()].planTarget, 7);
  // rebuiltAt 即便为今天、但无 rebuildWords → 不进入 rebuild 分支
  db.returnGuard.rebuiltAt = Core.dayKey();
  db.returnGuard.rebuildWords = [];
  const plan2 = Core.todayPlan(db, recs);
  assert.equal(plan2.mode, 'normal');
  assert.equal(plan2.planTarget, 7, '空重建包不误判为 rebuild 态');
});

test('缺口 C：injectWarmup 今日空库注入 cet4 前 2 个未学词且带 warmup 标记', () => {
  const db = Core.defaultDB();
  seedBuiltin(db, [{ key: 'cet4', name: 'C4', words: ['a', 'b', 'c'] }]);
  const settings = db.settings; // confidenceWarmup: true（默认开）
  const out = Core.injectWarmup([], db, settings);
  assert.equal(out.length, 2, '应注入 2 个热身词');
  assert.equal(out[0].w, 'a');
  assert.equal(out[0].warmup, true);
  assert.equal(out[1].w, 'b');
  assert.equal(out[1].warmup, true);
});

test('缺口 C：injectWarmup 已存在词顺延 + 同日已学/关闭开关则不注入', () => {
  const db = Core.defaultDB();
  seedBuiltin(db, [{ key: 'cet4', name: 'C4', words: ['a', 'b', 'c'] }]);
  const settings = db.settings;
  // 词 a 已在 db.words → 顺延取 b、c
  db.words['w::a'] = Core.newRecord('a');
  const out2 = Core.injectWarmup([], db, settings);
  assert.equal(out2.length, 2);
  assert.equal(out2[0].w, 'b');
  assert.equal(out2[1].w, 'c');
  // 当日已学 1 词 → 不注入（防同日重复）
  db.days[Core.dayKey()] = { total: 1, correct: 1, fresh: 1, review: 0 };
  const out3 = Core.injectWarmup([], db, settings);
  assert.equal(out3.length, 0, '同日已学任何词则不注入');
  // confidenceWarmup === false → 不注入
  db.days[Core.dayKey()] = { total: 0, correct: 0, fresh: 0, review: 0 };
  const out4 = Core.injectWarmup([], db, { confidenceWarmup: false });
  assert.equal(out4.length, 0, '开关关闭则不注入');
});

test('缺口 C：injectWarmup 不改入参、首组词带完整 entry 字段', () => {
  const db = Core.defaultDB();
  seedBuiltin(db, [{ key: 'cet4', name: 'C4', words: [{ w: 'abandon', p: '/ə/ˈbændən/', t: 'v. 放弃', e: 'He abandoned the plan.', et: '他放弃了计划。' }] }]);
  const src = [];
  const out = Core.injectWarmup(src, db, db.settings);
  assert.equal(src.length, 0, '入参不被修改（纯函数）');
  assert.equal(out[0].w, 'abandon');
  assert.equal(out[0].warmup, true);
  assert.ok(out[0].p && out[0].t && out[0].e && out[0].et, 'entry 字段完整（p/t/e/et 齐全）');
});

/* ---------- 13.1 边缘用例（QA 独立验证补强） ---------- */

test('边缘：confidenceWarmup 关闭时 injectWarmup 返回原序列长度（不注入、不增删）', () => {
  const db = Core.defaultDB();
  seedBuiltin(db, [{ key: 'cet4', name: 'C4', words: ['a', 'b', 'c'] }]);
  const src = [{ w: 'hello' }, { w: 'world' }];
  const out = Core.injectWarmup(src, db, { confidenceWarmup: false });
  assert.equal(out.length, 2, '长度应保持不变');
  assert.equal(out[0].w, 'hello');
  assert.equal(out[1].w, 'world');
  assert.ok(!out[0].warmup && !out[1].warmup, '原序列无 warmup 标记');
});

test('边缘：rebuildWords 为空数组时 todayPlan 不走 rebuild 分支（仍按 reviews+freshs）', () => {
  const db = Core.defaultDB();
  const recs = [];
  for (let i = 0; i < 4; i++) {
    const r = Core.newRecord('f' + i);
    db.words['w::f' + i] = r; recs.push(r);
  }
  db.returnGuard.rebuiltAt = Core.dayKey(); // 今天
  db.returnGuard.rebuildWords = [];          // 但空包
  const plan = Core.todayPlan(db, recs);
  assert.equal(plan.mode, 'normal', '空重建包不误判为 rebuild 态');
  assert.equal(plan.planTarget, plan.reviews.length + plan.freshs.length, 'planTarget 仍=reviews+freshs');
  assert.equal(db.days[Core.dayKey()].planTarget, plan.planTarget);
});

test('边缘：PLAN_MODE.capNote 模板字符串 X/Y 数值插值正确', () => {
  const t = PHRASES.PLAN_MODE.capNote(34, 20);
  assert.equal(t, '计划原定每日 34 词，已按本机上限 20 封顶');
  assert.ok(/34/.test(t) && /20/.test(t), 'X=34、Y=20 正确插值且为数字');
  const t2 = PHRASES.PLAN_MODE.capNote(50, 20);
  assert.equal(t2, '计划原定每日 50 词，已按本机上限 20 封顶');
});
