# 今日挑战 · 视觉与交互规格（G5）

> 只出规格，不改 `word365/` 源码。**文案真源＝`365-groups/G1-product/prd-challenge.md §5`，逐字照抄；本稿只管形态、间距、状态与动效**。颜色一律走既有变量；本卡**不用** `.btn-primary` 填充样式，不碰 `--cta-*`。落点：`renderHome` 中 `.home-hero` 之后、`.home-cards` 之前；覆盖层复用 `#modalRoot` + `openModal()`（`js/app.js:87`），hash 不变。

## 1. 视觉定调

- **层级**：hero 卡是首屏唯一主角（`--shadow` 白卡 + 唯一 `--cta-bg` 主按钮）。挑战卡降一级——`box-shadow:none`、`1px dashed var(--line)`、标题 15px（比 `.home-plan h2` 小 4px）、按钮用 `.btn` 描边形态。两个绿填充按钮会互抢注意力。
- **不构成「又一个任务」**：虚线边＝可选可跳过，是首页唯一一张虚线的卡；只陈述题量与时长，全卡无「待完成 / 欠 N 题 / 连续 / 坚持 / 冲刺 / 限时」。
- **记忆点**：**虚线段**——一眼看出「这张可以跳过」；5 个点只在覆层题头出现一次（不重复到卡面，重复即稀释）。卡面**不放任何点阵**：卡上的点只有 0/5 与 5/5 两个取值，5 个实心点在任何界面语言里都读作「满分」，正撞「不评分」红线。

## 2. 入口卡规格

**结构**（2 列：左文 2 行，右按钮跨 2 行垂直居中）。`ready` 时整卡是一个 `<button>`，子元素用 `<span>` 承载（button 内只容 phrasing content）；内层按钮牌**必须是 `<span class="btn cc-cta">`，不能是 `<button>`**——嵌套交互元素非法，且会多出一个 Tab 点。牌上 `aria-hidden="true"`，点击由外层卡承担 → 全页只有一个 Tab 停靠点。三条 `aria-label`（§下表内）属 G5 自有的非可见文案，不在 PRD 的 23 个可见文案键内，改动须与 G1 的 aria 附录同步。

| 元素 | 可写 CSS 的数值 |
|---|---|
| `.challenge-card` | `display:grid; grid-template-columns:minmax(0,1fr) auto; grid-template-areas:"t c" "s c"; column-gap:14px; row-gap:6px; align-items:center; width:100%; min-height:84px; margin:18px 0 0; padding:16px 18px; border:1px dashed var(--line); border-radius:14px; background:var(--card); box-shadow:none; text-align:left;` **五种 mode 共用这一条边框**，状态不改 `border-style`（换边框语法＝看起来像两个组件，只有「做完了」才像真卡） |
| `.cc-title` | `grid-area:t; font-size:15px; line-height:1.35; font-weight:400; color:var(--ink); letter-spacing:.02em;` 逐字「今日挑战」。**常规字重、左对齐**：600 是本站按钮的字重语言，虚线卡若配粗体＋居中＋灰字，就会滑向「＋ 添加新书」的语法 |
| `.cc-sub` | `grid-area:s; font-size:13px; line-height:1.45; color:var(--ink-soft);`（不用 `--ink-faint`：#90a0af 白底 2.9:1） |
| `.cc-cta` | `<span class="btn cc-cta">`：`grid-area:c; justify-self:end; min-height:44px; padding:9px 16px; font-size:13px; font-weight:600; white-space:nowrap;` 逐字「开始挑战」 |
| hover / 按下 | 卡 `border-color:var(--brand-deep)`，`.cc-cta{background:var(--bg-soft)}`；**不做 `translateY(-2px)`**（那是 `.entry-card` 的「任务感」，这里要更轻）。`[aria-disabled="true"]` 时取消全部 hover 位移与变色，只留 `cursor:not-allowed` |
| 焦点 | 沿用全局 `:focus-visible` 2px + 2px 偏移；卡 `border-radius:14px` 保证环贴合 |

