# Upstream Home Dashboard Usage Evaluation

## Scope

- Upstream commit reviewed: `777a9a3247ff8bf2aa7bbb8ad9acded74ce1cd2e`
- Repository baseline reviewed: current `daily`
- Decision status: do not merge this commit directly
- Recommended path: selectively port the high-value home account/limits pieces in a later follow-up issue

## Current Home Dashboard State

CodexMonitor already ships a useful home dashboard on `daily`:

- latest agent runs
- add-workspace actions
- local usage snapshot for all workspaces or one selected workspace
- token/time toggle
- four summary cards
- seven-day usage chart
- top-model chips

The main missing capability is account and rate-limit visibility while Home is selected. Today, Home intentionally clears the active workspace context, so the sidebar usage/account footer only has data when a workspace is active.

## User-Facing Changes In `777a9a3`

The upstream commit adds three distinct user-facing changes:

1. Home-level account and limit visibility
- Adds a new `useHomeAccount` hook to resolve which workspace should represent account/rate-limit data when Home is open.
- Uses the selected usage workspace when one is chosen.
- Falls back to a connected workspace with the best available account data when Home is showing "All workspaces".
- Surfaces session, weekly, credits, and plan information on Home.
- Feeds that same account context into the sidebar while Home is active.

2. Larger usage dashboard
- Expands the usage cards beyond the existing 4-card summary.
- Adds "today", cached tokens, average per run, average per active day, active days, and longest streak.
- Adds week-by-week chart paging instead of showing only the latest seven days.

3. Small copy and polish changes
- Renames credits labels to "Available credits".
- Adds layout/CSS work to fit the extra cards and chart controls.

## Implementation Surface In `777a9a3`

Directly merging the commit would pull in a mixed changeset:

- 17 files touched
- 2,620 insertions
- 250 deletions

High-signal dashboard files:

- `src/features/home/components/Home.tsx`
- `src/styles/home.css`
- `src/features/app/hooks/useHomeAccount.ts`
- `src/features/app/components/MainApp.tsx`
- `src/features/app/hooks/useMainAppLayoutSurfaces.ts`
- `src/features/app/utils/usageLabels.ts`

Validation-heavy test files:

- `src/features/home/components/Home.test.tsx`
- `src/features/app/hooks/useHomeAccount.test.tsx`
- `src/features/app/components/Sidebar.test.tsx`

Mixed-in unrelated or weakly related changes:

- `src-tauri/src/shared/codex_core.rs`
- `src/features/app/hooks/useTrayRecentThreads.ts`
- `src/features/app/hooks/useTrayRecentThreads.test.tsx`
- `src/features/threads/utils/threadNormalize.ts`
- `src/features/threads/utils/threadNormalize.test.ts`
- `src/features/app/hooks/useRemoteThreadLiveConnection.ts`
- `src/features/threads/hooks/useThreadMessaging.ts`

That mix makes the commit a poor direct cherry-pick candidate for this repo. The high-value product change is mostly frontend wiring and presentation, but the upstream commit also carries shared-core and unrelated robustness fixes.

## Product Value For Personal Workflow

High value now:

- Seeing session, weekly, and credit headroom while Home is selected
- Keeping the sidebar usage/account footer useful on Home
- Reusing the selected usage workspace, or a stable recent workspace, as the Home account source

Lower value now:

- longest-streak and active-day cards
- week-by-week chart paging
- extra derived cards such as cached tokens and average per run

For a personal single-user workflow, the main actionable question on Home is "how much usage headroom do I have right now?" The current dashboard already answers the trend question reasonably well. The upstream expansion improves density more than it improves decision-making.

## Validation Cost

If this commit were merged directly, the required validation scope would be broader than a normal home-screen tweak:

- `npm run typecheck`
- targeted Vitest coverage for Home, Sidebar, `useHomeAccount`, tray syncing, and thread normalization
- `cd src-tauri && cargo check` because the commit changes `src-tauri/src/shared/codex_core.rs`
- desktop Tauri validation because the account context shown on Home and in the sidebar changes behavior

Current environment constraints from `npm run validate:preflight`:

- `cargo` is missing
- `rustc` is missing
- `rust_checks` are blocked
- `desktop_tauri` validation is blocked
- `ios_device_flow` validation is blocked

That means a direct merge cannot be fully validated in this workspace today.

## Recommendation

Do not merge upstream commit `777a9a3` directly.

Recommended next move:

- create a follow-up issue to selectively port only the high-value Home account/limits behavior
- keep the existing Home usage snapshot structure mostly intact
- avoid bringing over unrelated tray, thread normalization, and shared-core changes unless they are needed for a separate issue

The selective port should focus on:

- `useHomeAccount`-style workspace selection logic
- sidebar fallback to Home account/rate-limit data when no workspace is active
- a minimal Home account-limits section for session, weekly, credits, and plan

The selective port should defer:

- streak and active-day summary cards
- chart week navigation
- expanded usage-metric card pack

## Decision

- Merge directly: no
- Selectively port later: yes
- Defer the rest: yes

This keeps the useful part of the upstream work on the roadmap without taking on a 17-file mixed commit that is larger than the current workflow benefit justifies.
