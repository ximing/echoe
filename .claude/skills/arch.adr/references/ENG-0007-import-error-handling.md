# ENG-0007 导入错误处理策略：优雅降级

## Status
Accepted

## Date
2026-03-18

## Context
APKG 导入过程中可能遇到文件格式错误、数据库损坏、媒体文件缺失等问题，需要设计合理的错误处理策略。

## Decision
采用**优雅降级（Graceful Degradation）**策略：

1. **部分成功优于全部失败**：
   - 单条记录失败不影响其他记录导入
   - 用户看到 "99/100 笔记导入成功" 比 "0/100 全部失败" 更友好
   - 这是有意的设计选择，而非缺陷

2. **错误分类与处理**：
   - 文件格式错误：拒绝导入，提供明确错误提示
   - 数据库损坏：使用 `pragma('integrity_check')` 检测，记录损坏条目，跳过继续
   - 媒体文件缺失：记录错误，继续处理其他媒体
   - 笔记数据异常：跳过异常笔记，导入其他笔记

3. **错误返回结构**：
   - 返回导入统计（成功/失败数量）
   - 附带失败原因详情列表
   - 错误分类（general/media/notetype/deck/note/revlog）

4. **用户可见的错误提示**：
   - 使用用户友好的语言
   - 提供可操作的建议（如"请重新从 Anki 导出"）

## Constraint / Source of Truth
这是 APKG 导入功能的错误处理约束，所有相关实现必须遵循优雅降级原则。

## Evidence
- `apps/server/src/services/echoe-import.service.ts` - 错误处理逻辑
- `apps/web/src/pages/cards/apkg-import.tsx` - 前端错误展示
- `packages/dto/src/echoe.ts` - ImportResultDto 类型
- `tasks/progress.txt` - US-007 实现记录

## Impact
### 对技术方案设计
- 导入服务需要捕获异常但不抛出阻断
- 需要记录详细的错误信息用于返回

### 对 PRD 设计
- 错误处理策略需要作为需求的一部分

## Guardrails / Acceptance Checks
- [ ] 导入失败不阻断其他记录
- [ ] 错误信息分类清晰
- [ ] 用户提示友好且可操作
- [ ] 返回导入统计和失败详情

## Change Log
- 2026-03-18: 初始建立导入错误处理策略。
