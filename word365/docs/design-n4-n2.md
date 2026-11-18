# 背单词365 · N4 时长接线 + N2 默写阶梯 · 增量设计契约

> **文档性质**：增量设计契约（Design Contract）——只定义「字段 / 函数签名 / 数据契约 / 任务顺序 / 风险 / 红线」，**不含可复制的函数体实现、不替 G3/G4 写代码**。
> **执行组**：G2 · 架构与任务分解（任务卡 **#004**）
> **文档版本**：v1.3 · 2026-11-14（按 D-005/D-009/D-011/D-012/D-013/D-019 收敛状态栏与红线，见文末版本记录）
> **上游**：`docs/prd-n4-n2.md` v1.1（G1 已定稿，D-001 锁定 AC 编号体系；D-009/D-013/D-015 有界修订，见 §8A）→ 《背单词365_v3.0_学习效果与活跃度增强方案》§2.1/§2.2/§2.5、§5.3/§5.1/§5.5 → 《背单词365 · 阶段一 P0 增量 PRD》AC 编号体系 → 《背单词365_AI分组协作管理总纲》v1.2 → `365-groups/README.md`、`365-groups/G2-architecture/BOUNDARY.md` → **G0 裁决 D-001 / D-004（§0.6）**
> **下游**：G3（#005，core / phrases / 独立 core 测试）、G4（#006，app.js / index.html 引入行 / app.css / 独立 ui 测试）→ G8（#008 回归判定）；G1 对本文「会签项」会签、G0 对「待拍板项」裁决
> **交付落点**：本文件 `word365/docs/design-n4-n2.md`（本任务卡**唯一写入文件**）

---

## 0. 文档头（基线 / 来源层级 / 边界声明）

### 0.1 基线截止时点（写前声明）

| 项 | 值 |
|---|---|
| 目标仓库 | **A 仓库** `E:/WorkBudy_WorkSpace/word365/`（纯静态 Web 版） |
| 基线截止时点 | **2026-11-14 21:03** |
| A 仓库全量 | **161 项 / 7 文件 / 0 失败**（25+49+33+9+24+8+13），7 文件见 `word365/README.md` 文件结构 |
| A 仓库数据 | `check-data.mjs` → **460 词 / 5 本 / 跨书零重复通过** |
| 本组写前复跑 | 已只读复跑一次：`node --check js/core.js js/app.js js/phrases.js js/pet.js` 通过；`node --test`（显式 7 文件）**161 / pass 161 / fail 0**；`node tests/check-data.mjs` 全部通过。与 21:03 基线**无漂移**（见开工回执） |
| `SCHEMA` | **3**（红线，见 §8） |

> 本文为**纯文档产出**，不改动任何源码 / 测试 / README，不构成基线漂移；写后由本组再只读复跑一次并入交付回执，最终回归判定归 #008(G8)。

### 0.2 事实来源层级口径

本文沿用 PRD §0.2 的**三层标注**，不新增第四层：

| 标记 | 含义 | 本文落点 |
|---|---|---|
| **【实测】** | 对 A 仓库源码 / 测试命令只读核实所得，可逐行复现 | §1 全部现状事实、§0.1 基线数字、§1.2 既有测试约束、§7 风险的事实依据 |
| **【规划】** | 本期要达成的验收目标与 G2 裁定的设计契约（字段 / 函数 / 任务 / 红线） | §2 ~ §6、§9、§10 |
| **【推断】** | 由实测事实推出的判断，尚未在 A 仓库落地验证 | §1.2「既有断言与 AC 冲突」的因果判定、§4.3「四处同步」的漏改推断 |

> 凡未在 §1 标注【实测】的档位 / 阈值 / 判定线均为【规划】的设计取值，非实测、非预测；目标值待 G3 契约落地与 G8 回归后回填。§0.6 的 G0 裁决为【规划】级的已定输入（台账登记归 G0）。

### 0.3 边界声明

1. **不写码**：本组不写任何 `.js` / `.css` / `.html` / `.mjs`，不写 `tests/**`，不写各仓库 `README.md`、G1 的 `docs/prd-*.md`（只读）、G7 的 `背单词365_遗忘曲线*.md`、总纲、`365-groups/**`、`.workbuddy/memory/**`。本任务卡唯一写入文件为本文件。
2. **不替 G1 改 AC**：§4 的 23 条 AC 编号（`N4W-AC01~12` / `N2L-AC01~11`）**零改动、零重造、零续号**；本文只把 AC 翻译成可实现的契约，可提「不可行 / 需会签 / 需裁决」，**不自行改需求、不改判定逻辑**（BOUNDARY.md §6-4）。AC08 入参示意的签名解释见 §7-R2，属「G1 会签」而非本文擅改；G0 D-004 引用的 `N4-AC16` 为 v3.0 方案验收前提，本批 AC 仍以 `N4W-*` / `N2L-*` 为准。
3. **不替 G3/G4 写实现**：本文给签名、入参出参、判定表与不变式，**不给函数体、不给完整算法公式、不给常量取值**；函数名、参数顺序、内部公式一律由 G2 定（PRD §7.2 明确授权），具体编码归 G3/G4。
4. **双仓库口径（总纲 C12 / §2）**：本文所有「已落地 / 未落地 / 测试项数」结论**仅针对 A 仓库**并带路径；B 仓库不在本任务范围，其实现与数字一律不写入本文。
5. **依赖位置**：G2 串行于 G1 之后、为 G3/G4 的硬上游；本文冻结后 G3/G4 方可开工。

### 0.4 AC 编号锁定（23 条，零改动零重造）

| 号段 | 条数 | 出处 | 本文处置 |
|---|---|---|---|
| `N4W-AC01` ~ `N4W-AC12` | 12 | PRD §4.2 | 逐条映射到 §3.3「函数 → AC 覆盖矩阵」，编号原样引用 |
| `N2L-AC01` ~ `N2L-AC11` | 11 | PRD §4.3 | 同上 |
| `C-AC1~7` / `I-AC1~5` / `J-AC1~5` / `N2-AC*` / `N4-AC*` / `S1-AC*` 等 | — | 既有文档 | **只读引用**，不复用、不覆盖、不续号 |

> AC 编号权威（K8）归 G1；本文是设计契约，QA 只判定。**G0 D-001 已终局确认 PRD v1.0（23 条 AC / §9 交付登记完整）为准，本契约 §0.4 / §3.3 与之对齐、无需回灌。**

### 0.5 G0 已裁决的 6 个 Open（作为已定输入，不再列为待拍板）

| 编号 | 裁决结论 | 本文承接位置 |
|---|---|---|
| **OP-01** | 本批**不扩展**档位集合，`DAILY_MINUTE_OPTIONS` 保持 `[10,20,30]`；D-3 用「查表 + 下限取当前集合最小档」，与集合大小解耦 | §2-F2、§3.1-P5、§4.3、§8-13 |
| **OP-04** | 老库 `ensureSchema` 补 `ladder.mode='auto'`，但当日已选题型与已落库评级不回滚，提供 `manual` 一键退回 | §2-F1、§3.1-P4、§5、§7-R5 |
| **OP-06** | 三问重做允许写 `goal.dailyMinutes`，但**必须同步写 `settings.dailyMinutes`**（唯一真源） | §2-F2/F3、§4.1、§6-T03 |
| **OP-02** | **归 G2 在契约里定**，须守「不引入 v3.0 完整 `byType`/`sessions` 埋点体系」；**据 G0 D-004 精确化补充下限：必须保留最小 `days[dk].byType` 分桶**（§0.6、§2-F4） | §2-F4、§3.1-P3、§3.2、§4.4、§8-7、§7-R4（仅 OP-05 会签） |
| **OP-03** | **归 G2 在契约里定**，须守「`dailyCompletionRate` 空值用 `null` 且不新增第二个完成率函数」 | §2.2、§3.2、§4.4、§7-R3 |
| **OP-05** | **归 G2 在契约里定**，须守「`freshLimit` 继续作 cap、`reviewRatio` 配比口径与阶段一 `C-AC5` 对齐，不要另造冲突配比」 | §3.1-P1/P2、§4.2/§4.4、§7-R4（G1 会签） |

### 0.6 G0 补充裁决（D-001 / D-004 / D-011，作为已定输入，不再列为待拍板）

> 本节据 team-lead 转呈的 G0 裁决落地。G0 声明「之后所有裁决统一登记进 `365-groups/DECISIONS.md`（G0 建），以台账为准，不再靠消息文本」；本组禁写 `365-groups/**`，仅据裁决内容修订本契约，台账登记归 G0。

| 裁决 | 结论 | 本文承接 |
|---|---|---|
| **D-001**（PRD 版本终局） | G1 曾因一条矛盾裁决短暂覆写 `prd-n4-n2.md` 为 v2.0，**现已回退**；G0 终局裁定 **v1.0 为准**（36096 字节 / 23 条 AC / §9 交付登记完整），任务卡 #004 输入完全有效；**不改 PRD、不等待任何补充裁决** | §0.1/§0.4/§3.3 维持 v1.0 口径；**§7-R6 关闭** |
| **D-004**（v3.0 方案内部 3 处硬冲突，取「F12 / F5 最终裁定 + §0.4 不做清单」为准） | ① **不实现 `userChosenSlot`**（F12）；② **`autoRebalance` 键删除且不读取**（F5），不引入 v3.0 `N4-AC18` 式「保留读取该开关」的增量需求；③ **不引入 v3.0 §6 完整埋点体系**（`db.sessions[]` 30 天裁剪 / `dueTomorrow` / `reviewOnTime` / `opened` / `firstAnswerAt` / `endReason` / 撤销窗口同源回滚）；`estMinutes` 题型敏感**只做行为可测** | 三条**写入 §8 红线清单、不作为待拍板项挂起**；§7-R4 的 OP-02 部分据此收敛 |
| **D-004 精确化**（`byType` 下限，不改变结论、只补边界） | 上条「不引入 `byType`/`sessions` 全量埋点」措辞过宽：**必须保留最小 `days[dk].byType` 分桶**（`{flash:{n,ms}, type:{n,ms}, choice:{n,ms}}`，仅 n/ms 与题型封顶）。依据：v3.0 §6 L416 硬约束「若工程拒绝按题型分桶，**N4 不做降级、整体延后**，降级实现比不实现更糟」；`N4-AC16`「10±2 分钟」验收依赖按题型加权均时；N2 把复习从选义(~15s)升级到写出英文(~50s)后，混合均值会让 10 分钟档实际读 25 分钟。与 G1 v1.0 的 OP-02（只要求行为可测、不引入完整埋点体系）不冲突，是其**下限补充** | **§2-F4 列为最小必需字段**（可选加法键、`ensureSchema` 幂等、`SCHEMA=3`）；§8-7 写明「不做 sessions/北极星/撤销回滚，**但不得删 byType**」；§3.1-P3 数据来源改为该分桶 |
| **D-011**（二次精确化 D-004②） | **`autoRebalance` 数据键保留为死数据**（不清理、不读取、不迁移）；删除的是 **UI 开关与代码读取路径**（`app.js:2097/2098/2313-2315`、`core.js:441/867` 读取分支）；`defaultDB()` 仍返回 `autoRebalance: true` 以保既有 `core.test.phase1.mjs:58`（六字段含该键）/`:65`（`=== true`）断言通过，**但任何生产路径不得再读它**。原 D-004②「键删除且不读取」措辞过宽（物理删键会再破 2 条既有断言），**以 D-011 为准** | §8-16 红线改写；§0.6 本节登记；T02 / T03 落地；既有 161 项 0 失败口径不变 |

