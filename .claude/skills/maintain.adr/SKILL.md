---
name: maintain-adr
description: 维护 Echoe 的 ADR 知识库。每次运行都要增量更新 `.claude/skills/arch.adr/references/*.md`，并同步更新 `.claude/skills/arch.adr/SKILL.md` 索引。用户提到“沉淀规则/更新 ADR/维护 Guardrails/维护 Source of Truth/防止架构漂移”时必须启用。
---

# Echoe ADR 维护技能（Write）

## 角色边界
- 本技能负责：新增/修订/替代/废弃 ADR
- 本技能维护对象：`.claude/skills/arch.adr/`
- 本技能不负责：基于 ADR 输出方案（那是 `arch-adr` 的职责）

## 为什么要分离
- `arch-adr` 是项目运行时的稳定知识读取面（只读）
- `maintain-adr` 是知识演进的维护面（可写）

通过读写分离，避免把“知识消费逻辑”和“知识维护逻辑”混在一起。

## 维护目标
1. 持续沉淀 Constraint Plane（工程 Guardrails）
2. 持续沉淀 Source of Truth（业务事实）
3. 抑制 Architecture Drift

## 写入位置（强制）
- ADR 正文：`.claude/skills/arch.adr/references/*.md`
- ADR 索引：`.claude/skills/arch.adr/SKILL.md` 的“ADR 索引（只读）”表

禁止把全部内容写进单一大文件。

## 命名规则
- `ENG-xxxx`：工程约束
- `BIZ-xxxx`：业务事实
- `ARCH-xxxx`：架构方法/跨域决策

文件名：
`references/<ADR-ID>-<slug>.md`

## 模板文件
执行 Step 3 落盘 ADR 时，使用 `references/TEMPLATE-*.md` 模板：

| 模板文件 | 用途 |
|----------|------|
| `TEMPLATE-adr.md` | 新建 ADR 的标准模板，包含所有必需字段 |
| `TEMPLATE-supersede.md` | 替代旧 ADR 时的操作指南和格式说明 |
| `TEMPLATE-amend.md` | 小幅修订现有 ADR 时的流程和判断标准 |

### 模板使用方法

#### 新建 ADR
1. 复制 `TEMPLATE-adr.md`，重命名为 `<ADR-ID>-<slug>.md`
2. 填写元信息、Context、Decision 等各节
3. 确保每节都有实际内容，不要留空

#### 替代旧 ADR（Supersede）
1. 参考 `TEMPLATE-supersede.md` 的流程
2. 创建新 ADR 时在 `Supersedes` 字段填写旧 ADR-ID
3. 更新旧 ADR 的 Status 为 `Superseded`，填写 `Superseded by`
4. 两边都要更新 Change Log

#### 修订现有 ADR（Amend）
1. 参考 `TEMPLATE-amend.md` 的判断标准
2. 直接修改目标 ADR 文件
3. Status 保持不变
4. 在 Change Log 中增加修订记录

## 执行流程

### Step 1：收集增量上下文
按优先级读取：
1. 当前改动（git status / diff）
2. 仓库规则（`CLAUDE.md`、`.catpaw/rules/*.md`）
3. 代码事实（controller/service/schema/dto/lib）
4. 测试事实（`__tests__`）
5. 用户新决策

### Step 2：识别变更类型
对每个候选决策判断：
- 新增（Add）
- 修订（Amend）
- 替代（Supersede）
- 废弃（Deprecate）

### Step 3：落盘 ADR
每个 ADR 文件至少包含：
- Status
- Date
- Context
- Decision
- Constraint / Source of Truth
- Evidence
- Impact（Tech Design / PRD）
- Guardrails / Acceptance Checks
- Change Log

### Step 4：同步更新索引
修改 `.claude/skills/arch.adr/SKILL.md` 中索引表，确保：
- 每个 references ADR 都可在索引中找到
- 索引状态与 ADR 文件状态一致
- 新增 ADR 后索引及时补齐

### Step 5：输出维护结果
对话输出：
1. 本次新增/修订/替代/废弃统计
2. 变更文件列表
3. 对技术方案设计的新增约束
4. 对 PRD 设计的新增事实
5. 待确认项（仅证据不足时）

## 质量门槛
- 每条 ADR 必须有证据路径
- 不允许凭主观臆断写业务事实
- 单文件建议 < 660 行，超限要拆分
- 保持术语稳定，避免同义重复 ADR

## 与 arch-adr 协作约定
- 维护完成后，`arch-adr` 直接消费最新索引与 references
- 若用户目标是“出方案/对齐 PRD”，优先切换 `arch-adr`
- 若用户目标是“更新规则库/沉淀新决策”，优先使用本技能

## 示例触发语句
- “把这次改动对应的 ADR 增量沉淀一下。”
- “更新 Guardrails，顺便把索引同步好。”
- “新业务规则定了，写入 Source of Truth。”
