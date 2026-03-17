---
name: init-adr
description: 初始化 Echoe 的 ADR 知识库。扫描存量仓库，分模块提取工程约束和业务事实，生成初始 ADR。用户提到"初始化 ADR/冷启动/首轮沉淀/扫描存量"时必须启用。
---

# Echoe ADR 初始化技能

## 角色边界

- 本技能负责：存量仓库的首次扫描和 ADR 初始化
- 本技能执行时机：项目首次接入 ADR 体系，或需要重建知识库时
- 本技能不负责：增量维护（那是 `maintain-adr` 的职责）

## 为什么需要独立 Skill

- 存量仓库代码量大，单次扫描容易超时或遗漏
- 分模块并行扫描可提高效率和覆盖度
- 初始化产出的 ADR 需要统一收敛和去重

## 扫描策略

### 磁盘缓冲策略（强制）

为防止长上下文压缩导致子 Agent 结果丢失，必须先落盘再汇总：

1. 每次初始化生成唯一 `run_id`
2. 所有子 Agent 先把完整结果写入磁盘文件，再返回摘要
3. 主 Agent 只以磁盘文件为准进行收敛、去重、优化
4. 最终产物写入 ADR 后，删除本次 `run_id` 的临时文件

临时目录规范：
`.claude/skills/init.adr/workspace/<run_id>/`

### 模块发现规则（替代写死模块）

模块不能写死，必须在每次运行时动态发现。

1. 扫描根范围（默认）
   - `apps/*/src/`
   - `packages/*/src/`
   - `config/`
   - `CLAUDE.md`、`.catpaw/rules/`
2. 排除目录
   - `.git/`、`.turbo/`、`node_modules/`、`dist/`、`build/`、`coverage/`、`logs/`
3. 候选模块生成
   - 先按“应用 + 一级业务目录”切分（例如 `apps/server/src/controllers/`）
   - 若单模块过大（`> 500` 文件或 `> 20000` 行）按下一层目录继续拆分
   - 若单模块过小（`< 15` 文件）且同域相邻，则合并
4. 模块命名规则
   - 使用 `<scope>-<domain>-<slice>`，例如：`server-auth-controllers`
5. 发现结果落盘
   - 将模块清单写入 `.claude/skills/init.adr/workspace/<run_id>/manifest.json`
   - 每个模块记录：`name`、`roots`、`fileCount`、`lineCount`、`status`
6. 发现失败降级（fallback）
   - 若动态发现失败，使用兜底范围：`apps/server/src/`、`apps/web/src/`、`packages/`、`config/`、`CLAUDE.md`、`.catpaw/rules/`
   - 在 `manifest.json` 标记 `discovery_mode: fallback`

### 子 Agent 任务模板

每个子 Agent 执行：

1. 扫描指定目录下的所有文件
2. 提取工程约束（Constraint）和业务事实（Source of Truth）
3. 按 ADR 草稿 JSON 格式整理发现
4. 将完整 JSON 写入指定磁盘文件 `OUTPUT_FILE`
5. 仅返回摘要（数量、重点、`OUTPUT_FILE` 路径），不要在对话里粘贴完整 JSON

## 执行流程

### Step 0：创建本次运行工作区（必须）

1. 生成 `run_id`（示例：`2026-03-17T16-20-00Z`）
2. 创建目录：`.claude/skills/init.adr/workspace/<run_id>/`
3. 初始化文件：
   - `manifest.json`（记录模块状态：pending/running/done/failed）
   - `modules/`（各模块子目录）
   - `merge/`（收敛结果）
   - `report/`（本次扫描报告）

### Step 1：检查现有 ADR + 自动发现模块

1. 读取 `.claude/skills/arch.adr/SKILL.md` 索引，确认当前状态：
   - 若索引为空 → 执行完整初始化
   - 若索引有内容 → 默认执行“补齐缺失领域”的初始化，不覆盖已有 ADR
