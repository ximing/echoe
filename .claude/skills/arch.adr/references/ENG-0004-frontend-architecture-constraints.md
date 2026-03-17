# ENG-0004: 前端架构约束

## Status
Accepted

## Date
2026-03-17

## Context
Echoe 前端使用 React 19 + @rabjs/react + Vite + TailwindCSS。有一系列前端架构约束需要遵守，确保状态管理一致性和开发效率。

## Decision

### 核心约束

1. **@rabjs/react Service 模式**
   - 所有页面/功能组件必须使用 `@view` 装饰器和 `useService()` 钩子
   - 服务扩展 Service 类

2. **路由环境分支 - Electron vs Web**
   - 使用 `isElectron()` 检查选择 HashRouter 或 BrowserRouter
   - 根路由条件渲染 LandingPage 或重定向到 /cards

3. **认证状态管理 - 环境差异**
   - Web 使用 HTTP-only cookies
   - Electron 使用 OS 安全存储 (safeStorage)
   - 双 token 策略，Promise 门控 (tokenReadyPromise)

4. **受保护路由模式**
   - 所有认证路由必须用 `<ProtectedRoute>` 包装
   - 检查 authService.isAuthenticated

5. **布局嵌套要求**
   - 所有受保护路由必须用 `<Layout>` 包装
   - Layout 提供侧边栏导航、主题切换、用户菜单

6. **URL 验证 (安全)**
   - RichTextEditor 和 CardRenderer 强制协议验证
   - 只允许 http:// 和 https:// URL

7. **HTML 净化 (安全)**
   - CardRenderer 使用 DOMPurify 净化模板输出

8. **卡片模板处理管道**
   - 严格顺序: FrontSide → Conditionals → FieldVariables → Cloze → Audio → TTS → LaTeX
   - 递归深度限制为 1

9. **请求拦截器门控 (Electron)**
   - Electron 请求发送前等待 tokenReadyPromise

10. **状态持久化**
    - 保留键: echoe_user, echoe_theme

11. **Web 图标统一使用 lucide-react**

## Constraint / Source of Truth
这是 Constraint Plane 的前端架构约束条目。

## Evidence

| 证据类型 | 路径/位置 |
|----------|-----------|
| 代码 | `apps/web/src/pages/` |
| 代码 | `apps/web/src/components/` |
| 代码 | `apps/web/src/services/` |
| 代码 | `apps/web/src/utils/request.ts` |
| 文档 | `CLAUDE.md` |

## Impact

### Tech Design Impact
- @rabjs/react 是响应式状态管理的核心
- URL/HTML 验证是安全防护的关键

### PRD Impact
- Electron vs Web 双平台支持
- 主题切换和布局一致性

## Guardrails / Acceptance Checks
- [ ] 组件使用 @view 装饰器
- [ ] 路由有 ProtectedRoute 包装
- [ ] 外部链接验证协议
- [ ] 图标使用 lucide-react

## Change Log
| Date | Version | Change | Author |
|------|---------|--------|--------|
| 2026-03-17 | 1.0 | 初始化 - 来自 init.adr 扫描 | - |
