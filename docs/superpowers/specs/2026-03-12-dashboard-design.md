# Dashboard 仪表盘设计文档

**日期：** 2026-03-12
**状态：** 已批准
**分支：** ralph/note-field-model-refactor

---

## 背景与目标

当前侧边栏第一项（Study/Review）直接跳转到学习页面或卡片列表，缺少全局概览能力。用户需要两种复习途径：

1. **通过 Cards 页面** — 进入具体卡片集进行学习（现有功能，保持不变）
2. **通过侧边栏第一项** — 仪表盘入口，支持跨卡片集学习，同时展示必要统计数据

目标：将侧边栏第一项改造为仪表盘页面，承担原学习入口职责，并扩展为三区布局。

---

## 路由与导航

- **新增路由：** `/dashboard` → `DashboardPage` 组件，文件路径 `apps/web/src/pages/dashboard/index.tsx`（遵循现有 pages 目录约定）
- **侧边栏第一项：** 图标改为 `LayoutDashboard`（从 lucide-react 导入，替换现有 `Zap`），标签"仪表盘"，指向 `/dashboard`
- **active 状态：** 新增 `isDashboardPage = location.pathname.startsWith('/dashboard')`，第一项 active class 使用此变量；`isStudyPage` 变量重命名为 `isDashboardPage`（`/cards/study` 路由仍然存在，`showFab` 逻辑不变，仍保留 `location.pathname.startsWith('/cards/study')` 判断）
- **侧边栏第一项点击行为：** 始终导航至 `/dashboard`，不再根据 `dueCount` 条件跳转；侧边栏红色徽章（待学总数）保留，数字来源不变（`EchoeDeckService.getTotalDue()`）

---

## 页面布局

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

---

## 第一区：今日行动区

**定位：** 页面顶部全宽卡片，核心行动入口。

**内容：**
- **左侧：** 大号数字显示今日待学总数，下方三个小标签分别显示新卡 / 学习中 / 复习数量（颜色：蓝/橙/绿）
- **中间：** 连续打卡天数（streak），火焰图标，下方"已坚持 X 天"
- **右侧：** "开始学习"按钮，点击导航至 `/cards/study`（不传 deckId，学习全部卡片集）；数据加载完成且待学数为 0 时显示"今日已完成"禁用状态；数据加载中时按钮显示 loading 状态

**数据来源：**
- 待学数：直接使用 `EchoeDeckService`（已在 `layout.tsx` 中实例化为单例）的 decks 数据聚合 `newCount + learnCount + reviewCount`，避免重复请求。`DashboardPage` 通过 `useService(EchoeDeckService)` 获取同一实例。
- Streak：`GET /api/v1/stats/streak`（新增接口）

---

## 第二区：卡片集列表

**定位：** 中间区域，展示各卡片集状态并支持单独进入学习。

**布局规则：**
- 卡片集 ≤ 4 个：2 列网格
- 卡片集 > 4 个：单列列表

**每个卡片集卡片展示：**
- 卡片集名称（层级缩进，`::` 分隔符处理）
- 三个数字徽章：新卡（蓝）/ 学习中（橙）/ 复习（绿）
- 成熟度进度条：四段颜色条（新/学习中/年轻/成熟），数据来自 batch maturity 接口
- "学习此卡片集"按钮 → 跳转 `/cards/study/:deckId`
- 今日无待学时：按钮显示"已完成 ✓"

**数据来源：**
- 卡片集列表及待学数：复用 `EchoeDeckService` 单例的 decks 数据（与第一区共享，无额外请求）
- 成熟度：`GET /api/v1/stats/maturity/batch`（新增批量接口，一次返回所有卡片集）

---

## 第三区：统计趋势

**定位：** 页面底部，两列并排，全局数据（不按卡片集过滤）。

**左侧：学习历史折线图**
- UI 默认展示 7 天（注意：这是仪表盘 UI 的默认值，不修改后端接口的默认值）
- 可切换 30 天
- X 轴：日期，Y 轴：复习数量
- Tooltip：当天学习数 + 用时
- 数据：页面挂载时调用 `GET /api/v1/stats/history?days=7`（不传 deckId）；用户切换时调用 `?days=30`

