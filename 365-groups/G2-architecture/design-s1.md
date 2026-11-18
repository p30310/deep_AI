# 卡片 #031 · 遗忘曲线阶段一「让遗忘可测量」在 A 仓库落地 — 数据契约与实现边界（v1.1）

> **当前版本 v1.1（D-065 终裁修正）**；v1.0「复用 `rec.evts[]` 追加字段」方案已被 G0 终裁**作废**（见 `365-groups/DECISIONS.md` D-065 与本文 §1.2）。历史版本记录见文末，不覆盖。
> **基线时点 2026-11-18 18:47（G0 实测）**：A 仓库 `E:/WorkBudy_WorkSpace/word365/`，`node verify.mjs` **PASS 26 文件 / 311 项 / 0 失败 · 460 词 · QA 34/0**，git HEAD `70cedef`。
> **本组独立复核（2026-11-18，G2）**：亲跑 `node E:/WorkBudy_WorkSpace/verify.mjs` 得同一结果（26/311/0 · 460 · 34/0），`git rev-parse HEAD = 70cedef17e3ab365f2be559979892337a58b9a97`。行号以该 HEAD 冻结磁盘为准；G3 落盘后若漂移，以**函数名锚点**为准。
> **本文件性质**：G2 唯一交付物；`word365/` 源码与测试零改动、B 仓库零改动、其他治理文档零改动、无 git commit。下游 **G3 按本契约实现、G10 按本契约复验**。阶段门维持 **CP1 = AC2 ∧ AC5 ∧ AC6**（D-065）。文中「A」= `word365/`，「B」= `E:/dsh-workspace/word365`（仅设计参考，数据模型不同，禁止照搬）。

---

## 0. 证据锚点（A 仓库真实行号）

| 锚点 | 行号 | 事实 |
|---|---|---|
| `SCHEMA = 3` | L11 | 全仓唯一版本常量，阶段一不得抬升 |
| `LADDER_DAYS = [1,2,4,7,15,30,60]` | L14 | 固定阶梯，阶段一仅「显式化为契约」，数值与到期计算零改动 |
| `defaultDB()` | L71–134 | 顶层键清单；**无** `events`/`cohort`/`s1Events`；阶段一**不新增顶层键** |
| `newRecord(w, srcBook)` | L136–155 | `evts: []` 在 **L153**（#015）；**D-065 要求在此并列新增 `s1: []`** |
| `ensureRecord(db,w,srcBook)` | L158–162 | 取或建词条 |
| `rateWord(db,key,rating,mode)` | L187–254 | `t=now()` L193；`wasFresh=rec.reps===0` L194；`origDue=rec.due` **L195**；`snap` 克隆 **L198**；三分支改 due 分别 L209/L219/L226；`evts` push **L245–251**；`return snap` L253；**D-065 采纳第 5 参 `obs`** |
| `attribMode(value)` | L183–185 | #028 六值标签 `['flash','type','choice','match','listen','ctx']`，非法→`null` |
| `undoRate(db,snap)` | L257–266（回滚体 L257–260） | 整体还原 `snap.rec` 与 `snap.day` → `s1` 随 `snap.rec` 天然回滚 |
| `exportJSON(db)` | L437–441 | `clone(db)` 全量深拷贝 → 词级 `s1` 自动携带 |
| `importJSON(text)` | L447–463 | 校验 schema → `migrateOldKeys` → 补基础键 → `ensureSchema(data)` **L461** |
| `ensureSchema(db)` | L489–549 | `evts` 缺失/非数组补 `[]` **L538–539**；非空数组原样保留；**`SCHEMA` 恒 3 注释 L541**；**D-065 要求在此并列增 `s1:[]` 幂等补键** |
| `validStrengthEvent(e)` | L746–751 | 只校验 `t`/`rating`/`interval`，**不校验 `type`**；**完全不读 `s1`** |
| `strengthLadderIndex` | L754–760 | 按 `LADDER_DAYS` 下标打分 |
| `strengthEventScore(events,ladder)` | L763–777 | 拷贝后按 `t` 排序 L764；只读 `t`/`rating`/`interval`；**不读 `s1`** |
| `strengthOf(db,key)` | L796–809 | `filter(validStrengthEvent)` L802 → 只读 `rec.evts` |
| `strengthDue(rec,events,opts)` | L818–835 | `filter+sort` L822–823；只读 `rec.evts` |
| `retentionStats(db,opts)` | L1793–1842 | #027 保持率：`RETENTION_MIN_SAMPLES=10` L1791；相邻对/30 天窗口/取最近一次；**禁用 `evts.interval`** L1828–1830；**不读 `s1`** |
| `tests/mode-attribution.test.mjs:28` | L28 | `assert.deepEqual(Object.keys(e).sort(), ['interval','rating','t','type'], 'evts 元素恰 4 键')` —— **全仓唯一键数断言，G0 亲跑核实；否决扩 `evts` 字段** |
| `Core` 导出面 | L2088–2186 | `rateWord` L2105、`strengthOf/strengthDue` L2148–2149、`retentionStats` L2165、`ensureSchema` L2167 |
| UMD 导出 | L2188–2190 | `global.Core` + `module.exports` |

