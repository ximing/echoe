# ENG-0002: 数据库与存储约束

## Status
Accepted

## Date
2026-03-17

## Context
Echoe 使用 MySQL (Drizzle ORM) + LanceDB (向量搜索) 的双数据库架构。数据库设计有一系列必须遵守的约束，违反这些约束会导致迁移失败、索引错误或数据丢失。

## Decision

### 核心约束

1. **VARCHAR 主键长度限制 191 字符**
   - MySQL utf8mb4 索引限制 (767 bytes / 4 bytes per char = 191)
   - 所有主键和业务 ID 必须使用最多 191 字符
   - 使用 UUID v7 (36 chars) 或 nanoid (12-21 chars)

2. **禁止数据库级外键约束**
   - 关系 ID 字段使用索引 varchar 而非 FK 引用
   - 完整性在应用层 (Service 层) 实现

3. **软删除模式 (通用)**
   - 所有表通过 `deletedAt bigint` 字段实现软删除
   - `deletedAt = 0` 表示活跃，`deletedAt > 0` 表示删除时间戳
   - 使用 `active-row-predicates.ts` 中的断言

4. **时间戳毫秒精度**
   - 用户可见时间戳：`timestamp('field', { mode: 'date', fsp: 3 })`
   - Card/review 时间戳：`bigint(..., { mode: 'number' })` Unix ms

5. **多租户隔离索引**
   - 所有闪卡表需要 `uid` 字段
   - 复合索引 `(uid, other_field)`，唯一约束包含 uid

6. **JSON 列类型安全**
   - 使用 `.$<type>()` 方法确保类型安全
   - 示例：`json().$type<YourInterface>()`

7. **迁移流程**
   - 必须先 `pnpm build` 再 `migrate:generate`
   - drizzle.config.ts 必须直接读取 `process.env`

## Constraint / Source of Truth
这是 Constraint Plane 的数据库约束条目，所有数据库相关实现必须遵守。

## Evidence

| 证据类型 | 路径/位置 |
|----------|-----------|
| 代码 | `apps/server/src/db/schema/` |
| 代码 | `apps/server/src/utils/active-row-predicates.ts` |
| 代码 | `apps/server/drizzle.config.ts` |
| 文档 | `CLAUDE.md` |

## Impact

### Tech Design Impact
- 违反 VARCHAR 191 限制会导致迁移失败
- 外键约束缺失需要服务层显式处理级联
- 软删除是所有查询的必需过滤条件

### PRD Impact
- 数据恢复依赖于软删除设计
- 多租户隔离是 SaaS 功能的基础

## Guardrails / Acceptance Checks
- [ ] 所有 VARCHAR 主键/关联 ID ≤ 191 字符
- [ ] 无 FOREIGN KEY 约束定义
- [ ] 查询包含 `deletedAt = 0` 条件
- [ ] 时间戳字段使用 fsp: 3
- [ ] 闪卡表有 uid 字段和复合索引

## Change Log
| Date | Version | Change | Author |
|------|---------|--------|--------|
| 2026-03-17 | 1.0 | 初始化 - 来自 init.adr 扫描 | - |
