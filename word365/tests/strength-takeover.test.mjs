/* ============================================================
 * #020 逐词接管（D-043）独立测试
 * 运行：node --test tests/strength-takeover.test.mjs
 * 背景：Anki FSRS「Reschedule cards on change」默认不重算已有到期
 *       ——「future reviews will use the new scheduling, but there will be
 *       no immediate change to your workload」。本卡按同一策略实现：
 *       strengthFrom>0 时只接管「开启后复习过」的词。
 * 模式：node:vm 真实执行 core.js / app.js，不依赖浏览器。
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
const NOW = Date.now();

function ctx() {
  const sb = { console, setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {}, addEventListener: () => {} };
  sb.window = sb;
  vm.createContext(sb);
  return sb;
}

function loadCore() {
  const sb = ctx();
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/core.js'), 'utf8'), sb);
  return sb.Core;
}

/** 一条「固定阶梯下 40 天后才到期、但按作答历史已到期」的词。 */
function recOverdueByStrength() {
  return {
    w: 'alpha', lvl: 2, st: 'review', reps: 3, correct: 3, wrong: 0, wfix: 0, star: false, note: '',
    due: NOW + 40 * DAY, last: NOW - 10 * DAY, first: NOW - 30 * DAY, lastRating: 'know',
    srcBook: '', graduated: false,
    evts: [{ t: NOW - 10 * DAY, rating: 'know', interval: DAY, type: null }]
  };
}

function reviewsWith(mutator) {
  const Core = loadCore();
  const db = Core.defaultDB();
  db.words['w::alpha'] = recOverdueByStrength();
  mutator(db);
  const recs = [db.words['w::alpha']];
  return { plan: Core.todayPlan(db, recs), Core, db, recs };
}

/* ---------- ① 新字段缺省与归一（幂等、不读 now） ---------- */
test('settings.strengthFrom：缺省 0、非数字/负数归一 0、重复 ensureSchema 不变', () => {
  const Core = loadCore();
  assert.equal(Core.defaultSettings().strengthFrom, 0, 'defaultSettings 应缺省 0（= 全部接管，旧行为）');
  const old = { schema: 3, words: {}, days: {}, settings: { freshLimit: 20 } };
  const once = Core.ensureSchema(old);
  assert.equal(once.settings.strengthFrom, 0, '旧库应补 0');
  once.settings.strengthFrom = 1731000000000;
  const twice = Core.ensureSchema(once);
  assert.equal(twice.settings.strengthFrom, 1731000000000, '合法值不得被覆盖（幂等）');
  const dirty = { schema: 3, words: {}, days: {}, settings: { strengthFrom: 'abc' } };
  assert.equal(Core.ensureSchema(dirty).settings.strengthFrom, 0, '非数字应归一 0');
  const neg = { schema: 3, words: {}, days: {}, settings: { strengthFrom: -5 } };
  assert.equal(Core.ensureSchema(neg).settings.strengthFrom, 0, '负数应归一 0');
});

/* ---------- ② 兼容：from=0（旧库）仍立即接管，行为与 #019 一致 ---------- */
test('兼容旧行为：strengthFrom=0 且 mode=on 时立即按强度到期（1 条进队列）', () => {
  const { plan } = reviewsWith((db) => { db.settings.strengthMode = 'on'; db.settings.strengthFrom = 0; });
  assert.equal(plan.reviews.length, 1, 'from=0 视为全部接管，沿用 #019 行为');
});

/* ---------- ③ 逐词接管：from=开启时刻，老词到期不动（核心目标） ---------- */
test('逐词接管：strengthFrom=now 时未复习过的词仍按原 due，今日不进队列', () => {
  const { plan } = reviewsWith((db) => { db.settings.strengthMode = 'on'; db.settings.strengthFrom = NOW; });
  assert.equal(plan.reviews.length, 0, '开启瞬间不得因为重算历史而涌入到期词');
});

