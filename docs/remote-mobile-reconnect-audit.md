# Remote/Mobile Reconnect Audit

Canonical audit of the current desktop-hosted remote backend and iOS/mobile client reconnect experience.

## Current Flow

- Desktop hosts the TCP daemon and remains the system of record for workspaces, sessions, and threads.
- iOS/mobile runs in remote mode by default and connects through `remoteBackendHost` + `remoteBackendToken`.
- Desktop remote mode uses the same TCP transport path as mobile.
- Initial mobile setup and saved remote management live in `Settings > Server` and the mobile setup wizard.
- Workspace reconnect and thread continuity are handled in the frontend through focus refresh, workspace restore, and single-thread live subscription hooks.

## Architecture Confirmed

- Remote transport and reconnect entrypoints:
  - `src-tauri/src/remote_backend/mod.rs`
  - `src-tauri/src/remote_backend/transport.rs`
  - `src-tauri/src/remote_backend/tcp_transport.rs`
- Desktop daemon lifecycle and Tailscale helpers:
  - `src-tauri/src/tailscale/mod.rs`
  - `src-tauri/src/tailscale/daemon_commands.rs`
  - `src/features/settings/components/sections/SettingsServerSection.tsx`
  - `src/features/settings/hooks/useSettingsServerSection.ts`
- Mobile setup flow:
  - `src/features/mobile/hooks/useMobileServerSetup.ts`
  - `src/features/mobile/components/MobileServerSetupWizard.tsx`
- Workspace/thread continuity:
  - `src/features/workspaces/hooks/useWorkspaceRestore.ts`
  - `src/features/workspaces/hooks/useWorkspaceRefreshOnFocus.ts`
  - `src/features/app/hooks/useRemoteThreadLiveConnection.ts`
  - `src/features/app/hooks/useRemoteThreadRefreshOnFocus.ts`
  - `src/features/threads/hooks/useThreads.ts`
  - `src/features/threads/hooks/useThreadActions.ts`
  - `src/features/threads/hooks/threadReducer/threadLifecycleSlice.ts`

## Ranked Friction Points

| Rank | Friction | User impact | Effort | Why it is high-friction | Likely impacted files/systems |
| --- | --- | --- | --- | --- | --- |
| 1 | Disconnects fail silently and leave stale remote state in place | High | Medium | When remote requests fail, refresh hooks usually swallow the error, existing workspace/thread state stays on screen, and the user gets little guidance beyond a small connection badge. This makes backend loss feel like stale or broken UI instead of an explicit reconnect problem. | `src/features/workspaces/hooks/useWorkspaceCrud.ts`, `src/features/workspaces/hooks/useWorkspaceRefreshOnFocus.ts`, `src/features/app/hooks/useRemoteThreadRefreshOnFocus.ts`, `src/features/app/hooks/useRemoteThreadLiveConnection.ts`, `src/features/app/hooks/useMainAppShellProps.tsx`, `src/features/messages/components/MessageRows.tsx`, `src-tauri/src/remote_backend/transport.rs` |
| 2 | Returning to an existing thread after reconnect can show stale history | High | Medium | Remote thread selection skips resume when a local snapshot already exists, and live reconnect only forces resume when there is no local snapshot. If the client missed turns while backgrounded or disconnected, reopening the thread can keep showing old content until the next focus or polling refresh, which makes continuity feel untrustworthy. | `src/features/threads/hooks/useThreads.ts`, `src/features/threads/hooks/useThreadActions.ts`, `src/features/app/hooks/useRemoteThreadLiveConnection.ts`, `src/features/app/hooks/useRemoteThreadRefreshOnFocus.ts` |
| 3 | Last active remote workspace/thread is not persisted | High | Medium | Remote/mobile continuity depends on in-memory `activeWorkspaceId` and `activeThreadIdByWorkspace`. After app relaunch, mobile resume, or a reconnect sequence that rebuilds state, the user has to re-find the task they were in. | `src/features/workspaces/hooks/useWorkspaces.ts`, `src/features/threads/hooks/useThreadsReducer.ts`, `src/features/threads/utils/threadStorage.ts`, `src/features/app/components/MainApp.tsx` |
| 4 | Switching saved remotes does not drive an explicit reconnect flow | Medium-high | Low-Medium | Using a saved remote only rewrites the active host/token. It does not automatically validate the target remote, replace stale workspace/thread state, or resume the current context on success. For users who bounce between machines, the switch feels partial and easy to distrust. | `src/features/settings/components/sections/SettingsServerSection.tsx`, `src/features/settings/hooks/useSettingsServerSection.ts`, `src/features/mobile/hooks/useMobileServerSetup.ts`, `src/features/app/components/MainApp.tsx`, `src/features/workspaces/hooks/useWorkspaceCrud.ts` |
| 5 | Cold-start reconnect restores every workspace before prioritizing the current task | Medium | Medium | Startup reconnect currently walks all known workspaces, then loads thread lists. On a flaky mobile connection or large workspace set, the app spends time rehydrating everything instead of getting the user back to the active workspace/thread first. | `src/features/workspaces/hooks/useWorkspaceRestore.ts`, `src/features/workspaces/hooks/useWorkspaces.ts`, `src/features/app/hooks/useSystemNotificationThreadLinks.ts`, `src/features/app/orchestration/useThreadOrchestration.ts` |
| 6 | Connection testing is shallow and does not prove continuity | Medium | Medium | `Connect & test` treats `listWorkspaces()` as the success condition. It does not verify thread resume/live subscribe behavior, and it does not turn daemon/auth/network failures into specific next actions. | `src/features/mobile/hooks/useMobileServerSetup.ts`, `src/features/settings/hooks/useSettingsServerSection.ts`, `src-tauri/src/tailscale/daemon_commands.rs`, `src-tauri/src/remote_backend/mod.rs` |

