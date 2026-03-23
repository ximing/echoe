# Claude Code Hooks

This directory contains PostToolUse hooks that automatically validate code after Write/Edit operations.

## Configured Hooks

### 1. post-tool-lint.sh
Automatically runs ESLint with auto-fix on modified JavaScript/TypeScript files.

**Triggers on:**
- `.js`, `.ts`, `.jsx`, `.tsx` files
- Write and Edit operations

**Behavior:**
- Identifies the workspace (apps/web, apps/server, apps/client, packages/*)
- Runs `pnpm --filter <workspace> exec eslint <file> --fix`
- Blocks Claude if linting fails with error details

### 2. post-tool-typecheck.sh
Automatically runs TypeScript type checking on modified TypeScript files.

**Triggers on:**
- `.ts`, `.tsx` files
- Write and Edit operations

**Behavior:**
- Identifies the workspace
- Runs `pnpm --filter <workspace> typecheck` (tsc --noEmit)
- Blocks Claude if type checking fails with error details

## How It Works

1. When Claude uses Write or Edit tools, the hooks are triggered automatically
2. The hook receives JSON input with file path and tool details via stdin
3. The hook determines the workspace from the file path
4. It runs the appropriate validation command
5. If validation fails, it returns a JSON response with `decision: "block"` to inform Claude
6. Claude receives the error feedback and can fix the issues

## Global Commands

The project supports running lint and typecheck commands globally from the root:

```bash
# Lint all packages
pnpm lint

# Auto-fix lint issues across all packages
pnpm lint:fix

# Type check all packages
pnpm typecheck
```

These commands use Turbo to run the corresponding scripts in all workspaces efficiently.

## Workspace-Specific Commands

You can also run commands on specific workspaces:

```bash
# Lint specific workspace
pnpm --filter @echoe/web lint
pnpm --filter @echoe/server typecheck

# Or from within the workspace directory
cd apps/server
pnpm lint
pnpm typecheck
```

## Disabling Hooks

To temporarily disable hooks, you can:

1. Remove or comment out the hooks configuration in `.claude/settings.json`
2. Or set the `timeout` to 0 for specific hooks

## Debugging Hooks

To test a hook manually:

```bash
# Create test input
echo '{"tool_input": {"file_path": "/path/to/file.ts"}}' | .claude/hooks/post-tool-typecheck.sh

# Check hook output
echo $?  # Should be 0 for success
```

## Requirements

- `jq` must be installed for JSON parsing
- `pnpm` must be available in PATH
- All workspaces must have `lint`, `lint:fix`, and `typecheck` scripts defined
