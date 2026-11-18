# 长期保持率观测（#027 · 纯分析层 · 只读）— 数据与函数契约（v1.1）

> 2026-11-17 · G2 · 基线：D-054 生效版 + G0 终裁口径 C（相邻事件对 / ≥30 天下界 / 词级一票）+ G1 PRD **v1.2** + G5 规格 v1.0 + A 仓库实测（`node --test tests/*.mjs` 283 项 0 失败、`check-data.mjs` 460 词 5 本 0 重复、`qa_independent_verify.mjs` 34/0、`Core.SCHEMA===3`）。**本契约探针复算**：连对 6 次（间隔 2/4/7/15/30）→ **retained**（推进生效、非恒空）；G0 五词 fixture → **可判定 3 / 保留 1 / 未保留 2 / pending 2 / 33%**；多合格对取最近一次 → **lost**（与 G1 AC06 v1.2 一致）。行号一律用**函数名锚点**（core.js `rateWord` / `ensureSchema` / `validStrengthEvent` / `optNum` / `LADDER_DAYS` / `DAY_MS`）。**本卡为纯分析层**：`word365/` 源码零改动，本文件是 G2 唯一交付物。

## 1. 纯函数签名与返回键集（写死）

`Core.retentionStats(db, opts) -> Object`（**只读纯函数**；追加到 `core.js` 导出面，既有函数零改动）
- **入参**：`db`（词库，只读）；`opts = { days }`——窗口天数（毫秒下界），默认 **30**。**无 `at` 参数**：本口径只比相邻事件间隔、不需要"当前时间"，故**不读 `now()`/`Date.now()`**（时间基准不进入计算 → 同 db 两次调用必深度相等）。
- **返回键集恰为 8 个**（多一个少一个即失败）：`{ window, samples, retained, lost, pending, rate, ratePct, state }`。
- `window`：实际生效的窗口天数（`opts.days` 归一后的值，默认 30）。
- `samples`：**已到期观察的词数**（有 ≥1 个合格观察的词，一词一票）。**单位＝词**（不是"次"）。
- `retained`：其中"仍答对"的词数。`lost`：其中"未答对"的词数。`samples === retained + lost`。
- `pending`：**有 know 事件但尚无任何合格观察**的词数（未到观察期）。**单位＝词，与 `samples` 同单位**（G5 要求并排展示，不换算）；全部计数（`samples`/`retained`/`lost`/`pending`）**一律＝词**（一词一票，非"次"；G1 PRD §3 文案已定「{M} 个词／{C} 个词」）。**观察总体＝至少有 1 个 `know` 事件的词**；**从未 know 过的词既不入 `samples` 也不入 `pending`**。
- `rate`：`samples > 0 ? retained / samples : null`——**必须是 `null`，不是 0、不是 NaN**（0% 会被读成"全忘"）。**未取整原始值**（0–1），UI 用它判 `<1%`。
- `ratePct`：`rate === null ? null : Math.round(rate * 100)`（整数百分比；**仅供直接显示**）。**⚠ `ratePct` 陷阱（PRD AC09）**：`rate = 0.004` 时 `ratePct` 同为 0 → **`<1%` 与 `0%` 的区分必须读未取整 `rate`**（`rate > 0 且 ratePct === 0 → "<1%"`；`rate === 0 → "0%"`），**不得单独用 `ratePct` 判定**。
- `state` 三态（阈值写死 **10**，沿用 `core.js` `examPool` 的 `minPool=10` 量级直觉）：`'empty'`（`samples === 0`）｜`'insufficient'`（`0 < samples < 10`）｜`'ok'`（`samples >= 10`）。**UI 只认 `state`，不得硬编码第二份门槛**。

## 2. 事件遍历与判定规则（写死歧义点 · 含锚点推进）

