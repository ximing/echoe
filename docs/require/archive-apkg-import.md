# PRD 归档: Anki .apkg 文件导入功能

**文档版本**: v1.0
**归档日期**: 2026-03-19
**原始PRD路径**: tasks/archive/prd-anki-import.md
**责任人**: 前端团队
**当前状态**: ✅ 已完成 (100%)

---

## 一、需求概述

实现直接导入 Anki 的 `.apkg` 文件功能,允许用户将已有的 Anki 卡片库迁移到 Echoe 系统中。`.apkg` 本质上是 ZIP 压缩包,内部包含 SQLite 数据库(`collection.anki21` 或 `collection.anki2`)、媒体文件映射(`media` JSON)和实际的媒体资源文件。

解析工作在浏览器中实现,支持 Chrome 内核浏览器,需要同时兼容新旧两种 Anki 格式。

### 核心目标
- 支持导入 `.apkg` 文件(Anki 新旧格式)
- 解析 ZIP 包并提取 SQLite 数据库和媒体文件
- 保持原有的卡片模板和 CSS 样式
- 完整导入图片、音频等媒体资源到 Echoe 存储
- 导入复习历史,保持学习记录连续性
- 新建笔记而非覆盖现有数据

---

## 二、实现状态分析

### 2.1 已完成功能 (✅)

- ✅ **US-001**: 解析 .apkg ZIP 文件结构
  - 使用 JSZip 库解压 .apkg 文件
  - 识别并提取 collection.anki21 或 collection.anki2 SQLite 数据库
  - 解析 media 文件(JSON 映射 + 数字命名的媒体文件)
  - 同时支持 Anki v11+ (anki21) 和旧版 (anki2) 格式
  - 代码位置: `apps/web/src/services/apkg-parser.service.ts`

- ✅ **US-002**: 在浏览器中操作 SQLite 数据库
  - 使用 sql.js 在浏览器中打开提取的 SQLite 数据库
  - 读取 col 表获取牌组、模板、配置信息
  - 读取 notes 表获取笔记内容(字段分隔符 0x1f)
  - 读取 cards 表获取卡片信息
  - 读取 revlog 表获取复习历史
  - 代码位置: `apps/web/src/services/apkg-parser.service.ts`

- ✅ **US-003**: 导入笔记和卡片数据
  - 将 Anki 笔记转换为 Echoe 笔记格式
  - 解析模板字段,生成问答内容
  - 保持模板的 HTML/CSS 样式
  - 创建对应的笔记分类(牌组结构)
  - 导入为新建笔记,不覆盖现有数据
  - 代码位置: `apps/web/src/services/apkg-parser.service.ts`, `apps/web/src/services/echoe-import.service.ts`
  - Git commit: 927598b (Show APKG deck names during import with rename option)

- ✅ **US-004**: 导入复习历史
  - 读取 revlog 表的复习记录
  - 将复习历史关联到导入的卡片
  - 保留原始复习时间间隔和 Ease Factor
  - 转换为 Echoe 的 FSRS 学习记录格式
  - 代码位置: `apps/web/src/services/apkg-parser.service.ts`

- ✅ **US-005**: 导入媒体文件
  - 解析 media JSON 映射文件
  - 提取 ZIP 中的媒体文件
  - 上传到 Echoe 的附件存储(S3 或本地)
  - 更新笔记内容中的媒体引用
  - 支持图片、音频、视频等常见格式
  - 代码位置: `apps/web/src/services/apkg-parser.service.ts`

- ✅ **US-006**: 创建导入 UI 界面
  - 支持拖拽或点击上传 .apkg 文件
  - 显示导入进度(解析、读取、导入各阶段)
  - 显示导入统计(笔记数、卡片数、媒体数)
  - 导入完成后展示成功消息
  - 支持取消导入操作
  - 代码位置: `apps/web/src/pages/cards/import/apkg-import-page.tsx`
  - Git commit: 337c1a0 (添加可视化进度条), c318a0a (实现批量导入机制)

- ✅ **US-007**: 导入错误处理
  - 识别无效的 .apkg 文件格式
  - 处理数据库损坏的情况
  - 处理媒体文件缺失的情况
  - 显示具体的错误信息和解决建议
  - 导入失败时不会产生脏数据
  - 代码位置: `apps/web/src/services/apkg-parser.service.ts`

