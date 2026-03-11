---
ruleType: Model Request
description: 涉及 Anki 兼容字段（flds/sfld/csum）、fields 与 richTextFields 关系、导入导出链路时使用
---
# Anki 兼容字段与富文本字段调研结论

> 更新时间：2026-03-11  
> 调研范围：`apps/web`、`apps/server`、`packages/dto`  
> 说明：以下结论仅来自代码检索与源码阅读，不依赖文档描述。

## 1) 前端对 `flds / sfld / csum / fldNames` 的实际使用

### 1.1 `flds`
前端存在 `flds` 使用，但都是 **NoteType 维度** 的 `EchoeNoteTypeDto.flds`（字段定义数组），不是 `echoe_notes` 表里的拼接字符串字段。

主要位置：
- `apps/web/src/pages/cards/notetypes.tsx`
  - 读取 `noteType.flds` 初始化编辑态/预览
  - 创建/更新 note type 时提交 `flds`
- `apps/web/src/pages/cards/card-editor.tsx`
  - 根据 `selectedNotetype.flds` 初始化字段编辑器与必填校验
- `apps/web/src/pages/cards/duplicates.tsx`
  - 用 `selectedNoteType.flds` 生成“按哪个字段去重”的下拉选项

### 1.2 `sfld / csum / fldNames`
- `apps/web` 与 `apps/client` 中无实际引用或编辑逻辑。
- 这几个字段不在前端页面逻辑中直接维护。

## 2) `fields` 和 `richTextFields` 的关系

在 DTO 中二者并存：
- `fields: Record<string, string>`（传统字段值）
- `richTextFields?: Record<string, Record<string, any>>`（富文本 JSON）

对应代码：`packages/dto/src/echoe.ts`

### 2.1 服务端写入链路
`apps/server/src/services/echoe-note.service.ts`：
- `fields` 会被用于：
  - 拼接 `flds`（`Object.values(dto.fields).join('\x1f')`）
  - 生成 `sfld`（首字段清洗）
  - 计算 `csum`
  - 记录 `fldNames`（`Object.keys(dto.fields)`）
- `richTextFields` 直接 JSON 字符串入库到 `rich_text_fields`

### 2.2 服务端读取链路
`mapNoteToDto()` 中：
- `fields` 由数据库 `flds + fldNames` 反解得到
- `richTextFields` 由 `rich_text_fields` 反序列化得到

### 2.3 前端编辑/渲染链路
- `apps/web/src/pages/cards/card-editor.tsx`
  - 富文本编辑器 `onChange` 主要更新 `richTextFields`
  - `fields` 只维持 key 存在（可能为空字符串）
- `apps/web/src/components/echoe/CardRenderer.tsx`
  - 模板渲染优先使用 `richTextFields`
  - 无富文本时回退 `fields`

## 3) 为什么不是只用 `fields`

从代码现状看，`fields` 仍承担 Anki 兼容链路，不能直接替代：

1. **搜索依赖 `sfld`**
- `apps/server/src/services/echoe-note.service.ts` 中按 `sfld` 做 `like` 查询。

2. **去重依赖 `flds/sfld/csum` 语义**
- `apps/server/src/services/echoe-duplicate.service.ts` 直接读取并拆分 `note.flds` 进行重复比较。

3. **导入/导出 `.apkg` 使用传统 notes 结构**
- `apps/server/src/services/echoe-export.service.ts` 导出的 SQLite `notes` 表列为：`id/guid/mid/mod/usn/tags/flds/sfld/csum/flags/data`，无 `richTextFields`。
- `apps/server/src/services/echoe-import.service.ts` 导入时也仅处理上述传统列。

结论：
- `richTextFields` 用于保存结构化富文本能力。
- `fields` 用于维护兼容字段与传统链路。
- 二者目前是并行模型，不是单一字段可替代关系。

## 4) Anki 是否也是这样设计

按当前仓库代码可确认：
- Anki 兼容链路（导入/导出）只使用传统 `notes` 列（`flds/sfld/csum/...`）。
- 未看到 Anki 侧存在 `richTextFields` 这一列。

因此在本项目中：
- `richTextFields` 是系统扩展字段；
- Anki 兼容能力仍建立在传统字段结构上。

## 5) 当前实现注意点（基于现有代码）

- 富文本编辑模式下，前端可以让 `richTextFields` 有内容，同时 `fields` 为空字符串。
- 但服务端计算 `flds/sfld/csum` 仍以 `fields` 为输入。
- 这意味着富文本与兼容字段存在“潜在不同步”风险（尤其影响基于 `sfld` 的检索和传统去重语义）。

---

如后续继续改造，建议统一约定：
- 哪个字段是“源数据”；
- 哪个字段是“派生兼容数据”；
- 在 create/update 时由单一转换函数保证一致性。

## 6) `data` 字段默认值约定（新增）

为避免 `echoe_notes` / `echoe_cards` 的 `data` 字段出现 `[]` 与 `{}` 混用，统一约定如下：

- `data` 字段统一使用 `'{}'` 作为空值（JSON 对象字符串）。
- 创建、导入、更新、导出链路中，`data` 的兜底值必须保持为 `'{}'`。
- 禁止再写入 `'[]'` 作为 `data` 默认值，避免语义漂移和兼容歧义。
