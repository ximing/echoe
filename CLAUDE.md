# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

echoe is a full-stack AI-powered note-taking and knowledge management system built as a pnpm monorepo with Turbo. It features:
- React 19 frontend with @rabjs/react for reactive state management
- Express.js backend with TypeDI dependency injection and routing-controllers
- Dual-database architecture: MySQL (Drizzle ORM) for relational data + LanceDB for vector search
- Spaced repetition learning system (FSRS algorithm)
- AI-powered features using OpenAI embeddings and LangChain

## Test Environment Credentials
- Email: echoe@test.com
- Password: aaaaaa

## Monorepo Structure

```
apps/
├── web       # Admin panel (Vite + React 19 + TailwindCSS) - port 5173
├── client    # User-facing client application
└── server    # Express.js backend API - port 3200

packages/
├── dto       # Shared Data Transfer Objects (class-validator, class-transformer)
└── logger    # Logging utilities

config/       # Shared configuration packages
├── config-typescript
├── eslint-config
├── jest-presets
└── rollup-config
```

## Development Commands

```bash
# Install dependencies
pnpm install

# Development (runs all apps with Turbo)
pnpm dev
pnpm dev:web      # Admin panel only
pnpm dev:server   # Backend API only
pnpm dev:client   # Client app only

# Build
pnpm build         # Build all packages
pnpm build:web
pnpm build:server
pnpm build:client

# Code quality
pnpm lint          # Lint all packages
pnpm lint:fix      # Auto-fix lint issues
pnpm format        # Format code with Prettier

# Testing (from apps/server)
cd apps/server
pnpm test          # Run all Jest tests
NODE_ENV=test jest path/to/test.test.ts  # Run single test

# Database migrations (from apps/server)
cd apps/server
pnpm build                # MUST build first - drizzle-kit reads from dist/
pnpm migrate:generate     # Generate new migration from schema changes
pnpm migrate              # Run migrations (also runs automatically on server start)
pnpm migrate:studio       # Open Drizzle Studio GUI

# Docker development
docker compose up -d mysql    # Start MySQL only
docker compose up -d          # Start full production stack
pnpm dev:env                  # Start dev environment containers
```

## Architecture Patterns

### Backend (Express.js + TypeDI + routing-controllers)

**IOC Container Initialization**: The app uses TypeDI for dependency injection. Services and controllers are auto-loaded via glob patterns in `src/ioc.ts`. Classes decorated with `@Service()` are automatically registered.

**Controllers**: Use routing-controllers decorators:
- `@JsonController('/api/v1/resource')` for base route
- `@Get()`, `@Post()`, `@Put()`, `@Delete()` for HTTP methods
- `@CurrentUser()` for authenticated user (populated by JWT middleware)
- `@Body()`, `@Param()`, `@QueryParam()` for request data
- Constructor injection for services: `constructor(private myService: MyService) {}`

**Services**: Business logic layer. Decorated with `@Service()` and injected into controllers. Access database via `getDatabase()` from `db/connection.ts`.

**Startup Sequence**:
1. IOC container initialization (loads all services/controllers)
2. MySQL connection pool
3. Database migrations (automatic)
4. LanceDB initialization
5. Scheduler service (cron jobs)
6. Express server

### Frontend (React 19 + @rabjs/react)

**Reactive State Management**: Uses @rabjs/react Service pattern:
- Services are classes with observable properties
- `@view` decorator makes components reactive to service changes
- `useService(ServiceClass)` hook for dependency injection
- `useObserver()` for reactive updates

**API Layer**: Services in `apps/web/src/services/` handle API calls using axios. These are NOT the same as backend services - they're frontend state management + API clients.

**Routing**: React Router v7 with file-based routing in `apps/web/src/pages/`.

### Database (Drizzle ORM)

**Schema Location**: `apps/server/src/db/schema/` - all schemas must be exported from `schema/index.ts`.

**Migration Workflow**:
1. Modify schema files in `schema/` directory
2. Build server: `pnpm build` (required - drizzle-kit reads compiled JS)
3. Generate migration: `pnpm migrate:generate`
4. Review generated SQL in `drizzle/` folder
5. Migrations run automatically on next server start

**Important Constraints**:
- VARCHAR primary/foreign keys: max 191 chars (MySQL utf8mb4 index limit)
- Timestamps: use `timestamp('created_at', { mode: 'date', fsp: 3 })` for millisecond precision
- JSON columns: use `.$type<TypeName>()` for type safety
- Foreign keys: use `.references()` with `onDelete: 'cascade'` or `onDelete: 'set null'`

