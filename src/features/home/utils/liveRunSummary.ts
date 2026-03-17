import {
  buildToolSummary,
  formatDurationMs,
  parseReasoning,
} from "@/features/messages/utils/messageRenderUtils";
import type { ConversationItem, RemotePresenceState, WorkspaceInfo } from "@/types";

type ActiveThreadStatus = {
  isProcessing?: boolean;
  isReviewing?: boolean;
  processingStartedAt?: number | null;
  lastDurationMs?: number | null;
};

type RemotePresenceSummary = {
  state: RemotePresenceState;
  label: string;
  title: string;
  detailLabel: string | null;
};

export type HomeLiveRunSummary = {
  workspaceId: string;
  threadId: string;
  workspaceName: string;
  threadTitle: string;
  runStatusLabel: "Running" | "Reviewing" | "Idle";
  runStatusTone: "running" | "reviewing" | "idle";
  remoteLabel: string;
  remoteState: RemotePresenceState;
  remoteTitle: string;
  remoteDetail: string | null;
  updatedAt: number | null;
  processingStartedAt: number | null;
  lastDurationMs: number | null;
  summaryText: string;
  actionMode: "interrupt" | "resume";
  actionBusy: boolean;
};

type BuildHomeLiveRunSummaryOptions = {
  isPhone: boolean;
  backendMode: "local" | "remote";
  activeWorkspace: WorkspaceInfo | null;
  activeThreadId: string | null;
  activeThreadTitle: string | null;
  activeThreadUpdatedAt: number | null;
  activeItems: ConversationItem[];
  lastAgentMessage: { text: string; timestamp: number } | null;
  threadStatus: ActiveThreadStatus | null;
  remotePresence: RemotePresenceSummary;
  resumeLoading: boolean;
};

function normalizeSummaryText(value: string | null | undefined): string | null {
  const normalized = (value ?? "").replace(/\s+/g, " ").trim();
  return normalized.length > 0 ? normalized : null;
}

function capitalizeLabel(value: string): string {
  if (!value) {
    return "";
  }
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function describeToolItem(item: Extract<ConversationItem, { kind: "tool" }>): string | null {
  const summary = buildToolSummary(item, item.detail || "");
  const lead = capitalizeLabel(summary.label || "tool");
  const value = normalizeSummaryText(summary.value);
  const detail =
    summary.detail && summary.detail !== summary.value
      ? normalizeSummaryText(summary.detail)
      : null;

  if (value && detail) {
    return `${lead}: ${value} · ${detail}`;
  }
  if (value) {
    return `${lead}: ${value}`;
  }
  if (detail) {
    return `${lead}: ${detail}`;
  }
  return lead;
}

function describeActiveItem(item: ConversationItem): string | null {
  switch (item.kind) {
    case "reasoning": {
      const reasoning = parseReasoning(item);
      return reasoning.workingLabel
        ? `Thinking: ${reasoning.workingLabel}`
        : "Thinking";
    }
    case "tool":
      return describeToolItem(item);
    case "explore":
      return `${item.status === "exploring" ? "Exploring" : "Explored"} ${item.entries.length} ${
        item.entries.length === 1 ? "source" : "sources"
      }`;
    case "userInput":
      return "Waiting for your input";
    case "review":
      return item.state === "completed" ? "Review completed" : "Review in progress";
    case "diff":
      return normalizeSummaryText(item.title) ?? "Diff updated";
    case "message":
      return item.role === "assistant" ? normalizeSummaryText(item.text) : null;
  }
  return null;
}

function findCurrentActivitySummary(items: ConversationItem[]): string | null {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const summary = describeActiveItem(items[index]);
    if (summary) {
      return summary;
    }
  }
  return null;
}

export function buildHomeLiveRunSummary({
  isPhone,
  backendMode,
  activeWorkspace,
  activeThreadId,
  activeThreadTitle,
  activeThreadUpdatedAt,
  activeItems,
  lastAgentMessage,
  threadStatus,
  remotePresence,
  resumeLoading,
}: BuildHomeLiveRunSummaryOptions): HomeLiveRunSummary | null {
  if (!isPhone || backendMode !== "remote" || !activeWorkspace || !activeThreadId) {
    return null;
  }

  const isProcessing = Boolean(threadStatus?.isProcessing);
  const isReviewing = Boolean(threadStatus?.isReviewing) && !isProcessing;
  const runStatusLabel = isProcessing ? "Running" : isReviewing ? "Reviewing" : "Idle";
  const runStatusTone = isProcessing ? "running" : isReviewing ? "reviewing" : "idle";
  const currentActivitySummary = findCurrentActivitySummary(activeItems);
  const lastAgentSummary = normalizeSummaryText(lastAgentMessage?.text);
  const fallbackSummary = isProcessing
    ? "Agent is working on the desktop run."
    : isReviewing
      ? "Review is active on the desktop thread."
      : "Open the thread to continue from mobile.";
  const latestTimestamp = Math.max(
    activeThreadUpdatedAt ?? 0,
    lastAgentMessage?.timestamp ?? 0,
  );

  return {
    workspaceId: activeWorkspace.id,
    threadId: activeThreadId,
    workspaceName: activeWorkspace.name,
    threadTitle: normalizeSummaryText(activeThreadTitle) ?? "Untitled thread",
    runStatusLabel,
    runStatusTone,
    remoteLabel: remotePresence.label,
    remoteState: remotePresence.state,
    remoteTitle: remotePresence.title,
    remoteDetail: normalizeSummaryText(remotePresence.detailLabel),
    updatedAt: latestTimestamp > 0 ? latestTimestamp : null,
    processingStartedAt: threadStatus?.processingStartedAt ?? null,
    lastDurationMs: threadStatus?.lastDurationMs ?? null,
    summaryText: currentActivitySummary ?? lastAgentSummary ?? fallbackSummary,
    actionMode: isProcessing ? "interrupt" : "resume",
    actionBusy: !isProcessing && resumeLoading,
  };
}

export function buildHomeLiveRunSummaryClipboardText(
  summary: HomeLiveRunSummary,
): string {
  const lines = [
    `Workspace: ${summary.workspaceName}`,
    `Thread: ${summary.threadTitle}`,
    `Run status: ${summary.runStatusLabel}`,
    `Remote status: ${summary.remoteLabel}`,
  ];

  if (summary.remoteDetail) {
    lines.push(`Remote detail: ${summary.remoteDetail}`);
  }
  if (summary.updatedAt) {
    lines.push(`Updated at: ${new Date(summary.updatedAt).toISOString()}`);
  }
  if (summary.processingStartedAt) {
    lines.push(`Started at: ${new Date(summary.processingStartedAt).toISOString()}`);
  } else if (summary.lastDurationMs !== null) {
    lines.push(`Last run duration: ${formatDurationMs(summary.lastDurationMs)}`);
  }
  lines.push(`Summary: ${summary.summaryText}`);

  return lines.join("\n");
}
