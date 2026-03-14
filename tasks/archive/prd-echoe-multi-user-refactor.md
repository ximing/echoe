# PRD: Echoe 多用户重构（上线前一次性迁移版）

## 1. Introduction / Overview

将 Echoe 从“单用户全局共享数据模型”重构为“共享库 + 逻辑多租户（按 `uid` 强隔离）”。

当前系统虽然已有用户认证能力（JWT 可解析 `uid`），但 Echoe 业务表和服务查询大量缺失 `uid` 约束，导致跨用户读写风险、导入导出污染、媒体冲突和统计失真。

本次采用上线前一次性迁移（Big Bang）：不保留兼容分支、不做历史数据迁移、不保留双写灰度，以最终正确模型直接落地。

## 2. Goals

- 所有 Echoe 业务表落地 `uid NOT NULL`，并完成关键唯一约束与索引。
- 所有 Echoe 接口默认运行在“当前登录用户上下文”，禁止无 `uid` 访问业务数据。
- 所有 Echoe 服务层 `insert/select/update/delete` 全量纳入 `uid` 过滤。
- 导入、导出、CSV、媒体、统计、标签等边缘链路全部按 `uid` 隔离。
- 上线前通过一次性迁移完成最终态收敛，不保留兼容读写逻辑。

## 3. User Stories

### US-001: 落地最终态数据库 Schema

**Description:** 作为后端开发者，我希望 Echoe 核心表都具备 `uid NOT NULL` 和目标约束，以便从数据层保证用户隔离。

**Acceptance Criteria:**

- [ ] `echoe_col`、`echoe_config`、`echoe_deck_config`、`echoe_decks`、`echoe_notetypes`、`echoe_templates`、`echoe_notes`、`echoe_cards`、`echoe_media`、`echoe_graves`、`echoe_revlog` 均含 `uid NOT NULL`
- [ ] `echoe_config` 落地 `PRIMARY KEY (uid, key)`（或等价用户内唯一实现）
- [ ] `echoe_col` 落地 `UNIQUE(uid)`
- [ ] `echoe_decks`、`echoe_notetypes`、`echoe_templates`、`echoe_notes`、`echoe_media` 落地文档定义的用户内唯一约束
- [ ] 首批索引按 PRD 定义完成创建
- [ ] Typecheck/lint passes

### US-002: 生成并执行一次性迁移

**Description:** 作为后端开发者，我希望通过标准 Drizzle 迁移脚本一次性完成最终态改造，以便避免手工改库和环境偏差。

**Acceptance Criteria:**

- [ ] 生成单次迁移脚本并提交到仓库
- [ ] 迁移脚本仅包含最终态结构，无兼容列与临时逻辑
- [ ] 迁移可在“清空旧 Echoe 数据”的环境中成功执行
- [ ] 迁移执行后表结构与约束与 schema 定义一致
- [ ] Typecheck/lint passes

### US-003: Controller 统一注入并传递 uid

**Description:** 作为 API 开发者，我希望 Echoe 控制器统一从认证上下文获取 `uid` 并传入服务层，以便所有请求自动绑定当前用户命名空间。

**Acceptance Criteria:**

- [ ] 除 `auth/*` 与 `system/open/*` 外，所有 Echoe controller 方法注入 `@CurrentUser() userDto`
- [ ] 当 `!userDto?.uid` 时统一返回未授权响应
- [ ] 所有 Echoe controller 调用 service 时显式传递 `uid`
- [ ] 覆盖清单中的 controller 文件全部完成改造
- [ ] Typecheck/lint passes

### US-004: Service 全链路 uid 过滤

**Description:** 作为后端开发者，我希望所有 Echoe service 的读写操作都强制带 `uid` 条件，以便杜绝跨用户越权。

**Acceptance Criteria:**

- [ ] 所有 Echoe service 方法签名统一纳入 `uid: string`
- [ ] `insert` 强制写入 `uid`
- [ ] `select/update/delete` 强制带 `uid` 过滤条件
- [ ] 任意 join 查询确保关联对象属于同一 `uid`
- [ ] 覆盖清单中的 service 文件全部完成改造
- [ ] Typecheck/lint passes

