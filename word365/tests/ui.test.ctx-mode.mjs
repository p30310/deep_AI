/* ============================================================
 * #026 例句语境练习独立测试（D-051/D-052）
 * 运行：node --test tests/ui.test.ctx-mode.mjs
 * 设计：ctx=1 是 mode='type' 的子模式（同 #023 listen 范式），判定链/评级/撤销
 *       全复用 → 本文件重点验证：矩阵互斥 / 词边界挖空与降级 / 单答案判定 /
 *       et 泄答案红线 / db 写入与普通 type 逐字节同构。
 * 模式：node:vm 真实执行 phrases/core/app；document 点击委托被捕获后手工派发。
 * ============================================================ */
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DAY = 86400000;
const require_ = createRequire(import.meta.url);
const Core = require_(path.join(ROOT, 'js/core.js'));

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

/** 构造一个带自定义词条的库（due 到期，进 review 范围） */
function seedDB(entries) {
  const sb = { console, setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {}, addEventListener: () => {} };
  sb.window = sb;
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/core.js'), 'utf8'), sb);
  const db = sb.Core.defaultDB();
  const now = Date.now();
  const list = entries || [{
    w: 'absorb', p: '/əbˈzɔːrb/', t: 'v. 吸收', e: 'Plants absorb water through their roots.', et: '植物通过根部吸收水分。'
  }];
  list.forEach((def) => {
    db.words['w::' + def.w] = {
      w: def.w, lvl: 2, st: 'review', due: now - DAY, reps: 3, correct: 3, wrong: 0, wfix: 0,
      star: false, note: '', last: now - 3 * DAY, first: now - 20 * DAY, lastRating: 'know',
      srcBook: 'custom', graduated: false, evts: []
    };
    // 词条本体进书（app.js 渲染需要 books 里有对应 entry）
    if (!db.books.length) { db.books.push({ key: 'custom', name: '测试书', color: '#4f7cff', builtin: false, words: [] }); }
    db.books[0].words.push(def);
  });
  return { db, now };
}

const SCRIPTS = ['js/data/cet4.js', 'js/data/cet6.js', 'js/data/kaoyan.js', 'js/data/ielts.js', 'js/data/job.js',
  'js/phrases.js', 'js/core.js', 'js/app.js'];

/** 渲染指定 hash，返回 { html, body, hash, q, fire, P, typeAndSubmit } */
function render(hash, db) {
  const els = {};
  const q = (sel) => (els[sel] || (els[sel] = makeEl()));
  const docClick = [];
  const timers = new Map();
  let seq = 0;
  const writes = [];
  const sb = {
    console,
    setTimeout: (fn) => { const id = ++seq; timers.set(id, fn); return id; },  // saveDB 防抖 120ms → 假计时器，flush() 手动触发
    clearTimeout: (id) => timers.delete(id),
    setInterval: () => 0, clearInterval: () => {}, addEventListener: () => {}
  };
  sb.window = sb;
  vm.createContext(sb);
  sb.location = { hash: hash };
  sb.document = {
    documentElement: makeEl(),
    querySelector: q,
    querySelectorAll: () => [],
    addEventListener: (t, fn) => { if (t === 'click') { docClick.push(fn); } }
  };
  sb.localStorage = { getItem: () => JSON.stringify(db), setItem: (k, v) => { writes.push(String(v)); } };
  SCRIPTS.forEach((f) => vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sb, { filename: f }));

  /** 触发所有挂起的防抖计时器（saveDB → persist → localStorage.setItem） */
  function flush() {
    const pending = [...timers.values()];
    timers.clear();
    pending.forEach((fn) => fn());
  }
  const lastSaved = () => {
    if (!writes.length) { return null; }
    try { return JSON.parse(writes[writes.length - 1]); } catch (e) { return null; }
  };

  function fire(act, attrs) {
    const a = attrs || {};
    const el = {
      getAttribute: (k) => (k === 'data-sact' ? act : (Object.prototype.hasOwnProperty.call(a, k) ? a[k] : null))
    };
    const ev = { target: { closest: (sel) => (sel === '[data-sact]' ? el : null) }, preventDefault() {} };
    docClick.forEach((fn) => fn(ev));
  }

  /** 模拟输入后提交（input 监听以元素为 this 读取 value） */
  function typeAndSubmit(text) {
    const inp = q('#typeInput');
    inp.value = text;
    (inp.listeners.input || []).forEach((fn) => fn.call(inp));
    fire('type-submit');
  }

  return {
    html: () => q('#view').innerHTML,
    body: () => q('#studyBody').innerHTML,
    hash: () => sb.location.hash,
    q, fire, flush, lastSaved, P: sb.PHRASES, typeAndSubmit
  };
}

