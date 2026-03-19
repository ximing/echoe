# 收件箱与开放 API Token 功能设计

**日期**: 2026-03-16
**状态**: 已确认

## 概述

实现收件箱功能和通用 API Token 能力，支持手动/API 推入内容、AI 整理、日报生成和卡片化功能。

---

## 一、通用 API Token

### 1.1 数据库设计

**表名**: `api_token`

| 字段       | 类型         | 说明                           |
| ---------- | ------------ | ------------------------------ |
| id         | int          | 主键，自增                     |
| token_id   | varchar(191) | 业务 ID，唯一索引 (如 `t_xxx`) |
| uid        | varchar(191) | 用户ID                         |
| name       | varchar(100) | Token 名称                     |
| token_hash | varchar(255) | Token 的 SHA256 哈希值         |
| deleted_at | bigint       | 软删除时间戳 (0 = 未删除)      |
| created_at | timestamp    | 创建时间                       |
| updated_at | timestamp    | 更新时间                       |

**索引**:

- `id` (主键)
- `uid` (用户查询)
- `token_hash` (Token 验证)

### 1.2 API 接口

| 方法   | 路径                   | 说明                      |
| ------ | ---------------------- | ------------------------- |
| GET    | /api/v1/api-tokens     | 获取当前用户的 Token 列表 |
| POST   | /api/v1/api-tokens     | 创建新 Token              |
| DELETE | /api/v1/api-tokens/:id | 删除 Token                |

### 1.3 Token 认证中间件

- 新增 `ApiTokenAuthMiddleware`
- 从请求头 `Authorization: Bearer <token>` 获取 Token
- 验证 Token 有效性，设置 `req.userId`
- **Token 可调用所有 API**（与 JWT 认证兼容）
- Token 认证与 JWT 认证共存，优先级：Token > JWT

---

## 二、收件箱内容

### 2.1 数据库设计

**表名**: `inbox`

| 字段       | 类型         | 说明                          |
| ---------- | ------------ | ----------------------------- |
| id         | int          | 主键，自增                    |
| uid        | varchar(191) | 用户ID                        |
| inbox_id   | varchar(191) | 业务 ID，唯一索引 (如 `ixxx`) |
| front      | text         | 正面内容                      |
| back       | text         | 背面内容（可为空）            |
| source     | varchar(50)  | 来源: manual / api            |
| category   | varchar(50)  | 分类: front / backend (默认)  |
| is_read    | boolean      | 是否已读，默认 false          |
| deleted_at | bigint       | 软删除时间戳 (0 = 未删除)     |
| created_at | timestamp    | 创建时间                      |
| updated_at | timestamp    | 更新时间                      |

**索引**:

- `id` (主键)
- `inbox_id` (唯一索引)
- `uid` (用户查询)
- `category` (分类筛选)
- `is_read` (已读筛选)

### 2.2 API 接口

| 方法   | 路径                        | 说明                            |
| ------ | --------------------------- | ------------------------------- |
| GET    | /api/v1/inbox               | 获取收件箱列表 (支持分页、筛选) |
| POST   | /api/v1/inbox               | 添加内容                        |
| PUT    | /api/v1/inbox/:inboxId      | 更新内容                        |
| DELETE | /api/v1/inbox/:inboxId      | 删除内容                        |
| POST   | /api/v1/inbox/:inboxId/read | 标记已读                        |
| POST   | /api/v1/inbox/read-all      | 一键全读                        |

### 2.3 AI 整理接口

| 方法 | 路径                            | 说明            |
| ---- | ------------------------------- | --------------- |
| POST | /api/v1/inbox/:inboxId/organize | AI 整理单条内容 |

**AI 整理逻辑（补充）**:

1. 构建输入上下文（按优先级）:
   - 当前 inbox 内容：front/back/source/category/createdAt
   - 最近 7 天同类内容（最多 10 条，按语义相似度排序）
   - 最近 30 天日报摘要（不是原文全量喂入，使用摘要）
2. 上下文压缩策略:
   - 单条内容超过 800 字时，先做一次摘要再进入主模型
   - 最近 30 天日报先提取“高频主题 / 未完成行动 / 易混淆点”三类记忆
   - 总输入控制在 6k tokens 以内，超限按“相似度 + 时间衰减”裁剪
