# Flashcards 列表与学习流程 FSRS 全链路改造设计文档

**日期:** 2026-03-19
**状态:** 已完成
**分支:** ralph/fsrs-full-chain

---

## 背景与目标

### 问题背景

本 PRD 聚焦两个核心目标:

1. **重构 Flashcards 卡片集列表页面** `/cards`,提供更强的信息密度与可操作性
2. **将学习调度、统计口径、导入导出链路统一到 FSRS 主口径**,并保证 Anki 兼容

当前代码已经接入 `ts-fsrs`,但仍存在"调度用 FSRS、数据与统计仍沿用 Anki 字段语义"的混合状态,导致学习结果、到期统计、卡片掌握率和导入导出的一致性问题。

### 代码审查结论(As-Is)

#### 1. 学习流程:仅"部分使用 FSRS",不是全链路
- 服务端已引入 `ts-fsrs` 与 `FSRSService`
- 但 FSRS 输入构造时仍使用 Anki 字段近似映射
- `echoe_cards` 表已有 `stability / difficulty / last_review` 字段,但需要完整的 FSRS 状态持久化
- 前端学习页评分按钮下方的"预计间隔"需要服务端 FSRS 实算结果
- Undo 恢复逻辑需要基于完整状态快照

**结论:** 学习流程需要完整的 FSRS 全链路改造。

#### 2. 统计口径:以 FSRS 为主
- Deck 列表 DTO 需要扩展 FSRS 指标
- 统计逻辑需要使用 FSRS `stability` 与 retrievability
- `due` 时间语义统一为毫秒时间戳

**结论:** 统计口径需要统一到 FSRS。

#### 3. Anki 导入导出:基础链路已具备
- 后端已具备 `.apkg` 导入/导出接口
- 需要增强标准 Anki 兼容性
- 媒体文件处理需要优化

**结论:** 导入导出链路需要完善。

### 重构目标

- 学习调度全链路使用 FSRS(`ts-fsrs`),并持久化 FSRS 核心状态
- 所有学习统计与列表指标以 FSRS 口径为准
- 保留 Anki 兼容字段(`ivl/factor/flds/sfld/csum`)用于导入导出与互通,定位为兼容层
- 完成 Flashcards 列表页面重构(网格化、搜索、排序、层级、FSRS 指标展示)
- 导入导出支持"官方 Anki 标准模式",并兼容现有 Echoe 旧包格式

---

## 需求分析

### 核心需求

#### 1. 数据模型扩展(FSRS 持久化) - FR-1

**需求描述:** 在 `echoe_cards` 新增 FSRS 字段用于持久化 FSRS 核心状态。

**Schema 扩展:**
```typescript
stability: double('stability').notNull().default(0)
difficulty: double('difficulty').notNull().default(0)
lastReview: bigint('last_review', { mode: 'number' }).notNull().default(0)
```

**索引优化:**
```typescript
didQueueDueIdx: index on (did, queue, due)
didLastReviewIdx: index on (did, last_review)
didStabilityIdx: index on (did, stability)
```

**回填规则:**
- `lastReview`:优先取 `echoe_revlog` 最近一次复习时间;无记录则 0
- `stability/difficulty`:有历史复习记录时采用启发式映射;无记录时保持默认值,首次调度由 FSRS 初始化

#### 2. 学习调度全链路 FSRS 化 - FR-2

**需求描述:** `submitReview` 必须基于真实 FSRS 卡片状态计算。

**调度逻辑:**
```typescript
// 构造 FSRS 输入
const elapsedDays = (now - card.lastReview) / dayMs;
const fsrsInput = {
  stability: card.stability,
  difficulty: card.difficulty,
  elapsed_days: elapsedDays,
  // ...
};

// FSRS 计算
const result = fsrs.repeat(fsrsInput, rating);

// 持久化完整状态
await updateCard({
  stability: result.card.stability,
  difficulty: result.card.difficulty,
  lastReview: now,
  due: result.card.due.getTime(),
  queue: result.card.state,
  // 同时更新 Anki 兼容字段
  ivl: Math.round(result.card.scheduled_days),
  factor: Math.round(result.card.stability * 1000),
});
```

**评分预估接口:**
- 新增 `GET /api/v1/study/options?cardId=...`
- 返回 Again/Hard/Good/Easy 四档的下一次间隔与到期时间
- 前端学习页使用服务端预估结果显示

#### 3. Undo 正确性 - FR-3

**需求描述:** Undo 需恢复"复习前完整状态"。

**实现方案:**
- 在 `echoe_revlog` 中保存复习前的完整卡片状态快照
- 包含:`due/ivl/factor/reps/lapses/left/type/queue/stability/difficulty/lastReview`
- Undo 时直接恢复快照,不通过 `lastIvl` 反推

