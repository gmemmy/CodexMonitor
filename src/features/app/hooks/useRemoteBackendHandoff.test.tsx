// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppSettings, WorkspaceInfo } from "@/types";
import { listWorkspaces, updateAppSettings } from "@services/tauri";
import { useRemoteBackendHandoff } from "./useRemoteBackendHandoff";

vi.mock("@services/tauri", () => ({
  listWorkspaces: vi.fn(),
  updateAppSettings: vi.fn(),
}));

const listWorkspacesMock = vi.mocked(listWorkspaces);
const updateAppSettingsMock = vi.mocked(updateAppSettings);

const baseSettings: AppSettings = {
  codexBin: null,
  codexArgs: null,
  backendMode: "remote",
  remoteBackendProvider: "tcp",
  remoteBackendHost: "home.tailnet.ts.net:4732",
  remoteBackendToken: "token-home",
  remoteBackends: [
    {
      id: "remote-home",
      name: "Home Mac",
      provider: "tcp",
      host: "home.tailnet.ts.net:4732",
      token: "token-home",
      lastConnectedAtMs: null,
    },
    {
      id: "remote-office",
      name: "Office Mac",
      provider: "tcp",
      host: "office.tailnet.ts.net:4732",
      token: "token-office",
      lastConnectedAtMs: null,
    },
  ],
  activeRemoteBackendId: "remote-home",
  keepDaemonRunningAfterAppClose: false,
  defaultAccessMode: "current",
  reviewDeliveryMode: "inline",
  composerModelShortcut: null,
  composerAccessShortcut: null,
  composerReasoningShortcut: null,
  composerCollaborationShortcut: null,
  interruptShortcut: null,
  newAgentShortcut: null,
  newWorktreeAgentShortcut: null,
  newCloneAgentShortcut: null,
  archiveThreadShortcut: null,
  toggleProjectsSidebarShortcut: null,
  toggleGitSidebarShortcut: null,
  branchSwitcherShortcut: null,
  toggleDebugPanelShortcut: null,
  toggleTerminalShortcut: null,
  cycleAgentNextShortcut: null,
  cycleAgentPrevShortcut: null,
  cycleWorkspaceNextShortcut: null,
  cycleWorkspacePrevShortcut: null,
  lastComposerModelId: null,
  lastComposerReasoningEffort: null,
  uiScale: 1,
  theme: "system",
  usageShowRemaining: false,
  showMessageFilePath: true,
  chatHistoryScrollbackItems: 200,
  threadTitleAutogenerationEnabled: false,
  uiFontFamily: "system-ui",
  codeFontFamily: "monospace",
  codeFontSize: 11,
  notificationSoundsEnabled: true,
  systemNotificationsEnabled: true,
  subagentSystemNotificationsEnabled: true,
  splitChatDiffView: false,
  preloadGitDiffs: true,
  gitDiffIgnoreWhitespaceChanges: false,
  commitMessagePrompt: "prompt",
  commitMessageModelId: null,
  collaborationModesEnabled: true,
  steerEnabled: true,
  followUpMessageBehavior: "queue",
  composerFollowUpHintEnabled: true,
  pauseQueuedMessagesWhenResponseRequired: true,
  unifiedExecEnabled: true,
  experimentalAppsEnabled: false,
  personality: "friendly",
  dictationEnabled: false,
  dictationModelId: "base",
  dictationPreferredLanguage: null,
  dictationHoldKey: null,
  composerEditorPreset: "default",
  composerFenceExpandOnSpace: false,
  composerFenceExpandOnEnter: false,
  composerFenceLanguageTags: false,
  composerFenceWrapSelection: false,
  composerFenceAutoWrapPasteMultiline: false,
  composerFenceAutoWrapPasteCodeLike: false,
  composerListContinuation: false,
  composerCodeBlockCopyUseModifier: false,
  workspaceGroups: [],
  openAppTargets: [],
  selectedOpenAppId: "default",
  globalWorktreesFolder: null,
};

