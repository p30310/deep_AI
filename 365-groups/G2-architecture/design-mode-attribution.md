# 练法归因（#028 · 设计态 · 实现待用户批准改 D-038③）— 函数契约（v1.0）

> 2026-11-18 · G2 · 基线：D-057（仅设计阶段）+ D-038③（红线原文）+ D-052（#026 契约先例）+ `cards/#028.md` + G0 门禁实测（`node verify.mjs` → **PASS：24 文件 / 298 项 / 0 失败 · 460 词 · QA 34/0**）。派工文字中的「283 项」为 #026 时点旧数，以磁盘实测 298 为准（D-025 以磁盘为准）。行号一律用**函数名锚点**：`core.js` `SCHEMA` / `newRecord` / `rateWord` / `undoRate` / `ensureSchema`；`app.js` `MODE_LABELS` / `buildSession` / `doRate` / `doRateTyped`。**本卡零源码改动**（`word365/` 零写入），本文件是 G2 唯一交付物；实现须用户明确批准修改 D-038③。

## 0. 三条最容易实现分歧的裁决（先读）

1. **归一在 `core.js` 内一处完成，非法一律写 `type:null`**（不是拒绝写入、不抛错）。`rateWord` 第 4 参非法（含 `undefined`）→ `null` → 三参调用逐字段等价；不在 `app.js` 做 try/catch，也不因非法值跳过 `evts.push`（跳过会丢作答历史）。
2. **取值表达式写死为 `s.listen === 1 ? 'listen' : s.ctx === 1 ? 'ctx' : s.mode`（G0 终裁，与 G1 PRD 一致）**：`s.listen`/`s.ctx` 均为数字 `1/0`（`app.js:1148` / `1152`），不是 mode 字符串；listen 与 ctx 会话的 `s.mode` 都是 `'type'`，故必须优先读标志位，否则二者塌缩进 `type`。优先级 listen > ctx > s.mode，与 `app.js:1152`（listen 优先、互斥）及 D-052⑤ 一致；**listen 与 ctx 互斥由 `app.js:1152` 保证，故优先序不影响结果**。**不新增会话字段、不改 URL 解析、不改 `buildSession`**。
3. **合法集合＝六种具体练法标签**（`flash/type/choice/match/listen/ctx`），不做「认/产出」二类粗分；G1 PRD 的归因叙事维度不替代落库取值。若 G1 PRD 给出不同枚举，以 G0 汇总裁为准，只需改 `MODE_LABELS_ATTRIB` 一处常量。

## 1. 精确签名与参数归一（写死）

`Core.rateWord(db, key, rating, mode) -> Object|null` —— 可选第 4 参 `mode`；前三参语义、返回快照 `{key,rec,absent,dayKey,day}` **零改动**。

- **合法集合**：`MODE_LABELS_ATTRIB = ['flash','type','choice','match','listen','ctx']`（源自 D-057 立项 + `DOMAIN.md` §5 六种练法；`listen`/`ctx` 由会话标志派生，见 §3，故六值均会实际落值）。
- **归一函数**（`core.js` 模块级私有纯函数，仅依赖入参，不读 `db` / `now()` / 会话态）：`typeof mode === 'string' && MODE_LABELS_ATTRIB.indexOf(mode) >= 0 ? mode : null`。用 `indexOf`（非真值查表）避免原型链误命中。三参调用 `mode === undefined` 归一为 `null`，与 `arguments.length === 3` 区分**等价**，无需显式判 `arguments.length`（G0 探针已验证可选参语义）。
- **归一结果**写进 `evts[*].type`；其余字段 `{t, rating, interval}` **零改动**（`interval` 仍为 `rec.due - t`）。
- **不抛错、不拒绝写入**：任何非法值都归 `null`（语义＝"当时未采集/未知"，与 #015 既有占位一致），事件照常 push。三分支（know/fuzzy/unknown）对 `lvl/due/st/wfix/wrong` 的落库规则**零改动**；`newRecord` 的 `evts:[]`、`ensureSchema` 的分支、`SCHEMA=3` 一律零改动。

## 2. 向后兼容证明路径（写死）

