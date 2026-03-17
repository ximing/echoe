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

**TypeScript 类型定义**

```typescript
interface ImportResultDto {
  /** Number of notes added */
  notesAdded: number;
  /** Number of notes updated */
  notesUpdated: number;
  /** Number of notes skipped */
  notesSkipped: number;
  /** Number of cards added */
  cardsAdded: number;
  /** Number of cards updated */
  cardsUpdated: number;
  /** Number of decks added */
  decksAdded: number;
  /** Number of notetypes added */
  notetypesAdded: number;
  /** Number of revlog entries imported */
  revlogImported: number;
  /** Number of media files imported */
  mediaImported: number;
  /** List of errors (simple string format for backwards compatibility) */
  errors: string[];
  /** Detailed error breakdown by category */
  errorDetails?: ImportErrorDetailDto[];
  /** Number of cards with FSRS backfill from revlog */
  fsrsBackfilledFromRevlog?: number;
  /** Number of cards kept as new (no revlog, type=0) */
  fsrsNewCards?: number;
  /** Number of cards with heuristic FSRS backfill */
  fsrsHeuristic?: number;
}

interface ImportErrorDetailDto {
  /** Category of the error */
  category: 'notetype' | 'deck' | 'note' | 'card' | 'revlog' | 'media' | 'general';
  /** Error message */
  message: string;
  /** Optional identifier (e.g., note id, deck name) */
  id?: string | number;
}
```

**响应示例**

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "notesAdded": 50,
    "notesUpdated": 0,
    "notesSkipped": 0,
    "cardsAdded": 100,
    "cardsUpdated": 0,
    "decksAdded": 1,
    "notetypesAdded": 1,
    "revlogImported": 500,
    "mediaImported": 5,
    "errors": [],
    "fsrsBackfilledFromRevlog": 450,
    "fsrsNewCards": 50,
    "fsrsHeuristic": 0
  }
}
```