**五变体（模式由 `challengeState(db, at).mode` 给出，不自行拼条件；优先级 `done > empty > not-enough > ready`）**

| mode | 副标题（逐字） | 右侧 | 视觉差异 |
|---|---|---|---|
| `ready` 池≥5 | 5 个词，约 2 分钟。不改动学习进度。 | 「开始挑战」 | 基准态；`aria-label="开始挑战：5 个词"` |
| `ready` 池 1–4 | 今天只有 {n} 个词可挑战 | 「开始挑战」 | 按钮不降级、不加「仅」；`aria-label="开始挑战：今天有 {n} 个词"` |
| `not-enough` | 词库可用词不足 2 个 | 按钮牌压暗 | **不用原生 `disabled`**：整卡 `aria-disabled="true"` + 点击 no-op（仍可聚焦，读屏能听到原因句）。`.cc-cta{background:var(--bg-soft); border-color:transparent; color:var(--ink-soft); opacity:.6}`——**只有按钮牌压暗，卡片文字与原因句保持 `--ink` / `--ink-soft` 原对比度**（`opacity` 加在整卡上会把「不足 2 个」这句唯一有用的信息一起压灰）。无警示色、无感叹号；`aria-label="开始挑战：词库可用词不足 2 个"` |
| `empty` | 今天没有到期的词，也没有错词 | 无 | 副标题内加 `.cc-hint{display:block; margin-top:2px; font-size:12px; line-height:1.5; color:var(--ink-soft);}`「明天再来看看」；改用 `<div>`（不可聚焦、无 hover）；`min-height:84px` 防塌陷 |
| `done` | 今天已完成 · {n} 个词 | 无 | `<div>` 不可点；**边框仍为 `1px dashed`**（形状一致比状态区分重要，五态共用一条边框规则，只在颜色上不动它）；**不压整卡 `opacity`**（文字对比度不随状态掉）；不加左侧竖键线（会被读成「达标」）；即使池随后变空也停在此态 |

## 3. 覆盖层规格

容器：`.modal` 内 `.ch-modal{max-width:520px}`；`display:flex; flex-direction:column; gap:16px;`。`openModal()` 注入的 `.modal-close` 由 G4 置 `hidden`（一个弹窗只留一个关闭钮）；**三条退出路径「先合上」/ Esc / 点遮罩必须同走 `quitChallenge()`**——遮罩不得沿用框架默认 `closeModal()`，否则 `state.challengeFlow` 不清、键盘监听仍活，用户盲按 1–4 可在不可见弹层里答完并把「今天已完成」写进库（CH-AC12 的反面）。

