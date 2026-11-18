# 背单词365 · 义项提示增强 · 增量设计契约（任务卡 #016）

> **文档性质**：增量设计契约（Design Contract）——只定义「字段 / 函数签名 / 返回结构 / 纯度 / 切分规则 / 种子推导 / 兼容路径 / 红线 / 任务分解」，**不含可复制的函数体源码、不替 G3 写实现、不替 G8 写测试**。
> **执行组**：G2 · 架构与任务分解（#016 主笔 agent）
> **文档版本 v1.0 · 2026-11-16**
> **基线 2026-11-16 21:00 实测 A 161/7 + 460 词 + qa 34/0**（A 仓库 `E:/WorkBudy_WorkSpace/word365/`；7 文件 161 项 0 失败、`check-data.mjs` 460 词 / 5 本 / 跨书零重复、`qa_independent_verify.mjs` 34/0）
> **依据 D-037 / C1 / C10 + PRD `docs/prd-senses.md` v1.0**（立项与红线；D-xxx 只引用编号、不复述正文，真源 `365-groups/DECISIONS.md`；#016 串行于 #015 观测层冻结，依 D-038）
> **上游**：`docs/prd-senses.md` v1.0（G1 已定稿，8 条 `SEN-AC01~08`、In/Out Scope、OQ-01~03）→ 任务卡 `#016.md` → `365-groups/G2-architecture/BOUNDARY.md`
> **下游**：G3（`core.js` / `phrases.js` / `tests/senses.test.mjs`）+ G4（`app.js`）→ G8（独立复核）
> **交付落点**：本文件 `word365/docs/design-senses.md`（G2 可写域 `docs/design-*.md`，本任务**唯一写入文件**）

---

## 0. 文档头（基线 / 来源层级 / 边界声明）

### 0.1 基线截止时点

| 项 | 值 |
|---|---|
| 目标仓库 | **A 仓库** `E:/WorkBudy_WorkSpace/word365/`（纯静态 Web 版）；B 仓库不在本卡范围 |
| 基线截止时点 | **2026-11-16 21:00** |
| A 仓库全量 | **161 项 / 7 文件 / 0 失败** |
| A 仓库数据 | `check-data.mjs` → **460 词 / 5 本 / 跨书零重复通过**（多义词约 162/35%，只读实测） |
| 门禁外脚本 | `qa_independent_verify.mjs` → **34/0** |
| `SCHEMA` | **3**（红线，不抬） |

> 本文为**纯文档产出**，不改动任何源码 / 测试 / README / 既有文档，不构成基线漂移；写后全量复跑由 G8 独立复核执行。

### 0.2 事实来源层级口径（沿用 PRD §0.2 三层，不新增）

| 标记 | 含义 | 本文落点 |
|---|---|---|
| **【实测】** | 对 A 仓库源码 / 词库只读核实、可逐行复现 | §0.1 基线数字、§1.1 现状锚点、§4.1 红线核查、§2 引用的现有行号 |
| **【规划】** | 本期要落地的函数 / 切分规则 / 种子 / 判定 / 兼容方案 / 任务分解 | §1、§2、§3、§5 |
| **【推断】** | 由实测推出的判断、尚未落地验证 | §5.3 冲突影响判断 |

> 凡未在 §1.1 / §4.1 标注【实测】的切分细节 / 兜底值 / 种子串格式均为【规划】设计取值，非实测、非预测，待 G3 实现与 G8 回归验证。

### 0.3 边界声明

1. **不写码 / 不改既有文件**：本组不写任何 `.js` / `.css` / `.html` / `.mjs`，不写 `tests/**`、各仓库 `README.md`、`docs/prd-*.md`、`docs/design-strength.md`、`docs/design-n4-n2.md`、`365-groups/**`；本任务唯一写入文件为本文件（BOUNDARY.md §5/§6）。
2. **不替 G1 改 AC**：`SEN-AC01~08` 编号、判定逻辑、Given/When/Then **零改动、零重造、零续号**；本文只把 AC 翻译成可判定契约，可提「需 G0 裁决 / 备案」，不自行改需求（BOUNDARY.md §6-4）。
3. **不替 G3/G8 写实现**：本文给签名 / 入参出参 / 切分伪规则 / 不变式；规则伪代码仅用于精确表达契约语义，**不是可复制的最终源码**，具体编码、变量名、内部工具函数归 G3。
4. **双仓库口径**：所有结论仅针对 A 仓库并带路径；B 仓库不在范围。

