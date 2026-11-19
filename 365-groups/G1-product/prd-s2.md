# 卡片 #032 · PRD：遗忘曲线阶段二「临界优先排序」在 A 仓库落地（v1.1）

> **基线时点**：2026-11-19 08:59（G0 实测，G1 已独立复核）· A 仓库 `E:/WorkBudy_WorkSpace/word365/` @ git HEAD `e4839a6`、工作区干净（`#032.md` 为新增未跟踪卡，非源码改动）。
> **基线数字**（G1 自核 `verify.mjs`：EXPECT `testFiles:27 / testItems:331 / words:460 / qaPass:34`，与卡面一致）：`node verify.mjs` PASS **27 文件 / 331 项 / 0 失败** · 460 词 · QA 34/0。
> **上游**（本卡 AC 是其在 A 仓库的**落地映射**，非另起一套）：`背单词365_遗忘曲线驱动_功能设计分阶段指导路线.md` §5 阶段二（S2-AC1~AC5、阶段门 S2-AC1∧S2-AC4）、§6 Q5–Q7、§7.2 回退矩阵、§8 K3/K4/K5、§9 CP2；`背单词365_遗忘曲线_功能设计验收用例矩阵.md` §2、§6 B1/B6/B8/B9/B13、§7 K3/K5、§9。
> **读码事实（只读复核，零改动）**：`js/core.js` — `todayPlan(db, records)` L342，`t=now()` L343（唯一时间基准），到期访问器 `dueOf=dueOfWord` L331/L350（OFF 短路返回 `rec.due`，ON 走 `strengthDue`），两处到期升序排序 **L367**（熔断态，`slice(0, s.reviewLimit)`）与 **L375**（正常态，`slice(0, bud.reviewTarget)`）；`computeDailyBudget(s, planDailyFresh)` L1023 → `{freshTarget, reviewTarget}`，`reviewTarget = min(round(freshTarget×reviewRatio/(1−reviewRatio)), reviewLimit)`；`detectReturn` L1085（`isReturn = daysGap≥returnDays(3) ∧ backlog≥pressureThreshold(50)`）、`buildRebuildPack` L1123（`cap=rebuildCap(40)`，按 `(3−lvl)−cet4加权 降序, due 升序` 取包，`spreadDays=min(5,max(3,ceil(remaining/reviewLimit)))`）；阶段一观测层 `collectS1Events` L2149、`intervalSeg` L2171、`baselineReport` L2184、`falseKnownCandidates` L2222、`dueSnapshot` L2239、`INTERVAL_CONTRACT`(L20，10 段) 均已落盘。
> **关键否定事实**：A 仓库**无** `dueWords`/`queue` 函数、无 `criticality`/`retrievability`/`source` 字段、无「来源类别」落盘字段；路线文档的 `dueWords`/`queue` 写法是 B 仓库口径，**禁止照搬**。`rec.s1[]` 落盘字段为 `k/plannedDue/at/actualAt/lateMs/prevIvl/newIvl/seg/branch/selfRating/retrievedOk/first/cohort`（L284–298），字段名是 `seg` 而非 `intervalSeg`。
> **写入域**：唯一可写文件＝`365-groups/G1-product/prd-s2.md`。不改 `word365/` 任何源码/测试、不改其他治理文档、不 git commit。函数名（如 `buildPriorityQueue`）均为**建议命名**，以 G2 契约终裁为准，但入参/出参语义与判据不得漂移。

---

## 0. 上游映射与术语对照（先对齐再验收）

本卡五条 AC = 上游阶段二 S2-AC1~AC5 在 A 仓库的**落地映射**；编号、类型（A/M）与阶段门口径与上游逐字对齐，不新增编号。CP2（路线 §9 L361）是**阶段三末**检查点，其前置 K3 立项裁决属阶段三；**本卡阶段门**是路线 §5 L190 与矩阵 §2 L61 的 **S2-AC1 ∧ S2-AC4**。

