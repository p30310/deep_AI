# 例句语境练习 · 视觉规格（G5）

> **版本 v1.2 · 2026-11-17**（v1.1：按 D-051 汇总裁决收敛——降级双条件退回 type 原样、判定只认原形、删屈折差异案；v1.2：对齐 G1 终裁——`.cloze.muted` 与 `.ctx-conflict` 本版均不接线、`CTX.tab` 文案落定、§8 补「不要为降级态发明新视觉」）· 基线：D-051 生效版 + `css/app.css` 令牌（D-044/D-045 修正后 `:7-54`）+ #025 `spec-challenge.md` 文风先例。行号会漂移，一律以类名/函数名定位。只出规格，不改 `word365/` 源码。文案真源＝G1，本稿只管形态；颜色全走既有令牌，不碰 `--cta-*`、不引入新色值。

## 0. 范围与定调

- 采 D-046 听写同款加法：只替换 `renderType` 的 `questionHtml`（`app.js:1495-1503` 先例），`type-hint-len / type-slots / type-input-row / typeFb / studyChrome` **零改动原样继承**。不新路由、零新存储。
- 层级：**例句是题干本体**——从 flash 正面辅助信息（`.cloze` 16px `--ink-soft`）升为 20px `--ink` 衬线；中文释义提示是脚注，字级与明度双降，不得盖过例句。
- 记忆点：**与 flash 正面同一根 2px `--brand` 下划线**——「你翻卡时见过的那条线，现在要你写出整词」。不做填字格、不做方格底。

## 1. 模式 Tab 第 4 项

`tabDefs`（`app.js:1177-1186`）在听写后插入第 4 项，渲染写法逐字复用：`class="tab" + aria-pressed`、active 判定沿用 `s.mode==='type' && s.ctx && !s.listen` 同构。**样式差＝0**：`.tab`（padding 9px 16px / min-height 44px / radius 12 12 0 0）与 `.tab.active`（`--brand-soft` 底 + `--brand-deep` 600 字 + 2px dashed `--brand` 下边）一律现值，零新 CSS。`.study-tabs` 已 `flex-wrap:wrap`，6 枚在 375px 下自然两行，与 #023 五枚两行同构。Tab 文案 G1 已定：`CTX.tab`＝逐字「例句填空」，aria 名同文案。

## 2. ctx 题面 stage（核心）

容器与 listen-stage 同构，骨架值逐字同源：`.ctx-stage{ display:flex; flex-direction:column; align-items:center; gap:10px; padding:14px 0 6px; }`

| 元素 | 可写 CSS 的数值 |
|---|---|
| `.ctx-label` | 同 `.listen-title`：`font-size:12px; letter-spacing:.12em; color:var(--ink-soft);`（题面小标，文案 G1 定） |
| `.ctx-sent` | `font-family:var(--serif); font-size:20px; line-height:1.9; color:var(--ink); max-width:520px; margin:0 auto; text-align:left; overflow-wrap:anywhere;`——1.9 沿 `.cloze` 行高（多行不挤）；左对齐居中收窄，长句不散 |
| `.ctx-sent .gap` | 复用 flash 正面现值（`app.css:441-447`）：`display:inline-block; min-width:72px; border-bottom:2px solid var(--brand); margin:0 2px;` **空态不带任何占位字符**（`＿` 会与 type-slots 的槽位语义撞车）；**不暗示长度**：min-width 72px 恒定、不随词长缩放、不放字母位——长度暗示会把「语境写词」滑成猜字谜；双条件降级后 ctx 题面只出现例句含独立原形的词（G0 实测 94/460 屈折词退回 type 档），补全展示的例句总是语法正确；文字色 `--brand` 仅在补全后出现 |
| `.ctx-sense` | 释义提示行，例句之下：`font-size:13px; line-height:1.5; color:var(--ink-soft); max-width:26em; text-align:center;`——13px<20px + `--ink-soft`，字级与明度双降，层级锁死 |
| 输入框 | 复用 `.type-input-row input`（300px / 18px / serif / 居中）与 `.btn-primary` 提交钮，**零新组件**；placeholder 文案 G1 定 |
| 例句翻译 `et` | **不上题面**（D-051 题面构成钉死：挖空句 + 中文释义）；是否出现在反馈区留给 G1 |

## 3. 对错反馈（不染红：描边语言 + ✓/✕ + 文字）

| 场景 | 规格 |
|---|---|
| 答对 | 反馈行复用 `.type-feedback.good`（15px `--brand-deep`，✓ 开头）；`.gap` 补全词用 `<span class="ctx-fill">`：`font-family:var(--serif); color:var(--brand-deep); padding:0 2px;` 下划线随判定**即时**切 `--brand-deep`（无过渡，见 §6）；ctx 题面只出例句含独立原形的词，完整句即此呈现，无第二形态 |
| 答错 | ✕ + 文字行：`font-size:15px; color:var(--ink); line-height:1.5;`，✕ `color:var(--ink-soft)`；答案行 `.ctx-answer{ font-family:var(--serif); font-size:18px; color:var(--ink); }`；例句 gap 补全为原形 `--ink`（中性呈现，正确答案靠文字与补全表达，不靠色） |
| 红字差异登记 | `.type-feedback.bad` 既有 `--danger`（白底 3.36:1）**不动**（不属本卡写入域）；ctx 反馈按 #025 惯例 ✓/✕ + 中性字色 + 高亮词色，不新增红色、不铺色块 |