**#015 现有 `evts` 元素结构（L246–251 逐字段读出，逐字不动）**：

```js
rec.evts.push({
  t: t,                       // number ms，= rec.last（本次评级时刻）
  rating: rating,             // 'know' | 'fuzzy' | 'unknown'
  interval: rec.due - t,      // number ms，= 真实落库 due − t（"距下次排定的间隔"）
  type: attribMode(mode)      // #028 六值标签或 null；缺省/非法 → null
});
```

STR-AC02（`tests/core.test.strength.mjs:61–94`）与 MODE-AC03/04（`mode-attribution.test.mjs:23–30`）共同钉死：`e.t===r.last`、`e.rating`、`e.interval===r.due-r.last`、无 mode 时 `e.type===null`，**且 `Object.keys(e).sort()` 恰为 `['interval','rating','t','type']`**。以上四键的名字、类型、取值、键数在 v1.1 下**逐字保持**——这是落点改用 `s1` 的直接原因。

---

## 1. 观测落点决策：**词级新键 `rec.s1[]`（与 `evts` 并列）**

### 1.1 决策（D-065 终裁）
**选择**：在 `newRecord`（L136）与 `ensureSchema`（L489，紧邻 L538–539 的 `evts` 补键）各增 `s1: []`；`rateWord` 在保留原 `evts` push 的前提下，**另 push 一条 `s1` 事件**（一次作答＝一条 `evts` ＋一条 `s1`）。`s1` 是词级新数组，**不新增任何顶层 db 键、不改 `SCHEMA`（恒 3）、不改 `evts` 四键**。

### 1.2 为何否决 v1.0 的「扩 `rec.evts[]` 字段」（G0 实测，写死）
- **硬冲突**：`tests/mode-attribution.test.mjs:28` 断言 `Object.keys(e).sort() === ['interval','rating','t','type']`（`evts` 元素**恰 4 键**，全仓唯一命中）。只要往 `evts` 元素追加 `plannedDue`/`seg` 等任一字段，该断言立即失败。既有 26 文件测试**一字不改**（卡片红线）⇒ 扩 `evts` 字段**必红**，方案作废。
- v1.0 文中「新增字段不在强度层读取集合内 → 忽略 → 311 项不受影响」的推理对**打分函数成立**，但**忽略了键数断言这一独立守护**——G2 v1.1 更正：`evts` 元素的**结构形状本身**被测试锁定，与打分函数是否消费无关。
- 结论：`evts` 必须**逐字不动**；观测另起 `s1`。

### 1.3 为何同时否决「顶层 `db.s1Events`」
B 用顶层 `db.events` 的**唯一硬理由**是其 `migrate.js` 有词级字段白名单、导入备份会丢弃词级新字段（B `core.js` L22–23 自述）；**A 仓库 `importJSON` 无此白名单**（L454–461 全量保留），该理由在 A 不成立。顶层方案另有两个实缺陷：① `snap`（L198）只快照 `rec` 与 `day`，顶层事件不在快照内 → `undoRate` 无法回滚，必须改 `undoRate`；② 需在 `defaultDB` 与 `ensureSchema` 各加顶层键。故顶层方案劣于词级 `s1`。

### 1.4 `s1` 方案的四条收益（D-065 采纳理由）
1. **避开 4 键断言**：`evts` 保持恰 4 键，`mode-attribution:28` 与 STR-AC02 继续通过；311 项零回归。
2. **零 SCHEMA 变更**：`s1` 是词级加法键，`db.schema` 恒 3（L541 不变）；`ensureSchema` 仅增一条幂等补 `s1:[]`（与 L538–539 同构），老库导入后自动补齐。
3. **导出导入自动携带**：`exportJSON`（L438）`clone(db)` 全量深拷贝，`importJSON`（L461）`ensureSchema` 只补不删 → `s1` 随备份往返逐字段一致，**无需新迁移代码**。
4. **`undoRate` 天然回滚**：`snap.rec = clone(rec)` 在 L198，早于 `evts`/`s1` 两处 push；撤销时 `snap.rec` 整对象还原，两条事件一并回滚 → **`undoRate` 零改动**。