| 区域 | 规格 |
|---|---|
| 题头 `.ch-head` | `display:flex; align-items:center; gap:12px;` 左「第 1 / 5 题」`12px; color:var(--ink-soft); font-variant-numeric:tabular-nums; letter-spacing:.06em;`；中 5 个步骤点 `gap:6px`；右「先合上」`<button class="btn">` `min-height:44px; padding:8px 12px; font-size:13px; margin-left:auto;` |
| 步骤点 `.ch-stepdot` | 8×8px，圆角 999px，`box-sizing:border-box`；已答 `background:var(--brand-deep); border:1.5px solid var(--brand-deep)`；当前 `background:var(--brand-soft); border:1.5px solid var(--brand-deep)`；未答 `transparent + 1.5px solid var(--ink-soft)`。**固定中性，不随对错变**（对错只由反馈句与 ✓/✕ 表达）。容器 `aria-hidden="true"`：进度已由左侧「第 i / N 题」文本承担，点阵再加朗读名会让读屏把同一件事念两遍。`CHALLENGE.dotsAria` 已随 `aria-label` 一并删除（G0 决定：失去调用点即为死代码，本项目不收死代码；代价是文案键回到 23 条纯可见） |
| 题干 `.ch-prompt` | 小标签「选出下面释义对应的英文」`11px; letter-spacing:.14em; color:var(--ink-soft);`；释义 `26px/1.35; font-weight:600; color:var(--ink);` 左对齐（不做居中大标题） |
| 选项组 `.ch-opts` | `display:grid; grid-template-columns:1fr; gap:10px;` |
| `.ch-opt` | `<button type="button">`：`width:100%; min-height:52px; padding:11px 14px; border:1px solid var(--line); border-radius:12px; background:var(--card); color:var(--ink); font-family:var(--serif); font-size:17px; text-align:left; display:flex; align-items:center; gap:10px; min-width:0; overflow-wrap:anywhere;` 键帽 `.co-key`（24×24）写 **1–4**（与数字键一致），`aria-label="选项 1，{word}"` |
| hover | `background:var(--bg-soft); border-color:var(--brand);` **不加位移**（列表位移会抖） |
| 按下 | `transform:scale(.99)`，`transition:transform .09s` |
| 答对 | `.is-correct`：`border:1.5px solid var(--brand-deep); color:var(--brand-deep);`（底色仍 `--card`）＋行尾 `✓`；**不铺 `--brand-soft` 色块** |
| 答错 | 所选 `.is-picked-wrong`：`border-color:var(--ink-soft); color:var(--ink);` ＋行尾 `✕`（`--ink-soft`，不染红）；正确项同时 `.is-correct`；其余 `.is-dim{opacity:.55}`；**不出现 `--danger-soft` 底**（`--danger` 白底仅 3.36:1） |
| 锁定 | 答后四项 `disabled`；`.ch-opt:disabled{opacity:1; cursor:default;}`（原生 disabled 默认无透明度，别覆盖掉可读性） |
| 反馈 `.ch-feedback` | `min-height:44px; aria-live="polite";` 对：「选对了」`13px var(--brand-deep)` ＋「{word} · {meaning}」`15px var(--ink)`（词用 `--serif`）；错：「这个词是 {word} · {meaning}」`15px/1.5 var(--ink)`。无分数/正确率/色块；逐字见 PRD §5 |
| 底部 `.ch-foot` | `display:flex; align-items:flex-end; gap:12px;` 左提示「中途合上不算今天完成，也不改动学习进度」`12px/1.5 var(--ink-soft); flex:1;`；右「下一题」/末题「看结果」`<button class="btn">` `min-height:44px; padding:9px 18px; font-size:14px; font-weight:600;` 未作答时 `disabled`（`.6`），作答后启用 |
| 结果 `.ch-result` | 三支事实句**视觉完全一致**：`font-size:15px; line-height:1.7; color:var(--ink); min-height:52px; max-width:30em;`（一行两行都不改变卡高；**与正文同级，不得缩成 12px 脚注**），容器 `aria-live="polite"`。逐字三支互斥：①全对「今天这 5 个词都选对了。学习进度没有改动。」②部分对「今天这 5 个词，4 个选对，1 个没选对。学习进度没有改动。」③全错「今天这 5 个词都没选对。学习进度没有改动。」**全错态不做任何失败感处理**：不换色、不加图标、不加「再来一次」、不缩短停留、不自动关闭；三支排版/字号/颜色/留白必须不可区分，否则后半句「学习进度没有改动」会被读成安慰。右对齐「合上」44px；无点阵、无分数。**结果页只保留「合上」一个动作**：不出现「去复习」「再来一次」「查看错词」等任何跳转或再来按钮；要加须先有新立项裁决——任何「再来一次」都会把它变成可反复刷的测验（一天一次、同池固定正是为此），任何「去复习」都会把结果页变成二级入口，违背本卡「不新增路由、不替代学习页」 |

## 4. 动效

