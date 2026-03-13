# FSRS 第五轮审查问题（D 系列）

> 审查日期：2026-03-13
> 审查范围：fsrs.service.ts / echoe-study.service.ts / echoe-deck.service.ts / fsrs-default-config.ts / fsrs-retrievability.ts / echoe-study.controller.ts / web/echoe-study.service.ts / study.tsx

---

## 问题概览

| 编号 | 问题                                                                                         | 优先级 | 状态      |
| ---- | -------------------------------------------------------------------------------------------- | ------ | --------- |
| D1   | `forgetCards` 硬编码 `factor: 2500`（SM-2 遗留值），未走 `FSRSService.forgetCard()` 规范路径 | P0     | ✅ 已修复 |
| D2   | `revlog.id` 用 `floor(Date.now()/1000)*1000`，碰撞风险且不符合 Anki ms 语义                  | P1     | ✅ 已修复 |
| D3   | `getQueue` 排序为 `desc(due)`，最晚到期卡优先，与 FSRS/Anki 标准相反                         | P1     | ✅ 已修复 |
| D4   | `FSRSService` 中 `handleDelayedReview/handleRelearning/handleLearning` 是死代码且语义有误    | P1     | ✅ 已修复 |
| D5   | 步长规范化两套独立实现，DTO 与运行时格式不统一（`number[]` vs `string[]`）                   | P2     | ✅ 已修复 |
| D6   | `graduated` 判断用字面量 `2` 而非 `State.Review`，且语义覆盖 Relearning→Review 场景          | P2     | ✅ 已修复 |
| D7   | 前端 `EchoeStudyService` 多处 `console.error` 违反项目日志规范               | P2     | ✅ 已修复 |
| D8   | `FSRSService.getIntervalText()` 从未被调用（死代码），前端 Learning 阶段间隔显示不准确       | P2     | ✅ 已修复 |

---

## D1：`forgetCards` 硬编码 `factor: 2500` 且未走规范 forget 路径（P0）

### 问题分析

**位置**：`apps/server/src/services/echoe-study.service.ts` 第 532-554 行

```typescript
async forgetCards(cardIds: number[]): Promise<void> {
  await db.update(echoeCards).set({
    due: newDue,
    ivl: 0,
    factor: 2500,   // ❌ SM-2 遗留值，FSRS 中 factor 存储 stability*1000，应为 0
    reps: 0,
    lapses: 0,
    left: 0,
    type: 0,
    queue: 0,
    mod: now,
    usn: -1,
    stability: 0,
    difficulty: 0,
    lastReview: 0,
  });
}
```

**问题**：

1. 本项目 FSRS 架构中 `factor` 字段被重用来存储 `stability * 1000`（见 `submitReview` 第 267 行：`factor: Math.round(schedulingResult.stability * 1000)`）。忘记卡片后 `stability` 已置 0，`factor` 应同步置为 `0`，而不是 SM-2 的初始系数 `2500`，否则两个字段语义不一致。
2. `FSRSService` 已提供 `forgetCard(card, now, keepStats)` 方法，内部调用 `f.forget()`（ts-fsrs 官方 reset 接口），应优先走此规范路径，避免手动 hardcode 字段——未来 ts-fsrs `forget()` 语义变化不会自动同步。

### 修复方案

**方案 A（推荐）**：逐卡走 `FSRSService.forgetCard()`，取 reset 后字段写库。

```typescript
async forgetCards(cardIds: number[]): Promise<void> {
  const db = getDatabase();
  const now = new Date();
  const nowSec = Math.floor(now.getTime() / 1000);

  for (const cardId of cardIds) {
    const card = await db.query.echoeCards.findFirst({
      where: eq(echoeCards.id, cardId),
    });
    if (!card) continue;

    const fsCard = this.fsrsService.toFSCard({
      due: new Date(card.due),
      stability: card.stability ?? 0,
      difficulty: card.difficulty ?? 0,
      elapsed_days: 0,
      scheduled_days: card.ivl,
      learning_steps: card.left,
      reps: card.reps,
      lapses: card.lapses,
      state: card.type as State,
      last_review: card.lastReview ? new Date(card.lastReview) : undefined,
    });

    const resetCard = this.fsrsService.forgetCard(fsCard, now, false);

    await db.update(echoeCards).set({
      due: resetCard.due.getTime(),
      ivl: resetCard.scheduled_days,
      factor: Math.round(resetCard.stability * 1000), // 与 submitReview 一致
      reps: resetCard.reps,
      lapses: resetCard.lapses,
      left: resetCard.learning_steps,
      type: resetCard.state,
      queue: 0,
      stability: resetCard.stability,
      difficulty: resetCard.difficulty,
      lastReview: 0,
      mod: nowSec,
      usn: -1,
    }).where(eq(echoeCards.id, cardId));
  }
}
```

