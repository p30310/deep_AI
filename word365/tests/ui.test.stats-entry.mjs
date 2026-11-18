/* ============================================================
 * #018 统计页「记忆强度 · 遗忘曲线」入口卡独立 ui 冒烟
 * 运行：node --test tests/ui.test.stats-entry.mjs
 * 模式：照搬 ui.test.n4n2.mjs 的最小 DOM stub + node:vm，
 *       在 Node 中真实执行 phrases.js / core.js / app.js，
 *       不依赖浏览器或 jsdom。既有门禁文件逐字不动。
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

const DASHBOARD = '遗忘曲线仪表盘.html';

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

/** 读真实 phrases.js 的文案对象（单一真源，测试不复制文案）。 */
function realPhrases() {
  const sb = bareContext();
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/phrases.js'), 'utf8'), sb);
  return sb.PHRASES;
}

/** 用 core.js 的 API 构造一份种子库（mutator 可继续加工）。 */
function makeSeed(mutator) {
  const sb = bareContext();
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/core.js'), 'utf8'), sb);
  const db = sb.Core.defaultDB();
  if (mutator) { mutator(db, sb.Core); }
  return db;
}

/** 在给定 hash 下完整加载前端脚本，返回渲染结果与选择器。 */
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

/** 词条记录（与 core.js newRecord 同形的只读子集，测试自带不依赖内部函数）。 */
function rec(w, evts) {
  return {
    w: w, lvl: 2, st: 'review', due: 0, reps: 3, correct: 2, wrong: 1, wfix: 0,
    star: false, note: '', last: 0, first: 0, lastRating: 'good',
    srcBook: '', graduated: false, evts: evts
  };
}

/** 截出入口卡段落（标题 → 口径/空态文案之间），避免误取相邻区块数字。 */
function entryBlock(html, P) {
  const i = html.indexOf(P.STRENGTH_ENTRY.title);
  assert.ok(i >= 0, '统计页应含入口卡标题');
  const cands = [html.indexOf(P.STRENGTH_ENTRY.note, i), html.indexOf(P.STRENGTH_ENTRY.empty, i)]
    .filter((x) => x > i);
  const j = cands.length ? Math.min(...cands) : i + 1500;
  return html.slice(i, j);
}

function entryNums(block) {
  return [...block.matchAll(/class="sc-num">(\d+)</g)].map((m) => m[1]);
}

/* ---------- ① 统计页渲染出入口卡，文案全部取自 PHRASES.STRENGTH_ENTRY ---------- */
test('统计页：渲染「记忆强度 · 遗忘曲线」入口卡，标题/说明/按钮文案取自 phrases 单一真源', () => {
  const P = realPhrases();
  const html = renderAt('#/stats', makeSeed());
  assert.ok(html.includes(P.STRENGTH_ENTRY.title), '应含 STRENGTH_ENTRY.title');
  assert.ok(html.includes(P.STRENGTH_ENTRY.hint), '应含 STRENGTH_ENTRY.hint');
  assert.ok(html.includes(P.STRENGTH_ENTRY.open), '应含 STRENGTH_ENTRY.open（按钮文案）');
  assert.ok(html.includes(P.STRENGTH_ENTRY.metricWords), '应含 STRENGTH_ENTRY.metricWords');
  assert.ok(html.includes(P.STRENGTH_ENTRY.metricEvents), '应含 STRENGTH_ENTRY.metricEvents');
});

