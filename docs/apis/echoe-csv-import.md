# CSV Import API

CSV/TSV 文件批量导入

## Base URL

`/api/v1/csv-import`

## Endpoints

### Preview CSV - 预览 CSV 文件

```http
POST /api/v1/csv-import/preview
```

**Content-Type**: `multipart/form-data`

**表单字段**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| file | file | 是 | CSV/TSV/TXT 文件（最大 100MB） |

**响应示例**

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "headers": ["Front", "Back", "Tags"],
    "rows": [
      ["Hello", "你好", "greeting"],
      ["World", "世界", ""]
    ],
    "detectedDelimiter": ",",
    "detectedEncoding": "utf-8"
  }
}
```

---

### Execute CSV Import - 执行 CSV 导入

```http
POST /api/v1/csv-import/execute
```

**Content-Type**: `multipart/form-data`

**表单字段**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| file | file | 是 | CSV/TSV/TXT 文件（最大 100MB） |
| deckId | string | 是 | 目标卡组ID |
| notetypeId | string | 是 | 笔记类型ID |
| columnMapping | object | 是 | 列映射配置 |
| hasHeader | boolean | 否 | 是否包含表头（默认 true） |

**列映射示例**

```json
{
  "Front": 0,
  "Back": 1,
  "Tags": 2
}
```

**响应示例**

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "importedNotes": 50,
    "importedCards": 100
  }
}
```
