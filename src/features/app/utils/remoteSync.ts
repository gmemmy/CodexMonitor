import type {
  RemotePresenceState,
  RemoteSyncFailure,
  RemoteSyncFailurePhase,
  RemoteThreadConnectionState,
  RemoteWorkspaceSyncState,
  ThreadRefreshResult,
  WorkspaceInfo,
} from "@/types";
import { formatRelativeTime } from "@/utils/time";

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

export type RemoteSyncSurface = "workspace" | "session";

export type ResolvedRemotePresence = {
  state: RemotePresenceState;
  scope: RemoteSyncSurface;
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
  failure?: RemoteSyncFailure | null;
  workspaceLastSuccessAt?: number | null;
  sessionLastSuccessAt?: number | null;
};

function formatRemotePresenceLabel(state: RemotePresenceState): string {
  switch (state) {
    case "live":
      return "Live";
    case "polling":
      return "Polling";
    case "stale":
      return "Stale";
    case "disconnected":
      return "Disconnected";
  }
}

function resolveRemoteSyncSurface({
  activeWorkspaceConnected,
  activeThreadId,
  workspaceSyncState,
  threadConnectionState,
  failure,
}: {
  activeWorkspaceConnected: boolean;
  activeThreadId?: string | null;
  workspaceSyncState: RemoteWorkspaceSyncState;
  threadConnectionState: RemoteThreadConnectionState;
  failure?: RemoteSyncFailure | null;
}): RemoteSyncSurface {
  if (isWorkspaceFailurePhase(failure?.phase)) {
    return "workspace";
  }
  if (!activeThreadId || !activeWorkspaceConnected) {
    return "workspace";
  }
  if (workspaceSyncState === "stale" && threadConnectionState !== "stale") {
    return "workspace";
  }
  return "session";
}

function formatRemoteSurfaceTitle(
  surface: RemoteSyncSurface,
  state: RemotePresenceState,
): string {
  const subject = surface === "session" ? "Remote session" : "Remote workspace";
  return `${subject} ${state}`;
}

function formatRemoteFailureDetail(
  phase: RemoteSyncFailurePhase | null | undefined,
): string | null {
  switch (phase) {
    case "workspace_refresh":
      return "Workspace refresh failed";
    case "workspace_connect":
      return "Workspace reconnect failed";
    case "thread_refresh":
      return "Session refresh failed";
    case "thread_live":
      return "Live stream dropped";
    default:
      return null;
  }
}

function formatRemoteBannerFailureLead(
  phase: RemoteSyncFailurePhase | null | undefined,
): string {
  switch (phase) {
    case "workspace_refresh":
      return "Last workspace refresh failed";
    case "workspace_connect":
      return "Last workspace reconnect failed";
    case "thread_refresh":
      return "Last session refresh failed";
    case "thread_live":
      return "Last live update failed";
    default:
      return "Last sync failed";
  }
}

function formatLastConfirmedDetail(at: number | null | undefined): string | null {
  if (typeof at !== "number" || !Number.isFinite(at)) {
    return null;
  }
  return `Last confirmed ${formatRelativeTime(at)}`;
}

function formatLastConfirmedMessage(
  surface: RemoteSyncSurface,
  at: number | null | undefined,
): string | null {
  if (typeof at !== "number" || !Number.isFinite(at)) {
    return null;
  }
  return `Last confirmed ${surface} refresh ${formatRelativeTime(at)}.`;
}

export function resolveRemotePresence({
  activeWorkspaceConnected,
  activeThreadId = null,
  activeThreadIsProcessing = false,
  workspaceSyncState,
  threadConnectionState,
  reconnecting = false,
  failure = null,
  workspaceLastSuccessAt = null,
  sessionLastSuccessAt = null,
}: ResolveRemotePresenceOptions): ResolvedRemotePresence {
  const hasActiveSession = Boolean(activeThreadId);
  const surface = resolveRemoteSyncSurface({
    activeWorkspaceConnected,
    activeThreadId,
    workspaceSyncState,
    threadConnectionState,
    failure,
  });
  const lastSuccessAt =
    surface === "session" ? sessionLastSuccessAt : workspaceLastSuccessAt;
  const isDisconnected =
    !activeWorkspaceConnected ||
    (hasActiveSession && threadConnectionState === "disconnected");
  const isStale =
    workspaceSyncState === "stale" ||
    (hasActiveSession && threadConnectionState === "stale");
  const isPolling =
    reconnecting || (hasActiveSession && threadConnectionState === "polling");
  const state: RemotePresenceState = isDisconnected
    ? "disconnected"
    : isStale
      ? "stale"
      : isPolling
        ? "polling"
        : "live";
  const failureDetail = formatRemoteFailureDetail(failure?.phase);
  const lastConfirmedDetail =
    state === "stale" || state === "disconnected"
      ? formatLastConfirmedDetail(lastSuccessAt)
      : null;
  const detailLabel =
    state === "polling"
      ? "Refreshing cached data"
      : state === "stale"
        ? lastConfirmedDetail ?? failureDetail ?? "Cached data"
        : state === "disconnected"
          ? lastConfirmedDetail ?? failureDetail ?? "Reconnect required"
          : activeThreadIsProcessing
            ? "Run active"
            : null;

  return {
    state,
    scope: surface,
    label: formatRemotePresenceLabel(state),
    title: formatRemoteSurfaceTitle(surface, state),
    detailLabel,
  };
}

type ResolveRemoteSyncBannerOptions = {
  surface: RemoteSyncSurface;
  presenceState: Extract<RemotePresenceState, "stale" | "disconnected">;
  failure?: RemoteSyncFailure | null;
  workspaceLastSuccessAt?: number | null;
  sessionLastSuccessAt?: number | null;
};

export function resolveRemoteSyncBannerContent({
  surface,
  presenceState,
  failure = null,
  workspaceLastSuccessAt = null,
  sessionLastSuccessAt = null,
}: ResolveRemoteSyncBannerOptions): {
  state: "stale" | "disconnected";
  title: string;
  message: string;
} {
  const state = presenceState === "disconnected" ? "disconnected" : "stale";
  const title = formatRemoteSurfaceTitle(surface, state);
  const subject = surface === "session" ? "session data" : "workspace data";
  const lastConfirmedMessage = formatLastConfirmedMessage(
    surface,
    surface === "session" ? sessionLastSuccessAt : workspaceLastSuccessAt,
  );
  const cachedDataMessage =
    state === "disconnected"
      ? `Showing cached remote ${subject} until reconnect succeeds.`
      : `Showing cached remote ${subject} until the next successful refresh.`;
  const trimmedFailureMessage = failure?.message?.trim() ?? "";
  const messageParts = [cachedDataMessage];
  if (trimmedFailureMessage) {
    messageParts.push(
      `${formatRemoteBannerFailureLead(failure?.phase)}: ${trimmedFailureMessage}`,
    );
  }
  if (lastConfirmedMessage) {
    messageParts.push(lastConfirmedMessage);
  }

  return {
    state,
    title,
    message: messageParts.join(" "),
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
