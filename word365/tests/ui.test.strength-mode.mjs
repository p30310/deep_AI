/* ============================================================
 * #019 设置页「记忆强度叠加」开关独立 ui 冒烟
 * 运行：node --test tests/ui.test.strength-mode.mjs
 * 模式：照搬 ui.test.n4n2.mjs 的最小 DOM stub + node:vm，
 *       真实执行 phrases.js / core.js / app.js；
 *       localStorage.setItem 被捕获以验证「真源确实写入」。
 * ============================================================ */
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

const SCRIPTS = [
  'js/data/cet4.js', 'js/data/cet6.js', 'js/data/kaoyan.js',
  'js/data/ielts.js', 'js/data/job.js',
  'js/phrases.js', 'js/core.js', 'js/app.js'
];

function El() {
  this.innerHTML = '';
  this.textContent = '';
  this.value = '';
  this.hidden = false;
  this.style = {};
  this.dataset = {};
  this.attrs = {};
  this.listeners = {};
  this.classList = { add() {}, remove() {}, toggle() {}, contains() { return false; } };
}
El.prototype.addEventListener = function (type, fn) {
  (this.listeners[type] || (this.listeners[type] = [])).push(fn);
};
/** 触发最后一个监听器；extra 可覆盖事件对象（用于事件委托的 target）。 */
El.prototype.trigger = function (type, extra) {
  const list = this.listeners[type] || [];
  const fn = list[list.length - 1];
  if (!fn) { return false; }
  fn.call(this, Object.assign({ target: this, preventDefault() {} }, extra || {}));
  return true;
};
El.prototype.setAttribute = function (k, v) { this.attrs[k] = String(v); };
El.prototype.removeAttribute = function (k) { delete this.attrs[k]; };
El.prototype.getAttribute = function (k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; };
El.prototype.querySelector = function () { return new El(); };
El.prototype.querySelectorAll = function () { return []; };
El.prototype.focus = function () {};
El.prototype.closest = function () { return null; };

function bareContext() {
  const sb = {
    console,
    setTimeout: () => 0,
    clearTimeout: () => {},
    setInterval: () => 0,
    clearInterval: () => {},
    addEventListener: () => {}
  };
  sb.window = sb;
  vm.createContext(sb);
  return sb;
}

function realPhrases() {
  const sb = bareContext();
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/phrases.js'), 'utf8'), sb);
  return sb.PHRASES;
}

function makeSeed(mutator) {
  const sb = bareContext();
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/core.js'), 'utf8'), sb);
  const db = sb.Core.defaultDB();
  if (mutator) { mutator(db, sb.Core); }
  return db;
}

/**
 * 渲染并返回 {html, q, writes, flush}。
 * Core.saveDB 是 120ms 防抖（setTimeout），故用可控定时器队列：flush() 执行待跑回调后再看写入。
 */
function renderMine(seedDB) {
  const els = {};
  const q = (sel) => (els[sel] || (els[sel] = new El()));
  const writes = [];
  const timers = new Map();
  let seq = 0;
  const flush = () => { const fns = [...timers.values()]; timers.clear(); fns.forEach((fn) => fn()); };
  const sb = bareContext();
  sb.setTimeout = (fn) => { const id = ++seq; timers.set(id); timers.set(id, fn); return id; };
  sb.clearTimeout = (id) => { timers.delete(id); };
  sb.location = { hash: '#/mine' };
  sb.document = {
    documentElement: new El(),
    querySelector: q,
    querySelectorAll: () => [],
    addEventListener: () => {}
  };
  sb.localStorage = {
    getItem: () => JSON.stringify(seedDB),
    setItem: (k, v) => { writes.push(String(v)); }
  };
  SCRIPTS.forEach((f) => {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sb, { filename: f });
  });
  return { html: q('#view').innerHTML, q, writes, flush };
}

function renderAt(hash, seedDB) {
  const els = {};
  const q = (sel) => (els[sel] || (els[sel] = new El()));
  const sb = bareContext();
  sb.location = { hash: hash };
  sb.document = { documentElement: new El(), querySelector: q, querySelectorAll: () => [], addEventListener: () => {} };
  sb.localStorage = { getItem: () => JSON.stringify(seedDB), setItem: () => {} };
  SCRIPTS.forEach((f) => {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sb, { filename: f });
  });
  return q('#view').innerHTML;
}

/** 定位设置页「记忆强度叠加」组 HTML（组标题 → 目标与计划组之间）。 */
function groupHtml(html, P) {
  const i = html.indexOf(P.STRENGTH.modeSection);
  assert.ok(i >= 0, '设置页应含 STRENGTH.modeSection 组标题');
  const j = html.indexOf('目标与计划', i);
  return html.slice(i, j > i ? j : i + 2000);
}

