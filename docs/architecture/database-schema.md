# Echoe 数据库架构文档

## 概述

Echoe 采用双数据库架构：

- **MySQL**: 存储所有标量数据（用户信息、卡片、笔记、复习记录等）
- **LanceDB**: 存储向量数据（用于语义搜索）

本文档重点说明 MySQL 数据库的表结构设计。数据库设计遵循 Anki 2.1 的数据模型，并进行了适当扩展。

### 字段消费方标识

文档中每个字段会标注消费方：

- **FE**: 前端直接使用（通过 DTO 返回）
- **BE**: 仅后端内部使用
- **Anki**: 仅用于 Anki 导入/导出兼容
- **Sync**: 用于同步功能（暂未实现）

---

## 数据库表概览

| 表名                | 说明                   | 对应 Anki 表                      |
| ------------------- | ---------------------- | --------------------------------- |
| `users`             | 用户账户信息           | -                                 |
| `echoe_col`         | 集合元数据             | col                               |
| `echoe_notes`       | 笔记内容（卡片数据源） | notes                             |
| `echoe_cards`       | 卡片实例               | cards                             |
| `echoe_revlog`      | 复习记录               | revlog                            |
| `echoe_decks`       | 卡片组                 | decks                             |
| `echoe_deck_config` | 卡片组配置             | deck_config                       |
| `echoe_notetypes`   | 笔记类型               | notetypes                         |
| `echoe_templates`   | 卡片模板               | (normalized from notetypes.tmpls) |
| `echoe_media`       | 媒体文件元数据         | media                             |
| `echoe_graves`      | 已删除项目（同步用）   | graves                            |
| `echoe_config`      | 全局配置               | config                            |
| `table_migrations`  | 迁移元数据             | -                                 |

---

## 表详细说明

### 1. users - 用户表

**用途**: 存储用户账户信息，支持多用户系统。

| 字段名           | 类型         | 必填 | 默认值 | 消费方 | 说明                     |
| ---------------- | ------------ | ---- | ------ | ------ | ------------------------ |
| `uid`            | varchar(191) | ✓    | -      | BE     | 用户唯一ID（主键）       |
| `email`          | varchar(255) | -    | -      | FE/BE  | 邮箱地址（可选）         |
| `phone`          | varchar(50)  | -    | -      | BE     | 手机号码（可选）         |
| `password`       | varchar(255) | ✓    | -      | BE     | 加密后的密码             |
| `salt`           | varchar(255) | ✓    | -      | BE     | 密码加密盐值             |
| `nickname`       | varchar(100) | -    | -      | FE     | 用户昵称                 |
| `avatar`         | varchar(500) | -    | -      | FE     | 头像URL                  |
| `status`         | int          | ✓    | 1      | BE     | 账户状态（1=正常）       |
| `deleted_at`     | bigint       | ✓    | 0      | BE     | 软删除时间戳（0=未删除） |
| `sr_enabled`     | boolean      | ✓    | false  | FE     | 是否启用间隔重复学习     |
| `sr_daily_limit` | int          | ✓    | 5      | FE/BE  | 每日学习卡片数量限制     |
| `created_at`     | timestamp    | ✓    | NOW()  | BE     | 创建时间                 |
| `updated_at`     | timestamp    | ✓    | NOW()  | BE     | 更新时间（自动更新）     |

**索引**:

- `email_idx`: 邮箱索引（快速查找用户）
- `phone_idx`: 手机号索引（快速查找用户）
- `deleted_at_idx`: 软删除索引（过滤已删除用户）

---

### 2. echoe_col - 集合元数据表

**用途**: 存储整个 Anki 集合的全局状态和配置，对应 Anki 的 col 表。主要用于 Anki 导入导出。

