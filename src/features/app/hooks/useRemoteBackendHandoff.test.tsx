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
    const replaceWorkspaceState = vi.fn();
    const resetThreadState = vi.fn();
    const listThreadsForWorkspace = vi.fn().mockResolvedValue(undefined);
    const refreshAccountInfo = vi.fn().mockResolvedValue(undefined);
    const refreshAccountRateLimits = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useRemoteBackendHandoff({
        appSettings: baseSettings,
        setAppSettings,
        activeWorkspace,
        connectWorkspace,
        replaceWorkspaceState,
        resetThreadState,
        listThreadsForWorkspace,
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
    const replaceWorkspaceState = vi.fn();
    const resetThreadState = vi.fn();
    const listThreadsForWorkspace = vi.fn().mockResolvedValue(undefined);
    const refreshAccountInfo = vi.fn().mockResolvedValue(undefined);
    const refreshAccountRateLimits = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useRemoteBackendHandoff({
        appSettings: baseSettings,
        setAppSettings,
        activeWorkspace,
        connectWorkspace,
        replaceWorkspaceState,
        resetThreadState,
        listThreadsForWorkspace,
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
    const replaceWorkspaceState = vi.fn();
    const resetThreadState = vi.fn();
    const listThreadsForWorkspace = vi.fn().mockResolvedValue(undefined);
    const refreshAccountInfo = vi.fn().mockResolvedValue(undefined);
    const refreshAccountRateLimits = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useRemoteBackendHandoff({
        appSettings: baseSettings,
        setAppSettings: vi.fn(),
        activeWorkspace,
        connectWorkspace,
        replaceWorkspaceState,
        resetThreadState,
        listThreadsForWorkspace,
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
});
