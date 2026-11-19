/* 遗忘曲线阶段一「让遗忘可测量」· 独立核心测试（卡片 #031 · G3 实现产物）
 * 依据：365-groups/G2-architecture/design-s1.md v1.1（D-065 终裁）
 * 只 require('../js/core.js')，不改既有 26 个测试文件任何一字。
 * 运行：node --test tests/core.test.s1.mjs（建议经根目录 node verify.mjs 门禁）
 */
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const Core = require('../js/core.js');
const DAY = Core.DAY_MS;
const SEGS = Core.INTERVAL_CONTRACT.segments;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const T0 = 1700000000000;

/** 固定时间执行 fn（now() 内部走 Date.now，单点 t） */
function withTime(fn, t = T0) {
  const orig = Date.now;
  Date.now = () => t;
  try { return fn(t); } finally { Date.now = orig; }
}

/** 三条 SRS 字段（不含 s1/evts 的事件内容） */
function srsFields(rec) {
  return ['lvl', 'due', 'st', 'wfix', 'wrong', 'reps', 'last', 'first', 'lastRating', 'correct']
    .reduce((o, k) => (o[k] = rec[k], o), {});
}

/* ============ 1 AC1：三分支加 s1 前后 SRS 逐字段一致 ============ */
test('S1-AC1 三分支加 s1 前后 lvl/due/st/wfix/wrong/reps/last/first 逐字段一致', () => {
  for (const rating of ['know', 'fuzzy', 'unknown']) {
    withTime((t) => {
      const a = Core.defaultDB();
      Core.rateWord(a, 'w::s1a', rating, 'flash');
      const b = Core.defaultDB();
      b.words['w::s1a'] = Core.newRecord('s1a');
      delete b.words['w::s1a'].s1;           // 模拟「加 s1 之前」的记录形状
      Core.rateWord(b, 'w::s1a', rating, 'flash');
      assert.deepEqual(srsFields(a.words['w::s1a']), srsFields(b.words['w::s1a']), rating + ' SRS 字段一致');
      assert.deepEqual(a.days, b.days, rating + ' 当日计数一致');
      assert.equal(a.words['w::s1a'].s1.length, 1, 's1 恰好 1 条');
    });
  }
});

/* ============ 2 AC1：evts 恰 4 键（D-065 核心守护） ============ */
test('S1-AC1 evts 元素 Object.keys().sort() 恰 4 键且条数不变（mode-attribution:28 不回归）', () => {
  const db = Core.defaultDB();
  Core.rateWord(db, 'w::a', 'know', 'choice');
  Core.rateWord(db, 'w::a', 'fuzzy');
  const rec = db.words['w::a'];
  assert.equal(rec.evts.length, 2);
  assert.deepEqual(Object.keys(rec.evts[0]).sort(), ['interval', 'rating', 't', 'type']);
  assert.deepEqual(Object.keys(rec.evts[1]).sort(), ['interval', 'rating', 't', 'type']);
  assert.equal(rec.evts[0].type, 'choice');
  assert.equal(rec.evts[1].type, null);
  assert.equal(db.schema, 3);
});

/* ============ 3 AC1：undoRate 一并回滚 evts 与 s1 ============ */
test('S1-AC1 undoRate 后本次 evts 与 s1 随 snap.rec 一并回滚', () => {
  const db = Core.defaultDB();
  Core.rateWord(db, 'w::u', 'know');
  const before = JSON.stringify(db.words['w::u']);
  const snap = Core.rateWord(db, 'w::u', 'fuzzy');
  const rec = db.words['w::u'];
  assert.equal(rec.evts.length, 2, '撤销前 evts 两条');
  assert.equal(rec.s1.length, 2, '撤销前 s1 两条');
  assert.ok(Core.undoRate(db, snap));
  assert.equal(JSON.stringify(db.words['w::u']), before, '整条记录（含 evts/s1）逐字节还原');
});