### 单测要求

更新 `apps/server/src/__tests__/echoe-study.service.test.ts` 中 `forgetCards` 测试，断言 `factor` 为 `0` 而非 `2500`：

```typescript
expect(setMock).toHaveBeenCalledWith(
  expect.objectContaining({
    factor: 0, // ← 修复后的期望值
    stability: 0,
    difficulty: 0,
    lastReview: 0,
  })
);
```

---

## D2：`revlog.id` 碰撞风险与 Anki ms 语义不符（P1）

### 问题分析

**位置**：`apps/server/src/services/echoe-study.service.ts` 第 285-287 行

```typescript
const reviewTime = Math.floor(Date.now() / 1000);  // 秒级精度
await db.insert(echoeRevlog).values({
  id: reviewTime * 1000,  // ❌ 尾部固定 000，同秒内主键冲突
```

**问题**：

- 生成值为 `秒级时间戳 × 1000`，同一秒内连续提交（自动化/批量操作）会触发主键冲突。
- Anki `revlog.id` 语义为直接的**毫秒时间戳**（`Date.now()`），本处生成值形式相似但精度损失，与 C3 中记录的 schema 注释也有偏差。
- 统计链路（`echoe-stats.service.ts`）按 `id >= startMs * 1000` 查询时，若未来 `id` 生成策略变化，统计会静默漏数。

> 注：C3 问题已记录"schema 注释为 `ms * 1000 + random`"，D2 与 C3 存在重叠，但 C3 尚未修复，本条作为执行催办项。

### 修复方案

统一使用 `Date.now()` 作为 `revlog.id`：

```typescript
// echoe-study.service.ts
await db.insert(echoeRevlog).values({
  id: Date.now(),  // 毫秒时间戳，与 Anki revlog.id 语义一致
  ...
});
```

若需要更强的唯一性保证（并发场景），可在 `apps/server/src/utils/id.ts` 提供 `generateRevlogId()`：

```typescript
let lastMs = 0;
let seq = 0;

export function generateRevlogId(): number {
  const ms = Date.now();
  if (ms === lastMs) {
    seq = (seq + 1) % 1000;
  } else {
    lastMs = ms;
    seq = 0;
  }
  return ms * 1000 + seq; // 与 schema 注释 "ms*1000+random" 对齐
}
```

---

## D3：`getQueue` 排序 `desc(due)` 与 FSRS 优先级语义相反（P1）

### 问题分析

**位置**：`apps/server/src/services/echoe-study.service.ts` 第 98 行

```typescript
.orderBy(desc(echoeCards.due))   // ❌ 最晚到期的排在最前
```

**问题**：FSRS 与 Anki 的标准行为是将**最早到期（最紧迫）**的卡片优先呈现给用户。`desc(due)` 导致用户看到的是最不紧迫的卡片，已超期时间最长的卡片反而排在最后，调度效果与 FSRS 设计意图完全相反。

### 修复方案

```typescript
// 修复：改为升序，最早到期优先
.orderBy(asc(echoeCards.due))
```

若需实现 Anki 的完整队列优先级（learning > review > new），可进一步分级排序：

```typescript
.orderBy(
  // 优先级：1=learning, 3=relearning > 2=review > 0=new
  sql`CASE WHEN ${echoeCards.queue} IN (1, 3) THEN 0
           WHEN ${echoeCards.queue} = 2 THEN 1
           ELSE 2 END`,
  asc(echoeCards.due)
)
```

---

## D4：`FSRSService` 三个方法是死代码且语义有误（P1）

### 问题分析

**位置**：`apps/server/src/services/fsrs.service.ts` 第 168-210 行

```typescript
handleDelayedReview(card, rating, now?, config?)  // 从未被调用
handleRelearning(card, rating, now?, config?)      // 从未被调用
handleLearning(card, rating, now?, config?)        // 从未被调用
```

**问题**：