| 上游 / 他仓术语 | A 仓库事实（读码核实） | 本卡处理 |
|---|---|---|
| 临界程度 / 预计可提取度（Q7） | A 无 `criticality`/`retrievability` 字段；可推导事实为 `rec.due`、`s1[].plannedDue/lateMs/newIvl/seg` 与冻结 `t` | 只读派生排序键，不写回词记录、不扩字段（见 U1） |
| 四类来源类别（Q5） | A 无 `source` 字段；`wrong>0`=错词本、`st`、`due` 为已落盘事实 | 类别为派生标签；判定语义见 §2，不臆造新数据 |
| `dueWords`/`queue`（路线按 B 仓写法） | A 无；真实入口是 `todayPlan(db, records)` L342，排序点 L367/L375 | AC 针对 `todayPlan` 的**可回退叠加层**，禁止照搬 B 仓函数名/数据结构 |
| 每日上限（K5） | `computeDailyBudget` L1023 真实口径；回归态另有 `buildRebuildPack` cap=40、`pressureThreshold=50` | 以当前真实生效额度为准，不预设 N4 时长接线已落地（U2） |
| `intervalSeg` | 函数名 L2171；落盘字段是 `s1[].seg`（L292） | 二者均认，字段事实以 `s1[].seg` 为准；const 枚举 `INTERVAL_CONTRACT.segments` |
| 「理由文案回退到基线形态」 | `phrases.js:38/46` 现有 `returnMain`/`pauseText` 含「追上」「旧账」 | 新理由须中性、且为独立只读查询**不覆盖 `todayPlan.text`**；基线串原样保留、不在 S2 中性约束范围；OFF 回退＝不返回 S2 理由（见 §6 U4，已会签） |
| 阶段门 | 路线 §5 L190「S2-AC1、S2-AC4 通过方可进入阶段三」；矩阵 §2 L61 同 | 本卡阶段门 = S2-AC1 ∧ S2-AC4；未同时通过不得进阶段三 |

**与既有层的边界**：本卡排序只读消费阶段一观测事实，不改 `s1`、`evts`、`INTERVAL_CONTRACT`、`baselineReport`；不改 `#015` 强度层 `dueOfWord`（OFF 短路、ON 走 `strengthDue`）——S2 叠加层在 `todayPlan` 的**队列返回阶段**重排，不在到期访问器改 `due`（见 U3）。

---

## 1. 范围声明

**1.1 只做「复习时机排序升级」**：把 `todayPlan` 的到期升序（L367/L375）升级为「来源类别 + 临界程度优先」的**可回退叠加层**。产出四类来源分类、可复算排序键、中性理由文案、回归分日平滑复用与逐字段回退。

**1.2 不碰排期与数据**：不改间隔生成、不改任何 `due`/`lvl`/`st`/`reps`/`wfix`、不改 `schedule`/`strengthDue`/固定阶梯初值、不改 `s1` 观测层、不新增用户操作；SCHEMA 恒 3、`w::` 键不变；缺省等价当前 `dueOf` 升序。

**1.3 阶段三不触碰（K3）**：改间隔生成、个体化下次时机、临界重排属阶段三，须重新立项裁决。**本卡阶段门为 S2-AC1 ∧ S2-AC4**；二者未同时通过不得进入阶段三；若临界优先无可观测改善，停在阶段二调排序，**不把「没效果」推进成「改间隔」**。

**1.4 判据性质**：S2-AC1/2/4/5 为自动可判定（矩阵「A」类），Given/When/Then + 数字/结构断言；S2-AC3 为人工审（矩阵「M」类），但禁语表扫描由 G10 自动化执行。全部 AC 无「提升体验」类不可测表述。

---

## 2. 四类来源分类规则（业务定义，不写实现）

> **总原则**：分类依据**只能**来自已落盘事实——`rec.due`、`s1[].plannedDue/lateMs/prevIvl/newIvl/seg`、`wrong/wfix`、`rec.st`——加上 `todayPlan` 的唯一时间基准 `t=L343`。**不得臆造新数据、不得新增落盘字段**。分类结果是派生标签，不写回词记录。

**2.0 共同派生量（单点定义，G2 落契约）**
- 当前逾期量 `L = max(0, t − dueOfWord(db, rec))`（冻结 `t`；OFF 态即 `t − rec.due`）。
- 上次间隔 `I = 最近一条 s1[].newIvl`（毫秒，已落盘），其段 `s1[].seg ∈ INTERVAL_CONTRACT.segments`；无 `s1` 时 `I` 缺失。
- 窗口常量 `Wjust < Wc`：**规则常量，由 G2 终裁**，只能由 `I`/`seg` 推出（如按段取不同窗口），不得引入新观测维度。
- **信息不足兜底**：`I` 缺失或脏值（无有效 `newIvl` 且 `rec.last` 不可用）时，按 D-071 安全缺省为 `justDue`（**不新增第 5 类**），不臆造临界判定，按正常 `justDue` 参与排序。