- ✅ **US-008**: 导入优化
  - 批量导入机制(减少 API 调用次数)
  - 可视化进度条
  - Deck 选择功能(导入前选择目标 deck 或重命名)
  - 富文本字段解析修复
  - Git commits: 8592b7a, d6232ba, c318a0a, 337c1a0, aaf9445

### 2.2 关键技术决策

#### 决策 1: 前端解析策略
- **决策内容**: APKG 解析在浏览器完成(sql.js + JSZip),而非服务端
- **Why**: 避免服务端 SQLite 依赖,提升解析性能,减少服务器资源消耗
- **How to apply**: 前端解析后通过标准 API 提交数据到后端存储
- **Git commit**: ac89b46, 2b7ce8f

#### 决策 2: 批量导入优化
- **决策内容**: 将笔记和卡片数据批量提交,而非逐条提交
- **Why**: 减少 API 调用次数,提升导入性能
- **How to apply**: 前端收集所有数据后,调用批量创建接口
- **Git commit**: c318a0a

#### 决策 3: Deck 选择与重命名
- **决策内容**: 导入前允许用户选择目标 deck 或重命名 APKG 中的 deck
- **Why**: 避免 deck 名称冲突,提升用户体验
- **How to apply**: 导入 UI 显示 APKG 中的 deck 名称,支持重命名
- **Git commit**: 927598b, d6232ba

---

## 三、变更记录

| 日期 | 变更内容 | 原因 | 影响范围 |
|------|---------|------|---------|
| 2026-03-10 | 初始 PRD 创建 | 项目需求 | 全部 |
| 2026-03-11 | 实现基础解析 | 开发进度 | US-001, US-002 |
| 2026-03-12 | 实现数据导入 | 开发进度 | US-003, US-004, US-005 |
| 2026-03-13 | 实现 UI 界面 | 开发进度 | US-006, US-007 |
| 2026-03-15 | 移除服务端代码 | 架构优化 | 解析逻辑 (#90) |
| 2026-03-16 | 导入优化 | 性能优化 | US-008 (#91) |
| 2026-03-17 | Deck 选择功能 | 用户体验 | US-008 (#92) |
| 2026-03-19 | 归档文档生成 | 项目里程碑 | - |

---

## 四、架构影响

### 4.1 前端组件
- 新增 `ApkgParserService` - APKG 解析服务
- 新增 `ApkgImportPage` - 导入页面
- 依赖库: `sql.js`, `jszip`

### 4.2 API 接口
- 复用现有笔记/卡片创建接口
- 新增批量创建接口(优化性能)

### 4.3 数据流
```
.apkg 文件 → JSZip 解压 → SQLite 解析(sql.js) → 数据转换 → 批量 API 提交 → 后端存储
```

---

## 五、技术债务

### 5.1 未完成功能
无(所有核心功能已完成)

### 5.2 已知问题
- 大文件(>100MB)导入可能较慢(受浏览器内存限制)
- 不支持部分 Anki 特殊模板语法(如复杂的 JavaScript 模板)

### 5.3 优化建议
- 考虑添加"流式导入"(分批处理大文件)
- 考虑添加"导入预览"(导入前预览数据)
- 考虑添加"增量导入"(只导入新增/修改的卡片)

---

## 六、依赖关系

### 上游依赖
- PRD: Anki Flashcard System (依赖 Note/Card/Deck API)
- PRD: Multi-User Refactor (用户隔离)

### 下游依赖
无

---

## 七、验收标准

✅ **已通过**
- 可以成功导入标准的 Anki 笔记库
- 导入后的卡片样式与原 Anki 卡片一致
- 媒体文件可以正常显示和播放
- 复习历史可以在 Echoe 中继续
- 导入进度可视化显示
- 可以选择或重命名导入的 deck
- 批量导入性能优化生效
- 富文本字段正确解析
- 所有相关 Issues 已关闭(#90, #91, #92, #93)

---

## 八、相关文档

- [Anki Flashcard System PRD](./archive-anki-flashcard-system.md)
- [Anki Collection Format](https://github.com/ankidroid/Anki-Android/wiki/Database-Structure)
- [sql.js Documentation](https://sql.js.org/)
- [JSZip Documentation](https://stuk.github.io/jszip/)

---

**归档审批**
- 技术负责人: ______
- 产品负责人: ______
- 归档日期: 2026-03-19
