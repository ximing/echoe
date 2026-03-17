# Tag API

标签管理

## Base URL

`/api/v1/tags`

## Endpoints

### Get Tags - 获取所有标签

```http
GET /api/v1/tags
```

**认证**: 需要登录

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

**TypeScript 类型**

```typescript
interface EchoeTagDto {
  /** Tag name */
  name: string;
  /** Number of notes using this tag */
  count: number;
}
```

---

### Search Tags - 搜索标签

```http
GET /api/v1/tags/search?q=imp&limit=10
```

**认证**: 需要登录

**查询参数**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| q | string | 是 | 搜索前缀 |
| limit | number | 否 | 返回数量限制 |

**响应示例**

```json
{
  "code": 0,
  "msg": "success",
  "data": [
    {
      "name": "important",
      "count": 10
    }
  ]
}
```

**TypeScript 类型**

```typescript
type EchoeTagDto = {
  name: string;
  count: number;
};
```

---

### Rename Tag - 重命名标签

```http
PUT /api/v1/tags/:tag/rename
```

**认证**: 需要登录

**参数**

| 字段 | 类型 | 说明 |
|------|------|------|
| tag | string | 原始标签名（URL 编码） |

**请求体**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| newName | string | 是 | 新标签名 |

**响应示例**

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "renamed": true,
    "oldName": "old_tag",
    "newName": "new_tag",
    "affectedNotes": 5
  }
}
```

**TypeScript 类型**

```typescript
interface RenameTagDto {
  /** New tag name */
  newName: string;
}
```

---

### Delete Tag - 删除标签

```http
DELETE /api/v1/tags/:tag
```

**认证**: 需要登录

**参数**

| 字段 | 类型 | 说明 |
|------|------|------|
| tag | string | 标签名（URL 编码） |

**响应示例**

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "deleted": true,
    "message": "Tag deleted successfully"
  }
}
```

**TypeScript 类型**

```typescript
// Response
interface DeleteTagResultDto {
  deleted: boolean;
  message: string;
}
```

---

### Merge Tags - 合并标签

```http
POST /api/v1/tags/merge
```

**认证**: 需要登录

**请求体**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| source | string | 是 | 源标签名 |
| target | string | 是 | 目标标签名 |

**响应示例**

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "merged": true,
    "source": "old_tag",
    "target": "new_tag",
    "affectedNotes": 10
  }
}
```

**TypeScript 类型**

```typescript
interface MergeTagsDto {
  /** Source tag to merge from */
  source: string;
  /** Target tag to merge into */
  target: string;
}
```
