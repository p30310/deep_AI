# 例句语境练习（#026 · type 子模式 ctx=1）— 数据与函数契约（v1.2 · G0 终裁版）

> 2026-11-17 · G2 · 基线：D-051/D-046 时点 + G0 实测（460 词全带 e；366 词例句含独立原形；16 词仅句首大小写差；94 词仅屈折/复数形 admit→admitted、bee→Bees）。
> 范式对齐 #023：不新增 mode 枚举、不新增路由、SCHEMA 恒 3、零新存储键。v1.2 终裁：**判定＝单答案原形**（无 surface、无双答案、无屈折候选形集合）；屈折词不渲染 ctx 题面、逐词降级——若屈折词留在 ctx，slots 按原形 5 格而挖空是 8 字母 surface，逐字母提示 UI 错位（残尾陷阱），降级让该复杂度整体消失。

## 1. 会话结构与 ctx × listen 矩阵

**接线（对齐 `s.listen` 写法）**：`buildSession`（app.js:1148 旁）增一行 `ctx: (params.ctx && !params.listen) ? 1 : 0`。
**参数优先级**：URL 同时携带 `ctx=1&listen=1`（手改 hash）时 **listen 优先、ctx 置 0**——listen 是已发布子模式，回归面最小；一行守卫，渲染层不存在双真分支。

**四象限矩阵（逐格写死）**：

| ctx | listen | 行为 |
|---|---|---|
| 0 | 0 | 现状普通 type：`typeSensePrompt` 中文释义题面（零改动） |
| 1 | 0 | **本卡新增**：ctx 题面＝例句挖空 + 释义提示行（typeSensePrompt 照常显示，信息量与普通 type 对齐：type 有释义无例句、ctx 两者皆有）；slots/空格逐字母/N 个字母提示条/Enter/撤销/进度条全复用 |
| 0 | 1 | 现状听写 #023（零改动） |
| 1 | 1 | **互斥 → 按 listen 渲染**（§1 守卫保证） |

**UI 互斥**：tabDefs（app.js:1178）追加 `{ m:'type', ctx:1, label: PHRASES.CTX.tab }`（共 6 标签，`.study-tabs` 可 wrap）；active 判定三分支 `d.listen ? s.listen&&!s.ctx : d.ctx ? s.ctx&&!s.listen : !s.listen&&!s.ctx`。tab 点击（app.js:1813 `case 'tab'`）：`data-ctx="1"` → `np.ctx=1; delete np.listen`；`data-listen="1"` → 反之；其余双删。scopeOptions 的 `mk`（app.js:1102）追加 `(params.ctx ? '&ctx=1' : '')`，切范围不丢子模式。

## 2. 题面数据函数：新增纯函数 `ctxPrompt`（app.js 模块内，无 DOM）

**与 clozeHtml 的关系（防两套挖空逻辑漂移）**：`clozeHtml`（app.js:1254）实为**大小写不敏感**（两侧 `toLowerCase`，采纳 G0 勘误采纳）、无词边界 substring、只挖第一处——会把句中含目标词的复词误挖（w='art' 命中 'starts'），故**不复用、不修改**：clozeHtml 与 flash 正面逐字零改动。ctxPrompt **借鉴其「先按原样切分、再分别转义」的渲染次序**（before/after 原样返回，UI 自行 `esc`，不破坏挖空占位），匹配升级为词边界检测；统一两套逻辑须另开卡。

```js
ctxPrompt(e) -> { found:true, before, gap, after }  // gap = 命中的原形（与 e.w 仅大小写可能不同；仅作揭示展示用，不参与判定）
             | { found:false }                      // 降级信号，见 §4
```
- **边界清单（含独立原形检测，即降级检测器）**：`ex = (e && typeof e.e === 'string') ? e.e : ''`，trim 为空或 `e.w` 非非空串 → `found:false`；否则**独立原形检测**：`new RegExp('\\b' + escapeRegExp(e.w) + '\\b', 'i')` 取**第一处**词边界匹配（前后非字母，大小写不敏感，覆盖 16 词句首大写；`escapeRegExp` 防 w 含正则元字符）。命中 → 三段切分；未命中 → `found:false`。**禁止任何屈折后缀/候选形生成/词干化**（admitted/Bees/abilities 一律不命中，规则永远追不全且不规则形无法枚举——复杂度由降级整体消除，禁硬编码词表打补丁）。

