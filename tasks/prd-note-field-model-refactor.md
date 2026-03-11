# PRD: Note 字段模型重构

## Introduction

当前 `echoe_notes` 表缺乏显式的 JSON 字段列，业务层依赖 `flds/sfld/csum`（Anki 兼容格式）与 `rich_text_fields/fld_names` 的组合来表达字段数据。这导致：

- 服务端存在大量字符串解析逻辑（JSON.parse、split 等）
- 富文本场景下 `flds/sfld/csum` 派生值不稳定
- 创建/更新/导入/学习队列等链路各自解析，分隔符不一致（`\x1f` vs `\t`）风险

本次重构以 **JSON 作为业务主存储**，将 `flds/sfld/csum` 降级为派生字段，并通过单一标准化模块统一所有写入链路。富文本转换采用**后端同构方案**（服务端运行 Tiptap/ProseMirror JSON → HTML 转换），保证架构一致性。

---

## Goals

- 新增 `fields_json`（MySQL JSON 类型）作为 note 字段的业务主存储
- 将 `rich_text_fields` 和 `fld_names` 升级为 MySQL JSON 类型，消除字符串解析
- `flds/sfld/csum` 统一由服务端标准化模块派生，禁止业务层手写
- 所有写入链路（create/update/import/csv-import）统一调用标准化模块
- 服务端实现 ProseMirror JSON → HTML 文本转换，无需前端预转换
- 消除运行时"把非 JSON 字符串当 JSON 解析"的错误

---

## User Stories

### US-001: 定义统一类型系统
**Description:** As a developer, I want canonical TypeScript types for note fields so that all layers of the system share a common contract.

**Acceptance Criteria:**
- [ ] 在 `packages/dto` 或 `apps/server/src/types` 中定义以下类型：
  - `CanonicalFields`: `Record<string, string>` — 字段名到纯文本/HTML 值的映射
  - `RichTextFields`: `Record<string, ProseMirrorJsonDoc>` — 字段名到 ProseMirror JSON 的映射
  - `NoteCompatibilityProjection`: `{ flds: string; sfld: string; csum: number }` — Anki 兼容派生字段
  - `ProseMirrorJsonDoc`: ProseMirror JSON 文档的 TypeScript 类型（参考 Tiptap 类型定义）
- [ ] 类型定义有 JSDoc 注释说明每个字段的语义
- [ ] `pnpm typecheck` 通过

### US-002: 服务端 ProseMirror JSON → HTML 转换模块
**Description:** As a developer, I want a server-side module that converts ProseMirror JSON to HTML/plain text so that rich text fields can be stored as canonical text without frontend preprocessing.

**Acceptance Criteria:**
- [ ] 新建模块 `apps/server/src/lib/prosemirror-serializer.ts`（或类似路径）
- [ ] 使用 `@tiptap/core` 或 `prosemirror-*` 包在 Node.js 环境中执行 JSON → HTML 转换
- [ ] 支持常用节点类型：paragraph、text、bold、italic、underline、heading、bulletList、orderedList、listItem、codeBlock、blockquote、hardBreak
- [ ] 提供 `serializeToHtml(doc: ProseMirrorJsonDoc): string` 函数
- [ ] 提供 `serializeToPlainText(doc: ProseMirrorJsonDoc): string` 函数（用于 sfld 提取）
- [ ] 编写单元测试覆盖：纯文本段落、加粗/斜体、列表、代码块、空文档
- [ ] `pnpm typecheck` 通过

### US-003: 数据库迁移 — 新增 fields_json 列
**Description:** As a developer, I need to add a `fields_json` JSON column to `echoe_notes` so that field data has a typed, structured primary storage.

**Acceptance Criteria:**
- [ ] 生成 Drizzle 迁移文件，为 `echoe_notes` 添加 `fields_json` 列（MySQL JSON 类型，NOT NULL，默认 `{}`）
- [ ] 迁移文件可重复执行（幂等）
- [ ] `pnpm migrate` 成功执行
- [ ] Drizzle schema 文件同步更新
- [ ] `pnpm typecheck` 通过

### US-004: 数据库迁移 — 升级 rich_text_fields 和 fld_names 为 JSON 类型
**Description:** As a developer, I need `rich_text_fields` and `fld_names` to be MySQL JSON columns so that they have proper type enforcement and eliminate manual string parsing.

**Acceptance Criteria:**
- [ ] 生成 Drizzle 迁移文件，将 `rich_text_fields`（text → JSON）和 `fld_names`（text → JSON）升级为 MySQL JSON 类型
- [ ] 迁移包含数据转换逻辑：将现有 text 值解析并重新存储为 JSON
- [ ] 迁移文件可重复执行（幂等）
- [ ] `pnpm migrate` 成功执行
- [ ] Drizzle schema 同步更新
- [ ] `pnpm typecheck` 通过

