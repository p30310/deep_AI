/* core.js 单元测试：node --test tests/ */
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const Core = require('../js/core.js');

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

function freshDB() {
  const db = Core.defaultDB();
  db.words['w::apple'] = Core.newRecord('apple');
  return db;
}

test('认识 3 次 → lvl=3、间隔 7 天、st=known', () => {
  const db = freshDB();
  const key = 'w::apple';
  // 第 1 次：lvl 0→1，间隔 LADDER_DAYS[1]=2 天
  let snap = Core.rateWord(db, key, 'know');
  let rec = db.words[key];
  assert.equal(rec.lvl, 1);
  assert.equal(rec.st, 'learning');
  assert.ok(Math.abs(rec.due - (snap.rec.last + 2 * DAY)) < 2000 || rec.due > Date.now());

  // 第 2 次：lvl 1→2，间隔 4 天
  Core.rateWord(db, key, 'know');
  rec = db.words[key];
  assert.equal(rec.lvl, 2);
  assert.equal(rec.st, 'learning');

  // 第 3 次：lvl 2→3，间隔 LADDER_DAYS[3]=7 天 → 已掌握
  Core.rateWord(db, key, 'know');
  rec = db.words[key];
  assert.equal(rec.lvl, 3);
  assert.equal(rec.st, 'known');
  assert.ok(rec.due - rec.last >= 7 * DAY - 2000);
});

test('模糊 → due=+28h，lvl 不变，进错词本', () => {
  const db = freshDB();
  const key = 'w::apple';
  Core.rateWord(db, key, 'fuzzy');
  const rec = db.words[key];
  assert.equal(rec.lvl, 0);
  assert.equal(rec.st, 'learning');
  assert.equal(rec.wrong, 1);
  const delta = rec.due - rec.last;
  assert.ok(delta > 27 * HOUR && delta <= 28 * HOUR + 2000);
});

test('不认识 → lvl=0、due=+10min 且进错词本', () => {
  const db = freshDB();
  const key = 'w::apple';
  Core.rateWord(db, key, 'know');
  Core.rateWord(db, key, 'unknown');
  const rec = db.words[key];
  assert.equal(rec.lvl, 0);
  assert.equal(rec.st, 'learning');
  assert.equal(rec.wrong, 1);
  const delta = rec.due - rec.last;
  assert.ok(delta > 9 * 60 * 1000 && delta <= 10 * 60 * 1000 + 2000);
});

test('错词连对毕业：对 1 次 wfix=1 仍在 → 再对 1 次 wfix 达标自动移出', () => {
  const db = freshDB();
  const key = 'w::apple';
  Core.rateWord(db, key, 'unknown');      // 错 1 次收进
  assert.equal(db.words[key].wrong, 1);
  Core.rateWord(db, key, 'know');         // 对 1 次
  assert.equal(db.words[key].wfix, 1);
  assert.equal(db.words[key].wrong, 1);   // 仍在错词本
  Core.rateWord(db, key, 'know');         // 再对 1 次
  // wfix>=2 自动移出错词本（wrong=0, wfix=0）
  assert.equal(db.words[key].wrong, 0);
  assert.equal(db.words[key].wfix, 0);
  // 期间又答错 → wfix 归零
  Core.rateWord(db, key, 'fuzzy');
  assert.equal(db.words[key].wrong, 1);
  assert.equal(db.words[key].wfix, 0);
});

test('每日额度：新词答 5 个 fresh=5', () => {
  const db = freshDB();
  for (let i = 0; i < 5; i++) {
    db.words['w::w' + i] = Core.newRecord('w' + i);
  }
  for (let i = 0; i < 5; i++) {
    Core.rateWord(db, 'w::w' + i, 'know');
  }
  const day = db.days[Core.dayKey()];
  assert.equal(day.fresh, 5);
  assert.equal(day.total, 5);
  assert.equal(day.correct, 5);
});

