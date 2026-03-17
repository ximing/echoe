# BIZ-0002 卡片字段模型：richTextFields 与 Anki 兼容链路

## Status
Accepted

## Date
2026-03-17

## Context
Echoe 既要支持富文本编辑能力，又要保持 Anki 导入导出兼容。  
如果字段转换逻辑分散在多个入口，容易导致 `richTextFields` 与兼容字段不一致。

## Decision
1. 创建/更新卡片字段统一走字段归一化流程，避免多入口重复实现。
2. `richTextFields` 用于表达富文本结构；兼容字段（`fieldsJson/flds/sfld/csum/fldNames`）通过统一转换生成。
3. Anki 兼容链路保持 `flds/sfld/csum` 语义稳定，不因富文本能力被破坏。
4. `data` 空值约定统一为 `'{}'`。

## Constraint / Source of Truth
该条目是卡片内容模型的业务事实来源：富文本能力与 Anki 兼容是并行约束，不是二选一。

## Evidence
- `apps/server/src/services/echoe-note.service.ts`
- `apps/server/src/lib/note-field-normalizer.ts`
- `packages/dto/src/echoe.ts`
- `.catpaw/rules/anki.md`
- `apps/server/src/services/echoe-export.service.ts`
- `apps/server/src/services/echoe-import.service.ts`

## Impact
### 对技术方案设计
- 新入口（如 inbox 转卡片）要明确字段归一化策略。
- 方案需说明富文本与兼容字段如何保持一致。

### 对 PRD 设计
- PRD 必须区分“编辑体验字段”与“兼容导入导出字段”的职责。

## Guardrails / Acceptance Checks
- [ ] create/update 入口使用统一 normalizer
- [ ] richText 与兼容字段关系在实现中可追溯
- [ ] 导入导出链路仍满足 Anki 格式约束
- [ ] `data` 默认值保持 `'{}'`

## Change Log
- 2026-03-17: 初始建立卡片字段模型 ADR。