- 三参调用 `rateWord(db,key,rating)` → `mode === undefined` → 归一 `null` → `evts.push({t,rating,interval,type:null})` 与现状**逐字段全等**。
- 既有 `tests/ui.test.ctx-mode.mjs:279`（`assert.equal(rec.evts[0].type, null)`）**零改动通过**；grep 证据：全仓**唯一**直接断言 `evts[*].type === null` 处即此行，其余 `type:null` 均为 fixture 构造字面量（`core.test.strength` / `retention.test` / `ui.test.listen-mode` / `strength-*` 等），不受写入值影响。
- 既有 **24 文件 / 298 项断言零改动全绿**（派工文字「283」为 #026 时点旧数，以磁盘实测为准）；门禁命令 `node verify.mjs` → PASS。
- **逐字节证明**：三参调用前后 `JSON.stringify(db)` 先归零 13 位时间戳后逐字节全等；`evts` 元素**恰 4 键** `{t,rating,interval,type}` 且 `type === null`；`Object.keys(db)` 顶层键集不变、`db.schema === 3`、`db.exam` 零触碰。
- **证据等级**：G0 的可选参探针（`arguments.length` / 四参落值）只证明语义可行，**不得当作零回归实测**；真实零回归须在实现落盘后跑全量 298 项（D-023 以实测为准）。

## 3. ctx / listen 子模式取值（写死 · 零新字段）

- **事实锚点**：`app.js` `buildSession` 已落盘 `ctx: (params.ctx && !params.listen) ? 1 : 0` 与 `listen: params.listen ? 1 : 0`（listen 优先、互斥，会话内存态不落库）；tab 定义 `{m:'type',listen:1}` / `{m:'type',ctx:1}` → 两种子模式的 `s.mode` 恒为 `'type'`。
- **零新字段**：不新增 `state.session.*`、不改 URL 解析、不改 `buildSession`；`s.ctx` / `s.listen` 均已存在，契约只读取它们，故**不触碰任何红线**。
- **派生表达式（G0 终裁，写死）**：`attributionMode(s) = !s ? null : s.listen === 1 ? 'listen' : s.ctx === 1 ? 'ctx' : s.mode`（`s.listen`/`s.ctx` 均为数字 `1/0`，用严格 `=== 1` 判定；优先级 listen > ctx > s.mode；**listen 与 ctx 互斥由 `app.js:1152` 保证，故优先序不影响结果**；无会话防御性归 `null`）。
- **唯一两处传参**（全仓仅此 2 处调用 `rateWord`）：`doRate` → `Core.rateWord(db, key, rating, attributionMode(s))`；`doRateTyped` → `Core.rateWord(db, Core.wordKey(e.w), rating, attributionMode(s))`。core 内再做 §1 归一，脏 `s.mode` 自动收敛到 `null`。
- **边界**：`s.listen === 1` → `'listen'`（不看 `s.mode`/`s.ctx`）；`s.listen === 0 && s.ctx === 1` → `'ctx'`；两者皆 0 → `s.mode` 原值（`flash`/`choice`/`match`/`type`）；listen 与 ctx 同为 1（脏会话）→ `'listen'`（优先级；正常路径由 `app.js:1152` 保证互斥）；无会话 / `s` 非对象 → `null`。

## 4. undo 链不变式（写死）

- 四参写法下 `undoRate` **零改动**：`snap.rec = clone(rec)` 仍在 `rateWord` 三分支与 `evts.push` **之前**（`core.js` `rateWord` 首段），快照含 push 前的 `rec.evts`；撤销时 `db.words[snap.key] = snap.rec` 整体还原 → 本次新增事件随之删除。
- **传参不影响快照逻辑**：`mode` 的归一与写入只出现在 `evts.push` 的参数表达式中，不改变 `clone` 时点、不新增写操作、不改 `snap` 结构；故三参 / 四参的 undo 行为**逐字节相同**。
- 验收：四参调用 → `undoRate(db,snap)` → 该词 `evts.length` 回到调用前、本次事件 `type` 一并消失；`db.days` 快照回滚不变。

## 5. 边界清单（逐条给行为 · 一律不抛错）

