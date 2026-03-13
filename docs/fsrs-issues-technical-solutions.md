# FSRS 相关问题技术方案

> 本文档针对 `fsrs-refactor-plan.md` 中第 10 节提出的五个审查问题，提供详细技术方案。

---

## 问题概览

| 编号 | 问题 | 优先级 | 影响范围 |
|------|------|--------|----------|
| 1 | `forgetCards` 未重置 FSRS 核心字段 | P0 | 学习调度 |
| 2 | retrievability 计算入口分散 | P1 | 统计/列表/学习 |
| 3 | 新卡 retrievability 语义不一致 | P1 | 学习/统计接口 |
| 4 | `echoe-stats.service.ts` 存在未使用的 retrievability 方法 | P2 | 代码维护 |
| 5 | 边界单测不完整 | P2 | 质量保障 |

---

## 问题 1：`forgetCards` 未重置 FSRS 核心字段（P0）

### 问题分析

**现象**：`apps/server/src/services/echoe-study.service.ts` 的 `forgetCards()` 方法仅重置了 `ivl/reps/lapses/type/queue` 等传统字段，未重置 FSRS 核心字段 `stability/difficulty/lastReview`。

**影响**：
- 用户执行"忘记"操作后，卡片虽然恢复为新卡队列，但 FSRS 状态仍保留旧值
- 下次学习时，`buildFSRSCardInput` 会将旧 `stability/difficulty` 误判为"有历史记录"，导致调度不准确
- 语义矛盾：卡片被标记为"新"，但 FSRS 状态表明"有学习历史"

**根因**：
```typescript
// 当前实现 (echoe-study.service.ts:540-559)
async forgetCards(cardIds: number[]): Promise<void> {
  await db.update(echoeCards).set({
    due: newDue,
    ivl: 0,
    factor: 2500,
    reps: 0,
    lapses: 0,
    left: 0,
    type: 0, // New
    queue: 0, // New queue
    mod: now,
    usn: -1,
    // ❌ 缺失: stability, difficulty, lastReview
  });
}
```

### 技术方案

#### 1. 修改 `forgetCards` 方法

**位置**：`apps/server/src/services/echoe-study.service.ts`

```typescript
async forgetCards(cardIds: number[]): Promise<void> {
  const db = getDatabase();
  const now = Math.floor(Date.now() / 1000);
  const newDue = Math.floor(Date.now() / 1000) * 1000;

  await db
    .update(echoeCards)
    .set({
      due: newDue,
      ivl: 0,
      factor: 2500,
      reps: 0,
      lapses: 0,
      left: 0,
      type: 0, // New
      queue: 0, // New queue
      mod: now,
      usn: -1,
      // ✅ 新增：重置 FSRS 核心字段
      stability: 0,
      difficulty: 0,
      lastReview: 0,
    })
    .where(sql`${echoeCards.id} IN (${sql.join(cardIds.map(id => sql`${id}`), sql`, `)})`);
}
```

#### 2. 增加单元测试

**位置**：`apps/server/src/__tests__/echoe-study.service.test.ts`

```typescript
describe('forgetCards', () => {
  it('should reset FSRS fields (stability, difficulty, lastReview) to 0', async () => {
    // 模拟有学习历史的卡片
    const card = buildCard({
      stability: 15.5,
      difficulty: 0.42,
      lastReview: Date.now() - 86400000,
      type: State.Review,
      queue: 2,
      reps: 10,
      ivl: 30,
    });

    // 执行 forgetCards
    await service.forgetCards([card.id]);

    // 验证 FSRS 字段被重置
    const updatedCard = await db.query.echoeCards.findFirst({
      where: eq(echoeCards.id, card.id),
    });

    expect(updatedCard.stability).toBe(0);
    expect(updatedCard.difficulty).toBe(0);
    expect(updatedCard.lastReview).toBe(0);
    expect(updatedCard.type).toBe(0);
    expect(updatedCard.queue).toBe(0);
    expect(updatedCard.reps).toBe(0);
  });
});
```

### 验收标准

- [ ] `forgetCards` 执行后，卡片的 `stability/difficulty/lastReview` 均为 0
- [ ] 被忘记的卡片在下次学习时，`buildFSRSCardInput` 走"新卡初始化路径"
- [ ] 单元测试覆盖该场景

---

## 问题 2：retrievability 计算入口分散，存在口径漂移风险（P1）

### 问题分析

