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

- 移除范围内业务表中的全部外键约束（含 Echoe 业务域与纳入清单的非 Echoe 业务域）。
- 在 Drizzle Schema 中移除所有 `.references()` 声明。
- 保留并强化业务 ID 字段（如 `note_id`、`card_id`、`deck_id`）与索引。
- 在 Service 层统一实现“关系存在性校验 + 软删除级联/置空逻辑”。
- 统一删除语义：删除=软删除。范围内业务表新增 `delete_at` 列，默认值 `0` 代表未删除，删除后置为当前时间戳。
- 本次改动范围内所有查询语句默认增加 `delete_at = 0` 过滤，禁止返回已软删除数据（除显式审计/回收站场景）。
- 采用一次性全量切换（Big Bang）方式落地，不提供旧逻辑兼容路径。
- 明确并冻结本次改造范围基线（表、字段、Service、Controller/API）。
- 明确实体关系字段在 Create/Update 场景下的校验矩阵与字段可变性（Update 未传字段不校验）。
- 明确一次性切换策略：不做历史数据迁移、回填、清洗，不做读路径兼容分支。
- 迁移后通过单测、lint、typecheck 门禁。

## 3. 非目标

- 不重构 ID 生成规则（沿用现有 `generateTypeId` 体系）。
- 不改变表主键策略（自增 `id` 继续保留）。
- 不新增数据库层外键替代机制（如触发器）。
- 不在本阶段改造 LanceDB 结构。
- 不做历史业务数据迁移、回填、清洗和校正。
- 不提供新旧行为兼容层（包括双写、双读、灰度兼容分支）。
- 不对非 Echoe 业务域做功能重构；仅在存在外键关系且纳入范围时执行“去外键 + 软删除字段标准化”。

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
| 数据表 | Echoe 核心表：`echoe_notetypes`、`echoe_notes`、`echoe_cards`、`echoe_revlog`、`echoe_decks`、`echoe_templates`、`echoe_deck_config`；以及 `apps/server/src/db/schema/` 下其余存在外键约束并在 M0 冻结清单中的非 Echoe 业务表 |
| Schema 文件 | Echoe 范围：`echoe-notes.ts`、`echoe-cards.ts`、`echoe-revlog.ts`、`echoe-decks.ts`、`echoe-templates.ts`、`echoe-notetypes.ts`、`echoe-deck-config.ts`；非 Echoe 范围：`apps/server/src/db/schema/` 中存在 `.references()` 且在 M0 冻结清单内的文件 |
| Controller 范围 | `echoe-note.controller.ts`、`echoe-deck.controller.ts`、`echoe-study.controller.ts`、`echoe-config.controller.ts`、`echoe-import.controller.ts`、`echoe-csv-import.controller.ts`、`echoe-export.controller.ts`，以及 M0 冻结清单中非 Echoe 域涉及关系写入/删除的 Controller |
| Service 范围 | `echoe-note.service.ts`、`echoe-deck.service.ts`、`echoe-study.service.ts`、`echoe-config.service.ts`、`echoe-import.service.ts`、`echoe-csv-import.service.ts`、`echoe-export.service.ts`，以及 M0 冻结清单中非 Echoe 域 Owner Service |
| Out of Scope | 无外键关系且无关系写入/删除语义的表与接口；第三方集成域表结构 |

> 若实施中发现超出上述范围的关系点，必须先更新本 PRD 范围基线并评审通过，再进入开发。

## 5. 方案概览

### 5.1 表结构策略

- 所有关联字段继续保留为业务 ID 字符串（`varchar(191)`）。
- 删除所有外键约束，不删除关联字段本身。
- 范围内所有可删除业务表新增 `delete_at`（`bigint not null default 0`），`0` 表示未删除。
- 业务删除统一改为软删除：更新 `delete_at` 为当前时间戳，不执行物理 `DELETE`。
- 为关联字段保留/补齐索引，确保关系校验与级联软删除性能。
- 高频查询表补充 `uid + delete_at`（或 `uid + business_id + delete_at`）复合索引保障多租户读性能。
- 结构验收以“4.3 权威范围基线”为准，不接受模糊“其他表待排查”结论。

