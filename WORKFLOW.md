---
tracker:
  kind: linear
  api_key: $LINEAR_API_KEY
  project_slug: "42b15e5dc6d1"
  active_states:
    - Todo
    - In Progress
    - In Review
    - Human Review
    - Rework
    - Merging
  terminal_states:
    - Done
    - Closed
    - Canceled
    - Duplicate
polling:
  interval_ms: 10000
workspace:
  root: ~/.symphony/workspaces/codex-monitor
hooks:
  after_create: |
    git clone --origin origin https://github.com/gmemmy/CodexMonitor.git .
    git remote add upstream https://github.com/Dimillian/CodexMonitor.git || true
    git fetch --all --prune
    git checkout daily || git checkout -b daily origin/daily
    git pull --ff-only origin daily
agent:
  max_concurrent_agents: 1
  max_turns: 12
codex:
  command: codex --config shell_environment_policy.inherit=all app-server
  approval_policy: never
  thread_sandbox: danger-full-access
  turn_sandbox_policy:
    type: dangerFullAccess
---

You are working on a Linear issue `{{ issue.identifier }}` for the `CodexMonitor` repository.

Issue context:
- Identifier: {{ issue.identifier }}
- Title: {{ issue.title }}
- Current status: {{ issue.state }}
- Labels: {{ issue.labels }}
- URL: {{ issue.url }}

Issue description:
{% if issue.description %}
{{ issue.description }}
{% else %}
No description provided.
{% endif %}

Repository rules:
- Work only inside the provided repository copy.
- Treat `daily` as the shipping branch.
- Create a feature branch from `daily` for issue work.
- Open PRs against `daily`, never against `main`.
- Keep changes tightly scoped to the current issue.
- Do not broaden scope when you find adjacent improvements; leave follow-ups for new Linear issues.

Status flow:
- `Backlog`: ignore and do not change.
- `Todo`: move to `In Progress`, then start work.
- `In Progress`: continue work.
- `In Review`: wait for human review unless the issue explicitly says more changes are required.
- `Human Review`: wait for human review unless the issue explicitly says more changes are required.
- `Rework`: continue work on requested changes.
- `Merging`: merge/landing stage.
- `Done`: no action.

Execution rules:
1. Start by checking the current branch, git status, and HEAD commit.
2. Sync with `origin/daily` before implementation work begins.
3. Reproduce the issue or confirm the requested change target before editing code.
4. Prefer the smallest sufficient validation for the touched area.
5. Update the Linear issue with concise progress notes when you reach meaningful milestones.
6. Stop only for a real blocker such as missing auth, missing secrets, or unavailable required tools.

Validation rules for this repository:
- Frontend-only changes:
  - Run targeted `vitest` files when they exist.
  - Run `npm run typecheck`.
- Rust/shared-core changes:
  - Run `cargo check` from `src-tauri`.
- Remote/mobile changes:
  - Run `npm run typecheck`.
  - Run `cargo check` from `src-tauri`.
  - Validate the desktop app path locally.
  - Validate the remote/mobile flow end-to-end when the issue changes remote behavior.

CodexMonitor-specific constraints:
- Follow `AGENTS.md` and `docs/codebase-map.md`.
- Keep shared backend logic in `src-tauri/src/shared/*` first.
- Keep app and daemon adapters thin.
- Keep frontend Tauri calls in `src/services/tauri.ts`.
- Preserve app/daemon/shared-core parity when changing cross-runtime behavior.

When implementation is complete:
1. Summarize the code changes clearly.
2. Summarize validation that actually ran.
3. Push the branch.
4. Open or update a PR targeting `daily`.
5. Move the issue to `In Review`.

Do not ask the human for routine next steps. Only stop for actual blockers.
