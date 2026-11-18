/* 叠加式记忆强度引擎 · 独立核心测试（任务卡 #015 · G3 实现产物）
 * 独立于既有 7 文件（161 项），不修改任何既有断言；本文件为新增独立套件。
 * 覆盖 STR-AC01~08（每条至少 1 断言）+ 边界兜底 + 红线常量/导出面。
 * 运行：node --test tests/core.test.strength.mjs
 */
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const Core = require('../js/core.js');
const PHRASES = require('../js/phrases.js');

const DAY = Core.DAY_MS;
const LADDER = Core.LADDER_DAYS;

function rec(lvl, last, over) {
  const r = Core.newRecord('alpha');
  r.lvl = lvl;
  r.last = last;
  r.reps = 1;
  return Object.assign(r, over || {});
}

/* ============ STR-AC01 · OFF 默认，逐字段等价固定阶梯 ============ */
test('STR-AC01 缺省 OFF：defaultDB/ensureSchema 均为 off，三分支评级四字段与固定阶梯逐字段一致', () => {
  const db = Core.defaultDB();
  assert.equal(db.settings.strengthMode, 'off', 'defaultDB 缺省 off');
  assert.equal(Core.defaultSettings().strengthMode, 'off', 'defaultSettings 缺省 off');
  const old = { schema: 3, settings: { freshLimit: 20 }, words: {}, days: {} };
  assert.equal(Core.ensureSchema(old).settings.strengthMode, 'off', '旧备份缺省 off');

  // know 分支基线：lvl/due/wfix/st（新词 lvl=1 → due=LADDER[1]，st=learning）
  const dbK = Core.defaultDB();
  const k = Core.wordKey('alpha');
  Core.rateWord(dbK, k, 'know');
  const rk = dbK.words[k];
  assert.equal(rk.lvl, 1);
  assert.equal(rk.due, rk.last + LADDER[1] * DAY);
  assert.equal(rk.wfix, 0);
  assert.equal(rk.st, 'learning');

  // fuzzy / unknown 分支基线
  const cases = [
    ['fuzzy', 0, 28 * 60 * 60 * 1000],
    ['unknown', 0, 10 * 60 * 1000]
  ];
  for (const [rating, lvl, ms] of cases) {
    const d = Core.defaultDB();
    const key = Core.wordKey(rating + 'word');
    Core.rateWord(d, key, rating);
    const r = d.words[key];
    assert.equal(r.lvl, lvl, rating + ' lvl 基线');
    assert.equal(r.due, r.last + ms, rating + ' due 基线');
    assert.equal(r.wfix, 0, rating + ' wfix 基线');
    assert.equal(r.st, 'learning', rating + ' st 基线');
  }
});

/* ============ STR-AC02 · 事件采集 ============ */
test('STR-AC02 rateWord 成功评级加法写一条 {t,rating,interval,type:null}，既有字段语义不变', () => {
  const db = Core.defaultDB();
  const key = Core.wordKey('alpha');
  Core.rateWord(db, key, 'know');
  let r = db.words[key];
  assert.equal(r.evts.length, 1, '新增一条事件');
  const e = r.evts[0];
  assert.equal(e.t, r.last, 't = 本次评级时刻（与 rec.last 同值）');
  assert.equal(e.rating, 'know');
  assert.equal(e.interval, LADDER[1] * DAY);
  assert.equal(e.interval, r.due - r.last, 'interval 恒等于真实落库 due - t');
  assert.equal(e.type, null, '阶段一 type 恒 null（D-038③）');

  // 再次评级：追加一条、旧事件保留，interval 取当次阶梯值
  Core.rateWord(db, key, 'know');
  r = db.words[key];
  assert.equal(r.evts.length, 2);
  assert.equal(r.evts[0].t, e.t, '历史事件不被覆盖');
  assert.equal(r.evts[1].interval, LADDER[2] * DAY, '第二次 know 间隔 = LADDER[2]');

  // 三分支 interval 推导逐条核对（不重复 ladder 逻辑，只读 rec.due - t）
  for (const [rating, ms] of [
    ['know', LADDER[1] * DAY],
    ['fuzzy', 28 * 60 * 60 * 1000],
    ['unknown', 10 * 60 * 1000]
  ]) {
    const d = Core.defaultDB();
    const k = Core.wordKey(rating + 'evt');
    Core.rateWord(d, k, rating);
    const rr = d.words[k];
    assert.equal(rr.evts[0].interval, ms, rating + ' interval 推导');
    assert.equal(rr.evts[0].interval, rr.due - rr.last, rating + ' interval = due - t');
  }
});

