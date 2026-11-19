# 卡片 #032 · 遗忘曲线阶段二「临界优先排序」在 A 仓库落地 — 数据契约与实现边界（v1.5）

> **当前版本 v1.5（对齐 G0 终裁 D-070~D-073：删第 5 类 `fallback`、信息不足→`justDue`、U1/U7/U6 全闭合、零项待 G0；测试 #7 额度改强断言；历史见文末版本记录）**。
> **基线时点 2026-11-19 08:59（G0 实测，G2 自核一致）**：A 仓库 `E:/WorkBudy_WorkSpace/word365/`，`node verify.mjs` **PASS 27 文件 / 331 项 / 0 失败 · 460 词 · QA 34/0**，git HEAD `e4839a64033409f4f4f523c9ecf26565c67fb224`（短 `e4839a6`）。G2 于同日亲跑：`git rev-parse HEAD` 同值、`git status --short` 仅有未跟踪 `#032.md`、`node verify.mjs` 同结果。行号以该 HEAD 冻结磁盘为准；G3 落盘后若漂移，以**函数名锚点**为准。
> **本文件性质**：G2 唯一交付物；`word365/` 源码与测试零改动、B 仓库零改动、其他治理文档零改动、无 git commit。下游 **G3 按本契约实现、G10 按本契约复验**。文中「A」= `word365/`，「B」= `E:/dsh-workspace/word365`（数据模型不同，禁止照搬）。
> **阶段门**：CP2 的前置门 = **S2-AC1 ∧ S2-AC4**（路线 §5）；两者未同时通过不得进入阶段三（改间隔）。阶段二全程**不改 due / 不改间隔生成 / 不新增用户操作**（C4/C6/C8/K3/K5）。

---

## 0. 证据锚点（A 仓库真实行号）

| 锚点 | 行号 | 事实 |
|---|---|---|
| `SCHEMA = 3` | L11 | 全仓唯一版本常量，阶段二不得抬升 |
| `INTERVAL_CONTRACT` | L20 起 | 阶段一导出常量（段名/阶梯），阶段二只读消费 |
| `defaultSettings()` | L59–80 | 顶层设置工厂；`strengthMode:'off'` **L77**、`strengthFrom:0` **L78** —— 开关仿此风格 |
| `defaultDB()` | L82–148 | 顶层键清单；`returnGuard` **L118–124**、`settings` 来自 L90 |
| `newRecord()` | L150–170 | `evts:[]` L167、`s1:[]` **L168**（阶段一已落） |
| `dueOfWord(db,rec)` | L331–340 | 到期访问器：OFF 短路 `rec.due`（L333）；ON 且 `strengthFrom>0` 逐词接管（L335–338）；否则 `strengthDue`（L339） |
| `todayPlan(db,records)` | L342–397 | `var s=db.settings,t=now(),dk=dayKey(t)` L343；局部 `dueOf` L350 |
| ├ 回归重建态 | L353–358 | `returnGuard.rebuiltAt===dk && rebuildWords.length` → 仅重建包，**无 backlog.sort** |
| ├ 积压筛选 | L361–363 | `r.reps>0 && dueOf(r)>0 && dueOf(r)<=t && !r.graduated` |
| ├ 压力熔断判定 | L364 | `backlog.length >= s.pressureThreshold` → mode `'pause'` |
| ├ **排序点 A（熔断态）** | **L367** | `backlog.sort((a,b)=>dueOf(a)-dueOf(b)).slice(0, s.reviewLimit)` |
| ├ **排序点 B（正常态）** | **L375** | `backlog.sort((a,b)=>dueOf(a)-dueOf(b)).slice(0, bud.reviewTarget)` |
| └ `planTarget` | L379 / L383–387 | `reviews.length+freshs.length`；rebuild 态覆写为 `rebuildWords.length`；写 `db.days[dk].planTarget` L387 |
| `ensureSchema(db)` | L539–600 | `returnGuard` 幂等补 L544；settings 归一 L567–583（`strengthMode` 非法→off **L580**、`strengthFrom` 非法→0 **L583**）；**不补 `s1`** L590–591；**SCHEMA 恒 3** L593 |
| `computeDailyBudget(s,planDailyFresh)` | L1023–1029 | `reviewTarget` 7:3 口径，**额度唯一生效口径（K5）** |
| `detectReturn(db)` | L1085–1100 | `backlog` 计数口径 L1087–1091（`reps>0 && due>0 && due<=t && !graduated`） |
| `updateLastSeen(db)` | L1104–1116 | 写 `backlogCount` L1108、`rebuildWords/rebuiltAt/spreadDays` **L1111–1113** |
| `buildRebuildPack(db,cap)` | L1123–1145 | `cap` L1124、`pick=slice(0,cap)` L1136、`remaining` L1137、`spreadDays=clamp(3,5)` L1139、`avgDaily=reviewLimit` L1138；排序 L1135 为 `(b.score-a.score)||(a.due-b.due)` |
| `stats(db)` | L719–753 | `learned` L748、`wrongCount` L749、`totalAnswers` L750 —— 护栏分母来源 |
| `dailyCompletionRate(db,dk)` | L1241 | 每日完成率（节奏指标） |
| `rhythmSummary(db,opts)` | L1533 | 活跃/空档/间隔（节奏指标） |
| `retentionStats(db,opts)` | L1848 | 30 天相邻对保持率（**与阶段一取首次口径相反**） |
| `collectS1Events(db)` | L2149–2165 | 摊平各词 `rec.s1[]`、注入 `k`，纯只读 |
| `intervalSeg(ivl,isFirst)` | L2171–2178 | 毫秒量纲归段 |
| `baselineReport(events)` | L2184–2219 | 十段保持率，同词同段取最早、空段 `retained=null` |
| `falseKnownCandidates(events)` | L2222–2233 | 假认识候选 `{k,at,seg}`，只读 |
| `dueSnapshot(db,at)` | L2239–2253 | 到期队列快照，纯只读、不参与 `todayPlan` |
| `Core` 导出面 | L2255 起 | 阶段一 5 函数 L2260–2265；`stats` L2358；`todayPlan` L2281 |
| `tests/core.test.s1.mjs:241` | L241 | `assert.deepEqual(Object.keys(db).sort(), topKeys, '顶层键集不变')` —— **禁止新增顶层 db 键** |
| `tests/mode-attribution.test.mjs:28` | L28 | `evts` 元素恰 4 键 —— 禁止扩 `evts`（阶段一 D-065 已钉死） |
| `verify.mjs` `EXPECT` | L19–21 | `testFiles:27` / `testItems:331` |
| `js/phrases.js` `PHRASES` | L362–395 | 命名空间式：`STRENGTH`/`RETENTION`/`RHYTHM`/`CHALLENGE` 等，**新命名空间仿此加 `TIMING`** |

---

## 1. 开关与回退机制

### 1.1 决策（单一开关，落 `settings`，不新增顶层键）

