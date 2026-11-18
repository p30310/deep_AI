# 例句语境练习 · PRD（v1.1）

> 归属：G1 · 2026-11-17 · 基线：`word365/js/app.js`、`js/core.js`、`js/phrases.js`、`js/data/*.js`（只读核验，2026-11-17 快照）。上游：D-051 已钉边界（type 子模式 ctx=1、零新存储、判定复用写出链），本稿只裁决 D-051④ 的四个待决项，不推翻。
> v1.1（2026-11-17）：按 G0 汇总裁决对齐三处——判定只判原形（裁决 2）、降级改双条件逐词退回普通 type 题面不过滤会话（裁决 3，emptyScope 键随之删除）、词形分布引用 G0 词边界实测 350/16/94；et 升红线（作答前题面零 et，判对揭示态才可出现）；挖空明确「词边界定位、取第一处」。AC 仍 17 条、编号不变。
> 词形分布实测（G0 词边界口径，词边界＝目标词前后皆非字母；本稿引用、不再自行统计）：
> - 460/460 词例句齐备（cet4/cet6/ielts/job/kaoyan = 100/100/100/60/100，自制词书另算）。
> - **350 词（76%）**：例句含独立原形；**16 词**：仅句首大写差异（add/although/align 等）——两组共 **366 词可出 ctx 题**；**94 词（20%）**：例句只有屈折/复数形（admit→"He admitted that…"、bee→"Bees make honey…"、amplify→"amplifies" 等），无独立原形。
> - 交叉验证：G1 独立子串口径实测 87 屈折 + 7 未出现 = 94，与 G0 词边界失败集合完全一致（临时脚本在 `%TEMP%`，未入仓库）。
> - 只读核验：`gradeSense`（core.js）`expected=norm(entry.w)` 全词比对；`clozeHtml`（app.js:1254）子串定位；`typeEnter`（:1547）→`gradeSense`；tabDefs（:1177）。

## 1. 背景 / 目标 / Non-goals

**背景**：460 词 100% 自带例句，flash 正面已被动展示挖空例句（`clozeHtml`）但无作答形态；所有模式均为「孤立词 ↔ 释义」维度。D-051 立项为 `type` 子模式 `ctx=1`。

**目标（可验收）**
- O1 学习页出现第 4 个 Tab「例句填空」，题面＝例句挖空＋中文释义提示，作答＝键入完整单词原形，判定与写出模式同链。
- O2 ctx 练的是「**在语境里产出原形**」，不是考语法变形：判定只接受原形、键入屈折形判错（这是口径而非 bug，验收不得按「admitted 判错」报障）；例句无独立原形的 94 词逐词退回普通 type 题面，**ctx 题面仅出现在 366 词上**，不存在「原形填进去语法不通」的题。
- O3 零新存储：SCHEMA 恒 3、无新 db 键、`byType` 沿用 type 桶；ctx 会话的 db 写入集合与普通 type 会话逐字段同构。

**Non-goals**
- N1 不做「听例句＋默写」叠加模式（留 P2，见 §6）；不新增 mode 枚举、路由、词形还原/词干化算法。
- N2 不改例句数据（`js/data/**` 零改动）、不引导补全例句（词书页既有入口维持现状，本卡不扩）。
- N3 不引入评分/正确率/达标语汇；不动 `w::` 主键、C1/C4/C10。

## 2. 用户流

- UF1 学完单词 → 学习页点「例句填空」Tab → 看到例句挖空＋释义提示 → 键入原形 → 对/错即时反馈（同写出模式）→ 评级、撤销、下一词，全链与 type 一致。
- UF2 例句含独立原形（含句首大写，如 w=although、例句以 "Although" 开头）：空格处整个表面词形替换为 `＿＿`，题面明示「写出原形」，输入 although 判对。
- UF3 例句只有屈折形（如 admit→"He admitted that…"）或词缺例句：**该词退回普通 type 题面**（释义提示＋写词，type 正常题干），会话不中断、词序不变、静默降级不提示。

## 3. 交互步骤与裁决

