#!/bin/bash
# Post-tool lint checker for echoe monorepo
# Runs ESLint on modified files after Write/Edit operations

set -e

# Read JSON input from stdin
INPUT=$(cat)

# Extract the file path from tool input
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

# If no file path, exit successfully (e.g., for Bash commands)
if [ -z "$FILE_PATH" ]; then
  exit 0
fi

# Only run linter on JavaScript/TypeScript files
if [[ ! "$FILE_PATH" =~ \.(js|ts|jsx|tsx)$ ]]; then
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

# Run ESLint with auto-fix on the specific file
if [ -n "$WORKSPACE" ]; then
  LINT_OUTPUT=$(pnpm --filter "$WORKSPACE" exec eslint "$FILE_PATH" --fix 2>&1) || LINT_EXIT_CODE=$?
else
  # Fallback to running eslint directly
  LINT_OUTPUT=$(pnpm exec eslint "$FILE_PATH" --fix 2>&1) || LINT_EXIT_CODE=$?
fi

if [ "${LINT_EXIT_CODE:-0}" -ne 0 ]; then
  # Linting failed - provide feedback to Claude
  jq -n --arg reason "ESLint validation failed for $FILE_PATH" \
        --arg context "$LINT_OUTPUT" \
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
