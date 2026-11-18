/* ============================================================
 * #029 学习完成页 · 独立测试（D-061/D-062）
 * 运行：node --test tests/ui.test.finish.mjs
 * 契约：365-groups/G2-architecture/design-finish.md v1.1
 * 覆盖：输入白名单、DOM 四层、零 emoji/零评分、文案全落键、空态、零新路由。
 * ============================================================ */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const require_ = createRequire(import.meta.url);
const app = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
const phrases = require_(path.join(ROOT, 'js/phrases.js'));

/* ---- 从 app.js 抽出 renderFinish 在隔离上下文执行（不启动整个 app） ---- */
function extractRender() {
  const i = app.indexOf('  function renderFinish() {');
  assert.ok(i >= 0, 'app.js 必须有 renderFinish');
  const j = app.indexOf('\n  }', i) + 4;
  return app.slice(i, j);
}

const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u;
const BANNED = ['完美', '不错', '加油', '正确率', '达标', '评级', '得分', '🎉', '👍', '💪', '%'];

function renderWith(session) {
  const src = extractRender();
  const box = { innerHTML: '' };
  const ctx = {
    state: { session },
    window: { PHRASES: phrases },
    $: () => box,
    esc: (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  };
  vm.createContext(ctx);
  vm.runInContext(src + '\nthis.render = renderFinish;', ctx);
  ctx.render();
  return box.innerHTML;
}

/* ---------- ① 源码层：函数体零中文展示字面量、零 emoji ---------- */
test('FIN-AC：renderFinish 函数体剥离注释后零 CJK、零 emoji、零「正确率」', () => {
  const body = extractRender().replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.equal(/[\u4e00-\u9fff]/.test(body), false, '函数体不得有任何 CJK 字面量（文案全落 phrases.js）');
  assert.equal(EMOJI_RE.test(body), false, '函数体不得有 emoji');
  assert.equal(body.includes('correct'), false, '输入白名单不含 correct');
  assert.ok(body.includes('s.answered') && body.includes('s.words.length'), '仅读 answered 与 words.length');
});

/* ---------- ② 文案键全部落 phrases.js ---------- */
test('FIN-AC：FINISH 六键齐全且逐字符合 G1 PRD', () => {
  assert.deepEqual(Object.keys(phrases.FINISH).sort(),
    ['btnHome', 'btnStats', 'count', 'empty', 'summary', 'title']);
  assert.equal(phrases.FINISH.title, '这一组做完了');
  assert.equal(phrases.FINISH.summary(10, 7), '10 词，已作答 7 个。');
  assert.equal(phrases.FINISH.count, '作答已保存。');
  assert.equal(phrases.FINISH.btnHome, '回首页');
  assert.equal(phrases.FINISH.btnStats, '看统计');
  assert.equal(phrases.FINISH.empty, '这一组没有作答，也没有需要记下的内容。');
});

/* ---------- ③ 有样本态：DOM 四层、零评价、零比例 ---------- */
test('FIN-AC：有作答 → 主句逐字来自 FINISH、DOM 四层、无 emoji/评分/百分比', () => {
  const s = { words: Array(10).fill({}), answered: 7, correct: 7, fuzzy: 0, unknown: 0, idx: 10 };
  const h = renderWith(s);
  assert.ok(h.includes('<div class="finish-card card">'), '四层①');
  assert.ok(h.includes('<h2 class="fc-lead">这一组做完了 · 10 词，已作答 7 个。</h2>'), '四层②主句逐字');
  assert.ok(h.includes('<div class="fc-count">作答已保存。</div>'), '四层③辅助句');
  assert.ok(h.includes('<div class="fc-actions">'), '四层④按钮组');
  assert.equal(h.includes('fc-emoji'), false, '无 emoji 节点');
  assert.equal(h.includes('fc-rate'), false, '无正确率节点');
  for (const w of BANNED) { assert.equal(h.includes(w), false, `禁词「${w}」零命中`); }
  assert.equal(EMOJI_RE.test(h), false, '零 emoji 码点');
  // 两按钮 data-sact 逐字保留（零新路由）
  assert.ok(h.includes('data-sact="finish-home"') && h.includes('data-sact="finish-stats"'), '两按钮事件锚点不变');
  // 输入白名单：correct 取极端值不影响 DOM
  const s2 = { ...s, correct: 0 };
  assert.equal(renderWith(s2), h, 'correct 变化不改变 DOM（证明未读 correct）');
});

/* ---------- ④ 空态：只出一句 + 两按钮，不渲染 count ---------- */
test('FIN-AC：0 作答 → 只出 FINISH.empty + 两按钮；无 count、无 0%', () => {
  const s = { words: Array(5).fill({}), answered: 0, correct: 0 };
  const h = renderWith(s);
  assert.ok(h.includes(phrases.FINISH.empty), '空态句逐字');
  assert.ok(h.includes('data-sact="finish-home"') && h.includes('data-sact="finish-stats"'), '按钮仍在');
  assert.equal(h.includes('fc-count'), false, '空态不渲染辅助句');
  assert.equal(h.includes('0%'), false, '不报 0%');
  for (const w of BANNED) { assert.equal(h.includes(w), false, `空态禁词「${w}」零命中`); }
});

/* ---------- ⑤ 边界：异常会话不抛错、不出现 NaN/undefined ---------- */
test('FIN-AC：words 空数组 / answered 异常大 / 字段缺失均不抛错且不露 NaN-undefined', () => {
  const cases = [
    { words: [], answered: 0 },
    { words: Array(3).fill({}), answered: 99, correct: 200 },
    { words: null, answered: 3 },
    { answered: 1 }
  ];
  for (const s of cases) {
    const h = renderWith(s);
    assert.equal(h.includes('NaN'), false, '无 NaN');
    assert.equal(h.includes('undefined'), false, '无 undefined');
    assert.equal(EMOJI_RE.test(h), false, '无 emoji');
  }
});

/* ---------- ⑥ 确定性：同 s 两次 DOM 逐字节相等 ---------- */
test('FIN-AC：同一会话两次渲染 DOM 逐字节相等（纯呈现、零写状态）', () => {
  const s = { words: Array(8).fill({}), answered: 8, correct: 5, fuzzy: 1, unknown: 2 };
  const before = JSON.stringify(s);
  const a = renderWith(s), b = renderWith(s);
  assert.equal(a, b, '两次渲染相等');
  assert.equal(JSON.stringify(s), before, '不修改会话对象');
});