/* ---------- ① 设置页出现开关组：44px 分段控件 + 双向可点 ---------- */
test('设置页：出现「记忆强度叠加」组，.seg 分段控件含开/关两键与 role=group', () => {
  const P = realPhrases();
  const { html } = renderMine(makeSeed());
  const g = groupHtml(html, P);
  assert.ok(g.includes('id="setStrength"'), '应有 id=setStrength 控件');
  assert.ok(g.includes('role="group"'), '分段控件应为 role=group');
  assert.ok(g.includes('data-strength="on"') && g.includes('data-strength="off"'), '应有开/关两个按钮');
  assert.ok(g.includes(P.STRENGTH.modeOn) && g.includes(P.STRENGTH.modeOff), '按钮文案取自 phrases');
  // .seg button 在 css/app.css 中 min-height:44px（命中区判据）
  const css = fs.readFileSync(path.join(ROOT, 'css/app.css'), 'utf8');
  assert.ok(/\.seg button \{[^}]*min-height: 44px/.test(css), '.seg button 应为 44px 命中区');
});

/* ---------- ② 缺省 OFF（C4/D-042④）：默认库渲染为「关闭」态 ---------- */
test('缺省 OFF：默认库渲染 off 活动键 + 状态文案「未开启」，aria-pressed 与真源一致', () => {
  const P = realPhrases();
  const { html } = renderMine(makeSeed());
  const g = groupHtml(html, P);
  const offBtn = g.match(/<button data-strength="off"[^>]*>/);
  const onBtn = g.match(/<button data-strength="on"[^>]*>/);
  assert.ok(offBtn && onBtn, '两个按钮应存在');
  assert.ok(/class="active"/.test(offBtn[0]), 'off 键应为活动态');
  assert.ok(/aria-pressed="true"/.test(offBtn[0]), 'off 键 aria-pressed 应为 true');
  assert.equal(/class="active"/.test(onBtn[0]), false, 'on 键不应为活动态');
  assert.ok(/aria-pressed="false"/.test(onBtn[0]), 'on 键 aria-pressed 应为 false');
  assert.ok(g.includes(P.STRENGTH.modeState(false)), '应显示「未开启」状态文案');
  assert.equal(g.includes(P.STRENGTH.modeState(true)), false, '不应显示「已开启」状态文案');
});

/* ---------- ③ 已开启态渲染：读真源，不是本地状态 ---------- */
test('已开启态：db.settings.strengthMode="on" 时 on 键活动、文案「已开启」', () => {
  const P = realPhrases();
  const seed = makeSeed((db) => { db.settings.strengthMode = 'on'; });
  const { html } = renderMine(seed);
  const g = groupHtml(html, P);
  const onBtn = g.match(/<button data-strength="on"[^>]*>/);
  assert.ok(/class="active"/.test(onBtn[0]), 'on 键应为活动态');
  assert.ok(/aria-pressed="true"/.test(onBtn[0]), 'on 键 aria-pressed 应为 true');
  assert.ok(g.includes(P.STRENGTH.modeState(true)), '应显示「已开启」状态文案');
});

/* ---------- ④ 点击「开启」→ 写真源 + toast（事件委托路径） ---------- */
test('点击「开启」：写入 db.settings.strengthMode="on"（saveDB 实写）并给出提示', () => {
  const P = realPhrases();
  const { q, writes, flush } = renderMine(makeSeed());
  const ok = q('#setStrength').trigger('click', {
    target: { getAttribute: (k) => (k === 'data-strength' ? 'on' : null) }
  });
  assert.equal(ok, true, '分段控件应有 click 监听（事件委托）');
  assert.equal(q('#toast').textContent, P.STRENGTH.modeToastOn, '应提示已开启');
  flush(); // saveDB 防抖 120ms → 跑完待执行回调
  assert.ok(writes.length > 0, 'saveDB 应产生 localStorage 写入');
  const last = writes[writes.length - 1];
  assert.ok(/"strengthMode":"on"/.test(last), '写入串应含 "strengthMode":"on"，实际：' + last.slice(0, 160));
});