| 项 | 决策 |
|---|---|
| 键名 | `settings.criticalSort` |
| 类型 | string 枚举 `'off' \| 'on'` |
| 落点 | **`settings` 内新字段**（与 `strengthMode` L77 并列），**禁止新增顶层 db 键** |
| 缺省 | `'off'`（在 `defaultSettings()` L59 内增 `criticalSort: 'off'`，紧邻 L77） |
| 非法归一 | 读侧：`s.criticalSort !== 'on'` 一律走 off 路径（仿 `dueOfWord` L333）；写侧 `ensureSchema`：`if (s.criticalSort !== 'on' && s.criticalSort !== 'off') { s.criticalSort = 'off'; }`（仿 L580） |
| 老库幂等补 | `ensureSchema` 归一化一行即可；`importJSON` L461 已调 `ensureSchema`，无需新迁移代码 |
| SCHEMA | **恒 3**（L11、L593 不动） |

**为何不新增顶层键（写死）**：`tests/core.test.s1.mjs:241` 断言 `Object.keys(db).sort() === topKeys`（顶层键集不变）。任何 `db.criticalSort`/`db.timing` 顶层键都会跑红该断言；既有 27 文件逐字不动（卡片红线）⇒ 顶层方案作废。是否有 `settings` 键集断言？全仓 13 测试文件 Grep 无 `Object.keys(settings).sort()` / `JSON.stringify(db.settings)` 断言（已核），且 `strengthMode`/`strengthFrom` 已作为 settings 字段存在并通过 331 项 ⇒ settings 落点安全。**注**：D-066 的「`ensureSchema` 不补 `s1`」护的是**记录键集逐字节一致**（L590–591），与 settings 字段归一无冲突——本契约不改任何 `rec` 键。

### 1.2 缺省逐字段等价当前 `dueOf` 升序（六点证明，写死）

1. `defaultDB()` 经 `defaultSettings()` 得 `criticalSort:'off'`；老库/无该字段者读侧与 `ensureSchema` 均归 `'off'`。
2. `todayPlan` 的 OFF 分支**逐字复用原比较器** `backlog.sort(function(a,b){return dueOf(a)-dueOf(b);})`（L367/L375 原字符不改），`dueOf` 闭包（L350）与 `dueOfWord`（L331）零改动。
3. `slice` 取数口径不变：熔断态仍 `s.reviewLimit`、正常态仍 `bud.reviewTarget`（`computeDailyBudget` L1023 零改动，K5）。
4. 故 `reviews` 的**元素身份与顺序**与固定基线逐字段一致；`freshs`/`mode`/`pausedFresh`/`text`/`rebuildWords` 由未改代码产出。
5. `planTarget = reviews.length + freshs.length`（L379）及 rebuild 覆写（L383–385）不变；`db.days[dk].planTarget` 写入（L387）不变。
6. `todayPlan` 全程**不写** `due/lvl/st/reps/wfix`（只读排序），故 ON/OFF 均不改这五字段。

⇒ 开关 OFF 下队列顺序、到期时间、当日额度、`planTarget` 口径与固定基线**逐字段一致**（S2-AC4），且 OFF 分支不读 `s1`（脏 `s1` 不影响 OFF 队列，测试可置脏探针）。

### 1.3 ON 路径也不改变行为边界

ON 仅把 `backlog` 的**顺序**换为 §2/§3 的可复算排序（同一批元素的置换，不增删），故 `reviews.length` 不变、`planTarget` 不变；不改 `due/lvl/st/reps/wfix`、不改 `days[dk].planTarget` 口径、不触发任何写函数（不调 `rateWord`/`updateLastSeen`）、不新增用户操作（无 UI 写入）、不读 `now()` 第二次（`at` 用 L343 已有 `t`）。

---

## 2. 四类来源分类 + 优先级纯函数

### 2.1 常量（单一真源，新增导出，仿 `INTERVAL_CONTRACT` L20）

```js
var CRITICAL_CONTRACT = {
  switchKey: 'criticalSort',
  on: 'on', off: 'off',
  sources: ['critical', 'wrongBack', 'justDue', 'overdue'], // 恰四值（D-070/D-071），与 G1 PRD §2/§4 类别键逐字对齐；禁止新增第 5 类
  rank: { critical: 0, wrongBack: 1, justDue: 2, overdue: 3 }, // 恰四值（D-070）；「临界最小」为硬约束
  // 默认序 = D-070 终裁：临界 < 错词回流 < 刚到期 < 明显逾期
  qLo: 0.5, qHi: 2,        // 分类阈值（D-071 已拍板 0.5/2，须真实数据回填 C9）
  qFallback: 0,            // D-070 认可：ivl 不可得时 q=0 < qLo ⇒ 自然落 justDue 安全缺省（非第 5 类）
  tieKey: 'wordKey',       // 终局 tie-break：词键字典序，禁随机/对象序
  // q 档位 → 类别显式映射（D-071 终裁 / G1/G2 会签，闭区间写死，边界含等号归 critical）：
  map: { below: 'justDue', within: 'critical', above: 'overdue', wrong: 'wrongBack', unknown: 'justDue' }
};
```

### 2.2 纯函数签名（新增 2 个，追加 `Core` 导出面；既有函数零改动）

**A. `classifyDueSource(rec, db, at) -> string`**
- 入参：`rec`（单个进度记录，只读）、`db`（只读）、`at`（必填 number ms，**不读 `now()`**）。
- 输出：`CRITICAL_CONTRACT.sources` **恰四类之一**（`critical`/`wrongBack`/`justDue`/`overdue`；D-070/D-071 锁死，**不新增第 5 类**）。信息不足一律安全缺省 `justDue`（D-071）。
- **只读已落盘事实**：`rec.wrong / rec.wfix`（L227–239 落库）、`rec.due / rec.last`、`rec.s1[].newIvl`（阶段一已落，只读）、`db.returnGuard`（L118）。**禁止**把 `s1` 当新数据源写、**禁止**改 `s1`、**禁止**读 `db.exam` 等非契约字段、**禁止**调用 `now()`。
- **`L` 单点定义（对齐 G1 PRD §2/U3，写死）**：`L = Math.max(0, at - dueOfWord(db, rec))`——与 backlog 筛选（L362 `dueOf(r)<=t`）**同源**；OFF 态 `dueOfWord≡rec.due`（L333）⇒ `L = at - rec.due`，与固定基线一致；`strengthMode==='on'` 时取 `strengthDue`，**不得与 `rec.due` 混用**（消解 G1 U3 双源风险）。`I = tailNewIvl(rec.s1)`（末条有限且 `>0` 的 `newIvl`）。
- **q 档位 → 四类显式映射（G1/G2 会签，闭区间，边界含等号归 `critical`；写死，测试 #2 逐档判等）**：

