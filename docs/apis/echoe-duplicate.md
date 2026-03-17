# Duplicate API

笔记查重与合并

## Base URL

`/api/v1`

## Endpoints

### Find Duplicates - 查找重复笔记

```http
POST /api/v1/notes/find-duplicates
```

**请求体**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| notetypeId | string | 是 | 笔记类型ID |
| fieldName | string | 是 | 要比较的字段名（如 "Front"） |
| threshold | number | 否 | 相似度阈值 (0-1，默认 1.0 精确匹配) |

**TypeScript 类型定义**

```typescript
interface FindDuplicatesDto {
  /** Note type ID to search within */
  notetypeId: string;
  /** Field name to check for duplicates (e.g., "Front") */
  fieldName: string;
  /** Similarity threshold (0-1, default 1.0 for exact match) */
  threshold?: number;
}

interface DuplicateGroupDto {
  /** Notes in this duplicate group */
  notes: EchoeNoteDto[];
}
```

**响应示例**

```json
{
  "code": 0,
  "msg": "success",
  "data": [
    {
      "notes": [
        {
          "noteId": "note_xxx",
          "id": "note_xxx",
          "guid": "xxx",
          "mid": "nt_xxx",
          "mod": 1234567890,
          "tags": [],
          "fields": { "Front": "example", "Back": "example back" },
          "sfld": "example",
          "csum": "xxx",
          "flags": 0,
          "data": ""
        }
      ]
    }
  ]
}
```

---

### Merge Duplicates - 合并重复笔记

```http
POST /api/v1/notes/merge-duplicates
```

**请求体**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| keepId | string | 是 | 保留的笔记ID |
| deleteIds | string[] | 是 | 要删除的笔记ID数组 |

**TypeScript 类型定义**

```typescript
interface MergeDuplicatesDto {
  /** Note ID to keep */
  keepId: string;
  /** Note IDs to delete */
  deleteIds: string[];
}
```

**响应示例**

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "success": true
  }
}
```
