/* ============================================================
 * #027 长期答对情况 · 纯函数测试（D-054/D-055）
 * 运行：node --test tests/retention.test.mjs
 * 覆盖：G1 五词 fixture、状态位、边界、零写库、确定性。
 * ============================================================ */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const require_ = createRequire(import.meta.url);
const Core = require_(path.join(HERE, '..', 'js/core.js'));

const DAY = 86400000;
const T0 = new Date(2026, 8, 1).getTime();
const ev = (t, r) => ({ t, rating: r, interval: DAY, type: null });

/** 造库：entries = [{w, evts}] */
function mkDb(entries) {
  const db = { words: {} };
  entries.forEach((e) => { db.words['w::' + e.w] = { w: e.w, evts: e.evts }; });
  return db;
}

/* ---------- ① G1 五词 fixture：可判定 3（保留 a，未保留 b+e）、pending 2（c+d）、比率 1/3 ---------- */
test('五词 fixture：samples=3 retained=1 lost=2 pending=2 rate=1/3，pending 不入分母', () => {
  const db = mkDb([
    { w: 'a', evts: [ev(T0, 'know'), ev(T0 + 35 * DAY, 'know')] },
    { w: 'b', evts: [ev(T0, 'know'), ev(T0 + 35 * DAY, 'unknown')] },
    { w: 'c', evts: [ev(T0, 'know'), ev(T0 + 10 * DAY, 'know')] },
    { w: 'd', evts: [ev(T0, 'know')] },
    { w: 'e', evts: [ev(T0, 'know'), ev(T0 + 40 * DAY, 'fuzzy'), ev(T0 + 70 * DAY, 'know')] }
  ]);
  const r = Core.retentionStats(db);
  assert.equal(r.samples, 3, '可判定词数');
  assert.equal(r.retained, 1, '保留');
  assert.equal(r.lost, 2, '未保留（b+e）');
  assert.equal(r.pending, 2, '未到观察期（c+d）');
  assert.equal(r.samples, r.retained + r.lost, '分母恒等式');
  assert.ok(Math.abs(r.rate - 1 / 3) < 1e-12, 'rate = retained/samples');
  assert.equal(r.ratePct, 33, '整数百分比');
  assert.equal(r.window, 30, '默认窗口');
  assert.equal(r.state, 'insufficient', '样本 3 < 门槛 10');
});

/* ---------- ② 窗口内再答 → 锚点推进后仍能出观察（真实 SRS 阶梯必需） ---------- */
test('锚点推进：know@d0→know@d2→know@d58（间隔 2/56 天）应产生一次合格观察', () => {
  const db = mkDb([{ w: 'x', evts: [ev(T0, 'know'), ev(T0 + 2 * DAY, 'know'), ev(T0 + 58 * DAY, 'know')] }]);
  const r = Core.retentionStats(db);
  assert.equal(r.samples, 1, '应产生 1 次观察（不得恒空）');
  assert.equal(r.retained, 1, '第二次答对 → 保留');
  assert.equal(r.pending, 0, '不再计入 pending');
});

/* ---------- ③ 边界点：gap 29 天不构成、30 天构成 ---------- */
test('边界点：间隔 29 天不构成合格观察、30 天构成（下界含端点）', () => {
  const db29 = mkDb([{ w: 'a', evts: [ev(T0, 'know'), ev(T0 + 29 * DAY, 'know')] }]);
  assert.equal(Core.retentionStats(db29).samples, 0, '29 天不构成');
  assert.equal(Core.retentionStats(db29).pending, 1, '29 天 → pending');
  const db30 = mkDb([{ w: 'a', evts: [ev(T0, 'know'), ev(T0 + 30 * DAY, 'know')] }]);
  assert.equal(Core.retentionStats(db30).samples, 1, '30 天构成');
});

/* ---------- ④ 一词一票：多次合格观察只记 1 票，取最近一次 ---------- */
test('一词一票：同词两次合格观察 → 只记 1 票，结果取最近一次', () => {
  const db = mkDb([{ w: 'a', evts: [ev(T0, 'know'), ev(T0 + 35 * DAY, 'know'), ev(T0 + 70 * DAY, 'unknown')] }]);
  const r = Core.retentionStats(db);
  assert.equal(r.samples, 1, '一词一票');
  assert.equal(r.retained, 0, '取最近一次（末尾 unknown）→ 未保留');
  assert.equal(r.lost, 1, '未保留');
});

