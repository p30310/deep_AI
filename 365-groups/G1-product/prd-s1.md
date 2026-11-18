# 卡片 #031 · PRD：遗忘曲线阶段一「让遗忘可测量」在 A 仓库落地（v1.1）

> **基线时点**：2026-11-18 18:47（G0 实测，G1 已独立复核）· A 仓库 `E:/WorkBudy_WorkSpace/word365/` @ git HEAD `70cedef`。
> **基线数字**：`node verify.mjs` PASS **26 文件 / 311 项 / 0 失败** · 460 词 · QA 34/0。（复核命令在工作区根 `E:/WorkBudy_WorkSpace/verify.mjs`，`word365/` 下无此文件。）
> **上游**（本卡 AC 是其在 A 仓库的落地映射，非另起一套）：`背单词365_遗忘曲线驱动_功能设计分阶段指导路线.md` §3 C1–C12、§5 阶段一、§6 Q1–Q4、§9 CP1；`背单词365_遗忘曲线_功能设计验收用例矩阵.md` §1 S1-AC1~AC7、§6 B1/B6/B9、§7 K3/K5、§8。
> **读码事实（只读复核，零改动）**：`core.js:14` `LADDER_DAYS=[1,2,4,7,15,30,60]`；`:153` 词级 `rec.evts[]`；`:187` `rateWord(db,key,rating,mode)`，`rating∈{know,fuzzy,unknown}`(`:178`)，`mode` 六值标签(`:182` `flash/type/choice/match/listen/ctx`)；`:193` 单次 `t=now()`、`:195` `origDue=rec.due`（改 due 前）；`:205-228` 三分支（know→lvl+1/due=阶梯；fuzzy→+28h；unknown→+10min）；`:246-251` 事件 `{t,rating,interval,type}`，`interval=rec.due-t`（毫秒）；`:437/447` `exportJSON` 全量 `clone` / `importJSON` 后 `ensureSchema`「未知键一律保留」；`:489-548` `ensureSchema` 不删顶层未知键、不给词级字段做白名单裁剪；`:763` `strengthEventScore`、`:796` `strengthOf` 消费 `evts`。**零命中**：`baselineReport`/`intervalSeg`/`falseKnownCandidates`/`INTERVAL_CONTRACT`。
> **B 仓库**（`E:/dsh-workspace/word365/www/js/core.js`）同名观测层仅作设计参考，数据模型不同（顶层 `db.events` + `answer(bookKey,word,grade,why)`），禁止照搬。
> **写入域**：唯一可写文件＝`365-groups/G1-product/prd-s1.md`。不改 `word365/` 任何源码/测试、不改其他治理文档、不 git commit。

---

## 0. 上游映射与术语对照（先对齐再验收）

本卡六条 AC = 上游阶段一在 A 仓库的**落地映射**；上游 S1-AC7（老库首开补观测结构）不作为第七条独立 AC，其语义已并入 AC1/AC4 的「老库/往返后行为与基线一致」。阶段门维持上游 CP1：**S1-AC2 ∧ S1-AC5 ∧ S1-AC6 同时通过**方可进入阶段二。

| 上游 / 他仓术语 | A 仓库事实（读码核实） | 本卡处理 |
|---|---|---|
| `ivl`（间隔，天） | A 词级记录**无 `ivl` 字段**；等价事实是 `rec.evts[].interval`（毫秒，＝`rec.due - t`，`:249`） | AC1 逐字段比对对象为 `due/lvl/st/reps/correct/wrong/wfix/last/first/lastRating/evts`；`ivl` 映射为 `evts[].interval`，见未决 U3 |
| 自评三档 | `rating∈{know,fuzzy,unknown}`（`:178`，路线 §0.2 称「三档自评」），是 `rateWord` 第 2 参，兼驱动 `lvl/due/st` | 自评档直接取 `rating`；**独立「检索结果」信号 A 仓库不存在**，见未决 U2 |
| `selfEval` / `retrievedOk` 双字段 | A 无；`rating` 单值同时决定对错与排期 | AC3 候选判据按字段语义写，取值来源由 G2 终裁（U2） |
| `mode` | `rateWord` 第 4 参，#028 六值归因标签（`:182`） | 必须记录（「哪种练法更有效」的数据源），但**不作保持率分组依据**；保持率按间隔段分组 |
| 到期偏差 `plannedDue`/`actualAt` | `:195` `origDue` 在改 due 前捕获；`:193` 单次 `t` 即时间基准 | AC6 直接复用该单点，禁止第二次 `now()`（C3） |

