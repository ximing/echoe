# PRD: 收件箱来源与类别动态化

## Introduction

当前收件箱(Inbox)的来源(Source)和类别(Category)使用固定的 TypeScript 枚举值存储，无法动态扩展。用户希望能够动态创建新的来源和类别，同时支持在 web 界面上通过这两个字段进行筛选。

## Goals

- 将 InboxSource 和 InboxCategory 从固定枚举改为可动态创建的数据库实体
- 支持在创建收件箱时自动创建不存在的 source/category
- 支持手动创建、获取、删除 source/category
- 按租户隔离 source/category 数据
- 在 web 界面上提供 source/category 的筛选功能
- 保持向后兼容，现有枚举值自动迁移为默认数据

## User Stories

### US-001: 创建 source 和 category 数据库表
**Description:** 作为开发者，我需要创建数据库表来存储用户自定义的 source 和 category，使数据能够持久化。

**Acceptance Criteria:**
- [ ] 创建 inbox_source 表，包含字段: id(PK), uid(租户ID), name(名称), type(source|category), created_at, updated_at
- [ ] name 字段添加唯一索引 (uid + name + type 组合唯一)
- [ ] 生成并执行数据库迁移
- [ ] Typecheck 通过
- [ ] 编写并运行单元测试

### US-002: 迁移现有枚举数据到数据库
**Description:** 作为开发者，我需要将现有的固定枚举值迁移为数据库中的默认数据，确保向后兼容。

**Acceptance Criteria:**
- [ ] 创建初始化数据脚本，将现有的 5 个 source 值和 6 个 category 值插入数据库
- [ ] 确保每个租户首次使用时自动创建这些默认数据
- [ ] Typecheck 通过

### US-002: 后端 API - 获取 source/category 列表
**Description:** 作为前端开发者，我需要 API 来获取当前租户所有的 source 和 category 列表。

**Acceptance Criteria:**
- [ ] 新增 GET /api/v1/inbox/sources 接口，返回当前用户的所有 source
- [ ] 新增 GET /api/v1/inbox/categories 接口，返回当前用户的所有 category
- [ ] 支持 @CurrentUser() 认证
- [ ] Typecheck 通过
- [ ] 编写单元测试

### US-003: 后端 API - 手动创建 source/category
**Description:** 作为用户，我可以通过 API 手动创建新的 source 或 category。

**Acceptance Criteria:**
- [ ] 新增 POST /api/v1/inbox/sources 接口，创建新的 source
- [ ] 新增 POST /api/v1/inbox/categories 接口，创建新的 category
- [ ] 请求体包含 name 字段
- [ ] 同一租户下 name 不能重复（返回 400 错误）
- [ ] 支持 @CurrentUser() 认证
- [ ] Typecheck 通过
- [ ] 编写单元测试

### US-004: 后端 API - 删除 source/category
**Description:** 作为用户，我可以删除不再使用的 source 或 category，关联的收件箱数据会被清空。

**Acceptance Criteria:**
- [ ] 新增 DELETE /api/v1/inbox/sources/:id 接口，删除指定 source
- [ ] 新增 DELETE /api/v1/inbox/categories/:id 接口，删除指定 category
- [ ] 删除时将所有使用该 source/category 的收件箱的对应字段设为 null（收件箱本身不删除）
- [ ] 只能删除自己的数据（租户隔离）
- [ ] 支持 @CurrentUser() 认证
- [ ] Typecheck 通过
- [ ] 编写单元测试

### US-005: 后端 API - 创建收件箱时自动创建 source/category
**Description:** 作为用户，我在创建收件箱时如果传入不存在的 source 或 category，系统自动创建它们。

**Acceptance Criteria:**
- [ ] 修改 CreateInboxDto，source 和 category 改为可选字符串类型
- [ ] 创建收件箱时，如果 source 字符串不存在于数据库，则自动创建
- [ ] 创建收件箱时，如果 category 字符串不存在于数据库，则自动创建
- [ ] 保持向后兼容：如果传入的是枚举值（如 'manual'），也能正常工作
- [ ] Typecheck 通过
- [ ] 编写单元测试

### US-006: 后端 API - 更新收件箱时支持动态 source/category
**Description:** 作为用户，我在更新收件箱时可以更改 source/category 为新的值，系统自动创建不存在的选项。

**Acceptance Criteria:**
- [ ] 修改 UpdateInboxDto，source 和 category 改为可选字符串类型
- [ ] 更新收件箱时支持传入新的 source/category 值（自动创建）
- [ ] Typecheck 通过