**现象**：retrievability 公式 `R(t,S) = (1 + t/(9S))^(-1)` 在三处分别实现：

| 位置 | 实现方式 | 代码位置 |
|------|----------|----------|
| `echoe-study.service.ts` | TypeScript 方法 | `calculateRetrievability()` (L749-765) |
| `echoe-stats.service.ts` | TypeScript 方法 | `calculateRetrievability()` (L174-183) |
| `echoe-deck.service.ts` | SQL 内联 | 聚合查询 (L80, L274) |

**风险**：
- 维护时一处修改，其他位置遗漏
- 参数单位不一致（毫秒/天）导致计算偏差
- 边界处理策略不统一

**当前实现对比**：

```typescript
// echoe-study.service.ts (L749-765)
private calculateRetrievability(
  lastReview: number,
  stability: number,
  now: Date
): number | null {
  if (lastReview <= 0 || stability <= 0) {
    return null; // 新卡返回 null
  }
  const nowMs = now.getTime();
  const t = (nowMs - lastReview) / EchoeStudyService.DAY_MS;
  return 1 / (1 + t / (9 * stability));
}

// echoe-stats.service.ts (L174-183)
private calculateRetrievability(lastReview: number, stability: number): number {
  if (stability <= 0 || lastReview === 0) {
    return 1; // 新卡返回 1
  }
  const dayMs = 86400000;
  const now = Date.now();
  const t = (now - lastReview) / dayMs;
  return 1 / (1 + t / (9 * stability));
}
```

```sql
-- echoe-deck.service.ts (L80)
AVG(CASE WHEN lastReview > 0 AND stability > 0 
    THEN POWER(1 + (now - lastReview) / (9 * stability * dayMs), -1) 
    ELSE NULL END)
```

### 技术方案

#### 1. 创建统一的 Retrievability 工具模块

**新建文件**：`apps/server/src/utils/fsrs-retrievability.ts`

```typescript
/**
 * FSRS Retrievability 统一计算模块
 * 公式: R(t,S) = (1 + t/(9S))^(-1)
 */

export interface RetrievabilityResult {
  /** 可提取率 [0, 1]，新卡为 null */
  value: number | null;
  /** 是否为新卡 */
  isNew: boolean;
}

export const DAY_MS = 86400000;

/**
 * 计算 retrievability
 * @param lastReview - 最后复习时间戳 (Unix ms)，0 表示从未复习
 * @param stability - 稳定性 (天)，0 表示未初始化
 * @param now - 当前时间戳 (Unix ms)
 * @returns RetrievabilityResult
 */
export function calculateRetrievability(
  lastReview: number,
  stability: number,
  now: number
): RetrievabilityResult {
  // 新卡判定：未复习或稳定性未初始化
  if (lastReview <= 0 || stability <= 0) {
    return { value: null, isNew: true };
  }

  // 时间差计算（天）
  const elapsedDays = (now - lastReview) / DAY_MS;

  // 边界保护：负数或极端值
  if (elapsedDays < 0) {
    return { value: 1, isNew: false }; // 未来时间，视为刚复习
  }

  // R(t,S) = (1 + t/(9S))^(-1)
  const retrievability = 1 / (1 + elapsedDays / (9 * stability));

  return { value: retrievability, isNew: false };
}

/**
 * 生成 SQL 表达式（用于聚合查询）
 * @param nowMs - 当前时间戳 (Unix ms)
 * @returns SQL 片段
 */
export function getRetrievabilitySqlExpr(nowMs: number): string {
  return `POWER(1 + (${nowMs} - lastReview) / (9 * stability * ${DAY_MS}), -1)`;
}
```

#### 2. 重构各服务调用

**修改 `echoe-study.service.ts`**：

```typescript
import { calculateRetrievability } from '@/utils/fsrs-retrievability.js';

// 删除私有方法 calculateRetrievability

// 使用统一方法
const result = calculateRetrievability(card.lastReview, card.stability, now.getTime());
const retrievability = result.value; // null for new cards
```

**修改 `echoe-stats.service.ts`**：

```typescript
import { calculateRetrievability } from '@/utils/fsrs-retrievability.js';

// 删除私有方法 calculateRetrievability（问题 4 一并处理）
```

**修改 `echoe-deck.service.ts`**：

