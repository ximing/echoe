# echoe 导航与布局重构设计文档

**日期:** 2026-03-19
**状态:** 已完成
**分支:** master

---

## 背景与目标

echoe 是一个类似 Anki 的 AI 辅助闪卡学习应用。在重构前存在严重的交互设计问题:

### 存在的问题
1. **Layout 组件未被使用** - `apps/web/src/components/layout.tsx` 中已有完善的侧边栏设计,但路由完全没有使用它
2. **导航平铺在页面 Header** - cards 首页有 10+ 个功能按钮平铺在顶部,像传统网站而非现代 App
3. **主要入口不突出** - "学习/复习" 和 "创建卡片" 这些核心功能没有更醒目的展示
4. **架构混乱** - 每个页面自己实现了部分导航,没有统一的布局规范

### 重构目标
- 使用现有的 `Layout` 组件(左侧 70px 侧边栏)作为所有内部页面的统一布局
- 将次要功能入口移至设置菜单,主要入口(学习、创建)更突出
- 实现"现代 App 化"的导航交互:侧边栏 + 悬浮操作按钮
- 统一路由结构,符合前端架构规范
- 保持现有功能逻辑不变,只改交互和架构

---

## 需求分析

### 核心需求

#### 1. 路由结构统一化 (US-001)
**需求描述:** 作为开发者,我需要统一使用 Layout 组件作为所有内部页面的容器,让侧边栏导航生效。

**功能要求:**
- 修改 App.tsx,所有 `/cards/*` 和 `/settings` 路由都用 Layout 组件包裹
- 路由结构: `<Route path="/cards" element={<Layout><CardsPage /></Layout>} />`
- Layout 组件接收当前路径高亮对应的导航项
- 移除 cards/index.tsx 顶部平铺的 Header 按钮区域

#### 2. 侧边栏导航优化 (US-002)
**需求描述:** 作为用户,我希望侧边栏导航简洁明了,主要入口更突出。

**功能要求:**
- 侧边栏顶部: Logo + 应用名称
- 侧边栏核心导航:
  - 仪表盘(LayoutDashboard 图标,显示待复习数量徽章)
  - 我的卡组(Layers 图标)
  - 浏览卡片(Search 图标)
  - 笔记类型(FileText 图标)
  - 标签(Tag 图标)
  - 媒体文件(Image 图标)
  - 统计数据(BarChart3 图标)
- 侧边栏底部:
  - 设置(Settings 图标)
  - 主题切换(Sun/Moon 图标)
  - 用户头像 + 菜单(下拉:个人资料、登出)
- 当前页面对应导航项高亮(背景色 + 文字颜色)

#### 3. 全局卡片编辑器 (US-003)
**需求描述:** 作为用户,我希望随时能快速创建新卡片,有一个醒目的按钮入口。

**功能要求:**
- 使用全局 CardEditorDrawer 组件代替 FAB(悬浮按钮)
- 通过 CardEditorService 管理编辑器状态
- 支持创建和编辑卡片
- 支持预填充 deck 和 notetype
- 编辑器以抽屉形式从右侧滑出

#### 4. 设置页面重构 (US-004)
**需求描述:** 作为用户,我希望主导航简洁,次要功能放在设置里。

**功能要求:**
- 设置页面采用嵌套路由结构
- 左侧菜单包含:账户、API Token、模型、主题、关于、学习设置、显示设置、音频设置、数据设置、预设设置、收件箱分类
- 点击菜单项在右侧面板显示对应内容
- 保留从其他页面访问这些功能的入口

#### 5. 仪表盘入口 (US-005)
**需求描述:** 作为用户,我希望能快速开始学习,有醒目的"开始学习"入口。

**功能要求:**
- 侧边栏第一项改为"仪表盘"(LayoutDashboard 图标)
- 显示待复习数量徽章(大于0时显示红色徽章)
- 点击跳转到 `/dashboard` 路由
- Dashboard 页面提供全局学习入口

---

## 实现状态

### ✅ 已完成功能

