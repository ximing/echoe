# Echoe 数据库架构文档（按最新代码生成）

> 代码基准：`apps/server/src/db/schema/*.ts`
> 
> 生成日期：2026-03-15

## 概述

Echoe 采用双存储架构：

- **MySQL**：存储用户、卡片、笔记、复习记录等标量数据（本文档覆盖范围）
- **LanceDB**：存储向量数据（语义检索）

当前 MySQL schema 基于 Anki 2.1 模型扩展实现，重点支持：

- 多租户（`uid` 维度隔离）
- Anki 导入导出兼容（`flds/sfld/csum` 等字段）
- FSRS 调度（`stability/difficulty/last_review`）

---

## 核心设计约定

### 1) ID 设计（内部主键 + 业务 ID）

大多数业务表同时包含两类标识：

- `id`：`int` 自增，作为表内部主键
- `*_id`：`varchar(191)` 业务 ID（如 `note_id`/`card_id`/`deck_id`），跨表关联以业务 ID 为主

### 2) 多租户隔离

除 `table_migrations` 外，核心业务表均有 `uid` 字段；并通过复合索引/唯一约束保证用户级隔离和查询性能。

### 3) Anki 兼容字段

`echoe_notes` 中同时保留：

- `fields_json`：结构化主存储（字段名 -> 文本）
- `rich_text_fields`：富文本 ProseMirror JSON
- `flds/sfld/csum/fld_names`：兼容 Anki 及搜索/去重链路

### 4) FSRS 字段扩展

- `echoe_cards`：存储当前卡片 FSRS 状态
- `echoe_revlog`：存储复习后的 FSRS 状态及复习前快照（支持撤销）

---

## 数据表总览

| 表名 | 主键 | 业务标识 | 说明 | Anki 对应 |
| --- | --- | --- | --- | --- |
| `users` | `uid` | `uid` | 用户账号与学习开关配置 | - |
| `echoe_col` | `id` | `col_id` | 用户集合级配置快照 | `col` |
| `echoe_notes` | `id` | `note_id` | 笔记内容（卡片源） | `notes` |
| `echoe_cards` | `id` | `card_id` | 卡片实例与调度状态 | `cards` |
| `echoe_revlog` | `id` | `revlog_id` | 复习历史与撤销快照 | `revlog` |
| `echoe_decks` | `id` | `deck_id` | 牌组定义与层级 | `decks` |
| `echoe_deck_config` | `id` | `deck_config_id` | 牌组学习配置 | `deck_config` |
| `echoe_notetypes` | `id` | `note_type_id` | 笔记类型定义 | `notetypes` |
| `echoe_templates` | `id` | `template_id` | 模板规范化存储 | `notetypes.tmpls`（拆表） |
| `echoe_media` | `id` | `media_id` | 媒体文件元数据 | `media` |
| `echoe_graves` | `id` | `grave_id` | 删除墓碑记录 | `graves` |
| `echoe_config` | `(uid, key)` | - | 用户级键值配置 | `config` |
| `table_migrations` | `table_name` | - | 迁移版本元数据 | - |

---

## 表结构详情

### 1. `users`

| 列名 | 类型 | 可空 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `uid` | varchar(191) | 否 | - | 主键，用户 ID |
| `email` | varchar(255) | 是 | - | 邮箱 |
| `phone` | varchar(50) | 是 | - | 手机号 |
| `password` | varchar(255) | 否 | - | 密码哈希 |
| `salt` | varchar(255) | 否 | - | 密码盐值 |
| `nickname` | varchar(100) | 是 | - | 昵称 |
| `avatar` | varchar(500) | 是 | - | 头像 URL |
| `status` | int | 否 | `1` | 账户状态 |
| `deleted_at` | bigint | 否 | `0` | 软删除时间戳 |
| `sr_enabled` | boolean | 否 | `false` | 是否启用间隔重复 |
| `sr_daily_limit` | int | 否 | `5` | 每日学习上限 |
| `created_at` | timestamp(3) | 否 | `CURRENT_TIMESTAMP(3)` | 创建时间 |
| `updated_at` | timestamp(3) | 否 | `CURRENT_TIMESTAMP(3)` | 更新时间（on update） |

索引：

- `email_idx(email)`
- `phone_idx(phone)`
- `deleted_at_idx(deleted_at)`

---

### 2. `echoe_col`