```typescript
import { getRetrievabilitySqlExpr, DAY_MS } from '@/utils/fsrs-retrievability.js';

const now = Date.now();
const rExpr = getRetrievabilitySqlExpr(now);

const cardsWithFsrsStats = await db
  .select({
    // ...
    averageRetrievability: sql<number>`AVG(CASE WHEN lastReview > 0 AND stability > 0 THEN ${sql.raw(rExpr)} ELSE NULL END)`,
  })
  // ...
```

### 验收标准

- [ ] 三处实现统一调用 `fsrs-retrievability.ts`
- [ ] 单元测试覆盖边界场景（新卡、未来时间、极端值）
- [ ] 删除冗余的私有方法

---

## 问题 3：新卡 retrievability 语义不一致（P1）

### 问题分析

**现象**：

| 服务 | 新卡返回值 | 语义 |
|------|-----------|------|
| `echoe-study.service.ts` | `null` | 未定义/不适用 |
| `echoe-deck.service.ts` (SQL) | `NULL` | 聚合时排除 |
| DTO 文档注释 | `1` | 与实际实现不符 |

**影响**：
- API 文档语义与实现不符
- 开发者困惑：文档说新卡返回 1，但实际返回 null

**根因**：DTO 文档注释未与实现同步更新。

### 技术方案

#### 1. 定义统一语义

**设计决策**：新卡 retrievability 统一返回 `null`，语义为"未定义/不适用"。

**理由**：
- 新卡从未复习，稳定性未初始化，计算 retrievability 无意义
- `null` 明确表示"不适用"，与 `1`（100%）语义区分
- SQL 聚合中 `NULL` 自动排除，符合统计语义

#### 2. 修改 `echoe-stats.service.ts`

**位置**：`apps/server/src/services/echoe-stats.service.ts` 的 `getMaturity` 方法

```typescript
// 当前实现 (L224-225)
if (lastReview === 0 || stability === 0) {
  maturity.new++;
}

// 无需返回 retrievability，此处仅统计成熟度分布
```

**注意**：该服务当前未对外暴露 retrievability 字段，仅需确保内部逻辑一致性。

#### 3. 更新 DTO 文档

**位置**：`packages/dto/src/echoe.ts`

```typescript
export interface StudyCardDto {
  cardId: number;
  // ...
  /**
   * 当前可提取率 (Retrievability)
   * - 范围: [0, 1]
   * - 新卡: null（未定义/不适用）
   */
  retrievability: number | null;
}
```

#### 4. 前端适配

**位置**：`apps/web/src/pages/cards/study.tsx`

```typescript
// 展示逻辑
const rDisplay = card.retrievability !== null
  ? `${Math.round(card.retrievability * 100)}%`
  : '--'; // 新卡显示占位符
```

### 验收标准

- [x] 所有接口对新卡返回 `null`（已验证：`fsrs-retrievability.ts` 统一处理）
- [x] DTO 文档明确语义（已修复：`StudyQueueItemDto` 和 `StudyOptionsDto`）
- [ ] 前端统一展示逻辑（待前端适配）

> **修复状态**：后端代码实现已正确，DTO 文档已同步更新。

---

## 问题 4：`echoe-stats.service.ts` 存在未使用的 retrievability 方法（P2）

### 问题分析

**历史现象**：`echoe-stats.service.ts` 曾存在私有方法 `calculateRetrievability()`，但主流程并未消费该方法。

**当前状态**：该冗余方法已删除，`getMaturity`/`getMaturityBatch` 仅保留成熟度分桶所需逻辑（基于 `lastReview` 与 `stability`），不再维护重复的 retrievability 公式实现。

**影响**：消除重复实现，降低与 `fsrs-retrievability.ts` 口径漂移风险。

### 技术方案

#### 方案：删除冗余方法（已完成）

**已落地内容**：
1. 删除 `echoe-stats.service.ts` 内未使用的私有方法 `calculateRetrievability`
2. 保留成熟度统计的最小必要判断：`lastReview === 0 || stability === 0` 视为新卡
3. 约定后续若需要输出 retrievability，统一调用 `fsrs-retrievability.ts`

```typescript
// echoe-stats.service.ts (当前实现)
for (const card of cards) {
  const stability = card.stability;
  const lastReview = card.lastReview;

  if (lastReview === 0 || stability === 0) {
    maturity.new++;
  } else if (stability < 21) {
    maturity.learning++;
  } else if (stability < 90) {
    maturity.young++;
  } else {
    maturity.mature++;
  }
}
```

### 验收标准

