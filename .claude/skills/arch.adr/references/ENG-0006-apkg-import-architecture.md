# ENG-0006 APKG 导入架构：浏览器解析 + 服务端导入

## Status
Accepted

## Date
2026-03-18

## Context
实现 Anki .apkg 文件导入功能，需要在浏览器中解析 ZIP 结构提取数据库和媒体文件，然后在服务端完成实际的数据导入。

## Decision
采用前后端分工的架构设计：

1. **浏览器端（前端）**：
   - 使用 JSZip 解析 .apkg ZIP 文件
   - 使用 sql.js（WebAssembly SQLite）在浏览器中读取 collection.anki21/anki2 数据库
   - 解析 notes、cards、models、decks、revlog 表
   - 提取媒体文件（media JSON 映射 + 实际文件）
   - 将解析后的数据通过 API 提交到服务端

2. **服务端（后端）**：
   - 使用 better-sqlite3 处理 .apkg 文件导入
   - 在独立事务中完成笔记、卡片、媒体、学习记录的批量导入
   - 不在服务端解析 ZIP（避免大文件传输和内存问题）

3. **前后端数据格式**：
   - 前端解析后生成结构化 JSON
   - 后端接收 JSON 执行批量插入

## Constraint / Source of Truth
这是 APKG 导入功能的核心架构约束，所有相关实现必须遵循前后端分离原则。

## Evidence
- `apps/web/src/services/apkg-parser.service.ts` - 前端解析服务
- `apps/server/src/services/echoe-import.service.ts` - 后端导入服务
- `prd-anki-import.md` - 功能需求文档

## Impact
### 对技术方案设计
- 前端负责解析，后端负责存储，职责边界清晰
- 大文件在浏览器端处理，减少服务端资源消耗

### 对 PRD 设计
- 明确前后端分工，便于需求拆解和排期

## Guardrails / Acceptance Checks
- [ ] 前端解析使用 JSZip + sql.js，不使用其他 ZIP/SQLite 库
- [ ] 服务端导入使用 better-sqlite3，不在前端执行数据库写入
- [ ] 媒体文件通过服务端 API 上传，不直接暴露存储路径

## Change Log
- 2026-03-18: 初始建立 APKG 导入架构约束。