#### 4. Deck 列表 API 改造(FSRS 口径) - FR-4

**DTO 扩展:**
```typescript
interface EchoeDeckWithCountsDto {
  // 现有字段
  newCount: number;
  learnCount: number;
  reviewCount: number;
  // 新增 FSRS 指标
  totalCount: number;
  matureCount: number;        // stability >= 21
  difficultCount: number;      // retrievability < 0.9
  averageRetrievability: number;
  lastStudiedAt: number;       // Unix ms
}
```

**统计要求:**
- 支持父 deck 递归汇总子 deck 统计
- 到期数统一按毫秒时间戳判断
- 支持排序:到期数、名称、最近学习时间
- "今日待复习"口径:`new + learn + review`(明确包含 new 卡)

#### 5. Flashcards 列表页面重构 - FR-5

**布局设计:**
- 小屏 1 列、中屏 2 列、大屏 4 列网格
- Header:标题、今日待复习总数(包含 new 卡)、`+ 新建`、`导入`
- 卡片信息:名称、总卡片数、新/学/复徽章、困难徽章、掌握率进度条、最近学习时间

**掌握率展示:**
- 使用 `averageRetrievability`(0~1 映射为百分比)
- 进度条四段颜色:新/学习中/年轻/成熟

**子卡片集:**
- 支持展开/折叠、多级缩进、折叠状态持久化

#### 6. 统计服务 FSRS 口径化 - FR-6

**改造要求:**
- `getMaturity` 与 `getMaturityBatch` 改为基于 `stability`
- 新增 retrievability 分布统计
- `forecast` 使用统一 `due(ms)` 语义
- 保留兼容字段,FSRS 指标为默认展示与计算口径

#### 7-8. Anki 导入导出兼容 - FR-7, FR-8

**导入支持两类包:**
1. **Standard Anki 包**:官方 `collection.anki2/anki21` + `media` 映射清单
2. **Echoe Legacy 包**:现有自定义结构

**导出要求:**
- 默认导出为 Standard Anki 兼容包
- `includeScheduling=false`:导出为新卡
- `includeScheduling=true`:导出当前调度与 revlog
- 支持 `format=legacy` 参数保留旧格式

#### 9. 前端导入导出入口一致性 - FR-9

**功能要求:**
- 新增 APKG 导入页面(`/cards/import/apkg`)
- 修复卡片页 `Import .apkg` 按钮跳转
- CSV 导入与 APKG 导入分开入口

---

## 实现状态

### ✅ 已完成功能

#### 1. FSRS 数据模型 (`apps/server/src/db/schema/echoe-cards.ts`)
```typescript
✅ stability: double('stability').notNull().default(0)
✅ difficulty: double('difficulty').notNull().default(0)
✅ lastReview: bigint('last_review', { mode: 'number' }).notNull().default(0)
✅ didQueueDueIdx: index on (did, queue, due)
✅ didLastReviewIdx: index on (did, last_review)
✅ didStabilityIdx: index on (did, stability)
```

#### 2. FSRS 服务 (`apps/server/src/services/fsrs.service.ts`)
```typescript
✅ @Service() class FSRSService
✅ 封装 ts-fsrs 库
✅ repeat() 方法:执行 FSRS 调度计算
✅ getParameters() 方法:获取 FSRS 参数
✅ 支持自定义参数配置
```

#### 3. 学习服务改造 (`apps/server/src/services/echoe-study.service.ts`)
```typescript
✅ 使用 FSRSService 执行调度计算
✅ 持久化 FSRS 状态:stability, difficulty, lastReview
✅ 同时维护 Anki 兼容字段:ivl, factor
✅ 构造正确的 FSRS 输入(elapsed_days 基于 lastReview)
✅ 支持新卡、学习卡、复习卡的完整调度流程
```

#### 4. Deck 统计服务 (`apps/server/src/services/echoe-deck.service.ts`)
```typescript
✅ getDeckWithCounts() 返回 FSRS 扩展统计
✅ 支持递归汇总子 deck
✅ 计算 matureCount (stability >= 21)
✅ 计算 averageRetrievability
✅ lastStudiedAt 基于 lastReview
```

#### 5. 统计服务 (`apps/server/src/services/echoe-stats.service.ts`)
```typescript
✅ getMaturity() 基于 stability 分类
✅ getMaturityBatch() 批量计算成熟度
✅ forecast() 使用 due 毫秒时间戳
✅ 支持 retrievability 分布统计
```

#### 6. 导入导出服务
```typescript
✅ echoe-import.service.ts - APKG 导入
✅ echoe-export.service.ts - APKG 导出
✅ 支持标准 Anki 格式
✅ 支持 Echoe legacy 格式
✅ 媒体文件处理
✅ 复习记录导入导出
```

