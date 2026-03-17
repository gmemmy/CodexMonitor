import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listWorkspaces } from "../../../services/tauri";
import type { AppSettings } from "../../../types";
import { isMobilePlatform } from "../../../utils/platformPaths";
import type { MobileServerSetupWizardProps } from "../components/MobileServerSetupWizard";

type UseMobileServerSetupParams = {
  appSettings: AppSettings;
  appSettingsLoading: boolean;
  queueSaveSettings: (next: AppSettings) => Promise<AppSettings>;
  refreshWorkspaces: () => Promise<unknown>;
  applyDesktopMobileHandoffPayload?: (
    payload: string,
  ) => Promise<{ ok: boolean; message: string }>;
};

type UseMobileServerSetupResult = {
  isMobileRuntime: boolean;
  showMobileSetupWizard: boolean;
  mobileSetupWizardProps: MobileServerSetupWizardProps;
  handleMobileConnectSuccess: () => Promise<void>;
};

function isRemoteServerConfigured(settings: AppSettings): boolean {
  return Boolean(settings.remoteBackendToken?.trim()) && Boolean(settings.remoteBackendHost.trim());
}

type RemoteBackendTarget = AppSettings["remoteBackends"][number];

function defaultMobileSetupMessage(): string {
  return "Enter your desktop Tailscale host and token, then run Connect & test.";
}

function getRemoteBackends(settings: AppSettings): RemoteBackendTarget[] {
  const existingBackends: AppSettings["remoteBackends"] =
    settings.remoteBackends.length > 0
      ? [...settings.remoteBackends]
      : [
          {
            id: settings.activeRemoteBackendId ?? "remote-default",
            name: "Primary remote",
            provider: "tcp" as const,
            host: settings.remoteBackendHost,
            token: settings.remoteBackendToken,
            lastConnectedAtMs: null,
          },
        ];
  return existingBackends;
}

function getActiveRemoteBackend(settings: AppSettings): RemoteBackendTarget {
  const existingBackends = getRemoteBackends(settings);
  const activeIndexById =
    settings.activeRemoteBackendId == null
      ? -1
      : existingBackends.findIndex((entry) => entry.id === settings.activeRemoteBackendId);
  const activeIndex = activeIndexById >= 0 ? activeIndexById : 0;
  return existingBackends[activeIndex] ?? existingBackends[0];
}

function buildSettingsForRemoteBackend(
  settings: AppSettings,
  remoteBackend: RemoteBackendTarget,
): AppSettings {
  return {
    ...settings,
    backendMode: "remote",
    remoteBackendProvider: "tcp",
    activeRemoteBackendId: remoteBackend.id,
    remoteBackendHost: remoteBackend.host,
    remoteBackendToken: remoteBackend.token,
  };
}

function markRemoteBackendConnected(
  settings: AppSettings,
  remoteBackendId: string,
  connectedAtMs: number,
): AppSettings {
  const existingBackends = getRemoteBackends(settings);
  const activeIndex = existingBackends.findIndex((entry) => entry.id === remoteBackendId);
  if (activeIndex < 0) {
    return settings;
  }
  const active = existingBackends[activeIndex];
  existingBackends[activeIndex] = {
    ...active,
    provider: "tcp",
    host:
      remoteBackendId === settings.activeRemoteBackendId ? settings.remoteBackendHost : active.host,
    token:
      remoteBackendId === settings.activeRemoteBackendId
        ? settings.remoteBackendToken
        : active.token,
    lastConnectedAtMs: connectedAtMs,
  };
  return {
    ...settings,
    remoteBackends: existingBackends,
    activeRemoteBackendId:
      remoteBackendId === settings.activeRemoteBackendId
        ? existingBackends[activeIndex]?.id ?? settings.activeRemoteBackendId
        : settings.activeRemoteBackendId,
  };
}