1. **入口**：tabDefs 在「听写」后追加第 4 项 `{ m:'type', ctx:1, label: PHRASES.CTX.tab }`，渲染 `data-ctx="1"`；点击后 hash 带 `ctx=1` 且**移除 `listen`**；点「听写」Tab 同理移除 `ctx`（UI 单选互斥）。会话新增 `s.ctx`（会话内存，同 `s.listen`，不落库）。
2. **题面**：ctx 档 `renderType` 的 questionHtml 换为：例句挖空行（新增 `ctxClozeHtml(e)`）＋ 释义提示行（复用 `typeSensePrompt`，零新机制）。**et 红线**：作答前题面只渲染例句挖空＋中文释义（`t`）＋输入框；`et`（例句翻译）常含目标词直译、会泄答案，仅**判对后的揭示态**允许出现（判错揭示态只出原形，不出 et）。挖空行加 `aria-label` 读屏描述。
3. **挖空口径（裁决①）**：`ctxClozeHtml` 按**词边界**（目标词前后皆非字母）定位原形、**取第一处**，命中则把该表面词形整体替换为 `＿＿`；大小写不敏感（16 个句首大写词正常挖空）。词边界检测从构造上消灭了残尾风险——admitted/Bees 这类子串命中的屈折词**根本不渲染 ctx 题面**（见步骤 5），不会出现现状 `clozeHtml` 式「＿＿ted」诱导输入表面词形的判定陷阱。
4. **判定口径（裁决①续，G0 裁决 2）**：**只判原形**——`gradeSense` **零改动**，`norm(w)` 全词比对；键入屈折形（如 admit 题输入 admitted）判错，揭示原形（复用现有 fb 文案）。理由：ctx 的学习价值在「看到语境还原词的原形」，接受屈折形会把考察点滑向语法变形且需新增双比对逻辑；产品叙事见 O2。逐字母格子与长度提示按原形 `w` 渲染（ctx 档该行文案换 `CTX.hintLen(n)`，含「原形」二字防歧义）。
5. **降级（裁决②，G0 裁决 3）**：**双条件逐词降级**——`e` 缺失 **或** 词边界检测失败（无独立原形，即 94 词类）的词，在 ctx 档渲染普通 type 题面（type 正常题干＋写词，无挖空行、无 ctx stage 元素），会话不中断、词序不变、**静默降级不提示**。ctx 题面仅出现在 366 词上；自制词书缺 `e` 词同此降级，词书页补全入口维持现状。
6. **提示梯度（裁决④，G0 裁决 5）**：沿用空格逐字母提示（`typeHint`），slots 由原形构建，零新机制；释义提示默认全程可见（ctx 的考察点在语境还原，不在遮释义——与 listen 相反）。
7. 作答/评级/撤销/进度条/键盘/`autoNext` 全部复用 type 现有链路；`byType.type` 分桶沿用，**零新桶**（D-051③，G0 裁决 4）。
8. **矩阵（裁决③，G0 裁决 1）**：`ctx × listen` 互斥。hash 同时带 `listen=1&ctx=1` → **listen 优先**、ctx 不生效（buildSession 一行守卫，静默；既有行为零变化，新标志纯加法）。不做「听例句＋默写」：需 TTS 整句朗读（`speakSentence`）＋无 TTS 降级＋双重提示遮蔽三套边界，AC 复杂度不成收益，登记 P2。

## 4. 文案键表（`PHRASES.CTX`，逐字，5 键）

| 键 | 逐字文案 | 出现位置 |
|---|---|---|
| `CTX.tab` | 例句填空 | 学习页第 4 个 Tab（aria 名同文案） |
| `CTX.ask` | 写出例句空格处的单词（用原形） | 题面例句上方一行 |
| `CTX.hintLen(n)` | 原形 {n} 个字母 · 空格逐字母提示 | 格子上方长度提示 |
| `CTX.placeholder` | 写出原形 | 输入框占位 |
| `CTX.gapAria` | 例句中的空格，缺一个单词 | 挖空行 aria-label |

> v1.1 删 `CTX.emptyScope`：降级改为逐词退回 type 题面后，不存在「范围全空」态。红线词零出现校验同 CH-AC08 词表：得分/正确率/达标/评级/分数/%/再想想/加油/粗心。答对/答错反馈复用 type 既有文案（含「再接再厉，正确答案是：」），零新键。

## 5. AC 验收判据