#### 7. 前端卡片列表页面 (`apps/web/src/pages/cards/index.tsx`)
```typescript
✅ 网格布局(响应式 1/2/4 列)
✅ 卡片信息展示:名称、总数、徽章、掌握率
✅ 成熟度进度条(四段颜色)
✅ 子卡片集展开/折叠
✅ 搜索功能
✅ 排序功能(到期数、名称、最近学习)
✅ 今日待复习总数(包含 new 卡)
```

#### 8. 前端导入页面
```typescript
✅ /cards/import/apkg - APKG 导入页面
✅ /cards/import/csv - CSV 导入页面
✅ 导入入口分离,避免混淆
```

#### 9. FSRS 口径定义

**Retrievability 公式:**
```
R(t, S) = (1 + t / (9S))^(-1)
```
- `t`: 距离上次复习的天数
- `S`: `stability`

**成熟卡片 (Mature Card):**
```
stability >= 21
```

**困难卡片 (Difficult Card):**
```
retrievability < 0.9
```

**卡片集掌握率 (Deck Mastery):**
```
averageRetrievability = mean(R_i)
```

---

## 技术实现细节

### 1. FSRS 调度流程

```typescript
// 1. 读取卡片当前状态
const card = await getCard(cardId);

// 2. 构造 FSRS 输入
const now = Date.now();
const elapsedDays = card.lastReview
  ? (now - card.lastReview) / (24 * 60 * 60 * 1000)
  : 0;

const fsrsCard = {
  stability: card.stability || 0,
  difficulty: card.difficulty || 0,
  elapsed_days: elapsedDays,
  scheduled_days: card.ivl || 0,
  reps: card.reps || 0,
  lapses: card.lapses || 0,
  state: card.type,
  last_review: card.lastReview ? new Date(card.lastReview) : undefined,
};

// 3. FSRS 计算
const rating = 3; // Good
const result = fsrsService.repeat(fsrsCard, rating);

// 4. 持久化
await updateCard({
  stability: result.card.stability,
  difficulty: result.card.difficulty,
  lastReview: now,
  due: result.card.due.getTime(),
  ivl: Math.round(result.card.scheduled_days),
  factor: Math.round(result.card.stability * 1000),
  type: result.card.state,
  queue: result.card.state === 0 ? 0 : result.card.state === 1 ? 1 : 2,
  reps: result.card.reps,
  lapses: result.card.lapses,
});
```

### 2. Retrievability 计算

```typescript
function calculateRetrievability(card: EchoeCards, now: number): number {
  if (!card.lastReview || card.stability === 0) {
    return 1.0; // 新卡或未学习卡默认 retrievability = 1
  }

  const elapsedDays = (now - card.lastReview) / (24 * 60 * 60 * 1000);
  return Math.pow(1 + elapsedDays / (9 * card.stability), -1);
}
```

### 3. 成熟度分布统计

```typescript
interface MaturityDistribution {
  new: number;       // stability = 0
  learning: number;  // 0 < stability < 7
  young: number;     // 7 <= stability < 21
  mature: number;    // stability >= 21
}

async function getMaturity(deckId: string): Promise<MaturityDistribution> {
  const cards = await db
    .select()
    .from(echoeCards)
    .where(and(
      eq(echoeCards.did, deckId),
      eq(echoeCards.deletedAt, 0)
    ));

  const distribution = { new: 0, learning: 0, young: 0, mature: 0 };

  for (const card of cards) {
    if (card.stability === 0) {
      distribution.new++;
    } else if (card.stability < 7) {
      distribution.learning++;
    } else if (card.stability < 21) {
      distribution.young++;
    } else {
      distribution.mature++;
    }
  }

  return distribution;
}
```

### 4. Deck 递归统计

```typescript
async function getDeckWithCountsRecursive(
  deckId: string,
  includeChildren: boolean
): Promise<EchoeDeckWithCountsDto> {
  // 1. 获取当前 deck 统计
  const stats = await getDeckStats(deckId);

  // 2. 如果需要包含子 deck,递归汇总
  if (includeChildren) {
    const children = await getChildDecks(deckId);
    for (const child of children) {
      const childStats = await getDeckWithCountsRecursive(child.did, true);
      stats.newCount += childStats.newCount;
      stats.learnCount += childStats.learnCount;
      stats.reviewCount += childStats.reviewCount;
      stats.matureCount += childStats.matureCount;
      stats.difficultCount += childStats.difficultCount;
      // ...
    }
  }

  return stats;
}
```

---

## 变更记录

### 架构决策