| 场景 | 规则 |
|---|---|
| 卡片入场 | **不做**（首页多卡齐刷淡入是 AI 味来源） |
| 步骤点落位 | 伪元素 `scale(.4)→1`，`160ms cubic-bezier(.2,0,0,1)`，只动 transform |
| 选项按下 | `scale(.99)`，`90ms ease-out` |
| 反馈出现 | `opacity:0→1` + `translateY(4px→0)`，`140ms ease-out` |
| 换题 | 题干+选项 `opacity 1→0`（120ms）→ `0→1`（160ms）；**不做滑入**（统一上浮是模板味）。无自动跳题 |
| 覆盖层 | `opacity:0→1` + `translateY(6px→0)`，`160ms ease-out` |
| 降级 | `prefers-reduced-motion:reduce`：沿用 `app.css:1121` 全局 0.01ms，换题直接替换 DOM，不加延时 |

## 5. 响应式（无横向溢出）

| 宽度 | 入口卡 | 覆盖层 |
|---|---|---|
| 375 | `padding:14px 16px; column-gap:12px;` 仍 2 列（不叠 4 行，保 375×667 首屏可见按钮）；副标题可折 2 行，卡高仍 84–90px；`.cc-cta{min-width:104px; padding:9px 12px}` | `.modal{padding:18px}`；`.ch-modal{max-height:88vh; overflow:auto}`；释义 `22px`；选项 `min-height:50px; font-size:16px; padding:10px 12px`；`.ch-foot{flex-direction:column; align-items:stretch;}` 提示在上、按钮全宽 |
| 768 | 基准 2 列；`column-gap:14px` | 520px；选项 56px；底部保持左右同行 |
| 1440 | 随 `.container`（1020px）居中，不额外拉宽 | 520px 居中，`max-height:82vh`（沿用 `.modal`） |

防溢出：`.ch-opt{min-width:0; overflow-wrap:anywhere}`；375 下可用宽 311px，标题 60px + 间距 12 + 按钮 104px = 176px，余量充足；题头「第 1 / 5 题」+ 5 点（58px）+「先合上」（约 76px）≈ 250px，不换行。

## 6. 可访问性

- 选项为原生 `<button>`，`min-height:52px`，整行可点；答后 `disabled` 但**不降透明度**，正确答案仍清晰可读。
- 键盘：`1–4` 等价点击对应选项，`Esc` 等价「先合上」，结果页 `Esc` 等价「合上」（同一键位贯穿两屏，不允许只在答题屏生效），`Tab` 顺序＝视觉顺序；**打开方向**：题目页聚焦第 1 个选项、结果页聚焦「合上」（不得把焦点留在 `aria-modal` 之外）；**关闭方向**：焦点回 `.challenge-card`（完成态是 `tabindex="-1"` 的 `<div>`，可程序聚焦）。
- 题头点阵 `aria-hidden="true"`：它只做视觉节奏，进度语义由「第 i / N 题」文本提供；两处同时朗读＝同一信息念两遍。`dotsAria` 键已删，不留死字符串。
- 对错不只靠色：`✓ 选对了` / `✕` ＋ 整句反馈三重编码；步骤点中性、不表对错，卡面不放点阵（避免「满分」误读）。
- 焦点环沿用 `app.css:95`（`2px solid var(--brand)` + 2px 偏移），选项 `border-radius:12px` 保证贴合，不得 `outline:none`。
- 反馈容器 `aria-live="polite"`；文字色只用 `--ink`/`--ink-soft`/`--brand-deep`（≥5.37:1）。
- `not-enough` 用 `aria-disabled="true"` 而非 `disabled`：卡仍可 Tab 到达，读屏念出「开始挑战：词库可用词不足 2 个」及副标题；点击 no-op 不展开。用原生 `disabled` 会把这段话一起变灰、且从 Tab 序列移除。
- 虚线卡不靠 `opacity` 表达状态（`done`/`empty` 同样），避免低视力用户读到被压淡的原因句；状态只由文案与按钮牌明度区分。

## 7. 反 AI 味自检（对照 zh-CN.md §7，12 项）