| 编号 | 判据（给定 → 断言） | 验证方式 |
|---|---|---|
| CTX-AC01 | 学习页 tabDefs 第 4 位渲染逐字「例句填空」按钮，`data-mode="type" data-ctx="1"`；点击后 `location.hash` 含 `ctx=1` 且不含 `listen` | ui test 断言 DOM 与 hash |
| CTX-AC02 | 点「听写」Tab 后 hash 含 `listen=1` 且不含 `ctx`；hash 同时含两标志时按听写渲染（listen 优先），ctx 不生效 | ui test + node:test 分支断言 |
| CTX-AC03 | 逐词降级（双条件）：词边界检测失败的词（94 词类，如 w=admit、e="He admitted that…"）与缺 `e` 的词，在 ctx 档渲染**普通 type 题面**（type 题干＋写词），无挖空行、无 ctx stage 元素；词序不变、会话不中断 | node:test 对 94 词集合逐词断言渲染分支 |
| CTX-AC04 | ctx 题面仅覆盖独立原形词：w=ability、e="She has the ability…" → 整词挖空 `＿＿`；w=although、句首 "Although" → 正常挖空；渲染后挖空行不含目标词任何字母 | node:test 对 `ctxClozeHtml` 输出正则断言 |
| CTX-AC05 | et 红线：作答前题面 DOM 不含 `et` 内容、不含原形 `w` 明文（挖空外区域）；判对揭示态可含 `et`，判错揭示态不含 `et` | ui test 三态 DOM 排除断言 |
| CTX-AC06 | 判定只判原形：输入 "ADMIT "（带空格与大小写）→ 判对；输入屈折形（如 "abilities" 对 ability）→ 判错；`gradeSense` 函数体逐字符不变 | node:test + 源码字符串比对 |
| CTX-AC07 | 判错后揭示原形 `e.w`（复用既有「正确答案是」fb） | ui test 文本断言 |
| CTX-AC08 | 格子数 = `e.w.length`、长度提示含「原形」；空格逐字母提示每按一次 revealed+1，行为与 type 逐项一致 | ui test 快照对照 |
| CTX-AC09 | ctx 题面顺序：`CTX.ask` → 例句挖空行 → 释义提示行（`typeSensePrompt` 同源）→ 格子（顺序以 §4 表与 G5 规格 §2 为准：ask 在例句上方）；降级词题面与普通 type 逐字符一致 | ui test 顺序与快照对照 |
| CTX-AC10 | 答对走 `doRateTyped('know')`、答错 `'unknown'`，撤销条可用；ctx 会话与普通 type 会话的**落盘 db 同构**（归一后逐字节全等），`byType` **全仓 0 处写入方**（含 ctx 零新增桶） | node:test 前后快照 |
| CTX-AC11 | ctx 会话的 db 写入集合与普通 type 会话逐字段同构；SCHEMA 恒 3、`Object.keys(db)` 前后零新增 | node:test 深比较 |
| CTX-AC12 | 自制词书 fixture（3 词全缺 `e`）在 ctx 档全部降级为 type 题面，会话正常走完、无挖空行、无未捕获异常 | node:test fixture |
| CTX-AC13 | 全部 ctx 文案不命中 `/得分\|正确率\|达标\|评级\|分数\|% \|再想想\|加油\|粗心/`；`phrases.js` 的 CTX 段与 §4 表逐字一致（5 键） | node:test 正则 + 逐键比对 |
| CTX-AC14 | Tab 为 `<button>`、`aria-pressed` 同步、命中区 ≥44px、focus-visible；挖空行带 `aria-label`；`role` 沿用 .tab 既有形态 | ui test + 人工读屏一轮 |
| CTX-AC15 | 既有 7+N 文件全量测试 0 失败（既有文件逐字不动）；新增测试为独立文件；`node --check` 通过 | G8 全量复跑 |
| CTX-AC16 | 切出 ctx（含退出学习页）后会话内存 `s.ctx` 不污染其它模式：flash/type/choice/match 渲染与改前逐字符一致 | ui test 快照对照 |
| CTX-AC17 | 无 TTS / 无网络 / 断网环境下 ctx 档完整可作答（不依赖发音，`speak-ex` 按钮行为与 type 档一致） | node:test 桩 + 人工断网 |

## 6. 与听写模式的关系

- **同构点**：都是 `mode=type` 的子模式标志（`listen=1` / `ctx=1`），共用判定链、评级链、格子、逐字母提示与 Tab 形态；会话标志均为内存态、不落库。
- **差异点**：listen 遮蔽中文提示、以发音为题干；ctx 以例句挖空为题干、释义提示全程可见（考察点相反：听音还原 vs 语境产出原形）。二者 UI 互斥（单选）、URL 冲突时 listen 优先（静默守卫，`G5` 预留的 `.ctx-conflict` 提示条本版不接线，留样式备案）。
- **P2 备案**：「听例句＋写原形」叠加态需 `speakSentence` 整句朗读 + 无 TTS 双重降级，待 ctx 上线后按用户反馈评估，不在本卡。

> **G0 事实修正（2026-11-17 10:50，据 G10 `reviews/R-026.md` 与契约 v1.2 落盘）**：CTX-AC10 原写「`byType.type` 正常计数」——实测 `byType` **全仓 0 处写入方**（仅 `normalizeByType` 归一与 `estMinutes` 读取），listen 同样不写，前提事实错误；已改为「落盘 db 同构 + byType 零新增桶」，可执行口径成立。CTX-AC09 原列「例句挖空行 → ask」，与本文 §4 表「ask 在例句上方」及 G5 规格 §2（label→sent→sense）矛盾；已按 §4/G5 对齐。AC 编号与条数不变，其余正文未动。
