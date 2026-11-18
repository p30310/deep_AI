# 练法归因（#028 · 设计阶段）· PRD（v1.1）

> 归属：G1 · 基线时点 2026-11-18 · 基线门禁 `node verify.mjs` = PASS（**298 项 0 失败**＝#026 冻结的 283 项基线 ＋ #027 新增 15 项，D-053/D-056）。
> **本卡只设计、不落源码**：交付物仅本 PRD 与卡片，`word365/` 零文件改动（`git diff --stat word365/` 须为空）。实现须用户明确批准改 D-038③，本卡停在实现门口。
> 上游钉死：D-057（立项 + 红线）、D-038③（`evts.type` 恒 null）、D-054⑥/D-055（#027 先例）、`cards/#028.md`。
> **v1.1 变更（相对 v1.0；G0 补充事实的文档追平，口径不变）**：① 头部补 `app.js:1178` 注释与 `:1180-1181` tabDefs 两条一手证据；② §2 推导序写死为派生表达式 `attributionMode(s)`；③ §2 明确「例句语境（#026）作为独立可归因维度：要」并强化被否方案；④ §6 标注 core 归一收口属 G2 契约边界、PRD 不越界。
> **读过的命令/事实（只读核验）**：`Grep 'Core\.rateWord' js/` → 生产代码恰 **2 处** `app.js:1415 doRate`、`app.js:1645 doRateTyped`（旧文档「4 个入口」作废）；`core.js:181 rateWord(db,key,rating)`、`:192` snap 克隆早于 `:239 push {t,rating,interval,type:null}`、`:249-259 undoRate` 整记录还原；`app.js:975 MODE_LABELS`＝`flash/type/choice/match` 四值；`app.js:1130 mode=params.mode||'flash'`、`:1148 listen:params.listen?1:0`、`:1152 ctx:(params.ctx&&!params.listen)?1:0`（listen/ctx 是 type 的**子模式标志位**，非 mode 值，listen 优先）；**`app.js:1178` 原注释「#023 听写＝type 的子模式（mode 仍为 'type'）」、`:1180-1181` tabDefs `{m:'type',listen:1}` 与 `{m:'type',ctx:1}` —— 六练法在会话里只有四种 mode 值，裸传 `s.mode` 会把 listen/ctx 一并塌缩进 type**；`app.js:1102/1184-1189` 模式切换互斥；`tests/ui.test.ctx-mode.mjs:279` 断言 `evts[0].type===null`（必须零改动）；先例文风 `prd-retention.md` v1.4（130 行）。

## 1. 背景与时序论证

**问题**：`evts.type` 恒 null（D-038③）、全仓 0 读取方 ⇒「哪种练法让词留得住」在数据上不可回答。统计页有过程量、#027 有结果量，但没有把二者按练法拆开的维度。

**为什么是现在，而不是等 #027 出数之后**——这是一个**不可逆的时间窗**：
- #027「长期答对情况」的合格观察需「某词间隔 ≥30 天再考一次且那次也记下」（prd-retention §2），evts 自 #015（2026-11-16）才采集，首批结果最早 2026-12-16 前后；从零到样本以「月」计。
- 若此刻不把「练法」写进 evts，两个月后拿到的仍只是**一个混在一起的聚合值**，无法回答任何按练法拆分的问题；而 evts 一旦落库**不可回溯重写**（撤销只回退本次，不重写历史）。
- 反过来，此刻接线成本最低：两处 `rateWord` 调用均可直读会话标志（`s.mode/s.listen/s.ctx`），无新采集、无新键、无 schema 变动。
- **时序结论：先把字段装上，再等数据长出来。** 设计必须先于数据；实现停在门口等用户批准，但口径不能等。

**价值陈述（一句可执行）**：*给每次作答记下用的是哪种练法，两个月后你就能回答一个具体问题——花在例句填空上的时间和花在单词快过上的时间，哪一个让词隔了一个月还记得；据此把有限的自习时间投到真正有效的练法，而不是只看一个混在一起的总数。*（不是为分析而分析；落点是"时间投向"的决策。）

