/* ============================================================
 * v3.0 增量单元测试：已掌握词抽测 / 学习节律摘要
 * 运行：node --test tests/core.test.v3.mjs
 * 与既有测试同风格（node:test + assert/strict + createRequire）。
 * 重点验证：目标、使用条件、输入输出、边界情况，以及「既有行为未变」。
 * ============================================================ */
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const Core = require('../js/core.js');
const PHRASES = require('../js/phrases.js');

const DAY = 24 * 3600 * 1000;
const AT = new Date('2026-11-14T10:00:00').getTime();

/** 构造含 n 个「已掌握」词的 db；其余字段保持 defaultDB 原样。 */
function knownDB(n) {
  const db = Core.defaultDB();
  for (let i = 0; i < n; i++) {
    const w = 'word' + String(i).padStart(2, '0');
    const r = Core.newRecord(w, 'cet4');
    r.reps = 6;
    r.lvl = 4;
    r.st = 'known';
    r.due = AT + 30 * DAY;
    db.words[Core.wordKey(w)] = r;
  }
  return db;
}

function snapshotExceptExam(db) {
  const copy = JSON.parse(JSON.stringify(db));
  delete copy.exam;
  return JSON.stringify(copy);
}

/* ---------- A. examPool：输入 / 输出 / 边界 ---------- */

test('examPool 只收已掌握且作答过、未毕业的词，按 key 稳定排序', () => {
  const db = knownDB(3);
  db.words['w::learning'] = Object.assign(Core.newRecord('learning'), { reps: 5, st: 'learning' });
  db.words['w::fresh'] = Core.newRecord('fresh');                    // reps=0
  db.words['w::gone'] = Object.assign(Core.newRecord('gone'), { reps: 5, st: 'known', graduated: true });
  const pool = Core.examPool(db);
  assert.equal(pool.length, 3);
  assert.deepEqual(pool, [...pool].sort());
  assert.ok(pool.every((k) => k.startsWith('w::word')));
});

test('examPool：db / db.words 缺失时返回空数组，不抛错', () => {
  assert.deepEqual(Core.examPool(null), []);
  assert.deepEqual(Core.examPool({}), []);
  assert.deepEqual(Core.examPool({ words: null }), []);
});

/* ---------- B. examEligibility：使用条件 ---------- */

test('examEligibility：池不足 → pool-too-small，且返回门槛值', () => {
  const r = Core.examEligibility(knownDB(9), { at: AT });
  assert.equal(r.eligible, false);
  assert.equal(r.reason, 'pool-too-small');
  assert.equal(r.poolSize, 9);
  assert.equal(r.minPool, Core.EXAM_DEFAULTS.minPool);
});

test('examEligibility：从未抽测且池足 → 可发起，daysSinceLast=-1', () => {
  const r = Core.examEligibility(knownDB(12), { at: AT });
  assert.equal(r.eligible, true);
  assert.equal(r.reason, 'ok');
  assert.equal(r.daysSinceLast, -1);
  assert.equal(r.cooldownDays, 14);
});

test('examEligibility：冷却期内 → cooldown；期满 → ok', () => {
  const db = knownDB(12);
  db.exam.lastAt = AT - 5 * DAY;
  assert.equal(Core.examEligibility(db, { at: AT }).reason, 'cooldown');
  db.exam.lastAt = AT - 14 * DAY;
  assert.equal(Core.examEligibility(db, { at: AT }).eligible, true);
});

test('examEligibility：自定义 minPool / cooldownDays 生效', () => {
  const db = knownDB(3);
  const r = Core.examEligibility(db, { at: AT, minPool: 3, cooldownDays: 30 });
  assert.equal(r.eligible, true);
  assert.equal(r.minPool, 3);
  assert.equal(r.cooldownDays, 30);
});

test('examEligibility：db.exam 缺失（老库）视为从未抽测', () => {
  const db = knownDB(12);
  delete db.exam;
  assert.equal(Core.examEligibility(db, { at: AT }).eligible, true);
});

/* ---------- C. startExam：词表固化与边界 ---------- */

