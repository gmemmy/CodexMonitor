import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { describe, expect, it, vi } from "vitest";

import { useMainAppShellProps } from "./useMainAppShellProps";

type UseMainAppShellPropsArgs = Parameters<typeof useMainAppShellProps>[0];

function buildArgs(
  overrides: Partial<UseMainAppShellPropsArgs["topbar"]> = {},
): UseMainAppShellPropsArgs {
  return {
    shell: {
      appClassName: "app-shell",
      isResizing: false,
      appStyle: {},
      appRef: { current: null },
      sidebarToggleProps:
        {} as UseMainAppShellPropsArgs["shell"]["sidebarToggleProps"],
      shouldLoadGitHubPanelData: false,
      appModalsProps:
        {} as UseMainAppShellPropsArgs["shell"]["appModalsProps"],
      showMobileSetupWizard: false,
      mobileSetupWizardProps:
        {} as UseMainAppShellPropsArgs["shell"]["mobileSetupWizardProps"],
    },
    gitHubPanelDataProps:
      {} as UseMainAppShellPropsArgs["gitHubPanelDataProps"],
    appLayout: {} as UseMainAppShellPropsArgs["appLayout"],
    topbar: {
      isCompact: true,
      desktopTopbarLeftNode: null,
      hasActiveWorkspace: true,
      backendMode: "remote",
      remotePresence: {
        state: "online",
        label: "Online",
        title: "Remote backend online",
        detailLabel: null,
      },
      showReconnectAction: false,
      reconnectLoading: false,
      onReconnect: vi.fn(),
      ...overrides,
    },
  };
}

function collectText(node: ReactNode): string[] {
  if (
    typeof node === "string" ||
    typeof node === "number" ||
    typeof node === "bigint"
  ) {
    return [String(node)];
  }
  if (Array.isArray(node)) {
    return node.flatMap((child) => collectText(child));
  }
  if (!isValidElement<{ children?: ReactNode }>(node)) {
    return [];
  }
  return collectText(node.props.children);
}

function findButton(node: ReactNode): ReactNode | null {
  if (!isValidElement<{ children?: ReactNode }>(node)) {
    return null;
  }
  if (node.type === "button") {
    return node as ReactElement<{ children?: ReactNode; disabled?: boolean }>;
  }
  for (const child of Children.toArray(node.props.children)) {
    const match = findButton(child);
    if (match) {
      return match;
    }
  }
  return null;
}

describe("useMainAppShellProps", () => {
  it("renders running presence with a reconnecting note", () => {
    const result = useMainAppShellProps(
      buildArgs({
        remotePresence: {
          state: "running",
          label: "Running",
          title: "Remote session running, reconnecting now",
          detailLabel: "Reconnecting",
        },
      }),
    );

    const text = collectText(result.appLayoutProps.topbarActionsNode);

    expect(text).toContain("Running");
    expect(text).toContain("Reconnecting");
    expect(findButton(result.appLayoutProps.topbarActionsNode)).toBeNull();
  });

  it("renders an offline reconnect action with loading copy", () => {
    const onReconnect = vi.fn();
    const result = useMainAppShellProps(
      buildArgs({
        remotePresence: {
          state: "offline",
          label: "Offline",
          title: "Remote backend offline",
          detailLabel: null,
        },
        showReconnectAction: true,
        reconnectLoading: true,
        onReconnect,
      }),
    );

    const text = collectText(result.appLayoutProps.topbarActionsNode);
    const button = findButton(result.appLayoutProps.topbarActionsNode);

    expect(text).toContain("Offline");
    expect(text).toContain("Reconnecting…");
    expect(isValidElement<{ disabled?: boolean; children?: ReactNode }>(button)).toBe(true);
    if (isValidElement<{ disabled?: boolean; children?: ReactNode }>(button)) {
      expect(button.props.disabled).toBe(true);
      expect(collectText(button)).toContain("Reconnecting…");
    }
  });
});
