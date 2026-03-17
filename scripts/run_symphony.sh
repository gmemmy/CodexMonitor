#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SYMPHONY_DIR="$ROOT_DIR/.symphony/openai-symphony/elixir"
SYMPHONY_BIN="$SYMPHONY_DIR/bin/symphony"
MISE_BIN="/opt/homebrew/bin/mise"
WORKFLOW_FILE="$ROOT_DIR/WORKFLOW.md"

if [[ ! -x "$SYMPHONY_BIN" ]]; then
  echo "Symphony binary not found at: $SYMPHONY_BIN" >&2
  echo "Build it first from .symphony/openai-symphony/elixir." >&2
  exit 1
fi

if grep -q 'replace-with-your-linear-project-slug' "$WORKFLOW_FILE"; then
  echo "Set tracker.project_slug in $WORKFLOW_FILE before starting Symphony." >&2
  exit 1
fi

if [[ ! -x "$MISE_BIN" ]]; then
  echo "mise not found at: $MISE_BIN" >&2
  exit 1
fi

cd "$SYMPHONY_DIR"
exec "$MISE_BIN" exec -- "$SYMPHONY_BIN" "$WORKFLOW_FILE" "$@"