| 类别 | 判定语义（仅用落盘事实） | 优先级理由 |
|---|---|---|
| **① 临界** | `Wjust < L ≤ Wc`（逾期量落在「即将遗忘但尚未完全遗忘」的衰减窗口内）；`I` 存在且词未毕业、`st≠'known'` 的到期词 | 复习边际收益最高（曲线先快后慢），须**优先于**轻度逾期与刚到期词；上游 S2-AC1/路线 §5 的硬约束 |
| **② 刚到期** | `0 ≤ L ≤ Wjust`（刚跨过到期点，含跨零点 natural-day 边界，对应矩阵 B1） | 与临界相邻但窗口更窄，属常规到期；排在临界之后、明显逾期之前 |
| **③ 明显逾期** | `L > Wc`（含上游所称「轻度逾期」的远端部分；回归态按 `L` 降序即「最可能已遗忘优先」） | 大概率已遗忘，正常态让位给窗口内词；**回归态反向优先**（路线 §5「中断回归按最可能已遗忘优先」），与现状 `buildRebuildPack` 的 lvl 强度排序不冲突（叠加层只重排顺序，不改包成员） |
| **④ 错词回流** | `rec.wrong > 0`（含 `wfix>0` 的连对未毕业词，对应 B4）；作为**独立来源类别标签**，与其 `L` 无关 | 已知薄弱点，是「词价值」因子之一；其位次常量由 G2 终裁（建议紧随临界之后），但**不得改变上游硬约束「临界 > 刚到期 ∧ 临界 > 明显逾期」** |

**2.1 正常态复算键（AC1 的判等对象）**：`(类别序, 临界程度, due 升序, wordKey 字典序)`；其中「临界程度」为类别内由 `L`、`I`/`seg` 派生的可复算标量（公式 G2 定，见 U1）。`类别序` 默认 `临界 < 错词回流 < 刚到期 < 明显逾期`，仅「临界最小」为上游硬约束，其余为建议值。

**2.2 回归态复算键（AC2 的判等对象）**：在 `buildRebuildPack` 已决定的 `rebuildWords` **成员集合内**，按 `L` 降序（最可能已遗忘优先）重排；成员、数量、`spreadDays`、全部 `due` 保持基线原样。两套键的切换由开关状态决定，开关缺省 OFF → 键退化为纯 `dueOf` 升序（矩阵 B8）。

> **层次边界消歧（G2/G3/G10 必读；回应 G2 登记的 U6）**：`db.returnGuard.rebuildWords` 是 `buildRebuildPack`(L1123–1145) 落盘的**持久化包**——其成员、数量、数组内顺序、`spreadDays` 全部逐字不变（M2.5），**不改 L1135 的 `(score 降序, 同档 due 升序)` 排序式**。`todayPlan` L353–357 在 rebuild 态用 `records.filter(rset)` 从包成员**派生**返回队列，该派生队列的顺序本就取 `records` 顺序（并非包内顺序）。S2 叠加层**只对这个派生执行队列**按 `L` 降序重排，故 M2.2 与「回归包逻辑保持原样」(C6/K5) **不冲突**，无需改 `buildRebuildPack`。若 G0 要求连派生队列顺序也不得变，则上游 AC2「高逾期词优先」无法落地，须由 G0 明示取舍，G3 不得自行二选一。

---

## 3. 五条 AC（Given / When / Then + 机器判据）

> 机器判据中 `M<x>.<y>` 为 G10 可直接写成断言的编号；`A`=自动判定、`M`=人工审（禁语扫描部分自动化）。所有涉及时间的 AC 必须注入冻结 `t`，**禁止依赖真实 `now()`**（C3）。

### S2-AC1 · 临界 + 轻度逾期混合队列：临界词优先且可复算（A）

- **Given**：一份冻结 `t` 的库，正常态下到期积压含四类词各若干（临界、刚到期、明显逾期、错词回流，`reps>0 && dueOf<=t && !graduated`）；**至少一对**临界词 c 与明显逾期词 o 满足 `due(c) > due(o)`（用于证伪「仍按到期升序」）。开关置 ON；`db.days[dk]` 与 `s1` 完整。
- **When**：生成当日队列（建议 `buildPriorityQueue(db, records, t)` / S2 叠加层作用于 `todayPlan` 返回），得到有序队列 + 每词 `{类别, 临界程度}`。
- **Then**：所有临界词排在刚到期与明显逾期词之前；排序结果可按「来源类别 + 临界程度」复算；**入队词集合不变**（只重排，不增不减）。
- **机器判据**：
  - **M1.1** 每词 `类别 ∈ {critical, justDue, overdue, wrongBack}` **恰四值**（D-071：信息不足 → `justDue` 安全缺省，**不新增第 5 类**），且取值可由 §2 的 `L/I/seg/wrong/wfix` 规则逐条复算；无第 5 类值可断言。
  - **M1.2** `max(index of critical) < min(index of justDue ∪ overdue)`（严格在前，非「部分在前」）。
  - **M1.3** 存在对 `(c,o)`：`due(c) > due(o)` 且 `index(c) < index(o)`——证明排序已非 L367/L375 的到期升序。
  - **M1.4** 用独立脚本按 §2.1 复算键对同一 fixture 重排，与返回 `queue.map(k)` `deepEqual`；同输入两次调用 `deepEqual`（确定性，无 `now()`）。
  - **M1.5** `Set(queue keys) === Set(baseline backlog keys)`；词数、`planTarget`、`freshs` 与基线一致。
  - **M1.6** 调用前后 `JSON.stringify(db)` 不变（开关本身若写 `settings` 须显式排除该键），`schema===3`、`w::` 键不变。

