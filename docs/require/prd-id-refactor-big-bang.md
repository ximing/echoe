# PRD: Echoe ID 重构 (Big Bang)

## 1. Introduction/Overview

本次重构将 Echoe 系统中所有业务关联 ID 从数值型（基于时间戳或自增）统一迁移为使用 `nanoid` 生成的字符串型 ID。数据库中原有的自增主键 `id` 保留，但不再具备业务含义；所有业务关联关系将使用新生成的业务 ID 字段（如 `note_id`、`card_id` 等）。

**核心目标**：实现全局唯一、可预测、无冲突的业务 ID 体系，简化跨系统数据同步与导入导出逻辑。

## 2. Goals

- 将所有 Echoe 业务表的 ID 字段从 `bigint/number` 迁移为 `varchar(191)/string`
- 保留数据库自增主键 `id`，新增业务 ID 字段（如 `note_id`、`card_id`）
- 统一使用 `apps/server/src/utils/id.ts` 中的 `generateTypeId` 方法生成 ID
- 更新所有 DTO、Service、Controller、前端 API 与状态管理逻辑
- 确保代码一致性与整洁，不考虑向后兼容
- 将 `单测 + lint + ts-check` 作为迁移验收门禁，确保重构正确性

## 3. Non-Goals (Out of Scope)

- **不处理 Anki 兼容性**：导入/导出 `.apkg` 时的 Anki 数值 ID 映射不在本次范围
- **不保留旧数据迁移**：采用 Big Bang 模式，直接删除重建或清空数据
- **不处理用户表 `users`**：用户 `uid` 已使用 `generateUid()` 生成字符串 ID
- **不处理 LanceDB/向量库**：本 PRD 仅涉及 MySQL 关系型数据库

## 4. Data Model Changes

### 4.1 新增 OBJECT_TYPE 常量

在 `apps/server/src/models/constant/type.ts` 中新增：

```typescript
export const OBJECT_TYPE = {
  // ... existing types ...
  ECHOE_CARD: 'ECHOE_CARD',
  ECHOE_NOTE: 'ECHOE_NOTE',
  ECHOE_DECK: 'ECHOE_DECK',
  ECHOE_NOTETYPE: 'ECHOE_NOTETYPE',
  ECHOE_TEMPLATE: 'ECHOE_TEMPLATE',
  ECHOE_REVLOG: 'ECHOE_REVLOG',
  ECHOE_COL: 'ECHOE_COL',
  ECHOE_DECK_CONFIG: 'ECHOE_DECK_CONFIG',
  ECHOE_GRAVE: 'ECHOE_GRAVE',
  ECHOE_MEDIA: 'ECHOE_MEDIA',
};
```

### 4.2 更新 generateTypeId 函数

在 `apps/server/src/utils/id.ts` 中添加对应的 case 分支：

```typescript
case OBJECT_TYPE.ECHOE_CARD: return `ec${typeid()}`;
case OBJECT_TYPE.ECHOE_NOTE: return `en${typeid()}`;
case OBJECT_TYPE.ECHOE_DECK: return `ed${typeid()}`;
case OBJECT_TYPE.ECHOE_NOTETYPE: return `ent${typeid()}`;
case OBJECT_TYPE.ECHOE_TEMPLATE: return `et${typeid()}`;
case OBJECT_TYPE.ECHOE_REVLOG: return `erl${typeid()}`;
case OBJECT_TYPE.ECHOE_COL: return `ecol${typeid()}`;
case OBJECT_TYPE.ECHOE_DECK_CONFIG: return `edc${typeid()}`;
case OBJECT_TYPE.ECHOE_GRAVE: return `eg${typeid()}`;
case OBJECT_TYPE.ECHOE_MEDIA: return `em${typeid()}`;
```

### 4.3 Schema 字段变更详情

#### 4.3.1 echoe_notes

| 字段 | 原类型 | 新类型 | 说明 |
|------|--------|--------|------|
| `id` | `bigint PK` | `int AI PK` | 保留为自增主键，无业务含义 |
| `note_id` | - | `varchar(191) UNIQUE NOT NULL` | **新增** 业务 ID，使用 `generateTypeId(OBJECT_TYPE.ECHOE_NOTE)` |
| `mid` | `bigint` | `varchar(191)` | 关联 `echoe_notetypes.note_type_id` |
| `csum` | `bigint` | `varchar(191)` | 校验和字段改为字符串存储 |

