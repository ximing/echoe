# API Token API

API Token 管理

## Base URL

`/api/v1/api-tokens`

## Endpoints

### List Tokens - 获取 Token 列表

```http
GET /api/v1/api-tokens
```

**响应示例**

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "tokens": [
      {
        "tokenId": "tok_xxx",
        "name": "My Token",
        "createdAt": "2024-01-01T00:00:00Z",
        "updatedAt": "2024-01-01T00:00:00Z"
      }
    ],
    "total": 1
  }
}
```

---

### Create Token - 创建 Token

```http
POST /api/v1/api-tokens
```

**请求体**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| name | string | 是 | Token 名称（最长 255 字符） |

**响应示例**

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "message": "API token created successfully. Store this token securely - it will not be shown again.",
    "token": {
      "tokenId": "tok_xxx",
      "token": "ek_xxxxx_xxxxx_xxxxx",
      "name": "My Token",
      "createdAt": "2024-01-01T00:00:00Z"
    }
  }
}
```

**注意**：Token 仅在创建时返回一次，之后无法再次查看，请妥善保存。

---

### Delete Token - 删除 Token

```http
DELETE /api/v1/api-tokens/:tokenId
```

**参数**

| 字段 | 类型 | 说明 |
|------|------|------|
| tokenId | string | Token ID |

**响应示例**

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "message": "API token deleted successfully"
  }
}
```

---

## 认证方式

API Token 可用于以下请求认证：

```http
Authorization: Bearer <token>
```

或

```http
X-API-Token: <token>
```
