# Config API

全局设置与卡组配置预设

## Base URL

`/api/v1/config`

## Endpoints

### Get Settings - 获取全局设置

```http
GET /api/v1/config
```

**TypeScript 类型定义**

```typescript
interface EchoeGlobalSettingsDto {
  /** Auto-play audio mode: 'front' | 'back' | 'both' | 'never' */
  autoplay: string;
  /** TTS speed (0.5 to 2.0) */
  ttsSpeed: number;
  /** Card flip animation enabled */
  flipAnimation: boolean;
  /** Default font size: 'small' | 'medium' | 'large' */
  fontSize: string;
  /** Theme: 'auto' | 'light' | 'dark' */
  theme: string;
  /** Global daily new card limit */
  newLimit: number;
  /** Global daily review card limit */
  reviewLimit: number;
  /** Daily start hour (0-23) */
  dayStartHour: number;
}
```

**响应示例**

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "autoplay": "both",
    "ttsSpeed": 1.0,
    "flipAnimation": true,
    "fontSize": "medium",
    "theme": "auto",
    "newLimit": 20,
    "reviewLimit": 200,
    "dayStartHour": 4
  }
}
```

---

### Update Settings - 更新全局设置

```http
PUT /api/v1/config
```

**TypeScript 类型定义**

```typescript
interface UpdateEchoeGlobalSettingsDto {
  /** Auto-play audio mode: 'front' | 'back' | 'both' | 'never' */
  autoplay?: string;
  /** TTS speed (0.5 to 2.0) */
  ttsSpeed?: number;
  /** Card flip animation enabled */
  flipAnimation?: boolean;
  /** Default font size: 'small' | 'medium' | 'large' */
  fontSize?: string;
  /** Theme: 'auto' | 'light' | 'dark' */
  theme?: string;
  /** Global daily new card limit */
  newLimit?: number;
  /** Global daily review card limit */
  reviewLimit?: number;
  /** Daily start hour (0-23) */
  dayStartHour?: number;
}
```

**请求示例**

```json
{
  "autoplay": "front",
  "ttsSpeed": 1.2,
  "flipAnimation": false,
  "fontSize": "large",
  "theme": "dark",
  "newLimit": 30,
  "reviewLimit": 300,
  "dayStartHour": 6
}
```

**响应示例**

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "autoplay": "front",
    "ttsSpeed": 1.2,
    "flipAnimation": false,
    "fontSize": "large",
    "theme": "dark",
    "newLimit": 30,
    "reviewLimit": 300,
    "dayStartHour": 6
  }
}
```

---

### Get Presets - 获取配置预设列表

```http
GET /api/v1/config/presets
```

**TypeScript 类型定义**

```typescript
interface EchoeFsrsConfigDto {
  /** Target retention rate (0.7 - 0.99) */
  requestRetention: number;
  /** Maximum interval in days */
  maxInterval: number;
  /** Whether to enable scheduling fuzz */
  enableFuzz: boolean;
  /** Whether to enable short-term scheduler */
  enableShortTerm: boolean;
  /** Learning steps in minutes */
  learningSteps: number[];
  /** Relearning steps in minutes */
  relearningSteps: number[];
}

interface EchoeDeckConfigPresetDto {
  id: string;
  name: string;
  config: {
    new?: {
      perDay?: number;
      learnAhead?: number;
      minSpace?: number;
      leechThreshold?: number;
    };
    rev?: {
      perDay?: number;
      ease4?: number;
      interval?: number;
      hardInterval?: number;
    };
    lapse?: {
      delCount?: number;
      minInt?: number;
      leechAction?: number;
    };
    fsrs?: Partial<EchoeFsrsConfigDto>;
    timer?: number;
    autoplay?: boolean;
    replayq?: boolean;
  };
  createdAt: number;
}
```

**响应示例**

```json
{
  "code": 0,
  "msg": "success",
  "data": [
    {
      "id": "preset_xxx",
      "name": "Default",
      "config": {
        "new": {
          "perDay": 20,
          "learnAhead": 20,
          "minSpace": 1,
          "leechThreshold": 8
        },
        "rev": {
          "perDay": 200,
          "ease4": 1.3,
          "interval": 1,
          "hardInterval": 1
        },
        "lapse": {
          "delCount": 1,
          "minInt": 1,
          "leechAction": 0
        },
        "fsrs": {
          "requestRetention": 0.9,
          "maxInterval": 365,
          "enableFuzz": true,
          "enableShortTerm": false,
          "learningSteps": [1, 10],
          "relearningSteps": [10]
        },
        "timer": 0,
        "autoplay": true,
        "replayq": true
      },
      "createdAt": 1704067200000
    }
  ]
}
```

---

### Save Preset - 保存新预设

```http
POST /api/v1/config/presets
```

**TypeScript 类型定义**

```typescript
interface CreateDeckConfigPresetDto {
  name: string;
  config: {
    new?: {
      perDay?: number;
      learnAhead?: number;
      minSpace?: number;
      leechThreshold?: number;
    };
    rev?: {
      perDay?: number;
      ease4?: number;
      interval?: number;
      hardInterval?: number;
    };
    lapse?: {
      delCount?: number;
      minInt?: number;
      leechAction?: number;
    };
    fsrs?: Partial<EchoeFsrsConfigDto>;
    timer?: number;
    autoplay?: boolean;
    replayq?: boolean;
  };
}
```

**请求示例**

```json
{
  "name": "My Preset",
  "config": {
    "new": {
      "perDay": 10,
      "learnAhead": 15
    },
    "rev": {
      "perDay": 100,
      "ease4": 1.3
    },
    "fsrs": {
      "requestRetention": 0.85,
      "maxInterval": 180
    },
    "timer": 60,
    "autoplay": false
  }
}
```

**响应示例**

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "id": "preset_new_xxx",
    "name": "My Preset",
    "config": {
      "new": {
        "perDay": 10,
        "learnAhead": 15
      },
      "rev": {
        "perDay": 100,
        "ease4": 1.3
      },
      "fsrs": {
        "requestRetention": 0.85,
        "maxInterval": 180,
        "enableFuzz": true,
        "enableShortTerm": false,
        "learningSteps": [1, 10],
        "relearningSteps": [10]
      },
      "timer": 60,
      "autoplay": false,
      "replayq": true
    },
    "createdAt": 1704067200000
  }
}
```

---

### Delete Preset - 删除预设

```http
DELETE /api/v1/config/presets/:id
```

**参数**

| 字段 | 类型 | 说明 |
|------|------|------|
| id | string | 预设ID |

**响应示例**

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "deleted": true
  }
}
```
