# 领域对象与红线速查（DOMAIN）

> 接手手册 `HANDOFF.md` 的姊妹篇。前者讲「怎么干」，本文讲「改什么会踩雷」。
> **所有字段均以 `word365/js/core.js` 磁盘实读为准**（`defaultDB` / `newRecord`），不是凭记忆。
> 最后核对：2026-11-18 · **26 文件 311 项 0 失败**的当前实现（#030 后；`evts.type` 现可写归因标签）

---

## 1. 存储与主键

| 项 | 事实 |
|---|---|
| 存储 | 浏览器 `localStorage`，单键 `w365.db`（`core.js:10`） |
| 版本 | `SCHEMA = 3`（`core.js:11`）——**任何改动都不得把 schema 升到 4**；历史备份兼容依赖此值 |
| 词主键 | `w::` + 规范化词形（`wordKey()` / `norm()`）——**不得改主键体系** |
| 时间 | 一律毫秒时间戳；`DAY_MS = 86400000`；`LADDER_DAYS = [1,2,4,7,15,30,60]`；`SEC_PER_WORD = 35` |
| 时钟 | `core.js` 一次决策内存在两次 `now()`（已知隐患 C3），改调度相关代码时留意 |

---

## 2. `db` 顶层对象（`defaultDB()` 实读）

| 键 | 作用 | 关键子字段 / 备注 |
|---|---|---|
| `schema` | 迁移版本 | 恒 **3** |
| `createdAt` / `updatedAt` | 落库时间戳 | 毫秒 |
| `settings` | 全局设置 | 含 `strengthMode`（`'off'` 缺省 / `'on'`）、`strengthFrom`（逐词接管起点）、每日额度等，缺省 OFF |
| `petState` | 宠物 | `{ totalBites, pos }` |
| `books` / `customBooks` | 内置书 / 自制书 | 460 词分布在 5 本内置书 |
| `words` | **词条进度**（核心） | `w::*` → 词条记录，见 §3 |
| `days` | 按日统计 | `dayKey` → 当日计数，含 `byType`（归一存在但**全仓 0 写入方**）、`total` 等 |
| `goal` | 目标 | `type`（cet46/kaoyan/ielts/toefl/job/free）、`deadline`、`dailyMinutes`（10/20/30）、`createdAt` |
| `plan` | 推导计划 | `derivedAt`、`totalWords`、`mastered`、`dailyFresh`、`dailyReview`、`estMinutes`、`daysLeft`（free 型 0 哨兵） |
| `baseline` | 基线估计 | `level`、`testedAt`、`words[]`、`reestimateAt` |
| `returnGuard` | 回归重建 | `rebuiltAt`（日期串，同日去重）、`rebuildWords[]` |
| `onboarding` | 引导状态 | —— |
| `exam` | 抽测 | `records[]`（最近 10 条）、`flags[]`（待重读词 key） |
| `binding` | 凭据/绑定 | —— |
| `ladder` | 默写阶梯 | `{ mode: 'auto' \| 'manual' }` |
| `challenge` | 今日挑战 | `{ dateKey, size, doneAt }` |

> 顶层键可以**加法**扩展，但 `ensureSchema()` 必须幂等补默认值，且不得升 `schema`、不得改既有键语义。

---

## 3. 词条记录 `db.words['w::*']`（`newRecord()` 实读）

| 字段 | 含义 |
|---|---|
| `w` | 规范化词形（`norm(w)`） |
| `lvl` | SRS 等级；`interval = LADDER_DAYS[min(lvl,6)]` |
| `st` | 状态：`'learning'` / `'review'` / `'known'` 等 |
| `due` | 下次到期时间戳 |
| `reps` / `correct` / `wrong` / `wfix` | 复习次数 / 累计答对 / 答错 / 连续修正 |
| `star` / `note` | 星标 / 用户笔记 |
| `last` / `first` / `lastRating` | 上次作答 / 首次作答 / 最近一次评级 |
| `srcBook` | 来源书名 |
| `graduated` | 方案 J 批量毕业标记（区别于自然 `st==='known'`） |
| `evts` | **逐次作答事件数组**（#015 起采集） |

### `evts[]` 元素结构

```js
{ t: <毫秒时间戳>, rating: 'know'|'fuzzy'|'unknown', interval: <毫秒>, type: null }
```