### US-005: 数据回填脚本 — 从 flds + fld_names 填充 fields_json
**Description:** As a developer, I need a backfill script that populates `fields_json` from existing `flds` and `fld_names` data so that existing notes have valid primary field storage.

**Acceptance Criteria:**
- [ ] 新建脚本 `apps/server/scripts/backfill-fields-json.ts`（或类似路径）
- [ ] 脚本逻辑：读取每条 note 的 `flds`（`\x1f` 分隔）和 `fld_names`，组合为 `Record<string, string>` 写入 `fields_json`
- [ ] 脚本幂等：对 `fields_json` 已有值的 note 跳过（或可通过参数强制覆盖）
- [ ] 脚本执行完成后输出统计：总数、成功数、跳过数、失败数
- [ ] 在测试环境执行并验证：随机抽取 5 条 note，`fields_json` 值与 `flds + fld_names` 一致
- [ ] `pnpm typecheck` 通过

### US-006: 服务端字段标准化模块
**Description:** As a developer, I want a single `NoteFieldNormalizer` module that accepts raw field inputs and produces all derived field values so that all write paths share one consistent implementation.

**Acceptance Criteria:**
- [ ] 新建模块 `apps/server/src/lib/note-field-normalizer.ts`
- [ ] 导出函数 `normalizeNoteFields(input: NormalizerInput): NormalizerOutput`，其中：
  - `NormalizerInput`: `{ notetypeFields: string[]; fields?: Record<string, string>; richTextFields?: RichTextFields }`
  - `NormalizerOutput`: `{ fieldsJson: CanonicalFields; fldNames: string[]; flds: string; sfld: string; csum: number }`
- [ ] 处理逻辑：
  - 若提供 `richTextFields`，通过 US-002 模块转换为 HTML，合并到 `fields`
  - 从 `fields` 构建 `fieldsJson`（以 notetype 字段顺序为准）
  - `flds` = 字段值以 `\x1f` 连接
  - `sfld` = 第一个字段的纯文本（去除 HTML 标签）
  - `csum` = 基于 sfld 的 Anki 兼容 checksum 算法
- [ ] 编写单元测试覆盖：
  - 纯文本字段输入
  - 富文本字段输入（含 ProseMirror JSON）
  - 混合输入（部分字段为富文本）
  - 空字段处理
  - 多字段顺序验证
- [ ] `pnpm typecheck` 通过

### US-007: 改造 Note 创建链路
**Description:** As a developer, I want the note creation API to use `NoteFieldNormalizer` so that all created notes have consistent `fields_json`, `flds`, `sfld`, and `csum` values.

**Acceptance Criteria:**
- [ ] `POST /api/v1/notes` 处理器调用 `normalizeNoteFields`
- [ ] 写入数据库时同时设置 `fields_json`、`fld_names`、`flds`、`sfld`、`csum`
- [ ] 不再有手动拼接 `flds` 或手动计算 `csum` 的代码
- [ ] 通过 curl 或 Postman 创建一条 note，验证数据库中 `fields_json` 非空且与 `flds` 一致
- [ ] `pnpm typecheck` 通过

### US-008: 改造 Note 更新链路
**Description:** As a developer, I want the note update API to use `NoteFieldNormalizer` so that all updated notes maintain consistent field data.

**Acceptance Criteria:**
- [ ] `PUT /api/v1/notes/:id` 处理器调用 `normalizeNoteFields`
- [ ] 写入时同步更新 `fields_json`、`fld_names`、`flds`、`sfld`、`csum`
- [ ] 多次更新同一 note 后，`fields_json` 与 `flds/sfld/csum` 保持一致（不漂移）
- [ ] `pnpm typecheck` 通过

### US-009: 改造 .apkg 导入链路
**Description:** As a developer, I want the `.apkg` import pipeline to use `NoteFieldNormalizer` so that imported notes have consistent field storage.

**Acceptance Criteria:**
- [ ] `.apkg` 导入处理器调用 `normalizeNoteFields`
- [ ] 导入后每条 note 的 `fields_json` 非空
- [ ] 导入的 note 可正常进入学习队列并渲染
- [ ] 导入后可再次导出为 `.apkg`，导出内容与原始一致
- [ ] `pnpm typecheck` 通过

### US-010: 改造 CSV 导入链路
**Description:** As a developer, I want the CSV import pipeline to use `NoteFieldNormalizer` so that CSV-imported notes have consistent field storage.

**Acceptance Criteria:**
- [ ] CSV 导入处理器调用 `normalizeNoteFields`
- [ ] 导入后每条 note 的 `fields_json` 非空
- [ ] 导入的 note 可正常学习
- [ ] `pnpm typecheck` 通过

### US-011: 收敛读取链路 — 优先读取 fields_json
**Description:** As a developer, I want all read paths to use `fields_json` as the primary source for the `fields` DTO field so that there is one consistent reading strategy.