1. `echoe-study.service.ts` 的 `submitReview()` 只调用 `scheduleCard()`，上述三个方法在整个 server 代码库中**零调用**。
2. `handleDelayedReview` 手动对 `card.elapsed_days += delayDays`，而 `buildFSRSCardInput()` 已通过 `now - lastReview` 正确计算 elapsed_days；若未来误用这两个路径，会产生 double-counting。
3. `handleRelearning/handleLearning` 在调用 `scheduleCard()` 前强制修改 `card.state`，违反 ts-fsrs 设计——状态转换应由 `f.next()` 内部管理，外部预设状态会导致调度逻辑异常。

### 修复方案

直接删除这三个方法，减少误用风险和维护负担：

```typescript
// 删除以下方法：
// - handleDelayedReview()
// - handleRelearning()
// - handleLearning()
```

同时检查并移除对应的 JSDoc 注释块。

---

## D5：步长规范化两套实现，格式不统一（P2）

### 问题分析

**问题 1：逻辑重复**

| 位置                          | 方法                   | 输出格式                           |
| ----------------------------- | ---------------------- | ---------------------------------- |
| `echoe-study.service.ts:1114` | `normalizeStepToken()` | `string[]`（如 `"1m"`, `"10m"`）   |
| `echoe-deck.service.ts:690`   | `normalizeSteps()`     | `number[]`（分钟数，如 `1`, `10`） |

两套实现的解析逻辑基本相同，但输出类型不一致，无法互相复用。

**问题 2：DTO 与运行时格式不统一**

- `EchoeFsrsConfigDto.learningSteps` 类型为 `number[]`（分钟，用于前端展示）。
- `FSRSService.buildParams()` 接收 `string[]`（ts-fsrs 格式，如 `"1m"`）。
- `echoe-study.service.ts` 的 `getFSRSConfig()` 内部将 `number` 步长规范化为 `"Xm"` 字符串再传给 ts-fsrs，但这个转换隐藏在私有方法中，没有明确的格式边界。

### 修复方案

在 `apps/server/src/utils/fsrs-steps.ts`（或 `fsrs-default-config.ts`）提取共享工具函数：

```typescript
/** 将原始步长（数字或字符串）解析为分钟数 */
export function parseStepToMinutes(step: string | number): number | null { ... }

/** 将分钟数组转为 ts-fsrs 格式字符串数组（如 [1, 10] → ["1m", "10m"]） */
export function minutesToFsrsSteps(minutes: number[]): string[] {
  return minutes.map(m => `${m}m`);
}
```

- `echoe-study.service.ts`：使用 `minutesToFsrsSteps()` 替代内部 `normalizeStepToken()`。
- `echoe-deck.service.ts`：使用 `parseStepToMinutes()` 替代内部 `normalizeSteps()`。

---

## D6：`graduated` 判断语义不精确（P2）

### 问题分析

**位置**：`apps/server/src/services/echoe-study.service.ts` 第 230 行

```typescript
const graduated = newState === State.Review && card.type !== 2;
```

**问题**：

1. `card.type !== 2` 应写为 `card.type !== State.Review`，直接用字面量 `2` 可读性差且存在语义模糊。
2. 当 `card.type === State.Relearning`（值为 3）时，`3 !== 2` 为 true，所以 Relearning → Review 的转换也会被标记为 `graduated = true`。语义上"graduated"应指卡片**首次**从 Learning 阶段毕业到 Review，而非 Relearning 重新毕业的场景。

### 修复方案

```typescript
// 修复：明确毕业语义为 Learning → Review
const graduated = newState === State.Review && card.type === State.Learning;
```

若产品层面需要区分"首次毕业"与"重新毕业"，可扩展为：

```typescript
const graduatedFromLearning = newState === State.Review && card.type === State.Learning;
const graduatedFromRelearning = newState === State.Review && card.type === State.Relearning;
```

---

## D7：前端 `EchoeStudyService` 使用 `console.error` 违反日志规范（P2）

### 问题分析

**位置**：`apps/web/src/services/echoe-study.service.ts`

```typescript
// 131 行
console.error('Load queue error:', err);
// 320 行
console.error('Submit review error:', err);
// 349 行
console.error('Undo error:', err);
// 381 行
console.error('Bury card error:', err);
// 406 行
console.error('Forget card error:', err);
```

**问题**：项目规范明确禁止使用 `console.error`。前端 catch 块已通过 `this.error` 记录错误信息、通过 `ToastService` 展示用户可见提示，`console.error` 冗余且不规范。

