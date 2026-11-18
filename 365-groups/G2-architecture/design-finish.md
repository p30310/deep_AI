# 学习完成页体验修复（#029 · 纯呈现层 · word365 零改动）— 实现契约（v1.3）

> 2026-11-18 · G2 · 基线：D-061 + `cards/#029.md` + `DOMAIN.md`/`HANDOFF.md` + 磁盘实测（`node --test tests/*.mjs` 25 文件 304/0、`verify.mjs` PASS、`Core.SCHEMA===3`、`Core.RETENTION_MIN_SAMPLES===10`）+ G5 `spec-finish.md` v1.0 + G0 补证（`renderFinish()` 17 行 / 11 处硬编码中文片段 / 3 emoji，`phrases.js` grep 零命中）+ G1 `prd-finish.md` v1.0（71 行 / FIN-AC01~12）**已落盘**。行号一律**函数名锚点**（`app.js` `renderFinish`/`renderStudy`/`doRate`、`core.js` `RETENTION_MIN_SAMPLES`），以冻结时磁盘为准。G1 PRD 是**文案与比例的单一真源**，G0 不得自拟中文；本契约锁形态、输入/输出、边界、零写与机器判据。**G2 不改 `word365/` 源码**（本文件是 G2 唯一交付物；实现组落盘改动不在 G2 交付范围）。
> **v1.1 增量**：据 G0 补证钉死——① 两按钮 `case`（`app.js:1918-1919`）的路由与 `state.session=null` 清理语义逐字不动，本卡只改呈现层、不碰事件分发（§1/§5/§6.2）；② 既有测试对完成页现状零锁定（`grep -rln 'fc-rate\|fc-emoji\|完美！\|正确率.*答对' tests/` 返回空），故新测试须独扛零评价/零 emoji/文案落键门禁（§7）。
> **v1.2 增量（G1 PRD 回填）**：删「比例放行分支」，方案 C 单一口径、源码零 `>= *10`；§1 落 FINISH 6 键与槽位映射；§2 禁词/键集对齐 FIN-AC01~03；§4 空态改 `empty` 无参常量、不渲染 `.fc-count`；§5 按钮用新键 `btnHome`/`btnStats`（不复用 HOME）。**曾登记一处歧义（v1.3 已闭合）**：PRD 旧稿 §47/FIN-AC04 曾多一「共」字；G1 已修为无「共」版——亲验 `grep '共 8 词' prd-finish.md` 零命中，§47 与 AC04 现逐字「这一组做完了 · 8 词，已作答 8 个。」，与 §3 键表、`phrases.js:317`、`app.js:1848` **五方一致** → 默认断言按无「共」有效，**无需 G0 再终裁**；G0 按常规回填 D-xxx 并冻结，G10 按磁盘/键表断言。

## 1. `renderFinish()` 精确输入 / 输出（写死）