| 条件（first-match，自上而下） | 输出类别 | rank | 说明 |
|---|---|---|---|
| `rec.wrong > 0`（含 `wfix>0`，G1 B4） | `wrongBack` | 1 | **正交标签**，与 `L` 无关（even if L 很大仍为 wrongBack） |
| `q < qLo (0.5)` | `justDue` | 2 | 刚到期（不足半个排定间隔）；**`!rec` / `rec.due` 非有限或 `<=0` / `at` 非有限 / `I` 不可得（无有效 `newIvl` 且 `rec.last` 非有限）→ `q=qFallback=0 < qLo` → 本行 `justDue` 安全缺省（D-071，不新增第 5 类）** |
| `qLo ≤ q ≤ qHi (0.5≤q≤2)` | `critical` | 0 | 临界（半个到两个间隔窗口内，含边界） |
| `q > qHi (2)` | `overdue` | 3 | 明显逾期（超过两个排定间隔） |

  其中 `q = I>0 ? L/I : CRITICAL_CONTRACT.qFallback`。`I` 缺失（老库无 `s1`）但有有效 `rec.last` 时可取 `rec.due - rec.last`（有限且 `>0`）作 `I` 的等价替代（**不臆造**，仍为落盘事实派生）；两者皆不可得 → `q = qFallback = 0` → `justDue`（D-071 安全缺省）。
- 硬约束：纯只读——调用前后 `JSON.stringify(db)` 逐字节全等；同 `db+rec+at` 两次调用结果全等；`at` 非有限按 `0` 处理 ⇒ `q=qFallback=0` → `justDue`（**值域恒为四值之一**）。

**B. `criticalPriority(recs, opts) -> Array<rec>`**
- 入参：`recs`（待排记录数组，**不改入参**——内部 `slice()`）；`opts = { db, at, order? }`（`db` 只读、`at` 必填 ms、`order ∈ {'normal','rebuildL'}` 缺省 `'normal'`）。
- 输出：**同元素的新数组**（置换，不增删、不新建 rec、不改 rec 任何字段），按确定性复合键升序排列。
- **两模式复合键（逐维，全部可复算，禁随机/对象序）**：
  - `order==='normal'`（默认，正常态 L367/L375）：`K(r) = [ rank(classifyDueSource(r,db,at)), -q(r), dueOfWord(db,r), wordKey(r.w) ]`
    1. `rank`：来源等级（小者先）——`critical(0) < wrongBack(1) < justDue(2) < overdue(3)`（D-070 恰四值）。硬约束「临界先于刚到期与明显逾期」（G1 M1.2 / S2-AC1）成立；`wrongBack` 紧随临界（G1 §2.1）。
    2. `-q`：同类内逾期比大者先（"高逾期优先"的可复算表达）。
    3. `dueOfWord(db,r)`：**承接旧 `dueOf` 升序口径**（同为 L331 访问器，strengthMode 语义一致）作为第三维。
    4. `wordKey(r.w)`：词键字典序终局 tie-break（替代 JS 稳定排序依赖的对象序，保证跨实现可复算）。
  - `order==='rebuildL'`（回归态派生执行队列，见 §3.1/G1 M2.2）：`K'(r) = [ -L(r), dueOfWord(db,r), wordKey(r.w) ]`，其中 `L = Math.max(0, at - dueOfWord(db,r))`。**按 L 降序（最可能已遗忘优先），与正常态"临界优先"方向相反**；不看 rank/q（成员已是持久化包集合）。
- 比较器用逐维 `a[i]-b[i] || …`（字符串维用 `<`/`>`），`Array.prototype.sort`（ES2019 稳定）；**返回新数组**，不改 `recs`。
- 性质：normal 模式下若所有元素 rank/q 相同，键退化为 `[dueOf, wordKey]` ⇒ 与旧升序仅差同 due 时的字典序（ON 路径的确定性增强）；**OFF 路径不走此函数**。
- **词价值因子边界（G1 U5，写死）**：normal 模式复合键仅纳入 `wrongBack` 作为词价值代理（经 rank 表达）；`cet4` 高频加权 / `lvl`（`buildRebuildPack` L1130–1131 已有用法）**不引入正常态复算键**——守"不新增行为、可回退、不碰既有强度代理"。若 G0 要求纳入，须作为复合键新维度并证明不破坏「临界最小」硬约束（§9 U1 一并裁）。
- 硬约束：纯只读（前后 `JSON.stringify(db)` 全等）、不读 `now()`、不改 `due/lvl/st/reps/wfix`。

**阈值可观测改善的判据**（阶段门前置）：S2-AC1 要求"临界词优先于轻度逾期词"且"可复算"。本默认 rank 中 `critical(0) < justDue(2)` 且 `< overdue(3)`，临界词必排在任何刚到期/轻度或明显逾期词之前；`K` 四维全为落盘事实派生，同输入恒同输出。

### 2.3 分类只消费 `s1`、不写 `s1`（防止阶段一观测层被污染）

- `classifyDueSource` 读 `s1` 的**唯一字段**是末条 `newIvl`（`intervalSeg` 的同源值，L168 阶段一已落）；不读/不改 `plannedDue/lateMs/seg`，不往 `s1` push。
- 阶段一 5 函数（`collectS1Events`/`intervalSeg`/`baselineReport`/`falseKnownCandidates`/`dueSnapshot`）**零改动**；阶段二不改 `INTERVAL_CONTRACT`。
- "早于/接近/晚于衰减窗口"的标注（路线 §5 回顾间隔轴）由 `intervalSeg` 已落段名直接派生，不新增字段、不写 db（属阶段二范围，但非 S2-AC 硬判据，G3 可选实现，不阻塞阶段门）。

---

## 3. 接入点收敛（`todayPlan` 内）

### 3.1 替换范围：正常态两处 + 回归态派生队列；持久化包不动

**命名消歧（G1 澄清，写死）**：
- `db.returnGuard.rebuildWords`＝**持久化包**（`buildRebuildPack` L1123–1145 产出的词 key 数组），**逐字不动**（C6/K5，含 L1135 排序与成员）。
- `rebuildQueue`（＝`todayPlan` L356 的局部 `rebuildWords`）＝**派生执行队列**：L354–356 用 `rset[db.returnGuard.rebuildWords[k]]=1` 后 `records.filter(r=>rset[wordKey(r.w)])` 派生，**其顺序取 `records` 顺序，不是持久化包数组顺序**（G1 读码事实）。S2-AC2 的"高逾期词优先"作用于**此派生队列**，不碰持久化包。

| 态 | 锚点 | 决策 |
|---|---|---|
| 回归重建 | L353–358 | 成员筛选（L354–356）**逐字不动**；仅对派生执行队列 `rebuildQueue` 在 L356 后加可回退重排：`rebuildQueue = s.criticalSort === 'on' ? criticalPriority(rebuildQueue, {db, at:t, order:'rebuildL'}) : rebuildQueue`（按 L 降序）。`db.returnGuard.rebuildWords`/`rebuiltAt`/`spreadDays`/`backlogCount`（M2.5）与 `planTarget` 覆写（L383–385）**零改动**。 |
| 压力熔断 | **L367** | **换排序**：`reviews = s.criticalSort === 'on' ? criticalPriority(backlog, {db:db, at:t}).slice(0, s.reviewLimit) : backlog.sort((a,b)=>dueOf(a)-dueOf(b)).slice(0, s.reviewLimit);` |
| 正常态 | **L375** | **换排序**：同上，取数改 `bud.reviewTarget`；`bud = computeDailyBudget(...)` 口径不变。 |