### 修复方案

直接移除所有 `console.error` 调用。若调试阶段确实需要日志，可引入前端统一 logger 替代（目前前端无统一 logger，暂以删除为准）：

```typescript
// 删除：
// console.error('Load queue error:', err);
// console.error('Submit review error:', err);
// console.error('Undo error:', err);
// console.error('Bury card error:', err);
// console.error('Forget card error:', err);
```

---

## D8：`FSRSService.getIntervalText()` 是死代码，前端 Learning 阶段间隔显示不准确（P2）

### 问题分析

**死代码**：`apps/server/src/services/fsrs.service.ts` 第 262-279 行的 `getIntervalText()` 方法在整个 server 代码库中**零调用**。API 响应直接返回 `interval`（天数数字），格式化由前端负责。

**前端显示不准确**：`apps/web/src/services/echoe-study.service.ts` 第 464-478 行：

```typescript
private formatIntervalText(interval: number): string {
  if (interval < 1) {
    return '<1d';   // ❌ Learning 阶段 interval 通常为分钟级小数，显示为 "<1d" 对用户无意义
  }
  ...
}
```

FSRS 的 Learning 步长（如 `1m`, `10m`）对应的 `scheduled_days` 约为 `0.0007`（1分钟）或 `0.007`（10分钟），前端统一显示为 `"<1d"`，而不是用户期望的 `"1m"` / `"10m"`。

### 修复方案

**1. 删除服务端死代码**

```typescript
// 删除 fsrs.service.ts 中的 getIntervalText() 方法
```

**2. 修复前端 `formatIntervalText()` 补全分钟/小时格式**

```typescript
private formatIntervalText(interval: number): string {
  if (interval < 1 / 24) {
    // 小于 1 小时，显示分钟
    const minutes = Math.round(interval * 24 * 60);
    return `${minutes}m`;
  }

  if (interval < 1) {
    // 小于 1 天，显示小时
    const hours = Math.round(interval * 24);
    return `${hours}h`;
  }

  if (interval < 30) {
    return `${Math.round(interval)}d`;
  }

  if (interval < 365) {
    return `${Math.round(interval / 30)}mo`;
  }

  return `${Math.round(interval / 365)}y`;
}
```

---

## 修复优先级建议

1. **P0 立即修复**：D1（`forgetCards` `factor` 字段错误值，影响调度正确性）。
2. **P1 本迭代修复**：
   - D2（`revlog.id` 碰撞风险，与 C3 合并处理）。
   - D3（`getQueue` 排序方向错误，直接影响用户学习体验）。
   - D4（删除死代码，消除潜在误用风险）。
3. **P2 后续迭代**：D5（步长格式统一）、D6（graduated 语义）、D7（console.error 清理）、D8（前端间隔显示优化）。

---

## 第五轮审查新增问题（2026-03-13，代码与测试不一致）

> 审查日期：2026-03-13
> 审查范围：fsrs.service.ts / fsrs.service.test.ts / web/echoe-study.service.ts

### 问题概览

| 编号 | 问题 | 优先级 | 状态 |
| ---- | ---- | ------ | ---- |
| E1   | `fsrs.service.test.ts` 保留 `getIntervalText` 死代码测试，导致 5 个用例失败 | P1 | ✅ 已修复 |
| E2   | 前端 `EchoeStudyService` 5 处 `console.error` 违反日志规范（即 D7） | P2 | ✅ 已修复 |

---

### E1：`fsrs.service.test.ts` 保留死代码测试用例（P1）

**位置**：`apps/server/src/__tests__/fsrs.service.test.ts`

**问题**：D8 修复时删除了 `FSRSService.getIntervalText()` 方法（死代码），但未同步删除对应的测试 `describe('getIntervalText', ...)` 块（含 5 个用例）。导致测试套件持续报错：

```
TypeError: service.getIntervalText is not a function
```

**影响**：`5 tests failed`，CI 红灯，掩盖真实测试信号。

**修复**：删除整个 `describe('getIntervalText', ...)` 块（共 26 行）。

**修复后**：`8 suites passed / 85 tests passed`，全绿。

---

### E2：前端 `console.error` 违反日志规范（即 D7，P2）

**位置**：`apps/web/src/services/echoe-study.service.ts`

