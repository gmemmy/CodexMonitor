import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { describe, expect, it, vi } from "vitest";

import { RemoteSyncBanner } from "./RemoteSyncBanner";

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

function findButton(
  node: ReactNode,
): ReactElement<{ children?: ReactNode; disabled?: boolean; onClick?: () => void }> | null {
  if (!isValidElement<{ children?: ReactNode }>(node)) {
    return null;
  }
  if (node.type === "button") {
    return node as ReactElement<{
      children?: ReactNode;
      disabled?: boolean;
      onClick?: () => void;
    }>;
  }
  for (const child of Children.toArray(node.props.children)) {
    const match = findButton(child);
    if (match) {
      return match;
    }
  }
  return null;
}

describe("RemoteSyncBanner", () => {
  it("renders stale cached-data copy and triggers reconnect", () => {
    const onAction = vi.fn();
    const element = RemoteSyncBanner({
      state: "stale",
      title: "Remote session stale",
      message: "Showing cached remote session data until the next successful refresh.",
      onAction,
    });
    const button = findButton(element);

    expect(isValidElement<{ className?: string; children?: ReactNode }>(element)).toBe(true);
    if (!isValidElement<{ className?: string; children?: ReactNode }>(element)) {
      throw new Error("Expected banner element");
    }
    expect(element.props.className).toContain("remote-sync-banner-stale");
    expect(collectText(element)).toContain("Remote session stale");
    expect(collectText(element)).toContain(
      "Showing cached remote session data until the next successful refresh.",
    );
    expect(isValidElement<{ onClick?: () => void }>(button)).toBe(true);
    if (isValidElement<{ onClick?: () => void }>(button)) {
      button.props.onClick?.();
    }
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it("renders a disconnected banner with a busy reconnect action", () => {
    const element = RemoteSyncBanner({
      state: "disconnected",
      title: "Remote workspace disconnected",
      message: "Showing cached remote workspace data until reconnect succeeds.",
      actionBusy: true,
      onAction: vi.fn(),
    });
    const button = findButton(element);

    expect(isValidElement<{ className?: string; children?: ReactNode }>(element)).toBe(true);
    if (!isValidElement<{ className?: string; children?: ReactNode }>(element)) {
      throw new Error("Expected banner element");
    }
    expect(element.props.className).toContain("remote-sync-banner-disconnected");
    expect(isValidElement<{ disabled?: boolean; children?: ReactNode }>(button)).toBe(true);
    if (isValidElement<{ disabled?: boolean; children?: ReactNode }>(button)) {
      expect(button.props.disabled).toBe(true);
      expect(collectText(button)).toContain("Reconnecting…");
    }
  });
});
