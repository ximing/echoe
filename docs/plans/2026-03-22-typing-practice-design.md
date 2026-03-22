# 打字练习功能设计文档

**日期**: 2026-03-22
**功能**: 在学习卡片页面添加打字练习区域
**影响范围**: `/cards/study` 页面

---

## 一、功能概述

在学习卡片的正反面之间添加打字练习区域，用户可以通过打字练习来加强记忆。功能包括：
- 基于卡片 Front 字段的第一个文本字段生成打字练习
- 按单词分割，每个单词一个输入框
- 实时验证每个字符，正确显示绿色，错误显示红色并抖动
- 全部输入正确后显示粒子庆祝动画
- 正反面都显示打字练习（正面可输入，反面显示结果）

---

## 二、用户需求

1. **位置**: 在 Show Answer 按钮和难度按钮上方
2. **显示时机**: 正面和反面都显示
3. **内容来源**: Front 字段的第一个文本字段
4. **分割规则**: 按空格分割单词，标点符号也需要输入
5. **验证方式**: 实时验证每个字符
6. **正确反馈**: 字符变绿色
7. **错误反馈**: 字符变红色并抖动
8. **完成动画**: 小粒子从中心散开，1秒内完成
9. **布局调整**: Show Answer 和难度按钮适当减少高度

---

## 三、架构设计

### 3.1 组件层级

```
StudyPage (apps/web/src/pages/cards/study.tsx)
├── CardContent (卡片内容区域)
│   └── 高度: min-h-[300px] → min-h-[240px]
├── TypingPractice (新增打字练习组件)
│   ├── 高度: 80px 固定
│   ├── 正面: 显示输入框 + 实时验证
│   └── 反面: 显示最终结果
├── Show Answer 按钮
│   └── 高度: py-4 → py-3
└── 难度按钮组
    └── 高度: py-3 → py-2.5
```

### 3.2 状态管理（Service 层）

在 `EchoeStudyService` 中添加：

```typescript
// 打字练习状态
typingPractice = {
  words: string[]           // 单词列表 ['hello', 'world']
  currentInput: string      // 用户当前输入内容
  validationResults: Array<{
    char: string           // 字符
    isCorrect: boolean     // 是否正确
    shouldShake: boolean   // 是否触发抖动
  }>
  isCompleted: boolean      // 是否全部输入正确
}

// 方法
extractTypingText(card: StudyQueueItemDto): string
  - 从 Front 模板提取第一个 {{FieldName}}
  - 获取字段值并去除 HTML 标签
  - 返回纯文本

onTypingInput(input: string): void
  - 实时验证用户输入
  - 更新 validationResults
  - 检查是否完成

resetTypingPractice(): void
  - 切换卡片时重置状态
  - 在 showAnswer() 和 submitReview() 中调用
```

### 3.3 组件设计（View 层）

**TypingPractice.tsx**:
```typescript
interface TypingPracticeProps {
  words: string[]           // 单词列表
  isShowingAnswer: boolean  // 正面/反面
}

功能:
- 使用 @view 装饰器，响应式更新
- 使用 useService(EchoeStudyService) 获取状态
- 正面: 渲染输入框，绑定 onChange 事件
- 反面: 渲染结果展示（绿色/红色标记）
- 管理粒子动画的生成和清理
```

---

## 四、核心功能实现

### 4.1 文本提取逻辑

```typescript
extractTypingText(card: StudyQueueItemDto): string {
  // 1. 使用正则提取 Front 模板中的第一个 {{FieldName}}
  const match = card.front.match(/\{\{([^#/}]+)\}\}/)
  if (!match) return ''

  const fieldName = match[1].trim()

  // 2. 获取字段值
  let fieldValue = card.fields[fieldName] || ''

  // 3. 去除 HTML 标签
  const div = document.createElement('div')
  div.innerHTML = fieldValue
  const text = div.textContent || div.innerText || ''

  // 4. 清理多余空格
  return text.trim().replace(/\s+/g, ' ')
}
```

### 4.2 实时验证逻辑

```typescript
onTypingInput(input: string) {
  const targetText = this.typingPractice.words.join(' ')
  const results = []

  // 逐字符对比
  for (let i = 0; i < input.length; i++) {
    const inputChar = input[i]
    const targetChar = targetText[i] || ''

    if (inputChar === targetChar) {
      results.push({
        char: inputChar,
        isCorrect: true,
        shouldShake: false
      })
    } else {
      results.push({
        char: inputChar,
        isCorrect: false,
        shouldShake: true
      })
    }
  }

  this.typingPractice.currentInput = input
  this.typingPractice.validationResults = results

  // 检查是否完成
  if (input === targetText && input.length > 0) {
    this.typingPractice.isCompleted = true
  } else {
    this.typingPractice.isCompleted = false
  }

  // 重置抖动标记（200ms 后）
  setTimeout(() => {
    this.typingPractice.validationResults.forEach(r => r.shouldShake = false)
  }, 200)
}
```

