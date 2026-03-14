# FSRS 第七轮审查问题（F 系列）

> 审查日期：2026-03-14
> 审查范围：echoe-study.service.ts / echoe-deck.service.ts / echoe-note.service.ts / echoe-stats.service.ts / fsrs.service.ts / web/echoe-study.service.ts

---

## 问题概览

| 编号 | 问题                                                                                         | 优先级 | 状态    |
| ---- | -------------------------------------------------------------------------------------------- | ------ | ------- |
| F1   | `due` 字段语义双轨制：`echoe-deck.service.ts` 等将 ms 时间戳当天数比较，`reviewCount` 永远为 0 | P0     | ✅ 已修复 |
| F2   | `fsrs.service.ts` D4 死代码未落地：`handleDelayedReview/handleRelearning/handleLearning` 仍存在 | P1     | ✅ 已修复（误报：代码已落地删除） |
| F3   | `getSchedulingOptions` 返回的 `FSRSOutput` 缺少 `learningSteps` 字段，违反接口契约             | P1     | ✅ 已修复（误报：字段已存在） |
| F4   | `getCounts` 的 `learnCount` 无 `due <= now` 约束，把未来 Learning 卡也计入                   | P2     | ✅ 已修复 |
| F5   | `unburyAtDayBoundary` 无用户归属过滤，会解除全库所有用户的埋卡                               | P2     | ✅ 已修复 |
| F6   | 前端 `undo()` 不传 `reviewId`，多 tab 场景下会撤销错误的 revlog                              | P2     | ✅ 已修复 |
| F7   | `findCardsBySearch` 中 `is:learning` 被错误地映射到新卡逻辑（queue=0）                       | P2     | ✅ 已修复 |
| F8   | `echoe-stats.service.ts` `getForecast` 把 Learning 卡的 `due` 毫秒值当天数处理，预测图缺失 Learning 卡 | P2     | ✅ 已修复 |

---

## F1：`due` 字段语义双轨制导致 reviewCount 永远为 0（P0）

### 问题分析

**受影响文件**：
- `apps/server/src/services/echoe-deck.service.ts`（`getAllDecks` / `getDeckById`）
- `apps/server/src/services/echoe-note.service.ts`（`getNotes` status=review 过滤）
- `apps/server/src/services/echoe-stats.service.ts`（`getForecast`）

**当前系统实际语义**：`submitReview` 写入 `due = nextDue.getTime()`（毫秒时间戳，约 `1.7e12`），`getQueue` / `getCounts` 也用 `due <= Date.now()`（毫秒比较）。

**问题**：`echoe-deck.service.ts` 用天数与 `due` 字段比较：

```typescript
// echoe-deck.service.ts（getAllDecks / getDeckById）
const today = Math.floor(Date.now() / 86400000);  // ≈ 20000（天数）
// due 实际存储的是毫秒时间戳（约 1.7e12），与 today ≈ 20000 比较永远不满足 <=
reviewCount: sql<number>`SUM(CASE WHEN ${echoeCards.queue} = 2 AND ${echoeCards.due} <= ${today} THEN 1 ELSE 0 END)`,
```

同样错误出现在 `echoe-note.service.ts`：

```typescript
const today = Math.floor(Date.now() / 86400000);
case 'review': and(eq(echoeCards.queue, 2), sql`${echoeCards.due} <= ${today}`)
// due 是毫秒，today 是天数，永远不满足
```

**影响**：
1. 首页牌组列表显示的复习数（`reviewCount`）永远为 0
2. 笔记浏览器按 `status=review` 过滤时返回空结果
3. 统计预测图中 review 卡片分布完全错误

### 修复方案

将所有使用 `today`（天数）与 `due` 比较 review 卡片的地方，改为使用毫秒时间戳：

```typescript
// 修复：使用毫秒时间戳
const nowMs = Date.now();
reviewCount: sql<number>`SUM(CASE WHEN ${echoeCards.queue} = 2 AND ${echoeCards.due} <= ${nowMs} THEN 1 ELSE 0 END)`,
```

**修复状态**：
- `echoe-deck.service.ts` ✅ 已修复（使用 `const nowMs = Date.now()`）
- `echoe-note.service.ts` ✅ 已修复（使用 `const nowMs = Date.now()`）
- `echoe-stats.service.ts` ✅ 已修复（`getForecast` 使用毫秒时间戳计算）
- `findCardsBySearch` 的 `is:learning` 映射错误 ✅ 已修复（F7 问题已修复）

---

## F2：`fsrs.service.ts` D4 死代码未落地（P1）

