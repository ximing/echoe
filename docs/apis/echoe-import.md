# Import API

APKG 文件导入

## Base URL

`/api/v1/import`

## Endpoints

### Import APKG - 导入 Anki 卡组包

```http
POST /api/v1/import/apkg
```

**Content-Type**: `multipart/form-data`

**表单字段**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| file | file | 是 | .apkg 文件（最大 500MB） |

**响应示例**

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "importedNotes": 50,
    "importedCards": 100,
    "notetypeId": "nt_xxx",
    "deckId": "deck_xxx"
  }
}
```
