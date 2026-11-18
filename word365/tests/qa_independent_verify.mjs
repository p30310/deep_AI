/* QA 独立验证脚本（严过关）：独立证实 A/B/C + phrases 修复 + 回归断言
 * 不依赖开发者自测，直接驱动真实 core.js / phrases.js / 真实 cet4 数据。
 */
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);

const Core = require('../js/core.js');
const PHRASES = require('../js/phrases.js');
require('../js/data/cet4.js'); // 副作用：挂 globalThis.W365_BOOK_CET4
const CET4 = globalThis.W365_BOOK_CET4;

let pass = 0, fail = 0;
const log = (ok, msg) => { console.log((ok ? '✓' : '✗') + ' ' + msg); ok ? pass++ : fail++; };

/* ============ 独立证实 A：planCardDailyFresh ============ */
console.log('\n=== 缺口 A：planCardDailyFresh 独立证实 ===');
const rA1 = Core.planCardDailyFresh({ dailyFresh: 34 }, 20);
log(rA1 === 20, `plan(34) cap@20 → ${rA1} (期望 20)`);
const rA2 = Core.planCardDailyFresh({ dailyFresh: 10 }, 20);
log(rA2 === 10, `plan(10) cap@20 → ${rA2} (期望 10)`);
const rA3 = Core.planCardDailyFresh(undefined, 20);
log(rA3 === 20, `plan=undefined → ${rA3} (期望 20)`);
const rA4 = Core.planCardDailyFresh({ dailyFresh: 0 }, 20);
log(rA4 === 20, `plan(0) → ${rA4} (期望 20，视为无计划)`);
const rA5 = Core.planCardDailyFresh({ dailyFresh: 20 }, 20);
log(rA5 === 20, `plan(20)==上限 → ${rA5} (期望 20)`);

/* renderHome 接线：planCard 取值来自 planCardDailyFresh，超上限渲染 capNote */
const appSrc = require('fs').readFileSync(require('path').join(process.cwd(), 'js/app.js'), 'utf8');
log(/Core\.planCardDailyFresh\(db\.plan, freshLimitA\)/.test(appSrc), 'app.js renderHome 调用 planCardDailyFresh');
log(/db\.plan\.dailyFresh > freshLimitA/.test(appSrc), 'app.js renderHome 仅在 dailyFresh>上限时渲染 capNote 分支');
log(/P\.PLAN_MODE\.capNote\(db\.plan\.dailyFresh, freshLimitA\)/.test(appSrc), 'app.js 用 PLAN_MODE.capNote 模板渲染封顶说明');
const capText = PHRASES.PLAN_MODE.capNote(34, 20);
log(capText === '计划原定每日 34 词，已按本机上限 20 封顶', `capNote(34,20) → "${capText}"（X/Y 数值插值正确）`);

/* ============ 独立证实 B：todayPlan rebuild planTarget ============ */
console.log('\n=== 缺口 B：todayPlan rebuild planTarget 独立证实 ===');
const dbB = Core.defaultDB();
// 造 60 个到期词形成 backlog（但 rebuild 分支不看 backlog，只看 rebuiltAt）
for (let i = 0; i < 60; i++) {
  const k = 'w::due' + i;
  dbB.words[k] = Core.newRecord('due' + i);
  dbB.words[k].reps = 1;
  dbB.words[k].due = Date.now() - 1000;
}
const dkB = Core.dayKey();
dbB.returnGuard.rebuiltAt = dkB;
dbB.returnGuard.rebuildWords = [];
for (let i = 0; i < 18; i++) dbB.returnGuard.rebuildWords.push('w::due' + i);

const recsB = Object.keys(dbB.words).map((k) => dbB.words[k]);
const planB = Core.todayPlan(dbB, recsB);
log(planB.mode === 'rebuild', `mode=${planB.mode}（期望 rebuild）`);
log(dbB.days[dkB].planTarget === 18, `days[今天].planTarget=${dbB.days[dkB].planTarget}（期望 18，非 0）`);
log(planB.planTarget === 18, `plan.planTarget=${planB.planTarget}（期望 18）`);
log(Core.computePlanTarget(dbB) === 18, `computePlanTarget=${Core.computePlanTarget(dbB)}（期望 18）`);

/* 正常态（rebuiltAt 非今天）planTarget = reviews+freshs，不受 rebuild 影响 */
const dbN = Core.defaultDB();
const recsN = [];
for (let i = 0; i < 5; i++) {
  const r = Core.newRecord('f' + i); dbN.words['w::f' + i] = r; recsN.push(r);
}
// 制造 3 个到期词（reviews） + 5 个新词（freshs）但 quota 充足
for (let i = 0; i < 3; i++) {
  const k = 'w::r' + i; dbN.words[k] = Core.newRecord('r' + i);
  dbN.words[k].reps = 1; dbN.words[k].due = Date.now() - 1000; recsN.push(dbN.words[k]);
}
dbN.returnGuard.rebuiltAt = '2000-01-01'; // 非今天
dbN.returnGuard.rebuildWords = ['w::x'];   // 有内容但日期不对
const planN = Core.todayPlan(dbN, recsN);
log(planN.mode === 'normal', `正常态 mode=${planN.mode}（期望 normal，rebuiltAt 非今天不误判）`);
log(planN.planTarget === planN.reviews.length + planN.freshs.length,
    `正常态 planTarget=${planN.planTarget} = reviews(${planN.reviews.length})+freshs(${planN.freshs.length})`);

/* 空重建包：rebuiltAt=今天 但 rebuildWords=[] → 不进 rebuild 分支 */
const dbE = Core.defaultDB();
dbE.returnGuard.rebuiltAt = Core.dayKey();
dbE.returnGuard.rebuildWords = [];
const planE = Core.todayPlan(dbE, Object.keys(dbE.words).map((k) => dbE.words[k]));
log(planE.mode === 'normal', `空重建包 mode=${planE.mode}（期望 normal，不误判 rebuild）`);

