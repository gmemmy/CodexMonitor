import { useCallback, useState, type MouseEvent } from "react";
import { Menu, MenuItem } from "@tauri-apps/api/menu";
import { LogicalPosition } from "@tauri-apps/api/dpi";
import { getCurrentWindow } from "@tauri-apps/api/window";

import type { WorkspaceInfo } from "../../../types";
import { triggerHapticFeedback } from "../../../services/tauri";
import { pushErrorToast } from "../../../services/toasts";
import { fileManagerName } from "../../../utils/platformPaths";

type SidebarMenuHandlers = {
  onDeleteThread: (workspaceId: string, threadId: string) => void;
  onSyncThread: (workspaceId: string, threadId: string) => void;
  onPinThread: (workspaceId: string, threadId: string) => void;
  onUnpinThread: (workspaceId: string, threadId: string) => void;
  isThreadPinned: (workspaceId: string, threadId: string) => boolean;
  onRenameThread: (workspaceId: string, threadId: string) => void;
  onReloadWorkspaceThreads: (workspaceId: string) => void;
  onDeleteWorkspace: (workspaceId: string) => void;
  onDeleteWorktree: (workspaceId: string) => void;
};

type ThreadMenuAction = {
  id: "rename" | "sync" | "pin" | "copy-id" | "archive";
  label: string;
  destructive?: boolean;
  onSelect: () => void | Promise<void>;
};

type MobileThreadMenuState = {
  workspaceId: string;
  threadId: string;
  threadName: string;
  actions: ThreadMenuAction[];
} | null;

