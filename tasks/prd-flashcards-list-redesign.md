# PRD: Flashcards 列表与学习流程 FSRS 全链路改造

## Introduction

本 PRD 聚焦两个核心目标：

1. 重构 Flashcards 卡片集列表页面 /cards，提供更强的信息密度与可操作性。
2. 将学习调度、统计口径、导入导出链路统一到 FSRS 主口径，并保证 Anki 兼容。

当前代码已经接入 `ts-fsrs`，但仍存在“调度用 FSRS、数据与统计仍沿用 Anki 字段语义”的混合状态，导致学习结果、到期统计、卡片掌握率和导入导出的一致性问题。

---

## 当前代码审查结论（As-Is）

### 1) 学习流程：仅“部分使用 FSRS”，不是全链路

- 服务端已引入 `ts-fsrs` 与 `FSRSService`，但 `echoe-study.service.ts` 构造 FSRS 输入时仍使用：
  - `stability = factor / 1000`
  - `difficulty = 0`
  - `elapsed_days = ivl`
  - `last_review = undefined`
- `echoe_cards` 表暂无 `stability / difficulty / last_review` 字段，FSRS 核心状态无法持久化。
- 前端学习页评分按钮下方的“预计间隔”是本地启发式计算，不是服务端 FSRS 实算结果。
- Undo 恢复逻辑基于 `lastIvl` 推算 `due`，无法准确恢复到复习前状态。

**结论：** 当前学习流程不是 FSRS 全链路，属于“FSRS 调度函数 + Anki 字段近似映射”的过渡实现。

### 2) 统计口径：仍以 Anki 风格字段为主

- Deck 列表 DTO 仅有 `newCount/learnCount/reviewCount`，缺少 FSRS 指标（`averageRetrievability/matureCount/difficultCount/lastStudiedAt`）。
- 多处统计逻辑使用 `ivl` 分桶（如 mature/young/new），未使用 FSRS `stability` 与 retrievability。
- `due` 时间语义在不同模块中存在“天序号 vs 毫秒时间戳”混用，导致到期数与预测口径不一致风险。

**结论：** 统计仍偏 Anki 口径，未形成“FSRS 主口径”的统一事实来源。

### 3) Anki 导入导出：具备基础链路，但标准兼容性不足

- 后端已具备 `.apkg` 导入/导出接口（`/api/v1/import/apkg`, `/api/v1/export/apkg`）。
- 导入器当前读取 `notetypes/decks/templates` 等自定义表结构；对官方 Anki `col` 表 JSON（`models/decks/dconf`）支持不足。
- 导出器当前生成的是 Echoe 自定义结构（含独立 `decks/notetypes/templates` 表），不是标准 Anki collection 组织方式。
- 媒体文件当前使用 `media/<filename>` 方式打包，未按标准 Anki media manifest（`media` 映射文件 + 数字文件名）输出。
- 前端无 APKG 导入页面入口；卡片页按钮显示 `Import .apkg`，实际跳转到 CSV 导入页。

**结论：** 当前链路更接近“Echoe 自定义 APKG 备份格式”，与“官方 Anki 双向兼容”存在实质差距。

---

## Goals

- 学习调度全链路使用 FSRS（`ts-fsrs`），并持久化 FSRS 核心状态。
- 所有学习统计与列表指标以 FSRS 口径为准，不再以 Anki `ivl/factor` 推导替代。
- 保留 Anki 兼容字段（`ivl/factor/flds/sfld/csum`）用于导入导出与互通，但定位为兼容层。
- 完成 Flashcards 列表页面重构（网格化、搜索、排序、层级、FSRS 指标展示）。
- 导入导出支持“官方 Anki 标准模式”，并兼容现有 Echoe 旧包格式。

## Success Metrics

- 100% 学习调度请求走 FSRS 计算（含评分预览、正式提交、重学）。
- 100% 已学习卡片具备 FSRS 状态字段（`stability/difficulty/last_review`）。
- 列表/统计接口中 FSRS 指标可用率 100%。
- 使用真实 Anki 样例包导入成功率 >= 99%，导出包可被 Anki Desktop 导入。
- Deck 列表与 Dashboard 的“到期数”在同一时刻口径一致。

---

## Scope

### In Scope

- 服务端：学习调度、统计查询、deck 聚合、导入导出兼容。
- 数据库：`echoe_cards` 增补 FSRS 字段及回填迁移。
- 前端：卡片列表页重构、学习页评分预估改造、导入入口修复。
- DTO：新增 FSRS 统计字段与学习预估字段。

### Out of Scope

- 不做 AnkiWeb 同步协议实现。
- 不做移动端专项交互重构。
- 不引入新的学习算法（仅 FSRS）。

---

## 核心设计原则

- **FSRS 单一事实源**：调度与统计均以 FSRS 状态计算。
- **Anki 兼容层隔离**：Anki 字段用于互通，不作为业务主口径。
- **时间语义统一**：`due` 统一为毫秒时间戳语义（服务端内一致）。
- **父子卡片集可聚合**：所有 deck 统计支持递归汇总。
- **平滑迁移**：旧数据可回填，兼容存量学习记录。

