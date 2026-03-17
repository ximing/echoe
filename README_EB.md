# Echoe

> An AI-powered memory app that helps you *retain* knowledge.
>
> 中文版本: [README.md](./README.md)

## Why Echoe

Most tools help you capture information, but fail to help you remember it long-term.

Echoe is built around memory retention: turn raw input into reviewable flashcards, then use the FSRS spaced-repetition algorithm to schedule the right review at the right time.

## Core Highlights

- **Memory-first product design**: built around review queues, recall feedback, and retention loops.
- **FSRS-powered review engine**: supports Again / Hard / Good / Easy ratings with dynamic next-due scheduling.
- **Anki-compatible workflow**: import and export `.apkg` files to reuse your existing decks and data.
- **AI Inbox-to-Card pipeline**: convert inbox content into cards with AI-assisted deck/notetype suggestions.
- **Semantic retrieval for recall**: vector search helps you rediscover related knowledge beyond keyword search.

## Typical Workflow

1. **Capture**: collect snippets and ideas into Inbox.
2. **Convert**: transform content into flashcards (Front/Back or custom fields).
3. **Review**: study from your daily queue and rate recall quality.
4. **Retain**: Echoe schedules the next review automatically for long-term memory.

## Architecture

- `apps/web`: Web frontend (React 19 + Vite + Tailwind)
- `apps/client`: Desktop app (Electron + Vite)
- `apps/server`: Backend API (Express + TypeDI + routing-controllers)
- `packages/dto`: Shared DTOs for frontend/backend
- `packages/logger`: Unified logging package

Data storage uses a hybrid design:

- MySQL (via Drizzle ORM): relational/scalar data
- LanceDB: vector data for semantic search

## Quick Start

### 1) Prerequisites

- Node.js 18+
- pnpm 10+
- MySQL 8+

### 2) Install dependencies

```bash
pnpm install
```

### 3) Configure environment

```bash
cp .env.example .env
```

Important variables:

- `MYSQL_*`: database connection
- `JWT_SECRET`: authentication secret
- `OPENAI_API_KEY`: embeddings and AI features

### 4) Start development

```bash
# Start all apps
pnpm dev

# Or start specific apps
pnpm dev:web
pnpm dev:server
pnpm dev:client
```

Default ports:

- Web: `http://localhost:5173`
- Server: `http://localhost:3200`

## Common Commands

```bash
pnpm build       # Build all packages
pnpm lint        # Run lints
pnpm lint:fix    # Auto-fix lint issues
pnpm format      # Format codebase
```

Backend tests (inside `apps/server`):

```bash
pnpm test
```

## Repository Layout

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

## More Docs

- Chinese guide: `README.md`
- Server guide: `apps/server/README.md`
- API docs: `docs/apis/`
- Architecture docs: `docs/architecture/`

## License

BSL-1.1
