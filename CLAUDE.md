# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

echoe is a full-stack AI-powered note-taking and knowledge management system. It's a pnpm monorepo with Turbo, using React 19 frontend and Express.js backend with a dual-database architecture: MySQL (via Drizzle ORM) for relational data and LanceDB for vector search.

## 测试环境账号密码
账号： echoe@test.com
密码： aaaaaa

## Monorepo Structure

```
apps/
├── web       # Admin panel (Vite + React 19 + TailwindCSS)
├── client    # User-facing client
└── server    # Express.js backend API

packages/
├── dto       # Data Transfer Objects
└── logger    # Logging utilities

config/
├── config-typescript
├── eslint-config
├── jest-presets
└── rollup-config
```

## Development Commands

```bash
# Install dependencies
pnpm install

# Development (runs all apps)
pnpm dev

# Run individual apps
pnpm dev:web      # Admin panel on port 5173
pnpm dev:server   # Backend API on port 3200
pnpm dev:client   # Client app

# Build
pnpm build         # Build all apps
pnpm build:web
pnpm build:server
pnpm build:client

# Code quality
pnpm lint          # Lint all packages
pnpm lint:fix      # Auto-fix lint issues
pnpm format        # Format code with Prettier

# Server-specific commands (run from apps/server)
pnpm migrate           # Run database migrations
pnpm migrate:generate  # Generate new migration
pnpm migrate:studio    # Open Drizzle Studio
```

## Database

- **MySQL**: Relational data (notes, users, tags, etc.)
- **LanceDB**: Vector search for AI-powered features
- Migrations managed via Drizzle ORM in `apps/server/src/db/`

## Environment Variables

Copy `.env.example` to `.env` and configure:
- `MYSQL_*`: MySQL connection settings
- `LANCEDB_*`: Vector database settings
- `OPENAI_*`: AI embedding configuration
- `JWT_SECRET`: Authentication secret

## Docker Development

```bash
# Start MySQL container
docker compose up -d mysql

# Start full production stack
docker compose up -d
```

## Key Technologies

- **Frontend**: React 19, Vite, TailwindCSS, @rabjs/react (reactive state)
- **Backend**: Express.js, Drizzle ORM, TypeDI (dependency injection)
- **AI**: OpenAI embeddings, LangChain
- **Testing**: Jest
