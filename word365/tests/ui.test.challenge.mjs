/* ============================================================
 * #025 今日挑战 · UI 冒烟（D-048/D-049；CH-AC01/05/07/10/11/15/17）
 * 运行：node --test tests/ui.test.challenge.mjs
 * 模式：node:vm 真实执行 phrases/core/app；document 上的 click/keydown 委托被捕获后手工派发。
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
const AT = new Date(2026, 10, 17, 10, 0, 0).getTime();

function makeEl() {
  const el = {
    innerHTML: '', textContent: '', value: '', hidden: false, disabled: false,
    style: {}, dataset: {}, attrs: {}, listeners: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } }
  };
  el.addEventListener = (t, fn) => { (el.listeners[t] || (el.listeners[t] = [])).push(fn); };
  el.trigger = (t, extra) => {
    const list = el.listeners[t] || [];
    const fn = list[list.length - 1];
    if (!fn) { return false; }
    fn.call(el, Object.assign({ target: el, preventDefault() {}, key: '' }, extra || {}));
    return true;
  };
  el.setAttribute = (k, v) => { el.attrs[k] = String(v); };
  el.getAttribute = (k) => (Object.prototype.hasOwnProperty.call(el.attrs, k) ? el.attrs[k] : null);
  el.removeAttribute = (k) => { delete el.attrs[k]; };
  el.querySelector = () => makeEl();
  el.querySelectorAll = () => [];
  el.focus = () => { el.focused = true; };
  el.closest = () => null;
  return el;
}

const SCRIPTS = ['js/data/cet4.js', 'js/data/cet6.js', 'js/data/kaoyan.js', 'js/data/ielts.js', 'js/data/job.js',
  'js/phrases.js', 'js/core.js', 'js/app.js'];

/** 渲染首页；返回 {view, modal, sb, db, click(act), key(k)} */
function boot(opts) {
  const o = opts || {};
  const els = {};
  const q = (sel) => (els[sel] || (els[sel] = makeEl()));
  const doc = { click: [], keydown: [] };
  const timers = new Map();
  let seq = 0;
  const sb = { console, setInterval: () => 0, clearInterval: () => {}, addEventListener: () => {} };
  sb.window = sb;
  vm.createContext(sb);
  sb.setTimeout = (fn) => { const id = ++seq; timers.set(id, fn); return id; };
  sb.clearTimeout = (id) => { timers.delete(id); };
  sb.location = { hash: '#/learn' };
  sb.document = {
    documentElement: makeEl(),
    querySelector: q,
    querySelectorAll: () => [],
    addEventListener: (t, fn) => { if (doc[t]) { doc[t].push(fn); } }
  };

  // 先加载词库数据，否则 seedBooks 拿不到 W365_BOOK_CET4，db.books 为空
  ['js/data/cet4.js', 'js/data/cet6.js', 'js/data/kaoyan.js', 'js/data/ielts.js', 'js/data/job.js']
    .forEach((f) => vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sb, { filename: f }));
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/core.js'), 'utf8'), sb);
  const db = sb.Core.defaultDB();
  const defs = [sb.W365_BOOK_CET4, sb.W365_BOOK_CET6, sb.W365_BOOK_KAOYAN, sb.W365_BOOK_IELTS, sb.W365_BOOK_JOB].filter(Boolean);
  sb.Core.seedBooks(db, defs);
  if (o.empty) {
    db.words = {};
  } else {
    const words = (db.books[0] && db.books[0].words) || [];
    for (let i = 0; i < (o.dueCount == null ? 6 : o.dueCount); i++) {
      db.words[sb.Core.wordKey(words[i].w)] = {
        w: words[i].w, lvl: 2, st: 'review', due: AT - DAY, reps: 3, correct: 3, wrong: 0, wfix: 0,
        star: false, note: '', last: AT - 3 * DAY, first: AT - 20 * DAY, lastRating: 'know',
        srcBook: 'cet4', graduated: false, evts: []
      };
    }
  }
  const writes = [];
  sb.localStorage = { getItem: () => JSON.stringify(db), setItem: (k, v) => { writes.push(String(v)); } };
  SCRIPTS.forEach((f) => vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sb, { filename: f }));

  function click(act) {
    const el = { getAttribute: (k) => (k === 'data-sact' ? act : null), getAttributeNames: () => [] };
    doc.click.forEach((fn) => fn({ target: { closest: (sel) => (sel === '[data-sact]' ? el : null) }, preventDefault() {} }));
  }
  function key(k) { doc.keydown.forEach((fn) => fn({ key: k, preventDefault() {} })); }
  const flush = () => { const fns = [...timers.values()]; timers.clear(); fns.forEach((fn) => fn()); };

  const lastSaved = () => {
    if (!writes.length) { return null; }
    try { return JSON.parse(writes[writes.length - 1]); } catch (e) { return null; }
  };
  return {
    q, sb, db, click, key, flush, writes, lastSaved,
    view: () => q('#view').innerHTML,
    modal: () => q('#modalRoot').innerHTML
  };
}