### 4.3 输入框交互

```typescript
输入框行为:
- 每个单词一个 <input> 元素
- 宽度根据单词长度自适应: max(60px, 单词长度 × 12px)
- 输入完一个单词（检测到空格）自动聚焦下一个输入框
- 支持 Tab 键切换
- 支持 Backspace 在空输入框时返回上一个
- 正面自动聚焦第一个输入框
```

### 4.4 粒子庆祝动画

```typescript
triggerCelebration() {
  const container = document.querySelector('.typing-practice-container')
  const rect = container.getBoundingClientRect()
  const centerX = rect.width / 2
  const centerY = rect.height / 2

  // 生成 10 个粒子
  for (let i = 0; i < 10; i++) {
    const particle = document.createElement('div')
    particle.className = 'typing-particle'

    // 计算随机方向
    const angle = (Math.PI * 2 * i) / 10
    const distance = 40 + Math.random() * 20  // 40-60px
    const tx = Math.cos(angle) * distance
    const ty = Math.sin(angle) * distance

    particle.style.cssText = `
      --tx: ${tx}px;
      --ty: ${ty}px;
      left: ${centerX}px;
      top: ${centerY}px;
      animation-delay: ${Math.random() * 100}ms;
    `

    container.appendChild(particle)
  }

  // 1 秒后清理
  setTimeout(() => {
    container.querySelectorAll('.typing-particle').forEach(p => p.remove())
  }, 1100)
}
```

---

## 五、UI 设计

### 5.1 布局结构

```
┌──────────────────────────────────────────┐
│  CardContent (卡片内容)                   │
│  min-h: 240px                             │
│  显示卡片正面或反面内容                   │
└──────────────────────────────────────────┘
┌──────────────────────────────────────────┐
│  TypingPractice (打字练习区域)            │
│  height: 80px                             │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐    │
│  │ hello   │ │ world   │ │ _______ │    │
│  └─────────┘ └─────────┘ └─────────┘    │
│  每个单词一个输入框，实时验证             │
└──────────────────────────────────────────┘
┌──────────────────────────────────────────┐
│  Show Answer 按钮                         │
│  py: 3 (减小高度)                         │
└──────────────────────────────────────────┘
┌──────────────────────────────────────────┐
│  难度按钮 (Again / Hard / Good / Easy)   │
│  py: 2.5 (减小高度)                       │
└──────────────────────────────────────────┘
```

### 5.2 样式定义

**输入框样式**:
```css
.typing-input {
  background: transparent;
  border: none;
  border-bottom: 2px solid #d1d5db;  /* gray-300 */
  text-align: center;
  font-size: 1rem;
  padding: 0.5rem;
  outline: none;
  transition: border-color 0.2s;
}

.typing-input:focus {
  border-bottom-color: #3b82f6;  /* blue-500 */
}

/* 字符状态 */
.typing-char-correct {
  color: #10b981;  /* green-500 */
  transition: color 0.2s;
}

.typing-char-error {
  color: #ef4444;  /* red-500 */
  animation: shake 0.3s;
}

/* 抖动动画 */
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-4px); }
  50% { transform: translateX(4px); }
  75% { transform: translateX(-2px); }
}
```

**粒子动画**:
```css
.typing-particle {
  position: absolute;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: linear-gradient(135deg, #10b981, #3b82f6);
  pointer-events: none;
  animation: particle-burst 1s ease-out forwards;
}

@keyframes particle-burst {
  0% {
    transform: translate(0, 0) scale(1);
    opacity: 1;
  }
  100% {
    transform: translate(var(--tx), var(--ty)) scale(0);
    opacity: 0;
  }
}
```

**反面结果展示**:
```css
.typing-result {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  justify-content: center;
  padding: 1rem;
}

.typing-result-word {
  font-size: 1.125rem;
}

.typing-result-correct {
  color: #10b981;  /* green-500 */
}

.typing-result-error {
  color: #ef4444;  /* red-500 */
  text-decoration: line-through;
}

.typing-result-missing {
  color: #9ca3af;  /* gray-400 */
}
```

---

## 六、边界情况处理

### 6.1 特殊情况

| 情况 | 处理方式 |
|------|----------|
| Front 字段为空 | 不显示打字练习区域 |
| Front 只有 HTML 无文本 | 不显示打字练习区域 |
| Cloze 卡片 | 提取完整文本（包含 cloze 内容） |
| 超长文本 (>20 单词) | 只显示前 20 个单词，或添加滚动 |
| 特殊字符 | 保留标点符号，用户需要输入 |
| 连续多个空格 | 合并为一个空格 |
| 单词过长 (>15 字符) | 输入框最大宽度 200px，超出滚动 |

