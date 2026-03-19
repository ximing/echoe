# Note 字段模型重构设计文档

**日期:** 2026-03-19
**状态:** 已完成
**分支:** ralph/note-field-model-refactor

---

## 背景与目标

### 存在的问题

当前 `echoe_notes` 表缺乏显式的 JSON 字段列,业务层依赖 `flds/sfld/csum`(Anki 兼容格式)与 `rich_text_fields/fld_names` 的组合来表达字段数据。这导致:

1. **服务端存在大量字符串解析逻辑** - JSON.parse、split 等操作分散在各处
2. **富文本场景下派生值不稳定** - `flds/sfld/csum` 派生值在富文本场景下维护困难
3. **分隔符不一致风险** - 创建/更新/导入/学习队列等链路各自解析,`\x1f` vs `\t` 分隔符不一致
4. **架构不清晰** - 没有明确的"业务主存储"和"兼容层"划分

### 重构目标

- 新增 `fields_json`(MySQL JSON 类型)作为 note 字段的**业务主存储**
- 将 `rich_text_fields` 和 `fld_names` 升级为 MySQL JSON 类型,消除字符串解析
- `flds/sfld/csum` 统一由服务端标准化模块派生,**禁止业务层手写**
- 所有写入链路(create/update/import/csv-import)统一调用标准化模块
- 服务端实现 **ProseMirror JSON → HTML** 文本转换,无需前端预转换
- 消除运行时"把非 JSON 字符串当 JSON 解析"的错误

---

## 需求分析

### 核心需求

#### 1. 统一类型系统 (US-001)

**需求描述:** 作为开发者,我需要统一的 TypeScript 类型定义,让所有层级共享同一套契约。

**类型定义:**
- `CanonicalFields`: `Record<string, string>` - 字段名到纯文本/HTML 值的映射
- `RichTextFields`: `Record<string, ProseMirrorJsonDoc>` - 字段名到 ProseMirror JSON 的映射
- `NoteCompatibilityProjection`: `{ flds: string; sfld: string; csum: string }` - Anki 兼容派生字段
- `ProseMirrorJsonDoc`: ProseMirror JSON 文档的 TypeScript 类型

**类型位置:** `apps/server/src/types/note-fields.ts`

#### 2. 服务端 ProseMirror 序列化 (US-002)

**需求描述:** 作为开发者,我需要服务端模块将 ProseMirror JSON 转换为 HTML/纯文本。

**功能要求:**
- 使用 `@tiptap/core` 在 Node.js 环境中执行 JSON → HTML 转换
- 使用 `jsdom` 提供 DOM API polyfill
- 支持常用节点类型:paragraph、text、bold、italic、underline、heading、bulletList、orderedList、listItem、codeBlock、blockquote、hardBreak、image、link
- 提供 `serializeToHtml(doc)` 和 `serializeToPlainText(doc)` 函数

**实现位置:** `apps/server/src/lib/prosemirror-serializer.ts`

#### 3. 数据库 Schema 改造 (US-003, US-004)

**需求描述:** 作为开发者,我需要为 `echoe_notes` 表添加 `fields_json` 列,并将 `rich_text_fields` 和 `fld_names` 升级为 JSON 类型。

**Schema 变更:**
```typescript
// echoe_notes table
fieldsJson: json('fields_json').$type<CanonicalFields>().notNull().default({})
richTextFields: json('rich_text_fields').$type<RichTextFields>()
fldNames: json('fld_names').$type<string[]>()
```

**迁移要求:**
- 生成 Drizzle 迁移文件
- 迁移文件可重复执行(幂等)
- 数据类型转换逻辑安全

#### 4. 数据回填 (US-005)

**需求描述:** 作为开发者,我需要回填脚本从现有 `flds` + `fld_names` 填充 `fields_json`。

**脚本要求:**
- 路径:`apps/server/scripts/backfill-fields-json.ts`
- 逻辑:读取每条 note 的 `flds`(`\x1f` 分隔)和 `fld_names`,组合为 `Record<string, string>` 写入 `fields_json`
- 幂等:对 `fields_json` 已有值的 note 跳过
- 输出统计:总数、成功数、跳过数、失败数

#### 5. 字段标准化模块 (US-006)

**需求描述:** 作为开发者,我需要单一的 `NoteFieldNormalizer` 模块,统一生成所有派生字段值。

**模块功能:**
```typescript
interface NormalizerInput {
  notetypeFields: string[];
  fields?: Record<string, string>;
  richTextFields?: RichTextFields;
}

interface NormalizerOutput {
  fieldsJson: CanonicalFields;
  fldNames: string[];
  flds: string;
  sfld: string;
  csum: string;
}

function normalizeNoteFields(input: NormalizerInput): NormalizerOutput
```