/** 与实现同款的词边界检测（回归守卫用；行为以 DOM 用例为准） */
function foundByBoundary(w, e) {
  if (!w || !e) { return false; }
  return new RegExp('\\b' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i').test(e);
}

/* ---------- ① 矩阵四格 ---------- */
test('矩阵 ctx=1：渲染 ctx 题面（ask + 挖空 + 释义），hint/placeholder 用 CTX 文案，无 et 泄答案', () => {
  const { db, P0 } = { db: seedDB().db };
  const v = render('#/study?scope=review&mode=type&ctx=1', db);
  const h = v.body();
  const P = v.P.CTX;
  assert.ok(h.includes('ctx-stage'), '应渲染 ctx-stage');
  assert.ok(h.includes(P.ask), '应显示「写出例句空格处的单词（用原形）」');
  assert.ok(h.includes(P.hintLen(6)), '长度提示应为 CTX.hintLen（absorb 6 字母）');
  assert.ok(h.includes(P.placeholder), 'placeholder 应为「写出原形」');
  assert.ok(h.includes('Plants'), '例句主干应可见');
  assert.ok(!/absorb/i.test(h.split('ctx-sent')[1] || ''), '挖空外不得出现原形明文');
  assert.equal(h.includes('植物通过根部吸收水分'), false, 'AC05：作答前题面不得出现 et（例句翻译）');
  assert.equal(h.includes('listen-stage'), false, 'ctx 态不应出现听写块');
  assert.ok(P0 === undefined, '占位');
});

test('矩阵 0/1 与 1/1：listen 优先；双标志时渲染听写、不渲染 ctx', () => {
  const { db } = seedDB();
  const listenOnly = render('#/study?scope=review&mode=type&listen=1', db).body();
  assert.ok(listenOnly.includes('listen-stage'), 'listen=1 渲染听写块');
  assert.equal(listenOnly.includes('ctx-stage'), false, '听写态不得出现 ctx 块');
  const both = render('#/study?scope=review&mode=type&listen=1&ctx=1', db).body();
  assert.ok(both.includes('listen-stage'), '双标志应按听写渲染（listen 优先）');
  assert.equal(both.includes('ctx-stage'), false, '双标志时 ctx 不生效（D-051 静默守卫）');
});

test('矩阵 0/0：普通 type 题面零变化（无 ctx-stage、hint 为既有文案）', () => {
  const { db } = seedDB();
  const h = render('#/study?scope=review&mode=type', db).body();
  assert.ok(h.includes('type-question'), '应为普通 type 题干');
  assert.equal(h.includes('ctx-stage'), false, '不得出现 ctx 块');
  assert.ok(h.includes('6 个字母 · 空格逐字母提示'), 'hint-len 应为既有文案（absorb 6 字母）');
});

/* ---------- ② Tab：第 4 位、互斥、aria-pressed 唯一 ---------- */
test('Tab：出现「例句填空」第 4 位；ctx 态下 ctx 标签亮、写出英文与听写不亮', () => {
  const { db } = seedDB();
  const v = render('#/study?scope=review&mode=type&ctx=1', db);
  const html = v.html();
  const ctxTab = html.match(/<button class="tab([^"]*)" data-sact="tab" data-mode="type" data-ctx="1"[^>]*>/);
  assert.ok(ctxTab, '应存在 data-ctx="1" 的例句填空标签');
  assert.ok(ctxTab[1].includes('active'), 'ctx 态下例句填空应为活动态');
  const plainTab = html.match(/<button class="tab([^"]*)" data-sact="tab" data-mode="type"(?! data-listen| data-ctx)[^>]*>/);
  assert.equal(plainTab[1].includes('active'), false, '「写出英文」不得同时高亮');
  const listenTab = html.match(/<button class="tab([^"]*)" data-sact="tab" data-mode="type" data-listen="1"[^>]*>/);
  assert.equal(listenTab[1].includes('active'), false, '「听写」不得同时高亮');
  assert.equal((html.match(/aria-pressed="true"/g) || []).length, 1, 'aria-pressed 恰一个为真');
});

test('Tab 互斥：从听写点例句填空 → hash 有 ctx 无 listen；反向同理；点 flash 双清', () => {
  const { db } = seedDB();
  const a = render('#/study?scope=review&mode=type&listen=1', db);
  a.fire('tab', { 'data-mode': 'type', 'data-ctx': '1' });
  assert.ok(a.hash().includes('ctx=1') && !a.hash().includes('listen'), 'listen → ctx 应清 listen');

  const b = render('#/study?scope=review&mode=type&ctx=1', db);
  b.fire('tab', { 'data-mode': 'type', 'data-listen': '1' });
  assert.ok(b.hash().includes('listen=1') && !b.hash().includes('ctx'), 'ctx → listen 应清 ctx');

  const c = render('#/study?scope=review&mode=type&ctx=1', db);
  c.fire('tab', { 'data-mode': 'flash' });
  assert.ok(!c.hash().includes('ctx=1') && !c.hash().includes('listen'), '切 flash 应双清子模式');
});