| 列名 | 类型 | 可空 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `id` | int | 否 | AUTO_INCREMENT | 主键（内部自增） |
| `col_id` | varchar(191) | 否 | - | 业务 ID（唯一） |
| `uid` | varchar(191) | 否 | - | 用户 ID（唯一） |
| `crt` | int | 否 | - | 集合创建日（Unix 秒） |
| `mod` | int | 否 | - | 最后修改时间（Unix 秒） |
| `scm` | int | 否 | - | schema 修改时间（Unix 秒） |
| `ver` | int | 否 | - | 版本号 |
| `dty` | int | 否 | - | 数据库类型标记 |
| `usn` | int | 否 | - | 更新序列号 |
| `ls` | bigint | 否 | - | 最后同步时间 |
| `conf` | text | 否 | - | JSON 字符串 |
| `models` | text | 否 | - | JSON 字符串 |
| `decks` | text | 否 | - | JSON 字符串 |
| `dconf` | text | 否 | - | JSON 字符串 |
| `tags` | text | 否 | - | JSON 字符串 |

约束与索引：

- 唯一：`col_id`、`uid`
- 索引：`usn_idx(usn)`、`uid_col_id_idx(uid, col_id)`

---

### 3. `echoe_notes`

| 列名 | 类型 | 可空 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `id` | int | 否 | AUTO_INCREMENT | 主键（内部自增） |
| `note_id` | varchar(191) | 否 | - | 业务 ID（唯一） |
| `uid` | varchar(191) | 否 | - | 用户 ID |
| `guid` | varchar(191) | 否 | - | Anki 同步 GUID |
| `mid` | varchar(191) | 否 | - | 笔记类型 ID（FK -> `echoe_notetypes.note_type_id`） |
| `mod` | int | 否 | - | 最后修改时间（Unix 秒） |
| `usn` | int | 否 | - | 更新序列号 |
| `tags` | text | 否 | - | 标签 JSON 数组字符串 |
| `flds` | text | 否 | - | 字段拼接字符串（`\x1f` 分隔） |
| `sfld` | varchar(191) | 否 | - | 排序字段（首字段纯文本） |
| `csum` | varchar(191) | 否 | - | 校验和（去重） |
| `flags` | int | 否 | `0` | 标记位 |
| `data` | text | 否 | - | 扩展 JSON 字符串 |
| `rich_text_fields` | json | 是 | - | 富文本字段（ProseMirror） |
| `fld_names` | json | 是 | - | 字段名数组 |
| `fields_json` | json | 否 | `{}` | 结构化主字段存储 |

约束与索引：

- 唯一：`note_id`、`uid_guid_unique(uid, guid)`
- 索引：
  - `guid_idx(guid)`
  - `mid_idx(mid)`
  - `usn_idx(usn)`
  - `sfld_idx(sfld)`
  - `uid_note_id_idx(uid, note_id)`
  - `uid_mid_idx(uid, mid)`
  - `uid_sfld_idx(uid, sfld)`
  - `uid_mod_idx(uid, mod)`

---

### 4. `echoe_cards`

| 列名 | 类型 | 可空 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `id` | int | 否 | AUTO_INCREMENT | 主键（内部自增） |
| `card_id` | varchar(191) | 否 | - | 业务 ID（唯一） |
| `uid` | varchar(191) | 否 | - | 用户 ID |
| `nid` | varchar(191) | 否 | - | 笔记 ID（FK -> `echoe_notes.note_id`） |
| `did` | varchar(191) | 否 | - | 牌组 ID（FK -> `echoe_decks.deck_id`） |
| `ord` | int | 否 | - | 模板序号 |
| `mod` | int | 否 | - | 最后修改时间（Unix 秒） |
| `usn` | int | 否 | - | 更新序列号 |
| `type` | int | 否 | `0` | 卡片类型 |
| `queue` | int | 否 | `0` | 队列状态 |
| `due` | bigint | 否 | `0` | 到期时间（Unix ms） |
| `ivl` | int | 否 | `0` | 间隔天数 |
| `factor` | int | 否 | `0` | 难度因子（permille） |
| `reps` | int | 否 | `0` | 复习次数 |
| `lapses` | int | 否 | `0` | 遗忘次数 |
| `left` | int | 否 | `0` | 学习步骤剩余 |
| `odue` | bigint | 否 | `0` | 原始到期时间 |
| `odid` | varchar(191) | 否 | `''` | 原始牌组 ID |
| `flags` | int | 否 | `0` | 标记位 |
| `data` | text | 否 | - | 扩展 JSON 字符串 |
| `stability` | double | 否 | `0` | FSRS 稳定性 |
| `difficulty` | double | 否 | `0` | FSRS 难度 |
| `last_review` | bigint | 否 | `0` | FSRS 上次复习时间（Unix ms） |

