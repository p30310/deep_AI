# 学习完成页体验修复（#029）· PRD（v1.1）

> 归属：G1 产品 · 2026-11-18 · 上游 D-061 / `cards/#029.md` 已钉死方向，本稿只裁决呈现与文案，不推翻。
> **v1.1 变更（相对 v1.0，文档追平、非设计变更）**：G0 终裁确认 `summary(n,m)` 逐字无「共」字（磁盘 `phrases.js:317` 与 §3 键表逐字一致，实现零改动）；修 §47 DOM 绑定示例与 FIN-AC04 两处笔误，把「这一组做完了 · 共 8 词…」改为「这一组做完了 · 8 词…」。口径、键表、AC 条数（12）、红线与方案 C 均不变。第 12 行「本组共 N 词」是旧硬编码源码引文，按基线原文保留，不属笔误。
> **唯一可写文件**：`365-groups/G1-product/prd-finish.md`；**`word365/` 源码零改动**（本稿为文档，实测仅只读核验）。
> 文风/先例：`prd-retention.md` v1.4（逐字键表 + AC 给定→断言→验证）、`prd-challenge.md` v1.6（#025 无评分文案先例）。

## 0. 基线（读过的命令 / 事实）
- `grep -n "D-061" 365-groups/DECISIONS.md`：立项根因三条——① `renderFinish()` 硬编码与 phrases.js 三处红线正面冲突；② 小样本比例与 #027 `state='insufficient'`（<10 不显示比例）**同产品两套标准**；③ 成功标准=零评分/零鼓励/零 emoji、文案全落键、小样本只陈事实、304 项零回归。
- `cards/#029.md`：只改 `renderFinish()` 呈现与文案落键；新增 `FINISH` 命名空间；新测试独立文件。
- `HANDOFF.md` §4/§5：派工闭环与「实测优先 / 不接受我觉得 / 分歧要裁定 / 文档与磁盘一致 / 未验证就说未验证」。
- `DOMAIN.md` §4：文案单一事实源、既有测试文件零改动、`css/app.css` 追加式、不采信自述。
- `word365/js/app.js:1843-1860 renderFinish()` 全文（只读）：`rate=correct/answered`、`pct`、三档 `emoji`🎉/👍/💪、三档 `title` 完美！/不错！/加油！、`.fc-rate`「正确率 X%（答对 a / 作答 b）」、`.fc-count`「本组共 N 词 · 记录已保存」、两按钮 `data-sact=finish-home/finish-stats`（`:1918-1919` → `nav('#/learn')` / `nav('#/stats')`）。**该函数对 `PHRASES` 零引用，6 段中文展示文案全硬编码**。
- `app.js` session 可用字段（`:1136-1139`）：`words[] / answered / correct / fuzzy / unknown / idx / finished`；`:1453/:1494` 在 `idx >= words.length` 时置 `finished`，故 `words=[]` 或整组跳过会得到 answered=0 空态。
- `app.js:1237-1248 studyChrome()` 状态条已含 `模糊 X · 不认识 Y`（`:1243`）——完成页再列即重复。
- `app.js:1796-1806 matchResult()`（对对碰）另有 🎈 + `首次命中正确率 X%`：**独立函数，D-061 明确不在范围**，本稿不动，登记为已知偏差（§5）。
- `phrases.js:313-342` CHALLENGE 红线「无得分/正确率/达标/评级/分数；不催促、不评价」，结果句必带「学习进度没有改动」；`:292-301` RETENTION 8 键、`leadInsufficient` 门槛 10。
- 基线命令：`node verify.mjs` → **PASS：25 文件 / 304 项 / 0 失败 · 460 词 · QA 34/0**。

## 1. 范围与红线
- **只改** `renderFinish()` 的呈现与文案落键；不改 SRS / `rateWord` / `#027` 卡 / 抽测 / 挑战完成态 / `matchResult()`。
- **红线继承** `phrases.js` 既有「不评价」红线（`:147/:190/:289/:314`）：零 emoji 评级、零「完美/不错/加油」、零「正确率/得分/达标/评级/分数/百分比」、零催促。
- 文案全落 `PHRASES.FINISH`，视图零硬编码中文展示文案；`css/app.css` 仅末尾追加、复用令牌、不新增色值。
- **易错点**：#025 结果句写「学习进度没有改动」是因为挑战不评级；本页是在全部评级后到达，**SRS/due 确已改动**，禁止套用「没有改动」措辞——本页只说「作答已保存」这一事实。

