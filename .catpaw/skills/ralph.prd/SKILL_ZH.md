---
name: prd
description:
  '为新功能生成产品需求文档（PRD）。当你需要规划一个功能、启动新项目，或被要求创建 PRD 时使用。触发词包括：create a prd、write prd for、plan this feature、requirements for、spec out。'
user-invocable: true
---

# PRD 生成器

创建详细的产品需求文档，要求清晰、可执行，并且适合直接进入实现阶段。

---

## 工作内容

1. 接收用户给出的功能描述
2. 用多轮迭代方式提出关键澄清问题（带字母选项）
3. 持续提问，直到没有关键歧义（或已明确记录未解决项）
4. 基于用户回答生成结构化 PRD
5. 保存到 `tasks/prd-[feature-name].md`

**重要：** 不要开始实现。只负责创建 PRD。

---

## 第 1 步：澄清问题

只在需求存在歧义时提出关键问题。问题数量没有固定上限。
采用短轮次方式：先问影响最大的关键问题，等待回答，再评估并追问，直到不存在关键歧义。
如果用户暂时无法决定某项内容，请在 `Open Questions` 中显式记录并继续。

重点关注：

- **问题/目标：** 这个功能要解决什么问题？
- **核心功能：** 关键动作有哪些？
- **范围/边界：** 这个功能不应该做什么？
- **成功标准：** 如何判断功能完成？

### 问题格式示例

```
1. 这个功能的主要目标是什么？
   A. 提升新用户引导体验
   B. 提高用户留存率
   C. 降低客服支持成本
   D. 其他：[请说明]

2. 目标用户是谁？
   A. 仅新用户
   B. 仅老用户
   C. 所有用户
   D. 仅管理员用户

3. 功能范围是什么？
   A. 最小可行版本
   B. 完整功能版本
   C. 仅后端/API
   D. 仅 UI
```

这样用户可以快速用类似“1A, 2C, 3D”的方式回答。记得缩进选项。
每一轮结束后，如果仍有关键歧义，继续给出下一批编号问题。

---

## 第 2 步：PRD 结构

按以下章节生成 PRD：

### 1. Introduction/Overview

简要说明该功能以及它要解决的问题。

### 2. Goals

列出具体、可衡量的目标（使用项目符号）。

### 3. User Stories

每条用户故事都需要包含：

- **Title：** 简短且可描述的名称
- **Description：** “作为一个 [用户]，我希望 [功能]，以便 [收益]”
- **Acceptance Criteria：** 可验证的“完成标准”检查清单

每个用户故事应足够小，可在一次聚焦开发中完成。

**格式：**

```markdown
### US-001: [标题]

**Description:** 作为一个 [用户]，我希望 [功能]，以便 [收益]。

**Acceptance Criteria:**

- [ ] 可验证的具体标准
- [ ] 另一条具体标准
- [ ] Typecheck/lint 通过
- [ ] **[仅 UI 用户故事]** 使用 dev-browser skill 在浏览器中验证
```

**重要：**

- 验收标准必须可验证，不能模糊。“运行正常”是坏例子。
  “点击删除前按钮会弹出确认对话框”是好例子。
- **对于任何包含 UI 变更的用户故事：** 必须包含
  “Verify in browser using dev-browser skill” 作为验收标准，确保前端视觉验证被执行。

### 4. Functional Requirements

用编号列出具体功能要求：

- “FR-1: 系统必须允许用户……”
- “FR-2: 当用户点击 X 时，系统必须……”

要求描述必须明确、无歧义。

### 5. Non-Goals (Out of Scope)

明确说明该功能**不包含**什么。这对控制范围至关重要。

### 6. Design Considerations (Optional)

- UI/UX 要求
- 如有原型图，附上链接
- 可复用的现有组件

### 7. Technical Considerations (Optional)

- 已知约束或依赖项
- 与现有系统的集成点
- 性能要求

### 8. Success Metrics

如何衡量成功？

- “将完成 X 的时间减少 50%”
- “将转化率提升 10%”

### 9. Open Questions

仍待澄清的问题或待确认区域。

