/* ============================================================
 * v3.0 第二批增量单元测试：抽测记录 / 装订凭据 / 星标词
 * 运行：node --test tests/core.test.v3b.mjs
 * 重点：目标、使用条件、输入输出、边界情况，以及「既有行为未变」。
 * ============================================================ */
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const Core = require('../js/core.js');
const PHRASES = require('../js/phrases.js');

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

function withExam(db, at) {
  const t = at == null ? AT : at;
  db.exam.records.unshift({
    id: 'exam_1', at: t, size: 10, correct: 7,
    weakKeys: ['w::a', 'w::b', 'w::c'], items: []
  });
  db.exam.lastAt = t;
  return db;
}

function snapshotExcept(db, keys) {
  const copy = JSON.parse(JSON.stringify(db));
  keys.forEach((k) => delete copy[k]);
  return JSON.stringify(copy);
}

/* ---------- D. examHistory：输入输出与边界 ---------- */

test('examHistory：规范化输出，按落库顺序，不含逐题明细', () => {
  const db = withExam(knownDB(12));
  db.exam.records.unshift({ id: 'exam_2', at: AT - DAY, size: 10, correct: 10, weakKeys: [], items: [] });
  const h = Core.examHistory(db);
  assert.equal(h.length, 2);
  assert.equal(h[0].id, 'exam_2');
  assert.equal(h[0].dateKey, Core.dayKey(AT - DAY));
  assert.equal(h[0].correct, 10);
  assert.equal(h[0].weakCount, 0);
  assert.equal(h[1].weakCount, 3);
  assert.equal(h[0].items, undefined);
  assert.deepEqual(Object.keys(h[0]).sort(), ['at', 'correct', 'dateKey', 'id', 'size', 'weakCount']);
});

test('examHistory：db / records 缺失或非数组 → []', () => {
  assert.deepEqual(Core.examHistory(null), []);
  assert.deepEqual(Core.examHistory({}), []);
  assert.deepEqual(Core.examHistory({ exam: { records: 'bad' } }), []);
});

test('examHistory：单条字段异常按 0 / 空串兜底，weakKeys 缺失时反推', () => {
  const db = Core.defaultDB();
  db.exam.records = [null, { id: 'x', size: 6, correct: 2, items: [1, 2, 3, 4, 5, 6] }];
  const h = Core.examHistory(db);
  assert.equal(h.length, 2);
  assert.equal(h[0].id, '');
  assert.equal(h[0].dateKey, '');
  assert.equal(h[0].size, 0);
  assert.equal(h[1].size, 6);
  assert.equal(h[1].weakCount, 4); // size - correct
});

test('examHistory：limit 收敛；返回副本不影响库；纯读不写 db', () => {
  const db = knownDB(12);
  for (let i = 0; i < 15; i++) {
    db.exam.records.push({ id: 'e' + i, at: AT, size: 3, correct: 1, weakKeys: ['a', 'b'], items: [] });
  }
  const before = JSON.stringify(db);
  assert.equal(Core.examHistory(db).length, Core.EXAM_DEFAULTS.keepRecords);
  assert.equal(Core.examHistory(db, { limit: 3 }).length, 3);
  assert.equal(Core.examHistory(db, { limit: 0 }).length, 1);
  assert.equal(Core.examHistory(db, { limit: 999 }).length, Core.EXAM_DEFAULTS.keepRecords);
  const got = Core.examHistory(db);
  got[0].size = 999;
  assert.notEqual(db.exam.records[0].size, 999);
  assert.equal(JSON.stringify(db), before);
});

/* ---------- E. masteredPages / bindingProgress：使用条件 ---------- */

test('masteredPages 与 examPool 同口径，排除未学/学习中/已毕业', () => {
  const db = knownDB(5);
  db.words['w::learning'] = Object.assign(Core.newRecord('learning'), { reps: 5, st: 'learning' });
  db.words['w::fresh'] = Core.newRecord('fresh');
  db.words['w::gone'] = Object.assign(Core.newRecord('gone'), { reps: 5, st: 'known', graduated: true });
  assert.equal(Core.masteredPages(db), 5);
  assert.deepEqual(Core.masteredPages(db), Core.examPool(db).length);
});

test('bindingProgress：无抽测结论 → canIssue=false（即使已掌握过 50）', () => {
  const p = Core.bindingProgress(knownDB(60));
  assert.equal(p.canIssue, false);
  assert.equal(p.mastered, 60);
  assert.equal(p.step, 50);
  assert.equal(p.nextNo, 1);
  assert.equal(p.needed, 50);
  assert.equal(p.issuedCount, 0);
});

test('bindingProgress：有抽测但未达门槛 → false；达标 → true', () => {
  assert.equal(Core.bindingProgress(withExam(knownDB(49))).canIssue, false);
  assert.equal(Core.bindingProgress(withExam(knownDB(50))).canIssue, true);
});