/* ============ 4 AC2：intervalSeg 十段 + 毫秒量纲 + 脏值 ============ */
test('S1-AC2 intervalSeg 覆盖 10 段、毫秒量纲与脏值兜底', () => {
  assert.equal(Core.intervalSeg(0, true), 'new');
  assert.equal(Core.intervalSeg(999 * DAY, true), 'new', 'isFirst 优先');
  assert.equal(Core.intervalSeg(600000, false), '10m', '10 分钟');
  assert.equal(Core.intervalSeg(28 * 3600000, false), '1d', 'fuzzy 28 小时 → 1d');
  for (const d of Core.LADDER_DAYS) { assert.equal(Core.intervalSeg(d * DAY, false), d + 'd'); }
  assert.equal(Core.intervalSeg(3 * DAY, false), 'other', '3 天非阶梯');
  for (const bad of [null, undefined, NaN, Infinity, -1, '1d']) {
    assert.equal(Core.intervalSeg(bad, false), '10m', String(bad) + ' → 10m');
  }
  assert.equal(Core.intervalSeg(DAY, 'yes'), '1d', 'isFirst 非 boolean 按 false');
});

/* ============ 5 AC2：collectS1Events 摊平注入 k、不写 db、确定性 ============ */
test('S1-AC2 collectS1Events 摊平各词 s1 注入 k、不改 db、同输入深度相等', () => {
  const db = Core.defaultDB();
  withTime(() => {
    Core.rateWord(db, 'w::b', 'know');
    Core.rateWord(db, 'w::a', 'fuzzy');
  });
  const before = JSON.stringify(db);
  const ev = Core.collectS1Events(db);
  assert.deepEqual(ev.map((e) => e.k).sort(), ['w::a', 'w::b'], '按词键摊平并注入 k');
  assert.deepEqual(Object.keys(ev[0]).sort(), Object.keys(db.words['w::a'].s1[0]).sort());
  assert.equal(JSON.stringify(db), before, '不写 db、不原地改 s1 元素');
  assert.deepEqual(Core.collectS1Events(db), ev, '同输入深度相等');
  assert.deepEqual(Core.collectS1Events(null), []);
  assert.deepEqual(Core.collectS1Events({}), []);
});

/* ============ 6 AC2：baselineReport 精确值 ============ */
test('S1-AC2 baselineReport sampleSize/retainedCount/retained 精确可手工复算', () => {
  const ev = [
    { k: 'a', at: 1, seg: '1d', retrievedOk: true },
    { k: 'b', at: 2, seg: '1d', retrievedOk: false },
    { k: 'c', at: 3, seg: '2d', retrievedOk: true }
  ];
  const r = Core.baselineReport(ev);
  assert.equal(r.length, 10);
  assert.deepEqual(r.map((x) => x.seg), SEGS);
  assert.equal(r[SEGS.indexOf('1d')].sampleSize, 2);
  assert.equal(r[SEGS.indexOf('1d')].retainedCount, 1);
  assert.equal(r[SEGS.indexOf('1d')].retained, 0.5);
  assert.equal(r[SEGS.indexOf('2d')].retained, 1);
});

/* ============ 7 AC2：同词同段取首次 + retrievedOk 缺失跳过 ============ */
test('S1-AC2 同词同段只取 at 最早一次；retrievedOk 缺失/非 boolean 整条跳过', () => {
  const ev = [
    { k: 'a', at: 30, seg: '1d', retrievedOk: false },  // 后到，应跳过
    { k: 'a', at: 10, seg: '1d', retrievedOk: true },   // 最早，计 1 票保留
    { k: 'b', at: 20, seg: '1d' },                      // 缺失 → 整条跳过
    { k: 'b', at: 21, seg: '1d', retrievedOk: 'true' }  // 非 boolean → 跳过
  ];
  const r = Core.baselineReport(ev);
  const one = r[SEGS.indexOf('1d')];
  assert.equal(one.sampleSize, 1, '仅 a 一票');
  assert.equal(one.retainedCount, 1, '取首次 true');
  assert.equal(one.retained, 1);
});