export function useSidebarMenus({
  onDeleteThread,
  onSyncThread,
  onPinThread,
  onUnpinThread,
  isThreadPinned,
  onRenameThread,
  onReloadWorkspaceThreads,
  onDeleteWorkspace,
  onDeleteWorktree,
}: SidebarMenuHandlers) {
  const [mobileThreadMenu, setMobileThreadMenu] = useState<MobileThreadMenuState>(null);

  const buildThreadMenuActions = useCallback(
    (workspaceId: string, threadId: string, canPin: boolean): ThreadMenuAction[] => {
      const actions: ThreadMenuAction[] = [
        {
          id: "rename",
          label: "Rename",
          onSelect: () => onRenameThread(workspaceId, threadId),
        },
        {
          id: "sync",
          label: "Sync from server",
          onSelect: () => onSyncThread(workspaceId, threadId),
        },
      ];
      if (canPin) {
        const isPinned = isThreadPinned(workspaceId, threadId);
        actions.push({
          id: "pin",
          label: isPinned ? "Unpin" : "Pin",
          onSelect: () => {
            if (isPinned) {
              onUnpinThread(workspaceId, threadId);
              return;
            }
            onPinThread(workspaceId, threadId);
          },
        });
      }
      actions.push(
        {
          id: "copy-id",
          label: "Copy ID",
          onSelect: async () => {
            try {
              await navigator.clipboard.writeText(threadId);
            } catch {
              // Clipboard failures are non-fatal here.
            }
          },
        },
        {
          id: "archive",
          label: "Archive",
          destructive: true,
          onSelect: () => onDeleteThread(workspaceId, threadId),
        },
      );
      return actions;
    },
    [
      isThreadPinned,
      onDeleteThread,
      onPinThread,
      onRenameThread,
      onSyncThread,
      onUnpinThread,
    ],
  );

  const showThreadMenu = useCallback(
    async (
      event: MouseEvent,
      workspaceId: string,
      threadId: string,
      canPin: boolean,
    ) => {
      event.preventDefault();
      event.stopPropagation();
      const actions = buildThreadMenuActions(workspaceId, threadId, canPin);
      const items = await Promise.all(
        actions.map((action) =>
          MenuItem.new({
            text: action.label,
            action: action.onSelect,
          }),
        ),
      );
      const menu = await Menu.new({ items });
      const window = getCurrentWindow();
      const position = new LogicalPosition(event.clientX, event.clientY);
      await menu.popup(position, window);
    },
    [buildThreadMenuActions],
  );

  const openMobileThreadMenu = useCallback(
    async (
      workspaceId: string,
      threadId: string,
      threadName: string,
      canPin: boolean,
    ) => {
      setMobileThreadMenu({
        workspaceId,
        threadId,
        threadName,
        actions: buildThreadMenuActions(workspaceId, threadId, canPin),
      });
      await triggerHapticFeedback();
    },
    [buildThreadMenuActions],
  );

  const closeMobileThreadMenu = useCallback(() => {
    setMobileThreadMenu(null);
  }, []);

  const showWorkspaceMenu = useCallback(
    async (event: MouseEvent, workspaceId: string) => {
      event.preventDefault();
      event.stopPropagation();
      const reloadItem = await MenuItem.new({
        text: "Reload threads",
        action: () => onReloadWorkspaceThreads(workspaceId),
      });
      const deleteItem = await MenuItem.new({
        text: "Delete",
        action: () => onDeleteWorkspace(workspaceId),
      });
      const menu = await Menu.new({ items: [reloadItem, deleteItem] });
      const window = getCurrentWindow();
      const position = new LogicalPosition(event.clientX, event.clientY);
      await menu.popup(position, window);
    },
    [onReloadWorkspaceThreads, onDeleteWorkspace],
  );

  const showWorktreeMenu = useCallback(
    async (event: MouseEvent, worktree: WorkspaceInfo) => {
      event.preventDefault();
      event.stopPropagation();
      const fileManagerLabel = fileManagerName();
      const reloadItem = await MenuItem.new({
        text: "Reload threads",
        action: () => onReloadWorkspaceThreads(worktree.id),
      });
      const revealItem = await MenuItem.new({
        text: `Show in ${fileManagerLabel}`,
        action: async () => {
          if (!worktree.path) {
            return;
          }
          try {
            const { revealItemInDir } = await import(
              "@tauri-apps/plugin-opener"
            );
            await revealItemInDir(worktree.path);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            pushErrorToast({
              title: `Couldn't show worktree in ${fileManagerLabel}`,
              message,
            });
            console.warn("Failed to reveal worktree", {
              message,
              workspaceId: worktree.id,
              path: worktree.path,
            });
          }
        },
      });
      const deleteItem = await MenuItem.new({
        text: "Delete worktree",
        action: () => onDeleteWorktree(worktree.id),
      });
      const menu = await Menu.new({ items: [reloadItem, revealItem, deleteItem] });
      const window = getCurrentWindow();
      const position = new LogicalPosition(event.clientX, event.clientY);
      await menu.popup(position, window);
    },
    [onReloadWorkspaceThreads, onDeleteWorktree],
  );

  const showCloneMenu = useCallback(
    async (event: MouseEvent, clone: WorkspaceInfo) => {
      event.preventDefault();
      event.stopPropagation();
      const fileManagerLabel = fileManagerName();
      const reloadItem = await MenuItem.new({
        text: "Reload threads",
        action: () => onReloadWorkspaceThreads(clone.id),
      });
      const revealItem = await MenuItem.new({
        text: `Show in ${fileManagerLabel}`,
        action: async () => {
          if (!clone.path) {
            return;
          }
          try {
            const { revealItemInDir } = await import(
              "@tauri-apps/plugin-opener"
            );
            await revealItemInDir(clone.path);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            pushErrorToast({
              title: `Couldn't show clone in ${fileManagerLabel}`,
              message,
            });
            console.warn("Failed to reveal clone", {
              message,
              workspaceId: clone.id,
              path: clone.path,
            });
          }
        },
      });
      const deleteItem = await MenuItem.new({
        text: "Delete clone",
        action: () => onDeleteWorkspace(clone.id),
      });
      const menu = await Menu.new({ items: [reloadItem, revealItem, deleteItem] });
      const window = getCurrentWindow();
      const position = new LogicalPosition(event.clientX, event.clientY);
      await menu.popup(position, window);
    },
    [onReloadWorkspaceThreads, onDeleteWorkspace],
  );

  return {
    showThreadMenu,
    openMobileThreadMenu,
    closeMobileThreadMenu,
    mobileThreadMenu,
    showWorkspaceMenu,
    showWorktreeMenu,
    showCloneMenu,
  };
}
