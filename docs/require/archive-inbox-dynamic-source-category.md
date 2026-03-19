# PRD 归档: 收件箱来源与类别动态化

**文档版本**: v1.0
**归档日期**: 2026-03-19
**原始PRD路径**: tasks/archive/prd-inbox-dynamic-source-category.md
**责任人**: 全栈团队
**当前状态**: ✅ 已完成 (100%)

---

## 一、需求概述

当前收件箱(Inbox)的来源(Source)和类别(Category)使用固定的 TypeScript 枚举值存储,无法动态扩展。用户希望能够动态创建新的来源和类别,同时支持在 web 界面上通过这两个字段进行筛选。

### 核心目标
- 将 InboxSource 和 InboxCategory 从固定枚举改为可动态创建的数据库实体
- 支持在创建收件箱时自动创建不存在的 source/category
- 支持手动创建、获取、删除 source/category
- 按租户隔离 source/category 数据
- 在 web 界面上提供 source/category 的筛选功能
- 保持向后兼容,现有枚举值自动迁移为默认数据

---

## 二、实现状态分析

### 2.1 已完成功能 (✅)

- ✅ **US-001**: 创建 source 和 category 数据库表
  - 创建 `inbox_source` 和 `inbox_category` 表
  - 字段: id, uid, name, type, created_at, updated_at
  - name 字段添加唯一索引 (uid + name + type 组合唯一)
  - 代码位置: `apps/server/src/db/schema/inbox-source.ts`, `inbox-category.ts`

- ✅ **US-002**: 迁移现有枚举数据到数据库
  - 创建初始化数据脚本,将现有枚举值插入数据库
  - 确保每个租户首次使用时自动创建默认数据
  - 代码位置: `apps/server/src/services/inbox-source-category.service.ts`

- ✅ **US-003**: 后端 API - 获取 source/category 列表
  - `GET /api/v1/inbox/sources` - 返回当前用户的所有 source
  - `GET /api/v1/inbox/categories` - 返回当前用户的所有 category
  - 支持 @CurrentUser() 认证
  - 代码位置: `apps/server/src/controllers/v1/inbox-source-category.controller.ts`

- ✅ **US-004**: 后端 API - 手动创建 source/category
  - `POST /api/v1/inbox/sources` - 创建新的 source
  - `POST /api/v1/inbox/categories` - 创建新的 category
  - 同一租户下 name 不能重复(返回 400 错误)
  - 代码位置: `apps/server/src/controllers/v1/inbox-source-category.controller.ts`

- ✅ **US-005**: 后端 API - 删除 source/category
  - `DELETE /api/v1/inbox/sources/:id` - 删除指定 source
  - `DELETE /api/v1/inbox/categories/:id` - 删除指定 category
  - 删除时将所有使用该 source/category 的收件箱的对应字段设为 null
  - 代码位置: `apps/server/src/controllers/v1/inbox-source-category.controller.ts`

- ✅ **US-006**: 后端 API - 创建收件箱时自动创建 source/category
  - 修改 CreateInboxDto, source 和 category 改为可选字符串类型
  - 创建时如果 source/category 不存在则自动创建
  - 保持向后兼容
  - 代码位置: `apps/server/src/services/inbox.service.ts`

- ✅ **US-007**: 后端 API - 更新收件箱时支持动态 source/category
  - 修改 UpdateInboxDto, source 和 category 改为可选字符串类型
  - 更新时支持传入新的 source/category 值(自动创建)
  - 代码位置: `apps/server/src/services/inbox.service.ts`

- ✅ **US-008**: 后端 API - 按 source/category 筛选收件箱
  - 修改 InboxQueryParams, source 和 category 改为可选字符串类型
  - 列表接口支持按 source/category 名称筛选
  - 代码位置: `apps/server/src/services/inbox.service.ts`