索引调整：
- 新增 `note_id_idx` 在 `note_id`
- 修改 `mid_idx` 为指向 `mid` 字符串字段

#### 4.3.2 echoe_cards

| 字段 | 原类型 | 新类型 | 说明 |
|------|--------|--------|------|
| `id` | `bigint PK` | `int AI PK` | 保留为自增主键 |
| `card_id` | - | `varchar(191) UNIQUE NOT NULL` | **新增** 业务 ID |
| `nid` | `bigint` | `varchar(191)` | 关联 `echoe_notes.note_id` |
| `did` | `bigint` | `varchar(191)` | 关联 `echoe_decks.deck_id` |
| `odid` | `bigint` | `varchar(191)` | 原始牌组 ID |
| `due` | `bigint` | `bigint` | 保持不变（时间戳） |
| `odue` | `bigint` | `bigint` | 保持不变 |
| `last_review` | `bigint` | `bigint` | 保持不变 |

#### 4.3.3 echoe_decks

| 字段 | 原类型 | 新类型 | 说明 |
|------|--------|--------|------|
| `id` | `bigint PK` | `int AI PK` | 保留为自增主键 |
| `deck_id` | - | `varchar(191) UNIQUE NOT NULL` | **新增** 业务 ID |
| `conf` | `bigint` | `varchar(191)` | 关联 `echoe_deck_config.deck_config_id` |
| `mid` | `bigint` | `varchar(191)` | 最后使用的 notetype |

#### 4.3.4 echoe_notetypes

| 字段 | 原类型 | 新类型 | 说明 |
|------|--------|--------|------|
| `id` | `bigint PK` | `int AI PK` | 保留为自增主键 |
| `note_type_id` | - | `varchar(191) UNIQUE NOT NULL` | **新增** 业务 ID |
| `did` | `bigint` | `varchar(191)` | 默认 deck |

#### 4.3.5 echoe_templates

| 字段 | 原类型 | 新类型 | 说明 |
|------|--------|--------|------|
| `id` | `bigint PK` | `int AI PK` | 保留为自增主键 |
| `template_id` | - | `varchar(191) UNIQUE NOT NULL` | **新增** 业务 ID |
| `ntid` | `bigint` | `varchar(191)` | 关联 `echoe_notetypes.note_type_id` |
| `did` | `bigint` | `varchar(191)` | 覆盖 deck |

#### 4.3.6 echoe_revlog

| 字段 | 原类型 | 新类型 | 说明 |
|------|--------|--------|------|
| `id` | `bigint PK` | `int AI PK` | 保留为自增主键 |
| `revlog_id` | - | `varchar(191) UNIQUE NOT NULL` | **新增** 业务 ID |
| `cid` | `bigint` | `varchar(191)` | 关联 `echoe_cards.card_id` |

#### 4.3.7 echoe_col

| 字段 | 原类型 | 新类型 | 说明 |
|------|--------|--------|------|
| `id` | `bigint PK` | `int AI PK` | 保留为自增主键 |
| `col_id` | - | `varchar(191) UNIQUE NOT NULL` | **新增** 业务 ID |

#### 4.3.8 echoe_deck_config

| 字段 | 原类型 | 新类型 | 说明 |
|------|--------|--------|------|
| `id` | `bigint PK` | `int AI PK` | 保留为自增主键 |
| `deck_config_id` | - | `varchar(191) UNIQUE NOT NULL` | **新增** 业务 ID |

#### 4.3.9 echoe_graves

| 字段 | 原类型 | 新类型 | 说明 |
|------|--------|--------|------|
| `id` | `int AI PK` | `int AI PK` | 保持不变 |
| `grave_id` | - | `varchar(191) UNIQUE NOT NULL` | **新增** 业务 ID |
| `oid` | `bigint` | `varchar(191)` | 原始对象 ID（指向对应业务 ID） |

#### 4.3.10 echoe_media

