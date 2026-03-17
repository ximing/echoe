# Auth API

用户认证相关接口

## Base URL

`/api/v1/auth`

## Endpoints

### Register - 用户注册

```http
POST /api/v1/auth/register
```

**请求体**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| email | string | 是 | 用户邮箱 |
| password | string | 是 | 密码（至少6位） |
| nickname | string | 否 | 昵称 |
| phone | string | 否 | 手机号 |

**响应示例**

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "user": {
      "uid": "user_xxx",
      "email": "test@example.com",
      "nickname": "Test User"
    }
  }
}
```

---

### Login - 用户登录

```http
POST /api/v1/auth/login
```

**请求体**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| email | string | 是 | 用户邮箱 |
| password | string | 是 | 密码 |

**响应示例**

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "token": "eyJhbG...",
    "user": {
      "uid": "user_xxx",
      "email": "test@example.com",
      "nickname": "Test User"
    }
  }
}
```

登录成功后，token 会通过 cookie (`echoe_token`) 返回，有效期 90 天。