### S2-AC2 · 中断 7 天回归积压 120 词：首日不超上限、高逾期优先、余量分日（A）

- **Given**：冻结 `t`；`returnGuard.lastSeen = t−7d`（`daysGap=7 ≥ returnDays=3`），积压 120 词（满足 `backlog≥pressureThreshold=50`），`detectReturn.isReturn===true`；`rebuildCap=40`、`reviewLimit=60`、`computeDailyBudget` 口径由当前 `settings/plan` 真实算出（K5），不假设 N4 已接线。
- **When**：执行 `updateLastSeen`（现状逻辑生成 `rebuildWords` 包）+ S2 回归态叠加层重排，生成回归首日队列；再按 `spreadDays` 推演后续日队列。
- **Then**：首日入队量 ≤ 当前每日上限；包内按 `L` 降序（高逾期优先）；余量分日平滑、不集中首日；`rebuildWords`/`spreadDays`/全部 `due` 与基线逐字段一致。
- **机器判据**：
  - **M2.1** `queue.length === db.returnGuard.rebuildWords.length`（现状 cap=40），且 `queue.length ≤ U`，`U` = 当前真实生效额度上限，**默认取选项① `U=rebuildCap=40`**（G2 契约 §9 U7，守 C6/K5；详见 §6 U2）；默认设置下 `reviewTarget = min(round(20×0.7/0.3),60) = 47 ≥ 40`，两口径均成立；`fresh≤15` 时两口径分叉，按 G0 终裁判等。
  - **M2.2** **派生执行队列**（`todayPlan` L356 返回的 `rebuildWords = records.filter(rset)`，非 `db.returnGuard.rebuildWords`）严格按 `L` 降序（可 `deepEqual` 独立复算）；与正常态的临界优先方向相反，且两套排序不得互相污染；持久化包逐字不变（M2.5）。
  - **M2.3** `remaining = 120 − queue.length`；`spreadDays === buildRebuildPack` 基线值（现状 `min(5,max(3,ceil(remaining/reviewLimit)))`）；逐日入队量均 ≤ 上限，首日不重复计入余量（矩阵 B2 当日只计一次）。
  - **M2.4** `queue ⊆ 到期积压集合`；无新词、无 `graduated`、无 `st==='known'` 词混入（与 `dueSnapshot` 口径对齐）。
  - **M2.5** `db.returnGuard.rebuiltAt/rebuildWords/spreadDays/backlogCount` 与基线同值；每个词 `due/lvl/st/wrong/wfix` 逐字段一致；`schema===3`。
  - **M2.6** 开关 OFF 时回归队列逐字段等于基线 `rebuildWords` 顺序（与 AC4 交叠复验）。

### S2-AC3 · 任一入队词可解释「今天为什么出现」，文案中性（M）

- **Given**：四类来源各取至少 1 个入队词，另备「队列为空」与「回归态」两个场景；冻结 `t`。
- **When**：查询该词的出现理由（建议 `explainQueueItem(key, ctx)`，只读）。
- **Then**：返回 `来源类别 + 一句中性理由`（逐字见 §4）；禁语表扫描零命中；空/回归场景有定义文案，不得出现催促或负向表达。
- **机器判据（M 类；G10 以封闭禁语表逐条勾选 + 自动正则扫描）**：
  - **M3.1** 四类 fixture 的 `类别` 与 `reason` 逐字等于 §4 对应行；每场景理由为 1–2 句。
  - **M3.2** 对全部理由执行 §4.2 禁语表正则扫描，**命中数 = 0**（差额/百分数/负向词/评分/催促各类）。
  - **M3.3** 空场景返回空态文案（非空白、非 `null`、无负向词）；回归场景返回回归文案，不得含「追上」「旧账」「分钟就能」（`phrases.js:38/46` 基线文案不在新理由复用范围，见 U4）。
  - **M3.4** 查询为只读：调用前后 `JSON.stringify(db)` 不变；不写 `days`、不消耗额度、不调 `rateWord`。
  - **M3.5** 开关 OFF 时，「基线形态」＝不返回 S2 理由（`null` / 无该字段）；`todayPlan.text` 保持基线串原样、不属 S2 中性约束对象（与 AC4/M4.4 对齐，见 §6 U4）。

