# 今日挑战 · 契约符合性核对（G2 → G0）

> 核对对象：`js/core.js`（挑战段 1768–1985、`dueOfWord` 277–286、`ensureSchema` 499–504、`defaultDB` 132）、`js/app.js`（221–406、509、520–523、1750–1757）、`tests/challenge.test.mjs`（11 项）、`tests/ui.test.challenge.mjs`
> 基准：`G2-architecture/design-challenge.md` **v1.2**（依 PRD v1.5；v1.2 已按 D1/D3/D4/D6 完成措辞勘误，判定不变）
> 方法：只读逐条对照签名/返回值/不变量与代码；**未运行测试、未改代码**。结论分「符合 / 偏离 / 无法判定」，偏离只登记，不评价视觉与文案。

**结论摘要**：7 个函数签名与返回键集**全部符合**；数据面 3 条**全部符合**；全局不变量（零写入、I3、无随机、无 DOM）**全部符合**。登记偏离 6 条（D1–D6，其中 D2/D5 建议改码、D1/D3/D4/D6 建议改契约或留档）、测试覆盖缺口 1 组（D7）。

## 1. 数据契约

| 条款 | 实际实现 | 结论 |
|---|---|---|
| `defaultDB()` 含 `challenge:{dateKey:'',size:0,doneAt:0}`（§1.2） | core.js:132 逐字一致 | 符合 |
| `ensureSchema` 只补这三项、幂等、未知键保留、SCHEMA 不赋值（§1.3） | core.js:499–504：缺失/非对象/数组 → 重建；`dateKey` 非 string → `''`；`size` 走 `safeNonNeg`；`doneAt` 非有限数 → `0`；无 `db.schema` 赋值 | 符合（附 D6：`size` 未取整） |
| `played = dateKey===今日 && size>=1`，`mode` 只作下游（§1.4/§2.1） | core.js:1875–1876：`recSize` 先 `>0` 再 `Math.floor`，`played` 单布尔；`mode` 1879 三段式 | 符合 |
| `commitChallenge` 只写 `{dateKey,size,doneAt}`（§2.7） | core.js:1978–1983 **显式重建对象**后赋值，非整对象替换 | 符合 |

## 2. 函数逐条

### 2.1 `challengeState(db, at)` → 7 键
- 返回键：`dateKey/played/size/doneAt/mode/poolSize/optionCapacity` —— core.js:1880–1888，**与契约逐一相同**，无多余键。符合。
- `size` 双分支：`played ? recSize : pool.size`（1883）= 契约「已玩取 `record.size`、未玩取 `min(5,poolSize)`」。符合。
- `poolSize = pool.total`（1886），实现 1846–1867 中 `total` 为三重排除后未截断数。符合。
- 四态优先级 1879：`played ? done : (total===0 ? empty : (cap<2 ? not-enough : ready))`。符合。
- `doneAt` 在未玩时回传 `c.doneAt`（1884），即跨日残留的昨日时间戳；契约未定义该字段未玩语义 → **D6**。

### 2.2 `challengePool(db, at)` → `{ok,keys,size,reason}`
- 签名/返回：1841、1863、1867。多返回 `total`（契约 §2.2 未列，`state` 需要）→ **属加法扩展，记「符合（扩展）」**。
- 到期判定：1858–1859 `dueOfWord(db,rec) > 0 && <= endOfDay(ts)`，闭区间、含强度层；`challengeEndOfDay` 1774–1778 置 `23:59:59.999`。符合。
- 三重排除：1847（`reps>0 && !graduated`）、1848–1851（`entry` 缺失 / 首义项空）。符合。
- 去重：`seen[k]`（1846）按 `w::` key。符合。
- **选题规则偏离**：契约「候选按 key 升序、取前 `size` 个」→ 实现 1865–1866 为「`dayKey(ts)+':pool'` 种子洗牌 → 取 5 → 再 `.sort()`」。确定性仍成立（AC03 不破），但选中的词不同，且出题顺序恒为字典序 → **D1**。
- 错词排序：契约「按 `wrong` 降序」，实现 1861 按 key 升序；因选择走洗牌，序无实际影响 → 并入 **D1**。

