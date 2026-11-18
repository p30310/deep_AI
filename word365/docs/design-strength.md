# 背单词365 · 叠加式记忆强度引擎 · 增量设计契约（任务卡 #015）

> **文档性质**：增量设计契约（Design Contract）——只定义「字段落点 / 类型 / 默认值 / 函数签名 / 返回结构 / 纯度 / 分支 / 兼容路径 / 红线 / 任务分解」，**不含可复制的函数体源码、不替 G3 写实现、不替 G8 写测试**。
> **执行组**：G2 · 架构与任务分解（#015 主笔 agent）
> **文档版本 v1.0 · 2026-11-16**
> **基线 2026-11-16 21:00 实测 A 161/7 + 460 词 + qa 34/0**（A 仓库 `E:/WorkBudy_WorkSpace/word365/`；7 文件 161 项 0 失败、`check-data.mjs` 460 词 / 5 本 / 跨书零重复、`qa_independent_verify.mjs` 34/0）
> **依据 D-037 / D-038**（立项与 OP-01/OP-03/type 拍板；本文对所有 D-xxx 只引用编号、不复述正文，真源 `365-groups/DECISIONS.md`；另遵守 D-004/D-005/D-011 既有约束）
> **上游**：`docs/prd-strength.md` v1.0（G1 已定稿，8 条 `STR-AC01~08`、两阶段 Scope、OP-01~03）→ 任务卡 `#015.md` → `365-groups/G2-architecture/BOUNDARY.md`
> **下游**：G3（core / phrases / `tests/core.test.strength.mjs`）→ G8（独立判定与回归）；#016（义项提示增强）依赖本卡观测层冻结后串行
> **交付落点**：本文件 `word365/docs/design-strength.md`（G2 可写域 `docs/design-*.md`，本任务**唯一写入文件**）

---

## 0. 文档头（基线 / 来源层级 / 边界声明）

### 0.1 基线截止时点

| 项 | 值 |
|---|---|
| 目标仓库 | **A 仓库** `E:/WorkBudy_WorkSpace/word365/`（纯静态 Web 版）；B 仓库不在本卡范围 |
| 基线截止时点 | **2026-11-16 21:00** |
| A 仓库全量 | **161 项 / 7 文件 / 0 失败** |
| A 仓库数据 | `check-data.mjs` → **460 词 / 5 本 / 跨书零重复通过** |
| 门禁外脚本 | `qa_independent_verify.mjs` → **34/0** |
| `SCHEMA` | **3**（红线，不抬） |

> 本文为**纯文档产出**，不改动任何源码 / 测试 / README / 既有文档，不构成基线漂移；写后全量复跑由 G8 独立复核执行。

### 0.2 事实来源层级口径（沿用 PRD §0.2 三层，不新增）

| 标记 | 含义 | 本文落点 |
|---|---|---|
| **【实测】** | 对 A 仓库源码 / 测试只读核实、可逐行复现 | §0.1 基线数字、§1.3 现状锚点、§4.1 红线核查、§6 契约所引用的现有行号 |
| **【规划】** | 本期要落地的字段 / 函数 / 分支 / 兼容方案 / 任务分解 | §1.1/§1.2、§2、§3、§4.2、§5 |
| **【推断】** | 由实测推出的判断、尚未落地验证 | §5.3 冲突影响判断 |

> 凡未在 §1.3 / §4.1 标注【实测】的阈值 / 档位 / 分档线（如 `score` 0..6、`level` 4/2 阈值、事件打分权重）均为【规划】设计取值，非实测、非预测，待 G3 实现与 G8 回归验证。

### 0.3 边界声明

1. **不写码 / 不改既有文件**：本组不写任何 `.js` / `.css` / `.html` / `.mjs`，不写 `tests/**`、各仓库 `README.md`、`docs/prd-*.md`、`docs/design-n4-n2.md`、`365-groups/**`；本任务唯一写入文件为本文件（BOUNDARY.md §5/§6）。
2. **不替 G1 改 AC**：`STR-AC01~08` 编号、判定逻辑、Given/When/Then **零改动、零重造、零续号**；本文只把 AC 翻译成可判定契约，可提「需 G0 裁决」，不自行改需求（BOUNDARY.md §6-4）。
3. **不替 G3/G8 写实现**：本文给字段 / 签名 / 入参出参 / 判定伪代码 / 不变式；伪代码仅用于精确表达契约语义，**不是可复制的最终源码**，具体编码、变量名、内部工具函数归 G3。
4. **D-038 已拍板项为已定输入**（不再列为待拍板）：OP-01 同步回滚、OP-03 本阶段不做独立 UI、`type` 阶段一记 `null` 且不扩大 `rateWord` 签名。三项见 §0.4。
5. **双仓库口径**：所有结论仅针对 A 仓库并带路径；B 仓库不在范围。

### 0.4 D-038 拍板项登记（作为已定输入承接）

| 拍板项 | 结论（只引用 D-038 编号） | 本文承接位置 |
|---|---|---|
| **OP-01（undo 是否回滚事件）** | **同步回滚**：`undoRate` 撤销评级时删除该次新增事件，`evts` 与实际生效评级一一对应 | §2.3（快照天然回滚机制）、§3 STR-AC06、§4.2 |
| **OP-03（看板是否要 UI）** | **本阶段不做独立 UI**：仅交付强度纯函数 + 可选只读展示；如需只读块另开子卡并单独授权 | §5.2（app.js 不写入集）、§5.1 |
| **`type` 采集口径** | **不扩大 `rateWord` 签名**；阶段一 `type` 记 `null`，强度公式阶段一不依赖 `type` | §1.1-F1（type 字段）、§2.1（合法事件校验明确忽略 type）、§2.3（写入点） |

### 0.5 AC 编号锁定（8 条，零改动零重造）

| 号段 | 条数 | 出处 | 本文处置 |
|---|---|---|---|
| `STR-AC01` ~ `STR-AC08` | 8 | PRD §3.2 | 逐条映射到 §3「AC ↔ 契约映射表」，编号原样引用 |
| `N4W-AC*` / `N2L-AC*` / `C-AC*` / `I-AC*` / `J-AC*` / `N1/N2/N4/N7/P0/M/S1-AC*` 等 | — | 既有文档 | **只读引用**，不复用、不覆盖、不续号 |

