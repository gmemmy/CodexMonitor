import { useEffect, useMemo, useRef, useState } from "react";
import type { ActiveSelectionState, AppSettings, ThreadRefreshResult, WorkspaceInfo } from "@/types";
import {
  getActiveSelectionState,
  setActiveThreadSelection,
  setActiveWorkspaceSelection,
} from "@services/tauri";

const EMPTY_SELECTION_STATE: ActiveSelectionState = {
  activeWorkspaceId: null,
  activeThreadIdByWorkspace: {},
};

type UseBackendSelectionContinuityArgs = {
  appSettings: Pick<AppSettings, "backendMode" | "remoteBackendHost" | "remoteBackendToken">;
  workspaces: WorkspaceInfo[];
  hasLoaded: boolean;
  suspend?: boolean;
  activeWorkspace: WorkspaceInfo | null;
  activeWorkspaceId: string | null;
  setActiveWorkspaceId: (workspaceId: string | null) => void;
  activeThreadId: string | null;
  setActiveThreadId: (threadId: string | null, workspaceId?: string) => void;
  listThreadsForWorkspace: (
    workspace: WorkspaceInfo,
    options?: { preserveState?: boolean; maxPages?: number },
  ) => Promise<void>;
  refreshThread: (workspaceId: string, threadId: string) => Promise<ThreadRefreshResult>;
};

function buildContextKey(
  settings: Pick<AppSettings, "backendMode" | "remoteBackendHost" | "remoteBackendToken">,
) {
  if (settings.backendMode !== "remote") {
    return "local";
  }
  return `remote:${settings.remoteBackendHost}:${settings.remoteBackendToken ?? ""}`;
}

