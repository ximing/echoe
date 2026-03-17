# ENG-0005: 后端架构约束

## Status
Accepted

## Date
2026-03-17

## Context
Echoe 后端使用 Express.js + TypeDI + routing-controllers 的技术栈。后端架构有一系列必须遵守的约束，确保依赖注入、控制器模式和服务组织的统一性。

## Decision

### 核心约束

1. **TypeDI IOC 容器自动加载**
   - 使用 glob 模式自动加载服务和控制器
   - 所有 `@Service()` 装饰的类自动注册到 IOC 容器
   - 配置在 `apps/server/src/ioc.ts`

2. **TypeDI 服务注入模式**
   - 服务和控制器必须使用构造函数注入
   - 格式：`constructor(private myService: MyService) {}`
   - 禁止直接实例化服务

3. **routing-controllers 控制器模式**
   - 使用 `@JsonController('/api/v1/resource')` 定义基础路由
   - HTTP 方法装饰器：`@Get()`, `@Post()`, `@Put()`, `@Delete()`
   - 参数装饰器：`@Body()`, `@Param()`, `@QueryParam()`, `@CurrentUser()`
   - 控制器必须导出到 `controllers/index.ts`

4. **启动顺序**
   - IOC 容器初始化 → MySQL 连接池 → 数据库迁移 → LanceDB → Scheduler → Express
   - 迁移在服务器启动时自动运行

5. **连接池配置**
   - 默认 10 连接
   - max idle: 10
   - timeout: 60s
   - keep-alive: 启用

6. **数据库访问**
   - 通过 `getDatabase()` 从 `db/connection.ts` 访问
   - 禁止直接创建数据库连接

7. **中间件注册顺序**
   - 错误处理中间件最后注册
   - 认证中间件在路由之前

## Constraint / Source of Truth
这是 Constraint Plane 的后端架构约束条目。

## Evidence

| 证据类型 | 路径/位置 |
|----------|-----------|
| 代码 | `apps/server/src/ioc.ts` |
| 代码 | `apps/server/src/controllers/` |
| 代码 | `apps/server/src/services/` |
| 代码 | `apps/server/src/index.ts` |
| 代码 | `apps/server/src/db/connection.ts` |
| 文档 | `CLAUDE.md` |

## Impact

### Tech Design Impact
- TypeDI 是依赖管理的核心
- 启动顺序影响系统可靠性
- 连接池配置影响性能

### PRD Impact
- 服务层架构统一性
- 开发和调试效率

## Guardrails / Acceptance Checks
- [ ] 服务使用 `@Service()` 装饰器
- [ ] 控制器使用构造函数注入
- [ ] 控制器导出到 index.ts
- [ ] 启动顺序正确

## Change Log
| Date | Version | Change | Author |
|------|---------|--------|--------|
| 2026-03-17 | 1.0 | 初始化 - 来自 init.adr 扫描 | - |