- [x] 删除冗余方法
- [ ] 服务内无编译错误（当前 `@echoe/server` 存在与 `echoe-note.service.ts` 相关的既有类型报错）
- [ ] 单元测试通过（`echoe-stats.service.ts` 暂无独立测试覆盖）

---

## 问题 5：边界单测仍不完整（P2）

### 问题分析

**现象**：原有测试覆盖 `last_review=0`、未来时间、极端漂移，但曾缺少如下边界场景（现已补齐）：

1. 跨天边界（23:59:59 → 00:00:01）
2. 跨时区场景
3. 系统时间回拨

**当前测试覆盖情况**：

| 场景 | 测试用例 | 状态 |
|------|----------|------|
| `lastReview=0` | `should keep elapsed_days=0 when lastReview is 0` | ✅ |
| 未来时间 | `should clamp future last_review to now` | ✅ |
| 极端漂移 | `should cap elapsed_days for extreme clock drift` | ✅ |
| 新卡初始化 | `should use native FSRS initialization for uninitialized new cards` | ✅ |
| 跨天边界 | `should keep elapsed_days near zero when crossing midnight by seconds` | ✅ |
| 跨时区 | `should use absolute timestamp when timezone representation changes` | ✅ |
| 时间回拨 | `should clamp elapsed_days when system time rolls back` | ✅ |

### 技术方案

#### 新增测试用例

**位置**：`apps/server/src/__tests__/echoe-study.service.test.ts`

```typescript
describe('Timing boundary scenarios', () => {
  it('should keep elapsed_days near zero when crossing midnight by seconds', () => {
    const lastReview = new Date('2026-03-13T23:59:59.000Z').getTime();
    const now = new Date('2026-03-14T00:00:01.000Z');
    const card = buildCard({ lastReview });

    const fsCardInput = buildFSRSCardInput(card, now);

    // 约 2 秒，应接近 0 天
    expect(fsCardInput.elapsed_days).toBeLessThan(0.001);
  });

  it('should use absolute timestamp when timezone representation changes', () => {
    // 模拟用户从北京时区切换到伦敦时区
    const lastReviewInBeijing = new Date('2026-03-13T21:00:00+08:00').getTime();
    const nowInLondon = new Date('2026-03-13T13:00:00.000Z');
    const card = buildCard({ lastReview: lastReviewInBeijing });

    const fsCardInput = buildFSRSCardInput(card, nowInLondon);

    // 时间戳相同，elapsed_days 应为 0
    expect(fsCardInput.elapsed_days).toBe(0);
    expect(fsCardInput.last_review?.toISOString()).toBe('2026-03-13T13:00:00.000Z');
  });

  it('should clamp elapsed_days when system time rolls back', () => {
    const lastReview = new Date('2026-03-13T12:00:00.000Z').getTime();
    const now = new Date('2026-03-13T10:00:00.000Z'); // 回拨 2 小时
    const card = buildCard({ lastReview });

    const fsCardInput = buildFSRSCardInput(card, now);

    // 未来时间被 clamp 到 now
    expect(fsCardInput.elapsed_days).toBe(0);
    expect(fsCardInput.last_review?.toISOString()).toBe('2026-03-13T10:00:00.000Z');
  });

  it('should calculate retrievability consistently across day boundaries', () => {
    const stability = 10; // 10 天稳定性
    const lastReview = new Date('2026-03-13T23:59:59.000Z').getTime();
    
    // 跨天前
    const beforeMidnight = new Date('2026-03-13T23:59:59.500Z');
    const rBefore = calculateRetrievability(lastReview, stability, beforeMidnight.getTime());
    
    // 跨天后
    const afterMidnight = new Date('2026-03-14T00:00:00.500Z');
    const rAfter = calculateRetrievability(lastReview, stability, afterMidnight.getTime());

    // 1 秒差异应极小
    expect(Math.abs(rAfter.value! - rBefore.value!)).toBeLessThan(0.000001);
  });
});
```

#### 测试工具增强

本轮边界测试直接基于固定时间戳构造输入，覆盖跨天、跨时区和时间回拨场景；
无需新增 `apps/server/src/__tests__/helpers/time.ts` 工具文件，避免引入额外抽象。

### 验收标准

- [x] 新增 4 个边界测试用例
- [x] 所有测试通过
- [x] 测试覆盖率达到 P0-1 目标

---

## 实施计划

### 里程碑

