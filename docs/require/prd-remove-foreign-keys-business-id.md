# PRD: 移除数据库外键，改为业务 ID 在代码中维护关系

## 1. 背景

当前 Echoe 的 MySQL Schema 中仍存在外键约束（`FOREIGN KEY` / Drizzle `.references()`）。这与项目“数据库禁止外键、关系由业务代码维护”的约束不一致，并带来以下问题：

- 跨表删除和更新行为耦合在数据库层，业务行为不透明。
- 多租户场景下（`uid`）关系校验分散，难以统一控制。
- 导入/导出、批量修复、数据回放等场景不利于灵活处理脏数据。
- 迁移与演进成本高，表结构调整受限。

本 PRD 目标是：**完全移除数据库外键约束，统一使用业务 ID 字段 + 业务代码维护关联完整性与级联语义**。

> 本版已按最小补充信息集（MCI）补齐：范围基线、校验矩阵、读路径策略、删除编排入口、迁移幂等口径。

## 2. 目标

- 移除 Echoe 业务表中的全部外键约束。
- 在 Drizzle Schema 中移除所有 `.references()` 声明。
- 保留并强化业务 ID 字段（如 `note_id`、`card_id`、`deck_id`）与索引。
- 在 Service 层统一实现“关系存在性校验 + 删除级联/置空逻辑”。
- 采用一次性全量切换（Big Bang）方式落地，不提供旧逻辑兼容路径。
- 明确并冻结本次改造范围基线（表、字段、Service、Controller/API）。
- 明确实体关系字段在 Create/Update 场景下的校验矩阵与字段可变性。
- 明确一次性切换策略：不做历史数据迁移、回填、清洗，不做读路径兼容分支。
- 迁移后通过单测、lint、typecheck 门禁。

## 3. 非目标

- 不重构 ID 生成规则（沿用现有 `generateTypeId` 体系）。
- 不改变表主键策略（自增 `id` 继续保留）。
- 不新增数据库层外键替代机制（如触发器）。
- 不在本阶段改造 LanceDB 结构。
- 不做历史业务数据迁移、回填、清洗和校正。
- 不提供新旧行为兼容层（包括双写、双读、灰度兼容分支）。
- 不扩展到非 Echoe 业务域（如 user/tag/media）表结构改造。

## 4. 当前外键清单（需全部移除）

### 4.1 Drizzle Schema 层（8 处）

1. `echoe_notes.mid -> echoe_notetypes.note_type_id`（cascade）
2. `echoe_cards.nid -> echoe_notes.note_id`（cascade）
3. `echoe_cards.did -> echoe_decks.deck_id`（cascade）
4. `echoe_revlog.cid -> echoe_cards.card_id`（cascade）
5. `echoe_decks.conf -> echoe_deck_config.deck_config_id`（cascade）
6. `echoe_decks.mid -> echoe_notetypes.note_type_id`（set null）
7. `echoe_templates.ntid -> echoe_notetypes.note_type_id`（cascade）
8. `echoe_templates.did -> echoe_decks.deck_id`（set null）

### 4.2 SQL 迁移层

现有历史迁移中已创建对应 `FOREIGN KEY` 约束（`apps/server/drizzle/0000_massive_mariko_yashida.sql`）。本次需新增迁移脚本执行 `DROP FOREIGN KEY`，确保运行中库结构与 Schema 一致。

迁移执行要求：

- 迁移脚本需先查询 `information_schema` 动态识别目标约束名，再执行删除。
- 约束不存在时应跳过并记录日志，保证幂等。
- 同一迁移在 dev/staging/prod 重复执行不应因约束名差异失败。

### 4.3 权威范围基线（本次必须覆盖）

| 维度 | 范围基线 |
| --- | --- |
| 数据表 | `echoe_notetypes`、`echoe_notes`、`echoe_cards`、`echoe_revlog`、`echoe_decks`、`echoe_templates`、`echoe_deck_config` |
| Schema 文件 | `echoe-notes.ts`、`echoe-cards.ts`、`echoe-revlog.ts`、`echoe-decks.ts`、`echoe-templates.ts`（直接移除 `.references()`）；`echoe-notetypes.ts`、`echoe-deck-config.ts`（关系根对象校验） |
| Controller 范围 | `echoe-note.controller.ts`、`echoe-deck.controller.ts`、`echoe-study.controller.ts`、`echoe-config.controller.ts`、`echoe-import.controller.ts`、`echoe-csv-import.controller.ts`、`echoe-export.controller.ts` 中涉及关系写入/删除接口 |
| Service 范围 | `echoe-note.service.ts`、`echoe-deck.service.ts`、`echoe-study.service.ts`、`echoe-config.service.ts`、`echoe-import.service.ts`、`echoe-csv-import.service.ts`、`echoe-export.service.ts` |
| Out of Scope | 非 Echoe 业务域（`users`、`echoe_tag`、`echoe_media` 等）除非发现与本次关系链直接耦合并经评审确认 |