**处理逻辑:**
- 若提供 `richTextFields`,通过 ProseMirror 序列化器转换为 HTML
- 从 `fields` 构建 `fieldsJson`(以 notetype 字段顺序为准)
- `flds` = 字段值以 `\x1f` 连接
- `sfld` = 第一个字段的纯文本(去除 HTML 标签)
- `csum` = 基于 sfld 的 Anki 兼容 checksum 算法

**实现位置:** `apps/server/src/lib/note-field-normalizer.ts`

#### 6-10. 改造写入链路 (US-007 ~ US-010)

**需求描述:** 所有 Note 写入链路必须调用 `normalizeNoteFields`。

**改造链路:**
- ✅ Note 创建:`POST /api/v1/notes` → `echoe-note.service.ts::createNote()`
- ✅ Note 更新:`PUT /api/v1/notes/:id` → `echoe-note.service.ts::updateNote()`
- ✅ APKG 导入:`echoe-import.service.ts::importApkg()`
- ✅ CSV 导入:`echoe-csv-import.service.ts::importCsv()`

**统一要求:**
- 写入时同时设置 `fields_json`、`fld_names`、`flds`、`sfld`、`csum`
- 不再有手动拼接 `flds` 或手动计算 `csum` 的代码

#### 11. 读取链路收敛 (US-011)

**需求描述:** 所有读取路径优先从 `fields_json` 构建 DTO `fields` 字段。

**改造要求:**
- `mapNoteToDto` 优先从 `fields_json` 构建 DTO
- `getQueue` 和 `getCard` 等学习相关查询使用 `fields_json`
- 去重逻辑使用 `fields_json` 或 `csum`
- 删除所有散落的 `JSON.parse(flds)` / `flds.split('\x1f')` 兜底逻辑

#### 12. 前端编辑器契约对齐 (US-012)

**需求描述:** 前端卡片编辑器提交 `richTextFields` 时包含所有字段 key。

**前端要求:**
- `richTextFields` 包含 notetype 所有字段的 key(即使某字段为空,也提交空文档 JSON)
- 不再需要前端提交转换后的 HTML `fields`(后端同构处理)
- 编辑器保存后,`richTextFields` 结构正确

---

## 实现状态

### ✅ 已完成功能

#### 1. 类型系统 (`apps/server/src/types/note-fields.ts`)
```typescript
✅ export type CanonicalFields = Record<string, string>;
✅ export type RichTextFields = Record<string, ProseMirrorJsonDoc>;
✅ export interface ProseMirrorJsonDoc {
     type: 'doc';
     content?: Array<ProseMirrorNode>;
   }
✅ export interface NoteCompatibilityProjection {
     flds: string;
     sfld: string;
     csum: string;
   }
```

#### 2. ProseMirror 序列化器 (`apps/server/src/lib/prosemirror-serializer.ts`)
```typescript
✅ serializeToHtml(doc: ProseMirrorJsonDoc): string
✅ serializeToPlainText(doc: ProseMirrorJsonDoc): string
✅ generateJsonFromHtml(html: string): ProseMirrorJsonDoc
✅ 使用 jsdom 提供 DOM polyfill
✅ 支持完整的 Tiptap 扩展集
✅ 单元测试覆盖 (`__tests__/prosemirror-serializer.test.ts`)
```

#### 3. 数据库 Schema (`apps/server/src/db/schema/echoe-notes.ts`)
```typescript
✅ fieldsJson: json('fields_json').$type<CanonicalFields>().notNull().default({})
✅ richTextFields: json('rich_text_fields').$type<RichTextFields>()
✅ fldNames: json('fld_names').$type<string[]>()
✅ 迁移文件已生成并应用
```

#### 4. 数据回填脚本 (`apps/server/scripts/backfill-fields-json.ts`)
```typescript
✅ 从 flds + fld_names 填充 fields_json
✅ 幂等执行(跳过已有值的 note)
✅ 统计输出(总数、成功、跳过、失败)
✅ 支持 --force 参数强制覆盖
```

#### 5. 字段标准化模块 (`apps/server/src/lib/note-field-normalizer.ts`)
```typescript
✅ normalizeNoteFields(input: NormalizerInput): NormalizerOutput
✅ 集成 ProseMirror 序列化器
✅ 统一 flds/sfld/csum 派生逻辑
✅ Anki 兼容 checksum 算法
✅ 单元测试覆盖 (`__tests__/note-field-normalizer.test.ts`)
```

