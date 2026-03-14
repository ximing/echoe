# FSRS 第八轮审查问题（G 系列）

> 审查日期：2026-03-14
> 审查范围：`echoe-study.service.ts` / `echoe-study.controller.ts` / `app.ts`

---

## 问题概览

| 编号 | 问题 | 严重级别 | 类别 |
| --- | --- | --- | --- |
| G1 | 被埋卡存在“永久埋卡”风险：无 revlog 的卡不会被次日解埋 | P0 | FSRS规范 |
| G2 | 服务重启会提前解埋，破坏“埋到次日”的语义 | P1 | FSRS规范 |
| G3 | `undo` 对 legacy revlog（`uid` 为空）放行，存在跨用户撤销窗口 | P1 | 越权 |
| G4 | `bury/forget` 操作未做资源归属校验，接口层未注入当前用户 | P1 | 越权/架构一致性 |
| G5 | 关键写路径非事务化，可能出现“卡状态已改但 revlog 未落盘”等分裂状态 | P2 | 架构一致性 |

---

## 详细分析

### G1：被埋卡存在“永久埋卡”风险（P0）

**问题描述**：
在 `unburyAtDayBoundary` 中，为了限制只解埋当前用户的卡片，使用了 `innerJoin(echoeRevlog)` 来过滤归属：

```typescript
// apps/server/src/services/echoe-study.service.ts
const buriedCards = await db
  .selectDistinct({
    id: echoeCards.id,
    type: echoeCards.type,
  })
  .from(echoeCards)
  .innerJoin(echoeRevlog, and(eq(echoeRevlog.cid, echoeCards.id), eq(echoeRevlog.uid, uid)))
  .where(sql`${echoeCards.queue} IN (-2, -3)`);
```

**风险**：
如果一张卡片是新卡（从未被复习过），或者因为 `buryRelated`（复习某张卡时自动埋掉它的 sibling 卡）被埋，且这张卡本身**从未产生过 revlog**，那么它将永远无法通过这个 `innerJoin` 查询出来。
结果是：这些卡片会永久停留在 `queue = -2` 或 `-3` 的状态，永远不会被解埋。

---

### G2：服务重启会提前解埋（P1）

**问题描述**：
在 `app.ts` 中，除了注册 cron 任务外，还在启动时无条件执行了一次解埋：

```typescript
// apps/server/src/app.ts
const studyUnburyTask = cron.schedule(
  studyUnburyCron,
  () => {
    void runStudyUnburyJob('schedule');
  },
  { timezone: config.locale.timezone }
);

// Catch-up run for deployments/restarts that cross day boundary.
await runStudyUnburyJob('startup');
```

**风险**：
虽然注释写着是为了“Catch-up run for deployments/restarts that cross day boundary”，但实际上它没有判断是否真的跨了天。如果服务在白天（比如下午 2 点）重启，它会立刻把用户刚刚埋掉的卡片全部解埋，破坏了 FSRS/Anki 中“埋卡直到次日”的语义。

---

### G3：`undo` 对 legacy revlog 放行存在越权风险（P1）

**问题描述**：
在 `undo` 方法中，为了兼容旧数据（`uid` 为空），放行了所有权校验：

```typescript
// apps/server/src/services/echoe-study.service.ts
// Verify ownership: the revlog uid must match the current user.
// For legacy records without uid, we allow the undo to proceed (backward compatibility).
if (lastReview.uid !== null && lastReview.uid !== undefined && lastReview.uid !== uid) {
  // ... 拦截
}
```

**风险**：
如果系统中有大量旧的 revlog（`uid` 为空），任何用户只要猜到或遍历 `reviewId`，就可以调用 `undo` 接口撤销这些记录，导致其他用户的复习进度被恶意篡改。

---

### G4：`bury/forget` 操作未做资源归属校验（P1）

**问题描述**：
在 `EchoeStudyController` 中，`bury` 和 `forget` 接口没有注入 `@CurrentUser()`，在 Service 层也没有校验这些卡片是否属于当前操作的用户：

```typescript
// apps/server/src/controllers/v1/echoe-study.controller.ts
@Post('/bury')
async buryCards(@Body() dto: BuryCardsDto) {
  // 没有获取 userDto，直接透传
  await this.echoeStudyService.buryCards(dto.cardIds, dto.mode || 'card');
}

@Post('/forget')
async forgetCards(@Body() dto: ForgetCardsDto) {
  // 没有获取 userDto，直接透传
  await this.echoeStudyService.forgetCards(dto.cardIds);
}
```

```typescript
// apps/server/src/services/echoe-study.service.ts
async buryCards(cardIds: number[], mode: 'card' | 'note' = 'card'): Promise<void> {
  // 直接 update，没有校验卡片归属
  await db
    .update(echoeCards)
    .set({ queue: -2, mod: now, usn: -1 })
    .where(sql`${echoeCards.id} IN (${sql.join(cardIds.map(id => sql`${id}`), sql`, `)})`);
}
```

**风险**：
恶意用户可以通过构造请求，传入其他用户的 `cardId`，从而随意埋掉或重置其他用户的卡片。

---

### G5：关键写路径非事务化（P2）

**问题描述**：
在 `submitReview` 和 `undo` 等核心方法中，对 `echoeCards` 和 `echoeRevlog` 的更新/插入是分离的，没有包裹在数据库事务中：

```typescript
// apps/server/src/services/echoe-study.service.ts (submitReview)
await db
  .update(echoeCards)
  .set({ ... })
  .where(eq(echoeCards.id, dto.cardId));

// 如果这里发生异常（如进程崩溃、网络中断）

await db.insert(echoeRevlog).values({ ... });
```

**风险**：
如果在更新卡片状态后、写入 revlog 前发生错误，会导致数据不一致（卡片状态变了，但没有复习记录，且无法 undo）。虽然概率较低，但在核心调度链路上缺乏事务保护是不严谨的架构设计。