---

## 1. 【规划】数据契约：字段

> 新增字段共 **2**（持久化字段 F1/F2）+ 函数返回结构契约 **1**（§2.1 的 `strengthOf` 返回值，非存储字段）。每个字段给「类型 / 默认值 / 归属对象 / 兼容路径 / AC 映射」。

### 1.1 字段总表

| 编号 | 字段 | 类型 | 默认值 | 归属对象 | 性质 |
|---|---|---|---|---|---|
| **F1** | `evts` | `Array<Evt>`，`Evt = {t:number, rating:'know'\|'fuzzy'\|'unknown', interval:number, type:null}` | `[]` | `db.words[key]`（词条记录，**非顶层、非 days**） | 新增（加法字段） |
| **F2** | `strengthMode` | `string`，二值枚举 `'off' \| 'on'` | `'off'` | `db.settings` | 新增（加法字段） |

### F1 · `db.words[key].evts`（逐次作答事件数组）

- **类型**：`Array`，元素结构：**`{t, rating, interval, type}`**。各字段精确定义：

| 子字段 | 类型 | 取值 / 单位 | 语义 | 来源（【实测】锚点） |
|---|---|---|---|---|
| `t` | `number` | 毫秒时间戳（`Date.now()` 量纲），**有限且 ≥ 0** | 本次评级发生时刻；与 `rec.last` 同值（core.js:182/190） | `var t = now()` core.js:182 |
| `rating` | `string` | 三值枚举 `'know' \| 'fuzzy' \| 'unknown'` | 本次评级类别 | `rateWord` 三分支 core.js:194/205/211 |
| `interval` | `number` | **毫秒**，有限且 ≥ 0 | 本次评级**当时设定的到期间隔**，恒等于 `rec.due - t`（见下推导） | `rec.due = t + interval` core.js:198/208/215 |
| `type` | `null` | **阶段一恒 `null`**（D-038） | 题型占位；阶段一不采集、不消费、不校验 | D-038③：不扩大 `rateWord` 签名 |

- **`interval` 的确切推导（必须逐字段可复算）**：事件在 `rateWord` 三分支**全部执行完毕之后**追加，此时取 `interval = rec.due - t`。据此三分支的 `interval` 分别为：
  - `know`：`LADDER_DAYS[min(lvl,6)] * DAY_MS`（core.js:197-198，天 × 86400000）；
  - `fuzzy`：`28 * 60 * 60 * 1000`（core.js:208，28 小时）；
  - `unknown`：`10 * 60 * 1000`（core.js:215，10 分钟）。
  - 该口径**不重复 ladder 逻辑**（只读 `rec.due - t`），保证事件与真实落库 due 严格一致。
- **缺省**：`[]`。`newRecord()`（core.js:132-150）以加法键补 `evts: []`；`ensureSchema` 对既有记录补 `[]`（§1.3）。
- **归属层级**：**只挂 `db.words[key].evts`**；不新增顶层 `db.evts`、不写 `db.days[dk]`、不引入 `db.sessions[]`（D-005）。
- **语义边界**：`evts` 是**观测加法层**——其存在不改变 `lvl/due/wfix/st` 的任何既有语义；阶段一 `strengthMode='off'` 时它只是被采集和只读，不被任何到期逻辑读取。
- **兼容路径**：
  - **老库首开**：`schema=3`、词条无 `evts` → `ensureSchema` 补 `[]`；**不补发历史事件**（无历史可补），行为与基线一致。
  - **导出 / 导入往返**：`exportJSON`（core.js:392-396，`clone(db)` 整库克隆）天然带走 `evts`；`importJSON`（core.js:402-416）对未知字段不遍历、不校验、不报错 → 含 `evts` 的新备份可被旧版本代码导入（STR-AC08，§4.2）。
  - **脏值兜底**：`evts` 缺失 / 非数组 → `ensureSchema` 归一为 `[]`；数组内非法元素由 `strengthOf` / `strengthDue` 的合法事件校验跳过（§2.0），不抛错、不污染 score。
  - **幂等**：`ensureSchema` 连续调用逐字段一致（补一次后不再变）。
- **映射 AC**：STR-AC02、AC03、AC04、AC05、AC06、AC07、AC08。

### F2 · `db.settings.strengthMode`（强度引擎开关）

- **类型**：`string`，二值枚举 `'off' | 'on'`。
- **默认值 / 缺省来源**：**`'off'`**（缺省即 OFF）。采用**双保险**——
  - ① **写侧默认**：`defaultSettings()`（core.js:48-67）以加法键返回 `strengthMode: 'off'` → `defaultDB().settings.strengthMode === 'off'`；
  - ② **读侧兜底**：`ensureSchema`（core.js:444-488）对 `strengthMode` 缺失或非法值归一为 `'off'` → 老库 / 导入库同样缺省 OFF。
- **归属对象**：`db.settings`（与 `dailyMinutes` 等并列，**不新增顶层开关对象**）。
- **语义**：**仅** `'on'` 时 `todayPlan` / 到期判定读取强度函数结果（§2.4）；`'off'` 时固定阶梯 `LADDER_DAYS` 为唯一到期来源。切换本身**不回滚**既有评级、不改 `lvl/st/evts`，只决定「下一次到期计算读谁」（PRD §4.1）。
- **兼容路径**：
  - **老库首开**：`settings` 无该键 → `ensureSchema` 补 `'off'`；既有断言 `phase1.mjs:58` 为「六字段存在性循环」（`for...of` 断言 `!= null`），**非精确字段集合断言**，新增第七个键不破坏该断言（§4.1 已实测）。
  - **导出 / 导入往返**：整库克隆保留；旧版本代码导入含 `strengthMode` 的新备份时忽略未知键、不报错、不抬 SCHEMA。
  - **脏值兜底**：非 `'off'` / `'on'`（含 `undefined` / `null` / 数字 / 其他字符串）→ 归一 `'off'`。
- **映射 AC**：STR-AC01、AC05、AC06。

