# Config API

全局设置与卡组配置预设

## Base URL

`/api/v1/config`

## Endpoints

### Get Settings - 获取全局设置

```http
GET /api/v1/config
```

**响应示例**

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "newCardsPerDay": 20,
    "reviewsPerDay": 200,
    ...
  }
}
```

---

### Update Settings - 更新全局设置

```http
PUT /api/v1/config
```

**请求体**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| newCardsPerDay | number | 否 | 每日新卡片数量 |
| reviewsPerDay | number | 否 | 每日复习数量 |

---

### Get Presets - 获取配置预设列表

```http
GET /api/v1/config/presets
```

**响应示例**

```json
{
  "code": 0,
  "msg": "success",
  "data": [
    {
      "id": "preset_xxx",
      "name": "Default",
      "config": { ... }
    }
  ]
}
```

---

### Save Preset - 保存新预设

```http
POST /api/v1/config/presets
```

**请求体**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| name | string | 是 | 预设名称 |
| config | object | 是 | 配置内容 |

---

### Delete Preset - 删除预设

```http
DELETE /api/v1/config/presets/:id
```

**参数**

| 字段 | 类型 | 说明 |
|------|------|------|
| id | string | 预设ID |