test('今日计划：超新词上限后 freshs 不再增加；复习按 due 升序截断', () => {
  const db = freshDB();
  db.settings.freshLimit = 3;
  db.settings.reviewLimit = 2;
  const recs = [];
  for (let i = 0; i < 5; i++) {
    const r = Core.newRecord('fresh' + i);
    db.words['w::fresh' + i] = r;
    recs.push(r);
  }
  let plan = Core.todayPlan(db, recs);
  assert.equal(plan.freshs.length, 3);

  // 消耗完 3 个新词额度
  plan.freshs.forEach((r) => Core.rateWord(db, 'w::' + r.w, 'know'));
  plan = Core.todayPlan(db, recs);
  assert.equal(plan.freshs.length, 0); // 额度用尽（新词已学也不再属于 reps===0）

  // 复习：构造 3 个到期词，上限 2
  const now = Date.now();
  for (let i = 0; i < 3; i++) {
    const r = Core.newRecord('rev' + i);
    r.reps = 1;
    r.due = now - (3 - i) * HOUR; // i=0 最先到期
    db.words['w::rev' + i] = r;
  }
  const revRecs = ['rev0', 'rev1', 'rev2'].map((w) => db.words['w::' + w]);
  plan = Core.todayPlan(db, revRecs);
  assert.equal(plan.reviews.length, 2);
  assert.ok(plan.reviews[0].due <= plan.reviews[1].due); // due 升序
});

test('撤销评级：还原词条记录与当日计数', () => {
  const db = freshDB();
  const key = 'w::apple';
  const before = JSON.stringify(db.words[key]);
  const snap = Core.rateWord(db, key, 'know');
  assert.notEqual(JSON.stringify(db.words[key]), before);
  assert.equal(db.days[Core.dayKey()].total, 1);
  Core.undoRate(db, snap);
  assert.equal(JSON.stringify(db.words[key]), before);
  assert.equal(db.days[Core.dayKey()], undefined);
});

test('导出 → 清空 → 导入，进度一致', () => {
  const db = freshDB();
  Core.rateWord(db, 'w::apple', 'know');
  const json = Core.exportJSON(db);
  const db2 = Core.defaultDB();
  const res = Core.importJSON(json);
  assert.ok(res.ok, res.error || '');
  const imported = res.db;
  assert.equal(imported.words['w::apple'].reps, 1);
  assert.equal(imported.words['w::apple'].lvl, 1);
  assert.deepEqual(
    Object.keys(imported.words).sort(),
    Object.keys(db.words).sort()
  );
  void db2;
});

test('旧「词书::单词」键格式幂等迁移', () => {
  const db = freshDB();
  db.words['cet4::banana'] = Core.newRecord('banana', 'cet4');
  db.words['cet4::banana'].reps = 2;
  Core.migrateOldKeys(db);
  assert.ok(db.words['w::banana'], '应生成 w:: 键');
  assert.equal(db.words['w::banana'].reps, 2);
  assert.ok(!db.words['cet4::banana'], '旧键应被移除');
  // 幂等：再迁移一次无变化
  const snapshot = JSON.stringify(db.words);
  Core.migrateOldKeys(db);
  assert.equal(JSON.stringify(db.words), snapshot);
});

test('旧键与 w:: 键同时存在时以 w:: 为准（幂等不覆盖）', () => {
  const db = freshDB();
  db.words['cet4::cat'] = Core.newRecord('cat');
  db.words['cet4::cat'].reps = 1;
  db.words['w::cat'] = Core.newRecord('cat');
  db.words['w::cat'].reps = 9;
  Core.migrateOldKeys(db);
  assert.equal(db.words['w::cat'].reps, 9);
  assert.ok(!db.words['cet4::cat']);
});

test('错词本工具：wrongRecords / removeWrong / clearWrong', () => {
  const db = freshDB();
  db.words['w::dog'] = Core.newRecord('dog');
  Core.rateWord(db, 'w::dog', 'fuzzy');
  Core.rateWord(db, 'w::apple', 'unknown');
  assert.equal(Core.wrongRecords(db).length, 2);
  Core.removeWrong(db, 'w::dog');
  assert.equal(Core.wrongRecords(db).length, 1);
  Core.clearWrong(db);
  assert.equal(Core.wrongRecords(db).length, 0);
});

