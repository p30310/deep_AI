/* ============================================================
 * #025 今日挑战 · core 契约测试（D-048/D-049；G2 v1.1）
 * 运行：node --test tests/challenge.test.mjs
 * 覆盖：CH-AC02/03/04/06/10/12/13 + 强度层同源 + ensureSchema 幂等
 * ============================================================ */
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DAY = 86400000;
const AT = new Date(2026, 10, 17, 10, 0, 0).getTime(); // 固定本地时间：2026-11-17 10:00

function ctx() {
  const sb = { console, setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {}, addEventListener: () => {} };
  sb.window = sb;
  vm.createContext(sb);
  ['js/data/cet4.js', 'js/data/cet6.js', 'js/data/kaoyan.js', 'js/data/ielts.js', 'js/data/job.js']
    .forEach((f) => vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sb, { filename: f }));
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/core.js'), 'utf8'), sb);
  const defs = [sb.W365_BOOK_CET4, sb.W365_BOOK_CET6, sb.W365_BOOK_KAOYAN, sb.W365_BOOK_IELTS, sb.W365_BOOK_JOB];
  return { Core: sb.Core, defs };
}

/** 建库：5 本书 + 指定词条记录（默认把前 n 个 cet4 词设为到期已学） */
function makeDB(opts) {
  const o = opts || {};
  const { Core, defs } = ctx();
  const db = Core.defaultDB();
  Core.seedBooks(db, defs);
  const words = db.books[0].words;
  const n = o.dueCount == null ? 6 : o.dueCount;
  for (let i = 0; i < n; i++) {
    const w = words[i].w;
    db.words[Core.wordKey(w)] = {
      w: w, lvl: 2, st: 'review', due: AT - DAY, reps: 3, correct: 3, wrong: 0, wfix: 0,
      star: false, note: '', last: AT - 3 * DAY, first: AT - 20 * DAY, lastRating: 'know',
      srcBook: 'cet4', graduated: false, evts: []
    };
  }
  if (o.mutate) { o.mutate(db, Core, words); }
  return { db, Core };
}

function clone(obj) { return JSON.parse(JSON.stringify(obj)); }

/* ---------- CH-AC02 池构成与三重排除 ---------- */
test('CH-AC02 池：到期 ∪ 错词去重；reps=0 / graduated / 无释义 一律不进池', () => {
  const { db, Core } = makeDB({
    dueCount: 6,
    mutate: (d, C, words) => {
      // 3 个错词，其中 1 个已在到期集合里
      [0, 6, 7].forEach((i) => {
        const k = C.wordKey(words[i].w);
        if (!d.words[k]) {
          d.words[k] = clone(d.words[C.wordKey(words[0].w)]);
          d.words[k].w = words[i].w;
          d.words[k].due = AT + 30 * DAY; // 未到期，仅靠 wrong 入池
          d.words[k].reps = 2;
        }
        d.words[k].wrong = 2;
      });
      // 干扰：未学 / 已毕业 / 无释义
      d.words[C.wordKey(words[8].w)] = Object.assign(clone(d.words[C.wordKey(words[0].w)]), { w: words[8].w, reps: 0, due: AT - DAY });
      d.words[C.wordKey(words[9].w)] = Object.assign(clone(d.words[C.wordKey(words[0].w)]), { w: words[9].w, graduated: true, due: AT - DAY });
      d.words['w::zzz-noentry'] = Object.assign(clone(d.words[C.wordKey(words[0].w)]), { w: 'zzz-noentry', due: AT - DAY, reps: 5 });
    }
  });
  const pool = Core.challengePool(db, AT);
  const keys = pool.keys;
  assert.equal(pool.total, 8, '6 到期 + 2 个纯错词 = 8（重叠的 1 个已计在到期里）');
  assert.equal(keys.length, 5, 'size 截断为 min(5, total)');
  assert.equal(new Set(keys).size, keys.length, 'keys 两两不同');
  assert.equal(keys.indexOf('w::zzz-noentry'), -1, '全库找不到词条的词不得进池');
  keys.forEach((k) => { assert.ok(db.words[k].reps > 0 && !db.words[k].graduated, '池内词必须是已学未毕业'); });
});