| 字段 | 原类型 | 新类型 | 说明 |
|------|--------|--------|------|
| `id` | `int AI PK` | `int AI PK` | 保持不变 |
| `media_id` | - | `varchar(191) UNIQUE NOT NULL` | **新增** 业务 ID |

#### 4.3.11 echoe_config

| 字段 | 原类型 | 新类型 | 说明 |
|------|--------|--------|------|
| `uid` | `varchar(191) PK` | `varchar(191) PK` | 保持不变 |
| `key` | `varchar(191) PK` | `varchar(191) PK` | 保持不变 |

> `echoe_config` 使用复合主键 `(uid, key)`，无自增 ID，无需新增业务 ID 字段。

### 4.4 ID 前缀规范

| 实体类型 | OBJECT_TYPE | ID 前缀 | 示例 |
|----------|-------------|---------|------|
| Card | ECHOE_CARD | `ec` | `ec1a2b3c4d5e6f7g8h9j0k` |
| Note | ECHOE_NOTE | `en` | `en1a2b3c4d5e6f7g8h9j0k` |
| Deck | ECHOE_DECK | `ed` | `ed1a2b3c4d5e6f7g8h9j0k` |
| NoteType | ECHOE_NOTETYPE | `ent` | `ent1a2b3c4d5e6f7g8h9j0k` |
| Template | ECHOE_TEMPLATE | `et` | `et1a2b3c4d5e6f7g8h9j0k` |
| Revlog | ECHOE_REVLOG | `erl` | `erl1a2b3c4d5e6f7g8h9j0k` |
| Col | ECHOE_COL | `ecol` | `ecol1a2b3c4d5e6f7g8h9j0k` |
| DeckConfig | ECHOE_DECK_CONFIG | `edc` | `edc1a2b3c4d5e6f7g8h9j0k` |
| Grave | ECHOE_GRAVE | `eg` | `eg1a2b3c4d5e6f7g8h9j0k` |
| Media | ECHOE_MEDIA | `em` | `em1a2b3c4d5e6f7g8h9j0k` |

## 5. User Stories

### US-001: 更新 OBJECT_TYPE 常量与 generateTypeId 函数

**Description:** 作为开发者，我需要在 ID 生成工具中添加 Echoe 业务对象的类型定义，以便统一生成带前缀的字符串 ID。

**Acceptance Criteria:**
- [ ] 在 `apps/server/src/models/constant/type.ts` 添加 10 个新 OBJECT_TYPE
- [ ] 在 `apps/server/src/utils/id.ts` 的 `generateTypeId` 添加对应 case
- [ ] 删除 `generateNoteId`、`generateCardId`、`generateDeckId`、`generateNoteTypeId`、`generateRevlogId` 函数
- [ ] Typecheck 通过

### US-002: 更新数据库 Schema 文件

**Description:** 作为开发者，我需要修改所有 Echoe 表的 Schema，新增业务 ID 字段并调整外键类型。

**Acceptance Criteria:**
- [ ] 更新 10 个 schema 文件（echoe-notes.ts ~ echoe-media.ts）
- [ ] 每个表新增对应的 `*_id` 业务 ID 字段
- [ ] 所有外键字段从 `bigint` 改为 `varchar(191)`
- [ ] 添加必要的索引（业务 ID 字段、外键字段）
- [ ] Schema 从 `schema/index.ts` 正确导出
- [ ] Typecheck 通过

### US-003: 生成并执行数据库迁移

**Description:** 作为开发者，我需要创建 Drizzle 迁移脚本来应用 Schema 变更。

**Acceptance Criteria:**
- [ ] 执行 `pnpm build` 构建服务端
- [ ] 执行 `pnpm migrate:generate` 生成迁移 SQL
- [ ] 审查生成的 SQL（确认 DROP/CREATE 或 ALTER 语句）
- [ ] 执行 `pnpm migrate` 运行迁移
- [ ] 数据库表结构符合新 Schema 定义

### US-004: 更新共享 DTO 类型定义

**Description:** 作为开发者，我需要更新 `@echoe/dto` 包中的所有接口定义，将 ID 字段从 `number` 改为 `string`。

