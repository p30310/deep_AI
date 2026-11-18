/* ============================================================
 * 健壮性回归：独立验证发现的 4 处低危偏差修复
 * 运行：node --test tests/core.test.hardening.mjs
 * 1) NaN / 脏计数字段统一归零，口径一致、不落盘成 null
 * 2) rhythmSummary.emptyDays 只记 total=0 的日
 * 3) gradeExam 对非法 session 返回 null 而非抛错
 * 4) 数值型 opts 对 NaN / Infinity / 非 number 回退默认值
 * 另含一组「正常路径不受守卫影响」的回归断言。
 * ============================================================ */
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const Core = require('../js/core.js');

const DAY = 24 * 3600 * 1000;
const AT = new Date('2026-11-14T10:00:00').getTime();

function knownDB(n) {
  const db = Core.defaultDB();
  for (let i = 0; i < n; i++) {
    const w = 'word' + String(i).padStart(2, '0');
    const r = Core.newRecord(w, 'cet4');
    r.reps = 6; r.lvl = 4; r.st = 'known'; r.due = AT + 30 * DAY;
    db.words[Core.wordKey(w)] = r;
  }
  return db;
}

function withExam(db) {
  db.exam.records.unshift({
    id: 'exam_1', at: AT, size: 10, correct: 7,
    weakKeys: ['w::a', 'w::b', 'w::c'], items: []
  });
  db.exam.lastAt = AT;
  return db;
}

/* ---------- 1. NaN / 脏计数字段 ---------- */

test('ensureSchema：binding 的 NaN / 负数 / 非 number 一律归零', () => {
  const db = knownDB(12);
  db.binding.totalPages = NaN;
  db.binding.issuedNoMax = NaN;
  Core.ensureSchema(db);
  assert.equal(db.binding.totalPages, 0);
  assert.equal(db.binding.issuedNoMax, 0);

  db.binding.totalPages = -5;
  db.binding.issuedNoMax = 'bad';
  Core.ensureSchema(db);
  assert.equal(db.binding.totalPages, 0);
  assert.equal(db.binding.issuedNoMax, 0);
});

test('syncBinding：NaN totalPages 被归零，凭据 pages 不是 NaN，整库可正常序列化', () => {
  const db = withExam(knownDB(52));
  db.binding.totalPages = NaN;
  db.binding.issuedNoMax = NaN;
  const r = Core.syncBinding(db, { at: AT });
  assert.equal(r.created.length, 1);
  assert.equal(db.binding.totalPages, 52);
  assert.equal(Number.isFinite(r.created[0].pages), true);
  assert.equal(r.created[0].pages, 52);
  assert.equal(JSON.stringify(db).includes('"totalPages":null'), false);
  assert.equal(JSON.stringify(db).includes('"pages":null'), false);
  assert.equal(Core.bindingProgress(db).totalPages, 52);
});

test('bindingProgress：NaN 字段读口径与写口径一致（返回 0 且不改库）', () => {
  const db = Core.defaultDB();
  db.binding.totalPages = NaN;
  db.binding.issuedNoMax = NaN;
  const p = Core.bindingProgress(db);
  assert.equal(p.totalPages, 0);
  assert.equal(p.maxNo, 0);
  assert.equal(p.nextNo, 1);
  assert.equal(p.needed, 50);
});

/* ---------- 2. rhythmSummary.emptyDays ---------- */

test('rhythmSummary：minAnswers>1 时「有作答但未达门槛」不计为空打开日', () => {
  const db = Core.defaultDB();
  db.days[Core.dayKey(AT)] = { total: 3, correct: 3, fresh: 0, review: 3 };
  db.days[Core.dayKey(AT - DAY)] = { total: 0, correct: 0, fresh: 0, review: 0 };
  const r = Core.rhythmSummary(db, { at: AT, windowDays: 7, minAnswers: 5 });
  assert.equal(r.activeDays, 0);
  assert.equal(r.emptyDays, 1, '只有 total=0 那天算空打开');
  assert.equal(r.longestGap, 7);
});

test('rhythmSummary：默认 minAnswers=1 下 emptyDays 行为不变', () => {
  const db = Core.defaultDB();
  db.days[Core.dayKey(AT)] = { total: 5, correct: 5, fresh: 0, review: 5 };
  db.days[Core.dayKey(AT - DAY)] = { total: 0, correct: 0, fresh: 0, review: 0 };
  const r = Core.rhythmSummary(db, { at: AT, windowDays: 7 });
  assert.equal(r.activeDays, 1);
  assert.equal(r.emptyDays, 1);
});

/* ---------- 3. gradeExam 非法 session ---------- */

test('gradeExam：keys 非数组时返回 null，不抛 TypeError', () => {
  const db = knownDB(12);
  assert.equal(Core.gradeExam(db, { keys: 123 }, []), null);
  assert.equal(Core.gradeExam(db, { keys: {} }, []), null);
  assert.equal(Core.gradeExam(db, { keys: 'abc' }, []), null);
  assert.equal(Core.gradeExam(db, null, []), null);
  assert.equal(Core.gradeExam(db, {}, []), null);
});

