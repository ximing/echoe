# API Token API

API Token 管理

## Base URL

`/api/v1/api-tokens`

## Endpoints

### List Tokens - 获取 Token 列表

```http
GET /api/v1/api-tokens
```

**请求头**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| Authorization | string | 是 | JWT Token (Bearer) |

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

**TypeScript 类型**

```typescript
interface UserInfoDto {
  uid: string;
  email?: string;
  nickname?: string;
  avatar?: string;
}

interface ApiTokenListItemDto {
  tokenId: string;
  name: string;
  deletedAt: number;
  createdAt: Date;
  updatedAt: Date;
}

interface ListTokensResponse {
  tokens: ApiTokenListItemDto[];
  total: number;
}
```

---

### Create Token - 创建 Token

```http
POST /api/v1/api-tokens
```

**请求头**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| Authorization | string | 是 | JWT Token (Bearer) |

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

**TypeScript 类型**

```typescript
interface CreateApiTokenDto {
  name: string;
}

interface CreateApiTokenResponseDto {
  tokenId: string;
  token: string;
  name: string;
  createdAt: Date;
}

interface CreateTokenResponse {
  message: string;
  token: CreateApiTokenResponseDto;
}
```

---

### Delete Token - 删除 Token

```http
DELETE /api/v1/api-tokens/:tokenId
```

**请求头**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| Authorization | string | 是 | JWT Token (Bearer) |

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

**TypeScript 类型**

```typescript
interface DeleteTokenResponse {
  message: string;
}
```

---

## 认证方式

### 管理接口 (JWT)

以下接口需要使用 JWT Token 认证：

```http
Authorization: Bearer <jwt_token>
```

### 调用接口 (API Token)

API Token 可用于以下请求认证：

```http
Authorization: Bearer <token>
```

或

```http
X-API-Token: <token>
```

**注意**：管理 API Token 的接口（列表、创建、删除）仅支持 JWT 认证，不支持 API Token 认证，以防止 Token 锁定场景。