/* ============ STR-AC03 · 幂等迁移 ============ */
test('STR-AC03 ensureSchema 幂等补 evts/strengthMode、schema 恒 3、含事件不丢、旧备份导入', () => {
  const base = { schema: 3, settings: { freshLimit: 20 }, words: {}, days: {} };
  const kA = Core.wordKey('a');
  base.words[kA] = Core.newRecord('a');
  delete base.words[kA].evts; // 老库词条缺 evts
  const kB = Core.wordKey('b');
  base.words[kB] = Core.newRecord('b');
  const existing = [{ t: 1000, rating: 'know', interval: DAY, type: null }];
  base.words[kB].evts = existing.slice();

  Core.ensureSchema(base);
  assert.deepEqual(base.words[kA].evts, [], '缺 evts 补 []');
  assert.equal(base.words[kB].evts.length, 1, '非空 evts 原样保留');
  assert.deepEqual(base.words[kB].evts, existing, '事件内容未被裁剪');
  assert.equal(base.schema, 3, 'SCHEMA 恒 3');
  assert.equal(base.settings.strengthMode, 'off', 'strengthMode 补 off');

  const snap = JSON.stringify(base);
  Core.ensureSchema(base);
  assert.equal(JSON.stringify(base), snap, '二次调用逐字段一致（幂等）');

  // 旧备份导入成功
  const res = Core.importJSON(snap);
  assert.equal(res.ok, true);
  assert.equal(res.db.schema, 3);
  assert.equal(res.db.words[kB].evts.length, 1);

  // 脏值归一：非数组 evts / 非法 strengthMode
  const dirty = JSON.parse(snap);
  dirty.words[kB].evts = 'not-an-array';
  dirty.settings.strengthMode = 'bogus';
  Core.ensureSchema(dirty);
  assert.deepEqual(dirty.words[kB].evts, [], '非数组 evts 归一为 []');
  assert.equal(dirty.settings.strengthMode, 'off', '非法 strengthMode 归一为 off');
});

/* ============ STR-AC04 · 强度看板纯函数 ============ */
test('STR-AC04 strengthOf：无事件回退 lvl 代理、合法事件可解释值、异常跳过不抛错、不写真源', () => {
  const db = Core.defaultDB();
  const kA = Core.wordKey('a');
  const a = Core.newRecord('a'); a.lvl = 3;
  db.words[kA] = a;
  const sA = Core.strengthOf(db, kA);
  assert.equal(sA.basis, 'lvl-proxy');
  assert.equal(sA.score, 3, 'lvl=3 → score=3（与 (3-lvl)=0 反相可换算）');
  assert.equal(sA.n, 0);
  assert.equal(sA.level, 'mid', 'score=3 → mid');

  // 合法事件：两条 know（间隔递增）+ 一条 unknown → base=2, net=1, trend=1 → score=4
  const kB = Core.wordKey('b');
  const b = Core.newRecord('b');
  b.evts = [
    { t: 1000, rating: 'know', interval: 1 * DAY, type: null },
    { t: 2000, rating: 'know', interval: 4 * DAY, type: null },
    { t: 3000, rating: 'unknown', interval: 10 * 60 * 1000, type: null }
  ];
  db.words[kB] = b;
  const sB = Core.strengthOf(db, kB);
  assert.equal(sB.basis, 'events');
  assert.equal(sB.n, 3);
  assert.ok(Number.isInteger(sB.score), 'score 为整数档（非伪精确百分比）');
  assert.ok(Number.isFinite(sB.score) && sB.score >= 0 && sB.score <= 6);
  assert.equal(sB.score, 4, '可逐事件复算：ladderIndexLE(4)=2, net=1, trend=1 → 4');
  assert.equal(sB.level, 'high');

  // 异常事件全部跳过 → 回退 lvl 代理，不抛错
  const kC = Core.wordKey('c');
  const c = Core.newRecord('c'); c.lvl = 2;
  c.evts = [
    null,
    { t: 'x', rating: 'know', interval: 1 },
    { t: 1, rating: 'bad', interval: 1 },
    { t: 1, rating: 'know', interval: -1 },
    { t: 1, rating: 'know', interval: Infinity }
  ];
  db.words[kC] = c;
  const sC = Core.strengthOf(db, kC);
  assert.equal(sC.basis, 'lvl-proxy');
  assert.equal(sC.n, 0);
  assert.equal(sC.score, 2);
  assert.ok(Number.isFinite(sC.score), '无 NaN / Infinity');

  // 三种情况均不写真源
  const snap = JSON.stringify(db);
  Core.strengthOf(db, kA); Core.strengthOf(db, kB); Core.strengthOf(db, kC);
  assert.equal(JSON.stringify(db), snap, '调用前后 db 逐字段一致');

  // 无真源
  assert.deepEqual(
    Core.strengthOf(db, 'w::missing'),
    { level: 'low', score: null, basis: 'lvl-proxy', n: 0 }
  );
});

