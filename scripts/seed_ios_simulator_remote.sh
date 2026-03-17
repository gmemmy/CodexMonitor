#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

SIMULATOR_NAME="${SIMULATOR_NAME:-iPhone Air}"
BUNDLE_ID="${BUNDLE_ID:-}"
REMOTE_HOST="${REMOTE_HOST:-}"
REMOTE_TOKEN="${REMOTE_TOKEN:-}"
REMOTE_NAME="${REMOTE_NAME:-Primary remote}"
REMOTE_ID="${REMOTE_ID:-remote-default}"
LAUNCH_AFTER_SEED=1

usage() {
  cat <<'EOF'
Usage: scripts/seed_ios_simulator_remote.sh [options]

Seeds the iOS simulator app settings with a remote backend host/token so the app
starts in remote mode with a ready connection target.

Options:
  --simulator <name>     Simulator name (default: "iPhone Air")
  --bundle-id <id>       Bundle id to target (default: resolved from Tauri iOS config)
  --host <host:port>     Remote backend host to seed
  --token <token>        Remote backend token to seed
  --name <name>          Saved remote display name (default: "Primary remote")
  --remote-id <id>       Saved remote id (default: "remote-default")
  --no-launch            Seed settings only; do not relaunch the app
  -h, --help             Show this help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --simulator)
      SIMULATOR_NAME="${2:-}"
      shift 2
      ;;
    --bundle-id)
      BUNDLE_ID="${2:-}"
      shift 2
      ;;
    --host)
      REMOTE_HOST="${2:-}"
      shift 2
      ;;
    --token)
      REMOTE_TOKEN="${2:-}"
      shift 2
      ;;
    --name)
      REMOTE_NAME="${2:-}"
      shift 2
      ;;
    --remote-id)
      REMOTE_ID="${2:-}"
      shift 2
      ;;
    --no-launch)
      LAUNCH_AFTER_SEED=0
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ -z "$REMOTE_HOST" ]]; then
  echo "--host is required" >&2
  exit 1
fi

if [[ -z "$REMOTE_TOKEN" ]]; then
  echo "--token is required" >&2
  exit 1
fi

resolve_ios_bundle_id() {
  node - <<'NODE'
const fs = require("fs");

function readConfig(path) {
  try {
    return JSON.parse(fs.readFileSync(path, "utf8"));
  } catch (_) {
    return {};
  }
}

const baseCfg = readConfig("src-tauri/tauri.conf.json");
const iosCfg = readConfig("src-tauri/tauri.ios.conf.json");
const localCfg = readConfig("src-tauri/tauri.ios.local.conf.json");
const identifier =
  localCfg?.identifier ??
  iosCfg?.identifier ??
  baseCfg?.identifier ??
  "";
process.stdout.write(String(identifier).trim());
NODE
}

if [[ -z "$BUNDLE_ID" ]]; then
  BUNDLE_ID="$(resolve_ios_bundle_id)"
fi
if [[ -z "$BUNDLE_ID" ]]; then
  BUNDLE_ID="com.dimillian.codexmonitor.ios"
fi

open -a Simulator || true
xcrun simctl boot "$SIMULATOR_NAME" >/dev/null 2>&1 || true
xcrun simctl bootstatus booted -b >/dev/null 2>&1 || true

DATA_CONTAINER="$(xcrun simctl get_app_container booted "$BUNDLE_ID" data)"
if [[ -z "$DATA_CONTAINER" || ! -d "$DATA_CONTAINER" ]]; then
  echo "Unable to resolve simulator data container for ${BUNDLE_ID}. Is the app installed?" >&2
  exit 1
fi

APP_SUPPORT_DIR="${DATA_CONTAINER}/Library/Application Support"
SETTINGS_PATH="${APP_SUPPORT_DIR}/settings.json"
APP_SPECIFIC_SETTINGS_DIR="${APP_SUPPORT_DIR}/${BUNDLE_ID}"

mkdir -p "$APP_SUPPORT_DIR"
mkdir -p "$APP_SPECIFIC_SETTINGS_DIR"

if [[ -f "${APP_SPECIFIC_SETTINGS_DIR}/settings.json" ]]; then
  SETTINGS_PATH="${APP_SPECIFIC_SETTINGS_DIR}/settings.json"
elif [[ ! -f "$SETTINGS_PATH" ]]; then
  EXISTING_SETTINGS="$(
    find "$DATA_CONTAINER" -path "*/${BUNDLE_ID}/settings.json" -type f | head -n 1 || true
  )"
  if [[ -z "$EXISTING_SETTINGS" ]]; then
    EXISTING_SETTINGS="$(find "$DATA_CONTAINER" -path '*/settings.json' -type f | head -n 1 || true)"
  fi
  if [[ -n "$EXISTING_SETTINGS" ]]; then
    SETTINGS_PATH="$EXISTING_SETTINGS"
    mkdir -p "$(dirname "$SETTINGS_PATH")"
  fi
fi

node - "$SETTINGS_PATH" "$REMOTE_HOST" "$REMOTE_TOKEN" "$REMOTE_NAME" "$REMOTE_ID" <<'NODE'
const fs = require("fs");

const [settingsPath, remoteHost, remoteToken, remoteName, remoteId] = process.argv.slice(2);
let settings = {};

try {
  settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
} catch (_) {
  settings = {};
}

const existingBackends = Array.isArray(settings.remoteBackends) ? settings.remoteBackends : [];
const sanitizedBackends = existingBackends.filter((entry) => entry && entry.id !== remoteId);

sanitizedBackends.unshift({
  id: remoteId,
  name: remoteName,
  provider: "tcp",
  host: remoteHost,
  token: remoteToken,
  lastConnectedAtMs: null,
});

settings.backendMode = "remote";
settings.remoteBackendProvider = "tcp";
settings.remoteBackendHost = remoteHost;
settings.remoteBackendToken = remoteToken;
settings.remoteBackends = sanitizedBackends;
settings.activeRemoteBackendId = remoteId;

fs.writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
NODE

echo "Seeded ${BUNDLE_ID} simulator settings:"
echo "  container: ${DATA_CONTAINER}"
echo "  settings:  ${SETTINGS_PATH}"
echo "  remote:    ${REMOTE_NAME} (${REMOTE_HOST})"

if [[ "$LAUNCH_AFTER_SEED" -eq 1 ]]; then
  xcrun simctl terminate booted "$BUNDLE_ID" >/dev/null 2>&1 || true
  xcrun simctl launch booted "$BUNDLE_ID"
  echo "  launched:  ${BUNDLE_ID}"
fi