### 0.4 AC 编号锁定（8 条，零改动零重造）

| 号段 | 条数 | 出处 | 本文处置 |
|---|---|---|---|
| `SEN-AC01` ~ `SEN-AC08` | 8 | PRD §3.2 | 逐条映射到 §3「AC ↔ 契约映射表」，编号原样引用 |
| `STR-AC*` / `N4W-AC*` / `N2L-AC*` / `C-AC*` / `I-AC*` / `J-AC*` / `N1/N2/N4/N7/P0/M/S1-AC*` 等 | — | 既有文档 | **只读引用**，不复用、不覆盖、不续号 |

---

## 1. 数据契约：字段（不新增持久化字段）

### 1.1 字段总表

> **本卡不新增任何持久化字段、不新增任何 db 键、不改 `SCHEMA`（恒 3）。** 义项从 `t` 字符串实时派生；抽考选中义项仅存会话内存（`app.js` 的 session / examFlow 对象），不写 `db.words` / `db.exam` / `db.settings`。

| 编号 | 名称 | 类型 | 落点 | 性质 | 说明 |
|---|---|---|---|---|---|
| — | `t` | `string` | `db.words[key].t`（现有词条字段，`js/data/*.js` 同源） | **只读派生源** | 义项的唯一数据来源；本卡**只读不改**，解析不写回 |
| — | 义项数组 | `Array<{text:string, pos?:string}>` | **函数返回值 / 会话内存**（非 db 字段） | 运行时派生 | `sensesOf(entry)` 每次实时计算；不缓存、不持久化 |
| — | 选中义项索引 | `integer` | **会话内存**（`app.js` session / examFlow 临时字段） | 运行时状态 | `pickSense` 产出；随会话销毁，不写库 |

### 1.2 现状锚点（【实测】）

- 词条 `t` 为单一释义字符串：`account:'n. 账户；描述'`、`act:'v. 行动；表演 n. 行为'`、`admit:'v. 承认；准许进入'`、`advance:'v./n. 前进，进步'`（`js/data/cet4.js`）。
- 词性标签实测分布：`n.` `v.` `a.` `ad.` `prep.` `conj.`（另有 `adj.` 兼容需求，PRD 提及）；斜杠词性形如 `v./n.` `n./v.` `a./ad.`；释义内以全角 `，` 连接、义项间以全角 `；` 连接。
- 主键 `wordKey` = `'w::'+norm(w)`（core.js:34）；抽测会话 `startExam`（core.js:1325-1346）以 `dayKey(at)` charCode 哈希 + xorshift 洗牌取词 key，**不用 `Math.random`**；判定 `gradeExam`（core.js:1356-1376）按 `norm(answer)===norm(w)`；落库 `commitExam`（core.js:1386-1398）**只写 `db.exam`、不碰 words/days/settings**。
- 卡片展示点：def-line `app.js:1006`、默写题面 `app.js:1178`、抽测提示 `app.js:1716`（均为整串 `e.t`）；评级 key 生成 `app.js:1061-1064`。
- `SCHEMA = 3`（core.js:11）；`LADDER_DAYS = [1,2,4,7,15,30,60]`（core.js:14）。

### 1.3 兼容路径（无迁移）

| 场景 | 契约保证 |
|---|---|
| 老库 / 旧备份导入 | 无新字段 → `importJSON` 现状不变；`schema` 恒 3；旧行为逐字段等价 |
| 新备份旧版本读取（向前兼容，SEN-AC08） | 本卡不写任何新字段 → 备份结构与旧版同构，旧代码可读、无需迁移 |
| 自制词书导入 | 导入格式不变；`t` 仍为字符串；`sensesOf` 对任意 `t` 不抛错 |
| 导出 / 导入往返 | 整库克隆天然一致；无义项级状态可丢 |

---

## 2. 函数契约（签名 + 纯度 + 规则，供 G3 实现）