| 字段名   | 类型   | 必填 | 默认值 | 消费方 | 说明                             |
| -------- | ------ | ---- | ------ | ------ | -------------------------------- |
| `id`     | bigint | ✓    | -      | Anki   | 集合ID（通常为创建时间戳，毫秒） |
| `crt`    | int    | ✓    | -      | Anki   | 集合创建日期（Unix秒，本地午夜） |
| `mod`    | int    | ✓    | -      | Anki   | 最后修改时间（Unix秒）           |
| `scm`    | int    | ✓    | -      | Anki   | Schema修改时间（Unix秒）         |
| `ver`    | int    | ✓    | -      | Anki   | 版本号                           |
| `dty`    | int    | ✓    | -      | Anki   | 数据库类型（Anki未使用）         |
| `usn`    | int    | ✓    | -      | Sync   | 更新序列号（用于同步）           |
| `ls`     | bigint | ✓    | -      | Anki   | 最后同步时间（Unix秒）           |
| `conf`   | text   | ✓    | -      | Anki   | 全局配置（JSON）                 |
| `models` | text   | ✓    | -      | Anki   | 笔记类型定义（JSON）             |
| `decks`  | text   | ✓    | -      | Anki   | 卡片组定义（JSON）               |
| `dconf`  | text   | ✓    | -      | Anki   | 卡片组配置（JSON）               |
| `tags`   | text   | ✓    | -      | Anki   | 标签列表（JSON）                 |

**索引**:

- `usn_idx`: 更新序列号索引（同步查询）

---

### 3. echoe_notes - 笔记表

**用途**: 存储卡片的内容数据，一个笔记可以生成多张卡片。

| 字段名             | 类型         | 必填 | 默认值 | 消费方  | 说明                                            |
| ------------------ | ------------ | ---- | ------ | ------- | ----------------------------------------------- |
| `id`               | bigint       | ✓    | -      | FE/BE   | 笔记ID（毫秒时间戳 \* 1000 + 随机数）           |
| `guid`             | varchar(191) | ✓    | -      | Anki    | 全局唯一ID（40字符十六进制，用于同步）          |
| `mid`              | bigint       | ✓    | -      | FE/BE   | 笔记类型ID                                      |
| `mod`              | int          | ✓    | -      | FE      | 最后修改时间（Unix秒）                          |
| `usn`              | int          | ✓    | -      | Sync    | 更新序列号（同步用）                            |
| `tags`             | text         | ✓    | -      | FE      | 标签列表（JSON数组）                            |
| `flds`             | text         | ✓    | -      | Anki/BE | 字段值（用 `\x1f` 分隔）- 后端搜索用            |
| `sfld`             | varchar(191) | ✓    | -      | BE      | 排序字段（第一个字段的纯文本）- 搜索/排序索引   |
| `csum`             | bigint       | ✓    | -      | BE      | 排序字段的校验和（去重用）                      |
| `flags`            | int          | ✓    | 0      | FE      | 标志位（1=已标记）                              |
| `data`             | text         | ✓    | -      | BE      | 额外数据（JSON）                                |
| `rich_text_fields` | json         | -    | -      | FE      | 富文本字段内容（ProseMirror文档）               |
| `fld_names`        | json         | -    | -      | BE      | 字段名称数组                                    |
| `fields_json`      | json         | ✓    | {}     | FE      | **主存储**：结构化字段存储（字段名 → 纯文本值） |

**索引**:

- `guid_idx`: 全局唯一ID索引（同步查找）
- `mid_idx`: 笔记类型ID索引（按类型查询）
- `usn_idx`: 更新序列号索引
- `sfld_idx`: 排序字段索引（快速搜索）

**字段关系与数据流**:

```
前端输入 → fields_json (主存储) → 派生字段
                              ├── flds (Anki兼容: \x1f分隔)
                              ├── sfld (搜索索引)
                              └── csum (去重校验)

rich_text_fields (富文本) ↔ fields_json (纯文本)
```

**JSON 字段结构**:

#### `tags` - 标签数组

```json
["tag1", "tag2", "leech"]
```

#### `fields_json` - 主字段存储（前端主要使用）

```json
{
  "Front": "What is the capital of France?",
  "Back": "Paris"
}
```

#### `fld_names` - 字段名数组

```json
["Front", "Back"]
```

#### `rich_text_fields` - ProseMirror 富文本文档

```json
{
  "Front": {
    "type": "doc",
    "content": [
      {
        "type": "paragraph",
        "content": [
          { "type": "text", "text": "What is the capital of " },
          { "type": "text", "marks": [{ "type": "bold" }], "text": "France" },
          { "type": "text", "text": "?" }
        ]
      }
    ]
  }
}
```

