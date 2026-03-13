# FSRS 重构计划（聚焦 Issue 2/3/5/6）

## 1. 背景

当前 FSRS 主链路已可用，但在“调度准确性、初始化策略、可观测性、可配置性”四个维度仍有改进空间。本文将以下四个问题收敛为可执行重构计划：

- ✅ 问题 2：`elapsed_days` 计算不准确（已修复，见 Phase P0-1）
- ⚠️ 问题 3：新卡片初始化值不够准确
- ✅ 问题 5：缺少 retrievability 的实时计算展示
- ❌ 问题 6：FSRS 配置参数未充分暴露

---

## 2. 重构目标

1. **调度准确性**：`submitReview` 与 `getOptions` 使用完全一致、可解释的 FSRS 输入。
2. **初始化正确性**：新卡不使用硬编码近似值作为主路径，优先交由 FSRS 原生初始化。
3. **实时可观测**：学习页与列表页可看到实时 retrievability（记忆可提取率）信息。
4. **配置可运营**：支持按牌组配置关键 FSRS 参数，并具备默认值与兼容回退。

---

## 3. 范围

### In Scope

- 后端调度链路：`apps/server/src/services/echoe-study.service.ts`
- FSRS 封装层：`apps/server/src/services/fsrs.service.ts`
- 统计与列表聚合：
  - `apps/server/src/services/echoe-stats.service.ts`
  - `apps/server/src/services/echoe-deck.service.ts`
- DTO 与 API：
  - `packages/dto/src/echoe.ts`
  - `apps/web/src/api/echoe.ts`
- 前端学习与卡片页展示：
  - `apps/web/src/services/echoe-study.service.ts`
  - `apps/web/src/pages/cards/study.tsx`
  - `apps/web/src/pages/cards/index.tsx`

### Out of Scope

- 更换算法实现（继续使用 `ts-fsrs`）
- 引入新调度算法（如 SM-17 等）
- 大规模历史学习数据重算

---

## 4. 分阶段重构计划

## Phase P0-1：修正 `elapsed_days` 计算口径（Issue 2）✅

### 目标

确保 FSRS 输入的时间语义统一，避免预估与真实提交结果偏差。

### 实施任务

- [x] 抽取统一函数 `buildFsrsTimingContext`，集中计算：
  - `elapsed_days`
  - `last_review`
  - 时间边界保护（未来时间、负数、极端值）
- [x] `submitReview` 与 `getOptions` 强制复用同一构建函数，禁止双份逻辑分叉。
- [x] 延迟复习场景（late review）统一策略：
  - 统一用 `now - last_review` 推导；
  - 不依赖 `ivl` 反推 elapsed。
- [ ] 为边界场景增加单测（跨天、跨时区、系统时间漂移、last_review=0）。

### 验收标准

- [x] 同一时刻、同一卡片：`/study/options` 与 `/study/review` 使用同一 FSRS 输入构建逻辑（允许毫秒级时间差）。
- [x] 不再出现 `elapsed_days` 由 `ivl` 兜底覆盖主路径。

---

## Phase P0-2：修正新卡初始化策略（Issue 3）✅

### 目标

避免把 `stability=1`、`difficulty=0.3` 作为新卡主输入，减少初始偏差。

### 实施任务

- [x] 在 `buildFSRSCardInput` 中区分“新卡初始化路径”和“历史卡片路径”：
  - 新卡：使用 FSRS 原生初始化能力（`createEmptyCard` 或等价方式）；
  - 历史卡：优先使用真实 `stability/difficulty/last_review`。
- [x] 对 legacy 卡片保留兼容分支，但明确为降级路径，并增加观测日志（比例监控）。
- [x] 保持数据库语义一致：`stability/difficulty/last_review = 0` 表示未初始化，不混入伪值。

### 验收标准

- [x] 新卡首次学习不再依赖硬编码初始化值作为主路径。
- legacy 分支命中率可被监控，且可逐步下降。

---

## Phase P1-1：增加 retrievability 实时展示（Issue 5）

### 目标

让用户和开发者能直观看到“当前记忆状态”，并与 FSRS 核心公式对齐。

### 实施任务

- 后端统一提供 retrievability 计算输出：
  - 学习队列接口附带当前卡片 retrievability；
  - deck 聚合继续输出 `averageRetrievability`，并补充空值约定（如无历史则 `null`）。
- 前端学习页展示：
  - 在 `study.tsx` 的答题区显示当前 retrievability；
  - 可选展示评分后预估变化（Again/Hard/Good/Easy 对应趋势）。
- 列表页展示：
  - 明确掌握率来源于 `averageRetrievability`，避免与 mature ratio 混淆。
- 失败回退策略：
  - 接口异常时展示 `--`，不进行本地启发式伪计算。

### 验收标准

- 学习页可实时看到 retrievability 数值或等级文案。
- 卡片列表掌握率与后端 `averageRetrievability` 一致。

---

## Phase P1-2：暴露 FSRS 配置参数（Issue 6）

### 目标

支持按牌组调优记忆策略（激进/平衡/保守），并保持默认行为稳定。

### 实施任务