test('bindingProgress：db.binding 缺失或字段异常时按默认兜底，不抛错', () => {
  const db = withExam(knownDB(50));
  delete db.binding;
  assert.equal(Core.bindingProgress(db).canIssue, true);
  db.binding = { totalPages: 'bad', issued: null, issuedNoMax: -1 };
  const p = Core.bindingProgress(db);
  assert.equal(p.totalPages, 0);
  assert.equal(p.issuedCount, 0);
  assert.equal(p.nextNo, 1);
});

/* ---------- E. syncBinding：结算与边界 ---------- */

test('syncBinding：无抽测结论 → 不生成，仅单调更新 totalPages', () => {
  const db = knownDB(60);
  const before = snapshotExcept(db, ['binding']);
  const r = Core.syncBinding(db, { at: AT });
  assert.deepEqual(r.created, []);
  assert.equal(db.binding.totalPages, 60);
  assert.equal(db.binding.issued.length, 0);
  assert.equal(snapshotExcept(db, ['binding']), before);
});

test('syncBinding：生成一张凭据，字段为计数类且 issuedNoMax 推进', () => {
  const db = withExam(knownDB(52));
  const r = Core.syncBinding(db, { at: AT });
  assert.equal(r.created.length, 1);
  const item = r.created[0];
  assert.equal(item.no, 1);
  assert.equal(item.at, AT);
  assert.equal(item.pages, 52);
  assert.equal(item.examAt, AT);
  assert.equal(item.examSize, 10);
  assert.equal(item.examKept, 7);
  assert.equal(db.binding.issuedNoMax, 1);
  assert.deepEqual(Object.keys(item).sort(), ['at', 'examAt', 'examKept', 'examSize', 'no', 'pages']);
});

test('syncBinding：幂等，重复结算不重复生成同编号', () => {
  const db = withExam(knownDB(52));
  Core.syncBinding(db, { at: AT });
  const r2 = Core.syncBinding(db, { at: AT });
  assert.deepEqual(r2.created, []);
  assert.equal(db.binding.issued.length, 1);
});

test('syncBinding：第二里程碑生成 no=2；一次最多补一张（跳号逐张补齐）', () => {
  const db = withExam(knownDB(105));
  assert.equal(Core.syncBinding(db, { at: AT }).created[0].no, 1);
  assert.equal(Core.syncBinding(db, { at: AT }).created[0].no, 2);
  assert.deepEqual(Core.syncBinding(db, { at: AT }).created, []);
  assert.equal(db.binding.issuedNoMax, 2);
  assert.equal(db.binding.issued.length, 2);
});

test('syncBinding：totalPages 单调，已掌握回落时不减少', () => {
  const db = withExam(knownDB(60));
  Core.syncBinding(db, { at: AT });
  Object.keys(db.words).slice(0, 40).forEach((k) => { delete db.words[k]; });
  Core.syncBinding(db, { at: AT });
  assert.equal(db.binding.totalPages, 60);
  assert.equal(Core.masteredPages(db), 20);
});

test('syncBinding：只写 db.binding，不动 words / exam / days / settings', () => {
  const db = withExam(knownDB(52));
  const before = snapshotExcept(db, ['binding']);
  Core.syncBinding(db, { at: AT });
  assert.equal(snapshotExcept(db, ['binding']), before);
});

test('syncBinding：老库无 binding / 字段异常时自动补齐；db 非法返回空结果', () => {
  const db = withExam(knownDB(50));
  delete db.binding;
  Core.syncBinding(db, { at: AT });
  assert.ok(Array.isArray(db.binding.issued));
  assert.equal(typeof db.binding.issuedNoMax, 'number');
  const db2 = Core.defaultDB();
  db2.binding = { totalPages: null, issued: 'bad', issuedNoMax: null };
  Core.syncBinding(db2, { at: AT });
  assert.ok(Array.isArray(db2.binding.issued));
  assert.equal(typeof db2.binding.totalPages, 'number');
  assert.deepEqual(Core.syncBinding(null, {}), { created: [], totalPages: 0, nextNo: 1 });
});

/* ---------- E. deleteBinding：删除边界 ---------- */

test('deleteBinding：删除后不回退 totalPages / issuedNoMax，且不重发同编号', () => {
  const db = withExam(knownDB(52));
  Core.syncBinding(db, { at: AT });
  assert.equal(Core.deleteBinding(db, 1), 1);
  assert.equal(db.binding.issued.length, 0);
  assert.equal(db.binding.totalPages, 52);
  assert.equal(db.binding.issuedNoMax, 1);
  const r = Core.syncBinding(db, { at: AT });
  assert.deepEqual(r.created, []);
  assert.equal(r.nextNo, 2);
});

test('deleteBinding：编号不存在 / 入参非法 → 0，不改库', () => {
  const db = withExam(knownDB(52));
  Core.syncBinding(db, { at: AT });
  const before = JSON.stringify(db.binding);
  assert.equal(Core.deleteBinding(db, 999), 0);
  assert.equal(Core.deleteBinding(null, 1), 0);
  assert.equal(Core.deleteBinding({ binding: { issued: 'bad' } }, 1), 0);
  assert.equal(JSON.stringify(db.binding), before);
});

