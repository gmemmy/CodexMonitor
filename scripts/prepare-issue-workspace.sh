#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

DEFAULT_BRANCH="${1:-daily}"

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
  echo "mise not found. Install mise or set MISE_BIN before preparing a Symphony issue workspace." >&2
  exit 1
}
export MISE_BIN

git fetch origin --prune
git fetch upstream --prune || true

current_branch="$(git branch --show-current || true)"
if [[ "$current_branch" != "$DEFAULT_BRANCH" ]]; then
  git checkout "$DEFAULT_BRANCH" || git checkout -b "$DEFAULT_BRANCH" "origin/$DEFAULT_BRANCH"
fi

git pull --ff-only origin "$DEFAULT_BRANCH"

echo "Worker capability report:"
"$MISE_BIN" exec -C "$ROOT_DIR" -- npm run validate:preflight