### 5.2 关系维护策略（业务代码）

在现有 Service 内实现关系维护，不引入额外复杂实体：

- **写入前校验**：Create/Update 的关系校验遵循 `FR-2` 矩阵，必须同 `uid`。
- **字段可变性约束**：对标记为不可变的关系字段，Update 传入时直接返回 4xx 业务错误。
- **Update 校验口径**：除必要 `uid` 权限约束外，仅校验请求中显式传入的关系字段；未传字段不校验。
- **删除时补偿**：用事务显式执行级联软删除或置空更新。
- **读取时处理（一次性切换）**：不提供旧逻辑兼容分支，不执行在线数据修复；范围内所有查询语句（列表/详情/关联查询）默认按 `delete_at = 0` 执行。

### 5.3 事务边界与删除编排入口

所有涉及跨表关系变更的操作必须放入单个数据库事务中，避免“半成功”状态。采用“**聚合根 Owner Service 单入口编排**”规则：

| 删除根对象 | Owner Service（开启事务） | 下游调用（复用同一事务） |
| --- | --- | --- |
| Note | `echoe-note.service.ts` | `Card` / `Revlog` 级联软删除处理 |
| Deck | `echoe-deck.service.ts` | `Card` 级联软删除、`Template.did` 置空 |
| Card | `echoe-study.service.ts` | `Revlog` 级联软删除 |
| NoteType | `echoe-config.service.ts` | `Note`、`Template` 级联软删除，`Deck.mid` 置空 |
| DeckConfig | `echoe-config.service.ts` | `Deck` 级联软删除（再触发下游） |

执行规则：

1. Owner Service 负责关系存在性校验与事务开启。
2. 下游 Service 禁止自行开启独立事务，必须接收并复用上游事务对象。
3. 单次删除流程顺序为：先执行 `set null`，再执行叶子级联软删除，最后软删除根对象（更新 `delete_at`）。
4. 所有软删除 SQL 必须带 `uid` 和 `delete_at = 0` 条件，避免跨租户误删与重复更新。
5. 任一步骤失败必须整体回滚。

### 5.4 迁移策略（约束名发现 + 幂等）

- 迁移脚本通过 `information_schema.KEY_COLUMN_USAGE` / `REFERENTIAL_CONSTRAINTS` 按“表名 + 列名 + 引用表”定位待删外键。
- 迁移顺序固定为：先补齐 `delete_at` 列，再执行 `DROP FOREIGN KEY`，最后补充必要索引。
- 仅对实际存在的约束执行 `ALTER TABLE ... DROP FOREIGN KEY ...`。
- 迁移需输出“发现约束数 / 成功删除数 / 跳过数 / 新增 delete_at 列数”结构化日志。
- 重复执行迁移不得报错（幂等）。
- 单表迁移失败时立即停止后续步骤，修复后重跑同一迁移（向前修复，不回滚已成功步骤）。

## 6. 功能需求

### FR-1 Schema 无外键

- `apps/server/src/db/schema/**/*.ts` 中不允许出现 `.references()`。
- 所有关联关系仅通过字段命名和索引表达。
- 验收范围以“4.3 权威范围基线”覆盖的 Schema 文件集合为准。

### FR-2 关系完整性校验（Create/Update 矩阵）

| 实体 | 关系字段 | Create 校验 | Update 校验 | 字段可变性 |
| --- | --- | --- | --- | --- |
| Card | `nid` | 必校验（同 `uid` 存在） | 不允许更新（传入即报错） | 不可变 |
| Card | `did` | 必校验（同 `uid` 存在） | 传入则必校验，未传不校验 | 可变 |
| Note | `mid` | 必校验（同 `uid` 存在） | 传入则必校验，未传不校验 | 可变 |
| Template | `ntid` | 必校验（同 `uid` 存在） | 传入则必校验，未传不校验 | 可变 |
| Template | `did` | 传入则校验（同 `uid` 存在） | 传入则校验，未传不校验 | 可变（可空） |
| Deck | `conf` | 必校验（同 `uid` 存在） | 传入则必校验，未传不校验 | 可变 |
| Deck | `mid` | 传入则校验（同 `uid` 存在） | 传入则校验，未传不校验 | 可变（可空） |
| Revlog | `cid` | 必校验（同 `uid` 存在） | 不支持更新（传入即报错） | 不可变 |

