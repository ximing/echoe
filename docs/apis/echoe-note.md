# Note API

笔记与卡片管理

## Base URL

`/api/v1`

## Endpoints

### Get Notes - 获取笔记列表

```http
GET /api/v1/notes
```

**认证**: 需要登录

**查询参数**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| deckId | string | 否 | 卡组ID |
| tags | string | 否 | 标签（逗号分隔） |
| q | string | 否 | 搜索关键词 |
| status | string | 否 | 状态筛选：`new` \| `learn` \| `review` \| `suspended` \| `buried` |
| page | number | 否 | 页码（默认 1） |
| limit | number | 否 | 每页数量（默认 20） |

**响应示例**

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "notes": [...],
    "total": 100,
    "page": 1,
    "limit": 20
  }
}
```

**TypeScript 类型**

```typescript
interface EchoeNoteQueryParams {
  /** Filter by deck ID */
  deckId?: string;
  /** Filter by tags (comma-separated) */
  tags?: string;
  /** Search query */
  q?: string;
  /** Filter by status: new, learn, review, suspended, buried */
  status?: 'new' | 'learn' | 'review' | 'suspended' | 'buried';
  /** Page number (default 1) */
  page?: number;
  /** Items per page (default 20) */
  limit?: number;
}

interface EchoeNoteDto {
  noteId: string;
  id: string;
  guid: string;
  mid: string;
  mod: number;
  tags: string[];
  fields: Record<string, string>;
  sfld: string;
  csum: string;
  flags: number;
  data: string;
  richTextFields?: Record<string, Record<string, any>>;
}

interface GetNotesResponse {
  notes: EchoeNoteDto[];
  total: number;
  page: number;
  limit: number;
}
```

---

### Get Note By ID - 获取单个笔记

```http
GET /api/v1/notes/:id
```

**认证**: 需要登录

**参数**

| 字段 | 类型 | 说明 |
|------|------|------|
| id | string | 笔记ID |

**响应示例**

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "noteId": "note_xxx",
    "id": "note_xxx",
    "guid": "xxx",
    "mid": "nt_xxx",
    "mod": 1234567890,
    "tags": ["tag1", "tag2"],
    "fields": {
      "Front": "Question",
      "Back": "Answer"
    },
    "sfld": "Question",
    "csum": "xxx",
    "flags": 0,
    "data": ""
  }
}
```

**TypeScript 类型**

```typescript
interface EchoeNoteDto {
  noteId: string;
  id: string;
  guid: string;
  mid: string;
  mod: number;
  tags: string[];
  fields: Record<string, string>;
  sfld: string;
  csum: string;
  flags: number;
  data: string;
  richTextFields?: Record<string, Record<string, any>>;
}
```

---

### Create Note - 创建笔记

```http
POST /api/v1/notes
```

**认证**: 需要登录

**请求体**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| notetypeId | string | 是 | 笔记类型ID |
| deckId | string | 是 | 卡组ID |
| fields | object | 是 | 字段内容（键值对） |
| tags | string[] | 否 | 标签 |
| richTextFields | object | 否 | 富文本字段内容 |

**响应示例**

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "noteId": "note_xxx",
    "id": "note_xxx",
    "guid": "xxx",
    "mid": "nt_xxx",
    "mod": 1234567890,
    "tags": ["tag1"],
    "fields": {
      "Front": "Question",
      "Back": "Answer"
    },
    "sfld": "Question",
    "csum": "xxx",
    "flags": 0,
    "data": ""
  }
}
```

**TypeScript 类型**

```typescript
interface CreateEchoeNoteDto {
  /** Note type ID */
  notetypeId: string;
  /** Deck ID */
  deckId: string;
  /** Field values */
  fields: Record<string, string>;
  /** Tags */
  tags?: string[];
  /** Rich text JSON for fields (keyed by field name) */
  richTextFields?: Record<string, Record<string, any>>;
}
```

---

### Update Note - 更新笔记

```http
PUT /api/v1/notes/:id
```

**认证**: 需要登录

**参数**

| 字段 | 类型 | 说明 |
|------|------|------|
| id | string | 笔记ID |

**请求体**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|
| mid | string | 否 | 笔记类型ID |
| fields | object | 否 | 字段内容 |
| tags | string[] | 否 | 标签 |
| richTextFields | object | 否 | 富文本字段内容 |

**响应示例**

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "noteId": "note_xxx",
    "id": "note_xxx",
    "guid": "xxx",
    "mid": "nt_xxx",
    "mod": 1234567890,
    "tags": ["tag1", "tag2"],
    "fields": {
      "Front": "Updated Question",
      "Back": "Updated Answer"
    },
    "sfld": "Updated Question",
    "csum": "xxx",
    "flags": 0,
    "data": ""
  }
}
```