- ✅ **US-009**: 前端 - 获取 source/category 列表 API
  - 实现 `getInboxSources()` 和 `getInboxCategories()`
  - 代码位置: `apps/web/src/api/inbox-source-category.ts`

- ✅ **US-010**: 前端 - 收件箱列表页添加 source/category 筛选
  - 添加 source/category 筛选下拉框
  - 下拉选项从 API 获取
  - 筛选状态通过 URL 参数保存
  - 代码位置: `apps/web/src/pages/inbox/inbox-page.tsx`

- ✅ **US-011**: 前端 - 创建/编辑收件箱时支持下拉选择 source/category
  - source/category 改为下拉选择(选项从 API 获取)
  - 支持输入新值并直接创建新的 source/category
  - 代码位置: `apps/web/src/components/inbox/CreateInboxDialog.tsx`, `EditInboxDialog.tsx`

- ✅ **US-012**: 前端 - 管理 source/category 页面
  - 创建收件箱设置页面,包含 source 和 category 管理
  - 显示所有已创建的 source/category 列表
  - 提供创建新 source/category 的表单
  - 提供删除功能(带确认对话框)
  - 显示每个 source/category 被多少收件箱使用
  - 代码位置: `apps/web/src/pages/settings/components/inbox-categories-settings.tsx`

### 2.2 关键技术决策

#### 决策 1: 自动创建策略
- **决策内容**: 创建收件箱时,如果 source/category 不存在则自动创建
- **Why**: 提升用户体验,减少手动创建步骤
- **How to apply**: 在 InboxService 创建逻辑中检查并创建

#### 决策 2: 删除时字段清空策略
- **决策内容**: 删除 source/category 时,将关联的收件箱字段设为 null,而非删除收件箱
- **Why**: 避免数据丢失,保留收件箱内容
- **How to apply**: 删除前查询关联收件箱并批量更新

#### 决策 3: 向后兼容策略
- **决策内容**: 保留原有枚举定义,作为类型定义和默认值
- **Why**: 避免破坏现有代码,平滑过渡
- **How to apply**: 枚举值作为默认数据初始化到数据库

---

## 三、变更记录

| 日期 | 变更内容 | 原因 | 影响范围 |
|------|---------|------|---------|
| 2026-03-17 | 初始 PRD 创建 | 项目需求 | 全部 |
| 2026-03-17 | 实现数据库表和 API | 开发进度 | US-001~US-008 |
| 2026-03-18 | 实现前端页面 | 开发进度 | US-009~US-012 |
| 2026-03-19 | 归档文档生成 | 项目里程碑 | - |

---

## 四、架构影响

### 4.1 数据库 Schema
- 新增 2 个表: `inbox_source`, `inbox_category`
- `inbox` 表的 source/category 字段类型保持不变(VARCHAR)

### 4.2 API 接口
- 新增 6 个 REST API 端点
- 修改 inbox 创建/更新接口逻辑

### 4.3 前端组件
- 修改收件箱列表页筛选逻辑
- 修改收件箱创建/编辑对话框
- 新增设置页面子页面

---

## 五、技术债务

### 5.1 未完成功能
无(所有功能已完成)

### 5.2 已知问题
无

### 5.3 优化建议
- 考虑添加 source/category 的"合并"功能
- 考虑添加 source/category 的"重命名"功能
- 考虑添加 source/category 的使用统计

---

## 六、依赖关系

### 上游依赖
- PRD: Inbox Design (收件箱基础功能)

### 下游依赖
无

---

## 七、验收标准

✅ **已通过**
- 用户可以创建自定义 source/category, 2步内完成
- 收件箱列表筛选响应时间 < 200ms
- 保持现有功能100%兼容,无数据丢失
- 所有 User Stories 验收通过

---

## 八、相关文档

- [Inbox Design PRD](./archive-inbox-design.md)

---

**归档审批**
- 技术负责人: ______
- 产品负责人: ______
- 归档日期: 2026-03-19