> 若实施中发现超出上述范围的关系点，必须先更新本 PRD 范围基线并评审通过，再进入开发。

## 5. 方案概览

### 5.1 表结构策略

- 所有关联字段继续保留为业务 ID 字符串（`varchar(191)`）。
- 删除所有外键约束，不删除关联字段本身。
- 为关联字段保留/补齐索引，确保关系校验与级联删除性能。
- 继续使用 `uid + business_id` 复合索引保障多租户查询效率。
- 结构验收以“4.3 权威范围基线”为准，不接受模糊“其他表待排查”结论。

### 5.2 关系维护策略（业务代码）

在现有 Service 内实现关系维护，不引入额外复杂实体：

- **写入前校验**：Create/Update 的关系校验遵循 `FR-2` 矩阵，必须同 `uid`。
- **字段可变性约束**：对标记为不可变的关系字段，Update 传入时直接返回 4xx 业务错误。
- **删除时补偿**：用事务显式执行级联删除或置空更新。
- **读取时处理（一次性切换）**：不提供旧逻辑兼容分支，不执行在线数据修复；读路径按新规则直接执行。

### 5.3 事务边界与删除编排入口

所有涉及跨表关系变更的操作必须放入单个数据库事务中，避免“半成功”状态。采用“**聚合根 Owner Service 单入口编排**”规则：

| 删除根对象 | Owner Service（开启事务） | 下游调用（复用同一事务） |
| --- | --- | --- |
| Note | `echoe-note.service.ts` | `Card` / `Revlog` 级联处理 |
| Deck | `echoe-deck.service.ts` | `Card` 级联删除、`Template.did` 置空 |
| Card | `echoe-study.service.ts` | `Revlog` 级联删除 |
| NoteType | `echoe-config.service.ts` | `Note`、`Template` 级联，`Deck.mid` 置空 |
| DeckConfig | `echoe-config.service.ts` | `Deck` 级联删除（再触发下游） |

执行规则：

1. Owner Service 负责关系存在性校验与事务开启。
2. 下游 Service 禁止自行开启独立事务，必须接收并复用上游事务对象。
3. 单次删除流程顺序为：先执行 `set null`，再执行叶子级联删除，最后删除根对象。
4. 任一步骤失败必须整体回滚。

### 5.4 迁移策略（约束名发现 + 幂等）

- 迁移脚本通过 `information_schema.KEY_COLUMN_USAGE` / `REFERENTIAL_CONSTRAINTS` 按“表名 + 列名 + 引用表”定位待删外键。
- 仅对实际存在的约束执行 `ALTER TABLE ... DROP FOREIGN KEY ...`。
- 迁移需输出“发现约束数 / 成功删除数 / 跳过数”结构化日志。
- 重复执行迁移不得报错（幂等）。

## 6. 功能需求

### FR-1 Schema 无外键

- `apps/server/src/db/schema/**/*.ts` 中不允许出现 `.references()`。
- 所有关联关系仅通过字段命名和索引表达。
- 验收范围以“4.3 权威范围基线”覆盖的 Schema 文件集合为准。

### FR-2 关系完整性校验（Create/Update 矩阵）

| 实体 | 关系字段 | Create 校验 | Update 校验 | 字段可变性 |
| --- | --- | --- | --- | --- |
| Card | `nid` | 必校验（同 `uid` 存在） | 不允许更新 | 不可变 |
| Card | `did` | 必校验（同 `uid` 存在） | 传入则必校验 | 可变 |
| Note | `mid` | 必校验（同 `uid` 存在） | 传入则必校验 | 可变 |
| Template | `ntid` | 必校验（同 `uid` 存在） | 必校验 | 可变 |
| Template | `did` | 传入则校验（同 `uid` 存在） | 传入则校验 | 可变（可空） |
| Deck | `conf` | 必校验（同 `uid` 存在） | 必校验 | 可变 |
| Deck | `mid` | 传入则校验（同 `uid` 存在） | 传入则校验 | 可变（可空） |
| Revlog | `cid` | 必校验（同 `uid` 存在） | 不支持更新 | 不可变 |

统一要求：

- 关系对象不存在时返回 4xx，错误信息需包含字段名与目标 ID（如 `did not found`）。
- 对不可变字段的非法更新返回 4xx（如 `nid immutable`）。
- 所有校验必须带 `uid` 条件，禁止跨租户校验通过。

