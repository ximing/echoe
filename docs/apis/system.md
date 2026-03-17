# System API

系统信息

## Base URL

`/api/v1/system`

## Endpoints

### Get Version - 获取服务端版本

```http
GET /api/v1/system/open/version
```

**认证**: 需要登录

**响应示例**

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "version": "1.0.0"
  }
}
```

**TypeScript 类型**

```typescript
interface GetVersionResponse {
  version: string;
}
```

---

### Get App Versions - 获取应用版本信息

```http
GET /api/v1/system/open/app-versions
```

**认证**: 无需认证（公开接口）

**响应示例**

```json
{
  "code": 0,
  "msg": "success",
  "data": {}
}
```

**TypeScript 类型**

```typescript
interface GetAppVersionsResponse {
  // Currently returns empty object
  // Reserved for future use: mobile app version info
  [key: string]: any;
}
```

---

### Get Config - 获取公开系统配置

```http
GET /api/v1/system/open/config
```

**认证**: 无需认证（公开接口）

**响应示例**

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "allowRegistration": true
  }
}
```

**TypeScript 类型**

```typescript
interface GetConfigResponse {
  /** Whether user registration is allowed */
  allowRegistration: boolean;
}
```
