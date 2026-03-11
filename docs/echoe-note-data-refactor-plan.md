# Echoe Note 字段模型重构开发计划

## 1. 背景与问题

你提到的两个问题是成立的，当前链路存在以下隐患：

1. `echoe_notes` 表没有显式 `fields` JSON 列，业务侧依赖 `flds/sfld/csum` 与 `rich_text_fields/fld_names` 的组合。
2. `fields` 目前主要是 DTO 层概念，数据库层不是强类型 JSON，导致服务端有较多字符串解析逻辑。
3. 富文本编辑场景下，前端会优先写 `richTextFields`，而 `fields` 可能为空字符串，导致 `flds/sfld/csum` 派生值不稳定。
4. 兼容链路分散：创建/更新/导入/学习队列/去重等多处各自解析，存在分隔符不一致（例如 `\x1f` 与 `\t`）风险。

---

## 2. 目标（重构后）

1. **数据库以 JSON 作为业务主存储**（可扩展、类型清晰）。
2. **Anki 兼容字段改为派生字段**：`flds/sfld/csum` 统一由服务端生成。
3. **单一转换入口**：创建、更新、导入、CSV 导入都走同一个“字段标准化”模块。
4. **富文本优先后端同构处理**：优先在服务端把 `richTextFields` 转换为兼容文本/HTML；若同构成本过高再 fallback 到前端预转换。

---

## 3. 目标数据模型（建议）

> 说明：不直接破坏现有兼容列，采用“新增主字段 + 保留兼容字段”的渐进方案。

### 3.1 `echoe_notes` 新增/调整字段

- 新增 `fields_json`（MySQL `JSON`，NOT NULL）
  - 语义：标准字段值，`Record<string, string>`。
- 评估将 `rich_text_fields` 升级为 `JSON`（当前为 `text`）
  - 语义：`Record<string, ProseMirrorJson>`。
- 评估将 `fld_names` 升级为 `JSON`（当前为 `text`）
  - 语义：`string[]`。
- 保留 `flds/sfld/csum` 作为兼容派生列（供 Anki 导入导出、重复检测、排序检索）。

### 3.2 字段职责边界

- `fields_json`：业务主数据（读写主入口）。
- `rich_text_fields`：富文本结构化数据（可选）。
- `flds/sfld/csum`：兼容投影（禁止业务层手写，必须由标准化模块产出）。

---

## 4. 富文本同构方案（先做技术结论）

### 4.1 优先方案（推荐）

在服务端引入与前端一致的富文本序列化能力（Tiptap/ProseMirror JSON -> HTML 文本），由服务端统一产出 `fields_json` 与 `flds/sfld/csum`。

### 4.2 备选方案（兜底）

若服务端同构渲染不可控（依赖过重/性能不可接受），则前端提交：
- `richTextFields`（JSON）
- `fields`（已经由前端从 JSON 渲染后的 HTML 字符串）

服务端仍然做最终校验与兼容字段派生，避免逻辑散落。

### 4.3 决策门槛

- Node 环境可稳定执行转换；
- 单次 note 处理延迟可接受；
- 不引入浏览器依赖或不安全运行时。

---

## 5. 分阶段开发计划

## Phase 0：设计与验证（1 天）

- 输出统一类型定义：
  - `CanonicalFields`、`RichTextFields`、`NoteCompatibilityProjection`。
- 完成服务端同构 PoC（JSON -> HTML）并记录性能/可维护性。
- 产出最终技术决策（优先后端同构，或前端预转换）。

交付：技术决策记录 + 字段规范草案。

## Phase 1：数据库与迁移（1~2 天）

- 为 `echoe_notes` 增加 `fields_json`（必要）。
- 视 PoC 结果决定是否将 `rich_text_fields/fld_names` 调整为 JSON 类型。
- 编写数据回填脚本：从现有 `flds + fld_names` 回填 `fields_json`。
- 保证迁移幂等与可重复执行。

交付：迁移脚本 + 回填脚本 + 回填校验结果。

## Phase 2：服务端标准化模块（2 天）

新增统一模块（例如 `note-field-normalizer`）：

输入：
- notetype 字段定义
- `fields`（可选）
- `richTextFields`（可选）

输出：
- `fields_json`
- `fld_names`
- `flds`
- `sfld`
- `csum`

要求：
- 创建/更新/导入统一调用；
- 严禁业务逻辑直接拼接 `flds`；
- 统一 `sfld` 清洗与 `csum` 算法。

交付：标准化模块 + 单测（核心分支覆盖）。

## Phase 3：写入链路改造（2 天）

改造以下链路全部接入标准化模块：

- `POST /api/v1/notes`（create）
- `PUT /api/v1/notes/:id`（update）
- `.apkg` 导入（import）
- CSV 导入（csv-import）

并确保：
- `fields_json` 总是有值；
- `flds/sfld/csum` 总是同步生成；
- `rich_text_fields` 与 `fields_json` 不冲突。

交付：端到端接口自测通过。

## Phase 4：读取链路与消费方收敛（1~2 天）

- 所有读路径优先读取 `fields_json`（DTO `fields` 直接来自 `fields_json`）。
- `getQueue`、`getCard`、`mapNoteToDto`、去重等逻辑统一字段读取方式。
- 清理临时兼容分支（包括散落的 JSON.parse / split 兜底逻辑）。

交付：读取链路一致性验证报告。

## Phase 5：前端与联调（1~2 天）

- 卡片编辑器确保提交数据契约明确：
  - 后端同构模式：前端只保证 `richTextFields` 与基础 `fields` key 完整；
  - 兜底模式：前端额外提交转换后的 `fields`。
- 联调卡片创建/编辑/学习渲染/导入导出全链路。

交付：联调清单 + 回归通过。

---

## 6. 测试与验收标准

### 6.1 功能验收

- 新建/编辑任意 note 后，数据库中必须同时满足：
  - `fields_json` 非空且结构正确；
  - `flds/sfld/csum` 已生成且与 `fields_json` 一致。
- 富文本字段可正确学习渲染。
- 导入 `.apkg` 后可正常学习，并可再次导出。

### 6.2 一致性验收

- 同一 note 多次更新后，`fields_json` 与 `flds/sfld/csum` 不漂移。
- 去重与搜索结果与预期一致。
- 不再出现“把非 JSON 字符串当 JSON 解析”的运行时错误。

### 6.3 质量验收

- 服务端核心转换模块具备单元测试。
- 关键 API 具备集成测试（create/update/import/export/study queue）。