# BIZ-0003 AI 模型调用链：LLMService 与用户模型配置

## Status
Accepted

## Date
2026-03-17

## Context
多模型能力需要以“用户维度配置”为核心。  
若业务层绕过统一服务直接调用底层 SDK，会引发策略不一致、安全校验缺失和配置失配。

## Decision
1. 业务 AI 调用优先通过 `LLMService` 统一封装。
2. 模型读取走用户配置链：`UserModelService` -> default/specified model。
3. API Base URL 必须经过 SSRF 校验后再请求。
4. 业务层直连模型 SDK 视为例外，需显式登记并给出收敛计划。

## Constraint / Source of Truth
该条目是 AI 能力接入的事实来源：模型选择、鉴权、安全校验应统一在调用链内完成。

## Evidence
- `apps/server/src/services/llm.service.ts`
- `apps/server/src/services/user-model.service.ts`
- `apps/server/src/db/schema/user-models.ts`
- `apps/server/src/utils/url-validator.ts`
- `apps/server/src/services/inbox-ai.service.ts`（当前存在直连 SDK 事实）

## Impact
### 对技术方案设计
- 新 AI 需求应先设计“是否复用 LLMService”，再谈业务 Prompt。
- 方案需包含默认模型策略与错误处理策略。

### 对 PRD 设计
- PRD 应体现“用户可配置模型”的产品边界。
- 若存在直连 SDK 的过渡方案，PRD 需说明过渡期限与风险。

## Guardrails / Acceptance Checks
- [ ] 默认模型读取来自用户配置
- [ ] Base URL 请求前完成 SSRF 校验
- [ ] 新业务 AI 入口未绕过 LLMService
- [ ] 例外点有收敛计划

## Change Log
- 2026-03-17: 初始建立 AI 调用链 ADR，并记录直连 SDK 的现状风险。