**Non-goals**：N1 不做 per-mode 输出/可视化/排名（§4）；N2 不改 #027 统计口径；N3 不改 SRS/固定阶梯/undo 链/SCHEMA/任何 db 键；N4 本卡零 UI 变更（G5 只确认统计页与 #027 卡不受影响）。

## 2. 维度与命名（裁决 + 理由 + 被否方案）

**推荐：写进既有 `evts.type` 槽位，取值＝用户可感知的 6 类练法 `flash / type / choice / match / listen / ctx`，缺省 `null`。**

| 裁决点 | 结论 | 理由 | 被否方案 |
|---|---|---|---|
| 放哪里 | 复用 `evts.type`（已存在，`{t,rating,interval,type:null}`） | #015 起该槽位就为练法预留、全仓 0 读取方；复用即零新键、零 schema、零写入成本，且随 evts 进 undo 链天然回滚（`core.js:192` 克隆早于 `:239`） | ① 新增 `evts.practice`/db 顶层键——破坏零新键、要动 `ensureSchema`，倒退；② 复用 `days[dk].byType`——当日计数分桶（D-005），粒度仅 `{flash,type,choice}`、缺 listen/ctx，与"每词逐次归因"不同维度；③ 只在会话内统计——跨不了会话/天，长窗口分析无从谈起 |
| 枚举粒度 | 6 类（DOMAIN §5 的 6 种练法） | **信息无损**：6 类可无损聚合到「认/产出」二类（flash/choice/match=认；type/listen/ctx=产出），反之不可；#023 听写、#026 ctx 刚做完，业务明确要能单独评估这两类新题型；存储成本与写 2 类完全相同（一个短字符串） | 「认/产出」二类：等于提前丢弃区分，写下即永久不可分，否 |
| ctx/listen 是否单列 | **例句语境（#026）作为独立可归因维度：要** —— 单列为 `ctx`（听写单列 `listen`），不并入 `type` | 会话已有 `s.ctx`/`s.listen` 标志（`app.js:1148/1152`）可纯读推导、零新采集、无需改 URL/会话字段/用户感知；若记为 `type`，则 #026 的例句练习与裸写出永久混在一起（落库不可回溯重写），未来**无法单独评估「语境练习是否比普通默写更有效」**——而这正是 #028 要攒的数据，等于让 D-052 花大力气做的 ctx 在归因层白做 | 记为 `type`——省一个枚举值但放弃 #026/#023 两卡刚建立的能力粒度、永久丧失 ctx/listen 可比性，否 |
| 取值推导序 | 派生表达式（G0/G2 共识，写死）：`attributionMode(s) = !s ? null : s.listen===1 ? 'listen' : s.ctx===1 ? 'ctx' : s.mode`，两处评级调用传它 | `listen` 优先于 `ctx` 是已钉死语义（D-052⑤、`app.js:1152` `(params.ctx&&!params.listen)` 由 buildSession 保证互斥、`:1187`）；六种练法会话里只有四种 mode 值（`:1178` 注释、`:1180-1181` tabDefs），必须靠标志位派生，不能裸读 | 裸读 `s.mode`——listen/ctx 全部塌缩进 `type`，恰好丢掉最想区分的两种产出练法，#028 立项目标落空，否 |

> 命名纪律：6 值一律**小写字面量**，与 `MODE_LABELS` 的英文 mode 键同源，便于未来按值分组；用户可见中文名由 `phrases.js` 既有练法名承担，本卡**不新增任何文案键、不落 UI 字面量**。
> 边界：合法值恰 6 个；第四参非法/缺失一律归 `null`（§3）。`match` 走 `doRate`（flash 分支外的 `render()` 共用），`choice` 走 `doRateTyped`——两处调用都能拿到 `state.session`，推导不依赖具体入口。