### 2.0 暴露与纯度约束（适用于本节全部新增函数）

- **新增 3 个纯函数** `sensesOf` / `pickSense` / `gradeSense`：无 DOM 依赖、不读写 `window/document/localStorage`、**不修改任何入参**、`entry` / `senses` / `db` 调用前后逐字段一致（`JSON.stringify` 相等）、同输入恒同输出（无隐式 `Date.now()`）。
- **暴露面**：3 个函数加入 `Core` 导出对象（core.js:1509-1588）并经 `window.Core` + `module.exports`（core.js:1590-1591）**双暴露**，不改暴露机制。
- **确定性**：`pickSense` 的种子由调用方显式传入（字符串或有限数），函数内部**不读 `now()`**；无 `Math.random`（与 startExam 策略一致）。
- **不改既有函数**：`rateWord` / `gradeExam` / `commitExam` / `startExam` / `wordKey` / `ensureSchema` 签名与既有语义零改动；本卡只在**调用点**按义项增强（G4）。

### 2.1 纯函数 P1 · `sensesOf(entry)` —— 义项解析

- **签名**：`sensesOf(entry: Object) -> Array<{text:string, pos?:string}>`
- **入参**：词条对象（读 `entry.t`；不写）。
- **出参**：有序义项数组；元素 `text` 为去掉前导词性标签并 trim 后的释义文本，`pos` 为词性标签字符串（无词性则省略该键）。
- **标注**：**纯** · core.js · 无 DOM · 双暴露 · **不写真源**。
- **切分规则（确定、可复算；伪规则仅表达契约语义，G3 可自行组织代码，但判定结果须逐条一致）**：

  1. **取源兜底**：`t` 非字符串 / 空串 / 全空白 → 返回 `[{text:''}]`（长度 1 的兜底单元素），不抛错（SEN-AC07）。
  2. **词性标签识别**：词性标签为形如 `n. v. a. ad. adj. prep. conj.`（及 `vi. vt. pron. num. art. int.` 等）后跟句点的 token；斜杠词性 `v./n.`、`n./v.`、`a./ad.` 视为**一个组合标签**（不拆义项）。
  3. **一级分隔：全角分号 `；` 优先**（兼容半角 `;` 兜底）。先按 `；` 切成若干段，逐段 trim、丢弃空段。
  4. **二级：词性标签归属**：段首词性标签作为该段 `pos` 并剥离出 `text`；段中/段尾再次出现的词性标签（如 `表演 n. 行为`）触发**新义项**——其前文本为上一 `pos` 下的一个义项，其后文本以新 `pos` 起一个义项；后续无标签的段沿用最近一次 `pos`。
  5. **三级：斜杠 `/` 降级**：仅当整串 `t` **未出现** `；` 且无词性标签时，才把 `/` 当作义项分隔符（降级策略）；释义内部 `，` 始终**不切义项**（如 `能力，才能` 为 1 项）。
  6. **保序**：输出顺序与 `t` 原文顺序一致（OQ-01）；不按词性 / 字数重排。
  7. **纯性**：不修改 `entry`；无 `NaN`；超长 `t` 有确定性上限行为（不抛错、输出有限项）。

- **判定用例表（G8 据此写精确断言；input → output 逐条对应 PRD SEN-AC01）**：

| `entry.t` | `sensesOf` 期望输出 |
|---|---|
| `n. 能力，才能` | `[{text:'能力，才能', pos:'n.'}]` |
| `n. 账户；描述` | `[{text:'账户', pos:'n.'}, {text:'描述', pos:'n.'}]` |
| `v. 行动；表演 n. 行为` | `[{text:'行动', pos:'v.'}, {text:'表演', pos:'v.'}, {text:'行为', pos:'n.'}]` |
| `v. 承认；准许进入` | `[{text:'承认', pos:'v.'}, {text:'准许进入', pos:'v.'}]` |
| `v./n. 前进，进步` | `[{text:'前进，进步', pos:'v./n.'}]` |
| `''` / `null` / `123` | `[{text:''}]`（兜底，无 pos） |

> 说明：`adj.` 与 `a.` 视为同类形容词标签，按原文保留其字面串作为 `pos`；降级 `/` 切分仅在无 `；` 且无词性标签时触发，避免误伤 `v./n.` 组合标签。

