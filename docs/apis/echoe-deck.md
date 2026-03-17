# Deck API

卡组管理

## Base URL

`/api/v1/decks`

## Endpoints

### Get All Decks - 获取所有卡组

```http
GET /api/v1/decks
```

**响应示例**

```json
{
  "code": 0,
  "msg": "success",
  "data": [
    {
      "id": "deck_xxx",
      "name": "Default",
      "description": "",
      "newCount": 10,
      "learningCount": 5,
      "reviewCount": 20
    }
  ]
}
```

**TypeScript 类型定义**

```typescript
interface EchoeDeckWithCountsDto {
  deckId: string;
  id: string;
  name: string;
  desc: string;
  conf: string;
  extendNew: number;
  extendRev: number;
  collapsed: boolean;
  dyn: number;
  mid: string;
  mod: number;
  newCount: number;
  learnCount: number;
  reviewCount: number;
  totalCount: number;
  matureCount: number;
  difficultCount: number;
  averageRetrievability: number;
  lastStudiedAt: number | null;
  children: EchoeDeckWithCountsDto[];
}
```

---

### Get Deck By ID - 获取单个卡组

```http
GET /api/v1/decks/:id
```

**参数**

| 字段 | 类型 | 说明 |
|------|------|------|
| id | string | 卡组ID |

---

### Create Deck - 创建卡组

```http
POST /api/v1/decks
```

**请求体**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| name | string | 是 | 卡组名称 |
| description | string | 否 | 卡组描述 |
| notetypeId | string | 否 | 笔记类型ID |

**TypeScript 类型定义**

```typescript
interface CreateEchoeDeckDto {
  name: string;
  desc?: string;
  conf?: string;
  mid?: string;
  dyn?: boolean;
  searchQuery?: string;
}
```

---

### Update Deck - 更新卡组

```http
PUT /api/v1/decks/:id
```

**请求体**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| name | string | 否 | 卡组名称 |
| description | string | 否 | 卡组描述 |

**TypeScript 类型定义**

```typescript
interface UpdateEchoeDeckDto {
  name?: string;
  desc?: string;
  conf?: string;
  mid?: string;
}
```

---

### Delete Deck - 删除卡组

```http
DELETE /api/v1/decks/:id
```

**查询参数**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| deleteCards | string | 否 | 是否同时删除卡片（`true` / `false`） |

---

### Get Deck Config - 获取卡组配置

```http
GET /api/v1/decks/:id/config
```

**响应示例**

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "newPerDay": 20,
    "reviewPerDay": 200,
    "learningSteps": [1, 10],
    "relearningSteps": [10],
    " graduatingInterval": 1,
    "easyInterval": 4
  }
}
```

**TypeScript 类型定义**

```typescript
interface EchoeDeckConfigDto {
  id: string;
  name: string;
  replayq: boolean;
  timer: number;
  maxTaken: number;
  autoplay: string;
  ttsSpeed: number;
  mod: number;
  newConfig: EchoeNewCardConfigDto;
  revConfig: EchoeReviewConfigDto;
  lapseConfig: EchoeLapseConfigDto;
  fsrsConfig: EchoeFsrsConfigDto;
}

interface EchoeNewCardConfigDto {
  steps: number[];
  initialInterval: number;
  graduatingInterval: number;
  easyInterval: number;
  perDay: number;
}

interface EchoeReviewConfigDto {
  perDay: number;
  easyBonus: number;
  intervalModifier: number;
  maxInterval: number;
}

interface EchoeLapseConfigDto {
  steps: number[];
  minInterval: number;
  mult: number;
  leechThreshold: number;
  leechAction: number;
}

interface EchoeFsrsConfigDto {
  requestRetention: number;
  maxInterval: number;
  enableFuzz: boolean;
  enableShortTerm: boolean;
  learningSteps: number[];
  relearningSteps: number[];
}
```

---

### Update Deck Config - 更新卡组配置

```http
PUT /api/v1/decks/:id/config
```

**请求体**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| newPerDay | number | 否 | 每日新卡片数量 |
| reviewPerDay | number | 否 | 每日复习卡片数量 |
| learningSteps | number[] | 否 | 学习步骤（分钟） |
| relearningSteps | number[] | 否 | 重学步骤（分钟） |
| graduatingInterval | number | 否 | 毕业间隔（天） |
| easyInterval | number | 否 | 简单间隔（天） |

**TypeScript 类型定义**

```typescript
interface UpdateEchoeDeckConfigDto {
  name?: string;
  replayq?: boolean;
  timer?: number;
  maxTaken?: number;
  autoplay?: string;
  ttsSpeed?: number;
  newConfig?: Partial<EchoeNewCardConfigDto>;
  revConfig?: Partial<EchoeReviewConfigDto>;
  lapseConfig?: Partial<EchoeLapseConfigDto>;
  fsrsConfig?: Partial<EchoeFsrsConfigDto>;
}
```

---

### Delete Deck Config - 删除卡组配置

```http
DELETE /api/v1/decks/config/:deckConfigId
```

---

### Create Filtered Deck - 创建筛选卡组

```http
POST /api/v1/decks/filtered
```

**请求体**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| name | string | 是 | 筛选卡组名称 |
| searchQuery | string | 是 | 搜索条件 |

**搜索语法示例**

| 示例 | 说明 |
|------|------|
| `is:new` | 新卡片 |
| `is:learn` | 学习中 |
| `is:review` | 复习中 |
| `is:suspended` | 暂停 |
| `tag:important` | 重要标签 |
| `deck:Default` | 指定卡组 |

**TypeScript 类型定义**

```typescript
interface CreateFilteredDeckDto {
  name: string;
  searchQuery: string;
  rebuildDaily?: boolean;
}
```

---

### Rebuild Filtered Deck - 重建筛选卡组

```http
POST /api/v1/decks/:id/rebuild
```

---

### Empty Filtered Deck - 清空筛选卡组

```http
POST /api/v1/decks/:id/empty
```

---

### Preview Filtered Deck - 预览筛选卡组

```http
GET /api/v1/decks/preview
```

**查询参数**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| q | string | 是 | 搜索条件 |
| limit | number | 否 | 预览数量（默认 5） |

**TypeScript 类型定义**

```typescript
interface FilteredDeckPreviewDto {
  count: number;
  sampleCards: EchoeCardListItemDto[];
}

interface EchoeCardListItemDto {
  cardId: string;
  noteId: string;
  deckId: string;
  id: string;
  nid: string;
  did: string;
  deckName: string;
  ord: number;
  type: number;
  queue: number;
  due: number;
  ivl: number;
  factor: number;
  reps: number;
  lapses: number;
  front: string;
  fields: Record<string, string>;
  tags: string[];
  mid: string;
  notetypeName: string;
  addedAt: number;
  mod: number;
  notetypeType: number;
}
```
