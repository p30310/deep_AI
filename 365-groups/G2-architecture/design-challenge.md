# 今日挑战 · 5 词冲刺 — 数据与函数契约（v1.2）

> 2026-11-17 · G2 · 依据 `G1-product/prd-challenge.md` v1.4（CH-AC01~18）+ `DECISIONS.md` D-048/D-049
> v1.0 的 `byDay/keys/pendingKeys` 已按 CH-AC04 白名单**全部撤销**；只存三项事实，不存词 key、不存对错明细。v1.2 为措辞勘误（§2.1 `doneAt`、§2.2 选题、§2.4 空义项），逐条对齐已裁决实现，判定不变。
## 1. 数据契约

**落点 `db.challenge`（顶层单对象，不进 `db.days[dk]`）。** `days[dk]` 是学习量容器：`stats`(core.js:644) 用它算 streak、`renderStats`(app.js:2097) 画热力图、`dailyCompletionRate`(core.js:1163) 用 `.total/.planTarget` 算北极星；挑战落进去会把"只玩挑战的一天"从 `0` 变 `null`。顶层键与 `db.exam`(core.js:118) 同构，属旁路事实，不参与 SRS 与统计；单对象（非数组）天然满足 CH-AC13「只保留单条」。

```js
challenge: { dateKey: '2026-11-17', size: 5, doneAt: 1763380800000 }
// dateKey：Core.dayKey(at) 本地自然日；size：本次实际题数 N（1..5）；
// doneAt：完成时刻(ms)。键集必须恰为这三项——多一个字段 CH-AC04 白名单即失败。
// 不存 keys/对错明细：CH-AC03 的确定性由 seed 保证，不靠落盘回放。
```

**`ensureSchema`(core.js:473) 追加（幂等；SCHEMA 不赋值、仍为 3）：**

```js
if (!db.challenge || typeof db.challenge !== 'object' || Array.isArray(db.challenge)) {
  db.challenge = { dateKey: '', size: 0, doneAt: 0 };
}
if (typeof db.challenge.dateKey !== 'string') { db.challenge.dateKey = ''; }
db.challenge.size = safeNonNeg(db.challenge.size);                                  // 复用 core.js:1281
if (typeof db.challenge.doneAt !== 'number' || !isFinite(db.challenge.doneAt)) { db.challenge.doneAt = 0; }
// 严禁在此追加 byDay/keys/pendingKeys/lastAt 等第四字段
```

旧备份经 `importJSON`→`ensureSchema`(core.js:445) 自动补齐；旧客户端读新备份时该键作为未知键原样保留。
**「今天已玩过」= `db.challenge.dateKey === Core.dayKey(at) && db.challenge.size >= 1`**（`at` 缺省 `now()`）。本地自然日，无 4am 偏移、不用 UTC；跨天自动回到可开始态（CH-AC13），昨日记录被覆盖、不留第二份。

## 2. 函数契约

常量 `CHALLENGE_DEFAULTS = { size: 5, optionCount: 4, optionMin: 2 }`（新增导出）。

**2.1 门面** `challengeState(db, at) -> {dateKey, played, size, doneAt, mode, poolSize, optionCapacity}`
- 纯读，首页卡只调这一个，避免 UI 自行拼 if 导致 CH-AC11/CH-AC15 互斥失败。`size` 是**实际题数 N**（已玩取 `record.size`，未玩取 `min(5, poolSize)`）；`subShort(n)/done(n)/resultPart(n,k)` 的 `n` 一律用它，`optionCapacity` 只用于选项数量上限与 E2 的 `<2`，**不得进入任何文案**。
- `mode` 优先级唯一：`played → 'done'`（CH-AC11）；`poolSize === 0 → 'empty'`（CH-AC15）；`optionCapacity < 2 → 'not-enough'`（E2）；否则 `'ready'`（`size<5` 时 UI 用 `subShort(size)`，CH-AC14）。
- 边界（脏数据）：`db.challenge` 缺失/脏值 → 按从未玩处理，不抛错。**`dateKey === 今日` 但 `size < 1` 一律不进 `done`，按 `ready` 处理**（旧备份导入、手改字段、`safeNonNeg` 归零都会命中；否则会渲染「今天已完成 · 0 个词」）；`dateKey` 为未来日期或非 `YYYY-MM-DD` 时比较自然失败，同样不判已完成。`doneAt` 在未玩（`played === false`）时恒为 `0`，不得回放上次完成时间。