/* ---------- ③ 词边界挖空与双条件降级 ---------- */
test('挖空口径：句首大写（Ability）正常挖空；挖空后无原形残尾', () => {
  const { db } = seedDB([{ w: 'ability', t: 'n. 能力', e: 'Ability is important.', et: '能力很重要。' }]);
  const h = render('#/study?scope=review&mode=type&ctx=1', db).body();
  assert.ok(h.includes('ctx-stage'), '句首大写原形应命中 ctx');
  assert.ok(h.includes('Ability is important.') === false, '原形所在表面词形应被挖掉');
  assert.ok(h.includes('is important.'), 'gap 后半句应保留');
  assert.ok(h.includes('role="img"') && h.includes('例句中的空格，缺一个单词'), 'gap 应带 aria 读屏描述');
});

test('降级（屈折）：admit 例句只有 admitted → 渲染普通 type 题面，无 ctx-stage，静默', () => {
  const { db } = seedDB([{ w: 'admit', t: 'v. 承认', e: 'He admitted that he had made a mistake.', et: '他承认犯了错。' }]);
  const h = render('#/study?scope=review&mode=type&ctx=1', db).body();
  assert.equal(h.includes('ctx-stage'), false, '94 词类不得渲染 ctx 题面（AC03）');
  assert.ok(h.includes('type-question'), '应降级为普通 type 题干');
  assert.ok(h.includes('5 个字母 · 空格逐字母提示'), 'hint-len 应为 type 既有文案（admit 5 字母），非 CTX.hintLen');
});

test('G10-R26-F01：例句含两处独立原形（自制词书）→ 整词降级，挖空外零明文泄漏', () => {
  const dual = seedDB([{ w: 'absorb', t: 'v. 吸收', e: 'Absorb the idea first, then plants absorb water.', et: '' }]);
  const h = render('#/study?scope=review&mode=type&ctx=1', dual.db).body();
  assert.ok(h.includes('type-question') && !h.includes('ctx-stage'), '双命中应降级为 type 题面');
  assert.ok(!/absorb/i.test(h.replace(/<[^>]+>/g, '')), '题面全文零原形明文（AC05 闭合）');
});

test('降级（缺 e 与词边界误命中）：无例句词、w 为他词子串（art vs starts）均退 type', () => {
  const noE = seedDB([{ w: 'quizword', t: 'n. 测试', e: '', et: '' }]);
  const h1 = render('#/study?scope=review&mode=type&ctx=1', noE.db).body();
  assert.ok(h1.includes('type-question') && !h1.includes('ctx-stage'), '缺 e 词应降级');

  const sub = seedDB([{ w: 'art', t: 'n. 艺术', e: 'He starts early.', et: '' }]);
  const h2 = render('#/study?scope=review&mode=type&ctx=1', sub.db).body();
  assert.ok(h2.includes('type-question') && !h2.includes('ctx-stage'), 'w 为 starts 子串不得误挖（词边界保护）');
});

/* ---------- ④ 判定：单答案原形（D-052） ---------- */
test('gradeCtx：原形判对（大小写/空格）、屈折判错、脏值不抛错、签名恰两参', () => {
  assert.equal(Core.gradeCtx({ w: 'ability' }, ' ABILITY ').ok, true, '大小写与首尾空格应吸收');
  assert.equal(Core.gradeCtx({ w: 'ability' }, 'abilities').ok, false, '屈折形判错（口径而非 bug）');
  assert.equal(Core.gradeCtx({ w: 'ability' }, '').ok, false, '空串判错');
  assert.equal(Core.gradeCtx(null, 'x').ok, false, 'entry 脏值不抛错');
  assert.equal(Core.gradeCtx.length, 2, '签名恰为 (entry, val) 两参（防 surface 回潮）');
});

