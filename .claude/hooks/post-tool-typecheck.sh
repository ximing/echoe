#!/bin/bash
# Post-tool TypeScript type checker for echoe monorepo
# Runs tsc --noEmit on modified files after Write/Edit operations

set -e

# Read JSON input from stdin
INPUT=$(cat)

# Extract the file path from tool input
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

# If no file path, exit successfully
if [ -z "$FILE_PATH" ]; then
  exit 0
fi

# Only run type checker on TypeScript files
if [[ ! "$FILE_PATH" =~ \.(ts|tsx)$ ]]; then
  exit 0
fi

# Check if file exists
if [ ! -f "$FILE_PATH" ]; then
  exit 0
fi

# Get the project root directory
PROJECT_ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"
cd "$PROJECT_ROOT"

# Determine which workspace the file belongs to
WORKSPACE=""
RELATIVE_PATH="${FILE_PATH#$PROJECT_ROOT/}"

if [[ "$RELATIVE_PATH" =~ ^apps/web/ ]]; then
  WORKSPACE="@echoe/web"
elif [[ "$RELATIVE_PATH" =~ ^apps/server/ ]]; then
  WORKSPACE="@echoe/server"
elif [[ "$RELATIVE_PATH" =~ ^apps/client/ ]]; then
  WORKSPACE="@echoe/client"
elif [[ "$RELATIVE_PATH" =~ ^packages/dto/ ]]; then
  WORKSPACE="@echoe/dto"
elif [[ "$RELATIVE_PATH" =~ ^packages/logger/ ]]; then
  WORKSPACE="@echoe/logger"
fi

# Run TypeScript compiler in check mode for the specific workspace
if [ -n "$WORKSPACE" ]; then
  TYPECHECK_OUTPUT=$(pnpm --filter "$WORKSPACE" typecheck 2>&1) || TYPECHECK_EXIT_CODE=$?
else
  # Fallback to root level typecheck (runs all workspaces)
  TYPECHECK_OUTPUT=$(pnpm typecheck 2>&1) || TYPECHECK_EXIT_CODE=$?
fi

if [ "${TYPECHECK_EXIT_CODE:-0}" -ne 0 ]; then
  # Type checking failed - provide feedback to Claude
  jq -n --arg reason "TypeScript type checking failed for $FILE_PATH" \
        --arg context "$TYPECHECK_OUTPUT" \
        '{
          decision: "block",
          reason: $reason,
          hookSpecificOutput: {
            hookEventName: "PostToolUse",
            additionalContext: $context
          }
        }'
  exit 0
fi

# Success - no output needed
exit 0
