// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ActiveSelectionState, AppSettings, ThreadRefreshResult, WorkspaceInfo } from "@/types";
import {
  getActiveSelectionState,
  setActiveThreadSelection,
  setActiveWorkspaceSelection,
} from "@services/tauri";
import { useBackendSelectionContinuity } from "./useBackendSelectionContinuity";

vi.mock("@services/tauri", () => ({
  getActiveSelectionState: vi.fn(),
  setActiveWorkspaceSelection: vi.fn(),
  setActiveThreadSelection: vi.fn(),
}));

const getActiveSelectionStateMock = vi.mocked(getActiveSelectionState);
const setActiveWorkspaceSelectionMock = vi.mocked(setActiveWorkspaceSelection);
const setActiveThreadSelectionMock = vi.mocked(setActiveThreadSelection);

const remoteSettings: Pick<
  AppSettings,
  "backendMode" | "remoteBackendHost" | "remoteBackendToken"
> = {
  backendMode: "remote",
  remoteBackendHost: "office-mac.tailnet.ts.net:4732",
  remoteBackendToken: "token-office",
};

const workspaceOne: WorkspaceInfo = {
  id: "ws-1",
  name: "Workspace One",
  path: "/tmp/ws-1",
  connected: true,
  settings: { sidebarCollapsed: false },
};

const workspaceTwo: WorkspaceInfo = {
  id: "ws-2",
  name: "Workspace Two",
  path: "/tmp/ws-2",
  connected: true,
  settings: { sidebarCollapsed: false },
};

function buildRefreshResult(
  threadId: string | null,
  ok = true,
): ThreadRefreshResult {
  return {
    ok,
    threadId,
    errorMessage: ok ? null : "Unable to refresh the remote thread state.",
  };
}

function renderSelectionContinuity(options?: {
  workspaces?: WorkspaceInfo[];
  initialActiveWorkspaceId?: string | null;
  initialActiveThreadIdByWorkspace?: Record<string, string | null>;
  refreshThread?: ReturnType<typeof vi.fn>;
  listThreadsForWorkspace?: ReturnType<typeof vi.fn>;
  hasLoaded?: boolean;
}) {
  const refreshThread =
    options?.refreshThread ??
    vi.fn().mockResolvedValue(buildRefreshResult("thread-1"));
  const listThreadsForWorkspace =
    options?.listThreadsForWorkspace ?? vi.fn().mockResolvedValue(undefined);

  const hook = renderHook(
    ({
      workspaces,
      hasLoaded,
    }: {
      workspaces: WorkspaceInfo[];
      hasLoaded: boolean;
    }) => {
      const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(
        options?.initialActiveWorkspaceId ?? null,
      );
      const [activeThreadIdByWorkspace, setActiveThreadIdByWorkspace] = useState<
        Record<string, string | null>
      >(options?.initialActiveThreadIdByWorkspace ?? {});
      const activeWorkspace =
        workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? null;
      const activeThreadId = activeWorkspaceId
        ? activeThreadIdByWorkspace[activeWorkspaceId] ?? null
        : null;

      useBackendSelectionContinuity({
        appSettings: remoteSettings,
        workspaces,
        hasLoaded,
        activeWorkspace,
        activeWorkspaceId,
        setActiveWorkspaceId,
        activeThreadId,
        setActiveThreadId: (threadId, workspaceId) => {
          const targetWorkspaceId = workspaceId ?? activeWorkspaceId;
          if (!targetWorkspaceId) {
            return;
          }
          setActiveThreadIdByWorkspace((previous) => ({
            ...previous,
            [targetWorkspaceId]: threadId,
          }));
        },
        listThreadsForWorkspace,
        refreshThread,
      });

      return {
        activeWorkspaceId,
        activeThreadId,
        activeThreadIdByWorkspace,
        setActiveWorkspaceId,
        setActiveThreadId: (threadId: string | null, workspaceId?: string) => {
          const targetWorkspaceId = workspaceId ?? activeWorkspaceId;
          if (!targetWorkspaceId) {
            return;
          }
          setActiveThreadIdByWorkspace((previous) => ({
            ...previous,
            [targetWorkspaceId]: threadId,
          }));
        },
      };
    },
    {
      initialProps: {
        workspaces: options?.workspaces ?? [workspaceOne],
        hasLoaded: options?.hasLoaded ?? true,
      },
    },
  );

  return {
    ...hook,
    refreshThread,
    listThreadsForWorkspace,
  };
}