/* ============ 8 AC2：空段 retained=null，长度 10 顺序固定 ============ */
test('S1-AC2 空段 retained===null（非 0/NaN），输出长度 10 且顺序=INTERVAL_CONTRACT.segments', () => {
  const r = Core.baselineReport([]);
  assert.equal(r.length, 10);
  assert.deepEqual(r.map((x) => x.seg), SEGS);
  for (const x of r) {
    assert.equal(x.sampleSize, 0);
    assert.equal(x.retainedCount, 0);
    assert.equal(x.retained, null);
  }
  assert.deepEqual(Core.baselineReport(null), r);
});

/* ============ 9 AC3：falseKnownCandidates 严格判定（D-069：值域统一 'know'） ============ */
test('S1-AC3 falseKnownCandidates 命中 selfRating===\'know\'&&retrievedOk===false，输出 {k,at,seg}', () => {
  const ev = [
    { k: 'w::x', at: 123, seg: '2d', selfRating: 'know', retrievedOk: false },
    { k: 'w::y', at: 456, seg: '1d', selfRating: 'fuzzy', retrievedOk: false },   // 非 know 不符
    { k: 'w::z', at: 789, seg: '4d', selfRating: 'know', retrievedOk: true }      // 检索通过不符
  ];
  const c = Core.falseKnownCandidates(ev);
  assert.deepEqual(c, [{ k: 'w::x', at: 123, seg: '2d' }]);
  assert.deepEqual(Object.keys(c[0]).sort(), ['at', 'k', 'seg']);
  // D-069：obs 显式双信号（selfRating='know' + retrievedOk=false）可正向产出候选
  const db = Core.defaultDB();
  Core.rateWord(db, 'w::o', 'know', 'flash', { retrievedOk: false, selfRating: 'know' });
  const pos = Core.falseKnownCandidates(Core.collectS1Events(db));
  assert.equal(pos.length, 1, '正向双信号应产出 1 条候选');
  assert.equal(pos[0].k, 'w::o');
});

/* ============ 10 AC3：候选识别不改词状态 + 正反例 ============ */
test('S1-AC3 候选识别前后 JSON.stringify(db.words) 逐字节全等（纯只读）', () => {
  const db = Core.defaultDB();
  withTime(() => {
    Core.rateWord(db, 'w::1', 'know', 'flash', { selfRating: 'unknown', retrievedOk: false });
    Core.rateWord(db, 'w::2', 'know', 'flash', { selfRating: 'know', retrievedOk: false });
    Core.rateWord(db, 'w::3', 'fuzzy');
    Core.rateWord(db, 'w::4', 'unknown');
  });
  const before = JSON.stringify(db.words);
  const ev = Core.collectS1Events(db);
  const c = Core.falseKnownCandidates(ev);
  assert.equal(c.length, 1, '仅 w::2 的（know+false）构成候选');
  assert.equal(c[0].k, 'w::2');
  assert.equal(JSON.stringify(db.words), before, '候选识别不改写词状态');
  // 注入路径同样只读；反例不命中
  const injected = [{ k: 'w::9', at: 1, seg: '7d', selfRating: 'know', retrievedOk: false }];
  assert.equal(Core.falseKnownCandidates(injected).length, 1);
  assert.equal(Core.falseKnownCandidates([{ k: 'w::a', selfRating: 'know', retrievedOk: true }, { k: 'w::b', selfRating: 'fuzzy', retrievedOk: false }]).length, 0);
  assert.equal(JSON.stringify(db.words), before, '注入路径仍不写 db');
});

/* ============ 11 AC4：export→import s1 逐字段一致 ============ */
test('S1-AC4 exportJSON→importJSON 后词级 s1 事件逐字段一致', () => {
  const db = Core.defaultDB();
  withTime(() => {
    Core.rateWord(db, 'w::e', 'know', 'flash', { selfRating: 'fuzzy', retrievedOk: false });
    Core.rateWord(db, 'w::e', 'unknown');
  });
  const before = JSON.parse(JSON.stringify(db.words['w::e'].s1));
  const back = Core.importJSON(Core.exportJSON(db));
  assert.equal(back.ok, true);
  assert.deepEqual(back.db.words['w::e'].s1, before, '含 k/seg/retrievedOk/plannedDue 逐字段一致');
});

