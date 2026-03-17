import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { subscribeAppServerEvents } from "@services/events";
import { threadLiveSubscribe, threadLiveUnsubscribe } from "@services/tauri";
import {
  getAppServerParams,
  getAppServerRawMethod,
} from "@utils/appServerEvents";
import type {
  RemoteSyncFailure,
  RemoteThreadConnectionState,
  WorkspaceInfo,
} from "@/types";
import {
  buildRemoteSyncFailure,
  formatRemoteSyncErrorMessage,
  normalizeThreadRefreshResult,
} from "@app/utils/remoteSync";

const SELF_DETACH_IGNORE_WINDOW_MS = 10_000;

type ReconnectOptions = {
  runResume?: boolean;
  workspaceConnectedHint?: boolean;
  reason?:
    | "thread-switch"
    | "focus"
    | "detached-recovery"
    | "connected-recovery"
    | "manual";
};

type UseRemoteThreadLiveConnectionOptions = {
  backendMode: string;
  suspendRemoteSync?: boolean;
  activeWorkspace: WorkspaceInfo | null;
  activeThreadId: string | null;
  activeThreadHasLocalSnapshot?: boolean;
  activeThreadIsProcessing?: boolean;
  refreshThread: (workspaceId: string, threadId: string) => Promise<unknown> | unknown;
  reconnectWorkspace?: (workspace: WorkspaceInfo) => Promise<unknown> | unknown;
  bumpWorkspaceFreshnessBoundary?: (workspaceId: string | null | undefined) => void;
  markThreadFreshAtCurrentBoundary?: (workspaceId: string, threadId: string) => void;
  shouldRefreshForFreshnessBoundary?: (
    workspaceId: string,
    threadId: string,
  ) => boolean;
};

function keyForThread(workspaceId: string, threadId: string) {
  return `${workspaceId}:${threadId}`;
}

function splitKey(key: string): { workspaceId: string; threadId: string } | null {
  const separator = key.indexOf(":");
  if (separator <= 0 || separator >= key.length - 1) {
    return null;
  }
  return {
    workspaceId: key.slice(0, separator),
    threadId: key.slice(separator + 1),
  };
}

function isThreadActivityMethod(method: string) {
  return (
    method.startsWith("item/") ||
    method.startsWith("turn/") ||
    method === "error" ||
    method === "thread/tokenUsage/updated"
  );
}

function extractThreadId(method: string, params: Record<string, unknown>): string | null {
  if (method === "turn/started" || method === "turn/completed" || method === "error") {
    const turn = (params.turn as Record<string, unknown> | undefined) ?? {};
    const fromTurn = String(turn.threadId ?? turn.thread_id ?? "").trim();
    if (fromTurn) {
      return fromTurn;
    }
  }
  const direct = String(params.threadId ?? params.thread_id ?? "").trim();
  return direct.length > 0 ? direct : null;
}

function isDocumentVisible() {
  return typeof document === "undefined" ? true : document.visibilityState === "visible";
}

function isWindowFocused() {
  if (typeof document === "undefined" || typeof document.hasFocus !== "function") {
    return true;
  }
  return document.hasFocus();
}