**TypeScript 类型**

```typescript
interface UpdateEchoeNoteDto {
  /** Note type ID (mid) - mutable per FR-2 */
  mid?: string;
  /** Field values */
  fields?: Record<string, string>;
  /** Tags */
  tags?: string[];
  /** Rich text JSON for fields (keyed by field name) */
  richTextFields?: Record<string, Record<string, any>>;
}
```

---

### Delete Note - 删除笔记

```http
DELETE /api/v1/notes/:id
```

**认证**: 需要登录

**参数**

| 字段 | 类型 | 说明 |
|------|------|------|
| id | string | 笔记ID |

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

**TypeScript 类型**

```typescript
interface DeleteNoteResponse {
  success: boolean;
}
```

---

### Get Card By ID - 获取卡片

```http
GET /api/v1/cards/:id
```

**认证**: 需要登录

**参数**

| 字段 | 类型 | 说明 |
|------|------|------|
| id | string | 卡片ID |

**响应示例**

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "cardId": "card_xxx",
    "id": "card_xxx",
    "noteId": "note_xxx",
    "nid": "note_xxx",
    "deckId": "deck_xxx",
    "did": "deck_xxx",
    "ord": 0,
    "mod": 1234567890,
    "type": 2,
    "queue": 2,
    "due": 1704067200000,
    "ivl": 1,
    "factor": 2500,
    "reps": 1,
    "lapses": 0,
    "left": 0,
    "usn": 0,
    "stability": 1.0,
    "difficulty": 2.5,
    "lastReview": 1703980800000,
    "note": {
      "noteId": "note_xxx",
      "id": "note_xxx",
      "guid": "xxx",
      "mid": "nt_xxx",
      "mod": 1234567890,
      "tags": ["tag1"],
      "fields": {
        "Front": "Question",
        "Back": "Answer"
      },
      "sfld": "Question",
      "csum": "xxx",
      "flags": 0,
      "data": ""
    }
  }
}
```

**TypeScript 类型**

```typescript
interface EchoeCardWithNoteDto extends EchoeCardDto {
  /** Full note data */
  note: EchoeNoteDto;
}

interface EchoeCardDto {
  cardId: string;
  id: string;
  noteId: string;
  nid: string;
  deckId: string;
  did: string;
  ord: number;
  mod: number;
  type: number;  // 0=new, 1=learning, 2=review, 3=relearning
  queue: number;  // 0=new, 1=learning, 2=review, -1=suspended, -2=buried, -3=sibling buried
  due: number;
  ivl: number;
  factor: number;
  reps: number;
  lapses: number;
  left: number;
  usn: number;
  stability: number;
  difficulty: number;
  lastReview: number;
}

interface EchoeNoteDto {
  noteId: string;
  id: string;
  guid: string;
  mid: string;
  mod: number;
  tags: string[];
  fields: Record<string, string>;
  sfld: string;
  csum: string;
  flags: number;
  data: string;
  richTextFields?: Record<string, Record<string, any>>;
}
```

---

### Get Cards - 获取卡片列表

```http
GET /api/v1/cards
```

**认证**: 需要登录

**查询参数**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| deckId | string | 否 | 卡组ID |
| q | string | 否 | 搜索关键词 |
| status | string | 否 | 状态：`new` \| `learn` \| `review` \| `suspended` \| `buried` \| `leech` |
| tag | string | 否 | 标签 |
| sort | string | 否 | 排序字段：`added` \| `due` \| `mod` |
| order | string | 否 | 排序方向：`asc` \| `desc` |
| page | number | 否 | 页码（默认 1） |
| limit | number | 否 | 每页数量（默认 50） |

**响应示例**

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "cards": [...],
    "total": 100,
    "page": 1,
    "limit": 50
  }
}
```

**TypeScript 类型**

```typescript
interface EchoeCardQueryParams {
  /** Filter by deck ID */
  deckId?: string;
  /** Search query */
  q?: string;
  /** Filter by status: new, learn, review, suspended, buried, leech */
  status?: 'new' | 'learn' | 'review' | 'suspended' | 'buried' | 'leech';
  /** Filter by tag */
  tag?: string;
  /** Sort field: added, due, mod */
  sort?: 'added' | 'due' | 'mod';
  /** Sort direction: asc, desc */
  order?: 'asc' | 'desc';
  /** Page number (default 1) */
  page?: number;
  /** Items per page (default 50) */
  limit?: number;
}

interface EchoeCardListItemDto {
  cardId: string;
  id: string;
  noteId: string;
  nid: string;
  deckId: string;
  did: string;
  deckName: string;
  ord: number;
  type: number;
  queue: number;
  due: number;
  ivl: number;
  factor: number;
  reps: number;
  lapses: number;
  front: string;
  fields: Record<string, string>;
  tags: string[];
  mid: string;
  notetypeName: string;
  addedAt: number;
  mod: number;
  notetypeType: number;
}

interface GetCardsResponse {
  cards: EchoeCardListItemDto[];
  total: number;
  page: number;
  limit: number;
}
```

