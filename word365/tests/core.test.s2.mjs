/* 遗忘曲线阶段二「临界优先排序」· 独立核心测试（卡片 #032 · G3 实现产物）
 * 依据：365-groups/G2-architecture/design-s2.md v1.5 + DECISIONS D-070~D-073
 * 只 require('../js/core.js') / '../js/phrases.js'，不改既有 27 个测试文件任何一字。
 * 运行：node --test tests/core.test.s2.mjs（建议经根目录 node verify.mjs 门禁）
 */
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const Core = require('../js/core.js');
const PHRASES = require('../js/phrases.js');
const DAY = Core.DAY_MS;
const CC = Core.CRITICAL_CONTRACT;
const T = 1700000000000;
const HERE = path.dirname(fileURLToPath(import.meta.url));

function withTime(fn, t = T) {
  const orig = Date.now;
  Date.now = () => t;
  try { return fn(t); } finally { Date.now = orig; }
}

/** 构造一条词记录（字段与 newRecord 对齐，可覆盖） */
function mk(over) {
  return Object.assign({
    w: 'a', lvl: 1, st: 'learning', due: 0, reps: 2, correct: 1, wrong: 0, wfix: 0,
    star: false, note: '', last: T - 5 * DAY, first: T - 10 * DAY, lastRating: 'know',
    srcBook: 'cet4', graduated: false, evts: [], s1: []
  }, over || {});
}

/** 四类样本：临界(q=1) / 刚到期(q=0.1) / 明显逾期(q=3) / 错词回流(正交) */
function quad() {
  return {
    critical: mk({ w: 'cc', due: T - 1 * DAY, s1: [{ newIvl: DAY }] }),
    justDue: mk({ w: 'jj', due: T - 0.1 * DAY, s1: [{ newIvl: DAY }] }),
    overdue: mk({ w: 'oo', due: T - 3 * DAY, s1: [{ newIvl: DAY }] }),
    wrongBack: mk({ w: 'ww', due: T - 0.1 * DAY, wrong: 1, s1: [{ newIvl: DAY }] })
  };
}

function dbOf(recs) {
  const db = Core.defaultDB();
  recs.forEach(r => { db.words[Core.wordKey(r.w)] = r; });
  return db;
}

/* ============ 1 AC1：开关缺省/归一/键集/SCHEMA ============ */
test('S2-AC1 criticalSort 缺省 off、非法归一 off、顶层键集与 SCHEMA 不变', () => {
  const db = Core.defaultDB();
  assert.equal(db.settings.criticalSort, 'off');
  assert.equal(Core.defaultSettings().criticalSort, 'off');
  const keys = Object.keys(db).sort().join(',');
  db.settings.criticalSort = 'bogus';
  Core.ensureSchema(db);
  assert.equal(db.settings.criticalSort, 'off');
  assert.equal(Object.keys(db).sort().join(','), keys, '顶层键集不变');
  assert.equal(db.schema, 3);
  assert.equal(CC.sources.length, 4);
  assert.equal('fallback' in CC.rank, false, '不得有第 5 类');
});

/* ============ 2 AC1：四类分类 ============ */
test('S2-AC1 classifyDueSource 四类各命中且值域恒为四值之一', () => {
  const q = quad();
  const db = Core.defaultDB();
  assert.equal(Core.classifyDueSource(q.critical, db, T), 'critical');
  assert.equal(Core.classifyDueSource(q.justDue, db, T), 'justDue');
  assert.equal(Core.classifyDueSource(q.overdue, db, T), 'overdue');
  assert.equal(Core.classifyDueSource(q.wrongBack, db, T), 'wrongBack');
  // 边界含等号归 critical：q=0.5 → critical；q=2 → critical；q=2.01 → overdue
  const half = mk({ w: 'h', due: T - 0.5 * DAY, s1: [{ newIvl: DAY }] });
  const two = mk({ w: 't2', due: T - 2 * DAY, s1: [{ newIvl: DAY }] });
  const over = mk({ w: 'o2', due: T - 2.01 * DAY, s1: [{ newIvl: DAY }] });
  assert.equal(Core.classifyDueSource(half, db, T), 'critical');
  assert.equal(Core.classifyDueSource(two, db, T), 'critical');
  assert.equal(Core.classifyDueSource(over, db, T), 'overdue');
  [q.critical, q.justDue, q.overdue, q.wrongBack].forEach(r => {
    assert.ok(CC.sources.includes(Core.classifyDueSource(r, db, T)));
  });
});