> **边界**：本组不替 G1 改 AC（D-004 引用 `N4-AC16` 仅为 v3.0 验收前提依据，本批 AC 仍以 `N4W-*` / `N2L-*` 为准、零改动）；D-004 三条按 G0 指示写入红线、不挂起、不新增风险条目。

---

## 1. 【实测】现状事实复核（本组写前只读核实）

> 本节全部为【实测】。G0 任务卡列出的代码事实已由本组**逐条自行复核、全部一致**（非凭 PRD 推断）；行号针对 2026-11-14 21:03 的 A 仓库。

### 1.1 关键事实表

| 主题 | 位置 | 核实结论 |
|---|---|---|
| 常量红线 | `js/core.js:11 / :14 / :17` | `SCHEMA=3`；`LADDER_DAYS=[1,2,4,7,15,30,60]`（固定阶梯红线）；`SEC_PER_WORD=35` |
| 默认设置 | `js/core.js:41-60 / :62-121` | `defaultSettings()` 含 `freshLimit:20, reviewLimit:60, dailyMinutes:20, reviewRatio:0.7, autoRebalance:true`；`defaultDB()` 含 `settings/petState/books/customBooks/words/days/goal/plan/baseline/returnGuard/onboarding/exam/binding`；`goal.dailyMinutes=20`(:77) |
| 词条记录 | `js/core.js:123-141` | `newRecord` = `{w,lvl:0,st,due:0,reps:0,correct,wrong,wfix,star,note,last,first,lastRating,srcBook,graduated:false}`；`reps===0` 即新词 |
| 评级三分支 | `js/core.js:185-208` | `know` / `fuzzy` / `unknown`，落 `lvl/due/st/wfix/wrong` 与 `days[dk]` 计数 —— **红线零改动** |
| 今日计划 | `js/core.js:247-296` | 三态 `rebuild/pause/normal`；正常态调 `computeDailyBudget(s, db.plan && db.plan.derivedAt ? db.plan.dailyFresh : 0)`(:271)，用 `bud.freshTarget` 算 `freshQuota`、`bud.reviewTarget` 截 reviews；写 `db.days[dk].planTarget`(:286) |
| 导入导出 | `js/core.js:383-409` | `exportJSON` 整库克隆；`importJSON` 校验 `data.schema` 后 `migrateOldKeys` + `ensureSchema`(:407) |
| 幂等补齐 | `js/core.js:418-448` | `ensureSchema` 加法补 `goal`(:420)/`plan`/`baseline`/`returnGuard`/`onboarding`/`exam`/`binding`；`s.dailyMinutes == null → 20`(:436)；补 `word.graduated`；**不改 `db.schema`** |
| 派词预算 | `js/core.js:639-645` | `computeDailyBudget(s, planDailyFresh)`：`freshTarget = hasPlan ? Math.min(planDailyFresh, s.freshLimit) : s.freshLimit`(:641，**封顶点 1**)；`reviewTarget = Math.round(freshTarget*s.reviewRatio/(1-s.reviewRatio))` 并钳 `s.reviewLimit`；返回 `{freshTarget, reviewTarget}`；**不读 `dailyMinutes`** |
| 计划推导 | `js/core.js:663-694` | `buildPlan(db)` 只读 `g.type/g.deadline`，**不读 `g.dailyMinutes`**；`dailyFresh = 考试型 ceil((total-mastered)/daysLeft) : 自由型 s.freshLimit`；`estMinutes = Math.round((dailyFresh+dailyReview)*SEC_PER_WORD/60)`(:683) 是**输出**；写 `db.plan` |
| 完成率 | `js/core.js:847-851` | 无 `days[dk]` → `0`；`planTarget` 缺失或为 0 → `0`；否则 `Math.min(1, total/target)` |
| 再平衡 | `js/core.js:857-878` | 7 日 rate 求均值；`rate<0.70` → `newMin = Math.max(10, s.dailyMinutes - 5)`(:865) → `if (s.autoRebalance) s.dailyMinutes = newMin`(:867) **写唯一真源**；`rate>0.95` 产出 `aheadDays` |
| 计划卡取值 | `js/core.js:897-900` | `planCardDailyFresh(plan, freshLimit)` = `Math.min(planDaily, freshLimit)`(**封顶点 2**，:899)；`app.js:265` 用它渲染 |
| 暴露面 | `js/core.js:1325-1400` / `js/phrases.js:200-218` | `window.Core` + `module.exports` / `window.PHRASES` + `module.exports`，**双暴露** |
| 档位枚举 | `js/phrases.js:21 / :202` | `DAILY_MINUTE_OPTIONS=[10,20,30]`，随 `PHRASES` 导出 |
| 档位消费点 | `js/app.js:442 / :2084 / :2082` | `:442`、`:2084` 读常量；**`:2082` 写死副标题字符串 `'10 / 20 / 30 分钟'`（非常量，最易漏）** |
| 计划卡渲染 | `js/app.js:265` | `Core.planCardDailyFresh(db.plan, freshLimitA)` |
| 三问落库 | `js/app.js:375-392 / :494` | `ob.dailyMinutes = db.goal.dailyMinutes \|\| 20`(:381)；`commitGoal()`(:384-392) **只写 `db.goal`**（`dailyMinutes: ob.dailyMinutes`），**不写 `settings.dailyMinutes`** —— OP-06 修复点 |
| 重做三问 | `js/app.js:591-596` | `redoGoal()` 重置 `onboarding.step/skipped` 后 `nav('#/onboard')` |
| 设置页写真源 | `js/app.js:2274` | `db.settings.dailyMinutes = parseInt(el.getAttribute('data-min'), 10)` |
| 题型手选 | `js/app.js:779 / :934` | `MODE_LABELS={flash,type,choice,match}`；学习页 tab 与 `#/study?...&mode=` 决定题型 |
| 14 天图 | `js/app.js:2005-2013` | 对窗口内 14 天**无条件**调 `Core.dailyCompletionRate`，`crate=0 → ch=0 → 仍输出 `bar-col`/`bar-num`/`0%` 柱（D-6） |
| 引入顺序 | `index.html:40-49` | `data(5 本) → phrases → core → pet → app` |
| 全仓无埋点 | 全仓只读搜索 | 无 `SLOTS` 常量、无 `ladder` 字段、无 `byType` / `sessions` 埋点；`SCHEMA` 恒为 3（**现状如此；本期按 D-004 精确化新增最小 `days[dk].byType`，见 §2-F4**） |

### 1.2 既有测试对本期改动的约束（161 项零改动的关键边界，【实测】）

> 本节是本组**新增核实**（PRD §2 只实测源码、未实测既有测试断言），是「既有 7 文件 161 项断言零改动 + 全量 161 项 0 失败」红线能否成立的决定性依据。

| 既有断言（文件:行） | 输入形态 | 断言值 | 对契约的约束 |
|---|---|---|---|
| `core.test.phase1.mjs:404` | `dailyCompletionRate(db,'nope')`，**无 `days[dk]`** | `0` | 「无日记录」必须仍返回 `0`，**不得**改成 `null` |
| `core.test.phase1.mjs:405-406` | `days[dk]={total:5, planTarget:0}`，**`planTarget` 字段存在且=0** | `0` | 「存在 planTarget（含 0）」必须沿用 `Math.min(1,total/target)` |
| `core.test.phase1.mjs:401-403` | `{total:10,planTarget:10}` / `{total:5,planTarget:10}` | `1` / `0.5` | 正常完成率口径零改动 |
| `core.test.hardening.mjs:191` | `rateWord` 后 `days[dk]` 存在、**无 `planTarget` 字段**、`total=1` | `0` | 「无 planTarget 但 `total>0`」必须仍返回 `0` |
| `core.test.v3b.mjs:300` | 同上（注释「planTarget=0 的既有语义」） | `0` | 同上 |
| `core.test.v3.mjs:404-406` | `todayPlan` 后 `planTarget` 存在 | `0` / 设 1 → `1` | `todayPlan` 写 planTarget 行为零改动 |
| `core.test.phase1.mjs:688` | rebuild 态 `planTarget=18, total=0` | `0` | 有 planTarget 时的 0% 柱语义零改动 |
| `core.test.phase1.mjs:419` | `weeklyRebalance` 低完成率 | **`db.settings.dailyMinutes === 15`** | **与 N4W-AC05 冲突**（见下） |
| `core.test.phase1.mjs:577 / :579` | 连续两次 `weeklyRebalance` | `20→15→10` | **与 N4W-AC05/06 冲突**（见下） |
| `core.test.phase1.mjs:140 / :156` | `buildPlan(db).estMinutes` | `Math.round((dailyFresh+dailyReview)*SEC_PER_WORD/60)` | 无题型构成入参时 estMinutes 必须回退单一 35s 公式 |
| `core.test.hardening.mjs:189` | `computeDailyBudget(db.settings,12)` | `.freshTarget === 12` | 默认档（dailyMinutes=20）下预算行为不得变 |
| `core.test.phase1.mjs:97-110 / :387 / :651-657` | `computeDailyBudget` 多组（7:3 / 无计划=20 / 超上限封顶=20） | 既有值 | 配比口径与封顶行为对默认档零改动 |
| `core.test.phase1.mjs:662-670` | `planCardDailyFresh(plan,20)` 六组 | 20/10/20/20/20/20 | 两参旧调用行为零改动 |
| `core.test.phase1.mjs:58 / :78`、`core.test.v3.mjs:343` | `defaultDB()` 字段与默认值 | `dailyMinutes=20`、`schema=3` | 默认值与 SCHEMA 零改动 |
| `core.test.phase1.mjs:58 / :65` | `defaultDB().settings.autoRebalance` | 字段存在 / `=== true` | **D-004/F5「键删除且不读取」落地时，既有键的物理删除须以既有 161 项零改动为界**（§8-16 实现约束）；本批不新增读取路径 |

**【推断】头号冲突（§7-R1 的事实依据）**：N4W-AC05 要求 `weeklyRebalance` **不写 `settings.dailyMinutes`**、N4W-AC06③ 要求全仓不存在 `dailyMinutes - 5` 算术与 `Math.max(10,…)` 兜底；而既有 `core.test.phase1.mjs:419`、`:577`、`:579` 共 **3 条断言 / 2 个 test** 明确断言 `weeklyRebalance` 写真源且降量为 `-5`（20→15→10）。二者作用于**同一个 `Core.weeklyRebalance` 函数**，无法在实现层兼得「既有 161 项 0 失败」与 AC05/06。且 `DAILY_MINUTE_OPTIONS=[10,20,30]` 下 20 的前一档是 10、根本不是 15，`===15` 不可能与「档位查表」共存。**该冲突须 G0 台账裁决，本文不擅自改 AC、不擅自放宽红线**（§7-R1、§10）。

**其余改动均可「加法式兼容」**：`dailyCompletionRate` 的 `0`/`null` 边界可按「`planTarget` 字段是否存在 × `total` 是否为 0」精确切分（§2.2），使上述 5 处既有断言全部继续通过。

---

## 2. 【规划】数据契约：字段

> 每个字段条目均给出：**类型 / 默认值 / 归属对象 / 兼容路径**（老库首开 · 导出导入往返 · 脏值兜底）。字段契约共 **4 项**：新增 2（`db.ladder.mode`、`days[dk].byType`【D-004 精确化：最小必需字段】）、语义变更 2（`settings.dailyMinutes` 升级唯一真源、`goal.dailyMinutes` 降级只读快照）；函数返回结构契约另列 §2.2（3 项）。

### 2.1 字段总表

| 编号 | 字段 | 类型 | 默认值 | 归属对象 | 性质 |
|---|---|---|---|---|---|
| **F1** | `db.ladder.mode` | `string`，二值枚举 `'auto' \| 'manual'` | `'auto'` | `db.ladder`（**新增顶层对象**） | 新增 |
| **F2** | `settings.dailyMinutes` | `number`，枚举值 ∈ `PHRASES.DAILY_MINUTE_OPTIONS`（当前 `[10,20,30]`） | `20` | `db.settings` | 既有字段**语义升级为唯一真源** |
| **F3** | `goal.dailyMinutes` | `number`，枚举值 ∈ 同上 | `20` | `db.goal` | 既有字段**降级为只读快照** |
| **F4** | `days[dk].byType` | `object`，`{flash:{n,ms}, type:{n,ms}, choice:{n,ms}}`（仅 `n`/`ms` 两个量、按题型分桶） | 缺失即不补（按日按需写）；若补齐则各题型 `{n:0, ms:0}` | `db.days[dk]`（**新增可选加法键**） | 新增（**D-004 精确化：最小必需字段，不得删**） |

### F1 · `db.ladder.mode`（新增）

- **类型**：`string`，二值枚举 `'auto' | 'manual'`；`db.ladder` 为 `{ mode: <二值> }` 的新顶层对象。
- **默认值**：`'auto'`（OP-04 裁决）。
- **归属对象**：`db.ladder`（`defaultDB()` 顶层加法键；**不新增影子字段、不新增 `userChosenSlot` 类键**，D-004/F12）。
- **语义**：`'auto'` = 复习额度内按 `lvl` 自动上移题型；`'manual'` = 沿用用户手选题型、不上移。只决定「怎么再见」，不改 `lvl/due`（§3.1-P4 护栏）。
- **兼容路径**：
  - **老库首开**：`schema=3` 且无 `db.ladder` → `ensureSchema` 以「缺失才补」追加 `db.ladder={mode:'auto'}`，`db.schema` 仍 3、不补发任何历史数据（PRD §7.3-1）。
  - **导出导入往返**：随 `exportJSON` 整库克隆保留；`importJSON` 末尾 `ensureSchema` 对缺键老备份同规则补齐；未知键忽略、不报错、不阻断导入、**不抬 SCHEMA**。
  - **脏值兜底**：`db.ladder` 缺失 / 非对象 / `mode` 非二值 → 归一为 `{mode:'auto'}`；幂等（连续两次调用逐字段一致）。
  - **一键退回**：切 `'manual'` 时，当日**已选题型与已落库评级不回滚**（N2L-AC09）。保证来自 §3.1-P4「无状态纯函数、每次即时计算、不缓存、不写库」，而非额外状态字段。
- **映射 AC**：N2L-AC01 / AC09 / AC10 / AC11。

### F2 · `settings.dailyMinutes`（语义升级为唯一真源）

- **类型**：`number`，合法集合 = `PHRASES.DAILY_MINUTE_OPTIONS`（OP-01：本批保持 `[10,20,30]`，不扩展）。
- **默认值**：`20`（既有 `defaultSettings()` 与 `ensureSchema` 原值，零改动）。
- **归属对象**：`db.settings`。
- **语义升级**：由「存下来回显」升级为**唯一真源**——派词执行值、计划卡 / 设置页回显值、`estMinutes` 估算、再平衡建议档位**全部以它为准**；`goal.dailyMinutes` 不得被任何派词 / 展示 / 降级路径读作配置（§5.1、N4W-AC02/03）。
- **兼容路径**：
  - **老库首开**：`ensureSchema` 在 `s.dailyMinutes == null` 时补默认；若 `settings.dailyMinutes` **缺失**而 `goal.dailyMinutes` 为合法档 → **一次性并入 goal 的值**（N4W-AC03：`goal=30` → `settings` 并入 30）；此后 `goal` 改动不再回写 `settings`。若 goal 值非法或缺失 → 补 `20`。
  - **导出导入往返**：整库克隆保留；`importJSON` → `ensureSchema` 同规则。
  - **脏值兜底**：非 `number` / `NaN` / `Infinity` / 不在合法集合 → 归一到默认档 `20`（**不取最近档、不自行扩集合**），避免非法档进入 `minutesFreshCap` 产生 `NaN`。
  - **写入路径收敛**：设置页档位按钮（`app.js:2274`）与三问 `commitGoal`（OP-06）是仅有的两处写入口，二者都写 `settings.dailyMinutes`。
- **映射 AC**：N4W-AC01/02/03/06/08/11。

### F3 · `goal.dailyMinutes`（降级为只读快照）

- **类型**：`number`，合法集合同上。
- **默认值**：`20`。
- **归属对象**：`db.goal`。
- **语义**：**只读快照**，仅供计划页「当初答的时长」回显（N4W-AC11）；**不再被读作配置**（`buildPlan` 本就不读它，接线后新增的 `minutesFreshCap` / `resolveFreshTarget` 也不得读它）。
- **兼容路径**：
  - **老库首开**：原样保留既有值（不回写、不清理）；缺 `db.goal` 时由 `ensureSchema` 补默认对象（既有行为）。
  - **导出导入往返**：随整库克隆保留；未知键忽略。
  - **脏值兜底**：回显时若非法 → 展示默认档 `20`，**不回写 `goal`**（保持只读快照语义）。
  - **三问重做（OP-06）**：允许写 `goal.dailyMinutes`，但 `commitGoal` **必须同步写 `settings.dailyMinutes`**，二者同值，避免 D-1 复发。
- **映射 AC**：N4W-AC02/03/11、OP-06。

### F4 · `days[dk].byType`（新增 · D-004 精确化：最小必需字段）

- **类型**：`object`，结构 `{flash:{n,ms}, type:{n,ms}, choice:{n,ms}}`；`n` = 当日该题型作答数、`ms` = 累计耗时（毫秒）。**仅 n/ms 与题型封顶**：不记逐题明细、不记时间线、不记 `opened`/`firstAnswerAt`/`endReason`、不做撤销窗口同源回滚、不记 `match`（对对碰不评级不计额度，N2L-AC06）。**这是 D-004 精确化要求保留的最小分桶，不得删。**
- **默认值**：**不预置**——按日、按题型「有作答才写」；`ensureSchema` 对该键采用「若存在则校验归一、不存在不强补」的最小策略，避免污染 `rhythmSummary` 等既有「空打开日」判定（既有 `days[dk]` 无 `byType` 即视为无作答日，与 §3.2 `dailyCompletionRate` 判定表序 3/4 一致）。
- **归属对象**：`db.days[dk]`（新增**可选加法键**，`SCHEMA` 恒 3）。
- **语义 / 用途**：为 `estMinutes` **按题型加权均时**提供数据来源（P3），使 N2 把复习从选义(~15s)升级到写出英文(~50s)后，10 分钟档不会因混合均值被读成 25 分钟（v3.0 §6 L416 / `N4-AC16`「10±2 分钟」验收前提）。**只做行为可测**（D-004），不引入完整埋点体系。
- **兼容路径**：
  - **老库首开**：老库 `days[dk]` 无 `byType` → 不补发历史数据、不改写既有日记录；行为与固定阶梯基线一致。
  - **导出导入往返**：随 `exportJSON` 整库克隆保留；`importJSON` → `ensureSchema` 对含 `byType` 的日记录只做类型归一、不覆盖合法值；未知键忽略、不报错、不阻断导入、不抬 `SCHEMA`。
  - **脏值兜底**：`byType` 非对象 / 某题型缺 `n`/`ms` / 非数值 / 负数 / `NaN` → 该题型按 `{n:0, ms:0}` 归一或整体丢弃该键（不产生 `NaN` 均时、不抛错）；`match` 等未知题型键忽略。
  - **幂等**：`ensureSchema` 连续调用结果逐字段一致。
- **写入路径**：由 app.js 学习引擎在**每次有效作答**时按 P4 选定的题型累加 `n`/`ms`（T03）；`flash`/`type`/`choice` 三分桶，**不新增 `db.sessions`、不新增北极星字段**。
- **映射 AC / 裁决**：N4W-AC07（题型敏感估时）、N2L-AC02~06（题型来源）、**G0 D-004 精确化**（保留最小 byType、不得删）。

### 2.2 函数返回结构契约（3 项，非存储字段）

| 编号 | 结构 | 类型契约 | 兼容路径要点 |
|---|---|---|---|
| **C1** | `dailyCompletionRate(db,dk)` 返回值 | `number \| null`（`number` 为 0..1） | 空值一律 `null`；**不新增第二个完成率函数**（OP-03）；调用方显式判空；`Math.min(1,…)` 截断与 0.70/0.95 两阈值不动。判定表见 §3.2 |
| **C2** | `weeklyRebalance(db)` 返回值 | `{ suggested:boolean, kind?:'lower'\|'faster', rate:number\|null, suggestedDailyMinutes?:number, aheadDays?:number, message?:string }` | **只出建议、不写 `settings.dailyMinutes`、不写任何影子分钟字段**（N4W-AC05）；**不读取 `autoRebalance`**（D-004/F5）；`aheadDays` 仍按既有公式产出但不驱动改量；降量建议值来自 P5 查表 |
| **C3** | `computeDailyBudget(s,planDailyFresh)` / `planCardDailyFresh(...)` | `{freshTarget:number, reviewTarget:number}` / `number` | **同源**（§4.2）：二者 `freshTarget` / 展示值由同一个 `resolveFreshTarget` 产出 |

---

## 3. 【规划】函数契约

### 3.0 暴露与纯度约束（适用于本节全部函数）

- **core.js 侧本期新增函数一律为纯函数、无 DOM 依赖**（任务卡 DoD 2）：不读写 `window/document/localStorage`、不修改入参、同输入恒同输出。
- **既有非纯函数**（`buildPlan` 写 `db.plan`、`todayPlan` 写 `db.days`、`ensureSchema` 改 `db`、`rateWord` 写 `db.words/days`）**保持其既有副作用契约不变**；本期只是加法式改签，不要求把它们改纯（否则破坏既有 161 项）。
- `weeklyRebalance` 是**唯一由非纯转纯**的既有函数（因 AC05 不再写真源）——这正是 §7-R1 冲突的技术根因。
- 所有新增 / 改签函数继续经 `window.Core` + `module.exports` **双暴露**（`js/core.js:1325-1400` 的 `Core` 对象加法登记；`phrases.js` 同理），不改暴露机制。
- `phrases.js` 新增文案键先由 **G3 落键**（§6.3 串行点），G4 只引用。

### 3.1 新增纯函数（5 个）

> 每个含：签名 / 入参出参 / 纯·非纯标注 / 不变式 / AC 映射。**不给函数体**。P3 的 `typeMix` 数据来源据 D-004 精确化改为 F4 最小 `byType` 分桶（**不新增第 6 个函数**）。

#### P1 · `minutesFreshCap(dailyMinutes, options)` —— N4 接线核心
- **签名**：`minutesFreshCap(dailyMinutes: number, options: number[]) -> number`
- **入参**：`dailyMinutes` 来自 `settings.dailyMinutes`（唯一真源）；`options` 为有序档位集合（`PHRASES.DAILY_MINUTE_OPTIONS`），与集合大小解耦（OP-01）。
- **出参**：该档位对应的「时长侧新词上限」（`number`）。
- **标注**：**纯** · core.js · 无 DOM · 双暴露。
- **不变式**：随 `dailyMinutes` **单调不减**；`dailyMinutes` 为默认档（20）时返回值 **≥ `freshLimit`（20）**（此不变量保证既有 `computeDailyBudget` 系列断言零改动，见 §4.2/§7-R3）；反推值 > `freshLimit` 时由调用方取 `freshLimit` 为 cap。
- **映射**：N4W-AC01（5 vs 20 派词量不等、单调不减）、N4W-AC06③（不出现 `-5` 算术 / `Math.max(10,…)`）。

#### P2 · `resolveFreshTarget(s, planDailyFresh)` —— 唯一封顶同源点
- **签名**：`resolveFreshTarget(s: Settings, planDailyFresh: number|undefined) -> number`
- **入参**：`s` = `db.settings`（含 `dailyMinutes` / `freshLimit` / `reviewRatio`）；`planDailyFresh` = `db.plan.dailyFresh`（可为空 / 0）。
- **出参**：今日新词配额 `freshTarget`（`number`）。
- **标注**：**纯** · core.js · 无 DOM · 双暴露。
- **不变式（逻辑步骤，文字描述）**：① 由 `s.dailyMinutes` 经 P1 得「时长侧新词上限」；② `planDaily = planDailyFresh > 0 ? planDailyFresh : s.freshLimit`（沿用既有「有计划用计划值、无计划回退 freshLimit」）；③ `freshTarget` 取 ② 与 `s.freshLimit` 与 ① 的收敛值——**这是全仓唯一一处 `freshLimit` 封顶**；④ 当 `s.dailyMinutes === 20` 时 ① ≥ `s.freshLimit`，第 ③ 步退化为既有 `Math.min(planDaily, s.freshLimit)`，既有 161 项不变。
- **同源职责**：`computeDailyBudget` 与 `planCardDailyFresh(..., s)` **都委托本函数**，不得各自 `Math.min`（§4.2、PRD §7.2-3）。
- **映射**：N4W-AC08、§5.1、§5.2、OP-05（`freshLimit` 继续作 cap）。

#### P3 · `weightedEstMinutes(dailyFresh, dailyReview, typeMix)` —— 估时题型敏感
- **签名**：`weightedEstMinutes(dailyFresh: number, dailyReview: number, typeMix?: TypeMix) -> number`
- **入参**：`dailyFresh/dailyReview` 为计划词数；`typeMix` = 由 **F4 `days[dk].byType` 最小分桶**聚合出的题型构成 / 加权均时对象（形如 `{choice:{n,ms}, type:{n,ms}, flash:{n,ms}}`，或按 `ms/n` 归一后的均时表）。**数据来源是最小 `byType` 分桶（D-004 精确化，必须保留、不得删）**，但**不引入 v3.0 §6 完整埋点体系**（`db.sessions[]` / `dueTomorrow` / `reviewOnTime` / `opened` / `firstAnswerAt` / `endReason` / 撤销窗口同源回滚）。
- **出参**：预计每日时长分钟数（`number`）。
- **标注**：**纯** · core.js · 无 DOM · 双暴露。
- **不变式**：① **不传 `typeMix`** → 回退既有单一 `SEC_PER_WORD=35` 公式 `round((dailyFresh+dailyReview)*35/60)`（保证 `core.test.phase1.mjs:140/156` 零改动）；② 传 `typeMix` → **按题型加权均时**（由 `byType` 的 `n`/`ms` 得每题型均时；v3.0 §2.1 参照：选义 ~15s / 写英 ~50s / 快过 ~35s），使「全写出英文」> 「全英文选义」（差值 > 0）；③ `typeMix` 只影响展示用估时，**不进入 `computeDailyBudget` / 派词配额、不改 C-AC5 配比**；④ `estMinutes` 题型敏感**只做行为可测**（D-004），不要求引入完整埋点体系。
- **数据来源（OP-02，G0 D-004 精确化终局裁定 + G2 落地）**：题型构成由 **`days[dk].byType`（F4）按题型 n/ms 聚合**得到，作为 `buildPlan(db, typeMix?)` 的**可选入参**；老库 / 无 `byType` 日省略该入参、走单一 35s 回退。**保留最小 byType 是下限、不得删**（v3.0 §6 L416：拒绝分桶则 N4 整体延后；`N4-AC16` 依赖按题型加权均时），但不做 sessions / 北极星 / 撤销回滚。
- **映射**：N4W-AC07、D-4、OP-02、**G0 D-004 精确化**。

#### P4 · `resolveLadderMode(ctx)` —— N2 题型阶梯
- **签名**：`resolveLadderMode(ctx: { lvl:number, ladderMode:'auto'|'manual', cardKind:'fresh'|'review', sessionMode:string, userMode:string }) -> { mode:'flash'|'choice'|'type'|'match', hint:boolean }`
- **入参**：`lvl`(0..6)、`ladderMode`(`db.ladder.mode`)、`cardKind`（`reps===0` 为 `fresh`，到期复习为 `review`）、`sessionMode`（当前会话题型，`match` 用于短路）、`userMode`（`manual` 时沿用用户手选题型）。
- **出参**：`{ mode, hint }`——`mode` 题型、`hint` 逐字母空格提示开关。
- **标注**：**纯** · core.js · 无 DOM · 双暴露 · **无状态**（不缓存、不写库 → 天然满足 N2L-AC09「切 manual 不回滚」）。
- **判定表（四档，N2L-AC02~06）**：

  | 优先序 | 条件 | 输出 |
  |---|---|---|
  | 1 | `sessionMode==='match'` | 原样 `match`（不评级、不计额度、不进错词本，AC06） |
  | 2 | `cardKind==='fresh'`（`reps=0`） | `flash`，**不进阶梯**（AC05） |
  | 3 | `ladderMode==='manual'` | 沿用 `userMode`，不上移（AC01/09） |
  | 4 | `auto` + `lvl===0` | `choice`（英文选义），无拼写框，`hint=false`（AC02） |
  | 5 | `auto` + `lvl===1\|2` | `type`（写出英文）且 `hint=true`（保留逐字母空格提示，AC03） |
  | 6 | `auto` + `lvl>=3` | `type` 且 `hint=false`（关闭提示，与第 5 行唯一差别是提示开关，AC04） |

- **护栏（AC07）**：本函数**只返回题型 + 提示开关**，绝不改 `lvl/due/wfix/why/st/wrong`；评级仍走既有 `rateWord` 三分支（零改动），保证「只改怎么再见、不改何时再见」。
- **AC08 跳过上限**：属既有 app.js 学习引擎视图逻辑，本批**不改、不新增 core 函数**；契约只要求 P4 不破坏它。
- **映射**：N2L-AC01~07、AC09；其 `mode` 输出同时是 F4 `byType` 分桶的题型归类依据。

#### P5 · `previousMinuteOption(currentMin, options)` —— D-3 查表降量
- **签名**：`previousMinuteOption(currentMin:number, options:number[]) -> number|null`
- **入参**：`currentMin` 当前档；`options` 有序档位集合（与集合大小解耦，OP-01）。
- **出参**：集合中**严格小于** `currentMin` 的最大档；若 `currentMin` 已是集合最小档 → `null`（不产出降量建议、不反向升档）。
- **标注**：**纯** · core.js · 无 DOM · 双暴露。
- **不变式**：结果 ∈ `options`、严格小于输入、**不等于 25**；全仓不出现 `dailyMinutes - 5` / `dailyMinutes-5` 算术与 `Math.max(10,…)` 兜底；最小档（10）返回 `null`（AC06②）。
- **映射**：N4W-AC06、OP-01、C2 的 `suggestedDailyMinutes`。

### 3.2 既有函数改签（6 项，均保持既有签名形态或对既有调用兼容）

| 函数 | 既有纯度 | 本期改签 | 兼容不变量 |
|---|---|---|---|
| `computeDailyBudget(s, planDailyFresh)` | 纯 | 内部 `freshTarget = P2(s, planDailyFresh)`；`reviewTarget` **完全沿用** `round(freshTarget*reviewRatio/(1-reviewRatio))` 钳 `reviewLimit`（C-AC5 口径，OP-05 不另造） | 默认档（20）行为逐项不变 → `hardening.mjs:189`、`phase1.mjs:97-110/:387/:651-657` 全过 |
| `planCardDailyFresh(plan, freshLimit)` | 纯 | **保持两参 + 既有 `Math.min(planDaily\|\|freshLimit, freshLimit)`**，不新增第三参 `s`（**D-034**：与 D-029 qa 两参正则兼容、app.js:265 调用不动；契约原「新增可选第三参 s / app.js:265 改为三参调用」作废）；展示层 Math.min 为 D-029 下的显式例外，结果恒等于 P2 封顶值，N4W-AC08 三者相等仍成立 | 既有两参调用零改动；既有 6 条断言全过 |
| `dailyCompletionRate(db, dk)` | 纯 | 返回值由 `number` 扩为 `number\|null`；判定表见下 | 见下方判定表，5 处既有断言全过 |
| `weeklyRebalance(db)` | **非纯**（写 `s.dailyMinutes`）→ **纯**（只出建议） | 7 日 rate **排除 `null`**（空打开日不参与均值）；有效样本不足 → `{suggested:false, rate:null}`、`settings` 不变、界面零提示；`rate<0.70` → lower 建议，`suggestedDailyMinutes=P5(s.dailyMinutes, options)`，**不写真源**；`rate>0.95` → faster 建议、`aheadDays` 按既有公式但不驱动改量；**不读取 `s.autoRebalance`（D-004/F5）** | **与 `phase1.mjs:419/:577/:579` 冲突 → R1 已由 D-009 裁决（见 §7）**；`message` 仍含 `'0%'`，`suggested/kind` 语义不变（既有 `:417/:418/:420/:430-432` 可保持） |
| `buildPlan(db, typeMix?)` | 非纯（写 `db.plan`） | 新增可选入参 `typeMix`（**来自 F4 `days[dk].byType` 最小分桶，D-004 精确化**）；`estMinutes` 委托 `P3(dailyFresh, dailyReview, typeMix)` | 不传 `typeMix` 时 estMinutes 公式零改动（`phase1.mjs:140/156` 全过）；`db.plan` 结构不变 |
| `ensureSchema(db)` | 非纯（改 `db`） | 加法补 `db.ladder`（F1）+ `settings.dailyMinutes` 缺失时从 `goal` 一次性并入（F2）+ 对 F4 `days[dk].byType` 做「存在则校验归一、不存在不强补」；`db.schema` 保持 3 | 幂等、不改 `db.schema`、未知键保留；既有 `phase1.mjs:73-84`、`v3.mjs:335-345` 全过 |

**`dailyCompletionRate` 判定表（0 / null 边界，精确切分以兼容既有 161 项）**：

| 序 | 条件 | 返回 | 依据 |
|---|---|---|---|
| 1 | 无 `days[dk]` | `0` | `phase1.mjs:404`（`assert.equal(...,0)`） |
| 2 | `days[dk]` 存在、`planTarget` 字段**存在**（含 `=0`） | `Math.min(1, total/target)`，`target=0 → 0` | `phase1.mjs:401-406/:688`、`v3.mjs:404-406` |
| 3 | `days[dk]` 存在、`planTarget` 字段**缺失** 且 `total===0` | **`null`** | **N4W-AC04 空打开日** |
| 4 | `days[dk]` 存在、`planTarget` 字段**缺失** 且 `total>0` | `0` | `hardening.mjs:191`、`v3b.mjs:300` |

> 序 3 与序 4 的区分键是 **`total` 是否为 0**（而非「无 planTarget 一律 null」）；若实现误把序 4 也改成 `null`，会破坏两条既有断言（§7-R3）。`null` 不产生 `NaN`、不作为 0 参与 7 日均值（N4W-AC04/05）。

### 3.3 函数 → AC 覆盖矩阵（23 条全覆盖，编号原样）

| AC | 承接函数 / 契约 | AC | 承接函数 / 契约 |
|---|---|---|---|
| N4W-AC01 | P1 + `computeDailyBudget` 改签 | N4W-AC02 | F2/F3 + P2（唯一真源） |
| N4W-AC03 | F2 老库并入 + F3 只读快照 | N4W-AC04 | `dailyCompletionRate` 判定表序 3 |
| N4W-AC05 | C2 + `weeklyRebalance` 改签（**§7-R1**） | N4W-AC06 | P5 + 全仓无 `-5` 算术 |
| N4W-AC07 | P3 + F4 `byType` + `buildPlan(db,typeMix?)` | N4W-AC08 | P2 同源 + `planCardDailyFresh(...,s)` |
| N4W-AC09 | `dailyCompletionRate` 返回 `null` + app.js 14 天图判空 | N4W-AC10 | F1/F2/F4 + `ensureSchema` + `exportJSON/importJSON` |
| N4W-AC11 | F3 只读快照回显 + OP-06 同步写 | N4W-AC12 | §8 红线 + §9-§5.5 回归门禁 |
| N2L-AC01 | F1 + P4 判定表序 3 | N2L-AC02 | P4 序 4 |
| N2L-AC03 | P4 序 5 | N2L-AC04 | P4 序 6 |
| N2L-AC05 | P4 序 2 | N2L-AC06 | P4 序 1 |
| N2L-AC07 | P4 护栏 + `rateWord` 零改动 | N2L-AC08 | 既有 app.js 跳过逻辑（不改） |
| N2L-AC09 | F1 一键退回 + P4 无状态 | N2L-AC10 | §8 红线（`LADDER_DAYS`） |
| N2L-AC11 | F1 + `ensureSchema` + 导入导出往返 | — | — |

> 注：G0 D-004 引用的 `N4-AC16` 为 v3.0 方案的验收前提依据，本批 AC 仍以 `N4W-*` / `N2L-*` 为准、零改动（§0.4、§0.6）。

---

## 4. 【规划】同源与封顶：回应 §5.1 / §5.2 的核心设计

### 4.1 唯一真源数据流（§5.1）

```
settings.dailyMinutes（唯一真源，F2）
   ├─▶ P1 minutesFreshCap ─┐
   ├─▶ P2 resolveFreshTarget ◀── plan.dailyFresh（展示/计划值）
   │        │（唯一封顶点）
   │        ├──▶ computeDailyBudget(...).freshTarget ──▶ todayPlan 派词执行值
   │        └──▶ planCardDailyFresh(plan, freshLimit) ──▶ 计划卡「每日新学」展示值（**D-034**：保持两参，展示层 Math.min 兜底）
   ├─▶ 设置页回显（app.js:2085 档位按钮 / :2082 副标题由常量派生）
   └─▶ P5 previousMinuteOption ──▶ C2 再平衡「建议档位」（不写真源）
