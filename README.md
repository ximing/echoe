# Echoe

> 一款帮助你“真正记住”的 AI 记忆学习应用
>
> English version: [README_EB.md](./README_EB.md)

## 为什么是 Echoe

很多工具只能帮你“记下来”，但无法帮你“记得住”。

Echoe 聚焦长期记忆：把碎片信息转成可复习的卡片，并通过 FSRS 间隔重复算法安排复习节奏，让知识真正进入长期记忆。

## 核心亮点

- **记忆优先，不是文档优先**：围绕“学习队列 + 复习反馈 + 记忆曲线”设计核心流程。
- **FSRS 科学复习引擎**：支持 Again / Hard / Good / Easy 评分，动态调整下次复习时间。
- **Anki 生态兼容**：支持 `.apkg` 导入与导出，可迁移已有卡组与学习资产。
- **AI 碎片整理为卡片**：支持 Inbox 内容一键转卡，AI 可辅助推荐卡组/模板并优化问答内容。
- **语义检索 + 知识连接**：向量检索帮助你快速召回相关知识点，而不仅是关键词匹配。

## 典型使用流程

1. **收集**：把想学的内容放进 Inbox（文字、资料、灵感）。
2. **制卡**：将内容转为闪卡，按模板映射到 Front/Back 等字段。
3. **复习**：每天按学习队列复习，给出记忆反馈评分。
4. **强化**：系统自动安排下一次复习，让记忆稳定沉淀。

## 架构概览

- `apps/web`：Web 前端（React 19 + Vite + Tailwind）
- `apps/client`：桌面端（Electron + Vite）
- `apps/server`：后端 API（Express + TypeDI + routing-controllers）
- `packages/dto`：前后端共享 DTO
- `packages/logger`：统一日志模块

数据层采用混合架构：

- MySQL（Drizzle ORM）：关系/业务数据
- LanceDB：向量数据（语义搜索）

## 快速开始

### 1) 环境要求

- Node.js 18+
- pnpm 10+
- MySQL 8+

### 2) 安装依赖

```bash
pnpm install
```

### 3) 配置环境变量

```bash
cp .env.example .env
```

关键配置：

- `MYSQL_*`：数据库连接
- `JWT_SECRET`：鉴权密钥
- `OPENAI_API_KEY`：Embedding 与 AI 能力

### 4) 启动开发环境

```bash
# 同时启动全部应用
pnpm dev

# 或按需启动
pnpm dev:web
pnpm dev:server
pnpm dev:client
```

默认端口：

- Web: `http://localhost:5373`
- Server: `http://localhost:3200`

## 常用命令

```bash
pnpm build       # 构建全部包
pnpm lint        # 代码检查
pnpm lint:fix    # 自动修复可修复问题
pnpm format      # 统一格式
```

后端测试（在 `apps/server` 下）：

```bash
pnpm test
```

## 目录结构

```text
echoe/
├── apps/
│   ├── web/
│   ├── client/
│   └── server/
├── packages/
│   ├── dto/
│   └── logger/
├── config/
└── docs/
```

## 更多文档

- 英文说明：`README_EB.md`
- 后端说明：`apps/server/README.md`
- API 文档：`docs/apis/`
- 架构文档：`docs/architecture/`

## License

BSL-1.1
