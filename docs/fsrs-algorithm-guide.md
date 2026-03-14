# FSRS 算法指南

> 本文档说明什么是 FSRS、算法工作原理，以及 ts-fsrs 在 Echoe 中的能力与使用方式。

---

## 一、什么是 FSRS？

**FSRS（Free Spaced Repetition Scheduler）** 是一种开源的间隔重复调度算法，是目前最先进的记忆科学算法之一，被 Anki 等主流闪卡应用广泛采用（当前版本：FSRS v6）。

**间隔重复（Spaced Repetition）** 的核心思想是：根据遗忘曲线，在你即将遗忘某个知识点之前，恰好安排一次复习。FSRS 用数学模型精准预测这个时机，从而以最少的复习次数维持最高的记忆保留率。

---

## 二、核心概念

### 三个核心状态量

| 字段                         | 含义                                                                      |
| ---------------------------- | ------------------------------------------------------------------------- |
| `stability`（稳定性）        | 记忆能维持多久（单位：天）。stability=10 意味着 10 天后记忆保留率约为 90% |
| `difficulty`（难度）         | 卡片内在难度，ts-fsrs 原生量纲（典型值约 1~10，非 0~1 概率值）            |
| `retrievability`（可提取率） | 当前时刻回忆起该内容的概率，公式见下                                      |

### 记忆可提取率公式

```
R(t, S) = (1 + t / (9 × S))^(-1)
```

- `t` = 距上次复习的天数
- `S` = 当前稳定性（stability）
- 当 `t = S` 时，`R ≈ 0.9`（即保留率恰好为目标的 90%）
- 新卡（从未复习）：`R = null`（不适用）
- 注意：`ts-fsrs` 的通用遗忘曲线实现为 `R(t,S) = (1 + FACTOR × t / (9 × S))^DECAY`；Echoe 当前跨服务统计口径使用本节简化式

### 卡片的四种状态（State）

```
New → Learning → Review
                   ↓         ↑
               Relearning ───┘
```

| 状态           | 含义                                                   |
| -------------- | ------------------------------------------------------ |
| **New**        | 从未学过的新卡片                                       |
| **Learning**   | 正在初次学习阶段（走学习步骤，如 1分钟、10分钟后复习） |
| **Review**     | 进入长期记忆复习队列                                   |
| **Relearning** | 复习时遗忘（评 Again），进入重学阶段                   |

### 四种评分（Rating）

| 评分          | 含义               |
| ------------- | ------------------ |
| **1 - Again** | 完全忘记，重新学习 |
| **2 - Hard**  | 记起来但很费劲     |
| **3 - Good**  | 正常记得           |
| **4 - Easy**  | 非常轻松记得       |

---

## 三、FSRS 算法工作原理

### 调度流程

每次用户对一张卡片评分后，FSRS 会更新卡片的记忆参数，并计算下次复习时间：

```
用户评分
    ↓
输入: card(stability, difficulty, elapsed_days, state) + rating
    ↓
FSRS 数学模型计算（含 21 个权重参数 w0~w20）
    ↓
输出: 新的 stability / difficulty / scheduledDays（下次复习间隔）
```

### 学习阶段步骤（Learning Steps）

新卡片不会直接进入长期复习队列，而是先经历短期"学习步骤"：

- 默认学习步骤：`[1m, 10m]` → 第一次学后 1 分钟内再复习，再 10 分钟后，通过后进入 Review
- 遗忘后重学步骤：`[10m]` → Again 后 10 分钟复习

### FSRS-6 参数优化

FSRS 包含 **21 个可优化的权重参数**（w0~w20，可由 `default_w.length` 验证），可通过历史学习数据拟合实现个性化调度。
当前 Echoe 运行时仅使用 `ts-fsrs` 调度与牌组配置（`requestRetention`、`learningSteps` 等），仓库内尚未接入自动参数优化器。

---

## 四、ts-fsrs 的能力

