import { useCallback, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { AppSettings, WorkspaceInfo } from "@/types";
import { listWorkspaces, updateAppSettings } from "@services/tauri";
import { formatRemoteSyncErrorMessage } from "@app/utils/remoteSync";

type ReplaceWorkspaceState = (
  workspaces: WorkspaceInfo[],
  options?: { activeWorkspaceId?: string | null },
) => void;

type UseRemoteBackendHandoffOptions = {
  appSettings: AppSettings;
  setAppSettings: Dispatch<SetStateAction<AppSettings>>;
  activeWorkspace: WorkspaceInfo | null;
  connectWorkspace: (workspace: WorkspaceInfo) => Promise<void>;
  replaceWorkspaceState: ReplaceWorkspaceState;
  resetThreadState: () => void;
  listThreadsForWorkspace: (
    workspace: WorkspaceInfo,
    options?: { preserveState?: boolean },
  ) => Promise<void>;
};

type RemoteWorkspaceSnapshot = Pick<WorkspaceInfo, "id" | "name" | "path"> | null;

function markRemoteBackendConnected(
  settings: AppSettings,
  remoteId: string,
  connectedAtMs: number,
): AppSettings {
  return {
    ...settings,
    remoteBackends: settings.remoteBackends.map((entry) =>
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

function formatWorkspaceReachabilityMessage(
  remoteName: string,
  workspaceCount: number,
): string {
  const workspaceWord = workspaceCount === 1 ? "workspace" : "workspaces";
  return `Switched to "${remoteName}". ${workspaceCount} ${workspaceWord} reachable on the remote backend.`;
}

export function useRemoteBackendHandoff({
  appSettings,
  setAppSettings,
  activeWorkspace,
  connectWorkspace,
  replaceWorkspaceState,
  resetThreadState,
  listThreadsForWorkspace,
}: UseRemoteBackendHandoffOptions) {
  const [handoffRemoteId, setHandoffRemoteId] = useState<string | null>(null);

  const handoffRemoteBackend = useCallback(
    async (remoteId: string) => {
      if (handoffRemoteId) {
        throw new Error("A remote handoff is already in progress.");
      }

      const selectedRemote = appSettings.remoteBackends.find((entry) => entry.id === remoteId);
      if (!selectedRemote) {
        throw new Error("Saved remote not found.");
      }
      if (selectedRemote.id === appSettings.activeRemoteBackendId) {
        return formatWorkspaceReachabilityMessage(selectedRemote.name, 0);
      }

      const previousSettings = appSettings;
      const previousWorkspaceSnapshot = activeWorkspace
        ? {
            id: activeWorkspace.id,
            name: activeWorkspace.name,
            path: activeWorkspace.path,
          }
        : null;
      const candidateSettings: AppSettings = {
        ...previousSettings,
        backendMode: "remote",
        remoteBackendProvider: "tcp",
        activeRemoteBackendId: selectedRemote.id,
        remoteBackendHost: selectedRemote.host,
        remoteBackendToken: selectedRemote.token,
      };

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
      replaceWorkspaceState,
      resetThreadState,
      setAppSettings,
    ],
  );

  return {
    handoffRemoteBackend,
    handoffRemoteId,
    handoffInProgress: handoffRemoteId !== null,
  };
}