**Acceptance Criteria:**
- [ ] 更新 `packages/dto/src/echoe.ts` 中所有 `id: number` 为 `id: string`
- [ ] 更新所有外键字段（`nid`、`did`、`mid`、`cid`、`ntid`、`conf`、`oid`）为 `string`
- [ ] 更新相关接口（`EchoeDeckDto`、`EchoeNoteDto`、`EchoeCardDto`、`EchoeNoteTypeDto`、`EchoeTemplateDto`、`EchoeRevlogDto`、`EchoeMediaDto` 等）
- [ ] 更新请求参数接口（`CreateEchoeNoteDto`、`UpdateEchoeDeckDto`、`ReviewSubmissionDto`、`BulkCardOperationDto` 等）
- [ ] 更新查询参数接口（`EchoeCardQueryParams`、`StudyQueueParams` 等）
- [ ] 执行 `pnpm build` 构建 DTO 包
- [ ] Typecheck 通过

### US-005: 更新后端 Service 层

**Description:** 作为开发者，我需要更新所有 Echoe 相关 Service，将数值转换逻辑改为字符串处理。

**Acceptance Criteria:**
- [ ] 更新 `echoe-note.service.ts` - 移除所有 `Number()` 转换，使用业务 ID
- [ ] 更新 `echoe-deck.service.ts` - 使用 `deck_id` 替代 `id` 进行业务操作
- [ ] 更新 `echoe-study.service.ts` - 使用 `card_id`、`note_id`、`deck_id`
- [ ] 更新 `echoe-stats.service.ts` - 统计查询使用业务 ID
- [ ] 更新 `echoe-export.service.ts` - 导出时映射业务 ID
- [ ] 更新 `echoe-import.service.ts` - 导入时生成新业务 ID
- [ ] 更新 `echoe-csv-import.service.ts` - CSV 导入使用业务 ID
- [ ] 更新 `echoe-duplicate.service.ts` - 重复检测使用业务 ID
- [ ] 更新 `echoe-media.service.ts` - 媒体关联使用业务 ID
- [ ] 更新 `echoe-config.service.ts` - 配置关联使用业务 ID
- [ ] 更新 `echoe-tag.service.ts` - 标签操作使用业务 ID
- [ ] Typecheck 通过

### US-006: 更新后端 Controller 层

**Description:** 作为开发者，我需要更新所有 Echoe 相关 Controller，调整路由参数解析逻辑。

**Acceptance Criteria:**
- [ ] 更新 `echoe-note.controller.ts` - 路由参数从 `number` 改为 `string`
- [ ] 更新 `echoe-deck.controller.ts` - 移除 `parseInt` 逻辑
- [ ] 更新 `echoe-study.controller.ts` - 使用字符串 ID
- [ ] 更新 `echoe-stats.controller.ts` - 统计接口参数
- [ ] 更新 `echoe-export.controller.ts` - 导出接口
- [ ] 更新 `echoe-import.controller.ts` - 导入接口
- [ ] 更新 `echoe-csv-import.controller.ts` - CSV 导入接口
- [ ] 更新 `echoe-duplicate.controller.ts` - 重复检测接口
- [ ] 更新 `echoe-media.controller.ts` - 媒体接口
- [ ] 更新 `echoe-config.controller.ts` - 配置接口
- [ ] 更新 `echoe-tag.controller.ts` - 标签接口
- [ ] Typecheck 通过

### US-007: 更新前端 API 层

**Description:** 作为开发者，我需要更新 `apps/web/src/api/echoe.ts` 中的所有 API 调用，将参数类型从 `number` 改为 `string`。

**Acceptance Criteria:**
- [ ] 更新 `getDeck`、`updateDeck`、`deleteDeck` 等函数参数
- [ ] 更新 `getDeckConfig`、`updateDeckConfig` 参数
- [ ] 更新 `getStudyQueue`、`submitReview`、`undoReview` 参数
- [ ] 更新 `getNote`、`updateNote`、`deleteNote` 参数
- [ ] 更新 `getCard`、`getStudyOptions` 参数
- [ ] 更新所有批量操作函数（`buryCards`、`forgetCards`）
- [ ] 移除所有 `.toString()` 转换（ID 已是字符串）
- [ ] Typecheck 通过

### US-008: 更新前端 Service 层（@rabjs/react）