**右侧：未来 14 天预测柱状图**
- 每天预计到期卡片数
- 今天柱子高亮
- 数据：`GET /api/v1/stats/forecast?days=14`（不传 deckId）

---

## 新增后端接口

### 1. `GET /api/v1/stats/streak`

返回当前用户的连续学习天数。

```typescript
// Response
{
  streak: number  // 连续有学习记录的天数
}
```

**实现逻辑：** 查询 `echoeRevlog` 表，使用 `id` 字段（bigint，Unix 毫秒 × 1000）推算日期（与现有 `getTodayStats`、`getHistory` 方法保持一致，使用 UTC 时区，不做用户过滤——与现有 stats 接口保持一致，系统为单用户场景）。按天聚合，从今天往前数连续有记录的天数。完整规则：
- 若今天（UTC）有学习记录：streak = 从今天往前连续有记录的天数
- 若今天无记录但昨天有记录：streak = 从昨天往前连续有记录的天数（streak 不中断）
- 若今天和昨天均无记录：streak = 0

### 2. `GET /api/v1/stats/maturity/batch`

一次返回所有卡片集的成熟度分布。

```typescript
// Response
{
  decks: Array<{
    deckId: number
    new: number       // ivl = 0
    learning: number  // 0 < ivl < 21
    young: number     // 21 <= ivl < 90
    mature: number    // ivl >= 90
  }>
}
```

**实现逻辑：** 单次 SQL 查询 `echoeCards` 表（不做用户过滤，与现有 stats 接口保持一致），按 `did`（deckId）分组，对每张卡按 `ivl` 分类（`ivl=0` → new，优先判断；`0<ivl<21` → learning；`21≤ivl<90` → young；`ivl≥90` → mature），与现有 `getCardMaturity()` 的分类边界完全一致，避免两接口结果不一致。

---

## 复用现有接口（无需修改）

| 接口 | 用途 |
|------|------|
| `GET /api/v1/decks` | 卡片集列表含待学数（第一区+第二区共用） |
| `GET /api/v1/stats/history` | 学习历史（后端默认 30 天不变，仪表盘显式传 `days=7`） |
| `GET /api/v1/stats/forecast` | 未来预测 |

---

## 文件变更清单

### 新增文件

| 文件 | 说明 |
|------|------|
| `apps/web/src/pages/dashboard/index.tsx` | 仪表盘页面主组件，三区布局 |
| `apps/web/src/services/echoe-dashboard.service.ts` | 仪表盘数据服务（@rabjs/react Service），管理 streak、maturity batch、history、forecast 数据；decks 数据复用 `EchoeDeckService` 单例，不在此服务重复请求 |

### 修改文件

| 文件 | 变更内容 |
|------|----------|
| `apps/web/src/components/layout.tsx` | 1) 导入 `LayoutDashboard`（替换 `Zap`）；2) 第一项路由改为 `/dashboard`，点击行为始终导航至 `/dashboard`；3) 新增 `isDashboardPage = location.pathname.startsWith('/dashboard')`；4) `isStudyPage` 变量保留（`showFab` 仍依赖它） |
| `apps/web/src/App.tsx` 或路由文件 | 注册 `/dashboard` 路由，指向 `DashboardPage` |
| `apps/web/src/api/echoe.ts` | 新增 `getStreak()` 和 `getMaturityBatch()` 客户端 API 函数 |
| `apps/server/src/controllers/stats.controller.ts` | 新增 `GET /streak` 和 `GET /maturity/batch` 端点 |
| `apps/server/src/services/echoe-stats.service.ts` | 实现 `getStreak()` 和 `getMaturityBatch()` 方法 |

---

## 不在本次范围内

- 仪表盘的按卡片集过滤（深度分析留给 stats 页面）
- 成熟度饼图（stats 页面已有）
- 学习目标设置
- 通知/提醒功能
