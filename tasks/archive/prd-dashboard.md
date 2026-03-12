# PRD: Dashboard 仪表盘页面

## Introduction

将侧边栏第一项改造为仪表盘页面，承担原学习入口职责并扩展为三区布局。当前侧边栏第一项直接跳转到学习页面，缺少全局概览能力。新仪表盘提供今日待学统计、跨卡片集一键学习、各卡片集状态概览、以及学习历史和预测趋势图表。

## Goals

- 新增 `/dashboard` 路由和 `DashboardPage` 页面组件
- 侧边栏第一项改为仪表盘入口（图标 `LayoutDashboard`，始终导航至 `/dashboard`）
- 第一区：展示今日待学总数、streak、一键开始学习
- 第二区：展示所有卡片集的状态（待学数、成熟度条）及单独进入学习的按钮
- 第三区：学习历史折线图（7/30天切换）+ 未来14天预测柱状图
- 新增后端接口：`GET /api/v1/stats/streak` 和 `GET /api/v1/stats/maturity/batch`

## User Stories

### US-001: 新增后端 streak 接口
**Description:** As a developer, I need a `/api/v1/stats/streak` endpoint so that the dashboard can display the user's consecutive learning days.

**Acceptance Criteria:**
- [ ] `GET /api/v1/stats/streak` 返回 `{ streak: number }`
- [ ] 查询 `echoeRevlog` 表，使用 `id` 字段（bigint，Unix 毫秒 × 1000）推算 UTC 日期
- [ ] 若今天（UTC）有学习记录：streak = 从今天往前连续有记录的天数
- [ ] 若今天无记录但昨天有记录：streak = 从昨天往前连续有记录的天数（streak 不中断）
- [ ] 若今天和昨天均无记录：streak = 0
- [ ] 不做用户过滤（与现有 stats 接口保持一致）
- [ ] Typecheck/lint passes

### US-002: 新增后端 maturity batch 接口
**Description:** As a developer, I need a `/api/v1/stats/maturity/batch` endpoint so that the dashboard can display maturity distribution for all decks in one request.

**Acceptance Criteria:**
- [ ] `GET /api/v1/stats/maturity/batch` 返回 `{ decks: Array<{ deckId, new, learning, young, mature }> }`
- [ ] 单次 SQL 查询 `echoeCards` 表，按 `did`（deckId）分组
- [ ] 分类边界与现有 `getCardMaturity()` 完全一致：`ivl=0` → new；`0<ivl<21` → learning；`21≤ivl<90` → young；`ivl≥90` → mature
- [ ] `ivl=0` 优先判断为 new（不落入 learning 桶）
- [ ] 不做用户过滤（与现有 stats 接口保持一致）
- [ ] Typecheck/lint passes

### US-003: 前端新增 API 客户端函数
**Description:** As a developer, I need client-side API functions for the two new endpoints so that the dashboard service can call them.

**Acceptance Criteria:**
- [ ] `apps/web/src/api/echoe.ts` 新增 `getStreak(): Promise<{ streak: number }>`
- [ ] `apps/web/src/api/echoe.ts` 新增 `getMaturityBatch(): Promise<{ decks: MaturityBatchDeck[] }>`
- [ ] 导出对应的 TypeScript 类型 `MaturityBatchDeck`
- [ ] Typecheck/lint passes

### US-004: 新增仪表盘数据服务
**Description:** As a developer, I need an `EchoeDashboardService` (@rabjs/react Service) so that the dashboard page has a reactive data layer for streak, maturity, history, and forecast.

**Acceptance Criteria:**
- [ ] 新建 `apps/web/src/services/echoe-dashboard.service.ts`，使用 `@rabjs/react` Service 模式
- [ ] 服务管理以下可观察状态：`streak`、`maturityBatch`、`history`（含 `historyDays` 切换）、`forecast`
- [ ] decks 数据不在此服务重复请求，复用 `EchoeDeckService` 单例
- [ ] 提供 `loadStreak()`、`loadMaturityBatch()`、`loadHistory(days: 7 | 30)`、`loadForecast()` 方法
- [ ] Typecheck/lint passes

### US-005: 修改侧边栏导航
**Description:** As a user, I want the first sidebar item to navigate to the dashboard so that I have a central overview page.

