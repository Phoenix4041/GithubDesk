import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { i18next } from "@/i18n";
import type { AppCommand } from "../command-model";
import { useCommandRegistry } from "../command-registry";
import { useCommandUiStore } from "../command-ui-store";
import { CommandPalette } from "./command-palette";

function command(id: string, titleKey: AppCommand["titleKey"], run: () => void, enabled = true): AppCommand {
  return { id, titleKey, group: "general", enabled, run };
}

const settingsTitle = () => i18next.t("commands.items.app.settings");
const shortcutsTitle = () => i18next.t("commands.items.app.shortcuts");

describe("CommandPalette", () => {
  let runSettings: ReturnType<typeof vi.fn<() => void>>;
  let runShortcuts: ReturnType<typeof vi.fn<() => void>>;

  beforeEach(() => {
    runSettings = vi.fn<() => void>();
    runShortcuts = vi.fn<() => void>();
    useCommandRegistry.getState().setSource("test", [
      command("app.settings", "commands.items.app.settings", runSettings),
      command("app.shortcuts", "commands.items.app.shortcuts", runShortcuts),
      command("palette.toggle", "commands.items.palette.toggle", () => undefined, false),
    ]);
  });

  afterEach(() => {
    act(() => {
      useCommandUiStore.getState().hidePalette();
      useCommandRegistry.getState().clearSource("test");
    });
  });

  function openPalette() {
    render(<CommandPalette />);
    act(() => useCommandUiStore.getState().showPalette());
  }

  it("stays closed until it is asked to open", () => {
    render(<CommandPalette />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("lists only the enabled commands and focuses the search box", () => {
    openPalette();
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getAllByRole("option")).toHaveLength(2);
    expect(document.activeElement).toBe(screen.getByRole("combobox"));
  });

  it("filters the list while typing and tells when nothing matches", () => {
    openPalette();
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "atajos" } });
    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(1);
    expect(options[0]?.textContent).toContain(shortcutsTitle());
    fireEvent.change(input, { target: { value: "zzzzzz" } });
    expect(screen.queryAllByRole("option")).toHaveLength(0);
    expect(screen.getByText(i18next.t("commands.palette.empty"))).toBeTruthy();
  });

  it("moves the selection with the arrow keys and announces it to assistive technology", () => {
    openPalette();
    const input = screen.getByRole("combobox");
    const first = screen.getAllByRole("option")[0];
    expect(first?.getAttribute("aria-selected")).toBe("true");
    expect(input.getAttribute("aria-activedescendant")).toBe(first?.id);
    fireEvent.keyDown(input, { key: "ArrowDown" });
    const second = screen.getAllByRole("option")[1];
    expect(second?.getAttribute("aria-selected")).toBe("true");
    expect(input.getAttribute("aria-activedescendant")).toBe(second?.id);
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(screen.getAllByRole("option")[0]?.getAttribute("aria-selected")).toBe("true");
  });

  it("runs the selected command with Enter and closes", () => {
    openPalette();
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "atajos" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(runShortcuts).toHaveBeenCalledTimes(1);
    expect(runSettings).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("runs a command that is clicked", () => {
    openPalette();
    const option = screen.getAllByRole("option").find((item) => item.textContent?.includes(settingsTitle()));
    expect(option).toBeDefined();
    if (option) {
      fireEvent.click(option);
    }
    expect(runSettings).toHaveBeenCalledTimes(1);
  });

  it("closes with Escape without running anything", () => {
    openPalette();
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(runSettings).not.toHaveBeenCalled();
    expect(runShortcuts).not.toHaveBeenCalled();
  });
});
