# Study API

学习与复习

## Base URL

`/api/v1/study`

## Endpoints

### Get Queue - 获取学习队列

```http
GET /api/v1/study/queue
```

**查询参数**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| deckId | string | 否 | 卡组ID |
| limit | number | 否 | 返回数量限制 |
| reviewAhead | number | 否 | 提前复习时间（分钟） |
| preview | boolean | 否 | 预览模式（不记录学习状态） |

**响应示例**

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "cards": [
      {
        "id": "card_xxx",
        "note": {...},
        "due": "2024-01-01T00:00:00Z",
        "status": "new"
      }
    ]
  }
}
```

**TypeScript 类型定义**

```typescript
interface StudyQueueParams {
  deckId?: string;
  limit?: number;
  reviewAhead?: number;
  preview?: boolean;
}

interface StudyQueueItemDto {
  cardId: string;
  noteId: string;
  deckId: string;
  cardType: number;
  queue: number;
  due: number;
  interval: number;
  factor: number;
  reps: number;
  lapses: number;
  left: number;
  notetypeId: string;
  front: string;
  back: string;
  templateOrd: number;
  notetypeType: number;
  clozeOrdinal: number;
  retrievability: number | null;
}
```

---

### Submit Review - 提交复习结果

```http
POST /api/v1/study/review
```

**请求体**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| cardId | string | 是 | 卡片ID |
| rating | number | 是 | 评分（1-4） |
| timeTaken | number | 是 | 用时（毫秒） |

**评分说明**

| 评分 | 说明 |
|------|------|
| 1 | Again（重学） |
| 2 | Hard（困难） |
| 3 | Good（良好） |
| 4 | Easy（简单） |

**响应示例**

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "nextDue": "2024-01-02T00:00:00Z",
    "nextInterval": 1
  }
}
```

**TypeScript 类型定义**

```typescript
interface ReviewSubmissionDto {
  cardId: string;
  rating: 1 | 2 | 3 | 4;
  timeTaken: number;
  reviewId?: string;
  preview?: boolean;
}

interface ReviewResultDto {
  card: EchoeCardWithNoteDto;
  nextDue: number;
  nextInterval: number;
  nextFactor: number;
  graduated: boolean;
  isLeech?: boolean;
  reviewId?: string;
}
```

---

### Undo - 撤销上次复习

```http
POST /api/v1/study/undo
```

**查询参数**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| reviewId | string | 否 | 复习记录ID |

**TypeScript 类型定义**

```typescript
interface UndoResultDto {
  success: boolean;
  message: string;
}
```

---

### Bury Cards - 埋入卡片

```http
POST /api/v1/study/bury
```

**请求体**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| cardIds | string[] | 是 | 卡片ID数组 |
| mode | string | 否 | 模式：`card`（埋单张）或 `note`（埋整笔记） |

**TypeScript 类型定义**

```typescript
interface BuryCardsDto {
  cardIds: string[];
  mode?: 'card' | 'note';
}
```

---

### Forget Cards - 遗忘卡片

```http
POST /api/v1/study/forget
```

**请求体**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| cardIds | string[] | 是 | 卡片ID数组 |

**TypeScript 类型定义**

```typescript
interface ForgetCardsDto {
  cardIds: string[];
}
```

---

### Delete Cards - 删除卡片

```http
POST /api/v1/study/delete
```

**请求体**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| cardIds | string[] | 是 | 卡片ID数组 |

**TypeScript 类型定义**

```typescript
interface DeleteCardsDto {
  cardIds: string[];
}
```

---

### Get Counts - 获取学习数量

```http
GET /api/v1/study/counts
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
    "review": 20,
    "total": 35
  }
}
```

**TypeScript 类型定义**

```typescript
interface StudyCountsDto {
  newCount: number;
  learnCount: number;
  reviewCount: number;
  totalCount: number;
}
```

---

### Get Options - 获取卡片复习选项

```http
GET /api/v1/study/options
```

**查询参数**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| cardId | string | 是 | 卡片ID |

**响应示例**

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "again": { "interval": 0, "ease": 1.3 },
    "hard": { "interval": 1, "ease": 1.2 },
    "good": { "interval": 4, "ease": 1.3 },
    "easy": { "interval": 7, "ease": 1.4 }
  }
}
```

**TypeScript 类型定义**

```typescript
interface StudyOptionsDto {
  cardId: string;
  options: RatingOptionDto[];
  retrievability: number | null;
}

interface RatingOptionDto {
  rating: 1 | 2 | 3 | 4;
  label: string;
  interval: number;
  due: number;
  stability: number;
  difficulty: number;
}
```