/* ---------- CH-AC01：入口卡在首页、是 button、无卡面点阵 ---------- */
test('CH-AC01 入口卡：首页渲染「今日挑战」按钮，有 data-act，且卡面不含点阵（G1 否决 5 点）', () => {
  const { view } = boot({});
  const html = view();
  assert.ok(html.includes('data-act="challenge-open"'), '应有挑战入口');
  assert.ok(html.includes('今日挑战'), '标题应逐字「今日挑战」');
  const card = html.slice(html.indexOf('challenge-card'), html.indexOf('challenge-card') + 700);
  assert.equal(card.includes('cc-dots'), false, '卡面不得渲染点阵（会被读成 5/5）');
  assert.ok(/aria-label="开始挑战：(5 个词|今天有 \d+ 个词)"/.test(card), 'aria-label 应带题量、不带时长');
  assert.ok(html.indexOf('home-hero') < html.indexOf('challenge-card'), '卡片应在 hero 之后');
  assert.ok(html.indexOf('challenge-card') < html.indexOf('home-cards'), '卡片应在词书卡之前');
});

/* ---------- CH-AC15：空态不可点、无按钮 ---------- */
test('CH-AC15 空态：无到期词时渲染空态文案、无按钮、点击不展开覆盖层', () => {
  const { view, modal, q } = boot({ empty: true });
  const html = view();
  assert.ok(html.includes('今天没有到期的词，也没有错词'), '应显示空态句');
  assert.equal(html.includes('data-act="challenge-open"'), false, '空态不得有入口按钮');
  assert.ok(html.includes('is-empty'), '应有 is-empty 态类');
  q('[data-act="challenge-open"]').trigger('click');
  assert.equal(modal(), '', '空态点击不应展开覆盖层');
});

