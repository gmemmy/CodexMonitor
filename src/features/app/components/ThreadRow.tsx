import {
  useEffect,
  useRef,
  type CSSProperties,
  type MouseEvent,
  type PointerEvent,
} from "react";

import type { ThreadSummary } from "../../../types";
import { getThreadStatusClass, type ThreadStatusById } from "../../../utils/threadStatus";
import { isMobilePlatform } from "../../../utils/platformPaths";

const MOBILE_THREAD_LONG_PRESS_MS = 450;
const MOBILE_THREAD_LONG_PRESS_MOVE_TOLERANCE = 10;

type ThreadRowProps = {
  thread: ThreadSummary;
  depth: number;
  workspaceId: string;
  indentUnit: number;
  activeWorkspaceId: string | null;
  activeThreadId: string | null;
  threadStatusById: ThreadStatusById;
  pendingUserInputKeys?: Set<string>;
  workspaceLabel?: string | null;
  getThreadTime: (thread: ThreadSummary) => string | null;
  getThreadArgsBadge?: (workspaceId: string, threadId: string) => string | null;
  isThreadPinned: (workspaceId: string, threadId: string) => boolean;
  onSelectThread: (workspaceId: string, threadId: string) => void;
  onShowThreadMenu: (
    event: MouseEvent,
    workspaceId: string,
    threadId: string,
    canPin: boolean,
  ) => void;
  onShowMobileThreadMenu: (
    workspaceId: string,
    threadId: string,
    threadName: string,
    canPin: boolean,
  ) => void;
  hasSubagentChildren?: boolean;
  subagentsExpanded?: boolean;
  onToggleSubagents?: (workspaceId: string, threadId: string) => void;
};

export function ThreadRow({
  thread,
  depth,
  workspaceId,
  indentUnit,
  activeWorkspaceId,
  activeThreadId,
  threadStatusById,
  pendingUserInputKeys,
  workspaceLabel,
  getThreadTime,
  getThreadArgsBadge,
  isThreadPinned,
  onSelectThread,
  onShowThreadMenu,
  onShowMobileThreadMenu,
  hasSubagentChildren = false,
  subagentsExpanded = true,
  onToggleSubagents,
}: ThreadRowProps) {
  const longPressTimerRef = useRef<number | null>(null);
  const suppressClickRef = useRef(false);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const mobilePlatform = isMobilePlatform();

  const clearLongPress = () => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    pointerStartRef.current = null;
  };

  useEffect(() => clearLongPress, []);

  const relativeTime = getThreadTime(thread);
  const badge = getThreadArgsBadge?.(workspaceId, thread.id) ?? null;
  const modelBadge =
    thread.modelId && thread.modelId.trim().length > 0
      ? thread.effort && thread.effort.trim().length > 0
        ? `${thread.modelId} · ${thread.effort}`
        : thread.modelId
      : null;
  const indentStyle =
    depth > 0
      ? ({ "--thread-indent": `${depth * indentUnit}px` } as CSSProperties)
      : undefined;
  const hasPendingUserInput = Boolean(
    pendingUserInputKeys?.has(`${workspaceId}:${thread.id}`),
  );
  const statusClass = getThreadStatusClass(
    threadStatusById[thread.id],
    hasPendingUserInput,
  );
  const canPin = depth === 0;
  const isPinned = canPin && isThreadPinned(workspaceId, thread.id);
  const canToggleSubagents = hasSubagentChildren && Boolean(onToggleSubagents);

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!mobilePlatform || event.pointerType === "mouse") {
      return;
    }
    if (event.target instanceof Element && event.target.closest("button")) {
      return;
    }
    clearLongPress();
    suppressClickRef.current = false;
    pointerStartRef.current = { x: event.clientX, y: event.clientY };
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTimerRef.current = null;
      pointerStartRef.current = null;
      suppressClickRef.current = true;
      onShowMobileThreadMenu(workspaceId, thread.id, thread.name, canPin);
    }, MOBILE_THREAD_LONG_PRESS_MS);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!mobilePlatform || longPressTimerRef.current === null || !pointerStartRef.current) {
      return;
    }
    const deltaX = event.clientX - pointerStartRef.current.x;
    const deltaY = event.clientY - pointerStartRef.current.y;
    if (Math.hypot(deltaX, deltaY) > MOBILE_THREAD_LONG_PRESS_MOVE_TOLERANCE) {
      clearLongPress();
    }
  };

  const handlePointerEnd = () => {
    clearLongPress();
  };

  return (
    <div
      className={`thread-row ${
        workspaceId === activeWorkspaceId && thread.id === activeThreadId
          ? "active"
          : ""
      }${canToggleSubagents ? " has-subagent-children" : ""}`}
      style={indentStyle}
      onClick={(event) => {
        if (suppressClickRef.current) {
          suppressClickRef.current = false;
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        onSelectThread(workspaceId, thread.id);
      }}
      onContextMenu={(event) => {
        if (mobilePlatform) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        onShowThreadMenu(event, workspaceId, thread.id, canPin);
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onPointerLeave={handlePointerEnd}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelectThread(workspaceId, thread.id);
        }
      }}
    >
      <span className={`thread-status ${statusClass}`} aria-hidden />
      {isPinned && <span className="thread-pin-icon" aria-label="Pinned">📌</span>}
      <span className="thread-name">{thread.name}</span>
      <div className="thread-meta">
        {workspaceLabel && <span className="thread-workspace-label">{workspaceLabel}</span>}
        {modelBadge && (
          <span className="thread-model-badge" title={modelBadge}>
            {modelBadge}
          </span>
        )}
        {badge && <span className="thread-args-badge">{badge}</span>}
        {canToggleSubagents ? (
          <button
            type="button"
            className={`thread-subagent-time-toggle ${subagentsExpanded ? "expanded" : ""}`}
            onClick={(event) => {
              event.stopPropagation();
              onToggleSubagents?.(workspaceId, thread.id);
            }}
            data-tauri-drag-region="false"
            aria-label={subagentsExpanded ? "Hide sub-agents" : "Show sub-agents"}
            aria-expanded={subagentsExpanded}
          >
            <span className="thread-subagent-time-label">{relativeTime ?? ""}</span>
            <span className="thread-subagent-toggle-icon" aria-hidden>
              ›
            </span>
          </button>
        ) : (
          relativeTime && <span className="thread-time">{relativeTime}</span>
        )}
        <div className="thread-menu">
          <div className="thread-menu-trigger" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}