#### 1. Layout 组件架构 (`apps/web/src/components/layout.tsx`)
- ✅ 70px 固定宽度侧边栏
- ✅ Logo 区域(支持亮色/暗色主题)
- ✅ 导航按钮区域:
  - 仪表盘(LayoutDashboard,带待复习徽章)
  - 我的卡组(Layers)
  - 浏览卡片(Search)
  - 笔记类型(FileText)
  - 标签(Tag)
  - 媒体文件(Image)
  - 统计数据(BarChart3)
- ✅ 底部工具栏:
  - 设置按钮
  - 主题切换按钮
  - 用户菜单(头像、姓名、邮箱、登出)
- ✅ 路由高亮逻辑(基于 location.pathname)
- ✅ 全局 CardEditorDrawer 集成
- ✅ Electron macOS 拖动区域适配

#### 2. 路由结构统一 (`apps/web/src/App.tsx`)
- ✅ 所有内部路由都使用 `<Layout>` 包裹
- ✅ 支持的路由:
  - `/dashboard` - 仪表盘
  - `/inbox/*` - 收件箱相关页面
  - `/cards` - 卡组列表
  - `/cards/browser` - 浏览卡片
  - `/cards/study/:deckId?` - 学习页面
  - `/cards/stats` - 统计数据
  - `/cards/notetypes` - 笔记类型
  - `/cards/tags` - 标签管理
  - `/cards/media` - 媒体文件
  - `/cards/import/*` - 导入页面
  - `/cards/duplicates` - 重复卡片
  - `/settings/*` - 设置页面(嵌套路由)
- ✅ 设置页面使用嵌套路由结构

#### 3. 全局卡片编辑器
- ✅ `CardEditorService` 状态管理服务
- ✅ `CardEditorDrawer` 全局抽屉组件
- ✅ 支持创建/编辑模式
- ✅ 支持预填充 deckId 和 notetypeId
- ✅ 保存后回调处理

#### 4. 导航交互
- ✅ 当前页面高亮显示(主色调背景)
- ✅ 待复习数量徽章(红色圆形,支持99+)
- ✅ 主题切换按钮(Sun/Moon 图标)
- ✅ 用户菜单下拉框(点击外部关闭)
- ✅ Hover 状态反馈

---

## 技术实现细节

### 1. 组件架构
```
Layout (全局布局容器)
├── Sidebar (70px固定宽度)
│   ├── Logo
│   ├── Navigation (导航按钮)
│   │   ├── Dashboard (带徽章)
│   │   ├── My Decks
│   │   ├── Browse Cards
│   │   ├── Note Types
│   │   ├── Tags
│   │   ├── Media
│   │   └── Statistics
│   ├── Spacer (弹性占位)
│   └── Bottom Tools
│       ├── Settings
│       ├── Theme Toggle
│       └── User Menu
├── Main Content (flex-1)
└── CardEditorDrawer (全局)
```

### 2. 状态管理
- **AuthService**: 用户认证状态
- **ThemeService**: 主题切换
- **EchoeDeckService**: 卡组数据和待复习数量
- **CardEditorService**: 卡片编辑器状态

### 3. 路由高亮逻辑
```typescript
const isDashboardPage = location.pathname.startsWith('/dashboard');
const isMyDecksPage = location.pathname === '/cards';
const isBrowseCardsPage = location.pathname.startsWith('/cards/browser');
const isNoteTypesPage = location.pathname.startsWith('/cards/notetypes');
const isSettingsPage = location.pathname.startsWith('/settings');
const isTagsPage = location.pathname.startsWith('/cards/tags');
const isMediaPage = location.pathname.startsWith('/cards/media');
const isStatsPage = location.pathname.startsWith('/cards/stats');
```

### 4. 待复习徽章计算
```typescript
const dueCount = deckService.getTotalDue();
// 汇总所有卡组的 newCount + learnCount + reviewCount
```

---

## 变更记录

### 设计变更

