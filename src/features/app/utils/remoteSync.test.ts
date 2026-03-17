import { describe, expect, it, vi } from "vitest";

import {
  applyWorkspaceConnectionOverride,
  ensureConnectedWorkspace,
  resolveRemotePresence,
  resolveRemoteSyncBannerContent,
  selectLatestRemoteSyncFailure,
} from "./remoteSync";

describe("resolveRemotePresence", () => {
  it("reports an online backend for connected idle remote state", () => {
    expect(
      resolveRemotePresence({
        activeWorkspaceConnected: true,
        activeThreadId: null,
        activeThreadIsProcessing: false,
        workspaceSyncState: "fresh",
        threadConnectionState: "polling",
      }),
    ).toEqual({
      state: "online",
      label: "Online",
      title: "Remote backend online",
      detailLabel: null,
    });
  });

  it("reports a running remote session and surfaces reconnecting detail", () => {
    expect(
      resolveRemotePresence({
        activeWorkspaceConnected: true,
        activeThreadId: "thread-1",
        activeThreadIsProcessing: true,
        workspaceSyncState: "fresh",
        threadConnectionState: "polling",
      }),
    ).toEqual({
      state: "running",
      label: "Running",
      title: "Remote session running, reconnecting now",
      detailLabel: "Reconnecting",
    });
  });

  it("reports offline when the workspace is disconnected", () => {
    expect(
      resolveRemotePresence({
        activeWorkspaceConnected: false,
        activeThreadId: "thread-1",
        activeThreadIsProcessing: true,
        workspaceSyncState: "fresh",
        threadConnectionState: "live",
      }),
    ).toEqual({
      state: "offline",
      label: "Offline",
      title: "Remote backend offline",
      detailLabel: null,
    });
  });
});

describe("resolveRemoteSyncBannerContent", () => {
  it("keeps workspace refresh failures labeled as workspace stale when a thread is open", () => {
    expect(
      resolveRemoteSyncBannerContent({
        presenceState: "stale",
        activeThreadId: "thread-1",
        failure: {
          phase: "workspace_refresh",
          message: "remote backend disconnected",
          at: 1,
          workspaceId: "ws-1",
          threadId: null,
        },
      }),
    ).toEqual({
      state: "stale",
      title: "Remote backend state is stale",
      message: "Last sync failed: remote backend disconnected",
    });
  });

  it("labels thread sync failures as thread stale when a thread is open", () => {
    expect(
      resolveRemoteSyncBannerContent({
        presenceState: "stale",
        activeThreadId: "thread-1",
        failure: {
          phase: "thread_live",
          message: "Lost live connection to the remote thread.",
          at: 1,
          workspaceId: "ws-1",
          threadId: "thread-1",
        },
      }),
    ).toEqual({
      state: "stale",
      title: "Remote session state is stale",
      message: "Last sync failed: Lost live connection to the remote thread.",
    });
  });

  it("falls back to a disconnected reconnect prompt when no failure reason is available", () => {
    expect(
      resolveRemoteSyncBannerContent({
        presenceState: "offline",
        activeThreadId: "thread-1",
        failure: null,
      }),
    ).toEqual({
      state: "offline",
      title: "Remote backend is offline",
      message: "Reconnect to restore live data from the remote backend.",
    });
  });

  it("prefers the latest sync failure when workspace and thread failures both exist", () => {
    expect(
      selectLatestRemoteSyncFailure(
        {
          phase: "thread_live",
          message: "Lost live connection to the remote thread.",
          at: 10,
          workspaceId: "ws-1",
          threadId: "thread-1",
        },
        {
          phase: "workspace_refresh",
          message: "Unable to refresh remote workspaces.",
          at: 20,
          workspaceId: "ws-1",
          threadId: null,
        },
      ),
    ).toEqual({
      phase: "workspace_refresh",
      message: "Unable to refresh remote workspaces.",
      at: 20,
      workspaceId: "ws-1",
      threadId: null,
    });
  });

  it("keeps the thread failure when it is newer than the workspace failure", () => {
    expect(
      selectLatestRemoteSyncFailure(
        {
          phase: "thread_live",
          message: "Lost live connection to the remote thread.",
          at: 20,
          workspaceId: "ws-1",
          threadId: "thread-1",
        },
        {
          phase: "workspace_refresh",
          message: "Unable to refresh remote workspaces.",
          at: 10,
          workspaceId: "ws-1",
          threadId: null,
        },
      ),
    ).toEqual({
      phase: "thread_live",
      message: "Lost live connection to the remote thread.",
      at: 20,
      workspaceId: "ws-1",
      threadId: "thread-1",
    });
  });

  it("can force a workspace entry to connected after a successful reconnect", () => {
    expect(
      applyWorkspaceConnectionOverride(
        {
          id: "ws-1",
          name: "Workspace",
          path: "/tmp/ws-1",
          connected: false,
          settings: { sidebarCollapsed: false },
        },
        true,
      ),
    ).toMatchObject({
      id: "ws-1",
      connected: true,
    });
  });

  it("reconnects a disconnected workspace before continuing", async () => {
    const connectWorkspace = vi.fn().mockResolvedValue(undefined);

    await expect(
      ensureConnectedWorkspace(
        {
          id: "ws-1",
          name: "Workspace",
          path: "/tmp/ws-1",
          connected: false,
          settings: { sidebarCollapsed: false },
        },
        connectWorkspace,
      ),
    ).resolves.toMatchObject({
      id: "ws-1",
      connected: true,
    });
    expect(connectWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({ id: "ws-1", connected: false }),
    );
  });
});