**问题**：5 处 `catch` 块中的 `console.error` 调用违反项目日志规范（禁止使用 `console.*`）：

- 第 131 行：`console.error('Load queue error:', err)`
- 第 320 行：`console.error('Submit review error:', err)`
- 第 349 行：`console.error('Undo error:', err)`
- 第 381 行：`console.error('Bury card error:', err)`
- 第 406 行：`console.error('Forget card error:', err)`

**修复**：直接移除全部 5 处调用。错误信息已通过 `this.error` 赋值与 `ToastService` 向用户展示，`console.error` 为冗余输出。

---

## 第六轮审查（2026-03-13，N 系列）

> 审查日期：2026-03-13
> 审查范围：D1–D8 / A1–A6 / B1–B4 / C1–C3 全量落地验证 + 新增问题

### 验证结论

D/A/B/C 系列所有标记"已修复"的问题均已在代码中落地，无遗漏。

### 问题概览

| 编号 | 问题                                                            | 优先级 | 状态    |
| ---- | --------------------------------------------------------------- | ------ | ------- |
| N1   | `getDeckById` 与 `getAllDecks` averageRetrievability 计算风格不一致 | P2     | ✅ 已修复 |
| N2   | `submitReview` 中 `left` 硬编码 0，丢失 Learning 步骤进度        | P1     | ⏳ 待修复 |
| N3   | `undo` 无用户归属校验，任意用户可撤销他人 revlog                  | P2     | ✅ 已修复 |
| N4   | `formatIntervalText(0)` 显示 `"0m"`，对用户有歧义               | P3     | ⏳ 待修复 |

---

## N1：`getDeckById` 与 `getAllDecks` averageRetrievability 计算风格不一致（P2）

### 问题分析

**位置**：`apps/server/src/services/echoe-deck.service.ts`

`getAllDecks()` 修复了 A3 问题，使用 `retrievabilityEligibleCount` 加权平均：

```typescript
// getAllDecks (已修复)
retrievabilityEligibleCount: sql<number>`SUM(CASE WHEN ${retrievabilityExpr} IS NULL THEN 0 ELSE 1 END)`,
averageRetrievability: sql<number>`AVG(${retrievabilityExpr})`,
// 聚合时按 retrievabilityEligibleCount 加权
```

`getDeckById()` 仍直接使用 `AVG()`：

```typescript
// getDeckById (当前实现)
averageRetrievability: sql<number>`AVG(${retrievabilityExpr})`,
// ⚠️ 未包含 retrievabilityEligibleCount 字段
```

**说明**：由于 `retrievabilityExpr` 对新卡返回 `NULL`，MySQL 的 `AVG()` 自动排除 NULL，数学上不会产生错误结果。但：
1. 两处实现风格不一致，`getDeckById` 缺少显式的 `retrievabilityEligibleCount` 字段，不方便返回给调用方感知"有多少卡参与了平均"。
2. 未来若需要在 DTO 中暴露该字段，`getDeckById` 需要补充查询。

### 修复方案

为 `getDeckById` 的 FSRS 统计查询补充 `retrievabilityEligibleCount` 字段，与 `getAllDecks` 保持一致：

```typescript
const fsrsStats = await db
  .select({
    did: echoeCards.did,
    totalCount: sql<number>`COUNT(*)`,
    matureCount: sql<number>`SUM(CASE WHEN ${echoeCards.stability} >= 21 THEN 1 ELSE 0 END)`,
    difficultCount: sql<number>`SUM(CASE WHEN ... THEN 1 ELSE 0 END)`,
    retrievabilityEligibleCount: sql<number>`SUM(CASE WHEN ${retrievabilityExpr} IS NULL THEN 0 ELSE 1 END)`,
    averageRetrievability: sql<number>`AVG(${retrievabilityExpr})`,
    lastStudiedAt: sql<number>`MAX(CASE WHEN ${echoeCards.lastReview} > 0 THEN ${echoeCards.lastReview} ELSE NULL END)`,
  })
  // ...
```

---

## N2：`submitReview` 中 `left` 硬编码 0，丢失 Learning 步骤进度（P1）

### 问题分析

**位置**：`apps/server/src/services/echoe-study.service.ts` 第 278 行

```typescript
await db.update(echoeCards).set({
  // ...
  left: 0, // Reset steps   ← ❌ 硬编码，丢失 ts-fsrs 管理的步骤计数
  // ...
});
```