/* ---------- ② 纯锚点契约：href 指向磁盘真实文件 + 新窗口 + noopener ---------- */
test('入口卡：<a href> 指向磁盘存在的仪表盘文件，且 target=_blank / rel=noopener', () => {
  const html = renderAt('#/stats', makeSeed());
  const m = html.match(/<a class="btn[^"]*"[^>]*href="([^"]+)"[^>]*target="_blank" rel="noopener">/);
  assert.ok(m, '入口卡应输出带 target/rel 的纯锚点');
  // 实测白字 on --brand #3cae7c = 2.79:1（< AA 4.5），故本卡刻意不用 .btn-primary
  assert.equal(/btn-primary/.test(m[0]), false, '入口 CTA 不得使用对比度不达标的 .btn-primary');
  assert.equal(m[1], encodeURI(DASHBOARD), 'href 应为仪表盘文件名（encodeURI 形式）');
  assert.equal(decodeURI(m[1]), DASHBOARD);
  assert.equal(fs.existsSync(path.join(ROOT, DASHBOARD)), true, '被链接的仪表盘文件必须真实存在于磁盘');
});

/* ---------- ③ 零新增绑定：入口段无 data-act，且未引入 bindStrengthEntry ---------- */
test('入口卡：零新增交互绑定（无 data-act、无 bindStrengthEntry），不新增路由', () => {
  const P = realPhrases();
  const html = renderAt('#/stats', makeSeed());
  const block = entryBlock(html, P);
  assert.equal(/data-act=/.test(block), false, '入口卡应为纯锚点，不得新增 data-act 绑定');
  const appSrc = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
  assert.equal(appSrc.includes('bindStrengthEntry'), false, '不得新增 bindStrengthEntry 事件绑定函数');
  assert.equal(/#\/dashboard|#\/strength/.test(appSrc), false, '不得新增仪表盘路由');
});

/* ---------- ④ 空库空态：0 条记录 → 空态文案、数字 0、无 NaN ---------- */
test('入口卡：无作答记录时显示空态文案（不显示 0% 伪指标），数字为 0 且无 NaN', () => {
  const P = realPhrases();
  const html = renderAt('#/stats', makeSeed());
  const block = entryBlock(html, P);
  assert.ok(html.includes(P.STRENGTH_ENTRY.empty), '空库应显示 STRENGTH_ENTRY.empty');
  assert.equal(html.includes(P.STRENGTH_ENTRY.note), false, '空库不应显示「只读视图…」口径行');
  assert.deepEqual(entryNums(block), ['0', '0'], '空库两项计数均应为 0');
  assert.equal(html.includes('NaN'), false, '空库不得出现 NaN');
  // 注：href 的 encodeURI 形式本身含 %，故只校验「数字/标签」位置不出现百分比
  assert.equal(/sc-num">\d+%/.test(block), false, '入口卡数字位不得为百分比伪指标');
  assert.equal(/sc-label">[^<]*%/.test(block), false, '入口卡标签不得为百分比伪指标');
});

/* ---------- ⑤ 有事件库：数字 = 真实 evts 聚合，异常记录被跳过 ---------- */
test('入口卡：数字取自 db.words[*].evts 聚合（有记录 1 词 / 3 次），null 与缺失 evts 不计数不报错', () => {
  const P = realPhrases();
  const seed = makeSeed((db) => {
    db.words['w::alpha'] = rec('alpha', [
      { at: 1, rating: 'good' }, { at: 2, rating: 'good' }, { at: 3, rating: 'hard' }
    ]);
    db.words['w::beta'] = rec('beta', null);   // 异常：evts 非数组
    db.words['w::gamma'] = rec('gamma', []);   // 有词条但无事件
  });
  const html = renderAt('#/stats', seed);
  const block = entryBlock(html, P);
  assert.deepEqual(entryNums(block), ['1', '3'], '应为「1 词有记录 / 累计 3 次」');
  assert.ok(html.includes(P.STRENGTH_ENTRY.note), '有数据时应显示口径说明行');
  assert.equal(html.includes(P.STRENGTH_ENTRY.empty), false, '有数据时不应显示空态文案');
  assert.equal(html.includes('NaN'), false, '异常 evts 不得产生 NaN');
});

/* ---------- ⑥ 放置位置与既有区块回归：入口在节律/抽测之前，其余区块仍在 ---------- */
test('入口卡位置：位于统计页可视化区之后、节律摘要之前；既有区块零破坏', () => {
  const P = realPhrases();
  const html = renderAt('#/stats', makeSeed());
  const iEntry = html.indexOf(P.STRENGTH_ENTRY.title);
  const iRhythm = html.indexOf(P.RHYTHM.title);
  assert.ok(iEntry > html.indexOf('近 14 天有效完成率'), '入口卡应排在完成率图之后');
  assert.ok(iRhythm > iEntry, '入口卡应排在节律摘要之前');
  assert.ok(html.includes(P.EXAM.sectionTitle), '抽测区块仍应渲染');
  assert.ok(html.includes(P.BINDING.sectionTitle), '装订凭据区块仍应渲染');
  assert.ok(html.includes('26 周热力图'), '热力图仍应渲染');
});