0. **为什么必须锚点推进（阶梯实测事实）**：`core.js` `LADDER_DAYS=[1,2,4,7,15,30,60]`，`rateWord` 里 know 后 `lvl` 自 0 递增、`interval=LADDER_DAYS[lvl]` → 连续答对的**实际间隔序列 = 2/4/7/15/30/60 天**，首个 ≥30 天的间隔出现在**第 6 次连续答对**（know@d0→d2→d6→d13→d28→**d58**，d28→d58 恰 30 天）。若死钉"首个 know 事件"且窗口内那次即终止，一个连对 6 次的词会因紧邻 d2（gap 2）被判 pending、**永远进不了分母 → 指标在真实数据上恒空**。故必须让位。
1. **取事件**：`db.words[key].evts`（`w::` 主键，**词内判定，绝不跨词配对**）；非数组 → 当空数组（该词不在观察总体）。
2. **排序**：按 `t` **升序稳定**排序（`slice()` 拷贝后 `sort((a,b)=>a.t-b.t)`；ES2019 起 `sort` 稳定 → **同一 `t` 保持原写入相对次序**）。**不得原地改 `db`**（不可 `db.words[k].evts.sort()`）。
3. **脏 `t`**：`t` 非有限数或事件非对象 → **该事件跳过**（不参与判定）；相邻关系在**跳过后的序列**上计算（后果：脏事件两侧成为相邻，可能形成一个跨过它的间隔——"跳过"的直接后果，写死以免实现时暗改）；脏事件既不作起点也不作终点。
4. **锚点推进（逐词扫描，收集全部合格对）**：锚点初始 = 序列中**首个 `rating==='know'`** 的事件；每次检查锚点与其**紧邻下一事件** `e_{i+1}`：**无 `e_{i+1}`** → 结束该词扫描（此前已收集到合格对则用之，否则该词 pending）；**`e_{i+1}.t - anchor.t >= days * DAY_MS`** → 记一个**合格对**（终点 know → retained，否则 fuzzy/unknown/脏 rating → lost），**不终止扫描**；**`gap < days`**（窗口内再答）→ 本次机会**作废**（既不判保留也不判未保留）。两种情形之后**锚点一律推进**到"起点下标 ≥ 当前锚点下标+1 的第一个 know 事件"（若 `e_{i+1}` 本身是 know 即取它，否则跳到再下一个 know 事件）→ 逐个 know 事件各作一次起点，**每个 know 事件恰被检查一次**。
5. **每词一票（口径见 §9.1，已落盘取"最近一次"）**：一个词有多个合格对 → 取**最近一次**（起点 `t` 最大）那一个，该对判一次、不改票；其余合格对**不计入分母也不另计**（防同词 kept/lost 翻转致比率漂移）。若 G0 改判"首个"，仅此处一行之差（取起点 `t` 最小者），其余全部不变。
6. **间隔与端点**：gap 用**毫秒差** `e_{i+1}.t - e_i.t`，**下界含端点**（29 天不构成 / 30 天构成），**不做日历天对齐**（跨天自然计入）；**禁止使用 `evts.interval`**（那是"距下次**排定**的间隔"，不是"距上次作答的间隔"，混用必错）。
7. **pending**：该词**没有任何**合格对（锚点推进到末尾仍未遇到）→ 计入 `pending`、**不入分母**；pending 是"未知"不是"错误"，文案禁写"未答对/忘了/失败"。

## 3. 边界清单（逐条给行为，**一律不抛错**）

| 情形 | 行为 |
|---|---|
| 词无 `evts` / `evts` 非数组 | 不在观察总体（不计 `samples` 不计 `pending`） |
| 词只有一条 know 事件 / 词有 know 但后续都在窗口内（锚点推进后仍无合格对） | 均 `pending` |
| 毕业词 `graduated` | **不因毕业排除**：口径只读 `evts`（`graduated` 是排程状态，非观测事实）。多数毕业词 `evts` 为空 → 自然不在总体；确有 evts 且构成合格对 → 照常计入 |
| 脏 `t`（非有限数） | 该事件跳过（§2.3） |
| 脏 rating（未知取值） | 作起点 → 不作起点；作终点 → 该对记 `lost` |
| `db` 为空 / `db.words` 缺失或非对象 | 全零：`window` 仍返回归一后的天数；`samples/retained/lost/pending` 全 0；`rate`/`ratePct` = `null`；`state='empty'` |
| `opts` 缺失 / `opts.days` 非法（`≤0`、非数字、NaN、Infinity） | **归一到默认 30**，不抛错；合法值取 `Math.floor`；**不设上限**（过大只是样本变少，不得报错） |
| `evts` 里存在相同 `t` 的多条 | 按原写入序稳定排列（§2.2），判定结果与数组原序一致 |