**背景**：`ts-fsrs` 中 `Card.learning_steps` 表示当前学习步骤计数器（Learning / Relearning 阶段）。`buildFSRSCardInput()` 在构建 FSRS 输入时已正确从 `card.left` 读取：

```typescript
learning_steps: Math.max(0, card.left),
```

**问题**：`f.next()` 调用后，`result.card.learning_steps` 携带了 ts-fsrs 更新后的步骤计数，但 `submitReview` 写库时固定写入 `left: 0`，导致：

1. 多步学习（如 `[1m, 10m]`）过程中，第一次答 Good 后 `left` 被置 0，下次提交时 ts-fsrs 读到 `learning_steps=0`，无法感知当前处于第几步，调度结果可能偏差。
2. `FSRSService.scheduleCard()` 当前返回的 `FSRSOutput` 未包含 `learningSteps` 字段，需要补充。

### 修复方案

**步骤 1**：在 `FSRSOutput` 中补充 `learningSteps` 字段：

```typescript
// fsrs.service.ts
export interface FSRSOutput {
  nextDue: Date;
  interval: number;
  stability: number;
  difficulty: number;
  state: State;
  scheduledDays: number;
  learningSteps: number;  // ✅ 新增：ts-fsrs 管理的学习步骤计数
}
```

**步骤 2**：在 `scheduleCard()` 中写回：

```typescript
return {
  nextDue: result.card.due,
  interval: result.card.scheduled_days,
  stability: result.card.stability,
  difficulty: result.card.difficulty,
  state: result.card.state,
  scheduledDays: result.card.scheduled_days,
  learningSteps: result.card.learning_steps,  // ✅
};
```

**步骤 3**：`submitReview` 中使用调度结果写库：

```typescript
left: schedulingResult.learningSteps,  // ✅ 写回 ts-fsrs 的步骤计数，不再硬编码 0
```

### 单测要求

在 `echoe-study.service.test.ts` 新增测试，验证 Learning 阶段 `left` 字段正确写回：

```typescript
it('should persist learning_steps from FSRS output to card.left', async () => {
  // scheduleCard mock 返回 learningSteps=1（第二步）
  // 断言 setMock 被调用时 left=1
});
```

---

## N3：`undo` 无用户归属校验（P2）

### 问题分析

**位置**：`apps/server/src/services/echoe-study.service.ts` 第 425-483 行

```typescript
const lastReview = await db.query.echoeRevlog.findFirst({
  where: reviewId ? eq(echoeRevlog.id, reviewId) : undefined,
  orderBy: [desc(echoeRevlog.id)],
});
```

当 `reviewId` 由客户端传入时，接口不校验该 revlog 是否属于当前登录用户，理论上可以撤销他人的复习记录。

**影响**：目前项目认证体系基于 Cookie/JWT，且 revlog 的 `cid` 关联到卡片，卡片关联到牌组，牌组有用户归属，攻击面有限。但缺少归属校验仍属于权限设计缺陷。

### 修复方案

在撤销前校验 revlog 对应的卡片是否属于当前用户（通过 `card.did` → `deck` → `userId` 链路），或在 `echoeRevlog` schema 中增加 `uid` 字段直接关联用户。

---

## N4：`formatIntervalText(0)` 显示 `"0m"`，语义歧义（P3）

### 问题分析

**位置**：`apps/web/src/services/echoe-study.service.ts` 第 459-481 行

当 `interval=0`（Learning 阶段 Again 评分后 ts-fsrs 可能返回 0）时：

```typescript
if (interval < 1 / 24) {
  const minutes = Math.round(interval * 24 * 60);
  return `${minutes}m`;  // → "0m"，对用户无意义
}
```

### 修复方案

```typescript
private formatIntervalText(interval: number): string {
  if (interval <= 0) {
    return '<1m';  // ✅ 明确表达"即将重现"
  }
  if (interval < 1 / 24) {
    const minutes = Math.round(interval * 24 * 60);
    return minutes > 0 ? `${minutes}m` : '<1m';
  }
  // ...其余不变
}
```

---

## N 系列修复优先级建议

1. **P1 本迭代修复**：N2（`left` 字段丢失步骤进度，直接影响 Learning 阶段多步调度正确性）。
2. **P2 后续迭代**：N1（代码风格一致性）、N3（权限校验完善）。
3. **P3 收尾**：N4（显示歧义优化）。
