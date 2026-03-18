# BIZ-0004 媒体文件导入处理策略

## Status
Accepted

## Date
2026-03-18

## Context
APKG 导入功能需要处理 Anki 包中的媒体文件（图片、音频、视频等），包括提取、上传和引用更新。

## Decision
1. **导入顺序**：媒体文件必须在笔记导入之前完成上传和存储，获取文件名映射后再导入笔记。

2. **文件名映射链路**：
   - Anki 媒体文件在 ZIP 中以数字命名（0, 1, 2...）
   - 通过 media JSON 映射获取原始文件名
   - 上传到 Echoe 存储后生成新文件名：`{timestamp}-{hash}.{ext}`

3. **去重策略**：使用 SHA1 hash 对媒体文件去重，相同内容的文件只存储一份。

4. **引用更新**：笔记内容中的媒体引用（`<img src="...">` 和 `[sound:...]`）需要替换为 Echoe 存储的文件名。

## Constraint / Source of Truth
这是 APKG 媒体导入的业务规则，所有相关实现必须遵循。

## Evidence
- `apps/server/src/services/echoe-import.service.ts` - 媒体导入逻辑
- `apps/server/src/services/echoe-media.service.ts` - 媒体上传服务
- `tasks/progress.txt` - US-005 实现记录

## Impact
### 对技术方案设计
- 导入流程必须是：解析媒体 → 上传媒体 → 获取映射 → 导入笔记
- 媒体上传 API 需要返回存储后的文件名

### 对 PRD 设计
- 媒体导入需要明确依赖关系和顺序

## Guardrails / Acceptance Checks
- [ ] 媒体文件先于笔记上传
- [ ] 使用 SHA1 hash 去重
- [ ] 文件名格式为 timestamp-hash.extension
- [ ] 笔记内容中的媒体引用正确替换

## Change Log
- 2026-03-18: 初始建立媒体文件导入处理策略。
