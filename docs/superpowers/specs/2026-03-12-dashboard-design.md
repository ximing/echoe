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

- **新增路由：** `/dashboard` → `DashboardPage` 组件
- **侧边栏第一项：** 图标改为 `LayoutDashboard`，标签"仪表盘"，指向 `/dashboard`
- **原 Study/Review 逻辑迁移：** 检查待学数、红色徽章数字迁移到仪表盘行动区

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
- **右侧：** "开始学习"按钮，调用全局学习（不传 deckId）；待学数为 0 时显示"今日已完成"禁用状态

**数据来源：**
- 待学数：`GET /api/v1/study/counts`（不传 deckId，聚合全部卡片集）
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
- 成熟度进度条：四段颜色条（新/学习中/年轻/成熟）
- "学习此卡片集"按钮 → 跳转 `/cards/study/:deckId`
- 今日无待学时：按钮显示"已完成 ✓"

**数据来源：**
- 卡片集列表及待学数：`GET /api/v1/decks`（现有接口，已含 newCount/learnCount/reviewCount）
- 成熟度：`GET /api/v1/stats/maturity/batch`（新增批量接口，一次返回所有卡片集）

---

## 第三区：统计趋势

**定位：** 页面底部，两列并排，全局数据（不按卡片集过滤）。

**左侧：学习历史折线图**
- 默认 7 天，可切换 30 天
- X 轴：日期，Y 轴：复习数量
- Tooltip：当天学习数 + 用时
- 数据：`GET /api/v1/stats/history?days=7`（不传 deckId）

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
  streak: number  // 连续有学习记录的天数（今天或昨天有记录才计算连续）
}
```

**实现逻辑：** 查询 `echoeRevlog` 表，按天聚合，从今天往前数连续有记录的天数。若今天尚未学习但昨天有记录，streak 不中断。

### 2. `GET /api/v1/stats/maturity/batch`

一次返回所有卡片集的成熟度分布。

```typescript
// Response
{
  decks: Array<{
    deckId: number
    new: number
    learning: number
    young: number
    mature: number
  }>
}
```

**实现逻辑：** 复用现有 `EchoeStatsService.getCardMaturity()` 的查询逻辑，改为批量查询所有卡片集，一次 SQL 返回。

---

## 复用现有接口（无需修改）

| 接口 | 用途 |
|------|------|
| `GET /api/v1/study/counts` | 全局今日待学数 |
| `GET /api/v1/decks` | 卡片集列表含待学数 |
| `GET /api/v1/stats/history` | 学习历史 |
| `GET /api/v1/stats/forecast` | 未来预测 |

---

## 文件变更清单

### 新增文件

| 文件 | 说明 |
|------|------|
| `apps/web/src/pages/dashboard.tsx` | 仪表盘页面主组件，三区布局 |
| `apps/web/src/services/echoe-dashboard.service.ts` | 仪表盘数据服务（@rabjs/react Service） |

### 修改文件

| 文件 | 变更内容 |
|------|----------|
| `apps/web/src/components/layout.tsx` | 侧边栏第一项改为仪表盘（图标+路由） |
| `apps/web/src/App.tsx` 或路由文件 | 注册 `/dashboard` 路由 |
| `apps/server/src/controllers/stats.controller.ts` | 新增 `/streak` 和 `/maturity/batch` 端点 |
| `apps/server/src/services/echoe-stats.service.ts` | 实现 `getStreak()` 和 `getMaturityBatch()` 方法 |

---

## 不在本次范围内

- 仪表盘的按卡片集过滤（深度分析留给 stats 页面）
- 成熟度饼图（stats 页面已有）
- 学习目标设置
- 通知/提醒功能