## 4. 零写入证明路径（写死）

- 函数**只读** `db.words[key].evts`（`key` 集合、`evts` 数组内容与顺序）；**不写 `db`、不写 `db.words`/`db.days`/`db.settings`、不新增任何 db 键**；**`Core.SCHEMA` 恒 3**，`ensureSchema` **不得**新增分支或字段。
- **禁调任何写函数**：`rateWord` / `undoRate` / `ensureRecord` / `ensureSchema` / `updateLastSeen` / `persist` / `saveDB` / `commitExam` / `commitChallenge` / `applyGraduation` / `markReviewed`；**禁读 `db.exam`**（抽测写面与语义零触碰）。撤销一致性天然成立（`rateWord` 的 `snap.rec` 克隆早于 evts push，回滚一并回滚该次事件）→ **无需额外设计**。
- **证明方式**：测试中调用前后 `JSON.stringify(db)` **逐字节全等**（含 `db.words[*].evts` 的内容与顺序）；**13 位时间戳无需归零**（本函数不写入任何时间戳）。另断言 `Object.keys(db)` 顶层键集不变、`db.schema === 3`。**确定性**：同 `db` 连续两次调用返回**深度相等**（不读 `now()`、无随机）。

## 5. 复用边界（写死）

- **复用**：`core.js` `DAY_MS`（窗口换算 `window * DAY_MS`）、`optNum`（数值兜底，配合显式正值判定做 `days` 归一）；`LADDER_DAYS` 仅作口径背景，**不参与判定**。
- **不复用**：`norm` / `dayKey`（本口径按毫秒差、不做日历天对齐，引入 `dayKey` 会带进时区与 4am 偏移风险）；`validStrengthEvent`（它要求 `interval` 合法，而本指标**禁止使用 `interval`** → 耦合会误剔合法事件）；`strengthOf` / `strengthDue`（仪表盘"估计保持率"的来源，**禁混用**，D-054④）。**禁新增依赖**：不引入第三方/新模块；函数体放 `core.js` 内部，**仅追加**到 `Core` 导出面，既有函数零改动。

## 6. 展示位与写入域（交接口径）

- **展示位落定：统计页**（`app.js` `renderStats` 内「近 14 天有效完成率」卡之后、仪表盘入口卡之前，新增**独立全宽 `.card`**，不进四卡 `.stat-cards` 栅格）。`遗忘曲线仪表盘.html` 虽可 `Core.loadDB()` 取数（数据通路成立），但**本卡不改该文件**（不在写入域内，且会把"曲线估计值"与"实测值"混读，违 D-054④）；**写入域差异**：统计页＝`js/app.js` + `js/phrases.js` + `css/app.css`，仪表盘＝独立 `file://` HTML（写入域不在 `app.js`，本卡不涉及）。
- **给 G5 的四项契约输出**：① `state` 三态（阈值 10，`Core.RETENTION_MIN_SAMPLES` 单一来源）；② 未取整 `rate`（+ `ratePct` 整数，`<1%` 判定读 `rate`）；③ `samples` 与 `pending` **同单位＝词**（G5 规格原写"次"已作废）；④ `window`＝天数（默认 30）。禁词/禁项以 G1 PRD §3 为准。
- **UI 侧硬约束**：比率卡必须**同时显示 M（已到期的样本词数）与 C（未到观察期的词数）**——比率是 cohort 混合值（陈旧样本不退出、新词陆续进入、pending 随时间下降），单看百分比无法解读，**两个时点的比率不可直接相减**。比例格式化：`rate>0 且 round(rate*100)===0 → "<1%"`、`rate===0 → "0%"`；任何路径不得出现 NaN/Infinity/undefined。

## 7. 红线核对清单（7 项，G10 复核用）