---

### 4. echoe_cards - 卡片表

**用途**: 存储卡片的学习状态和调度信息，一个笔记可生成多张卡片。

| 字段名        | 类型   | 必填 | 默认值 | 消费方 | 说明                                                  |
| ------------- | ------ | ---- | ------ | ------ | ----------------------------------------------------- |
| `id`          | bigint | ✓    | -      | FE/BE  | 卡片ID（毫秒时间戳 \* 1000 + 随机数）                 |
| `nid`         | bigint | ✓    | -      | FE/BE  | 所属笔记ID                                            |
| `did`         | bigint | ✓    | -      | FE/BE  | 所属卡片组ID                                          |
| `ord`         | int    | ✓    | -      | FE     | 模板序号（对应模板索引）                              |
| `mod`         | int    | ✓    | -      | BE     | 最后修改时间（Unix秒）                                |
| `usn`         | int    | ✓    | -      | Sync   | 更新序列号（同步用）                                  |
| `type`        | int    | ✓    | 0      | FE     | 卡片类型：0=新卡, 1=学习中, 2=复习, 3=重学            |
| `queue`       | int    | ✓    | 0      | FE     | 队列状态：0=新卡, 1=学习, 2=复习, -1=暂停, -2/-3=埋藏 |
| `due`         | bigint | ✓    | 0      | FE/BE  | 到期时间（Unix毫秒时间戳）                            |
| `ivl`         | int    | ✓    | 0      | FE     | 间隔天数                                              |
| `factor`      | int    | ✓    | 0      | BE     | 难度因子（千分比，如2500=2.5）                        |
| `reps`        | int    | ✓    | 0      | FE     | 复习次数                                              |
| `lapses`      | int    | ✓    | 0      | FE     | 遗忘次数                                              |
| `left`        | int    | ✓    | 0      | BE     | 学习步骤剩余（位存储）                                |
| `odue`        | bigint | ✓    | 0      | Anki   | 原始到期时间（筛选牌组用）                            |
| `odid`        | bigint | ✓    | 0      | Anki   | 原始牌组ID（筛选牌组用）                              |
| `flags`       | int    | ✓    | 0      | FE     | 标志位                                                |
| `data`        | text   | ✓    | -      | BE     | 额外数据（JSON）                                      |
| `stability`   | double | ✓    | 0      | BE     | **FSRS**: 稳定性（天）                                |
| `difficulty`  | double | ✓    | 0      | BE     | **FSRS**: 难度（0-1）                                 |
| `last_review` | bigint | ✓    | 0      | BE     | **FSRS**: 上次复习时间（Unix毫秒）                    |

**索引**:

- `nid_idx`: 笔记ID索引（查询笔记的所有卡片）
- `did_idx`: 卡片组ID索引（查询牌组内的卡片）
- `usn_idx`: 更新序列号索引
- `queue_idx`: 队列状态索引（按状态筛选）
- `due_idx`: 到期时间索引（查询到期卡片）
- `did_queue_due_idx`: 复合索引（牌组+队列+到期时间）
- `did_last_review_idx`: 复合索引（牌组+上次复习时间）
- `did_stability_idx`: 复合索引（牌组+稳定性）

**调度状态说明**:

- `type` 和 `queue` 决定卡片的调度状态
- `due` 控制卡片何时出现
- FSRS 字段（`stability`, `difficulty`, `last_review`）由后端算法计算，前端不直接使用

---

### 5. echoe_revlog - 复习记录表

**用途**: 记录每次复习的详细信息，用于统计分析和撤销功能。