统一要求：

- 关系对象不存在时返回 4xx，错误信息需包含字段名与目标 ID（如 `did not found`）。
- 对不可变字段的非法更新返回 4xx（如 `nid immutable`）。
- 除必要 `uid` 权限约束外，Update 仅校验请求中显式传入字段；未传字段不校验。
- 所有校验必须带 `uid` 条件，禁止跨租户校验通过。

### FR-3 软删除语义对齐（替代原外键 onDelete）

| 原外键 | 原 onDelete | 新实现（Service 事务内） | Owner Service |
|---|---|---|---|
| notes.mid -> notetypes.note_type_id | cascade | 软删除 notetype 时，软删除关联 notes（并触发下游软删除） | `echoe-config.service.ts` |
| cards.nid -> notes.note_id | cascade | 软删除 note 时，软删除关联 cards | `echoe-note.service.ts` |
| cards.did -> decks.deck_id | cascade | 软删除 deck 时，软删除关联 cards | `echoe-deck.service.ts` |
| revlog.cid -> cards.card_id | cascade | 软删除 card 时，软删除关联 revlog | `echoe-study.service.ts` |
| decks.conf -> deck_config.deck_config_id | cascade | 软删除 deck_config 时，软删除关联 decks（并触发下游软删除） | `echoe-config.service.ts` |
| decks.mid -> notetypes.note_type_id | set null | 软删除 notetype 时，将关联 decks.mid 置空 | `echoe-config.service.ts` |
| templates.ntid -> notetypes.note_type_id | cascade | 软删除 notetype 时，软删除关联 templates | `echoe-config.service.ts` |
| templates.did -> decks.deck_id | set null | 软删除 deck 时，将关联 templates.did 置空 | `echoe-deck.service.ts` |

> 说明：本 PRD 中“删除”默认指软删除（更新 `delete_at` 为当前时间戳），除非显式说明为物理删除。
>
> 若产品期望与现有 cascade 行为不同（例如改为“禁止删除”），需单独出策略变更，不在本 PRD 默认范围内。

### FR-4 多租户强约束

- 所有关系校验、软删除级联与置空操作必须携带 `uid` 条件。
- 禁止跨租户“误关联”或“误删除”。
- 所有查询 SQL（含列表、详情、关联存在性查询）必须显式包含 `uid`；可删除表的查询必须显式包含 `delete_at = 0`。
- 所有软删除 SQL 必须在 `WHERE` 条件中显式包含 `uid` 与 `delete_at = 0`；置空 SQL 必须显式包含 `uid`。

### FR-5 可观测性

- 关系校验失败、级联软删除执行结果需输出结构化日志（使用 `@echoe/logger`）。
- 禁止使用 `console.log/error`。
- 日志字段至少包含：`event`、`uid`、`rootObject`、`targetField`、`targetId`、`affectedRows`、`result`、`durationMs`。
- `event` 最小枚举：`relation_validate_failed`、`soft_delete_started`、`soft_delete_finished`、`set_null_finished`、`import_partial_failed`。

### FR-6 一次性切换约束

- 本需求不包含历史数据迁移、回填、清洗和校正任务。
- 本需求不提供新旧逻辑兼容分支（不做双写、双读、灰度兼容）。
- 上线时直接切换到“无外键 + 业务代码维护关系 + 软删除”模型。

### FR-7 迁移幂等与多环境一致性

- 迁移脚本需支持“约束名差异”场景（不同环境约束名可不同）。
- 迁移可重复执行，重复执行应成功并输出“0 条待删除 / 0 条待新增列”结果。
- 提供迁移前后校验 SQL，用于发布核对（`FOREIGN KEY` 计数、`delete_at` 列存在性与表结构快照）。

### FR-8 软删除字段规范

