---
tracker:
  kind: linear
  api_key: $LINEAR_API_KEY
  project_slug: "42b15e5dc6d1"
  active_states:
    - Todo
    - In Progress
    - Rework
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
    git clone --origin origin --branch daily file:///Applications/work/projects/personal/codex-monitor .
    git remote set-url origin https://github.com/gmemmy/CodexMonitor.git
    git remote add upstream https://github.com/Dimillian/CodexMonitor.git || true
    ./scripts/bootstrap-worker.sh
    ./scripts/prepare-issue-workspace.sh daily
agent:
  max_concurrent_agents: 1
  max_turns: 6
codex:
  command: ./scripts/run-codex-worker.sh
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
- `In Review`: wait for human review unless explicit review feedback requires more changes.
- `Rework`: continue work on requested changes.
- `Done`: no action.

Execution rules:
1. Start by checking the current branch, git status, and HEAD commit.
2. Sync with `origin/daily` before implementation work begins.
3. Run `npm run validate:preflight` before editing code and record any blocked validation capabilities in the issue.
4. Reproduce the issue or confirm the requested change target before editing code.
5. Prefer the smallest sufficient validation for the touched area.
6. Update the Linear issue with concise progress notes when you reach meaningful milestones.
7. Stop only for a real blocker such as missing auth, missing secrets, or unavailable required tools.

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

Preflight policy:
- Run `npm run validate:preflight` before implementation work.
- If required capabilities are blocked, report the blocked checks explicitly in the Linear issue and PR summary.
- Do not claim full validation when the preflight reports a blocked required capability for the issue type.

CodexMonitor-specific constraints:
- Follow `AGENTS.md` and `docs/codebase-map.md`.
- Keep shared backend logic in `src-tauri/src/shared/*` first.
- Keep app and daemon adapters thin.
- Keep frontend Tauri calls in `src/services/tauri.ts`.
- Preserve app/daemon/shared-core parity when changing cross-runtime behavior.

When implementation is complete:
1. Summarize the code changes clearly.
2. Summarize validation that actually ran and list any blocked required checks separately.
3. Push the branch.
4. Open or update a PR targeting `daily`.
5. Move the issue to `In Review`.
6. Stop once acceptance criteria are met, validation passes, and the PR is ready for review.

Do not continue iterating after the issue is PR-ready unless:
- validation is failing,
- the PR is blocked by unresolved implementation problems, or
- explicit review feedback requires more changes.

Do not ask the human for routine next steps. Only stop for actual blockers.
