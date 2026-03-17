#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, rmSync, cpSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const packageJson = JSON.parse(
  readFileSync(path.join(repoRoot, "package.json"), "utf8"),
);
const appVersion = packageJson.version;
const arch = process.arch === "arm64" ? "aarch64" : process.arch;
const tauriBin =
  process.platform === "win32"
    ? path.join(repoRoot, "node_modules", ".bin", "tauri.cmd")
    : path.join(repoRoot, "node_modules", ".bin", "tauri");

function run(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, {
    cwd: repoRoot,
    stdio: "inherit",
    ...options,
  });

  if (typeof result.status === "number") {
    return result.status;
  }

  if (result.error) {
    throw result.error;
  }

  return 1;
}

function fallbackDmgBuild() {
  const dmgDir = path.join(
    repoRoot,
    "src-tauri",
    "target",
    "release",
    "bundle",
    "dmg",
  );
  const macAppPath = path.join(
    repoRoot,
    "src-tauri",
    "target",
    "release",
    "bundle",
    "macos",
    "Codex Monitor.app",
  );
  const bundleScriptPath = path.join(dmgDir, "bundle_dmg.sh");
  const finalDmgPath = path.join(
    dmgDir,
    `Codex Monitor_${appVersion}_${arch}.dmg`,
  );
  const stagingDir = path.join(repoRoot, ".tmp", "dmg-src");

  if (!existsSync(bundleScriptPath) || !existsSync(macAppPath)) {
    console.error("DMG fallback unavailable: missing bundle script or app bundle.");
    return 1;
  }

  rmSync(stagingDir, { recursive: true, force: true });
  rmSync(finalDmgPath, { force: true });
  mkdirSync(stagingDir, { recursive: true });
  cpSync(macAppPath, path.join(stagingDir, "Codex Monitor.app"), {
    recursive: true,
  });

  console.warn(
    "DMG packaging failed during Finder automation. Retrying with --skip-jenkins.",
  );

  return run(bundleScriptPath, [
    "--skip-jenkins",
    "--volname",
    "Codex Monitor",
    "--window-pos",
    "200",
    "120",
    "--window-size",
    "800",
    "600",
    "--icon-size",
    "100",
    "--icon",
    "Codex Monitor.app",
    "200",
    "190",
    "--hide-extension",
    "Codex Monitor.app",
    "--app-drop-link",
    "600",
    "185",
    finalDmgPath,
    stagingDir,
  ]);
}

const doctorStatus = run("npm", ["run", "doctor:strict"]);
if (doctorStatus !== 0) {
  process.exit(doctorStatus);
}

const buildStatus = run(tauriBin, ["build"]);
if (buildStatus === 0) {
  process.exit(0);
}

if (process.platform !== "darwin") {
  process.exit(buildStatus);
}

const fallbackStatus = fallbackDmgBuild();
process.exit(fallbackStatus === 0 ? 0 : buildStatus);
