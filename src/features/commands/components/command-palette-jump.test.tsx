import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { i18next } from "@/i18n";
import { useCommandRegistry } from "../command-registry";
import { useCommandUiStore } from "../command-ui-store";
import type { JumpTarget } from "../jump-model";
import { useJumpRegistry } from "../jump-registry";
import { CommandPalette } from "./command-palette";

describe("CommandPalette jump targets", () => {
  let openRepo: ReturnType<typeof vi.fn<() => void>>;

  beforeEach(() => {
    openRepo = vi.fn<() => void>();
    const targets: JumpTarget[] = [
      { id: "r", kind: "repository", title: "phoenix-api", subtitle: "/work/phoenix-api", run: openRepo },
      { id: "b", kind: "branch", title: "feature/phoenix-login", run: () => undefined },
      { id: "p", kind: "pull", title: "Fix phoenix crash", subtitle: "#12", run: () => undefined },
    ];
    useJumpRegistry.getState().setSource("test", targets);
    useCommandRegistry.getState().setSource("test", [
      { id: "app.settings", titleKey: "commands.items.app.settings", group: "general", enabled: true, run: () => undefined },
    ]);
  });

  afterEach(() => {
    act(() => {
      useCommandUiStore.getState().hidePalette();
      useJumpRegistry.getState().clearSource("test");
      useCommandRegistry.getState().clearSource("test");
    });
  });

  function openPalette() {
    render(<CommandPalette />);
    act(() => useCommandUiStore.getState().showPalette());
  }

  it("shows only commands until something is typed", () => {
    openPalette();
    expect(screen.getAllByRole("option")).toHaveLength(1);
  });

  it("lists matching repositories, branches and pull requests with their group labels", () => {
    openPalette();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "phoenix" } });
    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(3);
    expect(options[0]?.textContent).toContain(i18next.t("commands.jump.groups.repository"));
    expect(options[1]?.textContent).toContain(i18next.t("commands.jump.groups.branch"));
    expect(options[2]?.textContent).toContain(i18next.t("commands.jump.groups.pull"));
  });

  it("runs the target and closes the palette when it is chosen", () => {
    openPalette();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "phoenix-api" } });
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Enter" });
    expect(openRepo).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