- **调用点零改**：无参；仅由 `renderStudy()` 在 `s.finished===true && s.words.length>0` 时调用，写入目标固定 `$('#studyBody').innerHTML`；不改调用点、不新增路由/事件。**只改呈现层**：不碰 `app.js` 事件分发——两按钮 `case`（`app.js:1918-1919`）逐字不动（§5/§6.2）。
- **输入白名单恰 2 字段**：`s.answered`（m＝已作答）、`s.words.length`（n＝本组词数）。**禁读** `s.correct` / `s.fuzzy` / `s.unknown` / `s.idx` / `s.rate` / `s.mode` 与 `db`（去评级、去 KPI、无第二真源）；`s.correct>s.answered` 异常天然不触达 DOM（G1 已终裁禁读，与 G2 一致）。
- **输出 DOM 锚点恰 4 层**：`.finish-card.card`（保留）→ `h2.fc-lead`（会话事实主句）→ `.fc-count`（辅助事实句）→ `.fc-actions`（两按钮组，替换原内联 style）。**删** `.fc-emoji`/`.fc-rate` 节点（旧 CSS 规则留文件不删，无 DOM 命中即自然失效）；`h2` 对 `.finish-card h2` 的特异性覆盖已由 G5 §1 验证。
- **文案取键**：仅 `window.PHRASES.FINISH.*`（纯加法），**恰 6 键、无第 7 键（尤其无 rate/pct/ratio/占比/正确率键）**——`title`（常量「这一组做完了」）、`summary(n,m)`（`{n} 词，已作答 {m} 个。`，n=`words.length`、m=`answered`）、`count`（常量「作答已保存。」）、`btnHome`（「回首页」）、`btnStats`（「看统计」）、`empty`（常量「这一组没有作答，也没有需要记下的内容。」）。按钮用**新键** `btnHome`/`btnStats`，禁复用 HOME 既有键。
- **槽位映射（写死）**：有作答 `h2.fc-lead` = `title + ' · ' + summary(n,m)`（两句同 h2）；`.fc-count` = `count`；`.fc-actions` = 两按钮。空态 `h2` = `empty` 单句、**无 `.fc-count`**（answered=0 时「已保存」为假），两按钮不变。` · ` 为 PRD §47 明定分隔符（非中文文案，允许字面量、不计入源码零中文断言）。
- **歧义已闭合（见 v1.3 头注）**：`summary` 逐字统一为无「共」版——§3 键表 / §47 / FIN-AC04 / `phrases.js:317` / `app.js:1848` 五方一致，按无「共」逐字断言。函数体内零中文展示字面量。
- **零写库**：禁调 `Core.saveDB`/`rateWord`/`undoRate`/`updateLastSeen` 等任何写函数；不改 `state.session` 任何字段（含 `finished`）；不读/写 `db`、不触 localStorage；同 `s` 两次调用产出 DOM 逐字节相等。

## 2. 零评价断言的技术判据（写死，测试直接照抄）

- **DOM 零 emoji**：渲染后 `$('#studyBody').textContent` 对 `/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/u` 命中数 === 0（覆盖 🎉`U+1F389`/👍`U+1F44D`/💪`U+1F4AA` 与变体符/ZWJ 组合）。
- **DOM 零评价/零比例（对齐 FIN-AC01/07/09）**：同一 `textContent` 对 `/🎉|👍|💪|完美|不错|加油|正确率|得分|达标|评级|分数|%|占比|再接再厉|太棒|差一点|学习进度没有改动|模糊|不认识|答对|答错|保持率|长期答对情况|估计|NaN|Infinity|undefined/` 命中数 === 0。
- **DOM 零评价色**：`.finish-card` 子树内联 `style` 与 class 列表断言无 `--danger`/`--warn`/`--brand-soft` 底色块、无 `.badge`、无进度环/进度条节点；按钮仅用 `--cta-bg`/`--cta-ink`（全站操作令牌，不随对错变化）。
- **源码层零中文 + 零阈值**：括号配平截取 `function renderFinish(){…}` 函数体，剥离 `//` 与 `/* */` 注释后断言 `/[\u4E00-\u9FFF]/` 命中数 === 0，`🎉|👍|💪|完美|不错|加油|正确率` 字面量零命中（FIN-AC02），且 `>= *10` 零命中（FIN-AC08，方案 C 无阈值分叉）。
- **文案落键 + 键集**：FINISH 恰 6 键、键名与 §1 表逐字相等、无比例键（FIN-AC03）；`app.js` 函数体仅经 `P.FINISH.*` 取文案；DOM 中文与键值传参后逐字相等（含 `title+' · '+summary` 拼接）。

## 3. 小样本口径（**G1 终裁方案 C：一律不显示比例**，放行分支作废）