| 字段名            | 类型   | 必填 | 默认值 | 消费方 | 说明                                               |
| ----------------- | ------ | ---- | ------ | ------ | -------------------------------------------------- |
| `id`              | bigint | ✓    | -      | BE     | 记录ID（毫秒时间戳 \* 1000 + 随机数）              |
| `cid`             | bigint | ✓    | -      | BE     | 卡片ID                                             |
| `usn`             | int    | ✓    | -      | Sync   | 更新序列号（同步用）                               |
| `ease`            | int    | ✓    | -      | FE     | 评分：1=重来, 2=困难, 3=良好, 4=简单               |
| `ivl`             | int    | ✓    | -      | BE     | 本次复习后的间隔（天）                             |
| `last_ivl`        | int    | ✓    | -      | BE     | 本次复习前的间隔（天）                             |
| `factor`          | int    | ✓    | -      | BE     | 本次复习后的难度因子                               |
| `time`            | int    | ✓    | -      | FE     | 本次复习耗时（毫秒）                               |
| `type`            | int    | ✓    | -      | BE     | 复习类型：0=学习, 1=复习, 2=重学, 3=筛选, 4=自定义 |
| `stability`       | double | ✓    | 0      | BE     | **FSRS**: 复习后稳定性                             |
| `difficulty`      | double | ✓    | 0      | BE     | **FSRS**: 复习后难度                               |
| `last_review`     | bigint | ✓    | 0      | BE     | **FSRS**: 本次复习时间                             |
| `pre_due`         | bigint | ✓    | 0      | BE     | **撤销**: 复习前到期时间                           |
| `pre_ivl`         | int    | ✓    | 0      | BE     | **撤销**: 复习前间隔                               |
| `pre_factor`      | int    | ✓    | 0      | BE     | **撤销**: 复习前难度因子                           |
| `pre_reps`        | int    | ✓    | 0      | BE     | **撤销**: 复习前复习次数                           |
| `pre_lapses`      | int    | ✓    | 0      | BE     | **撤销**: 复习前遗忘次数                           |
| `pre_left`        | int    | ✓    | 0      | BE     | **撤销**: 复习前剩余步骤                           |
| `pre_type`        | int    | ✓    | 0      | BE     | **撤销**: 复习前卡片类型                           |
| `pre_queue`       | int    | ✓    | 0      | BE     | **撤销**: 复习前队列状态                           |
| `pre_stability`   | double | ✓    | 0      | BE     | **撤销**: 复习前稳定性                             |
| `pre_difficulty`  | double | ✓    | 0      | BE     | **撤销**: 复习前难度                               |
| `pre_last_review` | bigint | ✓    | 0      | BE     | **撤销**: 复习前上次复习时间                       |

**索引**:

- `cid_idx`: 卡片ID索引（查询卡片的复习历史）
- `usn_idx`: 更新序列号索引

**功能说明**:

- `pre_*` 字段用于撤销功能，存储复习前的完整状态快照
- FSRS 字段用于算法调优和记忆曲线分析

---

### 6. echoe_decks - 卡片组表

**用途**: 存储卡片组的层级结构和配置。

| 字段名       | 类型         | 必填 | 默认值 | 消费方 | 说明                             |
| ------------ | ------------ | ---- | ------ | ------ | -------------------------------- |
| `id`         | bigint       | ✓    | -      | FE/BE  | 卡片组ID（毫秒时间戳）           |
| `name`       | varchar(191) | ✓    | -      | FE     | 卡片组名称（支持 `::` 表示层级） |
| `conf`       | bigint       | ✓    | 1      | BE     | 卡片组配置ID                     |
| `extend_new` | int          | ✓    | 20     | BE     | 新卡扩展限制                     |
| `extend_rev` | int          | ✓    | 200    | BE     | 复习扩展限制                     |
| `usn`        | int          | ✓    | -      | Sync   | 更新序列号（同步用）             |
| `lim`        | int          | ✓    | 0      | BE     | 每日限制（已废弃，使用配置）     |
| `collapsed`  | tinyint      | ✓    | 0      | FE     | 是否折叠（UI显示）               |
| `dyn`        | tinyint      | ✓    | 0      | FE     | 类型：0=普通牌组, 1=筛选牌组     |
| `mod`        | int          | ✓    | -      | BE     | 最后修改时间（Unix秒）           |
| `desc`       | text         | ✓    | -      | FE     | 卡片组描述                       |
| `mid`        | bigint       | ✓    | 0      | BE     | 上次使用的笔记类型ID             |

**索引**:

- `name_idx`: 名称索引（快速查找牌组）
- `usn_idx`: 更新序列号索引

