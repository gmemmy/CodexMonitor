import { useCallback, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type {
  AppSettings,
  DesktopMobileHandoffPayloadV1,
  ThreadRefreshResult,
  ThreadSummary,
  WorkspaceInfo,
} from "@/types";
import { listWorkspaces, updateAppSettings } from "@services/tauri";
import { formatRemoteSyncErrorMessage } from "@app/utils/remoteSync";

type ReplaceWorkspaceState = (
  workspaces: WorkspaceInfo[],
  options?: {
    activeWorkspaceId?: string | null;
    allowMissingActiveWorkspace?: boolean;
  },
) => void;

type UseRemoteBackendHandoffOptions = {
  appSettings: AppSettings;
  setAppSettings: Dispatch<SetStateAction<AppSettings>>;
  activeWorkspace: WorkspaceInfo | null;
  activeThreadId: string | null;
  activeThreadTitle?: string | null;
  connectWorkspace: (workspace: WorkspaceInfo) => Promise<void>;
  setActiveThreadId: (threadId: string | null, workspaceId?: string) => void;
  replaceWorkspaceState: ReplaceWorkspaceState;
  resetThreadState: () => void;
  listThreadsForWorkspace: (
    workspace: WorkspaceInfo,
    options?: { preserveState?: boolean },
  ) => Promise<ThreadSummary[] | null>;
  refreshThread: (
    workspaceId: string,
    threadId: string,
  ) => Promise<ThreadRefreshResult>;
  refreshAccountInfo?: (workspaceId: string) => Promise<void> | void;
  refreshAccountRateLimits?: (workspaceId: string) => Promise<void> | void;
};

type RemoteWorkspaceSnapshot = Pick<WorkspaceInfo, "id" | "name" | "path"> | null;
type RemoteBackendTarget = AppSettings["remoteBackends"][number];
type HandoffApplyResult = {
  ok: boolean;
  message: string;
};

function normalizeRemoteToken(token: string | null | undefined): string | null {
  const trimmed = token?.trim();
  return trimmed ? trimmed : null;
}

function buildFallbackRemoteBackend(settings: AppSettings): RemoteBackendTarget {
  return {
    id: settings.activeRemoteBackendId ?? "remote-default",
    name: "Primary remote",
    provider: "tcp",
    host: settings.remoteBackendHost,
    token: normalizeRemoteToken(settings.remoteBackendToken),
    lastConnectedAtMs: null,
  };
}

function getConfiguredRemoteBackends(settings: AppSettings): RemoteBackendTarget[] {
  return settings.remoteBackends.length > 0
    ? settings.remoteBackends.map((entry) => ({
        ...entry,
        provider: "tcp",
        token: normalizeRemoteToken(entry.token),
      }))
    : [buildFallbackRemoteBackend(settings)];
}

function getActiveRemoteBackend(settings: AppSettings): RemoteBackendTarget | null {
  const configured = getConfiguredRemoteBackends(settings);
  if (configured.length === 0) {
    return null;
  }
  return (
    configured.find((entry) => entry.id === settings.activeRemoteBackendId) ??
    configured[0]
  );
}

function buildSettingsFromRemoteBackends(
  settings: AppSettings,
  remoteBackends: RemoteBackendTarget[],
  activeRemoteId: string,
): AppSettings {
  const activeRemote =
    remoteBackends.find((entry) => entry.id === activeRemoteId) ?? remoteBackends[0];
  return {
    ...settings,
    backendMode: "remote",
    remoteBackendProvider: "tcp",
    remoteBackends,
    activeRemoteBackendId: activeRemote.id,
    remoteBackendHost: activeRemote.host,
    remoteBackendToken: normalizeRemoteToken(activeRemote.token),
  };
}

function markRemoteBackendConnected(
  settings: AppSettings,
  remoteId: string,
  connectedAtMs: number,
): AppSettings {
  const remoteBackends = getConfiguredRemoteBackends(settings);
  return {
    ...settings,
    remoteBackends: remoteBackends.map((entry) =>
      entry.id === remoteId ? { ...entry, lastConnectedAtMs: connectedAtMs } : entry,
    ),
  };
}

function selectBestWorkspace(
  workspaces: WorkspaceInfo[],
  previousWorkspace: RemoteWorkspaceSnapshot,
): WorkspaceInfo | null {
  if (workspaces.length === 0) {
    return null;
  }
  if (!previousWorkspace) {
    return workspaces.find((workspace) => workspace.connected) ?? workspaces[0];
  }
  return (
    workspaces.find((workspace) => workspace.id === previousWorkspace.id) ??
    workspaces.find((workspace) => workspace.path === previousWorkspace.path) ??
    workspaces.find((workspace) => workspace.name === previousWorkspace.name) ??
    workspaces.find((workspace) => workspace.connected) ??
    workspaces[0]
  );
}

function resolveRequestedWorkspace(
  workspaces: WorkspaceInfo[],
  requestedWorkspace: RemoteWorkspaceSnapshot,
): WorkspaceInfo | null {
  if (!requestedWorkspace) {
    return null;
  }
  return (
    workspaces.find((workspace) => workspace.id === requestedWorkspace.id) ??
    workspaces.find((workspace) => workspace.path === requestedWorkspace.path) ??
    workspaces.find((workspace) => workspace.name === requestedWorkspace.name) ??
    null
  );
}

function formatWorkspaceReachabilityMessage(
  remoteName: string,
  workspaceCount: number,
): string {
  const workspaceWord = workspaceCount === 1 ? "workspace" : "workspaces";
  return `Switched to "${remoteName}". ${workspaceCount} ${workspaceWord} reachable on the remote backend.`;
}

function formatDesktopMobileHandoffSuccessMessage(
  remoteName: string,
  workspaceName: string,
  threadTitle: string | null,
): string {
  if (threadTitle) {
    return `Connected to "${remoteName}" and resumed "${threadTitle}" in "${workspaceName}".`;
  }
  return `Connected to "${remoteName}" and restored "${workspaceName}".`;
}

function buildWorkspaceSnapshot(workspace: WorkspaceInfo | null): RemoteWorkspaceSnapshot {
  if (!workspace) {
    return null;
  }
  return {
    id: workspace.id,
    name: workspace.name,
    path: workspace.path,
  };
}

function buildRemoteBackendId() {
  return `remote-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildRemoteDisplayName(
  name: string | null | undefined,
  host: string,
  existingCount: number,
) {
  const trimmedName = name?.trim();
  if (trimmedName) {
    return trimmedName;
  }
  const trimmedHost = host.trim();
  if (trimmedHost) {
    return trimmedHost;
  }
  return `Remote ${existingCount + 1}`;
}

function resolveSavedRemoteFromPayload(
  settings: AppSettings,
  payloadRemote: DesktopMobileHandoffPayloadV1["remote"],
): { remoteBackends: RemoteBackendTarget[]; selectedRemote: RemoteBackendTarget } {
  const existingBackends = getConfiguredRemoteBackends(settings);
  const normalizedHost = payloadRemote.host.trim();
  const normalizedToken = normalizeRemoteToken(payloadRemote.token);
  const matchingRemote = existingBackends.find(
    (entry) =>
      entry.host.trim() === normalizedHost &&
      normalizeRemoteToken(entry.token) === normalizedToken,
  );

  if (matchingRemote) {
    const updatedRemote: RemoteBackendTarget = {
      ...matchingRemote,
      name: buildRemoteDisplayName(
        payloadRemote.name,
        normalizedHost,
        existingBackends.length,
      ),
      provider: "tcp",
      host: normalizedHost,
      token: normalizedToken,
    };
    return {
      remoteBackends: existingBackends.map((entry) =>
        entry.id === matchingRemote.id ? updatedRemote : entry,
      ),
      selectedRemote: updatedRemote,
    };
  }

  const selectedRemote: RemoteBackendTarget = {
    id: buildRemoteBackendId(),
    name: buildRemoteDisplayName(payloadRemote.name, normalizedHost, existingBackends.length),
    provider: "tcp",
    host: normalizedHost,
    token: normalizedToken,
    lastConnectedAtMs: null,
  };
  return {
    remoteBackends: [...existingBackends, selectedRemote],
    selectedRemote,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getRequiredString(
  value: unknown,
  label: string,
): string {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  throw new Error(`${label} is required.`);
}

function getOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function parseDesktopMobileHandoffPayload(
  payloadInput: string | DesktopMobileHandoffPayloadV1,
): DesktopMobileHandoffPayloadV1 {
  const parsed =
    typeof payloadInput === "string"
      ? (() => {
          try {
            return JSON.parse(payloadInput) as unknown;
          } catch {
            throw new Error("Desktop handoff payload is not valid JSON.");
          }
        })()
      : payloadInput;

  if (!isRecord(parsed)) {
    throw new Error("Desktop handoff payload must be an object.");
  }
  if (parsed.version !== 1) {
    throw new Error("Desktop handoff payload version is not supported.");
  }
  if (
    typeof parsed.issuedAtMs !== "number" ||
    !Number.isFinite(parsed.issuedAtMs)
  ) {
    throw new Error("Desktop handoff payload issuedAtMs is required.");
  }
  if (!isRecord(parsed.remote)) {
    throw new Error("Desktop handoff payload remote target is required.");
  }
  if (!isRecord(parsed.workspace)) {
    throw new Error("Desktop handoff payload workspace target is required.");
  }
  const remote: DesktopMobileHandoffPayloadV1["remote"] = {
    provider: "tcp",
    host: getRequiredString(parsed.remote.host, "Desktop handoff remote host"),
    token: getOptionalString(parsed.remote.token),
    name: getOptionalString(parsed.remote.name),
  };
  const workspace: DesktopMobileHandoffPayloadV1["workspace"] = {
    id: getRequiredString(parsed.workspace.id, "Desktop handoff workspace id"),
    path: getRequiredString(parsed.workspace.path, "Desktop handoff workspace path"),
    name: getRequiredString(parsed.workspace.name, "Desktop handoff workspace name"),
  };
  let thread: DesktopMobileHandoffPayloadV1["thread"] | undefined;
  if (typeof parsed.thread !== "undefined") {
    if (!isRecord(parsed.thread)) {
      throw new Error("Desktop handoff thread target is invalid.");
    }
    thread = {
      id: getRequiredString(parsed.thread.id, "Desktop handoff thread id"),
      title: getOptionalString(parsed.thread.title),
    };
  }

  return {
    version: 1,
    issuedAtMs: parsed.issuedAtMs,
    remote,
    workspace,
    ...(thread ? { thread } : {}),
  };
}

export function useRemoteBackendHandoff({
  appSettings,
  setAppSettings,
  activeWorkspace,
  activeThreadId,
  activeThreadTitle,
  connectWorkspace,
  setActiveThreadId,
  replaceWorkspaceState,
  resetThreadState,
  listThreadsForWorkspace,
  refreshThread,
  refreshAccountInfo,
  refreshAccountRateLimits,
}: UseRemoteBackendHandoffOptions) {
  const [handoffRemoteId, setHandoffRemoteId] = useState<string | null>(null);

  const handoffRemoteBackend = useCallback(
    async (remoteId: string) => {
      if (handoffRemoteId) {
        throw new Error("A remote handoff is already in progress.");
      }

      const selectedRemote = getConfiguredRemoteBackends(appSettings).find(
        (entry) => entry.id === remoteId,
      );
      if (!selectedRemote) {
        throw new Error("Saved remote not found.");
      }
      if (selectedRemote.id === appSettings.activeRemoteBackendId) {
        return formatWorkspaceReachabilityMessage(selectedRemote.name, 0);
      }

      const previousSettings = appSettings;
      const previousWorkspaceSnapshot = buildWorkspaceSnapshot(activeWorkspace);
      const candidateSettings = buildSettingsFromRemoteBackends(
        previousSettings,
        getConfiguredRemoteBackends(previousSettings),
        selectedRemote.id,
      );

      setHandoffRemoteId(remoteId);

      try {
        await updateAppSettings(candidateSettings);
        const validatedWorkspaces = await listWorkspaces();

        let nextWorkspaces = validatedWorkspaces;
        let targetWorkspace = selectBestWorkspace(validatedWorkspaces, previousWorkspaceSnapshot);

        if (targetWorkspace && !targetWorkspace.connected) {
          try {
            await connectWorkspace(targetWorkspace);
            nextWorkspaces = validatedWorkspaces.map((workspace) =>
              workspace.id === targetWorkspace?.id
                ? { ...workspace, connected: true }
                : workspace,
            );
            targetWorkspace =
              nextWorkspaces.find((workspace) => workspace.id === targetWorkspace?.id) ??
              targetWorkspace;
          } catch {
            targetWorkspace =
              nextWorkspaces.find((workspace) => workspace.connected) ?? targetWorkspace;
          }
        }

        let appliedSettings = candidateSettings;
        try {
          const connectedSettings = markRemoteBackendConnected(
            candidateSettings,
            selectedRemote.id,
            Date.now(),
          );
          await updateAppSettings(connectedSettings);
          appliedSettings = connectedSettings;
        } catch {
          // Keep the validated switch even if timestamp persistence fails.
        }

        setAppSettings(appliedSettings);
        resetThreadState();
        replaceWorkspaceState(nextWorkspaces, {
          activeWorkspaceId: targetWorkspace?.id ?? null,
        });

        if (targetWorkspace?.connected) {
          await listThreadsForWorkspace(targetWorkspace);
          await Promise.allSettled([
            Promise.resolve(refreshAccountInfo?.(targetWorkspace.id)),
            Promise.resolve(refreshAccountRateLimits?.(targetWorkspace.id)),
          ]);
        }

        return formatWorkspaceReachabilityMessage(selectedRemote.name, nextWorkspaces.length);
      } catch (error) {
        try {
          await updateAppSettings(previousSettings);
        } catch {
          // Keep the original handoff failure surfaced below.
        }
        throw new Error(
          formatRemoteSyncErrorMessage(
            error,
            `Unable to reach "${selectedRemote.name}".`,
          ),
        );
      } finally {
        setHandoffRemoteId(null);
      }
    },
    [
      activeWorkspace,
      appSettings,
      connectWorkspace,
      handoffRemoteId,
      listThreadsForWorkspace,
      refreshThread,
      replaceWorkspaceState,
      resetThreadState,
      refreshAccountInfo,
      refreshAccountRateLimits,
      setActiveThreadId,
      setAppSettings,
    ],
  );

  const captureDesktopMobileHandoffPayload = useCallback((): DesktopMobileHandoffPayloadV1 => {
    if (appSettings.backendMode !== "remote") {
      throw new Error("Switch to remote mode before creating a handoff payload.");
    }
    const activeRemote = getActiveRemoteBackend(appSettings);
    if (!activeRemote?.host.trim()) {
      throw new Error("Remote backend host is required to create a handoff payload.");
    }
    if (!activeWorkspace) {
      throw new Error("Select a workspace before creating a handoff payload.");
    }

    return {
      version: 1,
      issuedAtMs: Date.now(),
      remote: {
        provider: "tcp",
        host: activeRemote.host.trim(),
        token: normalizeRemoteToken(activeRemote.token),
        name: activeRemote.name?.trim() || null,
      },
      workspace: {
        id: activeWorkspace.id,
        path: activeWorkspace.path,
        name: activeWorkspace.name,
      },
      ...(activeThreadId
        ? {
            thread: {
              id: activeThreadId,
              title:
                typeof activeThreadTitle === "string" && activeThreadTitle.trim().length > 0
                  ? activeThreadTitle.trim()
                  : null,
            },
          }
        : {}),
    };
  }, [
    activeThreadId,
    activeThreadTitle,
    activeWorkspace,
    appSettings,
  ]);

  const applyDesktopMobileHandoffPayload = useCallback(
    async (
      payloadInput: string | DesktopMobileHandoffPayloadV1,
    ): Promise<HandoffApplyResult> => {
      if (handoffRemoteId) {
        return {
          ok: false,
          message: "A remote handoff is already in progress.",
        };
      }

      let payload: DesktopMobileHandoffPayloadV1;
      try {
        payload = parseDesktopMobileHandoffPayload(payloadInput);
      } catch (error) {
        return {
          ok: false,
          message: formatRemoteSyncErrorMessage(
            error,
            "Desktop handoff payload is invalid.",
          ),
        };
      }

      const previousSettings = appSettings;
      const { remoteBackends, selectedRemote } = resolveSavedRemoteFromPayload(
        previousSettings,
        payload.remote,
      );
      const candidateSettings = buildSettingsFromRemoteBackends(
        previousSettings,
        remoteBackends,
        selectedRemote.id,
      );

      setHandoffRemoteId(selectedRemote.id);

      try {
        await updateAppSettings(candidateSettings);
        const validatedWorkspaces = await listWorkspaces();

        let nextWorkspaces = validatedWorkspaces;
        let targetWorkspace = resolveRequestedWorkspace(validatedWorkspaces, payload.workspace);
        let workspaceConnectError: unknown = null;

        if (targetWorkspace && !targetWorkspace.connected) {
          try {
            await connectWorkspace(targetWorkspace);
            nextWorkspaces = validatedWorkspaces.map((workspace) =>
              workspace.id === targetWorkspace?.id
                ? { ...workspace, connected: true }
                : workspace,
            );
            targetWorkspace =
              nextWorkspaces.find((workspace) => workspace.id === targetWorkspace?.id) ??
              targetWorkspace;
          } catch (error) {
            workspaceConnectError = error;
          }
        }

        let appliedSettings = candidateSettings;
        try {
          const connectedSettings = markRemoteBackendConnected(
            candidateSettings,
            selectedRemote.id,
            Date.now(),
          );
          await updateAppSettings(connectedSettings);
          appliedSettings = connectedSettings;
        } catch {
          // Keep the validated handoff even if recency persistence fails.
        }

        setAppSettings(appliedSettings);
        resetThreadState();

        if (!targetWorkspace) {
          replaceWorkspaceState(nextWorkspaces, {
            activeWorkspaceId: null,
            allowMissingActiveWorkspace: true,
          });
          return {
            ok: false,
            message: "Workspace not found on the remote backend.",
          };
        }

        replaceWorkspaceState(nextWorkspaces, {
          activeWorkspaceId: targetWorkspace.id,
        });

        if (workspaceConnectError) {
          return {
            ok: false,
            message: formatRemoteSyncErrorMessage(
              workspaceConnectError,
              `Unable to connect to "${targetWorkspace.name}".`,
            ),
          };
        }

        const threadSummaries = await listThreadsForWorkspace(targetWorkspace);
        await Promise.allSettled([
          Promise.resolve(refreshAccountInfo?.(targetWorkspace.id)),
          Promise.resolve(refreshAccountRateLimits?.(targetWorkspace.id)),
        ]);

        if (!payload.thread) {
          return {
            ok: true,
            message: formatDesktopMobileHandoffSuccessMessage(
              selectedRemote.name,
              targetWorkspace.name,
              null,
            ),
          };
        }

        const refreshResult = await refreshThread(
          targetWorkspace.id,
          payload.thread.id,
        );
        if (!refreshResult.ok) {
          const threadExists = Boolean(
            threadSummaries?.some((thread) => thread.id === payload.thread?.id),
          );
          return {
            ok: false,
            message: threadExists
              ? refreshResult.errorMessage ?? "Unable to refresh the remote thread state."
              : "Thread not found on the remote workspace.",
          };
        }

        setActiveThreadId(payload.thread.id, targetWorkspace.id);
        return {
          ok: true,
          message: formatDesktopMobileHandoffSuccessMessage(
            selectedRemote.name,
            targetWorkspace.name,
            payload.thread.title ?? null,
          ),
        };
      } catch (error) {
        try {
          await updateAppSettings(previousSettings);
        } catch {
          // Keep the original handoff failure surfaced below.
        }
        return {
          ok: false,
          message: formatRemoteSyncErrorMessage(
            error,
            `Unable to reach "${selectedRemote.name}".`,
          ),
        };
      } finally {
        setHandoffRemoteId(null);
      }
    },
    [
      appSettings,
      connectWorkspace,
      handoffRemoteId,
      listThreadsForWorkspace,
      refreshAccountInfo,
      refreshAccountRateLimits,
      refreshThread,
      replaceWorkspaceState,
      resetThreadState,
      setActiveThreadId,
      setAppSettings,
    ],
  );

  return {
    applyDesktopMobileHandoffPayload,
    captureDesktopMobileHandoffPayload,
    handoffRemoteBackend,
    handoffRemoteId,
    handoffInProgress: handoffRemoteId !== null,
  };
}