1. **零写库**：调用前后 `JSON.stringify(db)` **逐字节全等**；`Object.keys(db)` 顶层键集不变；`db.schema === 3`；`ensureSchema` 无新增分支/字段；`db.words`/`db.days`/`db.settings` 零新增键。
2. **零新路由 / 零新交互 + 命名与文案隔离**：新增块为统计页内独立 `.card`，`location.hash` 取值集合不变；既有四卡、热力图、14 天柱图 DOM 逐字符不变；`.stat-cards` 行高不被撑高；新增文案与代码**零处出现"保持"二字**，禁"保持率/留存率/记忆率/正确率/估计/预测/预估"，不与仪表盘"估计的保持率"同名、不同卡并列相减，**禁把样本外推到用户整体**（禁"你的记忆力/记得牢不牢"）。
3. **不动 SRS、不消费 type**：`rateWord`/`undoRate`/`LADDER_DAYS`/`lvl`/`due`/`st`/`wrong`/`wfix` 零改动；`evts` 写入结构仍 `{t,rating,interval,type:null}`、`type` 恒 `null`；**本卡零处消费 `evts.type`**（无 per-mode 归因维度预留）。
4. **纯读语义 + 不做第二真源**：`retentionStats` 不调 `now()`、不写库、不改入参；同 db 两次调用深度相等；抽测/挑战不写 `evts` 的语义不变 → 本指标不含抽测/挑战样本；判定只依据 `rec.evts` 相邻对 + 锚点推进，不读 `rec.lvl/st/due/graduated` 作判定依据（毕业词不排除的口径见 §3），`rec.interval` 未被使用（间隔只由相邻两事件 `t` 相减得到）。
5. **既有门禁零回归**：既有 22 个测试文件逐字不动、全量 0 失败（实现落盘后复跑基线 **24 文件 / 298 项 / 0 失败**，含新增 `tests/retention.test.mjs` + `tests/ui.test.retention.mjs`）；新增测试为**独立文件**（不修改既有文件）；`node --check` 通过。

## 8. 测试要求

**两个独立文件（单一文件不并存；按 D-055⑥ + 磁盘落盘命名）**：

**A. `tests/retention.test.mjs`**（纯函数层，node:test + `createRequire` 直取 `core.js`，仿 `tests/core.test.strength.mjs`；已落盘 8 条）最低覆盖：
1. **60 天手工时间线**（构造含 pending 词）：逐词断言 `samples/retained/lost/pending/rate/ratePct/state` 精确值，并断言 `samples === retained + lost`、`rate === retained/samples`、`pending` 不进分母。
2. **G1 五词 fixture**（a know@d0→know@d35 / b know@d0→unknown@d35 / c know@d0→know@d10 / d 仅 know@d0 / e know@d0→fuzzy@d40→know@d70）：断言**可判定 3（保留 a，未保留 b+e）、pending 2（c+d）、ratio 1/3**（RET-AC01）。
3. **锚点推进（防"指标恒空"）**：连续全对 6 次（间隔 2/4/7/15/30 → know@d0→d2→d6→d13→d28→d58）→ 必须**进分母且判 retained**，不得判 pending；另造"失守后回落短间隔"的词 → pending。
4. **边界全量**：无 `evts` / 单事件 / 窗口内再答 / 毕业词 / 脏 `t`（NaN/Infinity/字符串）/ 脏 rating（未知取值作终点 → lost，作起点 → 不算起点）/ 空库与 `db.words` 缺失 / `opts.days` 非法（0、负数、NaN、非数）→ 归 30 且**不抛错**。
5. **边界点**：gap = 29 天不构成、gap = 30 天构成（下界含端点）。
6. **一词一票**：同词两次合格观察 → 只记 1 票、结果取该词**最近一次**那对。
7. **状态位**：`samples` = 9 → `'insufficient'`；= 10 → `'ok'`；= 0 → `'empty'`；`rate`/`ratePct` 在 `samples===0` 时为 `null`（断言 `!== 0`、非 NaN）。
8. **零写库 + 确定性**：调用前后 `JSON.stringify(db)` 逐字节全等 + `Object.keys(db)` 不变 + `db.schema === 3`；同 `db` 连续两次调用 → 返回深度相等（含 `rate` 未取整值）。