### US-007: 后端 API - 按 source/category 筛选收件箱
**Description:** 作为用户，我可以通过 source 或 category 筛选收件箱列表。

**Acceptance Criteria:**
- [ ] 修改 InboxQueryParams，source 和 category 改为可选字符串类型
- [ ] 列表接口支持按 source 名称筛选
- [ ] 列表接口支持按 category 名称筛选
- [ ] Typecheck 通过

### US-008: 前端 - 获取 source/category 列表 API
**Description:** 作为前端开发者，我需要调用 API 获取当前用户的 source 和 category 列表供下拉选择使用。

**Acceptance Criteria:**
- [ ] 在 web 端创建 inboxSourceService，调用 GET /api/v1/inbox/sources
- [ ] 在 web 端创建 inboxCategoryService，调用 GET /api/v1/inbox/categories
- [ ] Typecheck 通过

### US-009: 前端 - 收件箱列表页添加 source/category 筛选
**Description:** 作为用户，我可以在收件箱列表页通过下拉菜单筛选特定 source 或 category 的收件箱。

**Acceptance Criteria:**
- [ ] 在收件箱列表页添加 source 筛选下拉框
- [ ] 在收件箱列表页添加 category 筛选下拉框
- [ ] 下拉选项从 API 获取
- [ ] 筛选状态通过 URL 参数保存
- [ ] Typecheck 通过
- [ ] Verify in browser using dev-browser skill

### US-010: 前端 - 创建/编辑收件箱时支持下拉选择 source/category
**Description:** 作为用户，我在创建或编辑收件箱时可以从下拉菜单选择 source 和 category，也可以输入新值直接创建。

**Acceptance Criteria:**
- [ ] 创建收件箱表单中，source 改为下拉选择（选项从 API 获取）
- [ ] 创建收件箱表单中，category 改为下拉选择（选项从 API 获取）
- [ ] 编辑收件箱表单同样支持
- [ ] 支持输入新值并按 Enter 或点击添加按钮直接创建新的 source/category
- [ ] 新创建的值自动选中
- [ ] Typecheck 通过
- [ ] Verify in browser using dev-browser skill

### US-011: 前端 - 管理 source/category 页面
**Description:** 作为用户，我可以查看、创建和删除自己的 source 和 category。

**Acceptance Criteria:**
- [ ] 创建收件箱设置页面，包含 source 和 category 管理
- [ ] 显示所有已创建的 source/category 列表
- [ ] 提供创建新 source/category 的表单
- [ ] 提供删除功能（带确认对话框）
- [ ] 显示每个 source/category 被多少收件箱使用
- [ ] Typecheck 通过
- [ ] Verify in browser using dev-browser skill

## Functional Requirements

- FR-1: 创建 inbox_source 和 inbox_category 数据库表，按租户隔离
- FR-2: 初始化默认枚举值数据（5个source + 6个category）
- FR-3: GET /api/v1/inbox/sources - 获取当前用户所有 source
- FR-4: GET /api/v1/inbox/categories - 获取当前用户所有 category
- FR-5: POST /api/v1/inbox/sources - 手动创建 source
- FR-6: POST /api/v1/inbox/categories - 手动创建 category
- FR-7: DELETE /api/v1/inbox/sources/:id - 删除 source（关联收件箱字段清空）
- FR-8: DELETE /api/v1/inbox/categories/:id - 删除 category（关联收件箱字段清空）
- FR-9: 创建收件箱时自动创建不存在的 source/category
- FR-10: 更新收件箱时支持动态 source/category
- FR-11: 列表接口支持按 source/category 筛选
- FR-12: 前端收件箱列表页添加筛选下拉框
- FR-13: 前端创建/编辑收件箱使用下拉选择
- FR-14: 前端添加 source/category 管理页面

## Non-Goals

- 不支持 source/category 的重命名功能
- 不支持 source/category 的合并功能
- 不支持跨租户的 source/category 共享
- 不支持 source/category 的导入导出
- 不修改现有的 API 响应格式结构（保持兼容性）

## Technical Considerations

- 现有 InboxSource/InboxCategory 枚举保留用于类型定义和默认值
- 数据库使用 VARCHAR(191) 存储 name 字段（兼容 MySQL 索引限制）
- 删除 source/category 前需检查是否有收件箱引用
- 考虑添加缓存提升列表查询性能
- 前端筛选状态通过 URL query parameters 保持

## Success Metrics

- 用户可以创建自定义 source/category，2步内完成
- 收件箱列表筛选响应时间 < 200ms
- 保持现有功能100%兼容，无数据丢失

## Open Questions

- 无