| # | 结论 | 理由 |
|---|---|---|
| 1 展示字体 | 通过 | 不引入新字体：英文词用既有 `--serif`（与词卡同源），中文用 `--sans`；无 Inter/Roboto/Space Grotesk |
| 2 配色 | 通过 | 全取自既有令牌；无紫蓝渐变、无平均分配粉彩；强调只有 `--brand-deep` 描边与文字 |
| 3 布局 | 通过 | 首屏仍是 hero 非对称双栏，卡是 2 列窄条，非「居中标题＋副标题＋两按钮＋三卡」 |
| 4 卡片 | 通过 | 与 `.card` 刻意不同：虚线边、零阴影、无居中图标、无统一圆角卡阵列 |
| 5 图标 | 通过 | 不用图标集；只有 `✓`/`✕` 两个字符，承载对错信息而非装饰 |
| 6 文案 | 通过 | 逐字用 PRD §5；仅陈述题量时长与事实，无「赋能/新一代/释放潜力」，也无「加油/差一点」 |
| 7 动效 | 通过 | 只动 transform 与 opacity，90–160ms 分级；入场不做，换题用淡出淡入而非统一上浮 |
| 8 层次 | 通过 | 虚线边 + 描边按钮 + 无阴影构成轻层次；以「更少装饰」区分层级，不靠纯色平板 |
| 9 人格 | 通过 | 「首页唯一一张虚线的卡」＋「先合上」这类克制的退出语，换掉 Logo 仍像工具而非打卡 App |
| 10 状态 | 通过 | 覆盖默认/hover/按下/选中/答对/答错/锁定/禁用/已完成/池不足/空态/结果页；加载态不适用（纯本地同步渲染） |
| 11 记忆点 | 通过 | 首页唯一虚线卡是第一眼识别物；5 点只在题头出现一次，不做环、星级、大字分数 |
| 12 可访问性 | 通过 | 正文与控件对比 ≥5.37:1；焦点环 2px＋2px；数字键与 Esc 全覆盖；`prefers-reduced-motion` 降级 |

## 8. G5 备注

1. 卡面点阵已按 G1 意见整体移除：卡上只剩「0/5」「5/5」两个读数的点阵，等于免费的成绩单，而它不承载任何卡面信息（答题时卡被覆盖层遮住）。若后续要恢复「计数感」，用 `<span class="muted">5 个词</span>` 文字，不加点。
2. 结果页同样不放点阵：`k ≠ n` 时任何点阵都可能被读成「5 分之 4」，与不评分红线冲突；事实句本身已足够收束。
3. 若后续要加「连续 5 天」，请另起一行 `muted` 文字，不要往题头加第 6 个点——那会把轻量练手滑回打卡任务。
4. **虚线的第二读数是「占位/未上线」**（首页其它卡都是实线时尤甚）。因此卡内不居中、不用灰大字、不配 `+` 或虚线内层图标、标题不加粗到 600，只用「左对齐文本 + 一枚描边按钮牌」。若可用性测试确认被读成「未上线」，正确改法是**换 `1px solid var(--line)` + `background:var(--bg-soft)` 的浅底**，不是补竖线或加图标。
5. 标题 `font-weight:400` 是 G1 的硬约束（避免「添加」语法）；代价是 15px/400 与正文同重、层级偏弱，靠 `--ink` 与副标题的 `--ink-soft` 拉开。若实测偏弱，建议只上调到 **500**，不要再回到 600——600 是按钮字重，会把这张可选卡读成主操作。

## 9. G0 落地核对

**七次核对 2026-11-17（以磁盘为准；行号漂移快，以下一律用函数名定位；残留 0 条）**

**已闭合**：`≤420` 只留 `padding:14px 16px` 与 `.ch-meaning{22px}`（`css` 420 断点）；窄屏 `.ch-foot` 改列、`.ch-next` 全宽；hover 排除 `[aria-disabled="true"]`；`challengeCardHtml` 为非 button 态补 `tabindex="-1"`；`renderChallengeQuestion` 聚焦首选项；`finishChallenge` 隐藏注入的 ✕、并在 `render()` 后聚焦 `#chResultClose`（打开进对话框），关闭时回卡片，两个方向成对；`keydown` 监听首行判 Esc，条件 `state.challengeFlow || $('#modalRoot .ch-modal')`——本组原建议 `modalOpen()`，G0 指出它对任何弹层为真、会把抽测/单词表/清空确认的 Esc 一并改成「关闭并聚焦挑战卡」，故收窄为 `.ch-modal`，采纳；遮罩与结果页「合上」均收口到 `quitChallenge` / `closeModal + focusChallengeCard`；`closeModal` 退回纯关闭；题头点阵改 `aria-hidden="true"`，`CHALLENGE.dotsAria` 一并删除（无调用点即死代码）。