### US-005: 用户级工作空间初始化

**Description:** 作为新注册用户，我希望系统自动初始化属于我的默认 Echoe 空间，以便无需依赖全局种子数据即可开始使用。

**Acceptance Criteria:**

- [ ] 新增 `ensureUserWorkspace(uid)`，且幂等
- [ ] 初始化仅创建当前用户默认数据：`col/deck/deck_config/notetype/template`
- [ ] 注册成功后或首次进入 Echoe 时可触发初始化
- [ ] 不再依赖全局固定 `id=1` 的默认资源
- [ ] Typecheck/lint passes

### US-006: 导入导出与 CSV 按用户隔离

**Description:** 作为使用导入导出能力的用户，我希望只影响我自己的数据空间，以便避免跨账号污染。

**Acceptance Criteria:**

- [ ] 导入链路所有写入都绑定当前 `uid`
- [ ] 重复判定基于用户维度（如 `(uid, guid)`）
- [ ] 导出仅包含当前 `uid` 的数据
- [ ] CSV 导入通过 `noteService.createNote(uid, dto)` 执行
- [ ] Typecheck/lint passes

### US-007: 媒体文件与媒体元数据隔离

**Description:** 作为用户，我希望媒体文件路径和数据库记录都按用户隔离，以便同名文件不会冲突且不可互访。

**Acceptance Criteria:**

- [ ] 媒体存储 key 从 `echoe-media/<filename>` 改为 `echoe-media/<uid>/<filename>`
- [ ] 媒体 DB 查询、更新、删除均强制 `uid` 过滤
- [ ] 不同用户上传同名文件不会冲突
- [ ] 跨用户媒体访问被拒绝或不可见
- [ ] Typecheck/lint passes

### US-008: Echoe 领域 ID 生成统一收口

**Description:** 作为维护者，我希望 Echoe 领域 ID 统一由 `id.ts` 生成，以便避免业务代码中散落的 `Date.now()` 带来的不一致风险。

**Acceptance Criteria:**

- [ ] `deck/notetype/template/note/card/revlog` ID 生成统一迁移到 `apps/server/src/utils/id.ts`
- [ ] 业务代码中移除 Echoe 相关 `Date.now()` 直接生成 ID 的逻辑
- [ ] 现有调用点改为统一方法且命名清晰
- [ ] Typecheck/lint passes

### US-009: 双用户隔离自动化测试

**Description:** 作为 QA/开发者，我希望有 A/B 双用户自动化用例，以便在发布前验证不存在跨用户读写越权。

**Acceptance Criteria:**

- [ ] 单元测试覆盖关键 service 的 `uid` 过滤
- [ ] 集成测试覆盖 `note/card/deck/study/stats/tag/media/import/export` 双用户场景
- [ ] 安全测试覆盖“构造他人 ID”访问并验证拒绝或空结果
- [ ] 测试可稳定通过并作为发布门禁
- [ ] Typecheck/lint passes

## 4. Functional Requirements

