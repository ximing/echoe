# Media API

媒体文件管理

## Base URL

`/api/v1/media`

## Endpoints

### List Media - 获取媒体文件列表

```http
GET /api/v1/media
```

**TypeScript 类型定义**

```typescript
interface EchoeMediaDto {
  /** Media file ID */
  id: string;
  /** Stored filename */
  filename: string;
  /** Original uploaded filename */
  originalFilename: string;
  /** File size in bytes */
  size: number;
  /** MIME type */
  mimeType: string;
  /** SHA1 hash of file */
  hash: string;
  /** Creation timestamp */
  createdAt: number;
  /** Whether file is referenced in any card */
  usedInCards: boolean;
}
```

**响应示例**

```json
{
  "code": 0,
  "msg": "success",
  "data": [
    {
      "id": "media_xxx",
      "filename": "image.png",
      "originalFilename": "image.png",
      "size": 1024,
      "mimeType": "image/png",
      "hash": "abc123",
      "createdAt": 1704067200000,
      "usedInCards": true
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

**响应**: 返回文件二进制内容，Content-Type 根据文件 MIME 类型设置

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

**TypeScript 类型定义**

```typescript
interface UploadMediaResultDto {
  /** Stored filename */
  filename: string;
  /** URL to access the file */
  url: string;
}
```

**响应示例**

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "filename": "image_1704067200000.png",
    "url": "/api/v1/media/image_1704067200000.png"
  }
}
```

---

### Check Unused Media - 检查未使用媒体

```http
POST /api/v1/media/check-unused
```

**TypeScript 类型定义**

```typescript
interface CheckUnusedMediaResultDto {
  /** List of unused media filenames */
  unusedFiles: string[];
}
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

**TypeScript 类型定义**

```typescript
interface DeleteMediaBulkDto {
  /** List of filenames to delete */
  filenames: string[];
}
```

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
