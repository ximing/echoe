# PRD 归档: Echoe 多用户重构

**文档版本**: v1.0
**归档日期**: 2026-03-19
**原始PRD路径**: tasks/archive/prd-echoe-multi-user-refactor.md
**责任人**: 后端团队
**当前状态**: ✅ 已完成 (100%)

---

## 一、需求概述

将 Echoe 从"单用户全局共享数据模型"重构为"共享库 + 逻辑多租户(按 `uid` 强隔离)"。当前系统虽然已有用户认证能力(JWT 可解析 `uid`),但 Echoe 业务表和服务查询大量缺失 `uid` 约束,导致跨用户读写风险、导入导出污染、媒体冲突和统计失真。

本次采用上线前一次性迁移(Big Bang):不保留兼容分支、不做历史数据迁移、不保留双写灰度,以最终正确模型直接落地。

### 核心目标
- 所有 Echoe 业务表落地 `uid NOT NULL`,并完成关键唯一约束与索引
- 所有 Echoe 接口默认运行在"当前登录用户上下文",禁止无 `uid` 访问业务数据
- 所有 Echoe 服务层 `insert/select/update/delete` 全量纳入 `uid` 过滤
- 导入、导出、CSV、媒体、统计、标签等边缘链路全部按 `uid` 隔离
- 上线前通过一次性迁移完成最终态收敛,不保留兼容读写逻辑

---

## 二、实现状态分析

### 2.1 已完成功能 (✅)

- ✅ **US-001**: 落地最终态数据库 Schema
  - 所有 Echoe 业务表包含 `uid NOT NULL` 字段
  - 关键表唯一约束:
    - `echoe_config`: `PRIMARY KEY (uid, key)`
    - `echoe_col`: `UNIQUE(uid)`
    - `echoe_decks`: `UNIQUE(uid, name)`
    - `echoe_notetypes`: `UNIQUE(uid, name)`
    - `echoe_templates`: `UNIQUE(uid, ntid, ord)`
    - `echoe_notes`: `UNIQUE(uid, guid)`
    - `echoe_media`: `UNIQUE(uid, filename)`
  - 代码位置: `apps/server/src/db/schema/echoe-*.ts`
  - 验证:
    ```bash
    grep -r "uid: varchar" apps/server/src/db/schema/echoe-*.ts
    ```

- ✅ **US-002**: 生成并执行一次性迁移
  - 已生成 Drizzle 迁移脚本
  - 迁移包含所有表的 `uid` 字段添加和约束创建
  - 代码位置: `apps/server/drizzle/`

- ✅ **US-003**: Controller 统一注入并传递 uid
  - 所有 Echoe controller 方法使用 `@CurrentUser()` 注入用户
  - 当 `!userDto?.uid` 时返回 401 未授权
  - 所有 service 调用显式传递 `uid`
  - 代码位置: `apps/server/src/controllers/v1/echoe-*.controller.ts`

- ✅ **US-004**: Service 全链路 uid 过滤
  - 所有 Echoe service 方法签名包含 `uid: string`
  - `insert` 操作强制写入 `uid`
  - `select/update/delete` 操作强制带 `uid` 过滤
  - 代码位置: `apps/server/src/services/echoe-*.service.ts`

- ✅ **US-005**: 用户级工作空间初始化
  - 实现 `ensureUserWorkspace(uid)` 幂等方法
  - 初始化用户默认 deck/notetype/template
  - 注册后自动触发初始化
  - 代码位置: `apps/server/src/services/echoe-workspace.service.ts`

- ✅ **US-006**: 导入导出与 CSV 按用户隔离
  - 导入链路所有写入绑定当前 `uid`
  - 重复判定基于 `(uid, guid)` 维度
  - 导出仅包含当前 `uid` 数据
  - CSV 导入通过 `noteService.createNote(uid, dto)` 执行
  - 代码位置: `apps/server/src/services/echoe-import.service.ts`

- ✅ **US-007**: 媒体文件与媒体元数据隔离
  - 媒体存储 key 格式: `echoe-media/{uid}/{filename}`
  - 媒体 DB 查询、更新、删除均强制 `uid` 过滤
  - 不同用户上传同名文件不会冲突
  - 代码位置: `apps/server/src/services/echoe-media.service.ts`
  - 验证: `grep "storageKey" apps/server/src/db/schema/echoe-media.ts`