## 3. 判定口径与复用边界（写死，禁止运行时模糊匹配）

**复用边界清单**：
- **复用**：`typeEnter` 提交流骨架（trim/lower → 分流判定 → `doRateTyped('know'/'unknown')` → autoNext 450ms）——判定函数按 `s.ctx` 分流，**另起一套提交流为违规**；`typeHint` 逐字母提示与 slots 渲染（由 `e.w` 构建，照旧；进入 ctx 的词例句即含原形，挖空与 slots 恒同词形，无错位）；撤销链（doRateTyped/undoRate）；评级/额度/evts 写入；renderType 骨架与 shake 反馈。
- **不复用**：`gradeSense`（#016 义项抽考，ctx 的目标是词本身、不选义项）——**禁止把 ctx 硬塞进 gradeSense**；`clozeHtml`（§2）。

**新增纯函数 `Core.gradeCtx(entry, val) -> {ok}`**（core.js **仅追加此函数 + 导出**，既有函数零改动；对齐 #025 challengeGrade 做法——签名不含 db，从类型上杜绝误写 SRS）：
- 判定 = **单答案，写死唯一口径**：`ok = norm(val) === norm(entry.w)`。无 surface 参数、无双答案、无词干化/编辑距离。进入 ctx 题面的词例句必含独立原形（§2 检测器保证），键入原形判对（absorb 填 'Plants absorb water' 自洽）；无关词形判错。
- 边界：`entry` 缺失/w 空 → `{ok:false}`；`val` 非非空串 → `{ok:false}`；不抛错。

**分流接线**：typeEnter（app.js:1547）改为 `var graded = s.ctx ? Core.gradeCtx(e, val) : Core.gradeSense(e, t.senseIdx, val);`。**不新增 `s.typing` 字段**（v1.1 的 surface 已随终裁删除）。**提示长度行照旧显示 `e.w.length`**（与挖空词形恒一致）。

**byType 桶**：**记入既有 `type` 桶语义、零新增桶、零 byType 写入改动**。数据面判据：全仓 `byType` 仅 `normalizeByType`(core.js:466 归一)与 `estMinutes`(core.js:870 读取)两处、**0 处写入方**——listen 作答同样不写 byType，ctx 与 listen 同为 type 子模式、同一判定链，语义与事实双对齐；新增桶 = 新增写入代码 + estMinutes 不认识键 = 死数据，拒绝。**提示梯度**：沿用既有空格逐字母提示，零改动。

## 4. 降级路径（双条件，G0 实测 460 词：366 出 ctx 题 / 94 降级 / 0 缺例句）

**双条件**：词条无 `e`（自制词书场景）**或** §2 独立原形检测未命中（实测 94 词，admitted/Bees 类）→ `ctxPrompt` 返回 `found:false` → `renderType` 该词**按 ctx=0 渲染普通 type 题面**（typeSensePrompt 照常，判定照走 gradeSense），不改 `s.ctx`、不推进 idx、不 toast、不报错——下一词命中则继续 ctx。**不做整组过滤/禁选**：过滤会改 `s.words` 长度与进度条口径。单答案下天然双保险：降级词即使被误分流 gradeCtx 也只判原形，不产生错误判定入口。

## 5. 写入面与禁写清单

