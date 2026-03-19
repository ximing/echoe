# PRD 归档: 收件箱与开放 API Token 功能

**文档版本**: v1.0
**归档日期**: 2026-03-19
**原始PRD路径**: tasks/archive/2026-03-16-inbox-design.md
**责任人**: 全栈团队
**当前状态**: ✅ 已完成 (95%)

---

## 一、需求概述

实现收件箱功能和通用 API Token 能力,支持手动/API 推入内容、AI 整理、日报生成和卡片化功能。收件箱作为知识输入的缓冲区,配合 AI 能力帮助用户整理和沉淀知识。

### 核心目标
- 实现通用 API Token 系统,支持外部应用推送内容
- 实现收件箱内容管理(CRUD、已读标记、分类筛选)
- 实现 AI 整理单条内容(补全 back、优化表达)
- 实现收件箱日报生成(当日内容汇总 + 洞察建议)
- 实现卡片化功能(Inbox → Note/Card 转换)
- 实现 Source/Category 动态管理

---

## 二、实现状态分析

### 2.1 已完成功能 (✅)

#### 通用 API Token
- ✅ 数据库表: `api_token`
  - 字段: id, tokenId, uid, name, tokenHash, deletedAt, createdAt, updatedAt
  - 代码位置: `apps/server/src/db/schema/api-token.ts`

- ✅ API 接口:
  - `GET /api/v1/api-tokens` - 获取 Token 列表
  - `POST /api/v1/api-tokens` - 创建新 Token
  - `DELETE /api/v1/api-tokens/:tokenId` - 删除 Token
  - 代码位置: `apps/server/src/controllers/v1/api-token.controller.ts`

- ✅ Token 认证中间件:
  - `ApiTokenAuthMiddleware` - 验证 Token 有效性
  - Token 与 JWT 认证共存,优先级: Token > JWT
  - 代码位置: `apps/server/src/middlewares/api-token-auth.middleware.ts`

#### 收件箱内容
- ✅ 数据库表: `inbox`
  - 字段: id, uid, inboxId, front, back, source, category, isRead, deletedAt, createdAt, updatedAt
  - 支持富文本存储(TipTap JSON)
  - 代码位置: `apps/server/src/db/schema/inbox.ts`

- ✅ API 接口:
  - `GET /api/v1/inbox` - 获取收件箱列表(支持分页、筛选)
  - `POST /api/v1/inbox` - 添加内容
  - `PUT /api/v1/inbox/:inboxId` - 更新内容
  - `DELETE /api/v1/inbox/:inboxId` - 删除内容
  - `POST /api/v1/inbox/:inboxId/read` - 标记已读
  - `POST /api/v1/inbox/read-all` - 一键全读
  - 代码位置: `apps/server/src/controllers/v1/inbox.controller.ts`

#### AI 整理功能
- ✅ API 接口:
  - `POST /api/v1/inbox/:inboxId/organize` - AI 整理单条内容
  - 返回: optimizedFront, optimizedBack, reason, confidence, fallback
  - 代码位置: `apps/server/src/services/inbox-ai.service.ts`

- ✅ 上下文构建策略:
  - L0(当前输入): 当前 inbox 内容
  - L1(短期记忆): 最近7天相关 inbox (Top 10)
  - L2(中期记忆): 最近30天日报摘要
  - L3(偏好记忆): 用户最近使用的 deck/notetype

- ✅ 质量约束:
  - 结构化输出(JSON Schema 校验)
  - 信息不足时显式声明
  - 降级策略(AI 失败时返回原始内容)

#### 收件箱日报
- ✅ 数据库表: `inbox_report`
  - 字段: id, uid, inboxReportId, date, content, summary, deletedAt, createdAt, updatedAt
  - `summary` 字段存储结构化摘要(topics, mistakes, actions)
  - 代码位置: `apps/server/src/db/schema/inbox-report.ts`

- ✅ API 接口:
  - `GET /api/v1/inbox/reports` - 获取日报列表
  - `GET /api/v1/inbox/reports/:reportId` - 获取日报详情
  - `POST /api/v1/inbox/reports/generate` - 生成当日日报
  - 代码位置: `apps/server/src/controllers/v1/inbox-report.controller.ts`

- ✅ 日报生成逻辑:
  - 阶段A(事实层): 今日新增数量、来源分布、分类分布、已读率
  - 阶段B(洞察层): 重复知识点、薄弱环节、下一步建议
  - 存储产物: 完整日报(Markdown) + 摘要(JSON)

#### 卡片化功能
- ✅ API 接口:
  - `POST /api/v1/inbox/:inboxId/to-card` - 转换为笔记卡片
  - 方式一: 用户选择 deckId 和 notetypeId
  - 方式二: AI 自动选择最合适的卡组和笔记类型
  - 代码位置: `apps/server/src/services/inbox.service.ts`

#### Source/Category 动态管理
- ✅ 数据库表: `inbox_source`, `inbox_category`
  - 支持用户自定义 source 和 category
  - 按租户隔离
  - 代码位置: `apps/server/src/db/schema/inbox-source.ts`, `inbox-category.ts`

