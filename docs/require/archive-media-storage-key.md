# PRD 归档: Echoe Media 存储优化与动态临时链接

**文档版本**: v1.0
**归档日期**: 2026-03-19
**原始PRD路径**: tasks/archive/prd-echoe-media-storage-key.md
**责任人**: 后端团队
**当前状态**: ✅ 已完成 (100%)

---

## 一、需求概述

将 Echoe Media 的存储方式从固定 URL 改为存储 storageKey,并在所有返回媒体 URL 的地方动态调用 `storageAdapter.generateAccessUrl` 生成临时访问链接。这支持私有存储(如 S3/OSS 私有 Bucket)的安全访问,并统一 URL 生成逻辑,便于后续更换存储后端。

### 核心目标
- 为 echoe_media 表添加 storageKey 字段存储完整存储路径
- 所有返回媒体 URL 的接口统一使用动态生成的临时链接
- 支持私有存储(S3/OSS 私有 Bucket)的安全访问
- 统一 URL 生成逻辑,便于存储后端迁移

---

## 二、实现状态分析

### 2.1 已完成功能 (✅)

- ✅ **US-001**: 添加 storageKey 字段到数据库
  - 在 echoe_media 表添加 `storageKey` 字段 (VARCHAR 500)
  - 生成并运行 migration
  - 代码位置: `apps/server/src/db/schema/echoe-media.ts`
  - 验证: `grep "storageKey" apps/server/src/db/schema/echoe-media.ts`

- ✅ **US-002**: 修改 uploadMedia 保存 storageKey
  - uploadMedia 方法中保存 storageKey 到数据库
  - storageKey 格式: `echoe-media/{uid}/{filename}`
  - 保留现有的 url 生成逻辑(上传时仍需要返回URL)
  - 代码位置: `apps/server/src/services/echoe-media.service.ts`

- ✅ **US-003**: 修改 listMedia 返回动态临时链接
  - listMedia 方法对每条记录调用 `generateAccessUrl` 生成临时链接
  - 临时链接默认 6 小时过期
  - 返回结果包含动态生成的 url 字段
  - 代码位置: `apps/server/src/services/echoe-media.service.ts`

- ✅ **US-004**: 修改 getMedia 返回动态临时链接
  - getMedia 方法返回时生成临时访问链接
  - 代码位置: `apps/server/src/services/echoe-media.service.ts`

- ✅ **US-005**: 检查其他返回 media URL 的接口
  - 搜索代码中所有返回 media url 的地方
  - 确认都使用动态链接生成
  - 代码位置: 所有调用 `echoe-media.service.ts` 的地方

### 2.2 关键技术决策

#### 决策 1: storageKey 格式规范
- **决策内容**: storageKey 格式 `echoe-media/{uid}/{filename}`
- **Why**: 支持用户隔离,避免同名文件冲突,便于私有存储访问控制
- **How to apply**: 所有媒体上传/访问使用此格式

#### 决策 2: 临时链接过期时间
- **决策内容**: 临时链接默认 6 小时过期
- **Why**: 平衡安全性和用户体验,6小时足够一次学习会话
- **How to apply**: `generateAccessUrl` 调用时传入 21600 秒

#### 决策 3: 向后兼容策略
- **决策内容**: 保留现有 url 生成逻辑,storageKey 作为新增字段
- **Why**: 确保现有功能不受影响,平滑过渡
- **How to apply**: 新上传的媒体同时存储 storageKey 和 url

---

## 三、变更记录

| 日期 | 变更内容 | 原因 | 影响范围 |
|------|---------|------|---------|
| 2026-03-14 | 初始 PRD 创建 | 项目需求 | 全部 |
| 2026-03-15 | 实现 Schema 变更 | 开发进度 | US-001 |
| 2026-03-15 | 实现动态链接生成 | 开发进度 | US-002~US-005 |
| 2026-03-19 | 归档文档生成 | 项目里程碑 | - |

---

## 四、架构影响

### 4.1 数据库 Schema
- `echoe_media` 表新增 `storageKey` 字段
- 不影响现有字段和索引

### 4.2 API 接口
- 所有返回媒体 URL 的接口现在返回临时链接
- 前端无需修改(URL 格式保持兼容)

### 4.3 存储后端
- 支持私有存储(S3/OSS 私有 Bucket)
- 便于后续更换存储后端(只需修改 `generateAccessUrl` 实现)

---

## 五、技术债务

### 5.1 未完成功能
无(所有功能已完成)

### 5.2 已知问题
- 历史媒体数据未回填 storageKey(非关键,按需回填)

### 5.3 优化建议
- 考虑添加"媒体数据回填脚本"(如有需要)
- 考虑添加 URL 缓存策略(减少重复生成)

---

## 六、依赖关系

### 上游依赖
- PRD: Multi-User Refactor (用户隔离,storageKey 包含 uid)

### 下游依赖
无

---

## 七、验收标准

✅ **已通过**
- 所有 media URL 接口返回动态临时链接
- 支持私有存储的安全访问
- 存储后端更换时只需修改 `generateAccessUrl` 实现
- 现有功能不受影响

---

## 八、相关文档

- [Multi-User Refactor PRD](./archive-multi-user-refactor.md)
- [Storage Adapter 文档](../architecture/storage.md)

---

**归档审批**
- 技术负责人: ______
- 产品负责人: ______
- 归档日期: 2026-03-19
