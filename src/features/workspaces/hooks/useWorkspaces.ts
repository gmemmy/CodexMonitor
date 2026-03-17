import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AppSettings,
  DebugEntry,
  RemoteSyncFailure,
  RemoteWorkspaceSyncState,
  WorkspaceGroup,
  WorkspaceInfo,
  WorkspaceSettings,
} from "../../../types";
import {
  RESERVED_GROUP_NAME,
  buildGroupedWorkspaces,
  buildWorkspaceById,
  buildWorkspaceGroupById,
  getWorkspaceGroupNameById,
  sortWorkspaceGroups,
} from "../domain/workspaceGroups";
import {
  MAX_PINS_SOFT_LIMIT,
  buildPinnedThreadsVersionKey,
  getWorkspacePinnedThreads,
} from "../utils/pinnedThreads";
import {
  useWorkspaceCrud,
  type AddWorkspacesFromPathsResult,
} from "./useWorkspaceCrud";
import { useWorkspaceGroupOps } from "./useWorkspaceGroupOps";
import { useWorktreeOps } from "./useWorktreeOps";

export type UseWorkspacesOptions = {
  onDebug?: (entry: DebugEntry) => void;
  appSettings?: AppSettings;
  onUpdateAppSettings?: (next: AppSettings) => Promise<AppSettings>;
};

export type UseWorkspacesResult = {
  workspaces: WorkspaceInfo[];
  workspaceGroups: WorkspaceGroup[];
  groupedWorkspaces: ReturnType<typeof buildGroupedWorkspaces>;
  getWorkspaceGroupName: (workspaceId: string) => string | null;
  ungroupedLabel: string;
  activeWorkspace: WorkspaceInfo | null;
  activeWorkspaceId: string | null;
  setActiveWorkspaceId: (workspaceId: string | null) => void;
  replaceWorkspaceState: (
    workspaces: WorkspaceInfo[],
    options?: { activeWorkspaceId?: string | null },
  ) => void;
  addWorkspaceFromPath: (path: string, options?: { activate?: boolean }) => Promise<WorkspaceInfo | null>;
  addWorkspaceFromGitUrl: (
    url: string,
    destinationPath: string,
    targetFolderName?: string | null,
    options?: { activate?: boolean },
  ) => Promise<WorkspaceInfo | null>;
  addWorkspacesFromPaths: (paths: string[]) => Promise<AddWorkspacesFromPathsResult>;
  filterWorkspacePaths: (paths: string[]) => Promise<string[]>;
  addCloneAgent: (source: WorkspaceInfo, copyName: string, copiesFolder: string) => Promise<WorkspaceInfo | null>;
  addWorktreeAgent: (
    parent: WorkspaceInfo,
    branch: string,
    options?: {
      activate?: boolean;
      displayName?: string | null;
      copyAgentsMd?: boolean;
    },
  ) => Promise<WorkspaceInfo | null>;
  connectWorkspace: (entry: WorkspaceInfo) => Promise<void>;
  markWorkspaceConnected: (id: string) => void;
  updateWorkspaceSettings: (workspaceId: string, patch: Partial<WorkspaceSettings>) => Promise<WorkspaceInfo>;
  pinnedThreadsVersion: number;
  pinThread: (workspaceId: string, threadId: string) => boolean;
  unpinThread: (workspaceId: string, threadId: string) => void;
  isThreadPinned: (workspaceId: string, threadId: string) => boolean;
  getPinTimestamp: (workspaceId: string, threadId: string) => number | null;
  createWorkspaceGroup: (name: string) => Promise<WorkspaceGroup | null>;
  renameWorkspaceGroup: (groupId: string, name: string) => Promise<true | null>;
  moveWorkspaceGroup: (groupId: string, direction: "up" | "down") => Promise<true | null>;
  deleteWorkspaceGroup: (groupId: string) => Promise<true | null>;
  assignWorkspaceGroup: (workspaceId: string, groupId: string | null) => Promise<true | null>;
  removeWorkspace: (workspaceId: string) => Promise<void>;
  removeWorktree: (workspaceId: string) => Promise<void>;
  renameWorktree: (workspaceId: string, branch: string) => Promise<WorkspaceInfo>;
  renameWorktreeUpstream: (workspaceId: string, oldBranch: string, newBranch: string) => Promise<void>;
  deletingWorktreeIds: Set<string>;
  hasLoaded: boolean;
  refreshWorkspaces: () => Promise<WorkspaceInfo[] | undefined>;
  remoteWorkspaceSyncState: RemoteWorkspaceSyncState;
  lastRemoteSyncFailure: RemoteSyncFailure | null;
};

