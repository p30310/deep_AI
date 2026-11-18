/* 义项提示增强 · 独立核心测试（任务卡 #016 · G3 实现产物）
 * 独立于既有 7 文件（161 项）、core.test.strength.mjs（9 项），不修改任何既有断言。
 * 覆盖 SEN-AC01~08（每条至少 1 断言）+ 边界兜底 + 红线常量/导出面/G4 接线静态钩子。
 * 运行：node --test tests/senses.test.mjs
 */
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const Core = require('../js/core.js');
const PHRASES = require('../js/phrases.js');
const fs = require('node:fs');
const coreSrc = fs.readFileSync(new URL('../js/core.js', import.meta.url), 'utf8');
const appSrc = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');

/* ============ SEN-AC01 · 义项解析 ============ */
test('SEN-AC01 sensesOf：单义/全角分号/多词性/斜杠逐项符合契约用例表，且不改入参', () => {
  const cases = [
    [{ w: 'ability', t: 'n. 能力，才能' }, [{ text: '能力，才能', pos: 'n.' }]],
    [{ w: 'account', t: 'n. 账户；描述' }, [{ text: '账户', pos: 'n.' }, { text: '描述', pos: 'n.' }]],
    [{ w: 'act', t: 'v. 行动；表演 n. 行为' }, [{ text: '行动', pos: 'v.' }, { text: '表演', pos: 'v.' }, { text: '行为', pos: 'n.' }]],
    [{ w: 'admit', t: 'v. 承认；准许进入' }, [{ text: '承认', pos: 'v.' }, { text: '准许进入', pos: 'v.' }]],
    [{ w: 'advance', t: 'v./n. 前进，进步' }, [{ text: '前进，进步', pos: 'v./n.' }]]
  ];
  for (const [entry, expected] of cases) {
    const snap = JSON.stringify(entry);
    assert.deepEqual(Core.sensesOf(entry), expected, 't=' + entry.t);
    assert.equal(JSON.stringify(entry), snap, 'entry 未被修改');
  }
});

/* ============ SEN-AC02 · 卡片展示全部义项 ============ */
test('SEN-AC02 卡片展示：renderFlash 用 sensesOf 渲染全部义项，音标/例句/发音节点保留', () => {
  assert.ok(/sensesHtml\(e\)/.test(appSrc), 'def-line 由 sensesHtml(e) 承载义项列表');
  assert.ok(/def-line senses-list/.test(appSrc), 'def-line 保留并承载义项列表');
  assert.ok(/Core\.sensesOf\(e \|\| \{\}\)/.test(appSrc), 'sensesHtml 调 Core.sensesOf');
  assert.ok(/class="sense-text"/.test(appSrc), '逐义项 text 渲染节点存在');
  assert.ok(/class="phonetic"/.test(appSrc), '.phonetic 音标节点保留');
  assert.ok(/class="ex-line"/.test(appSrc), '.ex-line 例句/例句翻译节点保留');
  assert.ok(/class="speaker"/.test(appSrc), '.speaker 发音按钮保留');
  assert.ok(/P\.SENSES\.noMeaning/.test(appSrc), '兜底文案取自 P.SENSES');
  const senses = Core.sensesOf({ w: 'act', t: 'v. 行动；表演 n. 行为' });
  assert.equal(senses.length, 3);
  for (const s of senses) { assert.ok(s.text && s.text.length > 0, '每个义项 text 非空可读'); }
});

