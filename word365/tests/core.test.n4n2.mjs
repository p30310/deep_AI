/* N4 时长接线 + N2 默写阶梯 · 独立核心测试（#005 T01/T02 落地产物）
 * 独立于既有 7 文件（161 项），不修改任何既有断言；本文件为新增独立套件。
 * 覆盖：P1–P5 纯函数、computeDailyBudget→P2 同源、dailyCompletionRate 返回 null、
 *       weeklyRebalance 不写真源 + P5 档位查表（降量 20→10 不得 25）、
 *       buildPlan typeMix 加权均时（N4W-AC07）、ensureSchema 幂等加 ladder/byType。
 * 运行：node --test tests/core.test.n4n2.mjs
 */
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const Core = require('../js/core.js');
const PHRASES = require('../js/phrases.js');

const DAY = Core.DAY_MS;

function seedBuiltin(db, defs) {
  Core.seedBooks(db, defs.map(function (d) {
    return { key: d.key, name: d.name, builtin: true, words: d.words.map(function (w) {
      return typeof w === 'string' ? { w: w } : w;
    }), units: [] };
  }));
}

/* ============ P1 · minutesFreshCap ============ */
test('P1 minutesFreshCap：随 dailyMinutes 单调不减，默认档(20)≥freshLimit', () => {
  assert.ok(Core.minutesFreshCap(10) < Core.minutesFreshCap(20));
  assert.ok(Core.minutesFreshCap(20) < Core.minutesFreshCap(30));
  assert.ok(Core.minutesFreshCap(20) >= 20, '默认档 20 的时长侧上限 ≥ freshLimit(20)');
  // 非法/缺失 → Infinity（不封顶，交由 P2 的 freshLimit 兜底）
  assert.equal(Core.minutesFreshCap(undefined), Infinity);
  assert.equal(Core.minutesFreshCap(null), Infinity);
  assert.equal(Core.minutesFreshCap('x'), Infinity);
  // 低档小于 20（证明接线真的改变派词量）
  assert.ok(Core.minutesFreshCap(5) < 20);
});

/* ============ P2 · resolveFreshTarget / computeDailyBudget 同源 ============ */
test('P2 resolveFreshTarget 为唯一封顶点，computeDailyBudget 委托它', () => {
  const sDef = { dailyMinutes: 20, freshLimit: 20, reviewRatio: 0.7, reviewLimit: 60 };
  const s10 = { dailyMinutes: 10, freshLimit: 20, reviewRatio: 0.7, reviewLimit: 60 };
  // 默认档无计划 → 20（既有行为零改动）
  assert.equal(Core.computeDailyBudget(sDef, 0).freshTarget, 20);
  assert.equal(Core.resolveFreshTarget(sDef, 0), 20);
  // 接线：dailyMinutes=10 → 更少（10）
  assert.equal(Core.computeDailyBudget(s10, 0).freshTarget, 10);
  // 有计划的封顶仍由 P2 一处决定
  assert.equal(Core.computeDailyBudget(sDef, 34).freshTarget, 20, '计划 34 超 freshLimit → 封顶 20');
  assert.equal(Core.computeDailyBudget(sDef, 34).freshTarget, Core.resolveFreshTarget(sDef, 34));
  assert.equal(Core.computeDailyBudget(s10, 34).freshTarget, Core.resolveFreshTarget(s10, 34));
  // 单调不减：10 档 < 20 档
  assert.ok(Core.resolveFreshTarget(s10, 0) < Core.resolveFreshTarget(sDef, 0));
});

test('N4W-AC08：planCardDailyFresh === computeDailyBudget.freshTarget（反推值>cap 同取 cap）', () => {
  const db = Core.defaultDB();
  db.plan = { derivedAt: 1, totalWords: 100, mastered: 0, dailyFresh: 34, dailyReview: 20, estMinutes: 0, daysLeft: 5 };
  const s = db.settings; // dailyMinutes=20, freshLimit=20
  const bud = Core.computeDailyBudget(s, db.plan.dailyFresh);
  const card = Core.planCardDailyFresh(db.plan, s.freshLimit);
  assert.equal(card, 20);
  assert.equal(card, bud.freshTarget, '三者相等（计划卡 = 派词执行值 = 封顶 20）');
  // 低档(10)真正降低派词量（时间侧封顶生效）
  db.settings.dailyMinutes = 10;
  assert.equal(Core.computeDailyBudget(db.settings, db.plan.dailyFresh).freshTarget, 10);
});

