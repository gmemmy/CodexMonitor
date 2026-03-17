import { SidebarCollapseButton } from "@/features/layout/components/SidebarToggleControls";
import type { ComponentProps } from "react";
import { MainAppShell } from "@app/components/MainAppShell";
import type { RemoteThreadConnectionState } from "@/types";

type UseMainAppShellPropsArgs = {
  shell: Pick<
    ComponentProps<typeof MainAppShell>,
    | "appClassName"
    | "isResizing"
    | "appStyle"
    | "appRef"
    | "sidebarToggleProps"
    | "shouldLoadGitHubPanelData"
    | "appModalsProps"
    | "showMobileSetupWizard"
    | "mobileSetupWizardProps"
  >;
  gitHubPanelDataProps: ComponentProps<typeof MainAppShell>["gitHubPanelDataProps"];
  appLayout: Omit<ComponentProps<typeof MainAppShell>["appLayoutProps"], "desktopTopbarLeftNode" | "topbarActionsNode">;
  topbar: {
    isCompact: boolean;
    desktopTopbarLeftNode: ComponentProps<typeof MainAppShell>["appLayoutProps"]["desktopTopbarLeftNode"];
    hasActiveWorkspace: boolean;
    backendMode: "local" | "remote";
    remoteThreadConnectionState: RemoteThreadConnectionState;
    showReconnectAction: boolean;
    reconnectLoading: boolean;
    onReconnect: () => void;
  };
};

export function useMainAppShellProps({
  shell,
  gitHubPanelDataProps,
  appLayout,
  topbar,
}: UseMainAppShellPropsArgs) {
  const showThreadConnectionIndicator =
    topbar.hasActiveWorkspace && topbar.backendMode === "remote";
  const topbarActionsNode = showThreadConnectionIndicator ? (
    <div className="compact-workspace-live-controls">
      <span
        className={`compact-workspace-live-indicator ${
          topbar.remoteThreadConnectionState === "live"
            ? "is-live"
            : topbar.remoteThreadConnectionState === "polling"
              ? "is-polling"
              : topbar.remoteThreadConnectionState === "stale"
                ? "is-stale"
                : "is-disconnected"
        }`}
        title={
          topbar.remoteThreadConnectionState === "live"
            ? "Receiving live thread events"
            : topbar.remoteThreadConnectionState === "polling"
              ? "Connected, syncing thread state by polling"
              : topbar.remoteThreadConnectionState === "stale"
                ? "Remote data is stale after a failed sync"
                : "Disconnected from backend"
        }
      >
        {topbar.remoteThreadConnectionState === "live"
          ? "Live"
          : topbar.remoteThreadConnectionState === "polling"
            ? "Polling"
            : topbar.remoteThreadConnectionState === "stale"
              ? "Stale"
              : "Disconnected"}
      </span>
      {topbar.showReconnectAction ? (
        <button
          type="button"
          className="ghost compact-workspace-reconnect"
          onClick={topbar.onReconnect}
          disabled={topbar.reconnectLoading}
        >
          {topbar.reconnectLoading ? "Reconnecting…" : "Reconnect"}
        </button>
      ) : null}
    </div>
  ) : null;

  const desktopTopbarLeftNodeWithToggle = !topbar.isCompact ? (
    <div className="topbar-leading">
      <SidebarCollapseButton {...shell.sidebarToggleProps} />
      {topbar.desktopTopbarLeftNode}
    </div>
  ) : (
    topbar.desktopTopbarLeftNode
  );

  return {
    ...shell,
    gitHubPanelDataProps,
    appLayoutProps: {
      ...appLayout,
      desktopTopbarLeftNode: desktopTopbarLeftNodeWithToggle,
      topbarActionsNode,
    },
  };
}