| 阶段 | 内容 | 预计工时 |
|------|------|----------|
| Phase 1 | 问题 1 修复（P0） | 1h |
| Phase 2 | 问题 2 + 3 + 4 统一重构（P1） | 2h |
| Phase 3 | 问题 5 测试补齐（P2） | 1h |

### 依赖关系

```
问题 2（统一模块）→ 问题 3（语义统一）→ 问题 4（删除冗余）
         ↓
问题 5（测试补齐）
```

问题 1（forgetCards）独立实施，无依赖。

---

## 风险评估

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| forgetCards 修改影响现有数据 | 低 | 仅影响后续操作，不涉及历史数据迁移 |
| retrievability 统一后接口变化 | 中 | 前端适配，保持 `null` 语义一致 |
| 测试用例增加执行时间 | 低 | 合理组织，避免重复 setup |

---

## 附录：相关文件清单

```
apps/server/src/
├── services/
│   ├── echoe-study.service.ts      # 问题 1, 2, 3
│   ├── echoe-stats.service.ts      # 问题 2, 3, 4
│   └── echoe-deck.service.ts       # 问题 2
├── utils/
│   └── fsrs-retrievability.ts      # 新建（问题 2）
└── __tests__/
    ├── echoe-study.service.test.ts # 问题 1, 5
    └── helpers/
        └── time.ts                 # 新建（问题 5）

packages/dto/src/
└── echoe.ts                        # 问题 3（文档更新）

apps/web/src/
└── pages/cards/
    └── study.tsx                   # 问题 3（前端适配）
```

---

## 新增审查结论（2026-03-13 第二轮）

> 本节补充本轮代码审查发现的 FSRS 规范偏差与架构口径不一致问题。

### 问题概览

| 编号 | 问题 | 优先级 | 影响范围 |
|------|------|--------|----------|
| A1 | 导入链路误用 `revlog.time` 作为 `lastReview` | P0 | 导入后调度准确性 |
| A2 | `difficultCount` 的阈值推导错误（约 9 倍偏差） | P0 | 卡组统计与难卡识别 |
| A3 | 父子牌组 `averageRetrievability` 聚合分母不一致 | P1 | 掌握率展示 |
| A4 | `difficulty` 语义在 ts-fsrs/DTO/导入回填三处不一致 | P1 | 调度一致性与可解释性 |
| A5 | 学习页 retrievability 展示与实时接口数据源不一致 | P2 | 学习页体验一致性 |
| A6 | `FSRSConfig` 暴露未生效字段 | P2 | 配置层一致性 |

### A1：导入链路误用 `revlog.time` 作为 `lastReview`（P0）

**问题**
- `echoe-import.service.ts` 在 `resolveCardFsrsBackfill()` 中，把 `latestRevlog.time` 写入 `lastReview`。
- 但 `echoe-revlog` schema 明确 `time` 为答题耗时（ms），不是复习时间戳。

**影响**
- 导入后的 `lastReview` 可能是几百/几千毫秒，导致 `elapsed_days` 被放大到异常值。
- 进一步影响 FSRS 调度与 retrievability 计算。

**修复结果（2026-03-13，已落地）**
- [x] 卡片回填 `lastReview` 改为基于 `latestRevlog.id` 推导真实复习时间，不再使用 `revlog.time`（答题耗时）。
- [x] `importRevlogRows()` 中 `lastReview` 改为基于 `row.id` 推导，并同步修正 `preLastReview` 的计算基准。
- [x] 新增统一的 revlog 时间解析函数，兼容 `Unix ms`、`Unix ms * 1000`、`Unix seconds` 三种导入数据格式。

### A2：`difficultCount` 阈值推导错误（P0）

**问题**
- 当前 SQL 使用：`(now - lastReview) > stability * DAY_MS * 0.111111111` 来判定 `R < 0.9`。
- 对公式 `R(t,S) = 1 / (1 + t/(9S))` 推导后应为：`R < 0.9` 等价 `t > S`（天）。

**影响**
- 现有阈值比正确阈值严格约 9 倍，导致 difficult 卡数量明显虚高。

**修复结果（2026-03-13，已落地）**
- [x] `EchoeDeckService.getAllDecks()` 的 difficult 判定阈值已改为：`(now - lastReview) > stability * DAY_MS`。
- [x] `EchoeDeckService.getDeckById()` 的 difficult 判定阈值同步改为：`(now - lastReview) > stability * DAY_MS`。
- [x] 已修正公式注释，明确 `R < 0.9` 推导为 `t > S`，避免后续维护再次引入 9 倍偏差。