| `mode` 情形 | 行为 |
|---|---|
| 合法六值之一 | 原样写入 `evts[*].type` |
| `undefined`（三参）/ `null` / 空串 `''` | 归一 `null`（三参逐字段兼容） |
| 数字（`NaN` / `0` / `1` 等）、布尔 | 归一 `null` |
| 数组 `[]`、`{}`、函数、任意对象 | 归一 `null` |
| 未知字符串（`'bogus'`、`'TYPE'` 大小写不符等） | 归一 `null` |
| `rating` 非法（`!== 'know'/'fuzzy'/'unknown'`） | 沿用既有逻辑（落入 unknown 分支），不改；`type` 仍按 `mode` 归一写入 |
| `key` 不存在 | 沿用既有 `newRecord` 自动建档，事件按归一值写入 |
| `db` 为空 / `db.words` 缺失 | `db` 合法是既有调用契约（现状 `db=null` 本就抛错，非本卡回归）；本卡**不新增兜底、不改前置条件**，且**绝不因 `mode` 非法而抛错** —— `mode` 归一路径在任何 db 状态下均无异常分支 |

> 禁止抛错、禁止 `console.error`、禁止因非法 `mode` 跳过事件写入——任何分支都必须产生一条完整 `{t,rating,interval,type}` 事件。

## 6. 红线核对清单（7 项 · 交 G10）

1. **`SCHEMA` 恒 3**：`ensureSchema` 零新增分支 / 字段，旧备份可导入。
2. **零新 db 键**：顶层键集与词条字段集均不变，只改 `evts[*].type` 的**取值**。
3. **三参逐字节兼容**：三参调用前后 `JSON.stringify(db)`（时间戳归零后）全等，`evts[0].type === null`。
4. **undo 链零改动**：`snap` 结构、`clone` 时点、`undoRate` 函数体一字不动，四参下事件随撤销回滚。
5. **`db.exam` 零触碰**：不读不写，抽测写面与语义独立。
6. **无 per-mode 输出**：本卡不暴露练法对比 / 排名，不新增统计卡与可视化；`retentionStats` 等纯函数结果不变（它们只读 `evts` 的 `t`/`rating`，不读 `type`）。
7. **本卡零源码改动**：`word365/` 零写入；实现须用户先批准修改 D-038③，批准前停在实现门口。

## 7. 测试要求（新文件仅规划，本卡不落盘）

`tests/mode-attribution.test.mjs`（独立新文件，不修改任何既有测试；批准实现后落盘）：

1. **三参 / 四参对照**：三参 → `type === null` 且 `evts` 逐字段与现状一致；四参六值 → `type` 逐值相等。
2. **子模式派生**：`attributionMode({mode:'type',listen:1,ctx:0}) === 'listen'`、`{mode:'type',ctx:1,listen:0} === 'ctx'`、`{mode:'flash',ctx:0,listen:0} === 'flash'`、`{mode:'type'}`（两标志皆缺）→ `'type'`、listen 与 ctx 同为 1 → `'listen'`（优先级）、无会话 → `null`；两处调用点分别传派生值。
3. **边界归一**：§5 全表逐行断言归一结果，合法集合之外的值不泄漏为 `type`，零抛错。
4. **undo 回滚**：四参 → `undoRate` 后 `evts.length` 复原、该事件 `type` 一并消失。
5. **与 `retentionStats` 共存**：四参写入 `type:'ctx'` 的 db 上调用 `retentionStats` / `strengthOf`，结果与 `type:null` 的同构 db **深度相等**（证明纯函数不读 `type`）。
6. **零写库约束（写入面）**：除 `evts[*].type` 与既有写路径外，顶层键集、`SCHEMA`、`byType`、`exam` 前后不变；新测试不得为通过而改既有断言。

## 8. 时序约束（写死）

- **批准前**：本卡交付物仅本设计文档 + 卡片；`word365/` 零改动，G0 探针只验证不改盘。
- **批准后**：按 `HANDOFF.md` §4 模板走 M5 实现 + G10 独立复核（`reviews/R-028.md`，自建探针、不 import 仓库测试）；先把 D-038③ 红线改为「`type` 可写合法归因标签，缺省 `null`」，再动源码。
- **门禁**：`node verify.mjs` 仍 PASS（298 项 + 新测试独立文件项数）；若基线变化，同步 `verify.mjs` 的 `EXPECT` 并在卡片记录。

> 行号均为函数名锚点，以冻结时磁盘为准。本文写死一切歧义点；与 G1 PRD 的枚举差异由 G0 汇总裁，仅改 `MODE_LABELS_ATTRIB` 一处常量。
