# PRD 归档: Inbox 富文本升级

**文档版本**: v1.0
**归档日期**: 2026-03-19
**原始PRD路径**: tasks/archive/prd-inbox-rich-text.md
**责任人**: 前后端团队
**当前状态**: ✅ 已完成 (100%)

---

## 一、需求概述

将 Inbox(收件箱)功能从纯文本升级为富文本存储。根据 ADR 规范,所有与卡片内容相关的字段都需要支持富文本。当前 Inbox 的正面/背面内容使用纯文本 `<textarea>`,需要升级为 TipTap 富文本编辑器并以 JSON 格式存储。

### 核心目标
- 将 Inbox 正面/背面内容从纯文本升级为 TipTap 富文本
- 服务端 API 接受纯文本输入并自动转换为 TipTap JSON 格式存储
- 前端使用已有 RichTextEditor 组件替换纯文本输入
- 使用 TipTap JSON 格式存储(便于前端渲染)
- 支持从剪贴板粘贴富文本(Word、网页等)
- Bigbang 升级(无用户兼容需求,直接替换)

---

## 二、实现状态分析

### 2.1 已完成功能 (✅)

- ✅ **US-001**: 服务端支持纯文本转富文本存储
  - DTO 添加 `frontJson` 和 `backJson` 字段
  - InboxService 实现 `convertPlainTextToTipTapJson()` 转换方法
  - 自动转换纯文本为 TipTap JSON 格式
  - 代码位置: `apps/server/src/services/inbox.service.ts`
  - Git commit: 6d2dde0, bf2e7dd, b932edb

- ✅ **US-002**: Inbox 创建对话框使用富文本编辑器
  - `<textarea>` 替换为 `<RichTextEditor>`
  - 支持剪贴板粘贴富文本
  - onChange 返回 HTML 和 JSON
  - 提交 JSON 格式内容到 API
  - 代码位置: `apps/web/src/components/inbox/CreateInboxDialog.tsx`

- ✅ **US-003**: Inbox 编辑对话框使用富文本编辑器
  - `<textarea>` 替换为 `<RichTextEditor>`
  - 兼容加载纯文本和 JSON 两种格式
  - 支持剪贴板粘贴富文本
  - 代码位置: `apps/web/src/components/inbox/EditInboxDialog.tsx`
  - Git commit: a4d7a50

- ✅ **US-004**: Inbox 列表展示富文本内容
  - 使用 RichTextRenderer 渲染内容
  - 正确处理纯文本历史数据
  - 列表显示摘要(前100字符)
  - 代码位置: `apps/web/src/pages/inbox/inbox-page.tsx`

- ✅ **US-005**: 卡片转换保留富文本内容
  - ConvertToCardDialog 展示富文本预览
  - 转换时传递 TipTap JSON 格式
  - 创建的卡片内容为富文本格式
  - 代码位置: `apps/web/src/components/inbox/ConvertToCardDialog.tsx`
  - Git commit: 61aa9d9

### 2.2 关键技术决策

#### 决策 1: 前后端富文本格式统一
- **决策内容**: 统一使用 TipTap JSON 格式存储,服务端提供纯文本到 JSON 的转换
- **Why**: 避免前后端格式不一致,简化前端处理逻辑
- **How to apply**: 前端优先传递 JSON,服务端兼容纯文本输入并自动转换

#### 决策 2: 历史数据兼容策略
- **决策内容**: 不迁移历史纯文本数据,按需在渲染时转换
- **Why**: Bigbang 升级,避免大规模数据迁移风险
- **How to apply**: RichTextRenderer 支持纯文本 fallback 渲染

#### 决策 3: AI 服务富文本处理
- **决策内容**: InboxAIService 处理 TipTap JSON 格式内容
- **Why**: AI 整理需要理解富文本结构,提取纯文本进行分析
- **How to apply**: AI 服务接收 JSON,提取文本,生成新 JSON 输出
- **Git commit**: 139c55b

---

## 三、变更记录

| 日期 | 变更内容 | 原因 | 影响范围 |
|------|---------|------|---------|
| 2026-03-16 | 初始 PRD 创建 | 项目需求 | 全部 |
| 2026-03-17 | 实现服务端转换 | 开发进度 | US-001 |
| 2026-03-17 | 实现前端编辑器 | 开发进度 | US-002, US-003 |
| 2026-03-17 | 修复创建/更新流程 | Bug 修复 | US-002 (#83, #84) |
| 2026-03-17 | 修复 AI 服务处理 | Bug 修复 | US-001 (#87, #88) |
| 2026-03-18 | 完成卡片转换 | 开发进度 | US-005 |
| 2026-03-19 | 归档文档生成 | 项目里程碑 | - |

---

## 四、架构影响

### 4.1 数据库 Schema
- `inbox` 表的 `front` 和 `back` 字段存储 TipTap JSON 字符串
- 无需新增字段,直接复用现有 TEXT 类型字段

### 4.2 API 接口
- `POST /api/v1/inbox` 接受 `frontJson` 和 `backJson` 可选字段
- `PUT /api/v1/inbox/:inboxId` 接受 `frontJson` 和 `backJson` 可选字段
- 兼容纯文本 `front` 和 `back` 字段(自动转换)

### 4.3 前端组件
- 复用 `RichTextEditor` 组件(替换 textarea)
- 复用 `RichTextRenderer` 组件(渲染列表内容)
- 修改 `CreateInboxDialog` 和 `EditInboxDialog`

---

## 五、技术债务

### 5.1 未完成功能
无(所有功能已完成)

### 5.2 已知问题
- 历史纯文本数据未迁移,可能在某些场景下显示格式不一致(非关键)

### 5.3 优化建议
- 考虑添加"批量迁移历史数据"脚本(如有需要)
- 考虑添加富文本内容搜索优化(提取纯文本建立索引)

---

## 六、依赖关系

### 上游依赖
- PRD: Inbox Design (收件箱基础功能)

### 下游依赖
- PRD: Inbox AI Organize (AI 整理需要处理富文本)

---

## 七、验收标准

✅ **已通过**
- 用户可以在 Inbox 中创建富文本内容
- 可以从 Word、网页等富文本来源粘贴内容
- 富文本内容可以正确保存和展示
- 转换为卡片后保留富文本格式
- 无用户数据丢失(历史纯文本数据兼容显示)
- 所有相关 Issues 已关闭(#83, #84, #87, #88)

---

## 八、相关文档

- [Inbox Design PRD](./archive-inbox-design.md)
- [TipTap Documentation](https://tiptap.dev/)

---

**归档审批**
- 技术负责人: ______
- 产品负责人: ______
- 归档日期: 2026-03-19
