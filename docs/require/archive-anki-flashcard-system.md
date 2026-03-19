# PRD 归档: Anki-Compatible Flashcard Learning System

**文档版本**: v1.0
**归档日期**: 2026-03-19
**原始PRD路径**: tasks/archive/2026-03-11-anki-flashcard-system/prd-anki-flashcard-system.md
**责任人**: 开发团队
**当前状态**: ✅ 已完成 (90%+核心功能)

---

## 一、需求概述

构建一个全功能的、与 Anki 兼容的闪卡学习系统,集成到 echoe 平台。系统使用 FSRS (Free Spaced Repetition Scheduler) 算法进行科学的间隔重复调度,支持 .apkg 文件格式以实现完整的 Anki 兼容性,提供覆盖 Anki 95%+ 核心功能的完整特性集。

### 核心目标
- 实现 FSRS 算法(使用 `ts-fsrs` 库)实现最优间隔重复调度
- 100% 兼容 .apkg 导入/导出格式
- 支持所有核心 Anki 卡片类型: Basic、Reverse、Cloze、Type-in-Answer
- 提供完整的卡片管理系统: decks、notes、templates、tags、media
- 提供移动友好的学习界面,支持手势和夜间模式
- 将所有数据存储在 MySQL(无外键)中,使用 Anki 2.1 兼容的 schema

---

## 二、实现状态分析

### 2.1 已完成功能 (✅)

#### Phase 1: 核心学习引擎
- ✅ **US-001**: FSRS 算法实现
  - 已集成 `ts-fsrs` 库
  - 实现 FSRSService 服务层
  - 支持 4 个评分按钮调度
  - 代码位置: `apps/server/src/services/fsrs.service.ts`

- ✅ **US-002**: MySQL 数据库 Schema (Anki 2.1 兼容)
  - 已创建完整表结构:
    - `echoe_col`: 集合元数据
    - `echoe_notes`: 笔记内容 (含 `fieldsJson` 主存储字段)
    - `echoe_cards`: 卡片信息 (含 FSRS 字段: `stability`, `difficulty`, `lastReview`)
    - `echoe_revlog`: 复习历史
    - `echoe_decks`: 卡组
    - `echoe_deck_config`: 卡组配置
    - `echoe_notetypes`: 笔记类型
    - `echoe_templates`: 模板
    - `echoe_media`: 媒体文件
    - `echoe_graves`: 删除记录
    - `echoe_config`: 配置
  - 代码位置: `apps/server/src/db/schema/echoe-*.ts`

- ✅ **US-003**: Deck Management API
  - 已实现完整 CRUD 接口
  - 支持子卡组(`::`分隔符)
  - 代码位置: `apps/server/src/controllers/v1/echoe-deck.controller.ts`

- ✅ **US-004**: Card & Note Management API
  - 已实现笔记和卡片 CRUD
  - 支持批量操作
  - 代码位置: `apps/server/src/controllers/v1/echoe-note.controller.ts`

- ✅ **US-005**: Study Session API
  - 已实现学习队列、复习提交、撤销功能
  - FSRS 调度集成
  - 代码位置: `apps/server/src/services/echoe-study.service.ts`

- ✅ **US-006**: Main Deck List Screen
  - 已实现卡组列表页面
  - 显示待学数量统计
  - 代码位置: `apps/web/src/pages/cards/index.tsx`

- ✅ **US-007**: Study Session Screen
  - 已实现学习页面
  - 显示卡片前后面,评分按钮,进度
  - 代码位置: `apps/web/src/pages/cards/study/index.tsx`

- ✅ **US-008**: Card Rendering Engine
  - 已实现 HTML 渲染、字段替换、Cloze 支持
  - LaTeX 渲染(KaTeX)
  - 代码位置: `apps/web/src/components/echoe/CardRenderer.tsx`

#### Phase 2: 数据导入/导出
- ✅ **US-009**: .apkg Import
  - 已实现前端解析(sql.js + JSZip)
  - 支持 Anki 2.1 和旧版格式
  - 媒体文件导入
  - 代码位置: `apps/web/src/services/apkg-parser.service.ts`
  - Git commit: 927598b, ac89b46, 2b7ce8f

- ✅ **US-010**: .apkg Export
  - 已实现导出功能
  - 支持调度信息可选导出
  - 代码位置: `apps/server/src/services/echoe-export.service.ts`

#### Phase 3: 内容编辑
- ✅ **US-011**: Card Editor
  - 已实现卡片编辑器
  - 富文本工具栏(Bold, Italic, Underline等)
  - 图片插入
  - 标签自动完成(部分)
  - 代码位置: `apps/web/src/components/echoe/CardEditorDialog.tsx`

- ⚠️ **US-012**: Card Browser (部分完成)
  - 已实现基础浏览功能
  - 缺少: 高级搜索、批量编辑

- ⚠️ **US-013**: Cloze Card Support (部分完成)
  - 基础 Cloze 语法支持
  - 缺少: 多 ordinal 支持

- ❌ **US-014**: Type-in-Answer Card Support (未实现)

#### Phase 4: 统计与高级功能
- ✅ **US-015**: Learning Statistics
  - 已实现统计页面
  - 显示学习概览、历史图表、成熟度分布
  - 代码位置: `apps/web/src/pages/cards/stats/index.tsx`