### 1.5 硬约束
- `evts` push（L245–251）**逐字不动**：不改键集、类型、取值、顺序、条数。
- `s1` 与 `evts` 并列于同一 `rec`；**不新增顶层 db 键**；**`SCHEMA` 恒 3**。
- **禁止**把 `plannedDue`/`seg`/`selfRating` 等写到 `rec` 顶层字段（会触碰 `lvl/due/st/wfix/reps` 邻近结构）。
- `s1` 只存阶段一观测事实，**不重复存 `evts` 的 `t/rating/interval/type` 四键**（避免双真源；审计时按同一次 `rateWord` 调用对照）。

---

## 2. 事件字段表（`rec.s1[]` 元素，逐字段）

「来源」指 `rateWord` 的入参或步骤；全部字段均为阶段一新增（承载于新数组 `s1`，**不在 `evts` 上**）。

| 字段 | 类型 | 写入时机（锚点） | 必填 | 缺省值 | 取值来源（A 仓库） | 消费方 |
|---|---|---|---|---|---|---|
| `k` | string | `s1` push 时 | 是 | `key`（入参） | 第 2 入参 `key`（`w::xxx`） | `collectS1Events` 注入词键；`baselineReport`/`falseKnownCandidates` 的「同词」去重键 |
| `plannedDue` | number(ms) | `s1` push 时，**值取自 L195** | 是 | `0` | `origDue = rec.due`（**L195，早于 L209/219/226 改 due**） | `lateMs` 推导；到期偏差分析（S1-AC6） |
| `at` | number(ms) | `s1` push 时 | 是 | `t` | 直接复用 L193 的 `t`，**不二次调用 `now()`** | `baselineReport` 排序、`falseKnownCandidates` 输出、`dueSnapshot` 对照 |
| `actualAt` | number(ms) | `s1` push 时 | 是 | `at` | 令 `actualAt = at`（同一 `t`）→ 恒 `at === actualAt`（C3） | 与 `plannedDue` 配对算迟到；C3 断言 |
| `lateMs` | number(ms) | `s1` push 时 | 是 | `0` | `plannedDue > 0 ? Math.max(0, t - plannedDue) : 0` | 到期偏差（超期多久才作答） |
| `prevIvl` | number(ms) | `s1` push 前算 | 是 | `0` | 上一条 `rec.s1[last].newIvl`（无前序/脏值 → `0`；**在同次 push 前读，读到的是上一条**） | `intervalSeg` 入参（「本次作答发生在哪个排定间隔之后」） |
| `newIvl` | number(ms) | `s1` push 时 | 是 | `rec.due - t` | `rec.due - t`（与本次 `evts.interval` 同源同值，但独立存于 `s1`） | 「改间隔前后」审计对照；下一条的 `prevIvl` |
| `seg` | string | `s1` push 时 | 是 | `'other'` | `intervalSeg(prevIvl, wasFresh)` | `baselineReport` 分组键 |
| `branch` | `'10m'\|'nextDay+4h'\|null` | `s1` push 时 | 是 | `null` | `rating==='fuzzy'→'nextDay+4h'`；`rating==='unknown'→'10m'`；`know→null` | 支线标注（只打标，不改 due） |
| `selfRating` | `'know'\|'fuzzy'\|'unknown'` | `s1` push 时 | 是 | `rating` | 默认 = 第 3 入参 `rating`；**第 5 参 `obs.selfRating` 合法时覆盖**（D-065 采纳） | `falseKnownCandidates`（与 `retrievedOk` 并列） |
| `retrievedOk` | boolean | `s1` push 时 | 是 | `rating === 'know'` | 默认由 `rating` 推导；**第 5 参 `obs.retrievedOk` 为 boolean 时覆盖**（D-065 采纳） | `baselineReport` 保持判定；`falseKnownCandidates` |
| `first` | boolean | `s1` push 时 | 是 | `wasFresh` | `wasFresh = rec.reps === 0`（**L194，改 `reps` 前**） | `intervalSeg` 的 `isFirst`；新词段 `'new'` |
| `cohort` | string | `s1` push 时 | 是 | `'fixed'` | **常量 `'fixed'`**（固定阶梯组；A 无 `db.cohort` 键，禁止新增该键） | 对照分组打标（C4：只打标不改行为） |