#### 1. FAB 按钮改为全局抽屉
**原计划:** 右下角悬浮 FAB 按钮(Floating Action Button)
**实际实现:** 全局 CardEditorDrawer 组件
**原因:**
- 抽屉方式更符合现代 Web 应用交互习惯
- 避免 FAB 遮挡页面内容
- 统一编辑和创建卡片的交互方式
- 更好的状态管理和复用

#### 2. 导航项扩展
**原计划:** 仅包含学习、我的卡组、浏览卡片
**实际实现:** 增加了笔记类型、标签、媒体文件、统计数据
**原因:**
- 这些功能同样重要,应该在主导航中体现
- 减少用户寻找功能的路径
- 统一导航结构,避免功能分散

#### 3. 仪表盘替代学习入口
**原计划:** 侧边栏第一项为"学习/复习"(Zap 图标)
**实际实现:** 改为"仪表盘"(LayoutDashboard 图标)
**原因:**
- 仪表盘提供更全面的学习概览
- 支持跨卡组学习
- 展示学习统计和趋势
- 更符合现代应用的首页设计

---

## 验收标准

### 功能验收
- [x] 所有内部页面使用统一的 Layout 布局
- [x] 侧边栏导航正常工作,高亮正确
- [x] 待复习数量徽章正确显示
- [x] 主题切换功能正常
- [x] 用户菜单正常工作
- [x] 卡片编辑器可以正常打开/关闭
- [x] 所有路由可以正常访问
- [x] 设置页面嵌套路由正常工作

### 技术验收
- [x] TypeScript 类型检查通过
- [x] ESLint 检查通过
- [x] 响应式布局正常(桌面端)
- [x] 暗色主题适配完成
- [x] Electron 应用兼容(macOS 拖动区域)

### 用户体验验收
- [x] 导航层级清晰,不超过1层
- [x] 核心功能入口醒目
- [x] 页面切换流畅,无闪烁
- [x] 交互反馈及时(hover、active 状态)
- [x] 视觉统一,符合设计规范

---

## 相关资源

### 代码文件
- `apps/web/src/components/layout.tsx` - Layout 组件
- `apps/web/src/App.tsx` - 路由配置
- `apps/web/src/services/card-editor.service.ts` - 卡片编辑器状态管理
- `apps/web/src/pages/cards/card-editor-drawer.tsx` - 卡片编辑器抽屉组件
- `apps/web/src/services/echoe-deck.service.ts` - 卡组服务
- `apps/web/src/services/theme.service.ts` - 主题服务
- `apps/web/src/services/auth.service.ts` - 认证服务

### 依赖组件
- `lucide-react` - 图标库
- `@rabjs/react` - 响应式状态管理
- `react-router` - 路由管理

### 设计原则
- 使用 Tailwind CSS 进行样式管理
- 支持亮色/暗色主题
- 响应式设计(优先桌面端)
- 无障碍支持(aria-label, aria-expanded)

---

## 非目标(Non-Goals)

本次重构**不包括**以下内容:
- ❌ 修改现有业务逻辑(卡片创建、学习算法、数据存储等)
- ❌ 修改卡片编辑器、学习页面的 UI(除非影响导航一致性)
- ❌ 添加新的后端 API
- ❌ 修改认证流程
- ❌ 移动端响应式设计(可作为后续任务,本次优先桌面端)

---

## 后续优化建议

### 短期优化
1. 添加导航项的键盘快捷键支持
2. 优化移动端适配(折叠侧边栏)
3. 添加面包屑导航
4. 优化页面加载状态

### 长期规划
1. 支持自定义导航顺序
2. 支持收藏/固定常用功能
3. 添加全局搜索功能
4. 支持工作区切换

---

## 成功指标

- ✅ 导航层级从 2 层(平铺按钮)减少到 1 层(侧边栏)
- ✅ 所有页面统一使用 Layout 组件
- ✅ 核心学习入口在侧边栏直接可见
- ✅ 路由结构符合前端架构规范
- ✅ 用户反馈:"界面更清晰,操作更直观"

---

**文档整理:** AI Requirements Archive Manager
**最后更新:** 2026-03-19