/* ---------- 到期口径：到「当日 23:59:59.999」而不是 now ---------- */
test('到期口径：due 晚于 now 但早于当日日终 → 入池；次日 00:00 → 不入池', () => {
  const { db, Core } = makeDB({ dueCount: 0 });
  const words = db.books[0].words;
  const proto = {
    lvl: 2, st: 'review', reps: 3, correct: 3, wrong: 0, wfix: 0, star: false, note: '',
    last: AT - 3 * DAY, first: AT - 20 * DAY, lastRating: 'know', srcBook: 'cet4', graduated: false, evts: []
  };
  db.words[Core.wordKey(words[0].w)] = Object.assign(clone(proto), { w: words[0].w, due: AT + 8 * 3600000 }); // 当天 18:00
  db.words[Core.wordKey(words[1].w)] = Object.assign(clone(proto), { w: words[1].w, due: new Date(2026, 10, 18, 0, 0, 0).getTime() });
  const pool = Core.challengePool(db, AT);
  assert.ok(pool.keys.indexOf(Core.wordKey(words[0].w)) >= 0, '当天稍晚到期应入池（日终口径）');
  assert.equal(pool.keys.indexOf(Core.wordKey(words[1].w)), -1, '次日 00:00 到期不得入池');
});

/* ---------- CH-AC03 确定性 ---------- */
test('CH-AC03 确定性：同库同日两次 → keys 逐项相等；换日 → 组不同（避免每天同一批）', () => {
  const { db, Core } = makeDB({ dueCount: 12 });
  const a = Core.challengePool(db, AT);
  const b = Core.challengePool(db, AT);
  assert.deepEqual(a.keys, b.keys, '同 pool + 同日必须同 keys');
  const next = Core.challengePool(db, AT + DAY);
  assert.notDeepEqual(a.keys, next.keys, '换日后应换一批（按日期种子洗牌）');
});

/* ---------- 强度层同源 ---------- */
test('强度层同源：strengthMode=on + strengthFrom 时，池的到期集合与 todayPlan.reviews 一致', () => {
  const { db, Core } = makeDB({
    dueCount: 6,
    mutate: (d) => {
      d.settings.strengthMode = 'on';
      d.settings.strengthFrom = AT - 30 * DAY;
      // 让全部词都「开启后复习过」，强度层接管
      Object.keys(d.words).forEach((k) => { d.words[k].last = AT - 2 * DAY; });
    }
  });
  const plan = Core.todayPlan(db, Object.keys(db.words).map((k) => db.words[k]));
  const planKeys = plan.reviews.map((r) => Core.wordKey(r.w)).sort();
  const poolKeys = Core.challengePool(db, AT).keys.slice().sort();
  poolKeys.forEach((k) => {
    assert.ok(planKeys.indexOf(k) >= 0, '挑战池里的到期词必须也在今日复习里：' + k);
  });
});

