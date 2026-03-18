# PRD: Echoe Media 存储优化与动态临时链接

## Introduction

将 Echoe Media 的存储方式从固定 URL 改为存储 storageKey，并在所有返回媒体 URL 的地方动态调用 `storageAdapter.generateAccessUrl` 生成临时访问链接。这支持私有存储（如 S3/OSS 私有 Bucket）的安全访问，并统一 URL 生成逻辑，便于后续更换存储后端。

## Goals

- 为 echoe_media 表添加 storageKey 字段存储完整存储路径
- 所有返回媒体 URL 的接口统一使用动态生成的临时链接
- 支持私有存储（ S3/OSS 私有 Bucket）的安全访问
- 统一 URL 生成逻辑，便于存储后端迁移

## User Stories

### US-001: 添加 storageKey 字段到数据库
**Description:** 作为开发者，我需要在数据库中存储 media 文件的 storageKey，以便后续动态生成访问链接。

**Acceptance Criteria:**
- [ ] 在 echoe_media 表添加 `storageKey` 字段 (VARCHAR 500)
- [ ] 生成并运行 migration
- [ ] Typecheck 通过

### US-002: 修改 uploadMedia 保存 storageKey
**Description:** 作为开发者，我需要在上传媒体时将 storageKey 保存到数据库。

**Acceptance Criteria:**
- [ ] uploadMedia 方法中保存 storageKey 到数据库
- [ ] storageKey 格式: `echoe-media/{uid}/{filename}`
- [ ] 保留现有的 url 生成逻辑（上传时仍需要返回URL）
- [ ] Typecheck 通过

### US-003: 修改 listMedia 返回动态临时链接
**Description:** 作为用户，我希望在媒体列表中获取可以安全访问的临时链接。

**Acceptance Criteria:**
- [ ] listMedia 方法对每条记录调用 `generateAccessUrl` 生成临时链接
- [ ] 临时链接默认 6 小时过期
- [ ] 返回结果包含动态生成的 url 字段
- [ ] Typecheck 通过

### US-004: 修改 getMedia 返回动态临时链接
**Description:** 作为开发者/系统，需要确保获取单个媒体时也使用动态链接。

**Acceptance Criteria:**
- [ ] getMedia 方法返回时生成临时访问链接
- [ ] Typecheck 通过

### US-005: 检查其他返回 media URL 的接口
**Description:** 作为开发者，我需要确保所有返回 media URL 的地方都使用动态链接。

**Acceptance Criteria:**
- [ ] 搜索代码中所有返回 media url 的地方
- [ ] 确认是否都需要改为动态生成
- [ ] Typecheck 通过

## Functional Requirements

- FR-1: 在 echoe_media 表添加 `storageKey` 字段 (VARCHAR 500)
- FR-2: uploadMedia 保存 storageKey 到数据库
- FR-3: listMedia 返回动态生成的临时链接（6小时过期）
- FR-4: getMedia 返回动态生成的临时链接
- FR-5: 所有返回 media URL 的接口统一使用 generateAccessUrl

## Non-Goals

- 不修改现有的文件上传逻辑（只是额外存储 storageKey）
- 不修改前端 UI（后端 API 改动）
- 不添加媒体访问的权限验证（已有 uid 验证）

## Technical Considerations

- storageKey 格式: `echoe-media/{uid}/{filename}`（与现有代码逻辑一致）
- 临时链接过期时间: 6 小时（21600 秒）
- generateAccessUrl 需要传入 storageMetadata（已有 getStorageMetadata 方法）
- 现有代码中 URL 生成逻辑保留，确保向后兼容新增字段

## Success Metrics

- 所有 media URL 接口返回动态临时链接
- 支持私有存储的安全访问
- 存储后端更换时只需修改 generateAccessUrl 实现

## Open Questions

- 是否需要考虑 URL 缓存策略？每次都生成新的