**与既有 `Core.retentionStats`（#027，30 天窗口全局保持率）的边界**：该函数读 `rec.evts`、按词全局取**最近一次**≥30 天观察、pending 不入分母，与本卡 S1-AC2「按间隔段、段内取**首次**检索」是**不同聚合**，不得复用、不得互相替代，见未决 U3。

---

## 1. 范围声明

**1.1 本阶段只做「让遗忘可测量」**：以只读/追加方式建立四类观测事实与只读纯函数——① 间隔契约显式化（固定阶梯 + 两条支线）；② 按间隔段保持率基线报告；③ 假认识候选识别；④ 到期偏差与当日到期队列收盘快照。新增事实须可导出、导入后逐字段一致。

**1.2 不碰排期**：不改 `due/lvl/st/reps/wfix` 的计算，不改 `schedule`/`strengthDue`，不改固定阶梯初值；固定阶梯恒为可回退基线（C4）；对照只打标不改行为；SCHEMA 恒 3；`w::` 键不变；不新增用户可见操作。

**1.3 阶段门**：S1-AC2 ∧ S1-AC5 ∧ S1-AC6 同时通过才进入阶段二。样本量不足时**延长观测**，不动排序、不提前推进。

**1.4 判据性质**：全部 AC 为自动可判定（矩阵「A」类），Given/When/Then + 数字/结构断言，不含「提升体验」类不可测表述。

---

## 2. 六条 AC（Given / When / Then + 机器判据）

> 机器判据中 `M<x>.<y>` 为 G10 可直接写成断言的编号；函数名（如 `baselineReport`）为**建议命名**，以 G2 契约终裁为准，但入参/出参语义与判据不得漂移。

### S1-AC1 · 加观测前后 SRS 字段逐字段一致（可回退基线）

- **Given**：一份含新词（`reps=0`）、学习中、已掌握（`st==='known'`）、错词（`wrong>0`）各若干的库 `db0`；冻结时间不依赖（本 AC 不调 `now()`）。
- **When**：完成阶段一观测能力接入（加载新的纯函数 / 对 `db0` 执行观测结构补齐），得到 `db1`。
- **Then**：每个词 `due/lvl/st/reps/correct/wrong/wfix/last/first/lastRating/evts` 与接入前逐项一致；无一词被重新排期；SCHEMA 恒 3。
- **机器判据**：
  - **M1.1** `Object.keys(db0.words).sort()` 深等于 `Object.keys(db1.words).sort()`。
  - **M1.2** 对每个 key，`JSON.stringify(pick(db0.words[k], SRS_FIELDS)) === JSON.stringify(pick(db1.words[k], SRS_FIELDS))`，其中 `SRS_FIELDS=[due,lvl,st,reps,correct,wrong,wfix,last,first,lastRating,evts]`；`evts` 整数组逐元素深等（含顺序与键集，既有事件恰 4 键 `{t,rating,interval,type}` 不得被改写）。
  - **M1.3** `db1.schema === 3`；`db1.words[*].graduated` 与 `db0` 一致。
  - **M1.4** 若接入步骤写库，仅允许新增观测容器键，不得改变 `db0` 任何既有键值（`updatedAt` 为唯一可豁免字段，须在断言中显式排除）。

### S1-AC2 · 按间隔段保持率与样本量可手工复算