---

### Bulk Card Operation - 批量卡片操作

```http
POST /api/v1/cards/bulk
```

**认证**: 需要登录

**请求体**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| cardIds | string[] | 是 | 卡片ID数组 |
| action | string | 是 | 操作类型 |
| payload | object | 否 | 操作载荷 |

**可用操作**

| 操作 | 说明 | 载荷 |
|------|------|------|
| suspend | 暂停卡片 | - |
| unsuspend | 恢复卡片 | - |
| bury | 埋入卡片 | - |
| unbury | 挖出卡片 | - |
| forget | 重置卡片 | - |
| move | 移动卡片 | `{ deckId: string }` |
| addTag | 添加标签 | `{ tag: string }` |
| removeTag | 移除标签 | `{ tag: string }` |

**请求体示例**

```json
{
  "cardIds": ["card_xxx", "card_yyy"],
  "action": "suspend"
}
```

```json
{
  "cardIds": ["card_xxx"],
  "action": "move",
  "payload": {
    "deckId": "deck_xxx"
  }
}
```

**响应示例**

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "success": true,
    "affected": 2
  }
}
```

**TypeScript 类型**

```typescript
type BulkCardAction =
  | 'suspend'
  | 'unsuspend'
  | 'bury'
  | 'unbury'
  | 'forget'
  | 'move'
  | 'addTag'
  | 'removeTag';

interface BulkCardOperationDto {
  /** Card IDs */
  cardIds: string[];
  /** Action to perform */
  action: BulkCardAction;
  /** Optional payload (for move: { deckId: string }, for addTag/removeTag: { tag: string }) */
  payload?: {
    deckId?: string;
    tag?: string;
  };
}

interface BulkOperationResponse {
  success: boolean;
  affected: number;
}
```

---

### Get Note Types - 获取所有笔记类型

```http
GET /api/v1/notetypes
```

**认证**: 需要登录

**响应示例**

```json
{
  "code": 0,
  "msg": "success",
  "data": [
    {
      "id": "nt_xxx",
      "name": "Basic",
      "mod": 1234567890,
      "sortf": 0,
      "did": "deck_xxx",
      "tmpls": [...],
      "flds": [...],
      "css": "",
      "type": 0,
      "latexPre": "",
      "latexPost": "",
      "req": "[]",
      "noteCount": 10
    }
  ]
}
```

**TypeScript 类型**

```typescript
interface EchoeNoteTypeDto {
  /** Note type ID */
  id: string;
  /** Note type name */
  name: string;
  /** Last modified time */
  mod: number;
  /** Sort field index */
  sortf: number;
  /** Last deck used */
  did: string;
  /** Templates (JSON array) */
  tmpls: EchoeTemplateDto[];
  /** Fields (JSON array) */
  flds: EchoeFieldDto[];
  /** CSS */
  css: string;
  /** Note type (0=standard, 1=cloze) */
  type: number;
  /** LaTeX pre */
  latexPre: string;
  /** LaTeX post */
  latexPost: string;
  /** Required fields (JSON) */
  req: string;
  /** Number of notes using this note type */
  noteCount?: number;
}

interface EchoeTemplateDto {
  id: string;
  name: string;
  ord: number;
  qfmt: string;
  afmt: string;
  bqfmt: string;
  bafmt: string;
  did: string;
}

interface EchoeFieldDto {
  name: string;
  ord: number;
  sticky: boolean;
  rtl: boolean;
  font: string;
  size: number;
  description: string;
  mathjax: boolean;
  hidden: boolean;
}
```

---

### Get Note Type By ID - 获取单个笔记类型

```http
GET /api/v1/notetypes/:id
```

**认证**: 需要登录

**参数**

| 字段 | 类型 | 说明 |
|------|------|------|
| id | string | 笔记类型ID |

**响应示例**

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "id": "nt_xxx",
    "name": "Basic",
    "mod": 1234567890,
    "sortf": 0,
    "did": "deck_xxx",
    "tmpls": [...],
    "flds": [...],
    "css": "",
    "type": 0,
    "latexPre": "",
    "latexPost": "",
    "req": "[]"
  }
}
```

**TypeScript 类型**

