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

MISE_BIN="$(resolve_mise_bin)" || {
  echo "mise not found. Install mise or set MISE_BIN before launching the Codex worker." >&2
  exit 1
}

exec "$MISE_BIN" exec -C "$ROOT_DIR" -- codex --config shell_environment_policy.inherit=all app-server