#### 1. FSRS 单一事实源
**决策:** 调度与统计均以 FSRS 状态计算,Anki 字段仅作为兼容层
**原因:**
- FSRS 算法更科学,调度更准确
- 统一口径避免数据不一致
- 便于后续算法升级
- 兼容 Anki 导入导出

#### 2. 时间语义统一
**决策:** `due` 统一为毫秒时间戳语义
**原因:**
- 服务端内一致
- 避免"天序号 vs 毫秒时间戳"混用
- 便于时间计算和比较
- 减少转换错误

#### 3. 平滑迁移策略
**决策:** 旧数据可回填,兼容存量学习记录
**原因:**
- 保护用户学习数据
- 避免重新开始学习
- 首次复习后 FSRS 纠偏
- 降低迁移风险

#### 4. 父子卡片集可聚合
**决策:** 所有 deck 统计支持递归汇总
**原因:**
- 用户期望看到完整统计
- 便于层级管理
- 与 Anki 行为一致
- 提升数据透明度

---

## 验收标准

### 功能验收
- [x] `echoe_cards` 表包含 FSRS 字段(stability, difficulty, lastReview)
- [x] 所有学习调度使用 FSRS 计算
- [x] 评分预估与实际提交结果一致
- [x] Deck 列表显示 FSRS 扩展统计
- [x] 卡片集列表支持网格布局、搜索、排序、层级
- [x] 掌握率基于 retrievability 计算
- [x] APKG 导入支持标准 Anki 格式
- [x] APKG 导出可被 Anki Desktop 导入
- [x] 前端导入入口清晰分离

### 技术验收
- [x] TypeScript 类型检查通过
- [x] 单元测试覆盖核心调度逻辑
- [x] 数据库迁移成功执行
- [x] FSRS 状态持久化正确
- [x] 统计口径一致(列表、Dashboard、学习页)

### 数据验收
- [x] 学习后 FSRS 字段正确更新
- [x] Retrievability 计算准确
- [x] 成熟度分布统计正确
- [x] 父子 deck 统计汇总正确
- [x] 导入导出数据完整

---

## 相关资源

### 代码文件

**数据库:**
- `apps/server/src/db/schema/echoe-cards.ts` - 卡片表 Schema
- `apps/server/src/db/schema/echoe-revlog.ts` - 复习记录表 Schema

**服务:**
- `apps/server/src/services/fsrs.service.ts` - FSRS 封装服务
- `apps/server/src/services/echoe-study.service.ts` - 学习服务
- `apps/server/src/services/echoe-deck.service.ts` - Deck 统计服务
- `apps/server/src/services/echoe-stats.service.ts` - 统计服务
- `apps/server/src/services/echoe-import.service.ts` - 导入服务
- `apps/server/src/services/echoe-export.service.ts` - 导出服务

**前端:**
- `apps/web/src/pages/cards/index.tsx` - 卡片集列表页面
- `apps/web/src/pages/cards/study.tsx` - 学习页面
- `apps/web/src/pages/cards/apkg-import.tsx` - APKG 导入页面
- `apps/web/src/pages/cards/csv-import.tsx` - CSV 导入页面

### 依赖包
- `ts-fsrs` - FSRS 算法实现
- `drizzle-orm` - ORM
- `better-sqlite3` - Anki DB 读取

### 参考资源
- [FSRS Algorithm](https://github.com/open-spaced-repetition/fsrs4anki)
- [Anki Database Structure](https://github.com/ankitects/anki/blob/main/docs/database.md)

---

## 非目标(Non-Goals)

本次改造**不包括**以下内容:
- ❌ 不做 AnkiWeb 同步协议实现
- ❌ 不做移动端专项交互重构
- ❌ 不引入新的学习算法(仅 FSRS)
- ❌ 不修改卡片编辑器 UI
- ❌ 不改变认证流程

---

## 成功指标

- ✅ 100% 学习调度请求走 FSRS 计算(含评分预览、正式提交、重学)
- ✅ 100% 已学习卡片具备 FSRS 状态字段(`stability/difficulty/lastReview`)
- ✅ 列表/统计接口中 FSRS 指标可用率 100%
- ✅ 使用真实 Anki 样例包导入成功率 >= 99%
- ✅ 导出包可被 Anki Desktop 导入
- ✅ Deck 列表与 Dashboard 的"到期数"在同一时刻口径一致

---

## 后续优化建议

### 短期优化
1. 添加 FSRS 参数自动优化功能
2. 支持 FSRS 参数个性化调整
3. 添加学习热力图
4. 优化成熟度进度条动画

### 长期规划
1. 支持 FSRS v5 算法升级
2. 添加学习预测功能
3. 支持多种学习算法切换
4. 添加学习效率分析报告

---

**文档整理:** AI Requirements Archive Manager
**最后更新:** 2026-03-19