---

### 7. echoe_deck_config - 卡片组配置表

**用途**: 存储卡片组的学习参数配置。

| 字段名         | 类型         | 必填 | 默认值 | 消费方 | 说明                                           |
| -------------- | ------------ | ---- | ------ | ------ | ---------------------------------------------- |
| `id`           | bigint       | ✓    | -      | FE/BE  | 配置ID                                         |
| `name`         | varchar(191) | ✓    | -      | FE     | 配置名称                                       |
| `replayq`      | tinyint      | ✓    | 1      | BE     | 回答时重播音频队列                             |
| `timer`        | int          | ✓    | 0      | FE     | 显示计时器（0=关, 1=开）                       |
| `max_taken`    | int          | ✓    | 60     | BE     | 最大答题时间（秒）                             |
| `autoplay`     | tinyint      | ✓    | 1      | FE     | 自动播放音频（0=从不, 1=正面, 2=背面, 3=双面） |
| `tts_speed`    | tinyint      | ✓    | 1      | FE     | TTS语速（0-4，映射到0.5-2.0）                  |
| `mod`          | int          | ✓    | -      | BE     | 最后修改时间（Unix秒）                         |
| `usn`          | int          | ✓    | -      | Sync   | 更新序列号（同步用）                           |
| `new_config`   | text         | ✓    | -      | FE/BE  | 新卡配置（JSON）                               |
| `rev_config`   | text         | ✓    | -      | FE/BE  | 复习配置（JSON）                               |
| `lapse_config` | text         | ✓    | -      | FE/BE  | 遗忘配置（JSON）                               |

**索引**:

- `name_idx`: 名称索引
- `usn_idx`: 更新序列号索引

**JSON 字段结构**:

#### `new_config` - 新卡配置

```typescript
interface NewCardConfig {
  steps: number[]; // 学习步骤（分钟），如 [1, 10]
  initialInterval: number; // 初始间隔（天）
  graduatingInterval: number; // 毕业间隔（天）
  easyInterval: number; // 简单间隔（天）
  perDay: number; // 每日新卡数量
  bury?: boolean; // 是否自动埋藏兄弟卡片
}
```

#### `rev_config` - 复习配置

```typescript
interface ReviewConfig {
  perDay: number; // 每日复习上限
  easyBonus: number; // 简单奖励因子
  intervalModifier: number; // 间隔修正因子
  maxInterval: number; // 最大间隔（天）
}
```

#### `lapse_config` - 遗忘配置

```typescript
interface LapseConfig {
  steps: number[]; // 重学步骤（分钟）
  minInterval: number; // 最小间隔（天）
  mult: number; // 间隔衰减因子
  leechThreshold: number; // 水蛭阈值
  leechAction: number; // 水蛭处理（0=暂停, 1=标记）
}
```

---

### 8. echoe_notetypes - 笔记类型表

**用途**: 定义笔记的字段结构和卡片模板。

| 字段名       | 类型         | 必填 | 默认值 | 消费方 | 说明                   |
| ------------ | ------------ | ---- | ------ | ------ | ---------------------- |
| `id`         | bigint       | ✓    | -      | FE/BE  | 笔记类型ID             |
| `name`       | varchar(191) | ✓    | -      | FE     | 笔记类型名称           |
| `mod`        | int          | ✓    | -      | BE     | 最后修改时间（Unix秒） |
| `usn`        | int          | ✓    | -      | Sync   | 更新序列号（同步用）   |
| `sortf`      | int          | ✓    | 0      | BE     | 排序字段索引           |
| `did`        | bigint       | ✓    | 0      | BE     | 默认卡片组ID           |
| `tmpls`      | text         | ✓    | -      | FE     | 模板数组（JSON）       |
| `flds`       | text         | ✓    | -      | FE     | 字段定义数组（JSON）   |
| `css`        | text         | ✓    | -      | FE     | 卡片样式（CSS）        |
| `type`       | int          | ✓    | 0      | FE     | 类型：0=标准, 1=填空   |
| `latex_pre`  | text         | ✓    | -      | BE     | LaTeX 前言             |
| `latex_post` | text         | ✓    | -      | BE     | LaTeX 后记             |
| `req`        | text         | ✓    | -      | BE     | 必填字段要求（JSON）   |