- 范围内可删除业务表必须新增 `delete_at` 列，定义为 `bigint not null default 0`。
- `delete_at = 0` 表示未删除；`delete_at > 0` 表示已删除（时间戳）。
- 所有查询语句（列表、详情、分页统计、关联存在性查询）默认必须显式包含 `delete_at = 0`。
- 多表 JOIN 查询中，每个可删除业务表都必须按表别名追加 `delete_at = 0` 过滤。
- 如需读取已删除数据，必须通过显式参数开启（如 `includeDeleted=true`），且仅限审计/回收站接口并记录审计日志。
- 软删除时间戳统一采用毫秒级 Unix 时间戳。

### FR-9 导入失败处理策略（部分成功）

- 导入/CSV 导入采用“逐条处理、部分成功”模式，不使用整批回滚。
- 单条记录失败不影响其他记录提交；失败记录需返回行号、业务 ID、错误原因。
- 导入结果必须返回结构化摘要：`total`、`success`、`failed`、`failedItems[]`。
- 导入链路必须保证 `uid` 约束与关系校验规则一致（与 FR-2 同口径）。

## 7. 实现范围

### 7.1 Schema

- `apps/server/src/db/schema/echoe-notes.ts`
- `apps/server/src/db/schema/echoe-cards.ts`
- `apps/server/src/db/schema/echoe-revlog.ts`
- `apps/server/src/db/schema/echoe-decks.ts`
- `apps/server/src/db/schema/echoe-templates.ts`
- `apps/server/src/db/schema/echoe-notetypes.ts`（关系根对象校验相关）
- `apps/server/src/db/schema/echoe-deck-config.ts`（关系根对象校验相关）
- `apps/server/src/db/schema/` 下 M0 冻结清单中所有存在 `.references()` 的非 Echoe 业务域 schema 文件

### 7.2 Service

- `echoe-note.service.ts`
- `echoe-deck.service.ts`
- `echoe-study.service.ts`
- `echoe-config.service.ts`
- `echoe-import.service.ts`
- `echoe-csv-import.service.ts`
- `echoe-export.service.ts`
- M0 冻结清单中与非 Echoe 业务域关系写入/删除相关的 Owner Service

### 7.3 Controller/API

- `echoe-note.controller.ts`
- `echoe-deck.controller.ts`
- `echoe-study.controller.ts`
- `echoe-config.controller.ts`
- `echoe-import.controller.ts`
- `echoe-csv-import.controller.ts`
- `echoe-export.controller.ts`
- M0 冻结清单中与非 Echoe 业务域关系写入/删除相关的 Controller

### 7.4 范围变更机制

- 不允许使用“以及其他 service”作为实施范围描述。
- 新增影响面必须先更新“4.3 权威范围基线”并评审通过。
- M0 必须产出《外键与软删除改造冻结清单》（表、schema、service、controller 四维度），作为唯一实施基线。

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
- [ ] Update 仅校验传入字段，未传字段不触发关系校验（但 `uid` 权限约束始终生效）。

### US-3 作为系统维护者，我希望删除行为保持可预测

**验收标准**：

- [ ] 软删除 Note 会软删除其 Card 与 Revlog（事务内）。
- [ ] 软删除 Deck 会软删除关联 Card，并将 `templates.did` 置空。
- [ ] 软删除 NoteType 会软删除 Notes/Templates，并将 `decks.mid` 置空。
- [ ] 任一步骤失败时整体回滚。
- [ ] 级联编排由唯一 Owner Service 执行，不存在并行多入口删除链路。

### US-4 作为多租户系统管理员，我希望关系操作不会串租户

**验收标准**：

- [ ] 所有关联查询和写操作都带 `uid` 条件。
- [ ] 默认读取路径过滤 `delete_at = 0`，跨租户访问与已删除数据误读均被阻断。
- [ ] 范围内查询语句改造完成：列表/详情/关联查询均显式包含 `delete_at = 0`（可删除表）。
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
- [ ] 单表迁移失败时可在修复后重跑同一迁移（向前修复）。
- [ ] 发布前后校验 SQL 输出与预期一致。

### US-7 作为数据导入操作者，我希望导入失败时允许部分成功

**验收标准**：