**字段映射说明（A ≠ B，禁止照搬）**：B 的 `selfEval` → A 统一命名 **`selfRating`**（任务卡字段名）；B 的 `k` 来自 `wordKey(bookKey,w)` → A 直接取 `key`（`w::` 主键）；B 的 `cohort` 读 `db.cohort` → A 恒为常量 `'fixed'`；B 的 `ivl` 是整数天 → A 无 `ivl` 字段，`prevIvl/newIvl` 用 `rec.s1[].newIvl`（毫秒，同源 `rec.due - t`）等价替代。

**`obs` 值域守护**：`obs.selfRating` 仅接受 `'know'|'fuzzy'|'unknown'`，`obs.retrievedOk` 仅接受 boolean；非法/缺失一律回落默认推导，**不臆造第四档 selfRating**。默认路径下 `selfRating==='know'` 必伴 `retrievedOk===true`，故未显式覆盖时不自产假认识候选；显式双信号 `{selfRating:'know',retrievedOk:false}` 可正向产出候选（D-069），导入/注入数据亦同。

**历史/脏数据降级**：老库经 `ensureSchema` 补 `s1:[]`，**没有历史 s1 事件**（与 v1.0 假设的「evts 历史事件缺新字段」不同）。若导入的备份含 `s1` 元素但字段脏缺，消费函数兜底：`seg` 缺→`'other'`、`first` 缺→`false`、`k` 缺→`''`、**`retrievedOk` 缺失/非 boolean → 整条跳过、不计入 `baselineReport` 样本**（**D-065 采纳的 A 收紧口径**，不臆造为未保留）。

---

## 3. 纯函数契约（5 个，全部追加到 `Core` 导出面；既有函数零改动）

### 3.0 命名、不变式与输入归一
- 函数：`collectS1Events` / `intervalSeg` / `baselineReport` / `falseKnownCandidates` / `dueSnapshot`（后四个与任务卡一致；前者由 D-065 拍板进入导出面）。
- 均为**无 DOM、不读 `now()`（除非显式 `at` 入参）、不改入参、不写 db** 的纯函数；同输入必深度相等。
- 常量 `INTERVAL_CONTRACT`（**新增导出**）：

```js
var INTERVAL_CONTRACT = {
  ladder: LADDER_DAYS.slice(),                       // 与 L14 同源，禁止另写死一份
  branches: { unknown: '10m', fuzzy: 'nextDay+4h' }, // 与 L219/L226 派生式一致
  newWord: 'new',
  segments: ['new','10m','1d','2d','4d','7d','15d','30d','60d','other'] // 顺序即报告输出顺序
};
```

### 3.1 `collectS1Events(db) -> Array`
- **入参**：`db`（只读）。返回各词 `rec.s1[]` 的**扁平数组**。
- **算法（写死）**：`keys = Object.keys(db.words || {})`（字典序，确定）；逐词取 `Array.isArray(rec.s1) ? rec.s1 : []`，每个元素**浅拷贝**并设 `k = 词键`（覆盖脏 `k`）；`concat` 返回。`rec` 非对象/`s1` 非数组跳过。
- **硬约束**：**不写 db、不原地改任何 `s1` 数组或元素**（浅拷贝后设 `k`）；不读 `evts`、`db.exam`；同 `db` 两次调用深度相等。
- **边界**：`db` 空 / `db.words` 缺失或非对象 → `[]`。

### 3.2 `intervalSeg(ivl, isFirst) -> string`（D-065 确认毫秒量纲）
- **入参**：`ivl` = 排定间隔，**单位毫秒**（A 口径 `rec.s1[].newIvl = rec.due - t`，与 `evts.interval` 同源量纲；**禁止与 B 的整数天混**）；`isFirst` = 是否新词首次作答（`wasFresh`）。
- **输出**：`INTERVAL_CONTRACT.segments` 中的一段名。
- **规则（写死）**：
  1. `isFirst === true` → `'new'`（首次作答无论间隔）。
  2. `ivl` 非有限数 / `<= 0` → `'10m'`。
  3. `d = Math.round(ivl / DAY_MS)`；若 `d === 0` → `'10m'`；若 `d ∈ LADDER_DAYS` → `d + 'd'`；否则 → `'other'`。
  4. 边界校验：`ivl=600000`(10min)→`'10m'`；`ivl=28*3600000`(fuzzy)→`d=1`→`'1d'`；`ivl=LADDER[k]*DAY_MS`→`LADDER[k]+'d'`；`ivl=3*DAY_MS`(非阶梯)→`'other'`。
- **边界**：`ivl=null/undefined/NaN/Infinity/负数` 一律走规则 2；`isFirst` 非 boolean 按 `false` 处理。

