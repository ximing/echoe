# PRD: echoe 导航与布局重构

## Introduction

echoe 是一个类似 Anki 的 AI 辅助闪卡学习应用。当前存在严重的交互设计问题：

1. **Layout 组件未被使用** - `apps/web/src/components/layout.tsx` 中已有完善的侧边栏设计，但路由完全没有使用它
2. **导航平铺在页面 Header** - cards 首页有 10+ 个功能按钮平铺在顶部，像传统网站而非现代 App
3. **主要入口不突出** - "学习/复习" 和 "创建卡片" 这些核心功能没有更醒目的展示
4. **架构混乱** - 每个页面自己实现了部分导航，没有统一的布局规范

本次重构聚焦于：**使用现有 Layout 组件重构导航结构，让主要入口更突出，实现更现代的 App 化交互体验**。

---

## Goals

- 使用现有的 `Layout` 组件（左侧 70px 侧边栏）作为所有内部页面的统一布局
- 将次要功能入口移至设置菜单，主要入口（学习、创建）更突出
- 实现"现代 App 化"的导航交互：侧边栏 + 悬浮操作按钮
- 统一路由结构，符合前端架构规范
- 保持现有功能逻辑不变，只改交互和架构

---

## User Stories

### US-001: 重构路由使用 Layout 组件
**Description:** 作为开发者，我需要统一使用 Layout 组件作为所有内部页面的容器，让侧边栏导航生效。

**Acceptance Criteria:**
- [ ] 修改 App.tsx，所有 `/cards/*` 和 `/settings` 路由都用 Layout 组件包裹
- [ ] 路由结构：`<Route path="/cards" element={<Layout><CardsPage /></Layout>} />`
- [ ] Layout 组件接收当前路径高亮对应的导航项
- [ ] 移除 cards/index.tsx 顶部平铺的 Header 按钮区域
- [ ] Typecheck 和 lint 通过
- [ ] 验证：访问 /cards、/cards/browser、/settings 等页面都有左侧侧边栏导航

### US-002: 优化侧边栏导航项
**Description:** 作为用户，我希望侧边栏导航简洁明了，主要入口更突出。

**Acceptance Criteria:**
- [ ] 侧边栏顶部：Logo + 应用名称
- [ ] 侧边栏核心导航：
  - 学习/复习（Zap 图标，主色调高亮，显示待复习数量徽章）
  - 我的卡组（Layers 图标）
  - 浏览卡片（Search 图标）
- [ ] 侧边栏底部：
  - 设置（Settings 图标）
  - 主题切换（Sun/Moon 图标）
  - 用户头像 + 菜单（下拉：个人资料、登出）
- [ ] 当前页面对应导航项高亮（背景色 + 文字颜色）
- [ ] 移除 header 中平铺的功能按钮（Browse Cards, Statistics, Note Types 等）
- [ ] Typecheck 通过
- [ ] 验证：侧边栏视觉简洁，核心入口突出

### US-003: 添加"创建卡片"悬浮按钮 (FAB)
**Description:** 作为用户，我希望随时能快速创建新卡片，有一个醒目的按钮入口。

