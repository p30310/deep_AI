/* ============================================================
 * #028 练法归因 · 独立测试（D-057/D-058/D-059）
 * 运行：node --test tests/mode-attribution.test.mjs
 * 覆盖：三参零回归、四参六值、非法归一、ctx/listen 派生、undo 回滚、与 retentionStats 共存。
 * 不修改任何既有测试文件（D-059 的唯一例外已在 ui.test.ctx-mode.mjs 登记）。
 * ============================================================ */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const require_ = createRequire(import.meta.url);
const Core = require_(path.join(ROOT, 'js/core.js'));

const LEGAL = ['flash', 'type', 'choice', 'match', 'listen', 'ctx'];
const ev = () => Core.defaultDB();

/* ---------- ① 三参零回归：缺省 type===null，其余字段与旧行为一致 ---------- */
test('MODE-AC03/04：三参调用写 type:null，evts 恰 4 键，既有 ctx 断言前提保持', () => {
  const db = ev();
  Core.rateWord(db, 'w::absorb', 'know');
  const e = db.words['w::absorb'].evts[0];
  assert.equal(e.type, null, '三参 → null（缺省＝未采集）');
  assert.deepEqual(Object.keys(e).sort(), ['interval', 'rating', 't', 'type'], 'evts 元素恰 4 键');
  assert.equal(db.schema, 3, 'SCHEMA 恒 3');
});

/* ---------- ② 四参六值精确落盘 ---------- */
test('MODE-AC05/06：第四参依次取六种合法值 → evts.type 精确相等，除 type 外与三参同构', () => {
  for (const m of LEGAL) {
    const db = ev();
    Core.rateWord(db, 'w::absorb', 'know', m);
    assert.equal(db.words['w::absorb'].evts[0].type, m, `mode=${m} 应精确落值`);
  }
  // 除 type 外逐字段等价：同一时刻的两次调用（伪造相同 now 不可能，故只比键集与非时间字段）
  const a = ev(), b = ev();
  Core.rateWord(a, 'w::absorb', 'know');
  Core.rateWord(b, 'w::absorb', 'know', 'listen');
  const ea = a.words['w::absorb'].evts[0], eb = b.words['w::absorb'].evts[0];
  assert.equal(ea.rating, eb.rating, 'rating 一致');
  assert.equal(ea.interval, eb.interval, 'interval 一致（同一阶梯）');
  assert.notEqual(ea.type, eb.type, '只有 type 不同');
});

/* ---------- ③ 非法归一：一律写 null，不抛错、不跳过事件 ---------- */
test('MODE-AC06：非法/undefined/数字/对象/数组/未知串 → type:null 且事件仍写入', () => {
  const bad = [undefined, null, '', 0, 1, {}, [], 'unknown', 'Flash', 'TYPE', ' flash', 'flash '];
  for (const m of bad) {
    const db = ev();
    assert.doesNotThrow(() => Core.rateWord(db, 'w::absorb', 'know', m));
    const rec = db.words['w::absorb'];
    assert.equal(rec.evts.length, 1, '事件必须写入（不得因脏 mode 跳过）');
    assert.equal(rec.evts[0].type, null, `脏值 ${String(m)} 应归一为 null`);
  }
});

/* ---------- ④ 派生表达式：listen 优先 → ctx → mode（UI 层函数实测） ---------- */
test('MODE-AC07/08：attributionMode 派生——listen→listen、ctx→ctx、其余原值；listen 优先', () => {
  // 从 app.js 抽出函数体在隔离上下文执行（不启动整个 app）
  const src = require_('node:fs').readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
  const m = src.match(/function attributionMode\(s\) \{[\s\S]*?\n  \}/);
  assert.ok(m, 'app.js 必须存在 attributionMode 纯函数');
  const sb = {};
  vm.createContext(sb);
  vm.runInContext(m[0] + '\nthis.f = attributionMode;', sb);
  const f = sb.f;
  assert.equal(f({ mode: 'type', listen: 1, ctx: 0 }), 'listen', '听写子模式 → listen');
  assert.equal(f({ mode: 'type', listen: 0, ctx: 1 }), 'ctx', '语境子模式 → ctx');
  assert.equal(f({ mode: 'flash', listen: 0, ctx: 0 }), 'flash', '基础模式原值');
  assert.equal(f({ mode: 'type', listen: 0, ctx: 0 }), 'type', '普通写出 → type');
  assert.equal(f({ mode: 'type', listen: 1, ctx: 1 }), 'listen', 'listen 优先（互斥被破时的确定性）');
  assert.equal(f(null), null, '空会话 → null');
});

/* ---------- ⑤ undo 链：四参与三参回滚逐字节相同 ---------- */
test('MODE-AC10：四参写入后 undoRate 仍整体回滚（含 type 字段），与三参逐字节相同', () => {
  const undo = (mode) => {
    const db = ev();
    const snap = (mode === undefined)
      ? Core.rateWord(db, 'w::absorb', 'know')
      : Core.rateWord(db, 'w::absorb', 'know', mode);
    assert.equal(db.words['w::absorb'].evts.length, 1);
    Core.undoRate(db, snap);
    return JSON.stringify(db);
  };
  assert.equal(undo('ctx'), undo(undefined), '四参回滚后 db 与三参回滚逐字节相同');
  assert.equal(undo('listen'), undo(undefined), 'listen 亦同');
});

/* ---------- ⑥ 与 #027 共存 + 零写库 + 调用点数量 ---------- */
test('MODE-AC11/02：type 有值不影响 retentionStats；调用点恰 2 处；度量子模块仍零写入', () => {
  const db = ev();
  const t0 = Date.now() - 40 * 86400000;
  Core.rateWord(db, 'w::a', 'know', 'ctx');
  db.words['w::a'].evts[0].t = t0;
  Core.rateWord(db, 'w::a', 'know', 'listen');
  const before = JSON.stringify(db);
  const r = Core.retentionStats(db);
  assert.equal(JSON.stringify(db), before, 'retentionStats 仍零写库');
  assert.equal(r.samples, 1, '归因字段不影响可判定词数');
  assert.equal(r.retained, 1, '归因字段不影响保留判定');
  const app = require_('node:fs').readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
  const hits = app.match(/Core\.rateWord\(db,/g) || [];
  assert.equal(hits.length, 2, '生产代码 rateWord 调用恰 2 处');
  assert.ok(app.includes('attributionMode(s)'), '两处均传派生值');
});