test('startExam：返回固化词表，keys 全在池内且不重复', () => {
  const db = knownDB(15);
  const p = Core.examPool(db);
  const r = Core.startExam(db, { at: AT });
  assert.equal(r.ok, true);
  assert.equal(r.size, 10);
  assert.equal(r.keys.length, 10);
  assert.equal(new Set(r.keys).size, 10);
  assert.ok(r.keys.every((k) => p.includes(k)));
  assert.equal(r.dateKey, Core.dayKey(AT));
});

test('startExam：同一 at 重复调用得到完全相同的词表（防重抽）', () => {
  const db = knownDB(20);
  const a = Core.startExam(db, { at: AT });
  const b = Core.startExam(db, { at: AT });
  assert.deepEqual(a.keys, b.keys);
  assert.equal(a.id, b.id);
});

test('startExam：size 被收敛到 [1, 池大小]', () => {
  const db = knownDB(11);
  assert.equal(Core.startExam(db, { at: AT, size: 3 }).size, 3);
  assert.equal(Core.startExam(db, { at: AT, size: 999 }).size, 11);
  assert.equal(Core.startExam(db, { at: AT, size: 0 }).size, 1);
});

test('startExam：不可发起时返回 ok:false + reason，且不写 db', () => {
  const db = knownDB(5);
  const before = JSON.stringify(db);
  const r = Core.startExam(db, { at: AT });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'pool-too-small');
  assert.equal(r.keys, undefined);
  assert.equal(JSON.stringify(db), before);
});

test('startExam：不修改 db 的任何字段（纯函数）', () => {
  const db = knownDB(12);
  const before = JSON.stringify(db);
  Core.startExam(db, { at: AT });
  assert.equal(JSON.stringify(db), before);
});

/* ---------- D. gradeExam：输入输出与判定边界 ---------- */

test('gradeExam：忽略大小写与首尾空白；正确/错误/缺答混合统计正确', () => {
  const db = knownDB(3);
  const s = Core.startExam(db, { at: AT, minPool: 3, size: 3 });
  const [k0, k1, k2] = s.keys;
  const w0 = db.words[k0].w, w1 = db.words[k1].w;
  const r = Core.gradeExam(db, s, [
    { key: k0, answer: '  ' + w0.toUpperCase() + '  ' },  // 大小写 + 空白 → 对
    { key: k1, answer: 'wrong-' + w1 },                    // 错
    { key: k2, answer: '' }                                // 缺答
  ]);
  assert.equal(r.size, 3);
  assert.equal(r.correct, 1);
  assert.equal(r.weakKeys.length, 2);
  assert.ok(r.weakKeys.includes(k1) && r.weakKeys.includes(k2));
  assert.equal(r.items.length, 3);
});

test('gradeExam：answers 顺序无关、多余项忽略、空 answers 视为全未写对', () => {
  const db = knownDB(3);
  const s = Core.startExam(db, { at: AT, minPool: 3, size: 3 });
  const [k0, k1, k2] = s.keys;
  const partial = [
    { key: 'w::not-in-session', answer: 'x' },
    { key: k2, answer: db.words[k2].w },
    { key: k0, answer: db.words[k0].w }
  ];
  const r = Core.gradeExam(db, s, partial);
  assert.equal(r.correct, 2);
  assert.deepEqual(r.weakKeys, [k1]);
  assert.equal(Core.gradeExam(db, s, []).correct, 0);
});

test('gradeExam：session 非法 → null；词条被删除时从 key 反推 w，不抛错', () => {
  const db = knownDB(3);
  assert.equal(Core.gradeExam(db, null, []), null);
  assert.equal(Core.gradeExam(db, {}, []), null);
  const s = Core.startExam(db, { at: AT, minPool: 3, size: 3 });
  const k0 = s.keys[0];
  const w0 = db.words[k0].w;
  delete db.words[k0];
  const r = Core.gradeExam(db, s, [{ key: k0, answer: w0 }]);
  assert.equal(r.items[0].w, w0);
  assert.equal(r.items[0].ok, true);
});

