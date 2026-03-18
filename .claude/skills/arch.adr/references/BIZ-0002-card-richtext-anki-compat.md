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
- 2026-03-18: 新增 FSRS 与 Anki 复习数据转换算法章节。

---

# BIZ-0002-EXTEND FSRS 与 Anki 复习数据转换算法

## Context
APKG 导入功能需要将 Anki 的复习历史（revlog）转换为 Echoe 的 FSRS 学习记录格式，保持学习进度的连续性。

## Decision
1. **Anki ease factor → FSRS difficulty 转换**：
   - Anki ease factor 范围：1300-2500+（permille 千分比）
   - FSRS difficulty 范围：1-10（默认 2.5）
   - 转换公式：`FSRS_difficulty = Anki_factor / 1000`
   - 缺失或为 0 时使用 `FSRS_DIFFICULTY_FALLBACK = 2.5`

2. **Anki revlog 时间戳处理**：
   - Anki revlog 的 `id` 字段本身就是时间戳
   - 支持多种精度：微秒、毫秒、秒
   - 通过检测数值大小判断精度并转换为 Date 对象

3. **FSRS 状态字段**：
   - `stability`：从 Anki interval (ivl) 转换
   - `difficulty`：从 Anki ease factor 转换
   - `lastReview`：从 revlog timestamp 转换

4. **复习记录去重**：
   - 使用 `sourceRevlogId` 字段去重
   - 避免重复导入相同的复习记录

## Evidence
- `apps/server/src/services/echoe-import.service.ts` - revlog 导入逻辑
- `apps/server/src/db/schema/echoe-revlog.ts` - revlog schema
- `tasks/progress.txt` - US-004 实现记录

## Guardrails / Acceptance Checks
- [ ] ease factor 正确转换为 difficulty
- [ ] 时间戳精度自动识别
- [ ] 缺失值使用 fallback 值
- [ ] 复习记录去重逻辑正确