- ❌ **US-016**: Leech Detection (未实现)
- ❌ **US-017**: Undo/Redo System (部分,仅单次撤销)
- ⚠️ **US-018**: Bury Card Management (部分完成)
- ⚠️ **US-019**: Card State Reset (部分完成)
- ❌ **US-020**: Custom Study Session (未实现)
- ❌ **US-021**: Audio Auto-play & TTS (未实现)
- ✅ **US-022**: Application Settings (已完成)
- ❌ **US-023**: Filtered Deck (未实现)
- ⚠️ **US-024**: Note Type Manager (部分完成)
- ❌ **US-025**: Tag Manager (未实现)
- ❌ **US-026**: Media Manager (未实现)
- ❌ **US-027**: CSV/TSV Bulk Import (未实现)
- ❌ **US-028**: Duplicate Card Detection (未实现)

### 2.2 关键技术决策

#### 决策 1: FSRS 状态字段持久化
- **决策内容**: 在 `echoe_cards` 表添加 `stability`, `difficulty`, `lastReview` 字段
- **Why**: FSRS 算法需要持久化核心状态,不能仅依赖 Anki 兼容字段(`ivl`, `factor`)推导
- **How to apply**: 所有学习调度必须读写这些字段,`ivl/factor` 仅作为兼容层

#### 决策 2: 富文本存储策略
- **决策内容**: `echoe_notes` 表使用 `fieldsJson` 作为主存储,`richTextFields` 存储 TipTap JSON,`flds/sfld/csum` 作为派生字段
- **Why**: 统一富文本处理,避免前后端解析不一致,支持 Anki 导入导出
- **How to apply**: 所有写入路径必须调用标准化模块生成派生字段

#### 决策 3: 前端 APKG 解析
- **决策内容**: APKG 解析在浏览器完成(sql.js + JSZip),而非服务端
- **Why**: 避免服务端 SQLite 依赖,提升解析性能,减少服务器资源消耗
- **How to apply**: 前端解析后通过标准 API 提交数据到后端存储
- **Git commit**: ac89b46, 2b7ce8f

---

## 三、变更记录

| 日期 | 变更内容 | 原因 | 影响范围 |
|------|---------|------|---------|
| 2026-03-11 | 初始 PRD 创建 | 项目启动 | 全部 |
| 2026-03-14 | FSRS 字段持久化方案确认 | 调度精度需求 | US-001, US-005 |
| 2026-03-15 | 富文本存储策略定稿 | 与 Note Field Refactor PRD 对齐 | US-008, US-011 |
| 2026-03-17 | APKG 解析改为前端实现 | 性能与架构考量 | US-009 |
| 2026-03-19 | 归档文档生成 | 项目里程碑 | - |

---

## 四、架构影响

### 4.1 数据库 Schema
- 新增 11 个 Echoe 业务表
- 总计约 40+ 列的 FSRS 和 Anki 兼容字段
- 索引策略: 按 `uid` + `did` + `queue` + `due` 优化学习队列查询

### 4.2 前端组件
- 新增 20+ 页面和对话框组件
- 核心服务: `EchoeDeckService`, `EchoeStudyService`, `ApkgParserService`
- 布局: 使用统一 `Layout` 组件与侧边栏导航

### 4.3 后端服务
- 新增 8 个 Controller: Deck, Note, Card, Study, Stats, Import, Export, Config
- 新增 10+ Service: FSRSService, EchoeStudyService, EchoeImportService 等
- 中间件: JWT 认证,用户上下文注入

---

## 五、技术债务

### 5.1 未完成功能(P2)
- Leech 检测与自动挂起
- 高级 Undo/Redo 栈
- 自定义学习会话(Custom Study)
- TTS 语音合成
- Filtered Deck 动态卡组
- Tag Manager 标签管理
- Media Manager 媒体清理
- CSV 批量导入
- 重复卡片检测

### 5.2 已知问题
- Undo 仅支持单次撤销,无完整状态快照恢复
- Cloze 卡片多 ordinal 支持不完整
- Card Browser 高级搜索语法未实现
- APKG 导出的媒体 manifest 可能与官方 Anki 格式有差异

### 5.3 优化建议
- 学习队列查询性能优化(大量卡片时)
- 富文本字段渲染性能优化(长内容卡片)
- APKG 大文件导入的流式处理

---

## 六、依赖关系

### 上游依赖
- PRD: Note Field Model Refactor (富文本存储规范)
- PRD: Echoe Multi-User Refactor (用户隔离)

### 下游依赖
- PRD: Flashcards List Redesign (依赖本 PRD 的 Deck API)
- PRD: Dashboard Design (依赖本 PRD 的 Stats API)

---

## 七、验收标准

✅ **已通过**
- 可以导入标准 Anki APKG 文件(包含笔记、卡片、媒体)
- 可以创建和学习卡片,FSRS 调度正常工作
- 可以导出为 APKG 文件
- 富文本编辑器可以编辑卡片内容
- 统计页面显示学习数据

⚠️ **部分通过**
- 导入后的卡片样式与原 Anki 卡片基本一致(CSS 可能有差异)
- 复习历史可以在 Echoe 中继续(FSRS 状态可能需要回填)

---

## 八、相关文档

- [FSRS Algorithm Guide](./fsrs-algorithm-guide.md)
- [Note Field Model Refactor](./echoe-note-data-refactor-plan.md)
- [Anki Collection Format](https://github.com/ankidroid/Anki-Android/wiki/Database-Structure)
- [ts-fsrs Library](https://github.com/open-spaced-repetition/ts-fsrs)

---

**归档审批**
- 技术负责人: ______
- 产品负责人: ______
- 归档日期: 2026-03-19