/* ============ STR-AC05 · ON 接管 due ============ */
test('STR-AC05 strengthMode=on：到期采用 strengthDue 结果，lvl 不变，st 口径不变，OFF 仍走 LADDER', () => {
  const base = Date.now() - 10 * DAY;
  function makeDb(mode) {
    const db = Core.defaultDB();
    db.settings.strengthMode = mode;
    const key = Core.wordKey('alpha');
    const r = Core.newRecord('alpha');
    r.reps = 1; r.lvl = 1; r.last = base;
    r.due = Date.now() - DAY; // OFF 下为到期（过去）
    r.evts = [{ t: base, rating: 'know', interval: 60 * DAY, type: null }];
    db.words[key] = r;
    return { db, key };
  }

  const on = makeDb('on');
  const dueOn = Core.strengthDue(on.db.words[on.key], on.db.words[on.key].evts);
  const lvlBefore = on.db.words[on.key].lvl;
  assert.ok(dueOn > Date.now(), '强度到期落在未来（anchor + 60 天），与固定阶梯不同');
  const planOn = Core.todayPlan(on.db, [on.db.words[on.key]]);
  assert.equal(planOn.reviews.indexOf(on.db.words[on.key]), -1, 'ON 下该词不进到期复习');
  assert.equal(on.db.words[on.key].lvl, lvlBefore, 'ON 下 lvl 不变');

  const off = makeDb('off');
  const planOff = Core.todayPlan(off.db, [off.db.words[off.key]]);
  assert.ok(planOff.reviews.indexOf(off.db.words[off.key]) >= 0, 'OFF 下按 r.due 进到期复习');

  // st 口径：仍由 rateWord 的 lvl>=3 && interval>=7 唯一决定，强度层不改
  const dbS = Core.defaultDB();
  dbS.settings.strengthMode = 'on';
  const ks = Core.wordKey('stword');
  Core.rateWord(dbS, ks, 'know');
  Core.rateWord(dbS, ks, 'know');
  Core.rateWord(dbS, ks, 'know');
  const rs = dbS.words[ks];
  assert.equal(rs.lvl, 3);
  assert.equal(rs.st, 'known', '第三次 know 间隔=LADDER[3]=7 → st=known');
});

/* ============ STR-AC06 · 可回退 + undo 天然回滚 ============ */
test('STR-AC06 ON→OFF 可回退：due 回固定阶梯、四字段回基线、evts 保留；undo 删末条事件', () => {
  const db = Core.defaultDB();
  db.settings.strengthMode = 'on';
  const key = Core.wordKey('alpha');
  Core.rateWord(db, key, 'know');
  const eventsBefore = db.words[key].evts.length; // =1

  // 切 OFF 后再评级 → 四字段回基线
  db.settings.strengthMode = 'off';
  const snap = Core.rateWord(db, key, 'know');
  const r = db.words[key];
  assert.equal(r.lvl, 2);
  assert.equal(r.due, r.last + LADDER[2] * DAY, 'due 重新由固定阶梯决定');
  assert.equal(r.wfix, 0);
  assert.equal(r.st, 'learning', 'lvl=2<3');
  assert.ok(r.evts.length >= eventsBefore + 1, 'evts 保留且本次又追加');

  // undo 本次评级 → 本次新增事件随快照整体还原被删，历史事件保留（D-038① OP-01）
  const afterRate = r.evts.length;
  assert.equal(Core.undoRate(db, snap), true);
  const r2 = db.words[key];
  assert.equal(r2.evts.length, afterRate - 1, 'undo 删除本次新增事件');
  assert.equal(r2.evts.length, eventsBefore, '历史事件原样保留');
  assert.equal(r2.lvl, 1, 'lvl 回到评级前');
  assert.equal(r2.due, r2.last + LADDER[1] * DAY, 'due 回到评级前的固定阶梯值');
});

