import { useWindowDrag } from "@/features/layout/hooks/useWindowDrag";
import {
  REMOTE_WORKSPACE_REFRESH_INTERVAL_MS,
  useWorkspaceRefreshOnFocus,
} from "@/features/workspaces/hooks/useWorkspaceRefreshOnFocus";
import { useWorkspaceRestore } from "@/features/workspaces/hooks/useWorkspaceRestore";
import { useTabActivationGuard } from "@app/hooks/useTabActivationGuard";
import {
  useRemoteThreadRefreshOnFocus,
} from "@app/hooks/useRemoteThreadRefreshOnFocus";
import type { RemoteThreadConnectionState, WorkspaceInfo } from "@/types";

type UseMainAppWorkspaceLifecycleArgs = {
  activeTab: "home" | "projects" | "codex" | "git" | "log";
  isTablet: boolean;
  setActiveTab: (tab: "home" | "projects" | "codex" | "git" | "log") => void;
  workspaces: WorkspaceInfo[];
  hasLoaded: boolean;
  connectWorkspace: (workspace: WorkspaceInfo) => Promise<void>;
  listThreadsForWorkspaces: (workspaces: WorkspaceInfo[]) => Promise<unknown>;
  refreshWorkspaces: () => Promise<void | WorkspaceInfo[]>;
  backendMode: "local" | "remote";
  suspendRemoteSync?: boolean;
  activeWorkspace: WorkspaceInfo | null;
  activeThreadId: string | null;
  threadStatusById: Record<string, { isProcessing: boolean }>;
  remoteThreadConnectionState: RemoteThreadConnectionState;
  refreshThread: (workspaceId: string, threadId: string) => Promise<unknown>;
  onRemoteThreadRefreshFailure?: (workspaceId: string, threadId: string, message: string) => void;
  onRemoteThreadRefreshSuccess?: (workspaceId: string, threadId: string) => void;
};

export function useMainAppWorkspaceLifecycle({
  activeTab,
  isTablet,
  setActiveTab,
  workspaces,
  hasLoaded,
  connectWorkspace,
  listThreadsForWorkspaces,
  refreshWorkspaces,
  backendMode,
  suspendRemoteSync = false,
  activeWorkspace,
  activeThreadId,
  threadStatusById,
  remoteThreadConnectionState,
  refreshThread,
  onRemoteThreadRefreshFailure,
  onRemoteThreadRefreshSuccess,
}: UseMainAppWorkspaceLifecycleArgs) {
  useTabActivationGuard({
    activeTab,
    isTablet,
    setActiveTab,
  });

  useWindowDrag("titlebar");

  useWorkspaceRestore({
    workspaces,
    hasLoaded,
    suspend: suspendRemoteSync,
    connectWorkspace,
    listThreadsForWorkspaces,
  });

  useWorkspaceRefreshOnFocus({
    workspaces,
    refreshWorkspaces,
    listThreadsForWorkspaces,
    backendMode,
    suspendRefresh: suspendRemoteSync,
    pollIntervalMs: REMOTE_WORKSPACE_REFRESH_INTERVAL_MS,
  });

  useRemoteThreadRefreshOnFocus({
    backendMode,
    activeWorkspace,
    activeThreadId,
    activeThreadIsProcessing: Boolean(
      activeThreadId && threadStatusById[activeThreadId]?.isProcessing,
    ),
    suspendPolling:
      suspendRemoteSync ||
      backendMode === "remote" && remoteThreadConnectionState === "live",
    reconnectWorkspace: connectWorkspace,
    refreshThread,
    onRefreshFailure: onRemoteThreadRefreshFailure,
    onRefreshSuccess: onRemoteThreadRefreshSuccess,
  });
}