**Acceptance Criteria:**
- [ ] `apps/web/src/components/layout.tsx` 导入 `LayoutDashboard`（替换 `Zap`）
- [ ] 第一项路由改为 `/dashboard`，点击行为始终导航至 `/dashboard`（不再根据 `dueCount` 条件跳转）
- [ ] 新增 `isDashboardPage = location.pathname.startsWith('/dashboard')`
- [ ] 第一项 active class 改为使用 `isDashboardPage`（在 `/cards/study` 页面时不高亮）
- [ ] `isStudyPage` 变量保留不变，`showFab` 仍依赖它
- [ ] 侧边栏红色徽章（待学总数）保留，数字来源不变（`EchoeDeckService.getTotalDue()`）
- [ ] Typecheck/lint passes
- [ ] Verify in browser using dev-browser skill

### US-006: 注册仪表盘路由
**Description:** As a developer, I need to register the `/dashboard` route so that the dashboard page is accessible.

**Acceptance Criteria:**
- [ ] `apps/web/src/App.tsx`（或路由文件）注册 `/dashboard` → `DashboardPage`
- [ ] 直接访问 `/dashboard` 可正确渲染页面
- [ ] Typecheck/lint passes

### US-007: 实现第一区——今日行动区
**Description:** As a user, I want to see today's due count and my streak at a glance, and start studying with one click.

**Acceptance Criteria:**
- [ ] 页面顶部全宽卡片，三列布局（待学数 | streak | 开始学习按钮）
- [ ] 左侧：大号数字显示今日待学总数（`newCount + learnCount + reviewCount` 聚合自所有 decks）
- [ ] 左侧下方：三个小标签，新卡（蓝）/ 学习中（橙）/ 复习（绿），各自数量
- [ ] 中间：火焰图标 + 大号 streak 数字 + 下方"已坚持 X 天"文字
- [ ] 右侧：按钮文案"开始学习"，点击导航至 `/cards/study`（不传 deckId）
- [ ] 数据加载中时按钮显示 loading 状态（禁用 + spinner）
- [ ] 数据加载完成且待学数为 0 时按钮显示"今日已完成"禁用状态
- [ ] `DashboardPage` 在 `useEffect` 中调用 `deckService.loadDecks()` 加载 decks 数据
- [ ] Typecheck/lint passes
- [ ] Verify in browser using dev-browser skill

### US-008: 实现第二区——卡片集列表
**Description:** As a user, I want to see each deck's status and start studying a specific deck from the dashboard.

**Acceptance Criteria:**
- [ ] 卡片集 ≤ 4 个时，2 列网格布局；> 4 个时，单列列表布局
- [ ] 每张卡片展示：卡片集名称（`::` 分隔符处理层级缩进）
- [ ] 每张卡片展示：三个数字徽章，新卡（蓝）/ 学习中（橙）/ 复习（绿）
- [ ] 每张卡片展示：成熟度进度条，四段颜色（新/学习中/年轻/成熟），数据来自 `maturityBatch` 接口
- [ ] 今日有待学时：按钮文案"学习此卡片集"，点击跳转 `/cards/study/:deckId`
- [ ] 今日无待学时：按钮显示"已完成 ✓"（禁用状态）
- [ ] decks 数据复用第一区已加载的 `EchoeDeckService` 数据，无额外请求
- [ ] Typecheck/lint passes
- [ ] Verify in browser using dev-browser skill

### US-009: 实现第三区——统计趋势图表
**Description:** As a user, I want to see my learning history and upcoming forecast so that I can understand my study patterns.

**Acceptance Criteria:**
- [ ] 页面底部两列并排布局
- [ ] 左侧：学习历史折线图，X 轴日期，Y 轴复习数量
- [ ] 左侧：默认展示 7 天数据（页面挂载时调用 `GET /api/v1/stats/history?days=7`）
- [ ] 左侧：提供 7 天 / 30 天切换按钮，切换时重新请求
- [ ] 左侧：Tooltip 展示当天学习数 + 用时
- [ ] 右侧：未来 14 天预测柱状图，X 轴日期，Y 轴预计到期数量
- [ ] 右侧：今天对应的柱子高亮显示
- [ ] 右侧：数据来自 `GET /api/v1/stats/forecast?days=14`
- [ ] 两个图表均为全局数据，不按卡片集过滤
- [ ] Typecheck/lint passes
- [ ] Verify in browser using dev-browser skill

