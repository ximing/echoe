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
    "newCount": 10,
    "learningCount": 5,
    "reviewCount": 20,
    "totalReviews": 150,
    "averageTime": 1200,
    "retention": 0.92
  }
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
      "newCount": 5,
      "reviewCount": 30,
      "totalTime": 1800,
      "retention": 0.95
    }
  ]
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
      "due": 25
    },
    {
      "date": "2024-01-03",
      "due": 18
    }
  ]
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
    "deck_xxx": {
      "new": 10,
      "learning": 5,
      "young": 20,
      "mature": 100
    }
  }
}
```