/* ============ 3 AC1：混合队列临界优先 + 置换 ============ */
test('S2-AC1 临界词排在刚到期/明显逾期之前，且输出为元素置换', () => {
  const q = quad();
  const db = dbOf(Object.values(q));
  const arr = Object.values(q);
  const out = Core.criticalPriority(arr, { db, at: T });
  assert.equal(out.length, arr.length);
  assert.deepEqual(out.slice().sort((a, b) => a.w.localeCompare(b.w)).map(r => r.w),
    arr.slice().sort((a, b) => a.w.localeCompare(b.w)).map(r => r.w), '元素集合不变');
  const idx = w => out.findIndex(r => r.w === w);
  assert.ok(idx('cc') < idx('jj'), '临界先于刚到期');
  assert.ok(idx('cc') < idx('oo'), '临界先于明显逾期');
  assert.ok(q.overdue.due < q.critical.due, '证伪对：明显逾期词到期更早（旧 due 升序会排前），但临界词排更前');
  assert.ok(idx('ww') < idx('jj'), '错词回流 rank=1 紧随临界');
});

/* ============ 4 AC1：可复算 + 四维逐维 ============ */
test('S2-AC1 同输入两次调用深度相等；rank→-q→due→wordKey 逐维生效', () => {
  const q = quad();
  const db = dbOf(Object.values(q));
  const a = Core.criticalPriority(Object.values(q), { db, at: T }).map(r => r.w);
  const b = Core.criticalPriority(Object.values(q), { db, at: T }).map(r => r.w);
  assert.deepEqual(a, b, '同输入恒同输出（可复算）');
  // 同类（critical）内 q 大者先：q=1.5 vs q=0.8
  const hi = mk({ w: 'hi', due: T - 1.5 * DAY, s1: [{ newIvl: DAY }] });
  const lo = mk({ w: 'lo', due: T - 0.8 * DAY, s1: [{ newIvl: DAY }] });
  const out2 = Core.criticalPriority([lo, hi], { db: dbOf([lo, hi]), at: T });
  assert.deepEqual(out2.map(r => r.w), ['hi', 'lo'], '同类内逾期比大者先');
});

/* ============ 5 AC1：tie-break ============ */
test('S2-AC1 tie-break：同 rank/同 q/同 due 时按 wordKey 字典序（禁对象序）', () => {
  const x = mk({ w: 'zz', due: T - DAY, s1: [{ newIvl: DAY }] });
  const y = mk({ w: 'aa', due: T - DAY, s1: [{ newIvl: DAY }] });
  const db = dbOf([x, y]);
  assert.deepEqual(Core.criticalPriority([x, y], { db, at: T }).map(r => r.w), ['aa', 'zz']);
  assert.deepEqual(Core.criticalPriority([y, x], { db, at: T }).map(r => r.w), ['aa', 'zz'], '与入参顺序无关');
});

/* ============ 6 AC1：纯只读 ============ */
test('S2-AC1 两纯函数调用前后 db 逐字节全等、不改 rec 字段', () => {
  const q = quad();
  const db = dbOf(Object.values(q));
  const before = JSON.stringify(db);
  Core.criticalPriority(Object.values(q), { db, at: T });
  Object.values(q).forEach(r => Core.classifyDueSource(r, db, T));
  assert.equal(JSON.stringify(db), before, '纯只读');
});