索引：

- `nid_idx(nid)`
- `did_idx(did)`
- `usn_idx(usn)`
- `queue_idx(queue)`
- `due_idx(due)`
- `did_queue_due_idx(did, queue, due)`
- `did_last_review_idx(did, last_review)`
- `did_stability_idx(did, stability)`
- `uid_card_id_idx(uid, card_id)`
- `uid_nid_idx(uid, nid)`
- `uid_did_queue_due_idx(uid, did, queue, due)`
- `uid_last_review_idx(uid, last_review)`

---

### 5. `echoe_revlog`

| 列名 | 类型 | 可空 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `id` | int | 否 | AUTO_INCREMENT | 主键（内部自增） |
| `revlog_id` | varchar(191) | 否 | - | 业务 ID（唯一） |
| `source_revlog_id` | bigint | 是 | - | 原始 revlog ID（导入来源） |
| `cid` | varchar(191) | 否 | - | 卡片 ID（FK -> `echoe_cards.card_id`） |
| `uid` | varchar(191) | 否 | - | 用户 ID |
| `usn` | int | 否 | - | 更新序列号 |
| `ease` | int | 否 | - | 用户评分（1-4） |
| `ivl` | int | 否 | - | 复习后间隔 |
| `last_ivl` | int | 否 | - | 复习前间隔 |
| `factor` | int | 否 | - | 复习后难度因子 |
| `time` | int | 否 | - | 作答耗时（ms） |
| `type` | int | 否 | - | 复习类型 |
| `stability` | double | 否 | `0` | 复习后稳定性 |
| `difficulty` | double | 否 | `0` | 复习后难度 |
| `last_review` | bigint | 否 | `0` | 复习后时间（Unix ms） |
| `pre_due` | bigint | 否 | `0` | 复习前 due |
| `pre_ivl` | int | 否 | `0` | 复习前 ivl |
| `pre_factor` | int | 否 | `0` | 复习前 factor |
| `pre_reps` | int | 否 | `0` | 复习前 reps |
| `pre_lapses` | int | 否 | `0` | 复习前 lapses |
| `pre_left` | int | 否 | `0` | 复习前 left |
| `pre_type` | int | 否 | `0` | 复习前 type |
| `pre_queue` | int | 否 | `0` | 复习前 queue |
| `pre_stability` | double | 否 | `0` | 复习前 stability |
| `pre_difficulty` | double | 否 | `0` | 复习前 difficulty |
| `pre_last_review` | bigint | 否 | `0` | 复习前 last_review |

索引：

- `cid_idx(cid)`
- `usn_idx(usn)`
- `uid_idx(uid)`
- `uid_revlog_id_idx(uid, revlog_id)`
- `uid_cid_idx(uid, cid)`
- `uid_source_revlog_id_idx(uid, source_revlog_id)`

---

### 6. `echoe_deck_config`

| 列名 | 类型 | 可空 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `id` | int | 否 | AUTO_INCREMENT | 主键（内部自增） |
| `deck_config_id` | varchar(191) | 否 | - | 业务 ID（唯一） |
| `uid` | varchar(191) | 否 | - | 用户 ID |
| `name` | varchar(191) | 否 | - | 配置名称 |
| `replayq` | tinyint | 否 | `1` | 回答时音频回放策略 |
| `timer` | int | 否 | `0` | 是否显示计时器 |
| `max_taken` | int | 否 | `60` | 最大作答时间（秒） |
| `autoplay` | tinyint | 否 | `1` | 自动播放音频策略 |
| `tts_speed` | tinyint | 否 | `1` | TTS 语速 |
| `mod` | int | 否 | - | 最后修改时间（Unix 秒） |
| `usn` | int | 否 | - | 更新序列号 |
| `new_config` | text | 否 | - | 新卡配置 JSON |
| `rev_config` | text | 否 | - | 复习配置 JSON |
| `lapse_config` | text | 否 | - | 遗忘配置 JSON |

约束与索引：

- 唯一：`deck_config_id`、`uid_name_unique(uid, name)`
- 索引：`name_idx(name)`、`usn_idx(usn)`、`uid_deck_config_id_idx(uid, deck_config_id)`

---

### 7. `echoe_decks`

