# Supersede 模板

> 使用说明：当一个 ADR 替代另一个 ADR 时，使用此模板格式。被替代的 ADR 需要在其 Status 改为 `Superseded`，并在其 `Superseded by` 字段填写新 ADR-ID。

---

## Supersede 流程

### Step 1：创建新 ADR
1. 使用 `TEMPLATE-adr.md` 创建新 ADR
2. 在新 ADR 的 `Supersedes` 字段填写被替代的 ADR-ID
3. 在新 ADR 的 Context 中说明为什么要替代旧决策

### Step 2：更新旧 ADR
1. 打开被替代的 ADR 文件
2. 将 Status 改为 `Superseded`
3. 在 `Superseded by` 字段填写新 ADR-ID
4. 在 Change Log 中添加一条记录

### Step 3：更新索引
在 `.claude/skills/arch.adr/SKILL.md` 的索引表中：
- 旧 ADR 的状态更新为 `Superseded`
- 新 ADR 添加到索引表

---

## 新 ADR 示例片段

```markdown
## 元信息
| 字段 | 值 |
|------|-----|
| Status | `Accepted` |
| Date | 2024-01-15 |
| Supersedes | `ENG-0001` |

## Context
原 `ENG-0001` 使用 UUID 作为主键，但存在以下问题：
1. 索引效率低
2. 排序不友好

因此决定改用 ULID...

## Decision
使用 ULID 替代 UUID 作为主键...
```

---

## 旧 ADR 更新示例片段

```markdown
## 元信息
| 字段 | 值 |
|------|-----|
| Status | `Superseded` |
| Date | 2024-01-10 |
| Superseded by | `ENG-0002` |

## Change Log
| Date | Version | Change | Author |
|------|---------|--------|--------|
| 2024-01-15 | 1.1 | 被 `ENG-0002` 替代 | - |
| 2024-01-10 | 1.0 | 初始创建 | - |
```