/* ---------- 4. 数值型 opts 兜底 ---------- */

test('startExam：size 为 NaN / Infinity / 非 number 时回退默认 10', () => {
  const db = knownDB(15);
  [NaN, Infinity, -Infinity, '3', null, {}, 0 / 0].forEach((bad) => {
    const r = Core.startExam(db, { at: AT, size: bad });
    assert.equal(r.ok, true, '入参 ' + String(bad));
    assert.equal(r.size, 10, '入参 ' + String(bad));
    assert.equal(r.keys.length, 10);
  });
});

test('examEligibility：minPool / cooldownDays / at 为 NaN 时用默认值，无 NaN 外泄', () => {
  const db = withExam(knownDB(12));
  const r = Core.examEligibility(db, { minPool: NaN, cooldownDays: NaN, at: NaN });
  assert.equal(Number.isFinite(r.minPool), true);
  assert.equal(r.minPool, Core.EXAM_DEFAULTS.minPool);
  assert.equal(r.cooldownDays, Core.EXAM_DEFAULTS.cooldownDays);
  assert.equal(Number.isFinite(r.daysSinceLast), true);
  assert.equal(Number.isFinite(r.poolSize), true);
  assert.equal(r.eligible, false, 'lastAt 已设且用 now() 判定 → 冷却期内');
});

test('examHistory：limit 为 NaN / 字符串时回退默认保留条数', () => {
  const db = Core.defaultDB();
  for (let i = 0; i < 12; i++) {
    db.exam.records.push({ id: 'e' + i, at: AT, size: 3, correct: 1, weakKeys: ['a', 'b'], items: [] });
  }
  assert.equal(Core.examHistory(db, { limit: NaN }).length, Core.EXAM_DEFAULTS.keepRecords);
  assert.equal(Core.examHistory(db, { limit: '3' }).length, Core.EXAM_DEFAULTS.keepRecords);
  assert.equal(Core.examHistory(db, { limit: Infinity }).length, Core.EXAM_DEFAULTS.keepRecords);
});

test('rhythmSummary：windowDays / minAnswers / at 为 NaN 时用默认值，不抛错', () => {
  const db = Core.defaultDB();
  const r = Core.rhythmSummary(db, { windowDays: NaN, minAnswers: NaN, at: NaN });
  assert.equal(r.windowDays, 28);
  assert.equal(r.activeDays, 0);
  assert.equal(r.longestGap, 28);
  assert.equal(r.ratio, 0);
});

test('syncBinding：at 为 NaN 时回退 now()，凭据日期为有限数', () => {
  const db = withExam(knownDB(52));
  const r = Core.syncBinding(db, { at: NaN });
  assert.equal(r.created.length, 1);
  assert.equal(Number.isFinite(r.created[0].at), true);
  assert.ok(Core.dayKey(r.created[0].at).length === 10);
});

/* ---------- 正常路径回归：守卫未改变合法入参行为 ---------- */

test('回归：合法 opts 与默认调用结果不变', () => {
  // 无抽测记录 → lastAt=0，冷却判定通过
  const plain = knownDB(15);
  assert.equal(Core.examEligibility(plain, { at: AT }).eligible, true);
  assert.equal(Core.startExam(plain, { at: AT, size: 3 }).size, 3);
  assert.equal(Core.startExam(plain, { at: AT, size: 999 }).size, 15);
  assert.equal(Core.gradeExam(plain, Core.startExam(plain, { at: AT }), []).size, 10);

  // 有抽测记录 → 冷却期内，但历史 / 凭据读取照常
  const db = withExam(knownDB(15));
  assert.equal(Core.examEligibility(db, { at: AT }).eligible, false);
  assert.equal(Core.examHistory(db, { limit: 1 }).length, 1);
  assert.equal(Core.rhythmSummary(db, { at: AT, windowDays: 7, minAnswers: 2 }).windowDays, 7);
  assert.equal(Core.syncBinding(db, { at: AT }).created.length, 0); // 未达 50 门槛
  assert.equal(Core.bindingProgress(db).needed, 50);
});

test('回归：既有 74 项所依赖的核心行为未受守卫影响', () => {
  const db = Core.defaultDB();
  const k = Core.wordKey('apple');
  Core.rateWord(db, k, 'know');
  assert.equal(db.words[k].lvl, 1);
  assert.equal(db.words[k].due - db.words[k].last, 2 * DAY);
  assert.equal(Core.computeDailyBudget(db.settings, 12).freshTarget, 12);
  assert.equal(Core.stats(db).learned, 1);
  assert.equal(Core.dailyCompletionRate(db, Core.dayKey()), 0);
  assert.equal(Core.ensureSchema(db), db);
});
