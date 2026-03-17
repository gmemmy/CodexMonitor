// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PanelTabId } from "../../layout/components/PanelTabs";
import { PromptPanel } from "./PromptPanel";

const isMobilePlatform = vi.hoisted(() => vi.fn(() => false));

vi.mock("@tauri-apps/api/menu", () => ({
  Menu: { new: vi.fn() },
  MenuItem: { new: vi.fn() },
}));

vi.mock("@tauri-apps/api/dpi", () => ({
  LogicalPosition: vi.fn(),
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: vi.fn(),
}));

vi.mock("../../../utils/platformPaths", async () => {
  const actual = await vi.importActual<typeof import("../../../utils/platformPaths")>(
    "../../../utils/platformPaths",
  );
  return {
    ...actual,
    isMobilePlatform,
  };
});

const baseProps = {
  prompts: [],
  workspacePath: "/tmp/workspace",
  filePanelMode: "prompts" as PanelTabId,
  onFilePanelModeChange: vi.fn(),
  onSendPrompt: vi.fn(),
  onSendPromptToNewAgent: vi.fn(),
  onCreatePrompt: vi.fn(),
  onUpdatePrompt: vi.fn(),
  onDeletePrompt: vi.fn(),
  onMovePrompt: vi.fn(),
  onRevealWorkspacePrompts: vi.fn(),
  onRevealGeneralPrompts: vi.fn(),
  canRevealGeneralPrompts: true,
};

describe("PromptPanel", () => {
  afterEach(() => {
    vi.clearAllMocks();
    isMobilePlatform.mockReturnValue(false);
  });

  it("degrades folder reveal affordances to read-only text on mobile", () => {
    isMobilePlatform.mockReturnValue(true);

    render(<PromptPanel {...baseProps} />);

    expect(screen.getByText("workspace prompts folder")).toBeTruthy();
    expect(screen.getByText("CODEX_HOME/prompts")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "workspace prompts folder" })).toBeNull();
    expect(screen.queryByRole("button", { name: "CODEX_HOME/prompts" })).toBeNull();
    expect(
      screen.getAllByText((content) =>
        content.includes("Folder reveal is available on desktop only."),
      ),
    ).toHaveLength(2);
  });
});