### FR-3 删除语义对齐（替代原外键 onDelete）

| 原外键 | 原 onDelete | 新实现（Service 事务内） | Owner Service |
|---|---|---|---|
| notes.mid -> notetypes.note_type_id | cascade | 删除 notetype 时，删除关联 notes（并触发下游级联） | `echoe-config.service.ts` |
| cards.nid -> notes.note_id | cascade | 删除 note 时，删除关联 cards | `echoe-note.service.ts` |
| cards.did -> decks.deck_id | cascade | 删除 deck 时，删除关联 cards | `echoe-deck.service.ts` |
| revlog.cid -> cards.card_id | cascade | 删除 card 时，删除关联 revlog | `echoe-study.service.ts` |
| decks.conf -> deck_config.deck_config_id | cascade | 删除 deck_config 时，删除关联 decks（并触发下游级联） | `echoe-config.service.ts` |
| decks.mid -> notetypes.note_type_id | set null | 删除 notetype 时，将关联 decks.mid 置空 | `echoe-config.service.ts` |
| templates.ntid -> notetypes.note_type_id | cascade | 删除 notetype 时，删除关联 templates | `echoe-config.service.ts` |
| templates.did -> decks.deck_id | set null | 删除 deck 时，将关联 templates.did 置空 | `echoe-deck.service.ts` |

> 说明：若产品期望与现有 cascade 行为不同（例如改为“禁止删除”），需单独出策略变更，不在本 PRD 默认范围内。

### FR-4 多租户强约束

- 所有关系校验与级联操作必须携带 `uid` 条件。
- 禁止跨租户“误关联”或“误删除”。
- 所有删除 SQL（含级联和置空）必须在 `WHERE` 条件中显式包含 `uid`。

### FR-5 可观测性

- 关系校验失败、级联删除执行结果需输出结构化日志（使用 `@echoe/logger`）。
- 禁止使用 `console.log/error`。
- 日志字段至少包含：`event`、`uid`、`rootObject`、`targetField`、`targetId`、`affectedRows`、`result`、`durationMs`。

### FR-6 一次性切换约束

- 本需求不包含历史数据迁移、回填、清洗和校正任务。
- 本需求不提供新旧逻辑兼容分支（不做双写、双读、灰度兼容）。
- 上线时直接切换到“无外键 + 业务代码维护关系”模型。

### FR-7 迁移幂等与多环境一致性

- 迁移脚本需支持“约束名差异”场景（不同环境约束名可不同）。
- 迁移可重复执行，重复执行应成功并输出“0 条待删除”结果。
- 提供迁移前后校验 SQL，用于发布核对（`FOREIGN KEY` 计数与表结构快照）。

## 7. 实现范围

### 7.1 Schema

- `apps/server/src/db/schema/echoe-notes.ts`
- `apps/server/src/db/schema/echoe-cards.ts`
- `apps/server/src/db/schema/echoe-revlog.ts`
- `apps/server/src/db/schema/echoe-decks.ts`
- `apps/server/src/db/schema/echoe-templates.ts`
- `apps/server/src/db/schema/echoe-notetypes.ts`（关系根对象校验相关）
- `apps/server/src/db/schema/echoe-deck-config.ts`（关系根对象校验相关）

### 7.2 Service

- `echoe-note.service.ts`
- `echoe-deck.service.ts`
- `echoe-study.service.ts`
- `echoe-config.service.ts`
- `echoe-import.service.ts`
- `echoe-csv-import.service.ts`
- `echoe-export.service.ts`

### 7.3 Controller/API

- `echoe-note.controller.ts`
- `echoe-deck.controller.ts`
- `echoe-study.controller.ts`
- `echoe-config.controller.ts`
- `echoe-import.controller.ts`
- `echoe-csv-import.controller.ts`
- `echoe-export.controller.ts`

### 7.4 范围变更机制

- 不允许使用“以及其他 service”作为实施范围描述。
- 新增影响面必须先更新“4.3 权威范围基线”并评审通过。

## 8. 用户故事与验收标准

### US-1 作为后端开发者，我希望 Schema 不再包含外键

**验收标准**：

- [ ] `grep "\.references\(" apps/server/src/db/schema` 无结果。
- [ ] 迁移后数据库 `SHOW CREATE TABLE` 无 `FOREIGN KEY` 定义。
- [ ] 在“4.3 权威范围基线”覆盖表内，`information_schema` 外键计数为 0。

### US-2 作为业务开发者，我希望创建和更新时能自动校验关系

**验收标准**：