### 1.2 函数返回结构契约（非存储字段）

`strengthOf(db, key)` 的返回对象（详见 §2.1）：

```
{ level: 'high'|'mid'|'low', score: number|null, basis: 'events'|'lvl-proxy', n: number }
```

- `score` 为 `number` 时取值域为整数 `0..6`；仅当 `db.words[key]` 不存在 / 非对象（无真源可依）时 `score: null`，此时 `level:'low'`、`basis:'lvl-proxy'`、`n:0`。
- 该结构为**新对象**，调用方修改不影响真源；不写入 `db`。

### 1.3 SCHEMA 恒 3 与 `ensureSchema` 幂等加法细节（【实测】现状锚点）

**【实测】** `SCHEMA = 3`（core.js:11）；`ensureSchema`（core.js:444-488）现状是「缺失才补 / 存在则归一、不改 `db.schema`、未知键保留」；`exportJSON`（:392-396）整库克隆；`importJSON`（:402-416）校验 `data.schema` 真值 → `migrateOldKeys` → 补顶层缺键 → `ensureSchema`，**不遍历 / 不裁剪未知字段**。

**本期 `ensureSchema` 增量（G3 实现契约，全部为加法、幂等）：**

| 步骤 | 对象 | 规则 | 幂等保证 | SCHEMA |
|---|---|---|---|---|
| A | `db.settings.strengthMode` | 缺失或非二值 → 设为 `'off'` | 二次调用已是 `'off'`、不再变 | 不改 |
| B | `db.words[*].evts` | 遍历 `Object.keys(db.words)`；记录存在但 `!Array.isArray(r.evts)` → 设为 `[]`；已是数组（含非空）→ **原样保留，不覆盖、不裁剪** | 补一次后 `Array.isArray` 为真，二次不变 | 不改 |
| C | `db.schema` | **绝不赋值、不抬 4、不加版本标记** | 恒 3 | 恒 3 |

- **顺序约束**：步骤 B 与既有 `graduated` 补齐循环（core.js:477-480）可合并进同一次 `Object.keys(db.words)` 遍历，减少一次遍历；但**必须保证**既有 `graduated` 行为逐字不变（STR 不触碰它）。
- **非破坏性**：未知键（如旧库里其它历史字段）一律保留；不清理用户数据（沿用现状语义）。
- **旧 161 断言安全性【实测】**：`phase1.mjs:73-84` 的幂等测试用 `JSON.stringify(db)` 二次比较——步骤 A/B 补一次后即稳定，二次 `ensureSchema` 不再改动 → 断言仍通过；`phase1.mjs:58` 为存在性循环、`:68` 只断言 `graduated===false`、`:86-90` 只断言顶层键存在——均不受新增 `evts` / `strengthMode` 影响。仓库内**未发现对整条 word 记录或 `settings` 精确字段集合的 deepEqual 断言**（§4.1）。

---

## 2. 【规划】函数契约（签名 + 纯度 + 边界，供 G3 实现）

### 2.0 暴露与纯度约束（适用于本节全部新增函数）

- **新增纯函数 `strengthOf` / `strengthDue`**：无 DOM 依赖、不读写 `window/document/localStorage`、**不修改任何入参（`db` / `rec` / `events` / `opts`）**、同输入恒同输出（无隐式 `Date.now()`）。
- **既有非纯函数保持既有副作用契约**：`rateWord` 写 `db.words/days`、`undoRate` 还原快照、`todayPlan` 写 `db.days[dk].planTarget`、`ensureSchema` 改 `db`、`defaultDB/defaultSettings/newRecord` 返回新对象——本期只做**加法式改签**，不要求改纯（否则破坏既有 161 项）。
- **确定性**：`strengthDue` 的锚点取自事件 `t` 或 `rec.last`，**不读 `now()`**；`opts.now` 不参与计算（契约不设该入参），以保证纯函数可复算。
- **暴露面**：`strengthOf` / `strengthDue` 加入 `Core` 对象（core.js:1509-1588）并经 `window.Core` + `module.exports`（core.js:1590-1591）**双暴露**，不改暴露机制。
- **阶段一公式不依赖 `type`**（D-038③）：合法事件校验明确**忽略** `type` 字段，`type` 恒 `null`。

### 2.1 纯函数 P1 · `strengthOf(db, key)` —— 可解释强度看板

- **签名**：`strengthOf(db: Object, key: string) -> {level:'high'|'mid'|'low', score:number|null, basis:'events'|'lvl-proxy', n:number}`
- **入参**：`db` 为整库对象；`key` 为 `w::` 主键（core.js:34 `wordKey`）。
- **出参**：见 §1.2；`n` = 合法事件条数。
- **标注**：**纯** · core.js · 无 DOM · 双暴露 · **不写真源**。
- **边界与不变量**：
  1. `db` / `db.words` 缺失或 `key` 不存在 → 返回 `{level:'low', score:null, basis:'lvl-proxy', n:0}`，**不抛错**。
  2. **无合法事件（`n===0`）→ 回退 `lvl` 代理**：`score = clamp(rec.lvl, 0, 6)`，`basis='lvl-proxy'`，`level=levelOf(score)`。对照口径：`buildRebuildPack` 的 `(3 - r.lvl)`（core.js:911）是「重建优先级」的**反相**代理——`lvl` 越高 → 本契约 `score` 越高（强度越强）→ `(3-lvl)` 越低（越不需重建），二者**同信息、反向可换算**（STR-AC04① 可对照）。
  3. **有合法事件（`n>=1`）→ `score = eventScore(合法事件)`**，`basis='events'`（公式见 §2.1.1）。
  4. **异常事件跳过不抛错**：`rating` 非法、`t` 非数、`interval` 非数/负数/非有限、元素非对象 → 由 `validEvent` 过滤；全部非法时退化为边界 2 的 `lvl` 代理（STR-AC04③、STR-AC07③）。
  5. 输出**无 `NaN` / `Infinity`**；`score` ∈ `0..6` 整数或 `null`。
  6. **调用前后 `db` 逐字段一致**（STR-AC04「不写真源」）。

#### 2.1.1 强度启发式（确定、可解释、可复算；非 ML；不展示百分比）