**Acceptance Criteria:**
- [ ] `mapNoteToDto`（或等效映射函数）优先从 `fields_json` 构建 DTO 的 `fields` 字段
- [ ] `getQueue` 和 `getCard` 等学习相关查询使用 `fields_json`
- [ ] 去重逻辑使用 `fields_json` 或 `csum`（不再依赖字符串 split）
- [ ] 删除所有散落的 `JSON.parse(flds)` / `flds.split('\x1f')` 兜底逻辑
- [ ] `pnpm typecheck` 通过

### US-012: 前端编辑器提交契约对齐
**Description:** As a frontend developer, I want the card editor to reliably submit `richTextFields` with complete field keys so that the backend can perform rich text conversion without ambiguity.

**Acceptance Criteria:**
- [ ] 卡片编辑器提交时，`richTextFields` 包含 notetype 所有字段的 key（即使某字段为空，也提交空文档 JSON）
- [ ] 不再需要前端提交转换后的 HTML `fields`（后端同构处理）
- [ ] 编辑器保存后，通过 Network 面板确认请求体中 `richTextFields` 结构正确
- [ ] 创建/编辑卡片后可正常学习渲染
- [ ] `pnpm typecheck` 通过
- [ ] Verify in browser using dev-browser skill

---

## Functional Requirements

- FR-1: `echoe_notes` 表新增 `fields_json` 列（MySQL JSON，NOT NULL，默认 `{}`）
- FR-2: `echoe_notes` 表的 `rich_text_fields` 和 `fld_names` 列升级为 MySQL JSON 类型
- FR-3: 数据回填脚本从 `flds + fld_names` 填充 `fields_json`，幂等执行
- FR-4: 服务端提供 `serializeToHtml(doc)` 和 `serializeToPlainText(doc)` 函数，在 Node.js 环境运行
- FR-5: `normalizeNoteFields(input)` 函数作为唯一的字段标准化入口，输出 `fieldsJson`、`fldNames`、`flds`、`sfld`、`csum`
- FR-6: `csum` 算法与 Anki 保持兼容（基于 sfld 的 CRC32 或 Anki 指定算法）
- FR-7: 所有写入链路（create/update/apkg-import/csv-import）必须调用 `normalizeNoteFields`
- FR-8: 禁止业务层直接拼接 `flds` 字符串或手动计算 `csum`
- FR-9: 所有读取路径优先从 `fields_json` 构建 DTO `fields` 字段
- FR-10: 前端卡片编辑器提交完整的 `richTextFields`（所有字段 key 均存在），后端负责转换

---

## Non-Goals

- 不改变 Anki 导出格式（`.apkg` 导出仍使用 `flds/sfld/csum`）
- 不删除 `flds/sfld/csum` 列（保留作为兼容派生列）
- 不实现前端富文本预转换（后端同构处理，前端无需转换）
- 不改变学习算法（SM-2 或现有算法）
- 不引入新的前端状态管理库
- 不修改 notetype 定义相关逻辑

---

## Technical Considerations

- **Tiptap 服务端运行**：使用 `@tiptap/core` + `@tiptap/pm` 在 Node.js 中执行 JSON → HTML 转换，无需 DOM，使用 `generateHTML` 函数
- **csum 算法**：参考 Anki 源码，`csum = int(sha1(sfld.encode()).hexdigest()[:8], 16)`，需用 Node.js `crypto` 模块实现等效逻辑
- **迁移安全**：`fields_json` 初始允许 `{}` 默认值，回填脚本独立执行，不在迁移中内联数据转换
- **类型共享**：`CanonicalFields`、`RichTextFields` 等核心类型建议放在 `packages/dto`，供前后端共享
- **现有 Drizzle schema 路径**：`apps/server/src/db/schema/`
- **现有迁移路径**：`apps/server/src/db/migrations/`

---

## Success Metrics

- 新建/编辑任意 note 后，数据库 `fields_json` 非空且与 `flds/sfld/csum` 一致，无例外
- 同一 note 多次更新后，字段值不漂移（可通过脚本验证 100 条随机 note）
- 服务端不再出现 "Unexpected token" 或 "Cannot read property of undefined" 类型的字段解析错误
- 标准化模块单元测试覆盖率 ≥ 80%（核心分支）
- 导入 `.apkg` 后学习链路完整可用

---

## Open Questions

- `csum` 是否严格需要与 Anki 保持一致（用于跨平台去重），还是内部一致即可？如果需要严格兼容，需确认 Anki 的 csum 算法细节
- `rich_text_fields` 中是否存在非 ProseMirror JSON 格式的历史数据？迁移前需要扫描确认
- Phase 0 PoC 是否需要正式记录为 ADR（Architecture Decision Record）文档？