`ts-fsrs` 是 FSRS 算法的 TypeScript 实现，核心类型与导出可在
`apps/server/node_modules/ts-fsrs/dist/index.d.ts` 中查看。
Echoe 当前服务端依赖版本为 `ts-fsrs@5.2.3`。

### 1) 枚举与基础类型

| 类型 | 定义 | 说明 |
| --- | --- | --- |
| `State` | `0..3` | `New / Learning / Review / Relearning` |
| `Rating` | `0..4` | `Manual / Again / Hard / Good / Easy` |
| `Grade` | `1..4` | 排除 `Manual` 的可评分等级（Again~Easy） |
| `StateType` | `'New' \| ...` | 状态字符串联合类型 |
| `RatingType` | `'Manual' \| ...` | 评分字符串联合类型 |
| `StepUnit` | `` `${number}${'m'|'h'|'d'}` `` | 学习步长 token，例如 `1m`、`12h`、`3d` |
| `Steps` | `StepUnit[]` | 学习/重学步骤集合 |

### 2) 核心数据结构

```typescript
type Card = {
  due: Date;
  stability: number;
  difficulty: number;
  elapsed_days: number; // deprecated: 6.0.0 将移除
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: State;
  last_review?: Date;
};

type ReviewLog = {
  rating: Rating;
  state: State;
  due: Date;
  stability: number;
  difficulty: number;
  elapsed_days: number; // deprecated: 6.0.0 将移除
  last_elapsed_days: number; // deprecated: 6.0.0 将移除
  scheduled_days: number;
  learning_steps: number;
  review: Date;
};

type RecordLogItem = { card: Card; log: ReviewLog };
type RecordLog = { [K in Grade]: RecordLogItem };
```

补充：`repeat()` 返回 `IPreview`，它既支持 `preview[Rating.Good]` 按评分索引，也支持 `for...of` 迭代。

### 3) 输入兼容类型

- `DateInput = Date | number | string`
- `CardInput`：`Card` 的宽松输入版，允许 `state` 传字符串/枚举，`due` 与 `last_review` 传 `DateInput`
- `ReviewLogInput`：`ReviewLog` 的宽松输入版，适合 `rollback` 等场景
- `FSRSHistory`：`reschedule` 使用的历史记录类型（支持 `Manual` 与 `Grade` 两种历史形态）

### 4) 参数模型（`FSRSParameters`）

| 字段 | 说明 |
| --- | --- |
| `request_retention` | 目标保留率 |
| `maximum_interval` | 最大间隔（天） |
| `w` | 权重数组 |
| `enable_fuzz` | 是否启用 interval fuzz |
| `enable_short_term` | 是否启用短期学习步策略 |
| `learning_steps` | 学习步长（`Steps`） |
| `relearning_steps` | 重学步长（`Steps`） |

`index.d.ts` 导出的默认常量（库默认值）：

- `default_request_retention = 0.9`
- `default_maximum_interval = 36500`
- `default_enable_fuzz = false`
- `default_enable_short_term = true`

说明：以上为库默认值；Echoe 运行时默认配置覆盖为 `enableFuzz=true`、`enableShortTerm=false`。

### 5) `fsrs()` 实例方法（`IFSRS`）

| 方法 | 作用 |
| --- | --- |
| `useStrategy(mode, handler)` | 注入策略（`Scheduler/LearningSteps/Seed`） |
| `clearStrategy(mode?)` | 清除策略 |
| `repeat(card, now)` | 生成 Again/Hard/Good/Easy 四档预排期 |
| `next(card, now, grade)` | 直接计算指定评分后的单条结果 |
| `get_retrievability(card, now?, format?)` | 取可提取率（数值或格式化字符串） |
| `rollback(card, log)` | 基于 `ReviewLog` 回滚卡片状态 |
| `forget(card, now, reset_count?)` | 触发忘记流程，返回重置后的 `RecordLogItem` |
| `reschedule(card, reviews?, options?)` | 基于历史复习记录批量重排 |

说明：`repeat/next/rollback/forget` 等方法都提供 `afterHandler` 重载，可把库返回值即时转换成业务自定义结构。

