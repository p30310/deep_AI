/* ============================================================
 * N4/N2 视图接线独立 ui 冒烟（#006 / T03+T04）
 * 运行：node --test tests/ui.test.n4n2.mjs
 * 模式：照搬 ui.test.v3.mjs 的最小 DOM stub + node:vm，
 *       在 Node 中真实执行 phrases.js / core.js / app.js，
 *       不依赖浏览器或 jsdom。所有断言只针对本次新增的
 *       DOM / 文案，绝不改动任何既有测试文件。
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

/* ---------- ① 副标题派生：设置页含「10 / 20 / 30 分钟」 ---------- */
test('设置页：副标题由 SETTINGS.dailyMinutesSubtitle() 派生，含「10 / 20 / 30 分钟」', () => {
  const seed = makeSeed((db, Core) => {
    // 任意合法档位均可，副标题来自 DAILY_MINUTE_OPTIONS 集合
    db.settings.dailyMinutes = 20;
  });
  const html = renderAt('#/mine', seed);
  assert.ok(html.includes('10 / 20 / 30 分钟'), '设置页副标题应派生自档位集合，出现「10 / 20 / 30 分钟」');
  // 同时验证档位按钮仍存在（同源消费常量）
  assert.ok(html.includes('data-min="10"') && html.includes('data-min="30"'), '档位按钮应仍引用 DAILY_MINUTE_OPTIONS');
});

/* ---------- ② app.js:265 仍为 planCardDailyFresh 两参调用（与 qa 脚本口径一致） ---------- */
test('app.js: planCardDailyFresh 仍为两参调用（D-034 红线，零改动）', () => {
  const appSrc = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
  assert.ok(/Core\.planCardDailyFresh\(db\.plan, freshLimitA\)/.test(appSrc), 'app.js 应保持 Core.planCardDailyFresh(db.plan, freshLimitA) 两参调用');
  // 不应出现三参调用形态
  assert.equal(/Core\.planCardDailyFresh\(db\.plan, freshLimitA,/.test(appSrc), false, '不得改为三参调用');
});

/* ---------- ③ 删除旧 autoRebalance 开关后，设置页不再含该开关 DOM ---------- */
test('设置页：旧 autoRebalance 开关 UI 已删除（D-011 红线路径）', () => {
  const seed = makeSeed();
  const html = renderAt('#/mine', seed);
  assert.equal(html.includes('setAutoReb'), false, '设置页不应再出现 id=setAutoReb 开关');
  assert.equal(html.includes('每周自动再平衡'), false, '设置页不应再出现 autoRebalance 文案');
});

/* ---------- ④ N2 阶梯切换渲染出 LADDER 键文案之一 ---------- */
test('设置页：N2 默写阶梯渲染出 LADDER 键文案（如「默写阶梯」/「自动」/「手动」）', () => {
  const seed = makeSeed();
  const html = renderAt('#/mine', seed);
  assert.ok(html.includes('默写阶梯'), '应设置页含 LADDER.section 文案');
  assert.ok(html.includes('自动') && html.includes('手动'), '应设置页含 LADDER.auto / LADDER.manual 文案');
  // 默认 mode=auto 时展示自动描述
  assert.ok(html.includes('复习时按记忆等级自动升级题型'), '默认 auto 应展示 LADDER.autoDesc');
  // 切换控件写入 db.ladder.mode（不新建存储）：仅校验 id 存在
  assert.ok(html.includes('id="setLadder"'), '应设置页含阶梯切换控件 id=setLadder');
});

/* ---------- ⑤ 完成率 null 时，14 天图渲染中性态（不显示数字 / 不显示 0% / 不报 NaN） ---------- */
test('统计页：空打开日（dailyCompletionRate=null）渲染中性态 .empty-day，无 NaN / 不误判为 0%', () => {
  const seed = makeSeed((db, Core) => {
    // 注入一个落在最近 14 天窗口内的「空打开日」：total=0 且无 planTarget → dailyCompletionRate 返回 null
    const d = new Date();
    d.setDate(d.getDate() - 3);
    const key = Core.dayKey(d.getTime());
    db.days[key] = { total: 0 }; // 无 planTarget
  });
  const html = renderAt('#/stats', seed);
  assert.ok(html.includes('empty-day'), '空打开日应渲染中性态 .empty-day，不画 0% 柱');
  // 定位该中性态块，校验其自身不含完成率数字 / 完成率柱（区别于被误判为 0% 的 bar-col）
  const block = html.match(/<div class="empty-day">[\s\S]*?<\/div>/);
  assert.ok(block, '应存在 .empty-day 中性态块');
  assert.equal(/bar-num/.test(block[0]), false, '中性态块不应含完成率数字 bar-num');
  assert.equal(/bar comp/.test(block[0]), false, '中性态块不应含完成率柱 bar comp');
  // 全局不得出现 NaN
  assert.equal(html.includes('NaN'), false, '完成率为 null 时不得出现 NaN');
});

/* ---------- ⑥（附加）首页计划卡仍同源渲染，未受改动破坏 ---------- */
test('首页：计划卡仍正常渲染（回归保护）', () => {
  const seed = makeSeed((db, Core) => {
    db.onboarding.completed = true;
    db.plan = { derivedAt: Date.now(), dailyFresh: 12, dailyReview: 8, daysLeft: 30, totalWords: 3000, mastered: 500, estMinutes: 18 };
  });
  const html = renderAt('#/learn', seed);
  assert.ok(html.includes('今日计划'), '首页应含「今日计划」');
  assert.ok(html.includes('计划卡') || html.includes('plan-card'), '首页应含计划卡区块');
});