test('今日计划 scope：词书范围筛选但额度全局共享', () => {
  const db = freshDB();
  db.words['w::inbook'] = Core.newRecord('inbook');
  db.words['w::outside'] = Core.newRecord('outside');
  Core.rateWord(db, 'w::outside', 'know'); // 消耗 1 个新词额度
  const book = { key: 'b1', name: 'B1', words: [{ w: 'inbook' }], units: [{ name: 'U1', range: [0, 0] }] };
  Core.seedBooks(db, [book]);
  const recs = ['w::inbook'].map((k) => db.words[k]);
  const plan = Core.todayPlan(db, recs);
  // freshLimit=20，当日已用 1 → inbook 仍可学
  assert.equal(plan.freshs.length, 1);
});

test('自制词书：两种粘贴格式 + 内置匹配 + 书内去重', () => {
  const db = freshDB();
  const builtinIndex = { apple: { w: 'apple', p: '/ˈæpl/', t: 'n. 苹果', e: 'I eat an apple.', et: '我吃苹果。' } };
  const text = [
    'apple',
    'banana | /bəˈnænə/ | n. 香蕉 | Monkeys love bananas. | 猴子爱香蕉。',
    'apple',
    'zzzqqq'
  ].join('\n');
  const res = Core.createCustomBook(db, '我的词书', text, builtinIndex);
  assert.equal(res.book.words.length, 3); // apple 去重
  assert.equal(res.matched, 1);           // apple 命中内置
  assert.equal(res.book.words[1].t, 'n. 香蕉'); // 管道格式
  assert.equal(res.book.words[2].t, '');  // 占位词条
  // 删除词书不影响已学记录
  db.words['w::apple'] = Core.newRecord('apple');
  db.words['w::apple'].reps = 1;
  const ok = Core.deleteCustomBook(db, res.book.key);
  assert.ok(ok);
  assert.equal(db.customBooks.length, 0);
  assert.equal(db.words['w::apple'].reps, 1);
});

test('词书进度与状态查询', () => {
  const db = freshDB();
  const book = { key: 'b1', name: 'B1', words: [{ w: 'apple' }, { w: 'pear' }], units: [] };
  Core.seedBooks(db, [book]);
  Core.rateWord(db, 'w::apple', 'know');
  const pr = Core.bookProgress(db, Core.bookByKey(db, 'b1'));
  assert.equal(pr.learned, 1);
  assert.equal(pr.total, 2);
  assert.equal(Core.statusOf(db, 'apple'), 'learning');
  assert.equal(Core.statusOf(db, 'pear'), 'new');
});

test('stats：连续天数 / 正确率 / 已学 / 错词数', () => {
  const db = freshDB();
  Core.rateWord(db, 'w::apple', 'know');
  Core.rateWord(db, 'w::dog', 'unknown');
  const st = Core.stats(db);
  assert.equal(st.streak, 1);
  assert.equal(st.learned, 2);
  assert.equal(st.wrongCount, 1);
  assert.equal(st.totalAnswers, 2);
  assert.ok(Math.abs(st.accuracy - 0.5) < 1e-9);
});

test('searchEntries：前缀优先、释义可搜、限量', () => {
  const db = Core.defaultDB();
  Core.seedBooks(db, [
    { key: 'b1', name: 'B1', words: [{ w: 'apple', t: 'n. 苹果' }, { w: 'apply', t: 'v. 应用' }, { w: 'banana', t: 'n. 香蕉' }] }
  ]);
  const res = Core.searchEntries(db, 'app', 10);
  assert.equal(res.length, 2);
  assert.equal(res[0].entry.w, 'apple'); // 前缀命中排前（同为前缀则保持词书顺序）
  const res2 = Core.searchEntries(db, '香蕉', 10);
  assert.equal(res2[0].entry.w, 'banana');
  const res3 = Core.searchEntries(db, 'a', 2);
  assert.equal(res3.length, 2);
});

test('LADDER_DAYS 常量与 key 归一', () => {
  assert.deepEqual(Core.LADDER_DAYS, [1, 2, 4, 7, 15, 30, 60]);
  assert.equal(Core.wordKey('  Apple '), 'w::apple');
  assert.equal(Core.norm('BANANA'), 'banana');
});

/* ============ 以下为 QA 独立验证追加的边缘用例 ============ */