- ✅ API 接口:
  - `GET /api/v1/inbox/sources` - 获取 source 列表
  - `POST /api/v1/inbox/sources` - 创建 source
  - `DELETE /api/v1/inbox/sources/:id` - 删除 source
  - Category 接口类似
  - 代码位置: `apps/server/src/controllers/v1/inbox-source-category.controller.ts`

- ✅ 创建时自动创建:
  - 创建 inbox 时,如果 source/category 不存在则自动创建
  - 保持向后兼容

#### 前端页面
- ✅ 收件箱页面 (`/inbox`)
  - 列表展示、添加、编辑、删除
  - 标记已读/全读
  - AI 整理、卡片化按钮
  - Source/Category 筛选
  - 代码位置: `apps/web/src/pages/inbox/inbox-page.tsx`

- ✅ 日报页面 (`/inbox/reports`)
  - 日报列表、查看详情、生成当日日报
  - 代码位置: `apps/web/src/pages/inbox/inbox-reports-page.tsx`

- ✅ 设置页 - Token 管理 (`/settings/api-tokens`)
  - Token 列表、创建、删除
  - 代码位置: `apps/web/src/pages/settings/components/api-tokens-settings.tsx`

### 2.2 关键技术决策

#### 决策 1: AI 上下文构建策略
- **决策内容**: 分层记忆 + 检索裁剪,不直接把历史内容全量喂给 AI
- **Why**: 防止上下文过载,提升 AI 响应质量
- **How to apply**: L0~L3 分层,总输入控制在 6k tokens 以内

#### 决策 2: 日报摘要结构化存储
- **决策内容**: 每次日报生成后,额外产出结构化摘要(topics/mistakes/actions)
- **Why**: 供后续 AI 任务复用,避免重复解析长文本
- **How to apply**: `summary` 字段存储 JSON,最近30天摘要聚合为周摘要

#### 决策 3: Source/Category 动态化
- **决策内容**: 将固定枚举改为数据库实体,支持用户自定义
- **Why**: 提升灵活性,适应不同用户的分类需求
- **How to apply**: 创建时自动创建不存在的 source/category

---

## 三、变更记录

| 日期 | 变更内容 | 原因 | 影响范围 |
|------|---------|------|---------|
| 2026-03-16 | 初始 PRD 创建 | 项目需求 | 全部 |
| 2026-03-17 | 实现基础 CRUD | 开发进度 | Inbox, Token |
| 2026-03-17 | 实现富文本支持 | ADR 要求 | Inbox |
| 2026-03-18 | 实现 AI 整理和日报 | 开发进度 | AI 功能 |
| 2026-03-18 | 实现 Source/Category 动态化 | 灵活性需求 | Inbox 筛选 |
| 2026-03-19 | 归档文档生成 | 项目里程碑 | - |

---

## 四、架构影响

### 4.1 数据库 Schema
- 新增 5 个表: `api_token`, `inbox`, `inbox_report`, `inbox_source`, `inbox_category`
- 总计约 35+ 列

### 4.2 API 接口
- 新增 20+ 个 REST API 端点
- Token 认证与 JWT 认证共存

### 4.3 AI 集成
- 新增 `InboxAIService` 处理 AI 整理和日报生成
- 集成 OpenAI API(或其他 LLM)
- 实现 Prompt 模板管理

---

## 五、技术债务

### 5.1 未完成功能 (5%)
- ⚠️ 定时自动生成日报(需要定时任务)
- ⚠️ 批量卡片化功能
- ⚠️ Token 权限细分(只读/读写)
- ⚠️ 收件箱内容来源渠道扩展(飞书/钉钉)

### 5.2 已知问题
无严重问题

### 5.3 优化建议
- 考虑添加 AI 整理的"批量模式"
- 考虑添加日报模板自定义功能
- 考虑添加收件箱内容的全文搜索

---

## 六、依赖关系

### 上游依赖
- PRD: Multi-User Refactor (用户隔离)
- PRD: Inbox Rich Text (富文本支持)

### 下游依赖
- PRD: Inbox Dynamic Source Category (Source/Category 管理)

---

## 七、验收标准

✅ **已通过**
- 可以创建、删除、查看 Token
- Token 可以调用需要认证的 API
- 可以手动添加收件箱内容
- 可以通过 API 推入内容到收件箱
- 可以标记已读/一键全读
- AI 可以整理内容(补全/优化)
- 可以生成和查看日报
- 可以将收件箱内容转为卡片
- 所有数据支持软删除
- Source/Category 可以动态创建和管理

⚠️ **部分通过**
- 定时自动生成日报(未实现)
- 批量卡片化(未实现)

---

## 八、相关文档

- [Inbox Rich Text PRD](./archive-inbox-rich-text.md)
- [Inbox Dynamic Source Category PRD](./archive-inbox-dynamic-source-category.md)
- [AI 技术方案文档](../architecture/ai-integration.md)

---

**归档审批**
- 技术负责人: ______
- 产品负责人: ______
- 归档日期: 2026-03-19