`reschedule` 还支持细粒度选项：`recordLogHandler`、`reviewsOrderBy`、`skipManual`、`update_memory_state`、`now`、`first_card`。

当前 Echoe 主链路实际接入的是 `repeat` / `next` / `forget`；`rollback` 与 `reschedule` 暂未接入业务调用路径。

### 6) 低层/工具导出（常用）

- 算法层：`FSRSAlgorithm`、`computeDecayFactor()`、`forgetting_curve()`
- 参数工具：`generatorParameters()`、`checkParameters()`、`migrateParameters()`、`clipParameters()`
- 类型转换：`TypeConvert.card/rating/state/time/review_log`
- 日期与展示：`formatDate()`、`date_scheduler()`、`date_diff()`、`show_diff_message()`
- 策略相关：`StrategyMode`、`BasicLearningStepsStrategy`、`GenSeedStrategyWithCardId()`

### 7) 使用示例（与 d.ts 签名一致）

```typescript
import { createEmptyCard, fsrs, generatorParameters, Rating } from 'ts-fsrs';

const params = generatorParameters({
  request_retention: 0.9,
  enable_fuzz: true,
  enable_short_term: false,
  learning_steps: ['1m', '10m'],
  relearning_steps: ['10m'],
});

const f = fsrs(params);
const card = createEmptyCard(new Date('2022-02-01T10:00:00.000Z'));
const now = new Date('2022-02-02T10:00:00.000Z');

const preview = f.repeat(card, now);
const goodResult = preview[Rating.Good];

const nextCard = goodResult.card;
const reviewLog = goodResult.log;

const direct = f.next(card, now, Rating.Good);
const retrievability = f.get_retrievability(direct.card, now, false);
```

### 8) 升级到 6.x 的兼容提醒

以下 API/字段在 `index.d.ts` 标记为 deprecated（计划 6.0.0 移除）：

- `Card.elapsed_days`
- `ReviewLog.elapsed_days`
- `ReviewLog.last_elapsed_days`
- `Date.prototype.scheduler/diff/format/dueFormat`
- `fixDate()`、`fixState()`、`fixRating()`（建议改用 `TypeConvert.*`）

因此业务侧建议逐步减少对上述字段/函数的新依赖。

---

## 五、Echoe 中的 FSRS 配置参数

Echoe 通过 `FSRSConfig` 支持按牌组配置 FSRS 行为，默认值定义在 `apps/server/src/services/fsrs-default-config.ts`：

| 参数               | 默认值      | 含义                                |
| ------------------ | ----------- | ----------------------------------- |
| `requestRetention` | `0.9`       | 目标保留率（90%），值越高复习越频繁 |
| `maxInterval`      | `36500` 天  | 最大复习间隔（100 年上限）          |
| `enableFuzz`       | `true`      | 对间隔添加随机抖动，避免扎堆复习    |
| `enableShortTerm`  | `false`     | 是否启用短期调度（同日内多次复习）  |
| `learningSteps`    | `[1m, 10m]` | 新卡学习步骤（1分钟后、10分钟后）   |
| `relearningSteps`  | `[10m]`     | 重学步骤（Again 后 10 分钟复习）    |

- 配置解析优先级：`revConfig.fsrs` 子配置 > 历史兼容字段（`newConfig`/`revConfig`/`lapseConfig`）> 默认值。

---

## 六、Echoe 中的完整调度架构

### 提交评分链路

```
用户评分（study.tsx）
    ↓
EchoeStudyController.submitReview()
    ↓
EchoeStudyService.submitReview()
    ├── buildFSRSCardInput()       ← 构建 FSRS 输入
    │     ├── 新卡路径: createEmptyCard()（ts-fsrs 原生初始化）
    │     ├── 历史卡路径: 使用真实 stability/difficulty/lastReview
    │     └── legacy 兜底路径: 硬编码近似值（记录 warn 日志）
    ├── buildFsrsTimingContext()   ← 统一计算 elapsed_days（含边界保护）
    │     ├── 未来时间 clamp 到 now
    │     ├── 负数保护（clamp 到 0）
    │     └── 极端值上限（36500 天）
    └── FSRSService.scheduleCard() ← 调用 ts-fsrs 计算结果
            ↓
        更新卡片: due / ivl / factor / reps / lapses / left / type / queue / stability / difficulty / lastReview
        写入 revlog: ease / ivl / factor / type + pre* 快照（用于 undo）
```

