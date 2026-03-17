# ENG-0003: 认证与安全约束

## Status
Accepted

## Date
2026-03-17

## Context
Echoe 需要满足企业级安全要求。认证、授权、存储安全都需要严格约束，防止数据泄露和攻击。

## Decision

### 核心约束

1. **JWT 认证通过 @CurrentUser() 装饰器**
   - 认证用户信息通过装饰器自动注入
   - 控制器中使用 `@CurrentUser()` 获取当前用户

2. **Token 认证优先于 JWT**
   - API tokens 绕过 JWT 验证
   - Token 认证优先于 JWT

3. **Bearer token 格式严格强制**
   - 必须是 `Bearer <token>` 格式，正好 2 部分

4. **用户软删除检查必须**
   - `deletedAt > 0` 表示已删除
   - 所有认证路径必须检查 deletedAt

5. **外部 URL 的 SSRF 防护**
   - 所有外部 URL 验证必须检查私有 IP 范围
   - 协议必须是 HTTPS

6. **媒体存储 Key 命名空间**
   - 存储路径格式: `echoe-media/{uid}/{filename}`
   - 用户命名空间隔离

7. **API Token 安全模式**
   - 存储 `tokenHash` 而非明文
   - 使用 SHA256 哈希

8. **用户密码管理**
   - 使用 bcrypt 加盐哈希存储

9. **认证排除路径白名单**
   - 特定路径绕过认证（硬编码白名单）

10. **MIME 类型安全**
    - HTML/JS 返回 `octet-stream` 强制下载

## Constraint / Source of Truth
这是 Constraint Plane 的认证与安全约束条目。

## Evidence

| 证据类型 | 路径/位置 |
|----------|-----------|
| 代码 | `apps/server/src/middlewares/auth-handler.ts` |
| 代码 | `apps/server/src/middlewares/api-token-auth.middleware.ts` |
| 代码 | `apps/server/src/utils/url-validator.ts` |
| 代码 | `apps/server/src/services/echoe-media.service.ts` |
| 文档 | `CLAUDE.md` |

## Impact

### Tech Design Impact
- SSRF 防护是外部 URL 验证的必要条件
- Token 哈希存储是 API 安全的基础

### PRD Impact
- 多租户数据隔离依赖于 uid 过滤
- 用户密码安全是合规要求

## Guardrails / Acceptance Checks
- [ ] 外部 URL 必须经过 SSRF 验证
- [ ] API Token 存储哈希而非明文
- [ ] 认证路径检查 deletedAt
- [ ] 媒体文件有 uid 命名空间

## Change Log
| Date | Version | Change | Author |
|------|---------|--------|--------|
| 2026-03-17 | 1.0 | 初始化 - 来自 init.adr 扫描 | - |