**索引**:

- `name_idx`: 名称索引
- `usn_idx`: 更新序列号索引

**JSON 字段结构**:

#### `flds` - 字段定义数组

```typescript
interface FieldDefinition {
  name: string; // 字段名称
  ord: number; // 序号
  sticky: boolean; // 是否粘性（编辑下一张笔记时保留）
  rtl: boolean; // 是否从右到左
  font: string; // 字体
  size: number; // 字号
  description: string; // 描述
  mathjax: boolean; // 是否启用 MathJax
  hidden: boolean; // 是否隐藏
}

// 示例
[
  {
    name: 'Front',
    ord: 0,
    sticky: false,
    rtl: false,
    font: 'Arial',
    size: 20,
    description: '',
    mathjax: false,
    hidden: false,
  },
  {
    name: 'Back',
    ord: 1,
    sticky: false,
    rtl: false,
    font: 'Arial',
    size: 20,
    description: '',
    mathjax: false,
    hidden: false,
  },
];
```

#### `tmpls` - 模板数组（存储在 echoe_notetypes.tmpls）

```typescript
interface Template {
  name: string; // 模板名称
  ord: number; // 序号
  qfmt: string; // 问题格式（正面模板）
  afmt: string; // 答案格式（背面模板）
  bqfmt: string; // 浏览器问题格式
  bafmt: string; // 浏览器答案格式
  did: number; // 覆盖卡片组ID
}

// 示例
[
  {
    name: 'Card 1',
    ord: 0,
    qfmt: '{{Front}}',
    afmt: '{{FrontSide}}\n\n<hr>\n\n{{Back}}',
    bqfmt: '',
    bafmt: '',
    did: 0,
  },
];
```

---

### 9. echoe_templates - 卡片模板表

**用途**: 卡片模板的规范化存储，便于查询和管理。

| 字段名  | 类型         | 必填 | 默认值 | 消费方 | 说明                   |
| ------- | ------------ | ---- | ------ | ------ | ---------------------- |
| `id`    | bigint       | ✓    | -      | BE     | 模板ID                 |
| `ntid`  | bigint       | ✓    | -      | BE     | 所属笔记类型ID         |
| `name`  | varchar(191) | ✓    | -      | FE     | 模板名称               |
| `ord`   | int          | ✓    | -      | FE     | 模板序号（从0开始）    |
| `qfmt`  | text         | ✓    | -      | FE     | 问题格式（正面模板）   |
| `afmt`  | text         | ✓    | -      | FE     | 答案格式（背面模板）   |
| `bqfmt` | text         | ✓    | -      | BE     | 浏览器问题格式         |
| `bafmt` | text         | ✓    | -      | BE     | 浏览器答案格式         |
| `did`   | bigint       | ✓    | 0      | BE     | 覆盖卡片组ID（可选）   |
| `mod`   | int          | ✓    | -      | BE     | 最后修改时间（Unix秒） |
| `usn`   | int          | ✓    | -      | Sync   | 更新序列号（同步用）   |

**业务说明**:

- Anki 原生将模板存储在 `notetypes.tmpls` JSON 中
- 此表提供规范化存储，DTO 返回时会组装为 `tmpls` 数组

---

### 10. echoe_media - 媒体文件表

**用途**: 存储卡片中使用的媒体文件元数据。

| 字段名              | 类型         | 必填 | 默认值 | 消费方 | 说明               |
| ------------------- | ------------ | ---- | ------ | ------ | ------------------ |
| `id`                | int          | ✓    | AUTO   | BE     | 媒体文件ID         |
| `filename`          | varchar(191) | ✓    | -      | FE     | 存储文件名         |
| `original_filename` | varchar(191) | ✓    | -      | FE     | 原始上传文件名     |
| `size`              | int          | ✓    | -      | BE     | 文件大小（字节）   |
| `mime_type`         | varchar(100) | ✓    | -      | BE     | MIME类型           |
| `hash`              | varchar(64)  | ✓    | -      | BE     | SHA1哈希值         |
| `created_at`        | int          | ✓    | -      | BE     | 创建时间（Unix秒） |
| `used_in_cards`     | tinyint      | ✓    | 0      | BE     | 是否被卡片引用     |