**关键**：判定 `backlog.length >= s.pressureThreshold`（L364）、`s.reviewLimit`、`bud.reviewTarget`、`buildRebuildPack`（含 L1135）、`db.returnGuard.*` 全部**保持原样**——只换"选定成员后的顺序"，不换"选多少/哪些态/阈值/持久化包成员"。这是 C6/K5 的硬边界；G1 M2.2（派生队列 L 降序）与此**不冲突**（详见 §5.1/§9 U6 已消解）。

### 3.2 OFF 逐字旧路径（G10 审计锚点）

OFF 分支的比较器表达式与 L367/L375 原文**逐字符相同**（`function (a, b) { return dueOf(a) - dueOf(b); }`），仅外包一层 `s.criticalSort === 'on' ? … : …`；回归态 OFF 时 `rebuildQueue` 保持 L356 派生的 `records` 顺序（= 固定基线队列顺序）。读侧兜底：`s.criticalSort` 缺失/脏值（非 `'on'`）自然落入旧分支 ⇒ **无需 ensureSchema 即可安全回退**（但写侧仍归一以保证导出快照干净）。

### 3.3 单次时间基准

ON 路径的 `at` 直接取 L343 已有 `var t = now()`，与 backlog 筛选（L362）、OFF 比较器同源；**禁止**在排序处二次 `now()`/`Date.now()`。

---

## 4. 理由文案来源

### 4.1 落点与键名（D-070⑤ 已终裁）

- **落点（D-070⑤ 已拍板）**：新增 `PHRASES.TIMING` 命名空间于 `js/phrases.js` 的 `PHRASES`（L362–395）中，与 `STRENGTH`/`RETENTION` 并列（纯加法，不改既有命名空间与基线文案）。G1 PRD §4 的 `S2_REASONS` 仅为建议常量名，**键集相同**；落点已定 `phrases.js`，不再有"是否落盘"的未决。AC3 校验"返回值逐字等于 G1 §4.1 表"，G3 实现时经 `Core`/`PHRASES` 取用。
- 键集与四类来源**一一对应**（逐字文案**逐字采用 G1 PRD §4.1 表**，G2 不臆造、不改字）：

```js
var TIMING = {                       // 或 G0 裁为 S2_REASONS
  critical:  '按上次的复习节奏，今天进入复习窗口。',        // G1 §4.1
  wrongBack: '这个词之前答错过，今天再练一次。',            // G1 §4.1
  justDue:   '今天到期，安排一次复习。',                    // G1 §4.1
  overdue:   '到期时间已经过去，今天安排一次复习。'          // G1 §4.1
};
// 空态/回归态文案同取 G1 §4.1 对应行；禁复用 phrases.js:38/46 基线「追上/旧账」串
```

### 4.2 按词派生（不落 db、不新增用户操作）

- 派生链：某入队词 `rec` → `classifyDueSource(rec, db, at)` → 类别 `c` → `PHRASES.TIMING[c]`。
- **纯展示派生**：不写 `db.words`、不改任何 rec 字段、不 push 事件、不落库；任一入队词均可即时给出理由（S2-AC3）。
- **中性约束**（G1 逐字表须满足、测试断言）：不得含差额（"还差 N 天"）、百分数（含 `%`/`％`）、负向词（"欠账"/"落后"/"落后于计划"）；只陈述来源类别与时机的中性描述。
- 日维度"队列构成而非积压总数"由 `classifyDueSource` 对当日 `reviews` 计数派生，不展示积压总量（路线 §5 效果反馈轴），**不新增持久化键**。
- **展示位边界（G1 U4，写死，G1 已按此改判等）**：新理由是**独立只读查询**、**不覆盖 `todayPlan.text`**（L358 `returnMain`/L369 `pauseText` 基线串保持原样；这两串含「追上/旧账」命中 G1 禁语表，但属**既有基线文案、不在 S2 中性约束范围**）。S2 中性约束只作用于"新理由字段"。**"回退到基线形态"的判等对象＝OFF 时不返回 S2 理由（`null`/无该字段）**（G1 M3.5/M4.4 已同步），而 `todayPlan.text` 逐字段回到基线原串（§7 测试 #14）。故不存在"回到非中性串"歧义；是否由 G0 改为让新理由覆盖 `text`（U4 落点项）待裁，届时只改展示位、不改排序契约。

### 4.3 空值/脏值降级

- 若类别非 `CRITICAL_CONTRACT.sources` 之一，或 `PHRASES.TIMING[c]` 缺失/非 string/空串 → 回退 `PHRASES.TIMING.justDue`（再缺则空串由 UI 隐藏），**不抛错、不泄漏数字**。
- 绝不由 late/q 现算数字拼进文案（防"还差 N 天"式表达污染）。
- `reasonFor(rec, db, at)` 若 G3 需封装为纯函数，须与 §2.2 同约束（只读、不改 db、`at` 必填），可作为 `criticalPriority` 的配套导出；**非阶段门必需**，G0 可裁为内联派生。

---

## 5. 回归平滑（S2-AC2，零新增持久化键）

### 5.1 现有机制已满足，无需新键

| S2-AC2 判据 | 现有实现（A 仓库行号） | 结论 |
|---|---|---|
| 中断 7 天回归积压 120 词 | `detectReturn`（L1085–1100）：`daysGap>=returnDays(3) && backlog>=pressureThreshold(50)` → `isReturn` | 7 天 ≥ 3 且 120 ≥ 50 ⇒ 触发 |
| 首日入队量 ≤ 每日上限（**D-072 已闭合＝`rebuildCap=40`**） | `updateLastSeen`（L1110）调 `buildRebuildPack(db, rebuildCap=40)`（L72/L1124），`pick=slice(0,40)`（L1136）；rebuild 态 `todayPlan`（L353–358）仅用 `rebuildWords`（≤40），`planTarget=rebuildWords.length`（L383–385）。**回归态不调用 `computeDailyBudget`**（L372 仅正常态调），K5 在回归态本就指向 `rebuildCap`。历史实测 `reviewTarget` 随 `dailyFresh` 变（5→12/10→23/15→35/20→47）曾暴露 `fresh≤15` 时 `<40` 的冲突，D-072 裁决取选项① `rebuildCap`、否决硬截断 | **强断言** `queue.length === rebuildWords.length ≤ 40`；`buildRebuildPack`/`rebuildWords`/`spreadDays`/`planTarget` 零改动（守 C6/K5）；见 §9 U7（已闭合·D-072） |
| 高逾期词优先（G1 M2.2，**已消解**） | 作用对象是**派生执行队列** `rebuildQueue`（L356 `records.filter` 派生，顺序取 `records`，非 `db.returnGuard.rebuildWords` 数组序）；叠加层 `criticalPriority(..., {order:'rebuildL'})` 对其按 `L` 降序重排。**持久化包** `buildRebuildPack` L1135 `(b.score-a.score)||(a.due-b.due)` 及其产出 `db.returnGuard.rebuildWords` 逐字不动（G1 M2.5） | 满足且**零冲突**：M2.2 只断言派生队列，C6/K5 只冻结持久化包，两者对象不同（§3.1 命名消歧、§9 U6 已消解）。OFF 时队列回 records 顺序基线 |
| 余量分日平滑 | `remaining = max(0, cand.length - pick.length)` L1137；`spreadDays = min(5, max(3, ceil(remaining / reviewLimit)))` L1138–1139；落 `returnGuard.spreadDays` L1113（展示用） | 满足，**零新增键** |