## 3. 默认语义（null 而非 'unknown'）

**裁决：缺省写 `null`，产品释义写死为「未采集」——即该次作答发生在归因字段启用之前（历史数据）或来自三参旧调用——不是"未知练法"、不是错误。**

- **硬约束**：`tests/ui.test.ctx-mode.mjs:279` 断言 `evts[0].type === null`，283 项基线零改动（D-057）。改 `'unknown'` 直接破断言、触红线。
- **分析语义**：`'unknown'` 会被未来统计读成"一种叫 unknown 的练法"而污染练法分母；`null` 天然表示"该维度无值"，分析侧按练法分组时必须剔除 null（但**不得**把它从 #027 的整体答对统计中剔除——那是另一个指标，仍按 `rating` 计算）。
- **迁移语义**：批准前所有三参调用继续写 null；批准后接线处才写真实值。null 因此自带"启用前沿"的时间戳意义，**无需任何历史迁移或回填**（历史不可回溯，见 §6）。

## 4. 与 #027 的边界（为何现在不做排名）

- **不做什么**：本卡不做 per-mode 输出/统计函数/可视化/排名，`retentionStats` 口径、统计页卡面、`location.hash`、`PHRASES` 一律零改动。
- **为什么现在不做排名**：① **数据尚未产生**——字段从批准那刻才记录，此刻做排名拿不到任何样本；② **两时点比率不可相减**——#027 每词取最近一次合格观察、比率随样本轮换漂移（prd-retention §2.2 已钉死），per-mode 分母更小、抖动更大，做组间排名必然误导；③ 与既有红线一致——统计文案禁评价/排名/达标（D-054⑤、#025 文案红线）。
- **留给未来的扩展边界（G2 契约须知，本卡不实现）**：未来任何 per-mode 指标都复用 #027 的"每词一票取最近一次观察 + ≥30 天窗口 + 样本门槛 min=10"口径，只**多一层按 `evts.type` 分组**（如 `retentionStats(db,{mode})` 可选过滤，或独立只读函数）；每组分母/样本量独立计算、样本不足各自走空态，**绝不做组间排名**。本卡的唯一义务是保证 `evts.type` 落值正确、可被未来的只读统计按值分组读取——写入与读取解耦，本卡只管写入侧。

## 5. AC 验收判据（14 条，编号 MODE-AC01~14）

> 说明：AC01~02 与 AC11~14 为**本设计阶段即得**的判据；AC03~10 为**用户批准改 D-038③ 并实现后**的验收判据——本卡只写判据、不执行实现。