**Description:** 作为开发者，我需要更新 `apps/web/src/services/` 下的状态管理 Service，将 ID 相关类型从 `number` 改为 `string`。

**Acceptance Criteria:**
- [ ] 更新 `echoe-deck.service.ts` - `expandedDecks: Set<string>`，方法参数改为 `string`
- [ ] 更新 `echoe-note.service.ts` - `currentCard` 类型使用字符串 ID
- [ ] 更新 `echoe-study.service.ts` - 学习队列使用字符串 ID
- [ ] 更新 `echoe-stats.service.ts` - `selectedDeckId: string | undefined`
- [ ] 更新 `echoe-csv-import.service.ts` - `selectedNotetypeId`、`selectedDeckId` 改为 `string`
- [ ] 更新 `echoe-dashboard.service.ts` - 相关类型
- [ ] 更新 `echoe-settings.service.ts` - 相关类型
- [ ] Typecheck 通过

### US-009: 更新前端页面组件

**Description:** 作为开发者，我需要更新所有使用 ID 的页面组件，移除 `parseInt` 和 `Number()` 转换。

**Acceptance Criteria:**
- [ ] 更新 `apps/web/src/pages/cards/` 下所有组件
- [ ] 更新路由参数解析（`useParams` 返回的 ID 已是字符串）
- [ ] 更新事件处理函数中的 ID 使用
- [ ] 更新状态管理中的 ID 集合（`Set<string>`）
- [ ] Typecheck 通过
- [ ] Verify in browser using dev-browser skill

### US-010: 端到端测试验证

**Description:** 作为开发者，我需要验证整个系统在 ID 重构后的功能正确性。

**Acceptance Criteria:**
- [ ] 创建新 Deck、NoteType、Note、Card - 验证 ID 格式正确
- [ ] 学习流程 - 验证 review、undo、bury、forget 功能
- [ ] 统计页面 - 验证统计数据正确
- [ ] 导入/导出 - 验证数据完整性
- [ ] CSV 导入 - 验证批量创建功能
- [ ] `@echoe/server` 单测通过（`pnpm --filter @echoe/server test`）
- [ ] `@echoe/dto` 单测通过（`pnpm --filter @echoe/dto test`）
- [ ] 全仓 lint 通过（`pnpm lint`）
- [ ] `@echoe/server` ts-check 通过（`pnpm --filter @echoe/server typecheck`）
- [ ] `@echoe/web` ts-check 通过（`pnpm --filter @echoe/web typecheck`）
- [ ] `@echoe/dto` ts-check 通过（`pnpm --filter @echoe/dto typecheck`）

## 6. Functional Requirements

### FR-1: ID 生成规范
- FR-1.1: 所有 Echoe 业务实体创建时必须调用 `generateTypeId(OBJECT_TYPE.XXX)` 生成业务 ID
- FR-1.2: 业务 ID 长度为前缀 + 23 位 nanoid，总计 24-28 字符
- FR-1.3: 业务 ID 必须在数据库层面设置 UNIQUE 约束

### FR-2: 数据库 Schema
- FR-2.1: 每个表保留 `id` 作为自增主键（`int AUTO_INCREMENT PRIMARY KEY`）
- FR-2.2: 每个表新增 `{entity}_id` 业务 ID 字段（`varchar(191) NOT NULL UNIQUE`）
- FR-2.3: 所有外键字段从 `bigint` 改为 `varchar(191)`
- FR-2.4: 外键约束使用 `references()` 指向对应业务 ID 字段

### FR-3: DTO 类型定义
- FR-3.1: 所有 `id` 字段类型从 `number` 改为 `string`
- FR-3.2: 所有外键字段（`nid`、`did`、`mid`、`cid`、`ntid`、`conf`、`oid`）从 `number` 改为 `string`
- FR-3.3: 批量操作的 `cardIds: number[]` 改为 `cardIds: string[]`

### FR-4: 后端 Service 层
- FR-4.1: 移除所有 `Number()`、`parseInt()` 转换逻辑
- FR-4.2: 数据库查询使用业务 ID 字段（`note_id`、`card_id` 等）
- FR-4.3: 创建实体时调用 `generateTypeId` 生成业务 ID