3. AI 输出目标:
   - 必须返回结构化 JSON：`optimizedFront`、`optimizedBack`、`reason`、`confidence`
   - 若原始信息不足，仅补全 `back`，不强行改写 `front`
4. 降级策略:
   - AI 超时或失败时，返回原始 front/back，并标记 `fallback=true`
   - 记录失败原因，支持用户手动重试
5. 质量约束:
   - 生成结果不得引入原文不存在的事实（信息不足时显式声明）
   - 优先输出适合“问答卡片化”的表达（简洁、可测验、单一知识点）

---

## 三、收件箱日报

### 3.1 数据库设计

**表名**: `inbox_report`

| 字段            | 类型         | 说明                           |
| --------------- | ------------ | ------------------------------ |
| id              | int          | 主键，自增                     |
| uid             | varchar(191) | 用户ID                         |
| inbox_report_id | varchar(191) | 业务 ID，唯一索引 (如 `irxxx`) |
| date            | varchar(20)  | 日期 YYYY-MM-DD                |
| content         | text         | 日报内容 (Markdown 格式)       |
| summary         | text         | 日报摘要 (JSON 格式，供 AI 复用) |
| deleted_at      | bigint       | 软删除时间戳 (0 = 未删除)      |
| created_at      | timestamp    | 创建时间                       |
| updated_at      | timestamp    | 更新时间                       |

**索引**:

- `id` (主键)
- `inbox_report_id` (唯一索引)
- `uid` (用户查询)
- `date` (日期查询)
- `uid, date` (联合唯一索引，防止同日重复生成)

### 3.2 API 接口

| 方法 | 路径                            | 说明         |
| ---- | ------------------------------- | ------------ |
| GET  | /api/v1/inbox/reports           | 获取日报列表 |
| GET  | /api/v1/inbox/reports/:reportId | 获取日报详情 |
| POST | /api/v1/inbox/reports/generate  | 生成当日日报 |

### 3.3 日报生成逻辑（补充）

1. 获取当日新增的收件箱内容（按用户时区的 00:00-23:59 统计）
2. 构建历史上下文（最近 30 天）:
   - 拉取最近 30 天日报
   - 每份日报抽取结构化摘要：`topics[]`、`mistakes[]`、`actions[]`
   - 聚合成 4 个周摘要 + 1 个月度趋势摘要（避免直接喂入 30 篇原文）
3. 分阶段生成:
   - 阶段 A（事实层）：今日新增数量、来源分布、分类分布、已读率
   - 阶段 B（洞察层）：重复出现知识点、薄弱环节、下一步学习建议
4. 反重复策略:
   - 与最近 7 天建议高度重复时，要求 AI 生成替代建议
   - 每条重点结论附 `evidenceIds`（引用 inbox/report 来源）
5. 存储产物:
   - 存储完整日报（Markdown）
   - 同时存储日报摘要（供后续 AI 任务复用）

---

## 四、卡片化功能

### 4.1 API 接口

| 方法 | 路径                           | 说明           |
| ---- | ------------------------------ | -------------- |
| POST | /api/v1/inbox/:inboxId/to-card | 转换为笔记卡片 |

### 4.2 卡片化逻辑

**方式一：用户选择**
1. 接收目标卡组 ID (deckId) 和笔记类型 ID (notetypeId)
2. 获取收件箱内容
3. 创建笔记 (Note):
   - front → Front 字段
   - back → Back 字段
4. 创建卡片 (Card)
5. 返回创建的笔记/卡片信息

**方式二：AI 自动选择**
1. 不传递 deckId 和 notetypeId
2. AI 分析内容语义：
   - 判断内容主题
   - 从现有卡组中匹配最合适的，或创建新卡组
   - 选择最合适的笔记类型
3. 创建笔记和卡片
4. 返回创建结果（包括目标卡组和笔记类型）

---

## 五、前端页面

### 5.1 收件箱页面

**路径**: `/inbox`

**功能**:

- 收件箱内容列表
- 添加内容 (弹窗)
- 编辑/删除内容
- 标记已读/全读
- AI 整理按钮
- 卡片化按钮

### 5.2 日报页面

**路径**: `/inbox/reports`

**功能**:

- 日报列表
- 查看日报详情
- 生成当日日报

### 5.3 设置页 - Token 管理

**路径**: `/settings/api-tokens`

**功能**:

- Token 列表
- 创建 Token (显示一次 Token)
- 删除 Token

---

## 六、ID 类型扩展

在 `OBJECT_TYPE` 中新增:

```typescript
INBOX_TOKEN: 'INBOX_TOKEN',  // Token 业务 ID
INBOX_REPORT: 'INBOX_REPORT', // 日报业务 ID
```

---

## 七、验收标准

1. ✅ 可以创建、删除、查看 Token
2. ✅ Token 可以调用需要认证的 API
3. ✅ 可以手动添加收件箱内容
4. ✅ 可以通过 API 推入内容到收件箱
5. ✅ 可以标记已读/一键全读
6. ✅ AI 可以整理内容 (补全/优化)
7. ✅ 可以生成和查看日报
8. ✅ 可以将收件箱内容转为卡片
9. ✅ 所有数据支持软删除

---

## 八、后续扩展

- Token 权限细分 (只读/读写)
- 收件箱内容来源渠道 (飞书/钉钉)
- 定时自动生成日报
- 批量卡片化

---

## 九、AI 技术策略补充（重点）

### 9.1 AI 任务拆分

- `organize_inbox`: 整理单条收件箱内容（补全 back、优化可卡片化表达）
- `generate_daily_report`: 生成当日日报（事实 + 洞察 + 建议）
- `inbox_to_card`: 协助卡片化（推荐 deck/notetype 与字段映射）

### 9.2 信息喂给策略（防止上下文过载）

采用“分层记忆 + 检索裁剪”策略，不直接把历史内容全量喂给 AI：

- L0（当前输入）: 当前任务直接相关的数据（必须）
- L1（短期记忆）: 最近 7 天相关 inbox（Top 10）
- L2（中期记忆）: 最近 30 天日报摘要（周摘要 + 月趋势）
- L3（偏好记忆）: 用户最近使用的 deck/notetype 与手动修正记录

### 9.3 过去一个月日报喂给 AI 的具体方案

1. 每次日报生成后，额外产出一份结构化摘要（建议 200-300 字）:
   - `topics`: 今日主题（最多 5 个）
   - `mistakes`: 易错点（最多 3 个）
   - `actions`: 后续行动（最多 3 个）
2. 每 7 天聚合一次周摘要，形成滚动 4 周视图
3. 调用 AI 时不输入 30 篇原文，只输入:
   - 昨日摘要（1 份）
   - 最相关的 2 份周摘要
   - 最近 30 天未完成 actions（最多 8 条）
4. 若输入仍超限，按 `语义相似度 > 时间新鲜度 > 覆盖多样性` 规则裁剪

### 9.4 检索与排序策略

- 双路召回：关键词召回 + 向量召回
- 综合打分：

```text
score = 0.45 * similarity + 0.35 * recency + 0.20 * frequency
```

- 选择 Top-K（建议 K=8~12）进入 Prompt
- 去重规则：同主题高相似片段只保留信息密度更高的一条

### 9.5 Prompt 组织规范

建议统一输入结构：

```json
{
  "task": "organize_inbox | generate_daily_report | inbox_to_card",
  "currentInput": {},
  "retrievedContext": {
    "recentInbox": [],
    "monthlyReportMemory": [],
    "userPreference": {}
  },
  "constraints": {
    "language": "zh-CN",
    "format": "markdown | json",
    "mustCiteEvidence": true
  }
}
```

输出要求（按任务约束）：
- 结构化字段必须完整
- 给出 `confidence`（0-1）
- 关键结论带 `evidenceIds`

### 9.6 模型调用参数建议

- `organize_inbox`: temperature 0.2，偏稳定和可控
- `generate_daily_report`: temperature 0.4，兼顾稳定与表达
- `inbox_to_card`: temperature 0.2，减少字段映射波动
- 超时建议：10~15s；失败重试：最多 2 次（指数退避）