- **单一口径**：任何样本量（n=1..9 与 n≥10）同一模板、零比例；DOM `textContent` 无 `%`、无数字比结构（`a/b`、`a:b`、`答对 a / 作答 b`）、无 `正确率/占比`；`s.correct` 不进 DOM。
- **零阈值分叉**：**不启用放行分支、不引 `Core.RETENTION_MIN_SAMPLES`**（该常量仅属 #027 统计页单一来源，本页零引用）；`renderFinish` 源码 `>= *10` 零命中（FIN-AC08）。比例只在统计页一处出现，「看统计」按钮即归位（G1 §2 方案 C）。
- **硬约束**：禁「长期答对情况/保持率」字样（与 #027 名称隔离）；禁「还差 K 个达标」与完成度刻度。

## 4. 空态与边界（逐条给行为，**一律不抛错**）

| 情形 | 行为 |
|---|---|
| `s.answered === 0`（含 `words=[]`、整组跳过两支，FIN-AC06） | `h2` = `FINISH.empty` 单句（无参常量，不消费 N，避免 N=0 渲染「0 个词」踩 #027 empty 教训），**不渲染 `title`/`summary`/`count`、无 `.fc-count` 行**，两按钮仍在；零 `0%`/`100%`/评级词/`—`/进度环；版式与有作答态一致（G5 §3：不灰掉、不缩字号、不居中放 0） |
| `s.words.length === 0` | `renderStudy()` 前段已走「本组没有要学的词」分支，正常路径不进入；直调时防御 `(s && s.words && s.words.length) \|\| 0`，走 `empty` 空态，不抛错不写库 |
| `s.correct > s.answered` / 负值 / NaN | 白名单禁读 `correct` → DOM 同正常态（零比例、零数字比、零 `NaN/Infinity/undefined`）；G1 已终裁禁读，无消费分支 |
| `s === null` / `session` 缺失 | 仅由 `renderStudy()` 在 `s` 存在时调用；防御 `if (!s) { return; }`，不抛错、不改 DOM |
| FINISH 键缺失 / 取值为 undefined | 视图按空串兜底不抛错；测试须断言 6 键齐备（§2） |

## 5. 按钮 / 可访问性

- 两按钮 `data-sact="finish-home"` / `data-sact="finish-stats"` **逐字保留**：路由绑定**已存在且必须保持**——`app.js:1918-1919` 的 `case 'finish-home': state.session = null; nav('#/learn'); break;` 与 `case 'finish-stats': state.session = null; nav('#/stats'); break;` **逐字符不动**。写死三条不变式：① 零新路由（`#/learn`/`#/stats` 不变）；② `data-sact` 取值集合不变（零新 `data-act`）；③ `state.session = null` 清理语义不变（FIN-AC05）。本卡只改呈现层，不碰事件分发。标签逐字取 `FINISH.btnHome`/`FINISH.btnStats`（新键，禁复用 HOME），视图零硬编码。
- `.fc-actions` 替代原内联 `flex`（G5 §8）；按钮沿用 `.btn` / `.btn.btn-primary`，`min-height:44px` 由既有令牌保证，零新增控件样式。
- 读屏顺序 `h2.fc-lead` → `.fc-count` → `.fc-actions`，与 DOM 顺序一致；`h2` 天然可导航；emoji 节点移除后无装饰性朗读；按钮文案即标签，禁冗余 `aria-label`（若 G1 要求容器 role，用 `role="group"` + 取自 FINISH 键的 `aria-label`）。
- 焦点：不引入新的程序聚焦（保持自然文档流）；若需聚焦主句，仅给 `h2.fc-lead` 加 `tabindex="-1"`，禁聚焦 body 吞掉按钮可达性。
- 对比度：`.fc-count` 由 `--ink-faint`（白底 2.68:1）改 `--ink-soft`（5.47:1，G5 唯一对比度修复点）；`.fc-lead` 用 `--ink`，无红绿判定色。

## 6. 红线核对清单（6 项，G10 复核用）