### FR-5: 后端 Controller 层
- FR-5.1: 路由参数类型从 `@Param('id', { parse: true }) number` 改为 `@Param('id') string`
- FR-5.2: 移除所有 ID 相关的 `parseInt` 处理

### FR-6: 前端 API 层
- FR-6.1: 所有 ID 参数类型从 `number` 改为 `string`
- FR-6.2: 移除 `.toString()` 转换（ID 已是字符串）

### FR-7: 前端 Service/State 层
- FR-7.1: 所有 ID 状态类型从 `number` 改为 `string`
- FR-7.2: `Set<number>` 改为 `Set<string>`

### FR-8: 质量门禁（必选）
- FR-8.1: 数据库迁移完成后，必须执行并通过单元测试
- FR-8.2: 数据库迁移完成后，必须执行并通过 lint 检查
- FR-8.3: 数据库迁移完成后，必须执行并通过 ts-check（typecheck）
- FR-8.4: 任一门禁失败时，不允许合并本次 ID 重构

## 7. Technical Considerations

### 7.1 数据库迁移策略

采用 Big Bang 模式：
1. 生成 Drizzle 迁移脚本
2. 迁移脚本将包含：
   - 添加新字段（`*_id` 业务 ID）
   - 修改外键字段类型
   - 创建新索引
   - 删除旧索引
3. 执行迁移时数据将被清空或重建

**重要**：Drizzle 迁移需要先执行 `pnpm build`，因为 drizzle-kit 读取编译后的 JS 文件。

### 7.2 索引设计

每个表需要以下索引：
- 主键索引（自增 `id`）
- 业务 ID 唯一索引（`*_id`）
- 外键索引（关联字段）
- 复合索引（多租户隔离 `uid` + 业务字段）

### 7.3 ID 规范遵循

按照项目 ID 生成规范：
- 新增类型必须在 `OBJECT_TYPE` 中定义
- 在 `generateTypeId` 函数中添加 case 分支
- 更新本规范文档的 ID 格式规范表格

### 7.4 多租户隔离

所有查询必须继续基于 `uid` 进行租户隔离，业务 ID 字段提供全局唯一性。

### 7.5 迁移后验证命令（必跑）

在执行完 schema + service + controller + DTO + web 改造后，必须按如下顺序执行：

1. `pnpm --filter @echoe/server test`
2. `pnpm --filter @echoe/dto test`
3. `pnpm lint`
4. `pnpm --filter @echoe/server typecheck`
5. `pnpm --filter @echoe/web typecheck`
6. `pnpm --filter @echoe/dto typecheck`

验收标准：以上命令全部返回 0，且无新增错误。

## 8. Impacted Files

### 8.1 Schema 文件 (apps/server/src/db/schema/)

| 文件 | 变更内容 |
|------|----------|
| `echoe-notes.ts` | 新增 `note_id`，修改 `mid` 类型，调整索引 |
| `echoe-cards.ts` | 新增 `card_id`，修改 `nid`、`did`、`odid` 类型 |
| `echoe-decks.ts` | 新增 `deck_id`，修改 `conf`、`mid` 类型 |
| `echoe-notetypes.ts` | 新增 `note_type_id`，修改 `did` 类型 |
| `echoe-templates.ts` | 新增 `template_id`，修改 `ntid`、`did` 类型 |
| `echoe-revlog.ts` | 新增 `revlog_id`，修改 `cid` 类型 |
| `echoe-col.ts` | 新增 `col_id` |
| `echoe-deck-config.ts` | 新增 `deck_config_id` |
| `echoe-graves.ts` | 新增 `grave_id`，修改 `oid` 类型 |
| `echoe-media.ts` | 新增 `media_id` |
| `index.ts` | 更新导出 |

### 8.2 后端 Service 文件 (apps/server/src/services/)

| 文件 | 变更内容 |
|------|----------|
| `echoe-note.service.ts` | 移除 `Number()` 转换，使用业务 ID |
| `echoe-deck.service.ts` | 使用 `deck_id` 进行业务操作 |
| `echoe-study.service.ts` | 使用 `card_id`、`note_id`、`deck_id` |
| `echoe-stats.service.ts` | 统计查询使用业务 ID |
| `echoe-export.service.ts` | 导出映射业务 ID |
| `echoe-import.service.ts` | 导入生成新业务 ID |
| `echoe-csv-import.service.ts` | CSV 导入使用业务 ID |
| `echoe-duplicate.service.ts` | 重复检测使用业务 ID |
| `echoe-media.service.ts` | 媒体关联使用业务 ID |
| `echoe-config.service.ts` | 配置关联使用业务 ID |
| `echoe-tag.service.ts` | 标签操作使用业务 ID |