/* ---------- F. starredKeys ---------- */

test('starredKeys：只收 star=true，稳定排序，返回副本', () => {
  const db = knownDB(4);
  db.words['w::word00'].star = true;
  db.words['w::word03'].star = true;
  db.words['w::word01'].star = 0;
  const keys = Core.starredKeys(db);
  assert.deepEqual(keys, ['w::word00', 'w::word03']);
  assert.deepEqual(keys, [...keys].sort());
  keys.push('w::mutated');
  assert.equal(Core.starredKeys(db).includes('w::mutated'), false);
  assert.deepEqual(Core.starredKeys(null), []);
  assert.deepEqual(Core.starredKeys({ words: null }), []);
});

/* ---------- 兼容性与既有行为 ---------- */

test('defaultDB 新增 binding 键；既有顶层键与 settings 未减少', () => {
  const db = Core.defaultDB();
  assert.deepEqual(db.binding, { totalPages: 0, issued: [], issuedNoMax: 0 });
  ['schema', 'createdAt', 'updatedAt', 'settings', 'petState', 'books', 'customBooks', 'words', 'days',
    'goal', 'plan', 'baseline', 'returnGuard', 'onboarding', 'exam'].forEach((k) => {
    assert.ok(Object.prototype.hasOwnProperty.call(db, k), 'missing ' + k);
  });
  assert.equal(db.settings.freshLimit, 20);
  assert.equal(db.schema, 3);
});

test('ensureSchema 为老库补齐 binding，幂等且不覆盖已有值', () => {
  const db = Core.defaultDB();
  delete db.binding;
  Core.ensureSchema(db);
  assert.deepEqual(db.binding, { totalPages: 0, issued: [], issuedNoMax: 0 });
  db.binding.totalPages = 88;
  db.binding.issuedNoMax = 2;
  Core.ensureSchema(db);
  assert.equal(db.binding.totalPages, 88);
  assert.equal(db.binding.issuedNoMax, 2);
  Core.ensureSchema(db);
  assert.equal(db.binding.issued.length, 0);
});

test('exportJSON / importJSON 往返保留 binding 凭据', () => {
  const db = withExam(knownDB(52));
  Core.syncBinding(db, { at: AT });
  const back = Core.importJSON(Core.exportJSON(db));
  assert.equal(back.ok, true);
  assert.equal(back.db.binding.issued.length, 1);
  assert.equal(back.db.binding.issued[0].no, 1);
  assert.equal(back.db.binding.totalPages, 52);
  assert.equal(back.db.binding.issuedNoMax, 1);
  assert.equal(back.db.exam.records.length, 1);
});

test('导入无 binding 的旧备份 → ensureSchema 自动补齐', () => {
  const db = knownDB(11);
  delete db.binding;
  const back = Core.importJSON(JSON.stringify(db));
  assert.equal(back.ok, true);
  assert.deepEqual(back.db.binding, { totalPages: 0, issued: [], issuedNoMax: 0 });
});

test('既有 API 行为未变：rateWord / stats / dailyCompletionRate / examPool 冒烟', () => {
  const db = Core.defaultDB();
  const k = Core.wordKey('apple');
  Core.rateWord(db, k, 'know');
  assert.equal(db.words[k].lvl, 1);
  assert.equal(Core.statusOf(db, 'apple'), 'learning');
  assert.equal(Core.stats(db).learned, 1);
  assert.equal(Core.examPool(db).length, 0);
  assert.equal(Core.dailyCompletionRate(db, Core.dayKey()), 0); // planTarget=0 的既有语义
});

test('第二批文案组存在，模板插值正确，且不含评分/分享类措辞', () => {
  assert.equal(typeof PHRASES.HISTORY, 'object');
  assert.equal(typeof PHRASES.BINDING, 'object');
  assert.equal(PHRASES.HISTORY.row('2026-11-14', 10, 7, 3),
    '2026-11-14 · 抽看 10 页，7 页仍是已掌握，3 页待重读');
  assert.equal(PHRASES.BINDING.progress(52, 100), '已装订 52 页 · 下一张在 100 页');
  assert.equal(PHRASES.BINDING.rowTitle(2), '第 2 张');
  assert.equal(PHRASES.BINDING.star(3), '星标精读（3）');
  const all = JSON.stringify(PHRASES.HISTORY) + JSON.stringify(PHRASES.BINDING);
  ['得分', '正确率', '达标', '优秀', '太棒了', '一键复制', '分享给'].forEach((w) => {
    assert.equal(all.includes(w), false, '禁止措辞: ' + w);
  });
  // 「不生成图片、不分享」是必须保留的边界声明（否定式，不是功能）
  assert.ok(PHRASES.BINDING.hint.includes('不生成图片、不分享'));
});
