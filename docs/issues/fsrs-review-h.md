# FSRS 审查报告（2026-03-14 /arch）

> 本文档为 `/arch` 指令输出的独立问题清单，重点覆盖：架构一致性、FSRS 流程一致性、冗余代码。

## 问题概览

| 编号 | 问题 | 优先级 | 影响范围 |
|------|------|--------|----------|
| D1 | `unbury` 定时任务存在跨用户解埋风险（缺少卡片归属过滤） | P0 | 多租户数据隔离、学习队列正确性 |
| D2 | `forget` 链路分叉：批量重置未走 FSRS 重置路径 | P0 | FSRS 状态一致性、学习行为可预测性 |
| D3 | `unsuspend/unbury` 未覆盖 `type=3`（Relearning）恢复 | P1 | 重学卡恢复准确性 |
| D4 | `unsuspend/unbury` 队列恢复逻辑重复实现 | P2 | 维护成本、后续修复漏改风险 |

## D1：`unbury` 定时任务存在跨用户解埋风险（P0）

**问题**
- `apps/server/src/services/echoe-study.service.ts` 的 `unburyAtDayBoundary(uid)` 在查询待解埋卡片时，未显式限制 `echoeCards.uid = uid`。
- 当前条件包含 `isNull(echoeRevlog.cid)` 分支，会把“无 revlog 的 buried 卡”纳入结果；在缺少卡片归属过滤时，存在跨用户误解埋窗口。

**影响**
- 破坏多租户隔离边界，可能将其他用户卡片错误恢复到队列。
- 学习队列与统计口径出现不可解释偏差，排障成本高。

**修复建议**
- 在 `buriedCards` 查询条件中增加 `eq(echoeCards.uid, uid)`。
- 保留 `LEFT JOIN + isNull(revlog.cid)` 逻辑以覆盖“从未复习即被埋”的卡片，但必须在 uid 边界内生效。
- 为该路径补充多用户隔离回归测试（至少两用户数据集）。

## D2：`forget` 链路分叉导致 FSRS 状态不一致（P0）

**问题**
- 学习页 `POST /api/v1/study/forget` 走 `EchoeStudyService.forgetCards()`，通过 `FSRSService.forgetCard()` 重置，能同步写回 `type/stability/difficulty/lastReview`。
- 批量入口 `POST /api/v1/cards/bulk` 的 `action='forget'` 走 `EchoeNoteService.bulkCardOperation()`，仅重置 `queue/due/ivl/factor/reps/lapses/left`，未处理 FSRS 核心字段。
- 前端 `apps/web/src/pages/cards/browser.tsx` 的批量重置调用的是 `bulkCardOperation(action='forget')`，因此会触发不一致路径。

**影响**
- 同样是“重置为新卡”，不同入口得到不同数据状态。
- 可能出现“队列是新卡，但仍保留历史 FSRS 记忆”的状态污染，影响后续调度与统计。

**修复建议**
- 将批量 `forget` 收敛到统一重置实现（复用 `EchoeStudyService.forgetCards()` 或下沉公共 reset 方法）。
- 统一重置字段：`type/queue/due/ivl/factor/reps/lapses/left/stability/difficulty/lastReview`。
- 增加跨入口一致性测试：`study/forget` 与 `cards/bulk forget` 的最终卡片快照应等价。

## D3：`unsuspend/unbury` 未覆盖 Relearning（P1）

**问题**
- `apps/server/src/services/echoe-note.service.ts` 在 `unsuspend` 与 `unbury` 中，仅按 `type=0/1/2` 恢复 `queue`，遗漏 `type=3`（Relearning）。

**影响**
- Relearning 卡片可能未被正确恢复，但接口仍返回成功计数，造成“操作成功但状态异常”的体验问题。

**修复建议**
- 增加 `type=3 -> queue=3` 的恢复分支。
- 对未知 `type` 给出安全回退策略并记录 warn 日志。
- 增加 `type=3` 的单测覆盖。

## D4：`unsuspend/unbury` 恢复逻辑重复实现（P2）

**问题**
- `EchoeNoteService.bulkCardOperation()` 中 `unsuspend` 与 `unbury` 两个分支包含大段重复的“按 type 分组恢复 queue”逻辑。

**影响**
- 后续修复容易发生漏改（例如 D3 这类缺陷会在两处重复出现）。

**修复建议**
- 抽取统一的 `restoreQueueByCardType` 私有方法，供 `unsuspend/unbury` 复用。
- 在方法级别补充单测，锁定各 `type` 到 `queue` 的映射语义。

## 本轮优先级建议

1. **P0 立即修复**：D1（多租户隔离风险）。
2. **P0 立即修复**：D2（FSRS 重置链路不一致）。
3. **P1 本迭代修复**：D3（Relearning 恢复遗漏）。
4. **P2 收尾治理**：D4（重复逻辑收敛）。
