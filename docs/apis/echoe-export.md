# Export API

导出卡组为 APKG 格式

## Base URL

`/api/v1/export`

## Endpoints

### Export APKG - 导出为 APKG 文件

```http
GET /api/v1/export/apkg
```

**查询参数**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| deckId | string | 否 | 卡组ID（不指定则导出全部） |
| includeScheduling | string | 否 | 是否包含学习进度（`true` / `false`） |
| format | string | 否 | 导出格式：`anki`（默认）或 `legacy` |

**响应**

返回 `.apkg` 文件下载（`Content-Type: application/apkg`）

**响应示例**

```
Content-Type: application/apkg
Content-Disposition: attachment; filename="deck_xxx.apkg"
```

**TypeScript 类型定义**

```typescript
interface ExportOptions {
  /** Deck ID to export, undefined for all decks */
  deckId?: string;
  /** Whether to include FSRS scheduling data */
  includeScheduling: boolean;
  /** Export format: 'anki' or 'legacy' */
  format: 'anki' | 'legacy';
}

interface ExportResult {
  /** Generated filename */
  filename: string;
  /** Buffer containing the .apkg file */
  buffer: Buffer;
}
```

**请求示例**

```bash
curl -X GET "http://localhost:3200/api/v1/export/apkg?deckId=deck_123&includeScheduling=true&format=anki" \
  -H "Authorization: Bearer <token>" \
  -o deck_export.apkg
```