test('边缘：撤销新词首次评级（absent）应删键并清理当日计数', () => {
  const db = Core.defaultDB();
  assert.ok(!db.words['w::ghost'], '前置：词条不存在');
  const snap = Core.rateWord(db, 'w::ghost', 'know');
  assert.ok(snap.absent === true, '快照应标记 absent');
  assert.ok(db.words['w::ghost'], '评级后应自动建档');
  assert.equal(db.words['w::ghost'].reps, 1);
  assert.ok(db.days[Core.dayKey()], '当日计数应已建立');
  const undone = Core.undoRate(db, snap);
  assert.ok(undone);
  assert.ok(!db.words['w::ghost'], '撤销后新词记录应被删除');
  assert.equal(db.days[Core.dayKey()], undefined, '撤销后当日计数应被清理');
  // 再次评级可正常重新建档
  Core.rateWord(db, 'w::ghost', 'fuzzy');
  assert.equal(db.words['w::ghost'].reps, 1);
  assert.equal(db.words['w::ghost'].wrong, 1);
});

test('边缘：同一单词出现在两本词书时进度共享（一词一记录）', () => {
  const db = Core.defaultDB();
  const bookA = { key: 'a', name: 'A', builtin: true, words: [{ w: 'Apple' }, { w: 'pear' }], units: [] };
  const bookB = { key: 'b', name: 'B', builtin: true, words: [{ w: 'APPLE' }, { w: 'plum' }], units: [] };
  Core.seedBooks(db, [bookA, bookB]);
  // 在书 A 的语境下学习 apple（大写输入也应归一）
  Core.rateWord(db, 'w::apple', 'know');
  // 两本书的进度都应把 apple 计为已学
  assert.equal(Core.bookProgress(db, Core.bookByKey(db, 'a')).learned, 1);
  assert.equal(Core.bookProgress(db, Core.bookByKey(db, 'b')).learned, 1);
  // db.words 中只有一个 apple 记录
  assert.equal(Object.keys(db.words).filter((k) => k.indexOf('w::apple') === 0).length, 1);
  assert.equal(Core.statusOf(db, 'APPLE'), 'learning');
});

test('边缘：导入损坏 JSON 安全拒绝，不炸库', () => {
  // 非法 JSON 字符串
  const r1 = Core.importJSON('{not valid json!!!');
  assert.equal(r1.ok, false);
  assert.ok(r1.error && r1.error.length > 0);
  assert.equal(r1.db, null);
  // 合法 JSON 但缺 schema
  const r2 = Core.importJSON('{"words":{"w::a":{}}}');
  assert.equal(r2.ok, false);
  // null / 数组 / 字符串
  assert.equal(Core.importJSON('null').ok, false);
  assert.equal(Core.importJSON('[1,2,3]').ok, false);
  assert.equal(Core.importJSON('"just a string"').ok, false);
  // 有 schema 但缺其他字段 → 自动补默认，不抛异常
  const r3 = Core.importJSON('{"schema":3}');
  assert.equal(r3.ok, true);
  assert.deepEqual(r3.db.words, {});
  assert.deepEqual(r3.db.days, {});
  assert.ok(r3.db.settings && r3.db.settings.freshLimit === 20);
});

test('边缘：导出→导入→再导出 幂等（重复导入两次结果一致）', () => {
  const db = Core.defaultDB();
  db.words['cet4::banana'] = Core.newRecord('banana', 'cet4');
  db.words['cet4::banana'].reps = 2;
  Core.rateWord(db, 'w::apple', 'know');
  const json1 = Core.exportJSON(db);
  const imp1 = Core.importJSON(json1);
  assert.ok(imp1.ok);
  const json2 = Core.exportJSON(imp1.db);
  const imp2 = Core.importJSON(json2);
  assert.ok(imp2.ok);
  // 二次导入后 keys 与记录完全一致（不含 updatedAt 时间戳差异）
  assert.deepEqual(Object.keys(imp2.db.words).sort(), Object.keys(imp1.db.words).sort());
  assert.equal(imp2.db.words['w::apple'].reps, 1);
  assert.equal(imp2.db.words['w::banana'].reps, 2);
  assert.equal(JSON.stringify(imp2.db.words), JSON.stringify(imp1.db.words));
});

