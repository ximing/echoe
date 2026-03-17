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
    "rows": [
      ["Hello", "你好", "greeting"],
      ["World", "世界", ""]
    ],
    "detectedDelimiter": ",",
    "detectedEncoding": "utf-8",
    "totalColumns": 3,
    "totalRows": 2
  }
}
```

**TypeScript 类型定义**

```typescript
interface CsvPreviewDto {
  /** Sample rows from the CSV/TSV file */
  rows: string[][];
  /** Detected character encoding */
  detectedEncoding: string;
  /** Detected delimiter (comma, tab, etc.) */
  detectedDelimiter: string;
  /** Total number of columns */
  totalColumns: number;
  /** Total number of rows (excluding header if present) */
  totalRows: number;
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
  "0": "Front",
  "1": "Back",
  "2": "Tags"
}
```

**响应示例**

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "added": 50,
    "updated": 0,
    "skipped": 0,
    "errors": []
  }
}
```

**TypeScript 类型定义**

```typescript
interface CsvExecuteDto {
  /** Column mapping: columnIndex -> field name (Front, Back, Tags) or Ignore */
  columnMapping: Record<number, string>;
  /** Note type ID to use for imported notes */
  notetypeId: string;
  /** Deck ID to import notes into */
  deckId: string;
  /** Whether the CSV/TSV has a header row */
  hasHeader: boolean;
}

interface CsvImportResultDto {
  /** Number of notes added */
  added: number;
  /** Number of notes updated */
  updated: number;
  /** Number of notes skipped */
  skipped: number;
  /** List of errors with row numbers and reasons */
  errors: { row: number; reason: string }[];
}
```

**请求示例**

```bash
curl -X POST "http://localhost:3200/api/v1/csv-import/execute" \
  -H "Authorization: Bearer <token>" \
  -F "file=@/path/to/cards.csv" \
  -F "deckId=deck_123" \
  -F "notetypeId=notetype_basic" \
  -F "columnMapping={\"0\":\"Front\",\"1\":\"Back\",\"2\":\"Tags\"}" \
  -F "hasHeader=true"
```