### 2.2 纯函数 P2 · `pickSense(senses, seed)` —— 抽义项（可复现）

- **签名**：`pickSense(senses: Array<{text,pos?}>, seed: string|number) -> integer`
- **入参**：
  - `senses`：`sensesOf(entry)` 的输出（由调用方先解析）。
  - `seed`：**字符串或有限数**；推荐传 `dateKey + wordKey` 字符串（OQ-02，见 §2.4）。字符串按 startExam 同款 charCode 哈希归一化。
- **出参**：`[0, senses.length-1]` 内整数索引。
- **标注**：**纯** · core.js · 无 DOM · 双暴露 · **确定性、无 `Math.random`**。
- **计算契约**：

```
if (!Array.isArray(senses) || senses.length === 0): return 0      // 兜底（SEN-AC07）
s0 := (typeof seed === 'string') ? hashCharCodes(seed) : (isFinite(seed) ? seed : 1)
s  := (s0 >>> 0) || 1
rnd(): xorshift32(s) -> [0,1)                                     // 与 startExam core.js:1336-1339 同款
idx := Math.floor(rnd() * senses.length)
return clamp(idx, 0, senses.length - 1)

hashCharCodes(str): h = 0; for each ch: h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h
                                                                   // 同 startExam core.js:1334 的 dk 哈希
```

- **边界与不变量**：
  1. 同 `senses` + 同 `seed` → 同索引（SEN-AC03 可复现）；不同 seed → 在选定多义用例上可得到不同索引。
  2. `senses` 空 / 非数组 → 返回 0，不抛错（SEN-AC07）。
  3. 返回值恒为合法索引；`senses` 数组不被修改。
  4. 种子不含隐式时间；日期 / 词由调用方显式拼入 seed 串。

### 2.3 纯函数 P3 · `gradeSense(entry, senseIdx, answer)` —— 按义项判定

- **签名**：`gradeSense(entry: Object, senseIdx: integer, answer: string) -> {ok:boolean, senseIdx:integer, senseText:string, expected:string}`
- **入参**：`entry` 词条对象（读 `w` 与 `t`）；`senseIdx` 选中义项索引；`answer` 用户答案串。
- **出参**：判定对象（新对象，调用方修改不影响真源）。
- **标注**：**纯** · core.js · 无 DOM · 双暴露 · **不写 db**。
- **计算契约**：

```
senses   := sensesOf(entry)
idx      := clamp(isFinite(senseIdx) ? floor(senseIdx) : 0, 0, senses.length - 1)
sense    := senses[idx] || {text:''}
expected := norm(entry.w)                       // 维持既有「写英文词」答题方向（见 §5.4 备案）
ok       := !!answer && norm(answer) === expected && norm(entry.w) !== ''
return { ok, senseIdx: idx, senseText: sense.text, expected }
```

- **边界与不变量**：
  1. `senseIdx` 越界 → 钳到合法范围；`entry` 非法 / 无 `w` → `expected:''`、`ok:false`，不抛错（SEN-AC07）。
  2. `answer` 空 / 非串 / 不匹配 → `ok:false`；判定用 `norm()` 忽略大小写与首尾空白（与 gradeExam core.js:1364 同款）。
  3. 结果**绑定所选义项**：`senseIdx` / `senseText` 随结果返回，供展示与追溯；但**不改变按词的真源**——`gradeExam` / `commitExam` 仍按 `w` 判定与落库（SEN-AC04/05/06）。
  4. 不写 `db.words` / `db.exam` / `lvl/due/st/star`；无义项级进度（SEN-AC06）。

### 2.4 种子串格式与复现（OQ-02 默认）

- **推荐 seed 串**：`dateKey(at) + wordKey(entry.w)`（如 `2026-11-16w::account`）；`dateKey` 取 `app.js` 当前日键，`wordKey` 用 core.js:34。
- 与 startExam 的关系：**复用其 charCode 哈希 + xorshift 策略与「反刷题」意图**，但按**每词**派生 seed（startExam 仅按日期洗牌词表），以满足 `SEN-AC03`「同词同种子复现、换种子可变」。
- 选中义项只存会话内存：G4 在 `buildSession`（app.js:849-871）/ `examFlow`（app.js:1618）内临时持有 `senseIdx`，不写任何 db 字段。