test('gradeExam：不修改 db（纯函数）', () => {
  const db = knownDB(12);
  const s = Core.startExam(db, { at: AT });
  const before = JSON.stringify(db);
  Core.gradeExam(db, s, s.keys.map((k) => ({ key: k, answer: db.words[k].w })));
  assert.equal(JSON.stringify(db), before);
});

/* ---------- E. commitExam：落库边界与兼容 ---------- */

test('commitExam：写 records / flags / lastAt，且不触碰 words / days / settings', () => {
  const db = knownDB(12);
  const s = Core.startExam(db, { at: AT });
  const rec = Core.gradeExam(db, s, s.keys.slice(0, 2).map((k) => ({ key: k, answer: db.words[k].w })));
  const before = snapshotExceptExam(db);
  assert.equal(Core.commitExam(db, rec), rec);
  assert.equal(snapshotExceptExam(db), before);
  assert.equal(db.exam.records.length, 1);
  assert.equal(db.exam.lastAt, rec.at);
  assert.equal(db.exam.flags.length, rec.weakKeys.length);
});

test('commitExam：records 只保留最近 10 条；flags 整体替换而非累加', () => {
  const db = knownDB(12);
  const s = Core.startExam(db, { at: AT });
  for (let i = 0; i < 13; i++) {
    const rec = Core.gradeExam(db, s, []);
    rec.id = 'r' + i;
    Core.commitExam(db, rec);
  }
  assert.equal(db.exam.records.length, 10);
  assert.equal(db.exam.records[0].id, 'r12');
  assert.equal(db.exam.flags.length, s.keys.length); // 每次替换，不累加到 13×10
});

test('commitExam：db / record 非法时返回 null，不抛错', () => {
  assert.equal(Core.commitExam(null, {}), null);
  assert.equal(Core.commitExam({}, null), null);
  assert.equal(Core.commitExam({}, { id: 'x' }), null);
});

test('commitExam：db.exam 缺失或字段类型异常时自动补齐', () => {
  const db = knownDB(10);
  delete db.exam;
  const s = Core.startExam(db, { at: AT });
  const rec = Core.gradeExam(db, s, []);
  Core.commitExam(db, rec);
  assert.ok(Array.isArray(db.exam.records));
  assert.ok(Array.isArray(db.exam.flags));
  assert.equal(db.exam.records.length, 1);

  const db2 = Core.defaultDB();
  db2.exam = { records: null, flags: 'bad', lastAt: 'bad' };
  Core.commitExam(db2, { id: 'x', at: AT, size: 1, correct: 0, weakKeys: [], items: [] });
  assert.ok(Array.isArray(db2.exam.records));
  assert.ok(Array.isArray(db2.exam.flags));
  assert.equal(typeof db2.exam.lastAt, 'number');
});

/* ---------- F. pendingReviewKeys / markReviewed ---------- */

test('pendingReviewKeys：只返回仍在 db.words 中的词，且是副本', () => {
  const db = knownDB(12);
  const keys = Core.examPool(db).slice(0, 3);
  db.exam.flags = keys.concat(['w::deleted']);
  const got = Core.pendingReviewKeys(db);
  assert.deepEqual(got, keys);
  got.push('w::mutated');
  assert.equal(db.exam.flags.includes('w::mutated'), false);
  assert.deepEqual(Core.pendingReviewKeys({ exam: null }), []);
  assert.deepEqual(Core.pendingReviewKeys({ exam: { flags: 'bad' } }), []);
});

test('markReviewed：只清指定 key，返回清除条数；非法入参返回 0 且不改库', () => {
  const db = knownDB(12);
  const keys = Core.examPool(db).slice(0, 3);
  db.exam.flags = keys.slice();
  assert.equal(Core.markReviewed(db, [keys[0]]), 1);
  assert.deepEqual(db.exam.flags, keys.slice(1));
  const before = JSON.stringify(db.exam);
  assert.equal(Core.markReviewed(db, null), 0);
  assert.equal(JSON.stringify(db.exam), before);
  assert.equal(Core.markReviewed({ exam: null }, keys), 0);
});

/* ---------- G. rhythmSummary：输入输出与边界 ---------- */

