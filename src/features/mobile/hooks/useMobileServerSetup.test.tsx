// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { useCallback, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppSettings, WorkspaceInfo } from "../../../types";
import { listWorkspaces } from "../../../services/tauri";
import { isMobilePlatform } from "../../../utils/platformPaths";
import { useMobileServerSetup } from "./useMobileServerSetup";

const windowListeners = new Map<string, Set<() => void>>();
const listenMock = vi.fn<
  (eventName: string, handler: () => void) => Promise<() => void>
>();

function registerWindowListener(eventName: string, handler: () => void) {
  const handlers = windowListeners.get(eventName) ?? new Set<() => void>();
  handlers.add(handler);
  windowListeners.set(eventName, handlers);
  return () => {
    handlers.delete(handler);
  };
}

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    listen: listenMock,
  }),
}));

vi.mock("../../../services/tauri", () => ({
  listWorkspaces: vi.fn(),
}));

vi.mock("../../../utils/platformPaths", () => ({
  isMobilePlatform: vi.fn(() => true),
}));

const listWorkspacesMock = vi.mocked(listWorkspaces);
const isMobilePlatformMock = vi.mocked(isMobilePlatform);

const reachableWorkspace: WorkspaceInfo = {
  id: "ws-1",
  name: "CodexMonitor",
  path: "/tmp/codex-monitor",
  connected: true,
  settings: { sidebarCollapsed: false },
};

function buildSettings(overrides: Partial<AppSettings> = {}): AppSettings {
  return {
    backendMode: "remote",
    remoteBackendProvider: "tcp",
    remoteBackendHost: "broken.tailnet.ts.net:4732",
    remoteBackendToken: "token-broken",
    remoteBackends: [
      {
        id: "remote-good",
        name: "Good Remote",
        provider: "tcp",
        host: "good.tailnet.ts.net:4732",
        token: "token-good",
        lastConnectedAtMs: 1700000000000,
      },
      {
        id: "remote-broken",
        name: "Broken Remote",
        provider: "tcp",
        host: "broken.tailnet.ts.net:4732",
        token: "token-broken",
        lastConnectedAtMs: null,
      },
    ],
    activeRemoteBackendId: "remote-broken",
    ...overrides,
  } as AppSettings;
}

function useMobileServerSetupHarness(
  initialSettings: AppSettings,
  queueSaveSettingsSpy: ReturnType<typeof vi.fn>,
  refreshWorkspaces: ReturnType<typeof vi.fn>,
  applyDesktopMobileHandoffPayload?: ReturnType<typeof vi.fn>,
  appSettingsLoading = false,
) {
  const [settings, setSettings] = useState(initialSettings);
  const queueSaveSettings = useCallback(
    async (next: AppSettings) => {
      queueSaveSettingsSpy(next);
      setSettings(next);
      return next;
    },
    [queueSaveSettingsSpy],
  );

  return {
    settings,
    ...useMobileServerSetup({
      appSettings: settings,
      appSettingsLoading,
      queueSaveSettings,
      refreshWorkspaces,
      applyDesktopMobileHandoffPayload,
    }),
  };
}