---

## Functional Requirements

### FR-1: 数据模型扩展（FSRS 持久化）

在 `echoe_cards` 新增字段：

- `stability` (DOUBLE, nullable)
- `difficulty` (DOUBLE, nullable)
- `last_review` (BIGINT, nullable, ms)

并补充索引：

- `(did, queue, due)`
- `(did, last_review)`
- `(did, stability)`

#### 回填规则

- `last_review`：优先取 `echoe_revlog` 最近一次该卡复习时间；无记录则 null。
- `stability/difficulty`：
  - 有历史复习记录：采用“FSRS 友好优先”回填策略（优先启发式映射；当映射质量不足时回退固定中性值），并在首次复习后由 FSRS 进一步纠偏。
  - 无历史复习记录：保持 null，首次调度由 FSRS 初始化。

### FR-2: 学习调度全链路 FSRS 化

- `submitReview` 必须基于真实 FSRS 卡片状态计算：
  - `elapsed_days = (now - last_review) / dayMs`（无 last_review 时按新卡处理）
  - 不再使用 `elapsed_days = ivl`。
- 每次评分后持久化：`stability/difficulty/last_review/due/queue/type/ivl/factor`。
- 新增“评分预估”接口（服务端 FSRS 实算）：
  - 返回 Again/Hard/Good/Easy 四档下一次间隔与到期时间。
- 前端学习页评分按钮下方文案必须使用服务端预估结果，移除本地启发式算法。

### FR-3: Undo 正确性

- Undo 需恢复“复习前完整状态”，至少包含：
  - `due/ivl/factor/reps/lapses/left/type/queue/stability/difficulty/last_review`
- 需要补充持久化快照（可放 revlog 扩展列或单独快照表），禁止通过 `lastIvl` 反推 `due`。

### FR-4: Deck 列表 API 改造（FSRS 口径）

`EchoeDeckWithCountsDto` 新增：

- `totalCount`
- `matureCount`（`stability >= 21`）
- `difficultCount`（`retrievability < 0.9`）
- `averageRetrievability`
- `lastStudiedAt`

并要求：

- 支持父 deck 递归汇总子 deck 的所有统计。
- 到期数统一按毫秒时间戳判断。
- 支持排序：到期数、名称、最近学习时间。
- “今日待复习”口径固定为 `new + learn + review`（明确包含 new 卡）。

### FR-5: Flashcards 列表页面重构

- 布局：
  - 小屏 1 列、中屏 2 列、大屏 4 列网格。
- Header：
  - 标题、今日待复习总数（包含 new 卡）、`+ 新建`、`导入`。
- 卡片信息：
  - 名称、总卡片数、新/学/复徽章、困难徽章、掌握率进度条、最近学习时间。
- 掌握率展示：
  - 使用 `averageRetrievability`（0~1 映射为百分比）。
- 子卡片集：
  - 支持展开/折叠、多级缩进、折叠状态持久化。

### FR-6: 统计服务 FSRS 口径化

- `getMaturity` 与 `getMaturityBatch` 改为基于 `stability`。
- 新增 retrievability 分布统计（可用于未来图表）。
- `forecast` 使用统一 `due(ms)` 语义，保证与学习队列一致。
- 保留兼容字段的同时，FSRS 指标为默认展示与计算口径。

### FR-7: Anki 导入兼容（双格式）

导入支持两类包：

1. **Standard Anki 包**：官方 `collection.anki2/anki21` + `media` 映射清单。
2. **Echoe Legacy 包**：现有自定义结构。

要求：

- 自动识别包类型。
- Standard 包读取 `col` JSON 中 `models/decks/dconf`，不依赖自定义 `notetypes/decks` 表。
- 解析 media manifest，将数字文件名映射为真实媒体名。
- 导入后正确补齐/回填 FSRS 字段。

### FR-8: Anki 导出兼容（标准模式）

- 默认导出为 Standard Anki 兼容包：
  - 标准表结构 + `col` JSON
  - `media` 映射清单
  - 数字文件名媒体实体
- `includeScheduling=false`：导出为新卡。
- `includeScheduling=true`：导出当前调度与 revlog。
- 如需保留旧格式，增加显式参数 `format=legacy`，默认不使用旧格式。

### FR-9: 前端导入导出入口一致性

- 新增 APKG 导入页面与 API 封装（`/api/v1/import/apkg`）。
- 修复卡片页 `Import .apkg` 按钮错误跳转（当前跳到 CSV 导入）。
- CSV 导入与 APKG 导入分开入口，避免误导。

---

## FSRS 口径定义

### Retrievability

`R(t, S) = (1 + t / (9S))^(-1)`

- `t`: 距离上次复习的天数（由 `last_review` 与当前时间计算）
- `S`: `stability`

### Mature Card

- `stability >= 21`

### Difficult Card

- `retrievability < 0.9`

### Deck Mastery

- `averageRetrievability = mean(R_i)`

