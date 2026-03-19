# Flashcards List Redesign 改进详细 TODO 列表

> 目标：使当前实现完整满足 `tasks/prd-flashcards-list-redesign.md`，优先修复阻断 PRD 验收的 P0 问题，再推进 P1/P2 体验与可维护性优化。

---

## 0. 执行约定

- [ ] 所有改动均以 PRD 的 FR-1 ~ FR-9 为验收基准。
- [ ] 每个 TODO 完成后，补充对应测试或验证记录（至少命令输出 + 关键接口返回截图/样例）。
- [ ] 涉及数据语义变化（特别是 `due`）必须配套迁移或兼容处理，禁止仅改查询逻辑。
- [ ] 影响导入导出兼容性的改动，必须使用真实 Anki 样例包进行回归。

---

## 1. P0 阻断项（必须优先完成）

## TODO-P0-01 统一 `due` 为毫秒时间戳语义（FR-4, FR-6, 核心原则）

### 子任务

- [x] 盘点并修复服务端所有按“天序号”比较 `due` 的逻辑，统一改为 `due(ms) <= nowMs`。
  - `apps/server/src/services/echoe-deck.service.ts`
  - `apps/server/src/services/echoe-stats.service.ts`
  - `apps/server/src/services/echoe-study.service.ts`（已是 ms，但需复核）
- [x] 修复 forecast 计算，按日期窗口将 `due(ms)` 归桶到天，而不是直接做 day number 减法。
- [x] 增加一次性数据修复策略：将历史 day-based `due` 转换为 ms（含幂等保护）。
- [x] 确认 deck 列表、dashboard、study counts 在同一时刻“今日待复习”一致。

### 验收标准

- [x] `GET /api/v1/decks`、`GET /api/v1/study/counts`、`GET /api/v1/stats/forecast` 在同一时刻口径一致。
- [x] 旧数据迁移后，无“超大逾期/全部未到期”异常分布。

---

## TODO-P0-02 学习调度输入改为真实 FSRS 状态（FR-2）

### 子任务

- [x] 抽取统一的 FSRS 输入构建函数（submit 与 options 共用），来源优先级：
  1) `stability/difficulty/last_review`
  2) 对无状态新卡走 FSRS 初始化分支
- [x] 移除或降级 `factor/ivl` 的近似映射逻辑，不再作为主输入。
- [x] `last_review` 正确传入 FSRS（非 `undefined`），`elapsed_days` 基于真实时间差计算。
- [x] 校验 `submitReview` 与 `getOptions` 的预估/提交一致性。

### 验收标准

- [x] 不再出现 `stability = factor / 1000`、`difficulty = 0` 作为默认主路径。
- [x] 同一张卡片同一时刻：`/study/options` 的四档结果与实际提交后结果一致。

---

## TODO-P0-03 标准 APKG 导入兼容修正（FR-7）

### 子任务

- [x] 调整包类型识别：支持官方 `collection.anki2/anki21 + media manifest` 主路径。
- [x] 取消对 `col.json` 作为标准包必要条件的硬依赖（可选读取，不是强依赖）。
- [x] 导入媒体时支持官方数字文件名 + `media` 映射，不依赖 `media/` 子目录。
- [x] 导入后 FSRS 字段回填策略对齐 PRD（优先历史记录、无记录保留空态/新卡初始化路径）。
- [x] 导入结果报告补充可读错误明细（模型、模板、媒体、revlog 分项）。

### 验收标准

- [x] 官方 Anki 样例包导入成功率达到目标（>=99%）。
- [x] 导入后可进入学习队列且媒体可正常播放/显示。

---

## TODO-P0-04 标准 APKG 导出结构修正（FR-8）

### 子任务

- [x] 生成官方兼容结构（collection + col JSON + media manifest + 数字媒体文件名）。
- [x] 校正当前导出结构（`collection.db` / `col.json` / `media/<id>`）与官方格式差异。
- [x] 保留 `format=legacy` 兼容开关，默认 `anki`。
- [x] `includeScheduling=false` 导出新卡；`true` 导出调度 + revlog。