- 以 120 积压为例：pick=40、remaining=80、avgDaily=60 → `ceil(80/60)=2` → `spreadDays = clamp(3,5)=3` 天分日消化。
- **结论**：回归平滑完全复用现有 `returnGuard`（`rebuiltAt/rebuildWords/backlogCount/spreadDays`，L118–124/L544/L1108/L1111–1113）与额度口径（回归态上限 `rebuildCap`、分日摊派 `reviewLimit`），**不新增任何持久化键，SCHEMA 仍 3**。高逾期优先只重排派生执行队列（绝不改持久化包）；"每日上限"＝`rebuildCap=40` 已由 D-072 闭合（§9 U7），无待裁口径。
- 本契约唯一新增的持久化字段是开关 `settings.criticalSort`（§1，属主队列排序，非回归平滑），由 `ensureSchema` 归一补。

### 5.2 若未来必须扩键（写死约束）

仅当 G0/G1 终裁要求"回归态也按临界优先重排重建包"时才动——但那违反 C6/K5（回归保护原样），**本契约明确不做**。若被迫扩键：仍 `SCHEMA` 恒 3（L11/L593 不动），在 `returnGuard` 内加字段并在 `ensureSchema` L544 的幂等补对象里并列补该字段（仿 `spreadDays`），`importJSON`（L461）经 `ensureSchema` 自动兼容；不在 `db` 顶层加键（守 `core.test.s1.mjs:241`）。

---

## 6. 护栏对照口径（S2-AC5，禁臆造指标）

### 6.1 三层分列（K4）

护栏（假认识率 / 复习积压率 / 日均时长 / 中途退出率）**只判"不可恶化"，不设提升目标**；节奏指标（次日有效复习完成率）只观察复习是否按时发生；长期效果唯一验收线是 30/60/90 天延迟保持率（阶段五口径）。**禁止用节奏指标冒充效果结论**。

### 6.2 四护栏定义与数据来源

| 护栏 | 定义（写死） | 数据来源（A 仓库锚点） | 现有能提供 | 只能人工对照/代理 |
|---|---|---|---|---|
| 假认识率 | `self==='know'` 却 `retrievedOk===false` 的事件数 / 全部 `self==='know'` 事件数 | `collectS1Events`(L2149)→`falseKnownCandidates`(L2222) 供分子；`s1[].selfRating/retrievedOk` 供分母（阶段一已落） | 候选清单与分子（Core 已有） | 比率需在对照脚本计算；**不新增 Core 函数、不臆造阈值** |
| 复习积压率 | 到期未毕业词数 / 已学词数 | 分子 `detectReturn` 的 `backlog`（L1090）或 `dueSnapshot(db,at).count`（L2239）；分母 `stats(db).learned`（L748） | 分子分母均可由现有纯函数复算 | 无——现有可算（落 `returnGuard.backlogCount` L1108 供快照） |
| 日均时长 | 每日真实作答耗时分钟的均值 | `db.days[dk].total`（作答数）＋`SEC_PER_WORD`(L27) 或 `plan.estMinutes`(L109/L1068)；`dailyMinutes`(L70) 为预算非实测 | 仅为**估算**（`estMinutes` 或 `SEC_PER_WORD×total/60`） | **真实时长无落库字段**（`days` 无分钟字段）⇒ 只能作估算/人工对照，禁称"实测日均时长" |
| 中途退出率 | 当日有计划但未完成（中途退出）的天数 / 有计划的的总天数 | `dailyCompletionRate`(L1241)、`db.days[dk].total` 与 `planTarget`（L387）代理 | 完成率/未完成率代理 | "中途退出"无独立事件 ⇒ 只能用 `1 - dailyCompletionRate` 代理，标"代理指标"，禁臆造退出事件 |

### 6.3 节奏与长期线

- 节奏指标（次日有效复习完成率）：`dailyCompletionRate`(L1241) + `rhythmSummary`(L1533) 可直接给前后对照；仅观察，不作效果结论。
- 长期线（30/60/90 天延迟保持率）：`baselineReport`(L2184) 提供按段保持率、`retentionStats`(L1848) 提供 30 天相邻对；阶段二**只定义口径、登记对照**，不产出 90 天结论（阶段五范畴）。
- 口径隔离：`baselineReport`（同词同段取**最早**）与 `retentionStats`（取**最近**）数据源数组不同、互不包装（沿用 `design-s1.md §3.6`）；护栏对照须并列展示两口径，不得混用。
- **对照三态与容差（＝G1 U6，**D-073 已终裁**）**：护栏前后对照输出 `worse | equal | better` 三态；按 K4「只判不可恶化、不设提升目标」⇒ `better` 不作通过条件、`worse` 触发 AC4 回退、不因 better 推进阶段三。D-073 按数据粒度分别定 `equal` 容差（**不设统一百分比**）：① 假认识率＝计数型容差 0（分子都 0 或前后候选数完全相同；分母 0 → `null`）；② 复习积压率＝计数型容差 0（逐项相等；分母 0 → `null`）；③ 日均时长＝仅估算（`estMinutes`/`SEC_PER_WORD×total/60`），差值 `≤1 分钟`或均 0 为 equal（禁称"实测"）；④ 中途退出率＝代理指标 `1-dailyCompletionRate`，容差 0（前后均 `null` 或逐值相等）。⑤ 观察窗＝前后各最近 7 个自然日（与 `dailyCompletionRate`/`rhythmSummary` 同窗）；有效日 <3 → `null` 并标"样本不足，不出效果结论"。测试 #16/#17 只断言"能提供对照所需分子分母"与"口径不混用"，阈值判定按 D-073 在对照脚本实现、不臆造额外阈值。

---

## 7. 测试设计：`tests/core.test.s2.mjs`（新独立文件）

- **风格**：`node:test` + `createRequire`（仿 `tests/core.test.strength.mjs:1–11`），只 `require('../js/core.js')`（文案断言另 `require('../js/phrases.js')`，若 G0 裁定不落 phrases 则改读 G1 表常量）；**既有 27 文件逐字不动**。
- **预估项数 N = 22**；G3 实现后 `verify.mjs` 的 `EXPECT.testFiles` **27→28**、`EXPECT.testItems` **331→353**（331+22）；项数若调整须同步 EXPECT 并在卡片记录。