> 以下为【规划】设计取值。伪代码仅表达契约语义，G3 可自行组织代码，但**判定结果必须与本案逐条一致**（G8 据此复算断言）。

**合法事件校验 `validEvent(e)`**（阶段一不校验 `type`）：

```
validEvent(e) :=  e 是对象且非 null
              && e.t 是有限 number 且 >= 0
              && e.rating ∈ {'know','fuzzy','unknown'}
              && e.interval 是有限 number 且 >= 0
              // type 任意值均不影响合法性判定（D-038③：阶段一不消费）
```

**阶梯下标 `ladderIndexLE(gapDays)`**：返回 `LADDER_DAYS` 中 `<= gapDays` 的**最大下标**，钳 `0..6`（gapDays 由 `interval / DAY_MS` 得；超大值钳到 6）。

**事件打分 `eventScore(events)`**（输入为合法事件数组，`n>=1`）：

```
es      := events 按 t 升序稳定排序
knows   := es 中 rating==='know' 的事件
maxGap  := knows 非空 ? max(e.interval for e in knows) : 0     // 历史最大成功间隔(ms)
base    := ladderIndexLE(maxGap / DAY_MS)                       // 0..6
net     := (#know) - (#unknown)                                 // fuzzy 中性，不计正负
sign    := net > 0 ? +1 : (net < 0 ? -1 : 0)
trend   := (knows.length >= 2 && last(knows).interval >= secondLast(knows).interval) ? +1 : 0
score   := clamp(base + sign + trend, 0, 6)
```

**可解释性说明（G8 可据此写单调性断言）**：
- `base` 编码「历史被证实可记住的最长间隔」——成功间隔越长，强度越高；
- `sign` 编码「对错净反馈」——答对多于答错加分，反之减分；`fuzzy` 中性；
- `trend` 编码「成功间隔趋势」——最近两次成功间隔非下降则加分（记忆在延长）；
- 三项均为整数、可逐事件复算，输出 `0..6` 档位而非伪精确百分比。

**分档 `levelOf(score)`**：`score >= 4 → 'high'`；`2 <= score <= 3 → 'mid'`；`score <= 1 → 'low'`。

**代理打分 `lvlProxyScore(lvl)`**：`clamp(isFinite(lvl) ? lvl : 0, 0, 6)`（无事件时用；与 `(3-lvl)` 反相可对照，见边界 2）。

### 2.2 纯函数 P2 · `strengthDue(rec, events, opts)` —— 强度接管下的到期时间

- **签名**：`strengthDue(rec: Object, events: Array|undefined, opts?: {ladder?:number[], dayMs?:number}) -> number`
  - `rec`：词条记录（读 `lvl` / `last`；**不写**）。
  - `events`：该词的 `rec.evts`（由调用方传入；函数**不写**该数组）。
  - `opts`：可选注入，仅用于测试与解耦——`ladder` 默认 `LADDER_DAYS`（[1,2,4,7,15,30,60]，单位天），`dayMs` 默认 `DAY_MS`（86400000）。**不设 `now` 入参**。
- **出参**：到期毫秒时间戳（有限 `number`），语义与 `rec.due` 同量纲，可直接与 `t` 比较（`due <= t`）。
- **标注**：**纯** · core.js · 无 DOM · 双暴露 · 同输入恒同输出。
- **计算契约（确定、可复算）**：

```
valid  := (Array.isArray(events) ? events : []).filter(validEvent).sort(ascending by t)
if (valid.length >= 1):
    score  := eventScore(valid)
    anchor := valid[valid.length - 1].t                     // 最后一次合法事件时刻(ms)
else:
    score  := lvlProxyScore(rec.lvl)                        // 无事件/全非法 → lvl 代理兜底
    anchor := (isFinite(rec.last) && rec.last > 0) ? rec.last : 0
gapDays := L[ clamp(score, 0, L.length - 1) ]               // L = opts.ladder || LADDER_DAYS
if (gapDays 非有限 number): gapDays := L[min(6, L.length-1)] // 防御兜底
return anchor + gapDays * MS                                // MS = opts.dayMs || DAY_MS
```

- **边界与不变量**：
  1. **无事件（含 `events` 缺失 / `[]` / 全非法）**：`score = lvlProxyScore(rec.lvl)`、`anchor = rec.last` → `due = rec.last + LADDER_DAYS[lvl] * DAY_MS`，**恰好等于 OFF 分支写出的 `rec.due`**（`rateWord` 的 `t` 即 `rec.last`，core.js:182/190/198）。此为 STR-AC07① 的确定性兜底。
  2. **单事件**：输出有限值（`anchor + L[clamp(score)] * MS`，score ∈ 0..6）。
  3. **非法 rating**：被 `validEvent` 过滤；全非法时退化为边界 1。
  4. **超大 `interval`**（远超 60 天但有限）：`ladderIndexLE` 钳到 6 → `gapDays = 60`，due 有限、无 `Infinity`；若 `interval` 本身非有限（如 `Infinity`）→ 被 `validEvent` 过滤，退化为边界 1。
  5. **无 `NaN` / `Infinity` / 非法 due**；`rec` / `events` 不被修改（STR-AC07、STR-AC04）。
  6. **ON 时 `lvl` 不变**：本函数只读 `rec.lvl`，不写任何字段；`st` 口径沿用 `lvl>=3 && interval>=7`（core.js:199，PRD §4.3 已标），**由 `rateWord` 唯一决定，强度层不改 `st`**（STR-AC05）。

### 2.3 事件写入点与撤销回滚（`rateWord` / `undoRate` 改签）

> **红线前提**：`rateWord` 三分支（`know`/`fuzzy`/`unknown`）对 `lvl/due/st/wfix/wrong` 的既有落库规则**逐字段零改动**；本改签只在三分支**之后**、返回 `snap` **之前**追加一段事件写入；**不新增 `rateWord` 入参**（D-038③）。

**写入契约（伪代码，追加在 core.js:217 之后、:229 之前）**：