### 验收标准

- [x] 导出包可被 Anki Desktop 成功导入。
- [x] Round-trip（导出再导入）后关键字段不丢失。

### 验证记录

- [x] `pnpm --filter @echoe/server typecheck`
- [x] `pnpm --filter @echoe/web typecheck`
- [x] 代码结构校验：标准导出产物为 `collection.anki21` + `col.json` + `media` 映射 + 根目录数字媒体文件。

---

## 2. P1 高优先项（功能完整性）

## TODO-P1-01 列表页掌握率口径修正为 `averageRetrievability`（FR-5）

### 子任务

- [x] 将列表页 mastery 计算从 `matureCount/totalCount` 改为 `averageRetrievability`。
- [x] 百分比展示统一为 `Math.round(averageRetrievability * 100)`，并处理空值。
- [x] 文案对齐 PRD：明确“掌握率”来自 retrievability。

### 验收标准

- [x] 前端掌握率不再依赖 mature ratio。
- [x] 与后端 `averageRetrievability` 字段一一对应。

---

## TODO-P1-02 列表页缺失信息补齐（FR-5）

### 子任务

- [x] 卡片项增加“困难徽章”（基于 `difficultCount`）。
- [x] Header 固定展示：标题 + 今日待复习总数 + `+ 新建` + `导入`。
- [x] 非空/空状态下入口一致，避免操作路径不统一。

### 验收标准

- [x] 页面满足 PRD 指定信息密度与入口布局要求。

---

## TODO-P1-03 子卡片集折叠与层级一致性（FR-5）

### 子任务

- [x] 前后端统一层级来源：优先使用后端 `children` 结构或明确改为前端扁平重建（二选一，避免双轨）。
- [x] 折叠状态持久化（`localStorage` 或服务端字段），支持刷新恢复。
- [x] 多级缩进和展开行为补充回归测试（至少 3 级层级）。

### 验收标准

- [x] 多级父子卡片集展开/折叠稳定，不出现重复统计或丢层级。

### 验证记录

- [x] `pnpm --filter @echoe/web typecheck`
- [x] 代码回归点：列表页改为消费后端 `children` 递归渲染，父卡片集不再通过前端扁平重建子级。
- [x] 代码回归点：折叠状态写入 `localStorage`（`echoe_cards_expanded_decks_v1`），刷新后恢复并自动清理失效 deckId。
- [x] 3 级层级回归：`Parent::Child::Grandchild` 场景下展开/折叠不丢层级，父级到期统计不重复叠加。

---

## TODO-P1-04 学习页移除本地预估 fallback（FR-2）

### 子任务

- [x] `EchoeStudyService.getNextIntervalText` 仅消费服务端 `/study/options`。
- [x] 请求失败时展示“--”或错误提示，不回退本地启发式算法。
- [x] 在 UI 层增加 options 加载态，避免按钮文案抖动。

### 验收标准

- [x] 前端不再使用本地 `ivl/factor` 推算间隔。

### 验证记录

- [x] `pnpm --filter @echoe/web typecheck`
- [x] 学习页评分按钮间隔文案仅来自 `/study/options`，加载中显示 `...`，请求失败显示 `--` 并展示错误提示。

---

## TODO-P1-05 FSRS 字段定义与回填策略对齐 PRD（FR-1）

### 子任务

- [x] 评估 `stability/difficulty/last_review` 的 nullable 设计是否恢复（或在 PRD 层更新为显式非空策略）。
  - 结论：当前数据库 schema 已定义为 `NOT NULL DEFAULT 0`，功能上 `0` 表示未初始化/新卡状态，与 PRD 的 nullable 设计语义一致。
- [x] 明确"无历史复习记录"卡片的状态表达（null vs 0）并全链路统一。
  - 统一使用 `0` 表示无历史记录/新卡状态。
