# G3 · 核心逻辑工程（Core Logic）

> 边界卡 v1.0 · 2026-11-14 · 上级：`../README.md`、总纲 §12/§13
> 参考能力：software-company 工程 SOP（PM→架构→工程→QA）、增量设计 §7.1 core/app 边界

## 1. 组标识与一句话职责

**G3**：实现纯逻辑层——算法、计划、额度、迁移、文案常量与数据，保证可 node 单测、无 DOM。

## 2. 默认调用触发

- 「改 core」「加个算法」「迁移数据」「调额度/配比」「文案要统一」；
- 需要新增纯函数、schema 字段、导入导出兼容；
- 词书数据、桌宠口数、抽测/凭据/节律等状态逻辑。

## 3. 独有产出（不可替代）

- `js/core.js`：纯函数、`ensureSchema`、`todayPlan` 三态、迁移与导入导出；
- `js/data/*`：词书数据（460 词基线，改动需 G8 数据校验）；
- `js/phrases.js`：**逐字文案与枚举单一事实源**；
- `js/pet.js`：桌宠状态；
- `tests/core.*`：本组新增的独立单测。

## 4. 必需输入

G2 的 `docs/design-*.md`（字段类型、函数签名、任务分解）；现有 `Core` 导出面；基线测试项数。

## 5. 可写范围

- `E:/WorkBudy_WorkSpace/word365/js/core.js`
- `E:/WorkBudy_WorkSpace/word365/js/phrases.js`
- `E:/WorkBudy_WorkSpace/word365/js/pet.js`
- `E:/WorkBudy_WorkSpace/word365/js/data/*.js`
- `E:/WorkBudy_WorkSpace/word365/tests/core.test*.mjs`
- `word365/README.md` **仅计数/文件结构节**（需在认领表独占声明）

## 6. 禁写清单

- `word365/js/app.js`、`word365/index.html`、`word365/css/**`
- `word365/tests/ui.*`
- B 仓库任何文件
- `docs/prd-*.md`、`docs/design-*.md`

## 7. 组内 DoD

1. `node --check js/core.js js/phrases.js js/pet.js` 通过；
2. 全量测试 0 失败（A 仓库基线 **161 项 / 7 文件** @ 2026-11-14 21:03 起，新增用例计入）；
3. `node tests/check-data.mjs` 通过（涉及词书时）；
4. 新文案先进 `phrases.js`，代码中无魔法字符串；
5. 新增字段走 `ensureSchema` 幂等加法，SCHEMA 保持 3；
6. `core.js` 无 DOM 依赖，`window.Core` + `module.exports` 双暴露保持。

## 8. 依赖与并行性 + 执行登记

- **上游**：G2（硬依赖）；**下游**：G4（消费 Core API）、G8（回归）。
- **并行性**：属 P2 实现并行集；**T01 基础设施完成后**才可与 G4 并行。
- **串行点**：`phrases.js` 由本组先落键，G4 只引用，同轮禁止双写。
- **回退**：回执中写明可回退位置（新增函数可删、改字段需给还原值）。

| 日期 | 任务卡 | 改动文件 | 新增测试 | 全量结果 | 状态 |
|---|---|---|---|---|---|
|  |  |  |  |  |  |