### 2.5 既有函数改签汇总（均为调用点改签，既有函数本体零改）

| 函数 / 位置 | 现状（【实测】） | 本期 G4 改签（调用点） | 兼容不变量 |
|---|---|---|---|
| `renderFlash` def-line（app.js:1006） | 整串 `esc(e.t)` | 用 `sensesOf(entry)` 渲染义项列表 | `.phonetic` / `.ex-line` / `.speaker` 保留、不破坏 |
| `renderType` 题面（app.js:1178） | 整串 `esc(e.t)` | 按 `pickSense` 选中义项的 `text` 作提示 | 答题形态（写英文词）不变；判定用 `gradeSense` |
| 抽测提示 `openExam` / `examRow`（app.js:1716/1669） | `meaning = e.t` | 按选中义项 `text` 作提示 | `gradeExam` / `commitExam` 本体零改，仍按词判 / 落库 |
| `Core` 导出对象 | core.js:1509-1588 | 加法登记 P1/P2/P3 | 双暴露机制零改 |
| `wordKey` / `startExam` / `gradeExam` / `commitExam` / `rateWord` / `ensureSchema` | 现状各锚点 | **不改代码** | 161 项既有断言逐字不动 |

---

## 3. AC ↔ 契约映射表（SEN-AC01~08 全覆盖）

> 每条给出「PRD 判定 → 承接契约 → G8 自动判定钩子」。判定类型一律 A（Given→When→Then 可自动化）。

| AC | PRD 判定要点（PRD §3.2，编号原样） | 承接契约 | G8 自动判定钩子（Given→When→Then） |
|---|---|---|---|
| **SEN-AC01**（义项解析） | 单义 / 全角分号 / 多词性 / 斜杠 → 有序数组；异常兜底、不改原词条 | P1 `sensesOf`（§2.1 + 用例表） | Given PRD §3.2 四类 `t`；When `sensesOf(entry)`；Then 输出与 §2.1 用例表逐项 `deepEqual`、`JSON.stringify(entry)` 前后相等、无抛错 |
| **SEN-AC02**（卡片展示） | 全部义项可读列表；音标 / 例句 / 发音不破坏 | §2.5 `renderFlash` 改签 + phrases 文案键 | Given ≥2 义项条目；When 渲染学习 / 复习卡；Then DOM 含每个义项文本且 `.phonetic`/`.ex-line`/`.speaker` 仍在、无异常 |
| **SEN-AC03**（可复现） | 同词同种子同索引、换种子可变、无 `Math.random` | P2 `pickSense`（§2.2）+ 种子串（§2.4） | Given `senses` 与 seedA/seedB；When `pickSense` ×2(seedA)、×1(seedB)；Then 两次 seedA 索引相等、seedB 用例上不同、索引合法、源码无 `Math.random` |
| **SEN-AC04**（抽测按义项判定） | 选中义项提示、正确词算对；结果绑定义项；gradeExam/commitExam 不变 | P3 `gradeSense`（§2.3）+ §2.5 抽测改签 | Given ≥2 义词 + idx + 对/错答案；When 抽测提交；Then `gradeSense` 返回 ok 与 senseIdx/senseText/expected 符合 §2.3、`gradeExam` 全词判定与 `commitExam` 仅写 db.exam 不变 |
| **SEN-AC05**（默写按义项判定） | 题面为所选义项；按义项判定；无义项级进度、错词本按词 | P3 + §2.5 `renderType` 改签 | Given type 模式 ≥2 义词 + idx；When 渲染并提交对/错词；Then 题面 = 所选 sense.text、`gradeSense.ok` 正确、`lvl/due` 无义项级键、错词 / 星标按词 |
| **SEN-AC06**（SRS 不受影响） | 抽义项考不改 lvl/due/st、C10 维持、错词本按词 | §2.3 边界 4 + §2.5 零改既有函数 | Given 已建档词 + db.exam 快照；When 抽义项考（对+错）；Then 六字段逐字段一致、无义项级 db 键、C10 维持 |
| **SEN-AC07**（边界兜底） | 空/异常 t、越界 idx、空答不崩有兜底 | P1 规则 1/7 + P2 边界 2 + P3 边界 1/2 | Given 四类边界输入；When 三函数调用 + 渲染；Then 无抛错 / 无 NaN、返回兜底值、卡片显 phrases 兜底文案 |
| **SEN-AC08**（数据兼容） | 词库只读、导入格式不变、旧备份向前兼容、460 词过 | §1.3 兼容路径 + §2.0 无持久化字段 | Given 460 词库 + 自制词书 + schema=3 旧备份；When 全量解析 + 旧代码导入 + check-data；Then 词库零改、无新字段、import 成功、schema 恒 3、check-data 460 词通过 |