/* ============ P3 · weightedEstMinutes / buildPlan typeMix ============ */
test('P3 weightedEstMinutes：无 typeMix 回退 35s；传 typeMix 加权均时', () => {
  const total = 20 + 47;
  assert.equal(Core.weightedEstMinutes(20, 47), Math.round(total * 35 / 60), '无 typeMix 回退 35s 单一公式');
  const balanced = { flash: { n: 1, ms: 35000 }, type: { n: 1, ms: 35000 }, choice: { n: 1, ms: 35000 } };
  const choice = { flash: { n: 1, ms: 35000 }, type: { n: 1, ms: 35000 }, choice: { n: 1, ms: 15000 } };
  const type = { flash: { n: 1, ms: 35000 }, type: { n: 1, ms: 50000 }, choice: { n: 1, ms: 35000 } };
  assert.ok(Core.weightedEstMinutes(20, 47, type) > Core.weightedEstMinutes(20, 47, choice), '全写英 > 全选义');
  assert.ok(Core.weightedEstMinutes(20, 47, type) > Core.weightedEstMinutes(20, 47, balanced));
  // 无 byType 数据 → 回退 35s（totN===0）
  assert.equal(Core.weightedEstMinutes(20, 47, { flash: { n: 0, ms: 0 }, type: { n: 0, ms: 0 }, choice: { n: 0, ms: 0 } }), Math.round(total * 35 / 60));
});

test('N4W-AC07：buildPlan(db, typeMix) 题型加权均时，全写英 > 全选义', () => {
  function mix(flashMs, typeMs, choiceMs) {
    return { flash: { n: 1, ms: flashMs }, type: { n: 1, ms: typeMs }, choice: { n: 1, ms: choiceMs } };
  }
  function planWith(m) {
    const db = Core.defaultDB();
    seedBuiltin(db, [{ key: 'cet4', name: 'C4', words: ['a', 'b', 'c', 'd'] }]);
    db.goal.type = 'cet46'; db.goal.deadline = null;
    return Core.buildPlan(db, m);
  }
  const pBal = planWith(mix(35000, 35000, 35000));
  const pChoice = planWith(mix(35000, 35000, 15000));
  const pType = planWith(mix(35000, 50000, 35000));
  assert.equal(pBal.dailyFresh, pChoice.dailyFresh); // 派词量相同（仅题型构成不同）
  assert.equal(pBal.dailyFresh, pType.dailyFresh);
  assert.ok(pType.estMinutes > pChoice.estMinutes, '全写英 estMinutes > 全选义 estMinutes（差值>0）');
});

test('buildPlan 不传 typeMix → estMinutes 回退 35s 公式（既有行为零改动）', () => {
  const db = Core.defaultDB();
  seedBuiltin(db, [{ key: 'cet4', name: 'C4', words: ['a', 'b', 'c', 'd'] }]);
  db.goal.type = 'cet46'; db.goal.deadline = null;
  const p = Core.buildPlan(db); // 无 typeMix
  assert.equal(p.estMinutes, Math.round((p.dailyFresh + p.dailyReview) * Core.SEC_PER_WORD / 60));
});

/* ============ P4 · resolveLadderMode ============ */
test('P4 resolveLadderMode：四~六档判定表（N2L-AC02~06）', () => {
  // 1. 对对碰短路
  assert.deepEqual(Core.resolveLadderMode({ sessionMode: 'match' }), { mode: 'match', hint: false });
  // 2. 新词卡不进阶梯
  assert.deepEqual(Core.resolveLadderMode({ cardKind: 'fresh' }), { mode: 'flash', hint: false });
  // 3. 手动模式沿用用户手选
  assert.deepEqual(Core.resolveLadderMode({ ladderMode: 'manual', userMode: 'choice', cardKind: 'review' }), { mode: 'choice', hint: false });
  // 4. 自动 + lvl0 → 选义、无提示
  assert.deepEqual(Core.resolveLadderMode({ ladderMode: 'auto', lvl: 0, cardKind: 'review' }), { mode: 'choice', hint: false });
  // 5. 自动 + lvl1/2 → 写英、有提示
  assert.deepEqual(Core.resolveLadderMode({ ladderMode: 'auto', lvl: 1, cardKind: 'review' }), { mode: 'type', hint: true });
  assert.deepEqual(Core.resolveLadderMode({ ladderMode: 'auto', lvl: 2, cardKind: 'review' }), { mode: 'type', hint: true });
  // 6. 自动 + lvl>=3 → 写英、关提示
  assert.deepEqual(Core.resolveLadderMode({ ladderMode: 'auto', lvl: 3, cardKind: 'review' }), { mode: 'type', hint: false });
  assert.deepEqual(Core.resolveLadderMode({ ladderMode: 'auto', lvl: 6, cardKind: 'review' }), { mode: 'type', hint: false });
});

