import { describe, expect, it, vi } from "vitest";

import {
  applyWorkspaceConnectionOverride,
  ensureConnectedWorkspace,
  resolveRemoteSyncBannerContent,
} from "./remoteSync";

describe("resolveRemoteSyncBannerContent", () => {
  it("keeps workspace refresh failures labeled as workspace stale when a thread is open", () => {
    expect(
      resolveRemoteSyncBannerContent({
        connectionState: "stale",
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
      title: "Remote workspace data is stale",
      message: "Last sync failed: remote backend disconnected",
    });
  });

  it("labels thread sync failures as thread stale when a thread is open", () => {
    expect(
      resolveRemoteSyncBannerContent({
        connectionState: "stale",
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
      title: "Remote thread data is stale",
      message: "Last sync failed: Lost live connection to the remote thread.",
    });
  });

  it("falls back to a disconnected reconnect prompt when no failure reason is available", () => {
    expect(
      resolveRemoteSyncBannerContent({
        connectionState: "disconnected",
        activeThreadId: "thread-1",
        failure: null,
      }),
    ).toEqual({
      state: "disconnected",
      title: "Remote backend disconnected",
      message: "Reconnect to restore live data from the remote backend.",
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