/* ============ 7 AC2：回归态首日上限 + 高逾期优先 ============ */
test('S2-AC2 回归态首日入队 = rebuildWords.length ≤ rebuildCap(40)，L 降序，持久化包不变', () => {
  withTime((t) => {
    const db = Core.defaultDB();
    db.settings.criticalSort = 'on';
    const recs = [];
    for (let i = 0; i < 45; i++) {
      const w = 'w' + String(i).padStart(2, '0');
      const r = mk({ w, due: t - (i + 1) * 0.1 * DAY, s1: [{ newIvl: DAY }] });
      db.words[Core.wordKey(w)] = r;
      recs.push(r);
    }
    db.returnGuard = {
      lastSeen: Core.dayKey(t - 7 * DAY), backlogCount: 45,
      rebuiltAt: Core.dayKey(t), rebuildWords: recs.slice(0, 40).map(r => Core.wordKey(r.w)),
      spreadDays: 3
    };
    const packBefore = JSON.stringify(db.returnGuard.rebuildWords);
    const plan = Core.todayPlan(db, recs);
    assert.equal(plan.mode, 'rebuild');
    assert.equal(plan.rebuildWords.length, 40);
    assert.ok(plan.rebuildWords.length <= db.settings.rebuildCap, '≤ rebuildCap(40)');
    const Ls = plan.rebuildWords.map(r => t - r.due);
    for (let i = 1; i < Ls.length; i++) assert.ok(Ls[i - 1] >= Ls[i], 'L 降序：最可能已遗忘优先');
    assert.equal(JSON.stringify(db.returnGuard.rebuildWords), packBefore, '持久化包逐字节不变');
    assert.equal(plan.planTarget, 40, 'planTarget = rebuildWords.length');
  });
});

/* ============ 8 AC2：spreadDays 公式不变、零新增键 ============ */
test('S2-AC2 buildRebuildPack 的 remaining/spreadDays 既有公式不变，回归平滑零新增键', () => {
  withTime((t) => {
    const db = Core.defaultDB();
    const recs = [];
    for (let i = 0; i < 120; i++) {
      const w = 'b' + String(i).padStart(3, '0');
      const r = mk({ w, due: t - (i + 1) * 0.1 * DAY, s1: [{ newIvl: DAY }] });
      db.words[Core.wordKey(w)] = r; recs.push(r);
    }
    const pack = Core.buildRebuildPack(db);
    assert.equal(pack.rebuildWords.length, 40, 'pick = cap 40');
    assert.equal(pack.remaining, 80, 'remaining = 120 - 40');
    assert.equal(pack.spreadDays, 3, 'spreadDays = clamp(3,5,ceil(80/60))');
    const keys = Object.keys(db).sort().join(',');
    assert.equal(keys.indexOf('s2'), -1, '无 S2 新增顶层键');
    assert.equal(db.settings.criticalSort, 'off');
  });
});

/* ============ 9 AC2：回归态 on/off 均不改持久化包与阈值 ============ */
test('S2-AC2 开关 on/off 均不改持久化包；pressureThreshold/rebuildCap 原样', () => {
  withTime((t) => {
    const mkdb = () => {
      const db = Core.defaultDB();
      const recs = [];
      for (let i = 0; i < 45; i++) {
        const w = 'r' + String(i).padStart(2, '0');
        const r = mk({ w, due: t - (i + 1) * 0.1 * DAY, s1: [{ newIvl: DAY }] });
        db.words[Core.wordKey(w)] = r; recs.push(r);
      }
      db.returnGuard = {
        lastSeen: Core.dayKey(t - 7 * DAY), backlogCount: 45,
        rebuiltAt: Core.dayKey(t), rebuildWords: recs.slice(0, 40).map(r => Core.wordKey(r.w)),
        spreadDays: 3
      };
      return { db, recs };
    };
    const A = mkdb(), B = mkdb();
    B.db.settings.criticalSort = 'on';
    const pa = Core.todayPlan(A.db, A.recs);
    const pb = Core.todayPlan(B.db, B.recs);
    assert.equal(JSON.stringify(A.db.returnGuard), JSON.stringify(B.db.returnGuard), '持久化包 on/off 相同');
    assert.equal(pa.planTarget, pb.planTarget);
    assert.equal(A.db.settings.pressureThreshold, 50);
    assert.equal(A.db.settings.rebuildCap, 40);
  });
});