**撤回记录**：① 上一轮「Esc 死分支（`else if (modalOpen())` 不可达）」的观察作废——该分支不是变可达，而是被删掉重写为 `.ch-modal` 条件，其余弹层由 `init` 的 `modalOpen()` 兜底；② 「结果页打开时焦点在弹层背后」已修（`resClose.focus()`，有 `ui.test.challenge.mjs` 断言守住），该条不再计入残留。

**残留：0 条**。以下为记录，不是待办：

**已知边界（记录，不在本卡扩）**：弹层无 Tab 焦点陷阱，与项目其它弹窗一致；挑战只有 4 个选项 + 2 个按钮，Tab 循环缺失不构成阻断，但读屏用户会走出弹层——若日后统一加，应作为全局弹窗能力，不在这张卡单点实现。

**团队决定（记录，非本组提出）**：不在 `openModal` 里加 `ev.target instanceof Element` 类型守卫。理由：`openModal` 是全站共用入口，该守卫会让最小 DOM 桩（vm 测试与若干既有 ui 测试）失效，收益（防伪造事件）不抵成本；脚本直调 `closeModal` 的半态已由 `quitChallenge` 收口。

**判定不改**：375 未把选项降到 50px/16px——17px 在 335px 内容宽内不溢出，且英文词更大更好认；`.ch-modal` 未设 `88vh`，继承 `.modal` 的 82vh 更严格，安全。

**已知边界（记录，不在本卡扩）**：弹层无 Tab 焦点陷阱，与项目其它弹窗一致；挑战只有 4 个选项 + 2 个按钮，Tab 循环缺失不构成阻断，但读屏用户会走出弹层——若日后统一加，应作为全局弹窗能力，不在这张卡单点实现。

**团队决定（记录，非本组提出）**：不在 `openModal` 里加 `ev.target instanceof Element` 类型守卫。理由：`openModal` 是全站共用入口，该守卫会让最小 DOM 桩（vm 测试与若干既有 ui 测试）失效，收益（防伪造事件）不抵成本；脚本直调 `closeModal` 的半态已由 `quitChallenge` 收口。

**判定不改**：375 未把选项降到 50px/16px——17px 在 335px 内容宽内不溢出，且英文词更大更好认；`.ch-modal` 未设 `88vh`，继承 `.modal` 的 82vh 更严格，安全。

**已知边界（记录，不在本卡扩）**：弹层无 Tab 焦点陷阱，与项目其它弹窗一致；挑战只有 4 个选项 + 2 个按钮，Tab 循环缺失不构成阻断，但读屏用户会走出弹层——若日后统一加，应作为全局弹窗能力，不在这张卡单点实现。

**团队决定（记录，非本组提出）**：不在 `openModal` 里加 `ev.target instanceof Element` 类型守卫。理由：`openModal` 是全站共用入口，该守卫会让最小 DOM 桩（vm 测试与若干既有 ui 测试）失效，收益（防伪造事件）不抵成本；脚本直调 `closeModal` 的半态已由 `quitChallenge` 收口。

**判定不改**：375 未把选项降到 50px/16px——17px 在 335px 内容宽内不溢出，且英文词更大更好认；`.ch-modal` 未设 `88vh`，继承 `.modal` 的 82vh 更严格，安全。

**判定不改**：375 未把选项降到 50px/16px——17px 在 335px 内容宽内不溢出，且英文词更大更好认；`.ch-modal` 未设 `88vh`，继承 `.modal` 的 82vh 更严格，安全。
