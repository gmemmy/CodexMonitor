import type {
  RemotePresenceState,
  RemoteSyncFailure,
  RemoteSyncFailurePhase,
  RemoteThreadConnectionState,
  RemoteWorkspaceSyncState,
  ThreadRefreshResult,
  WorkspaceInfo,
} from "@/types";

export function formatRemoteSyncErrorMessage(
  error: unknown,
  fallback: string,
): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  if (typeof error === "string" && error.trim().length > 0) {
    return error.trim();
  }
  return fallback;
}

export function buildRemoteSyncFailure(
  phase: RemoteSyncFailurePhase,
  message: string,
  workspaceId?: string | null,
  threadId?: string | null,
): RemoteSyncFailure {
  return {
    phase,
    message,
    at: Date.now(),
    workspaceId: workspaceId ?? null,
    threadId: threadId ?? null,
  };
}

export function selectLatestRemoteSyncFailure(
  ...failures: Array<RemoteSyncFailure | null | undefined>
): RemoteSyncFailure | null {
  let latestFailure: RemoteSyncFailure | null = null;
  for (const failure of failures) {
    if (!failure) {
      continue;
    }
    if (!latestFailure || failure.at > latestFailure.at) {
      latestFailure = failure;
    }
  }
  return latestFailure;
}

function isWorkspaceFailurePhase(
  phase: RemoteSyncFailurePhase | null | undefined,
): boolean {
  return phase === "workspace_refresh" || phase === "workspace_connect";
}

export type ResolvedRemotePresence = {
  state: RemotePresenceState;
  label: string;
  title: string;
  detailLabel: string | null;
};

type ResolveRemotePresenceOptions = {
  activeWorkspaceConnected: boolean;
  activeThreadId?: string | null;
  activeThreadIsProcessing?: boolean;
  workspaceSyncState: RemoteWorkspaceSyncState;
  threadConnectionState: RemoteThreadConnectionState;
  reconnecting?: boolean;
};

function formatRemotePresenceLabel(state: RemotePresenceState): string {
  switch (state) {
    case "online":
      return "Online";
    case "running":
      return "Running";
    case "stale":
      return "Stale";
    case "offline":
      return "Offline";
  }
}

export function resolveRemotePresence({
  activeWorkspaceConnected,
  activeThreadId = null,
  activeThreadIsProcessing = false,
  workspaceSyncState,
  threadConnectionState,
  reconnecting = false,
}: ResolveRemotePresenceOptions): ResolvedRemotePresence {
  const hasActiveSession = Boolean(activeThreadId);
  const isOffline =
    !activeWorkspaceConnected || threadConnectionState === "disconnected";
  const isStale =
    workspaceSyncState === "stale" || threadConnectionState === "stale";
  const state: RemotePresenceState = isOffline
    ? "offline"
    : isStale
      ? "stale"
      : activeThreadIsProcessing
        ? "running"
        : "online";
  const isRecovering =
    state !== "stale" &&
    state !== "offline" &&
    (reconnecting || (hasActiveSession && threadConnectionState === "polling"));

  let title: string;
  if (state === "offline") {
    title = "Remote backend offline";
  } else if (state === "stale") {
    title = hasActiveSession
      ? "Remote session state is stale"
      : "Remote backend state is stale";
  } else if (state === "running") {
    title = isRecovering
      ? "Remote session running, reconnecting now"
      : "Remote session running";
  } else {
    title = hasActiveSession
      ? isRecovering
        ? "Remote session online, reconnecting now"
        : "Remote session online"
      : "Remote backend online";
  }

  return {
    state,
    label: formatRemotePresenceLabel(state),
    title,
    detailLabel: isRecovering ? "Reconnecting" : null,
  };
}

type ResolveRemoteSyncBannerOptions = {
  presenceState: Extract<RemotePresenceState, "stale" | "offline">;
  activeThreadId?: string | null;
  failure?: RemoteSyncFailure | null;
};

export function resolveRemoteSyncBannerContent({
  presenceState,
  activeThreadId = null,
  failure = null,
}: ResolveRemoteSyncBannerOptions): {
  state: "stale" | "offline";
  title: string;
  message: string;
} {
  const isOffline = presenceState === "offline";
  const showWorkspaceTitle =
    isWorkspaceFailurePhase(failure?.phase) || (!activeThreadId && !isOffline);
  const title = isOffline
    ? "Remote backend is offline"
    : showWorkspaceTitle
      ? "Remote backend state is stale"
      : "Remote session state is stale";
  const trimmedFailureMessage = failure?.message?.trim() ?? "";
  const message = trimmedFailureMessage
    ? `Last sync failed: ${trimmedFailureMessage}`
    : isOffline
      ? "Reconnect to restore live data from the remote backend."
      : "The latest remote sync failed, so remote state may be stale.";

  return {
    state: isOffline ? "offline" : "stale",
    title,
    message,
  };
}

export function applyWorkspaceConnectionOverride(
  workspace: WorkspaceInfo,
  connected: boolean,
): WorkspaceInfo {
  if (workspace.connected === connected) {
    return workspace;
  }
  return {
    ...workspace,
    connected,
  };
}

export async function ensureConnectedWorkspace(
  workspace: WorkspaceInfo,
  connectWorkspace?: (workspace: WorkspaceInfo) => Promise<unknown> | unknown,
): Promise<WorkspaceInfo> {
  if (workspace.connected || !connectWorkspace) {
    return workspace;
  }
  await Promise.resolve(connectWorkspace(workspace));
  return applyWorkspaceConnectionOverride(workspace, true);
}

export function normalizeThreadRefreshResult(result: unknown): ThreadRefreshResult {
  if (typeof result === "undefined") {
    return {
      ok: true,
      threadId: null,
      errorMessage: null,
    };
  }

  if (result && typeof result === "object" && !Array.isArray(result)) {
    const candidate = result as Partial<ThreadRefreshResult>;
    if (typeof candidate.ok === "boolean") {
      return {
        ok: candidate.ok,
        threadId:
          typeof candidate.threadId === "string" && candidate.threadId.length > 0
            ? candidate.threadId
            : null,
        errorMessage:
          typeof candidate.errorMessage === "string" && candidate.errorMessage.length > 0
            ? candidate.errorMessage
            : null,
      };
    }
  }

  if (typeof result === "string" && result.length > 0) {
    return {
      ok: true,
      threadId: result,
      errorMessage: null,
    };
  }

  return {
    ok: false,
    threadId: null,
    errorMessage: null,
  };
}