| 编号 | 判据（给定 → 断言） | 验证方式 |
|---|---|---|
| MODE-AC01 | 给定本卡交付物 → 断言仅有 PRD + 卡片，`git diff --stat word365/` 为空、`git status --short word365/` 无任何条目；`node verify.mjs` = PASS | git diff + verify.mjs |
| MODE-AC02 | 给定生产代码 → 断言 `Core.rateWord` 调用恰 2 处（`app.js:1415/1645`），两处所在函数均可读 `state.session` 的 `mode/listen/ctx`；`MODE_LABELS` 仍 4 值 | grep -n 计数 + 源码比对 |
| MODE-AC03 | 给定三参 `rateWord(db,key,rating)` → 断言新增 `evts` 元素 `type===null`，且 lvl/due/st/reps/correct/wrong/wfix/interval/day 计数逐字段与改动前一致（时间戳归零后 JSON 逐字节相等） | node:test 三参前后快照 |
| MODE-AC04 | 给定 `tests/ui.test.ctx-mode.mjs:279` → 断言 `evts[0].type===null` 断言**逐字不动**；全量 **298 项 0 失败**（283 基线 + 15 新增），既有测试文件零改动 | G8 全量复跑 + grep |
| MODE-AC05 | 给定四参 `rateWord(db,key,rating,'choice')` → 断言 `evts.type==='choice'`；除 type 外其余字段与同参三参调用逐字段相等（时间戳归零后） | node:test 四参 vs 三参 |
| MODE-AC06 | 给定第四参依次取 flash/type/choice/match/listen/ctx → 断言 `evts.type` 精确等于该值；给定非法值/undefined → 断言为 `null` | node:test 参数化六值 |
| MODE-AC07 | 给定三会话：`mode=type&ctx=1`（s.ctx=1,s.listen=0）／`mode=type&listen=1`（s.listen=1）／裸 `mode=type` → 断言落值依次为 `'ctx'`／`'listen'`／`'type'`；**ctx 不得写成 type** | ui test 三会话落盘断言 |
| MODE-AC08 | 给定 `s.listen=1 且 s.ctx=1` → 断言落值 `'listen'`（listen 优先），不得出现 `'ctx'`；与 `app.js:1152/1187` 行为一致 | ui test 优先级断言 |
| MODE-AC09 | 给定三参调用或第四参非六值枚举 → 断言 `evts.type===null`（非 `'unknown'`/`''`/`undefined`）；PRD 已写明 null＝「未采集」释义 | node:test + 文档 grep |
| MODE-AC10 | 给定四参（type='ctx'）作答后 `undoRate` → 断言该条 evts（含 type）整体移除、evts 恢复作答前逐字节；`core.js:192` 克隆早于 `:239` push 不变 | node:test undo 断言 |
| MODE-AC11 | 给定四参调用前后 → 断言 `JSON.stringify(db)` 除新增 evts 元素的 type 值外逐字节相等；`Object.keys(db)` 顶层键集不变、`db.schema===3`、`ensureSchema` 无新分支；localStorage 写入桩计数 = 0（本卡零写库） | node:test 快照 + 写入桩 |
| MODE-AC12 | 给定本卡交付 → 断言 G5 确认零 UI 变更，统计页与 #027「长期答对情况」卡 DOM 逐字符不变；全仓无 mode 对比/排名/得分文案命中 | grep + DOM 快照 |
| MODE-AC13 | 给定含混合 type 值的 db → 断言只读统计可按 `evts.type` 分组读取；**本卡不新增任何 per-mode 统计/输出函数**（grep 证明无新增）；未来分组复用 #027 口径、不做组间排名已写入 §4 | grep + 契约对读 |
| MODE-AC14 | 给定本 PRD §6 → 断言已写明「新字段自批准启用那刻起记录、历史不可回溯、历史/三参 evts.type 恒 null、null 不入练法分母」 | 文档 grep |

## 6. 已知限制（冷启动，本卡无 UI，写此披露）

- **零历史可回溯**：字段自用户批准并落码那刻起才记录；此前所有 evts 的 type 恒为 null，无法回填、无法重写（撤销只回退本次作答）。因此上线初期分组样本必然为空——这是常态，不是缺陷。
- **null 的双重来源**：既可能是「启用前的历史」，也可能是「三参旧调用」；二者在 evts 中不可区分。分析侧遇 null 一律按"未采集"剔除出练法分母，且**不得**据此推断练法效果。
- **无 per-mode 产出**：本卡不提供任何按练法拆分的数字/排名；用户暂时不会看到这项数据的任何可视化。要看到结论，须等 #027 首批观察出现后另立卡做只读分组分析（届时需用户再次批准）。
- **分母更小、收敛更慢**：按 6 类拆分后每组样本量远小于 #027 的整体样本，达到 min=10 门槛更慢；两组样本量不同时不可直接比较比率（同 prd-retention §2.2「两时点不可相减」的同源约束）。
- **推荐仅为设计**：6 类枚举、ctx/listen 单列、null 默认语义、派生表达式 `attributionMode(s)` 均为 G1 的产品口径，在此写死；最终签名（可选第 4 参形态、缺省兼容证明）与 **core 内对第 4 参脏值的二次归一收口位置**属 G2 契约实现细节，本 PRD 不越界。实现以用户批准改 D-038③ 为前提。
