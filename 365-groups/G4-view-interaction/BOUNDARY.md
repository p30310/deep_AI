# G4 · 视图交互工程（View & Interaction）

> 边界卡 v1.0 · 2026-11-14 · 上级：`../README.md`、总纲 §12/§13
> 参考能力：`ui-word365` 前端落地 SOP（视觉方向 → 体验规范 → 前端落地 → 汇编）

## 1. 组标识与一句话职责

**G4**：实现路由、视图、组件与基础样式，让 AC 在界面上可用、可见、可键盘操作。

## 2. 默认调用触发

- 「改页面」「加个入口」「调样式」「做个弹窗/向导/列表」；
- 需要消费 G3 的 Core API 渲染界面；
- 空态/错误态/加载态/焦点与 44px 命中区等可用性整改。

## 3. 独有产出（不可替代）

- `js/app.js`：路由、视图渲染、学习引擎编排、弹窗、搜索；
- `index.html`：**仅引入行**（script/link 顺序）；
- `css/app.css`：**末尾追加**新组件样式；
- `tests/ui.*`：视图/交互冒烟（最小 DOM stub，无需 jsdom）。

## 4. 必需输入

G2 的交互/页面设计；G3 的 Core API 与 `phrases.js` 文案键；既有路由表与设计令牌（L1→L2→L3）。

## 5. 可写范围

- `E:/WorkBudy_WorkSpace/word365/js/app.js`
- `E:/WorkBudy_WorkSpace/word365/index.html`（仅新增/调整引入行，不改结构）
- `E:/WorkBudy_WorkSpace/word365/css/app.css`（仅末尾追加，不改既有行）
- `E:/WorkBudy_WorkSpace/word365/tests/ui.test*.mjs`
- `word365/README.md` **仅计数/文件结构节**（需独占认领）

## 6. 禁写清单

- `word365/js/core.js`、`word365/js/data/**`、`word365/js/phrases.js`、`word365/js/pet.js`（只引用）
- B 仓库任何文件（美学层归 G5）
- `docs/prd-*.md`、`docs/design-*.md`
- 不得新增未在 AC 中的路由/弹窗/数据字段

## 7. 组内 DoD

1. 全量测试 0 失败（含本组新增 ui 用例）；
2. 新交互元素 `min-height:44px`、焦点环复用全局 `:focus-visible`；
3. 空态/加载/错误/成功/进行中/不可用六态有明确表现（按改动范围裁剪）；
4. 不引入框架、构建步骤、外部 CDN；
5. `app.css` 仅追加，既有行零改动；`index.html` 仅动引入行；
6. 文案一律取自 `phrases.js`，不硬编码。

## 8. 依赖与并行性 + 执行登记

- **上游**：G2（设计）、G3（Core API 与文案键）；**下游**：G8（回归）。
- **并行性**：属 P2 实现并行集；T01 完成、`phrases.js` 落键后方可与 G3 并行。
- **串行点**：`index.html` 引入行与 G5 共享——按认领表顺序写，后写方先读最新文件。
- **回退**：回执写明可回退位置（新增函数/样式块可删；引入行可删）。

| 日期 | 任务卡 | 改动文件 | 新增 ui 测试 | 全量结果 | 状态 |
|---|---|---|---|---|---|
|  |  |  |  |  |  |
