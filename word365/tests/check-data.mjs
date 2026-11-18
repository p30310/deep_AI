/* 校验内置词书数据：总数 460、字段完整、音标非空、跨书零重复 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const globalWindow = globalThis;

const books = [
  require('../js/data/cet4.js'),
  require('../js/data/cet6.js'),
  require('../js/data/kaoyan.js'),
  require('../js/data/ielts.js'),
  require('../js/data/job.js')
];

let failed = false;
const fail = (msg) => { console.error('✗ ' + msg); failed = true; };
const ok = (msg) => console.log('✓ ' + msg);

// 1) 总数 460
const expected = { cet4: 100, cet6: 100, kaoyan: 100, ielts: 100, job: 60 };
let total = 0;
for (const b of books) {
  total += b.words.length;
  if (b.words.length !== expected[b.key]) {
    fail(`${b.name} 词数 ${b.words.length} ≠ 期望 ${expected[b.key]}`);
  }
}
if (total === 460) ok(`总词数 ${total} = 460`);
else fail(`总词数 ${total} ≠ 460`);

// 2) 每词条 5 字段完整 + 音标非空 + 单词合法
for (const b of books) {
  b.words.forEach((e, i) => {
    const id = `${b.key}[${i}]`;
    if (!e.w || typeof e.w !== 'string') fail(`${id} 缺 w`);
    if (!/^[a-z][a-z-]*$/.test(e.w)) fail(`${id} 单词非法: ${e.w}`);
    if (!e.p || !e.p.startsWith('/')) fail(`${id} 音标缺失或非法: ${e.w}`);
    if (!e.t || !e.t.trim()) fail(`${id} 释义缺失: ${e.w}`);
    if (!e.e || e.e.trim().split(/\s+/).length < 5) fail(`${id} 例句缺失或过短: ${e.w}`);
    if (!e.et || !e.et.trim()) fail(`${id} 例句翻译缺失: ${e.w}`);
  });
  // 3) 书内去重
  const set = new Set();
  for (const e of b.words) {
    if (set.has(e.w)) fail(`${b.key} 书内重复: ${e.w}`);
    set.add(e.w);
  }
}

// 4) 跨书零重复
const seen = new Map();
for (const b of books) {
  for (const e of b.words) {
    if (seen.has(e.w)) fail(`跨书重复: ${e.w}（${seen.get(e.w)} 与 ${b.key}）`);
    else seen.set(e.w, b.key);
  }
}
if (!failed) ok('跨书零重复通过');

// 5) 单元 range 覆盖全部词条
for (const b of books) {
  let covered = 0;
  for (const u of b.units) covered += u.range[1] - u.range[0] + 1;
  if (covered !== b.words.length) fail(`${b.key} 单元覆盖 ${covered} ≠ ${b.words.length}`);
  else ok(`${b.key} 单元 range 覆盖完整`);
}

console.log(failed ? '\n数据校验失败' : '\n数据校验全部通过');
process.exit(failed ? 1 : 0);
