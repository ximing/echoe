# Note API

笔记与卡片管理

## Base URL

`/api/v1`

## Endpoints

### Get Notes - 获取笔记列表

```http
GET /api/v1/notes
```

**查询参数**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| deckId | string | 否 | 卡组ID |
| tags | string | 否 | 标签（逗号分隔） |
| q | string | 否 | 搜索关键词 |
| status | string | 否 | 状态筛选：`new` \| `learn` \| `review` \| `suspended` \| `buried` |
| page | number | 否 | 页码（默认 1） |
| limit | number | 否 | 每页数量（默认 20） |

**响应示例**

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "notes": [...],
    "total": 100,
    "page": 1,
    "limit": 20
  }
}
```

---

### Get Note By ID - 获取单个笔记

```http
GET /api/v1/notes/:id
```

**参数**

| 字段 | 类型 | 说明 |
|------|------|------|
| id | string | 笔记ID |

---

### Create Note - 创建笔记

```http
POST /api/v1/notes
```

**请求体**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| notetypeId | string | 是 | 笔记类型ID |
| deckId | string | 是 | 卡组ID |
| fields | object | 是 | 字段内容 |
| tags | string[] | 否 | 标签 |

---

### Update Note - 更新笔记

```http
PUT /api/v1/notes/:id
```

**请求体**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| fields | object | 否 | 字段内容 |
| tags | string[] | 否 | 标签 |

---

### Delete Note - 删除笔记

```http
DELETE /api/v1/notes/:id
```

---

### Get Card By ID - 获取卡片

```http
GET /api/v1/cards/:id
```

**参数**

| 字段 | 类型 | 说明 |
|------|------|------|
| id | string | 卡片ID |

**响应示例**

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "id": "card_xxx",
    "noteId": "note_xxx",
    "note": {...},
    "deckId": "deck_xxx",
    "status": "new",
    "due": "2024-01-01T00:00:00Z"
  }
}
```

---

### Get Cards - 获取卡片列表

```http
GET /api/v1/cards
```

**查询参数**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| deckId | string | 否 | 卡组ID |
| q | string | 否 | 搜索关键词 |
| status | string | 否 | 状态：`new` \| `learn` \| `review` \| `suspended` \| `buried` \| `leech` |
| tag | string | 否 | 标签 |
| sort | string | 否 | 排序字段：`added` \| `due` \| `mod` |
| order | string | 否 | 排序方向：`asc` \| `desc` |
| page | number | 否 | 页码（默认 1） |
| limit | number | 否 | 每页数量（默认 50） |

---

### Bulk Card Operation - 批量卡片操作

```http
POST /api/v1/cards/bulk
```

**请求体**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| cardIds | string[] | 是 | 卡片ID数组 |
| action | string | 是 | 操作类型 |

**可用操作**

| 操作 | 说明 |
|------|------|
| suspend | 暂停卡片 |
| unsuspend | 恢复卡片 |
| bury | 埋入卡片 |
| unbury | 挖出卡片 |
| delete | 删除卡片 |

---

### Get Note Types - 获取所有笔记类型

```http
GET /api/v1/notetypes
```

**响应示例**

```json
{
  "code": 0,
  "msg": "success",
  "data": [
    {
      "id": "nt_xxx",
      "name": "Basic",
      "fields": ["Front", "Back"]
    }
  ]
}
```

---

### Get Note Type By ID - 获取单个笔记类型

```http
GET /api/v1/notetypes/:id
```

---

### Create Note Type - 创建笔记类型

```http
POST /api/v1/notetypes
```

**请求体**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| name | string | 是 | 笔记类型名称 |
| fields | string[] | 否 | 字段列表 |

---

### Update Note Type - 更新笔记类型

```http
PUT /api/v1/notetypes/:id
```

**请求体**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| name | string | 否 | 笔记类型名称 |
| fields | string[] | 否 | 字段列表 |

---

### Delete Note Type - 删除笔记类型

```http
DELETE /api/v1/notetypes/:id
```