| # | 对应 AC | 断言要点 |
|---|---|---|
| 1 | AC1/回退 | `criticalSort` 缺省 `'off'`（`defaultDB`/`defaultSettings`/`ensureSchema` 归一）；非法值归一 off；顶层键集不变（守 `core.test.s1.mjs:241`）；`SCHEMA===3` |
| 2 | AC1 | `classifyDueSource` **q 档位→四类显式映射逐档判等**（D-071 闭区间）：`q=0.1→justDue`、`q=0.5` 与 `q=2` 边界→`critical`、`q=3→overdue`、`wrong>0→wrongBack`（正交，即使 L 大）；无 s1 / `I` 不可得 / 脏 rec / `at` 非有限 → `justDue` 安全缺省（D-071）；**断言返回值恒在四值之一、`sources` 恰四值、无第 5 类值** |
| 3 | AC1 | `criticalPriority` 混合队列：临界词排在轻度逾期词之前；输出为输入元素的置换（集合相同、条数相同） |
| 4 | AC1 | 同输入两次调用深度相等（可复算）；排序键四维逐维生效（rank→-q→dueOf→wordKey） |
| 5 | AC1 | tie-break：同 rank/同 q 时按 `dueOf` 升序，再同 due 时按 `wordKey` 字典序；禁随机/对象序 |
| 6 | AC1/边界 | 两纯函数调用前后 `JSON.stringify(db)` 逐字节全等；不改 rec 任何字段 |
| 7 | AC2 | 构造回归（积压 120）：**强断言** `queue.length === rebuildWords.length ≤ rebuildCap(40)`（D-072），且派生队列按 `L` 降序（高逾期在前，可独立复算），持久化包 `db.returnGuard.rebuildWords` 与基线逐字段同值；额度口径已由 D-072 闭合，**无"不强断"项** |
| 8 | AC2 | `buildRebuildPack` 的 `remaining/spreadDays` 公式（120→40/80/3 天）；`returnGuard.spreadDays` 落库；**零新增键** |
| 9 | AC2/不变量 | ON 时**派生执行队列** `rebuildQueue` 按 `L` 降序（可独立复算），OFF 时回 `records` 顺序基线；**持久化包** `db.returnGuard.rebuildWords/rebuiltAt/spreadDays/backlogCount` 与基线逐字段同值（G1 M2.5）、`buildRebuildPack` L1135 成员与顺序原样（C6/K5）——证明 M2.2 与 C6/K5 对象分离不冲突 |
| 10 | AC3 | 四类各能给出 `PHRASES.TIMING[c]`；文案正则断言无 `%`/`％`/数字差额/"欠账"/"落后" |
| 11 | AC3/降级 | 脏类别/空文案回退中性文案，不抛错、不泄数字 |
| 12 | AC3/不落库 | 理由派生前后 `JSON.stringify(db)` 全等；无新用户操作（不调写函数） |
| 13 | AC4/回退队列 | OFF 下 `todayPlan` 两处（pause 态 L367 / normal 态 L375）`reviews` 顺序与固定基线逐字段一致 |
| 14 | AC4/回退字段 | OFF 下 `due/lvl/st/reps/wfix` 不变、`freshs/mode/pausedFresh/text/planTarget` 逐字段一致、`days[dk].planTarget` 口径不变 |
| 15 | AC4/隔离 | OFF 下置脏 `s1` 不影响队列（证明 OFF 不读 s1）；ON 下不改 `s1` 内容 |
| 16 | AC5/护栏 | `falseKnownCandidates`/`dueSnapshot`/`stats`/`dailyCompletionRate`/`rhythmSummary` 能产出四护栏对照所需分子分母（不臆造指标） |
| 17 | AC5/口径 | `baselineReport`（取首次）与 `retentionStats`（取最近）并列、互不为包装；节奏指标不冒充效果结论 |
| 18 | 阶段门 | 同文件内 `S2-AC1 ∧ S2-AC4` 门断言（两者同时通过才记 PASS，否则门断言失败） |
| 19 | 边界 | `null`/空/脏 db、`at` 非有限、`rec` 缺字段、`s1` 脏 → 各纯函数不抛错、返回确定结构 |
| 20 | 导出面 | `Core.classifyDueSource` / `Core.criticalPriority` / `Core.CRITICAL_CONTRACT` 可取；`PHRASES.TIMING` 可取（若落 phrases） |
| 21 | 既有层隔离 | `strengthOf/strengthDue/retentionStats` 结果在开关 on/off、`s1` 有无时逐字段全等（既有 331 项零回归） |
| 22 | 门禁 | 本文件为独立新文件、既有 27 文件零改动；`verify.mjs` `EXPECT` 写 28 / 353 并注释来源 |

- **不得改**：既有 27 测试文件（尤其 `mode-attribution.test.mjs:28`、`core.test.s1.mjs:241`）、`index.html` 加载序列、`read.me`、任何 `due/lvl/st/reps/wfix` 计算、`schedule`/`strengthDue`、固定阶梯初值、`buildRebuildPack`/`returnGuard`/`pressureThreshold`。
- **须经 `Core.*` 取到**：`classifyDueSource`、`criticalPriority`、`CRITICAL_CONTRACT`（及可选的 `reasonFor`）。

---

## 8. 风险与降级（5 条）

| # | 风险 | 影响 | 最小降级方案 |
|---|---|---|---|
| R1 | 排序不稳定（tie-break 依赖对象序/随机） | 同输入不同序，S2-AC1 "可复算"失败 | 复合键四维全落盘派生、终局 `wordKey` 字典序；ES2019 稳定 sort；测试 #3/#4/#5 |
| R2 | 开关漂移（settings 脏值/缺失致行为不定；或误把 on 写进 rec 顶层） | 回退不等价、顶层键断言跑红 | `'on'` 为唯一开启值、其余一律 off（读侧兜底＋ensureSchema 归一）；落 settings 不落顶层；OFF 逐字旧路径；测试 #1/#13/#14/#15 |
| R3 | 回归平滑越界（改了持久化包或超每日上限） | 违背 C6/K5，回归保护失效 | `buildRebuildPack`/`db.returnGuard.*`/`pressureThreshold` 零改动；仅重排**派生执行队列** `rebuildQueue`；"上限"＝`rebuildCap=40`（D-072 已闭合，§9 U7）；测试 #7/#8/#9 |
| R4 | 文案污染（理由含数字/百分数/负向词或落库） | 违背 C8 文案禁令、产生"欠账"式表达 | G1 逐字表 + `PHRASES.TIMING` 白名单键，脏值退中性文案，纯派生不落库；测试 #10/#11/#12 |
| R5 | 指标不可得而臆造（日均时长/中途退出被当成实测） | 护栏对照失真、被当作效果结论 | 明确"现有可提供 vs 只能代理/人工对照"（§6.2）；代理指标显式标注；护栏只判不可恶化、不设提升目标（K4）；测试 #16/#17 |

---

## 9. G0 终裁状态与已闭合项（D-070~D-073 全部拍板，零项待 G0）

