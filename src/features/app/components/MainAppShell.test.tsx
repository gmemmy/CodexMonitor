import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { describe, expect, it, vi } from "vitest";
import { MainAppShell } from "./MainAppShell";

vi.mock("@app/components/AppLayout", () => ({
  AppLayout: () => null,
}));

vi.mock("@app/components/AppModals", () => ({
  AppModals: () => null,
}));

vi.mock("@/features/layout/components/SidebarToggleControls", () => ({
  TitlebarExpandControls: () => null,
}));

vi.mock("@/features/layout/components/WindowCaptionControls", () => ({
  WindowCaptionControls: () => null,
}));

vi.mock("@/features/mobile/components/MobileServerSetupWizard", () => ({
  MobileServerSetupWizard: () => null,
}));

function renderFunctionComponent(node: ReactElement): ReactNode {
  const component = node.type as (props: typeof node.props) => ReactNode;
  return component(node.props);
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
  if (typeof node.type === "function") {
    return collectText(renderFunctionComponent(node));
  }
  return collectText(node.props.children);
}

function hasClassName(node: ReactNode, className: string): boolean {
  if (!isValidElement<{ className?: string; children?: ReactNode }>(node)) {
    return false;
  }
  if (typeof node.type === "function") {
    return hasClassName(renderFunctionComponent(node), className);
  }

  const classes =
    typeof node.props.className === "string"
      ? node.props.className.split(/\s+/)
      : [];
  if (classes.includes(className)) {
    return true;
  }

  return Children.toArray(node.props.children).some((child) =>
    hasClassName(child, className),
  );
}

describe("MainAppShell", () => {
  it("renders the current app version in desktop shell chrome", () => {
    const result = MainAppShell({
      appClassName: "app layout-desktop",
      isResizing: false,
      appStyle: {},
      appRef: { current: null },
      sidebarToggleProps: undefined as never,
      shouldLoadGitHubPanelData: false,
      gitHubPanelDataProps: undefined as never,
      appLayoutProps: undefined as never,
      appModalsProps: undefined as never,
      showMobileSetupWizard: false,
      mobileSetupWizardProps: undefined as never,
    });

    expect(hasClassName(result, "app-shell-version")).toBe(true);
    expect(collectText(result)).toContain(`v${__APP_VERSION__}`);
  });
});
