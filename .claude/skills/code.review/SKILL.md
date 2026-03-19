---
name: code-review
description: 面向 React + TypeScript 项目的代码坏味道审查 Skill。当用户提到 code review、clean code、技术债、可维护性、重构建议、组件太复杂、组件拆分过细、Hook 混乱、类型设计问题、PR 审查，或 @rabjs/react 领域模式与状态传递问题时，必须优先使用本 Skill。发现可执行问题时，必须使用 `gh` CLI 创建 GitHub issue。
---

# Echoe React + TypeScript 代码审查技能

本 Skill 专门用于"已实现代码"的坏味道审查，聚焦 React + TypeScript 场景。目标不是挑语法细节，而是发现会持续放大维护成本、引发缺陷、降低团队协作效率的问题。

## 触发条件

当用户出现以下意图时，直接触发：

- 要求做 `Code Review` / `PR Review`
- 提到 `clean code`、`坏味道`、`技术债`、`可维护性`
- 说组件"太大""太乱""状态难懂""Hook 难维护"或"拆得太碎"
- 希望按 React + TS 最佳实践给出重构建议
- 讨论 @rabjs/react 的领域边界、Service 生命周期与状态传递
- 希望得到可直接贴到 PR 的 review comments

## 审查原则

1. **可读性优先**：命名和结构应表达意图，减少读者推理负担
2. **单一职责**：组件、Hook、工具函数都应职责清晰，避免"上帝组件"
3. **适度抽象**：既避免组件过于臃肿，也避免过度组件化
4. **边界清晰**：UI、状态管理、副作用、数据访问尽量分层
5. **领域内直连状态**：在 @rabjs/react 场景优先通过 `useService` 获取领域状态
6. **类型即文档**：TypeScript 类型应帮助约束和表达业务，不应被 `any` 绕过
7. **副作用可控**：`useEffect` 应只处理副作用，依赖明确、清理完整、避免竞态
8. **可测试性**：核心逻辑可提取并可独立验证
9. **渐进重构**：建议优先给出低风险、可分步落地的改进路径

## 审查流程

### Step 1: 锁定审查范围

- 优先审查用户指定文件、PR diff、最近改动
- 结合上下游依赖：相关组件、Hook、types、utils、tests
- 如果范围很大，先聚焦最可能引发回归的关键路径

### Step 2: 快速风险扫描

先定位高风险问题：

- Hook 使用违规（条件调用、依赖错误、清理缺失）
- 类型系统被绕过（`any`、断言滥用）
- 数据流混乱（状态重复来源、难追踪更新链）
- 性能热点（重复渲染、重计算、Context 抖动）
- @rabjs/react 领域状态通过 props 层层传递（本可通过 `useService` 直连）
- `view` 装饰器缺失导致响应性失效

### Step 3: 坏味道深查

#### 1) 组件设计坏味道

- 组件承担过多职责（拉数据、数据转换、业务规则、视图渲染混在一起）
- JSX 过深嵌套、条件分支过多，阅读成本高
- 内联匿名函数和内联复杂表达式过多
- 组件过大但没有拆分（可按领域、状态边界、交互边界拆分）
- 组件拆分过细，子组件只做薄包装

#### 2) 状态管理坏味道

- 派生状态被重复存储，导致状态不一致
- 多处维护同一份状态真相（single source of truth 破坏）
- Props 逐层透传严重（prop drilling）
- @rabjs/react 中，本可 `useService` 获取的状态被改为 props 透传

#### 3) Hooks 与副作用坏味道

- Hook 条件调用或顺序不稳定
- `useEffect` 职责过多（请求、转换、埋点、状态回写混杂）
- `useEffect` 依赖项缺失/过量，出现 stale closure 或重复触发
- 异步请求缺少取消/竞态处理
- 事件监听、订阅、定时器缺少清理

#### 4) TypeScript 类型坏味道

- `any`、`as unknown as`、非空断言 `!` 过度使用
- Props 设计含糊（大量可选字段，缺少判别联合）
- 返回值类型不明确
- API 响应类型未建模

#### 5) 可维护性坏味道

- 魔法值、魔法字符串、重复业务规则散落
- 深层嵌套 `if/else` 或三元表达式可读性差
- 长函数、长参数列表、布尔开关参数过多
- 死代码、注释掉的大段旧实现长期残留

#### 6) 性能与稳定性坏味道

- 在渲染路径执行重计算且无 memo 策略
- `key` 不稳定导致列表状态错乱
- 缺少加载/空态/错误态

## 严重级别定义

| 级别 | 描述 |
|------|------|
| `P1` | 严重问题：会引发运行时错误或数据不一致 |
| `P2` | 中等问题：影响可维护性，增加回归风险 |
| `P3` | 轻微问题：代码风格、可读性改进 |
| `P4` | 观察项：低风险优化建议 |

## 输出格式

### 无问题

仅返回：`当前代码未发现阻塞问题`