```
// rec.due 已由既有三分支定稿；t 为本次评级时刻（core.js:182）
if (!Array.isArray(rec.evts)) { rec.evts = []; }
rec.evts.push({
  t: t,                          // 毫秒时间戳，与 rec.last 同值
  rating: rating,                // 'know'|'fuzzy'|'unknown'（既有入参，不扩展签名）
  interval: rec.due - t,         // 本次到期间隔(ms)，恒等于三分支实落值（§1.1-F1 推导）
  type: null                     // D-038：阶段一恒 null，不采集题型
});
```

- **成功才写**：`rating` 三值之一且评级流程走完才追加；无效评级 / 未走完流程不写（PRD §4.2）。
- **不写其它字段新语义**：除 `rec.evts` 外，不改写任何既有字段的含义（STR-AC02）。
- **`snap` 时机【实测】**：`snap.rec = clone(rec)` 位于 core.js:187（三分支修改**之前**），因此 `snap.rec` 不含本次追加的事件。

**撤销契约（D-038 OP-01，`undoRate` 不改代码）**：

- `undoRate`（core.js:233-242）既有逻辑 `db.words[snap.key] = snap.rec` **整体还原**词条记录；因 `snap.rec` 是评级前快照，**本次新增事件随整体还原被删除**，评级前的历史事件原样保留 → `evts` 与实际生效评级一一对应。
- **契约结论**：OP-01 由「事件写在 `rec.evts` 内 + 快照在评级前克隆」**天然满足**，G3 **无需**在 `undoRate` 增加任何 `evts` 删除语句；若 G3 另加显式删除逻辑，须证明不破坏「历史事件保留」与既有断言，否则判超界。
- **映射**：STR-AC02、AC06、D-038 OP-01。

### 2.4 `todayPlan` / 到期计算按 `strengthMode` 分流

> **分流点【实测】**：`todayPlan`（core.js:256-305）的到期集合在 core.js:269-271 由 `r.reps>0 && r.due>0 && r.due<=t && !r.graduated` 过滤；两处排序在 core.js:275 / :283 用 `a.due - b.due`。本期只在**读取 `due` 的位置**引入访问器，不改 `todayPlan` 三态结构、不改 `planTarget` 写入、不改返回结构。

**分流伪代码（G3 在 `todayPlan` 内实现局部访问器 `dueOf`）**：

```
function dueOf(r, t):                       // 局部，不导出、不写库
  if (db.settings.strengthMode !== 'on') { return r.due; }   // OFF：短路，零额外开销
  return strengthDue(r, Array.isArray(r.evts) ? r.evts : [], { /* 默认 ladder/dayMs */ });
}

// 到期过滤（替换 core.js:269-271 的 r.due）：
backlog := records.filter(r => r.reps > 0 && dueOf(r,t) > 0 && dueOf(r,t) <= t && !r.graduated)
// 两处排序（:275 / :283）改按 dueOf：
backlog.sort((a,b) => dueOf(a,t) - dueOf(b,t))
```

**分流不变量（G8 逐条判定）**：

| 不变量 | OFF（缺省） | ON |
|---|---|---|
| 到期来源 | `dueOf === r.due`，**逐字段等价现状**（短路，不调用 `strengthDue`） | `dueOf === strengthDue(r, r.evts)` |
| `lvl` | 不变 | **不变**（`strengthDue` 只读） |
| `st` | 沿用 `lvl>=3 && interval>=7`（core.js:199） | **同左**，强度层不改 `st` |
| `evts` | 只读 / 仅采集 | 只读（不因到期计算被改写） |
| `planTarget` / `days[dk]` 写入 | 逐字段不变 | 逐字段不变 |
| 切回 OFF | — | 下次 `todayPlan` 用 `r.due`（固定阶梯值），逐字段回基线；`evts` 保留 |

- **ON→OFF 可回退（STR-AC06）**：切换动作本身不写库、不回滚评级；仅「下一次到期计算读谁」改变。`rec.due` 始终由 `rateWord` 三分支按固定阶梯写入，故 OFF 时立即回到基线。
- **阶段门禁**：阶段二（本节分流）须阶段一回执冻结且观测层数据经 G8 只读核验可用后开工（PRD §2.2）；G3 可分两次提交实现，但本契约一次性给出完整口径。

### 2.5 既有函数改签汇总（均为加法，保持既有签名形态）

| 函数 | 现状（【实测】） | 本期改签 | 兼容不变量 |
|---|---|---|---|
| `defaultSettings()` | core.js:48-67 | 加法键 `strengthMode:'off'` | `phase1.mjs:58` 六字段循环断言不破（非精确集合）；其余默认值零改动 |
| `newRecord()` | core.js:132-150 | 加法键 `evts:[]` | `phase1.mjs:68` 只断言 `graduated===false`，不破；原有 14 字段零改动 |
| `ensureSchema()` | core.js:444-488 | §1.3 步骤 A/B（补 `strengthMode`、补 `evts`，不改 `db.schema`） | 幂等、SCHEMA 恒 3、未知键保留；`phase1.mjs:73-84`/`:86-90` 全过 |
| `rateWord()` | core.js:176-230 | §2.3 追加事件写入 | 三分支逐字段零改动；签名仍 `(db,key,rating)`（D-038③） |
| `undoRate()` | core.js:233-242 | **不改代码**（§2.3 快照天然回滚） | 既有撤销语义零改动；D-038 OP-01 天然满足 |
| `todayPlan()` | core.js:256-305 | §2.4 局部 `dueOf` 访问器 | 三态结构 / `planTarget` / 返回结构零改动；OFF 逐字段等价 |
| `Core` 导出对象 | core.js:1509-1588 | 加法登记 `strengthOf` / `strengthDue` | 双暴露机制（core.js:1590-1591）零改动 |

---

## 3. AC ↔ 契约映射表（STR-AC01~08 全覆盖）

> 每条给出「PRD 判定 → 承接契约 → G8 自动判定钩子」。判定类型一律 A（Given→When→Then 可自动化）。