/* ---------- CH-AC06 造题 ---------- */
test('CH-AC06 造题：4 项、去重、必含正确词、同 seed 深度相等；容量 3/2 时降为 3/2 项', () => {
  const { db, Core } = makeDB({ dueCount: 6 });
  const key = Core.wordKey(db.books[0].words[0].w);
  const q = Core.challengeQuestion(db, key, '2026-11-17');
  assert.ok(q, '应能造题');
  assert.equal(q.options.length, 4, '库容量足够时恒 4 项');
  const ws = q.options.map((o) => Core.norm(o.w));
  assert.equal(new Set(ws).size, ws.length, '选项不重复');
  assert.equal(ws.filter((w) => w === Core.norm(q.w)).length, 1, '正确词恰出现一次');
  assert.equal(Core.norm(q.options[q.answerIdx].w), Core.norm(q.w), 'answerIdx 指向正确词');
  assert.deepEqual(Core.challengeQuestion(db, key, '2026-11-17'), q, '同 seed 必须同题（无随机）');
  assert.ok(q.prompt.length > 0, '题干为中文义项');

  // 容量收缩：只留 3 个可用词 → 3 项；只留 2 个 → 2 项
  const small = makeDB({ dueCount: 3 });
  small.db.books = [Object.assign({}, small.db.books[0], { words: small.db.books[0].words.slice(0, 3) })];
  small.db.words = {};
  const q3 = small.Core.challengeQuestion(small.db, small.Core.wordKey(small.db.books[0].words[0].w), '2026-11-17');
  assert.ok(q3 && q3.options.length === 3, '全库容量 3 时选项 3 项，实际 ' + (q3 && q3.options.length));

  const tiny = makeDB({ dueCount: 2 });
  tiny.db.books = [Object.assign({}, tiny.db.books[0], { words: tiny.db.books[0].words.slice(0, 2) })];
  tiny.db.words = {};
  const q2 = tiny.Core.challengeQuestion(tiny.db, tiny.Core.wordKey(tiny.db.books[0].words[0].w), '2026-11-17');
  assert.ok(q2 && q2.options.length === 2, '全库容量 2 时选项 2 项');
});

/* ---------- 评分：只判对错，不写状态 ---------- */
test('评分：正确下标 ok=true；错误下标 ok=false；越界/null 不抛错且 ok=false', () => {
  const { db, Core } = makeDB({ dueCount: 6 });
  const key = Core.wordKey(db.books[0].words[0].w);
  const q = Core.challengeQuestion(db, key, '2026-11-17');
  const right = Core.challengeGrade(q, q.answerIdx);
  assert.equal(right.ok, true);
  const wrongIdx = q.options.findIndex((o) => o.i !== q.answerIdx);
  assert.equal(Core.challengeGrade(q, wrongIdx).ok, false);
  assert.equal(Core.challengeGrade(q, 99).ok, false);
  assert.equal(Core.challengeGrade(q, null).ok, false);
  assert.equal(Core.challengeGrade(null, 0).ok, false);
  // 字符串容错：传正确英文也 ok
  assert.equal(Core.challengeGrade(q, q.w).ok, true);
});

/* ---------- CH-AC10 汇总 ---------- */
test('CH-AC10 汇总：5 题 1 错 → kept=4；漏答计未对；kept 恒 <= size', () => {
  const { Core } = ctx();
  const results = [{ ok: true }, { ok: true }, { ok: false }, { ok: true }, { ok: true }];
  const s = Core.challengeSummarize('2026-11-17', 5, results, AT);
  assert.deepEqual({ size: s.size, kept: s.kept, dateKey: s.dateKey, doneAt: s.doneAt }, { size: 5, kept: 4, dateKey: '2026-11-17', doneAt: AT });
  const miss = Core.challengeSummarize('2026-11-17', 5, [{ ok: true }], AT);
  assert.equal(miss.kept, 1, '只答 1 题时其余计未对');
  assert.equal(Core.challengeSummarize('2026-11-17', 3, new Array(9).fill({ ok: true }), AT).kept, 3, 'kept 不得超过 size');
});

