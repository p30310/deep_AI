/* ============================================================
 * #027 长期答对情况 · 统计页 UI 测试（D-054/D-055）
 * 运行：node --test tests/ui.test.retention.mjs
 * 覆盖：三态（ok / insufficient / empty）、文案逐字、单位「词」、副标三段、
 *       位置（近 14 天卡之后、仪表盘入口卡之前）、无评价色/无保持字样、零写库。
 * 模式：node:vm 真实执行 phrases/core/app；document 点击委托被捕获后手工派发。
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
const T0 = new Date(2026, 8, 1).getTime();

function makeEl() {
  const el = {
    innerHTML: '', textContent: '', value: '', hidden: false, style: {}, dataset: {}, attrs: {}, listeners: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } }
  };
  el.addEventListener = (t, fn) => { (el.listeners[t] || (el.listeners[t] = [])).push(fn); };
  el.setAttribute = (k, v) => { el.attrs[k] = String(v); };
  el.getAttribute = (k) => (Object.prototype.hasOwnProperty.call(el.attrs, k) ? el.attrs[k] : null);
  el.removeAttribute = (k) => { delete el.attrs[k]; };
  el.querySelector = () => makeEl();
  el.querySelectorAll = () => [];
  el.focus = () => {};
  el.closest = () => null;
  return el;
}

const SCRIPTS = ['js/data/cet4.js', 'js/data/cet6.js', 'js/data/kaoyan.js', 'js/data/ielts.js', 'js/data/job.js',
  'js/phrases.js', 'js/core.js', 'js/app.js'];

/** 造库：n 个词各带一段 know→(≥30天)→rating 的历史 */
function seedDb(n, secondRating) {
  const sb = { console, setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {}, addEventListener: () => {} };
  sb.window = sb;
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/core.js'), 'utf8'), sb);
  const db = sb.Core.defaultDB();
  const ev = (t, r) => ({ t, rating: r, interval: DAY, type: null });
  for (let i = 0; i < n; i++) {
    const w = 'retword' + i;
    db.words['w::' + w] = {
      w, lvl: 3, st: 'review', due: Date.now(), reps: 3, correct: 3, wrong: 0, wfix: 0,
      star: false, note: '', last: Date.now() - DAY, first: Date.now() - 20 * DAY, lastRating: 'know',
      srcBook: 'custom', graduated: false,
      evts: [ev(T0 + i * 1000, 'know'), ev(T0 + i * 1000 + 35 * DAY, secondRating || 'know')]
    };
  }
  return db;
}

/** 渲染 #/stats，返回统计页 HTML 与 PHRASES */
function renderStats(db) {
  const els = {};
  const q = (sel) => (els[sel] || (els[sel] = makeEl()));
  const sb = {
    console, setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
    addEventListener: () => {}
  };
  sb.window = sb;
  vm.createContext(sb);
  sb.location = { hash: '#/stats' };
  sb.document = {
    documentElement: makeEl(),
    querySelector: q,
    querySelectorAll: () => [],
    addEventListener: () => {}
  };
  sb.localStorage = { getItem: () => JSON.stringify(db), setItem: () => {} };
  SCRIPTS.forEach((f) => vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sb, { filename: f }));
  return { html: () => q('#view').innerHTML, P: sb.PHRASES };
}

/** 取统计页中「长期答对情况」那块卡片的 HTML */
function cardOf(html) {
  const at = html.indexOf('ret-card');
  if (at < 0) { return ''; }
  const start = html.lastIndexOf('<div class="card ret-card">', at);
  const end = html.indexOf('</div>', html.indexOf('未计入分母') >= 0 ? html.indexOf('未计入分母') : at);
  return html.slice(start >= 0 ? start : at - 40, (end > at ? end : at + 1200) + 6);
}

/* ---------- ① ok 态（样本 ≥10）：主句含行内比例，副标三段齐全 ---------- */
test('ok 态：出现「长期答对情况」卡；主句逐字含样本量与行内比例；副标三段（窗口/样本/缺口）', () => {
  const db = seedDb(10, 'know');
  db.words['w::pending1'] = { w: 'pending1', evts: [{ t: T0, rating: 'know', interval: DAY, type: null }] };
  const { html, P } = renderStats(db);
  const h = html();
  assert.ok(h.includes('ret-card'), '应渲染新卡');
  assert.ok(h.includes(P.RETENTION.title), '标题逐字：' + P.RETENTION.title);
  // 主句：比例内联（.ret-num），只出现一次
  assert.ok(/<span class="ret-num">100%<\/span>/.test(h), '比例应为行内强调元素且值为 100%');
  assert.equal((h.match(/100%/g) || []).length, 1, '同一比例只出现一次');
  assert.ok(h.includes('已观察到的 10 个词里'), '主句须带样本量');
  // 副标三段
  assert.ok(h.includes('窗口 30 天'), '窗口段');
  assert.ok(h.includes('样本 10 个词'), '样本段');
  assert.ok(h.includes('另有 1 个词尚未到观察期，未计入分母'), '缺口段');
  assert.ok(h.includes(P.RETENTION.note), '末行逐字');
});

/* ---------- ② insufficient 态（1≤M<10）：比例位整块消失 ---------- */
test('insufficient 态：主句逐字为「样本 N 个词，满 10 个才显示比例。」，无任何百分比', () => {
  const { html, P } = renderStats(seedDb(3, 'know'));
  const h = html();
  assert.ok(h.includes(P.RETENTION.leadInsufficient(3, 10)), '样本不足句逐字');
  assert.equal(/ret-num/.test(h), false, '比例位必须整块消失');
  const card = cardOf(h);
  assert.equal(/%/.test(card), false, '本卡不得出现任何百分比（比例位必须整块消失）');
  // G10 R27-F01：主句已含「样本 N 个词」，副标不得重复样本段
  assert.equal((card.match(/样本 3 个词/g) || []).length, 1, '「样本 3 个词」在卡内只出现一次');
});

