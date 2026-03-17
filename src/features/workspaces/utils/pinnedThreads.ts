import type { WorkspaceInfo, WorkspaceSettings } from "@/types";

export const MAX_PINS_SOFT_LIMIT = 5;

export type WorkspacePinnedThreads = Record<string, number>;

export function getWorkspacePinnedThreads(
  settings: WorkspaceSettings | null | undefined,
): WorkspacePinnedThreads {
  const raw = settings?.pinnedThreads;
  if (!raw || typeof raw !== "object") {
    return {};
  }
  return Object.fromEntries(
    Object.entries(raw).filter(
      ([threadId, timestamp]) =>
        typeof threadId === "string" &&
        typeof timestamp === "number" &&
        Number.isFinite(timestamp),
    ),
  );
}

export function buildPinnedThreadsVersionKey(workspaces: WorkspaceInfo[]): string {
  return workspaces
    .map((workspace) => {
      const pinned = getWorkspacePinnedThreads(workspace.settings);
      const entries = Object.entries(pinned).sort(([a], [b]) => a.localeCompare(b));
      return `${workspace.id}:${JSON.stringify(entries)}`;
    })
    .sort()
    .join("|");
}