### 6.2 Cloze 卡片特殊处理

```typescript
// 对于 Cloze 卡片，提取时需要还原被遮挡的文本
extractTypingText(card: StudyQueueItemDto): string {
  let text = this.extractFirstField(card)

  // 还原 cloze 删除: {{c1::word}} → word
  text = text.replace(/\{\{c\d+::([^:}]+)(?:::[^}]+)?\}\}/g, '$1')

  return text
}
```

### 6.3 性能优化

```typescript
// 1. 验证逻辑防抖（避免过度渲染）
const VALIDATION_DEBOUNCE = 16  // 约 60fps

// 2. 粒子动画优化
- 使用 CSS transform (GPU 加速)
- 动画完成后立即清理 DOM
- 最多同时存在 10 个粒子

// 3. 输入框优化
- 使用受控组件，避免不必要的重渲染
- 只在验证结果变化时更新 UI
```

---

## 七、测试用例

### 7.1 功能测试

| 测试项 | 预期结果 |
|--------|----------|
| 输入正确字符 | 字符变绿色 |
| 输入错误字符 | 字符变红色并抖动 |
| 全部输入正确 | 触发粒子庆祝动画 |
| 切换到反面 | 显示输入结果（绿/红标记） |
| 切换到下一张卡片 | 打字状态重置 |
| 空 Front 字段 | 不显示打字练习区域 |
| Cloze 卡片 | 正确提取完整文本 |

### 7.2 交互测试

| 测试项 | 预期结果 |
|--------|----------|
| 正面加载 | 自动聚焦第一个输入框 |
| 输入完一个单词 | 自动跳到下一个输入框 |
| Tab 键 | 切换到下一个输入框 |
| Backspace 在空输入框 | 返回上一个输入框 |
| 粒子动画 | 1 秒后自动清理 DOM |

### 7.3 边界测试

| 测试项 | 预期结果 |
|--------|----------|
| 超长文本 (50 单词) | 截断或滚动显示 |
| 单个单词 | 正常显示一个输入框 |
| 特殊字符 `hello, world!` | 用户需要输入逗号和感叹号 |
| 连续空格 `hello  world` | 合并为 `hello world` |

---

## 八、实现计划

### 8.1 文件变更

**新增文件**:
- `apps/web/src/components/echoe/TypingPractice.tsx` (组件)
- `apps/web/src/components/echoe/TypingPractice.css` (样式)

**修改文件**:
- `apps/web/src/services/echoe-study.service.ts` (状态管理)
- `apps/web/src/pages/cards/study.tsx` (集成组件)

### 8.2 实现步骤

1. **Service 层实现** (echoe-study.service.ts)
   - 添加 typingPractice 状态定义
   - 实现 extractTypingText() 方法
   - 实现 onTypingInput() 方法
   - 实现 resetTypingPractice() 方法
   - 在 showAnswer() 和 submitReview() 中调用 reset

2. **组件实现** (TypingPractice.tsx)
   - 创建组件骨架，使用 @view 装饰器
   - 实现正面输入框渲染
   - 实现实时验证显示
   - 实现反面结果展示
   - 实现输入框焦点管理
   - 实现粒子庆祝动画

3. **样式实现** (TypingPractice.css)
   - 输入框基础样式
   - 字符状态样式（绿色/红色）
   - 抖动动画
   - 粒子动画
   - 反面结果展示样式

4. **集成到学习页面** (study.tsx)
   - 在 CardContent 和按钮区域之间插入 TypingPractice
   - 调整 CardContent 高度
   - 调整按钮高度
   - 传递必要的 props

5. **测试验证**
   - 功能测试：正确/错误反馈、动画效果
   - 交互测试：焦点管理、键盘导航
   - 边界测试：特殊情况处理

---

## 九、技术栈

- **React 19**: 组件框架
- **@rabjs/react**: 响应式状态管理
- **TypeScript**: 类型安全
- **TailwindCSS**: 样式框架
- **CSS Animations**: 抖动和粒子动画

---

## 十、后续优化方向

1. **统计功能**:
   - 记录打字速度（WPM）
   - 记录准确率
   - 显示历史统计

2. **配置选项**:
   - 允许用户开关打字练习
   - 选择验证模式（实时/单词/全部）
   - 自定义动画效果

3. **多语言支持**:
   - 中文分词支持
   - 日文/韩文支持

4. **音效反馈**:
   - 正确输入播放提示音
   - 错误输入播放警告音
   - 完成播放庆祝音效

---

**设计完成日期**: 2026-03-22
**设计者**: Claude Sonnet 4.6
**审核者**: 用户确认通过