> **映射完成度：8/8（SEN-AC01~08 全覆盖，每条均落到具体函数 / 规则 / 调用点与可自动判定钩子）**。

---

## 4. 红线与兼容

### 4.1 红线逐条确认（抄 #016 卡 6 条，逐条对应）

| # | #016 卡红线原文 | 本契约处置 | 判定 |
|---|---|---|---|
| 1 | `w::` 主键、`db.words` 粒度、C1 一词一态未变 | 义项从现有 `t` 派生，不新增主键 / 卡片 / 记录；`wordKey`（core.js:34）零改；一词一记录、一词一态 | ✅ 守 |
| 2 | 固定阶梯 `LADDER_DAYS` 与 `rateWord` 三分支未变 | 本卡只加解析 / 抽取 / 判定纯函数与调用点，不碰阶梯常量与 `rateWord`（core.js:14/三分支） | ✅ 守 |
| 3 | `lvl/due/st` 判定语义未变、C10 抽测不改写状态维持 | `gradeSense` 不写真源；`gradeExam`/`commitExam` 本体零改、仍按词；抽义项无义项级 lvl/due；`lvl/due/st/star` 前后逐字段一致 | ✅ 守 |
| 4 | SCHEMA 恒 3、词库 `js/data/*` 未改 | 不新增任何持久化字段、`db.schema` 不赋值；词库只读，`t` 仅被读取解析 | ✅ 守 |
| 5 | 旧 161 项断言逐字未动、新测试独立文件 | 既有函数 / 签名零改 → 161 项不受影响；新测试 `tests/senses.test.mjs` **新增独立文件**，既有 7 文件一字不改 | ✅ 守 |
| 6 | 义项抽考可复现、按义项判定、不产生义项级进度 | P2 日期+词种子 + xorshift 复现（无 `Math.random`）；P3 按义项判定且绑定义项；无义项级进度写入 | ✅ 守 |

> 另确认（立项级）：**不碰 #015 强度字段语义**（`evts`/`strengthMode`/强度函数零改，D-037 两方向边界）；**判定方向默认维持「看义项提示写英文词」**，不引入新题型（见 §5.4 备案）。

### 4.2 兼容与迁移（无迁移）

- 见 §1.3。核心：本卡**零持久化字段变更**，因此不存在 schema 抬升、数据迁移、旧备份失效问题；向前 / 向后兼容性由「结构不变」天然保证。

---

## 5. 待 G3/G4 分工与 Open

### 5.1 任务分解（3 个任务；按 G3 / G4 边界分写）

| 任务 | 归属 | 相关文件（≥3） | 内容 | 依赖 |
|---|---|---|---|---|
| **T01** | G3 | `js/core.js`、`js/phrases.js`、`tests/senses.test.mjs`（新文件） | ① P1 `sensesOf` + P2 `pickSense` + P3 `gradeSense`（§2.1~2.3 规则逐条一致）；② `Core` 导出面加法登记（双暴露）；③ `phrases.js` 新增义项展示 / 抽考文案键（先落再由 G4 引用，不双写）；④ 新测试骨架（SEN-AC01/03/07 解析与复现 / 边界） | 无（契约冻结、#015 观测层已冻结即开工） |
| **T02** | G4 | `js/app.js`、`js/core.js`（只读引用）、`js/phrases.js`（只读引用） | ① `renderFlash`（app.js:1006）用 `sensesOf` 展示全部义项、保留音标 / 例句 / 发音；② `renderType`（app.js:1178）与抽测提示（app.js:1716/1669）按 `pickSense` 选中义项 text 作提示；③ 用 `gradeSense` 做按义项判定并绑定 senseIdx/senseText；④ 文案只引用 phrases 键，不双写；⑤ 不写任何 db 义项级字段 | T01（Core 导出面与 phrases 键就绪，D-028 自读交接段） |
| **T03** | G3 + G8 | `tests/senses.test.mjs`、`js/core.js`、`js/app.js`（既有 7 文件全量复跑，只读） | ① 新测试覆盖 SEN-AC01~08 全表；② 既有 161 项逐字不动、项数不减；③ `check-data.mjs` 460 词、`qa_independent_verify.mjs` 34/0、`--check` 全过；④ G8 独立复核「旧 161 逐项一致 + 新文件全绿 + 红线 6 条逐项 + 无义项级进度写入」 | T01 + T02 冻结 |