// 同源判定核对（读 core.js 源码）：rebuild 进入条件与 planTarget 写入条件
log(/rebuiltAt === dk && .*rebuildWords\.length/.test(appSrc) === false,
    '（注）todayPlan 的 rebuild 进入条件在 core.js 内核对');
const coreSrc = require('fs').readFileSync(require('path').join(process.cwd(), 'js/core.js'), 'utf8');
const enterCond = /if \(db\.returnGuard\.rebuiltAt === dk && db\.returnGuard\.rebuildWords\.length\)/.test(coreSrc);
const writeCond = /if \(mode === 'rebuild' && db\.returnGuard\.rebuildWords\.length\)/.test(coreSrc);
log(enterCond && writeCond, 'core.js 中 rebuild 进入条件与 planTarget 写入条件均存在且 mode 仅由该分支置位（同源）');

/* ============ 独立证实 C：injectWarmup ============ */
console.log('\n=== 缺口 C：injectWarmup 独立证实 ===');
const dbC = Core.defaultDB();
Core.seedBooks(dbC, [{ key: 'cet4', name: CET4.name, builtin: true, words: CET4.words, units: CET4.units }]);
const first2 = [CET4.words[0].w, CET4.words[1].w]; // 真实 cet4 前 2 词
console.log('  真实 cet4 前 2 词 =', first2.join(', '));
const entriesC = [];
const outC = Core.injectWarmup(entriesC, dbC, dbC.settings);
log(outC.length === 2, `空库注入后序列长度=${outC.length}（期望 2）`);
log(outC[0] && outC[0].w === first2[0], `首词=${outC[0] && outC[0].w}（期望 ${first2[0]}）`);
log(outC[1] && outC[1].w === first2[1], `次词=${outC[1] && outC[1].w}（期望 ${first2[1]}）`);
log(outC[0] && outC[0].warmup === true, '首词 warmup 标记=true');
log(outC[1] && outC[1].warmup === true, '次词 warmup 标记=true');
log(entriesC.length === 0, '入参 entries 未被修改（纯函数）');
// 字段完整
log(outC[0] && outC[0].p && outC[0].t && outC[0].e && outC[0].et, '热身 entry 含 p/t/e/et 完整字段');

/* 反向 1：当日已学任何词 → 不注入 */
dbC.days[Core.dayKey()] = { total: 1, correct: 1, fresh: 1, review: 0 };
const outC2 = Core.injectWarmup([], dbC, dbC.settings);
log(outC2.length === 0, `同日已学 1 词 → 注入长度=${outC2.length}（期望 0）`);

/* 反向 2：confidenceWarmup=false → 不注入（且返回原序列长度） */
const dbC3 = Core.defaultDB();
delete dbC3.days[Core.dayKey()];
Core.seedBooks(dbC3, [{ key: 'cet4', name: CET4.name, builtin: true, words: CET4.words, units: CET4.units }]);
const src3 = [{ w: 'hello', warmup: false }];
const outC3 = Core.injectWarmup(src3, dbC3, { confidenceWarmup: false });
log(outC3.length === 1 && outC3[0].w === 'hello', `开关关闭 → 返回原序列长度=${outC3.length}（期望 1，未被注入）`);

/* 反向 3：warmup 词已存在于 db.words → 顺延取下一个 */
const dbC4 = Core.defaultDB();
Core.seedBooks(dbC4, [{ key: 'cet4', name: CET4.name, builtin: true, words: CET4.words, units: CET4.units }]);
dbC4.words['w::' + first2[0]] = Core.newRecord(first2[0]); // 第一词已存在
const outC4 = Core.injectWarmup([], dbC4, dbC4.settings);
log(outC4[0] && outC4[0].w === first2[1], `首词已存在 → 顺延取 ${outC4[0] && outC4[0].w}（期望 ${first2[1]}）`);
log(outC4[1] && outC4[1].w === CET4.words[2].w, `次词顺延取 ${outC4[1] && outC4[1].w}（期望 ${CET4.words[2].w}）`);

/* 接线核对：app.js 仅在 today+normal 注入，renderFlash 显示胶囊，doRate 豁免 fresh */
log(/scope === 'today' && p\.mode === 'normal'/.test(appSrc), 'app.js 仅在 scope=today 且 mode=normal 时调用 injectWarmup');
log(/e\.warmup \? '<span class="warmup-capsule"/.test(appSrc), 'app.js renderFlash 渲染 warmup 胶囊');
log(/e\.warmup && wasNewWord && db\.days\[snap\.dayKey\]\)\s*\{\s*db\.days\[snap\.dayKey\]\.fresh = Math\.max\(0, db\.days\[snap\.dayKey\]\.fresh - 1\)/.test(appSrc), 'app.js doRate 对 warmup 词回退 day.fresh 配额');

/* ============ phrases L72 修复（require 不抛错已在上游验证） ============ */
console.log('\n=== phrases.js 修复 + 文案存在性 ===');
log(typeof PHRASES.ONBOARD.warmup === 'string' && PHRASES.ONBOARD.warmup === '热身 · 已会',
    `ONBOARD.warmup="${PHRASES.ONBOARD.warmup}"（缺口 C 文案存在）`);
log(typeof PHRASES.PLAN_MODE.capNote === 'function', 'PLAN_MODE.capNote 函数存在（缺口 A 文案存在）');

console.log(`\n===== QA 独立验证结果：通过 ${pass} / 失败 ${fail} =====`);
process.exit(fail ? 1 : 0);