/* ---------- ③ empty 态（M=0）：leadEmpty 逐字，且不出现 0% ---------- */
test('empty 态：主句逐字为 leadEmpty；无 0%、无进度环；副标只留窗口段', () => {
  const { html, P } = renderStats(seedDb(0, 'know'));
  const h = html();
  assert.ok(h.includes(P.RETENTION.leadEmpty(30)), '零样本句逐字：' + P.RETENTION.leadEmpty(30));
  assert.equal(h.includes('样本 0 个词'), false, '不得出现「样本 0 个词」');
  assert.equal(/ret-num/.test(h), false, '无比例元素');
  assert.ok(h.includes('窗口 30 天'), '窗口段始终存在');
});

/* ---------- ④ ratePct 陷阱：<1% 与真 0% 必须区分（读未取整 rate） ---------- */
test('ratePct 陷阱：rate>0 但四舍五入为 0 → 显示 <1%；rate 恰为 0 → 显示 0%（不混为一谈）', () => {
  // 1000 词、1 词保留 → rate=0.001 → ratePct=0 → 应显示 <1%
  const tiny = seedDb(1000, 'unknown');
  tiny.words['w::retword0'].evts[1].rating = 'know';   // 1000 词里只有 1 词答对 → rate=0.001
  const t = renderStats(tiny);
  const h1 = t.html();
  // HTML 转义后为 &lt;1%（'<' 被转义，XSS 防护正确）
  assert.ok(/<span class="ret-num">&lt;1%<\/span>/.test(h1), '真实值 >0 但取整为 0 时应显示 <1%（行内强调）');
  assert.equal(/<span class="ret-num">0%<\/span>/.test(h1), false, '不得把 <1% 显示成 0%');
  // 10 词、全部未保留 → rate=0 → 显示 0%（真 0%，样本足量时是事实）
  const zero = seedDb(10, 'unknown');
  const h2 = renderStats(zero).html();
  assert.ok(h2.includes('>0%</span>'), 'rate 恰为 0 时应显示 0%');
  // G10 R27-F02：上端对称保护——999/1000 不得显示 100%
  const near = seedDb(1000, 'know');
  near.words['w::retword0'].evts[1].rating = 'unknown';   // 1000 词里 999 答对 → 99.9%
  const h3 = renderStats(near).html();
  assert.ok(h3.includes('&gt;99%'), '真实值 <100% 但取整为 100 时应显示 >99%');
  assert.equal(/<span class="ret-num">100%<\/span>/.test(h3), false, '不得把 99.9% 显示成 100%');
});

/* ---------- ⑤ 禁项：文案零「保持/留存/正确率」，禁评价色 ---------- */
test('禁项：本卡文案不得出现「保持/留存/记忆率/正确率/估计」等词，也不得引入判定色', () => {
  const { html } = renderStats(seedDb(12, 'know'));
  const card = cardOf(html());
  assert.ok(card.length > 0, '应能定位到卡片 HTML');
  assert.equal(/保持|留存|记忆率|正确率|估计|预测|预估/.test(card), false, '卡片内禁这些字样');
  assert.equal(/--danger|--warn|--success/.test(card), false, '不得引入判定色');
  assert.equal(/进度环|conic-gradient/.test(card), false, '不得出现进度环');
});

/* ---------- ⑤ 位置：近 14 天卡之后、仪表盘入口卡之前 ---------- */
test('位置：新卡在「近 14 天有效完成率」卡之后、仪表盘入口卡之前（不进四卡栅格）', () => {
  const v = renderStats(seedDb(10, 'know'));
  const h = v.html();
  const iComp = h.indexOf('近 14 天有效完成率');
  const iRet = h.indexOf('ret-card');
  // G10 P3：原锚点 indexOf('strengthEntryHtml') 在渲染 HTML 内恒 -1（函数名不入 DOM）→ 断言空跑。
  // 改用该卡真实文案锚点（PHRASES.STRENGTH_ENTRY.title），并断言锚点确实存在（否则测试自己会红）
  const dashMark = v.P.STRENGTH_ENTRY.title;
  const iDash = h.indexOf(dashMark);
  assert.ok(iComp >= 0 && iRet > iComp, '新卡须在近 14 天卡之后');
  assert.ok(iDash > 0, '仪表盘入口卡锚点必须存在（防止断言空跑）：' + dashMark);
  assert.ok(iRet < iDash, '新卡须在仪表盘入口卡之前');
  // 不并入 .stat-cards：卡片本体不在 stat-cards 容器内
  const statCardsEnd = h.indexOf('</div>', h.indexOf('stat-cards'));
  assert.ok(iRet > statCardsEnd, '新卡不得位于四卡栅格内');
});

/* ---------- ⑥ 零写库：渲染统计页不改动 db ---------- */
test('零写库：渲染统计页前后 db JSON 逐字节全等、顶层键集不变', () => {
  const db = seedDb(12, 'know');
  const before = JSON.stringify(db);
  const keysBefore = Object.keys(db).sort().join(',');
  const { html } = renderStats(db);
  assert.ok(html().includes('ret-card'), '确实渲染了');
  assert.equal(JSON.stringify(db), before, 'db 必须逐字节未变');
  assert.equal(Object.keys(db).sort().join(','), keysBefore, '顶层键集不变');
});