- **Given**：一组模拟观测事实，覆盖 `1/2/4/7/15/30/60` 天七段与 `10m`、`28h` 两条支线共 **9 段**（**v1.1 注**：G2 契约 v1.1 §3.0 终裁为 **10 段**枚举 `new/10m/1d/2d/4d/7d/15d/30d/60d/other`，`28h` 归入 `1d`、新词归 `new`；**以契约为准**，本节九段表述保留为设计过程记录）；每段含成功与失败检索；至少一段含「同词同段多次事件」以验证首次去重；至少一段无任何事件（空段）。
- **When**：调用 `baselineReport(events)` 生成固定阶梯基线报告（只读）。
- **Then**：报告按声明顺序输出 9 段，每段给出 `sampleSize`、`retainedCount`、`retained`；三值均可用原始事件逐条复算；空段 `retained=null`。
- **机器判据**：
  - **M2.1** 返回值 `Array.isArray===true`，长度 9，段序列严格为 `['1d','2d','4d','7d','15d','30d','60d','10m','28h']`（或 G2 终裁的等价常量，须在契约中单一来源声明）。
  - **M2.2** 每段行恰含 `seg/sampleSize/retainedCount/retained` 四字段；`sampleSize`、`retainedCount` 为非负整数。
  - **M2.3** 首次去重：对每个 `(词 key, 段)` 只取该段内 `t` 最小的**首次检索**事件；同词同段后续事件不计数。断言：`sampleSize === 不同 (key,seg) 对数`；在「每词每段恰一条事件」的验收 fixture 下，`Σ sampleSize === 事件总数`。
  - **M2.4** 保持率公式：`retained === (sampleSize>0 ? retainedCount/sampleSize : null)`；`retainedCount` 为该段首次事件中「检索成功」的计数。空段 `sampleSize===0 && retainedCount===0 && retained===null`（不是 0、不是 NaN）。
  - **M2.5** 可复算性：用一份独立脚本从原始事件重算 9 段三值，与函数输出逐字段 `deepEqual`；两次调用同输入结果 `deepEqual`。
  - **M2.6** 零写库：调用前后 `JSON.stringify(events)` 不变，`db`（若传入）顶层键集与内容不变，SCHEMA 恒 3。

### S1-AC3 · 「自评认识、检索答错」识别为假认识候选且不改写词状态

- **Given**：一条观测事实 `e`，其 `selfRating==='know'` 且 `retrievalOk===false`；另备三条对照：`(know,true)`、`(fuzzy,false)`、`(unknown,false)`。
- **When**：调用 `falseKnownCandidates(events)` 识别候选（只读）。
- **Then**：仅 `e` 被识别为候选；该词 `lvl/due/st/wrong/wfix/reps/evts` 与作答前逐项一致。
- **机器判据**：
  - **M3.1** `falseKnownCandidates([e])` 返回长度 1 的数组，元素至少含 `{key, at, seg}`（字段名以 G2 契约为准），且指代 `e` 所属词/时刻/段。
  - **M3.2** `falseKnownCandidates([对照1,对照2,对照3])` 返回 `[]`；候选判定严格等价于 `selfRating==='know' && retrievalOk===false`（`===` 严格比较，脏值不误判；D-069 统一为 `know`）。
  - **M3.3** 调用前后目标词记录 `JSON.stringify(rec)` 逐字节相等；`db.words` 键集不变；`db.schema===3`；`evts.length` 不变。
  - **M3.4** 该识别为纯推导，不调用 `rateWord`、不写 `db.days`、不消耗额度、不改抽测记录条数。

### S1-AC4 · 导出→导入后观测事实逐字段一致

- **Given**：一份含阶段一观测事实（9 段事件 + 至少 1 条假认识候选 + 至少 1 条到期偏差快照）的库 `db`。
- **When**：`text = Core.exportJSON(db)` → `res = Core.importJSON(text)`。
- **Then**：观测事实完整保留，导入后行为与固定阶梯基线一致，不重复归档。
- **机器判据**：
  - **M4.1** `res.ok===true && res.db.schema===3`。
  - **M4.2** 分别从 `db` 与 `res.db` 抽取观测事实（观测事件数组 + 候选列表 + 快照列表，逐字段深拷贝），两者 `deepEqual`：**字段值、字段顺序、数组顺序、数组长度**全等。
  - **M4.3** 行为等价：对 `db` 与 `res.db` 以同一冻结时间、同一词、同一 `rating/mode` 调用 `rateWord` 后，所得记录在 `SRS_FIELDS`（M1.2）上逐字段深等。
  - **M4.4** 不重复归档：对 `res.db` 再执行 `ensureSchema` 或二次导入，观测事件条数不变；无重复 key、无重复候选。
  - **M4.5** A 仓库 `exportJSON` 全量 `clone`（`:437-441`）、`importJSON` 未知键保留（`:454-462`、`ensureSchema` 注释「未知键一律保留」）——本条须由测试**证明**，不得仅凭读码断言；`updatedAt` 为唯一差值（导出时刷新），须显式排除。

### S1-AC5 · 全量回归 311+N 项全绿