- FR-1: 系统必须在所有 Echoe 业务表中定义 `uid` 字段且为 `NOT NULL`。
- FR-2: 系统必须将 `echoe_revlog.uid` 从可空改为非空。
- FR-3: 系统必须将 `echoe_config` 的键约束改为用户内唯一（`(uid, key)`）。
- FR-4: 系统必须保证每个用户仅有一条 `echoe_col`（`UNIQUE(uid)`）。
- FR-5: 系统必须保证 `echoe_decks` 在用户内 `name` 唯一。
- FR-6: 系统必须保证 `echoe_notetypes` 在用户内 `name` 唯一。
- FR-7: 系统必须保证 `echoe_templates` 在 `(uid, ntid, ord)` 维度唯一。
- FR-8: 系统必须保证 `echoe_notes` 在 `(uid, guid)` 维度唯一。
- FR-9: 系统必须保证 `echoe_media` 在 `(uid, filename)` 维度唯一。
- FR-10: 系统必须创建首批索引：`echoe_notes`、`echoe_cards`、`echoe_revlog`、`echoe_graves`、`echoe_deck_config`、`echoe_templates` 约定索引。
- FR-11: 除 `auth/*` 与 `system/open/*` 外，Echoe 接口必须要求有效 `uid` 上下文。
- FR-12: Echoe controller 必须将 `uid` 显式传递给 service。
- FR-13: Echoe service 的 `insert` 必须写入 `uid`。
- FR-14: Echoe service 的 `select/update/delete` 必须附带 `uid` 过滤。
- FR-15: Echoe service 的跨表关联查询必须保证同一 `uid`。
- FR-16: 系统必须提供 `ensureUserWorkspace(uid)` 并保证幂等。
- FR-17: 系统必须在注册后或首次进入 Echoe 时完成用户默认空间初始化。
- FR-18: 导入流程必须写入当前 `uid`，重复判断必须基于用户维度。
- FR-19: 导出流程必须仅导出当前 `uid` 命名空间数据。
- FR-20: CSV 导入必须改为调用 `noteService.createNote(uid, dto)`。
- FR-21: 媒体对象存储路径必须采用 `echoe-media/<uid>/<filename>` 规范。
- FR-22: 媒体数据访问必须按 `uid` 强隔离。
- FR-23: Echoe 领域 ID 生成必须统一收口到 `apps/server/src/utils/id.ts`。
- FR-24: 系统必须通过一次性 Drizzle 迁移脚本完成结构升级，禁止手工改库。
- FR-25: 上线前必须清空旧 Echoe 数据（或重建目标表）后执行迁移。

## 5. Non-Goals (Out of Scope)

- 不做物理分库分表。
- 不引入团队协作、组织级权限模型或复杂 ACL。
- 不做历史数据修复、历史归属判定与旧结构兼容。
- 不保留双写、灰度、兼容读、`uid IS NULL` 兜底逻辑。

## 6. Design Considerations

- 本需求以后端数据模型与接口行为改造为主，不引入新的复杂 UI 交互。
- 若前端存在 Echoe 入口依赖初始化状态，需确保首次进入时对“用户空间初始化中/失败”有明确提示。
- 与现有认证体系保持一致，继续复用 JWT 解析得到的 `uid` 作为租户键。

## 7. Technical Considerations

- 数据库 schema 位于 `apps/server/src/db/schema/*`，需直接定义最终态结构。
- 必须使用项目标准迁移命令生成与执行迁移：
  - `pnpm --filter @echoe/server migrate:generate`
  - `pnpm --filter @echoe/server migrate`
- 迁移策略为破坏式 Big Bang，默认运行前清空旧 Echoe 业务数据。
- 需重点审查所有查询路径，防止遗漏 `uid` 条件导致越权。
- 索引组合需覆盖学习队列、复习日志、按字段检索等高频路径。

## 8. Success Metrics

- 结构完成度：100% Echoe 业务表包含 `uid NOT NULL` 且关键约束全部生效。
- 安全隔离度：A/B 双用户跨用户访问测试通过率 100%。
- 链路完整度：导入、导出、CSV、媒体、统计、标签链路全部通过用户隔离用例。
- 工程质量：相关模块 typecheck/lint 全通过，且无兼容分支残留。
- 发布门禁：双用户自动化测试纳入发布前必跑项。

## 9. Open Questions

- `ensureUserWorkspace(uid)` 的最终触发时机是否固定为“注册后立即触发”，还是保留“首次进入 Echoe 时兜底触发”的双触发设计。
- 迁移执行阶段是否由发布脚本自动完成“清空 echoe_* 表”步骤，或由运维手工执行并留存操作记录。
- 破坏式迁移后是否需要增加一次结构自检脚本（检查表约束与索引存在性）作为上线前验收自动步骤。