function maybePromoteLastSuccessfulRemoteBackend(
  settings: AppSettings,
  remoteBackendId: string,
  connectedAtMs: number,
): AppSettings {
  const existingBackends = getRemoteBackends(settings);
  const active = existingBackends.find((entry) => entry.id === remoteBackendId);
  if (!active) {
    return settings;
  }
  const highestLastConnectedAtMs = existingBackends.reduce((highest, entry) => {
    const nextValue =
      typeof entry.lastConnectedAtMs === "number" && Number.isFinite(entry.lastConnectedAtMs)
        ? entry.lastConnectedAtMs
        : null;
    if (nextValue === null) {
      return highest;
    }
    return nextValue > highest ? nextValue : highest;
  }, 0);
  if (
    typeof active.lastConnectedAtMs === "number" &&
    Number.isFinite(active.lastConnectedAtMs) &&
    active.lastConnectedAtMs >= highestLastConnectedAtMs
  ) {
    return settings;
  }
  return markRemoteBackendConnected(settings, remoteBackendId, connectedAtMs);
}

function isConfiguredRemoteBackend(entry: RemoteBackendTarget): boolean {
  return Boolean(entry.host.trim()) && Boolean(entry.token?.trim());
}

function selectLastSuccessfulRemoteBackend(settings: AppSettings): RemoteBackendTarget | null {
  const activeRemoteId = settings.activeRemoteBackendId;
  const candidates = getRemoteBackends(settings)
    .filter(
      (entry) =>
        entry.id !== activeRemoteId &&
        isConfiguredRemoteBackend(entry) &&
        typeof entry.lastConnectedAtMs === "number" &&
        Number.isFinite(entry.lastConnectedAtMs),
    )
    .sort((left, right) => (right.lastConnectedAtMs ?? 0) - (left.lastConnectedAtMs ?? 0));
  return candidates[0] ?? null;
}

function formatConnectedMessage(workspaceCount: number): string {
  const workspaceWord = workspaceCount === 1 ? "workspace" : "workspaces";
  return `Connected. ${workspaceCount} ${workspaceWord} available from your desktop backend.`;
}

function formatRestoreMessage(remoteName: string, workspaceCount: number): string {
  const workspaceWord = workspaceCount === 1 ? "workspace" : "workspaces";
  return `Restored "${remoteName}". ${workspaceCount} ${workspaceWord} available from your desktop backend.`;
}

function formatRestoreFailureMessage(initialMessage: string, remoteName: string): string {
  return `${initialMessage} Automatic restore to "${remoteName}" failed. Select a saved remote or update host/token.`;
}

