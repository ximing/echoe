# Tag API

标签管理

## Base URL

`/api/v1/tags`

## Endpoints

### Get Tags - 获取所有标签

```http
GET /api/v1/tags
```

**响应示例**

```json
{
  "code": 0,
  "msg": "success",
  "data": [
    {
      "name": "important",
      "count": 10
    },
    {
      "name": "review",
      "count": 5
    }
  ]
}
```

---

### Search Tags - 搜索标签

```http
GET /api/v1/tags/search?q=imp&limit=10
```

**查询参数**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| q | string | 是 | 搜索前缀 |
| limit | number | 否 | 返回数量限制 |

---

### Rename Tag - 重命名标签

```http
PUT /api/v1/tags/:tag/rename
```

**请求体**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| newName | string | 是 | 新标签名 |

---

### Delete Tag - 删除标签

```http
DELETE /api/v1/tags/:tag
```

**参数**

| 字段 | 类型 | 说明 |
|------|------|------|
| tag | string | 标签名 |

---

### Merge Tags - 合并标签

```http
POST /api/v1/tags/merge
```

**请求体**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| sourceTag | string | 是 | 源标签名 |
| targetTag | string | 是 | 目标标签名 |
