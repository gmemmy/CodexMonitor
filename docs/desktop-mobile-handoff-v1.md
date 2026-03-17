# Desktop/Mobile Handoff v1

Canonical audit of the current desktop-hosted remote/mobile continuation path and the scoped v1 handoff payload.

## Confirmed Current State

- Desktop is the system of record for remote workspaces and thread history.
- Mobile runs in remote mode by default; desktop can also switch into remote mode.
- Mobile setup and `Settings > Server` both validate connectivity by saving host/token, calling `listWorkspaces()`, and recording `lastConnectedAtMs`.
- Remote reconnect is already stateful on the client:
  - workspace refresh marks remote workspace state `fresh` or `stale`
  - active-thread reconnect tracks `live`, `polling`, `stale`, and `disconnected`
  - the main shell shows a reconnect banner when remote data is stale or disconnected
- Same-client saved-remote switching is already implemented:
  - it updates host/token
  - validates the target with `listWorkspaces()`
  - replaces local workspace state
  - reconnects the best matching workspace
  - resets local thread state
- There is still no explicit cross-device handoff contract. Desktop and mobile can point at the same remote backend, but they do not exchange a typed “continue here” payload.

## State Already Shared Today

| State | Current source of truth | Shared across clients today | Notes |
| --- | --- | --- | --- |
| Remote workspace inventory and workspace settings | Desktop `workspaces.json` via `listWorkspaces()` | Yes | Both clients see the same workspace IDs, paths, names, and workspace settings once connected to the same host. |
| Thread summaries and thread history | Desktop Codex session state via `list_threads` and `resume_thread` | Yes | Thread content is recoverable on any client that can reach the same remote backend. |
| Remote backend transport settings | Per-client `AppSettings` | No | Host, token, saved remotes, active remote ID, and `lastConnectedAtMs` are stored per device. |
| Remote sync status | Per-client React state | No | Workspace stale state, thread live state, reconnect sequence, and last sync failure are local runtime state only. |
| Active workspace and active thread selection | Per-client React state | No | `activeWorkspaceId` and `activeThreadIdByWorkspace` are not persisted or shared. |
| Thread UI metadata | Per-client `localStorage` | No | Pins, custom names, detached review links, thread activity ordering, and per-thread Codex params stay on the current device. |

## State That Should Survive Handoff

| State | Should survive handoff | Include in v1 | Why |
| --- | --- | --- | --- |
| Remote target (`provider`, `host`, `token`, display name) | Yes | Yes | The receiving client must be able to reach the same desktop backend without relying on prior manual setup. |
| Workspace locator (`id`, `path`, `name`) | Yes | Yes | Workspace IDs are the best key today, but path/name fallbacks are already used in saved-remote handoff and protect against mismatch. |
| Active thread locator (`id`, title) | Yes when a thread is active | Yes | Reopening the same thread is the minimum useful continuation target. |
| Freshness boundary (`issuedAtMs`) | Yes | Yes | The receiver must treat handoff as a forced refresh boundary instead of trusting any local snapshot. |
| Composer draft and send intent | Eventually | No | Useful, but not required for the first “resume the same task on another device” flow. |
| Pins, custom names, detached review links, per-thread Codex params | Eventually | No | These are local productivity affordances, not the minimum state needed to continue the active task. |
| Layout, panel state, terminal tabs, desktop-only tooling | No | No | Out of scope for v1 and outside the minimum mobile continuation target. |

## v1 Payload

```ts
type DesktopMobileHandoffPayloadV1 = {
  version: 1;
  issuedAtMs: number;
  remote: {
    provider: "tcp";
    host: string;
    token: string | null;
    name: string | null;
  };
  workspace: {
    id: string;
    path: string;
    name: string;
  };
  thread?: {
    id: string;
    title: string | null;
  };
};
```

Example:

```json
{
  "version": 1,
  "issuedAtMs": 1773705600000,
  "remote": {
    "provider": "tcp",
    "host": "office-mac.tailnet.ts.net:4732",
    "token": "token-office",
    "name": "Office Mac"
  },
  "workspace": {
    "id": "ws-office",
    "path": "/Users/me/dev/codex-monitor",
    "name": "codex-monitor"
  },
  "thread": {
    "id": "thread-123",
    "title": "Fix remote handoff flow"
  }
}
```