/* ============ 12 AC4：老库无 s1 — ensureSchema 不补、rateWord 惰性补、导出往返保留（D-066 方案 2'） ============ */
test('S1-AC4 老库（无 s1）ensureSchema 不补键、rateWord 惰性创建、导出往返保留、due 不变', () => {
  const legacy = Core.defaultDB();
  delete legacy.words;
  legacy.words = {};
  legacy.words['w::old'] = Core.newRecord('old');
  delete legacy.words['w::old'].s1;
  legacy.words['w::old'].due = T0 + DAY;
  legacy.words['w::old'].reps = 2;
  const back = Core.importJSON(JSON.stringify(legacy));
  assert.equal(back.ok, true);
  const rec = back.db.words['w::old'];
  assert.equal(Object.prototype.hasOwnProperty.call(rec, 's1'), false, 'ensureSchema 不补 s1（护 UI 全库 JSON 快照）');
  assert.equal(rec.due, T0 + DAY, 'due 不变');
  assert.deepEqual(Core.collectS1Events(back.db), []);
  assert.equal(Core.baselineReport([]).length, 10);
  assert.deepEqual(Core.falseKnownCandidates(null), []);
  assert.deepEqual(Core.dueSnapshot(back.db, T0), { at: T0, keys: [], count: 0 });
  Core.ensureSchema(back.db);
  assert.equal(Object.prototype.hasOwnProperty.call(back.db.words['w::old'], 's1'), false, 'ensureSchema 幂等仍不补');
  withTime(() => Core.rateWord(back.db, 'w::old', 'know'));
  assert.equal(back.db.words['w::old'].s1.length, 1, 'rateWord 惰性创建 s1');
  const round = Core.importJSON(Core.exportJSON(back.db));
  assert.equal(round.ok, true);
  assert.deepEqual(round.db.words['w::old'].s1, back.db.words['w::old'].s1, '导出往返逐字段保留 s1');
});

/* ============ 13 AC5：SCHEMA 恒 3，顶层键集不变 ============ */
test('S1-AC5 SCHEMA===3、ensureSchema 不增键、顶层键集不变、evts 非空不裁剪', () => {
  const db = Core.defaultDB();
  withTime(() => Core.rateWord(db, 'w::k', 'know'));
  const topKeys = Object.keys(db).sort();
  assert.equal(db.schema, 3);
  const evtsLen = db.words['w::k'].evts.length;
  Core.ensureSchema(db);
  assert.deepEqual(Object.keys(db).sort(), topKeys, '顶层键集不变');
  assert.equal(db.schema, 3);
  assert.equal(db.words['w::k'].evts.length, evtsLen, 'evts 非空内容不裁剪');
  assert.equal(db.words['w::k'].s1.length, 1);
  assert.equal(Object.prototype.hasOwnProperty.call(Core.newRecord('z'), 's1'), true);
});

/* ============ 14 AC5：新测试独立文件 + 门禁 EXPECT 同步 ============ */
test('S1-AC5 本套件为独立新文件（EXPECT 具体数字由 verify.mjs 自身校验，D-074）', () => {
  assert.equal(path.basename(HERE), 'tests');
  assert.equal(path.basename(fileURLToPath(import.meta.url)), 'core.test.s1.mjs');
  const vm = fs.readFileSync(path.resolve(HERE, '..', '..', 'verify.mjs'), 'utf8');
  assert.match(vm, /testFiles:\s*\d+/, 'verify.mjs 必有 EXPECT.testFiles');
  assert.match(vm, /testItems:\s*\d+/, 'verify.mjs 必有 EXPECT.testItems');
});