### 9.7 质量保障与降级

- Schema 校验：AI 返回先做 JSON/字段校验，不合法则重试
- 事实约束：信息不足时必须显式写“无法判断”，禁止编造
- 降级方案：AI 不可用时回退到规则模板（保证流程可用）
- 可观测指标：生成成功率、平均耗时、用户采纳率、重复建议率

### 9.8 AI 功能验收补充

在原有验收标准基础上，新增：

1. ✅ 日报生成可使用最近 30 天摘要上下文，且不超模型输入限制
2. ✅ AI 输出包含可追溯依据（evidenceIds）
3. ✅ AI 失败时有可用降级结果，不阻塞主流程
4. ✅ AI 结果结构化字段可通过后端校验

---

## 十、后端落地清单

### 10.1 数据库表结构（Drizzle Schema）

#### api_token 表

```typescript
// apps/server/src/db/schema/api-token.ts
import { mysqlTable, int, varchar, timestamp, bigint } from 'drizzle-orm/mysql-core';

export const apiToken = mysqlTable('api_token', {
  id: int('id').primaryKey().autoincrement(),
  tokenId: varchar('token_id', { length: 191 }).notNull().unique(),
  uid: varchar('uid', { length: 191 }).notNull(),
  name: varchar('name', { length: 100 }).notNull(),
  tokenHash: varchar('token_hash', { length: 255 }).notNull(),
  deletedAt: bigint('deleted_at', { mode: 'number' }).default(0).notNull(),
  createdAt: timestamp('created_at', { mode: 'date', fsp: 3 }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date', fsp: 3 }).defaultNow().notNull(),
});
```

#### inbox 表

```typescript
// apps/server/src/db/schema/inbox.ts
import { mysqlTable, int, varchar, text, timestamp, bigint, boolean } from 'drizzle-orm/mysql-core';

export const inbox = mysqlTable('inbox', {
  id: int('id').primaryKey().autoincrement(),
  uid: varchar('uid', { length: 191 }).notNull(),
  inboxId: varchar('inbox_id', { length: 191 }).notNull().unique(),
  front: text('front').notNull(),
  back: text('back'),
  source: varchar('source', { length: 50 }).notNull().default('manual'),
  category: varchar('category', { length: 50 }).notNull().default('backend'),
  isRead: boolean('is_read').default(false).notNull(),
  deletedAt: bigint('deleted_at', { mode: 'number' }).default(0).notNull(),
  createdAt: timestamp('created_at', { mode: 'date', fsp: 3 }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date', fsp: 3 }).defaultNow().notNull(),
});
```

#### inbox_report 表

```typescript
// apps/server/src/db/schema/inbox-report.ts
import { mysqlTable, int, varchar, text, timestamp, bigint } from 'drizzle-orm/mysql-core';

export const inboxReport = mysqlTable('inbox_report', {
  id: int('id').primaryKey().autoincrement(),
  uid: varchar('uid', { length: 191 }).notNull(),
  inboxReportId: varchar('inbox_report_id', { length: 191 }).notNull().unique(),
  date: varchar('date', { length: 20 }).notNull(),
  content: text('content').notNull(),
  summary: text('summary').$type<ReportSummary>(), // JSON 结构
  deletedAt: bigint('deleted_at', { mode: 'number' }).default(0).notNull(),
  createdAt: timestamp('created_at', { mode: 'date', fsp: 3 }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date', fsp: 3 }).defaultNow().notNull(),
}, (table) => ({
  uidDateUnique: unique().on(table.uid, table.date),
}));
```

### 10.2 DTO 定义（@echoe/dto）

#### API Token DTOs

```typescript
// packages/dto/src/api-token.ts
import { IsString, IsOptional, MaxLength, IsNotEmpty } from 'class-validator';

export class CreateApiTokenDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;
}

export class ApiTokenResponseDto {
  tokenId!: string;
  name!: string;
  createdAt!: Date;
  // token 仅在创建时返回一次
  token?: string;
}

export class ApiTokenListResponseDto {
  items!: ApiTokenResponseDto[];
  total!: number;
}
```