## 2. 六项裁决
1. **说什么**：只陈述事实（词数、已作答数、已保存），**不评分、不给学习判断**。下一步引导**只用两个按钮**（回首页 / 看统计），不新增「继续学」「再练一组」等催促句。
2. **大样本比例**：三方案见下表，**推荐 C**。
   | 方案 | 做法 | 取舍 |
   |---|---|---|
   | A 一律不显示 | 完成页任何样本量均零比例 | 最保守、零分叉；但比例无处可见（其实统计页已有） |
   | B 仅 ≥10 显示且改名「答对占比」 | 引入 ≥10 阈值 | 制造**第三套标准**（统计页「总正确率」无门槛、#027 有 ≥10、完成页又 ≥10），且 session 级比例不稳定，仍会被读成「今天得 80 分」，触「不评价」 |
   | **C 完全交给统计页（推荐）** | 完成页零比例；比例只在统计页一处（既有总正确率 + #027）出现，「看统计」按钮即归位 | **真正消除「同产品两套标准」**：全产品比例只有一处、一套口径；完成页回归「收尾+记录」职责，零新阈值、零新分叉、零回归面 |
3. **模糊/不认识计数**：**不保留**。状态条 `studyChrome()` 已有唯一事实位；完成页重复即冗余，且分项明细逼近评价。完成页最小事实集 = 词数 + 已作答数 + 已保存。
4. **空态（answered=0）**：整组替换正文，只出 `FINISH.empty` 一句 + 两按钮；不渲染 title/summary/count、不出比例、不报 0% 或异常。
5. **视觉锚**（去 emoji 后）：由 G5 定版式数值/对比度/反 AI 味；本稿只保证 DOM 文案无 emoji、无评价色语义。
6. **验收**：见 §4 AC 表（12 条，逐条给定→断言→验证方式）。

## 3. FINISH 文案键表（`PHRASES.FINISH`，逐字，恰 6 键）
| 键 | 逐字文案 | 出现位置 / 口径 |
|---|---|---|
| `FINISH.title` | 这一组做完了 | `<h2 class="fc-lead">` 前半（仅 answered≥1） |
| `FINISH.summary(n, m)` | {n} 词，已作答 {m} 个。 | 同一 `<h2>` 后半，与 title 以 ` · ` 相连；n=`s.words.length`，m=`s.answered` |
| `FINISH.count` | 作答已保存。 | 辅助句 `.fc-count`（唯一第二行） |
| `FINISH.btnHome` | 回首页 | 主按钮 `data-sact="finish-home"`（行为不变） |
| `FINISH.btnStats` | 看统计 | 次按钮 `data-sact="finish-stats"`（行为不变） |
| `FINISH.empty` | 这一组没有作答，也没有需要记下的内容。 | 空态（m=0）：整条 `<h2>` 替换为此句，不渲染 title/summary/count，两按钮仍在 |
> **DOM 绑定裁决（对齐 G5 `h2.fc-lead` → `.fc-count` → `.fc-actions` 两行版式）**：有作答时 `h2` = `title` + ` · ` + `summary(n,m)`（逐字「这一组做完了 · 8 词，已作答 8 个。」），`.fc-count` = `count`，`.fc-actions` = 两按钮；空态时 `h2` = `empty` 单句、无 `.fc-count`（answered=0 时「已保存」为假，不渲染），两按钮不变。` · ` 为分隔符非中文文案。
> 禁写表（键值与视图均不得出现）：得分、正确率、达标、评级、分数、百分比、`%`、完美、不错、加油、再接再厉、太棒、差一点、学习进度没有改动。
> **无比例键**：`FINISH` 命名空间不得新增任何含 rate/pct/ratio/占比/正确率的键——比例只在统计页。