#### 6. 写入链路改造
```typescript
✅ echoe-note.service.ts::createNote() - 使用 normalizeNoteFields
✅ echoe-note.service.ts::updateNote() - 使用 normalizeNoteFields
✅ echoe-import.service.ts::importApkg() - 使用 normalizeNoteFields
✅ echoe-csv-import.service.ts::importCsv() - 使用 normalizeNoteFields
✅ 所有链路统一写入 fields_json、fld_names、flds、sfld、csum
```

#### 7. 读取链路改造
```typescript
✅ mapNoteToDto - 优先从 fields_json 读取
✅ 学习队列 - 使用 fields_json
✅ 去重逻辑 - 使用 csum 或 fields_json
✅ 移除散落的 flds.split('\x1f') 逻辑
```

#### 8. 工具函数 (`apps/server/src/utils/echoe-note.utils.ts`)
```typescript
✅ fieldValuesToFlds(values: string[]): string - 字段值 → flds
✅ fldsToFieldValues(flds: string): string[] - flds → 字段值数组
✅ computeSfld(fieldValue: string): string - 计算 sfld
✅ computeCsum(sfld: string): string - 计算 Anki 兼容 checksum
✅ 单元测试覆盖 (`__tests__/echoe-note.utils.test.ts`)
```

---

## 技术实现细节

### 1. ProseMirror 服务端运行

**挑战:** ProseMirror 默认依赖浏览器 DOM API

**解决方案:**
- 使用 `jsdom` 提供 DOM polyfill
- 在模块顶部注入全局变量:`window`、`document`、`DocumentFragment`、`Element`、`HTMLElement`、`Node`
- 使用 `@tiptap/core` 的 `generateHTML` 和 `generateText` 函数
- 支持完整的 Tiptap 扩展集

**代码示例:**
```typescript
import { JSDOM } from 'jsdom';
import { generateHTML, generateText } from '@tiptap/core';

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
globalThis.window = dom.window;
globalThis.document = dom.window.document;
// ... 其他全局变量

export function serializeToHtml(doc: ProseMirrorJsonDoc): string {
  return generateHTML(doc, SERIALIZER_EXTENSIONS);
}
```

### 2. Anki 兼容 Checksum 算法

**算法:** `csum = parseInt(sha1(sfld).slice(0, 8), 16).toString()`

**实现:**
```typescript
import { createHash } from 'crypto';

function computeCsum(sfld: string): string {
  const hash = createHash('sha1').update(sfld, 'utf8').digest('hex');
  return parseInt(hash.slice(0, 8), 16).toString();
}
```

**说明:**
- 与 Anki 保持兼容,用于去重
- 基于 sfld(sort field,第一个字段的纯文本)
- SHA-1 哈希的前 8 位十六进制字符转为整数

### 3. 字段标准化流程

```
Input: { notetypeFields, fields, richTextFields }
  ↓
1. 合并 fields 和 richTextFields (后者优先)
  ↓
2. richTextFields → HTML (通过 serializeToHtml)
  ↓
3. 按 notetypeFields 顺序构建 fieldsJson
  ↓
4. fieldsJson → flds (用 \x1f 连接)
  ↓
5. 第一个字段 → sfld (纯文本)
  ↓
6. sfld → csum (SHA-1 checksum)
  ↓
Output: { fieldsJson, fldNames, flds, sfld, csum }
```

### 4. 数据迁移策略

**迁移步骤:**
1. 添加 `fields_json` 列(默认 `{}`)
2. 升级 `rich_text_fields` 和 `fld_names` 为 JSON 类型
3. 运行回填脚本填充 `fields_json`
4. 所有新写入都使用 `normalizeNoteFields`

**回填逻辑:**
```typescript
// 读取 flds 和 fld_names
const fieldValues = note.flds.split('\x1f');
const fieldNames = JSON.parse(note.fldNames);

// 构建 fields_json
const fieldsJson: Record<string, string> = {};
fieldNames.forEach((name, index) => {
  fieldsJson[name] = fieldValues[index] || '';
});

// 更新数据库
await db.update(echoeNotes)
  .set({ fieldsJson })
  .where(eq(echoeNotes.id, note.id));
```

---

## 变更记录

### 架构决策

#### 1. 后端同构处理富文本
**决策:** ProseMirror JSON → HTML 转换在服务端进行
**原因:**
- 确保富文本转换逻辑的一致性
- 前端只需提交 ProseMirror JSON
- 避免前端预转换的维护成本
- 服务端可以统一验证和处理

#### 2. fields_json 作为业务主存储
**决策:** `fields_json` 是唯一的业务主存储,`flds/sfld/csum` 是派生字段
**原因:**
- 结构化存储便于查询和维护
- 避免字符串解析错误
- 类型安全
- 便于未来扩展

