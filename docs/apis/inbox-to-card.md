# Inbox to Card API

收件箱转换为闪卡

## Base URL

`/api/v1/inbox`

## Endpoints

### Convert to Card - 转换为卡片

```http
POST /api/v1/inbox/:inboxId/to-card
```

**参数**

| 字段 | 类型 | 说明 |
|------|------|------|
| inboxId | string | 收件箱项目ID |

**请求体**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| deckId | string | 否 | 目标卡组ID（未提供时使用 AI 推荐） |
| notetypeId | string | 否 | 笔记类型ID（未提供时使用 AI 推荐） |
| fieldMapping | object | 否 | 字段映射 |

**字段映射示例**

```json
{
  "front": "Front",
  "back": "Back"
}
```

**TypeScript 类型**

```typescript
interface ConvertInboxToCardDto {
  inboxId: string;
  deckId?: string;
  notetypeId?: string;
  useAiOptimize?: boolean;
  fieldMapping?: Record<string, string>;
}

interface ConvertToCardResponse {
  noteId: string;
  cardId?: string;
  deckId: string;
  notetypeId: string;
  deckName: string;
  notetypeName: string;
  aiRecommended: boolean;
}

// 卡片转换状态枚举
enum CardConversionStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

// 卡片转换来源枚举
enum CardConversionSource {
  MANUAL = 'manual',
  AI = 'ai',
  BATCH = 'batch',
}
```

**响应示例**

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "noteId": "note_xxx",
    "cardId": "card_xxx",
    "deckId": "deck_xxx",
    "notetypeId": "nt_xxx",
    "deckName": "Default",
    "notetypeName": "Basic",
    "aiRecommended": false
  }
}
```

**说明**

- 若未提供 `deckId` 或 `notetypeId`，系统将使用 AI 自动推荐
- AI 推荐会根据收件箱内容与用户历史偏好进行匹配
- 默认字段映射：front 映射到第一个字段，back 映射到第二个字段

---

### 其他相关 DTO 类型

```typescript
// AI 组织响应 DTO
interface AiOrganizeResponseDto {
  optimizedFront: string;
  optimizedBack: string;
  reason: string;
  confidence: number;
  fallback: boolean;
}

// AI 优化请求 DTO
interface AiOptimizeInboxDto {
  inboxId: string;
  notetypeId: string;
  deckId?: string;
}

// AI 优化响应 DTO
interface AiOptimizeResponseDto {
  inboxId: string;
  aiSuggestion: AiOrganizeResponseDto;
}

// 批量 Inbox 转卡片请求 DTO
interface BulkConvertInboxToCardDto {
  inboxIds: string[];
  deckId: string;
  notetypeId: string;
  useAiOptimize?: boolean;
  fieldMapping?: Record<string, string>;
}

// 单个转换结果 DTO
interface ConversionResultDto {
  inboxId: string;
  cardId?: string;
  status: CardConversionStatus;
  error?: string;
}

// 批量转换响应 DTO
interface BulkConversionResponseDto {
  results: ConversionResultDto[];
  successCount: number;
  failedCount: number;
}

// 转换预览 DTO
interface ConversionPreviewDto {
  inboxId: string;
  originalFront: string;
  originalBack: string;
  optimizedFront?: string;
  optimizedBack?: string;
  notetypeId: string;
  notetypeName: string;
  fieldPreview: Record<string, string>;
}
```
