# Media API

媒体文件管理

## Base URL

`/api/v1/media`

## Endpoints

### List Media - 获取媒体文件列表

```http
GET /api/v1/media
```

**响应示例**

```json
{
  "code": 0,
  "msg": "success",
  "data": [
    {
      "filename": "image.png",
      "size": 1024,
      "createdAt": "2024-01-01T00:00:00Z"
    }
  ]
}
```

---

### Get Media - 获取媒体文件

```http
GET /api/v1/media/:filename
```

**参数**

| 字段 | 类型 | 说明 |
|------|------|------|
| filename | string | 文件名（URL 编码） |

**响应**: 返回文件二进制内容

---

### Upload Media - 上传媒体文件

```http
POST /api/v1/media/upload
```

**Content-Type**: `multipart/form-data`

**表单字段**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| file | file | 是 | 媒体文件（图片/音频/视频/PDF） |

**响应示例**

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "filename": "image.png",
    "url": "/api/v1/media/image.png"
  }
}
```

---

### Check Unused Media - 检查未使用媒体

```http
POST /api/v1/media/check-unused
```

**响应示例**

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "unusedFiles": ["image.png", "audio.mp3"]
  }
}
```

---

### Delete Media Bulk - 批量删除媒体

```http
DELETE /api/v1/media/bulk
```

**请求体**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| filenames | string[] | 是 | 要删除的文件名列表 |

**响应示例**

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "message": "Files deleted successfully"
  }
}
```