describe("useMobileServerSetup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    windowListeners.clear();
    listenMock.mockReset();
    listenMock.mockImplementation(async (eventName: string, handler: () => void) =>
      registerWindowListener(eventName, handler),
    );
    isMobilePlatformMock.mockReturnValue(true);
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("restores the last successful saved remote when the active remote is unreachable on load", async () => {
    listWorkspacesMock
      .mockRejectedValueOnce(new Error("dial tcp timeout"))
      .mockResolvedValueOnce([reachableWorkspace]);

    const queueSaveSettings = vi.fn(async (next: AppSettings) => next);
    const refreshWorkspaces = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useMobileServerSetupHarness(
        buildSettings(),
        queueSaveSettings,
        refreshWorkspaces,
        undefined,
      ),
    );

    await waitFor(() => expect(result.current.settings.activeRemoteBackendId).toBe("remote-good"));

    expect(queueSaveSettings).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        activeRemoteBackendId: "remote-good",
        remoteBackendHost: "good.tailnet.ts.net:4732",
        remoteBackendToken: "token-good",
      }),
    );
    expect(queueSaveSettings).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        activeRemoteBackendId: "remote-good",
        remoteBackends: expect.arrayContaining([
          expect.objectContaining({
            id: "remote-good",
            lastConnectedAtMs: expect.any(Number),
          }),
        ]),
      }),
    );
    expect(refreshWorkspaces).toHaveBeenCalled();
    expect(result.current.showMobileSetupWizard).toBe(false);
    expect(result.current.mobileSetupWizardProps.statusError).toBe(false);
  });

  it("rechecks remote connectivity on focus while mobile runtime is active", async () => {
    const connectedSettings = buildSettings({
      activeRemoteBackendId: "remote-good",
      remoteBackendHost: "good.tailnet.ts.net:4732",
      remoteBackendToken: "token-good",
    });
    listWorkspacesMock.mockResolvedValue([reachableWorkspace]);

    const queueSaveSettings = vi.fn(async (next: AppSettings) => next);
    const refreshWorkspaces = vi.fn().mockResolvedValue(undefined);

    renderHook(() =>
      useMobileServerSetupHarness(
        connectedSettings,
        queueSaveSettings,
        refreshWorkspaces,
        undefined,
      ),
    );

    await waitFor(() => expect(listWorkspacesMock).toHaveBeenCalledTimes(1));

    listWorkspacesMock.mockClear();
    refreshWorkspaces.mockClear();

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });

    await waitFor(() => expect(listWorkspacesMock).toHaveBeenCalledTimes(1));
    expect(refreshWorkspaces).toHaveBeenCalledTimes(1);
  });

  it("falls back to manual recovery when restore also fails", async () => {
    listWorkspacesMock
      .mockRejectedValueOnce(new Error("active remote offline"))
      .mockRejectedValueOnce(new Error("restored remote offline"));

    const initialSettings = buildSettings();
    const queueSaveSettings = vi.fn(async (next: AppSettings) => next);
    const refreshWorkspaces = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useMobileServerSetupHarness(
        initialSettings,
        queueSaveSettings,
        refreshWorkspaces,
        undefined,
      ),
    );

    await waitFor(() => expect(listWorkspacesMock).toHaveBeenCalledTimes(2));

    expect(queueSaveSettings).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        activeRemoteBackendId: "remote-good",
      }),
    );
    expect(queueSaveSettings).toHaveBeenNthCalledWith(2, initialSettings);
    expect(refreshWorkspaces).not.toHaveBeenCalled();
    expect(result.current.showMobileSetupWizard).toBe(true);
    expect(result.current.mobileSetupWizardProps.statusError).toBe(true);
    expect(result.current.mobileSetupWizardProps.statusMessage).toBe(
      'active remote offline Automatic restore to "Good Remote" failed. Select a saved remote or update host/token.',
    );
  });

  it("applies a desktop handoff payload through the mobile setup wizard", async () => {
    listWorkspacesMock.mockRejectedValue(new Error("connect manually"));

    const queueSaveSettings = vi.fn(async (next: AppSettings) => next);
    const refreshWorkspaces = vi.fn().mockResolvedValue(undefined);
    const applyDesktopMobileHandoffPayload = vi.fn().mockResolvedValue({
      ok: true,
      message: 'Connected to "Office Mac" and resumed "Fix remote handoff flow" in "codex-monitor".',
    });

    const { result } = renderHook(() =>
      useMobileServerSetupHarness(
        buildSettings({
          remoteBackendHost: "",
          remoteBackendToken: null,
          remoteBackends: [],
          activeRemoteBackendId: null,
        }),
        queueSaveSettings,
        refreshWorkspaces,
        applyDesktopMobileHandoffPayload,
      ),
    );

    await waitFor(() => expect(result.current.showMobileSetupWizard).toBe(true));

    act(() => {
      result.current.mobileSetupWizardProps.onHandoffPayloadChange('{"version":1}');
    });

    await act(async () => {
      result.current.mobileSetupWizardProps.onApplyHandoff();
    });

    await waitFor(() =>
      expect(applyDesktopMobileHandoffPayload).toHaveBeenCalledWith('{"version":1}'),
    );
    expect(result.current.mobileSetupWizardProps.statusError).toBe(false);
    expect(result.current.mobileSetupWizardProps.statusMessage).toBe(
      'Connected to "Office Mac" and resumed "Fix remote handoff flow" in "codex-monitor".',
    );
    expect(result.current.showMobileSetupWizard).toBe(false);
  });
});