### 问题分析

**位置**：`apps/server/src/services/fsrs.service.ts`

文档 `fsrs-review-d.md` D4 条目状态标注为 `✅ 已修复`，审查时误以为以下三个方法仍然存在：

```typescript
handleDelayedReview(card, rating, now?, config?)  // 零调用，逻辑有误
handleRelearning(card, rating, now?, config?)      // 零调用，强制修改 card.state 违反 ts-fsrs 设计
handleLearning(card, rating, now?, config?)        // 零调用，强制修改 card.state 违反 ts-fsrs 设计
```

### 修复状态

**✅ 已修复（误报）**

经代码验证，当前 `fsrs.service.ts`（共 215 行）中已不存在这三个方法。全项目搜索也确认零调用、零引用。D4 修复已在代码中落地完成。

---

## F3：`getSchedulingOptions` 返回的 `FSRSOutput` 缺少 `learningSteps`（P1）

### 修复状态

**✅ 已修复（误报）**

经代码验证，`getSchedulingOptions` 方法（`apps/server/src/services/fsrs.service.ts` 第 153-161 行）已正确填充 `learningSteps` 字段：

```typescript
options[grade] = {
  nextDue: item.card.due,
  interval: item.card.scheduled_days,
  stability: item.card.stability,
  difficulty: item.card.difficulty,
  state: item.card.state,
  scheduledDays: item.card.scheduled_days,
  learningSteps: item.card.learning_steps,  // ✅ 字段已存在
};
```

`FSRSOutput` 接口契约与实现一致，无需修复。

---

## F4：`getCounts` 的 `learnCount` 无 `due` 时间约束（P2）

### 问题分析

**位置**：`apps/server/src/services/echoe-study.service.ts` `getCounts` 方法

```typescript
// learnCount 无时间约束
const learnConditions = [sql`${echoeCards.queue} IN (1, 3)`];
```

Learning 卡（queue=1/3）按 FSRS 规范也有 `due` 时间（如 1m、10m 后），刚提交答案的卡片会立即进入 Learning 状态并等待下一个步长时间。但当前实现把所有 queue=1/3 的卡片都计入 `learnCount`，包括**还没到复习时间**的卡片，导致学习数虚高。

**对比**：`reviewCount` 正确地加了 `due <= now` 约束，`learnCount` 缺少对应约束是语义不一致。

### 修复状态

**✅ 已修复**

```typescript
// 已修复：添加 due <= now 约束，只计入当前需要学习的 Learning 卡
const learnConditions = deckFilter
  ? [deckFilter, sql`${echoeCards.queue} IN (1, 3)`, sql`${echoeCards.due} <= ${now}`]
  : [sql`${echoeCards.queue} IN (1, 3)`, sql`${echoeCards.due} <= ${now}`];
```

---

## F5：`unburyAtDayBoundary` 无用户归属过滤（P2）

### 问题分析

**位置**：`apps/server/src/services/echoe-study.service.ts` 第 607-663 行

```typescript
// 查全库所有埋卡，无用户/牌组限制
const buriedCards = await db
  .select()
  .from(echoeCards)
  .where(sql`${echoeCards.queue} IN (-2, -3)`);
```

在多用户场景下，任何人调用此接口会解除**全库所有用户**的埋卡。

### 修复状态

**✅ 已修复（短期方案）**

`unburyAtDayBoundary` 已改为强制接收 `uid`，并仅解除当前用户归属的埋卡：

```typescript
const buriedCards = await db
  .selectDistinct({ id: echoeCards.id, type: echoeCards.type })
  .from(echoeCards)
  .innerJoin(echoeRevlog, and(eq(echoeRevlog.cid, echoeCards.id), eq(echoeRevlog.uid, uid)))
  .where(sql`${echoeCards.queue} IN (-2, -3)`);
```

同时增加了 `uid` 空值保护：缺少 `uid` 时直接返回 `0` 并记录告警日志，避免再次触发“全库解埋”。

调用方也已补齐：服务启动时注册 `studyUnburyCron`（默认 `5 0 * * *`，按 `LOCALE_TIMEZONE` 执行），并在每次触发时遍历活跃用户调用 `unburyAtDayBoundary(uid)`。

---

## F6：前端 `undo()` 不传 `reviewId`，多 tab 下会撤销错误的 revlog（P2）

### 问题分析

**位置**：`apps/web/src/services/echoe-study.service.ts` `undo()` / `apps/web/src/api/echoe.ts` `undoReview()`

`UndoEntry` 接口定义了 `reviewId?: number`，但：