test('rhythmSummary：全无日记录 → 全 0，longestGap = windowDays', () => {
  const r = Core.rhythmSummary(Core.defaultDB(), { at: AT });
  assert.equal(r.windowDays, 28);
  assert.equal(r.activeDays, 0);
  assert.equal(r.emptyDays, 0);
  assert.equal(r.ratio, 0);
  assert.equal(r.medianGap, 0);
  assert.equal(r.longestGap, 28);
  assert.deepEqual(r.activeKeys, []);
});

test('rhythmSummary：有效学习日 / 空打开日 / ratio 计算正确', () => {
  const db = Core.defaultDB();
  const d0 = Core.dayKey(AT);
  const d1 = Core.dayKey(AT - DAY);
  const d2 = Core.dayKey(AT - 2 * DAY);
  db.days[d0] = { total: 8, correct: 6, fresh: 2, review: 6 };
  db.days[d1] = { total: 0, correct: 0, fresh: 0, review: 0, planTarget: 10 }; // 空打开
  db.days[d2] = { total: 12, correct: 10, fresh: 2, review: 10 };
  const r = Core.rhythmSummary(db, { at: AT, windowDays: 7 });
  assert.equal(r.activeDays, 2);
  assert.equal(r.emptyDays, 1);
  assert.equal(r.ratio, 2 / 7);
  assert.equal(r.medianGap, 2);
  assert.equal(r.longestGap, 4); // 窗口前 4 天（AT-6..AT-3）连续无学习
  assert.deepEqual(r.activeKeys, [d2, d0]);
});

test('rhythmSummary：窗口外日期忽略；minAnswers 生效', () => {
  const db = Core.defaultDB();
  db.days[Core.dayKey(AT - 40 * DAY)] = { total: 50, correct: 50, fresh: 0, review: 50 };
  db.days[Core.dayKey(AT)] = { total: 2, correct: 2, fresh: 0, review: 2 };
  assert.equal(Core.rhythmSummary(db, { at: AT, windowDays: 28 }).activeDays, 1);
  assert.equal(Core.rhythmSummary(db, { at: AT, windowDays: 28, minAnswers: 3 }).activeDays, 0);
  assert.equal(Core.rhythmSummary(db, { at: AT, windowDays: 1 }).activeDays, 1);
});

test('rhythmSummary：medianGap 偶数个间隔取中间两数平均（四舍五入）', () => {
  const db = Core.defaultDB();
  [0, 2, 5, 9].forEach((off) => {
    db.days[Core.dayKey(AT - off * DAY)] = { total: 5, correct: 5, fresh: 0, review: 5 };
  });
  const r = Core.rhythmSummary(db, { at: AT, windowDays: 10 });
  assert.equal(r.activeDays, 4);
  assert.deepEqual([2, 3, 4].includes(r.medianGap), true); // 间隔 2/3/4 → 中位 3
  assert.equal(r.medianGap, 3);
});

test('rhythmSummary：不写 db（纯读）', () => {
  const db = knownDB(12);
  const before = JSON.stringify(db);
  Core.rhythmSummary(db, { at: AT });
  assert.equal(JSON.stringify(db), before);
});

/* ---------- H. 兼容性：旧库 / 导入导出 / 既有 API / 文案 ---------- */

test('defaultDB 新增 exam 键，且既有顶层键与 settings 未减少', () => {
  const db = Core.defaultDB();
  assert.deepEqual(db.exam, { records: [], flags: [], lastAt: 0 });
  ['schema', 'createdAt', 'updatedAt', 'settings', 'petState', 'books', 'customBooks', 'words', 'days',
    'goal', 'plan', 'baseline', 'returnGuard', 'onboarding'].forEach((k) => {
    assert.ok(Object.prototype.hasOwnProperty.call(db, k), 'missing ' + k);
  });
  assert.equal(db.settings.freshLimit, 20);
  assert.equal(db.settings.dailyMinutes, 20);
  assert.equal(db.schema, 3);
});