- [ ] `FR-2` 矩阵中的每个字段均有对应 Create/Update 测试。
- [ ] 不存在上游对象时，接口返回明确业务错误（4xx）。
- [ ] 错误信息包含关联字段上下文（例如 `did not found`）。
- [ ] 不可变字段更新返回 4xx（例如 `nid immutable`）。

### US-3 作为系统维护者，我希望删除行为保持可预测

**验收标准**：

- [ ] 删除 Note 会删除其 Card 与 Revlog（事务内）。
- [ ] 删除 Deck 会删除关联 Card，并将 `templates.did` 置空。
- [ ] 删除 NoteType 会删除 Notes/Templates，并将 `decks.mid` 置空。
- [ ] 任一步骤失败时整体回滚。
- [ ] 级联编排由唯一 Owner Service 执行，不存在并行多入口删除链路。

### US-4 作为多租户系统管理员，我希望关系操作不会串租户

**验收标准**：

- [ ] 所有关联查询和写操作都带 `uid` 条件。
- [ ] 回归测试覆盖跨租户错误用例（Create/Update/Delete/Read）。

### US-5 作为项目负责人，我希望本需求一次性切换完成

**验收标准**：

- [ ] 不新增历史数据迁移、回填、清洗作为上线前置任务。
- [ ] 不保留旧逻辑兼容分支（双写、双读、灰度兼容）。
- [ ] 生产发布按一次性切换执行。

### US-6 作为发布负责人，我希望迁移可重复执行且跨环境稳定

**验收标准**：

- [ ] 同一迁移重复执行不失败。
- [ ] 不同环境约束名差异不影响迁移成功。
- [ ] 发布前后校验 SQL 输出与预期一致。

## 9. 迁移与发布计划

### 9.1 开发阶段

1. 冻结“4.3 权威范围基线”，导出当前外键清单（含约束名）。
2. 移除 Drizzle Schema 中 `.references()`。
3. 生成并审查迁移 SQL，确保按动态约束名执行 `DROP FOREIGN KEY`。
4. 在 Service 层补齐 `FR-2` 关系校验矩阵与 `FR-3` 删除编排逻辑。
5. 增加关键单测（关系校验、级联删除、事务回滚、跨租户）。
6. 按一次性切换策略准备发布，不做数据迁移与兼容层改造。

### 9.2 命令建议

在 `apps/server` 目录执行：

1. `pnpm build`
2. `pnpm migrate:generate`
3. `pnpm migrate`
4. `pnpm test`
5. `pnpm lint`
6. `pnpm typecheck`

### 9.3 发布校验

- 发布前：记录目标表 `SHOW CREATE TABLE` 与 `information_schema` 外键统计，确认无兼容分支发布项。
- 发布后：重复执行外键统计校验，确认范围内外键为 0，并抽样验证核心增删改链路。
- 本次发布采用一次性切换，不设置灰度兼容阶段。

## 10. 风险与应对

- **风险 1：范围漂移导致漏改关系点**
  - 应对：以“4.3 权威范围基线”为唯一工作清单，变更需评审。
- **风险 2：漏实现某条级联语义**
  - 应对：按“FR-3 映射表”逐条对照测试。
- **风险 3：删除链路性能下降**
  - 应对：补齐索引，必要时分批删除并监控耗时。
- **风险 4：事务覆盖不完整**
  - 应对：Owner Service 单入口编排，单测覆盖失败回滚。
- **风险 5：历史脏数据在切换后触发业务错误**
  - 应对：本需求不做数据迁移与兼容处理，发现问题按缺陷流程单独治理，不阻塞本次上线。
- **风险 6：迁移因环境约束名差异失败**
  - 应对：迁移采用动态发现 + 幂等执行策略。

## 11. 里程碑与完成定义

### M0: 范围基线冻结

- “4.3 权威范围基线”评审通过
- 当前外键清单（含约束名）归档完成

### M1: Schema 与迁移完成

- `.references()` 清零
- 数据库外键清零
- 迁移可重复执行（幂等）

### M2: Service 关系维护完成

- `FR-2` 写入/更新校验矩阵完成
- `FR-3` 删除级联/置空语义完成
- Owner Service 单入口事务编排完成

### M3: 质量门禁通过

- 单测通过
- lint 通过
- typecheck 通过
- 跨租户回归通过

**DoD（Definition of Done）**：

- 代码与数据库中均不再存在外键约束。
- 关系完整性由业务代码稳定维护且具备明确编排边界。
- 核心链路行为与预期一致并具备回归测试保障。
- 迁移跨环境稳定、可重复执行；本次交付不包含数据迁移与兼容层。