goal.dailyMinutes（F3 只读快照）──▶ 仅计划页「当初答的时长」回显；不进入上述任何路径
days[dk].byType（F4 最小分桶）──▶ P3 weightedEstMinutes（按题型加权均时）──▶ buildPlan.estMinutes
```

- 派词执行值、计划卡 / 设置页回显值、`estMinutes` 估算**同源**于 `settings.dailyMinutes`（`estMinutes` 的题型均时另取 F4 分桶，属「展示用估时」而非派词配置）；任一路径读 `goal.dailyMinutes`、读写死值、或两处封顶各自实现，即判未完成（§5.1）。
- **三问 `commitGoal`（OP-06）**：写 `goal.dailyMinutes` 的同时**同步写 `settings.dailyMinutes`**，二者同值 → 重做三问后两字段不分叉，D-1 不复发。

### 4.2 封顶点由 2 收敛为 1（§5.2「两处封顶须同时改」）

- **现状【实测】**：`core.js:641`（`computeDailyBudget`）与 `core.js:899`（`planCardDailyFresh`）各自 `Math.min`，是两处独立封顶（D-5）。
- **本期设计**：两处 `Math.min` **同批删除并统一委托 P2 `resolveFreshTarget`**，全仓 `freshLimit` 封顶点由 **2 → 1**。
  - `computeDailyBudget(s, planDailyFresh)` → `freshTarget = P2(s, planDailyFresh)`。
  - `planCardDailyFresh(plan, freshLimit)` **保持两参 + 既有 `Math.min` 展示层兜底**（**D-034**：不新增第三参 `s`，与 D-029 qa 两参正则兼容、app.js:265 调用不动）。
  - `N4W-AC08` 判定不变式：`planCardDailyFresh(db.plan, freshLimit)` **===** `computeDailyBudget(db.settings, db.plan.dailyFresh).freshTarget` **===** 计划卡实际渲染值；反推值 > cap 时三者同取 cap（P2 与展示层 Math.min 同以 `freshLimit` 封顶，结果恒等）。
- **「不得各自实现封顶」的验收（D-034 部分修正）**：`computeDailyBudget` 委托 P2 为唯一真源封顶点；`planCardDailyFresh` 的展示层 `Math.min` 为 D-029 下的**显式例外**（非第二封顶点，因二者同以 `freshLimit` 封顶、结果恒等），本条「均不再自带封顶表达式」对 `planCardDailyFresh` **部分作废**（§5.1 / PRD §7.2-3）。
- **同批要求**：两处改动落在**同一个任务 T02、同一次提交**；只改前者会出现「今日派 12 词、计划卡显示 20」，是 §5.1 同源病换位置复发（PRD §5.2）。

### 4.3 档位四处消费同步（含最易漏的 `:2082`）

> 【推断】依据 §1.1 `app.js:2082` 写死字符串，为 v3.0 §2.1「必须同步四处」里最易漏的一处（G0 实测标注）。

| # | 位置 | 现状 | 本期处置 |
|---|---|---|---|
| 1 | `phrases.js:21`（定义）/`:202`（导出） | `DAILY_MINUTE_OPTIONS=[10,20,30]` | **保持不扩展**（OP-01），作为唯一集合真源 |
| 2 | `app.js:442`（三问时长按钮） | `P.DAILY_MINUTE_OPTIONS.map(...)` | 保持引用常量 |
| 3 | `app.js:2084`（设置页档位按钮） | `P.DAILY_MINUTE_OPTIONS.map(...)` | 保持引用常量 |
| 4 | **`app.js:2082`（设置页副标题）** | **写死 `'10 / 20 / 30 分钟'`** | **改由 G3 在 `phrases.js` 落的文案键 / 常量派生函数生成**，杜绝「集合变了副标题没变」 |

- **新增 / 修改逐字文案统一入 `phrases.js`**（总纲 §5.2-5 / K4、PRD §7.3-6），建议新增键（G3 可微调键名，但 G4 引用须一致）：档位副标题派生、默写阶梯开关标签、`auto`/`manual` 二值标签、「当初答的时长」回显文案、阶梯提示开关相关文案。
- **`PHRASES.REBALANCE.lower(rate, newMin)` 模板逐字不动**（既有逐字文案断言），仅把实参 `newMin` 的来源由 `-5` 算术改为 P5 查表结果。
- **扉页不引入百分数 / 差额 / 评价性表达**（v3.0 §4.1 文案禁令、PRD §3.3-9）。

### 4.4 配比口径与 C-AC5 对齐（OP-05）

- `freshLimit` **继续作 cap**（不升格为主输入）；`reviewRatio` 继续决定复习 / 新词配比。
- `computeDailyBudget` 的 `reviewTarget` **完全沿用**既有 `Math.round(freshTarget * s.reviewRatio / (1 - s.reviewRatio))` 并钳 `s.reviewLimit`（阶段一 `C-AC5` 的 7:3 口径），**不另造配比公式、不改 `reviewRatio` 语义**。
- `dailyMinutes` 只决定「这一档的总卡数」（经 P1 → P2 落到新词配额），不直接改写新词 / 复习比例；题型构成（OP-02，**数据来源为 F4 最小 `byType` 分桶**）只影响 P3 估时，不进入配额。
- 以上为 G2 对 OP-05 的裁定，**PRD §6 既定需 G1 会签**（§7-R4），不改 AC 判定逻辑。**OP-02 的数据来源已由 G0 D-004 精确化终局裁定**（保留最小 `byType`、不引入完整埋点体系），按 §0.6 / §8-7 落地，**不再列为会签 / 待拍板项**。

---

## 5. 【规划】兼容 / 迁移方案

1. **老库首开**：`schema=3`、无 `db.ladder` / 无新增字段 → `ensureSchema` 缺失才补 `db.ladder={mode:'auto'}`；`settings.dailyMinutes` 缺失且 `goal.dailyMinutes` 合法 → 一次性并入；**老库 `days[dk]` 无 `byType`（F4）不补发历史数据、不改写既有日记录**；`db.schema` 恒 3、不补发历史数据。行为与固定阶梯基线一致（PRD §7.3-1）。
2. **导出 → 导入往返**：`exportJSON` 整库克隆天然带走新字段（含 F4 `days[dk].byType`）；`importJSON` 校验 `data.schema` → `migrateOldKeys` → `ensureSchema`；未知键忽略、不报错、不阻断导入；**不得抬 SCHEMA**（抬到 4 会让旧版本拒绝导入新备份，§5.4 红线）。
3. **一键退回**：`ladder.mode='manual'` 时当日已选题型 / 已落库评级不回滚（N2L-AC09），由 P4 无状态设计保证，不引入回滚状态字段。
4. **可回退基线**：`LADDER_DAYS` 与 `rateWord` 三分支作为回退点，N2 仅为叠加层；删除 / 替换即违反红线（§8）。
5. **测试隔离**：新增测试一律写**独立文件**（建议 `tests/core.test.n4n2.mjs` 归 G3、`tests/ui.test.n4n2.mjs` 归 G4），既有 7 文件 161 项断言**零改动**（K6 / §5.5）。
6. **文案路径**：新增 / 修改逐字文案统一入 `phrases.js`，**G3 先落键、G4 只引用**（§6.3）。

---

## 6. 【规划】T0x 任务分解（≤5）+ 依赖图 + 串行点

> 任务数 **5**（T01~T05），每任务列出 **≥3 个相关文件**（BOUNDARY.md §7-DoD3）；验收钩子为「给定输入 → 断言输出」的可自动化判定，最终回归归 #008(G8)。

### 6.1 任务表

| 任务 | 归属 | 相关文件（≥3） | 内容 | 依赖 |
|---|---|---|---|---|
| **T01** | G3 | `js/phrases.js`、`js/core.js`、`tests/core.test.n4n2.mjs` | ① **先落文案键**（§4.3 建议键 + 档位副标题派生）；② `defaultDB` 补 `db.ladder`、`ensureSchema` 补 F1/F2 并入规则 + **F4 `days[dk].byType` 最小分桶（可选加法键、存在则校验归一/不强补、幂等、SCHEMA=3）**、Core 导出面加法登记 P1~P5 五个纯函数；③ 独立 core 测试文件建骨架（P1/P4/P5 判定表、F1/F2/F3/F4 兼容路径） | 无（起点） |
| **T02** | G3 | `js/core.js`、`tests/core.test.n4n2.mjs`、`docs/design-n4-n2.md`（契约只读核对） | N4 接线 + D-1~D-6 core 侧：`computeDailyBudget`/`planCardDailyFresh` 委托 P2（**两处封顶同批改**）、`dailyCompletionRate` 判定表、`weeklyRebalance` 出建议（**不读取 `autoRebalance`，D-004/F5**；**按 D-009 落地，与 T02 其余子项同批**）、`buildPlan(db,typeMix?)` 委托 P3（**OP-02 数据来源改为 F4 最小 `byType` 分桶，D-004 精确化**）、全仓删 `-5` 算术。覆盖 §5.3 层二「接线 + 两处封顶同源 + 六缺陷同批」 | T01 |
| **T03** | G4 | `js/app.js`、`js/phrases.js`（**引用 G3 已落键**）、`tests/ui.test.n4n2.mjs` | 视图接线：计划卡改三参同源调用、设置页 `:2082` 副标题改常量派生、三问 `commitGoal` 按 OP-06 同步写 `settings`、14 天图 `null` 判空不画 0% 柱（N4W-AC09）、P4 接入学习引擎选题型、**每次有效作答按 P4 题型累加 `days[dk].byType` 的 n/ms（F4，仅 flash/type/choice、不记 match）**、`manual` 一键退回入口 | T01（phrases 落键串行点）+ T02（Core API 冻结） |
| **T04** | G4 | `css/app.css`（**独占**）、`index.html`（引入行核验）、`js/app.js` | 增量样式（阶梯提示开关、manual 退回控件、空打开日不画柱的样式配合）；**本批不新增 JS 文件 → `index.html` 无新增引入行**，仅核验既有 `:40-49` 顺序 `data→phrases→core→pet→app` 未被破坏；若确需新增引入行按 §6.3 串行规则 | T03 |
| **T05** | 单组独占（建议 G3 或 G0 指定） | `word365/README.md`（**单组独占**）、`tests/*.mjs`（8 文件全量复跑）、`docs/design-n4-n2.md`（交付登记） | README 功能总览补 N4/N2、「开发与测试」命令补两个独立新测试文件；全量复跑 161+新增项 0 失败、`check-data.mjs` 460 词通过；交付 #008(G8) 回归判定 | T01~T04 全部冻结 |

### 6.2 依赖图

```
        ┌──────────────────────────────────────────────┐
        │  T01 (G3) phrases 落键 + core 纯函数 + 独立测试 │ ← 起点（G1 PRD v1.0 / 本契约已冻结）
        └───────┬──────────────────────┬───────────────┘
                │ Core API 冻结         │ phrases 文案键（G3 先落键 · G4 只引用）【硬串行】
                ▼                      │
        ┌───────────────┐              │
        │ T02 (G3) N4   │              │
        │ 接线 + 六缺陷  │              │
        │ 两处封顶同批改 │              │
        └───────┬───────┘              │
                │ Core API 冻结         │
                └──────────┬───────────┘
                           ▼
                  ┌─────────────────┐
                  │ T03 (G4) app.js │
                  │ 视图接线 + N2   │
                  │ + byType 累加   │
                  └────────┬────────┘
                           ▼
                  ┌─────────────────┐     ┌──────────────────────────┐
                  │ T04 (G4)        │────▶│ T05 README 单组独占 +     │
                  │ css/app.css 独占│     │ 全量回归 → #008(G8)      │
                  │ index.html 核验 │     └──────────────────────────┘
                  └─────────────────┘
```

- **层一（N4 × N2）**：T02（N4W 段）与 T03（N2L 段接入）必须**同批冻结交付**；只交付其一 = 未完成（§5.3 层一）。
- **层二（N4 内部同批）**：「① dailyMinutes 接线 ② 两处封顶同源 ③ D-1~D-6 六缺陷」全部落在 **T02 单任务、同一次提交**，禁止拆分（§5.3 层二）。
- **T02 内 `weeklyRebalance` 子项**按 **D-009** 落地，**与 T02 其余子项同批**（R1 阻塞已解除，不再单列延后）；层二同批要求保留：接线 + 两处封顶同源 + D-1~D-6 六缺陷仍全部落在 T02 单任务、同一次提交（§5.3 层二）。

### 6.3 串行点清单（必须串行 / 独占）

| 共享点 | 规则 | 依据 |
|---|---|---|
| **`phrases.js`** | **G3 先落文案键（T01）→ G4 只引用（T03）**，硬串行；G4 不得抢先改 `phrases.js` | 任务卡 DoD3、`365-groups/README.md` §3 |
| **`index.html` 引入行** | 本批**不新增 JS 文件 → 无新增引入行**，仅核验 `:40-49` 顺序；若确需新增，`G4/G5 各加一行、按任务卡顺序`、单组独占、不得破坏 `data→phrases→core→pet→app` | `365-groups/README.md` §3、§1.1【实测】 |
| **`css/app.css`** | **G4 独占**（T04），其他组不写 | `365-groups/README.md` §3、边界卡 G4 |
| **`README.md`** | **每轮单组独占认领**（T05），不得并发改写 | `365-groups/README.md` §3、任务卡 DoD3 |
| **`365-groups/**` / 总纲 / `.workbuddy/memory/**`** | **仅 G0**，本组禁写（含 `DECISIONS.md` 台账，归 G0） | 任务卡禁写清单、`365-groups/README.md` §6、§0.6 |
| **`dist/**`** | 只由 build 生成，不手写 | `365-groups/README.md` §3 |
| **新增测试文件** | `tests/core.test.n4n2.mjs`（G3）/ `tests/ui.test.n4n2.mjs`（G4）**各自独立**，既有 7 文件零改动 | K6 / §5.5 |

### 6.4 验收钩子（每任务可自动化判定）

- T01：`defaultDB().ladder.mode==='auto'` 且 `schema===3`；`ensureSchema` 幂等；**F4 老库 `days[dk]` 无 `byType` 不补发、脏值归一为 `{n:0,ms:0}` 或丢键、连续调用逐字段一致**；P4 六行判定表逐行断言；P5 最小档返回 `null`、结果 ∈ `[10,20,30]`。
- T02：`planCardDailyFresh(plan, freshLimit, s) === computeDailyBudget(s, plan.dailyFresh).freshTarget`（N4W-AC08）；`dailyCompletionRate` 判定表 4 行；**`buildPlan(db, 全写英 byType).estMinutes > buildPlan(db, 全选义 byType).estMinutes`（N4W-AC07 / D-004 按题型加权均时）**、无 `typeMix` 时回退 35s 公式；全仓无 `dailyMinutes - 5` / `Math.max(10,…)`（N4W-AC06③）；`weeklyRebalance` 不读取 `autoRebalance`。
- T03：14 天图渲染输出中空打开日无 `bar-col`；`commitGoal` 后 `settings.dailyMinutes === goal.dailyMinutes`（OP-06）；计划卡「每日新学」等于派词执行值；**有效作答后 `days[dk].byType` 按题型累加 n/ms、`match` 不写入、不产生 `db.sessions` / 北极星字段**。
- T04：样式生效且 `index.html` 引入顺序未变。
- T05：全量 161 + 新增项 0 失败、`check-data.mjs` 460 词通过、`LADDER_DAYS` 与 `rateWord` 三分支输出与接线前逐项一致。

---

## 7. 【规划】风险登记（影响 → 建议 → 需谁拍板）

| 编号 | 风险 | 影响 | 建议 | 需谁拍板 |
|---|---|---|---|---|
| **R1（已由 D-009 裁决 · 阻塞解除）** | `weeklyRebalance` AC05/06「不写真源 + 档位查表降量」与既有 `core.test.phase1.mjs:419/:577/:579`（3 断言 / 2 test，断言 `20→15→10` 下调）冲突（§1.2【推断】）——**该冲突已由 G0 D-009 终局裁决** | 按 D-009 执行后既有 161 项口径只变更 3 处期望值、项数不变，N4W-AC05/06 与 §5.3 层二同时达标 | **D-009 裁决（行为变更同步）**：G0 采纳「**产品行为变更导致旧断言失效、非放宽**」路径（v3.0 F3/F12 已判定静默降量应废止，既有断言写于阶段一 P0、锁的是当时的错误行为）；授权 G3 在 **T02 同一次提交内精确更新 `phase1.mjs:419/:577/:579` 3 条断言的期望值**——**不删断言 / 不 skip / 不改测试名 / 其余 158 项逐字不动、项数仍 161**（`:58/:65/:417/:418/:420/:430-432` 一律零改动，D-012）；G1 同步修订 `N4W-AC05/06/12` 措辞（**编号不变**，D-013 授权）；G8 独立复核「其余 158 项与改前逐项一致 + 161 项 0 失败 + 新增独立文件全绿」，逐字改前改后登记进 `cards/#005`。**明确不采纳**方案 B（保旧写真源，违反 §5.3 层二）、方案 C（`[10,20,30]` 下 20 的前一档是 10 非 15，`===15` 仍失败）、「保留兼容层」（违反 v3.0 F12 分叉论证 + `N4W-AC06③` 要求全仓无 `dailyMinutes-5`/`Math.max(10,…)`） | **已由 G0 D-009 裁决（行为变更同步），阻塞解除**；G8 独立复核；本卡不再列为待拍板项 |
| **R2** | N4W-AC08 字面入参 `planCardDailyFresh(db.plan, freshLimit)` 与 G2 依 PRD §7.2 授权定的签名 `(plan, freshLimit, s?)` 存在入参示意偏差 | 若 G8 严格按两参断言，同源判定无法成立（两参拿不到 `dailyMinutes`） | 判定不变式「三者相等」不变；AC08 三参签名 `(plan, freshLimit, s?)` 是为兼容既有两参调用而设（既有 6 条断言全过），三参形态满足 AC08；**判定语义不变** | **G1 会签通过，判定语义不变**（AC08 三参签名 `(plan, freshLimit, s?)` 为兼容既有两参调用、「三者相等」判定不变式不变；不改 AC 编号 / 判定逻辑） |
| **R3** | 既有 161 项兼容的三处不变量易被实现误伤 | 任一处误改即破坏红线 / 回归门禁 | ① `dailyCompletionRate` 序 3/序 4 必须按 `total===0` 切分，不得「无 planTarget 一律 null」（否则破 `hardening.mjs:191`/`v3b.mjs:300`）；② `dailyMinutes=20` 时 P1 返回值必须 ≥ `freshLimit`（否则破 `hardening.mjs:189`/`phase1.mjs:97-110/:387/:651-657`）；③ 无 `typeMix` 时 P3 必须回退单一 35s 公式（否则破 `phase1.mjs:140/156`）。列为 T02 验收钩子 + G8 回归核验项 | **G0 备案**（实现约束，不需新裁决） |
| **R4** | OP-05「配比口径」为 G2 本期裁定（D-006 归 G2 契约）；**OP-02「题型构成数据来源」按 G0 D-005 收敛** | 若另造配比会与 C-AC5 冲突；若误删最小 `byType` 会触发 v3.0 §6 L416「N4 整体延后」 | **OP-02 按 D-005 收敛**：保留最小 `days[dk].byType` 分桶（F4），不引入 `sessions` / 北极星 / 撤销回滚（§0.6、§8-7），不列为待拍板挂起；**OP-05 按 D-006 沿用 C-AC5 的 7:3 公式、`freshLimit` 继续作 cap**（§4.4） | **G1 会签通过（R2 / R4 会签已完成）** |
| **R5** | `ladder.mode='auto'` 使存量用户（老库无该键）首开后立刻改变题型（OP-04 已裁决接受） | 存量用户题型突变（但当日已选题型 / 评级不回滚，`manual` 可一键退回） | 按 OP-04 执行；`phrases.js` 提供 `auto/manual` 清晰标签与退回入口；不新增影子字段、不回滚 | **G1 知悉**（OP-04 已裁决，残留影响登记） |
| **R6（已关闭）** | 共享 TaskList 中 #10「按 G0 新裁决重写 PRD」曾 pending，与「PRD v1.0 已定稿」并存 | 曾担心下游契约与可能重写的 PRD 错位 | **G0 D-001 终局裁定**：G1 曾因一条矛盾裁决短暂覆写 v2.0、已回退，v1.0 为准并登记 D-001；本组只读复核确认磁盘 `prd-n4-n2.md` 仍 v1.0（23 条 AC / §9 完整），契约 §0.4/§3.3 无需回灌 | **已关闭（G0 D-001）** |

> 风险数 **6**（**R6 已由 G0 D-001 关闭**）。其中 **R1 已由 G0 D-009 裁决、阻塞解除**（行为变更同步）；**R2 / R4 G1 会签已完成**；R3/R5 为登记项。**G0 D-004 三条（`userChosenSlot` / `autoRebalance` / 完整埋点体系 + 保留最小 `byType`）按裁决写入 §8 红线清单，不作为风险挂起、不作为待拍板项；其中 `autoRebalance` 一条以 D-011 为准（§0.6 / §8-16）。**

---

## 8. 【规划】「不改什么」红线清单

> 以下为本批**绝对零改动 / 明确不做**项，任一被触碰即判未完成（任务卡 DoD5、BOUNDARY.md §7-DoD5、PRD §5.5 / §3.3）。**G0 D-004 三条预裁决（`userChosenSlot` / `autoRebalance` / 完整埋点体系 + 保留最小 `byType`）已并入本清单（§8-7/8/16），按 G0 指示不作为待拍板项挂起。**

1. **`LADDER_DAYS = [1,2,4,7,15,30,60]` 零改动**：不替换 / 不删除 / 不改写元素（`core.js:14`）；`rateWord` 的 `know` 分支间隔取值与接线前逐项一致。
2. **`rateWord` 三分支（`know`/`fuzzy`/`unknown`）零改动**：`lvl/due/st/wfix/wrong` 落库规则、`words` 进度记录结构不动（N2L-AC07 护栏：只改「怎么再见」，不改「何时再见」）。
3. **`SCHEMA = 3` / `db.schema` 恒 3**：不抬 4、不加「只跑一次」版本标记。
4. **抽测（exam）不改复习节奏**：`lvl/due/错词本/星标` 均不动（README §已知限制）；「待重读」独立清单不自动清理。
5. **不引入框架 / 构建 / CDN / npm 依赖**：保持纯静态、双击 `index.html` 可用、file:// 协议可用。
6. **既有 7 文件 161 项断言零改动**：新测试一律**独立文件**（`tests/core.test.n4n2.mjs` / `tests/ui.test.n4n2.mjs`），既有文件内容一字不改。
7. **不引入 v3.0 §6 完整埋点体系**：`db.sessions[]`（30 天裁剪）、`dueTomorrow`、`reviewOnTime`、`opened`/`firstAnswerAt`/`endReason`、撤销窗口同源回滚（D-004）；**但必须保留最小 `days[dk].byType` 分桶**（F4，`{flash:{n,ms}, type:{n,ms}, choice:{n,ms}}`，仅 n/ms 与题型封顶）——**不得删 `byType`**（v3.0 §6 L416：拒绝分桶则 N4 不做降级、整体延后；`N4-AC16` 依赖按题型加权均时）。OP-02、PRD §3.3-4 与 **D-004 精确化**共同约束。
8. **不实现 `userChosenSlot`**（D-004 / F12 / §0.4 不做清单）、不新增 `userChosenSlot` 类影子字段；不重做再平衡 UI / 不新增自动改量开关；`weeklyRebalance` 只降级为「只出建议、不写真源」。
9. **不改题型判分逻辑、不新增题型**（`lvl≥3` 的「填空 / 辨析」留待后续期）；不重命名 / 不新增既有 AC 编号。
10. **不改 `C-AC5` 的 7:3 配比口径、不改 `reviewRatio` 语义、不动 `Math.min(1,…)` 截断与 0.70/0.95 两阈值**。
11. **扉页不引入百分数 / 差额 / 评价性表达、不新增「还需 N 档」类文案**（v3.0 §4.1）。
12. **双仓库不互引（C12）**：本文与实现均只针对 A 仓库，B 仓库不在范围。
13. **不改 `DAILY_MINUTE_OPTIONS = [10,20,30]` 本批集合**（OP-01）；档位「加档」本身不是 N4 交付物。
14. **不改 `Core` / `PHRASES` 的 `window.*` + `module.exports` 双暴露机制**，不改 `index.html:40-49` 既有引入顺序。
15. **不新增 / 不重命名任何既有 AC 编号**（§0.4）；不改 G1 的 `docs/prd-*.md`、G7 的研究文档、各仓库 `README.md`（T05 单组独占更新除外）、`365-groups/**`（仅 G0，含 `DECISIONS.md` 台账）。
16. **`autoRebalance` 数据键保留为死数据（D-011，二次精确化 D-004②，以 D-011 为准）**：本批对该数据键 **不清理、不读取、不迁移**；删除的是 **UI 开关与代码读取路径**（`app.js:2097/2098/2313-2315`、`core.js:441/867` 读取分支），不引入 v3.0 `N4-AC18` 式「保留读取该开关」的增量需求；`weeklyRebalance` 改为纯建议对象后不再依赖该开关决定是否写真源；`defaultDB()` 仍返回 `autoRebalance: true` 以保 `core.test.phase1.mjs:58`（settings 六字段含该键）/`:65`（`=== true`）既有断言通过、保证「既有 161 项零改动」，**但任何生产路径不得再读它**。原 D-004②「键删除且不读取」措辞过宽（物理删键会再破 2 条既有断言），**以 D-011 为准**；G3 在 T02 / T03 按此落地，G8 在 #008 回归核验。

---

## 9. 【规划】逐条回应 PRD §5 五条硬合并判据

| §5 判据 | 本文回应 | 落点 |
|---|---|---|
| **§5.1 展示值与执行值同源** | `settings.dailyMinutes` 唯一真源（F2）；P2 `resolveFreshTarget` 是**全仓唯一封顶点**，`computeDailyBudget` 与 `planCardDailyFresh(...,s)` 都委托它；计划卡「每日新学」= `computeDailyBudget(...).freshTarget` = 派词执行值（N4W-AC08 三者相等）；`goal.dailyMinutes` 只读快照不进入派词 / 展示；`commitGoal` 按 OP-06 同步写真源。覆盖「设置页 10 / 计划页 20」与「派 12 词 / 卡显示 20」两类同源病 | §4.1、§4.2、§2-F2/F3 |
| **§5.2 两处封顶须同时改** | `core.js:641` 与 `core.js:899` 两处 `Math.min` **同批删除并统一委托 P2**，封顶点 2→1；落在**同一任务 T02 / 同一次提交**；只改前者会复发「今日派 12 词、计划卡显示 20」 | §4.2、§6.1-T02、§6.2 |
| **§5.3 只交付其一视为未完成（两层）** | 层一：T02（N4W 12 条）与 T03（N2L 11 条接入）**同批冻结**；层二：接线 + 两处封顶同源 + D-1~D-6 全在 T02 单任务同批。T02 内 `weeklyRebalance` 子项受 R1 阻塞但**不得单独结案** | §6.2、§7-R1 |
| **§5.4 SCHEMA 保持 3，新字段 `ensureSchema` 幂等加法** | `db.ladder`（F1）/ `days[dk].byType`（F4）等新字段只在 `ensureSchema`「缺失才补 / 存在则归一」；`db.schema` 恒 3、重复调用逐字段一致、不写盘、不加版本标记；`exportJSON` 整库克隆 + `importJSON` 末尾 `ensureSchema` 天然兼容；不抬 4 | §2-F1/F4、§5、§8-3 |
| **§5.5 回归门禁** | 全量 7 文件 **161 项 0 失败** + `check-data.mjs` **460 词通过**（T05 复跑）；新测试写独立文件、**精确更新 `core.test.phase1.mjs:419/:577/:579` 3 条断言期望值、其余 158 项逐字不动、项数仍 161**（K6 / D-009 / D-019，非放宽）；`LADDER_DAYS` 与 `rateWord` 三分支输出逐项一致（N4W-AC12、N2L-AC10）；D-004 三条（含最小 `byType`）按 §8 落地、D-012 零改动清单不变；**R1 已由 D-009 裁决、阻塞解除**，G8(#008) 独立复核 | §1.2、§7-R1/R3、§8-1/2/6/7/16、§6.4-T05 |

---

## 10. 交付登记 / 待拍板项 / 会签项

| 项 | 值 |
|---|---|
| 交付落点 | `word365/docs/design-n4-n2.md`（#004 唯一写入文件） |
| 基线 | 2026-11-14 21:03 · A 仓库 · 161 项 / 7 文件 0 失败 · 460 词通过（写前只读复跑无漂移） |
| **字段契约数** | **4**（新增 2：`db.ladder.mode`、`days[dk].byType`【D-004 精确化：最小必需字段、不得删】；语义变更 2：`settings.dailyMinutes` 升级唯一真源、`goal.dailyMinutes` 降级只读快照）+ 函数返回结构契约 3 项（§2.2） |
| **新增纯函数数** | **5**（P1 `minutesFreshCap` / P2 `resolveFreshTarget` / P3 `weightedEstMinutes` / P4 `resolveLadderMode` / P5 `previousMinuteOption`）；P3 的 `typeMix` 数据来源据 D-004 精确化改为 F4 最小 `byType` 分桶（**不新增第 6 个函数**）；另有既有函数改签 6 项（§3.2） |
| **任务数** | **5**（T01~T05），每任务 ≥3 相关文件，含依赖图（§6.2） |
| **风险数** | **6**（R1~R6，**R6 已关闭**；D-004 三条不入风险、不挂起） |
| **待拍板项** | **G0 阻塞裁决 0 项**（R1 已由 D-009 裁决）；G1 会签 R2/R4 已完成；D-011/D-012/D-013 已登记；**D-004 三条已按 G0 指示写入 §8 红线、不挂起**（`autoRebalance` 一条以 D-011 为准）；R6 已由 D-001 关闭 |
| **串行点清单** | `phrases.js`（G3 先落键 → G4 只引用）、`index.html` 引入行（本批无新增、核验顺序，若新增按任务卡顺序单组独占）、`css/app.css`（G4 独占）、`README.md`（T05 单组独占）、`365-groups/**`/总纲/`.workbuddy/memory/**`（仅 G0，含 `DECISIONS.md`）、`dist/**`（只由 build 生成）、新增测试独立文件（G3/G4 各一） |
| 写后复跑 | 本组只读再执行一次全量（纯文档产出、不改代码，结果并入交付回执）；最终回归判定归 #008(G8) |
| 下游交接 | G3(#005) / G4(#006) 依本文落地；G1 对 R2 / R4(OP-05) 会签**已完成**；G0 对 R1 已由 D-009 裁决、D-001/D-004/D-011/D-012/D-013 为已定输入；G8(#008) 回归判定 |

> 本文**未改动**任何源码 / 测试 / README / 既有交付物；未替 G1 改 AC、未替 G3/G4 写实现。**R1 已由 G0 D-009 裁决、阻塞解除**：T02 的 `weeklyRebalance` 子项按 D-009 与 T02 其余子项同批落地（§5.3 层二同批要求不变），本契约可直接供 G3/G4 落地。G0 裁决以 `365-groups/DECISIONS.md` 台账为准，本组不写该文件。

---

## 版本记录

| 版本 | 日期 | 组 / 任务卡 | 变更摘要 | 状态 |
|---|---|---|---|---|
| v1.0 | 2026-11-14 | G2-architecture / #004 | 首版：把 G1 PRD v1.0 的 23 条 AC 转为字段契约（3）、新增纯函数（5）、既有函数改签（6）、T01~T05 任务分解与依赖图、6 条风险登记、15 条红线清单、逐条回应 §5 五条硬合并判据；登记 R1 为 G0 阻塞裁决项、R2/R4 为 G1 会签项 | 已交付（后被 v1.1 修订） |
| v1.1 | 2026-11-14 | G2-architecture / #004 | 据 G0 **D-001**（PRD v1.0 终局有效、不改 PRD、不等待补充裁决；**R6 关闭**）与 **D-004 / D-004 精确化** 修订：新增 §0.6 裁决台账；**新增字段 F4 `days[dk].byType`**（最小必需字段、可选加法键、`ensureSchema` 幂等、`SCHEMA=3`，字段契约 3→4）；P3 数据来源由「纯内存 typeMix」改为「最小 `byType` 分桶按题型加权均时」；§8 红线改写 7/8 并新增 16（`userChosenSlot` / `autoRebalance` F5 / 不做完整埋点体系**但不得删 byType**）；R4 收敛为仅 OP-05 会签、R6 关闭；§6 任务与验收钩子补 F4 落地；纯函数仍 5 个、任务 5 个、风险 6 个。G0 裁决以 `365-groups/DECISIONS.md` 台账为准 | **据 D-001/D-004 修订完成**；R1 仍待 G0 台账裁决 |
| v1.2 | 2026-11-14 | G2-architecture / #011（会签） | 据 G0 **D-005 / D-009 / D-011 / D-012 / D-013** 收敛状态栏与红线：§7-R1 由「待 G0 裁决 / 阻塞」改为「**已由 D-009 裁决（行为变更同步），阻塞解除**」并写入裁决要点（G3 在 T02 同批精确更新 `phase1.mjs:419/:577/:579` 3 条断言期望值、其余 158 项逐字不动、项数仍 161；G1 修订 AC05/06/12 措辞编号不变；G8 独立复核；不采纳方案 B/C 与兼容层）；§7-R2/R4 标注 G1 会签通过（R4 中 OP-02 按 D-005 收敛、OP-05 按 D-006）；§0.6 / §8-16 补 **D-011**（`autoRebalance` 数据键保留为死数据、只删 UI 开关与读取路径、`defaultDB()` 仍返回 `true` 以保 `phase1.mjs:58/:65`）；§6.1-T02 / §6.2 移除 R1 阻塞标注、改为「按 D-009 落地、与 T02 其余子项同批」（层二同批要求保留）；§10 待拍板项改为「G0 阻塞裁决 0 项 / G1 会签 R2·R4 已完成 / D-011·D-012·D-013 已登记」。**不改字段 / 函数契约**（§2 / §3 / §4 / §5 / §6.1 任务内容 / §6.3 / §6.4 / §9 / §0.4 零改动）；#005 开工阻塞解除 | **据 D-005/D-009/D-011/D-012/D-013 修订完成**；技术契约零改动 |
| v1.2（补丁） | 2026-11-14 | G2-architecture / #011（会签，依 D-019 / D-023） | 依 G0 **D-023**（G10-reviewer #010-R P0 回报，消除与 PRD v1.1 的相反门禁）把 §9「§5.5 回归门禁」行由「既有 7 文件 161 项零改动」对齐为 **D-019 / PRD v1.1** 口径「精确更新 `core.test.phase1.mjs:419/:577/:579` 3 条断言期望值、其余 158 项逐字不动、项数仍 161（非放宽）」，并把该行 R1 状态同步改为「已由 D-009 裁决、G8 独立复核」；文档头「文档版本」按 **D-015** 同步升 v1.2（版本声明，不算扩大授权）。**不改 §3 函数契约、不改判定语义**；其余章节零改动 | **依 D-019 / D-023 对齐完成**；头部版本声明按 D-015 同步 |
| v1.3 | 2026-11-14 | G2-architecture / #011-R（精确化补丁） | 依 **D-015** 头部版本声明升 v1.2 并补注「按 D-005/D-009/D-011/D-012/D-013/D-019 收敛状态栏与红线」；依 **D-023** 把 §9「§5.5 回归门禁」行对齐 **D-019 / PRD v1.1** 口径（精确更新 `core.test.phase1.mjs:419/:577/:579` 3 条断言期望值、其余 158 项逐字不动、项数仍 161，非放宽）并写明「R1 已由 D-009 裁决、阻塞解除」；§3.2 改签表指针由「→ §7-R1 待 G0 台账裁决」收敛为「→ R1 已由 D-009 裁决（见 §7）」；其余 5 处历史引用（§9-§5.3、§2.2-C2、§1.2 表 `:58/:65` 行与推断段、§4.4/§0.5「OP-02 由 D-004 精确化」、§8 开头段「D-004 三条预裁决」）**一律保留原句**，登记为 **X11 已知偏差**（G9-closer 补总纲 §9.2），实现组一律以 `DECISIONS.md` 为准。**技术契约 §2 / §3 主体 / §4 / §5 / §6.1 任务内容 / §6.3 / §6.4 / §0.4 仍零改动**；判定语义不变；头部上游引用同步 PRD v1.1；**头部按 D-015/D-032 同步** | **依 D-015 / D-023 / X11 精确化完成**；#005 阻塞解除不变 |

*本文为任务卡 #004 的增量设计契约。所有未在 §1 标注【实测】的档位 / 阈值 / 判定线均为【规划】设计取值，非实测、非预测；目标值待 G3 契约落地与 G8 回归后回填。本文未改动任何源码、测试、README 与既有交付物；G0 后续裁决以 `365-groups/DECISIONS.md` 台账为准。*