**B. `tests/ui.test.retention.mjs`**（UI 层，DOM 桩 + `node:vm`，仿 `ui.test.ctx-mode.mjs`；已落盘 7 条）最低覆盖：三态渲染（`ok` 行内 `.ret-num` 比例 / `insufficient` 与 `empty` **比例位整块消失**、卡内零 `%`）｜`<1%` vs `0%` 区分读未取整 `rate`（rate=0.001→`<1%`；rate=0→`0%`；零 NaN/Infinity/undefined）｜副标三段条件拼接（窗口段始终 / 样本段 M>0 / 缺口段 C>0、M=0 且 C=0 时不得出现「样本 0 个词」）｜单位「词」｜位置（近 14 天有效完成率卡之后、仪表盘入口卡之前）｜禁词零命中（保持/留存/记忆率/正确率/估计/预测/预估）｜零写库（渲染前后 db JSON 逐字节全等）。

## 9. 口径冲突登记（**三条已全部闭合 · D-055 生效 2026-11-17 11:47**）

1. **每词多票取"首个"还是"最近一次" → 已闭合「取最近一次」**：G0 终裁（D-055⑤）+ G1 PRD v1.2/v1.3（AC06 已改为断言「取最近一次」）+ 契约 §2.5 + 已落盘实现（`core.js` `retentionStats` 遍历全部相邻对、**后命中覆盖前命中**＝起点 t 最大者）四者一致；G1 已确认"起点 t 最大 ≡ 最近一次"（同一词内合格对的起点序与终点序同序）。**无需 G1 再改 AC06**。
2. **状态门槛 → 已闭合 10**：D-055④（G0 早前建议的 5 **作废**——小样本百分比误导性大，与抽测池 `minPool=10` 同量级）+ G1 PRD §5/AC08（`9→insufficient / 10→ok`）+ 契约 §1 + 已落盘实现（`core.js` `RETENTION_MIN_SAMPLES = 10`，经 `Core.RETENTION_MIN_SAMPLES` **单一来源**暴露，视图不得硬编码第二份）四者一致。
3. **测试文件名 → 已闭合两文件、不并存**：D-055⑥ 与 G1 PRD AC16 = `tests/retention.test.mjs`（纯函数层）+ `tests/ui.test.retention.mjs`（UI 层）；**已按此落盘**（8 条 + 7 条）。**⚠ 唯一残留不一致**：G1 PRD **v1.3** AC16 写作 `tests/core.test.retention.mjs`，与 D-055⑥ 及磁盘落盘的 `tests/retention.test.mjs` 不符 → **以 D-055⑥ + 磁盘为准，请 G1 改回**（改 PRD 一处措辞，无代码影响）。
4. **实现已落盘、逐条对齐**：实测 `core.js` `retentionStats` 与 §1 键集（8 键）、§2.2 稳定排序、§2.3 脏 t 跳过、§2.5 取最近一次、§2.6 毫秒差下界含端点且不用 `evts.interval`、§4 零写库（不读 `now()`/不读 `db.exam`/不调写函数）、§1 `state` 三态 全部一致；`PHRASES.RETENTION` **8 键**（D-055① 终态）与单位「词」一致；禁词表在新增文案与卡片 DOM 内零命中；**全量 24 文件 / 297 项 / 0 失败**。
5. **本轮新增钉死两点（依 G1 PRD v1.3 ② 与 D-055①）**：① **`ratePct` 陷阱**（已写入 §1 `ratePct` 条）：`rate=0.004` 时 `ratePct` 同为 0，**`<1%` 与 `0%` 的区分必须读未取整 `rate`**，不得单独用 `ratePct` 判定；② **比例只出现一次**（D-055①）：比例**行内**在主句 `lead(M,P)` 中（`.ret-num`），**撤独立比例块与 `ratioLabel` 键**；`rate`/`ratePct` 仍照本契约返回，**副标三段条件拼接**（`subWindow` 始终 / `subSample` 仅 M>0 / `subPending` 仅 C>0）→ 四个计数单位「词」在文案中必须一致。

> 行号均为函数名锚点，以冻结时磁盘为准。