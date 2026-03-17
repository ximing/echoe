---
name: check-adr
description: 校验 Echoe 的 ADR 知识库。检查 ADR 质量、一致性和覆盖率，输出校验报告。若待校验 ADR 量很大，必须启用分片、子 Agent 并行和磁盘检查点策略。用户提到"校验 ADR/检查 ADR/ADR 质量检查"时必须启用。
---

# Echoe ADR 校验技能

## 角色边界

- 本技能负责：ADR 知识库的质量校验
- 本技能执行时机：维护 ADR 后、定期审计、CI/CD 流程
- 本技能不负责：修复问题（那是 `maintain-adr` 的职责）

## 大规模校验策略（ADR 量大时）

当待校验 ADR 数量过大时，必须采用“全量基础校验 + 分层深度校验 + 磁盘检查点”策略，避免上下文压缩导致结果丢失。

### 规模分级

- `L1`（`<= 80`）：全量深度校验
- `L2`（`81 ~ 300`）：分片并行校验（建议每片 30~50）
- `L3`（`> 300`）：两阶段校验（全量基础校验 + 风险优先深度校验）

### 风险优先规则（L3 必须执行）

优先深度校验以下 ADR：

1. 最近新增或最近修改
2. 状态为 `Proposed` / `Superseded` / `Deprecated`
3. 曾出现 `ERR-*` 或 `WARN-*`
4. 涉及关键域（认证授权、数据存储、AI 调用链、权限边界）

低风险 ADR 至少抽样 20% 做深度校验，避免漏检。

## 校验维度

### 1. 结构完整性

检查每个 ADR 是否包含必需字段：

- [ ] 元信息（Status、Date）
- [ ] Context（背景）
- [ ] Decision（决策）
- [ ] Constraint 或 Source of Truth（约束或事实）
- [ ] Evidence（证据路径）
- [ ] Change Log（变更日志）

### 2. 证据有效性

检查 Evidence 中的路径是否真实存在：

- [ ] 文件路径是否存在
- [ ] 引用代码是否与描述一致
- [ ] 证据是否充分支撑决策

### 3. 状态一致性

检查 ADR 状态与索引是否一致：

- [ ] 索引表中的状态与文件状态一致
- [ ] `Superseded` 状态的 ADR 是否有对应的替代 ADR
- [ ] `Deprecated` 状态的 ADR 是否有废弃说明

### 4. ID 规范性

检查 ADR-ID 是否符合规范：

- [ ] 前缀正确（ENG/BIZ/ARCH）
- [ ] 编号连续（无跳号）
- [ ] 文件名与 ID 匹配

### 5. 内容质量

检查 ADR 内容质量：

- [ ] 标题是否清晰简洁
- [ ] Context 是否说明了背景和问题
- [ ] Decision 是否明确具体
- [ ] Constraint 是否可执行、可验证
- [ ] 单文件是否超过 660 行（超限需拆分）

### 6. 覆盖率检查

检查仓库关键领域是否有 ADR 覆盖：

- [ ] 认证授权
- [ ] 数据存储
- [ ] API 设计
- [ ] 状态管理
- [ ] 日志规范
- [ ] 错误处理

## 执行流程

### Step 0：创建校验工作区（必须）

1. 生成 `run_id`（示例：`2026-03-17T17-00-00Z`）
2. 创建目录：`.claude/skills/check.adr/workspace/<run_id>/`
3. 初始化：
   - `manifest.json`（分片状态：pending/running/done/failed）
   - `inventory.json`（待校验 ADR 清单）
   - `chunks/`（每个分片的校验输出）
   - `report/`（聚合报告）

### Step 1：收集 ADR 并分片

1. 读取 `.claude/skills/arch.adr/SKILL.md` 索引
2. 收集 `references/` 下所有 ADR 文件
3. 生成 `inventory.json`
4. 根据规模分级（L1/L2/L3）生成分片清单并写入 `manifest.json`

### Step 2：并行子 Agent 执行全量基础校验

每个分片启动子 Agent，必须先写磁盘再返回摘要：

- 输出文件：`.claude/skills/check.adr/workspace/<run_id>/chunks/<chunk-id>/baseline.json`
- 校验范围（全量）：
  - 必需字段
  - ADR-ID 与文件名规范
  - 索引状态一致性
  - Evidence 路径存在性

