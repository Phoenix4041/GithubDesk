export const THEME_TOKENS = [
  "canvas",
  "surface",
  "subtle",
  "line",
  "fg",
  "muted",
  "accent",
  "accent-hover",
  "accent-fg",
  "accent-soft",
  "danger",
  "success",
  "warning",
] as const;

export type ThemeToken = (typeof THEME_TOKENS)[number];
export type ThemeBase = "light" | "dark";
export type ThemeColors = Partial<Record<ThemeToken, string>>;
export type Density = "compact" | "normal" | "comfortable";

export interface CustomTheme {
  id: string;
  name: string;
  base: ThemeBase;
  colors: ThemeColors;
}

export const MAX_CUSTOM_THEMES = 5;
export const MAX_THEME_FILE_BYTES = 512 * 1024;
const MAX_NAME = 60;
const AA_NORMAL_TEXT = 4.5;

export const VSCODE_KEYS: Record<ThemeToken, readonly string[]> = {
  canvas: ["editor.background"],
  surface: ["sideBar.background", "editor.background"],
  subtle: ["editorWidget.background", "input.background", "list.hoverBackground"],
  line: ["panel.border", "editorGroup.border", "contrastBorder", "input.border"],
  fg: ["editor.foreground", "foreground"],
  muted: ["descriptionForeground", "editorLineNumber.foreground"],
  accent: ["button.background", "focusBorder", "textLink.foreground"],
  "accent-hover": ["button.hoverBackground"],
  "accent-fg": ["button.foreground"],
  "accent-soft": ["list.activeSelectionBackground", "editor.selectionBackground"],
  danger: ["errorForeground", "editorError.foreground"],
  success: ["gitDecoration.addedResourceForeground", "terminal.ansiGreen"],
  warning: ["editorWarning.foreground", "list.warningForeground"],
};

export const CONTRAST_PAIRS: ReadonlyArray<readonly [ThemeToken, ThemeToken]> = [
  ["fg", "canvas"],
  ["fg", "surface"],
  ["muted", "surface"],
  ["accent-fg", "accent"],
  ["accent", "surface"],
  ["danger", "surface"],
];

const HEX_PATTERN = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const RGB_PATTERN = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*(?:0|1|0?\.\d+)\s*)?\)$/i;

function toHex(channels: readonly number[]): string {
  return `#${channels.map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

export function normalizeColor(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const text = value.trim();
  const hex = HEX_PATTERN.exec(text);
  if (hex?.[1]) {
    const digits = hex[1].toLowerCase();
    if (digits.length <= 4) {
      return `#${digits
        .slice(0, 3)
        .split("")
        .map((digit) => digit + digit)
        .join("")}`;
    }
    return `#${digits.slice(0, 6)}`;
  }
  const rgb = RGB_PATTERN.exec(text);
  if (rgb) {
    const channels = [rgb[1], rgb[2], rgb[3]].map((part) => Number.parseInt(part ?? "", 10));
    if (channels.every((channel) => channel >= 0 && channel <= 255)) {
      return toHex(channels);
    }
  }
  return null;
}

function channel(hex: string, offset: number): number {
  const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  return 0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5);
}

export function contrastRatio(first: string, second: string): number {
  const [light, dark] = [luminance(first), luminance(second)].sort((left, right) => right - left);
  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05);
}

export interface ContrastWarning {
  foreground: ThemeToken;
  background: ThemeToken;
  ratio: number;
}

export function contrastWarnings(colors: ThemeColors): ContrastWarning[] {
  const warnings: ContrastWarning[] = [];
  for (const [foreground, background] of CONTRAST_PAIRS) {
    const first = colors[foreground];
    const second = colors[background];
    if (!first || !second) {
      continue;
    }
    const ratio = contrastRatio(first, second);
    if (ratio < AA_NORMAL_TEXT) {
      warnings.push({ foreground, background, ratio: Math.round(ratio * 100) / 100 });
    }
  }
  return warnings;
}