- ✅ **US-008**: Echoe 领域 ID 生成统一收口
  - 所有 Echoe 领域 ID 由 `id.ts` 统一生成
  - 移除业务代码中的 `Date.now()` 直接生成 ID
  - 代码位置: `apps/server/src/utils/id.ts`

- ✅ **US-009**: 双用户隔离自动化测试
  - 单元测试覆盖 service 的 `uid` 过滤
  - 集成测试覆盖关键场景(note/card/deck/study/stats)
  - 代码位置: `apps/server/src/__tests__/echoe-*.service.test.ts`

### 2.2 关键技术决策

#### 决策 1: Big Bang 迁移策略
- **决策内容**: 上线前清空旧数据,执行最终态迁移,不保留兼容逻辑
- **Why**: 项目早期,用户数据少,避免复杂的灰度与兼容成本
- **How to apply**: 发布时通知用户数据将被清空,执行迁移脚本

#### 决策 2: 用户级工作空间初始化
- **决策内容**: 每个用户注册后自动初始化默认 deck/notetype/template
- **Why**: 不再依赖全局固定 `id=1` 的默认资源,避免跨用户冲突
- **How to apply**: 注册接口调用 `ensureUserWorkspace(uid)`

#### 决策 3: 媒体存储路径规范
- **决策内容**: 媒体存储路径包含 `uid`,格式 `echoe-media/{uid}/{filename}`
- **Why**: 支持私有存储访问控制,避免同名文件冲突
- **How to apply**: 所有媒体上传/访问使用 storageKey

---

## 三、变更记录

| 日期 | 变更内容 | 原因 | 影响范围 |
|------|---------|------|---------|
| 2026-03-10 | 初始 PRD 创建 | 项目需求 | 全部 |
| 2026-03-11 | Schema 设计确认 | 架构评审 | US-001 |
| 2026-03-12 | Controller/Service 改造 | 开发进度 | US-003, US-004 |
| 2026-03-13 | 工作空间初始化实现 | 开发进度 | US-005 |
| 2026-03-14 | 导入导出隔离 | 开发进度 | US-006 |
| 2026-03-15 | 媒体隔离实现 | 开发进度 | US-007 |
| 2026-03-16 | 测试覆盖完成 | 质量保障 | US-009 |
| 2026-03-19 | 归档文档生成 | 项目里程碑 | - |

---

## 四、架构影响

### 4.1 数据库 Schema
- 所有 Echoe 表新增 `uid` 字段
- 新增约 15 个唯一约束和 20+ 个索引
- 影响表: `echoe_col`, `echoe_decks`, `echoe_notes`, `echoe_cards`, `echoe_media` 等 11 张表

### 4.2 API 接口
- 所有 Echoe 接口要求 JWT 认证
- 所有接口自动过滤为当前用户数据
- 无 `uid` 上下文时返回 401

### 4.3 服务层
- 所有 service 方法签名增加 `uid` 参数
- 所有数据操作强制 `uid` 过滤
- 影响约 20+ 个 service 文件

---

## 五、技术债务

### 5.1 未完成功能
无(所有功能已完成)

### 5.2 已知问题
- 历史数据无法自动归属到用户(Big Bang 迁移,已接受)
- 跨用户数据共享功能未实现(非本期目标)

### 5.3 优化建议
- 考虑添加"数据导入向导",帮助用户迁移旧数据
- 考虑添加"用户数据导出"功能,便于备份
- 考虑添加"团队协作"功能(未来需求)

---

## 六、依赖关系

### 上游依赖
- 用户认证系统(JWT)

### 下游依赖
- 所有 Echoe 功能 PRD (均依赖多用户隔离)

---

## 七、验收标准

✅ **已通过**
- 所有 Echoe 业务表包含 `uid NOT NULL`
- 所有 Echoe 接口要求认证
- A/B 双用户跨用户访问测试通过率 100%
- 导入/导出/CSV/媒体/统计/标签链路全部通过用户隔离用例
- 相关模块 typecheck/lint 全通过
- 双用户自动化测试通过

---

## 八、相关文档

- [JWT 认证文档](../architecture/auth.md)
- [数据库 Schema 文档](../database/schema.md)

---

**归档审批**
- 技术负责人: ______
- 产品负责人: ______
- 归档日期: 2026-03-19