| AC | PRD 判定要点（PRD §3.2，编号原样） | 承接契约 | G8 自动判定钩子（Given→When→Then） |
|---|---|---|---|
| **STR-AC01**（OFF 默认） | `strengthMode` 缺省 `off`；同评级下 `lvl/due/wfix/st` 与固定阶梯逐字段一致；无显式设 `on` 的默认值 | F2（§1.1）+ `defaultSettings`/`ensureSchema`（§2.5）+ OFF 分流（§2.4） | Given `defaultDB()` 与无强度字段的旧备份；When 缺省评级；Then `settings.strengthMode==='off'` 且 `dueOf===r.due`、四字段与基线逐字段 `deepEqual` |
| **STR-AC02**（事件采集） | 成功评级新增一条 `{t,rating,interval,type}`；既有字段语义不变；`evts` 以外无新语义 | F1（§1.1）+ `rateWord` 写入（§2.3） | Given 已建档词；When `rateWord` 三值任一；Then `evts.length` +1、末元素四字段类型/取值符合 F1、`type===null`、`interval===rec.due - t`、其余字段与基线一致 |
| **STR-AC03**（幂等迁移） | 缺 `evts` 补 `[]`、`schema` 恒 3；两次调用逐字段一致；含事件不丢；旧备份导入成功 | §1.3 步骤 A/B/C + `importJSON`（§4.2） | Given 缺/含 `evts` 的 `schema=3` 库；When `ensureSchema` 一次与两次；Then `evts` 补齐且非空保留、`schema===3`、`JSON.stringify` 二次相等、`importJSON(...).ok===true` |
| **STR-AC04**（看板纯函数） | ①无事件回退 `lvl` 代理；②合法事件输出可解释值、无 NaN/Infinity；③异常跳过不抛错；均不写真源 | P1 `strengthOf`（§2.1 + §2.1.1） | Given 三类词；When `strengthOf(db,key)`；Then ①`basis==='lvl-proxy'` 且 score 与 `(3-lvl)` 反向可换算；②`basis==='events'`、`score∈0..6` 整数、`Number.isFinite`；③异常被跳过不抛错；三次调用前后 `JSON.stringify(db)` 相等 |
| **STR-AC05**（ON 接管） | ON 且强度 due ≠ LADDER 值时，到期采用强度 due；`lvl` 不变；`st` 口径可说明；OFF 仍走 LADDER | P2（§2.2）+ `dueOf` 分流（§2.4）+ §4.3 `st` 口径 | Given `strengthMode='on'` 且某词 score 映射的 gapDays ≠ `LADDER_DAYS[lvl]`；When `todayPlan`；Then 该词到期由 `strengthDue` 结果判定、`lvl` 前后相等、`st` 仍满足 `lvl>=3&&interval>=7`、OFF 组 `dueOf===r.due` |
| **STR-AC06**（可回退） | ON→OFF 后 due 回固定阶梯、`lvl/due/wfix/st` 逐字段回基线、`evts` 保留 | §2.4 回退不变量 + §2.3 撤销契约（D-038 OP-01） | Given ON 下已被强度决定 due 的词；When 切 OFF 后一次评级；Then 四字段与 OFF 基线 `deepEqual`、`evts` 仍存在且长度不减；另 Given 撤销场景 → `evts` 末条被删、历史事件保留 |
| **STR-AC07**（边界兜底） | ①ON 无事件 ②单事件 ③非法 rating ④超大 interval；均不抛错、无 NaN/Infinity/非法 due；单事件有限值 | P2 边界 1~5（§2.2）+ `validEvent`（§2.1.1） | Given 四类输入；When `strengthDue` 并经到期判定；Then 每次返回 `Number.isFinite(due)`、`due>0`、无异常抛出；①结果 `=== rec.last + LADDER_DAYS[lvl]*DAY_MS`；④超大 interval 结果 `=== anchor + 60*DAY_MS` |
| **STR-AC08**（向前兼容） | 新备份含非空 `evts`（`schema=3`）；旧版本代码 `importJSON` 成功、未知字段忽略、schema 不抬、行为一致 | `importJSON` 现状（§1.3【实测】、§4.2） | Given 含非空 `evts` 与 `strengthMode='on'` 的 `schema=3` JSON；When 旧版本代码 `importJSON`；Then `r.ok===true`、`r.db.schema===3`、`r.db.words[*].evts` 原样保留但旧版到期逻辑不读它、OFF 行为与无该字段时一致 |

> **映射完成度：8/8（STR-AC01~08 全覆盖，每条均落到具体字段 / 函数 / 分支与可自动判定钩子）**。

---

## 4. 红线与兼容

### 4.1 逐条红线确认（每阶段完工前 G3 自检、G8 复核）

| # | 红线 | 本契约处置 | 判定 |
|---|---|---|---|
| 1 | `LADDER_DAYS = [1,2,4,7,15,30,60]` 值不变 | 仅作为 `strengthDue` 的默认 `ladder` 与 OFF 基线被**读取**，不改写元素；常量本体零改动（core.js:14） | ✅ 守 |
| 2 | `rateWord` 三分支 OFF 逐字段等价 | §2.3 只在三分支**之后**加法写 `evts`；`lvl/due/wfix/st/wrong` 落库规则零改动；`dueOf` 在 OFF 短路为 `r.due` | ✅ 守 |
| 3 | `SCHEMA = 3` 恒 3 不抬 | §1.3 步骤 C：`db.schema` 绝不赋值、不加版本标记 | ✅ 守 |
| 4 | `w::` 主键体系不变 | 事件挂在既有 `db.words[key]` 下，`key` 仍由 `wordKey`（core.js:34）生成；**不拆卡、不改键**（拆卡属 #016） | ✅ 守 |
| 5 | 旧 161 项断言逐字不动、项数不减 | 【实测】`phase1.mjs:58` 存在性循环、`:68` 只断言 `graduated`、`:73-84` 幂等二次比较、`:86-90` 顶层键存在——加 `evts`/`strengthMode` 均不破；仓库无对整条 word 记录 / `settings` 精确集合的 deepEqual（§1.3、§4.1） | ✅ 守 |
| 6 | 新测试独立文件 | `tests/core.test.strength.mjs` **新增独立文件**；既有 7 文件一字不改（BOUNDARY、PRD §6.3） | ✅ 守 |
| 7 | `strengthMode` 缺省 OFF | F2 双保险：写侧 `defaultSettings` + 读侧 `ensureSchema` 归一 `'off'` | ✅ 守 |
| 8 | 固定阶梯为可回退基线（C4） | ON 只是叠加读取；OFF / 切回 OFF 立即回到 `LADDER_DAYS` 行为（§2.4） | ✅ 守 |
| 9 | 不引入 ML / 不展示伪精确百分比 | §2.1.1 为整数档 `0..6` + 三档 `level`，可逐事件复算 | ✅ 守 |
| 10 | 不扩大 `rateWord` 签名、不采集 `type`（D-038③） | 签名仍 `(db,key,rating)`；`type` 恒 `null`，公式不消费 | ✅ 守 |
| 11 | 不做独立 UI（D-038 OP-03） | app.js 不在写入集（§5.2）；仅纯函数 + 可选只读展示 | ✅ 守 |
| 12 | 不引入完整埋点体系 / 不新建 `db.sessions`（D-005） | `evts` 仅挂词条记录，无 sessions / 北极星字段 | ✅ 守 |

