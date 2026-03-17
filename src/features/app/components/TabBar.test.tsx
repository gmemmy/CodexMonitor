import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { describe, expect, it, vi } from "vitest";
import { TabBar } from "./TabBar";

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

function findButtonByLabel(node: ReactNode, label: string): ReactElement | null {
  if (!isValidElement<{ children?: ReactNode; type?: string }>(node)) {
    return null;
  }
  if (typeof node.type === "function") {
    return findButtonByLabel(renderFunctionComponent(node), label);
  }

  if (node.type === "button" && collectText(node).includes(label)) {
    return node;
  }

  for (const child of Children.toArray(node.props.children)) {
    const match = findButtonByLabel(child, label);
    if (match) {
      return match;
    }
  }

  return null;
}

describe("TabBar", () => {
  it("shows the app version alongside the phone shell tabs", () => {
    const onSelect = vi.fn();
    const result = TabBar({ activeTab: "codex", onSelect });

    expect(collectText(result)).toContain(`v${__APP_VERSION__}`);
    expect(findButtonByLabel(result, "Git")).not.toBeNull();
  });
});
