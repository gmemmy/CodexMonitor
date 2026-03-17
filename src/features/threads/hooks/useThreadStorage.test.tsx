// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  STORAGE_KEY_CUSTOM_NAMES,
  loadCustomNames,
  loadThreadActivity,
  saveThreadActivity,
} from "@threads/utils/threadStorage";
import { useThreadStorage } from "./useThreadStorage";

vi.mock("@threads/utils/threadStorage", () => ({
  STORAGE_KEY_CUSTOM_NAMES: "custom-names",
  loadCustomNames: vi.fn(),
  loadThreadActivity: vi.fn(),
  makeCustomNameKey: (workspaceId: string, threadId: string) =>
    `${workspaceId}:${threadId}`,
  saveThreadActivity: vi.fn(),
}));

describe("useThreadStorage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads initial data and updates custom names on storage events", async () => {
    vi.mocked(loadThreadActivity).mockReturnValue({
      "ws-1": { "thread-1": 101 },
    });
    vi
      .mocked(loadCustomNames)
      .mockReturnValueOnce({ "ws-1:thread-1": "Custom" })
      .mockReturnValueOnce({ "ws-1:thread-1": "Updated" });

    const { result } = renderHook(() => useThreadStorage());

    expect(result.current.threadActivityRef.current).toEqual({
      "ws-1": { "thread-1": 101 },
    });

    await waitFor(() => {
      expect(result.current.getCustomName("ws-1", "thread-1")).toBe("Custom");
    });

    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", { key: STORAGE_KEY_CUSTOM_NAMES }),
      );
    });

    await waitFor(() => {
      expect(result.current.getCustomName("ws-1", "thread-1")).toBe("Updated");
    });
  });

  it("records thread activity and persists updates", () => {
    vi.mocked(loadThreadActivity).mockReturnValue({});
    vi.mocked(loadCustomNames).mockReturnValue({});

    const { result } = renderHook(() => useThreadStorage());

    act(() => {
      result.current.recordThreadActivity("ws-2", "thread-9", 999);
    });

    expect(result.current.threadActivityRef.current).toEqual({
      "ws-2": { "thread-9": 999 },
    });
    expect(saveThreadActivity).toHaveBeenCalledWith({
      "ws-2": { "thread-9": 999 },
    });
  });
});