### 4.2 数据与迁移

| 场景 | 契约保证 |
|---|---|
| **旧备份导入（老库 → 新代码）** | `importJSON`（core.js:402-416）→ `migrateOldKeys` → 补顶层缺键 → `ensureSchema` 补 `strengthMode='off'` 与词条 `evts=[]`；不补发历史事件；`schema` 恒 3；行为与基线逐字段一致 |
| **新备份旧版本读取（向前兼容，STR-AC08）** | 新备份含 `evts` 非空、`strengthMode='on'`；旧版本 `importJSON` 仅校验 `data.schema` 真值，**不遍历未知字段** → 忽略 `evts`/`strengthMode`、不报错、不阻断、`schema` 仍 3；旧版到期逻辑不读这些字段，行为等价 |
| **导出 → 导入往返** | `exportJSON` 整库克隆天然带走 `evts`/`strengthMode`；`importJSON` → `ensureSchema` 对合法值原样保留、对缺失值补齐；未知键保留 |
| **undo 后 evts 一致性（D-038 OP-01）** | `snap.rec` 在评级前克隆（core.js:187）；`undoRate` 整体还原 → 本次事件删除、历史事件保留、`evts` 与生效评级一一对应；无需额外删除逻辑（§2.3） |
| **切 ON→OFF 的数据残留** | `evts` 保留不删（仅不再被 due 读取）；`strengthMode` 写 `'off'`；`lvl/due/wfix/st` 下次评级回基线（§2.4） |

### 4.3 `st` 口径声明（供 STR-AC05 断言）

- ON 时 **仅接管 `due`**；`st` 仍由 `rateWord` 的 know 分支 `st = (lvl>=3 && interval>=7) ? 'known' : 'learning'`（core.js:199）唯一决定，其中 `interval` 为固定阶梯天数（非强度 gapDays）。强度层**不写 `st`、不改其判定式**。

---

## 5. 待 G3/G4 分工与 Open

### 5.1 任务分解（3 个任务，每任务 ≥3 相关文件；BOUNDARY.md §7-DoD3）

| 任务 | 归属 | 相关文件（≥3） | 内容 | 依赖 |
|---|---|---|---|---|
| **T01** | G3 | `js/core.js`、`js/phrases.js`、`tests/core.test.strength.mjs` | ① 数据层：`defaultSettings` 加 `strengthMode:'off'`、`newRecord` 加 `evts:[]`、`ensureSchema` 加法步骤 A/B/C（SCHEMA=3、幂等）；② `Core` 导出面加法登记；③ 独立测试文件建骨架（F1/F2 兼容路径、STR-AC03） | 无（本契约冻结即开工） |
| **T02** | G3 | `js/core.js`、`tests/core.test.strength.mjs`、`docs/design-strength.md`（只读核对） | ① P1 `strengthOf` + P2 `strengthDue`（§2.1/§2.2 公式逐条一致）；② `rateWord` 追加事件写入（§2.3，签名不变）；③ `todayPlan` 局部 `dueOf` 分流（§2.4）；④ `undoRate` 不改，验证快照天然回滚；覆盖 STR-AC02/04/05/07 | T01（数据层与导出面就绪） |
| **T03** | G3 + G8 | `tests/core.test.strength.mjs`、`js/core.js`、`tests/`（既有 7 文件全量复跑，只读） | ① 新测试覆盖 STR-AC01~08 全表、尤其边界与向前兼容；② 既有 161 项逐字不动、项数不减；③ `check-data.mjs` 460 词、`qa_independent_verify.mjs` 34/0、`--check` 全过；④ G8 独立复核「旧 161 逐项一致 + 新文件全绿 + LADDER_DAYS/rateWord 三分支逐项一致」 | T01 + T02 冻结 |

- **阶段门禁**：T01 对应阶段一（观测层，零行为变更）；T02 中的 `dueOf` 分流属阶段二，须 T01 回执冻结且观测层数据经 G8 只读核验可用后开工（PRD §2.2）；本契约已给出两阶段完整口径，G3 可分两次提交落地。
- **验收钩子（T03）**：`strengthMode` 缺省 `'off'`；`strengthOf` 三类输入返回结构符合 §1.2 且不改 `db`；`strengthDue` 四边界无 `NaN`/`Infinity`；ON 时 `lvl` 前后相等且到期由 `strengthDue` 决定；切 OFF 后四字段回基线且 `evts` 保留；旧备份 `importJSON` 成功、schema 恒 3；新备份旧代码可读。

### 5.2 `app.js` 只读看板需求（D-038 OP-03）

- **本阶段不做独立 UI**：`js/app.js` **不在 #015 写入集**；本契约**不定义任何页面 / 路由 / 控件**。G3 只交付 `strengthOf` 纯函数 + Core 导出（可选只读展示由调用方按需取用，不在本卡内实现）。
- 若后续确需在统计页追加只读强度块，须**另开子卡并经 G0 单独授权**（D-038 OP-03），届时 G4 配合，且 `phrases.js` 文案键须由 G3 先落、G4 只引用。本卡不预置文案键、不预留 UI 钩子。