**Acceptance Criteria:**
- [ ] 在内容区域右下角添加悬浮按钮（Floating Action Button）
- [ ] 按钮样式：圆形、主色调背景、Plus 图标、阴影效果
- [ ] 点击后打开创建卡片对话框（复用在 cards/index.tsx 中的逻辑）
- [ ] 按钮位置：固定在视口右下角，有适当的边距
- [ ] 仅在卡组列表页（/cards）和学习页面（/cards/study/*）显示 FAB
- [ ] Typecheck 通过
- [ ] 验证：点击 FAB 能创建新卡片，位置醒目且不影响其他操作

### US-004: 将次要功能移至设置页面
**Description:** 作为用户，我希望主导航简洁，次要功能放在设置里。

**Acceptance Criteria:**
- [ ] 在设置页面添加"卡片管理"子菜单：
  - Note Types（笔记类型）
  - Tags（标签管理）
  - Media（媒体文件）
  - Import（导入）
  - Duplicates（重复卡片）
  - Statistics（统计）
  - 卡片设置（现有 /cards/settings）
- [ ] 设置页面使用 Layout 的二级导航或现有的 Settings 布局
- [ ] 保留从卡组上下文菜单访问这些功能的入口（如 Browse、Statistics 等按钮移到卡组右键菜单或设置中）
- [ ] Typecheck 通过
- [ ] 验证：从设置页面可以访问所有次要功能

### US-005: 学习入口突出展示
**Description:** 作为用户，我希望能快速开始学习，有醒目的"开始学习"入口。

**Acceptance Criteria:**
- [ ] 在 cards 首页（/cards）保留底部的"开始学习"栏（当有待复习卡片时）
- [ ] 或者在侧边栏的"学习"导航项旁显示待复习数量徽章
- [ ] 点击后进入学习模式（/cards/study）
- [ ] 如果没有待复习卡片，显示友好提示
- [ ] Typecheck 通过
- [ ] 验证：能快速开始学习，待复习数量清晰可见

---

## Functional Requirements

- FR-1: 修改 App.tsx 路由，使用 Layout 组件包裹所有内部页面
- FR-2: Layout 组件根据当前路由高亮对应的侧边栏导航项
- FR-3: 移除 cards/index.tsx 顶部平铺的 Header 按钮区域
- FR-4: 侧边栏导航包含：
  - 学习/复习（Zap 图标，主色调高亮，显示待复习数量徽章）
  - 我的卡组（Layers 图标）
  - 浏览卡片（Search 图标）
- FR-5: 右下角添加"创建卡片"悬浮按钮 (FAB)，仅在卡组列表页和学习页面显示
- FR-6: 设置页面添加"卡片管理"二级导航，包含所有次要功能
- FR-7: 学习入口显示待复习数量徽章
- FR-8: 保持现有功能逻辑不变，只重构导航和布局

---

## Non-Goals

- 不修改现有业务逻辑（卡片创建、学习算法、数据存储等）
- 不修改卡片编辑器、学习页面的 UI（除非影响导航一致性）
- 不添加新的后端 API
- 不修改认证流程
- 移动端响应式设计可以作为后续任务，本次优先桌面端

---

## Technical Considerations

- 复用现有的 `apps/web/src/components/layout.tsx` 组件
- Layout 组件需要接收当前路径来高亮导航项（可能需要修改）
- "创建卡片"FAB 可以是一个独立的组件，放在 Layout 的 content 区域
- 设置页面的二级导航可以复用现有的 Settings 布局或在 Layout 中实现
- 路由结构建议：

```
/cards (Layout)
  ├── /cards (CardsPage - 卡组列表)
  ├── /cards/browser (CardBrowserPage - 浏览卡片)
  ├── /cards/study/:deckId? (StudyPage - 学习)
  ├── /cards/cards/new (CardEditorPage - 创建卡片)
  ├── /cards/cards/:noteId/edit (CardEditorPage - 编辑卡片)
  ├── /cards/notetypes (NoteTypesPage)
  ├── /cards/tags (TagsPage)
  ├── /cards/media (MediaPage)
  ├── /cards/import/csv (CsvImportPage)
  ├── /cards/duplicates (DuplicatesPage)
  ├── /cards/stats (StatsPage)
  └── /cards/settings (CardsSettingsPage)

/settings (Layout)
  └── /settings/account, /settings/models, /settings/theme, /settings/about
```

---

## Success Metrics

- 导航层级从 2 层（平铺按钮）减少到 1 层（侧边栏）
- "创建卡片"操作从 2 步（找按钮 → 点击）减少到 1 步（点击 FAB）
- 核心学习入口在侧边栏直接可见
- 路由结构符合前端架构规范（统一使用 Layout）

---

## Open Questions

（已确认：1. 侧边栏保留 Browse Cards；2. FAB 仅在卡组/学习页面显示；3. 仅 PC 端，无需移动端适配）