### A3：父子牌组 `averageRetrievability` 聚合口径不一致（P1）

**问题**
- 叶子层 SQL 对 `lastReview > 0 AND stability > 0` 才参与 `AVG`。
- 树聚合时却按 `totalCount`（含新卡）加权平均。

**影响**
- 父级牌组掌握率会因新卡比例被错误稀释。

**修复结果（2026-03-13，已落地）**
- [x] `EchoeDeckService.getAllDecks()` 的叶子层 FSRS 统计已新增 `retrievabilityEligibleCount`（`lastReview > 0 AND stability > 0`）。
- [x] 父子树聚合已改为按 `retrievabilityEligibleCount` 加权 `averageRetrievability`，不再按 `totalCount`（含新卡）稀释。
- [x] 新增 `apps/server/src/__tests__/echoe-deck.service.test.ts`，覆盖「新卡不稀释父级掌握率」与「无可计算卡时返回 0」两类断言。

### A4：`difficulty` 语义不一致（P1）

**问题**
- DTO 注释和导入回填将 difficulty 视为 `0~1` 概率。
- 运行 `ts-fsrs` 可见其 difficulty 输出并非该量纲（示例值 `2.11810397`）。
- 同时 legacy fallback 仍使用硬编码 `difficulty: 0.3`。

**影响**
- 新学习卡、导入卡、legacy 卡进入不同 difficulty 语义空间，调度结果不可比。

**修复结果（2026-03-13，已落地）**
- [x] `EchoeImportService` 已移除 difficulty 的 `0~1` clamp，revlog/heuristic 回填统一按 `factor / 1000`（缺省回退 `2.5`）写入，保持同一量纲。
- [x] `EchoeStudyService.buildFSRSCardInput()` 的 legacy fallback 已从 `difficulty: 0.3` 调整为 `2.5`，与导入回填语义保持一致。
- [x] `EchoeCardDto` 与 `echoe_cards` schema 注释已更新为“ts-fsrs 原生 difficulty 量纲（非概率）”，去除 `0~1` 概率口径。
- [x] 新增 `apps/server/src/__tests__/echoe-import.service.test.ts`，并更新 `echoe-study.service.test.ts` 覆盖相关回归断言。

### A5：学习页 retrievability 展示数据源不一致（P2）

**问题**
- 前端已通过 `/study/options` 获取实时 `currentRetrievability`。
- 页面展示仍使用 `currentCard.retrievability`（来自 queue 快照）。

**影响**
- UI 可能显示旧值，与当前请求返回值不一致。

**修复结果（2026-03-13，已落地）**
- [x] `study.tsx` 状态栏展示已从 `currentCard.retrievability` 改为 `studyService.currentRetrievability`。
- [x] 展示时机：仅在答案面展示后调用 `/study/options` 时获得实时值，避免使用队列快照值。
- [x] 无值时默认不显示 Brain 图标与百分比区域，符合“无值时不展示”原则。

### A6：`FSRSConfig` 暴露未生效字段（P2）

**问题**
- `FSRSConfig` 包含 `graduatingInterval/easyIntervalMultiplier/intervalMultiplier`。
- `buildParams()` 未将这些字段映射到 `generatorParameters()`。

**影响**
- 配置接口“可见但无效”，增加理解成本和错误预期。

**修复结果（2026-03-13，已落地）**
- [x] `FSRSService` 的 `FSRSConfig` 已移除未生效字段 `graduatingInterval/easyIntervalMultiplier/intervalMultiplier`，仅保留 `ts-fsrs` 实际支持的配置项。
- [x] `DEFAULT_CONFIG` 已同步删除上述字段，避免默认值制造“看似可配置”的误导。
- [x] `fsrs.service.test.ts` 已移除无效字段相关断言，并新增受支持字段到 `generatorParameters()` 的映射校验。
- [x] 前端与 DTO 侧的 `EchoeFsrsConfigDto` 本身仅暴露有效字段，无需额外结构调整。

### 实施优先级建议

1. **P0 立即修复**：A1、A2（直接影响调度正确性与关键统计）。
2. **P1 本迭代修复**：A3、A4（统一语义和聚合口径）。
3. **P2 收尾修复**：A5、A6（体验和配置一致性）。