- [ ] 导入任务返回 `total/success/failed/failedItems` 结构化结果。
- [ ] 单条失败不影响其他记录提交。
- [ ] `failedItems` 至少包含行号、业务 ID、错误原因。

## 9. 迁移与发布计划

### 9.1 开发阶段

1. 冻结“4.3 权威范围基线”，导出当前外键清单（含约束名）与《外键与软删除改造冻结清单》。
2. 移除 Drizzle Schema 中 `.references()`，并在范围内可删除表补齐 `delete_at` 字段。
3. 生成并审查迁移 SQL，确保按“先加列、再删外键、再补索引”执行。
4. 在 Service 层补齐 `FR-2` 关系校验矩阵与 `FR-3` 软删除编排逻辑，并完成范围内所有查询语句 `delete_at = 0` 过滤改造。
5. 增加关键单测（关系校验、级联软删除、查询过滤、事务回滚、跨租户、导入部分成功）。
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

- 发布前：记录目标表 `SHOW CREATE TABLE` 与 `information_schema` 外键统计，确认无兼容分支发布项，并校验 `delete_at` 列定义与默认值。
- 发布后：重复执行外键统计校验，确认范围内外键为 0，并抽样验证软删除链路写入 `delete_at`。
- 发布后：按“查询改造清单”逐项校验列表/详情/关联查询，确认 SQL/ORM 均包含 `delete_at = 0` 过滤。
- 发布后：抽样验证默认读路径过滤 `delete_at = 0`，并验证导入任务“部分成功”返回结构。
- 本次发布采用一次性切换，不设置灰度兼容阶段。

## 10. 风险与应对

- **风险 1：范围漂移导致漏改关系点**
  - 应对：以“4.3 权威范围基线”为唯一工作清单，变更需评审。
- **风险 2：漏实现某条级联语义**
  - 应对：按“FR-3 映射表”逐条对照测试。
- **风险 3：软删除链路性能下降**
  - 应对：补齐索引（含 `uid + delete_at`），必要时分批软删除并监控耗时。
- **风险 4：事务覆盖不完整**
  - 应对：Owner Service 单入口编排，单测覆盖失败回滚。
- **风险 5：历史脏数据在切换后触发业务错误**
  - 应对：本需求不做数据迁移与兼容处理，发现问题按缺陷流程单独治理，不阻塞本次上线。
- **风险 6：迁移因环境约束名差异失败**
  - 应对：迁移采用动态发现 + 幂等执行策略。
- **风险 7：导入“部分成功”导致业务侧误判全成功**
  - 应对：统一返回结构化摘要并在前端/任务日志显式展示失败明细。
- **风险 8：查询漏加 `delete_at = 0` 过滤导致已删除数据泄漏**
  - 应对：建立查询改造清单 + 代码评审检查项 + 回归测试覆盖（列表/详情/JOIN 查询）。

## 11. 里程碑与完成定义

### M0: 范围基线冻结

- “4.3 权威范围基线”评审通过
- 当前外键清单（含约束名）归档完成

### M1: Schema 与迁移完成

- `.references()` 清零
- 数据库外键清零
- 范围内可删除业务表 `delete_at` 列落地且默认值为 `0`
- 迁移可重复执行（幂等）

### M2: Service 关系维护完成

- `FR-2` 写入/更新校验矩阵完成（未传字段不校验）
- `FR-3` 软删除级联/置空语义完成
- 范围内所有查询语句 `delete_at = 0` 过滤改造完成
- Owner Service 单入口事务编排完成
- 导入链路“部分成功”与失败明细返回完成

### M3: 质量门禁通过

- 单测通过
- lint 通过
- typecheck 通过
- 跨租户回归通过

**DoD（Definition of Done）**：

- 代码与数据库中均不再存在外键约束。
- 范围内删除语义统一为软删除，`delete_at` 规则与读路径过滤规则已落地。
- 范围内所有查询语句默认包含 `delete_at = 0` 过滤（显式审计/回收站接口除外）。
- 关系完整性由业务代码稳定维护且具备明确编排边界。
- 核心链路行为与预期一致并具备回归测试保障（含导入部分成功）。
- 迁移跨环境稳定、可重复执行；本次交付不包含数据迁移与兼容层。