- **Given**：A 仓库基线 `node verify.mjs` PASS 26 文件 / 311 项 / 0 失败 · 460 词 · QA 34/0，既有 26 文件测试逐字未改。
- **When**：加入独立新测试文件 `word365/tests/core.test.s1.mjs`（含 N 个新测试项）后执行全量回归。
- **Then**：全绿，项数恰为 `311 + N`，失败 0。
- **机器判据**：
  - **M5.1** 工作区根 `node verify.mjs` 输出 PASS，且「全量单测项数 = 311 + N」，失败 0。
  - **M5.2** 新测试项数 N 写入 `verify.mjs` 的 EXPECT 与注释；新增独立测试文件计入文件数（由 26 → 27），`verify.mjs` 对应常量须由 G0/G3 同步更新（G1 不改该文件）。
  - **M5.3** 既有 26 个测试文件逐字节未改（`git diff --name-only` 中不得出现既有测试文件）。
  - **M5.4** 词书 460 词、跨书零重复；独立 QA 34/0 不变。
  - **M5.5** N ≥ 覆盖六条 AC 的最小项数（每条 AC 至少 1 项），且新测试文件可被 `node --test` 单独执行全绿。

### S1-AC6 · 到期偏差可复算（单次时间基准 + 当日队列快照）

- **Given**：一个已到期词，`origDue < t`；一个未到期词，`origDue > t`；外部注入固定时间 `at`（不得依赖真实 `now()`）。
- **When**：在 `rateWord` 写 `due` 之前捕获 `plannedDue`，用同一时间基准记 `at===actualAt`，生成观测事实；再以固定 `at` 调用 `dueSnapshot(db, at)` 生成当日到期队列收盘快照。
- **Then**：偏差可复算；快照可事后复算；单次时间基准不被破坏。
- **机器判据**：
  - **M6.1** 观测事实含 `plannedDue/at/actualAt/lateMs/seg`；`plannedDue === 作答前 rec.due`；`at === actualAt === 注入的 t`（严格相等，且断言代码中只出现一次取时；`core.js:193` 单点 `t=now()` 为唯一来源）。
  - **M6.2** `lateMs === Math.max(0, t - plannedDue)`；未到期词 `lateMs===0`；到期词 `lateMs>0` 且与手算一致。
  - **M6.3** `dueSnapshot(db, at)` 返回当日到期队列（键列表），同一 `db/at` 两次调用 `deepEqual`；函数签名**显式含 `at` 入参**，内部不取 `now()`。
  - **M6.4** 快照为只读推导：调用前后 `JSON.stringify(db)` 不变，不写 `db.days`、不参与 `todayPlan` 排序、不改任何 `due`。
  - **M6.5** 可由 `db.words[*].due` + 观测事件事后复算快照，结果 `deepEqual`；`interval === rec.due - t`（与既有事件 `:249` 同口径）。

---

## 3. 数据口径（收敛定义，G10 据此判等）

**3.1 间隔段集合**：固定阶梯 7 段 `1d/2d/4d/7d/15d/30d/60d` + 支线 2 段 `10m`（unknown 后 +10 分钟）、`28h`（fuzzy 后 +28 小时＝次日+4 小时），共 9 段，顺序固定，作为契约常量单一来源。段判定按毫秒 `interval` 精确匹配：10min→`10m`、28h→`28h`、N×86400000 且 N∈{1,2,4,7,15,30,60}→`Nd`，其余→不纳入 9 段（列入 `other` 或丢弃由 G2 定，须声明且不得计入 9 段分母）。

**3.2 「首次检索」定义**：同一词在同一间隔段内，只取该段**按 `t` 升序的第一次**检索事件参与保持率；同词同段后续事件一律不计入 `sampleSize/retainedCount`。跨段事件互不排斥（一个词可在多个段各贡献 1 票）。

**3.3 保持率公式**：`retained = retainedCount / sampleSize`；`retainedCount` = 该段首次事件中「检索成功」的票数。`sampleSize===0` 时三值固定为 `{sampleSize:0, retainedCount:0, retained:null}`，UI/返回均不得显示 `0`、`NaN`、`0%`；样本量不足时**延长观测，不改排序、不臆造**（上游 CP1）。