#### 3. 禁止业务层手写派生字段
**决策:** 所有 `flds/sfld/csum` 必须由 `normalizeNoteFields` 生成
**原因:**
- 确保派生逻辑的一致性
- 避免分隔符不一致
- 降低维护成本
- 便于测试和验证

#### 4. 保留 Anki 兼容字段
**决策:** 保留 `flds/sfld/csum` 作为兼容层
**原因:**
- 支持 Anki APKG 导入导出
- 兼容现有学习算法
- 便于数据迁移和回滚
- 成本低,收益高

---

## 验收标准

### 功能验收
- [x] `fields_json` 列存在且为 JSON 类型
- [x] `rich_text_fields` 和 `fld_names` 为 JSON 类型
- [x] 回填脚本成功执行,所有 note 的 `fields_json` 非空
- [x] `normalizeNoteFields` 函数可用,单元测试通过
- [x] ProseMirror 序列化器可用,单元测试通过
- [x] 所有写入链路使用 `normalizeNoteFields`
- [x] 所有读取链路优先使用 `fields_json`
- [x] 创建/编辑 note 后 `fields_json` 与 `flds/sfld/csum` 一致

### 技术验收
- [x] TypeScript 类型检查通过
- [x] 单元测试覆盖率 ≥ 80%
- [x] 数据库迁移可重复执行(幂等)
- [x] 回填脚本幂等执行
- [x] 无运行时字符串解析错误

### 数据验收
- [x] 随机抽取 100 条 note,`fields_json` 与 `flds` 一致
- [x] 多次更新同一 note,字段值不漂移
- [x] APKG 导入后 `fields_json` 正确
- [x] CSV 导入后 `fields_json` 正确
- [x] 学习队列正常渲染 `fields_json` 数据

---

## 相关资源

### 代码文件
- `apps/server/src/types/note-fields.ts` - 类型定义
- `apps/server/src/lib/prosemirror-serializer.ts` - ProseMirror 序列化器
- `apps/server/src/lib/note-field-normalizer.ts` - 字段标准化模块
- `apps/server/src/db/schema/echoe-notes.ts` - 数据库 Schema
- `apps/server/src/services/echoe-note.service.ts` - Note CRUD 服务
- `apps/server/src/services/echoe-import.service.ts` - APKG 导入服务
- `apps/server/src/services/echoe-csv-import.service.ts` - CSV 导入服务
- `apps/server/src/utils/echoe-note.utils.ts` - 工具函数
- `apps/server/scripts/backfill-fields-json.ts` - 数据回填脚本

### 测试文件
- `apps/server/src/__tests__/prosemirror-serializer.test.ts`
- `apps/server/src/__tests__/note-field-normalizer.test.ts`
- `apps/server/src/__tests__/echoe-note.utils.test.ts`
- `apps/server/src/__tests__/echoe-note.service.test.ts`

### 依赖包
- `@tiptap/core` - Tiptap 核心
- `@tiptap/extension-*` - Tiptap 扩展
- `jsdom` - DOM API polyfill
- `drizzle-orm` - ORM

### 数据库迁移
- Drizzle 迁移文件位于 `apps/server/drizzle/` 目录
- 迁移在服务器启动时自动执行

---

## 非目标(Non-Goals)

本次重构**不包括**以下内容:
- ❌ 改变 Anki 导出格式(`.apkg` 导出仍使用 `flds/sfld/csum`)
- ❌ 删除 `flds/sfld/csum` 列(保留作为兼容派生列)
- ❌ 实现前端富文本预转换(后端同构处理,前端无需转换)
- ❌ 改变学习算法(FSRS 或现有算法)
- ❌ 引入新的前端状态管理库
- ❌ 修改 notetype 定义相关逻辑

---

## 成功指标

- ✅ 新建/编辑任意 note 后,数据库 `fields_json` 非空且与 `flds/sfld/csum` 一致,无例外
- ✅ 同一 note 多次更新后,字段值不漂移(验证 100 条随机 note)
- ✅ 服务端不再出现 "Unexpected token" 或 "Cannot read property of undefined" 类型的字段解析错误
- ✅ 标准化模块单元测试覆盖率 ≥ 80%(核心分支)
- ✅ 导入 `.apkg` 后学习链路完整可用

---

## 后续优化建议

### 短期优化
1. 监控 `fields_json` 与 `flds` 一致性,设置告警
2. 添加数据校验脚本,定期检查字段完整性
3. 优化 ProseMirror 序列化性能
4. 扩展支持更多 Tiptap 扩展

### 长期规划
1. 考虑完全移除 `flds` 列(仅在导出时生成)
2. 支持自定义字段类型(日期、数字、选择等)
3. 支持字段级别的版本控制
4. 支持字段级别的加密

---

**文档整理:** AI Requirements Archive Manager
**最后更新:** 2026-03-19
