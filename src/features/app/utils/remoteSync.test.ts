import { describe, expect, it, vi } from "vitest";

import {
  applyWorkspaceConnectionOverride,
  ensureConnectedWorkspace,
  resolveRemotePresence,
  resolveRemoteSyncBannerContent,
  selectLatestRemoteSyncFailure,
} from "./remoteSync";

describe("resolveRemotePresence", () => {
  it("reports a live workspace for connected idle remote state", () => {
    expect(
      resolveRemotePresence({
        activeWorkspaceConnected: true,
        activeThreadId: null,
        activeThreadIsProcessing: false,
        workspaceSyncState: "fresh",
        threadConnectionState: "polling",
      }),
    ).toEqual({
      state: "live",
      scope: "workspace",
      label: "Live",
      title: "Remote workspace live",
      detailLabel: null,
    });
  });

  it("reports a polling remote session and surfaces cached-data detail", () => {
    expect(
      resolveRemotePresence({
        activeWorkspaceConnected: true,
        activeThreadId: "thread-1",
        activeThreadIsProcessing: true,
        workspaceSyncState: "fresh",
        threadConnectionState: "polling",
      }),
    ).toEqual({
      state: "polling",
      scope: "session",
      label: "Polling",
      title: "Remote session polling",
      detailLabel: "Refreshing cached data",
    });
  });

  it("surfaces the failure source when the thread live stream drops", () => {
    expect(
      resolveRemotePresence({
        activeWorkspaceConnected: true,
        activeThreadId: "thread-1",
        activeThreadIsProcessing: true,
        workspaceSyncState: "stale",
        threadConnectionState: "stale",
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
      scope: "session",
      label: "Stale",
      title: "Remote session stale",
      detailLabel: "Live stream dropped",
    });
  });

  it("reports disconnected when the workspace connection drops", () => {
    expect(
      resolveRemotePresence({
        activeWorkspaceConnected: false,
        activeThreadId: "thread-1",
        activeThreadIsProcessing: true,
        workspaceSyncState: "fresh",
        threadConnectionState: "live",
      }),
    ).toEqual({
      state: "disconnected",
      scope: "workspace",
      label: "Disconnected",
      title: "Remote workspace disconnected",
      detailLabel: "Reconnect required",
    });
  });
});

describe("resolveRemoteSyncBannerContent", () => {
  it("keeps workspace refresh failures labeled as workspace stale when a thread is open", () => {
    expect(
      resolveRemoteSyncBannerContent({
        surface: "workspace",
        presenceState: "stale",
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
      title: "Remote workspace stale",
      message:
        "Showing cached remote workspace data until the next successful refresh. Last workspace refresh failed: remote backend disconnected",
    });
  });

  it("labels thread sync failures as thread stale when a thread is open", () => {
    expect(
      resolveRemoteSyncBannerContent({
        surface: "session",
        presenceState: "stale",
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
      title: "Remote session stale",
      message:
        "Showing cached remote session data until the next successful refresh. Last live update failed: Lost live connection to the remote thread.",
    });
  });

  it("falls back to a disconnected reconnect prompt when no failure reason is available", () => {
    expect(
      resolveRemoteSyncBannerContent({
        surface: "workspace",
        presenceState: "disconnected",
        failure: null,
      }),
    ).toEqual({
      state: "disconnected",
      title: "Remote workspace disconnected",
      message: "Showing cached remote workspace data until reconnect succeeds.",
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
