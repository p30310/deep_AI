/* ============================================================
 * #024 书封配色对比度（D-047）独立测试
 * 运行：node --test tests/ui.test.book-cover.mjs
 * 背景：`.book-cover` 的白字压在「按词书数据内联写入」的底色上（非令牌），
 *       实测 5 本内置书除蓝外全部低于 AA 4.5。本卡改为按底色自动选字色、
 *       必要时才压暗底色（最小改动）。
 * 验证方式：真实渲染 `#/books`，从 DOM 字符串里解析出每张书封的
 *       background / color 配对，再用 WCAG 公式复算——不复制被测逻辑。
 * ============================================================ */
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

function makeEl() {
  const el = {
    innerHTML: '', textContent: '', value: '', hidden: false, style: {}, dataset: {}, attrs: {}, listeners: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } }
  };
  el.addEventListener = () => {};
  el.setAttribute = () => {};
  el.getAttribute = () => null;
  el.removeAttribute = () => {};
  el.querySelector = () => makeEl();
  el.querySelectorAll = () => [];
  el.focus = () => {};
  el.closest = () => null;
  return el;
}

function lin(c) { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
function lum(hex) {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * lin(n >> 16 & 255) + 0.7152 * lin(n >> 8 & 255) + 0.0722 * lin(n & 255);
}
function ratio(a, b) {
  const x = lum(a), y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

const SCRIPTS = ['js/data/cet4.js', 'js/data/cet6.js', 'js/data/kaoyan.js', 'js/data/ielts.js', 'js/data/job.js',
  'js/phrases.js', 'js/core.js', 'js/app.js'];

/** 渲染 #/books，返回书封配对列表 [{ bg, ink, ratio }] 与页面 HTML。 */
function renderBooks(extraBooks) {
  const els = {};
  const q = (sel) => (els[sel] || (els[sel] = makeEl()));
  const sb = { console, setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {}, addEventListener: () => {} };
  sb.window = sb;
  vm.createContext(sb);
  sb.location = { hash: '#/books' };
  sb.document = { documentElement: makeEl(), querySelector: q, querySelectorAll: () => [], addEventListener: () => {} };
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/core.js'), 'utf8'), sb);
  const db = sb.Core.defaultDB();
  if (extraBooks) { db.customBooks = extraBooks; }
  sb.localStorage = { getItem: () => JSON.stringify(db), setItem: () => {} };
  SCRIPTS.forEach((f) => vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sb, { filename: f }));

  const html = q('#view').innerHTML;
  const covers = [...html.matchAll(/class="book-cover" style="background:(#[0-9a-fA-F]{6});color:(#[0-9a-fA-F]{6})/g)]
    .map((m) => ({ bg: m[1], ink: m[2], ratio: ratio(m[2], m[1]) }));
  return { html, covers };
}

/* ---------- ① 五本内置书：全部 ≥4.5 ---------- */
test('内置五本书封：文字/底色对比全部 ≥4.5:1（WCAG AA 正常文本）', () => {
  const { covers } = renderBooks();
  assert.ok(covers.length >= 5, '应渲染至少 5 张书封，实际 ' + covers.length);
  const bad = covers.filter((c) => c.ratio < 4.5)
    .map((c) => `${c.bg}/${c.ink}=${c.ratio.toFixed(2)}`);
  assert.equal(bad.length, 0, '存在不达标的书封：' + bad.join(', '));
});

/* ---------- ② 最小改动：品牌绿书封不改底色，只换深字 ---------- */
test('最小改动：绿色书封保持 #3cae7c 原色，仅把文字换成深墨（不改品牌色）', () => {
  const { covers } = renderBooks();
  const green = covers.find((c) => c.bg.toLowerCase() === '#3cae7c');
  assert.ok(green, '绿色书封应仍使用原底色 #3cae7c（不该为达标而改品牌色）');
  assert.equal(green.ink.toLowerCase(), '#0a1512', '绿色底上的文字应为深墨');
  assert.ok(green.ratio >= 4.5, '绿色书封对比应 ≥4.5，实际 ' + green.ratio.toFixed(2));
});

/* ---------- ③ 极端底色：白底/灰底/紫底都不能崩 ---------- */
test('任意底色兜底：白底、中灰、品牌紫自定义书封均渲染出 ≥4.5 的配对', () => {
  const customs = [
    { key: 'c_white', name: '白底测试', desc: 'c', color: '#ffffff', words: [{ w: 'test', t: '测试' }], units: null },
    { key: 'c_gray', name: '中灰测试', desc: 'c', color: '#888888', words: [{ w: 'test', t: '测试' }], units: null },
    { key: 'c_purple', name: '紫底测试', desc: 'c', color: '#8b5cf6', words: [{ w: 'test', t: '测试' }], units: null }
  ];
  const { covers, html } = renderBooks(customs);
  assert.ok(html.includes('白底测试'), '自定义书应渲染');
  const bad = covers.filter((c) => c.ratio < 4.5).map((c) => `${c.bg}/${c.ink}=${c.ratio.toFixed(2)}`);
  assert.equal(bad.length, 0, '存在不达标书封：' + bad.join(', '));
  // 中灰这类「两种字色都贴线」的底色，应被压暗后达标（底色发生变化）
  const gray = covers.find((c) => c.ratio >= 4.5 && c.bg !== '#888888' && c.bg !== '#3cae7c');
  assert.ok(gray, '中灰底应被压暗成更深色值后达标');
});

/* ---------- ④ 颜色合法性：不得输出非法色值（如 undefined/NaN） ---------- */
test('输出合法性：所有书封色值均为 6 位 hex，且页面无 NaN/undefined', () => {
  const { covers, html } = renderBooks();
  assert.ok(covers.length >= 5);
  covers.forEach((c) => {
    assert.match(c.bg, /^#[0-9a-f]{6}$/i, '底色非法：' + c.bg);
    assert.match(c.ink, /^#[0-9a-f]{6}$/i, '字色非法：' + c.ink);
  });
  assert.equal(html.includes('undefined'), false, '页面不得出现 undefined');
  assert.equal(html.includes('NaN'), false, '页面不得出现 NaN');
});