### S2-AC4 · 打开回退：队列顺序、到期时间、当日额度与固定基线逐字段一致（A · **阶段门**）

- **Given**：一份已启用临界优先（ON）并生成过队列的库 `dbOn`；同时保留其基线版本 `dbOff`（同 `db`、同冻结 `t`、开关 OFF，`dueOf` 升序）。
- **When**：对 `dbOn` 打开回退（开关置 OFF；缺省/非法值按 `strengthMode` 风格归一 OFF；老库经 `ensureSchema` 幂等补键）。
- **Then**：队列顺序、全部到期时间、当日额度、理由文案与固定基线逐项一致；`INTERVAL_CONTRACT` 不变。
- **机器判据**：
  - **M4.1** `queueOnOff.map(k) === baselineQueue.map(k)`（`deepEqual`，顺序严格），基线队列由 L367/L375 的 `dueOf` 升序 + 同一 `slice` 上限复算。
  - **M4.2** 对每个词，`SRS_FIELDS = [due,lvl,st,reps,correct,wrong,wfix,last,first,lastRating,evts,s1]` 逐字段 `JSON.stringify(pick(...))` 相等；`evts`/`s1` 整数组逐元素深等。
  - **M4.3** `db.days[dk]`（含 `planTarget/fresh/review/total`）与 `computeDailyBudget(s, planDailyFresh)` 输出 `deepEqual`。
  - **M4.4** 理由回到基线形态＝不返回 S2 理由；`todayPlan.text` 的基线串原样保留（不属 S2 中性对象）；`schema===3`、`w::` 键集不变（见 §6 U4）。
  - **M4.5** 开关归一：缺失/非法 → OFF；`ensureSchema` 对老库补键后二次调用幂等；ON→OFF→ON→OFF 四步后 `JSON.stringify(db)` 与首次 OFF 态 `deepEqual`（无残留）。
  - **M4.6** `INTERVAL_CONTRACT` 与 `LADDER_DAYS` 逐字段 `deepEqual` 基线；未调用 `rateWord`/`undoRate`。

### S2-AC5 · 策略改动前后：节奏指标 + 四条护栏可对照，护栏只判不恶化（A）

- **Given**：同一冻结种子库派生两组——固定基线组（OFF）与 S2 组（ON）；固定观察窗；包含假认识事件、到期快照、时长记录与中途退出记录；K4 三层分列口径。
- **When**：输出策略改动前后对照报告（建议 `strategyComparison(before, after)`）。
- **Then**：节奏指标与四条护栏（假认识率/积压率/日均时长/中途退出率）均可前后对照且分母可复算；护栏**只判「不可恶化」、不设提升目标**；无提升幅度承诺。
- **机器判据**：
  - **M5.1** 报告含四护栏 + 节奏指标的 `before/after` 数值与分母；独立脚本按口径复算 `deepEqual`。
  - **M5.2** 护栏判定为 `worse|equal|better` 三值之一；「不恶化」= `假认识率/积压率/中途退出率` 不升、`日均时长` 不增（容差由 G2 定，见 U6）；判定为 `worse` 时触发回退（AC4），不设「必须 better」。
  - **M5.3** 报告文本经 §4.2 禁语表扫描零命中；不得出现「提升 X%」「达标」「超过 X% 用户」（K4）。
  - **M5.4** 口径隔离：S2 组未改任何 `due`/`s1`/`INTERVAL_CONTRACT`，对照组行为逐字段等于固定基线（矩阵 B8/B9）。
  - **M5.5** 样本不足时报告标注「观测中」、不输出效果结论（CP1 延长观测原则）；不以次日有效复习完成率等节奏指标替代长期保持率（K4）。

---

## 4. 中性理由文案逐字表

> **键名建议**：新增常量对象 `S2_REASONS`（与 `phrases.js` 现有 `HOME` 同级风格）。**落 `phrases.js` 与否由 G0 终裁**；AC3 只校验「返回值逐字等于下表」，不依赖物理落点（U4）。

**4.1 逐字文案（每类 1–2 句，含空/回归场景）**