/* ---------- 点卡片开局：题号/题干/选项 ---------- */
test('开局：点入口卡展开第 1 题，含题号、中文题干、4 个可点选项与退出按钮', () => {
  const { q, modal, sb } = boot({});
  q('[data-act="challenge-open"]').trigger('click');
  const m = modal();
  assert.ok(m.includes('第 1 / 5 题'), '题号应逐字「第 1 / 5 题」');
  assert.ok(m.includes('选出下面释义对应的英文'), '应有题干小标签');
  assert.equal((m.match(/data-ch-idx="/g) || []).length, 4, '应有 4 个选项');
  assert.ok(m.includes('data-ch-quit'), '应有「先合上」');
  assert.ok(m.includes('ch-quit-hint'), '应有中途退出提示');
  assert.equal(sb.location.hash, '#/learn', 'CH-AC05：开局不得改 hash');
});

/* ---------- CH-AC07/17：数字键作答 → 反馈锁定、题号不变 ---------- */
test('作答：数字键 1 可作答，出现事实反馈且选项锁定；再按其他键反馈不变', () => {
  const { q, modal, key } = boot({});
  q('[data-act="challenge-open"]').trigger('click');
  key('1');
  const after = modal();
  assert.ok(/选对了|这个词是/.test(after), '应出现事实反馈（选对了 / 这个词是 …）');
  assert.equal((after.match(/data-ch-idx="\d+" disabled/g) || []).length, 4, '作答后 4 个选项应全部 disabled');
  assert.ok(after.includes('第 1 / 5 题'), '题号不应变化');
  key('2');
  assert.equal(modal(), after, '已回答时再按键，DOM 应逐字不变');
});

/* ---------- CH-AC10：走完 5 题 → 结果句 + 落库 + 卡片转完成态 ---------- */
test('完成：连答 5 题后出结果句（含「学习进度没有改动」），写 db.challenge，首页卡转完成态', () => {
  const { q, modal, key, flush, view, db, sb, lastSaved } = boot({});
  q('[data-act="challenge-open"]').trigger('click');
  for (let i = 0; i < 5; i++) {
    key('1');
    const next = q('[data-ch-next]');
    next.trigger('click');
  }
  const m = modal();
  assert.ok(m.includes('学习进度没有改动'), '结果句必须带「学习进度没有改动」');
  assert.ok(/今天这 5 个词/.test(m), '结果句应逐字以「今天这 5 个词」开头');
  flush(); // saveDB 防抖 120ms
  const saved = lastSaved();
  assert.ok(saved, '应发生一次落盘');
  assert.equal(saved.challenge.size, 5, '应落库 size=5');
  assert.equal(saved.challenge.dateKey, sb.Core.dayKey(), '应落库今日日期键');
  assert.equal(Object.keys(saved.challenge).sort().join(','), 'dateKey,doneAt,size', '键集恰三项');
  assert.equal(JSON.stringify(saved.words), JSON.stringify(db.words), 'db.words 不得被挑战写动');
  assert.ok(view().includes('今天已完成 · 5 个词'), '首页卡应转完成态');
  assert.equal(view().includes('data-act="challenge-open"'), false, '完成态不得再给入口按钮');
});

/* ---------- CH-AC12：中途退出不落库、提示逐字 ---------- */
test('中途退出：第 1 题点「先合上」→ 不写 db.challenge、toast 逐字、覆盖层关闭', () => {
  const { q, modal, db } = boot({});
  const before = JSON.stringify(db.challenge);
  q('[data-act="challenge-open"]').trigger('click');
  q('[data-ch-quit]').trigger('click');
  assert.equal(JSON.stringify(db.challenge), before, '中途退出不得写完成事实');
  assert.equal(modal(), '', '覆盖层应关闭');
  assert.equal(q('#toast').textContent, '已合上，这次不算今天完成', 'toast 文案应逐字');
});

/* ---------- 文案红线：全流程不出现评分语汇 ---------- */
test('文案红线：首页与结果页均不出现得分/正确率/达标/评级/分数/百分号', () => {
  const { q, modal, key, view } = boot({});
  q('[data-act="challenge-open"]').trigger('click');
  for (let i = 0; i < 5; i++) { key('1'); q('[data-ch-next]').trigger('click'); }
  const html = view();
  const at = html.indexOf('challenge-card');
  const end = html.indexOf('home-cards');
  // 精确切到「词书卡」之前：词书卡里带「12%」属既有元素，不得算进挑战文案
  const card = at >= 0 ? html.slice(at, end > at ? end : at + 800) : '';
  const all = card + modal();
  assert.equal(/得分|正确率|满分|达标|评级|分数/.test(all), false, '不得出现评分语汇');
  assert.equal(all.indexOf('%') < 0, true, '挑战卡与结果弹窗不得出现百分号');
});

/* ---------- AC17 补测：结果页 Esc 关闭（G1 判我不通过的那条） ---------- */
test('AC17 结果页 Esc：完成后再按 Esc 应关闭覆层，且不再弹「先合上」提示', () => {
  const { q, modal, key, db } = boot({});
  q('[data-act="challenge-open"]').trigger('click');
  for (let i = 0; i < 5; i++) { key('1'); q('[data-ch-next]').trigger('click'); }
  assert.ok(modal().includes('学习进度没有改动'), '结果页应已出现');
  q('#toast').textContent = '';
  key('Escape');
  assert.equal(modal(), '', '结果页 Esc 必须能关闭');
  assert.equal(q('#toast').textContent, '', '结果页关闭不应再提示「先合上」');
});

/* ---------- 遮罩点击：等同「先合上」，不残留 flow（G5 §9-3 / G2 D5） ---------- */
test('遮罩关闭：中途点遮罩 → 不写完成事实、提示同「先合上」、随后按键不再作答', () => {
  const { q, modal, key, db, lastSaved } = boot({});
  const before = JSON.stringify(db.challenge);
  q('[data-act="challenge-open"]').trigger('click');
  // 模拟遮罩点击：closeModal 被调用（真实 DOM 由 openModal 绑定，这里直连同一条路径）
  const mask = q('#modalRoot .modal-mask');
  mask.trigger('click', { currentTarget: mask });   // 真实 DOM 里 target===currentTarget 即遮罩空白处
  assert.equal(q('#toast').textContent, '已合上，这次不算今天完成', '遮罩关闭应给同一提示');
  const m1 = modal();
  key('1'); // flow 已清，按键不应再改任何东西
  assert.equal(modal(), m1, '残留 flow 必须被清掉，按键无效果');
  assert.equal(JSON.stringify(db.challenge), before, '中途关闭不得写完成事实');
});

/* ---------- AC17 焦点：三条退出路径都要把焦点交回卡片（G1 要求各一条断言） ---------- */
test('AC17 焦点：中途按 Esc / 点遮罩 关闭后，焦点回到入口卡', () => {
  const a = boot({});
  a.q('[data-act="challenge-open"]').trigger('click');
  a.key('Escape');
  assert.equal(a.q('.challenge-card').focused, true, 'Esc 退出后应聚焦挑战卡');

  const b = boot({});
  b.q('[data-act="challenge-open"]').trigger('click');
  const mask = b.q('#modalRoot .modal-mask');
  mask.trigger('click', { currentTarget: mask });
  assert.equal(b.q('.challenge-card').focused, true, '遮罩退出后应聚焦挑战卡');
});

test('AC17 焦点：完成态点「合上」后，焦点回到挑战卡本体（此时已非 button）', () => {
  const { q, key } = boot({});
  q('[data-act="challenge-open"]').trigger('click');
  for (let i = 0; i < 5; i++) { key('1'); q('[data-ch-next]').trigger('click'); }
  q('#chResultClose').trigger('click');
  assert.equal(q('.challenge-card').focused, true, '结果页关闭后应聚焦挑战卡（tabindex=-1）');
});

/* ---------- G10 F02：作答后焦点必须离开已 disabled 的选项 ---------- */
test('G10-F02 焦点：作答后聚焦「下一题」，未作答时聚焦首选项；Enter 可进下一题', () => {
  const { q, modal, key } = boot({});
  q('[data-act="challenge-open"]').trigger('click');
  assert.equal(q('#modalRoot .ch-opt').focused, true, '未作答应聚焦首选项');
  key('1');
  assert.equal(q('#modalRoot [data-ch-next]').focused, true, '作答后应聚焦下一题（选项已 disabled）');
  key('Enter');
  assert.ok(modal().includes('第 2 / 5 题'), 'Enter 应进入第 2 题');
});

/* ---------- G5/G1：结果弹层打开时焦点进对话框；关闭后回卡片（方向成对） ---------- */
test('结果页焦点：打开即聚焦「合上」，关闭后回挑战卡，不留焦点在背后', () => {
  const { q, key } = boot({});
  q('[data-act="challenge-open"]').trigger('click');
  for (let i = 0; i < 5; i++) { key('1'); q('[data-ch-next]').trigger('click'); }
  assert.equal(q('#chResultClose').focused, true, '结果页打开后焦点应在「合上」');
  q('#chResultClose').trigger('click');
  assert.equal(q('.challenge-card').focused, true, '关闭后焦点应回卡片');
});
