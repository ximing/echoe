# PRD 归档: Dashboard 仪表盘页面

**文档版本**: v1.0
**归档日期**: 2026-03-19
**原始PRD路径**: tasks/archive/prd-dashboard.md
**责任人**: 前端团队
**当前状态**: ✅ 已完成 (100%)

---

## 一、需求概述

将侧边栏第一项改造为仪表盘页面,承担原学习入口职责并扩展为三区布局。提供今日待学统计、跨卡片集一键学习、各卡片集状态概览、以及学习历史和预测趋势图表。

### 核心目标
- 新增 `/dashboard` 路由和 `DashboardPage` 页面组件
- 侧边栏第一项改为仪表盘入口(图标 `LayoutDashboard`)
- 第一区: 展示今日待学总数、streak、一键开始学习
- 第二区: 展示所有卡片集的状态(待学数、成熟度条)及单独进入学习的按钮
- 第三区: 学习历史折线图(7/30天切换) + 未来14天预测柱状图
- 新增后端接口: `GET /api/v1/stats/streak` 和 `GET /api/v1/stats/maturity/batch`

---

## 二、实现状态分析

### 2.1 已完成功能 (✅)

- ✅ **US-001**: 新增后端 streak 接口
  - 实现 `GET /api/v1/stats/streak` 返回连续学习天数
  - 使用 `echoeRevlog.id` 字段推算 UTC 日期
  - 代码位置: `apps/server/src/services/echoe-stats.service.ts`

- ✅ **US-002**: 新增后端 maturity batch 接口
  - 实现 `GET /api/v1/stats/maturity/batch` 返回所有卡组成熟度分布
  - 单次 SQL 查询按 `did` 分组
  - 代码位置: `apps/server/src/services/echoe-stats.service.ts`

- ✅ **US-003**: 前端新增 API 客户端函数
  - 实现 `getStreak()` 和 `getMaturityBatch()`
  - 代码位置: `apps/web/src/api/echoe.ts`

- ✅ **US-004**: 新增仪表盘数据服务
  - 实现 `EchoeDashboardService` (@rabjs/react Service)
  - 管理 streak、maturityBatch、history、forecast 状态
  - 复用 `EchoeDeckService` 获取 decks 数据
  - 代码位置: `apps/web/src/services/echoe-dashboard.service.ts`

- ✅ **US-005**: 修改侧边栏导航
  - 第一项使用 `LayoutDashboard` 图标
  - 路由改为 `/dashboard`
  - active 状态仅在 `/dashboard` 路径时高亮
  - 代码位置: `apps/web/src/components/layout.tsx`

- ✅ **US-006**: 注册仪表盘路由
  - 在 App.tsx 注册 `/dashboard` 路由
  - 代码位置: `apps/web/src/App.tsx`

- ✅ **US-007**: 实现第一区——今日行动区
  - 显示待学总数、streak、开始学习按钮
  - 三个小标签(新卡/学习中/复习)
  - 数据加载状态处理
  - 代码位置: `apps/web/src/pages/dashboard/index.tsx`

- ✅ **US-008**: 实现第二区——卡片集列表
  - 网格布局(≤4张卡片2列,>4张卡片单列)
  - 显示成熟度进度条
  - 显示新/学/复徽章
  - 支持层级缩进(`::` 分隔符)
  - 代码位置: `apps/web/src/pages/dashboard/index.tsx`

- ✅ **US-009**: 实现第三区——统计趋势图表
  - 学习历史折线图(7/30天切换)
  - 未来14天预测柱状图
  - 今天柱子高亮
  - 代码位置: `apps/web/src/pages/dashboard/index.tsx`

### 2.2 关键技术决策

#### 决策 1: 复用 EchoeDeckService 数据
- **决策内容**: Dashboard 不重复请求 decks 数据,复用 EchoeDeckService 单例
- **Why**: 避免重复请求,提升性能,保证数据一致性
- **How to apply**: EchoeDashboardService 通过依赖注入获取 EchoeDeckService

#### 决策 2: 统一"今日待学"口径
- **决策内容**: "今日待学"包含 new + learn + review 三类卡片
- **Why**: 与用户认知一致,new 卡也属于今日需要处理的卡片
- **How to apply**: 所有统计接口和前端展示统一使用此口径

#### 决策 3: 成熟度分类边界
- **决策内容**: 使用与现有 `getCardMaturity()` 完全一致的分类边界
  - `ivl=0` → new
  - `0<ivl<21` → learning
  - `21≤ivl<90` → young
  - `ivl≥90` → mature
- **Why**: 保持系统内口径一致,避免用户困惑
- **How to apply**: batch 接口和单卡组接口使用相同分类逻辑

---

## 三、变更记录

| 日期 | 变更内容 | 原因 | 影响范围 |
|------|---------|------|---------|
| 2026-03-12 | 初始 PRD 创建 | 项目需求 | 全部 |
| 2026-03-14 | 实现后端 API | 开发进度 | US-001, US-002 |
| 2026-03-14 | 实现前端页面 | 开发进度 | US-004~US-009 |
| 2026-03-19 | 归档文档生成 | 项目里程碑 | - |

---

## 四、架构影响

### 4.1 路由结构
- 新增 `/dashboard` 路由
- 侧边栏第一项从直接跳转学习页改为跳转仪表盘
- `/cards/study` 页面保持不变,仍可从仪表盘进入

### 4.2 API 接口
- 新增 `GET /api/v1/stats/streak`
- 新增 `GET /api/v1/stats/maturity/batch`
- 复用现有 `GET /api/v1/stats/history`
- 复用现有 `GET /api/v1/stats/forecast`

### 4.3 前端组件
- 新增 `DashboardPage` 页面组件
- 新增 `EchoeDashboardService` 数据服务
- 修改 `Layout` 组件侧边栏导航逻辑

---

## 五、技术债务

### 5.1 未完成功能
无(所有功能已完成)

### 5.2 已知问题
无严重问题

### 5.3 优化建议
- 考虑添加仪表盘数据缓存(避免频繁切换页面时重复请求)
- 考虑添加"自定义仪表盘"功能(用户可选择显示哪些区域)
- 考虑添加"每日学习目标"设置与进度展示

---

## 六、依赖关系

### 上游依赖
- PRD: Anki Flashcard System (依赖 Stats API)
- PRD: Flashcards List Redesign (依赖 Deck API)

### 下游依赖
无

---

## 七、验收标准

✅ **已通过**
- 用户可在仪表盘一眼看到今日待学总数和 streak
- 点击"开始学习"可直接进入跨卡片集学习流程(≤ 2 次点击)
- 点击卡片集的"学习此卡片集"可进入该卡片集学习(≤ 2 次点击)
- 页面加载后所有数据区域正确显示(无空白/报错状态)
- 学习历史和预测图表正确显示

---

## 八、相关文档

- [Anki Flashcard System PRD](./archive-anki-flashcard-system.md)
- [Flashcards List Redesign PRD](./archive-flashcards-list-redesign.md)

---

**归档审批**
- 技术负责人: ______
- 产品负责人: ______
- 归档日期: 2026-03-19