- **验收钩子（T03）**：`sensesOf` 用例表逐项一致且不改 entry；`pickSense` 同种子复现、换种子可变、无 `Math.random`；`gradeSense` 按义项判定并绑定 senseIdx/senseText；卡片全义项展示且音标 / 例句 / 发音不破坏；抽测 / 默写按选中义项提示；`lvl/due/st/star` 前后逐字段一致、无义项级 db 键；460 词全解析不抛错。

### 5.2 职责边界（G3 core / phrases vs G4 app.js）

- **G3 独占**：`core.js`（3 个纯函数 + Core 导出）、`phrases.js`（义项文案键）、`tests/senses.test.mjs`（新文件）。core 保持无 DOM。
- **G4 独占**：`app.js`（卡片展示全义项 + 抽测 / 默写按选中义项提示与判定 + 文案引用）。
- **交接**：G3 落 `phrases.js` 键后，把最终键名清单与 Core 导出面写进 `cards/#016.md` 的「状态 / 交接」段；G4 自读后只引用不双写（D-028 免转发开工约定）。

### 5.3 与 G1 PRD 的冲突核查与最小修订建议（不自行推翻）

| # | PRD 表述 | 与红线 / 上游是否冲突 | 处置 / 最小修订建议 |
|---|---|---|---|
| 1 | §1.1 / §4.2「抽义项种子 = 日期 + 词，参照 startExam 种子策略」 | 不冲突，但**与 #016 卡写入集签名有别**：卡面 `pickSense(w,t,seed)`，本契约改为 `pickSense(senses,seed)`（解析与抽取解耦，便于纯函数测试与复用） | 建议 G0 将卡面「交接 API 名单」的签名同步为 `pickSense(senses, seed)`（或增补等价重载说明）；**不推翻 PRD 任何 AC**，PRD §4.2 只述策略不述签名，无需改 |
| 2 | §3.2 SEN-AC04「答对所选义项算对」/ §4.3「判定按所选义项」 | 表述可对齐：本契约把「按所选义项」实现为「选中义项作提示 + 结果绑定 senseIdx/senseText，答案仍按词 w 比对」，与 gradeExam 现状一致 | 建议 G1 后续在 §4.3 补注「（按所选义项 = 提示取所选义项、判定绑定该义项，词粒度真源不变）」；**编号与判定逻辑不变** |
| 3 | §5 OQ-01~03 默认（原文顺序 / 日期+词 / 词性前缀保留） | 不冲突，本契约 §2.1/§2.2/§2.4 已按默认固定 | 无需改 PRD；若 G0 拍板变更 OQ，再由 G1 更新措辞、G3 同步实现 |

> **结论：G1 PRD 与 D-037/C1/C10 及 w::/SCHEMA 红线无实质冲突**；3 处均为签名 / 措辞对齐，本文按默认口径执行并给出最小修订建议，**未自行推翻 PRD 任何 AC**。

### 5.4 需 G0 裁决 / 备案的问题