/* ============ P5 · previousMinuteOption ============ */
test('P5 previousMinuteOption：严格小于当前档的最大档；最小档→null；结果≠25', () => {
  const opts = [10, 20, 30];
  assert.equal(Core.previousMinuteOption(20, opts), 10);
  assert.equal(Core.previousMinuteOption(30, opts), 20);
  assert.equal(Core.previousMinuteOption(10, opts), null, '最小档不反向升档');
  const r = Core.previousMinuteOption(30, opts);
  assert.ok(opts.indexOf(r) >= 0, '结果 ∈ options');
  assert.notEqual(r, 25, '不得产生非法档 25（非 dailyMinutes-5 算术）');
});

/* ============ dailyCompletionRate 返回 null（N4W-AC04） ============ */
test('dailyCompletionRate：空打开日(无 planTarget, total=0) 返回 null；有 planTarget 仍 0/比例', () => {
  const db = Core.defaultDB();
  const dk = Core.dayKey();
  db.days[dk] = { total: 0 }; // 无 planTarget
  assert.equal(Core.dailyCompletionRate(db, dk), null, '序3：空打开日 → null（非 0）');
  db.days[dk] = { total: 0, planTarget: 10 };
  assert.equal(Core.dailyCompletionRate(db, dk), 0, '序2：planTarget 存在(=0) → 0');
  db.days[dk] = { total: 5, planTarget: 10 };
  assert.equal(Core.dailyCompletionRate(db, dk), 0.5, '序2：比例口径不变');
  assert.equal(Core.dailyCompletionRate(db, 'nope'), 0, '序1：无 days[dk] → 0');
  // 无 planTarget 但 total>0 → 0（序4，保护既有断言）
  const db2 = Core.defaultDB();
  db2.days[Core.dayKey(Date.now() - DAY)] = { total: 1 };
  assert.equal(Core.dailyCompletionRate(db2, Core.dayKey(Date.now() - DAY)), 0);
});

/* ============ weeklyRebalance 只出建议、不写真源、P5 查表 ============ */
test('weeklyRebalance：低完成率→lower 建议且不写真源；降量由 P5 查表(20→10)', () => {
  const db = Core.defaultDB();
  for (let j = 0; j < 7; j++) {
    const dk = Core.dayKey(Date.now() - j * DAY);
    db.days[dk] = { total: 0, planTarget: 10 };
  }
  const low = Core.weeklyRebalance(db);
  assert.equal(low.suggested, true);
  assert.equal(low.kind, 'lower');
  assert.equal(db.settings.dailyMinutes, 20, '不再写 settings.dailyMinutes 真源');
  assert.equal(low.suggestedDailyMinutes, 10, '降量 20→10 由 P5 查表（非 dailyMinutes-5，非 25）');
  assert.notEqual(low.suggestedDailyMinutes, 25);
  assert.ok(low.message.indexOf('0%') >= 0, 'message 仍含 0%');
  // 不读取 autoRebalance：设为 false 仍应给出建议（旧逻辑会据此跳过写入）
  db.settings.autoRebalance = false;
  const low2 = Core.weeklyRebalance(db);
  assert.equal(low2.suggested, true);
  assert.equal(db.settings.dailyMinutes, 20, 'autoRebalance=false 也不写真源');
});

test('weeklyRebalance：已在最小档(10)不反向升档、不产出降量建议', () => {
  const db = Core.defaultDB();
  db.settings.dailyMinutes = 10;
  for (let j = 0; j < 7; j++) {
    const dk = Core.dayKey(Date.now() - j * DAY);
    db.days[dk] = { total: 0, planTarget: 10 };
  }
  const low = Core.weeklyRebalance(db);
  assert.equal(low.suggested, false, '已在最小档 → 不产出降量建议');
  assert.equal(db.settings.dailyMinutes, 10, '不写真源');
});