## Apply Rules

The receiving client should apply the payload in this order:

1. Resolve the remote target.
   - Match an existing saved remote by host plus token when possible.
   - Otherwise create or update a local saved remote entry from the payload.
   - Switch `backendMode` to `remote` and validate with `listWorkspaces()`.

2. Resolve and activate the workspace.
   - Match by workspace ID first.
   - Fall back to path, then name.
   - Replace local workspace state with the validated remote list and activate the resolved workspace.

3. Restore the thread when `thread` is present.
   - Load thread summaries for the resolved workspace.
   - Force a thread refresh regardless of any local snapshot.
   - Reattach the live subscription after the forced refresh.

4. Fail explicitly when the remote, workspace, or thread cannot be resolved.
   - `remote` missing or unreachable: stop before mutating workspace/thread state.
   - `workspace` missing: land on the workspace list with a clear “workspace not found on remote” error.
   - `thread` missing: land on the resolved workspace with a clear “thread not found” error.

## Current Gaps Mapped To Code Areas

| Gap | Why it blocks smooth continuation | Likely code areas |
| --- | --- | --- |
| No typed handoff contract | There is no canonical payload definition to export, import, validate, or version. | `src/types.ts` and, if shared beyond the frontend, `src-tauri/src/types.rs` |
| Remote settings are per device | Mobile cannot infer the correct host/token from desktop state alone. | `src/features/settings/hooks/useAppSettings.ts`, `src/features/settings/hooks/useSettingsServerSection.ts`, `src/features/mobile/hooks/useMobileServerSetup.ts`, `src-tauri/src/settings/mod.rs`, `src-tauri/src/shared/settings_core.rs` |
| Active workspace/thread selection is not persisted or shared | After relaunch or switching devices, the client has no canonical “continue here” pointer. | `src/features/workspaces/hooks/useWorkspaces.ts`, `src/features/threads/hooks/useThreadsReducer.ts`, `src/features/app/components/MainApp.tsx` |
| Thread selection can trust stale local snapshots | `setActiveThreadId` skips `resume_thread` when local data exists, which is wrong for a cross-device handoff. | `src/features/threads/hooks/useThreads.ts`, `src/features/threads/hooks/useThreadActions.ts`, `src/features/app/hooks/useRemoteThreadLiveConnection.ts` |
| Same-client remote handoff stops at workspace continuity | The current remote switcher resets thread state and picks a workspace, but it does not carry a thread target or a handoff freshness boundary. | `src/features/app/hooks/useRemoteBackendHandoff.ts`, `src/features/settings/hooks/useSettingsServerSection.ts`, `src/features/app/components/MainApp.tsx` |
| No app/daemon surface for a future shared handoff contract | If handoff capture/apply becomes cross-runtime behavior, the contract needs parity across app, daemon, and shared core. | `src/services/tauri.ts`, `src-tauri/src/lib.rs`, `src-tauri/src/bin/codex_monitor_daemon/rpc.rs`, `src-tauri/src/shared/*` |

## Recommended First Implementation Issue

Implement client-side capture and apply for `DesktopMobileHandoffPayloadV1`.

- Scope:
  - Add the typed payload definition.
  - Capture the active remote target, workspace locator, thread locator, and `issuedAtMs`.
  - Apply the payload by reusing the existing remote-switch validation path, then forcing workspace/thread restore on the receiving client.
  - Explicitly exclude composer drafts, localStorage thread metadata, terminal state, and layout state from the first issue.
- Expected code areas:
  - `src/types.ts`
  - `src/features/app/hooks/useRemoteBackendHandoff.ts`
  - `src/features/settings/hooks/useSettingsServerSection.ts`
  - `src/features/mobile/hooks/useMobileServerSetup.ts`
  - `src/features/workspaces/hooks/useWorkspaces.ts`
  - `src/features/threads/hooks/useThreads.ts`
  - `src/features/threads/hooks/useThreadActions.ts`
  - `src/features/app/hooks/useRemoteThreadLiveConnection.ts`
- Reason:
  - The repo already has most of the reconnect primitives. The missing piece is the explicit “resume this remote/workspace/thread on another client” contract and the forced-refresh apply path that uses it.