- 定义可配置参数白名单（首批）：
  - `requestRetention`
  - `maxInterval`
  - `enableFuzz`
  - `enableShortTerm`
  - `learningSteps`
  - `relearningSteps`
- 数据层与 DTO 扩展：
  - 复用 `echoe_deck_config` 的 JSON 配置字段，增加 FSRS 子配置结构；
  - DTO 增加对应类型定义与校验。
- 服务端配置构建改造：
  - `getFSRSConfig` 引入 schema 校验、默认值回退、非法值兜底。
- 前端配置页支持：
  - 在 deck config 页提供基础参数编辑；
  - 提供“恢复默认”与参数说明。

### 验收标准

- 用户修改后可即时影响 `/study/options` 结果。
- 配置缺失或非法时，系统稳定回退到默认参数。

---

## 5. 技术改造清单（按模块）

- `apps/server/src/services/echoe-study.service.ts`
  - 抽取并统一 FSRS 输入构建
  - 调整新卡初始化路径
- `apps/server/src/services/fsrs.service.ts`
  - 强化配置参数映射与默认值策略
- `apps/server/src/services/echoe-stats.service.ts`
  - 统一 retrievability 计算入口（避免重复实现）
- `apps/server/src/services/echoe-deck.service.ts`
  - 聚合口径与 retrievability 保持一致
- `packages/dto/src/echoe.ts`
  - 增加 retrievability 展示字段与 FSRS 配置 DTO
- `apps/web/src/services/echoe-study.service.ts`
  - 消费实时 retrievability 与配置化预估结果
- `apps/web/src/pages/cards/study.tsx`
  - 增加学习态 retrievability 展示
- `apps/web/src/pages/cards/index.tsx`
  - 明确掌握率数据来源与展示文案

---

## 6. 测试与验证计划

### 单元测试

- `fsrs.service.test.ts` 补充：
  - 新卡初始化路径断言
  - `requestRetention/maxInterval/enableFuzz` 配置生效断言
- `echoe-study.service` 相关测试补充：
  - `elapsed_days` 边界场景
  - options/review 一致性

### 集成测试

- 接口链路：
  - `GET /api/v1/study/options`
  - `POST /api/v1/study/review`
  - `GET /api/v1/decks`
- 验证点：同卡同时间点的一致性、配置变更后结果变化、异常回退。

### 前端验证

- 学习页：加载中/成功/失败三态展示
- 列表页：掌握率与后端值一致
- 配置页：修改参数后预估间隔即时变化

---

## 7. 风险与回滚

### 主要风险

- 配置开放后，异常参数导致调度波动。
- 新旧路径切换阶段出现口径不一致。
- retrievability 展示引发用户对“到期/未到期”理解偏差。

### 缓解策略

- 参数 schema 校验 + 强制范围限制 + 默认值回退。
- 对核心链路增加结构化日志（仅后端）并观察异常比例。
- 分阶段灰度：先后端统一口径，再开放前端配置入口。

### 回滚策略

- 保留默认参数硬回退开关。
- retrievability 展示可通过前端特性开关快速隐藏。

---

## 8. 里程碑建议

- M1（P0 完成）：Issue 2 + 3 落地，调度输入正确性稳定。
- M2（P1 第一阶段）：Issue 5 落地，学习页/列表页可观测。
- M3（P1 第二阶段）：Issue 6 落地，参数可配置并可控发布。

---

## 9. 交付物 Checklist

- [x] 统一 FSRS 输入构建函数（后端）
- [x] 新卡初始化路径改造（后端）
- [ ] retrievability DTO/API 与前端展示
- [ ] FSRS 配置 DTO/API 与前端配置页
- [ ] 单元测试与集成测试补齐
- [ ] 回归验证记录（options/review/decks 三口径）

---

## 10. 新增审查问题清单（2026-03-13）

以下问题来自当前代码审查，建议作为下一轮修复项：

1. **`forgetCards` 未重置 FSRS 核心字段（P0）**  
   `apps/server/src/services/echoe-study.service.ts` 的 `forgetCards()` 仅重置了 `ivl/reps/lapses/type/queue`，未重置 `stability/difficulty/lastReview`，会导致“忘记后”卡片仍带旧记忆状态。

2. **retrievability 计算入口分散，存在口径漂移风险（P1）**  
   目前在 `echoe-study.service.ts`、`echoe-stats.service.ts`、`echoe-deck.service.ts(SQL)` 三处分别实现/内联公式，后续维护容易出现语义不一致。

3. **新卡 retrievability 语义不一致（P1）**  
   `echoe-study.service.ts` 对新卡返回 `null`，而 `echoe-stats.service.ts` 中逻辑为返回 `1`（100%），同一概念在不同接口语义不统一。

4. **`echoe-stats.service.ts` 存在未使用的 retrievability 方法（P2）**  
   `calculateRetrievability()` 已定义但在该服务主流程中未实际使用，属于冗余实现，建议删除或统一接入。

5. **边界单测仍不完整（P2）**  
   已覆盖 `last_review=0`、未来时间、极端漂移，但仍缺“跨天边界/跨时区”用例，和计划中 P0-1 的单测目标尚有差距。
