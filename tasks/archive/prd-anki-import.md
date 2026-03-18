# PRD: Anki .apkg 文件导入功能

## Introduction

实现直接导入 Anki 的 `.apkg` 文件功能，允许用户将已有的 Anki 卡片库迁移到 Echoe 系统中。`.apkg` 本质上是 ZIP 压缩包，内部包含 SQLite 数据库（`collection.anki21` 或 `collection.anki2`）、媒体文件映射（`media` JSON）和实际的媒体资源文件。解析工作在浏览器中实现，支持 Chrome 内核浏览器，需要同时兼容新旧两种 Anki 格式。

## Goals

- 支持导入 `.apkg` 文件（Anki 新旧格式）
- 解析 ZIP 包并提取 SQLite 数据库和媒体文件
- 保持原有的卡片模板和 CSS 样式
- 完整导入图片、音频等媒体资源到 Echoe 存储
- 导入复习历史，保持学习记录连续性
- 新建笔记而非覆盖现有数据

## User Stories

### US-001: 解析 .apkg ZIP 文件结构
**Description:** 作为开发者，我需要在浏览器中解析 .apkg 文件结构，提取数据库和媒体文件。

**Acceptance Criteria:**
- [ ] 使用 JSZip 库解压 .apkg 文件
- [ ] 识别并提取 collection.anki21 或 collection.anki2 SQLite 数据库
- [ ] 解析 media 文件（JSON 映射 + 数字命名的媒体文件）
- [ ] 同时支持 Anki v11+ (anki21) 和旧版 (anki2) 格式
- [ ] Typecheck 通过

### US-002: 在浏览器中操作 SQLite 数据库
**Description:** 作为开发者，我需要在浏览器中打开和查询 SQLite 数据库，读取笔记、卡片、牌组等信息。

**Acceptance Criteria:**
- [ ] 使用 sql.js 在浏览器中打开提取的 SQLite 数据库
- [ ] 读取 col 表获取牌组、模板、配置信息
- [ ] 读取 notes 表获取笔记内容（字段分隔符 0x1f）
- [ ] 读取 cards 表获取卡片信息
- [ ] 读取 revlog 表获取复习历史
- [ ] Typecheck 通过

### US-003: 导入笔记和卡片数据
**Description:** 作为用户，我想把 Anki 的笔记和卡片导入到 Echoe 中作为新笔记。

**Acceptance Criteria:**
- [ ] 将 Anki 笔记转换为 Echoe 笔记格式
- [ ] 解析模板字段，生成问答内容
- [ ] 保持模板的 HTML/CSS 样式
- [ ] 创建对应的笔记分类（牌组结构）
- [ ] 导入为新建笔记，不覆盖现有数据
- [ ] Typecheck 通过

### US-004: 导入复习历史
**Description:** 作为用户，我想导入原有的复习历史，这样在 Echoe 中可以继续学习进度。

**Acceptance Criteria:**
- [ ] 读取 revlog 表的复习记录
- [ ] 将复习历史关联到导入的卡片
- [ ] 保留原始复习时间间隔和 Ease Factor
- [ ] 转换为 Echoe 的 FSRS 学习记录格式
- [ ] Typecheck 通过

### US-005: 导入媒体文件
**Description:** 作为用户，我想完整导入卡片中的图片、音频等媒体文件。

**Acceptance Criteria:**
- [ ] 解析 media JSON 映射文件
- [ ] 提取 ZIP 中的媒体文件
- [ ] 上传到 Echoe 的附件存储（S3 或本地）
- [ ] 更新笔记内容中的媒体引用
- [ ] 支持图片、音频、视频等常见格式
- [ ] Typecheck 通过

### US-002: 创建导入 UI 界面
**Description:** 作为用户，我想通过直观的界面上传和导入 Anki 文件。

**Acceptance Criteria:**
- [ ] 支持拖拽或点击上传 .apkg 文件
- [ ] 显示导入进度（解析、读取、导入各阶段）
- [ ] 显示导入统计（笔记数、卡片数、媒体数）
- [ ] 导入完成后展示成功消息
- [ ] 支持取消导入操作
- [ ] Typecheck 通过
- [ ] 使用 dev-browser skill 在浏览器中验证 UI

### US-003: 导入错误处理
**Description:** 作为用户，我想在导入失败时得到清晰的错误提示。

**Acceptance Criteria:**
- [ ] 识别无效的 .apkg 文件格式
- [ ] 处理数据库损坏的情况
- [ ] 处理媒体文件缺失的情况
- [ ] 显示具体的错误信息和解决建议
- [ ] 导入失败时不会产生脏数据
- [ ] Typecheck 通过

## Functional Requirements

- FR-1: 使用 JSZip 库解压 .apkg 文件（ZIP 格式）
- FR-2: 检测并支持 collection.anki21（v11+）和 collection.anki2（旧版）两种数据库文件名
- FR-3: 使用 sql.js 在浏览器中操作 SQLite 数据库
- FR-4: 解析 notes 表的 flds 字段（0x1F 分隔的多字段内容）
- FR-5: 解析 col 表的 models JSON 获取模板（qfmt, afmt, css）
- FR-6: 解析 col 表的 decks JSON 获取牌组结构
- FR-7: 解析 media 文件获取数字文件名到原始文件名的映射
- FR-8: 将媒体文件上传到 Echoe 附件存储并更新引用
- FR-9: 读取 revlog 表并转换为 Echoe 学习记录格式
- FR-10: 提供文件上传 UI 和导入进度展示

## Non-Goals

- 不支持导出 Echoe 数据为 .apkg 格式
- 不支持导入共享牌组（.colpkg）文件
- 不处理 Anki 插件扩展的数据
- 不支持在服务端解析（限定浏览器环境）

## Technical Considerations

- 使用 JSZip 而非 adm-zip 或 unzipper（更好的浏览器兼容性）
- 使用 sql.js（SQLite 的 WebAssembly 版本）操作数据库
- 媒体文件上传复用现有的 Echoe 附件上传 API
- 导入数据通过 API 提交到后端存储
- 需要处理大文件的流式读取和渐进式解析

## Success Metrics

- 可以成功导入标准的 Anki 笔记库
- 导入后的卡片样式与原 Anki 卡片一致
- 媒体文件可以正常显示和播放
- 复习历史可以在 Echoe 中继续

## Open Questions

- 是否需要支持部分导入（如只导入特定牌组）？
- 导入大量媒体文件时的性能优化策略？
- 是否需要处理 Anki 特殊模板语法（如 cloze deletion）？