test('weeklyRebalance：有效样本不足(全空打开日=null) → suggested:false, rate:null', () => {
  const db = Core.defaultDB();
  for (let j = 0; j < 7; j++) {
    const dk = Core.dayKey(Date.now() - j * DAY);
    db.days[dk] = { total: 0 }; // 无 planTarget → dailyCompletionRate 返回 null
  }
  const r = Core.weeklyRebalance(db);
  assert.equal(r.suggested, false);
  assert.equal(r.rate, null, '有效样本不足 → rate=null，界面零提示');
});

/* ============ ensureSchema 幂等补齐 F1 ladder / F2 goal 并入 / F4 byType ============ */
test('ensureSchema：老库无 ladder → 补齐 {mode:auto}，schema 恒 3', () => {
  const old = { schema: 3, settings: { freshLimit: 20 }, words: {}, days: {} };
  const db = Core.ensureSchema(old);
  assert.equal(db.ladder.mode, 'auto');
  assert.equal(db.schema, 3);
});

test('ensureSchema：settings.dailyMinutes 缺失 → 一次性并入 goal 合法档（N4W-AC03）', () => {
  const old = { schema: 3, settings: { freshLimit: 20 }, words: {}, days: {}, goal: { type: 'free', deadline: null, dailyMinutes: 30, createdAt: 0 } };
  const db = Core.ensureSchema(old);
  assert.equal(db.settings.dailyMinutes, 30, '并入 goal.dailyMinutes=30');
});

test('ensureSchema：幂等、byType 校验归一、缺失不强补', () => {
  const db = Core.defaultDB();
  db.days['2026-01-01'] = { total: 3, planTarget: 3, byType: { flash: { n: 1, ms: 1000 }, type: { n: 2, ms: 90000 }, choice: { n: 0, ms: 0 } } };
  db.days['2026-01-02'] = { total: 0, byType: { flash: { n: -1, ms: -5 }, type: { n: 'y', ms: 'z' }, choice: null } };
  db.days['2026-01-03'] = { total: 0, planTarget: 0 }; // 无 byType → 不强补
  Core.ensureSchema(db);
  assert.deepEqual(db.days['2026-01-01'].byType, { flash: { n: 1, ms: 1000 }, type: { n: 2, ms: 90000 }, choice: { n: 0, ms: 0 } });
  assert.deepEqual(db.days['2026-01-02'].byType, { flash: { n: 0, ms: 0 }, type: { n: 0, ms: 0 }, choice: { n: 0, ms: 0 } }, '脏值归一为 {n:0,ms:0}');
  assert.equal(db.days['2026-01-03'].byType, undefined, 'byType 缺失不强补');
  const snap = JSON.stringify(db);
  Core.ensureSchema(db);
  assert.equal(JSON.stringify(db), snap, '幂等：二次调用逐字段一致');
});

test('ensureSchema：defaultDB 已含 ladder，schema 恒 3', () => {
  const db = Core.defaultDB();
  assert.equal(db.ladder.mode, 'auto');
  assert.equal(db.schema, 3);
});

/* ============ T01 phrases 落键（供 G4 引用核验） ============ */
test('phrases T01 落键：LADDER / 副标题 / goalMinutes 存在且 capNote 不变', () => {
  assert.equal(typeof PHRASES.LADDER, 'object');
  assert.equal(PHRASES.LADDER.auto, '自动');
  assert.equal(PHRASES.LADDER.manual, '手动');
  assert.equal(typeof PHRASES.SETTINGS.dailyMinutesSubtitle, 'function');
  assert.equal(PHRASES.SETTINGS.dailyMinutesSubtitle([10, 20, 30]), '10 / 20 / 30 分钟');
  assert.equal(PHRASES.SETTINGS.ladderSection, '默写阶梯');
  assert.equal(typeof PHRASES.PLAN_MODE.goalMinutesText, 'function');
  assert.equal(PHRASES.PLAN_MODE.goalMinutesText(20), '当初答的时长：20 分钟');
  // capNote(34,20) 不得破坏（qa 依赖）
  assert.equal(PHRASES.PLAN_MODE.capNote(34, 20), '计划原定每日 34 词，已按本机上限 20 封顶');
});