## 4. AC 验收判据（12 条：FIN-AC01…FIN-AC12）
| 编号 | 给定 → 断言 | 验证方式 |
|---|---|---|
| FIN-AC01 | 任意 session 渲染 `renderFinish()` → 输出 HTML 文本不命中 `/🎉|👍|💪|完美|不错|加油|正确率|得分|达标|评级|分数|%|占比|再接再厉|太棒|差一点|学习进度没有改动/`，且无 `.fc-emoji` 节点 | `tests/ui.test.finish.mjs` 正则 + 节点断言 |
| FIN-AC02 | 渲染后 → `grep -n '这一组做完了\|已作答\|作答已保存\|回首页\|看统计\|没有作答' js/app.js` 在 `renderFinish` 函数体内零命中，函数体只经 `P.FINISH.*` 取文案 | grep 截取 `:1843` 函数体 + 人工读稿 |
| FIN-AC03 | `PHRASES.FINISH` → 恰 6 键且与 §3 表逐字相等，无第 7 键（尤其无比例键） | node:test 键集 + 逐字比较 |
| FIN-AC04 | n=8,m=8 → `<h2>` 逐字「这一组做完了 · 8 词，已作答 8 个。」、`.fc-count` 逐字「作答已保存。」；n=8,m=6 → h2 逐字「这一组做完了 · 8 词，已作答 6 个。」 | ui test 逐字快照 |
| FIN-AC05 | 两按钮逐字「回首页」「看统计」，`data-sact` 为 finish-home/finish-stats；点击后 `state.session=null` 且分别 `nav('#/learn')` / `nav('#/stats')`（与 `:1918-1919` 逐字符一致） | ui test 点击 + 行为 diff |
| FIN-AC06 | m=0（含 words=[] 与整组跳过两支）→ 正文只含 `FINISH.empty` 逐字，不含 title/summary/count 任一、不含比例、不报 0%、无异常；两按钮仍在 | ui test 注入 answered=0 两分支 |
| FIN-AC07 | n=1..9 任意 (m,k) → 输出无 `%`、`正确率`、`占比`、`答对`/`答错` 明细 | ui test 遍历小样本网格 |
| FIN-AC08 | n≥10（10/30/100）→ 输出与 n≤9 同一模板、无比例/百分比字样；`renderFinish` 源码无按样本量分叉的阈值判断 | ui test + grep `>= *10` 在函数体零命中 |
| FIN-AC09 | 输出不含「模糊」「不认识」及 `s.fuzzy`/`s.unknown` 任何数字；`studyChrome()`（`:1243`）逐字不变 | ui test 文本断言 + `git diff` 确认未改 |
| FIN-AC10 | 改前后 `core.js` 的 `rateWord/undoRate` 与 `app.js` 的 `doRate/doRateTyped` 逐字不变；`renderFinish` 前后 `JSON.stringify(db)` 逐字符相等（不调任何写函数） | `git diff` + node:test 快照 |
| FIN-AC11 | `matchResult()`（`:1796`）、抽测、挑战完成态文案逐字不变（含其 🎈/正确率原样保留）；`css/app.css` 仅末尾追加、无新增色值、复用既有令牌 | `git diff --stat` + grep 令牌 |
| FIN-AC12 | `node verify.mjs` PASS（25 文件 / 304 项 / 0 失败 · 460 词 · QA 34/0）；新增测试为独立文件 `tests/ui.test.finish.mjs`，`node --check` 通过 | G8 全量复跑 + 门禁命令 |

## 5. 偏差与备注
- **登记偏差（不在本卡修）**：`matchResult()`（对对碰完成页 `:1800`、`:1803`）仍有 🎈 + `首次命中正确率`；D-061 限定只改 `renderFinish()`，故原样保留。它与本页将形成「同产品两套完成页风格」，建议 G0/G9 另立卡处理，本 PRD 不擅自扩范围。
- session 字段 `fuzzy/unknown` 仍被状态条与撤销条使用，本稿只禁止其出现在完成页，不改数据采集或语义。
- 若 G5 需 `.fc-emoji` 以外的容器类名或空态版式数值，以 G5 视觉规格为准；本稿只约束文案与键，不写 CSS 数值。
- 「记录已保存」按事实陈述保留其语义（落 `FINISH.count` 为「作答已保存。」）；若 localStorage 写入失败，保存失败提示归既有机制，本页不新增错误分支。