### 有问题

```markdown
# React + TypeScript 代码坏味道审查

## Findings

### [P1] useEffect 职责混杂且依赖不完整
- **位置**: `src/features/order/OrderList.tsx` / `useEffect(loadOrders)`
- **坏味道**: 副作用与状态派生耦合，依赖缺失导致 closure 过期
- **风险**: 数据刷新不一致，线上行为难复现
- **证据**: effect 内同时做请求、过滤、埋点，并遗漏 `filters` 依赖
- **建议**:
  1. 请求逻辑抽到 `useOrdersQuery` 自定义 Hook
  2. 过滤逻辑改为 `useMemo` 派生值
  3. effect 仅保留"触发请求"职责并补齐依赖

### [P2] Props 通过布尔开关表达多态
- **位置**: `src/components/PaymentPanel.tsx` / `PaymentPanelProps`
- **坏味道**: `isEdit`, `isReadonly`, `isPreview` 等并存，存在非法组合
- **风险**: 新需求叠加后分支爆炸，回归概率高
- **建议**: 用判别联合类型替代布尔组合

## Open Questions
- 当前是否允许将请求逻辑从组件迁移到 hooks 层？

## Refactor Plan
1. 先修 P1 且低改动项（依赖补齐、清理副作用）
2. 再处理类型建模（判别联合、API 响应类型）
3. 最后处理结构优化（组件拆分、共享逻辑抽离）

## Overall Assessment
- 主要问题集中在副作用边界和类型建模，属于可渐进治理的技术债
```

## GitHub Issue 工作流

当存在至少一个可执行的 P1/P2 finding 时，必须创建 GitHub issue。

### Preflight 检查

```bash
gh --version
gh auth status
gh repo view --json nameWithOwner,viewerPermission
```

### Issue 标题格式

`[code-review][<P1|P2|P3|P4>][<category>] <short summary>`

category 示例：`component`、`state`、`hook`、`type`、`performance`

### Issue 正文模板

```markdown
## Background
Why this review item matters in business/technical terms.

## Current behavior
What the code currently does.

## Problem
Why this is incorrect/risky.

## Scope and impact
Who/what is affected.

## Reproduction or evidence
- File paths
- Key logic snippets/conditions

## Expected behavior
What correct behavior should be.

## Suggested fix
Concrete implementation direction.

## Acceptance criteria
- [ ] Criterion 1
- [ ] Criterion 2
```

### Labels

优先添加：
- `code-review`
- `tech-debt`
- 优先级标签：`P1` / `P2` / `P3` / `P4`（必须与 finding severity 一致）

### 创建 issue 后输出

```markdown
- Repo: `owner/repo`
- Findings reviewed: P1: 1, P2: 2, P3: 0, P4: 0
- Issues created:
  - `#123` [code-review][P1][hook] useEffect 依赖缺失 - https://github.com/owner/repo/issues/123
- Next step: 一个明确可执行的实现建议
```

## Review Comment 模板（用于 PR）

```markdown
[P1][Hook Side Effect] `useEffect` 同时处理请求和派生状态，且依赖不完整。

- Impact: 可能导致请求数据与 UI 过滤条件不同步
- Suggestion: 将请求迁移到自定义 Hook，派生过滤使用 `useMemo`
- Why: 这能让副作用边界更清晰，减少闭包陷阱并提升可测试性
```

## 快速示例

### 示例 1：派生状态重复存储

```tsx
// ❌ Bad
const [fullName, setFullName] = useState("");
useEffect(() => {
  setFullName(`${user.firstName} ${user.lastName}`);
}, [user]);

// ✅ Good
const fullName = `${user.firstName} ${user.lastName}`;
// 或使用 useMemo 如果计算成本高
```

### 示例 2：类型绕过

```ts
// ❌ Bad
const data = resp as any;
return data.list.map(item => item.id);

// ✅ Good
interface ApiResponse {
  list: Array<{ id: string }>;
}
const data = resp as ApiResponse;
return data.list.map(item => item.id);
```

### 示例 3：布尔参数坏味道

```tsx
// ❌ Bad
<Dialog isCreate={false} isEdit={true} isReadonly={false} />

// ✅ Good
<Dialog mode="create" | "edit" | "readonly" />
```

### 示例 4：过度组件化

```tsx
// ❌ Bad - 维护路径过长
<Section>
  <SectionBody>
    <FieldRow>
      <FieldLabel>姓名</FieldLabel>
      <FieldValue>{user.name}</FieldValue>
    </FieldRow>
  </SectionBody>
</Section>

// ✅ Good - 语义化组件
<Field label="姓名" value={user.name} />
```

## 质量门槛

- 每个 P1/P2 finding 必须包含代码证据
- 禁止无证据的猜测性结论
- 优先输出少量高置信问题，而非大量低质量问题
- 对拿不准的问题，先与用户确认，确认后再建 issue