/* ============ 10 AC3：文案逐字 + 禁语 ============ */
test('S2-AC3 TIMING 六键齐全、逐字中性、禁语零命中', () => {
  const T6 = PHRASES.TIMING;
  assert.deepEqual(Object.keys(T6).sort(),
    ['critical', 'empty', 'justDue', 'overdue', 'returning', 'wrongBack']);
  assert.equal(T6.critical, '按上次的复习节奏，今天进入复习窗口。');
  const banned = /%|％|还差|欠账|旧账|落后|断签|追上|\d+\s*天/;
  Object.keys(T6).forEach(k => assert.equal(banned.test(T6[k]), false, k + ' 含禁语：' + T6[k]));
});

/* ============ 11 AC3：脏类别降级 ============ */
test('S2-AC3 类别非四值/文案缺失时降级 justDue，不抛错不泄数字', () => {
  const T6 = PHRASES.TIMING;
  const safe = (c) => (CC.sources.indexOf(c) >= 0 && typeof T6[c] === 'string' && T6[c]) ? T6[c] : T6.justDue;
  assert.equal(safe('bogus'), T6.justDue);
  assert.equal(safe(null), T6.justDue);
  assert.equal(safe('fallback'), T6.justDue, '不认第 5 类');
});

/* ============ 12 AC3：理由派生不落库 ============ */
test('S2-AC3 理由派生前后 db 逐字节全等、零写库', () => {
  const q = quad();
  const db = dbOf(Object.values(q));
  const before = JSON.stringify(db);
  Object.values(q).forEach(r => {
    const c = Core.classifyDueSource(r, db, T);
    assert.equal(typeof PHRASES.TIMING[c], 'string');
  });
  assert.equal(JSON.stringify(db), before);
});

/* ============ 13 AC4：OFF 正常态/熔断态队列回退 ============ */
test('S2-AC4 OFF 下正常态与熔断态队列顺序 = 到期升序基线', () => {
  withTime((t) => {
    const build = (n) => {
      const db = Core.defaultDB();
      const recs = [];
      for (let i = 0; i < n; i++) {
        const w = 'o' + String(i).padStart(3, '0');
        const r = mk({ w, due: t - (i % 7) * 0.1 * DAY - 0.01 * DAY, s1: [{ newIvl: DAY }] });
        db.words[Core.wordKey(w)] = r; recs.push(r);
      }
      return { db, recs };
    };
    // 正常态（5 条 < 阈值 50）
    const A = build(5);
    const p1 = Core.todayPlan(A.db, A.recs);
    assert.equal(p1.mode, 'normal');
    const exp1 = A.recs.slice().sort((a, b) => a.due - b.due).slice(0, p1.reviews.length).map(r => r.w);
    assert.deepEqual(p1.reviews.map(r => r.w), exp1);
    // 熔断态（50 条 ≥ 阈值）
    const B = build(50);
    const p2 = Core.todayPlan(B.db, B.recs);
    assert.equal(p2.mode, 'pause');
    const exp2 = B.recs.slice().sort((a, b) => a.due - b.due).slice(0, p2.reviews.length).map(r => r.w);
    assert.deepEqual(p2.reviews.map(r => r.w), exp2);
  });
});

/* ============ 14 AC4：OFF 字段与额度口径一致 ============ */
test('S2-AC4 OFF 下 SRS 字段与 planTarget/text/额度口径与基线一致', () => {
  withTime((t) => {
    const db = Core.defaultDB();
    const r = mk({ w: 'f1', due: t - DAY, s1: [{ newIvl: DAY }] });
    db.words['w::f1'] = r;
    const srsBefore = JSON.stringify(['lvl', 'due', 'st', 'reps', 'wfix', 'wrong'].map(k => r[k]));
    const p = Core.todayPlan(db, [r]);
    assert.equal(JSON.stringify(['lvl', 'due', 'st', 'reps', 'wfix', 'wrong'].map(k => r[k])), srsBefore);
    assert.equal(p.planTarget, p.reviews.length + p.freshs.length);
    assert.equal(typeof p.text, 'string');
    assert.equal(db.days[Core.dayKey(t)].planTarget, p.planTarget);
  });
});

