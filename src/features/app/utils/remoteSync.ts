import type {
  RemoteSyncFailure,
  RemoteSyncFailurePhase,
  RemoteThreadConnectionState,
  ThreadRefreshResult,
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

function isWorkspaceFailurePhase(
  phase: RemoteSyncFailurePhase | null | undefined,
): boolean {
  return phase === "workspace_refresh" || phase === "workspace_connect";
}

type ResolveRemoteSyncBannerOptions = {
  connectionState: RemoteThreadConnectionState;
  activeThreadId?: string | null;
  failure?: RemoteSyncFailure | null;
};

export function resolveRemoteSyncBannerContent({
  connectionState,
  activeThreadId = null,
  failure = null,
}: ResolveRemoteSyncBannerOptions): {
  state: "stale" | "disconnected";
  title: string;
  message: string;
} {
  const isDisconnected = connectionState === "disconnected";
  const showWorkspaceTitle =
    isWorkspaceFailurePhase(failure?.phase) || (!activeThreadId && !isDisconnected);
  const title = isDisconnected
    ? "Remote backend disconnected"
    : showWorkspaceTitle
      ? "Remote workspace data is stale"
      : "Remote thread data is stale";
  const trimmedFailureMessage = failure?.message?.trim() ?? "";
  const message = trimmedFailureMessage
    ? `Last sync failed: ${trimmedFailureMessage}`
    : isDisconnected
      ? "Reconnect to restore live data from the remote backend."
      : "The latest remote sync failed, so this view may be stale.";

  return {
    state: isDisconnected ? "disconnected" : "stale",
    title,
    message,
  };
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