### 2.3 `challengeStart(db, at)` → `{ok,dateKey,size,keys,replayed,record,reason}`
- 1908 前 `base` 七键齐备（1895），各分支只改值不改键集。符合。
- 已玩：1897 `replayed:true, size:st.size, keys:[], record:db.challenge`，不重选题。符合。
- `empty/not-enough`：1900–1902 透传 `reason`。符合。
- I3：`dateKey` 来自 `st.dateKey`（1873 唯一 `dayKey(ts)`），未在 `commitChallenge` 重算。符合。
- 备注（非偏离）：1904 再算一次 pool，`state` 内已算过（1877），单次调用重复两次；纯函数无副作用，仅性能。

### 2.4 `challengeQuestion(db, key, dateKey)` → Question|null
- 返回键 `key/w/prompt/options[{i,w}]/answerIdx/senseIdx`：1939，与契约一致。符合。
- 题面：1915–1917 `pickSense(senses, dateKey+key)`。符合。
- 干扰项：1922–1928 排除 `norm(e.w)===target` 与 `sensesOf(e)[0].text===prompt`；`challengeEntries` 1809–1826 已按 `norm(w)` 去重。符合。
- 确定性：1916/1931/1932 全用 `dateKey/key` 导出 seed；`challengeShuffle` 1786–1795 为 xorshift32，全段无 `Math.random`（已 grep 核验）。符合。
- 选项数：1929–1932 `total=min(4,cap)`、`need=total-1`，但 `distractors` 可能不足 `need` → 实际 3 项也可能出现在 `cap>=4` 时 → **D4**。
- 空题面：1917 在 `senses[senseIdx].text` 空时**回退 `senses[0].text`**，契约要求直接 `null` → **D3**。

### 2.5 `challengeGrade(question, picked)` → `{ok,pickedWord,expectedWord}`
- 签名不含 `db`（1943），返回三键（1945/1956）。符合。
- 判等 `norm(o.w)===norm(question.w)`（1956），字符串入参按选项匹配（1949–1953）。符合。
- 越界/`null`/`question` 非法 → `empty`（1946、1954），不抛错。符合。
- **非整数下标**：1948 `Math.floor(picked)`，`1.9` 会被当作选项 1 判分；契约要求「非整数 → `ok:false`」→ **D2**。

### 2.6 `challengeSummarize(dateKey, size, results, at)`
- 返回 `dateKey/size/kept/doneAt`（1966–1971），`kept` 仅内存、未落库。符合。
- `size` 取入参（1961），`kept` 只统计前 `n` 条且 `ok` 为真（1964），`kept=min(kept,n)`（1965）；漏答不计对。符合。
- 三支互斥由 UI 承担（app.js:394–396）。符合。

### 2.7 `commitChallenge(db, summary)`
- 1976 `isDayKeyStr`（1797–1806）+ 1977 `size>=1` 校验后写入；`dateKey` 非法或 `size<1` → `null`。符合。
- 只赋值 `db.challenge`（1983），无 `words/days/exam` 触碰。符合。
- `isDayKeyStr` 只校验 `YYYY-MM-DD` 形态（不校验月日范围），与契约「格式校验」一致。符合。

## 3. 全局不变量

| 不变量 | 核验 | 结论 |
|---|---|---|
| 挑战不写 SRS（不调 `rateWord`，不改 `lvl/due/st/wrong/wfix/evts`） | 挑战段 1768–1985 与 app.js 221–406 无 `rateWord`；`rateWord` 的实际调用仅 1344/1539（学习页），2477 为注释 | 符合 |
| 唯一写入口=`commitChallenge`，`finishChallenge` 只调一次 | app.js:390 单点；385–406 无第二次 commit；`quitChallenge`（377–383）只置空 flow | 符合 |
| `openChallenge/answerChallenge` 只写 `state.challengeFlow` | app.js:285、372–373 | 符合 |
| `core.js` 新增段无 DOM、无 `Math.random` | 已 grep 1768–1985，仅注释命中 | 符合 |
| `dueOfWord` 等价提取、`todayPlan` 委托 | core.js:277–286；296 `function dueOf(r){ return dueOfWord(db,r); }`；off 档短路、`from>0` 逐词接管、`strengthDue` 回落三条分支与原文一致 | 符合 |
| 不新增路由 / `location.hash` 不变 | 挑战段无 `nav(`/`location.hash`/`pushState` | 符合 |

