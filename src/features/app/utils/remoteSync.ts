import type {
  RemoteSyncFailure,
  RemoteSyncFailurePhase,
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
