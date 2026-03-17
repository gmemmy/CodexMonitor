import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Home } from "./Home";

const baseProps = {
  onAddWorkspace: vi.fn(),
  onAddWorkspaceFromUrl: vi.fn(),
  liveRunSummary: null,
  onInterruptLiveRun: vi.fn(),
  onResumeLiveRun: vi.fn(),
  latestAgentRuns: [],
  isLoadingLatestAgents: false,
  localUsageSnapshot: null,
  isLoadingLocalUsage: false,
  localUsageError: null,
  onRefreshLocalUsage: vi.fn(),
  usageMetric: "tokens" as const,
  onUsageMetricChange: vi.fn(),
  usageWorkspaceId: null,
  usageWorkspaceOptions: [],
  onUsageWorkspaceChange: vi.fn(),
  onSelectThread: vi.fn(),
};

function renderFunctionComponent(node: ReactElement): ReactNode {
  const component = node.type as (props: typeof node.props) => ReactNode;
  return component(node.props);
}

function collectText(node: ReactNode): string[] {
  if (
    typeof node === "string" ||
    typeof node === "number" ||
    typeof node === "bigint"
  ) {
    return [String(node)];
  }
  if (Array.isArray(node)) {
    return node.flatMap((child) => collectText(child));
  }
  if (!isValidElement<{ children?: ReactNode }>(node)) {
    return [];
  }
  if (typeof node.type === "function") {
    return collectText(renderFunctionComponent(node));
  }
  return collectText(node.props.children);
}

function findButtons(
  node: ReactNode,
): Array<ReactElement<{ children?: ReactNode; disabled?: boolean; onClick?: () => void }>> {
  if (!isValidElement<{ children?: ReactNode }>(node)) {
    return [];
  }
  if (typeof node.type === "function") {
    return findButtons(renderFunctionComponent(node));
  }
  const matches =
    node.type === "button"
      ? [
          node as ReactElement<{
            children?: ReactNode;
            disabled?: boolean;
            onClick?: () => void;
          }>,
        ]
      : [];
  return [
    ...matches,
    ...Children.toArray(node.props.children).flatMap((child) => findButtons(child)),
  ];
}

function findButtonByText(
  node: ReactNode,
  text: string,
): ReactElement<{ children?: ReactNode; disabled?: boolean; onClick?: () => void }> | null {
  return findButtons(node).find((button) => collectText(button).includes(text)) ?? null;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Home", () => {
  it("renders the active desktop live run card and wires its actions", () => {
    const onSelectThread = vi.fn();
    const onInterruptLiveRun = vi.fn();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { clipboard: { writeText } },
    });

    const result = Home({
      ...baseProps,
      liveRunSummary: {
        workspaceId: "workspace-1",
        threadId: "thread-1",
        workspaceName: "CodexMonitor",
        threadTitle: "Fix remote handoff flow",
        runStatusLabel: "Running",
        runStatusTone: "running",
        remoteLabel: "Live",
        remoteState: "live",
        remoteTitle: "Remote session live",
        remoteDetail: "Run active",
        updatedAt: Date.now() - 60_000,
        processingStartedAt: Date.now() - 30_000,
        lastDurationMs: null,
        summaryText: "Command: npm run test",
        actionMode: "interrupt",
        actionBusy: false,
      },
      onInterruptLiveRun,
      onSelectThread,
    });

    expect(collectText(result)).toContain("Active on desktop");
    expect(collectText(result)).toContain("Fix remote handoff flow");
    expect(collectText(result)).toContain("Command: npm run test");

    const openThreadButton = findButtonByText(result, "Open thread");
    expect(openThreadButton).not.toBeNull();
    openThreadButton?.props.onClick?.();
    expect(onSelectThread).toHaveBeenCalledWith("workspace-1", "thread-1");

    const interruptButton = findButtonByText(result, "Interrupt");
    expect(interruptButton).not.toBeNull();
    interruptButton?.props.onClick?.();
    expect(onInterruptLiveRun).toHaveBeenCalledTimes(1);

    const copyButton = findButtonByText(result, "Copy summary");
    expect(copyButton).not.toBeNull();
    copyButton?.props.onClick?.();
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("Workspace: CodexMonitor"),
    );
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("Thread: Fix remote handoff flow"),
    );
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("Summary: Command: npm run test"),
    );
  });

  it("renders latest agent runs and lets you open a thread", () => {
    const onSelectThread = vi.fn();
    const result = Home({
      ...baseProps,
      latestAgentRuns: [
        {
          message: "Ship the dashboard refresh",
          timestamp: Date.now(),
          projectName: "CodexMonitor",
          groupName: "Frontend",
          workspaceId: "workspace-1",
          threadId: "thread-1",
          isProcessing: true,
        },
      ],
      onSelectThread,
    });

    expect(collectText(result)).toContain("Latest agents");
    expect(collectText(result)).toContain("CodexMonitor");
    expect(collectText(result)).toContain("Frontend");
    const cardButton = findButtonByText(result, "Ship the dashboard refresh");
    expect(cardButton).not.toBeNull();
    cardButton?.props.onClick?.();
    expect(onSelectThread).toHaveBeenCalledWith("workspace-1", "thread-1");
    expect(collectText(result)).toContain("Running");
  });

  it("shows a busy resume action for an idle live run", () => {
    const result = Home({
      ...baseProps,
      liveRunSummary: {
        workspaceId: "workspace-2",
        threadId: "thread-2",
        workspaceName: "Desktop backend",
        threadTitle: "Inspect active thread state",
        runStatusLabel: "Idle",
        runStatusTone: "idle",
        remoteLabel: "Polling",
        remoteState: "polling",
        remoteTitle: "Remote session polling",
        remoteDetail: "Refreshing cached data",
        updatedAt: Date.now(),
        processingStartedAt: null,
        lastDurationMs: 4_000,
        summaryText: "Open the thread to continue from mobile.",
        actionMode: "resume",
        actionBusy: true,
      },
    });

    const button = findButtonByText(result, "Resuming...");
    expect(button).not.toBeNull();
    expect(button?.props.disabled).toBe(true);
    expect(
      collectText(result).some((entry) => entry.includes("Refreshing cached data")),
    ).toBe(true);
  });

  it("shows the empty state when there are no latest runs", () => {
    const result = Home(baseProps);

    expect(collectText(result)).toContain("No agent activity yet");
    expect(collectText(result)).toContain(
      "Start a thread to see the latest responses here.",
    );
  });

  it("renders usage cards in time mode", () => {
    const result = Home({
      ...baseProps,
      usageMetric: "time",
      localUsageSnapshot: {
        updatedAt: Date.now(),
        days: [
          {
            day: "2026-01-20",
            inputTokens: 10,
            cachedInputTokens: 0,
            outputTokens: 5,
            totalTokens: 15,
            agentTimeMs: 120000,
            agentRuns: 2,
          },
        ],
        totals: {
          last7DaysTokens: 15,
          last30DaysTokens: 15,
          averageDailyTokens: 15,
          cacheHitRatePercent: 0,
          peakDay: "2026-01-20",
          peakDayTokens: 15,
        },
        topModels: [],
      },
    });

    const text = collectText(result);
    expect(text).toContain("agent time");
    expect(text).toContain("Runs");
    expect(text).toContain("Peak day");
  });
});