## 4. 四态

| 态 | 视觉规格（可落 CSS） |
|---|---|
| 正常 | §2 基准 |
| 降级 | **双条件**（缺例句 **或** 词边界检测无独立原形，实测 94/460 词）→ 该词**逐词直接调用既有 `renderType()`**，输出与普通 type 模式**逐像素一致**（含 slots 逐字母提示——那是 type 既有交互，不是 ctx 新增）；**零新类名、零新 CSS、零新文案**；`.cloze.muted` 降级路径本版不接线（G1：type 既有文案已覆盖，词序不变、静默降级） |
| 与听写互斥 | G0 终裁：listen 优先（`buildSession` 一行守卫）、**静默**；`.ctx-conflict{ font-size:12px; line-height:1.5; color:var(--ink-soft); text-align:center; padding:4px 0 0; }` 仅作**样式备案**，本版不接线（不新增文案键、不新增 UI 行为）；将来接线时文案键归 G1 |
| 完成态 | 复用 `renderFinish` 既有页，零新样式、零新数值 |

## 5. 响应式

| 宽度 | ctx 题面 |
|---|---|
| 375 | `.ctx-sent{ font-size:18px; line-height:1.8; }`（335px 内容宽 serif 18px ≈ 37 字符/行，最长例句 3 行内；20px 会到 4 行且接近 `max-width` 边界）；`.ctx-sent .gap{ min-width:64px; }`；`.ctx-sense{ font-size:12px; }`（30 字释义 2 行内）；输入行 300px 沿现状不动 |
| 768 | 基准：20px / `max-width:520px` / 释义 13px |
| 1440 | 随 `.container` 1020px 居中，stage 不拉宽（保持 520px 阅读宽） |

中文换行：`.ctx-sense` 中文自然折行（26em 上限即控制行长）；例句为英文，`overflow-wrap:anywhere` 只兜极长词，正常按空格断行。

## 6. 动效（共 2 条，只动 transform/opacity）

| 条目 | 规则 |
|---|---|
| stage 入场 | `opacity:0→1 + translateY(4px→0)`，`120ms ease-out`，挂 `.ctx-stage` |
| 反馈出现 | `.ctx-fill`（补全词）`opacity:0→1`，`140ms ease-out`；gap 下划线变色**即时切换不加过渡**；反馈文字沿 `#typeFb` 既有更新路径 |

`prefers-reduced-motion:reduce`：沿用 `app.css:1232` 全局 0.01ms 兜底，补全直接呈现，不加延时。

## 7. 反 AI 味自检（12 项）

| # | 结论 | 理由 |
|---|---|---|
| 1 展示字体 | 通过 | 例句用既有 `--serif`（与 `.ex-line .hl`/词卡同源），中文 `--sans`；零新字体 |
| 2 配色 | 通过 | 全取既有令牌；强调只有 `--brand` 下划线与 `--brand-deep` 补全；无渐变无粉彩 |
| 3 布局 | 通过 | 沿 type-stage 单列居中骨架加一节，非「标题+副标题+三卡」模板 |
| 4 卡片 | 通过 | 零新卡、零阴影、无圆角卡阵列 |
| 5 图标 | 通过 | 仅 ✓/✕ 字符承信息，无图标集 |
| 6 文案 | 通过 | 逐字用 G1 键；无评分语汇、无鼓励话术 |
| 7 动效 | 通过 | 2 条、120/140ms、只动 transform/opacity |
| 8 层次 | 通过 | 例句/释义靠 20→13px 与 `--ink`→`--ink-soft` 双降分层，不加底色块 |
| 9 人格 | 通过 | flash 同源下划线延续产品既有语言，换 Logo 仍像同一工具 |
| 10 状态 | 通过 | 正常/判对（例句补全高亮）/判错/降级（双条件→type 原样静默）/互斥（listen 优先静默）/完成全覆盖；纯本地渲染无加载态 |
| 11 记忆点 | 通过 | 同一根品牌下划线做记忆锚；**防坑①**：挖空是单条下划线不是方格/交叉格，无填字游戏感 |
| 12 可访问性 | 通过 | `--ink` 12.6:1、`--ink-soft` ≈5.9:1、`--brand-deep` 5.67:1 均 ≥4.5；44px 命中与 focus-visible 沿既有；反馈经 `aria-live` 既有容器；reduced-motion 降级 |

**防坑②**：对错不铺任何 `--brand-soft`/`--danger-soft` 色块，对错由 ✓/✕、文字与下划线即时色三重表达。

## 8. 留给实现组的 4 个不要

1. **不要把 `.gap` 升级成行内输入框**——作答已钉死在底部输入框 + 写出判定链；行内输入会另起一条 Enter/焦点路径，破坏复用前提。
2. **不要给例句或 gap 铺底色高亮**——色块是填字游戏味与「对错色块」两个坑的共同入口；强调只用下划线与字色。
3. **不要顺手改 `.type-feedback.bad` 的红字**——既有 `--danger` 属全站既有语言，不在本卡写入域；要改另立卡走裁决。
4. **不要为降级态发明新视觉**——降级就是 `renderType()` 原样输出（含 slots），砍 slots 的「简化版 type」或任何新类名（如 `.ctx-degraded`）都是第二套 UI；G2 禁写清单同样防这段复制品 CSS。