/* ---------- CH-AC04 / AC13 落库 ---------- */
test('CH-AC04/13 落库：只写 db.challenge 三项；同日覆盖单条；words/days/settings/exam 全等', () => {
  const { db, Core } = makeDB({ dueCount: 6 });
  const before = { words: clone(db.words), days: clone(db.days), settings: clone(db.settings), exam: clone(db.exam) };
  const s1 = Core.challengeSummarize('2026-11-17', 5, [{ ok: true }, { ok: true }, { ok: true }, { ok: true }, { ok: false }], AT);
  assert.ok(Core.commitChallenge(db, s1), '应写入');
  assert.deepEqual(Object.keys(db.challenge).sort(), ['dateKey', 'doneAt', 'size'], '键集恰为三项');
  assert.equal(db.challenge.dateKey, '2026-11-17');
  assert.equal(db.challenge.size, 5);
  const s2 = Core.challengeSummarize('2026-11-18', 3, [{ ok: true }, { ok: true }, { ok: true }], AT + DAY);
  Core.commitChallenge(db, s2);
  assert.equal(db.challenge.dateKey, '2026-11-18', '跨日覆盖，不累加成第二条');
  assert.equal(Object.keys(db.challenge).length, 3);
  assert.deepEqual(clone(db.words), before.words, 'db.words 不得变化');
  assert.deepEqual(clone(db.days), before.days, 'db.days 不得变化');
  assert.deepEqual(clone(db.settings), before.settings);
  assert.deepEqual(clone(db.exam), before.exam);
  assert.equal(Core.commitChallenge(db, { dateKey: 'bad', size: 3 }), null, '非法日期键拒绝');
  assert.equal(Core.commitChallenge(db, { dateKey: '2026-11-17', size: 0 }), null, 'size<1 拒绝');
});

/* ---------- 四态门面 ---------- */
test('门面四态：done > empty > not-enough > ready；跨日回到 ready', () => {
  const { db, Core } = makeDB({ dueCount: 6 });
  assert.equal(Core.challengeState(db, AT).mode, 'ready');
  assert.equal(Core.challengeState(db, AT).size, 5, 'ready 时 size=min(5,pool)=5');

  Core.commitChallenge(db, Core.challengeSummarize('2026-11-17', 5, [], AT));
  const done = Core.challengeState(db, AT);
  assert.equal(done.mode, 'done');
  assert.equal(done.size, 5);
  assert.equal(Core.challengeState(db, AT + DAY).mode, 'ready', '次日回到可开始态');

  const empty = makeDB({ dueCount: 0 });
  assert.equal(empty.Core.challengeState(empty.db, AT).mode, 'empty');
  assert.equal(empty.Core.challengeState(empty.db, AT).poolSize, 0);
});

/* ---------- CH-AC02 边界：池 2 个时 size=2 ---------- */
test('CH-AC14 池不足：池 2 → size=2 且 state.size=2；池 1 → size=1', () => {
  const { db, Core } = makeDB({ dueCount: 2 });
  const st = Core.challengeState(db, AT);
  assert.equal(st.poolSize, 2);
  assert.equal(st.size, 2);
  const one = makeDB({ dueCount: 1 });
  assert.equal(one.Core.challengeState(one.db, AT).size, 1);
});

/* ---------- ensureSchema 幂等（CH-AC12 前置） ---------- */
test('ensureSchema 幂等：旧库补 challenge 三项；重复调用不改变；SCHEMA 恒 3；未知键保留', () => {
  const { Core } = ctx();
  const old = { schema: 3, words: {}, days: {}, settings: {}, customKey: { keep: 1 } };
  const once = Core.ensureSchema(old);
  assert.equal(JSON.stringify(once.challenge), JSON.stringify({ dateKey: '', size: 0, doneAt: 0 }));
  once.challenge.size = 4;
  const twice = Core.ensureSchema(once);
  assert.equal(twice.challenge.size, 4, '合法值不得被覆盖');
  assert.equal(JSON.stringify(twice.customKey), JSON.stringify({ keep: 1 }), '未知键保留');
  assert.equal(twice.schema, 3, 'SCHEMA 恒 3');
  const dirty = { schema: 3, words: {}, days: {}, settings: {}, challenge: { dateKey: 5, size: -1, doneAt: 'x' } };
  const fixed = Core.ensureSchema(dirty);
  assert.equal(fixed.challenge.dateKey, '');
  assert.equal(fixed.challenge.size, 0);
  assert.equal(fixed.challenge.doneAt, 0);
});