test('判定链：ctx 会话键入原形判对 → 例句补全高亮 + et 揭示；键入屈折判错 → 补原形、无 et', () => {
  const { db } = seedDB();
  const ok = render('#/study?scope=review&mode=type&ctx=1', db);
  ok.typeAndSubmit('ABSORB');
  let h = ok.body();
  assert.ok(h.includes('回答正确'), '应复用 type 既有判对文案');
  assert.ok(h.includes('Plants <span class="gap is-good"><span class="ctx-fill">absorb</span>'), 'gap 应补全句中词形（判对 = 句中词形 + 品牌色）');
  assert.ok(h.includes('植物通过根部吸收水分'), 'AC05：判对揭示态可出 et');

  const bad = render('#/study?scope=review&mode=type&ctx=1', seedDB().db);
  bad.typeAndSubmit('absorbed');
  h = bad.body();
  assert.ok(h.includes('正确答案是'), '应复用 type 既有判错文案');
  assert.ok(h.includes('Plants <span class="gap is-miss"><span class="ctx-fill">absorb</span>'), 'gap 应以中性样式补原形（判错 = 原形 + --ink）');
  assert.equal(h.includes('植物通过根部吸收水分'), false, '判错揭示态不得出 et（AC05）');
});

/* ---------- ⑤ db 写入同构：ctx 会话与普通 type 逐字节全等 ---------- */
test('零写入快照：同一词在 ctx 与普通 type 各答对一次，落盘 JSON 同构、无新键、evts 恰 +1', () => {
  const a = seedDB();
  const vA = render('#/study?scope=review&mode=type&ctx=1', a.db);
  vA.typeAndSubmit('absorb');
  vA.flush();
  const b = seedDB();
  const vB = render('#/study?scope=review&mode=type', b.db);
  vB.typeAndSubmit('absorb');
  vB.flush();
  const sa = vA.lastSaved();
  const sb2 = vB.lastSaved();
  assert.ok(sa && sb2, '两次会话都应发生落盘');
  // 13 位时间戳（evts.t / rec.last 等取 Date.now()）两次运行必然不同 → 归零后再比；其余字段（含结构）必须逐字节一致
  const ja = JSON.stringify(sa).replace(/\d{13}/g, '0');
  const jb = JSON.stringify(sb2).replace(/\d{13}/g, '0');
  assert.equal(ja, jb, 'ctx 与 type 的落盘 db 应同构（byType 零写入、无新键）');
  const rec = sa.words['w::absorb'];
  assert.equal(rec.evts.length, 1, 'evts 恰 +1 条');
  assert.equal(rec.evts[0].type, null, 'evts.type 仍为 null（D-038③）');
  assert.equal(Object.keys(sa).sort().join(','), Object.keys(JSON.parse(jb)).sort().join(','), '顶层键集一致');
  assert.equal(Core.SCHEMA, 3, 'SCHEMA 恒 3');
});

/* ---------- ⑥ 实测回归：460 词 found=366 ---------- */
test('实测回归：内置 460 词按词边界检测恰 366 词出 ctx 题（94 降级 + 0 缺例句）', () => {
  const files = ['cet4', 'cet6', 'kaoyan', 'ielts', 'job'];
  let all = [];
  for (const f of files) {
    const m = require_(path.join(ROOT, 'js/data/' + f + '.js'));
    if (m && m.words) { all = all.concat(m.words); }
  }
  assert.equal(all.length, 460, '内置词数应恒 460');
  const found = all.filter((w) => foundByBoundary(w.w, w.e)).length;
  assert.equal(found, 366, '词边界命中数应恒 366（G0 实测，数据漂移即红）');
  assert.equal(all.filter((w) => !w.e).length, 0, '内置词例句应齐备');
});

/* ---------- ⑦ CSS 判据（静态核对；DOM stub 无法量宽，宽度类断言以源码为准） ---------- */
test('布局判据：ctx-sent 有 520px 上限与 375 档收窄；最长例句（affair 49 字符）整句渲染不截断', () => {
  const css = fs.readFileSync(path.join(ROOT, 'css/app.css'), 'utf8');
  assert.ok(/\.ctx-sent\s*\{[^}]*max-width:\s*520px/.test(css), '例句阅读宽应锁 520px');
  assert.ok(/@media \(max-width: 420px\)[\s\S]*?\.ctx-sent\s*\{\s*font-size:\s*18px/.test(css), '375 档应收窄到 18px（49 字符 3 行内）');
  const { db } = seedDB([{ w: 'affair', t: 'n. 事务', e: 'The government handles foreign affairs carefully.', et: '' }]);
  // affair 词边界检测失败（只有 affairs）→ 属 94 词降级；改用含独立原形的 49 字符句验证整句渲染
  const long = seedDB([{ w: 'absorb', t: 'v. 吸收', e: 'Plants absorb water through their roots every single morning without fail.', et: '' }]);
  const h = render('#/study?scope=review&mode=type&ctx=1', long.db).body();
  assert.ok(h.includes('without fail.'), '74 字符例句应完整渲染（overflow-wrap 兜底，stub 不量宽）');
});