#### Inbox DTOs

```typescript
// packages/dto/src/inbox.ts
import { IsString, IsOptional, MaxLength, IsBoolean, IsEnum, IsInt, Min } from 'class-validator';

export enum InboxSource {
  MANUAL = 'manual',
  API = 'api',
}

export enum InboxCategory {
  FRONT = 'front',
  BACKEND = 'backend',
}

export class CreateInboxDto {
  @IsString()
  @IsNotEmpty()
  front!: string;

  @IsOptional()
  @IsString()
  back?: string;

  @IsOptional()
  @IsEnum(InboxSource)
  source?: InboxSource;

  @IsOptional()
  @IsEnum(InboxCategory)
  category?: InboxCategory;
}

export class UpdateInboxDto {
  @IsOptional()
  @IsString()
  front?: string;

  @IsOptional()
  @IsString()
  back?: string;

  @IsOptional()
  @IsEnum(InboxCategory)
  category?: InboxCategory;
}

export class InboxQueryDto {
  @IsOptional()
  @IsBoolean()
  isRead?: boolean;

  @IsOptional()
  @IsEnum(InboxCategory)
  category?: InboxCategory;

  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @IsInt()
  @Min(1)
  pageSize?: number = 20;
}

export class InboxResponseDto {
  inboxId!: string;
  front!: string;
  back?: string;
  source!: InboxSource;
  category!: InboxCategory;
  isRead!: boolean;
  createdAt!: Date;
  updatedAt!: Date;
}

export class InboxListResponseDto {
  items!: InboxResponseDto[];
  total!: number;
  page!: number;
  pageSize!: number;
}

export class AiOrganizeResponseDto {
  optimizedFront!: string;
  optimizedBack?: string;
  reason!: string;
  confidence!: number;
  fallback!: boolean;
}
```

#### Inbox Report DTOs

```typescript
// packages/dto/src/inbox-report.ts
import { IsString, IsArray, IsNumber, Min, Max, IsOptional } from 'class-validator';

export class ReportSummaryDto {
  @IsArray()
  @IsString({ each: true })
  topics!: string[];

  @IsArray()
  @IsString({ each: true })
  mistakes!: string[];

  @IsArray()
  @IsString({ each: true })
  actions!: string[];
}

export class InboxReportResponseDto {
  inboxReportId!: string;
  date!: string;
  content!: string;
  summary!: ReportSummaryDto;
  createdAt!: Date;
}

export class InboxReportListResponseDto {
  items!: InboxReportResponseDto[];
  total!: number;
}
```

#### Card Conversion DTOs

```typescript
// packages/dto/src/inbox-card.ts
import { IsString, IsOptional, IsBoolean } from 'class-validator';

export class InboxToCardDto {
  @IsOptional()
  @IsString()
  deckId?: string;

  @IsOptional()
  @IsString()
  notetypeId?: string;

  @IsOptional()
  @IsBoolean()
  useAiRecommendation?: boolean;
}

export class InboxToCardResponseDto {
  noteId!: string;
  cardId!: string;
  deckId!: string;
  deckName!: string;
  notetypeId!: string;
  notetypeName!: string;
  aiRecommended!: boolean;
}
```

### 10.3 接口详细规范

#### API Token 接口

| 方法 | 路径 | 请求体 | 响应体 | 错误码 |
| ---- | ---- | ------ | ------ | ------ |
| GET | /api/v1/api-tokens | - | `ApiTokenListResponseDto` | 401: 未认证 |
| POST | /api/v1/api-tokens | `CreateApiTokenDto` | `ApiTokenResponseDto` (含 token) | 400: 参数错误, 401: 未认证 |
| DELETE | /api/v1/api-tokens/:tokenId | - | `{ success: true }` | 401: 未认证, 404: Token 不存在 |

**认证说明**:
- 这三个接口需要 JWT 认证（不支持 Token 认证自己管理自己）
- Token 创建后，`token` 字段仅返回一次，后续不可见

#### Inbox 接口