### 获取调度预览链路

```
GET /api/v1/study/options
    ↓
EchoeStudyService.getOptions()
    ├── buildFSRSCardInput()          ← 同上，复用统一构建逻辑
    ├── FSRSService.getSchedulingOptions()  ← f.repeat()，返回 4 种评分预览
    └── calculateRetrievability()     ← 计算当前记忆可提取率
```

### Forget / Undo 链路（补充）

```
POST /api/v1/study/forget
    ↓
EchoeStudyService.forgetCards()
    └── FSRSService.forgetCard()      ← 重置为 New，并同步 factor/stability/difficulty/lastReview

POST /api/v1/study/undo
    ↓
EchoeStudyService.undo()
    └── 从 revlog 的 pre* 快照恢复卡片字段（含 FSRS 字段）
```

### Retrievability 统一计算

`apps/server/src/utils/fsrs-retrievability.ts` 是 retrievability 计算的单一事实源，当前由以下服务直接调用：

| 调用方                   | 用途                           |
| ------------------------ | ------------------------------ |
| `echoe-study.service.ts` | 学习页实时 retrievability 展示 |
| `echoe-deck.service.ts`  | 牌组列表掌握率聚合（SQL + TS） |

`echoe-stats.service.ts` 当前基于 `stability` 阈值做成熟度分桶，不直接调用该模块。

**新卡 retrievability 语义**：统一返回 `null`（不适用/未定义）；学习页不展示 retrievability 徽标，SQL 聚合时自动排除（不影响均值计算）。

---

## 七、关键注意事项

### difficulty 量纲

- ts-fsrs 的 `difficulty` **不是 0~1 概率值**，而是 ts-fsrs 原生量纲（典型值约 1~10，示例值 `2.11810397`）
- 所有 difficulty 的写入、导入回填均使用同一量纲，默认 legacy 兜底值为 `2.5`（对应 `factor/1000`）

### elapsed_days 计算

- 始终使用 `now - lastReview` 推导，禁止用 `ivl` 反推
- `lastReview` 存储的是 Unix 毫秒时间戳
- `stability = 0` 或 `lastReview = 0` 表示卡片未初始化，不是真实 FSRS 值

### retrievability 与 difficultCount 的阈值

- `R < 0.9` 等价于 `t > S`（elapsed_days > stability）
- 旧实现曾错误使用 `t > S × 0.111`，导致 difficult 卡数量虚高约 9 倍（已修复）

---

## 八、相关文件索引

| 文件                                                    | 说明                                                              |
| ------------------------------------------------------- | ----------------------------------------------------------------- |
| `apps/server/src/services/fsrs.service.ts`              | FSRS 核心封装（scheduleCard / getSchedulingOptions / forgetCard） |
| `apps/server/src/services/fsrs-default-config.ts`       | FSRS 默认配置单一事实源                                           |
| `apps/server/src/services/echoe-study.service.ts`       | 学习调度主链路（buildFSRSCardInput / submitReview / getOptions）  |
| `apps/server/src/utils/fsrs-retrievability.ts`          | Retrievability 统一计算模块                                       |
| `apps/server/src/services/echoe-deck.service.ts`        | 牌组掌握率聚合（averageRetrievability）                           |
| `apps/server/src/services/echoe-stats.service.ts`       | 统计成熟度分布（new/learning/young/mature）                       |
| `apps/server/src/__tests__/echoe-study.service.test.ts` | 调度链路单元测试（含时间边界场景）                                |
| `docs/issues/fsrs-refactor-plan.md`                     | FSRS 重构计划与问题追踪                                           |
| `docs/issues/fsrs-issues-technical-solutions.md`        | FSRS 各问题详细技术方案                                           |
