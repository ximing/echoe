# System API

系统信息

## Base URL

`/api/v1/system`

## Endpoints

### Get Version - 获取服务端版本

```http
GET /api/v1/system/open/version
```

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

---

### Get App Versions - 获取应用版本信息

```http
GET /api/v1/system/open/app-versions
```

**响应示例**

```json
{
  "code": 0,
  "msg": "success",
  "data": {}
}
```

---

### Get Config - 获取公开系统配置

```http
GET /api/v1/system/open/config
```

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