| 键名建议 | 来源类别 | 逐字文案 | 事实依据（不臆造） |
|---|---|---|---|
| `S2_REASONS.critical` | 临界 | 「按上次的复习节奏，今天进入复习窗口。」 | `s1[].newIvl/seg` + `L` 落在临界窗口 |
| `S2_REASONS.justDue` | 刚到期 | 「今天到期，安排一次复习。」 | `due ≤ t` 且 `L ≤ Wjust` |
| `S2_REASONS.overdue` | 明显逾期 | 「到期时间已经过去，今天安排一次复习。」 | `due ≤ t` 且 `L > Wc` |
| `S2_REASONS.wrongBack` | 错词回流 | 「这个词之前答错过，今天再练一次。」 | `wrong>0` / `wfix>0` |
| `S2_REASONS.empty` | 空态 | 「今天没有到期的词。」 | 队列为空 |
| `S2_REASONS.returning` | 回归态 | 「今天先从到期的词开始，分几次安排。」 | `isReturn===true` + `spreadDays` 分日平滑 |

**4.2 禁用词表（G10 正则扫描，命中数须 = 0）**

| 类别 | 禁用表达（示例，正则等价） |
|---|---|
| 差额 / 欠账 | `还差\s*\d`、`还差.{0,4}天`、`差\s*\d+\s*天`、`欠账`、`积欠`、`旧账`、`欠\s*\d`、`清了` |
| 负向 / 评价 | `落后`、`断签`、`已断`、`退步`、`垫底`、`追上`、`赶上`、`赶紧`、`抓紧`、`马上`、`立刻`、`必须`、`应该` |
| 百分数 / 正确率 | `\d+\s*%`、`\d+\s*％`、`正确率`、`准确率`、`达标率`、`完成率`、`超过.{0,8}用户`、`击败.{0,8}用户` |
| 评分 / 比较 | `得分`、`评分`、`评级`、`分数`、`更好`、`更差` |

> 说明：现有 `phrases.js:38` `returnMain`（「…今天 18 分钟就能追上」）与 `:46` `pauseText`（「今天先把旧账清了…」）**命中禁语表**，属既有基线文案、本卡不改；新理由不得复用其措辞，回退形态由 U4 终裁。

---

## 5. 验收清单（13 条布尔判据，G10 逐项勾选）

| # | 布尔判据（勾＝通过） | 派生 AC | G10 自动验证方法 |
|---|---|---|---|
| 1 | 临界词严格排在刚到期与明显逾期之前，且存在 `due(c)>due(o)` 而 `idx(c)<idx(o)` 的证伪对 | AC1 / M1.2-1.3 | 表驱动 fixture 断言索引关系；证伪对存在性断言 |
| 2 | 排序可按「类别 + 临界程度」独立复算，同输入两次 `deepEqual`，入队词集合不变 | AC1 / M1.4-1.5 | 独立脚本按 §2.1 重排 `deepEqual`；两次调用比对；key 集合比对 |
| 3 | AC1 调用零写库，`schema===3`、`w::` 键不变 | AC1 / M1.6 | `JSON.stringify(db)` before/after 比对（显式排除开关键） |
| 4 | 回归首日入队 ≤ 当前每日上限，包内按 `L` 降序（高逾期优先） | AC2 / M2.1-2.2 | 注入 `lastSeen=t−7d`+120 词；断言 `length≤U` 与降序复算 |
| 5 | 余量分日平滑、`spreadDays` 与基线一致、逐日均不超上限，无新词/毕业词混入 | AC2 / M2.3-2.4 | 推演逐日队列断言上限；成员 ⊆ 到期积压集合 |
| 6 | 回归不改变 `rebuildWords/spreadDays/backlogCount` 与全部词 `due/lvl/st/wrong/wfix` | AC2 / M2.5-2.6 | 与基线逐字段 `pick()` `JSON.stringify` 比对；OFF 态顺序 `deepEqual` |
| 7 | 四类 + 空 + 回归场景理由逐字命中 §4.1，禁语表扫描零命中 | AC3 / M3.1-3.3 | 逐字 `deepEqual` + §4.2 正则全集扫描（命中数=0） |
| 8 | 理由查询零写库、不消耗额度；OFF 时回退到基线形态 | AC3 / M3.4-3.5 | db 字节全等 + AC4/M4.4 联验 |
| 9 | 回退后队列顺序与 `dueOf` 升序基线 `deepEqual`（**阶段门**） | AC4 / M4.1 | 同冻结 `t` 复算基线队列逐项比对 |
| 10 | 回退后全部词 SRS 字段（含 `evts`/`s1`）与 `days[dk]` 额度逐字段一致（**阶段门**） | AC4 / M4.2-4.3 | `pick(SRS_FIELDS)` 逐字段串比对 + 额度对象 `deepEqual` |
| 11 | 开关缺省/非法归一 OFF、老库 `ensureSchema` 幂等、四步切换无残留；`INTERVAL_CONTRACT` 不变 | AC4 / M4.4-4.6 | 构造非法值与老库 fixture；ON→OFF→ON→OFF 后 `deepEqual` |
| 12 | 四护栏 + 节奏指标前后可对照、分母可复算，护栏只判不恶化、无提升承诺 | AC5 / M5.1-5.3 | 报告字段断言 + 独立复算 + §4.2 禁语扫描 |
| 13 | 全量 `node verify.mjs` PASS `331+N`、失败 0、460 词、QA 34/0；既有 27 测试文件逐字未改 | AC5 / 卡 §2 | 门禁命令解析输出；`git diff --name-only` 白名单校验 |