> **G0 终裁状态（截至 D-070~D-073，2026-11-19）：零项待 G0。** U1（阈值 `qLo=0.5/qHi=2`）由 D-071 拍板、U7（回归上限 `rebuildCap=40`）由 D-072 拍板、U6（四护栏容差/观察窗/三态）由 D-073 拍板、U2（开关 `settings.criticalSort`）由 D-070① 拍板——**全部闭合**；其余项均 G1/G2 会签或 G0 已裁决，G3 按本文 + D-070~D-073 实现即可，无待裁项。
>
> **编号映射（与 G1 PRD §6 对齐）**：本文 U1↔G1 U1（阈值数值；**L 口径 G1 已撤回 `rec.due` 建议、会签取 `dueOfWord`，不属 G0 未决**）、本文 U2（开关/函数名，G1 U3 的 L 部分已撤回）、本文 U3/U4↔G1 U4（文案落点/逐字）、本文 U5＝测试项数（G1 无对应）、**本文 U6↔G1 U6（护栏容差）**、**本文 U7↔G1 U2（回归上限，G1 标最优先）**。G1 U5（词价值因子）已在 §2.2 写死。

> **已消解 / 已会签项（无需 G0，G3 直接按契约执行）**：
> - **回归排序（G1 M2.2，v1.2 已消解）**：派生执行队列 `rebuildQueue`（L356，顺序取 `records`）按 L 降序重排；持久化包 `db.returnGuard.rebuildWords` / `buildRebuildPack` L1135 逐字不动（G1 M2.5 / C6/K5）。对象不同、不冲突（§3.1/§5.1/测试 #9）。**注**：此即 v1.1/v1.2 误置的"U6"，现更正——U6 在 G1/G2 两边均为护栏口径，回归排序不占未决编号。
> - **L 口径**：`L=max(0,t−dueOfWord(db,rec))`，G1 已撤回 `rec.due` 建议，G1/G2 会签（§2.2）。
> - **q→类别映射**：闭区间含边界归 `critical`、`wrong>0` 正交 `wrongBack`、信息不足→`justDue` 安全缺省（**不新增第 5 类**，`sources` 恰四值），D-071 终裁 / G1/G2 会签（§2.2）。
> - **U1 阈值**：D-071 拍板 `qLo=0.5 / qHi=2`（须真实数据回填，路线 C9），闭合。
> - **U7 回归上限**：D-072 拍板选项①＝`rebuildCap=40`（回归分支不调 `computeDailyBudget`），否决 `min(rebuildCap,reviewTarget)` 硬截断，闭合。
> - **词价值因子**：正常态仅 `wrongBack` 经 rank 入序，`cet4`/`lvl` 不引入（§2.2）；**展示位**：新理由不覆盖 `todayPlan.text`、OFF 时不返回 S2 理由（null/无该字段）即为"基线形态"（§4.2）；**U2 默认选项①**：`U=rebuildCap=40`，判等 `queue.length===40===U`（G1 M2.1 已同步）。

1. **U1（已闭合 · D-071）**：阈值 `qLo=0.5 / qHi=2` 已由 D-071 拍板（须真实数据回填，路线 C9）；rank 序 D-070 锁死 `critical(0) < wrongBack(1) < justDue(2) < overdue(3)` **恰四值**；q→类别映射 `q<qLo→justDue`、`qLo≤q≤qHi→critical` 闭区间含边界、`q>qHi→overdue`、`wrong>0→wrongBack` 正交、信息不足→`justDue`（**不新增第 5 类**）；`L=max(0,t−dueOfWord)`（G1 撤回 `rec.due` 建议）。**本项无 G0 未决内容，G3 直接按 D-070/D-071 实现**。
2. **U2 开关命名（已闭合 · D-070①）**：开关＝`settings.criticalSort`（'off'|'on'，缺省 off、非法归一、ensureSchema 幂等补、不新增顶层键、SCHEMA 恒 3）；落 settings 不落顶层的论证（§1.1）为硬约束。G1 建议的公开函数名 `buildPriorityQueue(db,records,t)` 与 G2 的 `criticalPriority(recs,{db,at})` 语义等价，**是否 alias 导出名由 G3 自行决定，不改 `todayPlan` 两处排序接缝**。
3. **U3 文案落点/常量名（已闭合 · D-070⑤）**：落点＝`phrases.js` 的 `PHRASES.TIMING` 命名空间；G1 的 `S2_REASONS` 仅为建议常量名、键集相同；四类一一对应、降级口径（§4）已定。
4. **U4 逐字文案**：逐字采用 G1 PRD §4.1 表（含空态/回归态），本文不臆造、不改字；G2 只定键名、落点、按词派生与降级。
5. **U5 项数 N=22**：为预估值；G3 落盘后按实际项数微调并同步 `verify.mjs` `EXPECT`（28 / 331+N）与卡片记录；G10 按本契约复验阶段门 `S2-AC1 ∧ S2-AC4`。
6. **U6（已闭合 · D-073，四护栏容差/观察窗/三态阈值）**：S2-AC5 要求节奏指标与四护栏可前后对照且"只判不可恶化、不设提升目标"（K4）。D-073 按数据粒度分别定 `equal` 容差：假认识率/复习积压率/中途退出率计数型容差 0（分母 0 → `null`），日均时长仅估算、差值 `≤1 分钟`或均 0 为 equal（禁称"实测"）；观察窗前后各最近 7 自然日（有效日 <3 → `null` 标样本不足）；`worse` → 触发 AC4 回退、不因 better 推进阶段三。详见 §6.3。**本项无 G0 未决内容，G3 按 D-073 实现对照输出**。
7. **U7（已闭合 · D-072）**：回归态"每日上限"取 `rebuildCap=40`（选项①），否决 `min(rebuildCap,reviewTarget)` 硬截断。G0 亲核回归分支 L353–358 **不调用** `computeDailyBudget`（仅 L372 正常态调），故 K5 在回归态本就指向 `rebuildCap`。`buildRebuildPack`/`rebuildWords`/`spreadDays`/`planTarget` 全部原样；派生执行队列仍按 D-071 可重排（高逾期优先），`queue.length = rebuildWords.length ≤ 40`；G1 PRD M2.1 判等 `U=rebuildCap`、测试 #7 按 `rebuildCap` 断言。**本项无 G0 未决内容，G3 直接按 D-072 实现**。

---

## 版本记录

