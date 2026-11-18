/* ============================================================
 * v3.0 第二批视图冒烟：最小 DOM stub 下真实执行 app.js
 * 运行：node --test tests/ui.test.v3b.mjs
 * 覆盖：装订记录 / 抽测记录 / 星标精读的渲染条件与点击链路。
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
  this.listeners = {};
  this.classList = { add() {}, remove() {}, toggle() {}, contains() { return false; } };
}
El.prototype.addEventListener = function (type, fn) {
  (this.listeners[type] || (this.listeners[type] = [])).push(fn);
};
El.prototype.trigger = function (type) {
  const list = this.listeners[type] || [];
  const fn = list[list.length - 1];
  if (!fn) { return false; }
  fn.call(this, { target: this, preventDefault() {} });
  return true;
};
El.prototype.setAttribute = function () {};
El.prototype.removeAttribute = function () {};
El.prototype.getAttribute = function () { return null; };
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

function coreOnly() {
  const sb = bareContext();
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/core.js'), 'utf8'), sb);
  return sb.Core;
}

function renderAtFull(hash, seedDB) {
  const els = {};
  const q = (sel) => (els[sel] || (els[sel] = new El()));
  const sb = bareContext();
  sb.location = { hash: hash };
  sb.document = {
    documentElement: new El(),
    querySelector: q,
    querySelectorAll: () => [],
    addEventListener: () => {}
  };
  if (seedDB) {
    sb.localStorage = { getItem: () => JSON.stringify(seedDB), setItem: () => {} };
  }
  SCRIPTS.forEach((f) => {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sb, { filename: f });
  });
  return { html: q('#view').innerHTML, q: q, location: sb.location };
}

/** 含 n 个已掌握词、可选一次抽测结论、可选星标的种子库。 */
function seed(knownCount, withExamRecord, starCount) {
  const Core = coreOnly();
  const db = Core.defaultDB();
  for (let i = 0; i < knownCount; i++) {
    const w = 'word' + String(i).padStart(2, '0');
    const r = Core.newRecord(w, 'cet4');
    r.reps = 6; r.lvl = 4; r.st = 'known';
    r.due = Date.now() + 30 * 86400000;
    db.words[Core.wordKey(w)] = r;
  }
  if (withExamRecord) {
    db.exam.records.unshift({
      id: 'exam_1', at: Date.now(), size: 10, correct: 7,
      weakKeys: ['w::a', 'w::b', 'w::c'], items: []
    });
    db.exam.lastAt = Date.now();
  }
  for (let i = 0; i < (starCount || 0); i++) {
    db.words['w::word' + String(i).padStart(2, '0')].star = true;
  }
  return db;
}

test('统计页：渲染「装订记录」与「星标精读」区块', () => {
  const { html } = renderAtFull('#/stats');
  assert.ok(html.includes('近 28 天学习节律'), '第一批区块仍在（回归保护）');
  assert.ok(html.includes('已掌握词抽测'), '第一批区块仍在（回归保护）');
  assert.ok(html.includes('装订记录'), '缺少装订记录区块');
  assert.ok(html.includes('星标精读'), '缺少星标精读区块');
});

test('统计页：无抽测/无凭据/无星标时显示占位文案，不出现入口按钮', () => {
  const { html } = renderAtFull('#/stats');
  assert.ok(html.includes('完成一次已掌握词抽测后可生成凭据'));
  assert.ok(html.includes('还没有加星标的词'));
  assert.equal(html.includes('data-act="history-list"'), false);
  assert.equal(html.includes('data-act="binding-list"'), false);
  assert.equal(html.includes('data-act="star-review"'), false);
});

test('统计页：有抽测记录 + 已掌握 52 词 → 自动结算出凭据并显示两个入口', () => {
  const { html } = renderAtFull('#/stats', seed(52, true, 0));
  assert.ok(html.includes('data-act="history-list"'), '应显示抽测记录入口');
  assert.ok(html.includes('抽测记录（1）'));
  assert.ok(html.includes('data-act="binding-list"'), '应显示凭据入口');
  assert.ok(html.includes('查看凭据（1）'));
  assert.ok(html.includes('已装订 52 页 · 下一张在 100 页'));
});

test('统计页：有抽测但未达 50 词 → 显示记录入口但不生成凭据', () => {
  const { html } = renderAtFull('#/stats', seed(12, true, 0));
  assert.ok(html.includes('data-act="history-list"'));
  assert.equal(html.includes('data-act="binding-list"'), false);
});

test('交互：点「抽测记录」→ 弹窗列出记录行，无评分措辞', () => {
  const { q } = renderAtFull('#/stats', seed(52, true, 0));
  assert.equal(q('[data-act="history-list"]').trigger('click'), true);
  const modal = q('#modalRoot').innerHTML;
  assert.ok(modal.includes('抽测记录'));
  assert.ok(modal.includes('抽看 10 页，7 页仍是已掌握，3 页待重读'));
  assert.equal(modal.includes('正确率'), false);
  assert.equal(modal.includes('得分'), false);
});

test('交互：点「查看凭据」→ 弹窗含第 1 张与本机删除按钮', () => {
  const { q } = renderAtFull('#/stats', seed(52, true, 0));
  assert.equal(q('[data-act="binding-list"]').trigger('click'), true);
  const modal = q('#modalRoot').innerHTML;
  assert.ok(modal.includes('第 1 张'));
  assert.ok(modal.includes('从本机删除'));
  assert.ok(modal.includes('已装订 52 页'));
  assert.equal(modal.includes('分享'), false);
});

test('交互：点「星标精读」→ 复用既有 scope=star&mode=type 路由', () => {
  const { q, location } = renderAtFull('#/stats', seed(12, false, 3));
  assert.ok(q('[data-act="star-review"]'));
  assert.equal(q('[data-act="star-review"]').trigger('click'), true);
  assert.equal(location.hash, '#/study?scope=star&mode=type');
});

test('首页：第二批区块不应出现在首页，既有首页内容未破坏', () => {
  const { html } = renderAtFull('#/learn');
  assert.ok(html.includes('今日计划'));
  assert.ok(html.includes('data-act="start-today"'));
  assert.equal(html.includes('装订记录'), false);
  assert.equal(html.includes('星标精读'), false);
});