> **阶段门复验**：#9/#10/#11（AC4）+ #1/#2（AC1）全勾，才允许进入阶段三；AC5 护栏判定为 `worse` 时先回退（#9~#11），不得带病推进。

---

## 6. 未决问题处置状态（G1 PRD ↔ G2 契约 design-s2.md v1.1 会签后）

> 编号沿用本 PRD 初版 U1~U6；G2 契约 §9 另有 U1~U7 编号，映射：G2-U1↔本文 U1、G2-U2↔本文 U3（开关部分）、G2-U3/U4↔本文 U4、G2-U5↔本文 U5、G2-U6↔本文 U6、G2-U7↔本文 U2。已会签消解的不必再上 G0；**零项待 G0**（U1/U2/U6 均已由 D-071/D-072/D-073 闭合，见本节末）。

- **U1 · 临界窗口阈值 / 临界程度标量（已闭合 · D-071）**：G2 已定 `q=L/newIvl`、`qLo=0.5/qHi=2` 四档并写死 q 档→类别映射（`q<qLo→justDue`、`qLo≤q≤qHi→critical`、`q>qHi→overdue`、`wrong>0→wrongBack`；无 s1 / 信息不足 → `justDue` 安全缺省（**不新增第 5 类**）），G1 会签公式与映射；`seg` 仅作 `intervalSeg` 同源事实、不进核心公式。阈值数值 `qLo=0.5/qHi=2` 已由 D-071 拍板（须真实数据回填路线 C9），不臆造。
- **U2 · 回归首日上限与 `rebuildCap=40`（已闭合 · D-072，取选项①）**：G2 实跑 `computeDailyBudget`：`fresh=5→12 / 10→23 / 15→35 / 20→47`（封顶 60），确认 `fresh≤15` 时 `reviewTarget<40` 冲突属实（G2 v1.0 曾用 `40≤reviewLimit(60)` 论证，违反 K5，已自纠）。D-072 已终裁：**① 回归态「每日上限」= `rebuildCap=40`（守 C6/K5 零改动）**；否决② `min(rebuildCap,reviewTarget)` 硬截断（会改 `rebuildWords`）。M2.1 的 `U` 按①=40 判等（`queue.length===40===U`）。
- **U3 · 开关落点 + L 口径（已会签消解）**：开关 `settings.criticalSort` off/on、缺省 OFF、非法归一 OFF、老库 `ensureSchema` 幂等补、SCHEMA 恒 3，G2 已写死。**L 必须取 `dueOfWord(db,rec)`，不取 `rec.due`**——G1 撤回初版「建议只读 `rec.due`」：strengthMode ON 时 `dueOfWord=strengthDue`，而 backlog 成员按 `dueOf` 筛选（L362），取 `rec.due` 会口径错配。本 PRD §2.0 原定义即为 `t−dueOfWord(db,rec)`，一致；不再列未决。
- **U4 · 理由展示位与回退形态（已会签消解）**：新理由为独立只读查询（`explainQueueItem`），**不覆盖 `todayPlan.text`**；`phrases.js:38/46` 基线串（追上 / 旧账）原样保留、**不在 S2 中性约束范围**；OFF 时「基线形态」＝不返回 S2 理由（`null` / 无该字段），`todayPlan.text` 自然回基线。M3.3 / M4.4 据此判等。
- **U5 · 「词价值」排序因子（已写死，非未决）**：正常态复合键仅 `wrongBack` 经 rank 入序，`cet4`/`lvl` 不引入（守不新增行为）；类别序 `critical<wrongBack<justDue<overdue`，「临界最小」硬约束保留。
- **U6 · 护栏口径与容差（已闭合 · D-073）**：`worse|equal|better` 三态已写死；四护栏容差按 D-073 分粒度：假认识率/复习积压率/中途退出率计数型容差=0（分母 0→`null`），日均时长仅 `estMinutes` 估算、差值 ≤1 分钟为 equal（禁称「实测」），观察窗前后各最近 7 自然日（有效日 <3→`null` 标样本不足）、`worse` 触发 AC4 回退；坚持只判不恶化、不设提升目标（K4）。