---

## 面向初级开发者的写作要求

PRD 的读者可能是初级开发者或 AI Agent。因此：

- 表述要明确、无歧义
- 避免术语堆叠，必要时解释术语
- 提供足够细节，让读者理解目的和核心逻辑
- 对需求进行编号，便于引用
- 在有帮助时提供具体示例

---

## 输出要求

- **格式：** Markdown（`.md`）
- **位置：** `tasks/`
- **文件名：** `prd-[feature-name].md`（kebab-case）

---

## PRD 示例

```markdown
# PRD: 任务优先级系统

## Introduction

为任务增加优先级，以便用户聚焦最重要事项。任务可标记为高、中、低优先级，
并通过视觉标识与筛选能力帮助用户更高效地管理工作负载。

## Goals

- 允许为任意任务设置优先级（高/中/低）
- 提供清晰可辨的优先级视觉区分
- 支持按优先级筛选和排序
- 新建任务默认优先级为中

## User Stories

### US-001: 为数据库添加优先级字段

**Description:** 作为开发者，我需要存储任务优先级，以便它能跨会话持久化。

**Acceptance Criteria:**

- [ ] 在 tasks 表新增 priority 列：'high' | 'medium' | 'low'（默认 'medium'）
- [ ] 成功生成并执行迁移
- [ ] Typecheck 通过

### US-002: 在任务卡片上显示优先级标识

**Description:** 作为用户，我希望一眼看到任务优先级，以便知道先处理什么。

**Acceptance Criteria:**

- [ ] 每张任务卡片显示带颜色的优先级徽标（红=高，黄=中，灰=低）
- [ ] 无需 hover 或点击即可看到优先级
- [ ] Typecheck 通过
- [ ] Verify in browser using dev-browser skill

### US-003: 在任务编辑中增加优先级选择器

**Description:** 作为用户，我希望在编辑任务时可以修改其优先级。

**Acceptance Criteria:**

- [ ] 在任务编辑弹窗中提供优先级下拉框
- [ ] 默认选中当前优先级
- [ ] 选择变更后立即保存
- [ ] Typecheck 通过
- [ ] Verify in browser using dev-browser skill

### US-004: 按优先级筛选任务

**Description:** 作为用户，当我需要聚焦时，希望只查看高优先级任务。

**Acceptance Criteria:**

- [ ] 筛选下拉框提供选项：All | High | Medium | Low
- [ ] 筛选状态持久化到 URL 参数
- [ ] 当无匹配任务时展示空状态提示
- [ ] Typecheck 通过
- [ ] Verify in browser using dev-browser skill

## Functional Requirements

- FR-1: 在 tasks 表新增 `priority` 字段（'high' | 'medium' | 'low'，默认 'medium'）
- FR-2: 在每张任务卡片上展示颜色区分的优先级徽标
- FR-3: 在任务编辑弹窗中加入优先级选择器
- FR-4: 在任务列表头部增加优先级筛选下拉框
- FR-5: 每个状态列内按优先级排序（high > medium > low）

## Non-Goals

- 不做基于优先级的通知或提醒
- 不做基于截止时间的自动优先级分配
- 不做子任务优先级继承

## Technical Considerations

- 复用现有 badge 组件并扩展颜色变体
- 通过 URL search params 管理筛选状态
- 优先级写入数据库，不做运行时计算

## Success Metrics

- 用户在不超过 2 次点击内即可修改优先级
- 高优先级任务能立即在列表顶部被识别
- 任务列表性能无回归

## Open Questions

- 优先级是否应影响同列内任务排序？
- 是否要增加优先级快捷键？
```

---

## 检查清单

在保存 PRD 前确认：

- [ ] 已按迭代轮次提出带字母选项的澄清问题
- [ ] 已持续澄清至无关键歧义（或记录未解决项）
- [ ] 已纳入用户回答
- [ ] 用户故事足够小且具体
- [ ] 功能需求已编号且无歧义
- [ ] Non-Goals 章节定义了清晰边界
- [ ] 已保存到 `tasks/prd-[feature-name].md`