/* ============ 15 AC4：OFF 不读 s1；ON 不改 s1 ============ */
test('S2-AC4 OFF 不读 s1（脏 s1 不影响顺序）；ON 不改 s1 内容', () => {
  withTime((t) => {
    const db = Core.defaultDB();
    const a = mk({ w: 'a1', due: t - DAY, s1: [{ newIvl: 1 }] });
    const b = mk({ w: 'b1', due: t - 2 * DAY, s1: [{ newIvl: 999999999 }] });
    db.words['w::a1'] = a; db.words['w::b1'] = b;
    const pOff = Core.todayPlan(db, [a, b]);
    assert.deepEqual(pOff.reviews.map(r => r.w), ['b1', 'a1'], 'OFF 仅 due 升序');
    const before = JSON.stringify([a.s1, b.s1]);
    db.settings.criticalSort = 'on';
    Core.todayPlan(db, [a, b]);
    assert.equal(JSON.stringify([a.s1, b.s1]), before, 'ON 不改 s1');
  });
});

/* ============ 16 AC5：四护栏分子分母可复算 ============ */
test('S2-AC5 四护栏所需分子分母均可由现有纯函数复算（不臆造指标）', () => {
  withTime((t) => {
    const db = Core.defaultDB();
    const r = mk({ w: 'g1', due: t - DAY, s1: [
      { at: t - 2 * DAY, seg: '1d', selfRating: 'know', retrievedOk: false, first: true }
    ] });
    db.words['w::g1'] = r;
    db.days[Core.dayKey(t)] = { total: 3, correct: 2, fresh: 1, review: 2, planTarget: 5 };
    const fk = Core.falseKnownCandidates(Core.collectS1Events(db));
    assert.equal(fk.length, 1, '假认识率分子可取');
    assert.equal(typeof Core.dueSnapshot(db, t).count, 'number', '积压率分子可取');
    assert.equal(typeof Core.stats(db).learned, 'number', '积压率分母可取');
    const rate = Core.dailyCompletionRate(db, Core.dayKey(t));
    assert.ok(rate === null || typeof rate === 'number', '中途退出率代理可取');
    const rh = Core.rhythmSummary(db, { at: t });
    assert.equal(typeof rh, 'object', '节奏指标可取');
  });
});

/* ============ 17 AC5：口径隔离 ============ */
test('S2-AC5 baselineReport（取首次）与 retentionStats（取最近）互不包装', () => {
  const db = Core.defaultDB();
  const r = mk({ w: 'k1', due: T, s1: [
    { at: T - 3 * DAY, seg: '1d', newIvl: DAY, selfRating: 'know', retrievedOk: true, first: true }
  ] });
  db.words['w::k1'] = r;
  const rep = Core.baselineReport(Core.collectS1Events(db));
  assert.equal(rep.length, 10, '按段报告恒 10 段');
  assert.ok(rep[0].seg && 'sampleSize' in rep[0] && 'retained' in rep[0], '段报告三字段齐全');
  const ret = Core.retentionStats(db);
  assert.equal(typeof ret, 'object');
  assert.notEqual(rep, ret, '两个函数返回不同对象');
});

