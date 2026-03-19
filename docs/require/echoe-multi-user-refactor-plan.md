# Echoe 多用户重构 PRD（上线前一次性迁移版）

## 1. 背景与问题

当前系统已经有用户认证（JWT 中包含 `uid`，中间件也能解析到 `request.user.uid`），但 Echoe 业务数据表大多没有 `uid`，服务层查询也基本不带用户条件，导致：

- 数据天然是“全局共享”，本质是单用户模型。
- 任意账号可能读到/改到其他账号的数据。
- 导入导出、媒体、标签、统计等链路都存在跨用户污染风险。

本次重构目标：将 Echoe 从“单用户数据模型”升级为“共享库 + 逻辑多租户（按 `uid` 隔离）”模型。

---

## 2. PRD 补充决策（本次新增）

- 本系统还未上线，不需要考虑兼容问题。
- 不做历史数据迁移与回填，已有数据库数据可直接忽略。
- 采用一次性迁移到位（Big Bang）方案，不保留双写、灰度、兼容读。
- 所有设计直接以“最终正确模型”为目标，不为旧结构妥协。

---

## 3. 目标与非目标

## 3.1 目标

1. 所有 Echoe 业务数据按 `uid` 强隔离。
2. 默认所有 Echoe 接口都在“当前登录用户上下文”执行。
3. 导入/导出/媒体/统计/标签等边缘链路必须隔离。
4. 数据库、接口、服务层一次性收敛到最终模型，不保留兼容分支。

## 3.2 非目标

- 不做物理分库分表。
- 不引入团队协作 / 组织级权限模型。
- 不做旧数据修复、旧结构兼容、历史归属判定。

---

## 4. 一次性迁移总体方案

采用 **Shared DB + Logical Tenant（uid）**，并执行“一次性破坏式迁移”：

1. 在 `apps/server/src/db/schema` 直接定义最终态（`uid`、唯一约束、索引、必要约束）。
2. 生成并提交单次 Drizzle 迁移脚本（允许 drop/recreate Echoe 业务表）。
3. 迁移后不再保留旧结构、旧字段语义、`uid IS NULL` 兼容逻辑。
4. 上线前清空并重建数据库（或至少清空 `echoe_*` 表），确保迁移在“无历史包袱”状态执行。

> 说明：即使是破坏式迁移，也必须通过项目标准迁移脚本落地，不能手工改库。

---

## 5. 目标数据模型（最终态）

## 5.1 需要具备 `uid NOT NULL` 的表

- `echoe_col`
- `echoe_config`
- `echoe_deck_config`
- `echoe_decks`
- `echoe_notetypes`
- `echoe_templates`
- `echoe_notes`
- `echoe_cards`
- `echoe_media`
- `echoe_graves`
- `echoe_revlog`（从可空改为非空）

## 5.2 关键约束（建议按最终态直接落地）

### `echoe_config`

- 当前 `key` 全局主键改为“用户内唯一”：
  - `PRIMARY KEY (uid, key)`（或 `UNIQUE(uid, key)` + 独立主键）

### `echoe_col`

- 每用户仅一条 collection：
  - `UNIQUE(uid)`

### `echoe_decks`

- 用户内牌组名唯一：
  - `UNIQUE(uid, name)`

### `echoe_notetypes`

- 用户内 note type 名唯一：
  - `UNIQUE(uid, name)`

### `echoe_templates`

- 模板在同 note type 下按序号唯一：
  - `UNIQUE(uid, ntid, ord)`

### `echoe_notes`

- guid 在用户内唯一（支持导入去重）：
  - `UNIQUE(uid, guid)`

### `echoe_media`

- 文件名在用户内唯一：
  - `UNIQUE(uid, filename)`

## 5.3 索引建议（首批）

- `echoe_notes`: `(uid, mid)`, `(uid, sfld)`, `(uid, mod)`
- `echoe_cards`: `(uid, nid)`, `(uid, did, queue, due)`, `(uid, last_review)`
- `echoe_revlog`: `(uid, cid)`, `(uid, id)`
- `echoe_graves`: `(uid, oid, type)`
- `echoe_deck_config`: `(uid, name)`
- `echoe_templates`: `(uid, ntid)`

---

## 6. 应用层改造方案（最终态，不保留兼容）

## 6.1 Controller 改造原则

除 `auth/*` 与 `system/open/*` 外，Echoe 接口统一：

- 必须注入 `@CurrentUser() userDto`
- `!userDto?.uid` 直接返回未授权
- service 方法签名统一加 `uid: string`

需要改造的 controller：

