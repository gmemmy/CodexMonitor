// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const isMobilePlatform = vi.hoisted(() => vi.fn(() => false));

vi.mock("../../../utils/platformPaths", () => ({
  isMobilePlatform,
}));

import type { ThreadSummary } from "../../../types";
import { ThreadRow } from "./ThreadRow";

const thread: ThreadSummary = {
  id: "thread-1",
  name: "Alpha",
  updatedAt: 1000,
};

const baseProps = {
  thread,
  depth: 0,
  workspaceId: "ws-1",
  indentUnit: 14,
  activeWorkspaceId: null,
  activeThreadId: null,
  threadStatusById: {},
  getThreadTime: () => "2m",
  isThreadPinned: () => false,
  onSelectThread: vi.fn(),
  onShowThreadMenu: vi.fn(),
  onShowMobileThreadMenu: vi.fn(),
};

describe("ThreadRow", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.clearAllMocks();
    isMobilePlatform.mockReturnValue(false);
  });

  it("keeps normal tap selection on mobile", () => {
    isMobilePlatform.mockReturnValue(true);
    const onSelectThread = vi.fn();
    const onShowMobileThreadMenu = vi.fn();

    render(
      <ThreadRow
        {...baseProps}
        onSelectThread={onSelectThread}
        onShowMobileThreadMenu={onShowMobileThreadMenu}
      />,
    );

    const row = screen.getByText("Alpha").closest(".thread-row");
    if (!row) {
      throw new Error("Missing thread row");
    }

    fireEvent.pointerDown(row, { pointerType: "touch", clientX: 10, clientY: 10 });
    fireEvent.pointerUp(row, { pointerType: "touch", clientX: 10, clientY: 10 });
    fireEvent.click(row);

    expect(onSelectThread).toHaveBeenCalledWith("ws-1", "thread-1");
    expect(onShowMobileThreadMenu).not.toHaveBeenCalled();
  });

  it("opens the mobile actions menu on long press and suppresses the follow-up click", () => {
    vi.useFakeTimers();
    isMobilePlatform.mockReturnValue(true);
    const onSelectThread = vi.fn();
    const onShowMobileThreadMenu = vi.fn();

    render(
      <ThreadRow
        {...baseProps}
        onSelectThread={onSelectThread}
        onShowMobileThreadMenu={onShowMobileThreadMenu}
      />,
    );

    const row = screen.getByText("Alpha").closest(".thread-row");
    if (!row) {
      throw new Error("Missing thread row");
    }

    fireEvent.pointerDown(row, { pointerType: "touch", clientX: 10, clientY: 10 });
    vi.advanceTimersByTime(500);

    expect(onShowMobileThreadMenu).toHaveBeenCalledWith(
      "ws-1",
      "thread-1",
      "Alpha",
      true,
    );

    fireEvent.click(row);
    expect(onSelectThread).not.toHaveBeenCalled();
  });

  it("suppresses the desktop context menu on mobile", () => {
    isMobilePlatform.mockReturnValue(true);
    const onShowThreadMenu = vi.fn();

    render(
      <ThreadRow
        {...baseProps}
        onShowThreadMenu={onShowThreadMenu}
      />,
    );

    const row = screen.getByText("Alpha").closest(".thread-row");
    if (!row) {
      throw new Error("Missing thread row");
    }

    fireEvent.contextMenu(row);
    expect(onShowThreadMenu).not.toHaveBeenCalled();
  });
});