| 方法 | 路径 | 请求体 | 响应体 | 错误码 |
| ---- | ---- | ------ | ------ | ------ |
| GET | /api/v1/inbox | `InboxQueryDto` (query) | `InboxListResponseDto` | 401: 未认证 |
| POST | /api/v1/inbox | `CreateInboxDto` | `InboxResponseDto` | 400: 参数错误, 401: 未认证 |
| PUT | /api/v1/inbox/:inboxId | `UpdateInboxDto` | `InboxResponseDto` | 400: 参数错误, 401/404 |
| DELETE | /api/v1/inbox/:inboxId | - | `{ success: true }` | 401: 未认证, 404: 不存在 |
| POST | /api/v1/inbox/:inboxId/read | - | `InboxResponseDto` | 401: 未认证, 404: 不存在 |
| POST | /api/v1/inbox/read-all | - | `{ updatedCount: number }` | 401: 未认证 |
| POST | /api/v1/inbox/:inboxId/organize | - | `AiOrganizeResponseDto` | 401/404, 503: AI 服务不可用 |
| POST | /api/v1/inbox/:inboxId/to-card | `InboxToCardDto` | `InboxToCardResponseDto` | 400/401/404, 503: AI 服务不可用 |

#### Inbox Report 接口

| 方法 | 路径 | 请求体 | 响应体 | 错误码 |
| ---- | ---- | ------ | ------ | ------ |
| GET | /api/v1/inbox/reports | `{ page?, pageSize? }` (query) | `InboxReportListResponseDto` | 401: 未认证 |
| GET | /api/v1/inbox/reports/:reportId | - | `InboxReportResponseDto` | 401: 未认证, 404: 不存在 |
| POST | /api/v1/inbox/reports/generate | - | `InboxReportResponseDto` | 401: 未认证, 409: 当天已生成, 503: AI 服务不可用 |

**幂等处理**:
- 重复调用 `generate` 时，返回 409 并附带当天已有的日报 ID
- 前端应提示用户“当天日报已存在，是否重新生成？”

### 10.4 错误码规范

| 错误码 | 错误信息 | 场景 |
| ------ | -------- | ---- |
| 400 | INVALID_PARAMETER | 参数校验失败 |
| 401 | UNAUTHORIZED | 未认证或 Token 无效 |
| 403 | FORBIDDEN | 无权限访问该资源 |
| 404 | NOT_FOUND | 资源不存在 |
| 409 | CONFLICT | 资源冲突（如重复生成日报） |
| 422 | UNPROCESSABLE_ENTITY | 业务规则校验失败 |
| 429 | RATE_LIMIT_EXCEEDED | 请求频率超限 |
| 500 | INTERNAL_ERROR | 服务器内部错误 |
| 503 | AI_SERVICE_UNAVAILABLE | AI 服务不可用 |

**错误响应格式**:

```json
{
  "code": "INVALID_PARAMETER",
  "message": "参数校验失败",
  "details": [
    { "field": "front", "message": "front 不能为空" }
  ]
}
```

### 10.5 异步任务设计

#### 任务队列

建议使用 Bull 或 BullMQ 作为任务队列（基于 Redis）：

```typescript
// apps/server/src/queues/inbox.queue.ts
import { Queue, Worker } from 'bullmq';

export const inboxQueue = new Queue('inbox', {
  connection: redisConnection,
});

// 任务类型
export enum InboxJobType {
  GENERATE_REPORT = 'generate_report',
  ORGANIZE_INBOX = 'organize_inbox',
  TO_CARD_AI = 'to_card_ai',
}

// Worker 处理
export const inboxWorker = new Worker(
  'inbox',
  async (job) => {
    switch (job.name) {
      case InboxJobType.GENERATE_REPORT:
        return await handleGenerateReport(job.data);
      case InboxJobType.ORGANIZE_INBOX:
        return await handleOrganizeInbox(job.data);
      case InboxJobType.TO_CARD_AI:
        return await handleToCardAi(job.data);
    }
  },
  { connection: redisConnection }
);
```

#### 任务调度

| 任务类型 | 触发方式 | 重试策略 | 超时 |
| -------- | -------- | -------- | ---- |
| GENERATE_REPORT | 手动触发 / 定时任务 | 最多 2 次，间隔 30s | 30s |
| ORGANIZE_INBOX | 同步调用（快速）或异步（慢速） | 最多 2 次，间隔 10s | 15s |
| TO_CARD_AI | 同步调用 | 最多 2 次，间隔 10s | 15s |