## Functional Requirements

- FR-1: `GET /api/v1/stats/streak` 端点必须存在并返回 `{ streak: number }`，streak 计算逻辑按"今天有记录 → 从今天数；今天无但昨天有 → 从昨天数；都没有 → 0"规则执行
- FR-2: `GET /api/v1/stats/maturity/batch` 端点必须存在并返回所有卡片集的成熟度分布，分类边界与 `getCardMaturity()` 完全一致
- FR-3: 侧边栏第一项点击必须始终导航至 `/dashboard`，不得有条件跳转逻辑
- FR-4: 侧边栏第一项 active 状态仅在路径以 `/dashboard` 开头时高亮，`/cards/study` 页面不高亮
- FR-5: `showFab` 的逻辑必须继续依赖 `isStudyPage`，不受本次改动影响
- FR-6: 仪表盘第一区的待学数必须从 `EchoeDeckService` 的 `decks` 数据聚合，不发额外请求
- FR-7: 仪表盘第二区的卡片集列表必须复用第一区已加载的 decks 数据
- FR-8: 学习历史图表页面挂载时默认请求 `days=7`，后端接口默认值不变
- FR-9: 预测图表请求 `days=14`，今天对应柱子必须有视觉高亮
- FR-10: 卡片集名称中的 `::` 分隔符必须处理为层级缩进显示

## Non-Goals

- 仪表盘页面不支持按卡片集过滤统计数据（该功能属于 stats 页面）
- 不添加成熟度饼图（stats 页面已有）
- 不添加学习目标设置功能
- 不添加通知/提醒功能
- 不修改 `/cards/study` 页面本身的任何逻辑
- 不修改现有 stats 接口的后端默认参数值

## Design Considerations

页面三区布局（从上到下）：

```
┌─────────────────────────────────────────┐
│  今日行动区                              │
│  待学总数(新/学/复) │ Streak │ 开始学习  │
└─────────────────────────────────────────┘
┌─────────────────────────────────────────┐
│  卡片集列表                              │
│  [卡片集卡片] [卡片集卡片]               │
│  名称 | 新/学/复徽章 | 成熟度条 | 按钮   │
└─────────────────────────────────────────┘
┌──────────────────┬──────────────────────┐
│  学习历史折线图   │  14天预测柱状图       │
│  7天/30天切换    │                      │
└──────────────────┴──────────────────────┘
```

- 成熟度进度条：四段颜色条，从左到右依次为新（蓝）/ 学习中（橙）/ 年轻（黄绿）/ 成熟（绿），宽度按比例
- 徽章颜色：新卡蓝色、学习中橙色、复习绿色（与现有 cards 页面保持一致）
- streak 显示：火焰 emoji 或图标 + 数字 + "已坚持 X 天"

## Technical Considerations

- 遵循现有 pages 目录约定，新文件路径：`apps/web/src/pages/dashboard/index.tsx`
- 遵循 `@rabjs/react` Service 模式（参考现有 `EchoeDeckService`、`EchoeStatsService`）
- `EchoeDashboardService` 使用依赖注入获取 `EchoeDeckService` 单例，不重复实例化
- 后端新增方法在 `EchoeStatsService` 中实现，在 `StatsController` 中注册路由
- `id` 字段为 bigint（Unix 毫秒 × 1000），日期推算：`Math.floor(id / 1000 / 86400000)` 得到 UTC 天数（与现有 `getHistory` 实现保持一致）
- 图表库复用项目现有图表库（参考 stats 页面已有的折线图和柱状图实现）

## Success Metrics

- 用户可在仪表盘一眼看到今日待学总数和 streak
- 点击"开始学习"可直接进入跨卡片集学习流程（≤ 2 次点击）
- 点击卡片集的"学习此卡片集"可进入该卡片集学习（≤ 2 次点击）
- 页面加载后所有数据区域正确显示（无空白/报错状态）

## Open Questions

- 图表库：stats 页面使用的是哪个图表库？需确认复用同一库（recharts / chart.js / 其他）
- 成熟度进度条：若某卡片集所有卡片均为 new（ivl=0），进度条是否全显示为蓝色？（建议：是）
- 卡片集名称层级缩进：`::` 之前的部分作为父级，仅缩进还是显示父级名称？（建议：仅缩进最后一级名称）