/* ---------- G2 D2：非整数下标必须判错（API 层防线） ---------- */
test('G2-D2 评分：非整数下标（1.9 / -1 / NaN）一律 ok=false，不抛错', () => {
  const { db, Core } = makeDB({ dueCount: 6 });
  const q = Core.challengeQuestion(db, Core.wordKey(db.books[0].words[0].w), '2026-11-17');
  [1.9, -1, NaN, Infinity].forEach((v) => {
    const g = Core.challengeGrade(q, v);
    assert.equal(g.ok, false, '非法下标应判错：' + String(v));
  });
});

/* ---------- 边界：due 恰好等于当日 23:59:59.999 应入池 ---------- */
test('闭区间：due === 当日 23:59:59.999 入池；+1ms 不入池', () => {
  const { db, Core } = makeDB({ dueCount: 0 });
  const words = db.books[0].words;
  const end = new Date(AT); end.setHours(23, 59, 59, 999);
  const proto = {
    lvl: 2, st: 'review', reps: 3, correct: 3, wrong: 0, wfix: 0, star: false, note: '',
    last: AT - 3 * DAY, first: AT - 20 * DAY, lastRating: 'know', srcBook: 'cet4', graduated: false, evts: []
  };
  db.words[Core.wordKey(words[0].w)] = Object.assign(clone(proto), { w: words[0].w, due: end.getTime() });
  db.words[Core.wordKey(words[1].w)] = Object.assign(clone(proto), { w: words[1].w, due: end.getTime() + 1 });
  const pool = Core.challengePool(db, AT);
  assert.ok(pool.keys.indexOf(Core.wordKey(words[0].w)) >= 0, '23:59:59.999 应入池');
  assert.equal(pool.keys.indexOf(Core.wordKey(words[1].w)), -1, '+1ms 应出池');
});

/* ---------- not-enough：池有 1 词但全库可用词 <2 ---------- */
test('四态 not-enough：唯一可用词 + 有到期记录 → mode=not-enough（不是 ready）', () => {
  const tiny = makeDB({ dueCount: 1 });
  tiny.db.books = [Object.assign({}, tiny.db.books[0], { words: tiny.db.books[0].words.slice(0, 1) })];
  const st = tiny.Core.challengeState(tiny.db, AT);
  assert.equal(st.poolSize, 1, '池里有 1 个词');
  assert.equal(st.optionCapacity, 1, '全库可用词只有 1 个');
  assert.equal(st.mode, 'not-enough', '容量 <2 时不得进入 ready');
});

/* ---------- G2 D6：未玩时 doneAt 不暴露跨日残留 ---------- */
test('G2-D6 门面：昨日记录存在但今日未玩 → doneAt=0、mode=ready、size=min(5,pool)', () => {
  const { db, Core } = makeDB({ dueCount: 6 });
  Core.commitChallenge(db, Core.challengeSummarize('2026-11-16', 5, [], AT - DAY));
  const st = Core.challengeState(db, AT);
  assert.equal(st.played, false);
  assert.equal(st.doneAt, 0, '未玩时不得回放昨日时间戳');
  assert.equal(st.mode, 'ready');
});

/* ---------- G10 F04：日期必须真实存在、题数不得超上限 ---------- */
test('G10-F04 落库校验：非法月日（2026-13-45）与 size>5 一律拒绝', () => {
  const { db, Core } = makeDB({ dueCount: 6 });
  assert.equal(Core.commitChallenge(db, { dateKey: '2026-13-45', size: 2 }), null, '非法月日应拒绝');
  assert.equal(Core.commitChallenge(db, { dateKey: '2026-11-17', size: 999 }), null, '题数超上限应拒绝');
  const okRec = Core.commitChallenge(db, { dateKey: '2026-11-17', size: 5 });
  assert.ok(okRec && okRec.size === 5, '合法提交应成功写入');
});
