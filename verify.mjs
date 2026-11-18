#!/usr/bin/env node
/**
 * 一键验收（零依赖，Node 直接跑）
 *
 *   node verify.mjs
 *
 * 跑 4 条门禁并**校验期望值**——不是"跑完没报错就算过"，而是核对项数是否等于基线。
 * 基线：25 测试文件 / 304 项 0 失败 / 460 词 / qa 34/0（#028 后）。
 * 若基线因新卡变化，请同步改 EXPECT 里的数字（并在卡片里记录）。
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')));
const APP = path.join(ROOT, 'word365');

const EXPECT = {
  testFiles: 25,
  testItems: 304,   // 含 check-data / qa 各 1 项（#028 +6：mode-attribution）
  words: 460,
  qaPass: 34,
};

let failed = 0;
const line = (s) => process.stdout.write(s + '\n');
const ok = (s) => line(`  \x1b[32m✓\x1b[0m ${s}`);
const bad = (s) => { failed++; line(`  \x1b[31m✗ ${s}\x1b[0m`); };

function run(cmd, args, opts = {}) {
  try {
    return execFileSync(cmd, args, { cwd: APP, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts });
  } catch (e) {
    return (e.stdout || '') + (e.stderr || '');
  }
}

line('\n■ 1/4 语法检查');
for (const f of ['core.js', 'app.js', 'phrases.js', 'pet.js']) {
  const out = run(process.execPath, ['--check', path.join('js', f)]);
  if (out.trim() === '') ok(`${f} 语法通过`); else bad(`${f} 语法失败：${out.trim().split('\n')[0]}`);
}

line('\n■ 2/4 全量单测（期望 ' + EXPECT.testFiles + ' 文件 / ' + EXPECT.testItems + ' 项）');
const files = fs.readdirSync(path.join(APP, 'tests')).filter((n) => n.endsWith('.mjs'));
line(`  磁盘上 ${files.length} 个测试文件`);
if (files.length !== EXPECT.testFiles) bad(`测试文件数 ${files.length} ≠ 期望 ${EXPECT.testFiles}（新卡请更新 EXPECT）`);
else ok('文件数与基线一致');

const testOut = run(process.execPath, ['--test', ...files.map((n) => path.join('tests', n))], { maxBuffer: 32 * 1024 * 1024 });
const mTests = testOut.match(/^# tests (\d+)/m);
const mPass = testOut.match(/^# pass (\d+)/m);
const mFail = testOut.match(/^# fail (\d+)/m);
const items = mTests ? Number(mTests[1]) : -1;
const pass = mPass ? Number(mPass[1]) : -1;
const fail = mFail ? Number(mFail[1]) : -1;

if (items === EXPECT.testItems) ok(`项数 ${items} = 基线`);
else bad(`项数 ${items} ≠ 期望 ${EXPECT.testItems}（若刚加了测试，请更新 EXPECT 并在卡片记录）`);
if (fail === 0) ok(`失败 0（通过 ${pass}）`);
else {
  bad(`有 ${fail} 项失败`);
  const lines = testOut.split('\n').filter((l) => /^not ok /.test(l)).slice(0, 8);
  lines.forEach((l) => line('      ' + l.trim()));
}

line('\n■ 3/4 词书数据校验（期望 ' + EXPECT.words + ' 词）');
const dataOut = run(process.execPath, [path.join('tests', 'check-data.mjs')]);
const mWords = dataOut.match(/总词数\s*(\d+)\s*=\s*(\d+)/);
if (mWords && Number(mWords[1]) === EXPECT.words && mWords[1] === mWords[2]) ok(`词数 ${mWords[1]} 自洽且等于基线`);
else bad(`词数校验异常：${(mWords ? mWords[0] : dataOut.trim().split('\n')[0])}`);

line('\n■ 4/4 独立 QA（期望 ' + EXPECT.qaPass + ' / 0）');
const qaOut = run(process.execPath, [path.join('tests', 'qa_independent_verify.mjs')]);
const mQa = qaOut.match(/通过\s*(\d+)\s*\/\s*失败\s*(\d+)/);
if (mQa && Number(mQa[1]) === EXPECT.qaPass && Number(mQa[2]) === 0) ok(`QA ${mQa[1]}/${mQa[2]}`);
else bad(`QA 结果异常：${mQa ? mQa[0] : qaOut.trim().split('\n').slice(-1)[0]}`);

line('');
if (failed === 0) {
  line('\x1b[42m\x1b[30m PASS \x1b[0m 门禁全部达标：' + EXPECT.testFiles + ' 文件 / ' + EXPECT.testItems + ' 项 / 0 失败 · ' + EXPECT.words + ' 词 · QA ' + EXPECT.qaPass + '/0\n');
  process.exit(0);
} else {
  line(`\x1b[41m\x1b[37m FAIL \x1b[0m ${failed} 项不达标，见上方 ✗\n`);
  process.exit(1);
}
