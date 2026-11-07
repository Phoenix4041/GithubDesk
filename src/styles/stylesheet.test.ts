import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const stylesheet = readFileSync(resolve(process.cwd(), "src/styles/index.css"), "utf8");

const AA_NORMAL_TEXT = 4.5;

function tokensOf(selector: string): Record<string, string> {
  const start = stylesheet.indexOf(`${selector} {`);
  const end = stylesheet.indexOf("}", start);
  const tokens: Record<string, string> = {};
  for (const match of stylesheet.slice(start, end).matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6});/g)) {
    const [, name, value] = match;
    if (name && value) {
      tokens[name] = value;
    }
  }
  return tokens;
}

function channel(hex: string, offset: number): number {
  const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  return 0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5);
}

function contrast(first: string, second: string): number {
  const [light, dark] = [luminance(first), luminance(second)].sort((left, right) => right - left);
  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05);
}

const TEXT_PAIRS: Array<[string, string]> = [
  ["fg", "canvas"],
  ["fg", "surface"],
  ["fg", "subtle"],
  ["muted", "canvas"],
  ["muted", "surface"],
  ["muted", "subtle"],
  ["muted", "hunk-bg"],
  ["accent-fg", "accent"],
  ["accent-fg", "accent-hover"],
  ["accent", "surface"],
  ["accent", "canvas"],
  ["accent", "accent-soft"],
  ["danger", "surface"],
  ["danger", "danger-soft"],
  ["success", "surface"],
  ["warning", "surface"],
  ["add", "add-bg"],
  ["del", "del-bg"],
  ["add", "surface"],
  ["del", "surface"],
  ["syn-keyword", "surface"],
  ["syn-string", "surface"],
  ["syn-comment", "surface"],
  ["syn-number", "surface"],
  ["syn-type", "surface"],
  ["syn-property", "surface"],
  ["syn-function", "surface"],
  ["syn-operator", "surface"],
  ["syn-keyword", "add-bg"],
  ["syn-comment", "add-bg"],
  ["syn-comment", "del-bg"],
];

describe.each([
  ["light", ":root"],
  ["dark", ":root.dark"],
])("%s theme contrast", (_name, selector) => {
  const tokens = tokensOf(selector);

  it("defines every color used by the contrast pairs", () => {
    for (const [foreground, background] of TEXT_PAIRS) {
      expect(tokens[foreground], foreground).toBeDefined();
      expect(tokens[background], background).toBeDefined();
    }
  });

  it.each(TEXT_PAIRS)("%s on %s reaches the WCAG AA ratio for normal text", (foreground, background) => {
    const first = tokens[foreground];
    const second = tokens[background];
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    expect(contrast(first ?? "#000000", second ?? "#000000")).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });
});

describe("contrast helper", () => {
  it("returns 21 for black on white and 1 for identical colors", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrast("#336699", "#336699")).toBeCloseTo(1, 5);
  });
});

describe("stylesheet behavior", () => {
  it("switches animations and transitions off for people who prefer reduced motion", () => {
    const start = stylesheet.indexOf("@media (prefers-reduced-motion: reduce)");
    expect(start).toBeGreaterThan(-1);
    const rule = stylesheet.slice(start, stylesheet.indexOf("\n}\n", start));
    expect(rule).toContain("animation-duration: 0.01ms !important");
    expect(rule).toContain("transition-duration: 0.01ms !important");
  });

  it("keeps a visible focus ring for keyboard users", () => {
    expect(stylesheet).toMatch(/:focus-visible\s*{[^}]*outline:\s*2px solid var\(--accent\)/);
  });

  it("offers solid colors where color-mix is not supported", () => {
    const fallback = stylesheet.indexOf("--selection: var(--accent-soft)");
    const upgrade = stylesheet.indexOf("@supports (background: color-mix");
    expect(fallback).toBeGreaterThan(-1);
    expect(upgrade).toBeGreaterThan(fallback);
  });

  it("styles WebKit scrollbars only when the standard property is missing", () => {
    expect(stylesheet).toContain("@supports not (scrollbar-width: thin)");
    expect(stylesheet).toContain("::-webkit-scrollbar-thumb");
  });
});
