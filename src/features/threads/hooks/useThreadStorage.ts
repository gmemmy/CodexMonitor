import { useCallback, useEffect, useRef } from "react";
import type { MutableRefObject } from "react";
import {
  STORAGE_KEY_CUSTOM_NAMES,
  type CustomNamesMap,
  type ThreadActivityMap,
  loadCustomNames,
  loadThreadActivity,
  makeCustomNameKey,
  saveThreadActivity,
} from "@threads/utils/threadStorage";

type UseThreadStorageResult = {
  customNamesRef: MutableRefObject<CustomNamesMap>;
  threadActivityRef: MutableRefObject<ThreadActivityMap>;
  getCustomName: (workspaceId: string, threadId: string) => string | undefined;
  recordThreadActivity: (
    workspaceId: string,
    threadId: string,
    timestamp?: number,
  ) => void;
};

export function useThreadStorage(): UseThreadStorageResult {
  const threadActivityRef = useRef<ThreadActivityMap>(loadThreadActivity());
  const customNamesRef = useRef<CustomNamesMap>({});

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }
    customNamesRef.current = loadCustomNames();
    const handleStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY_CUSTOM_NAMES) {
        customNamesRef.current = loadCustomNames();
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const getCustomName = useCallback((workspaceId: string, threadId: string) => {
    const key = makeCustomNameKey(workspaceId, threadId);
    return customNamesRef.current[key];
  }, []);

  const recordThreadActivity = useCallback(
    (workspaceId: string, threadId: string, timestamp = Date.now()) => {
      const nextForWorkspace = {
        ...(threadActivityRef.current[workspaceId] ?? {}),
        [threadId]: timestamp,
      };
      const next = {
        ...threadActivityRef.current,
        [workspaceId]: nextForWorkspace,
      };
      threadActivityRef.current = next;
      saveThreadActivity(next);
    },
    [],
  );

  return {
    customNamesRef,
    threadActivityRef,
    getCustomName,
    recordThreadActivity,
  };
}