**零项待 G0**：① `qLo/qHi` 已由 D-071 拍板（U1）；② 回归态每日上限取 `rebuildCap=40` 已由 D-072 拍板（U2）；③ 四护栏容差已由 D-073 拍板（U6）。G1/G2 全项会签，G3 按契约 v1.5 + D-070~D-073 实现即可。

---

## 7. 明确不做（本卡红线）

- **不做阶段三**：改间隔生成、个体化下次时机、临界重排（K3 红线，须重新立项裁决）；不动 `schedule`/`strengthDue`/固定阶梯初值/新间隔参数。
- **不改任何 `due`/`lvl`/`st`/`reps`/`wfix`**：S2 为排序叠加层，只重排队列返回，不改排期结果；`s1` 观测层（L268–298、L2149–2253）只读消费、不改不扩字段。
- **不新增 UI 操作**：不加按钮/入口/提示/徽标/统计卡；不新增用户可见动作；`index.html` 加载序列不动（理由展示位 U4 终裁前不实现）。
- **不改 `returnGuard`/压力熔断逻辑**：`detectReturn`、`buildRebuildPack`、`pressureThreshold`、`rebuildWords`、`spreadDays` 保持原样；恢复/暂停/配额/撤销/发音/桌宠/开箱仪式零改动（矩阵 B8/B9、卡 §3.4）。
- **不升 SCHEMA**：恒 3；不加版本标记；不改 `w::` 键；不改 `defaultDB` 既有键语义（U3 除外的新键由 G2 写死）。
- **不碰 B 仓库**：`E:/dsh-workspace/word365` 只读参考、零写入、零照搬（尤其 `dueWords`/`queue` 写法与「还差 N 天」「正确率 X%」等差额表达）。
- **不改既有测试**：27 个测试文件逐字不动；新测试仅独立文件（如 `tests/core.test.s2.mjs`），`verify.mjs` EXPECT 由 G0/G3 同步更新（G1 不改该文件）。
- **不写主观判据**：AC 无「提升体验/更直观/更流畅」类表述；护栏只判不可恶化、不承诺留存/掌握率提升（矩阵 §9）。

---

## 8. 版本记录

| 版本 | 日期 | 内容 |
|---|---|---|
| **v1.1** | **2026-11-19** | G10 `R-032` 复核 G32-F01（P3）精确化：§2.0「信息不足兜底」、M1.1、§6 U1 三处 `fallback` 措辞统一改为「信息不足 → `justDue` 安全缺省（D-071，不新增第 5 类）」，与契约 v1.5 及 D-071 一致，类别值域恒四值、AC 判据语义不变。§6 状态同步终裁：U1/U2/U6 由「待 G0」改为已闭合（D-071/D-072/D-073），加「零项待 G0」。头部版本 v1.0→v1.1。其余逐字不动。 |
| **v1.0** | **2026-11-19** | 首版。基于 G0 08:59 实测并经 G1 独立复核（`verify.mjs` EXPECT 27 文件 / 331 项 / 460 词 / QA 34/0；HEAD `e4839a6`）；产出范围声明、四类来源分类规则（仅用落盘事实）、S2-AC1~AC5 五条 Given/When/Then + 机器判据（A/M 标注）、中性理由逐字表与禁语表、13 条验收清单、6 个 G2 未决问题、明确不做清单。AC 为上游路线 §5/§6/§8、矩阵 §2/§6/§7 在 A 仓库的落地映射，未新增编号、未改阶段门 S2-AC1∧S2-AC4。**同日 G1↔G2 会签补记（不改版本号）**：§2.2 增「层次边界消歧」段（M2.2 只约束派生执行队列、持久化包逐字不动，消解 U6 分歧）；§6 改为处置状态——U3（L 取 `dueOfWord`，G1 撤回 `rec.due` 建议）、U4（新理由不覆盖 `todayPlan.text`）、U5（仅 `wrongBack` 入序）已会签消解，仅 U1 阈值 / U2 上限选项 / U6 容差三项留 G0 终裁；M2.1/M3.5/M4.4 与 §0 术语表同步。 |

*本 PRD 是卡片 #032 的产品验收真源；与上游冲突时以上游主文档裁决为准，A 仓库字段事实以本卡读码复核为准；函数命名与阈值常量以 G2 契约终裁为准。*
