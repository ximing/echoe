# PRD: 导入功能优化

## Introduction

优化现有的导入功能，解决以下问题：
1. 导入时数据库内 rich_text_fields 为空，没有做正确的解析
2. 导入时无法选择目标 Deck，全部导入到 Default 中
3. 导入性能问题：一个一个导入效率低，应改为批量导入
4. 导入进度不透明：只有 loading 动画，无法看到具体进度

## Goals

- 修复富文本字段解析，确保 rich_text_fields 正确存储
- 添加 Deck 选择功能，允许用户指定导入目标 Deck
- 实现批量导入机制，每 50 条提交一次
- 添加可视化的进度条，显示媒体和笔记的导入进度

## User Stories

### US-001: 修复富文本字段解析
**Description:** 作为开发者，我需要在导入时正确解析富文本内容，确保 rich_text_fields 字段被正确填充。

**Acceptance Criteria:**
- [ ] 导入时同时填充 content (纯文本) 和 rich_text_fields (TipTap JSON)
- [ ] 纯文本从富文本中提取
- [ ] 现有导入流程测试通过
- [ ] Typecheck 通过

### US-002: 添加 Deck 选择功能
**Description:** 作为用户，我想在导入时选择要将笔记导入到哪个 Deck，而不是全部导入到 Default。

**Acceptance Criteria:**
- [ ] 导入页面显示 Deck 下拉选择框
- [ ] 显示当前用户的所有 Deck
- [ ] 选择 Deck 后，导入的笔记属于该 Deck
- [ ] Typecheck 通过
- [ ] 浏览器验证 UI

### US-003: 实现批量导入
**Description:** 作为用户，我希望导入过程更快，不用一个个等待。

**Acceptance Criteria:**
- [ ] 每 50 条笔记批量提交一次 API
- [ ] 媒体文件可以逐个上传（无批量需求）
- [ ] 批量提交失败时支持重试
- [ ] Typecheck 通过

### US-004: 添加可视化进度条
**Description:** 作为用户，我想清楚看到导入进度，知道还需要多久完成。

**Acceptance Criteria:**
- [ ] 显示进度条组件
- [ ] 显示 "笔记: xx/xx" 格式的进度
- [ ] 显示 "媒体: xx/xx" 格式的进度
- [ ] 进度实时更新
- [ ] 导入完成后显示完成状态
- [ ] Typecheck 通过
- [ ] 浏览器验证 UI

## Functional Requirements

- FR-1: 导入笔记时，解析内容为纯文本和 TipTap JSON 格式，双字段存储
- FR-2: 导入页面添加 Deck 选择器，读取并显示用户现有的 Deck
- FR-3: 导入 API 支持指定 deckId 参数
- FR-4: 前端实现批量导入逻辑，每 50 条调用一次 createNote API
- FR-5: 添加导入进度状态管理（ProgressService 或在现有 Service 中扩展）
- FR-6: 进度条组件显示：笔记进度和媒体进度分开显示
- FR-7: 进度更新基于实际已处理数量实时计算百分比

## Non-Goals

- 不支持同时导入到多个 Deck（单次导入选择一个 Deck）
- 不支持导入时创建新 Deck（需要先在 Deck 管理中创建）
- 不修改现有的导出功能
- 不添加导入模板保存功能

## Design Considerations

- 复用现有的 DeckSelector 组件（如果存在）
- 进度条组件可参考现有的 Toast 样式
- 批量导入逻辑主要在 csv-import.tsx 和 apkg-import.tsx 中实现

## Technical Considerations

- TipTap JSON 格式参考现有的富文本存储格式
- 批量导入需要处理部分失败的情况：成功的记录已保存，失败的记录需要记录错误
- 进度计算：total 来自解析后的数据长度，current 来自已处理数量

## Success Metrics

- 用户可以成功导入 APKG/CSV 文件到指定的 Deck
- 导入 1000 条笔记的耗时减少 50% 以上（相比单条导入）
- 进度条准确反映实际导入进度

## Open Questions

- 批量导入时如果中途失败，是否需要回滚已成功的部分？（建议：不需要回滚，记录失败条目即可）
- Deck 选择是否需要支持"创建新 Deck"选项？（当前 Non-Goals，后续可以考虑）
