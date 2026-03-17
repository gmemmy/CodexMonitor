#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

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

has_workspace_deps() {
  [[ -x "$ROOT_DIR/node_modules/.bin/tsc" ]] &&
    [[ -x "$ROOT_DIR/node_modules/.bin/vitest" ]] &&
    [[ -x "$ROOT_DIR/node_modules/.bin/tauri" ]]
}

MISE_BIN="$(resolve_mise_bin)" || {
  echo "mise not found. Install mise or set MISE_BIN before bootstrapping a Symphony worker." >&2
  exit 1
}
export MISE_BIN

if [[ -f "$ROOT_DIR/.mise.toml" ]]; then
  "$MISE_BIN" trust "$ROOT_DIR/.mise.toml" -y >/dev/null
fi

echo "Bootstrapping CodexMonitor worker toolchain via mise..."
"$MISE_BIN" install -C "$ROOT_DIR" -y

if has_workspace_deps; then
  echo "Workspace npm dependencies already installed."
else
  echo "Installing workspace npm dependencies with npm ci..."
  "$MISE_BIN" exec -C "$ROOT_DIR" -- npm ci
fi

echo "Warm bootstrap complete."
