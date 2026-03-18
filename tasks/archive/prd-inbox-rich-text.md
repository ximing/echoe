# PRD: Inbox 富文本升级

## Introduction

将 Inbox（收件箱）功能从纯文本升级为富文本存储。根据 ADR 规范，所有与卡片内容相关的字段都需要支持富文本。当前 Inbox 的正面/背面内容使用纯文本 `<textarea>`，需要升级为 TipTap 富文本编辑器并以 JSON 格式存储。

## Goals

- 将 Inbox 正面/背面内容从纯文本升级为 TipTap 富文本
- 服务端 API 接受纯文本输入并自动转换为 TipTap JSON 格式存储
- 前端使用已有 RichTextEditor 组件替换纯文本输入
- 使用 TipTap JSON 格式存储（便于前端渲染）
- 支持从剪贴板粘贴富文本（Word、网页等）
- Bigbang 升级（无用户兼容需求，直接替换）

## User Stories

### US-001: 服务端支持纯文本转富文本存储
**Description:** 作为开发者，我需要在服务端接收纯文本输入并转换为 TipTap JSON 格式存储。

**Acceptance Criteria:**
- [ ] 在 DTO 中添加 `frontJson` 和 `backJson` 字段（可选字段，用于前端传递 TipTap JSON）
- [ ] 在 InboxService 中添加 `convertPlainTextToTipTapJson()` 转换方法
- [ ] 当收到纯文本时，自动转换为 TipTap JSON: `{ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '原始内容' }] }] }`
- [ ] 当收到 JSON 时，直接存储 JSON
- [ ] Typecheck 通过
- [ ] 单元测试覆盖转换逻辑

### US-002: Inbox 创建对话框使用富文本编辑器
**Description:** 作为用户，我想在创建 Inbox 项目时使用富文本编辑器来编辑正面和背面内容。

**Acceptance Criteria:**
- [ ] 将 CreateInboxDialog 中的 `<textarea>` 替换为 `<RichTextEditor>`
- [ ] RichTextEditor 接收 `content` prop 时支持 JSON 格式
- [ ] onChange 回调同时返回 HTML 和 JSON
- [ ] 支持从剪贴板粘贴富文本（Word、网页内容）
- [ ] 提交时传递 JSON 格式内容到 API
- [ ] Typecheck 通过
- [ ] Verify in browser using dev-browser skill

### US-003: Inbox 编辑对话框使用富文本编辑器
**Description:** 作为用户，我想在编辑 Inbox 项目时使用富文本编辑器来修改正面和背面内容。

**Acceptance Criteria:**
- [ ] 将 EditInboxDialog 中的 `<textarea>` 替换为 `<RichTextEditor>`
- [ ] 加载现有内容时，正确解析纯文本和 JSON 两种格式
- [ ] 纯文本内容自动转换为 TipTap JSON 再传给编辑器
- [ ] 支持从剪贴板粘贴富文本（Word、网页内容）
- [ ] 提交时传递 JSON 格式内容到 API
- [ ] Typecheck 通过
- [ ] Verify in browser using dev-browser skill

### US-004: Inbox 列表展示富文本内容
**Description:** 作为用户，我想在 Inbox 列表中预览富文本内容的纯文本摘要。

**Acceptance Criteria:**
- [ ] 在 Inbox 列表渲染时，使用 RichTextRenderer 渲染内容
- [ ] 对于纯文本历史数据，RichTextRenderer 能正确处理（当作纯文本渲染）
- [ ] 列表中只显示摘要（前 100 字符），使用 RichTextRenderer 的内容截断
- [ ] Typecheck 通过

### US-005: 卡片转换保留富文本内容
**Description:** 作为用户，我想将 Inbox 项目转换为卡片时保留富文本格式。

**Acceptance Criteria:**
- [ ] ConvertToCardDialog 中展示富文本预览
- [ ] 转换时正确传递 TipTap JSON 格式内容
- [ ] 创建的卡片内容为富文本格式
- [ ] Typecheck 通过
- [ ] Verify in browser using dev-browser skill

## Functional Requirements

- FR-1: DTO 添加可选字段 `frontJson` 和 `backJson`，服务端优先使用 JSON，纯文本作为兼容
- FR-2: InboxService 添加 `convertPlainTextToTipTapJson(plainText: string): TipTapJson` 方法
- FR-3: 纯文本转换为 TipTap JSON 格式：每个段落作为 `paragraph` 节点，文本作为 `text` 节点
- FR-4: CreateInboxDialog 使用 RichTextEditor 替换 textarea
- FR-5: EditInboxDialog 使用 RichTextEditor 替换 textarea，并处理历史纯文本数据的兼容渲染
- FR-6: RichTextRenderer 组件需要支持纯文本 fallback 渲染
- FR-7: Inbox 列表使用 RichTextRenderer 展示内容摘要
- FR-8: ConvertToCardDialog 传递 TipTap JSON 到后端创建卡片
- FR-9: RichTextEditor 支持剪贴板粘贴富文本（需要配置 Paste 扩展或使用 onPaste 事件处理）

## Non-Goals

- 不支持从富文本回退到纯文本的导出功能
- 不需要迁移历史纯文本数据为 JSON（Bigbang 升级，按需转换显示）
- 不修改其他模块（note、card 等）的富文本处理逻辑
- 不需要在 Inbox 列表中添加富文本/纯文本标签标识

## Technical Considerations

- 复用现有 `apps/web/src/components/echoe/RichTextEditor.tsx` 组件
- 复用现有 `apps/web/src/components/echoe/RichTextRenderer.tsx` 组件
- TipTap JSON 格式参考：`{ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '内容' }] }] }`
- TipTap StarterKit 默认支持 HTML 粘贴，需要确保 RichTextEditor 配置允许粘贴 HTML
- 数据库字段保持为 TEXT 类型（JSON 字符串存储）
- 前端 API 调用时，优先传递 JSON 格式内容

## Success Metrics

- 用户可以在 Inbox 中创建富文本内容
- 可以从 Word、网页等富文本来源粘贴内容
- 富文本内容可以正确保存和展示
- 转换为卡片后保留富文本格式
- 无用户数据丢失（历史纯文本数据兼容显示）

## Open Questions

无