---

## API & DTO 变更

### DTO

- `EchoeDeckWithCountsDto` 新增：
  - `totalCount`
  - `matureCount`
  - `difficultCount`
  - `averageRetrievability`
  - `lastStudiedAt`

- 学习相关 DTO 新增：
  - `StudyQueueItemDto.previewOptions`（可选）
  - 或新增 `/study/options` 响应 DTO

### API

- `GET /api/v1/decks`：返回 FSRS 扩展统计字段。
- `GET /api/v1/study/options?cardId=...`：返回四档 FSRS 预估。
- `POST /api/v1/import/apkg`：支持标准与 legacy 双模式识别。
- `GET /api/v1/export/apkg`：新增 `format` 参数（默认 `anki`）。

---

## User Stories

### US-001: FSRS 全链路调度

**Description:** 作为学习者，我希望卡片的到期与间隔完全由 FSRS 决定，确保记忆调度科学且稳定。

**Acceptance Criteria:**
- [ ] 复习提交时不再使用 `elapsed_days = ivl`
- [ ] `stability/difficulty/last_review` 写入并可持续更新
- [ ] 评分预估与实际提交结果一致

### US-002: FSRS 统计口径一致

**Description:** 作为用户，我希望列表、统计页、学习页的到期数和掌握率使用同一口径。

**Acceptance Criteria:**
- [ ] Deck 列表、Dashboard、Study counts 在同一时刻数值一致
- [ ] 掌握率基于 retrievability，而不是 ivl/factor 替代

### US-003: 卡片集列表增强

**Description:** 作为用户，我希望在列表中直接看到卡片集学习质量与优先级。

**Acceptance Criteria:**
- [ ] 网格布局 + 搜索 + 排序 + 层级折叠
- [ ] 显示成熟/困难/掌握率/最近学习
- [ ] 父卡片集展示子集汇总数据

### US-004: Anki 导入可用

**Description:** 作为 Anki 用户，我希望能直接导入官方 APKG 包继续学习。

**Acceptance Criteria:**
- [ ] 支持官方 APKG（含 media manifest）
- [ ] 导入后媒体、模板、卡片、复习记录可用
- [ ] 导入结果报告含错误明细

### US-005: Anki 导出可回流

**Description:** 作为用户，我希望导出的 APKG 可被官方 Anki Desktop 打开。

**Acceptance Criteria:**
- [ ] 生成标准 APKG 结构
- [ ] 媒体完整可播放/显示
- [ ] 抽样在 Anki Desktop 导入验证通过

---

## Migration Plan

### Phase 1: Schema & Backfill

- 新增 `stability/difficulty/last_review` 字段。
- 编写回填脚本并记录回填统计。

### Phase 2: Study Core

- 重写 FSRS 输入构建与提交持久化。
- 增加评分预估 API。
- 修复 Undo 快照恢复。

### Phase 3: Stats & Deck API

- 改造 deck 聚合与统计服务为 FSRS 口径。
- 更新 DTO 与前端消费。

### Phase 4: UI 重构

- 完成列表页面设计改造。
- 学习页接入服务端预估间隔。

### Phase 5: Anki Compatibility

- 导入支持标准/legacy 双格式。
- 导出默认标准格式。
- 完成真实样例回归测试。

---

## Test Plan

### Unit Tests

- FSRS 输入转换（含空 `last_review`、新卡、复习卡）。
- Retrievability 与成熟/困难分类。
- Deck 递归聚合正确性。

### Integration Tests

- 学习提交后字段落库正确。
- `decks/stats/study` 三端到期数一致。
- Undo 恢复完整状态。

### Compatibility Tests

- 导入官方 Anki APKG（含媒体、模板、cloze/type）。
- 导出包导入官方 Anki Desktop 验证。
- Echoe legacy 包导入回归。

### E2E Tests

- 列表搜索/排序/折叠。
- 学习页评分预估与提交一致。
- APKG 导入入口与流程可达。

---

## Risks & Mitigations

- **风险：旧数据回填精度不足**
  - 缓解：首次复习后以 FSRS 新状态覆盖，回填仅做初始值。

- **风险：标准 APKG 兼容细节复杂（媒体与 col JSON）**
  - 缓解：引入标准样例包测试集与 round-trip 自动化测试。

- **风险：due 单位切换导致历史逻辑回归**
  - 缓解：统一封装 due 计算函数，增加跨模块一致性测试。

---

## Non-Goals

- 不实现 AnkiWeb 云同步。
- 不重写整套卡片编辑器与模板引擎。
- 不引入 FSRS 以外的调度算法。

---

## 决策记录（原 Open Questions 已解答）

- [x] 导出默认直接切到标准 Anki 格式；保留 `format=legacy` 作为显式兼容开关。
- [x] 旧数据回填 `difficulty` 采用“FSRS 友好优先”策略：优先启发式映射，映射质量不足时回退固定中性值。
- [x] 列表中的“今日待复习”明确包含 new 卡（口径为 `new + learn + review`）。
