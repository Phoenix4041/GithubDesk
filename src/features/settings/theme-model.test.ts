import { describe, expect, it } from "vitest";
import {
  MAX_CUSTOM_THEMES,
  ThemeImportError,
  contrastRatio,
  contrastWarnings,
  densityClass,
  normalizeColor,
  parseVsCodeTheme,
  sanitizeColors,
  stripJsonComments,
  themeVariables,
  upsertTheme,
} from "./theme-model";
import type { CustomTheme } from "./theme-model";

describe("color validation", () => {
  it.each([
    ["#ABC", "#aabbcc"],
    ["#abcd", "#aabbcc"],
    ["#112233", "#112233"],
    ["#11223380", "#112233"],
    ["rgb(255, 0, 10)", "#ff000a"],
    ["rgba(1,2,3,0.5)", "#010203"],
    ["  #FFFFFF ", "#ffffff"],
  ])("accepts %s", (input, expected) => {
    expect(normalizeColor(input)).toBe(expected);
  });

  it.each([["red"], ["#12345"], ["rgb(300,0,0)"], ["var(--x)"], ["url(x)"], ["hsl(0,0%,0%)"], [""], ["#ggg"]])(
    "rejects %s",
    (input) => {
      expect(normalizeColor(input)).toBeNull();
    },
  );

  it("rejects values that are not text", () => {
    expect(normalizeColor(12)).toBeNull();
    expect(normalizeColor(null)).toBeNull();
  });
});

describe("contrast", () => {
  it("measures the WCAG ratio", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#336699", "#336699")).toBeCloseTo(1, 5);
  });

  it("warns about low contrast pairs only", () => {
    const warnings = contrastWarnings({ fg: "#777777", canvas: "#888888", surface: "#000000", muted: "#ffffff" });
    expect(warnings.map((warning) => `${warning.foreground}/${warning.background}`)).toEqual(["fg/canvas"]);
  });
});

describe("VS Code theme import", () => {
  const theme = `{
    // comment
    "name": "Night Owl",
    "type": "dark",
    "colors": {
      "editor.background": "#011627",
      "editor.foreground": "#d6deeb",
      "button.background": "#7e57c2cc",
      "focusBorder": "#122d42",
      "errorForeground": "#EF5350",
      "sideBar.background": "notacolor",
      "editorWidget.background": "rgb(1, 22, 39)",
      "url": "https://example.com/*not a comment*/",
    },
    /* block */
    "tokenColors": []
  }`;

  it("strips comments and trailing commas outside strings", () => {
    expect(JSON.parse(stripJsonComments('{"a": "x//y", /* c */ "b": [1,],}'))).toEqual({ a: "x//y", b: [1] });
  });

  it("maps the known keys and skips invalid colors", () => {
    const imported = parseVsCodeTheme(theme, "file");
    expect(imported.name).toBe("Night Owl");
    expect(imported.base).toBe("dark");
    expect(imported.colors.canvas).toBe("#011627");
    expect(imported.colors.fg).toBe("#d6deeb");
    expect(imported.colors.accent).toBe("#7e57c2");
    expect(imported.colors.danger).toBe("#ef5350");
    expect(imported.colors.surface).toBe("#011627");
    expect(imported.colors.subtle).toBe("#011627");
    expect(imported.rejected).toContain("sideBar.background");
  });

  it("guesses the base from the background when there is no type", () => {
    const imported = parseVsCodeTheme('{"colors":{"editor.background":"#fafafa"}}', "Light one");
    expect(imported.base).toBe("light");
    expect(imported.name).toBe("Light one");
  });

  it("rejects files without usable colors", () => {
    expect(() => parseVsCodeTheme("not json", "x")).toThrow(ThemeImportError);
    expect(() => parseVsCodeTheme('{"colors": []}', "x")).toThrow(ThemeImportError);
    expect(() => parseVsCodeTheme('{"colors": {"editor.background": "blue"}}', "x")).toThrow(ThemeImportError);
    expect(() => parseVsCodeTheme(" ".repeat(600 * 1024), "x")).toThrow(ThemeImportError);
  });
});

describe("saved themes", () => {
  const make = (id: string): CustomTheme => ({ id, name: id, base: "dark", colors: {} });

  it("keeps at most five themes and replaces by id", () => {
    let list: CustomTheme[] = [];
    for (let index = 0; index < MAX_CUSTOM_THEMES + 2; index += 1) {
      list = upsertTheme(list, make(`t${index}`));
    }
    expect(list).toHaveLength(MAX_CUSTOM_THEMES);
    const renamed = upsertTheme(list, { ...make("t0"), name: "Renamed" });
    expect(renamed[0]?.name).toBe("Renamed");
    expect(renamed).toHaveLength(MAX_CUSTOM_THEMES);
  });

  it("keeps only valid colors for known tokens", () => {
    expect(sanitizeColors({ fg: "#FFF", canvas: "javascript:alert(1)", other: "#000" })).toEqual({ fg: "#ffffff" });
  });

  it("turns colors into CSS variables", () => {
    expect(themeVariables({ fg: "#ffffff", accent: "bad" })).toEqual([["--fg", "#ffffff"]]);
  });

  it("names the density class", () => {
    expect(densityClass("normal")).toBeNull();
    expect(densityClass("compact")).toBe("density-compact");
    expect(densityClass("comfortable")).toBe("density-comfortable");
  });
});