**3.4 自评三档的取得（读码核实，不假设）**：A 仓库 `rating∈{know,fuzzy,unknown}`（`:178`）即为三档自评，与 `evts[].rating` 同源。**但** `rating` 同时驱动 `lvl/due/st`，单值无法表达「自评认识 ∧ 检索答错」这一组合——A 仓库**没有**独立的 `retrievalOk` 信号。`mode`（6 值）仅归因练法，不能替代检索结果。两信号如何取得是 **U2**，由 G2 终裁；本卡只锁定判据语义 `selfRating==='known' && retrievalOk===false`，不预设取值路径。

**3.5 到期偏差与单次时间基准（C3）**：`plannedDue` 必须在改 `due` 前捕获——A 仓库 `:195 origDue` 已满足；`at===actualAt` 必须复用 `:193` 的单一 `t`，不得二次 `now()`；`lateMs=max(0, at-plannedDue)`；当日到期队列快照以显式 `at` 入参推导，不写库、不参与排序。

**3.6 段派生源**：本次检索「落在哪个间隔段」的派生源（当前事件 `interval` / 上一事件 `interval` / 实际 `t` 差）为 **U3**，由 G2 终裁；但无论采用哪种，AC2 的 9 段枚举与首次去重口径不变，且须在契约中写明单一来源，G10 按该来源复算。

**3.7 导出/导入口径**：观测事实必须挂在 `db` 内（顶层键或词级新键），借 `exportJSON` 全量 clone 与 `importJSON` 未知键保留天然往返；不得挂在任何会被迁移裁剪的位置；往返后 `schema` 恒 3、不重复归档。

---

## 4. 验收清单（12 条布尔判据，G10 逐项勾选）

| # | 布尔判据（勾＝通过） | 派生 AC | G10 自动化验证方式 |
|---|---|---|---|
| 1 | 接入观测前后所有词 SRS 字段逐字段一致，`schema===3` | AC1 / M1.1-1.4 | 断言 `pick()` 后 `JSON.stringify` 相等；`git diff` 确认词记录构造未改 |
| 2 | 既有 `evts` 事件仍恰 4 键 `{t,rating,interval,type}`，`strengthOf` 结果不变 | AC1 / M1.2 | 跑 `mode-attribution.test.mjs:28` 与 `core.test.strength.mjs` 全绿 |
| 3 | 基线报告确输出 9 段，段顺序固定，字段恰四键 | AC2 / M2.1-2.2 | `deepEqual` 段序列 + `Object.keys` 排序比较 |
| 4 | 同词同段首次去重成立，`Σ sampleSize` 与事件数恒等式成立 | AC2 / M2.3 | 独立脚本按 `(key,seg)` 去重复算并断言 |
| 5 | 空段 `retained===null`、`retainedCount===0`、`sampleSize===0` | AC2 / M2.4 | 构造空段 fixture 断言三值，禁止 0/NaN |
| 6 | 仅 `(known,false)` 命中假认识候选，三类对照均不命中 | AC3 / M3.1-3.2 | 四组输入表驱动断言输出数组长度与内容 |
| 7 | AC3 调用前后目标词记录字节全等，`evts.length` 不变 | AC3 / M3.3-3.4 | `JSON.stringify(rec)` before/after 比较；确认未调 `rateWord` |
| 8 | 导出→导入后观测事实逐字段深等（含顺序/长度），`schema===3` | AC4 / M4.1-4.2 | `exportJSON`→`importJSON`→抽取观测并 `deepEqual` |
| 9 | 二次导入/再 `ensureSchema` 不重复归档，事件条数不变 | AC4 / M4.4 | 计数断言 + 键唯一性断言 |
| 10 | `node verify.mjs` PASS，项数 `311+N`、失败 0、460 词、QA 34/0 | AC5 / M5.1-5.5 | 跑门禁命令并解析输出；核对 EXPECT 已更新 |
| 11 | 既有 26 文件测试逐字节未改，新测试独立成文件 | AC5 / M5.3 | `git diff --name-only` 白名单校验 |
| 12 | `plannedDue===作答前 due`、`at===actualAt===注入 t`、`lateMs` 可复算，快照确定且零写库 | AC6 / M6.1-6.5 | 注入固定 `at` 断言；两次快照 `deepEqual` + db 字节全等 |

> 阶段门复验：#3/#4/#5（AC2）+ #10/#11（AC5）+ #12（AC6）全勾，才允许进入阶段二。