1. **零写库**：`renderFinish()` 前后 `JSON.stringify(db)` 逐字节全等（含 `db.words[*].evts` 内容与顺序）、`Object.keys(db)` 顶层键集不变、`db.schema===3`；`state.session` 零改动；`setItem` 命中 0；无写函数调用（FIN-AC10）。
2. **零新路由 / 事件分发零改**：`location.hash` 取值集合不变；`app.js:1918-1919` 两 `case` 逐字符不动（含 `state.session=null` 清理语义与 `nav()` 目标）；`data-sact` 取值集合不变；`index.html` 零改动。
3. **文案全落键**：`PHRASES.FINISH` 恰 6 键、纯加法、无比例键；`renderFinish` 函数体零中文展示字面量（§2）；DOM 中文与键值逐字相等（含 `title+' · '+summary`）。
4. **零评价 / 评级色**：DOM 与源码零 emoji、零 §2 全表禁词、零 `%`、零红绿判定色/徽章/进度环；`app.js:1800-1804` `matchResult()` 「首次命中正确率」**不在写入域，逐字不动**（G5 §0 / G1 §5 登记偏差，FIN-AC11）。
5. **既有四卡 + #027 卡 DOM 不变**：`renderStats()` 四张 `.stat-card`、26 周热力图、14 天柱图、#027 独立全宽 `.ret-*` 卡逐字符不变；`studyChrome()`（`模糊/不认识`，`:1243`）、`doRate()` 零改动（FIN-AC09）；抽测/挑战完成态零改动。
6. **既有测试逐字不动**：25 文件 304 项逐字不动、`node verify.mjs` PASS、`node --check` 通过；新测试独立文件；`css/app.css` 仅末尾追加 G5 §8 五条规则，不重构既有规则、不新增色值/断点（FIN-AC12）。

## 7. 测试规划（`tests/ui.test.finish.mjs`，**仅规划不落盘**）

**立项理由（G0 实测）**：既有测试对完成页现状**零锁定**——`grep -rln 'fc-rate\|fc-emoji\|完美！\|正确率.*答对' tests/` 返回空，故改动不撞旧断言；但正因无旧保护，本独立新文件须独扛「零评价/零 emoji/文案全落键」全部门禁。DOM 桩 + `node:vm`（仿 `ui.test.retention.mjs`），最低覆盖：① 三锚点各恰 1、两 `data-sact` 保留、`.fc-emoji`/`.fc-rate` 命中 0，锚点断言紧随（E9 防空跑）；② §2 全正则（FIN-AC01/07/09）+ 零 `%` + 零评价色；③ 键集恰 6 + 逐字快照两例（n=8,m=8 / n=8,m=6，无「共」版）+ 源码零 CJK/零 `>= *10`；④ 四边界（answered=0 两支 / words.length=0 直调 / correct>answered / s=null）不抛错、空态无 `.fc-count`、两按钮仍在；⑤ 点击两按钮断言 `state.session=null` 且 `nav('#/learn')`/`nav('#/stats')`（FIN-AC05）+ 渲染前后 `JSON.stringify(db)` 逐字节全等、`setItem` 0 次；⑥ 304 项零回归、既有文件逐字不动（FIN-AC10~12）、`matchResult()` 原样保留。

## 8. 三条最容易实现分歧的裁决（回报 G0）

1. **输入白名单恰 2 字段**（`answered`+`words.length`），m=`answered`、n=`words.length`；`correct`/`fuzzy`/`unknown`/`idx` 禁读（G1 已终裁，与 G2 一致）→ 闭合待裁项 3。
2. **方案 C 终裁**：完成页一律不显示比例，放行分支作废、零 `Core.RETENTION_MIN_SAMPLES` 引用、源码零 `>= *10` → 闭合待裁项 2；比例只在统计页一处。
3. **6 键与逐字真源＝G1 PRD v1.0**：已回填 §1/§3/§4/§5；空态像「还没开始」非「失败」（待裁项 1/4）、视觉锚 G5 §1（待裁项 5）。**原「共」字歧义已闭合**（G1 已修 §47/AC04 为无「共」，五方一致，见 v1.3 头注），G2 无待确认项；请 G0 回填 D-xxx 并冻结，G10 按磁盘断言。