| 列名 | 类型 | 可空 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `id` | int | 否 | AUTO_INCREMENT | 主键（内部自增） |
| `deck_id` | varchar(191) | 否 | - | 业务 ID（唯一） |
| `uid` | varchar(191) | 否 | - | 用户 ID |
| `name` | varchar(191) | 否 | - | 牌组名称（支持 `::` 层级） |
| `conf` | varchar(191) | 否 | - | 配置 ID（FK -> `echoe_deck_config.deck_config_id`） |
| `extend_new` | int | 否 | `20` | 新卡扩展额度 |
| `extend_rev` | int | 否 | `200` | 复习扩展额度 |
| `usn` | int | 否 | - | 更新序列号 |
| `lim` | int | 否 | `0` | 旧版限制字段 |
| `collapsed` | tinyint | 否 | `0` | UI 折叠状态 |
| `dyn` | tinyint | 否 | `0` | 动态牌组标记 |
| `mod` | int | 否 | - | 最后修改时间（Unix 秒） |
| `desc` | text | 否 | - | 牌组描述 |
| `mid` | varchar(191) | 是 | - | 最近使用笔记类型（FK -> `echoe_notetypes.note_type_id`） |

约束与索引：

- 唯一：`deck_id`、`uid_name_unique(uid, name)`
- 索引：`name_idx(name)`、`usn_idx(usn)`、`uid_deck_id_idx(uid, deck_id)`

---

### 8. `echoe_notetypes`

| 列名 | 类型 | 可空 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `id` | int | 否 | AUTO_INCREMENT | 主键（内部自增） |
| `note_type_id` | varchar(191) | 否 | - | 业务 ID（唯一） |
| `uid` | varchar(191) | 否 | - | 用户 ID |
| `name` | varchar(191) | 否 | - | 笔记类型名称 |
| `mod` | int | 否 | - | 最后修改时间（Unix 秒） |
| `usn` | int | 否 | - | 更新序列号 |
| `sortf` | int | 否 | `0` | 排序字段序号 |
| `did` | varchar(191) | 否 | `''` | 默认牌组 ID |
| `tmpls` | text | 否 | - | 模板数组 JSON |
| `flds` | text | 否 | - | 字段定义数组 JSON |
| `css` | text | 否 | - | 卡片 CSS |
| `type` | int | 否 | `0` | 类型（标准/填空） |
| `latex_pre` | text | 否 | - | LaTeX 前置 |
| `latex_post` | text | 否 | - | LaTeX 后置 |
| `req` | text | 否 | - | 必填规则 JSON |

约束与索引：

- 唯一：`note_type_id`、`uid_name_unique(uid, name)`
- 索引：`name_idx(name)`、`usn_idx(usn)`、`uid_note_type_id_idx(uid, note_type_id)`

---

### 9. `echoe_templates`

| 列名 | 类型 | 可空 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `id` | int | 否 | AUTO_INCREMENT | 主键（内部自增） |
| `template_id` | varchar(191) | 否 | - | 业务 ID（唯一） |
| `uid` | varchar(191) | 否 | - | 用户 ID |
| `ntid` | varchar(191) | 否 | - | 笔记类型 ID（FK -> `echoe_notetypes.note_type_id`） |
| `name` | varchar(191) | 否 | - | 模板名 |
| `ord` | int | 否 | - | 模板序号（0-based） |
| `qfmt` | text | 否 | - | 正面模板 |
| `afmt` | text | 否 | - | 背面模板 |
| `bqfmt` | text | 否 | - | 浏览器正面模板 |
| `bafmt` | text | 否 | - | 浏览器背面模板 |
| `did` | varchar(191) | 是 | - | 覆盖牌组 ID（FK -> `echoe_decks.deck_id`） |
| `mod` | int | 否 | - | 最后修改时间（Unix 秒） |
| `usn` | int | 否 | - | 更新序列号 |

约束与索引：

- 唯一：`template_id`、`uid_ntid_ord_unique(uid, ntid, ord)`
- 索引：`ntid_idx(ntid)`、`ord_idx(ord)`、`usn_idx(usn)`、`uid_template_id_idx(uid, template_id)`

---

### 10. `echoe_media`

| 列名 | 类型 | 可空 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `id` | int | 否 | AUTO_INCREMENT | 主键（内部自增） |
| `media_id` | varchar(191) | 否 | - | 业务 ID（唯一） |
| `uid` | varchar(191) | 否 | - | 用户 ID |
| `filename` | varchar(191) | 否 | - | 存储文件名 |
| `original_filename` | varchar(191) | 否 | - | 上传原始文件名 |
| `size` | int | 否 | - | 文件大小（字节） |
| `mime_type` | varchar(100) | 否 | - | MIME 类型 |
| `hash` | varchar(64) | 否 | - | 文件哈希 |
| `created_at` | int | 否 | - | 创建时间（Unix 秒） |
| `used_in_cards` | tinyint | 否 | `0` | 是否被卡片引用 |