子 Agent 仅返回摘要（通过数/失败数/输出文件路径），禁止在对话粘贴全量细节。

### Step 3：深度校验（按风险优先）

1. 对高风险 ADR 做 100% 深度校验
2. 对低风险 ADR 按至少 20% 抽样深度校验
3. 深度结果写入：
   - `.claude/skills/check.adr/workspace/<run_id>/chunks/<chunk-id>/deep.json`

深度校验项包括：
- Evidence 是否充分支撑 Decision
- Constraint 可执行性
- Guardrails 可验收性
- Change Log 完整性

### Step 4：交叉验证与覆盖率分析

1. 校验 Supersede 关系完整性
2. 校验 ADR-ID 连续性与唯一性
3. 扫描关键仓库目录做覆盖率分析
4. 输出到：`.claude/skills/check.adr/workspace/<run_id>/report/coverage.json`

### Step 5：聚合报告

聚合 `baseline.json` + `deep.json` + `coverage.json`，生成：
`.claude/skills/check.adr/workspace/<run_id>/report/final-report.md`

并输出结构化报告：

```markdown
# ADR 校验报告

## 概览

- run_id：<run_id>
- 校验模式：L1 / L2 / L3
- 总 ADR 数量：X
- 基础校验通过：Y
- 深度校验通过：Z
- 错误项：E
- 警告项：W

## 错误项（必须修复）

| ADR-ID   | 问题类型 | 问题描述      | 修复建议     |
| -------- | -------- | ------------- | ------------ |
| ENG-0001 | 缺失字段 | 缺少 Evidence | 补充代码路径 |

## 警告项（建议修复）

| ADR-ID   | 问题类型 | 问题描述    | 修复建议 |
| -------- | -------- | ----------- | -------- |
| BIZ-0002 | 文件过长 | 超过 660 行 | 考虑拆分 |

## 覆盖率分析

| 领域     | 状态        | 备注                  |
| -------- | ----------- | --------------------- |
| 认证授权 | ✅ 已覆盖   | ARCH-0001             |
| 数据存储 | ⚠️ 部分覆盖 | 缺少 LanceDB 迁移规范 |
| 错误处理 | ❌ 未覆盖   | 建议新增              |

## 分片执行情况

| 分片 | 状态 | ADR 数量 | 失败数 |
| ---- | ---- | -------- | ------ |
| chunk-001 | ✅ done | 40 | 1 |
| chunk-002 | ✅ done | 40 | 0 |

## 建议操作

1. [优先] 修复 ERR 级问题
2. [建议] 对未深度覆盖 ADR 做下一轮补检
3. [可选] 补齐缺失领域 ADR
```

### Step 6：清理临时磁盘内容（必须）

默认在报告产出后删除：
`.claude/skills/check.adr/workspace/<run_id>/`

例外：若存在失败分片，允许保留该 `run_id` 用于断点续跑；续跑完成后必须删除。

## 校验规则详情

### 错误级别（必须修复）

| 规则 ID   | 规则描述            |
| --------- | ------------------- |
| `ERR-001` | 缺少必需字段        |
| `ERR-002` | Evidence 路径不存在 |
| `ERR-003` | Status 与索引不一致 |
| `ERR-004` | Supersede 关系断裂  |
| `ERR-005` | ADR-ID 重复         |

### 警告级别（建议修复）

| 规则 ID    | 规则描述               |
| ---------- | ---------------------- |
| `WARN-001` | 文件超过 660 行        |
| `WARN-002` | Evidence 证据不充分    |
| `WARN-003` | Constraint 表述模糊    |
| `WARN-004` | 缺少 Guardrails 检查项 |
| `WARN-005` | Change Log 不完整      |

### 提示级别（可选优化）

| 规则 ID    | 规则描述               |
| ---------- | ---------------------- |
| `INFO-001` | 标题可更简洁           |
| `INFO-002` | Context 可补充更多背景 |
| `INFO-003` | Impact 可补充业务影响  |

## 与其他 Skill 协作

- 校验发现问题后，使用 `maintain-adr` 修复
- 新增 ADR 后，使用本技能验证质量
- CI/CD 流程中，本技能可作为质量门禁

## 示例触发语句

- "校验 ADR 知识库"
- "检查 ADR 质量和覆盖率"
- "生成 ADR 审计报告"