**2.2 池** `challengePool(db, at) -> {ok, keys, size, reason}`
- 候选 = 到期 ∪ 错词，按 `wordKey` 去重；再以 `dayKey(at)` 为种子洗牌取前 `size` 个（G0 裁决：同日稳定、跨日换批，避免每天固定考同一批），最后按 key 升序返回（排序仅用于稳定出题顺序）：
  - 到期：`reps>0 && dueOfWord(db, rec) > 0 && dueOfWord(db, rec) <= endOfDay(at) && !graduated`（**闭区间**：`due === at`、`due === endOfDay(at)` 都算到期）；
  - 错词：`wrong>0 && !graduated`（`wrongRecords` core.js:339 的语义）。
- `endOfDay(at)` = 本地 `new Date(at)` 置 `23:59:59.999`，用 `getTime()` 出毫秒；**不是 `now()`**（PRD §6：上午/下午打开池一致，且中途重开不换题）。与 `todayPlan.reviews` 的关系（CH-AC02 新判据）：同一库同一时刻，`due <= now` 的词「在/不在池」必须与该函数判定一致；`due ∈ (now, 日终]` 是允许的增量，不算矛盾。
- 三重排除：`reps===0`（未学，不补新词）、`graduated`、释义为空（`sensesOf(entry)[0].text === ''` 或 `entry` 在 `db.books ∪ db.customBooks` 中不存在）。
- `size = Math.min(CHALLENGE_DEFAULTS.size, keys.length)`，`keys` 只保留前 `size` 个；`size===0` → `{ok:false, reason:'empty'}`。
- 不变量：`keys` 两两不同；`keys.length === size`；纯读不改 `db`。

**2.3 开局** `challengeStart(db, at) -> {ok, dateKey, size, keys, replayed, record, reason}`
- 先查 §1.4：已玩 → `{ok:true, replayed:true, size:record.size, keys:[], record}`（卡片完成态，UI 不展开，CH-AC11）。`keys` 不落盘故无法回放题面——PRD 也不需要回放。
- `mode==='empty'` → `{ok:false, reason:'empty'}`；`'not-enough'` → `{ok:false, reason:'not-enough'}`。
- 否则 `dateKey = dayKey(at)` 固化进返回值；`keys = challengePool(db, at).keys`。
- **I3：`dateKey` 只在此处算一次并随会话传递；造题 seed 与 `commitChallenge` 落库键一律用它，后续任何函数不得重算 `dayKey()`。**

**2.4 造题** `challengeQuestion(db, key, dateKey) -> Question | null`

```js
{ key:'w::ability', w:'ability', prompt:'能力，才能',        // sensesOf + pickSense(dateKey+key)
  options:[{i:0,w:'ability'},{i:1,w:'absorb'},{i:2,w:'accent'},{i:3,w:'access'}],
  answerIdx:0, senseIdx:0 }                                   // options 长度 2..4（CH-AC06）
```

- 题面：`sensesOf(entry)`(core.js:1670) + `senseIdx = pickSense(senses, dateKey + key)`(core.js:1716)（同 `senseSeed` 思路，app.js:1058）；`prompt = senses[senseIdx].text`。**空串不可达**——由池的准入条件保证（入池已排除首义项为空 / `entry` 缺失的词）；返回 `null` 仅作兜底，UI 遇 `null` 顺延补位。
- `entry` 由 `db.books ∪ db.customBooks` 的 `words[]` 按 `norm(w)` 反查；**不得调 `ensureRecord`/`newRecord` 取 w**（会凭空建档）。
- 干扰项来源 = 全库英文词（`optionCapacity` = 其中「`w` 非空且 `t` 非空」按 `norm(w)` 去重后的条数），逐个排除：`norm(x.w)===norm(w)`（含跨书同词）、`sensesOf(x)[0].text === prompt`（同义歧义）、与本轮已选干扰项重复。
- 选择：`hash(dateKey + key + 'd')` 播种的 xorshift32 洗牌（同 `startExam` core.js:1348），取前 3；**禁 `Math.random`**，同 seed 同输出（CH-AC03/CH-AC12 的重开一致性靠它）。
- 边界：**排除同义干扰项后可用词 ≥3 → 恒 4 项**（CH-AC06 / G1 v1.5：同义排除优先于凑满 4 项）；=3 → 3 项；=2 → 2 项；<2 → `null`（E2 已在 `challengeState` 拦掉，不进入逐题）。
- 不变量：`options` 去重一律按 `norm(w)`（`Apple`/`apple` 只留一个）；`options` 中与 `norm(w)` 同形者恰 1 个；`options[answerIdx].w === w`；判对只看 `answerIdx`/词 key，**不看显示串**；`i` 从 0 连续。