```typescript
interface EchoeNoteTypeDto {
  id: string;
  name: string;
  mod: number;
  sortf: number;
  did: string;
  tmpls: EchoeTemplateDto[];
  flds: EchoeFieldDto[];
  css: string;
  type: number;
  latexPre: string;
  latexPost: string;
  req: string;
  noteCount?: number;
}
```

---

### Create Note Type - 创建笔记类型

```http
POST /api/v1/notetypes
```

**认证**: 需要登录

**请求体**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| name | string | 是 | 笔记类型名称 |
| cloneFrom | string | 否 | 克隆来源的笔记类型ID |
| css | string | 否 | CSS样式 |
| latexPre | string | 否 | LaTeX前缀 |
| latexPost | string | 否 | LaTeX后缀 |
| flds | object[] | 否 | 字段定义 |
| tmpls | object[] | 否 | 模板定义 |

**请求体示例**

```json
{
  "name": "Basic",
  "flds": [
    { "name": "Front" },
    { "name": "Back" }
  ],
  "tmpls": [
    {
      "name": "Card 1",
      "qfmt": "{{Front}}",
      "afmt": "{{Front}}<hr id=answer>{{Back}}"
    }
  ]
}
```

**响应示例**

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "id": "nt_xxx",
    "name": "Basic",
    "mod": 1234567890,
    "sortf": 0,
    "did": "deck_xxx",
    "tmpls": [...],
    "flds": [...],
    "css": "",
    "type": 0,
    "latexPre": "",
    "latexPost": "",
    "req": "[]"
  }
}
```

**TypeScript 类型**

```typescript
interface CreateEchoeNoteTypeDto {
  /** Note type name */
  name: string;
  /** Clone from note type ID */
  cloneFrom?: string;
  /** CSS */
  css?: string;
  /** LaTeX pre */
  latexPre?: string;
  /** LaTeX post */
  latexPost?: string;
  /** Fields */
  flds?: CreateEchoeFieldDto[];
  /** Templates */
  tmpls?: CreateEchoeTemplateDto[];
}

interface CreateEchoeFieldDto {
  /** Field name */
  name: string;
}

interface CreateEchoeTemplateDto {
  /** Template name */
  name: string;
  /** Question format */
  qfmt: string;
  /** Answer format */
  afmt?: string;
  /** Target deck ID (did) - optional, validated if provided per FR-2 */
  did?: string;
}
```

---

### Update Note Type - 更新笔记类型

```http
PUT /api/v1/notetypes/:id
```

**认证**: 需要登录

**参数**

| 字段 | 类型 | 说明 |
|------|------|------|
| id | string | 笔记类型ID |

**请求体**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| name | string | 否 | 笔记类型名称 |
| css | string | 否 | CSS样式 |
| latexPre | string | 否 | LaTeX前缀 |
| latexPost | string | 否 | LaTeX后缀 |
| flds | object[] | 否 | 新增字段 |
| tmpls | object[] | 否 | 新增模板 |
| fldRenames | object[] | 否 | 字段重命名映射 |

**请求体示例**

```json
{
  "name": "Basic (Updated)",
  "fldRenames": [
    { "from": "Front", "to": "Question" },
    { "from": "Back", "to": "Answer" }
  ]
}
```

**响应示例**

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "id": "nt_xxx",
    "name": "Basic (Updated)",
    "mod": 1234567890,
    "sortf": 0,
    "did": "deck_xxx",
    "tmpls": [...],
    "flds": [...],
    "css": "",
    "type": 0,
    "latexPre": "",
    "latexPost": "",
    "req": "[]"
  }
}
```

**TypeScript 类型**

```typescript
interface UpdateEchoeNoteTypeDto {
  /** Note type name */
  name?: string;
  /** CSS */
  css?: string;
  /** LaTeX pre */
  latexPre?: string;
  /** LaTeX post */
  latexPost?: string;
  /** Fields to add */
  flds?: CreateEchoeFieldDto[];
  /** Templates to add */
  tmpls?: CreateEchoeTemplateDto[];
  /** Field renames: migrate existing notes' fieldsJson keys */
  fldRenames?: EchoeFieldRenameDto[];
}

interface EchoeFieldRenameDto {
  /** Old field name (before rename) */
  from: string;
  /** New field name (after rename) */
  to: string;
}

interface CreateEchoeFieldDto {
  name: string;
}

interface CreateEchoeTemplateDto {
  name: string;
  qfmt: string;
  afmt?: string;
  did?: string;
}
```

---

### Delete Note Type - 删除笔记类型

```http
DELETE /api/v1/notetypes/:id
```

**认证**: 需要登录

**参数**

| 字段 | 类型 | 说明 |
|------|------|------|
| id | string | 笔记类型ID |

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

**TypeScript 类型**

```typescript
interface DeleteNoteTypeResponse {
  success: boolean;
}
```