/* ============ 15 AC6：第二次 plannedDue=第一次 due，lateMs 公式 ============ */
test('S1-AC6 第二次 plannedDue===第一次落库 due；lateMs===max(0,at-plannedDue)', () => {
  const db = Core.defaultDB();
  withTime((t) => {
    Core.rateWord(db, 'w::p', 'know');
    Date.now = () => t + 5 * DAY + 3600000;  // 相对首次作答 5 天 + 1 小时
    Core.rateWord(db, 'w::p', 'fuzzy');
  });
  const s1 = db.words['w::p'].s1;
  assert.equal(s1[0].plannedDue, 0, '新词首次 plannedDue=0');
  assert.equal(s1[0].lateMs, 0);
  assert.equal(s1[1].plannedDue, s1[0].newIvl + s1[0].at, '第二次 plannedDue=第一次 due');
  // 首次 know → lvl1 → due=t+2d；实际作答 t+5d+1h → 超期 3d+1h
  // D-066：毫秒差值字段归整到整秒（本例 t 为整秒，归整后与原始差值同值）
  assert.equal(s1[1].lateMs, Math.round((s1[1].at - s1[1].plannedDue) / 1000) * 1000, 'lateMs 整秒归整');
  assert.equal(s1[1].lateMs, 3 * DAY + 3600000, '超期 3 天 + 1 小时');
  assert.equal(s1[1].newIvl, Math.round((db.words['w::p'].due - s1[1].at) / 1000) * 1000, 'newIvl 整秒归整');
  // 非整秒 t：at/actualAt/plannedDue 保留原始毫秒；lateMs/newIvl/prevIvl 归整到整秒
  const db2 = Core.defaultDB();
  withTime((t) => {
    Date.now = () => t + 123;
    Core.rateWord(db2, 'w::m', 'unknown');
    Date.now = () => t + 123 + DAY + 456;
    Core.rateWord(db2, 'w::m', 'fuzzy');
  });
  const m = db2.words['w::m'].s1;
  assert.equal(m[0].at % 1000, 123, 'at 保留原始毫秒');
  assert.equal(m[0].actualAt, m[0].at, 'actualAt=at 原始');
  assert.equal(m[0].lateMs % 1000, 0, 'lateMs 归整整秒');
  assert.equal(m[0].newIvl % 1000, 0, 'newIvl 归整整秒');
  assert.equal(m[1].prevIvl % 1000, 0, 'prevIvl 归整整秒');
});

/* ============ 16 AC6：at===actualAt===t 单次基准；fuzzy/unknown branch ============ */
test('S1-AC6 at===actualAt===t（单次基准）；fuzzy/unknown branch 正确', () => {
  withTime((t) => {
    const db = Core.defaultDB();
    Core.rateWord(db, 'w::f', 'fuzzy');
    Core.rateWord(db, 'w::u', 'unknown');
    for (const k of ['w::f', 'w::u']) {
      const e = db.words[k].s1[0];
      assert.equal(e.at, t);
      assert.equal(e.actualAt, t);
      assert.equal(e.at, e.actualAt);
    }
    assert.equal(db.words['w::f'].s1[0].branch, 'nextDay+4h');
    assert.equal(db.words['w::u'].s1[0].branch, '10m');
    assert.equal(db.words['w::f'].due - t, 28 * 3600000);
    assert.equal(db.words['w::u'].due - t, 10 * 60000);
  });
});

