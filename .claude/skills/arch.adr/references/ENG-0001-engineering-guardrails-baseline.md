# ENG-0001 工程 Guardrails 基线

## Status
Accepted

## Date
2026-03-17

## Context
Echoe 是多端 + 多服务仓库。缺少稳定工程约束会导致同类问题反复出现，例如日志不统一、迁移流程不一致、前端状态管理模式漂移。

## Decision
建立工程基线 Guardrails，作为默认必须遵守的约束：

1. 服务端日志必须使用 `@echoe/logger`，禁止 `console.*`
2. 数据库层禁止外键，关系完整性在应用层保证
3. 任何表结构变更必须走迁移脚本流程
4. 业务 ID 生成统一走 `apps/server/src/utils/id.ts`
5. 前端状态管理统一使用 `@rabjs/react`
6. 页面级组件 Service 在页面 `bindServices` 统一注册，子组件通过 Domain + `useService`
7. Web 图标统一使用 `lucide-react`
8. 不删除既有单元测试，行为变更需补关键测试
9. pnpm workspace 仓库安装依赖使用 `pnpm`
10. Python 网络请求默认使用 `urllib`（除非规则另行豁免）

## Constraint / Source of Truth
这是 Constraint Plane 的基础条目，优先级高于模块内部“约定俗成”。

## Evidence
- `CLAUDE.md`
- `.catpaw/rules/base.md`
- `.catpaw/rules/lint.md`
- `.catpaw/rules/web.md`
- `.catpaw/rules/page-component-service.md`
- `.catpaw/rules/unit-test.md`

## Impact
### 对技术方案设计
- 方案需包含“如何满足基线 Guardrails”的实现点。
- 架构评审可直接据此做硬约束检查。

### 对 PRD 设计
- 涉及可观测性、数据一致性、可维护性要求时，需参考该基线条目。

## Guardrails / Acceptance Checks
- [ ] 新代码无 `console.*`（服务端）
- [ ] 结构变更有迁移脚本
- [ ] 前端服务注册符合页面级模式
- [ ] 无跨规则技术栈漂移

## Change Log
- 2026-03-17: 初始建立工程 Guardrails 基线。