export function useWorkspaces(options: UseWorkspacesOptions = {}): UseWorkspacesResult {
  const [workspaces, setWorkspaces] = useState<WorkspaceInfo[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [remoteWorkspaceSyncState, setRemoteWorkspaceSyncState] =
    useState<RemoteWorkspaceSyncState>("fresh");
  const [lastRemoteSyncFailure, setLastRemoteSyncFailure] =
    useState<RemoteSyncFailure | null>(null);
  const workspaceSettingsRef = useRef<Map<string, WorkspaceSettings>>(new Map());
  const { onDebug, appSettings, onUpdateAppSettings } = options;

  const {
    addWorkspaceFromPath,
    addWorkspaceFromGitUrl,
    addWorkspacesFromPaths,
    connectWorkspace,
    filterWorkspacePaths,
    markWorkspaceConnected,
    pinThread: pinWorkspaceThread,
    refreshWorkspaces,
    removeWorkspace,
    unpinThread: unpinWorkspaceThread,
    updateWorkspaceSettings,
  } = useWorkspaceCrud({
    onDebug,
    backendMode: appSettings?.backendMode ?? "local",
    workspaces,
    setWorkspaces,
    setActiveWorkspaceId,
    workspaceSettingsRef,
    setHasLoaded,
    setRemoteWorkspaceSyncState,
    setLastRemoteSyncFailure,
  });

  useEffect(() => {
    if (appSettings?.backendMode === "remote") {
      return;
    }
    setRemoteWorkspaceSyncState("fresh");
    setLastRemoteSyncFailure(null);
  }, [appSettings?.backendMode]);

  useEffect(() => {
    void refreshWorkspaces();
  }, [refreshWorkspaces]);

  useEffect(() => {
    const next = new Map<string, WorkspaceSettings>();
    workspaces.forEach((entry) => {
      next.set(entry.id, entry.settings);
    });
    workspaceSettingsRef.current = next;
  }, [workspaces]);

  const activeWorkspace = useMemo(
    () => workspaces.find((entry) => entry.id === activeWorkspaceId) ?? null,
    [activeWorkspaceId, workspaces],
  );

  const pinnedThreadsVersionKey = useMemo(
    () => buildPinnedThreadsVersionKey(workspaces),
    [workspaces],
  );
  const pinnedThreadsVersionKeyRef = useRef<string | null>(null);
  const pinnedThreadsVersionRef = useRef(0);
  if (pinnedThreadsVersionKeyRef.current !== pinnedThreadsVersionKey) {
    pinnedThreadsVersionKeyRef.current = pinnedThreadsVersionKey;
    pinnedThreadsVersionRef.current += 1;
  }
  const pinnedThreadsVersion = pinnedThreadsVersionRef.current;

  const replaceWorkspaceState = useCallback(
    (
      nextWorkspaces: WorkspaceInfo[],
      options?: { activeWorkspaceId?: string | null },
    ) => {
      setWorkspaces(nextWorkspaces);
      setRemoteWorkspaceSyncState("fresh");
      setLastRemoteSyncFailure(null);
      setHasLoaded(true);
      setActiveWorkspaceId(() => {
        const preferredWorkspaceId = options?.activeWorkspaceId ?? null;
        if (
          preferredWorkspaceId &&
          nextWorkspaces.some((workspace) => workspace.id === preferredWorkspaceId)
        ) {
          return preferredWorkspaceId;
        }
        return nextWorkspaces[0]?.id ?? null;
      });
    },
    [
      setActiveWorkspaceId,
      setHasLoaded,
      setLastRemoteSyncFailure,
      setRemoteWorkspaceSyncState,
      setWorkspaces,
    ],
  );

  const workspaceById = useMemo(() => buildWorkspaceById(workspaces), [workspaces]);

  const isThreadPinned = useCallback(
    (workspaceId: string, threadId: string) =>
      threadId in getWorkspacePinnedThreads(workspaceById.get(workspaceId)?.settings),
    [workspaceById],
  );

  const getPinTimestamp = useCallback(
    (workspaceId: string, threadId: string) =>
      getWorkspacePinnedThreads(workspaceById.get(workspaceId)?.settings)[threadId] ?? null,
    [workspaceById],
  );

  const pinThread = useCallback(
    (workspaceId: string, threadId: string) => {
      if (!workspaceById.has(workspaceId)) {
        return false;
      }
      if (isThreadPinned(workspaceId, threadId)) {
        return false;
      }
      const currentPins = getWorkspacePinnedThreads(workspaceById.get(workspaceId)?.settings);
      if (Object.keys(currentPins).length >= MAX_PINS_SOFT_LIMIT) {
        console.warn(
          `Pin limit reached (${MAX_PINS_SOFT_LIMIT}). Consider unpinning some threads.`,
        );
      }
      void pinWorkspaceThread(workspaceId, threadId).catch(() => {});
      return true;
    },
    [isThreadPinned, pinWorkspaceThread, workspaceById],
  );

  const unpinThread = useCallback(
    (workspaceId: string, threadId: string) => {
      if (!workspaceById.has(workspaceId)) {
        return;
      }
      if (!isThreadPinned(workspaceId, threadId)) {
        return;
      }
      void unpinWorkspaceThread(workspaceId, threadId).catch(() => {});
    },
    [isThreadPinned, unpinWorkspaceThread, workspaceById],
  );

  const workspaceGroups = useMemo(
    () => sortWorkspaceGroups(appSettings?.workspaceGroups ?? []),
    [appSettings?.workspaceGroups],
  );

  const workspaceGroupById = useMemo(
    () => buildWorkspaceGroupById(workspaceGroups),
    [workspaceGroups],
  );

  const groupedWorkspaces = useMemo(
    () => buildGroupedWorkspaces(workspaces, workspaceGroups),
    [workspaceGroups, workspaces],
  );

  const getWorkspaceGroupName = useCallback(
    (workspaceId: string) =>
      getWorkspaceGroupNameById(workspaceId, workspaceById, workspaceGroupById),
    [workspaceById, workspaceGroupById],
  );

  const {
    addCloneAgent,
    addWorktreeAgent,
    deletingWorktreeIds,
    removeWorktree,
    renameWorktree,
    renameWorktreeUpstream,
  } = useWorktreeOps({
    onDebug,
    setWorkspaces,
    setActiveWorkspaceId,
  });

  const {
    assignWorkspaceGroup,
    createWorkspaceGroup,
    deleteWorkspaceGroup,
    moveWorkspaceGroup,
    renameWorkspaceGroup,
  } = useWorkspaceGroupOps({
    appSettings,
    onUpdateAppSettings,
    workspaceGroups,
    workspaceGroupById,
    workspaces,
    updateWorkspaceSettings,
  });

  return {
    workspaces,
    workspaceGroups,
    groupedWorkspaces,
    getWorkspaceGroupName,
    ungroupedLabel: RESERVED_GROUP_NAME,
    activeWorkspace,
    activeWorkspaceId,
    setActiveWorkspaceId,
    replaceWorkspaceState,
    addWorkspaceFromPath,
    addWorkspaceFromGitUrl,
    addWorkspacesFromPaths,
    filterWorkspacePaths,
    addCloneAgent,
    addWorktreeAgent,
    connectWorkspace,
    markWorkspaceConnected,
    updateWorkspaceSettings,
    pinnedThreadsVersion,
    pinThread,
    unpinThread,
    isThreadPinned,
    getPinTimestamp,
    createWorkspaceGroup,
    renameWorkspaceGroup,
    moveWorkspaceGroup,
    deleteWorkspaceGroup,
    assignWorkspaceGroup,
    removeWorkspace,
    removeWorktree,
    renameWorktree,
    renameWorktreeUpstream,
    deletingWorktreeIds,
    hasLoaded,
    refreshWorkspaces,
    remoteWorkspaceSyncState,
    lastRemoteSyncFailure,
  };
}