## Detailed Notes

### 1. Silent disconnects

- `refreshWorkspaces()` catches remote failures and keeps existing workspace state in memory.
- Focus polling hooks intentionally suppress refresh errors to avoid toast noise.
- The only always-on connection affordance is the topbar `Live`/`Polling`/`Disconnected` label across desktop, tablet, and phone. Compact/mobile also shows a polling countdown after completed turns, but neither surface explains stale state or the last failed sync.
- Result: users can keep looking at old workspaces and old thread content without understanding whether the server is down, auth is wrong, or the app is just stale.

### 2. Stale thread backfill after reconnect

- `setActiveThreadId` only resumes a thread automatically when there is no local snapshot.
- `useRemoteThreadLiveConnection` also avoids a resume on thread switch when local items exist.
- That combination is efficient in the happy path, but it is unsafe after background disconnects because local presence is treated as proof of freshness.
- Focus/poll refresh can eventually force a backfill, but a quick live reattach can promote the thread back to `live` before that refresh runs.

### 3. Missing remote context restore

- Pins, custom names, detached review links, and thread Codex params already persist locally.
- The last active remote workspace/thread does not.
- That means the continuity model preserves metadata around the task but not the task location itself.

### 4. Weak remote switching semantics

- The saved-remotes UI is useful for configuration, but `Use` behaves more like “edit the active target” than “switch me over now”.
- The user still has to infer whether they should run `Connect & test`, wait for polling, or manually reopen threads.
- This is especially fragile when the previous remote's workspaces remain visible until a later refresh succeeds.

### 5. Slow first useful paint after reconnect

- `useWorkspaceRestore` optimizes for eventually restoring every known workspace.
- Daily remote/mobile usage usually needs the opposite priority: restore the last active workspace/thread first, then fill in the rest in the background.
- Notification/deep-link navigation has a similar issue because it does not force a fresh thread list before jumping.

### 6. Connectivity check is narrower than the real job

- Successful `listWorkspaces()` confirms transport plus basic auth.
- It does not confirm that the daemon can resume a thread cleanly or keep a live subscription attached.
- That leaves the most important continuity path untested during setup.

## Recommended Next Issues

1. Make remote disconnects explicit and stateful.
   - Goal: mark stale remote state as stale, expose the last failed sync reason, and make reconnect actions obvious on desktop and mobile.
   - Why first: it reduces the broadest confusion surface and gives every later reconnect fix a clear user-visible state model.

2. Backfill active threads after reconnect even when local snapshots exist.
   - Goal: treat local thread items as cache, not proof of freshness, once the remote connection epoch changes or a live subscription was detached.
   - Why second: it fixes the highest-risk continuity bug without requiring a broader redesign.

3. Turn saved remote switching into a real handoff flow.
   - Goal: validate the target remote, clear or replace stale workspace/thread state, and restore the best available active context on success.
   - Why third: it addresses the daily multi-machine use case directly and builds on the disconnect-state work above.

## Recommended First Implementation Issue

Open the first implementation issue for explicit disconnect-state handling.

- Scope:
  - Detect failed remote refresh/resume attempts as a first-class connection problem.
  - Mark visible workspace/thread state as stale instead of silently leaving it “connected”.
  - Surface a clear reconnect action and last error on desktop and mobile.
- Expected code areas:
  - `src/features/workspaces/hooks/useWorkspaceCrud.ts`
  - `src/features/workspaces/hooks/useWorkspaceRefreshOnFocus.ts`
  - `src/features/app/hooks/useRemoteThreadRefreshOnFocus.ts`
  - `src/features/app/hooks/useRemoteThreadLiveConnection.ts`
  - `src/features/app/hooks/useMainAppShellProps.tsx`
  - `src/features/messages/components/MessageRows.tsx`
  - `src-tauri/src/remote_backend/transport.rs`
- Reason:
  - It removes the current ambiguity between “disconnected”, “stale”, and “still live”, which is the main blocker to trustworthy reconnect UX.