**2.5 评分（只判对错，不写状态）** `challengeGrade(question, picked) -> {ok, pickedWord, expectedWord}`
- `picked` 为选项下标（number）或英文串（string，供 1–4 数字键与容错）；越界/非整数/`null` → `{ok:false, pickedWord:'', expectedWord:question.w}`，不抛错。
- 判等用 `Core.norm`(core.js:31)，与 `gradeExam`(1368)/`gradeSense`(1740) 同口径。
- 不变量：**签名不含 `db`**（从类型上杜绝误写 SRS）；`question` 非法 → 全空返回。反馈文案由 `CHALLENGE.right/rightDetail/wrongDetail` 提供，本函数只产出事实。

**2.6 汇总** `challengeSummarize(dateKey, size, results, at) -> {dateKey, size, kept, doneAt}`
- `results = [{key, ok}]`，按 `keys` 顺序；`kept` = `ok` 为真的条数，缺项或非法计未对（保守）。
- `size` 取入参 N（不是 `results.length`），保证 `kept <= size`；`doneAt` 取 `at`（会话开始时刻，跨零点与 I3 一致），缺省 `now()`。
- **`kept` 仅内存、不落库**：它是供 UI 选文案的中间值，`commitChallenge` 只取 `dateKey/size/doneAt` 三项，**禁止** `db.challenge.kept = k`（否则撞 CH-AC04 键集白名单）。结果句三支互斥：`kept===size → resultAll`、`kept===0 → resultNone`、其余 → `resultPart`（CH-AC10），函数本身不产文案。**结果页只存在于本次会话**：覆层关闭/重渲染/刷新后不可回看，页面只剩卡片「今天已完成 · N 个词」；「回看上次对了几题」必须落库对错明细，直接违规，故不做、也不许为此加字段。

**2.7 落库（唯一写入口）** `commitChallenge(db, summary) -> record | null`
- `db.challenge = { dateKey, size, doneAt }`（**整对象覆盖**，CH-AC13 单条）；不写任何其它键。
- 边界：`db`/`summary` 非法、`size < 1` 或 `dateKey` 非 `YYYY-MM-DD` → `null`。
- 不变量：`db.words`（`lvl/due/st/wrong/wfix/reps/last/star/evts`）、`db.days`、`db.goal`、`db.settings`、`db.exam` 全等不变（CH-AC04）。

## 3. 与既有实现的关系

**必须复用**：`sensesOf`(core.js:1670)、`pickSense`(1716)、`wrongRecords`(339)、`norm`(31)、`wordKey`(34)、`dayKey`(39)、`now`(28)、`safeNonNeg`(1281)；`openModal`(app.js:87)、`esc`、`toast`；流程骨架仿 `openExamFlow/renderExamQuestion/finishExamFlow`(app.js:1808/1820/1879)，但用独立 `challengeFlow`，不碰 `examFlow`；卡片插在 `renderHome`(app.js:223) 的 `.home-hero` 之后、`.home-cards` 之前（app.js:321–323）。

**已批准的等价提取（D-049②）**：`todayPlan`(core.js:271) 内的 `dueOf` 提升为模块级 `dueOfWord(db, rec)`（含 `strengthMode`/`strengthFrom` 逐词接管与 `strengthDue` 回落），`todayPlan` 改为委托调用。挑战**不许**自写 `rec.due <= x`：那会绕开强度层，开启强度引擎后池与首页今日任务不一致。既有 161 项须零改动通过。

**绝不能碰**：`rateWord`(179)、`undoRate`(248)、`ensureRecord`(156)、`newRecord`(134)；`db.days[dk]` 的 `total/correct/fresh/review/planTarget`；`commitExam`(1398) 与 `db.exam.flags`（PRD §7：挑战不进待重读）；`SCHEMA` 赋值、`index.html`、路由表、`location.hash`（CH-AC05）。

## 4. 测试策略