### 3.3 `baselineReport(events) -> Array<{seg,sampleSize,retainedCount,retained}>`
- **入参**：`events` = `collectS1Events(db)` 的输出（扁平、每条带 `k`）；外部调用亦须满足此形状。非数组 → 当 `[]`。
- **输出**：**长度恒 `INTERVAL_CONTRACT.segments.length`（=10）、顺序与该数组逐项对应**的对象数组；每项：
  - `seg`：段名。
  - `sampleSize`：该段**唯一词数**（同一 `k` 同一 `seg` 只计 1）。
  - `retainedCount`：其中 `retrievedOk === true` 的词数。
  - `retained`：`sampleSize > 0 ? retainedCount / sampleSize : null`（**空段必须 `null`，不是 0/NaN**）。
- **口径（写死，与 #027 `retentionStats` 明确区分）**：
  1. **同一词同一段只取首次检索**：先按 `at` **升序稳定**排序（`slice()` 后 `sort`，ES2019 稳定；不原地改入参），再以 `k + '|' + seg` 去重，`seen` 命中即跳过后续 → 取**时间最早**那条。**与 `retentionStats` 的「取最近一次」相反，两者互不包装。**
  2. **`retrievedOk` 必须是严格 `true` 才计保留；缺失或非 boolean 的事件整条跳过、不进 `sampleSize`**（**D-065 采纳的 A 收紧口径**，不臆造为未保留）。
  3. `retained === null` 仅表示「该段无有效样本」，不等于「该段全忘」。
- **边界**：`events=[]`/`null`/脏元素（非对象、`at` 非有限数、`seg` 非法）→ 对应段样本 0、`retained=null`；全脏 → 全 10 段 `sampleSize=0/retained=null`；不抛错；同输入两次调用深度相等。

### 3.4 `falseKnownCandidates(events) -> Array<{k,at,seg}>`
- **入参**：同 §3.3 的扁平事件数组（非数组 → `[]`）。
- **判定**：`selfRating === 'know' && retrievedOk === false`（严格等于、D-069 与 rating 三值统一；`known`/大小写不符不算）。
- **输出**：按输入序遍历，命中即 push `{ k: e.k||'', at: e.at||0, seg: e.seg||'other' }`；无命中返回 `[]`。
- **硬约束**：**纯只读**——不写 `db.words`、不调 `rateWord`/任何写函数；候选识别**绝不改写词状态**（S1-AC3）。
- **边界**：`events=null`/空/含脏元素 → `[]`，不抛错。

### 3.5 `dueSnapshot(db, at) -> {at, keys:string[], count:number}`
- **入参**：`db`（只读）；**`at` 必填 number ms**（**不缺省、不读 `now()`** → 保证纯函数确定性；这是 A 相对 B `at||Date.now()` 的收紧）。
- **输出**：`at` 即入参；`keys` = 满足 `r.due` 为有限数 `>0 && r.due <= at && r.st !== 'known'` 的 `db.words` 键；`keys.sort()`（字典序）；`count = keys.length`。
- **硬约束**：**只读推导**——不写 `db.days`、不改任何 `r.*`、**不参与 `todayPlan` 排序**；同 `db`+同 `at` 两次调用深度相等。
- **边界**：`db` 为空 / `db.words` 缺失或非对象 → `{at: at, keys: [], count: 0}`；`at` 非有限数 → 按 `0` 处理（`keys=[]`）；脏 `r`（非对象/`due` 非数）跳过。

### 3.6 与 `retentionStats`（#027）的口径隔离（写死，防止 G3 混用）
| 维度 | 本契约 `baselineReport` | 既有 `retentionStats`（L1793） |
|---|---|---|
| 问题 | 哪个**间隔段**记得牢（遗忘曲线基线） | 长期（30 天窗口）保持率 |
| 分组 | 按 `seg`（10 段） | 不分组，全词一个比率 |
| 去重 | 同词同段**取首次** | 同词多合格对**取最近一次** |
| 样本单位 | 段内唯一词数 | 词（一词一票） |
| 空值 | 空段 `retained=null` | `samples=0 → rate=null` |
| 时间基准 | 读事件 `at` 排序，不读 `now()` | 不读 `now()`，只比相邻事件毫秒差 |
| 数据源 | `collectS1Events(db)` → `rec.s1[]`（`k/at/seg/retrievedOk`） | `db.words[*].evts`（`t/rating`） |

**两者并存、互不调用、互不包装、数据源数组不同**；`retentionStats` 已落盘且被 311 项覆盖，零改动。

---

## 4. 写入点收敛（`rateWord` 内）

