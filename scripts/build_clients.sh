#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

DEVICE="${IOS_DEVICE:-}"
SKIP_MAC=0
SKIP_IOS=0
PASSTHROUGH_ARGS=()

usage() {
  cat <<'EOF'
Usage: scripts/build_clients.sh [options] [-- <ios-device-script-args>]

Builds the macOS app bundle/DMG and builds-installs the iOS app to a physical device.

Options:
  --device <id|name>  Physical iPhone/iPad identifier to use for install
  --skip-mac          Skip macOS build
  --skip-ios          Skip iOS build/install
  -h, --help          Show this help

Any arguments after -- are forwarded to scripts/build_run_ios_device.sh.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --device)
      DEVICE="${2:-}"
      shift 2
      ;;
    --skip-mac)
      SKIP_MAC=1
      shift
      ;;
    --skip-ios)
      SKIP_IOS=1
      shift
      ;;
    --)
      shift
      PASSTHROUGH_ARGS+=("$@")
      break
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      PASSTHROUGH_ARGS+=("$1")
      shift
      ;;
  esac
done

if [[ "$SKIP_MAC" -eq 0 ]]; then
  npm run tauri:build
fi

if [[ "$SKIP_IOS" -eq 0 ]]; then
  IOS_ARGS=()
  if [[ -n "$DEVICE" ]]; then
    IOS_ARGS+=(--device "$DEVICE")
  fi
  if [[ ${#PASSTHROUGH_ARGS[@]} -gt 0 ]]; then
    IOS_ARGS+=("${PASSTHROUGH_ARGS[@]}")
  fi
  "$ROOT_DIR/scripts/build_run_ios_device.sh" "${IOS_ARGS[@]}"
fi