/* ============ 17 AC6：dueSnapshot 只读到期队列 ============ */
test('S1-AC6 dueSnapshot 只读推导 due<=at&&st!==known 键集，不写 days、不参与 todayPlan', () => {
  const db = Core.defaultDB();
  const at = T0 + 2 * DAY;
  db.words['w::a'] = Object.assign(Core.newRecord('a'), { due: T0 + DAY, reps: 1, st: 'learning' });
  db.words['w::b'] = Object.assign(Core.newRecord('b'), { due: T0 + 3 * DAY, reps: 1, st: 'learning' });
  db.words['w::c'] = Object.assign(Core.newRecord('c'), { due: T0 + DAY, reps: 1, st: 'known' });
  db.words['w::d'] = Object.assign(Core.newRecord('d'), { due: 0, reps: 0, st: 'new' });
  const before = JSON.stringify(db);
  const snap = Core.dueSnapshot(db, at);
  assert.deepEqual(snap, { at: at, keys: ['w::a'], count: 1 });
  assert.equal(JSON.stringify(db), before, '不写 db.days/任何 rec');
  assert.deepEqual(Core.dueSnapshot(db, at), snap, '确定性');
});

/* ============ 18 边界：五纯函数对 null/空/脏样本不抛错 ============ */
test('S1 边界 五个纯函数对 null/空/脏值一律不抛错并返回确定结构', () => {
  assert.doesNotThrow(() => Core.collectS1Events(null));
  assert.doesNotThrow(() => Core.collectS1Events({ words: { a: null, b: { s1: [1, null, 'x'] } } }));
  assert.doesNotThrow(() => Core.baselineReport([null, 1, { at: NaN, seg: '1d', retrievedOk: true }]));
  assert.doesNotThrow(() => Core.falseKnownCandidates(undefined));
  assert.deepEqual(Core.dueSnapshot({}, NaN), { at: 0, keys: [], count: 0 });
  assert.deepEqual(Core.dueSnapshot(null, T0), { at: T0, keys: [], count: 0 });
  assert.equal(Core.intervalSeg(Infinity, false), '10m');
});

/* ============ 19 纯读：五函数前后 db 逐字节全等 + 确定性 ============ */
test('S1 纯读 五函数前后 JSON.stringify(db) 逐字节全等、同输入两次深度相等', () => {
  const db = Core.defaultDB();
  withTime(() => {
    Core.rateWord(db, 'w::r', 'know');
    Core.rateWord(db, 'w::r', 'fuzzy');
  });
  const before = JSON.stringify(db);
  const ev = Core.collectS1Events(db);
  const r1 = Core.baselineReport(ev), r2 = Core.baselineReport(ev);
  const c1 = Core.falseKnownCandidates(ev), c2 = Core.falseKnownCandidates(ev);
  const d1 = Core.dueSnapshot(db, T0 + 10 * DAY), d2 = Core.dueSnapshot(db, T0 + 10 * DAY);
  assert.equal(JSON.stringify(db), before);
  assert.deepEqual(r1, r2);
  assert.deepEqual(c1, c2);
  assert.deepEqual(d1, d2);
});

/* ============ 20 隔离：强度层/保持率在有无 s1 时逐字段全等 ============ */
test('S1 隔离 strengthOf/strengthDue/retentionStats 在 s1 有无时逐字段全等', () => {
  const db = Core.defaultDB();
  withTime(() => {
    Core.rateWord(db, 'w::i', 'know');
    Core.rateWord(db, 'w::i', 'know');
  });
  const rec = db.words['w::i'];
  const k = 'w::i';
  const so1 = Core.strengthOf(db, k);
  const rt1 = Core.retentionStats(db);
  const sd1 = Core.strengthDue(rec, rec.evts);
  const withS1 = JSON.parse(JSON.stringify(rec.s1));
  delete rec.s1;
  assert.deepEqual(Core.strengthOf(db, k), so1, 'strengthOf 不读 s1');
  assert.deepEqual(Core.retentionStats(db), rt1, 'retentionStats 不读 s1');
  assert.deepEqual(Core.strengthDue(rec, rec.evts), sd1, 'strengthDue 不读 s1');
  rec.s1 = withS1;
  assert.equal(withS1.length > 0, true);
  // 口径隔离：baselineReport 取首次，retentionStats 取最近（互不包装）
  assert.equal(typeof Core.baselineReport === 'function' && typeof Core.retentionStats === 'function', true);
  assert.notEqual(Core.baselineReport, Core.retentionStats);
});