### 8.3 后端 Controller 文件 (apps/server/src/controllers/v1/)

| 文件 | 变更内容 |
|------|----------|
| `echoe-note.controller.ts` | 路由参数改为 `string` |
| `echoe-deck.controller.ts` | 移除 `parseInt` 逻辑 |
| `echoe-study.controller.ts` | 使用字符串 ID |
| `echoe-stats.controller.ts` | 统计接口参数 |
| `echoe-export.controller.ts` | 导出接口 |
| `echoe-import.controller.ts` | 导入接口 |
| `echoe-csv-import.controller.ts` | CSV 导入接口 |
| `echoe-duplicate.controller.ts` | 重复检测接口 |
| `echoe-media.controller.ts` | 媒体接口 |
| `echoe-config.controller.ts` | 配置接口 |
| `echoe-tag.controller.ts` | 标签接口 |

### 8.4 DTO 文件 (packages/dto/src/)

| 文件 | 变更内容 |
|------|----------|
| `echoe.ts` | 所有 ID 字段从 `number` 改为 `string` |

### 8.5 前端 API 文件 (apps/web/src/api/)

| 文件 | 变更内容 |
|------|----------|
| `echoe.ts` | 所有 ID 参数从 `number` 改为 `string` |

### 8.6 前端 Service 文件 (apps/web/src/services/)

| 文件 | 变更内容 |
|------|----------|
| `echoe-deck.service.ts` | ID 类型改为 `string` |
| `echoe-note.service.ts` | `currentCard` 类型更新 |
| `echoe-study.service.ts` | 学习队列 ID 类型 |
| `echoe-stats.service.ts` | `selectedDeckId` 类型 |
| `echoe-csv-import.service.ts` | 选择 ID 类型 |
| `echoe-dashboard.service.ts` | 相关类型 |
| `echoe-settings.service.ts` | 相关类型 |

### 8.7 ID 工具文件 (apps/server/src/utils/)

| 文件 | 变更内容 |
|------|----------|
| `id.ts` | 添加 Echoe 业务对象 case，删除旧生成函数 |

### 8.8 常量文件 (apps/server/src/models/constant/)

| 文件 | 变更内容 |
|------|----------|
| `type.ts` | 添加 10 个新 OBJECT_TYPE |

## 9. Success Metrics

- 单测通过率：100%（至少覆盖 `@echoe/server`、`@echoe/dto`）
- TypeScript 类型检查：0 errors（`server`、`web`、`dto`）
- ESLint 检查：0 errors（全仓）
- 新建实体的业务 ID 格式符合规范（前缀 + 23 位 nanoid）
- 数据库所有外键关联正确
- 迁移后质量门禁命令全部通过（见 `7.5 迁移后验证命令`）

## 10. Open Questions

1. **revlog.id 时间戳语义**：原 `revlog.id` 使用 `ms * 1000 + seq` 格式便于按时间排序。改为字符串 ID 后，是否需要额外添加时间戳索引或字段？
   - **建议**：保持现有 `lastReview` 时间戳字段，排序逻辑不受影响。

2. **echoe_config 表处理**：该表使用复合主键 `(uid, key)`，无自增 ID。是否需要新增 `config_id`？
   - **建议**：不新增，保持现有结构。该表为 KV 配置存储，无外部关联。

3. **导入 .apkg 时的 ID 映射**：Anki 导入的数据使用数值 ID，如何处理映射？
   - **建议**：导入时忽略原 ID，为所有实体生成新的字符串业务 ID。此问题在 Non-Goals 中已声明不在本次范围。

## 11. References

- 项目 CLAUDE.md 文档
- ID 生成规范 (`apps/server/src/utils/id.ts`)
- Drizzle ORM 文档
- Anki 兼容字段调研结论 (`anki.md`)