---

### 11. echoe_graves - 已删除项目表

**用途**: 记录已删除的对象，用于同步时传播删除操作。

| 字段名 | 类型   | 必填 | 默认值 | 消费方 | 说明                             |
| ------ | ------ | ---- | ------ | ------ | -------------------------------- |
| `id`   | int    | ✓    | AUTO   | BE     | 行ID                             |
| `usn`  | int    | ✓    | -      | Sync   | 更新序列号（同步用）             |
| `oid`  | bigint | ✓    | -      | Sync   | 原对象ID（牌组/笔记/卡片ID）     |
| `type` | int    | ✓    | -      | Sync   | 对象类型：0=牌组, 1=笔记, 2=卡片 |

---

### 12. echoe_config - 全局配置表

**用途**: 存储应用的键值对配置。

| 字段名  | 类型         | 必填 | 默认值 | 消费方 | 说明               |
| ------- | ------------ | ---- | ------ | ------ | ------------------ |
| `key`   | varchar(191) | ✓    | -      | FE/BE  | 配置键（主键）     |
| `value` | text         | ✓    | -      | FE/BE  | 配置值（JSON格式） |

---

### 13. table_migrations - 迁移元数据表

**用途**: 追踪每个表的数据库迁移版本。

| 字段名             | 类型         | 必填 | 默认值 | 消费方 | 说明         |
| ------------------ | ------------ | ---- | ------ | ------ | ------------ |
| `table_name`       | varchar(191) | ✓    | -      | BE     | 表名（主键） |
| `current_version`  | int          | ✓    | -      | BE     | 当前版本号   |
| `last_migrated_at` | timestamp    | ✓    | NOW()  | BE     | 最后迁移时间 |

---

## 核心数据关系

### 实体关系图

```
users
  │
  └─→ echoe_col (全局配置)
  │
  └─→ echoe_decks (卡片组)
        │
        └─→ echoe_deck_config (配置)
        │
        └─→ echoe_cards (卡片)
              │
              └─→ echoe_notes (笔记)
              │     │
              │     └─→ echoe_notetypes (笔记类型)
              │           │
              │           └─→ echoe_templates (模板)
              │
              └─→ echoe_revlog (复习记录)
```

### 数据流：前端 ↔ 后端 ↔ 数据库

```
┌─────────────────────────────────────────────────────────────────┐
│                           前端 (FE)                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │ EchoeNoteDto│  │ EchoeCardDto│  │StudyQueueDto│             │
│  │  - fields   │  │  - type     │  │  - front    │             │
│  │  - tags     │  │  - queue    │  │  - back     │             │
│  │  - richText │  │  - due      │  │  (渲染后)   │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
└─────────────────────────────────────────────────────────────────┘
                              ↕ DTO
┌─────────────────────────────────────────────────────────────────┐
│                           后端 (BE)                              │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ mapNoteToDto: fieldsJson → DTO.fields                    │  │
│  │ renderTemplate: qfmt + fields → StudyQueueItemDto.front  │  │
│  │ FSRS 算法: stability/difficulty → scheduling             │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              ↕ SQL
┌─────────────────────────────────────────────────────────────────┐
│                          数据库 (MySQL)                          │
│  fields_json: 主存储    flds: Anki兼容    sfld: 搜索索引        │
│  stability/difficulty: FSRS算法字段                             │
└─────────────────────────────────────────────────────────────────┘
```

---

## 设计原则

1. **Anki 兼容性**: 表结构设计遵循 Anki 2.1 数据模型，便于数据导入导出
2. **扩展性**: 在兼容 Anki 的基础上，增加 FSRS 字段、富文本字段等扩展
3. **主存储分离**: `fields_json` 作为前端主存储，`flds/sfld/csum` 用于后端搜索和 Anki 兼容
4. **索引优化**: 针对高频查询场景建立合适的索引
5. **软删除**: 用户表使用软删除，保留数据恢复能力
6. **同步支持**: 保留 `usn` 字段支持未来可能的同步功能

---