/* ---------- ⑤ 可回退：已开启态点「关闭」→ off（C4 一键回到固定阶梯） ---------- */
test('可回退：已开启态点「关闭」写回 "off"，一次性退回固定阶梯', () => {
  const P = realPhrases();
  const seed = makeSeed((db) => { db.settings.strengthMode = 'on'; });
  const { q, writes, flush } = renderMine(seed);
  q('#setStrength').trigger('click', {
    target: { getAttribute: (k) => (k === 'data-strength' ? 'off' : null) }
  });
  assert.equal(q('#toast').textContent, P.STRENGTH.modeToastOff, '应提示已关闭');
  flush();
  assert.ok(writes.length > 0, 'saveDB 应产生 localStorage 写入');
  const last = writes[writes.length - 1];
  assert.ok(/"strengthMode":"off"/.test(last), '写入串应含 "strengthMode":"off"，实际：' + last.slice(0, 160));
  assert.equal(q('#toast').textContent, P.STRENGTH.modeToastOff, '应提示已关闭');
});

/* ---------- ⑥ 文案不硬编码阶梯：由 Core.LADDER_DAYS 派生；C4 静态核验 ---------- */
test('回退基线文案由 Core.LADDER_DAYS 派生（含 7 档），且 core.js 阶梯与缺省值零改动', () => {
  const P = realPhrases();
  const { html } = renderMine(makeSeed());
  const g = groupHtml(html, P);
  const ladder = [1, 2, 4, 7, 15, 30, 60];
  assert.ok(g.includes(ladder.join(' / ')), '回退文案应含由 LADDER_DAYS 拼出的 7 档：' + ladder.join(' / '));
  assert.ok(g.includes(P.STRENGTH.modeWarn), '应明示「可能有一批词立即到期」的风险');
  const core = fs.readFileSync(path.join(ROOT, 'js/core.js'), 'utf8');
  assert.ok(/var LADDER_DAYS = \[1, 2, 4, 7, 15, 30, 60\];/.test(core), 'C4：LADDER_DAYS 必须保持原值');
  assert.ok(/strengthMode: 'off'/.test(core), 'D-042④：缺省必须为 off');
});

/* ---------- ⑦ 开启态下首页仍正常渲染（无 NaN / 计划卡不破） ---------- */
test('开启态回归：strengthMode="on" 时首页计划卡仍渲染、无 NaN', () => {
  const seed = makeSeed((db) => {
    db.settings.strengthMode = 'on';
    db.onboarding.completed = true;
    db.plan = { derivedAt: Date.now(), dailyFresh: 12, dailyReview: 8, daysLeft: 30, totalWords: 3000, mastered: 500, estMinutes: 18 };
    const now = Date.now();
    db.words['w::alpha'] = {
      w: 'alpha', lvl: 2, st: 'review', due: now + 40 * 86400000, reps: 3, correct: 2, wrong: 1, wfix: 0,
      star: false, note: '', last: now - 86400000, first: now - 9 * 86400000, lastRating: 'good',
      srcBook: '', graduated: false,
      evts: [{ t: now - 9 * 86400000, rating: 'know', interval: 86400000, type: null }]
    };
  });
  const html = renderAt('#/learn', seed);
  assert.ok(html.includes('今日计划'), '首页应含「今日计划」');
  assert.equal(html.includes('NaN'), false, '开启强度叠加后不得出现 NaN');
});

/* ---------- ⑧ 行为联调：开关真的改变到期判定（todayPlan 复习队列） ---------- */
test('行为联调：同一份数据，开启后 todayPlan 复习队列由 strengthDue 接管（0 → 1 条）', () => {
  const DAY = 86400000;
  const now = Date.now();
  const mk = (mode) => {
    const sb = bareContext();
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/core.js'), 'utf8'), sb);
    const db = sb.Core.defaultDB();
    db.settings.strengthMode = mode;
    db.words['w::alpha'] = {
      w: 'alpha', lvl: 2, st: 'review', reps: 3, correct: 3, wrong: 0, wfix: 0, star: false, note: '',
      // 固定阶梯下：due 在 40 天后 → 今天不到期；强度接手下：锚点=最后事件(10 天前) + 2 天 → 已过 8 天
      due: now + 40 * DAY, last: now - 10 * DAY, first: now - 30 * DAY, lastRating: 'know',
      srcBook: '', graduated: false,
      evts: [{ t: now - 10 * DAY, rating: 'know', interval: DAY, type: null }]
    };
    const recs = [db.words['w::alpha']];
    return { plan: sb.Core.todayPlan(db, recs), due: sb.Core.strengthDue(recs[0], recs[0].evts) };
  };
  const off = mk('off');
  const on = mk('on');
  assert.equal(off.plan.reviews.length, 0, '固定阶梯下该词 40 天后才到期，今日不应出现在复习队列');
  assert.equal(on.plan.reviews.length, 1, '开启叠加后该词已按作答历史到期，应进入复习队列');
  assert.ok(on.due < now, 'strengthDue 结果应早于当前时刻（已到期），实际 ' + new Date(on.due).toISOString());
});