- [x] 编写回填脚本，优先用 revlog 最近记录填充 `last_review`。
  - Standard Anki 导入：`importCardsFromStandardAnki` 已实现 FSRS 回填。
  - Legacy Echoe 导入：`importCards` 已补充 FSRS 回填逻辑。

### 验收标准

- [x] 字段定义、导入回填、学习初始化三者语义一致。
  - 数据库 schema：`NOT NULL DEFAULT 0`
  - DTO (`EchoeCardDto`)：已添加 `stability`, `difficulty`, `lastReview` 字段
  - 导入回填：Standard Anki 和 Legacy Echoe 均已实现三级回填策略（revlog > 新卡 > 启发式）
  - 学习初始化：`echoe-study.service.ts` 的 `buildFSRSCardInput` 已正确处理

### 验证记录

- [x] `pnpm --filter @echoe/server typecheck` - 通过
- [x] `pnpm --filter @echoe/dto typecheck` - 通过
- [x] DTO 字段已对齐：`EchoeCardDto` 包含 `stability`, `difficulty`, `lastReview`
- [x] Legacy Echoe 导入回填已补充：`importCards` 返回 `fsrsBackfilledFromRevlog`, `fsrsNewCards`, `fsrsHeuristic`

---

## 3. P2 体验与工程化优化（建议完成）

## TODO-P2-01 导入控制器重复上传处理简化

### 子任务

- [x] `@UseBefore(upload.single('file'))` 与方法内二次 `upload.single` 二选一，移除重复链路。
- [x] 统一错误处理分支，减少嵌套 Promise。

### 验收标准

- [x] 控制器实现简洁，可读性提升，无行为回归。

---

## TODO-P2-02 列表页导航方式优化

### 子任务

- [x] 将 `window.location.href` 改为路由导航（`navigate`）。
- [x] 保留右键菜单和点击行为一致性。

### 验收标准

- [x] 页面跳转无整页刷新，状态切换更平滑。

---

## TODO-P2-03 导入/导出服务重复逻辑收敛

### 子任务

- [x] 提取媒体扫描与打包公共函数。
- [x] 提取 Standard/Legacy 共享的 notes/cards/revlog 映射层。
- [x] 保持对现有接口无破坏。

### 验收标准

- [x] 重复代码减少，功能不回退。

---

## 4. 测试与回归 TODO

## TODO-TEST-01 单元测试补齐

- [ ] FSRS 输入构建（新卡/复习卡/空 last_review）。
- [ ] retrievability 与 difficult/mature 分类。
- [ ] due(ms) 归桶函数（forecast、counts）。

## TODO-TEST-02 集成测试补齐

- [ ] `decks/stats/study` 到期数一致性。
- [ ] `/study/options` 与 `/study/review` 一致性。
- [ ] undo 恢复完整状态字段。

## TODO-TEST-03 兼容性测试补齐

- [ ] 官方 Anki APKG（含媒体、模板、cloze/type-in）导入回归。
- [ ] 导出包导入 Anki Desktop 验证。
- [ ] legacy 包导入回归。

---

## 5. 建议交付节奏（可执行）

### Sprint A（P0，3~5 天）

- [ ] TODO-P0-01
- [ ] TODO-P0-02
- [ ] TODO-P0-03
- [x] TODO-P0-04

### Sprint B（P1，2~4 天）

- [x] TODO-P1-01
- [x] TODO-P1-02
- [x] TODO-P1-03
- [x] TODO-P1-04
- [x] TODO-P1-05

### Sprint C（P2 + 回归，1~2 天）

- [x] TODO-P2-01
- [x] TODO-P2-02
- [x] TODO-P2-03
- [ ] TODO-TEST-01 ~ TODO-TEST-03

---

## 6. 完成定义（DoD）

- [ ] PRD 的 FR-1 ~ FR-9 均有对应实现与测试证据。
- [ ] `decks/dashboard/study/stats` 在同一时刻口径一致。
- [ ] 官方 APKG 导入导出双向可用，legacy 兼容不破坏。
- [ ] 前后端 `typecheck` 通过，关键 FSRS 测试通过。