`tests/challenge.test.mjs`（`node:test`+`createRequire`，仿 `core.test.v3.mjs`；零写入断言仿其 `snapshotExceptExam`）：
1. CH-AC02：6 到期 + 3 错词（1 重叠）→ 池 8；`reps=0`、`graduated`、`t` 空、`entry` 缺失一律不在池。
2. CH-AC02 边界（闭区间）：`due === at`、`due === endOfDay(at)` 均在池；`due === endOfDay+1ms`（次日 00:00:00.000）不在池；`due > now` 但 ≤ 日终仍入池。
3. CH-AC03：同 `dateKey` 同池连调两次 `challengePool`，`keys` 逐项相等；`size === min(5, 池)`；池=2 → 2（CH-AC14）；未玩时 `challengeState.size === challengePool.size`，已玩时 `=== record.size`（与当时的池无关）。
4. 到期同源（CH-AC02 新判据）：`strengthMode:'off'` 时 `due<=now` 的词「在/不在池」与 `todayPlan.reviews` 逐词一致；`'on'` + `strengthFrom>0` 时与 `dueOf` 判定逐词一致；「日终增量只增不减」只在**同一 db 快照、只改 `at`** 时断言（两次调用间评级改写 `due` 则集合本就该变）。
5. CH-AC06：`optionCapacity` = 6/4/3/2 时选项数分别 4/4/3/2；选项去重、必含正确词、与题面同义者不入选。
6. 跨书同词：同 `w` 出现在两本书 → 选项无重复、正确答案唯一。
7. CH-AC12：同池两次 `challengeStart` → `keys` 相等且从第 1 题开始；同 `(db,key,dateKey)` 两次 `challengeQuestion` 深度相等（无随机）。
8. CH-AC04：全流程后 `words/days/goal/settings/exam` JSON 全等；`Object.keys(db.challenge).sort()` 恰为 `['dateKey','doneAt','size']`。
9. CH-AC13：`dateKey` 置昨日 → `played:false`；commit 后 `db.challenge` 仍是对象（非数组、单条）。
10. CH-AC10：4 对 1 错 → `{size:5,kept:4}`；全对 → `kept===size`；全错 → `kept===0`（三支互斥的输入齐备）；漏答计未对；`kept<=size` 恒成立；`db.challenge` 键集中**无** `kept`。
11. `challengeState.mode` 四态优先级：done > empty > not-enough > ready（构造交叉场景各一条）；`dateKey===今日 && size===0` → `ready`（不得 `done`）；`dateKey` 为未来/非法格式 → 不得 `done`。
12. `ensureSchema` 幂等：旧库跑两次结构一致、`SCHEMA===3`、未知键保留、脏 `size/doneAt` 归零。

`tests/ui.test.challenge.mjs`（DOM stub + `node:vm`，仿 `ui.test.strength-mode.mjs`）：
1. CH-AC01：`[data-act="challenge-open"]` 存在、标题逐字「今日挑战」、DOM 在 `.home-hero` 之后 `.home-cards` 之前。
2. CH-AC05：开始→答题→关闭，`hashchange` 计数 0、`pushState` 调用 0。
3. CH-AC07：点正确项 → 「选对了」；连点任一选项，反馈与题号文本逐字不变。
4. CH-AC11/15：完成态无「开始挑战」、点击不展开；空态无按钮、点击无异常。
5. CH-AC12：第 3 题「先合上」→ toast 逐字、`db.challenge` 与进入前全等、重开题号回到 1。
## 5. 风险与未决
1. **到期口径的等价提取（D-049② 已批准）**：把 `todayPlan` 内 `dueOf`（core.js:279）提为模块级 `dueOfWord(db, rec)` 并改为委托调用；判据 = 行为逐字段等价、`strengthMode/strengthFrom` 语义不改、既有 16 个测试文件零改动全绿。
2. **CH-AC12「同一组词」有条件**：确定性只能保证「同池 → 同组」；若用户在别处评级使池变化，重开就是新组。PRD §6 已承认，需 G4 不额外承诺。
3. **选项池来自 `db.books ∪ db.customBooks` 全量**：删词/自制书场景下 `optionCapacity` 可能 <4 甚至 <2；Node 测试须显式注入 `db.books`（`seedBooks` 不是自动执行的）。

> **G0 已批（D-049 口径）**：§2.1 `doneAt` 未玩恒 0、§2.2 日期种子洗牌取前 N、§2.4 空义项由池准入条件保证——三处措辞勘误生效，判定与实现均不变。