1. `submitReview` 调用后 API 响应（`ReviewResultDto`）未返回 `reviewId`，导致 `undoStack.push` 不携带 `reviewId`
2. `undoReview()` API 调用不传参数，后端靠 `orderBy: [desc(revlog.id)]` 取最新一条

在两个标签页同时学习时，`undo` 会撤销的是数据库里**最新**那条 revlog，而不是当前 session 最后一条，语义不正确。

### 修复状态

**✅ 已修复**

1. 后端 `ReviewResultDto` 新增 `reviewId?: number` 字段
2. 后端 `submitReview` 在写入 revlog 后返回 `reviewId`
3. 前端 `submitReview` 在 API 成功后将 `reviewId` 存入 `undoStack`
4. 前端 `undo()` 调用 `apiUndoReview(entry.reviewId)`，后端按精确 ID 定位 revlog
5. 若 `entry.reviewId` 为空，前端提示用户无法可靠撤销，避免误操作

---

## F7：`findCardsBySearch` 中 `is:learning` 映射逻辑错误（P2）

### 问题分析

**位置**：`apps/server/src/services/echoe-deck.service.ts` `findCardsBySearch` 方法第 966-971 行

```typescript
} else if (term === 'is:new' || term === 'is:learning') {
  // ❌ is:learning 被映射到 queue=0（新卡）
  conditions.push(eq(echoeCards.queue, 0));
} else if (term === 'is:learn' || term === 'is:learning') {
  // ❌ is:learning 永远不会到达这里（被上面的分支捕获）
  conditions.push(sql`${echoeCards.queue} IN (1, 3)`);
}
```

`is:learning` 被第一个 `else if` 捕获并错误地映射到新卡（`queue=0`），而 Anki 中 `is:learning` 应对应 `queue IN (1, 3)`（Learning/Relearning 状态）。

### 修复方案

```typescript
} else if (term === 'is:new') {
  conditions.push(eq(echoeCards.queue, 0));
} else if (term === 'is:learn' || term === 'is:learning') {
  conditions.push(sql`${echoeCards.queue} IN (1, 3)`);
}
```

**修复状态**：✅ 已修复

---

## F8：`getForecast` 把 Learning 卡的 `due` 毫秒值当天数处理（P2）

### 问题分析

**位置**：`apps/server/src/services/echoe-stats.service.ts` `getForecast` 方法第 266-274 行

```typescript
// 当前实现
const dueDay = Number(card.due);              // Learning 卡 due 是毫秒，约 1.7e12
const todayTimestamp = Math.floor(today.getTime() / 86400000); // ≈ 20000（天数）
const daysUntilDue = dueDay - todayTimestamp;  // ≈ 1.7e12，远超 days=30
// 结果：Learning 卡全部被过滤掉，预测图中缺失 Learning 阶段数据
```

同时，即使对 Review 卡（`queue=2`），`due` 字段也已统一为毫秒时间戳（见 F1），而此处仍按天数处理，`daysUntilDue` 同样计算错误。

### 修复方案

统一将 `due` 字段转换为天数进行计算：

```typescript
for (const card of cards) {
  let dueDayNumber: number;

  if (card.queue === 2) {
    // Review 卡：due 是毫秒时间戳，转换为天数
    dueDayNumber = Math.floor(Number(card.due) / 86400000);
  } else {
    // Learning/Relearning 卡：due 是毫秒时间戳，同样转换
    dueDayNumber = Math.floor(Number(card.due) / 86400000);
  }

  const daysUntilDue = dueDayNumber - todayTimestamp;
  // ...
}
```

**修复状态**：✅ 已修复（当前实现已正确使用毫秒时间戳计算）

---

## 修复优先级建议

1. **P0 立即修复**：F1（`due` 语义双轨制，`reviewCount` 完全失效，影响所有统计展示）
2. **P1 本迭代修复**：
   - F2（删除 D4 死代码，消除潜在误用）✅ 已修复
   - F3（`getSchedulingOptions` 接口契约不完整）✅ 已修复（误报）
3. **P2 后续迭代**：F4 / F5 / F6 / F7 / F8

---

## 附：`due` 字段语义说明（供后续维护参考）

本项目 `due` 字段**统一使用毫秒时间戳**（`Date.now()` 级别，约 `1.7e12`），适用于所有卡片状态（New / Learning / Relearning / Review）。

不应使用天数（`Math.floor(Date.now() / 86400000)`，约 `20000`）进行 `due` 字段的比较，Anki 原始设计中 Review 卡用天数的语义在本项目已被毫秒语义替代。