## 4. 偏离清单（只登记，不修）

- **D1（良性，建议改契约）** 池选题为「日期种子洗牌取 5 再排序」，非契约写的「字典序取前 5」。契约 §2.2 需改写；**不改码**——否则每天固定考字母表最前 5 个词，AC03 虽过但产品退化。→ **按契约侧结案，见 §6**
- **D2（建议改码）** `challengeGrade` 接受非整数下标。改 core.js:1948 为 `typeof picked==='number' && isFinite(picked) && picked % 1 === 0` 才取下标；影响面为 API 层（UI 只传整数）。→ **已修，见 §6**
- **D3（可留档）** `challengeQuestion` 空义项回退 `senses[0]`（core.js:1917）。若按契约改为直接 `null`，需同时确认 `prompt` 为空的词已被 `challengeEntries` 排除（现有 1820 已排除首义项空，二者等价），故**建议契约补一句「回退首义项」**而非改码。→ **按契约侧结案，见 §6**
- **D4（需 G1 裁）** `cap>=4` 时仍可能只出 3 项：干扰项按「同义排除」后不足 3 个（core.js:1929–1932 未按可用量补偿）。CH-AC06 的「全库英文词 ≥4 恒 4 项」与「同义不得入选」在同义词密集的库里互斥。建议 AC 表述为「可用**非同义**干扰项足 3 个时恒 4 项」；**不建议**靠取消同义排除凑数（会出现两个正确项）。→ **已裁：改契约，见 §6**
- **D5（建议改码）** 关闭路径泄漏：遮罩点击走 `openModal` 的 `closeModal`（app.js:94–96 → 99–105），**不清 `state.challengeFlow`**。残留期间按 1–4 会重新拉起覆层（app.js:1750–1756），且没有 `quitToast`。建议在 `closeModal` 或遮罩回调里检测 `state.challengeFlow` 并转 `quitChallenge`。→ **已修，见 §6**
- **D6（建议改契约或归零）** `challengeState.doneAt` 未玩时返回跨日残留值（core.js:1884）。建议二选一：契约补「未玩返回 0」，或实现改为 `played ? recDoneAt : 0`。→ **已修（取归零分支），见 §6**
- **D7（测试缺口，非实现偏离）** 相对契约 §4：① 闭区间两点（`due===at`、`due===endOfDay`）未各打一次；② off 档「`due<=now` 与 `plan.reviews` 双向一致」只做了 on 档子集断言（`challenge.test.mjs:118–123`）；③ 跨书同词、同义排除两项无 fixture；④ 用例名写「四态」但 203–217 未构造 `not-enough`（需 `cap<2`，即 `db.books` 仅 1 词），断言只覆盖 ready/done/empty；⑤ 零写入快照未含 `db.goal`（契约列了）。→ **①④ 已补，②③⑤ 保留，见 §6**

## 5. 备注（非契约项）

- `challengeStart` / `challengeState` 各自调用 `challengePool`，单次开局共算 3 次池（含 `challengeEntries` 的 460 词遍历）。纯只读、无副作用，若首页卡出现在每次 `render()` 里，可考虑按 `at` 记忆化；不影响契约。
- 题号与出题数：`renderChallengeQuestion` 在 `challengeQuestion` 返回 `null` 时静默 `idx++`（app.js:295），`qLabel` 仍用 `keys.length`，会出现「第 1 / 5 题 → 第 2 / 5 题」跳号的可能（仅当词条被删或 `cap<2`，正常库不触发）。因池已在 1848 排除了 `entry` 缺失，实际不可达；**登记备查，不判偏离**。

## 6. 复测登记（2026-11-17 · 实现方修复后）

> 方式：只读复核代码与测试文件内容；未改源码、未复跑测试（门禁 264 项 / 0 失败以 G0 报告为准）。行号为复测时实际行号。