- **v1.5（2026-11-19，G2 · 对齐 D-073，零项待 G0 + 测试 #7 强断言）**：接 g1-s2 第三次提醒并 G2 亲核 `DECISIONS.md:91`（D-073）后修订。① **零项待 G0**：D-073 已终裁四护栏容差（假认识/积压/退出率容差 0、日均时长 ≤1 分钟估算、观察窗前后各 7 自然日、有效日<3→null、worse 触发 AC4 回退），U6 闭合；连同已闭合的 U1（D-071）、U7（D-072）、U2 开关命名（D-070①）、U3 文案落点（D-070⑤），**全部待裁项归零**。§6.3 补入 D-073 精确容差、§9 状态/标题改"零项待 G0"、U2/U3/U6 标已闭合。② **测试 #7 改强断言**：由"不强断"改为强断言 `queue.length=rebuildWords.length≤rebuildCap(40)` + 派生队列 L 降序 + 持久化包逐字段同基线（S2-AC2 额度护栏不再被架空）；§5.1 表/结论同步标记 D-072 闭合。③ §4.1 落点标 D-070⑤ 已定。纯函数/开关/接入点/N=22/EXPECT 28/353/5 条风险均不变。
- **v1.4（2026-11-19，G2 · 对齐 G0 终裁 D-070/D-071/D-072）**：接 g1-s2 提醒并 G2 亲核 `DECISIONS.md:88-90` 后修订。**核心修正（契约实定义级）**：v1.2/v1.3 引入的第 5 类 `fallback` 与 D-071 直接冲突——删除 `CRITICAL_CONTRACT` 的 `fallback:4` 与类别值、`rank`/`sources` 恢复**恰四值**（D-070）；信息不足（无 s1 / `I` 不可得 / 脏 rec / `at` 非有限）改走 `q=qFallback=0 < qLo` → **`justDue` 安全缺省**（D-071，不新增第 5 类）；`map.unknown` 改 `justDue`；§2.2 输出/表/§2.2-B rank/测试 #2 同步。**未决收敛**：U1 阈值 `qLo=0.5/qHi=2` 已由 D-071 拍板（须真实数据回填 C9）、U7 回归上限已由 D-072 拍板选项① `rebuildCap=40`，两项闭合——**真正待 G0 由 3 项降为 1 项（U6 护栏容差）**。保留 D-071 已终裁的派生队列重排（高逾期优先）、持久化包零改动、OFF 原生顺序回退。纯函数/开关/接入点/N=22/5 条风险均不变。
- **v1.3（2026-11-19，G2 · G1/G2 全项会签收敛）**：接 G1-s2 第三次同步（全部会签）后修订。① **修正 §9 编号映射笔误**：U6 在 G1/G2 两边均为**护栏口径**，v1.1/v1.2 误把回归排序 M2.2 标作 U6；现将回归排序消解移入"已消解项"说明、U6 条目改为护栏容差（§6.2/§6.3 对齐），真正留 G0 的仅 3 项（U1 阈值数值、U7 回归上限、U6 护栏容差）。② **L 口径**：G1 撤回 `rec.due` 建议、会签取 `dueOfWord`，U1 移出该未决、归入已会签项。③ **U7**：G1 M2.1 已按选项①写判等 `queue.length===40===U`。④ **U4 展示位**：写死"OFF 回退＝不返回 S2 理由（null/无该字段）"为基线形态判等对象（G1 M3.5/M4.4 已同步），消除"回到非中性串"歧义。复算键与类别序双方一致。纯函数/开关/接入点/N=22/5 条风险均不变。
- **v1.2（2026-11-19，G2 · U6 消解 + q 映射会签）**：接 G1-s2 第二次同步后修订。① **U6 由"分歧"改"已消解"**：读码确认 `todayPlan` L354–356 派生的 `rebuildWords`（派生执行队列，顺序取 `records`）≠ `db.returnGuard.rebuildWords`（持久化包），故 G1 M2.2（派生队列按 L 降序）与 C6/K5（持久化包原样 / G1 M2.5）**对象不同、不冲突**；§3.1 增命名消歧（`rebuildQueue` vs `db.returnGuard.rebuildWords`），`criticalPriority` 增 `opts.order='rebuildL'` 模式（复合键 `[-L, dueOf, wordKey]`），回归态 L356 后按开关重排派生队列、持久化包零改动；测试 #9 相应改写。保留"唯一需 G0 情形＝连派生队列也冻结则 AC2 高逾期优先无法落地"。② **U1 会签**：写死 `q 档位→四类显式映射`（闭区间含边界归 critical、`wrong>0` 正交 wrongBack、信息不足→`fallback` 单列不参与临界断言），映射规则 G1/G2 已会签不必等 G0，仅阈值数值待 G0；`CRITICAL_CONTRACT` 增 `fallback:4`/`map`。③ 标题/版本记录升 v1.2。纯函数仍 2 个（增一模式非增函数）、开关/接入点/N=22 不变。
- **v1.1（2026-11-19，G2 · 对齐 G1 PRD §6 六项未决 + 修正 U2 口径）**：接 G1-s2 同步后修订。① **修正一处口径错误**：v1.0 §5.1/测试#7 曾以 `40≤reviewLimit(60)` 论证 S2-AC2 首日上限满足，违反 K5（应以 `computeDailyBudget().reviewTarget` 为准）；G2 亲跑实测 `fresh=5→12/10→23/15→35/20→47`，`fresh≤15` 时 `reviewTarget<40` 冲突属实 ⇒ 改按 `rebuildCap=40` 既有口径表述，并新增 **U7（＝G1 U2，G1 标最优先）** 登记"每日上限取 rebuildCap 还是 reviewTarget"的 G0 终裁项，默认取①不改回归包。② §4.2 写死"新理由不覆盖 `todayPlan.text`"（G1 U4 展示位）、§2.2 写死"词价值因子仅 wrongBack 入正常态键、cet4/lvl 不引入"（G1 U5）、§6.3 写死"护栏三态 worse|equal|better 与容差阈值由 G0 定、阶段二不臆造"（G1 U6）。③ §9 增编号映射避免与 G1 §6 混淆。纯函数/开关/接入点/N=22 均未变。
- **v1.0（2026-11-19，G2）**：首版。基线自核 27 文件 / 331 项 / 0 失败 · 460 词 · QA 34/0（HEAD `e4839a6`，08:59 时点）。定 `settings.criticalSort`（'off'|'on'）单一开关（settings 落点、缺省 off、非法归一、ensureSchema 幂等补、顶层键不动、SCHEMA 恒 3）；新增 `CRITICAL_CONTRACT` 常量与 `classifyDueSource`/`criticalPriority` 两纯函数（四类来源分类 + 四维确定性复合键）；接入点收敛至 `todayPlan` L367/L375 两处排序、回归态与阈值零改动；`PHRASES.TIMING` 文案落点与按词纯派生/降级；回归平滑复用现有 `returnGuard`/`buildRebuildPack`（零新增键）；S2-AC5 四护栏数据来源与"代理/人工对照"边界（禁臆造）；新测试 `tests/core.test.s2.mjs` N=22、EXPECT 28/353；5 条风险与 6 项 G0 终裁前未决项。**与 G1 PRD v1.0 对齐**：类别键统一 `critical/wrongBack/justDue/overdue`、rank 序取 G1 §2.1 建议（临界最小）、`L` 单点取 `dueOfWord`（消解 G1 U3）、文案逐字采用 G1 §4.1 表；新增 U6 登记 G1 M2.2（回归包 L 降序）与 C6/K5（回归原样）的分歧，默认不改。既有 27 文件、B 仓库、其他治理文档零改动，无 git commit。
