---
name: arch-adr
description: 读取 Echoe 的 ADR 知识库（`arch.adr/references`）作为架构 Source of Truth，用于技术方案设计、PRD 对齐、架构评审与 Guardrails 检查。只要用户提到“按 ADR 出方案/按 ADR 对齐 PRD/查架构约束/避免架构漂移”，都应立即启用。`。
---

# Echoe ADR 使用技能（Read-Only）

## 角色边界

- 本技能：**读取与应用** ADR（只读）
- `init.adr`：**初始化** ADR 知识库（存量扫描）
- `maintain.adr`：**维护与更新** ADR（可写）
- `check.adr`：**校验** ADR 质量（只读检查）

禁止在本技能中改写 ADR 文件。

## Source of Truth

ADR 的权威来源是：

- 索引：`.claude/skills/arch.adr/SKILL.md`（本文件）
- 正文：`.claude/skills/arch.adr/references/*.md`

若发现索引与正文不一致，应提示切换到 `maintain-adr` 执行修复。

## 架构语义

- **Constraint Plane**：工程 Guardrails，防止质量退化与低级错误。
- **Source of Truth**：业务事实来源，减少产品与技术理解偏差。

## 使用流程

### Step 1：定位问题类型

识别当前任务属于：

- 技术方案设计
- PRD 规则对齐
- 架构评审
- 风险与冲突检查

### Step 2：读取 ADR 索引并选择条目

先读索引表，再按主题读取对应 `references/*.md`。

### Step 3：提炼可执行约束

从 ADR 提炼：

- 必须遵守的工程约束
- 必须遵守的业务事实
- 风险边界与冲突点
- 可验收检查项

### Step 4：输出给用户

默认输出结构：

1. 适用 ADR 清单
2. 技术方案约束清单
3. PRD 设计事实清单
4. 风险与冲突
5. 验收检查清单

## ADR 索引（只读）

| ADR ID    | 类型 | 标题                                             | 状态     | 文件                                                       |
| --------- | ---- | ------------------------------------------------ | -------- | ---------------------------------------------------------- |
| ARCH-0001 | ARCH | Constraint Plane 与 Source of Truth              | Accepted | `references/ARCH-0001-constraint-plane-source-of-truth.md` |
| ENG-0001  | ENG  | 工程 Guardrails 基线                             | Accepted | `references/ENG-0001-engineering-guardrails-baseline.md`   |
| ENG-0002  | ENG  | 数据库与存储约束                                 | Accepted | `references/ENG-0002-database-storage-constraints.md`      |
| ENG-0003  | ENG  | 认证与安全约束                                   | Accepted | `references/ENG-0003-auth-security-constraints.md`         |
| ENG-0004  | ENG  | 前端架构约束                                     | Accepted | `references/ENG-0004-frontend-architecture-constraints.md` |
| ENG-0005  | ENG  | 后端架构约束                                     | Accepted | `references/ENG-0005-backend-architecture-constraints.md`  |
| BIZ-0001  | BIZ  | 媒体存储：private bucket + storageKey + 动态访问 | Accepted | `references/BIZ-0001-media-storage-private-access.md`      |
| BIZ-0002  | BIZ  | 卡片字段模型：richTextFields 与 Anki 兼容链路    | Accepted | `references/BIZ-0002-card-richtext-anki-compat.md`         |
| BIZ-0003  | BIZ  | AI 模型调用链：LLMService 与用户模型配置         | Accepted | `references/BIZ-0003-llm-user-model-call-chain.md`         |

## 示例触发语句

- “按 ADR 给我出这个需求的技术方案约束。”
- “把这个 PRD 按现有架构事实对齐一下。”
- “我想知道这次改动会不会违反 Guardrails。”