### 4.1 双写与单次时间基准（C3，写死）
- **单次时间基准**：全程只用 L193 的 `var t = now()`。`plannedDue` 取 L195 的 `origDue`（`rec.due` 修改**前**）；`at = actualAt = t`；`lateMs = plannedDue>0 ? Math.max(0, t - plannedDue) : 0`。**禁止**在 push 附近二次调用 `now()`/`Date.now()`。
- **两处写入（顺序固定）**：
  1. `evts` push（**L245–251 逐字不动**）：`{t, rating, interval: rec.due - t, type: attribMode(mode)}`。
  2. `s1` push（**新增紧随其后**、`return snap`（L253）之前）：写入 §2 全部 13 字段。`prevIvl` 在此 push **前**读 `rec.s1[last].newIvl`；`newIvl = rec.due - t`（同一次读取，与 `evts.interval` 同值但独立存）；`first = wasFresh`（L194）。
- **不改**：`snap` 克隆时机（L198，早于两处 push）、三分支 `due/lvl/st/wfix/wrong` 落库规则、`evts` 元素形状与条数。
- **撤销**：`undoRate`（L257–260）还原 `snap.rec`，`evts` 与 `s1` 两条新增事件一并回滚 → **`undoRate` 零改动**。

### 4.2 第 5 参 `obs`：**D-065 已采纳**
- **签名**：`rateWord(db, key, rating, mode, obs)`，`obs`（可选对象）`= { selfRating?, retrievedOk? }`；**不含 `at`**（时间基准统一 L193 单点 `t`；测试用 stub `Date.now` 固定，避免双源）。
- **值域**：`selfRating ∈ {'know','fuzzy','unknown'}`、`retrievedOk ∈ {true,false}`；非法/缺失回落默认：`selfRating = rating`、`retrievedOk = (rating === 'know')`。
- **前 4 参逐字段等价证明**：
  1. `obs` 缺省/`null` → 全字段走默认，`s1` 元素内容与无 `obs` 时**逐字段全等**。
  2. `evts` 元素四键（含 `type=attribMode(mode)`）**完全不受 `obs` 影响**；键数恒 4 → `mode-attribution:28` 继续通过。
  3. `obs` **只读不写** `rec.lvl/due/st/wfix/wrong/reps/last/first/lastRating` → 三分支落库零改动；STR-AC01 四字段基线断言继续成立。
  4. **与 #028 `mode` 不冲突**：`mode` 仍是第 4 参，`attribMode` 逻辑零改动，`obs` 为独立第 5 参。
  5. **无签名长度断言**：全仓 Grep（`app.js` + 13 个测试文件）确认无 `rateWord.length` 断言；3/4 参调用遍布既有测试但均按值传参 → 加可选第 5 参不破坏任何既有断言。
- **写入域说明**：契约上写入域因 `obs` 覆盖 `app.js`，但**阶段一默认不传第 5 参**——`app.js:1423/1653` 两处调用**逐字不动**、不新增用户可见操作；仅当未来需显式双信号时才传。

### 4.3 导出/导入（天然满足，须测试证明）
- `exportJSON`（L438）全量 `clone` → 词级 `s1` 自动进入 JSON；`importJSON`（L461）`ensureSchema` 只补 `s1:[]`、不裁剪已有数组 → 往返逐字段一致。
- 新测试须断言：导出→导入后 `s1` 事件逐字段一致；老库（无 `s1`）导入后补 `[]`、`due` 不变、`collectS1Events` 返回 `[]` 且消费函数不抛错。

---

## 5. 与 #015 强度层的边界（读取集合完全隔离）

| 数组 | 归属 | 键集 | 写入路径 | 读取路径 |
|---|---|---|---|---|
| `rec.evts[]` | #015/#028 已有 | 恰 4 键 `{t,rating,interval,type}` | L245–251（**逐字不动**） | `validStrengthEvent` L746、`strengthEventScore` L763、`strengthOf` L796、`strengthDue` L818、`retentionStats` L1793 |
| `rec.s1[]` | **阶段一新增（D-065）** | §2 的 13 字段 | `rateWord` 内紧随 `evts` push 的另一条 push | **仅** `collectS1Events` → `baselineReport`/`falseKnownCandidates` |

- **强度层完全不读 `s1`**：`strengthEventScore`（L764–776）只读 `e.t/e.rating/e.interval`，不遍历 `Object.keys(e)`；`validStrengthEvent`（L746–751）只校验三键、`type` 都不校验；`strengthOf/strengthDue/retentionStats` 只读 `rec.evts`。**`s1` 的增删、字段取值、条数均不进入任何强度层/保持率计算 → 311 项逐字段不受影响。**
- **阶段一层不读 `evts`**：`collectS1Events` 只读 `rec.s1`；`baselineReport/falseKnownCandidates/dueSnapshot` 只读摊平后的 `s1` 事件或 `db.words[*].due/st`。两条读路径**无交集**。
- **零写路径交叉**：阶段一 5 个函数均不调 `rateWord`/`undoRate`/`ensureRecord`/`ensureSchema`/`updateLastSeen`/`commitExam`/`commitChallenge`；不读 `db.exam`。
- **撤销一致性**：`s1` 随 `snap.rec`（L198 克隆）一并回滚，`undoRate` 零改动。