test('ensureSchema 为老库补齐 exam，幂等且不覆盖已有值', () => {
  const db = Core.defaultDB();
  delete db.exam;
  Core.ensureSchema(db);
  assert.deepEqual(db.exam, { records: [], flags: [], lastAt: 0 });
  db.exam.flags = ['w::keep'];
  db.exam.lastAt = 123;
  Core.ensureSchema(db);
  assert.deepEqual(db.exam.flags, ['w::keep']);
  assert.equal(db.exam.lastAt, 123);
  Core.ensureSchema(db);
  assert.equal(db.exam.records.length, 0);
});

test('exportJSON / importJSON 往返保留 exam 数据（含 flags 与 records）', () => {
  const db = knownDB(12);
  const s = Core.startExam(db, { at: AT });
  const rec = Core.gradeExam(db, s, s.keys.slice(0, 1).map((k) => ({ key: k, answer: db.words[k].w })));
  Core.commitExam(db, rec);
  const back = Core.importJSON(Core.exportJSON(db));
  assert.equal(back.ok, true);
  assert.equal(back.db.exam.records.length, 1);
  assert.equal(back.db.exam.records[0].id, rec.id);
  assert.deepEqual(back.db.exam.flags, db.exam.flags);
  assert.equal(back.db.exam.lastAt, db.exam.lastAt);
  assert.equal(Object.keys(back.db.words).length, Object.keys(db.words).length);
});

test('导入无 exam 的旧备份 → ensureSchema 自动补齐，不报错', () => {
  const db = knownDB(11);
  delete db.exam;
  const back = Core.importJSON(JSON.stringify(db));
  assert.equal(back.ok, true);
  assert.deepEqual(back.db.exam, { records: [], flags: [], lastAt: 0 });
});

test('既有 API 行为未变：rateWord / stats / computeDailyBudget / todayPlan 冒烟', () => {
  const db = Core.defaultDB();
  const k = Core.wordKey('apple');
  Core.rateWord(db, k, 'know');
  assert.equal(db.words[k].lvl, 1);
  assert.equal(db.words[k].due - db.words[k].last, 2 * DAY);
  assert.equal(Core.statusOf(db, 'apple'), 'learning');

  const bud = Core.computeDailyBudget(db.settings, 12);
  assert.equal(bud.freshTarget, 12);
  assert.equal(bud.reviewTarget, 28);

  const st = Core.stats(db);
  assert.equal(st.learned, 1);
  assert.equal(st.totalAnswers, 1);

  const plan = Core.todayPlan(db, Object.keys(db.words).map((x) => db.words[x]));
  ['reviews', 'freshs', 'mode', 'pausedFresh', 'planTarget', 'text', 'rebuildWords'].forEach((x) => {
    assert.ok(Object.prototype.hasOwnProperty.call(plan, x), 'plan missing ' + x);
  });
  // 既有行为：todayPlan 会写 planTarget；apple 已答过且未到期时计划为 0 → 完成率 0
  assert.equal(Core.dailyCompletionRate(db, Core.dayKey()), 0);
  db.days[Core.dayKey()].planTarget = 1;
  assert.equal(Core.dailyCompletionRate(db, Core.dayKey()), 1);
});

test('新增文案组存在，模板函数插值正确，且不含评分/催促类措辞', () => {
  assert.equal(typeof PHRASES.EXAM, 'object');
  assert.equal(typeof PHRASES.RHYTHM, 'object');
  assert.equal(PHRASES.EXAM.question(2, 10, 'v. 放弃'), '第 2 / 10 页 · v. 放弃');
  assert.equal(PHRASES.EXAM.resultAll(10), '这 10 页仍是已掌握');
  assert.equal(PHRASES.EXAM.resultWeak(3), '3 页已回到待重读，已记在本周册页');
  assert.equal(PHRASES.EXAM.pending(2), '待重读（2）');
  assert.equal(PHRASES.EXAM.notReadyPool(10), '已掌握词满 10 个后可抽测');
  assert.equal(PHRASES.EXAM.notReadyCooldown(4), '距下次抽测还有 4 天');
  const all = JSON.stringify(PHRASES.EXAM);
  ['得分', '正确率', '达标', '优秀', '太棒了', '快去', '别忘'].forEach((w) => {
    assert.equal(all.includes(w), false, '禁止措辞: ' + w);
  });
});
