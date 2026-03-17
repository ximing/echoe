# Stats API

学习统计数据

## Base URL

`/api/v1/stats`

## Endpoints

### Get Today Stats - 获取今日学习统计

```http
GET /api/v1/stats/today
```

**查询参数**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| deckId | string | 否 | 卡组ID |

**响应示例**

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "studied": 10,
    "timeSpent": 150000,
    "again": 2,
    "hard": 3,
    "good": 4,
    "easy": 1
  }
}
```

**TypeScript 类型定义**

```typescript
interface StudyTodayStatsDto {
  /** Number of cards studied today */
  studied: number;
  /** Total time spent in milliseconds */
  timeSpent: number;
  /** Number of Again ratings */
  again: number;
  /** Number of Hard ratings */
  hard: number;
  /** Number of Good ratings */
  good: number;
  /** Number of Easy ratings */
  easy: number;
}
```

---

### Get History - 获取学习历史

```http
GET /api/v1/stats/history
```

**查询参数**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| deckId | string | 否 | 卡组ID |
| days | number | 否 | 查询天数（默认 30，最大 365） |

**响应示例**

```json
{
  "code": 0,
  "msg": "success",
  "data": [
    {
      "date": "2024-01-01",
      "count": 30,
      "timeSpent": 1800000
    }
  ]
}
```

**TypeScript 类型定义**

```typescript
interface StudyHistoryDayDto {
  /** Date string (YYYY-MM-DD) */
  date: string;
  /** Number of reviews */
  count: number;
  /** Total time spent in milliseconds */
  timeSpent: number;
}
```

---

### Get Maturity - 获取卡片成熟度分布

```http
GET /api/v1/stats/maturity
```

**查询参数**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| deckId | string | 否 | 卡组ID |

**响应示例**

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "new": 10,
    "learning": 5,
    "young": 20,
    "mature": 100
  }
}
```

**TypeScript 类型定义**

```typescript
interface CardMaturityDto {
  /** Number of new cards (stability = 0 or never reviewed) */
  new: number;
  /** Number of learning cards (stability < 21 days) */
  learning: number;
  /** Number of young cards (stability 21-89 days) */
  young: number;
  /** Number of mature cards (stability >= 90 days) */
  mature: number;
}
```

---

### Get Forecast - 获取未来待复习预测

```http
GET /api/v1/stats/forecast
```

**查询参数**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| deckId | string | 否 | 卡组ID |
| days | number | 否 | 预测天数（默认 30，最大 365） |

**响应示例**

```json
{
  "code": 0,
  "msg": "success",
  "data": [
    {
      "date": "2024-01-02",
      "dueCount": 25
    },
    {
      "date": "2024-01-03",
      "dueCount": 18
    }
  ]
}
```

**TypeScript 类型定义**

```typescript
interface ForecastDayDto {
  /** Date string (YYYY-MM-DD) */
  date: string;
  /** Number of cards due on this date */
  dueCount: number;
}
```

---

### Get Streak - 获取连续学习天数

```http
GET /api/v1/stats/streak
```

**响应示例**

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "streak": 15
  }
}
```

**TypeScript 类型定义**

```typescript
interface StreakResponseDto {
  /** Consecutive days of study */
  streak: number;
}
```

---

### Get Maturity Batch - 批量获取各卡组成熟度

```http
GET /api/v1/stats/maturity/batch
```

**响应示例**

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "decks": [
      {
        "deckId": "deck_xxx",
        "new": 10,
        "learning": 5,
        "young": 20,
        "mature": 100
      }
    ]
  }
}
```

**TypeScript 类型定义**

```typescript
interface MaturityBatchResponseDto {
  decks: Array<{
    /** Deck ID */
    deckId: string;
    /** Number of new cards */
    new: number;
    /** Number of learning cards */
    learning: number;
    /** Number of young cards */
    young: number;
    /** Number of mature cards */
    mature: number;
  }>;
}
```