---

## 6. 测试文件设计：`tests/core.test.s1.mjs`（新独立文件）

- **风格**：`node:test` + `createRequire`（仿 `tests/core.test.strength.mjs:1–11`），只 `require('../js/core.js')`，不改既有 26 文件任何一字。
- **预估项数 N = 20**（G3 实现后 `verify.mjs` 的 `EXPECT.testFiles` **26→27**、`EXPECT.testItems` **311→331**；项数若调整须同步 EXPECT 并在卡片记录）。

| # | 对应 AC | 断言要点 |
|---|---|---|
| 1 | AC1 | 固定 `Date.now` 重放：加 `s1` 前后 `lvl/due/st/wfix/wrong/reps/last/first` 逐字段一致（三分支） |
| 2 | AC1 | **`evts` 元素 `Object.keys(e).sort()` 恰 `['interval','rating','t','type']` 且条数不变**（`mode-attribution:28` 不回归，D-065 核心守护） |
| 3 | AC1 | `undoRate` 后本次 `evts` 与 `s1` 事件随 `snap.rec` 一并回滚，`s1` 恢复原状 |
| 4 | AC2 | `intervalSeg` 覆盖 `new/10m/1d/2d/4d/7d/15d/30d/60d/other` + **毫秒量纲**与脏值兜底 |
| 5 | AC2 | `collectS1Events(db)` 摊平各词 `s1` 并注入 `k`、不改 db、同输入深度相等 |
| 6 | AC2 | `baselineReport` 手工事件：`sampleSize/retainedCount/retained` 精确值，可手工复算 |
| 7 | AC2 | 同一词同一段只取**首次**（按 `at` 排序去重），多事件只 1 票；**`retrievedOk` 缺失事件跳过不计样本** |
| 8 | AC2 | 空段 `retained===null`（非 0/NaN）；输出长度=10、顺序=`INTERVAL_CONTRACT.segments` |
| 9 | AC3 | `falseKnownCandidates` 命中 `selfRating==='know' && retrievedOk===false`，输出 `{k,at,seg}`（可借第 5 参构造） |
| 10 | AC3 | 候选识别前后 `JSON.stringify(db.words)` 逐字节全等（不改写词状态）+ 正/反例 |
| 11 | AC4 | `exportJSON→importJSON` 后词级 `s1` 事件逐字段一致（含 `k/seg/retrievedOk/plannedDue`） |
| 12 | AC4 | 老库（无 `s1`）导入后 `ensureSchema` 幂等补 `[]`、`due` 不变、`collectS1Events` 返回 `[]`、消费函数不抛错 |
| 13 | AC5 | `SCHEMA===3`、`ensureSchema` 仅增词级 `s1:[]`、**顶层键集不变**、既有 `evts` 非空内容不被裁剪 |
| 14 | AC5 | 新测试为独立文件、既有 26 文件零改动；门禁文件数 27 / 项数 331（写入 `EXPECT` 与注释） |
| 15 | AC6 | 第二次作答 `plannedDue===` 第一次落库 `due`；`lateMs===Math.max(0, at-plannedDue)` |
| 16 | AC6 | `at===actualAt===t`（单次基准）；fuzzy/unknown 的 `branch` 正确且 due 与 `t` 同源 |
| 17 | AC6 | `dueSnapshot` 只读推导到期队列（`due<=at && st!=='known'`），不写 `days`、不参与 `todayPlan` |
| 18 | 边界 | 五个纯函数对 `null`/空/脏值/样本量 0 一律不抛错、返回确定结构 |
| 19 | 纯读 | 五函数调用前后 `JSON.stringify(db)` 逐字节全等；同输入两次调用深度相等 |
| 20 | 隔离 | `strengthOf/strengthEventScore/strengthDue/retentionStats` 结果在 `s1` 有无时逐字段全等；`baselineReport`（取首次）与 `retentionStats`（取最近）互不为包装 |

- **不得改**：既有 26 个测试文件（尤其 `mode-attribution.test.mjs:28`）、`index.html` 加载序列、`read.me`、任何 `due/lvl/st/reps/wfix` 计算、`schedule`/`strengthDue`、固定阶梯初值。
- **须经 `Core.*` 取到**：`INTERVAL_CONTRACT`、`collectS1Events`、`intervalSeg`、`baselineReport`、`falseKnownCandidates`、`dueSnapshot`。