- 逐词作答仍走既有链：`typeEnter → gradeCtx/gradeSense → doRateTyped → Core.rateWord`（core.js:181）→ `db.words[key]` 既有字段 + `rec.evts` 恰 +1 条（`type` 字段**仍为 null**，不借 ctx 填写，D-038③）+ `db.days[dk]` 既有计数。ctx 标志只存会话内存 `s.ctx`，**不新增任何会话持久化字段**。
- **禁写清单**：`SCHEMA` 赋值；任何新顶层键 / `db.days[dk].byType`（保持 0 写入方）；`db.settings`；`db.challenge`/`db.exam`/`db.plan`/`returnGuard`；`rateWord/undoRate/gradeSense/norm/sensesOf/pickSense` 签名与行为；`clozeHtml` 与 flash 正面；`index.html`；路由表；既有测试文件；`js/data/**`。
- 写入域：`js/core.js`（**仅追加 gradeCtx + 导出**）、`js/phrases.js`（新增 `CTX` 命名空间文案键，UI 不内联改字）、`js/app.js`（buildSession/tabDefs/tab case/mk/renderType 题面分支与分流/ctxPrompt/escapeRegExp）、`css/app.css`（`.ctx-*` 类，追加式）、`tests/ui.test.ctx-mode.mjs`（新增）。

## 6. 红线核对清单（G10 复核用，7 项）

1. mode 枚举仍恰 4 个；无新路由；hash 可携带 `ctx=1` 且与 listen 互斥（同现 listen 优先）。
2. `Core.SCHEMA === 3`；ctx 全流程后 `db` JSON 与同流程普通 type 的 JSON **逐字全等**（除 rateWord 应有写入外零增量键）。
3. 判定唯一口径 = `Core.gradeCtx` 单答案 `norm(val) === norm(entry.w)`；gradeSense 零改动；全卡无 surface、无双答案、无屈折匹配、无词干化。
4. `clozeHtml` 及 flash 正面渲染逐字零改动；core.js 既有函数零改动（diff 仅 gradeCtx 追加）。
5. byType 全仓仍 0 处写入方；ctx 未新增任何桶或键；`rec.evts` 每次作答恰 +1 条且 `type===null`。
6. **双条件降级**：无 `e` 与 94 词实测清单在 ctx 档**逐词降级，DOM 断言不出现 ctx-stage、只出现 type-question**；无空卡、无死锁、无异常抛出。
7. 文案无评分语汇（D-048 红线）；**布局验证判据：最长例句 49 字符（affair）在 360px 视口 ctx 题面不横向溢出、不换行截断**（最长翻译 16 字符，同判据）。

## 7. 测试要求

新文件 `tests/ui.test.ctx-mode.mjs`（node:test + node:vm + DOM stub，仿 `ui.test.listen-mode.mjs`；gradeCtx 纯函数用 createRequire 直接 require core.js 测）。最低覆盖点：
1. **矩阵四格**：ctx=1 渲染 ctx-stage；listen=1 渲染 listen-stage；双参数 listen 优先；全零普通题面。
2. **ctxPrompt/独立原形检测**：原形精确命中切分；词边界排除（w 为他词子串不误挖）；多处只挖第一处；句首大写命中（ability→'Ability'）；**admitted/Bees 两词断言降级渲染 type 题面、不渲染 ctx stage**；`e.e` 空/w 脏值 → found:false；同输入两次调用深度相等（无随机）。
3. **gradeCtx**：原形判对（大小写混杂/首尾空格）；无关词形判错；entry/w 脏值与空 val → `{ok:false}` 不抛错；**签名恰为 (entry, val) 两参**（防 surface 回潮）。
4. **无例句降级**：无 `e` 词在 ctx 会话 DOM 出现 type-question、不出现 ctx-stage，判定走 gradeSense，会话不中断。
5. **Tab 互斥**：点 ctx 标签后 hash 无 listen、反之亦然；active 态 aria-pressed 恰一个为真；切 scope 后 ctx 保留。
6. **零写入快照**：ctx 完整作答流程前后，`words/days/settings/challenge/exam` 与普通 type 同流程快照 JSON 全等；`Object.keys` 无新键；`rec.evts` 增量恰 1 且 `type===null`。
7. **实测回归**：内置 460 词逐词跑 ctxPrompt，`found:true` 数恰为 **366**（94 词降级 + 0 词缺例句）；affair 例句渲染 DOM 无横向溢出（clientWidth ≤ 容器）。

> 行号均为函数名锚点，以冻结时磁盘为准。