/* ---------- ④ 接管生效：开启后复习过（last>=from）的词交给强度层 ---------- */
test('接管生效：last>=strengthFrom 的词改由 strengthDue 决定到期（1 条进队列）', () => {
  const Core = loadCore();
  const db = Core.defaultDB();
  db.settings.strengthMode = 'on';
  db.settings.strengthFrom = NOW - 10 * DAY;
  db.words['w::alpha'] = {
    w: 'alpha', lvl: 2, st: 'review', reps: 3, correct: 3, wrong: 0, wfix: 0, star: false, note: '',
    due: NOW - DAY, last: NOW - 2 * DAY, first: NOW - 20 * DAY, lastRating: 'know',
    srcBook: '', graduated: false,
    evts: [{ t: NOW - 2 * DAY, rating: 'know', interval: DAY, type: null }]
  };
  const recs = [db.words['w::alpha']];
  const due = Core.strengthDue(recs[0], recs[0].evts);
  assert.ok(due <= NOW, 'strengthDue 应已到期（last + 2 天档位）');
  assert.equal(Core.todayPlan(db, recs).reviews.length, 1, '开启后复习过的词应由强度层接管');
});

/* ---------- ⑤ 关闭即回退：mode=off 时 dueOf 短路，回到写入的阶梯 due ---------- */
test('关闭即回退：mode=off 时不看强度，词按原 due（未来 40 天）不进队列', () => {
  const { plan } = reviewsWith((db) => { db.settings.strengthMode = 'off'; });
  assert.equal(plan.reviews.length, 0, 'off 必须逐字段回到固定阶梯');
});

/* ---------- ⑥ UI 路径：点「开启」写入 strengthFrom=此刻（不是 0） ---------- */
test('UI 路径：点击「开启」同时写入 strengthMode=on 与 strengthFrom=当时毫秒（>0）', () => {
  const els = {};
  const q = (sel) => (els[sel] || (els[sel] = makeEl()));
  const writes = [];
  const timers = new Map();
  let seq = 0;
  const sb = ctx();
  sb.setTimeout = (fn) => { const id = ++seq; timers.set(id, fn); return id; };
  sb.clearTimeout = (id) => { timers.delete(id); };
  sb.location = { hash: '#/mine' };
  sb.document = { documentElement: makeEl(), querySelector: q, querySelectorAll: () => [], addEventListener: () => {} };
  sb.localStorage = { getItem: () => null, setItem: (k, v) => writes.push(String(v)) };
  ['js/data/cet4.js', 'js/data/cet6.js', 'js/data/kaoyan.js', 'js/data/ielts.js', 'js/data/job.js',
    'js/phrases.js', 'js/core.js', 'js/app.js'].forEach((f) => {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sb, { filename: f });
  });
  const before = Date.now();
  q('#setStrength').trigger('click', { target: { getAttribute: (k) => (k === 'data-strength' ? 'on' : null) } });
  [...timers.values()].forEach((fn) => fn());
  const last = writes[writes.length - 1];
  assert.ok(/"strengthMode":"on"/.test(last), '应写入 strengthMode=on');
  const m = last.match(/"strengthFrom":(\d+)/);
  assert.ok(m, '应同时写入 strengthFrom 毫秒值');
  assert.ok(Number(m[1]) >= before, 'strengthFrom 应为开启时刻（>= 点击前时间），实际 ' + m[1]);
});

function makeEl() {
  const el = {
    innerHTML: '', textContent: '', value: '', hidden: false, style: {}, dataset: {}, attrs: {}, listeners: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } }
  };
  el.addEventListener = (t, fn) => { (el.listeners[t] || (el.listeners[t] = [])).push(fn); };
  el.trigger = (t, extra) => {
    const list = el.listeners[t] || [];
    const fn = list[list.length - 1];
    if (!fn) { return false; }
    fn.call(el, Object.assign({ target: el, preventDefault() {} }, extra || {}));
    return true;
  };
  el.setAttribute = (k, v) => { el.attrs[k] = String(v); };
  el.removeAttribute = (k) => { delete el.attrs[k]; };
  el.getAttribute = (k) => (Object.prototype.hasOwnProperty.call(el.attrs, k) ? el.attrs[k] : null);
  el.querySelector = () => makeEl();
  el.querySelectorAll = () => [];
  el.focus = () => {};
  el.closest = () => null;
  return el;
}