约束与索引：

- 唯一：`media_id`、`uid_filename_unique(uid, filename)`
- 索引：`filename_idx(filename)`、`hash_idx(hash)`、`uid_media_id_idx(uid, media_id)`

---

### 11. `echoe_graves`

| 列名 | 类型 | 可空 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `id` | int | 否 | AUTO_INCREMENT | 主键（内部自增） |
| `grave_id` | varchar(191) | 否 | - | 业务 ID（唯一） |
| `uid` | varchar(191) | 否 | - | 用户 ID |
| `usn` | int | 否 | - | 更新序列号 |
| `oid` | varchar(191) | 否 | - | 被删除对象 ID（牌组/笔记/卡片） |
| `type` | int | 否 | - | 对象类型（0 deck / 1 note / 2 card） |

约束与索引：

- 唯一：`grave_id`
- 索引：
  - `oid_idx(oid)`
  - `type_idx(type)`
  - `usn_idx(usn)`
  - `uid_grave_id_idx(uid, grave_id)`
  - `uid_oid_type_idx(uid, oid, type)`

---

### 12. `echoe_config`

| 列名 | 类型 | 可空 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `uid` | varchar(191) | 否 | - | 用户 ID |
| `key` | varchar(191) | 否 | - | 配置键 |
| `value` | text | 否 | - | 配置值（JSON 字符串） |

约束：

- 复合主键：`(uid, key)`

---

### 13. `table_migrations`

| 列名 | 类型 | 可空 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `table_name` | varchar(191) | 否 | - | 主键，表名 |
| `current_version` | int | 否 | - | 当前迁移版本 |
| `last_migrated_at` | timestamp(3) | 否 | `CURRENT_TIMESTAMP(3)` | 最后迁移时间 |

---

## 外键关系（以业务 ID 为主）

- `echoe_notes.mid` -> `echoe_notetypes.note_type_id`（`ON DELETE CASCADE`）
- `echoe_cards.nid` -> `echoe_notes.note_id`（`ON DELETE CASCADE`）
- `echoe_cards.did` -> `echoe_decks.deck_id`（`ON DELETE CASCADE`）
- `echoe_revlog.cid` -> `echoe_cards.card_id`（`ON DELETE CASCADE`）
- `echoe_decks.conf` -> `echoe_deck_config.deck_config_id`（`ON DELETE CASCADE`）
- `echoe_decks.mid` -> `echoe_notetypes.note_type_id`（`ON DELETE SET NULL`）
- `echoe_templates.ntid` -> `echoe_notetypes.note_type_id`（`ON DELETE CASCADE`）
- `echoe_templates.did` -> `echoe_decks.deck_id`（`ON DELETE SET NULL`）

> 说明：`uid` 用于租户隔离，但 schema 未声明到 `users.uid` 的外键约束。

---

## 关键字段专题

### 1) `echoe_notes` 的字段分层

- `fields_json`：前后端共享的结构化字段主存储
- `rich_text_fields`：可选富文本结构（ProseMirror JSON）
- `flds/sfld/csum`：Anki 兼容、搜索与去重链路使用
- `fld_names`：字段顺序映射辅助

### 2) `data` 字段约定

`echoe_notes.data` 与 `echoe_cards.data` 为文本 JSON 扩展位，schema 层要求非空但不设置默认值，调用链路应保证写入合法 JSON 字符串。

### 3) FSRS 状态与审计

- 当前状态：`echoe_cards.stability/difficulty/last_review`
- 历史与撤销：`echoe_revlog` 的当前值 + `pre_*` 快照列

---

## 查询与索引建议（对应现有 schema）

- **按用户 + 业务 ID 精确查**：优先使用各表 `uid_*_id_idx`
- **学习队列拉取**：`echoe_cards.uid_did_queue_due_idx`
- **复习历史分页/过滤**：`echoe_revlog.uid_cid_idx`、`uid_source_revlog_id_idx`
- **字段搜索/去重**：`echoe_notes.uid_sfld_idx` + `uid_guid_unique`
- **名称唯一约束**：`echoe_decks` / `echoe_deck_config` / `echoe_notetypes` 的 `uid_name_unique`

---

## 变更维护入口

- Schema 源码：`apps/server/src/db/schema/`
- 汇总导出：`apps/server/src/db/schema/index.ts`
- 迁移版本记录表：`table_migrations`

如需变更表结构，必须同步更新 schema 与迁移脚本，再回刷本文档。