---

## 5. 给 G2 的未决问题（需终裁后才能落契约）

**U1 · 观测存哪里？** 顶层新键（如 `db.s1Events`，类 B 仓 `db.events`）vs 词级新键（如 `rec.s1Events`）vs 扩 `rec.evts[]`。硬约束：`mode-attribution.test.mjs:28` 断言 **`evts` 元素恰 4 键**，既有 26 文件不得改 → **不能给 `rec.evts[]` 事件加字段**；`ensureSchema` 不裁剪词级/顶层未知键，两条新键路径都能过 AC4。需 G2 定一处并说明与 #015 强度层 `evts` 消费的边界。

**U2 · 「自评认识、检索答错」双信号从哪来？`rateWord` 是否加第 5 参？** A 仓库只有 `rating` 单值（兼驱动排期），无独立 `retrievalOk`；`mode` 六值只作练法归因。若给 `rateWord` 加第 5 参（如 `retrievalOk` 或 opts）需 app 层传值，但**卡片写入文件集不含 `app.js`**。可选路径：① 加可选第 5 参且四参调用逐字段等价（须 G0 扩写入域）；② 新纯函数入参直接收显式 `selfRating/retrievalOk`，捕获路径另议；③ 以既有抽测记录为检索结果源。需 G2 定路径并保证「不改写词状态」。

**U3 · 间隔段派生源 + `ivl` 缺失 + 与 `retentionStats` 边界。** 卡片/AC1 提到 `ivl` 但 A 词级无此字段（映射为 `evts[].interval` 毫秒）；本次检索的段应派生自「当前 `interval`」「上一事件 `interval`」还是「实际 `t` 差」？另 `#027 Core.retentionStats` 是按词全局取最近一次 ≥30 天观察，与本卡「按段取首次」不同聚合，须明确二者互不复用、命名不混。需 G2 在契约中写死单一派生源。

---

## 6. 明确不做（本卡红线）

- **不做阶段二**：临界优先排序、当日队列来源分类/可解释理由、策略对照护栏——均属 S2，阶段门未过不启动。
- **不做阶段三**：改间隔生成、个体化下次时机、临界重排（K3 红线，须重新立项裁决）。
- **不新增 UI**：不加按钮、入口、提示、徽标、统计卡；`index.html` 加载序列不动。
- **不升 SCHEMA**：恒 3；不加版本标记；不改 `w::` 键；不改 `defaultDB` 既有键语义。
- **不碰 B 仓库**：`E:/dsh-workspace/word365` 任何文件只读参考，零写入、零照搬。
- **不改既有测试**：26 文件逐字不动；新测试仅独立文件 `core.test.s1.mjs`。
- **不改 `due/lvl/st/reps/wfix` 计算**：`schedule`/`strengthDue`/固定阶梯初值不动；观测层只读/追加。
- **不动抽测**：触发门槛、冷却、机会数、记录条数、结论形态全部不变（C10）。
- **不写主观判据**：AC 中无「提升体验/更直观/更流畅」类不可测表述。

---

## 7. 版本记录

| 版本 | 日期 | 内容 |
|---|---|---|
| **v1.1** | **2026-11-18** | #031 实现期 G10 复核 G31-F02 修正：S1-AC2 段集合以 G2 契约 v1.1 §3.0 的 **10 段**（`new/10m/1d/2d/4d/7d/15d/30d/60d/other`，`28h` 归 `1d`）为准；本文 §M2.1/§3.1 的「9 段」保留为设计过程记录。另同步 S1-AC3 判据 `selfRating==='know'`（D-069 与 rating 三值统一）。其余逐字不动。 |
| **v1.0** | **2026-11-18** | 首版。基于 G0 18:47 实测并经 G1 独立复核（verify.mjs PASS 26 文件 / 311 项 / 460 词 / QA 34/0）；产出范围声明、S1-AC1~AC6 六条 Given/When/Then + 机器判据、七节数据口径、12 条验收清单、3 个 G2 未决问题、明确不做清单。AC 为上游 §5/§6/矩阵 §1 在 A 仓库的落地映射，未新增编号、未改阶段门口径。 |

*本 PRD 是卡片 #031 的产品验收真源；与上游冲突时以上游主文档裁决为准，A 仓库字段事实以本卡读码复核为准。*
