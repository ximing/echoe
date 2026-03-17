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
| noteTypeId | string | 是 | 笔记类型ID |
| field | string | 是 | 要比较的字段名 |

**响应示例**

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "duplicates": [
      {
        "fieldValue": "example",
        "noteIds": ["note_xxx", "note_yyy"]
      }
    ]
  }
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
| noteIds | string[] | 是 | 要合并的笔记ID数组 |
| keepNoteId | string | 是 | 保留的笔记ID |

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