**Drizzle Config Gotcha**: `drizzle.config.ts` must:
- Use environment variables directly (NOT imported from config.ts)
- Point schema to compiled output: `./dist/db/schema/index.js` (not TypeScript source)

### Shared DTOs

The `@echoe/dto` package contains shared TypeScript types and validation classes used by both frontend and backend. Uses class-validator and class-transformer for runtime validation.

## Environment Variables

Copy `.env.example` to `.env` and configure:

**Core Settings**:
- `NODE_ENV`: production | development | test
- `PORT`: Server port (default: 3200)
- `JWT_SECRET`: Authentication secret key
- `CORS_ORIGIN`: Allowed CORS origin
- `ALLOW_REGISTRATION`: Enable/disable user registration

**MySQL Database**:
- `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE`
- `MYSQL_CONNECTION_LIMIT`: Connection pool size (default: 10)

**LanceDB (Vector Search)**:
- `LANCEDB_STORAGE_TYPE`: local | s3
- `LANCEDB_PATH`: Local storage path (when type=local)
- `LANCEDB_VERSION_RETENTION_DAYS`: Cleanup old versions

**OpenAI (Text Embeddings)**:
- `OPENAI_API_KEY`: Required for AI features
- `OPENAI_MODEL`: text-embedding-3-small
- `OPENAI_BASE_URL`: API endpoint
- `OPENAI_EMBEDDING_DIMENSIONS`: Vector dimensions (default: 1536)

**Attachments Storage**:
- `ATTACHMENT_STORAGE_TYPE`: local | s3
- `ATTACHMENT_LOCAL_PATH`: Local storage path
- `ATTACHMENT_MAX_FILE_SIZE`: Max upload size in bytes

**Optional Features**:
- `MULTIMODAL_EMBEDDING_ENABLED`: Enable image/video embeddings
- `OCR_ENABLED`: Enable OCR for images
- `OCR_DEFAULT_PROVIDER`: zhipu (智谱 API)

## Key Technologies

- **Backend**: Express.js, routing-controllers, TypeDI, Drizzle ORM, LangChain
- **Frontend**: React 19, Vite, TailwindCSS, @rabjs/react, TipTap (rich text editor)
- **Databases**: MySQL (relational), LanceDB (vector search)
- **AI/ML**: OpenAI embeddings, FSRS spaced repetition algorithm
- **Testing**: Jest (backend), ts-jest
- **Build**: Turbo (monorepo), pnpm workspaces, Rollup (packages)

## Common Development Tasks

### Adding a New API Endpoint

1. Create/update controller in `apps/server/src/controllers/v1/`
2. Use `@Get()`, `@Post()`, etc. decorators
3. Inject service via constructor
4. Add to `controllers/index.ts` export array
5. Server auto-reloads in dev mode

### Adding a New Database Table

1. Create schema file in `apps/server/src/db/schema/`
2. Export from `schema/index.ts`
3. Build: `cd apps/server && pnpm build`
4. Generate migration: `pnpm migrate:generate`
5. Review SQL in `drizzle/` folder
6. Migration runs automatically on next server start

### Running Tests

```bash
cd apps/server
pnpm test                                    # All tests
NODE_ENV=test jest path/to/file.test.ts     # Single test file
NODE_ENV=test jest -t "test name pattern"   # Specific test
```

Tests use Jest with ts-jest. Test files located in `src/__tests__/` with `*.test.ts` naming.

### Adding a Frontend Feature

1. Create/update page in `apps/web/src/pages/`
2. Create service in `apps/web/src/services/` for state + API calls
3. Use `@view` decorator on components that need reactivity
4. Use `useService()` hook for dependency injection
5. TailwindCSS for styling

## Docker

**Development**: `docker compose -f dev-docker-compose.yml up -d` or `pnpm dev:env`

**Production**: Multi-stage Dockerfile builds all apps. `docker-compose.yml` orchestrates MySQL + server + web services.

## Gotchas

- Always build server before generating migrations: `pnpm build` then `pnpm migrate:generate`
- Drizzle config must use env vars directly, not imported config
- Backend "services" (TypeDI) ≠ Frontend "services" (@rabjs/react state)
- JWT auth via `@CurrentUser()` decorator - returns `UserInfoDto | undefined`
- MySQL VARCHAR keys limited to 191 chars due to utf8mb4 indexing
- IOC container auto-loads files via glob - just add `@Service()` decorator
- Turbo caches builds - use `turbo run build --force` to rebuild from scratch
