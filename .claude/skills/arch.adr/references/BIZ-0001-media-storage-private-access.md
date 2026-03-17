# BIZ-0001 媒体存储：private bucket + storageKey + 动态访问

## Status
Accepted

## Date
2026-03-17

## Context
媒体链接如果直接持久化为长期 URL，在私有桶场景下会失效或带来安全风险。  
需要稳定支持 public/private bucket，同时保证历史数据可访问。

## Decision
1. 媒体记录落库存储键 `storageKey`，不固化长期可访问 URL。
2. 访问时根据存储配置动态生成 URL：
   - public bucket：返回直连 URL
   - private bucket：返回短时有效访问 URL（presigned/signed）
3. 上传与删除都基于 `storageKey` 路径操作，避免路径漂移。

## Constraint / Source of Truth
该条目是业务数据访问安全的事实来源：对象存储访问策略应由运行时配置决定，不由历史 URL 决定。

## Evidence
- `apps/server/src/services/echoe-media.service.ts`
- `apps/server/src/db/schema/echoe-media.ts`
- `apps/server/src/sources/unified-storage-adapter/s3.adapter.ts`
- `apps/server/src/sources/unified-storage-adapter/base.adapter.ts`

## Impact
### 对技术方案设计
- 新媒体链路必须围绕 `storageKey` 设计。
- 任何“长期 URL 入库”方案应判定为违反约束。

### 对 PRD 设计
- PRD 中需明确 private bucket 的鉴权访问体验与时效行为。

## Guardrails / Acceptance Checks
- [ ] 表结构包含 `storageKey` 且用于访问生成
- [ ] 私有桶访问使用临时 URL
- [ ] 业务表中无长期外链作为唯一访问凭据

## Change Log
- 2026-03-17: 初始建立媒体存储与访问 ADR。