test('边缘：reviewLimit 截断后 due 升序保持（更多到期词）', () => {
  const db = Core.defaultDB();
  db.settings.reviewLimit = 3;
  const now = Date.now();
  const recs = [];
  // 8 个到期词，due 随机乱序
  const dues = [5, 1, 9, 3, 7, 2, 8, 4];
  for (let i = 0; i < 8; i++) {
    const r = Core.newRecord('rev' + i);
    r.reps = 1;
    r.due = now - dues[i] * HOUR;
    db.words['w::rev' + i] = r;
    recs.push(r);
  }
  const plan = Core.todayPlan(db, recs);
  assert.equal(plan.reviews.length, 3);
  for (let i = 1; i < plan.reviews.length; i++) {
    assert.ok(plan.reviews[i - 1].due <= plan.reviews[i].due, '必须按 due 升序');
  }
  // 最先到期的 3 个（dues 中最大值 9,8,7）
  const expected = recs.slice().sort((a, b) => a.due - b.due).slice(0, 3);
  assert.deepEqual(plan.reviews, expected);
});

test('边缘：跨天额度重置（days 按日期分键，昨日用量不影响今日）', () => {
  const db = Core.defaultDB();
  db.settings.freshLimit = 5;
  // 模拟昨天已用完新词额度
  const yesterday = new Date(Date.now() - Core.DAY_MS);
  const yKey = Core.dayKey(yesterday.getTime());
  db.days[yKey] = { total: 10, correct: 8, fresh: 5, review: 5 };
  const recs = [];
  for (let i = 0; i < 8; i++) {
    const r = Core.newRecord('w' + i);
    db.words['w::w' + i] = r;
    recs.push(r);
  }
  const plan = Core.todayPlan(db, recs);
  assert.equal(plan.freshs.length, 5, '今日新词额度应为 freshLimit=5，不受昨日影响');
  // 今日评级 1 个后，额度再减 1
  Core.rateWord(db, 'w::w0', 'know');
  const plan2 = Core.todayPlan(db, recs.filter((r) => r.reps === 0));
  assert.equal(plan2.freshs.length, 4);
  // 昨日键保持原样
  assert.equal(db.days[yKey].fresh, 5);
  assert.equal(db.days[Core.dayKey()].fresh, 1);
});

test('边缘：导入含旧键格式的整库后重复导入仍幂等', () => {
  const old = {
    schema: 2,
    settings: { freshLimit: 20, reviewLimit: 60 },
    words: { 'cet4::dog': { w: 'dog', reps: 3 }, 'cet6::cat': { w: 'cat', reps: 1 } },
    days: {}
  };
  const r1 = Core.importJSON(JSON.stringify(old));
  assert.ok(r1.ok);
  assert.deepEqual(Object.keys(r1.db.words).sort(), ['w::cat', 'w::dog']);
  const r2 = Core.importJSON(JSON.stringify(r1.db));
  assert.ok(r2.ok);
  assert.deepEqual(Object.keys(r2.db.words).sort(), ['w::cat', 'w::dog']);
  assert.equal(r2.db.words['w::dog'].reps, 3);
});

test('边缘：known 判定边界（lvl=3 但间隔<7 不算掌握；lvl=2 间隔>=7 也不算）', () => {
  const db = Core.defaultDB();
  const key = 'w::edge';
  // 连续认识 3 次：lvl 1→2→3，第 3 次间隔 7 天 → known
  Core.rateWord(db, key, 'know');
  Core.rateWord(db, key, 'know');
  Core.rateWord(db, key, 'know');
  assert.equal(db.words[key].lvl, 3);
  assert.equal(db.words[key].st, 'known');
  // 模糊一次 → 回退 learning，lvl 不变
  Core.rateWord(db, key, 'fuzzy');
  assert.equal(db.words[key].lvl, 3);
  assert.equal(db.words[key].st, 'learning');
  assert.equal(db.words[key].wrong, 1);
  // 再认识 → lvl=4，间隔 15 天，仍 known；wfix=1（错词未毕业）
  Core.rateWord(db, key, 'know');
  assert.equal(db.words[key].lvl, 4);
  assert.equal(db.words[key].st, 'known');
  assert.equal(db.words[key].wfix, 1);
  assert.ok(db.words[key].wrong > 0, '错词仍在错词本');
});
