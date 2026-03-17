import { useEffect, useRef } from "react";
import type { WorkspaceInfo } from "../../../types";

export const REMOTE_WORKSPACE_REFRESH_INTERVAL_MS = 15_000;

type WorkspaceRefreshOptions = {
  workspaces: WorkspaceInfo[];
  refreshWorkspaces: () => Promise<WorkspaceInfo[] | void>;
  listThreadsForWorkspaces: (
    workspaces: WorkspaceInfo[],
    options?: { preserveState?: boolean },
  ) => Promise<void>;
  backendMode?: string;
  pollIntervalMs?: number;
  suspendRefresh?: boolean;
};

export function useWorkspaceRefreshOnFocus({
  workspaces,
  refreshWorkspaces,
  listThreadsForWorkspaces,
  backendMode = "local",
  pollIntervalMs = REMOTE_WORKSPACE_REFRESH_INTERVAL_MS,
  suspendRefresh = false,
}: WorkspaceRefreshOptions) {
  const optionsRef = useRef({
    workspaces,
    refreshWorkspaces,
    listThreadsForWorkspaces,
    backendMode,
    pollIntervalMs,
    suspendRefresh,
  });
  useEffect(() => {
    optionsRef.current = {
      workspaces,
      refreshWorkspaces,
      listThreadsForWorkspaces,
      backendMode,
      pollIntervalMs,
      suspendRefresh,
    };
  });

  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let refreshInFlight = false;

    const runRefreshCycle = () => {
      if (refreshInFlight) {
        return;
      }
      refreshInFlight = true;
      const {
        workspaces: ws,
        refreshWorkspaces: refresh,
        listThreadsForWorkspaces: listThreads,
        suspendRefresh: isSuspended,
      } = optionsRef.current;
      if (isSuspended) {
        refreshInFlight = false;
        return;
      }
      void (async () => {
        let latestWorkspaces = ws;
        let refreshSucceeded = false;
        try {
          const entries = await refresh();
          if (Array.isArray(entries)) {
            refreshSucceeded = true;
            latestWorkspaces = entries;
          }
        } catch {
          // Silent: refresh errors show in debug panel.
          refreshSucceeded = false;
        }
        if (!refreshSucceeded) {
          return;
        }
        const connected = latestWorkspaces.filter((entry) => entry.connected);
        if (connected.length > 0) {
          await listThreads(connected, { preserveState: true });
        }
      })().finally(() => {
        refreshInFlight = false;
      });
    };

    const updatePolling = () => {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
      const {
        backendMode: currentBackendMode,
        pollIntervalMs: intervalMs,
        suspendRefresh: isSuspended,
      } = optionsRef.current;
      if (
        isSuspended ||
        currentBackendMode !== "remote" ||
        document.visibilityState !== "visible"
      ) {
        return;
      }
      pollTimer = setInterval(() => {
        runRefreshCycle();
      }, intervalMs);
    };

    const scheduleRefresh = () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      debounceTimer = setTimeout(() => {
        runRefreshCycle();
      }, 500);
    };

    const handleFocus = () => {
      scheduleRefresh();
      updatePolling();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        scheduleRefresh();
      }
      updatePolling();
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    updatePolling();
    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      if (pollTimer) {
        clearInterval(pollTimer);
      }
    };
  }, [backendMode, pollIntervalMs, suspendRefresh]);
}