export function useRemoteThreadLiveConnection({
  backendMode,
  suspendRemoteSync = false,
  activeWorkspace,
  activeThreadId,
  activeThreadHasLocalSnapshot = true,
  activeThreadIsProcessing = false,
  refreshThread,
  reconnectWorkspace,
  bumpWorkspaceFreshnessBoundary: onBumpWorkspaceFreshnessBoundary,
  markThreadFreshAtCurrentBoundary: onMarkThreadFreshAtCurrentBoundary,
  shouldRefreshForFreshnessBoundary: onShouldRefreshForFreshnessBoundary,
}: UseRemoteThreadLiveConnectionOptions) {
  const activeWorkspaceId = activeWorkspace?.id ?? null;
  const activeWorkspaceConnected = activeWorkspace?.connected ?? false;
  const [connectionState, setConnectionState] =
    useState<RemoteThreadConnectionState>(() => {
      if (backendMode !== "remote") {
        return activeWorkspace?.connected ? "live" : "disconnected";
      }
      if (!activeWorkspace?.connected) {
        return "disconnected";
      }
      return "polling";
    });
  const [lastFailure, setLastFailure] = useState<RemoteSyncFailure | null>(null);

  const backendModeRef = useRef(backendMode);
  const suspendRemoteSyncRef = useRef(suspendRemoteSync);
  const activeWorkspaceRef = useRef(activeWorkspace);
  const activeThreadIdRef = useRef(activeThreadId);
  const activeThreadHasLocalSnapshotRef = useRef(activeThreadHasLocalSnapshot);
  const activeThreadIsProcessingRef = useRef(activeThreadIsProcessing);
  const refreshThreadRef = useRef(refreshThread);
  const reconnectWorkspaceRef = useRef(reconnectWorkspace);
  const bumpWorkspaceFreshnessBoundaryRef = useRef(onBumpWorkspaceFreshnessBoundary);
  const markThreadFreshAtCurrentBoundaryRef = useRef(onMarkThreadFreshAtCurrentBoundary);
  const shouldRefreshForFreshnessBoundaryRef = useRef(
    onShouldRefreshForFreshnessBoundary,
  );
  const connectionStateRef = useRef(connectionState);
  const activeSubscriptionKeyRef = useRef<string | null>(null);
  const desiredSubscriptionKeyRef = useRef<string | null>(null);
  const ignoreDetachedEventsUntilRef = useRef<Map<string, number>>(new Map());
  const workspaceFreshnessBoundaryRef = useRef<Record<string, number>>({});
  const threadFreshnessBoundaryRef = useRef<Record<string, number>>({});
  const initializedWorkspaceFreshnessRef = useRef<Set<string>>(new Set());
  const previousWorkspaceConnectionRef = useRef<{
    workspaceId: string | null;
    connected: boolean;
  }>({
    workspaceId: activeWorkspaceId,
    connected: activeWorkspaceConnected,
  });
  const inFlightReconnectRef = useRef<{
    key: string;
    sequence: number;
    promise: Promise<boolean>;
  } | null>(null);
  const reconnectSequenceRef = useRef(0);

  useEffect(() => {
    backendModeRef.current = backendMode;
    suspendRemoteSyncRef.current = suspendRemoteSync;
    activeWorkspaceRef.current = activeWorkspace;
    activeThreadIdRef.current = activeThreadId;
    activeThreadHasLocalSnapshotRef.current = activeThreadHasLocalSnapshot;
    activeThreadIsProcessingRef.current = activeThreadIsProcessing;
    refreshThreadRef.current = refreshThread;
    reconnectWorkspaceRef.current = reconnectWorkspace;
    bumpWorkspaceFreshnessBoundaryRef.current = onBumpWorkspaceFreshnessBoundary;
    markThreadFreshAtCurrentBoundaryRef.current = onMarkThreadFreshAtCurrentBoundary;
    shouldRefreshForFreshnessBoundaryRef.current = onShouldRefreshForFreshnessBoundary;
  }, [
    backendMode,
    suspendRemoteSync,
    activeWorkspace,
    activeThreadId,
    activeThreadHasLocalSnapshot,
    activeThreadIsProcessing,
    refreshThread,
    reconnectWorkspace,
    onBumpWorkspaceFreshnessBoundary,
    onMarkThreadFreshAtCurrentBoundary,
    onShouldRefreshForFreshnessBoundary,
  ]);

  useEffect(() => {
    connectionStateRef.current = connectionState;
  }, [connectionState]);

  const setState = useCallback((next: RemoteThreadConnectionState) => {
    if (connectionStateRef.current === next) {
      return;
    }
    connectionStateRef.current = next;
    setConnectionState(next);
  }, []);

  const clearSyncFailure = useCallback(
    (workspaceId?: string | null, threadId?: string | null) => {
      const activeWorkspaceId = activeWorkspaceRef.current?.id ?? null;
      const activeThreadId = activeThreadIdRef.current;
      if (
        (workspaceId && workspaceId !== activeWorkspaceId) ||
        (threadId && threadId !== activeThreadId)
      ) {
        return;
      }
      setLastFailure(null);
      if (backendModeRef.current !== "remote") {
        setState(activeWorkspaceRef.current?.connected ? "live" : "disconnected");
        return;
      }
      if (!activeWorkspaceRef.current?.connected) {
        setState("disconnected");
        return;
      }
      const targetKey =
        activeWorkspaceId && activeThreadId
          ? keyForThread(activeWorkspaceId, activeThreadId)
          : null;
      if (targetKey && activeSubscriptionKeyRef.current === targetKey) {
        setState("live");
        return;
      }
      setState("polling");
    },
    [setState],
  );

  const bumpWorkspaceFreshnessBoundary = useCallback((workspaceId?: string | null) => {
    if (!workspaceId) {
      return;
    }
    initializedWorkspaceFreshnessRef.current.add(workspaceId);
    workspaceFreshnessBoundaryRef.current[workspaceId] =
      (workspaceFreshnessBoundaryRef.current[workspaceId] ?? 0) + 1;
    bumpWorkspaceFreshnessBoundaryRef.current?.(workspaceId);
  }, []);

  const markThreadFreshAtCurrentBoundary = useCallback(
    (workspaceId: string, threadId: string) => {
      if (!workspaceId || !threadId) {
        return;
      }
      threadFreshnessBoundaryRef.current[keyForThread(workspaceId, threadId)] =
        workspaceFreshnessBoundaryRef.current[workspaceId] ?? 0;
      markThreadFreshAtCurrentBoundaryRef.current?.(workspaceId, threadId);
    },
    [],
  );

  const shouldResumeForFreshnessBoundary = useCallback(
    (workspaceId: string, threadId: string) => {
      if (!workspaceId || !threadId) {
        return false;
      }
      const sharedDecision =
        shouldRefreshForFreshnessBoundaryRef.current?.(workspaceId, threadId);
      if (typeof sharedDecision === "boolean") {
        return sharedDecision;
      }
      const boundary = workspaceFreshnessBoundaryRef.current[workspaceId] ?? 0;
      if (boundary <= 0) {
        return false;
      }
      return (
        (threadFreshnessBoundaryRef.current[keyForThread(workspaceId, threadId)] ?? 0) <
        boundary
      );
    },
    [],
  );

  const reportSyncFailure = useCallback(
    (
      workspaceId: string,
      threadId: string,
      failure: Omit<RemoteSyncFailure, "at" | "workspaceId" | "threadId">,
    ) => {
      const activeWorkspaceId = activeWorkspaceRef.current?.id ?? null;
      const activeThreadId = activeThreadIdRef.current;
      if (workspaceId !== activeWorkspaceId || threadId !== activeThreadId) {
        return;
      }
      setLastFailure(
        buildRemoteSyncFailure(failure.phase, failure.message, workspaceId, threadId),
      );
      setState(activeWorkspaceRef.current?.connected ? "stale" : "disconnected");
    },
    [setState],
  );

  const unsubscribeByKey = useCallback(
    async (key: string) => {
      const parsed = splitKey(key);
      if (!parsed) {
        return;
      }
      await threadLiveUnsubscribe(parsed.workspaceId, parsed.threadId).catch(() => {
        // Ignore cleanup errors; foreground reattach handles recovery.
      });
    },
    [],
  );

  const reconcileDisconnectedState = useCallback(() => {
    const workspace = activeWorkspaceRef.current;
    if (backendModeRef.current !== "remote") {
      setState(workspace?.connected ? "live" : "disconnected");
      return;
    }
    if (!workspace?.connected) {
      setState("disconnected");
      return;
    }
    setState("polling");
  }, [setState]);

  useEffect(() => {
    clearSyncFailure();
  }, [activeWorkspaceId, activeThreadId, backendMode, suspendRemoteSync, clearSyncFailure]);

  useEffect(() => {
    if (backendMode !== "remote") {
      initializedWorkspaceFreshnessRef.current.clear();
      return;
    }
    if (!activeWorkspaceId || initializedWorkspaceFreshnessRef.current.has(activeWorkspaceId)) {
      return;
    }
    bumpWorkspaceFreshnessBoundary(activeWorkspaceId);
  }, [activeWorkspaceId, backendMode, bumpWorkspaceFreshnessBoundary]);

  useEffect(() => {
    const previous = previousWorkspaceConnectionRef.current;
    if (
      backendMode === "remote" &&
      previous.workspaceId === activeWorkspaceId &&
      activeWorkspaceId &&
      previous.connected &&
      !activeWorkspaceConnected
    ) {
      bumpWorkspaceFreshnessBoundary(activeWorkspaceId);
    }
    previousWorkspaceConnectionRef.current = {
      workspaceId: activeWorkspaceId,
      connected: activeWorkspaceConnected,
    };
  }, [
    activeWorkspaceConnected,
    activeWorkspaceId,
    backendMode,
    bumpWorkspaceFreshnessBoundary,
  ]);

  const reconnectLive = useCallback(
    async (
      workspaceId: string,
      threadId: string,
      options?: ReconnectOptions,
    ): Promise<boolean> => {
      if (
        suspendRemoteSyncRef.current ||
        backendModeRef.current !== "remote" ||
        !workspaceId ||
        !threadId ||
        !activeWorkspaceRef.current
      ) {
        reconcileDisconnectedState();
        return false;
      }

      const targetKey = keyForThread(workspaceId, threadId);
      desiredSubscriptionKeyRef.current = targetKey;
      const inFlightReconnect = inFlightReconnectRef.current;
      if (inFlightReconnect?.key === targetKey) {
        if (inFlightReconnect.sequence === reconnectSequenceRef.current) {
          return inFlightReconnect.promise;
        }
        // A newer sequence (blur/focus/key change) has invalidated this attempt.
        inFlightReconnectRef.current = null;
      }

      const reconnectPromise = (async (): Promise<boolean> => {
        const sequence = reconnectSequenceRef.current + 1;
        reconnectSequenceRef.current = sequence;
        const workspaceAtStart = activeWorkspaceRef.current;
        const workspaceConnectedAtStart =
          options?.workspaceConnectedHint ?? Boolean(workspaceAtStart?.connected);
        const boundaryRequiresResume = shouldResumeForFreshnessBoundary(
          workspaceId,
          threadId,
        );
        const shouldResume = options?.runResume !== false || boundaryRequiresResume;
        const shouldKeepLiveState = options?.reason === "thread-switch";
        if (!workspaceConnectedAtStart) {
          setState("disconnected");
        } else if (shouldResume || !shouldKeepLiveState) {
          setState("polling");
        } else {
          setState("live");
        }

        try {
          desiredSubscriptionKeyRef.current = targetKey;
          const workspaceEntry = activeWorkspaceRef.current;
          const needsWorkspaceReconnect =
            options?.workspaceConnectedHint === false ||
            (typeof options?.workspaceConnectedHint === "undefined" &&
              workspaceEntry?.connected === false);
          if (
            workspaceEntry &&
            needsWorkspaceReconnect &&
            reconnectWorkspaceRef.current &&
            workspaceEntry.id === workspaceId
          ) {
            await Promise.resolve(reconnectWorkspaceRef.current(workspaceEntry));
          }
          if (sequence !== reconnectSequenceRef.current) {
            return false;
          }

          if (shouldResume) {
            const refreshResult = normalizeThreadRefreshResult(
              await Promise.resolve(refreshThreadRef.current(workspaceId, threadId)),
            );
            if (!refreshResult.ok) {
              if (sequence === reconnectSequenceRef.current) {
                reportSyncFailure(workspaceId, threadId, {
                  phase: "thread_refresh",
                  message:
                    refreshResult.errorMessage ??
                    "Unable to refresh the remote thread state.",
                });
              }
              return false;
            }
            clearSyncFailure(workspaceId, threadId);
            markThreadFreshAtCurrentBoundary(workspaceId, threadId);
          }
          if (sequence !== reconnectSequenceRef.current) {
            return false;
          }

          if (activeSubscriptionKeyRef.current === targetKey) {
            ignoreDetachedEventsUntilRef.current.set(
              targetKey,
              Date.now() + SELF_DETACH_IGNORE_WINDOW_MS,
            );
            await threadLiveUnsubscribe(workspaceId, threadId).catch(() => {
              // Best-effort dedupe: ignore unsubscribe failures before reattach.
            });
            activeSubscriptionKeyRef.current = null;
          }
          await threadLiveSubscribe(workspaceId, threadId);
          if (sequence !== reconnectSequenceRef.current) {
            if (desiredSubscriptionKeyRef.current !== targetKey) {
              await threadLiveUnsubscribe(workspaceId, threadId).catch(() => {
                // Best-effort cleanup for stale reconnect attempts.
              });
            }
            return false;
          }

          activeSubscriptionKeyRef.current = targetKey;
          clearSyncFailure(workspaceId, threadId);
          if (shouldResume || !shouldKeepLiveState) {
            setState("polling");
          } else {
            setState("live");
          }
          return true;
        } catch (error) {
          if (sequence === reconnectSequenceRef.current) {
            reportSyncFailure(workspaceId, threadId, {
              phase: "thread_live",
              message: formatRemoteSyncErrorMessage(
                error,
                "Unable to reconnect the remote thread stream.",
              ),
            });
          }
          return false;
        }
      })();

      const reconnectSequence = reconnectSequenceRef.current;
      inFlightReconnectRef.current = {
        key: targetKey,
        sequence: reconnectSequence,
        promise: reconnectPromise,
      };
      reconnectPromise.finally(() => {
        if (inFlightReconnectRef.current?.promise === reconnectPromise) {
          inFlightReconnectRef.current = null;
        }
      });
      return reconnectPromise;
    },
    [
      clearSyncFailure,
      markThreadFreshAtCurrentBoundary,
      reconcileDisconnectedState,
      reportSyncFailure,
      setState,
      shouldResumeForFreshnessBoundary,
    ],
  );

  useEffect(() => {
    const nextKey =
      !suspendRemoteSync && backendMode === "remote" && activeWorkspaceId && activeThreadId
        ? keyForThread(activeWorkspaceId, activeThreadId)
        : null;
    desiredSubscriptionKeyRef.current = nextKey;
    const previousKey = activeSubscriptionKeyRef.current;

    if (previousKey && previousKey !== nextKey) {
      activeSubscriptionKeyRef.current = null;
      void unsubscribeByKey(previousKey);
    }

    if (!nextKey) {
      reconcileDisconnectedState();
      return;
    }
    if (!isDocumentVisible()) {
      reconcileDisconnectedState();
      return;
    }
    const parsed = splitKey(nextKey);
    if (!parsed) {
      reconcileDisconnectedState();
      return;
    }
    if (
      activeSubscriptionKeyRef.current === nextKey &&
      connectionStateRef.current !== "disconnected" &&
      activeWorkspaceConnected
    ) {
      return;
    }
    void reconnectLive(parsed.workspaceId, parsed.threadId, {
      runResume: !activeThreadHasLocalSnapshotRef.current,
      reason: "thread-switch",
    });
  }, [
    activeThreadId,
    activeWorkspaceConnected,
    activeWorkspaceId,
    backendMode,
    suspendRemoteSync,
    reconcileDisconnectedState,
    reconnectLive,
    unsubscribeByKey,
  ]);

  useEffect(() => {
    const unlisten = subscribeAppServerEvents((event) => {
      const method = getAppServerRawMethod(event);
      if (!method) {
        return;
      }
      const params = getAppServerParams(event);
      const activeWorkspaceEntry = activeWorkspaceRef.current;
      const activeWorkspaceId = activeWorkspaceEntry?.id ?? null;
      const selectedThreadId = activeThreadIdRef.current;
      if (suspendRemoteSyncRef.current || !activeWorkspaceId || !selectedThreadId) {
        return;
      }
      if (event.workspace_id !== activeWorkspaceId) {
        return;
      }

      if (method === "codex/connected" && isDocumentVisible()) {
        void reconnectLive(activeWorkspaceId, selectedThreadId, {
          runResume: false,
          reason: "connected-recovery",
        });
        return;
      }

      if (method === "thread/live_attached") {
        const threadId = extractThreadId(method, params);
        if (threadId === selectedThreadId) {
          activeSubscriptionKeyRef.current = keyForThread(activeWorkspaceId, threadId);
          clearSyncFailure(activeWorkspaceId, threadId);
          setState(connectionStateRef.current === "polling" ? "polling" : "live");
        }
        return;
      }

      if (method === "thread/live_detached") {
        const threadId = extractThreadId(method, params);
        if (threadId === selectedThreadId) {
          const threadKey = keyForThread(activeWorkspaceId, threadId);
          const ignoreDetachedUntil =
            ignoreDetachedEventsUntilRef.current.get(threadKey) ?? 0;
          if (ignoreDetachedUntil > 0 && ignoreDetachedUntil >= Date.now()) {
            ignoreDetachedEventsUntilRef.current.delete(threadKey);
            return;
          }
          if (ignoreDetachedUntil > 0) {
            ignoreDetachedEventsUntilRef.current.delete(threadKey);
          }
          activeSubscriptionKeyRef.current = null;
          bumpWorkspaceFreshnessBoundary(activeWorkspaceId);
          reportSyncFailure(activeWorkspaceId, threadId, {
            phase: "thread_live",
            message: "Lost live connection to the remote thread.",
          });
          if (isDocumentVisible() && isWindowFocused()) {
            void reconnectLive(activeWorkspaceId, selectedThreadId, {
              runResume: true,
              reason: "detached-recovery",
            });
          }
        }
        return;
      }

      if (method === "thread/live_heartbeat") {
        const threadId = extractThreadId(method, params);
        if (threadId === selectedThreadId) {
          clearSyncFailure(activeWorkspaceId, threadId);
          setState("live");
        }
        return;
      }

      if (!isThreadActivityMethod(method)) {
        return;
      }
      const threadId = extractThreadId(method, params);
      if (threadId !== selectedThreadId) {
        return;
      }
      clearSyncFailure(activeWorkspaceId, threadId);
      setState("live");
    });

    return () => {
      unlisten();
    };
  }, [
    bumpWorkspaceFreshnessBoundary,
    clearSyncFailure,
    reconnectLive,
    reconcileDisconnectedState,
    reportSyncFailure,
    setState,
  ]);

  useEffect(() => {
    let unlistenWindowFocus: (() => void) | null = null;
    let unlistenWindowBlur: (() => void) | null = null;
    let didCleanup = false;
    const ignoreDetachedEventsUntil = ignoreDetachedEventsUntilRef.current;

    const reconnectActiveThread = () => {
      const workspaceId = activeWorkspaceRef.current?.id ?? null;
      const threadId = activeThreadIdRef.current;
      if (suspendRemoteSyncRef.current || !workspaceId || !threadId) {
        return;
      }
      void reconnectLive(workspaceId, threadId, {
        runResume: true,
        reason: "focus",
      });
    };

    const handleFocus = () => {
      if (!isDocumentVisible()) {
        return;
      }
      reconnectActiveThread();
    };

    const handleBlur = () => {
      reconnectSequenceRef.current += 1;
      desiredSubscriptionKeyRef.current = null;
      if (backendModeRef.current === "remote") {
        bumpWorkspaceFreshnessBoundary(activeWorkspaceRef.current?.id ?? null);
      }
      const currentKey = activeSubscriptionKeyRef.current;
      if (!currentKey) {
        return;
      }
      activeSubscriptionKeyRef.current = null;
      void unsubscribeByKey(currentKey);
      reconcileDisconnectedState();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        reconnectActiveThread();
        return;
      }
      handleBlur();
    };

    window.addEventListener("focus", handleFocus);
    window.addEventListener("blur", handleBlur);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    try {
      const windowHandle = getCurrentWindow();
      windowHandle
        .listen("tauri://focus", handleFocus)
        .then((unlisten) => {
          if (didCleanup) {
            unlisten();
            return;
          }
          unlistenWindowFocus = unlisten;
        })
        .catch(() => {
          // Ignore non-Tauri environments.
        });
      windowHandle
        .listen("tauri://blur", handleBlur)
        .then((unlisten) => {
          if (didCleanup) {
            unlisten();
            return;
          }
          unlistenWindowBlur = unlisten;
        })
        .catch(() => {
          // Ignore non-Tauri environments.
        });
    } catch {
      // Ignore non-Tauri environments.
    }

    return () => {
      didCleanup = true;
      if (unlistenWindowFocus) {
        unlistenWindowFocus();
      }
      if (unlistenWindowBlur) {
        unlistenWindowBlur();
      }
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("blur", handleBlur);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      desiredSubscriptionKeyRef.current = null;
      ignoreDetachedEventsUntil.clear();
      const currentKey = activeSubscriptionKeyRef.current;
      if (currentKey) {
        activeSubscriptionKeyRef.current = null;
        void unsubscribeByKey(currentKey);
      }
    };
  }, [
    bumpWorkspaceFreshnessBoundary,
    reconnectLive,
    reconcileDisconnectedState,
    unsubscribeByKey,
  ]);

  return {
    connectionState,
    lastFailure,
    clearSyncFailure,
    reportSyncFailure,
    markThreadFreshAtCurrentBoundary,
    reconnectLive,
  };
}