export function useBackendSelectionContinuity({
  appSettings,
  workspaces,
  hasLoaded,
  suspend = false,
  activeWorkspace,
  activeWorkspaceId,
  setActiveWorkspaceId,
  activeThreadId,
  setActiveThreadId,
  listThreadsForWorkspace,
  refreshThread,
}: UseBackendSelectionContinuityArgs) {
  const contextKey = useMemo(
    () => buildContextKey(appSettings),
    [appSettings.backendMode, appSettings.remoteBackendHost, appSettings.remoteBackendToken],
  );
  const [selectionState, setSelectionState] = useState<ActiveSelectionState>(EMPTY_SELECTION_STATE);
  const [loadedContextKey, setLoadedContextKey] = useState<string | null>(null);
  const appliedWorkspaceRestoreContextRef = useRef<string | null>(null);
  const resolvedThreadRestoreKeysRef = useRef<Set<string>>(new Set());
  const lastPersistedWorkspaceRef = useRef<string | null | undefined>(undefined);
  const lastPersistedThreadByWorkspaceRef = useRef<Record<string, string | null>>({});

  useEffect(() => {
    setSelectionState(EMPTY_SELECTION_STATE);
    setLoadedContextKey(null);
    appliedWorkspaceRestoreContextRef.current = null;
    resolvedThreadRestoreKeysRef.current = new Set();
    lastPersistedWorkspaceRef.current = undefined;
    lastPersistedThreadByWorkspaceRef.current = {};
  }, [contextKey]);

  useEffect(() => {
    if (!hasLoaded || suspend || loadedContextKey === contextKey) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const nextState = await getActiveSelectionState();
        if (cancelled) {
          return;
        }
        setSelectionState(nextState);
        setLoadedContextKey(contextKey);
        lastPersistedWorkspaceRef.current = nextState.activeWorkspaceId ?? null;
        lastPersistedThreadByWorkspaceRef.current = Object.fromEntries(
          Object.entries(nextState.activeThreadIdByWorkspace).map(([workspaceId, threadId]) => [
            workspaceId,
            threadId,
          ]),
        );
      } catch {
        if (cancelled) {
          return;
        }
        setSelectionState(EMPTY_SELECTION_STATE);
        setLoadedContextKey(contextKey);
        lastPersistedWorkspaceRef.current = null;
        lastPersistedThreadByWorkspaceRef.current = {};
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [contextKey, hasLoaded, loadedContextKey, suspend]);

  useEffect(() => {
    if (
      !hasLoaded ||
      suspend ||
      loadedContextKey !== contextKey ||
      appliedWorkspaceRestoreContextRef.current === contextKey
    ) {
      return;
    }

    const persistedWorkspaceId = selectionState.activeWorkspaceId;
    if (!persistedWorkspaceId) {
      if (activeWorkspaceId) {
        setActiveWorkspaceId(null);
        return;
      }
      appliedWorkspaceRestoreContextRef.current = contextKey;
      return;
    }

    const targetWorkspace =
      workspaces.find((workspace) => workspace.id === persistedWorkspaceId) ?? null;
    if (!targetWorkspace) {
      const nextState = {
        ...selectionState,
        activeWorkspaceId: null,
        activeThreadIdByWorkspace: {
          ...selectionState.activeThreadIdByWorkspace,
        },
      };
      delete nextState.activeThreadIdByWorkspace[persistedWorkspaceId];
      setSelectionState(nextState);
      lastPersistedWorkspaceRef.current = null;
      delete lastPersistedThreadByWorkspaceRef.current[persistedWorkspaceId];
      void setActiveWorkspaceSelection(null).catch(() => {});
      void setActiveThreadSelection(persistedWorkspaceId, null).catch(() => {});
      if (activeWorkspaceId) {
        setActiveWorkspaceId(null);
        return;
      }
      appliedWorkspaceRestoreContextRef.current = contextKey;
      return;
    }

    if (activeWorkspaceId !== persistedWorkspaceId) {
      setActiveWorkspaceId(persistedWorkspaceId);
      return;
    }

    appliedWorkspaceRestoreContextRef.current = contextKey;
  }, [
    activeWorkspaceId,
    contextKey,
    hasLoaded,
    loadedContextKey,
    selectionState,
    setActiveWorkspaceId,
    suspend,
    workspaces,
  ]);

  useEffect(() => {
    if (
      !hasLoaded ||
      suspend ||
      loadedContextKey !== contextKey ||
      appliedWorkspaceRestoreContextRef.current !== contextKey ||
      !activeWorkspace
    ) {
      return;
    }

    const restoreKey = `${contextKey}:${activeWorkspace.id}`;
    if (resolvedThreadRestoreKeysRef.current.has(restoreKey)) {
      return;
    }

    const persistedThreadId =
      selectionState.activeThreadIdByWorkspace[activeWorkspace.id] ?? null;
    if (!persistedThreadId) {
      lastPersistedThreadByWorkspaceRef.current[activeWorkspace.id] = null;
      resolvedThreadRestoreKeysRef.current.add(restoreKey);
      if (activeThreadId) {
        setActiveThreadId(null, activeWorkspace.id);
      }
      return;
    }

    if (!activeWorkspace.connected) {
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        await listThreadsForWorkspace(activeWorkspace, { preserveState: true });
        const refreshResult = await refreshThread(activeWorkspace.id, persistedThreadId);
        if (cancelled) {
          return;
        }

        if (refreshResult.ok && refreshResult.threadId === persistedThreadId) {
          lastPersistedThreadByWorkspaceRef.current[activeWorkspace.id] = persistedThreadId;
          setActiveThreadId(persistedThreadId, activeWorkspace.id);
        } else {
          const nextState = {
            ...selectionState,
            activeThreadIdByWorkspace: {
              ...selectionState.activeThreadIdByWorkspace,
            },
          };
          delete nextState.activeThreadIdByWorkspace[activeWorkspace.id];
          setSelectionState(nextState);
          lastPersistedThreadByWorkspaceRef.current[activeWorkspace.id] = null;
          setActiveThreadId(null, activeWorkspace.id);
          await setActiveThreadSelection(activeWorkspace.id, null).catch(() => {});
        }

        resolvedThreadRestoreKeysRef.current.add(restoreKey);
      } catch {
        // Keep the persisted target and retry on the next refresh/reconnect boundary.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    activeThreadId,
    activeWorkspace,
    contextKey,
    hasLoaded,
    listThreadsForWorkspace,
    loadedContextKey,
    refreshThread,
    selectionState,
    setActiveThreadId,
    suspend,
  ]);

  useEffect(() => {
    if (
      !hasLoaded ||
      suspend ||
      loadedContextKey !== contextKey ||
      appliedWorkspaceRestoreContextRef.current !== contextKey
    ) {
      return;
    }

    const nextWorkspaceId = activeWorkspaceId ?? null;
    if (lastPersistedWorkspaceRef.current === nextWorkspaceId) {
      return;
    }

    const previousWorkspaceId = lastPersistedWorkspaceRef.current ?? null;
    lastPersistedWorkspaceRef.current = nextWorkspaceId;
    setSelectionState((current) => ({
      ...current,
      activeWorkspaceId: nextWorkspaceId,
    }));
    void setActiveWorkspaceSelection(nextWorkspaceId).catch(() => {
      lastPersistedWorkspaceRef.current = previousWorkspaceId;
    });
  }, [activeWorkspaceId, contextKey, hasLoaded, loadedContextKey, suspend]);

  useEffect(() => {
    if (
      !hasLoaded ||
      suspend ||
      !activeWorkspaceId ||
      loadedContextKey !== contextKey ||
      appliedWorkspaceRestoreContextRef.current !== contextKey
    ) {
      return;
    }

    const restoreKey = `${contextKey}:${activeWorkspaceId}`;
    if (!resolvedThreadRestoreKeysRef.current.has(restoreKey)) {
      return;
    }

    const nextThreadId = activeThreadId ?? null;
    const previousThreadId =
      lastPersistedThreadByWorkspaceRef.current[activeWorkspaceId] ?? null;
    if (previousThreadId === nextThreadId) {
      return;
    }

    lastPersistedThreadByWorkspaceRef.current[activeWorkspaceId] = nextThreadId;
    setSelectionState((current) => {
      const nextState = {
        ...current,
        activeThreadIdByWorkspace: {
          ...current.activeThreadIdByWorkspace,
        },
      };
      if (nextThreadId) {
        nextState.activeThreadIdByWorkspace[activeWorkspaceId] = nextThreadId;
      } else {
        delete nextState.activeThreadIdByWorkspace[activeWorkspaceId];
      }
      return nextState;
    });
    void setActiveThreadSelection(activeWorkspaceId, nextThreadId).catch(() => {
      lastPersistedThreadByWorkspaceRef.current[activeWorkspaceId] = previousThreadId;
    });
  }, [activeThreadId, activeWorkspaceId, contextKey, hasLoaded, loadedContextKey, suspend]);
}