/* ---------- ⑤ 状态位与门槛 ---------- */
test('状态位：samples=0 → empty；9 → insufficient；10 → ok；rate 在 samples=0 时为 null', () => {
  const many = (n, ok) => {
    const arr = [];
    for (let i = 0; i < n; i++) {
      arr.push({ w: 'w' + i, evts: [ev(T0 + i * 1000, 'know'), ev(T0 + i * 1000 + 35 * DAY, ok ? 'know' : 'unknown')] });
    }
    return mkDb(arr);
  };
  assert.equal(Core.retentionStats(many(0, true)).state, 'empty');
  assert.equal(Core.retentionStats(many(9, true)).state, 'insufficient');
  assert.equal(Core.retentionStats(many(10, true)).state, 'ok');
  const empty = Core.retentionStats(many(0, true));
  assert.equal(empty.rate, null, '空样本 rate 必须是 null');
  assert.equal(empty.ratePct, null, '空样本 ratePct 必须是 null');
  assert.ok(empty.rate !== 0 && !Number.isNaN(empty.rate), '不得为 0 / NaN');
  assert.equal(Core.RETENTION_MIN_SAMPLES, 10, '门槛常量单一来源');
});

/* ---------- ⑥ 边界清单：脏值与异常输入一律不抛错 ---------- */
test('边界：脏 t / 脏 rating / 无 evts / 单事件 / 毕业词 / 空库 / 非法 days 均不抛错', () => {
  const db = mkDb([
    { w: 'noEvts', evts: [] },
    { w: 'single', evts: [ev(T0, 'know')] },
    { w: 'dirtyT', evts: [{ t: NaN, rating: 'know' }, { t: T0 + 40 * DAY, rating: 'know' }] },
    { w: 'dirtyRating', evts: [ev(T0, 'know'), ev(T0 + 40 * DAY, 'weird')] },
    { w: 'weirdStart', evts: [ev(T0, 'fuzzy'), ev(T0 + 40 * DAY, 'know')] }
  ]);
  db.words['w::graduated'] = { w: 'graduated', graduated: true, evts: [ev(T0, 'know'), ev(T0 + 40 * DAY, 'know')] };
  db.words['w::notArray'] = { w: 'notArray', evts: 'oops' };
  const r = Core.retentionStats(db);
  // 可判定：dirtyRating（脏 rating 作终点 → lost）+ graduated（毕业不排除 → retained）
  assert.equal(r.samples, 2, '可判定 2 个（脏 rating 终点 + 毕业词）');
  assert.equal(r.lost, 1, '脏 rating 作终点 → lost');
  assert.equal(r.retained, 1, '毕业词有合格观察时照常计入（不因毕业排除）');
  // pending：single（只有一条 know）+ dirtyT（NaN 事件剔除后只剩一条 know）+ weirdStart（仅 fuzzy 起点）
  assert.equal(r.pending, 3, '未到观察期 3 个');
  assert.equal(r.samples, r.retained + r.lost, 'pending 不入分母');
  assert.doesNotThrow(() => Core.retentionStats({}));
  assert.doesNotThrow(() => Core.retentionStats(null));
  assert.doesNotThrow(() => Core.retentionStats({ words: 'x' }));
  const empty = Core.retentionStats({});
  assert.equal(empty.state, 'empty');
  assert.equal(empty.samples, 0);
});

/* ---------- ⑦ opts 归一 ---------- */
test('opts.days：非法值一律归一到默认 30，合法值取整，不抛错', () => {
  const db = mkDb([{ w: 'a', evts: [ev(T0, 'know'), ev(T0 + 35 * DAY, 'know')] }]);
  assert.equal(Core.retentionStats(db, {}).window, 30);
  assert.equal(Core.retentionStats(db, { days: 0 }).window, 30);
  assert.equal(Core.retentionStats(db, { days: -5 }).window, 30);
  assert.equal(Core.retentionStats(db, { days: NaN }).window, 30);
  assert.equal(Core.retentionStats(db, { days: 'x' }).window, 30);
  assert.equal(Core.retentionStats(db, { days: 45.9 }).window, 45);
  assert.equal(Core.retentionStats(db, { days: 60 }).window, 60);
});

/* ---------- ⑧ 零写库 + 确定性 ---------- */
test('零写库：调用前后 db JSON 逐字节全等、顶层键集不变、schema 恒 3；同 db 两次调用深度相等', () => {
  const db = mkDb([
    { w: 'a', evts: [ev(T0, 'know'), ev(T0 + 35 * DAY, 'know')] },
    { w: 'b', evts: [ev(T0, 'know'), ev(T0 + 10 * DAY, 'unknown')] }
  ]);
  db.schema = 3;
  const before = JSON.stringify(db);
  const keysBefore = Object.keys(db).sort().join(',');
  const r1 = Core.retentionStats(db);
  const r2 = Core.retentionStats(db);
  assert.equal(JSON.stringify(db), before, 'db 必须逐字节未变');
  assert.equal(Object.keys(db).sort().join(','), keysBefore, '顶层键集不变');
  assert.equal(db.schema, 3, 'SCHEMA 恒 3');
  assert.deepEqual(r1, r2, '同 db 两次调用深度相等（确定性）');
});