2. 按“模块发现规则”扫描仓库并生成模块清单
3. 将模块清单写入 `manifest.json`（`discovered_modules[]`）
4. 若模块发现失败，切换 fallback 并写入 `manifest.json`

### Step 2：启动并行子 Agent（先写磁盘）

按 Step 1 自动发现的模块清单并行启动子 Agent。每个模块分配唯一输出文件：
`.claude/skills/init.adr/workspace/<run_id>/modules/<module>/raw-findings.json`

模块执行顺序：先高风险模块（认证、存储、权限、AI 链路），再普通模块。

**子 Agent Prompt 模板**：

```
你是 ADR 扫描 Agent，负责扫描 [模块名] 模块。

扫描范围：[目录列表]
输出文件：OUTPUT_FILE

任务：
1. 读取目录下所有代码文件
2. 提取以下内容：
   - 工程约束（Constraint）：硬性规则、禁止事项、必须遵守的规范
   - 业务事实（Source of Truth）：业务逻辑、数据流、状态机
3. 为每个发现生成 ADR 草稿，格式：
   {
     "id": "ENG-xxxx 或 BIZ-xxxx",
     "title": "标题",
     "type": "Constraint | SourceOfTruth",
     "context": "背景说明",
     "decision": "决策内容",
     "evidence": ["文件路径"],
     "impact": {
       "tech": "技术影响",
       "biz": "业务影响"
     }
   }
4. 将完整 JSON 数组写入 OUTPUT_FILE
5. 仅返回摘要：发现数量、关键发现、OUTPUT_FILE 路径

注意：不要在回复中粘贴完整 JSON，避免上下文挤压。
```

### Step 3：从磁盘收敛与优化

只从磁盘读取子 Agent 结果，不依赖对话上下文：

1. 读取所有 `raw-findings.json`
2. 合并所有 ADR 草稿到 `merge/combined-raw.json`
3. 检测重复内容，合并相似 ADR
4. 分配连续的 ADR-ID
5. 按类型分组（ENG/BIZ/ARCH）
6. 将优化后结果写入 `merge/combined-optimized.json`

### Step 4：落盘 ADR

1. 使用 `.claude/skills/maintain.adr/references/TEMPLATE-adr.md` 模板
2. 将 `combined-optimized.json` 转换为 ADR 文档
3. 写入 `.claude/skills/arch.adr/references/` 目录
4. 更新 `.claude/skills/arch.adr/SKILL.md` 索引表

### Step 5：输出初始化报告

将报告写入：
`.claude/skills/init.adr/workspace/<run_id>/report/init-report.md`

对话输出：

1. 自动发现模块统计（模块总数、拆分数、合并数、是否 fallback）
2. 实际扫描模块列表
3. 提取的 ADR 统计（按类型）
4. 生成的 ADR 文件列表
5. 待人工确认的模糊项
6. 本次 `run_id`

### Step 6：清理临时磁盘内容（必须）

初始化完成后删除本次工作区目录：
`.claude/skills/init.adr/workspace/<run_id>/`

清理规则：
- 成功写入 ADR 且索引同步后，立即删除
- 若中途失败，可临时保留用于恢复；恢复完成后必须删除

## 质量门槛

- 每个模块至少产出 1 个 ADR
- 所有 ADR 必须有 Evidence 路径
- 禁止凭主观臆断写业务事实
- 工程约束必须有代码证据支撑
- 模块发现结果必须先写入 `manifest.json`
- 未先写入 `raw-findings.json` 的模块结果一律无效

## 与其他 Skill 协作

- 初始化完成后，后续维护使用 `maintain-adr`
- 消费 ADR 使用 `arch-adr`
- 校验 ADR 使用 `check-adr`

## 示例触发语句

- "初始化 ADR 知识库"
- "冷启动存量仓库的 ADR"
- "扫描整个项目，生成初始约束和事实"