/* ============ STR-AC07 · 边界兜底 ============ */
test('STR-AC07 strengthDue 四边界：无事件/单事件/非法 rating/超大 interval 均有限、不抛错、不改入参', () => {
  const last = 1700000000000;
  const r = rec(3, last);

  // ① ON 但无事件 → 恰等于 rec.last + LADDER_DAYS[lvl] * DAY_MS
  assert.equal(Core.strengthDue(r, []), last + LADDER[3] * DAY);
  assert.equal(Core.strengthDue(r, undefined), last + LADDER[3] * DAY);

  // ② 单事件 → 有限值
  const e1 = [{ t: last, rating: 'know', interval: 1 * DAY, type: null }];
  const d1 = Core.strengthDue(r, e1);
  assert.ok(Number.isFinite(d1) && d1 > 0, '单事件输出有限值');

  // ③ 非法 rating 被过滤 → 全非法时回退 lvl 代理
  assert.equal(
    Core.strengthDue(r, [{ t: last, rating: 'bogus', interval: DAY, type: null }]),
    last + LADDER[3] * DAY
  );
  // 非有限 interval 亦被过滤
  assert.equal(
    Core.strengthDue(r, [{ t: last, rating: 'know', interval: Infinity, type: null }]),
    last + LADDER[3] * DAY
  );

  // ④ 超大 interval（远超 60 天但有限）→ 钳到末档 anchor + 60*DAY
  assert.equal(
    Core.strengthDue(r, [{ t: last, rating: 'know', interval: 100000 * DAY, type: null }]),
    last + LADDER[6] * DAY
  );

  // rec.last 非法 → anchor 0 兜底，结果仍有限非负
  const d5 = Core.strengthDue(rec(2, NaN), []);
  assert.ok(Number.isFinite(d5) && d5 >= 0, '无 NaN / Infinity / 非法 due');

  // 纯函数：同输入恒同输出、不改入参 events / rec
  const recSnap = JSON.stringify(r);
  assert.equal(Core.strengthDue(r, e1), d1, '可复算');
  assert.deepEqual(e1, [{ t: last, rating: 'know', interval: 1 * DAY, type: null }], 'events 未被修改');
  assert.equal(JSON.stringify(r), recSnap, 'rec 未被修改');
});

/* ============ STR-AC08 · 向前兼容 ============ */
test('STR-AC08 含非空 evts/strengthMode=on 的新备份可被 importJSON 导入、schema 不抬、旧版行为等价', () => {
  const backup = {
    schema: 3, createdAt: 1, updatedAt: 1,
    settings: { freshLimit: 20, dailyMinutes: 20, strengthMode: 'on' },
    books: [], customBooks: [], words: {}, days: {}
  };
  const key = Core.wordKey('alpha');
  const r = Core.newRecord('alpha');
  r.reps = 1; r.lvl = 3; r.last = 1700000000000;
  r.due = r.last + LADDER[3] * DAY;
  r.evts = [
    { t: r.last - 5 * DAY, rating: 'know', interval: 1 * DAY, type: null },
    { t: r.last, rating: 'know', interval: 4 * DAY, type: null }
  ];
  backup.words[key] = r;

  const res = Core.importJSON(JSON.stringify(backup));
  assert.equal(res.ok, true, '导入成功');
  assert.equal(res.db.schema, 3, 'schema 仍 3 不抬');
  assert.equal(res.db.settings.strengthMode, 'on', 'strengthMode 原样保留');
  assert.equal(res.db.words[key].evts.length, 2, 'evts 原样保留、不被裁剪');

  // 旧版本（无强度层）到期逻辑不读 evts：OFF 下按 r.due 到期，行为与无该字段一致
  const oldDb = JSON.parse(JSON.stringify(res.db));
  oldDb.settings.strengthMode = 'off';
  const recCopy = oldDb.words[key];
  recCopy.due = 1700000000000 - DAY; // 设为到期
  const plan = Core.todayPlan(oldDb, [recCopy]);
  assert.ok(plan.reviews.indexOf(recCopy) >= 0, 'OFF 行为走 r.due，与无 evts 时一致');
});

/* ============ 红线常量 / 导出面 / phrases 落键 ============ */
test('红线：LADDER_DAYS / SCHEMA / w:: 主键零改动，Core 双暴露新函数，phrases 键落位', () => {
  assert.deepEqual(Core.LADDER_DAYS, [1, 2, 4, 7, 15, 30, 60], 'LADDER_DAYS 常量值未变');
  assert.equal(Core.SCHEMA, 3, 'SCHEMA 恒 3');
  assert.equal(Core.wordKey('Hello'), 'w::hello', 'w:: 主键体系未动');
  assert.equal(typeof Core.strengthOf, 'function', 'Core 导出 strengthOf');
  assert.equal(typeof Core.strengthDue, 'function', 'Core 导出 strengthDue');
  assert.deepEqual(Core.newRecord('x').evts, [], '新记录含 evts:[]');
  assert.equal(Core.defaultSettings().strengthMode, 'off');
  assert.equal(typeof PHRASES.STRENGTH, 'object', 'phrases 先落键');
  assert.equal(PHRASES.STRENGTH.levelHigh, '记得牢');
  assert.equal(typeof PHRASES.STRENGTH.boardCount, 'function');
});