- `interval` 是**距下次排定的间隔**，不是距上次作答的间隔——算「实际间隔」必须用相邻事件的 `t` 差。
- `type` **恒为 `null`**（D-038③「不扩大签名」）。全仓 **0 处读取方**。
  - #028 已获用户批准实现：`rateWord(db,key,rating,mode?)` 可选第 4 参写此字段；三参调用仍写 null。
- `undoRate` 的快照在 `evts.push` 之前克隆，所以撤销会一并回滚本次事件。

---

## 4. 红线清单（改动前逐条过一遍）

| 编号 | 红线 | 违反后果 |
|---|---|---|
| **C1** | 不改 `w::` 主键体系 | 全部历史进度失联 |
| **C3** | 已知 `now()` 双调用隐患；改调度勿引入新的时间源漂移 | due 飘移、测试不稳定 |
| **C4** | **固定阶梯 `LADDER_DAYS` 永远是可回退基线**；`strengthMode='off'` 缺省时逐字段等价原逻辑 | 记忆强度叠加破坏主流程 |
| **SCHEMA** | 恒 3，不升版；`ensureSchema` 只幂等补默认值 | 旧备份导入失败 |
| **D-038③** | `evts.type` 恒 `null`，签名不因新功能擅自扩大 | 会动到最核心的写路径（需 G0 + 用户裁定） |
| **`db.exam`** | 抽测写面与语义独立；分析层禁读禁写 | 抽测与复习互相污染 |
| **零写库（分析类功能）** | 纯统计函数只读 `db.words[*].evts`；禁调 `rateWord`/`undoRate`/`saveDB` 等任何写函数；禁新增 db 键 | 破坏「只读统计」契约；#027 有 17 项命中 0 的验证 |
| **`evts.type` 仅一处写入点** | #028 后仅 `core.js attribMode(mode)` 一处归一写入；app 两处调用传派生值 | 多方各自写 type 会破坏三参兼容 |
| **文案单一事实源** | 所有用户可见文案先落 `js/phrases.js`，再由视图引用 | 散落字面量 → 改一处漏一处 |
| **`css/app.css` 追加式** | 新样式只在末尾追加，不重构既有规则；令牌统一 | 破坏对比度修复（#021/#022）与暗色体系 |
| **既有测试文件零改动** | 新测试一律独立新文件 | 门禁回归失真 |
| **不采信自述** | 结论必须来自亲手跑的命令/自写探针 | 文档与磁盘漂移（本项目已修 5 处以上） |

---

## 5. 六条练法的入口与落库

| 模式 | URL 参数 | 说明 |
|---|---|---|
| 单词快过 | `mode=flash` | 认词 |
| 写出英文 | `mode=type` | 产出；`ctx=1` 为**例句语境练习**（#026）子模式 |
| 英文选义 | `mode=choice` | 认义 |
| 单词对对碰 | `mode=match` | 配对 |
| 听写 | `mode=listen` | #023 |
| 例句填空 | `type` 子模式 | 见上 `ctx=1` |

**所有练法最终都走同一个 `rateWord()`**——这是 #028 「加可选第 4 参记录 mode」能一次覆盖全部入口的原因（缺省 `null` → 既有调用与断言零改动）。

会话级参数：`mode` 是当前架构中**一次会话只跑一种题型**的关键；它来自 URL，不是逐词字段。

---

## 6. 统计页与结果侧

- 统计页（`renderStats`）：四张 `.stat-card`（连续天数 / 总正确率 / 已学词数 / 错词本）+ 26 周热力图 + 近 14 天柱图 + 近 14 天有效完成率 + **#027 独立全宽卡「长期答对情况」** + 仪表盘入口卡。
- #027 是**结果侧**唯一观测，窗口 30 天、按词去重、取最近一次合格观察、未到观察期计入 `pending` 不入分母、`rate` 分母为 0 时是 `null`（不是 0）。
- `ratePct` 是四舍五入值；判 `<1%` 与 `>99%` 必须读**未取整的 `rate`**（G10 R27-F02）。
- 上限保护：999/1000 显示 `>99%`，不显示 100%。

---

## 7. 改代码前 60 秒检查

```bash
cd /e/WorkBudy_WorkSpace
node verify.mjs        # 先确认基线是 PASS
cd word365
git diff --stat        # 看改了哪些文件（是否越过 BOUNDARY）
```

改完再跑一次 `node verify.mjs`；若基线数字因新卡变化，同步更新 `verify.mjs` 的 `EXPECT` 并在卡片里写明。
