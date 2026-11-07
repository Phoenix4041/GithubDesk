import type { ITheme } from "@xterm/xterm";

function token(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value === "" ? fallback : value;
}

export function readTerminalTheme(): ITheme {
  const foreground = token("--fg", "#e7e9ee");
  return {
    background: token("--canvas", "#0d0e12"),
    foreground,
    cursor: token("--accent", "#7b84ec"),
    cursorAccent: token("--canvas", "#0d0e12"),
    selectionBackground: token("--accent-soft", "#232650"),
    selectionForeground: foreground,
    black: token("--subtle", "#1b1e25"),
    red: token("--del", "#f27d84"),
    green: token("--add", "#5fd38a"),
    yellow: token("--warning", "#e0a63d"),
    blue: token("--syn-type", "#6cb6ff"),
    magenta: token("--syn-keyword", "#c3a1ff"),
    cyan: token("--syn-string", "#7ee0b0"),
    white: foreground,
    brightBlack: token("--muted", "#8c94a3"),
    brightRed: token("--del", "#f27d84"),
    brightGreen: token("--add", "#5fd38a"),
    brightYellow: token("--warning", "#e0a63d"),
    brightBlue: token("--syn-property", "#8fb8ff"),
    brightMagenta: token("--syn-function", "#c9a8ff"),
    brightCyan: token("--syn-string", "#7ee0b0"),
    brightWhite: foreground,
  };
}