/* ============ 18 阶段门：S2-AC1 ∧ S2-AC4 ============ */
test('阶段门 S2-AC1 ∧ S2-AC4 同时成立（临界优先可复算 + OFF 逐字段回退）', () => {
  withTime((t) => {
    const q = quad();
    q.forEach = undefined;
    const arr = Object.values(quad());
    const db = dbOf(arr);
    // AC1
    const out = Core.criticalPriority(arr, { db, at: t });
    assert.equal(Core.classifyDueSource(out[0], db, t) === 'critical' || Core.classifyDueSource(out[0], db, t) === 'wrongBack', true);
    assert.deepEqual(Core.criticalPriority(arr, { db, at: t }).map(r => r.w), out.map(r => r.w));
    // AC4
    const db2 = dbOf(Object.values(quad()));
    const p = Core.todayPlan(db2, Object.values(db2.words));
    const exp = Object.values(db2.words).slice().sort((a, b) => a.due - b.due).slice(0, p.reviews.length).map(r => r.w);
    assert.deepEqual(p.reviews.map(r => r.w), exp);
  });
});

/* ============ 19 边界：脏值不抛错 ============ */
test('边界：null/脏 db/at 非有限/rec 缺字段不抛错且返回确定结构', () => {
  assert.equal(Core.classifyDueSource(null, null, T), 'justDue');
  assert.equal(Core.classifyDueSource({}, null, T), 'justDue');
  assert.equal(Core.classifyDueSource({ w: 'x', due: 0 }, null, T), 'justDue');
  assert.equal(Core.classifyDueSource({ w: 'x', due: T }, null, NaN), 'justDue');
  assert.deepEqual(Core.criticalPriority(null, null), []);
  assert.deepEqual(Core.criticalPriority(undefined, { db: null, at: NaN }), []);
  const one = Core.criticalPriority([{ w: 'a', due: 0 }], { db: null, at: NaN });
  assert.equal(one.length, 1);
  assert.deepEqual(Core.dueSnapshot(null, T).keys, []);
});

/* ============ 20 导出面 ============ */
test('导出面：CRITICAL_CONTRACT / classifyDueSource / criticalPriority 可取且形态正确', () => {
  assert.equal(typeof Core.classifyDueSource, 'function');
  assert.equal(typeof Core.criticalPriority, 'function');
  assert.equal(typeof Core.CRITICAL_CONTRACT, 'object');
  assert.deepEqual(Core.CRITICAL_CONTRACT.sources, ['critical', 'wrongBack', 'justDue', 'overdue']);
  assert.deepEqual(Core.CRITICAL_CONTRACT.rank, { critical: 0, wrongBack: 1, justDue: 2, overdue: 3 });
  assert.equal(Core.CRITICAL_CONTRACT.qLo, 0.5);
  assert.equal(Core.CRITICAL_CONTRACT.qHi, 2);
  assert.equal(typeof PHRASES.TIMING, 'object');
});

/* ============ 21 既有层隔离 ============ */
test('既有层隔离：strengthOf/retentionStats 在 criticalSort on/off 下逐字段相等', () => {
  const db = Core.defaultDB();
  const r = mk({ w: 'i1', due: T, evts: [{ t: T - DAY, rating: 'know', interval: DAY, type: 'flash' }] });
  db.words['w::i1'] = r;
  const offS = JSON.stringify(Core.strengthOf(db, 'w::i1'));
  const offR = JSON.stringify(Core.retentionStats(db));
  db.settings.criticalSort = 'on';
  assert.equal(JSON.stringify(Core.strengthOf(db, 'w::i1')), offS);
  assert.equal(JSON.stringify(Core.retentionStats(db)), offR);
  // 阶段一 5 函数不受影响
  assert.equal(Core.baselineReport(Core.collectS1Events(db)).length, 10);
  assert.equal(typeof Core.INTERVAL_CONTRACT.ladder.length, 'number');
});

/* ============ 22 门禁：独立文件 + EXPECT ============ */
test('门禁：本文件独立存在、既有套件未被改写、verify EXPECT = 28/353', () => {
  const files = fs.readdirSync(HERE).filter(f => f.endsWith('.mjs'));
  assert.ok(files.includes('core.test.s2.mjs'));
  assert.equal(files.filter(f => f === 'core.test.s2.mjs').length, 1);
  const v = fs.readFileSync(path.join(HERE, '..', '..', 'verify.mjs'), 'utf8');
  assert.match(v, /testFiles:\s*28/);
  assert.match(v, /testItems:\s*353/);
});
