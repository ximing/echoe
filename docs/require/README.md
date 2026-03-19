# Echoe 需求归档目录

**最后更新**: 2026-03-19

本目录存储 Echoe 项目的所有历史需求文档归档。每个归档文档包含原始需求、实现状态、变更记录、决策背景和最终文档版本。

---

## 归档文档列表

### ✅ 已完成归档

| 归档文件                                                                               | 原始PRD                              | 状态      | 完成度 | 归档日期   |
| -------------------------------------------------------------------------------------- | ------------------------------------ | --------- | ------ | ---------- |
| [archive-anki-flashcard-system.md](./archive-anki-flashcard-system.md)                 | prd-anki-flashcard-system.md         | ✅ 已完成 | 90%+   | 2026-03-19 |
| [archive-dashboard-design.md](./archive-dashboard-design.md)                           | prd-dashboard.md                     | ✅ 已完成 | 100%   | 2026-03-19 |
| [archive-inbox-rich-text.md](./archive-inbox-rich-text.md)                             | prd-inbox-rich-text.md               | ✅ 已完成 | 100%   | 2026-03-19 |
| [archive-multi-user-refactor.md](./archive-multi-user-refactor.md)                     | prd-echoe-multi-user-refactor.md     | ✅ 已完成 | 100%   | 2026-03-19 |
| [archive-inbox-design.md](./archive-inbox-design.md)                                   | 2026-03-16-inbox-design.md           | ✅ 已完成 | 95%    | 2026-03-19 |
| [archive-apkg-import.md](./archive-apkg-import.md)                                     | prd-anki-import.md                   | ✅ 已完成 | 100%   | 2026-03-19 |
| [archive-media-storage-key.md](./archive-media-storage-key.md)                         | prd-echoe-media-storage-key.md       | ✅ 已完成 | 100%   | 2026-03-19 |
| [archive-inbox-dynamic-source-category.md](./archive-inbox-dynamic-source-category.md) | prd-inbox-dynamic-source-category.md | ✅ 已完成 | 100%   | 2026-03-19 |

### 📋 待归档 (后续处理)

| 原始PRD                          | 优先级 | 说明                               |
| -------------------------------- | ------ | ---------------------------------- |
| prd-echoe-navigation-redesign.md | P1     | 导航重构 - 已实施但需整理归档      |
| prd-note-field-model-refactor.md | P1     | Note 字段重构 - 已实施但需整理归档 |
| prd-settings-page-redesign.md    | P2     | 设置页重构 - 部分实施              |
| prd-flashcards-list-redesign.md  | P1     | 卡片列表重构 - 已实施 FSRS 部分    |

---

## 归档文档规范

每个归档文档必须包含以下章节:

1. **需求概述** - 简要说明需求背景和核心目标
2. **实现状态分析** - 详细列出已完成/未完成功能及代码位置
3. **变更记录** - 记录所有修改的时间、作者和原因
4. **架构影响** - 对系统设计、数据模型和集成点的影响
5. **技术债务** - 未完成功能、已知问题和优化建议
6. **依赖关系** - 上游和下游 PRD 依赖
7. **验收标准** - 最终验收结果
8. **相关文档** - 关联的 PRD、ADR、技术文档链接

---

## 关键决策记录 (ADR)

### ADR-001: 富文本存储策略

- **决策**: 统一使用 TipTap JSON 格式,服务端提供纯文本到 JSON 的转换
- **相关PRD**: Inbox Rich Text, Note Field Refactor
- **影响**: 所有内容字段(notes, inbox)

### ADR-002: FSRS 状态持久化

- **决策**: 在 `echoe_cards` 表添加 `stability`, `difficulty`, `lastReview` 字段
- **相关PRD**: Anki Flashcard System, Flashcards List Redesign
- **影响**: 学习调度、统计口径

### ADR-003: 多用户隔离策略

- **决策**: 所有 Echoe 表包含 `uid NOT NULL`,服务层强制 `uid` 过滤
- **相关PRD**: Multi-User Refactor
- **影响**: 所有 Echoe 功能

### ADR-004: APKG 解析位置

- **决策**: APKG 解析在浏览器完成(sql.js + JSZip),而非服务端
- **相关PRD**: APKG Import
- **影响**: 导入性能、服务器资源

### ADR-005: 媒体存储路径规范

- **决策**: 媒体存储路径包含 `uid`,格式 `echoe-media/{uid}/{filename}`
- **相关PRD**: Media Storage Key, Multi-User Refactor
- **影响**: 媒体隔离、私有存储支持

---

## 需求追溯矩阵

### Anki Flashcard System

- **代码实现**:
  - Backend: `apps/server/src/services/echoe-*.service.ts`
  - Frontend: `apps/web/src/pages/cards/`
  - Schema: `apps/server/src/db/schema/echoe-*.ts`
- **测试用例**: `apps/server/src/__tests__/echoe-*.test.ts`
- **Git Commits**: 927598b, ac89b46, 2b7ce8f, 3b19b7b

### Dashboard Design

- **代码实现**:
  - Frontend: `apps/web/src/pages/dashboard/`
  - Service: `apps/web/src/services/echoe-dashboard.service.ts`
- **Git Commits**: 2ec1d8a, 4c77488

### Inbox Rich Text

- **代码实现**:
  - Backend: `apps/server/src/services/inbox.service.ts`
  - Frontend: `apps/web/src/components/inbox/`
- **Git Commits**: 6d2dde0, bf2e7dd, b932edb, a4d7a50, 61aa9d9

### Multi-User Refactor

- **代码实现**:
  - Schema: All `echoe_*` tables in `apps/server/src/db/schema/`
  - Services: All `apps/server/src/services/echoe-*.service.ts`
  - Controllers: All `apps/server/src/controllers/v1/echoe-*.controller.ts`
- **测试用例**: Comprehensive test coverage
- **影响**: System-wide

---

## 归档流程

1. **需求完成确认**: 开发团队确认 User Stories 完成度
2. **代码审查**: 检查实现代码位置和 Git commits
3. **文档编写**: 按规范模板编写归档文档
4. **决策记录**: 提取关键技术决策到 ADR
5. **追溯关联**: 建立需求到代码的追溯链接
6. **归档审批**: 技术负责人和产品负责人审批
7. **版本控制**: 提交归档文档到版本控制系统

---

## 联系方式

如有归档文档相关问题,请联系:

- 技术负责人: [待填写]
- 产品负责人: [待填写]