describe("useBackendSelectionContinuity", () => {
  let persistedState: ActiveSelectionState;

  beforeEach(() => {
    vi.clearAllMocks();
    persistedState = {
      activeWorkspaceId: null,
      activeThreadIdByWorkspace: {},
    };
    getActiveSelectionStateMock.mockImplementation(async () => persistedState);
    setActiveWorkspaceSelectionMock.mockImplementation(async (workspaceId) => {
      persistedState = {
        ...persistedState,
        activeWorkspaceId: workspaceId,
      };
      return persistedState;
    });
    setActiveThreadSelectionMock.mockImplementation(async (workspaceId, threadId) => {
      const nextThreads = { ...persistedState.activeThreadIdByWorkspace };
      if (threadId) {
        nextThreads[workspaceId] = threadId;
      } else {
        delete nextThreads[workspaceId];
      }
      persistedState = {
        ...persistedState,
        activeThreadIdByWorkspace: nextThreads,
      };
      return persistedState;
    });
  });

  it("restores the persisted workspace and thread when both are still valid", async () => {
    persistedState = {
      activeWorkspaceId: "ws-2",
      activeThreadIdByWorkspace: {
        "ws-2": "thread-2",
      },
    };
    const refreshThread = vi.fn().mockResolvedValue(buildRefreshResult("thread-2"));

    const { result, listThreadsForWorkspace } = renderSelectionContinuity({
      workspaces: [workspaceOne, workspaceTwo],
      refreshThread,
    });

    await waitFor(() => {
      expect(result.current.activeWorkspaceId).toBe("ws-2");
    });
    await waitFor(() => {
      expect(result.current.activeThreadId).toBe("thread-2");
    });

    expect(listThreadsForWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({ id: "ws-2" }),
      { preserveState: true },
    );
    expect(refreshThread).toHaveBeenCalledWith("ws-2", "thread-2");
    expect(setActiveWorkspaceSelectionMock).not.toHaveBeenCalledWith(null);
    expect(setActiveThreadSelectionMock).not.toHaveBeenCalledWith("ws-2", null);
  });

  it("clears a persisted workspace pointer when the workspace no longer exists", async () => {
    persistedState = {
      activeWorkspaceId: "ws-missing",
      activeThreadIdByWorkspace: {
        "ws-missing": "thread-missing",
      },
    };

    const { result } = renderSelectionContinuity({
      workspaces: [workspaceOne],
      initialActiveWorkspaceId: "ws-1",
    });

    await waitFor(() => {
      expect(setActiveWorkspaceSelectionMock).toHaveBeenCalledWith(null);
    });
    await waitFor(() => {
      expect(setActiveThreadSelectionMock).toHaveBeenCalledWith("ws-missing", null);
    });
    expect(result.current.activeWorkspaceId).toBeNull();
    expect(setActiveWorkspaceSelectionMock).not.toHaveBeenCalledWith("ws-1");
  });

  it("clears stale local workspace state when the backend has no active workspace", async () => {
    const { result } = renderSelectionContinuity({
      workspaces: [workspaceOne],
      initialActiveWorkspaceId: "ws-1",
    });

    await waitFor(() => {
      expect(getActiveSelectionStateMock).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(result.current.activeWorkspaceId).toBeNull();
    });

    expect(setActiveWorkspaceSelectionMock).not.toHaveBeenCalledWith("ws-1");
  });

  it("clears a persisted thread pointer when the thread no longer exists", async () => {
    persistedState = {
      activeWorkspaceId: "ws-1",
      activeThreadIdByWorkspace: {
        "ws-1": "thread-missing",
      },
    };
    const refreshThread = vi.fn().mockResolvedValue(buildRefreshResult(null, false));

    const { result } = renderSelectionContinuity({
      workspaces: [workspaceOne],
      refreshThread,
    });

    await waitFor(() => {
      expect(result.current.activeWorkspaceId).toBe("ws-1");
    });
    await waitFor(() => {
      expect(refreshThread).toHaveBeenCalledWith("ws-1", "thread-missing");
    });
    await waitFor(() => {
      expect(setActiveThreadSelectionMock).toHaveBeenCalledWith("ws-1", null);
    });

    expect(result.current.activeThreadId).toBeNull();
  });

  it("prefers the current backend selection over stale local workspace and thread state", async () => {
    persistedState = {
      activeWorkspaceId: "ws-2",
      activeThreadIdByWorkspace: {
        "ws-2": "thread-remote",
      },
    };
    const refreshThread = vi.fn().mockResolvedValue(buildRefreshResult("thread-remote"));

    const { result } = renderSelectionContinuity({
      workspaces: [workspaceOne, workspaceTwo],
      initialActiveWorkspaceId: "ws-1",
      initialActiveThreadIdByWorkspace: {
        "ws-1": "thread-local",
      },
      refreshThread,
    });

    await waitFor(() => {
      expect(result.current.activeWorkspaceId).toBe("ws-2");
    });
    await waitFor(() => {
      expect(result.current.activeThreadId).toBe("thread-remote");
    });

    expect(refreshThread).toHaveBeenCalledWith("ws-2", "thread-remote");
    expect(result.current.activeThreadIdByWorkspace["ws-1"]).toBe("thread-local");
  });

  it("persists manual workspace and thread selections after restore completes", async () => {
    const { result } = renderSelectionContinuity({
      workspaces: [workspaceOne],
    });

    await waitFor(() => {
      expect(getActiveSelectionStateMock).toHaveBeenCalledTimes(1);
    });

    act(() => {
      result.current.setActiveWorkspaceId("ws-1");
    });

    await waitFor(() => {
      expect(setActiveWorkspaceSelectionMock).toHaveBeenCalledWith("ws-1");
    });

    act(() => {
      result.current.setActiveThreadId("thread-manual", "ws-1");
    });

    await waitFor(() => {
      expect(setActiveThreadSelectionMock).toHaveBeenCalledWith("ws-1", "thread-manual");
    });
  });
});
