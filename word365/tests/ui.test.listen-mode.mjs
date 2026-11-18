/* ============================================================
 * #023 听写模式独立测试（D-046）
 * 运行：node --test tests/ui.test.listen-mode.mjs
 * 设计：听写是 mode='type' 的子模式（listen=1），判定/键盘/撤销走同一链路，
 *       只替换提示方式 → 本文件重点验证「提示被遮蔽 / 可揭示 / 可切回」。
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
// 提示区的统一前缀（多义项时 typeSensePrompt 会带「本次义项：」）；用它判断「提示是否被遮蔽」，
// 不绑定具体义项文本，避免与 pickSense 的确定性选义耦合。
const PROMPT_MARK = '本次义项';

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

function seedDB() {
  const sb = { console, setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {}, addEventListener: () => {} };
  sb.window = sb;
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/core.js'), 'utf8'), sb);
  const db = sb.Core.defaultDB();
  const now = Date.now();
  db.words['w::absorb'] = {
    w: 'absorb', lvl: 2, st: 'review', due: now - DAY, reps: 3, correct: 3, wrong: 0, wfix: 0,
    star: false, note: '', last: now - 3 * DAY, first: now - 20 * DAY, lastRating: 'know',
    srcBook: 'cet4', graduated: false,
    evts: [{ t: now - 3 * DAY, rating: 'know', interval: DAY, type: null }]
  };
  return { db, now };
}

const SCRIPTS = ['js/data/cet4.js', 'js/data/cet6.js', 'js/data/kaoyan.js', 'js/data/ielts.js', 'js/data/job.js',
  'js/phrases.js', 'js/core.js', 'js/app.js'];

/** 渲染指定 hash，返回 { html(), q, fire, P }；fire 用于派发 [data-sact] 点击。 */
function render(hash, db) {
  const els = {};
  const q = (sel) => (els[sel] || (els[sel] = makeEl()));
  const docClick = [];
  const sb = { console, setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {}, addEventListener: () => {} };
  sb.window = sb;
  vm.createContext(sb);
  sb.location = { hash: hash };
  sb.document = {
    documentElement: makeEl(),
    querySelector: q,
    querySelectorAll: () => [],
    addEventListener: (t, fn) => { if (t === 'click') { docClick.push(fn); } }
  };
  sb.localStorage = { getItem: () => JSON.stringify(db), setItem: () => {} };
  SCRIPTS.forEach((f) => vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sb, { filename: f }));

  function fire(act, attrs) {
    const a = attrs || {};
    const el = {
      getAttribute: (k) => (k === 'data-sact' ? act : (Object.prototype.hasOwnProperty.call(a, k) ? a[k] : null))
    };
    const ev = { target: { closest: (sel) => (sel === '[data-sact]' ? el : null) }, preventDefault() {} };
    docClick.forEach((fn) => fn(ev));
  }

  return {
    html: () => q('#view').innerHTML,
    body: () => q('#studyBody').innerHTML,
    hash: () => sb.location.hash,
    q, fire, P: sb.PHRASES
  };
}

/* ---------- ① 五个标签：听写作为 type 的子模式出现，且只有它能处于活动态 ---------- */
test('学习页标签：出现「听写」，listen=1 时听写活动、写出英文不活动', () => {
  const { db } = seedDB();
  const listen = render('#/study?scope=review&mode=type&listen=1', db);
  const html = listen.html();
  const P = listen.P;
  assert.ok(html.includes(P.LISTEN.tab), '标签栏应含听写');
  const listenTab = html.match(/<button class="tab([^"]*)" data-sact="tab" data-mode="type" data-listen="1"[^>]*>/);
  assert.ok(listenTab, '应存在 data-listen="1" 的听写标签');
  assert.ok(listenTab[1].includes('active'), '听写标签应为活动态');

  const typeTab = html.match(/<button class="tab([^"]*)" data-sact="tab" data-mode="type"(?! data-listen)[^>]*>/);
  assert.ok(typeTab, '应存在普通「写出英文」标签');
  assert.equal(typeTab[1].includes('active'), false, '听写态下「写出英文」不应同时活动（避免双高亮）');
});

/* ---------- ② 提示遮蔽：听写态不得出现中文释义，只给发音入口 ---------- */
test('听写态：页面不含中文释义，含「听音写词」与重听/看提示入口', () => {
  const { db } = seedDB();
  const view = render('#/study?scope=review&mode=type&listen=1', db);
  const h = view.body();
  const P = view.P;
  assert.equal(h.includes(PROMPT_MARK), false, '听写态不得直接给出中文释义');
  assert.ok(h.includes(P.LISTEN.title), '应显示「听音写词」标题');
  assert.ok(h.includes('data-sact="listen-play"'), '应有重听按钮');
  assert.ok(h.includes('data-sact="listen-reveal"'), '应有「看中文提示」按钮');
  assert.ok(h.includes(P.LISTEN.placeholder), '输入框 placeholder 应为听写专用文案');
});

/* ---------- ③ 可揭示：点「看中文提示」后出现释义，提示区让位 ---------- */
test('听写态：点「看中文提示」后显示释义；提示只影响本次会话，不写库', () => {
  const { db } = seedDB();
  const view = render('#/study?scope=review&mode=type&listen=1', db);
  assert.equal(view.html().includes(PROMPT_MARK), false);
  view.fire('listen-reveal');
  const h = view.body();
  assert.ok(h.includes(PROMPT_MARK), '揭示后应显示中文释义');
  assert.equal(h.includes('data-sact="listen-reveal"'), false, '已揭示后不应再出现「看中文提示」');
});

/* ---------- ④ 回归：普通「写出英文」仍给中文、无听写块 ---------- */
test('回归：非听写（mode=type 无 listen）仍显示中文释义，且无听写提示块', () => {
  const { db } = seedDB();
  const h = render('#/study?scope=review&mode=type', db).body();
  assert.ok(h.includes(PROMPT_MARK), '写出模式必须给中文提示');
  assert.equal(h.includes('listen-stage'), false, '非听写不应出现听写提示块');
});

/* ---------- ⑤ 切换标签：听写 → 单词快过 会去掉 listen 参数 ---------- */
test('切换标签：从听写切到单词快过，hash 不再携带 listen（避免其他模式被 listen 污染）', () => {
  const { db } = seedDB();
  const view = render('#/study?scope=review&mode=type&listen=1', db);
  assert.ok(view.hash().includes('listen=1'), '初始应在听写态');
  view.fire('tab', { 'data-mode': 'flash' });
  assert.ok(view.hash().includes('mode=flash'), '应切到 flash，实际 ' + view.hash());
  assert.equal(view.hash().includes('listen=1'), false, '非听写模式不应保留 listen 参数');
});

/* ---------- ⑥ 无音频环境不崩：Audio 不存在时仍渲染出完整页面 ---------- */
test('降级：运行环境无 Audio / 语音合成时，听写页仍正常渲染（不抛错、不空白）', () => {
  const { db } = seedDB();
  let view;
  assert.doesNotThrow(() => { view = render('#/study?scope=review&mode=type&listen=1', db); });
  const h = view.body();
  assert.ok(h.length > 100, '页面应有实质内容，实际 ' + h.length);
  assert.ok(h.includes('data-sact="listen-play"'), '仍保留重听入口，用户可改点「看中文提示」');
});