---

## 7. 风险与降级（5 条）

| # | 风险 | 影响 | 最小降级方案 |
|---|---|---|---|
| R1 | `evts` 四键/键数漂移（误把 `s1` 字段写进 `evts`） | 直接跑红 `mode-attribution:28`，311 项回归 | `evts` push 逐字不动；`s1` 独立 push；测试 #2/#20 钉死四键键集与强度层结果 |
| R2 | 导出导入兼容（老库无 `s1` / 导入的 `s1` 字段脏缺） | `collectS1Events`/消费函数误判或抛错 | §2 降级兜底；测试 #11/#12 往返与老库补键；`importJSON` 零改动 |
| R3 | 样本量不足导致保持率误导 | 空段/小样本被读成结论 | `retained=null` 空段不臆造；`retrievedOk` 缺失跳过不计样本（D-065）；阈值若展示取 `Core.RETENTION_MIN_SAMPLES` 单一来源（阶段一无 UI 不改 `phrases.js`）；测试 #7/#8 |
| R4 | 保持率口径混用（与 #027 取最近一次相反） | 同一用户两份「保持率」互相矛盾 | §3.6 口径隔离表 + 测试 #20；数据源数组不同（`s1` vs `evts`）、函数独立、互不包装 |
| R5 | 第 5 参 `obs` 误传（显式双信号与 `rating` 冲突） | `selfRating/retrievedOk` 噪声致假认识误报 | §4.2 值域白名单：非法回落默认推导；阶段一 `app.js` 不传参；覆盖分支集中一处便于 G10 审计 |

---

## 8. 未决项状态（D-065 已全部闭合，无遗留未决项）

v1.0 §8 的 4 条未决项已由 G0 终裁 D-065（`DECISIONS.md:83`）逐条拍板，v1.1 全部落地：

1. ~~第 5 参 `obs` 是否采纳~~ → **采纳**：`rateWord(db,key,rating,mode,obs)`，`obs={selfRating?,retrievedOk?}` 可选、缺省由 `rating` 推导、前 4 参逐字段等价（§4.2）。
2. ~~`baselineReport` 对 `retrievedOk` 缺失历史事件的处理~~ → **跳过不计样本**（A 收紧口径，§2/§3.3）。
3. ~~`intervalSeg` 入参量纲~~ → **确认毫秒**（A 的 `rec.s1[].newIvl = rec.due - t`，内部 `/DAY_MS` 归段，禁与 B 整数天混，§3.2）。
4. ~~`collectS1Events(db)` 是否进入导出面~~ → **进入 Core 导出面**（G10 复验需摊平各词 `s1`，§3.1）。

**另**：观测落点由「扩 `evts`」改为「词级新键 `rec.s1[]`」（§1），系 G1 实测 `mode-attribution:28` 冲突后 G0 终裁作废 v1.0 方案。**实现期非阻塞注意**：N=20 为预估值，G3 落盘后按实际项数微调并同步 `verify.mjs` 的 `EXPECT`（27/331）与卡片记录；G10 按本契约复验 CP1 = AC2 ∧ AC5 ∧ AC6。

---

## 版本记录

- **v1.1（2026-11-18，G2 · D-065 终裁修正）**：观测落点由「复用 `rec.evts[]` 追加字段」改为**词级新键 `rec.s1[]`（与 `evts` 并列）**——`mode-attribution.test.mjs:28` 的 evts 恰 4 键断言使扩字段方案必红，既有 26 文件零改动；`newRecord`/`ensureSchema` 增 `s1:[]`、SCHEMA 恒 3、`undoRate` 随 `snap.rec` 天然回滚、导出导入自动携带。采纳第 5 参 `obs={selfRating?,retrievedOk?}`；`baselineReport` 对 `retrievedOk` 缺失跳过不计样本；`intervalSeg` 毫秒量纲；`collectS1Events` 进入 Core 导出面；字段表改为 `s1` 元素 13 字段；测试 N=20、EXPECT 27/331。4 条未决项全部闭合，无遗留。
- **v1.0（2026-11-18，G2）**：首版。基线复核 26 文件/311 项/0 失败·460 词·QA 34/0（git `70cedef`）；原定观测落点＝复用 `rec.evts[]` 追加字段（**已被 D-065 作废**）；钉死 4 纯函数签名与边界、写入点与可选第 5 参、与 #015 强度层隔离、测试清单 N=20、5 条风险与 4 条未决项。
