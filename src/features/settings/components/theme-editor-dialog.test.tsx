import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ParseKeys } from "i18next";
import { afterEach, describe, expect, it } from "vitest";
import { i18next } from "@/i18n";
import { useSettingsStore } from "../store";
import { ThemeEditorDialog } from "./theme-editor-dialog";
import { ThemesSection } from "./themes-section";

const t = (key: ParseKeys, options?: Record<string, unknown>) => i18next.t(key, options);

const VSCODE = JSON.stringify({
  name: "Paper",
  type: "light",
  colors: {
    "editor.background": "#ffffff",
    "editor.foreground": "#222222",
    "button.background": "#0055aa",
    "button.foreground": "#ffffff",
  },
});

function pick(content: string, name = "paper.json") {
  const input = screen.getByLabelText(t("settings.themes.import.file"));
  fireEvent.change(input, { target: { files: [new File([content], name, { type: "application/json" })] } });
}

function preview(): HTMLElement {
  return screen.getByTestId("theme-preview");
}

describe("the theme editor", () => {
  afterEach(() => {
    act(() => {
      useSettingsStore.setState({ customThemes: [], activeThemeId: null });
    });
  });

  it("imports a VS Code theme and previews it live", async () => {
    render(<ThemeEditorDialog theme={null} onClose={() => undefined} />);
    pick(VSCODE);
    await waitFor(() => expect(preview().style.getPropertyValue("--canvas")).toBe("#ffffff"));
    expect(preview().style.getPropertyValue("--accent")).toBe("#0055aa");
    expect(screen.getByLabelText<HTMLInputElement>(t("settings.themes.name")).value).toBe("Paper");
    expect(screen.getByText(t("settings.themes.import.done", { count: 5 }))).toBeTruthy();

    fireEvent.change(screen.getByLabelText(t("settings.themes.tokens.fg")), { target: { value: "rgb(0, 0, 0)" } });
    expect(preview().style.getPropertyValue("--fg")).toBe("#000000");
  });

  it("rejects a file that is not a theme", async () => {
    render(<ThemeEditorDialog theme={null} onClose={() => undefined} />);
    pick("{ nope");
    expect(await screen.findByText(t("settings.themes.import.invalid"))).toBeTruthy();
  });

  it("refuses invalid colors and warns about low contrast", () => {
    render(<ThemeEditorDialog theme={null} onClose={() => undefined} />);
    fireEvent.change(screen.getByLabelText(t("settings.themes.name")), { target: { value: "Mine" } });
    fireEvent.change(screen.getByLabelText(t("settings.themes.tokens.fg")), { target: { value: "#777777" } });
    fireEvent.change(screen.getByLabelText(t("settings.themes.tokens.canvas")), { target: { value: "#888888" } });
    expect(screen.getByRole("list", { name: t("settings.themes.lowContrast") })).toBeTruthy();
    expect(screen.getByRole<HTMLButtonElement>("button", { name: t("settings.themes.save") }).disabled).toBe(false);

    fireEvent.change(screen.getByLabelText(t("settings.themes.tokens.accent")), { target: { value: "blue" } });
    expect(screen.getByRole("alert").textContent).toBe(t("settings.themes.invalid"));
    expect(screen.getByRole<HTMLButtonElement>("button", { name: t("settings.themes.save") }).disabled).toBe(true);
  });

  it("saves the theme, applies it and lists it", async () => {
    render(<ThemesSection />);
    fireEvent.click(screen.getByRole("button", { name: t("settings.themes.new") }));
    pick(VSCODE);
    await waitFor(() => expect(preview().style.getPropertyValue("--canvas")).toBe("#ffffff"));
    fireEvent.click(screen.getByRole("button", { name: t("settings.themes.save") }));

    const saved = useSettingsStore.getState().customThemes;
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ name: "Paper", base: "light", colors: { canvas: "#ffffff", fg: "#222222" } });
    expect(useSettingsStore.getState().activeThemeId).toBe(saved[0]?.id);
    expect(screen.getByRole<HTMLInputElement>("radio", { name: /Paper/ }).checked).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: t("settings.themes.delete", { name: "Paper" }) }));
    expect(useSettingsStore.getState().customThemes).toHaveLength(0);
    expect(useSettingsStore.getState().activeThemeId).toBeNull();
  });

  it("does not offer a sixth theme", () => {
    useSettingsStore.setState({
      customThemes: ["a", "b", "c", "d", "e"].map((id) => ({ id, name: id, base: "dark", colors: { fg: "#ffffff" } })),
    });
    render(<ThemesSection />);
    expect(screen.getByRole<HTMLButtonElement>("button", { name: t("settings.themes.new") }).disabled).toBe(true);
  });
});