- `echoe-config.controller.ts`
- `echoe-deck.controller.ts`
- `echoe-note.controller.ts`
- `echoe-study.controller.ts`
- `echoe-stats.controller.ts`
- `echoe-tag.controller.ts`
- `echoe-media.controller.ts`
- `echoe-import.controller.ts`
- `echoe-export.controller.ts`
- `echoe-csv-import.controller.ts`
- `echoe-duplicate.controller.ts`

## 6.2 Service 改造原则

所有 Echoe service 统一规则：

- `insert` 必须写入 `uid`
- `select/update/delete` 必须包含 `uid` 条件
- `join` 必须保证关联对象来自同一 `uid`

重点服务改造清单：

- `echoe-config.service.ts`
- `echoe-deck.service.ts`
- `echoe-note.service.ts`
- `echoe-study.service.ts`
- `echoe-stats.service.ts`
- `echoe-tag.service.ts`
- `echoe-media.service.ts`
- `echoe-import.service.ts`
- `echoe-export.service.ts`
- `echoe-csv-import.service.ts`
- `echoe-duplicate.service.ts`
- `echoe-seed.service.ts`

## 6.3 Seed 与用户空间初始化

当前 `seedIfNeeded()` 是全局初始化，需要改为用户级初始化：

- 提供 `ensureUserWorkspace(uid)`，幂等执行。
- 在注册成功后，或用户首次进入 Echoe 模块时触发。
- 初始化该用户默认数据（`col/deck/deck_config/notetype/template`）。
- 不再依赖全局固定 `id=1` 的默认牌组/配置。

## 6.4 Import / Export / CSV

- 导入：全部写入当前 `uid` 命名空间；重复判定按用户维度（如 `(uid, guid)`）。
- 导出：只导出当前 `uid` 数据。
- CSV 导入：改为 `noteService.createNote(uid, dto)`。

## 6.5 媒体隔离

媒体存储 key 改为：

- 旧：`echoe-media/<filename>`
- 新：`echoe-media/<uid>/<filename>`

并且媒体 DB 查询统一按 `uid` 过滤。

## 6.6 ID 生成规范收口

Echoe 领域 ID（deck/notetype/template/note/card/revlog）统一收到 `apps/server/src/utils/id.ts`，避免 `Date.now()` 在业务代码中散落。

---

## 7. 一次性迁移执行步骤

1. **定义最终 schema**：修改 `apps/server/src/db/schema/*`，直接落到最终态。
2. **生成迁移文件**：执行 `pnpm --filter @echoe/server migrate:generate`。
3. **审查迁移 SQL**：确认是最终态结构，无兼容列与临时逻辑。
4. **清理旧数据**：在上线前环境清空旧 Echoe 数据（可直接 drop/recreate 目标表）。
5. **执行迁移**：运行 `pnpm --filter @echoe/server migrate`。
6. **启动服务并初始化**：通过用户注册/首次登录触发 `ensureUserWorkspace(uid)`。
7. **执行验收测试**：通过后进入开发联调。

---

## 8. 测试与验收标准

## 8.1 核心验收

- 用户 A 创建的数据，用户 B 在所有 Echoe 接口均不可见、不可修改、不可删除。
- 导入/导出严格限定当前用户。
- 媒体文件跨用户不冲突、不可互访。
- 所有 Echoe 业务表 `uid` 均为 `NOT NULL`，且核心约束已生效。

## 8.2 测试建议

- 单元测试：service 层查询必须携带 `uid`。
- 集成测试：A/B 双用户用例覆盖 note/card/deck/study/stats/tag/media/import/export。
- 安全测试：构造跨用户 ID 访问，确保全部被拒绝或返回空结果。

---

## 9. 风险与策略

## 9.1 主要风险

- 漏改某条查询导致越权读取。
- 一次性迁移后发现结构缺陷，修复窗口短。
- 索引组合不合理导致性能波动。

## 9.2 缓解策略

- 代码评审增加“uid 过滤检查清单”。
- 双用户自动化测试作为发布门禁。
- 迁移前先在本地/测试库全量跑一遍并验证索引命中。

## 9.3 回滚方案

无需兼容回滚；若结构错误，直接修正 schema 并重新迁移（重建库）。

---

## 10. 交付物清单

1. 本 PRD 文档（一次性迁移版）
2. 最终态 Drizzle schema 代码
3. 单次迁移 SQL（可破坏式）
4. Echoe 全链路 controller/service 改造
5. 双用户隔离自动化测试
6. 用户空间初始化机制（`ensureUserWorkspace`）