### 5.3 与 G1 PRD 的冲突核查与最小修订建议（不自行推翻）

| # | PRD 表述 | 与红线 / D-038 是否冲突 | 处置 / 最小修订建议 |
|---|---|---|---|
| 1 | §4.2「题型 `type` 来源由调用方在评级时提供，字段落点与传参方式由 G2 定」 | **不冲突**：PRD 已把决定权交给 G2，G0 D-038③ 已拍板「不扩大签名、阶段一记 `null`」 | 建议 G1 后续在该句补注「（已由 D-038 拍板：阶段一 `type=null`、不扩大 `rateWord` 签名；题型采集留待 #016）」；**编号与判定逻辑不变** |
| 2 | §2.1「事件建议含题型」/ §3.2 STR-AC02「含 `{t,rating,interval,type}`」 | **不冲突**：保留 `type` 字段位、阶段一记 `null`，字段结构仍满足 | 无需改判定；`type===null` 即为合法取值（§1.1-F1） |
| 3 | §2.2 / §5「可选只读视图；若需视图由 G0 另行授权」 | **不冲突**，与 D-038 OP-03「本阶段不做独立 UI」一致 | 按 D-038 执行；本卡不产 UI（§5.2） |
| 4 | §4.3「无事件回退 `lvl` 代理（`(3-lvl)` 口径）」 | **表述可对齐**：`(3-lvl)` 是「重建优先级」反相代理 | 本契约 §2.1 边界 2 已给出「`score=lvl` 与 `(3-lvl)` 同信息反向可换算」的精确口径；建议 G1 后续把「`(3-lvl)` 口径」补注为「`lvl` 越高强度越高，与 `(3-lvl)` 反相」，**不改 AC** |

> **结论：G1 PRD 与 D-037/D-038 及 C4/C1/SCHEMA/w:: 红线无实质冲突**；4 处均为措辞对齐，本文按已拍板口径执行并给出最小修订建议，**未自行推翻 PRD 任何 AC**。

### 5.4 需 G0 裁决的问题

- **阻塞裁决：0 项**。G1 PRD 的 3 个 Open（OP-01/OP-02/OP-03）中，OP-01 / OP-03 与 `type` 口径已由 **D-038** 拍板，OP-02（公式复杂度）由 PRD 指定「G1/G2 契约内定」且本契约 §2.1.1 已给出可解释启发式——均无需 G0 新增裁决。
- **备案项（不需裁决，仅登记）**：① 若 G8 在实现后发现某既有断言对整条 word 记录做精确 deepEqual（本轮核查未发现），按 D-025「以磁盘为准」回报 G0，不自行放宽；② 若后续要开只读看板子卡，按 D-038 OP-03 单独授权。

---

## 6. 交付登记

| 项 | 值 |
|---|---|
| 交付落点 | `word365/docs/design-strength.md`（#015 · G2 唯一写入文件） |
| 基线 | 2026-11-16 21:00 · A 仓库 · 161 项 / 7 文件 0 失败 · 460 词 · qa 34/0 |
| **字段契约数** | **2**（F1 `db.words[key].evts`、F2 `db.settings.strengthMode`）+ 函数返回结构契约 1（`strengthOf` 返回值，§1.2） |
| **新增纯函数数** | **2**（P1 `strengthOf`、P2 `strengthDue`）；另有既有函数加法改签 7 项（§2.5），`undoRate` 不改代码 |
| **任务数** | **3**（T01~T03），每任务 ≥3 相关文件，阶段一 / 阶段二门禁见 §5.1 |
| **AC 映射** | **8/8**（STR-AC01~08 全覆盖，§3） |
| **待拍板项** | 阻塞裁决 0 项（OP-01/OP-03/type 已由 D-038 拍板；OP-02 由 §2.1.1 定）；冲突 4 处为措辞对齐、建议见 §5.3 |
| **红线** | 12 条逐条确认守（§4.1）；SCHEMA 恒 3、`LADDER_DAYS` 不变、`w::` 不变、旧 161 断言不动、新测试独立、缺省 OFF |
| 写后复跑 | 本组纯文档产出、不改代码；写后全量复跑由 G8 独立复核（结果并入交付回执） |
| 下游交接 | G3 依 §5.1 T01~T03 落地；G8 依 §3 判定钩子 + §4.1 红线独立复核；#016 依赖观测层冻结后串行 |

> 本文**未改动**任何源码 / 测试 / README / 既有文档（含 `prd-strength.md`、`design-n4-n2.md`、`core.js`）或 `365-groups/**`；未替 G1 改 AC、未替 G3 写实现、未替 G8 写测试。G0 裁决以 `365-groups/DECISIONS.md` 台账为准，本组不写该文件。

---

## 版本记录

| 版本 | 日期 | 组 / 任务卡 | 变更摘要 | 状态 |
|---|---|---|---|---|
| v1.0 | 2026-11-16 | G2-architecture / #015（主笔 agent） | 首版：依 G1 `prd-strength.md` v1.0 与 D-037/D-038 产出叠加式记忆强度引擎契约——数据契约 2 字段（`db.words[key].evts`、`db.settings.strengthMode`）+ SCHEMA 恒 3 幂等加法与向前兼容；纯函数 2 个（`strengthOf` / `strengthDue`，含可解释可复算启发式）；事件写入点 + undo 快照天然回滚（D-038 OP-01）+ `todayPlan` 按 `strengthMode` 分流；STR-AC01~08 映射 8/8；12 条红线逐条确认；3 任务分解 + G0 裁决 0 项；基线 161/7 + 460 词 + qa 34/0。据 D-038 不做独立 UI（OP-03）、type 恒 null 不扩大签名。纯文档产出，不改任何既有文件 | 已交付（待 G3 实现、G8 独立复核） |

*本文为任务卡 #015 的增量设计契约 v1.0。凡未在 §1.3 / §4.1 标注【实测】的阈值 / 档位 / 分档线（如 score 0..6、level 4/2 阈值、事件打分权重）均为【规划】设计取值，非实测、非预测，待 G3 实现与 G8 回归验证。G0 后续裁决以 `365-groups/DECISIONS.md` 台账为准。*