### 10.6 监控埋点

#### 业务指标

| 指标名 | 说明 | 告警阈值 |
| ------ | ---- | -------- |
| inbox_create_total | 收件箱创建总数 | - |
| inbox_organize_success_rate | AI 整理成功率 | < 80% 告警 |
| inbox_organize_latency_p95 | AI 整理 P95 耗时 | > 10s 告警 |
| report_generate_success_rate | 日报生成成功率 | < 90% 告警 |
| report_generate_latency_p95 | 日报生成 P95 耗时 | > 30s 告警 |
| to_card_success_rate | 卡片化成功率 | < 85% 告警 |
| token_create_total | Token 创建总数 | - |
| token_auth_success_rate | Token 认证成功率 | < 95% 告警 |

#### 技术指标

| 指标名 | 说明 | 告警阈值 |
| ------ | ---- | -------- |
| ai_service_error_rate | AI 服务错误率 | > 5% 告警 |
| ai_service_latency_p99 | AI 服务 P99 耗时 | > 20s 告警 |
| db_query_latency_p95 | 数据库查询 P95 耗时 | > 500ms 告警 |
| queue_job_backlog | 队列任务积压 | > 100 告警 |

### 10.7 定时任务

| 任务名 | Cron 表达式 | 说明 |
| ------ | ----------- | ---- |
| weekly-summary-aggregation | `0 2 * * 0` | 每周日凌晨 2 点聚合周摘要 |
| cleanup-deleted-records | `0 3 * * *` | 每日凌晨 3 点清理软删除超过 30 天的数据 |

### 10.8 开发任务拆分

#### P0 - 核心功能（必须）

1. **API Token 基础**
   - [ ] 创建 `api_token` 表 schema
   - [ ] 实现 Token 生成、存储、校验逻辑
   - [ ] 实现 `ApiTokenAuthMiddleware`
   - [ ] 实现三个 Token 管理接口

2. **Inbox 基础 CRUD**
   - [ ] 创建 `inbox` 表 schema
   - [ ] 实现收件箱 CRUD 接口
   - [ ] 实现已读/全读功能

3. **日报生成**
   - [ ] 创建 `inbox_report` 表 schema（含 summary 字段）
   - [ ] 实现日报生成接口
   - [ ] 实现日报摘要结构
   - [ ] 实现 30 天上下文构建逻辑

#### P1 - AI 功能（重要）

4. **AI 整理**
   - [ ] 实现上下文构建（7 天相关内容 + 30 天摘要）
   - [ ] 实现 Prompt 模板
   - [ ] 实现结构化输出校验
   - [ ] 实现降级策略

5. **AI 卡片化**
   - [ ] 实现 AI 推荐卡组/笔记类型
   - [ ] 实现字段映射逻辑
   - [ ] 实现降级策略

#### P2 - 增强功能（可选）

6. **前端页面**
   - [ ] 收件箱页面
   - [ ] 日报页面
   - [ ] Token 管理页面

7. **监控与告警**
   - [ ] 接入监控埋点
   - [ ] 配置告警规则

8. **定时任务**
   - [ ] 实现周摘要聚合
   - [ ] 实现数据清理任务

### 10.9 ID 生成规则补充

在 `apps/server/src/utils/id.ts` 中新增：

```typescript
export function generateApiTokenId(): string {
  return generateTypeId(OBJECT_TYPE.API_TOKEN);
}

export function generateInboxId(): string {
  return generateTypeId(OBJECT_TYPE.INBOX);
}

export function generateInboxReportId(): string {
  return generateTypeId(OBJECT_TYPE.INBOX_REPORT);
}
```

在 `apps/server/src/models/constant/type.ts` 中新增：

```typescript
export const OBJECT_TYPE = {
  // ... 现有类型 ...
  API_TOKEN: 'API_TOKEN',
  INBOX: 'INBOX',
  INBOX_REPORT: 'INBOX_REPORT',
} as const;
```
