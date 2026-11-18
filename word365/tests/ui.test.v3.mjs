/* ============================================================
 * v3.0 增量视图冒烟：用最小 DOM stub 在 Node 中真实执行 app.js
 * 运行：node --test tests/ui.test.v3.mjs
 * 目的：证明新增视图函数被实际调用、统计页能渲染新区块、
 *       且既有首页/统计页内容未被破坏（不依赖浏览器或 jsdom）。
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
/** 触发最后注册的同类型监听（对应最近一次渲染后的绑定）。 */
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

/** 用 core.js 的 API 构造一份种子库（mutator 可继续加工）。 */
function makeSeed(mutator) {
  const sb = bareContext();
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/core.js'), 'utf8'), sb);
  const db = sb.Core.defaultDB();
  if (mutator) { mutator(db, sb.Core); }
  return db;
}

/** 在给定 hash 下完整加载前端脚本，返回渲染结果与选择器（可触发交互）。 */
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
    sb.localStorage = {
      getItem: () => JSON.stringify(seedDB),
      setItem: () => {}
    };
  }
  SCRIPTS.forEach((f) => {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sb, { filename: f });
  });
  return { html: q('#view').innerHTML, q: q };
}

function renderAt(hash, seedDB) { return renderAtFull(hash, seedDB).html; }

test('统计页：新增「学习节律」与「已掌握词抽测」区块被真实渲染', () => {
  const html = renderAt('#/stats');
  // 既有统计页内容完整保留（回归保护）
  assert.ok(html.includes('学习统计'));
  assert.ok(html.includes('26 周热力图'));
  assert.ok(html.includes('最近 14 天'));
  assert.ok(html.includes('近 14 天有效完成率'));
  assert.ok(html.includes('连续天数'));
  // 新增区块
  assert.ok(html.includes('近 28 天学习节律'), '缺少节律摘要区块');
  assert.ok(html.includes('有效学习日'));
  assert.ok(html.includes('空打开日'));
  assert.ok(html.includes('已掌握词抽测'), '缺少抽测区块');
});

test('统计页：池不足时显示门槛文案，不出现抽测/待重读按钮', () => {
  const html = renderAt('#/stats');
  assert.ok(html.includes('已掌握词满 10 个后可抽测'));
  assert.equal(html.includes('data-act="exam-start"'), false);
  assert.equal(html.includes('data-act="exam-pending"'), false);
});

test('统计页：有 12 个已掌握词时渲染「开始抽测」入口', () => {
  const seed = makeSeed((db, Core) => {
    for (let i = 0; i < 12; i++) {
      const w = 'word' + String(i).padStart(2, '0');
      const r = Core.newRecord(w, 'cet4');
      r.reps = 6;
      r.lvl = 4;
      r.st = 'known';
      r.due = Date.now() + 30 * 86400000;
      db.words[Core.wordKey(w)] = r;
    }
  });
  const html = renderAt('#/stats', seed);
  assert.ok(html.includes('data-act="exam-start"'), '应出现抽测入口');
  assert.ok(html.includes('开始抽测'));
});

test('统计页：已有待重读记录时渲染「待重读」入口', () => {
  const seed = makeSeed((db, Core) => {
    const r = Core.newRecord('apple', 'cet4');
    r.reps = 6;
    r.lvl = 4;
    r.st = 'known';
    db.words[Core.wordKey('apple')] = r;
    db.exam.flags = [Core.wordKey('apple')];
    db.exam.lastAt = Date.now();
  });
  const html = renderAt('#/stats', seed);
  assert.ok(html.includes('data-act="exam-pending"'), '应出现待重读入口');
  assert.ok(html.includes('待重读（1）'));
});

test('首页：既有视图未被增量改动破坏', () => {
  const html = renderAt('#/learn');
  assert.ok(html.includes('今日计划'));
  assert.ok(html.includes('错词本'));
  assert.ok(html.includes('连续学习'));
  assert.ok(html.includes('data-act="start-today"'));
  assert.equal(html.includes('已掌握词抽测'), false, '新区块不应出现在首页');
});

/** 12 个已掌握词的种子库（抽测入口可用）。 */
function seedKnown12() {
  return makeSeed((db, Core) => {
    for (let i = 0; i < 12; i++) {
      const w = 'word' + String(i).padStart(2, '0');
      const r = Core.newRecord(w, 'cet4');
      r.reps = 6;
      r.lvl = 4;
      r.st = 'known';
      r.due = Date.now() + 30 * 86400000;
      db.words[Core.wordKey(w)] = r;
    }
  });
}

test('交互：点「开始抽测」→ 弹窗渲染第一题，不出现评分措辞', () => {
  const { q } = renderAtFull('#/stats', seedKnown12());
  assert.equal(q('[data-act="exam-start"]').trigger('click'), true, '入口应绑定点击处理');
  const modal = q('#modalRoot').innerHTML;
  assert.ok(modal.includes('写出这一页'));
  assert.ok(modal.includes('第 1 / 10 页'));
  assert.ok(modal.includes('先合上'));
  assert.ok(modal.includes('中途合上不会记入结果'));
  assert.equal(modal.includes('正确率'), false);
  assert.equal(modal.includes('得分'), false);
});

test('交互：逐题提交 10 次 → 结案弹窗只陈述页数，可去复习', () => {
  const { q } = renderAtFull('#/stats', seedKnown12());
  q('[data-act="exam-start"]').trigger('click');
  for (let i = 0; i < 10; i++) {
    q('#examAnswer').value = ''; // 全空 → 全部记未写对
    assert.equal(q('#examNext').trigger('click'), true, '第 ' + (i + 1) + ' 题应可提交');
  }
  const modal = q('#modalRoot').innerHTML;
  assert.ok(modal.includes('10 页已回到待重读'), '应显示结果');
  assert.ok(modal.includes('逐页看'));
  assert.ok(modal.includes('去复习'));
  assert.equal(modal.includes('正确率'), false);
  assert.equal(modal.includes('得分'), false);
});

test('交互：点「先合上」→ 弹窗关闭，不产生结果', () => {
  const { q } = renderAtFull('#/stats', seedKnown12());
  q('[data-act="exam-start"]').trigger('click');
  assert.ok(q('#modalRoot').innerHTML.includes('写出这一页'));
  assert.equal(q('#examQuit').trigger('click'), true);
  assert.equal(q('#modalRoot').innerHTML, '');
});

test('交互：点「待重读」→ 清单弹窗列词且提供复习入口', () => {
  const seed = makeSeed((db, Core) => {
    const r = Core.newRecord('apple', 'cet4');
    r.reps = 6;
    r.lvl = 4;
    r.st = 'known';
    db.words[Core.wordKey('apple')] = r;
    db.exam.flags = [Core.wordKey('apple')];
    db.exam.lastAt = Date.now();
  });
  const { q } = renderAtFull('#/stats', seed);
  assert.equal(q('[data-act="exam-pending"]').trigger('click'), true);
  const modal = q('#modalRoot').innerHTML;
  assert.ok(modal.includes('待重读的书页'));
  assert.ok(modal.includes('apple'));
  assert.ok(modal.includes('去复习'));
  assert.ok(modal.includes('标记已重读'));
});
