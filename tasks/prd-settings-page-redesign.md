# PRD: 设置页面重构与导航整合

## Introduction

对现有设置页面和相关导航进行重构，解决以下问题：
1. 设置页面目前点击入口跳转到单独页面，改为在设置页面右侧面板展示
2. 标签、媒体文件、统计数据移动到侧边栏作为独立一级导航
3. 多个页面未使用全局主题色，需要统一
4. 卡片设置的5个tab融合到设置页面，删除独立的卡片设置页面

## Goals

- 设置页面采用左右布局（左侧菜单 + 右侧内容面板）
- 标签、媒体文件、统计数据作为独立一级导航
- 所有页面统一使用全局主题色
- 卡片设置融合到设置页面，删除独立页面

## User Stories

### US-001: 设置页面左右布局
**Description:** 作为用户，我希望在设置页面点击左侧菜单项后，右侧直接显示对应内容，而不是跳转到新页面。

**Acceptance Criteria:**
- [ ] 设置页面分为左右两部分：左侧设置菜单（固定宽度），右侧内容区域（自适应）
- [ ] 点击左侧菜单项，右侧内容区域切换显示对应组件
- [ ] 右侧内容区域支持滚动
- [ ] 左侧菜单当前选中项有高亮样式
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-002: 标签页面作为独立一级导航
**Description:** 作为用户，我希望标签管理作为独立导航项出现在侧边栏。

**Acceptance Criteria:**
- [ ] 侧边栏新增"标签"一级导航项
- [ ] 点击后跳转到标签管理页面（独立路由）
- [ ] 标签页面使用全局主题色
- [ ] 标签页面使用全局布局（包含侧边栏）
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-003: 媒体文件页面作为独立一级导航
**Description:** 作为用户，我希望媒体文件管理作为独立导航项出现在侧边栏。

**Acceptance Criteria:**
- [ ] 侧边栏新增"媒体文件"一级导航项
- [ ] 点击后跳转到媒体文件管理页面（独立路由）
- [ ] 媒体文件页面使用全局主题色
- [ ] 媒体文件页面使用全局布局（包含侧边栏）
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-004: 统计数据页面作为独立一级导航
**Description:** 作为用户，我希望统计数据作为独立导航项出现在侧边栏。

**Acceptance Criteria:**
- [ ] 侧边栏新增"统计"一级导航项
- [ ] 点击后跳转到统计页面（独立路由）
- [ ] 统计页面使用全局主题色
- [ ] 统计页面使用全局布局（包含侧边栏）
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-005: 笔记类型页面统一主题色
**Description:** 作为用户，我期望笔记类型页面使用全局主题色，保持视觉一致性。

**Acceptance Criteria:**
- [ ] 笔记类型页面所有按钮、链接、强调色使用全局主题色
- [ ] 页面使用全局布局（包含侧边栏）
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-006: 导入页面统一主题色
**Description:** 作为用户，我期望导入页面使用全局主题色，保持视觉一致性。

**Acceptance Criteria:**
- [ ] 导入页面所有按钮、链接、强调色使用全局主题色
- [ ] 页面使用全局布局（包含侧边栏）
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-007: 重复卡片页面统一主题色
**Description:** 作为用户，我期望重复卡片页面使用全局主题色，保持视觉一致性。

**Acceptance Criteria:**
- [ ] 重复卡片页面所有按钮、链接、强调色使用全局主题色
- [ ] 页面使用全局布局（包含侧边栏）
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-008: 卡片设置融合到设置页面
**Description:** 作为用户，我希望卡片设置的5个tab作为设置页面的子项，不需要单独页面。

**Acceptance Criteria:**
- [ ] 卡片设置原有的5个tab内容迁移到设置页面
- [ ] 作为设置页面的子菜单项（类似现有的"卡片管理"）
- [ ] 点击后右侧面板显示对应tab内容
- [ ] 删除独立的卡片设置页面路由和组件
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

## Functional Requirements

- FR-1: 设置页面重构为左右布局：左侧固定宽度菜单（约200-250px），右侧自适应内容区域
- FR-2: 左侧菜单点击切换右侧内容，使用 React 状态管理，不触发页面跳转
- FR-3: 侧边栏新增"标签"一级导航（独立路由 /tags）
- FR-4: 侧边栏新增"媒体文件"一级导航（独立路由 /media）
- FR-5: 侧边栏新增"统计"一级导航（独立路由 /stats）
- FR-6: 笔记类型、标签、媒体文件、导入、重复卡片、统计、卡片设置页面统一使用全局主题色
- FR-7: 这些页面统一使用全局布局容器（AppLayout）
- FR-8: 卡片设置5个tab作为设置页面子项，数据结构可参考现有"卡片管理"子菜单
- FR-9: 删除独立的卡片设置页面路由

## Non-Goals

- 不修改现有业务逻辑，只做UI重构
- 不添加新的后端API
- 不修改数据库结构

## Technical Considerations

- 右侧面板切换可使用 React 状态（useState）管理当前选中项
- 全局主题色通过 CSS 变量或 Tailwind 配置获取
- 侧边栏导航配置可参考现有导航配置文件
- 卡片设置5个tab可参考设置页面现有子菜单的实现方式

## Success Metrics

- 设置页面点击菜单项后右侧内容即时切换，无闪烁
- 标签、媒体文件、统计作为独立导航项可见
- 所有相关页面使用统一的全局主题色

## Open Questions

- 卡片设置5个tab的具体内容是什么？需要确认每个tab的功能
- 全局主题色在代码中的具体变量名是什么？（如 primary、accent 等）
