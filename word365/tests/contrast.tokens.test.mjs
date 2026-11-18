/* ============================================================
 * #021 设计令牌对比度守卫（D-044）
 * 运行：node --test tests/contrast.tokens.test.mjs
 * 目的：把「哪些前景/背景配对必须 ≥4.5:1」变成可执行断言，
 *       而不是靠肉眼或一次性脚本。解析真实 css/app.css 的变量值，
 *       不引入浏览器，也不复制颜色字面量。
 * ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CSS = fs.readFileSync(path.resolve(HERE, '..', 'css/app.css'), 'utf8');

/** 取某个选择器块内的 CSS 变量（极简解析，够用即可）。 */
function tokensOf(selector) {
  const i = CSS.indexOf(selector);
  assert.ok(i >= 0, '找不到选择器块：' + selector);
  const open = CSS.indexOf('{', i);
  const close = CSS.indexOf('}', open);
  const block = CSS.slice(open + 1, close);
  const out = {};
  for (const m of block.matchAll(/--([a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{6})/g)) {
    out[m[1]] = m[2].toLowerCase();
  }
  return out;
}

const LIGHT = tokensOf(':root {');
const DARK = tokensOf("html[data-theme='dark'] {");

function lin(c) { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
function lum(hex) {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * lin(n >> 16 & 255) + 0.7152 * lin(n >> 8 & 255) + 0.0722 * lin(n & 255);
}
function ratio(a, b) {
  const x = lum(a), y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/* ---------- ① 令牌齐全 ---------- */
test('设计令牌：亮/暗两套都定义了 brand-deep / brand-soft / ink / ink-soft / card / bg', () => {
  for (const [name, t] of [['light', LIGHT], ['dark', DARK]]) {
    ['brand-deep', 'brand-soft', 'ink', 'ink-soft', 'card', 'bg'].forEach((k) => {
      assert.ok(t[k], name + ' 主题缺少 --' + k);
    });
  }
});

/* ---------- ② 小字前景配对必须过 AA（D-044 的核心） ---------- */
test('对比度：--brand-deep 作为小字前景，在 4 种常见底色上均 ≥4.5:1（亮/暗）', () => {
  const pairs = [['card', '白卡'], ['bg', '页面底'], ['bg-soft', '浅灰块'], ['brand-soft', '品牌浅底']];
  for (const [surface, label] of pairs) {
    const l = ratio(LIGHT['brand-deep'], LIGHT[surface]);
    assert.ok(l >= 4.5, `亮色 --brand-deep on --${surface}（${label}）应 ≥4.5，实际 ${l.toFixed(2)}`);
    const d = ratio(DARK['brand-deep'], DARK[surface]);
    assert.ok(d >= 4.5, `暗色 --brand-deep on --${surface}（${label}）应 ≥4.5，实际 ${d.toFixed(2)}`);
  }
});

test('对比度：正文/次要文字（--ink / --ink-soft）在卡片与页面底上均 ≥4.5:1（亮/暗）', () => {
  for (const surface of ['card', 'bg']) {
    for (const fg of ['ink', 'ink-soft']) {
      assert.ok(ratio(LIGHT[fg], LIGHT[surface]) >= 4.5, `亮色 --${fg} on --${surface}`);
      assert.ok(ratio(DARK[fg], DARK[surface]) >= 4.5, `暗色 --${fg} on --${surface}`);
    }
  }
});

/* ---------- ③ 分段控件活动态确实吃这个令牌（防止样式回退） ---------- */
test('.seg button.active 使用 --brand-deep；.badge.st-known / .rate-btn.r-know 同源', () => {
  for (const sel of ['.seg button.active', '.badge.st-known', '.rate-btn.r-know']) {
    const i = CSS.indexOf(sel);
    assert.ok(i >= 0, '找不到规则：' + sel);
    const block = CSS.slice(i, CSS.indexOf('}', i));
    assert.ok(/color:\s*var\(--brand-deep\)/.test(block), sel + ' 应使用 var(--brand-deep) 作为前景色');
  }
});

/* ---------- ④ 填充主按钮：--cta-ink 必须对自己的底（默认/悬停）≥4.5:1 ---------- */
test('对比度：主按钮 --cta-ink on --cta-bg / --cta-bg-hover 均 ≥4.5:1（亮/暗两套）', () => {
  for (const [name, t] of [['light', LIGHT], ['dark', DARK]]) {
    for (const k of ['cta-bg', 'cta-bg-hover', 'cta-ink']) {
      assert.ok(t[k], name + ' 主题缺少 --' + k);
    }
    const base = ratio(t['cta-ink'], t['cta-bg']);
    assert.ok(base >= 4.5, `${name} --cta-ink on --cta-bg 应 ≥4.5，实际 ${base.toFixed(2)}`);
    const hover = ratio(t['cta-ink'], t['cta-bg-hover']);
    assert.ok(hover >= 4.5, `${name} --cta-ink on --cta-bg-hover 应 ≥4.5，实际 ${hover.toFixed(2)}`);
  }
});

/* ---------- ⑤ 主按钮必须吃令牌，不得回到「品牌色底 + 写死白字」 ---------- */
test('.btn-primary 使用 --cta-bg/--cta-ink，且全表已无「background: var(--brand) + color: #fff」组合', () => {
  const i = CSS.indexOf('.btn-primary {');
  assert.ok(i >= 0, '找不到 .btn-primary 规则');
  const block = CSS.slice(i, CSS.indexOf('}', i));
  assert.ok(block.includes('background: var(--cta-bg)'), '.btn-primary 底色应为 var(--cta-bg)');
  assert.ok(block.includes('color: var(--cta-ink)'), '.btn-primary 字色应为 var(--cta-ink)');
  assert.equal(/#fff/i.test(block), false, '.btn-primary 内不得再出现写死的 #fff');

  const hi = CSS.indexOf('.btn-primary:hover');
  assert.ok(hi >= 0, '找不到 .btn-primary:hover 规则');
  const hoverRule = CSS.slice(hi, CSS.indexOf('}', hi));
  assert.ok(hoverRule.includes('var(--cta-bg-hover)'), '悬停应使用 var(--cta-bg-hover)');

  // 全表守卫：不再存在「品牌色作底 + 白字」的规则（2.79:1 那类），按规则块切分逐块检查
  const badRules = CSS.split('}')
    .filter((chunk) => chunk.includes('background: var(--brand)') && chunk.toLowerCase().includes('color: #fff'));
  assert.equal(badRules.length, 0, '仍存在 background:var(--brand)+color:#fff 的规则：' + badRules.map((x) => x.trim().slice(0, 40)).join(' | '));
});

/* ---------- ⑥ 已知债登记（不设断言） ----------
 * `.book-cover` 的书封底色由 app.js 按词书调色板内联写入（非令牌），白字对比随配色而异，
 * 需按每本书的色值单独审计 → 登记为后续项，不在本文件设断言。
 */