- **阻塞裁决：0 项**。OQ-01 / OQ-03 由 G1/G2 契约层固定；OQ-02（种子）已给「日期 + 词」默认，不阻塞开工。
- **备案项（不需裁决，仅登记）**：
  1. **判定方向默认**：维持既有「看中文义项提示 → 写英文词」答题形态，`gradeSense.expected = norm(entry.w)`。若 G0 希望改为「给英文词 → 写/选中文义项」（更贴合“答对所选义项”字面），则需重开子卡并改 `gradeSense` 的 expected 来源与匹配策略——本卡按默认执行，**不预先改题型**。
  2. 若 G8 实现后发现某既有断言对整条 word 记录做精确 deepEqual（本轮核查未发现），按 D-025「以磁盘为准」回报 G0，不自行放宽。
  3. `adj.` 与 `a.` 同类形容词标签按原文保留字面串，若词库出现其他小众词性缩写，按 §2.1 规则 2 的词性 token 识别兜底。

---

## 6. 交付登记

| 项 | 值 |
|---|---|
| 交付落点 | `word365/docs/design-senses.md`（#016 · G2 唯一写入文件） |
| 基线 | 2026-11-16 21:00 · A 仓库 · 161 项 / 7 文件 0 失败 · 460 词 · qa 34/0 |
| **字段契约数** | **0**（不新增任何持久化字段；义项从 `t` 实时派生，选中义项仅存会话内存） |
| **新增纯函数数** | **3**（P1 `sensesOf`、P2 `pickSense`、P3 `gradeSense`）；既有函数本体零改，仅 G4 调用点改签 |
| **任务数** | **3**（T01~T03，G3 core/phrases/测试 → G4 app.js → G3+G8 测试与复核） |
| **AC 映射** | **8/8**（SEN-AC01~08 全覆盖，§3） |
| **待裁决项** | 阻塞裁决 0 项；冲突 3 处为签名 / 措辞对齐（§5.3）；备案 3 项（§5.4） |
| **红线** | #016 卡 6 条逐条确认守（§4.1）：w::/db.words/C1 不变、LADDER_DAYS/rateWord 三分支不变、lvl/due/st+C10 维持、SCHEMA 恒 3+词库只读、旧 161 断言不动+新测试独立、抽考可复现按义项判定无义项级进度 |
| 写后复跑 | 本组纯文档产出、不改代码；写后全量复跑由 G8 独立复核（结果并入交付回执） |
| 下游交接 | G3 依 §5.1 T01/T03 落地，G4 依 T02 落地；G8 依 §3 判定钩子 + §4.1 红线独立复核 |

> 本文**未改动**任何源码 / 测试 / README / 既有文档（含 `prd-senses.md`、`prd-strength.md`、`design-strength.md`、`design-n4-n2.md`、`core.js`、`app.js`）或 `365-groups/**`；未替 G1 改 AC、未替 G3 写实现、未替 G8 写测试。G0 裁决以 `365-groups/DECISIONS.md` 台账为准，本组不写该文件。

---

## 版本记录

| 版本 | 日期 | 组 / 任务卡 | 变更摘要 | 状态 |
|---|---|---|---|---|
| v1.0 | 2026-11-16 | G2-architecture / #016（主笔 agent） | 首版：依 G1 `prd-senses.md` v1.0 与 D-037/C1/C10 产出义项提示增强契约——数据契约 0 新增字段（义项从 `t` 实时派生、选中义项仅存会话内存、SCHEMA 恒 3）；纯函数 3 个（`sensesOf`/`pickSense`/`gradeSense`，含切分用例表、日期+词 xorshift 种子、按义项判定返回绑定 senseIdx/senseText）；G3（core/phrases/新测试）与 G4（app.js 调用点）分工；SEN-AC01~08 映射 8/8；#016 卡红线 6 条逐条确认；3 任务分解、冲突 3 处最小修订建议、需 G0 裁决 0 项（备案 3 项）；基线 161/7 + 460 词 + qa 34/0。明确不拆卡、不动 w::、不碰 #015 强度语义。纯文档产出，不改任何既有文件 | 已交付（待 G3/G4 实现、G8 独立复核） |

*本文为任务卡 #016 的增量设计契约 v1.0。凡未在 §1.2 / §4.1 标注【实测】的切分细节 / 兜底值 / 种子串格式均为【规划】设计取值，非实测、非预测，待 G3 实现与 G8 回归验证。G0 后续裁决以 `365-groups/DECISIONS.md` 台账为准。*
