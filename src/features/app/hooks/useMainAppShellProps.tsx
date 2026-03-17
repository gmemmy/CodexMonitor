import { SidebarCollapseButton } from "@/features/layout/components/SidebarToggleControls";
import type { ComponentProps } from "react";
import { MainAppShell } from "@app/components/MainAppShell";
import type { ResolvedRemotePresence } from "@app/utils/remoteSync";

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
    remotePresence: ResolvedRemotePresence;
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
        className={`compact-workspace-live-indicator is-${topbar.remotePresence.state}`}
        title={topbar.remotePresence.title}
        aria-label={topbar.remotePresence.title}
      >
        {topbar.remotePresence.label}
      </span>
      {topbar.remotePresence.detailLabel ? (
        <span className="compact-workspace-live-note">
          {topbar.remotePresence.detailLabel}
        </span>
      ) : null}
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
