#!/usr/bin/env sh
set -u

STRICT=0
if [ "${1:-}" = "--strict" ]; then
  STRICT=1
fi

has_cmd() {
  command -v "$1" >/dev/null 2>&1
}

print_status() {
  name="$1"
  status="$2"
  details="$3"
  printf "%-22s %-8s %s\n" "$name" "$status" "$details"
}

resolve_version() {
  cmd="$1"
  shift
  if has_cmd "$cmd"; then
    "$@" 2>/dev/null | head -n 1
  fi
}

node_status="missing"
node_details="node not found"
if has_cmd node; then
  node_status="ok"
  node_details="$(resolve_version node node -v || echo unknown)"
fi

npm_status="missing"
npm_details="npm not found"
if has_cmd npm; then
  npm_status="ok"
  npm_details="$(resolve_version npm npm -v || echo unknown)"
fi

cargo_status="missing"
cargo_details="cargo not found"
if has_cmd cargo; then
  cargo_status="ok"
  cargo_details="$(resolve_version cargo cargo --version || echo unknown)"
fi

rustc_status="missing"
rustc_details="rustc not found"
if has_cmd rustc; then
  rustc_status="ok"
  rustc_details="$(resolve_version rustc rustc --version || echo unknown)"
fi

codex_status="missing"
codex_details="codex not found"
if has_cmd codex; then
  codex_status="ok"
  codex_details="$(resolve_version codex codex --version || echo unknown)"
fi

git_status="missing"
git_details="git not found"
if has_cmd git; then
  git_status="ok"
  git_details="$(resolve_version git git --version || echo unknown)"
fi

cmake_status="missing"
cmake_details="cmake not found"
if has_cmd cmake; then
  cmake_status="ok"
  cmake_details="$(resolve_version cmake cmake --version || echo unknown)"
fi

xcodebuild_status="n/a"
xcodebuild_details="non-macOS host"
xcrun_status="n/a"
xcrun_details="non-macOS host"
devicectl_status="n/a"
devicectl_details="non-macOS host"

if [ "$(uname -s)" = "Darwin" ]; then
  xcodebuild_status="missing"
  xcodebuild_details="xcodebuild not found"
  if has_cmd xcodebuild; then
    xcodebuild_status="ok"
    xcodebuild_details="$(resolve_version xcodebuild xcodebuild -version || echo unknown)"
  fi

  xcrun_status="missing"
  xcrun_details="xcrun not found"
  if has_cmd xcrun; then
    xcrun_status="ok"
    xcrun_details="$(xcrun --find xcodebuild 2>/dev/null || echo available)"
  fi

  devicectl_status="missing"
  devicectl_details="xcrun devicectl unavailable"
  if has_cmd xcrun && xcrun devicectl --help >/dev/null 2>&1; then
    devicectl_status="ok"
    devicectl_details="CoreDevice available"
  fi
fi

doctor_capability="blocked"
doctor_details="requires npm + cmake"
if [ "$npm_status" = "ok" ] && [ "$cmake_status" = "ok" ]; then
  doctor_capability="ok"
  doctor_details="npm run doctor:strict can run"
fi

frontend_capability="blocked"
frontend_details="requires node + npm"
if [ "$node_status" = "ok" ] && [ "$npm_status" = "ok" ]; then
  frontend_capability="ok"
  frontend_details="targeted vitest + typecheck available"
fi

rust_capability="blocked"
rust_details="requires cargo + rustc"
if [ "$cargo_status" = "ok" ] && [ "$rustc_status" = "ok" ]; then
  rust_capability="ok"
  rust_details="cargo check available"
fi

desktop_capability="blocked"
desktop_details="requires frontend + rust toolchain"
if [ "$frontend_capability" = "ok" ] && [ "$rust_capability" = "ok" ]; then
  desktop_capability="ok"
  desktop_details="tauri desktop validation available"
fi

ios_capability="blocked"
ios_details="requires macOS + xcodebuild + xcrun devicectl + rust"
if [ "$xcodebuild_status" = "ok" ] && [ "$xcrun_status" = "ok" ] && [ "$devicectl_status" = "ok" ] && [ "$rust_capability" = "ok" ]; then
  ios_capability="ok"
  ios_details="device/simulator build tooling available"
fi

echo "CodexMonitor validation preflight"
echo
print_status "node" "$node_status" "$node_details"
print_status "npm" "$npm_status" "$npm_details"
print_status "cargo" "$cargo_status" "$cargo_details"
print_status "rustc" "$rustc_status" "$rustc_details"
print_status "codex" "$codex_status" "$codex_details"
print_status "git" "$git_status" "$git_details"
print_status "cmake" "$cmake_status" "$cmake_details"
print_status "xcodebuild" "$xcodebuild_status" "$xcodebuild_details"
print_status "xcrun" "$xcrun_status" "$xcrun_details"
print_status "devicectl" "$devicectl_status" "$devicectl_details"
echo
print_status "doctor_strict" "$doctor_capability" "$doctor_details"
print_status "frontend_checks" "$frontend_capability" "$frontend_details"
print_status "rust_checks" "$rust_capability" "$rust_details"
print_status "desktop_tauri" "$desktop_capability" "$desktop_details"
print_status "ios_device_flow" "$ios_capability" "$ios_details"

blocked_count=0
for capability in "$doctor_capability" "$frontend_capability" "$rust_capability" "$desktop_capability"; do
  if [ "$capability" != "ok" ]; then
    blocked_count=$((blocked_count + 1))
  fi
done

if [ "$STRICT" -eq 1 ] && [ "$blocked_count" -gt 0 ]; then
  exit 1
fi

exit 0