export function stripJsonComments(text: string): string {
  let output = "";
  let inString = false;
  let index = 0;
  while (index < text.length) {
    const character = text[index] ?? "";
    const next = text[index + 1] ?? "";
    if (inString) {
      output += character;
      if (character === "\\") {
        output += next;
        index += 2;
        continue;
      }
      if (character === '"') {
        inString = false;
      }
      index += 1;
    } else if (character === '"') {
      inString = true;
      output += character;
      index += 1;
    } else if (character === "/" && next === "/") {
      while (index < text.length && text[index] !== "\n") {
        index += 1;
      }
    } else if (character === "/" && next === "*") {
      const end = text.indexOf("*/", index + 2);
      index = end === -1 ? text.length : end + 2;
    } else {
      output += character;
      index += 1;
    }
  }
  return dropTrailingCommas(output);
}

function dropTrailingCommas(text: string): string {
  let output = "";
  let inString = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index] ?? "";
    if (inString) {
      output += character;
      if (character === "\\") {
        output += text[index + 1] ?? "";
        index += 1;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }
    if (character === '"') {
      inString = true;
    } else if (character === ",") {
      let ahead = index + 1;
      while (ahead < text.length && /\s/.test(text[ahead] ?? "")) {
        ahead += 1;
      }
      if (text[ahead] === "}" || text[ahead] === "]") {
        continue;
      }
    }
    output += character;
  }
  return output;
}

export class ThemeImportError extends Error {
  constructor(public readonly reason: "invalid" | "noColors" | "tooLarge") {
    super(reason);
    this.name = "ThemeImportError";
  }
}

export interface ImportedTheme {
  name: string;
  base: ThemeBase;
  colors: ThemeColors;
  rejected: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function cleanThemeName(name: string): string {
  return name.replace(/\p{Cc}/gu, "").trim().slice(0, MAX_NAME);
}

export function parseVsCodeTheme(text: string, fallbackName: string): ImportedTheme {
  if (text.length > MAX_THEME_FILE_BYTES) {
    throw new ThemeImportError("tooLarge");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripJsonComments(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text));
  } catch {
    throw new ThemeImportError("invalid");
  }
  if (!isRecord(parsed) || !isRecord(parsed.colors)) {
    throw new ThemeImportError("noColors");
  }
  const source = parsed.colors;
  const colors: ThemeColors = {};
  const rejected: string[] = [];
  for (const token of THEME_TOKENS) {
    for (const key of VSCODE_KEYS[token]) {
      if (!(key in source)) {
        continue;
      }
      const color = normalizeColor(source[key]);
      if (color) {
        colors[token] = color;
        break;
      }
      rejected.push(key);
    }
  }
  if (Object.keys(colors).length === 0) {
    throw new ThemeImportError("noColors");
  }
  const kind = typeof parsed.type === "string" ? parsed.type.toLowerCase() : "";
  const base: ThemeBase =
    kind === "light" || kind === "hc-light"
      ? "light"
      : kind === "dark" || kind === "hc"
        ? "dark"
        : colors.canvas && luminance(colors.canvas) > 0.5
          ? "light"
          : "dark";
  const name = cleanThemeName(typeof parsed.name === "string" ? parsed.name : fallbackName) || fallbackName;
  return { name, base, colors, rejected };
}

export function sanitizeColors(colors: Record<string, unknown>): ThemeColors {
  const clean: ThemeColors = {};
  for (const token of THEME_TOKENS) {
    const color = normalizeColor(colors[token]);
    if (color) {
      clean[token] = color;
    }
  }
  return clean;
}

export function upsertTheme(themes: readonly CustomTheme[], theme: CustomTheme): CustomTheme[] {
  const index = themes.findIndex((existing) => existing.id === theme.id);
  if (index >= 0) {
    return themes.map((existing) => (existing.id === theme.id ? theme : existing));
  }
  if (themes.length >= MAX_CUSTOM_THEMES) {
    return [...themes];
  }
  return [...themes, theme];
}

export function themeVariables(colors: ThemeColors): Array<[string, string]> {
  return THEME_TOKENS.flatMap((token) => {
    const color = normalizeColor(colors[token]);
    return color ? [[`--${token}`, color] as [string, string]] : [];
  });
}

export function densityClass(density: Density): string | null {
  return density === "normal" ? null : `density-${density}`;
}
