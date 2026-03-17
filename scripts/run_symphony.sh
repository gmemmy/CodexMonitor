#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SYMPHONY_DIR="$ROOT_DIR/.symphony/openai-symphony/elixir"
SYMPHONY_BIN="$SYMPHONY_DIR/bin/symphony"
WORKFLOW_FILE="$ROOT_DIR/WORKFLOW.md"

resolve_mise_bin() {
  if [[ -n "${MISE_BIN:-}" && -x "${MISE_BIN}" ]]; then
    printf '%s\n' "${MISE_BIN}"
    return 0
  fi

  if command -v mise >/dev/null 2>&1; then
    command -v mise
    return 0
  fi

  for candidate in /opt/homebrew/bin/mise "$HOME/.local/bin/mise" /usr/local/bin/mise; do
    if [[ -x "$candidate" ]]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done

  return 1
}

if [[ ! -x "$SYMPHONY_BIN" ]]; then
  echo "Symphony binary not found at: $SYMPHONY_BIN" >&2
  echo "Build it first from .symphony/openai-symphony/elixir." >&2
  exit 1
fi

if grep -q 'replace-with-your-linear-project-slug' "$WORKFLOW_FILE"; then
  echo "Set tracker.project_slug in $WORKFLOW_FILE before starting Symphony." >&2
  exit 1
fi

MISE_BIN="$(resolve_mise_bin)" || {
  echo "mise not found. Install mise or set MISE_BIN before starting Symphony." >&2
  exit 1
}
export MISE_BIN

"$ROOT_DIR/scripts/bootstrap-worker.sh"

cd "$SYMPHONY_DIR"
exec "$MISE_BIN" exec -- "$SYMPHONY_BIN" "$WORKFLOW_FILE" "$@"