const activeWorkspace: WorkspaceInfo = {
  id: "ws-home",
  name: "codex-monitor",
  path: "/Users/me/dev/codex-monitor",
  connected: true,
  kind: "main",
  parentId: null,
  worktree: null,
  settings: { sidebarCollapsed: false },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useRemoteBackendHandoff", () => {
  it("switches to the selected remote, refreshes workspace state, and restores the best workspace", async () => {
    const nextWorkspace: WorkspaceInfo = {
      id: "ws-office",
      name: "codex-monitor",
      path: "/Users/me/dev/codex-monitor",
      connected: false,
      kind: "main",
      parentId: null,
      worktree: null,
      settings: { sidebarCollapsed: false },
    };
    const secondaryWorkspace: WorkspaceInfo = {
      id: "ws-office-2",
      name: "other",
      path: "/Users/me/dev/other",
      connected: true,
      kind: "main",
      parentId: null,
      worktree: null,
      settings: { sidebarCollapsed: false },
    };
    updateAppSettingsMock.mockResolvedValue(baseSettings);
    listWorkspacesMock.mockResolvedValue([nextWorkspace, secondaryWorkspace]);

    const setAppSettings = vi.fn();
    const connectWorkspace = vi.fn().mockResolvedValue(undefined);
    const setActiveThreadId = vi.fn();
    const replaceWorkspaceState = vi.fn();
    const resetThreadState = vi.fn();
    const listThreadsForWorkspace = vi.fn().mockResolvedValue([]);
    const refreshThread = vi.fn().mockResolvedValue({
      ok: true,
      threadId: "thread-1",
      errorMessage: null,
    });
    const refreshAccountInfo = vi.fn().mockResolvedValue(undefined);
    const refreshAccountRateLimits = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useRemoteBackendHandoff({
        appSettings: baseSettings,
        setAppSettings,
        activeWorkspace,
        activeThreadId: null,
        connectWorkspace,
        setActiveThreadId,
        replaceWorkspaceState,
        resetThreadState,
        listThreadsForWorkspace,
        refreshThread,
        refreshAccountInfo,
        refreshAccountRateLimits,
      }),
    );

    let message = "";
    await act(async () => {
      message = await result.current.handoffRemoteBackend("remote-office");
    });

    expect(updateAppSettingsMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        activeRemoteBackendId: "remote-office",
        remoteBackendHost: "office.tailnet.ts.net:4732",
        remoteBackendToken: "token-office",
      }),
    );
    expect(connectWorkspace).toHaveBeenCalledWith(nextWorkspace);
    expect(resetThreadState).toHaveBeenCalledTimes(1);
    expect(replaceWorkspaceState).toHaveBeenCalledWith(
      [
        { ...nextWorkspace, connected: true },
        secondaryWorkspace,
      ],
      { activeWorkspaceId: "ws-office" },
    );
    expect(listThreadsForWorkspace).toHaveBeenCalledWith({
      ...nextWorkspace,
      connected: true,
    });
    expect(refreshAccountInfo).toHaveBeenCalledWith("ws-office");
    expect(refreshAccountRateLimits).toHaveBeenCalledWith("ws-office");
    expect(setAppSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        activeRemoteBackendId: "remote-office",
        remoteBackends: expect.arrayContaining([
          expect.objectContaining({
            id: "remote-office",
            lastConnectedAtMs: expect.any(Number),
          }),
        ]),
      }),
    );
    expect(message).toBe(
      'Switched to "Office Mac". 2 workspaces reachable on the remote backend.',
    );
  });

  it("rolls back when the target remote cannot be validated", async () => {
    updateAppSettingsMock.mockResolvedValue(baseSettings);
    listWorkspacesMock.mockRejectedValue(new Error("dial tcp timeout"));

    const setAppSettings = vi.fn();
    const connectWorkspace = vi.fn().mockResolvedValue(undefined);
    const setActiveThreadId = vi.fn();
    const replaceWorkspaceState = vi.fn();
    const resetThreadState = vi.fn();
    const listThreadsForWorkspace = vi.fn().mockResolvedValue([]);
    const refreshThread = vi.fn().mockResolvedValue({
      ok: true,
      threadId: "thread-1",
      errorMessage: null,
    });
    const refreshAccountInfo = vi.fn().mockResolvedValue(undefined);
    const refreshAccountRateLimits = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useRemoteBackendHandoff({
        appSettings: baseSettings,
        setAppSettings,
        activeWorkspace,
        activeThreadId: null,
        connectWorkspace,
        setActiveThreadId,
        replaceWorkspaceState,
        resetThreadState,
        listThreadsForWorkspace,
        refreshThread,
        refreshAccountInfo,
        refreshAccountRateLimits,
      }),
    );

    let thrownError: unknown = null;
    await act(async () => {
      try {
        await result.current.handoffRemoteBackend("remote-office");
      } catch (error) {
        thrownError = error;
      }
    });

    expect(thrownError).toBeInstanceOf(Error);
    expect((thrownError as Error).message).toBe("dial tcp timeout");
    expect(updateAppSettingsMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        activeRemoteBackendId: "remote-office",
      }),
    );
    expect(updateAppSettingsMock).toHaveBeenNthCalledWith(2, baseSettings);
    expect(setAppSettings).not.toHaveBeenCalled();
    expect(resetThreadState).not.toHaveBeenCalled();
    expect(replaceWorkspaceState).not.toHaveBeenCalled();
    expect(listThreadsForWorkspace).not.toHaveBeenCalled();
    expect(refreshAccountInfo).not.toHaveBeenCalled();
    expect(refreshAccountRateLimits).not.toHaveBeenCalled();
  });

  it("falls back to another connected workspace when the preferred workspace cannot reconnect", async () => {
    const preferredWorkspace: WorkspaceInfo = {
      id: "ws-office",
      name: "codex-monitor",
      path: "/Users/me/dev/codex-monitor",
      connected: false,
      kind: "main",
      parentId: null,
      worktree: null,
      settings: { sidebarCollapsed: false },
    };
    const fallbackWorkspace: WorkspaceInfo = {
      id: "ws-office-2",
      name: "other",
      path: "/Users/me/dev/other",
      connected: true,
      kind: "main",
      parentId: null,
      worktree: null,
      settings: { sidebarCollapsed: false },
    };
    updateAppSettingsMock.mockResolvedValue(baseSettings);
    listWorkspacesMock.mockResolvedValue([preferredWorkspace, fallbackWorkspace]);

    const connectWorkspace = vi.fn().mockRejectedValue(new Error("workspace reconnect failed"));
    const setActiveThreadId = vi.fn();
    const replaceWorkspaceState = vi.fn();
    const resetThreadState = vi.fn();
    const listThreadsForWorkspace = vi.fn().mockResolvedValue([]);
    const refreshThread = vi.fn().mockResolvedValue({
      ok: true,
      threadId: "thread-1",
      errorMessage: null,
    });
    const refreshAccountInfo = vi.fn().mockResolvedValue(undefined);
    const refreshAccountRateLimits = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useRemoteBackendHandoff({
        appSettings: baseSettings,
        setAppSettings: vi.fn(),
        activeWorkspace,
        activeThreadId: null,
        connectWorkspace,
        setActiveThreadId,
        replaceWorkspaceState,
        resetThreadState,
        listThreadsForWorkspace,
        refreshThread,
        refreshAccountInfo,
        refreshAccountRateLimits,
      }),
    );

    await act(async () => {
      await result.current.handoffRemoteBackend("remote-office");
    });

    expect(replaceWorkspaceState).toHaveBeenCalledWith(
      [preferredWorkspace, fallbackWorkspace],
      { activeWorkspaceId: "ws-office-2" },
    );
    expect(listThreadsForWorkspace).toHaveBeenCalledWith(fallbackWorkspace);
    expect(refreshAccountInfo).toHaveBeenCalledWith("ws-office-2");
    expect(refreshAccountRateLimits).toHaveBeenCalledWith("ws-office-2");
  });

  it("captures a v1 desktop/mobile handoff payload from the active remote context", () => {
    const { result } = renderHook(() =>
      useRemoteBackendHandoff({
        appSettings: baseSettings,
        setAppSettings: vi.fn(),
        activeWorkspace,
        activeThreadId: "thread-1",
        activeThreadTitle: "Fix remote handoff flow",
        connectWorkspace: vi.fn().mockResolvedValue(undefined),
        setActiveThreadId: vi.fn(),
        replaceWorkspaceState: vi.fn(),
        resetThreadState: vi.fn(),
        listThreadsForWorkspace: vi.fn().mockResolvedValue([]),
        refreshThread: vi.fn().mockResolvedValue({
          ok: true,
          threadId: "thread-1",
          errorMessage: null,
        }),
      }),
    );

    const payload = result.current.captureDesktopMobileHandoffPayload();

    expect(payload).toMatchObject({
      version: 1,
      remote: {
        provider: "tcp",
        host: "home.tailnet.ts.net:4732",
        token: "token-home",
        name: "Home Mac",
      },
      workspace: {
        id: "ws-home",
        path: "/Users/me/dev/codex-monitor",
        name: "codex-monitor",
      },
      thread: {
        id: "thread-1",
        title: "Fix remote handoff flow",
      },
    });
    expect(typeof payload.issuedAtMs).toBe("number");
  });

  it("applies a handoff payload, reconnects the workspace, and forces a fresh thread restore before selection", async () => {
    const remoteWorkspace: WorkspaceInfo = {
      id: "ws-office",
      name: "codex-monitor",
      path: "/Users/me/dev/codex-monitor",
      connected: false,
      settings: { sidebarCollapsed: false },
    };
    updateAppSettingsMock.mockResolvedValue(baseSettings);
    listWorkspacesMock.mockResolvedValue([remoteWorkspace]);

    const setAppSettings = vi.fn();
    const connectWorkspace = vi.fn().mockResolvedValue(undefined);
    const setActiveThreadId = vi.fn();
    const replaceWorkspaceState = vi.fn();
    const resetThreadState = vi.fn();
    const listThreadsForWorkspace = vi.fn().mockResolvedValue([
      {
        id: "thread-42",
        name: "Fix remote handoff flow",
        updatedAt: 1,
      },
    ]);
    const refreshThread = vi.fn().mockResolvedValue({
      ok: true,
      threadId: "thread-42",
      errorMessage: null,
    });
    const refreshAccountInfo = vi.fn().mockResolvedValue(undefined);
    const refreshAccountRateLimits = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useRemoteBackendHandoff({
        appSettings: baseSettings,
        setAppSettings,
        activeWorkspace,
        activeThreadId: null,
        connectWorkspace,
        setActiveThreadId,
        replaceWorkspaceState,
        resetThreadState,
        listThreadsForWorkspace,
        refreshThread,
        refreshAccountInfo,
        refreshAccountRateLimits,
      }),
    );

    let applyResult: Awaited<
      ReturnType<typeof result.current.applyDesktopMobileHandoffPayload>
    > | null = null;
    await act(async () => {
      applyResult = await result.current.applyDesktopMobileHandoffPayload(
        JSON.stringify({
          version: 1,
          issuedAtMs: 1773705600000,
          remote: {
            provider: "tcp",
            host: "office.tailnet.ts.net:4732",
            token: "token-office",
            name: "Office Mac",
          },
          workspace: {
            id: "ws-office",
            path: "/Users/me/dev/codex-monitor",
            name: "codex-monitor",
          },
          thread: {
            id: "thread-42",
            title: "Fix remote handoff flow",
          },
        }),
      );
    });

    expect(applyResult).toEqual({
      ok: true,
      message:
        'Connected to "Office Mac" and resumed "Fix remote handoff flow" in "codex-monitor".',
    });
    expect(connectWorkspace).toHaveBeenCalledWith(remoteWorkspace);
    expect(resetThreadState).toHaveBeenCalledTimes(1);
    expect(replaceWorkspaceState).toHaveBeenCalledWith(
      [{ ...remoteWorkspace, connected: true }],
      { activeWorkspaceId: "ws-office" },
    );
    expect(listThreadsForWorkspace).toHaveBeenCalledWith({
      ...remoteWorkspace,
      connected: true,
    });
    expect(refreshThread).toHaveBeenCalledWith("ws-office", "thread-42");
    expect(setActiveThreadId).toHaveBeenCalledWith("thread-42", "ws-office");
    expect(refreshThread.mock.invocationCallOrder[0]).toBeLessThan(
      setActiveThreadId.mock.invocationCallOrder[0],
    );
    expect(refreshAccountInfo).toHaveBeenCalledWith("ws-office");
    expect(refreshAccountRateLimits).toHaveBeenCalledWith("ws-office");
  });

  it("lands in a safe state with a clear error when the handoff workspace is missing", async () => {
    const remoteWorkspace: WorkspaceInfo = {
      id: "ws-other",
      name: "other",
      path: "/Users/me/dev/other",
      connected: true,
      settings: { sidebarCollapsed: false },
    };
    updateAppSettingsMock.mockResolvedValue(baseSettings);
    listWorkspacesMock.mockResolvedValue([remoteWorkspace]);

    const replaceWorkspaceState = vi.fn();
    const listThreadsForWorkspace = vi.fn().mockResolvedValue([]);
    const refreshThread = vi.fn().mockResolvedValue({
      ok: false,
      threadId: null,
      errorMessage: "missing",
    });

    const { result } = renderHook(() =>
      useRemoteBackendHandoff({
        appSettings: baseSettings,
        setAppSettings: vi.fn(),
        activeWorkspace,
        activeThreadId: null,
        connectWorkspace: vi.fn().mockResolvedValue(undefined),
        setActiveThreadId: vi.fn(),
        replaceWorkspaceState,
        resetThreadState: vi.fn(),
        listThreadsForWorkspace,
        refreshThread,
      }),
    );

    let applyResult: Awaited<
      ReturnType<typeof result.current.applyDesktopMobileHandoffPayload>
    > | null = null;
    await act(async () => {
      applyResult = await result.current.applyDesktopMobileHandoffPayload(
        JSON.stringify({
          version: 1,
          issuedAtMs: 1773705600000,
          remote: {
            provider: "tcp",
            host: "office.tailnet.ts.net:4732",
            token: "token-office",
            name: "Office Mac",
          },
          workspace: {
            id: "ws-missing",
            path: "/Users/me/dev/missing",
            name: "missing",
          },
        }),
      );
    });

    expect(applyResult).toEqual({
      ok: false,
      message: "Workspace not found on the remote backend.",
    });
    expect(replaceWorkspaceState).toHaveBeenCalledWith(
      [remoteWorkspace],
      { activeWorkspaceId: null, allowMissingActiveWorkspace: true },
    );
    expect(listThreadsForWorkspace).not.toHaveBeenCalled();
    expect(refreshThread).not.toHaveBeenCalled();
  });

  it("lands on the workspace with a clear error when the handoff thread is missing", async () => {
    const remoteWorkspace: WorkspaceInfo = {
      id: "ws-office",
      name: "codex-monitor",
      path: "/Users/me/dev/codex-monitor",
      connected: true,
      settings: { sidebarCollapsed: false },
    };
    updateAppSettingsMock.mockResolvedValue(baseSettings);
    listWorkspacesMock.mockResolvedValue([remoteWorkspace]);

    const setActiveThreadId = vi.fn();
    const replaceWorkspaceState = vi.fn();
    const listThreadsForWorkspace = vi.fn().mockResolvedValue([
      {
        id: "thread-other",
        name: "Other thread",
        updatedAt: 1,
      },
    ]);
    const refreshThread = vi.fn().mockResolvedValue({
      ok: false,
      threadId: null,
      errorMessage: "Unable to refresh the remote thread state.",
    });

    const { result } = renderHook(() =>
      useRemoteBackendHandoff({
        appSettings: baseSettings,
        setAppSettings: vi.fn(),
        activeWorkspace,
        activeThreadId: null,
        connectWorkspace: vi.fn().mockResolvedValue(undefined),
        setActiveThreadId,
        replaceWorkspaceState,
        resetThreadState: vi.fn(),
        listThreadsForWorkspace,
        refreshThread,
      }),
    );

    let applyResult: Awaited<
      ReturnType<typeof result.current.applyDesktopMobileHandoffPayload>
    > | null = null;
    await act(async () => {
      applyResult = await result.current.applyDesktopMobileHandoffPayload(
        JSON.stringify({
          version: 1,
          issuedAtMs: 1773705600000,
          remote: {
            provider: "tcp",
            host: "office.tailnet.ts.net:4732",
            token: "token-office",
            name: "Office Mac",
          },
          workspace: {
            id: "ws-office",
            path: "/Users/me/dev/codex-monitor",
            name: "codex-monitor",
          },
          thread: {
            id: "thread-missing",
            title: "Missing thread",
          },
        }),
      );
    });

    expect(applyResult).toEqual({
      ok: false,
      message: "Thread not found on the remote workspace.",
    });
    expect(replaceWorkspaceState).toHaveBeenCalledWith(
      [remoteWorkspace],
      { activeWorkspaceId: "ws-office" },
    );
    expect(refreshThread).toHaveBeenCalledWith("ws-office", "thread-missing");
    expect(setActiveThreadId).not.toHaveBeenCalled();
  });
});