export function useMobileServerSetup({
  appSettings,
  appSettingsLoading,
  queueSaveSettings,
  refreshWorkspaces,
  applyDesktopMobileHandoffPayload,
}: UseMobileServerSetupParams): UseMobileServerSetupResult {
  const isMobileRuntime = useMemo(() => isMobilePlatform(), []);

  const [remoteHostDraft, setRemoteHostDraft] = useState(appSettings.remoteBackendHost);
  const [remoteTokenDraft, setRemoteTokenDraft] = useState(appSettings.remoteBackendToken ?? "");
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusError, setStatusError] = useState(false);
  const [handoffPayloadDraft, setHandoffPayloadDraft] = useState("");
  const [handoffApplying, setHandoffApplying] = useState(false);
  const [mobileServerReady, setMobileServerReady] = useState(!isMobileRuntime);
  const [setupWizardDismissed, setSetupWizardDismissed] = useState(false);
  const latestSettingsRef = useRef(appSettings);
  const mobileServerReadyRef = useRef(!isMobileRuntime);
  const connectivityCheckInFlightRef = useRef(false);

  useEffect(() => {
    if (!isMobileRuntime) {
      return;
    }
    setRemoteHostDraft(appSettings.remoteBackendHost);
    setRemoteTokenDraft(appSettings.remoteBackendToken ?? "");
  }, [
    appSettings.remoteBackendHost,
    appSettings.remoteBackendToken,
    isMobileRuntime,
  ]);

  useEffect(() => {
    latestSettingsRef.current = appSettings;
  }, [appSettings]);

  useEffect(() => {
    mobileServerReadyRef.current = mobileServerReady;
  }, [mobileServerReady]);

  const runConnectivityCheck = useCallback(
    async (options?: { allowRestore?: boolean; announceSuccess?: boolean }) => {
      if (!isMobileRuntime) {
        return true;
      }
      if (connectivityCheckInFlightRef.current) {
        return mobileServerReadyRef.current;
      }
      connectivityCheckInFlightRef.current = true;
      setChecking(true);
      try {
        const currentSettings = latestSettingsRef.current;
        try {
          const entries = await listWorkspaces();
          try {
            await refreshWorkspaces();
          } catch {
            // Connectivity is confirmed by listWorkspaces; refresh is best-effort.
          }

          const activeRemoteBackend = getActiveRemoteBackend(currentSettings);
          const connectedSettings = maybePromoteLastSuccessfulRemoteBackend(
            currentSettings,
            activeRemoteBackend.id,
            Date.now(),
          );
          if (connectedSettings !== currentSettings) {
            try {
              await queueSaveSettings(connectedSettings);
            } catch {
              // Keep the verified connection even if recency persistence fails.
            }
          }

          setMobileServerReady(true);
          setSetupWizardDismissed(false);
          setStatusError(false);
          setStatusMessage(options?.announceSuccess ? formatConnectedMessage(entries.length) : null);
          return true;
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Unable to reach remote backend.";
          if (!options?.allowRestore) {
            setMobileServerReady(false);
            setStatusError(true);
            setStatusMessage(message);
            return false;
          }

          const lastSuccessfulRemoteBackend = selectLastSuccessfulRemoteBackend(currentSettings);
          if (!lastSuccessfulRemoteBackend) {
            setMobileServerReady(false);
            setStatusError(true);
            setStatusMessage(message);
            return false;
          }

          const restoreSettings = buildSettingsForRemoteBackend(
            currentSettings,
            lastSuccessfulRemoteBackend,
          );
          let savedRestoreSettings: AppSettings | null = null;
          try {
            savedRestoreSettings = await queueSaveSettings(restoreSettings);
            const restoredEntries = await listWorkspaces();
            try {
              await refreshWorkspaces();
            } catch {
              // Connectivity is confirmed by listWorkspaces; refresh is best-effort.
            }
            const connectedRestoreSettings = markRemoteBackendConnected(
              savedRestoreSettings,
              lastSuccessfulRemoteBackend.id,
              Date.now(),
            );
            try {
              await queueSaveSettings(connectedRestoreSettings);
            } catch {
              // Keep the restored backend selected even if timestamp persistence fails.
            }

            setMobileServerReady(true);
            setSetupWizardDismissed(false);
            setStatusError(false);
            setStatusMessage(formatRestoreMessage(lastSuccessfulRemoteBackend.name, restoredEntries.length));
            return true;
          } catch {
            if (savedRestoreSettings) {
              try {
                await queueSaveSettings(currentSettings);
              } catch {
                // Best-effort rollback so the user is not left on a broken restored target.
              }
            }
            setMobileServerReady(false);
            setStatusError(true);
            setStatusMessage(
              formatRestoreFailureMessage(message, lastSuccessfulRemoteBackend.name),
            );
            return false;
          }
        }
      } finally {
        setChecking(false);
        connectivityCheckInFlightRef.current = false;
      }
    },
    [isMobileRuntime, queueSaveSettings, refreshWorkspaces],
  );

  const onConnectTest = useCallback(() => {
    void (async () => {
      if (!isMobileRuntime || busy) {
        return;
      }

      const nextHost = remoteHostDraft.trim();
      const nextToken = remoteTokenDraft.trim() ? remoteTokenDraft.trim() : null;

      if (!nextHost || !nextToken) {
        setMobileServerReady(false);
        setStatusError(true);
        setStatusMessage(defaultMobileSetupMessage());
        return;
      }

      setBusy(true);
      setSetupWizardDismissed(false);
      setStatusError(false);
      setStatusMessage(null);
      try {
        const saved = await queueSaveSettings({
          ...appSettings,
          backendMode: "remote",
          remoteBackendProvider: "tcp",
          remoteBackendHost: nextHost,
          remoteBackendToken: nextToken,
        });
        const connected = await runConnectivityCheck({
          allowRestore: false,
          announceSuccess: true,
        });
        if (connected) {
          await queueSaveSettings(
            markRemoteBackendConnected(
              saved,
              saved.activeRemoteBackendId ?? getActiveRemoteBackend(saved).id,
              Date.now(),
            ),
          );
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unable to save remote backend settings.";
        setMobileServerReady(false);
        setStatusError(true);
        setStatusMessage(message);
      } finally {
        setBusy(false);
      }
    })();
  }, [
    appSettings,
    busy,
    isMobileRuntime,
    queueSaveSettings,
    remoteHostDraft,
    remoteTokenDraft,
    runConnectivityCheck,
  ]);

  const onApplyHandoff = useCallback(() => {
    void (async () => {
      if (!isMobileRuntime || handoffApplying) {
        return;
      }
      const payload = handoffPayloadDraft.trim();
      if (!payload) {
        setStatusError(true);
        setStatusMessage("Paste a desktop handoff payload first.");
        return;
      }
      if (!applyDesktopMobileHandoffPayload) {
        setStatusError(true);
        setStatusMessage("Desktop handoff is not available in this build.");
        return;
      }

      setHandoffApplying(true);
      setStatusError(false);
      setStatusMessage(null);
      try {
        const result = await applyDesktopMobileHandoffPayload(payload);
        setStatusError(!result.ok);
        setStatusMessage(result.message);
        if (result.ok) {
          setMobileServerReady(true);
          setSetupWizardDismissed(false);
          setHandoffPayloadDraft("");
        }
      } catch (error) {
        setStatusError(true);
        setStatusMessage(
          error instanceof Error
            ? error.message
            : "Unable to apply the desktop handoff payload.",
        );
      } finally {
        setHandoffApplying(false);
      }
    })();
  }, [
    applyDesktopMobileHandoffPayload,
    handoffApplying,
    handoffPayloadDraft,
    isMobileRuntime,
  ]);

  useEffect(() => {
    if (!isMobileRuntime || appSettingsLoading || busy) {
      return;
    }
    if (!isRemoteServerConfigured(appSettings)) {
      setMobileServerReady(false);
      setChecking(false);
      setStatusError(true);
      setStatusMessage(defaultMobileSetupMessage());
      return;
    }

    let active = true;

    void (async () => {
      const ok = await runConnectivityCheck({ allowRestore: true });
      if (active && !ok) {
        setStatusMessage((previous) => previous ?? "Unable to connect to remote backend.");
      }
    })();

    return () => {
      active = false;
    };
  }, [
    appSettings,
    appSettingsLoading,
    busy,
    isMobileRuntime,
    runConnectivityCheck,
  ]);

  useEffect(() => {
    if (!isMobileRuntime || appSettingsLoading) {
      return;
    }

    let didCleanup = false;
    let unlistenWindowFocus: (() => void) | null = null;

    const handleFocus = () => {
      if (busy || document.visibilityState !== "visible") {
        return;
      }
      void runConnectivityCheck({ allowRestore: true });
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") {
        return;
      }
      handleFocus();
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    try {
      const windowHandle = getCurrentWindow();
      windowHandle
        .listen("tauri://focus", handleFocus)
        .then((unlisten) => {
          if (didCleanup) {
            unlisten();
            return;
          }
          unlistenWindowFocus = unlisten;
        })
        .catch(() => {
          // Ignore non-Tauri environments.
        });
    } catch {
      // Ignore non-Tauri environments.
    }

    return () => {
      didCleanup = true;
      if (unlistenWindowFocus) {
        unlistenWindowFocus();
      }
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [appSettingsLoading, busy, isMobileRuntime, runConnectivityCheck]);

  const handleMobileConnectSuccess = useCallback(async () => {
    if (!isMobileRuntime) {
      return;
    }
    setStatusError(false);
    setStatusMessage(null);
    setMobileServerReady(true);
    setSetupWizardDismissed(false);
    try {
      await refreshWorkspaces();
    } catch {
      // Keep successful connectivity result even if local refresh fails.
    }
  }, [isMobileRuntime, refreshWorkspaces]);

  return {
    isMobileRuntime,
    showMobileSetupWizard:
      isMobileRuntime && !appSettingsLoading && !mobileServerReady && !setupWizardDismissed,
    mobileSetupWizardProps: {
      remoteHostDraft,
      remoteTokenDraft,
      busy,
      checking,
      handoffPayloadDraft,
      handoffApplying,
      statusMessage,
      statusError,
      onClose: () => {
        setSetupWizardDismissed(true);
      },
      onRemoteHostChange: setRemoteHostDraft,
      onRemoteTokenChange: setRemoteTokenDraft,
      onHandoffPayloadChange: setHandoffPayloadDraft,
      onConnectTest,
      onApplyHandoff,
    },
    handleMobileConnectSuccess,
  };
}