| 项 | 修复 / 裁决 | 复测位置 | 新状态 |
|---|---|---|---|
| D2 | 非整数下标一律判错 | core.js:1949–1950 `picked % 1 === 0` 才取下标；测试 `challenge.test.mjs:248` 覆盖 `1.9 / -1 / NaN / Infinity` 全 `ok:false` | **符合**（契约 §2.5 的「非整数 → `ok:false`」已成立） |
| D5 | 关闭统一收口 | app.js:99–105 `closeModal` 只清 DOM；退出收口 `quitChallenge`（清 flow → `closeModal` → 条件 toast → `focusChallengeCard`）；遮罩、`先合上`、结果页 `合上`、Esc（挑战监听，早于 `if (!f) return`，条件 `challengeFlow || $('.ch-modal')`）四路全走该收口 | **符合**（四路出口同一收口：写入/提示/flow 清理/回焦一次完成；残留 flow 已不可能）。完成态回焦由 `focusChallengeCard` 回落 `.challenge-card` + 非 button 态 `tabindex="-1"` 闭合（见 §6） |
| D6 | 未玩不回放旧时间 | core.js:1885 `doneAt: (played && …) ? c.doneAt : 0`；测试 `:284` 断言昨日记录存在时 `doneAt=0`、`mode=ready` | **符合**（契约 §2.1 已于 v1.2 补齐「未玩恒为 0」，实现与正文同构） |
| D7 | 补测 4 条 | `:248` 非整数下标、`:258` 闭区间（`23:59:59.999` 入池 / `+1ms` 出池）、`:274` `not-enough` 态、`:284` D6 门面；文件 15 项 | **①④ 已闭合**。注：`due===at` 在「日终」口径下不构成独立边界（恒在 `endOfDay` 内），故以 `endOfDay / +1ms` 两面覆盖即视为闭合；**② off 档与 `plan.reviews` 双向一致、③ 跨书同词与同义排除 fixture、⑤ 零写入快照含 `db.goal` 仍缺**，属遗留缺口、不阻断 |
| D4 | 改契约（不改码） | AC06 改为「**非同义**干扰项足 3 个时恒 4 项」；实现保持同义排除优先（core.js:1924–1934） | **已裁并落地**：契约 §2.4 已改为「排除同义干扰项后可用词 ≥3 → 恒 4 项」（v1.2），代码不变 |
| D1 / D3 | 按契约侧结案 | D1：契约 §2.2 改为「日期种子洗牌取 N 再排序」；D3：契约 §2.4 改为「空义项由池准入条件保证、`null` 仅兜底」 | **已裁并落地**：两处均见契约 v1.2 §2.2 / §2.4；代码不变 |

**复测后总判**：数据面（键集恰三项、`ensureSchema` 无第四字段、SCHEMA 恒 3）、7 个函数签名与返回键集、全局不变量（零 SRS 写入 / `dateKey` 单点固化 / 无 `Math.random` / core 无 DOM / 无新增路由）仍全部**符合**；本轮无新增偏离，无 P1。

**非阻断观察（两轮后按现盘定稿，均不判偏离）**：
① *死分支*：**不成立**。Esc 监听在 `if (!f) return` 之前，条件已收窄为 `state.challengeFlow || $('#modalRoot .ch-modal')`，结果页可达；init 的同名监听（约 3002）因挑战监听先清 modal 而恒短路，不会双 toast、不会双 commit。G1 已自行撤回该观察。
② *完成态焦点*：**已闭合（AC17 按现状闭合，不改判据）**。`focusChallengeCard` 改为优先 `.challenge-card`、再回落 `[data-act="challenge-open"]`；非 button 态（done/empty/not-enough）带 `tabindex="-1"`，可程序聚焦且不进 Tab 序列。判据若写成「回入口按钮」，done 态永远无解；写成「回挑战卡」，五态一个判据通吃。
③ *结果页焦点*：**已闭合**。`finishChallenge` 打开结果页时把焦点放到「合上」（`resClose.focus()`），关闭时回焦卡片——开/关方向成对，`aria-modal` 下 Tab 可达按钮。
④ *账目（已定口径）*：G1 曾报「`dotsAria` 入 `phrases.js`、24 键」；现盘核实为 `CHALLENGE` **23 键、无 `dotsAria`**，`challengeDots` 整块 `aria-hidden`。经 G0/G1 确认该键**已删除**（点阵改 `aria-hidden` 后无调用点），终态 **23 条可见文案、0 条 aria 专用键**——以 23 为准。不属契约域，仅备查。
