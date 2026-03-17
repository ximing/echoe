# Inbox API

收件箱管理

## Base URL

`/api/v1/inbox`

## Endpoints

### Get Inbox Items - 获取收件箱列表

```http
GET /api/v1/inbox
```

**查询参数**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| category | string | 否 | 分类筛选 |
| isRead | boolean | 否 | 已读/未读筛选 |
| page | number | 否 | 页码（默认 1） |
| limit | number | 否 | 每页数量（默认 20） |

**响应示例**

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "items": [
      {
        "inboxId": "inbox_xxx",
        "front": "问题",
        "back": "答案",
        "category": "question",
        "isRead": false,
        "createdAt": "2024-01-01T00:00:00Z"
      }
    ],
    "total": 10,
    "page": 1,
    "pageSize": 20
  }
}
```

---

### Get Inbox Item - 获取单个收件箱项目

```http
GET /api/v1/inbox/:inboxId
```

**参数**

| 字段 | 类型 | 说明 |
|------|------|------|
| inboxId | string | 收件箱项目ID |

---

### Create Inbox Item - 创建收件箱项目

```http
POST /api/v1/inbox
```

**请求体**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| front | string | 是 | 正面内容 |
| back | string | 是 | 背面内容 |
| category | string | 否 | 分类 |

---

### Update Inbox Item - 更新收件箱项目

```http
PUT /api/v1/inbox/:inboxId
```

**请求体**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| front | string | 否 | 正面内容 |
| back | string | 否 | 背面内容 |
| category | string | 否 | 分类 |

---

### Delete Inbox Item - 删除收件箱项目

```http
DELETE /api/v1/inbox/:inboxId
```

---

### Mark as Read - 标记为已读

```http
POST /api/v1/inbox/:inboxId/read
```

---

### Mark All as Read - 全部标记为已读

```http
POST /api/v1/inbox/read-all
```

---

### AI Organize - AI 整理收件箱

```http
POST /api/v1/inbox/:inboxId/organize
```

**查询参数**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| async | boolean | 否 | 是否异步执行（默认 false） |

**响应示例**

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "success": true,
    "category": "question"
  }
}
```
