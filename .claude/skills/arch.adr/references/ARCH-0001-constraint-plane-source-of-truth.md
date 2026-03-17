# ARCH-0001 Constraint Plane 与 Source of Truth

## Status
Accepted

## Date
2026-03-17

## Context
Echoe 需要把“工程规范”和“业务规则”从零散知识转成可持续复用的架构资产。  
如果只靠口头传递或一次性文档，随着人员变更和时间推移，容易出现规则失真，导致方案评审反复返工与架构漂移。

## Decision
1. 将知识沉淀定义为架构能力，而非临时文档工作。
2. 架构知识分成两个平面：
   - Constraint Plane：工程 Guardrails（技术硬约束）
   - Source of Truth：业务事实来源（逻辑硬约束）
3. 使用 ADR 作为承载格式，按主题拆分到 `references/`，禁止单一大文件。
4. `SKILL.md` 只维护索引与执行协议，正文在各 ADR 文件独立维护。

## Constraint / Source of Truth
- Guardrails 目标：防止代码质量退化，降低低级错误。
- Source of Truth 目标：消除产品与技术理解差，避免规则冲突。

## Evidence
- `.claude/skills/arch.adr/SKILL.md`
- 用户决策：将规范沉淀定义为 ADR，并要求分散在 `references/`。

## Impact
### 对技术方案设计
- 方案必须引用对应 ADR 条目，不能跳过约束平面。
- 涉及跨模块改动时，需要同步更新相关 ADR。

### 对 PRD 设计
- PRD 需要显式标注受哪些业务事实约束。
- 新业务规则若影响现有事实，应触发 ADR 新增或修订。

## Guardrails / Acceptance Checks
- [ ] 没有使用统一 mega 文件承载全部规则。
- [ ] ADR 按主题拆分，且索引只在 `SKILL.md`。
- [ ] 每个 ADR 都能追溯证据来源。

## Change Log
- 2026-03-17: 初始建立架构元 ADR。