/* ============ SEN-AC03 · 抽义项可复现 ============ */
test('SEN-AC03 pickSense：同种子同索引、换种子可变、返回合法索引、无 Math.random 调用', () => {
  const senses = [{ text: 'a' }, { text: 'b' }, { text: 'c' }, { text: 'd' }];
  const snap = JSON.stringify(senses);
  const seedA = '2026-11-16w::account';
  const i1 = Core.pickSense(senses, seedA);
  const i2 = Core.pickSense(senses, seedA);
  assert.equal(i1, i2, '同 seedA 两次索引相同');
  assert.ok(Number.isInteger(i1) && i1 >= 0 && i1 < senses.length, '索引合法');
  let changed = false;
  for (let d = 1; d <= 60; d++) {
    const seedB = '2026-11-' + String(d).padStart(2, '0') + 'w::account';
    if (Core.pickSense(senses, seedB) !== i1) { changed = true; break; }
  }
  assert.ok(changed, '换种子可得到不同索引（存在性用例）');
  assert.equal(JSON.stringify(senses), snap, 'senses 未被修改');
  assert.ok(!/Math\.random\s*\(/.test(coreSrc), 'core.js 无 Math.random 调用');
});

/* ============ SEN-AC04 · 抽测按义项判定 ============ */
test('SEN-AC04 gradeSense：正确词绑定所选义项返回 ok，错误/空答 ok:false；gradeExam 仍按词', () => {
  const entry = { w: 'account', t: 'n. 账户；描述' };
  assert.deepEqual(
    Core.gradeSense(entry, 1, 'account'),
    { ok: true, senseIdx: 1, senseText: '描述', expected: 'account' }
  );
  assert.equal(Core.gradeSense(entry, 0, '  ACCOUNT ').ok, true, 'norm 忽略大小写与首尾空白');
  assert.equal(Core.gradeSense(entry, 0, 'wrong').ok, false, '错误词 ok:false');
  assert.equal(Core.gradeSense(entry, 0, '').ok, false, '空答 ok:false');
  const sess = { id: 'ex', keys: [Core.wordKey('account')], at: 1, size: 1 };
  const rec = Core.gradeExam({ words: {} }, sess, [{ key: Core.wordKey('account'), answer: 'account' }]);
  assert.equal(rec.items[0].ok, true, 'gradeExam 全词判定本体未变');
});

/* ============ SEN-AC05 · 默写按义项判定 ============ */
test('SEN-AC05 默写：题面取所选义项 text（非整串 t）、判定按义项、无义项级进度', () => {
  const entry = { w: 'act', t: 'v. 行动；表演 n. 行为' };
  const senses = Core.sensesOf(entry);
  const idx = Core.pickSense(senses, '2026-11-16w::act');
  const senseText = senses[idx].text;
  assert.ok(entry.t.indexOf(senseText) >= 0, '题面取自所选义项');
  assert.notEqual(senseText, entry.t, '多义词题面非整串 t');
  const g = Core.gradeSense(entry, idx, 'act');
  assert.equal(g.ok, true);
  assert.equal(g.senseIdx, idx);
  assert.ok(!('lvl' in g) && !('due' in g), '判定结果无义项级进度字段');
  assert.ok(/Core\.gradeSense\(e, t\.senseIdx, val\)/.test(appSrc), 'typeEnter 调 Core.gradeSense');
  assert.ok(/typeSensePrompt\(e, t\.senseIdx\)/.test(appSrc), '默写题面取所选义项提示');
  assert.ok(/Core\.pickSense\(senses, senseSeed\(e\)\)/.test(appSrc), '默写按日期+词种子抽义项');
});

/* ============ SEN-AC06 · SRS 不受影响 ============ */
test('SEN-AC06 抽义项考不改 SRS：六字段逐字段一致、C10 维持、无义项级 db 键', () => {
  const db = Core.defaultDB();
  const k = Core.wordKey('account');
  const r = Core.newRecord('account');
  Object.assign(r, { reps: 1, lvl: 2, st: 'learning', due: 123, wfix: 1, wrong: 1, star: true });
  db.words[k] = r;
  const snap = JSON.stringify(db);
  const entry = { w: 'account', t: 'n. 账户；描述' };
  const senses = Core.sensesOf(entry);
  Core.pickSense(senses, '2026-11-16w::account');
  Core.gradeSense(entry, 0, 'account');
  Core.gradeSense(entry, 0, 'wrong');
  assert.equal(JSON.stringify(db), snap, '三纯函数调用前后 db 逐字段一致（C10）');
  assert.deepEqual(
    { lvl: r.lvl, due: r.due, st: r.st, wfix: r.wfix, wrong: r.wrong, star: r.star },
    { lvl: 2, due: 123, st: 'learning', wfix: 1, wrong: 1, star: true }
  );
  assert.ok(!Object.keys(db).some(x => /sense/i.test(x)), 'db 无义项级顶层键');
  assert.ok(!Object.keys(r).some(x => /sense/i.test(x)), '词条记录无义项级字段');
});

/* ============ SEN-AC07 · 边界兜底 ============ */
test('SEN-AC07 边界兜底：空/异常 t、只有词性、越界 idx、空答、超长 t 均不抛错且返回兜底', () => {
  for (const bad of ['', '   ', null, undefined, 123, {}, []]) {
    const s = Core.sensesOf({ t: bad });
    assert.ok(Array.isArray(s) && s.length >= 1, '非空数组');
    assert.equal(typeof s[0].text, 'string', 'text 为字符串');
  }
  assert.deepEqual(Core.sensesOf({ t: '' }), [{ text: '' }]);
  assert.deepEqual(Core.sensesOf({ t: 'n.' }), [{ text: '' }], '只有词性标签无释义 → 兜底单元素');
  assert.equal(Core.pickSense([], 'x'), 0);
  assert.equal(Core.pickSense(null, 'x'), 0);
  assert.equal(Core.pickSense([{ text: 'a' }], NaN), 0, '非法种子兜底');
  const g = Core.gradeSense({ w: 'x', t: 'n. 甲' }, 999, '');
  assert.equal(g.ok, false);
  assert.equal(g.senseIdx, 0, '越界 idx 钳到 0');
  assert.ok(Number.isInteger(g.senseIdx), '无 NaN');
  const g2 = Core.gradeSense(null, 0, 'x');
  assert.equal(g2.ok, false);
  assert.equal(g2.expected, '');
  const longT = Array(300).fill('n. 义').join('；');
  const ls = Core.sensesOf({ t: longT });
  assert.ok(ls.length > 0 && ls.length <= 200, '超长 t 输出有限项');
  assert.equal(PHRASES.SENSES.noMeaning, '（暂无释义）', '卡片兜底文案存在');
});

/* ============ SEN-AC08 · 数据兼容 ============ */
test('SEN-AC08 数据兼容：460 词全量解析不抛错、旧备份导入 schema 恒 3 且无新字段', () => {
  const books = [
    require('../js/data/cet4.js'), require('../js/data/cet6.js'),
    require('../js/data/kaoyan.js'), require('../js/data/ielts.js'),
    require('../js/data/job.js')
  ];
  let total = 0;
  for (const b of books) {
    for (const e of b.words) {
      total++;
      const s = Core.sensesOf(e);
      assert.ok(Array.isArray(s) && s.length >= 1, e.w + ' 解析非空');
    }
  }
  assert.equal(total, 460, '全量 460 词');
  const backup = { schema: 3, settings: { freshLimit: 20 }, words: {}, days: {} };
  const res = Core.importJSON(JSON.stringify(backup));
  assert.equal(res.ok, true);
  assert.equal(res.db.schema, 3, 'schema 恒 3');
  assert.ok(!('senses' in res.db) && !('senseIdx' in res.db), '无义项级持久化字段（向前兼容）');
});

/* ============ 红线常量 / 导出面 / phrases 落键 ============ */
test('红线：LADDER_DAYS/SCHEMA/w:: 零改；Core 双暴露三函数；phrases.SENSES 落键；#015 强度语义未动', () => {
  assert.deepEqual(Core.LADDER_DAYS, [1, 2, 4, 7, 15, 30, 60]);
  assert.equal(Core.SCHEMA, 3);
  assert.equal(Core.wordKey('Hello'), 'w::hello');
  assert.equal(typeof Core.sensesOf, 'function');
  assert.equal(typeof Core.pickSense, 'function');
  assert.equal(typeof Core.gradeSense, 'function');
  assert.equal(typeof PHRASES.SENSES, 'object');
  assert.equal(PHRASES.SENSES.noMeaning, '（暂无释义）');
  assert.equal(PHRASES.SENSES.hintLabel, '本次义项：');
  assert.equal(Core.defaultSettings().strengthMode, 'off', '#015 strengthMode 缺省 OFF 未动');
  assert.deepEqual(Core.newRecord('x').evts, [], '#015 evts 默认 [] 未动');
});
