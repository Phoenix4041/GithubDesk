export type Combo = string;

export interface KeyEventLike {
  key: string;
  code: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

const MODIFIER_KEYS = new Set(["Control", "Shift", "Alt", "Meta", "AltGraph", "OS"]);
const FUNCTION_KEY = /^F([1-9]|1[0-2])$/;
const MODIFIER_TOKENS = new Set(["Mod", "Ctrl", "Alt", "Shift"]);

const PUNCTUATION_BY_CODE: Record<string, string> = {
  Backquote: "`",
  Comma: ",",
  Period: ".",
  Slash: "/",
  Backslash: "\\",
  BracketLeft: "[",
  BracketRight: "]",
  Minus: "-",
  Equal: "=",
  Semicolon: ";",
  Quote: "'",
};

function keyName(event: KeyEventLike): string | null {
  if (MODIFIER_KEYS.has(event.key)) {
    return null;
  }
  if (/^[a-zA-Z]$/.test(event.key)) {
    return event.key.toUpperCase();
  }
  if (/^Key[A-Z]$/.test(event.code)) {
    return event.code.slice(3);
  }
  if (/^Digit[0-9]$/.test(event.code)) {
    return event.code.slice(5);
  }
  const punctuation = PUNCTUATION_BY_CODE[event.code];
  if (punctuation) {
    return punctuation;
  }
  if (event.key === " ") {
    return "Space";
  }
  if (event.key.length === 1) {
    return event.key;
  }
  return event.key;
}

export function eventToCombo(event: KeyEventLike, isMac: boolean): Combo | null {
  const key = keyName(event);
  if (key === null) {
    return null;
  }
  if (!isMac && event.metaKey) {
    return null;
  }
  const parts: string[] = [];
  const mod = isMac ? event.metaKey : event.ctrlKey;
  if (mod) {
    parts.push("Mod");
  }
  if (isMac && event.ctrlKey) {
    parts.push("Ctrl");
  }
  if (event.altKey) {
    parts.push("Alt");
  }
  if (event.shiftKey) {
    parts.push("Shift");
  }
  parts.push(key);
  return parts.join("+");
}

function splitCombo(combo: Combo): { modifiers: string[]; key: string } | null {
  if (combo === "") {
    return null;
  }
  const parts = combo.split("+");
  const key = combo.endsWith("++") ? "+" : (parts[parts.length - 1] ?? "");
  const modifiers = (combo.endsWith("++") ? parts.slice(0, -2) : parts.slice(0, -1)).filter((part) => part !== "");
  if (key === "" || MODIFIER_TOKENS.has(key)) {
    return null;
  }
  if (modifiers.some((part) => !MODIFIER_TOKENS.has(part))) {
    return null;
  }
  return { modifiers, key };
}

export function isValidCombo(combo: Combo): boolean {
  const parsed = splitCombo(combo);
  if (!parsed) {
    return false;
  }
  if (FUNCTION_KEY.test(parsed.key)) {
    return true;
  }
  return parsed.modifiers.includes("Mod") || parsed.modifiers.includes("Alt") || parsed.modifiers.includes("Ctrl");
}

const MAC_SYMBOLS: Record<string, string> = { Mod: "⌘", Ctrl: "⌃", Alt: "⌥", Shift: "⇧" };
const PC_LABELS: Record<string, string> = { Mod: "Ctrl", Ctrl: "Ctrl", Alt: "Alt", Shift: "Shift" };

export function formatCombo(combo: Combo, isMac: boolean): string {
  const parsed = splitCombo(combo);
  if (!parsed) {
    return "";
  }
  if (isMac) {
    return [...parsed.modifiers.map((part) => MAC_SYMBOLS[part] ?? part), parsed.key].join("");
  }
  return [...parsed.modifiers.map((part) => PC_LABELS[part] ?? part), parsed.key].join("+");
}

export interface ShortcutSubject {
  id: string;
  defaultShortcut?: Combo;
}

export type ShortcutOverrides = Record<string, string>;

export function effectiveShortcut(subject: ShortcutSubject, overrides: ShortcutOverrides): Combo | null {
  const override = overrides[subject.id];
  if (override !== undefined) {
    return override === "" ? null : override;
  }
  return subject.defaultShortcut ?? null;
}

export function buildBindings(subjects: readonly ShortcutSubject[], overrides: ShortcutOverrides): Map<Combo, string[]> {
  const bindings = new Map<Combo, string[]>();
  for (const subject of subjects) {
    const combo = effectiveShortcut(subject, overrides);
    if (!combo) {
      continue;
    }
    const owners = bindings.get(combo);
    if (owners) {
      owners.push(subject.id);
    } else {
      bindings.set(combo, [subject.id]);
    }
  }
  return bindings;
}

export function findOwners(bindings: Map<Combo, string[]>, combo: Combo, ignoreId?: string): string[] {
  return (bindings.get(combo) ?? []).filter((id) => id !== ignoreId);
}

export function assignShortcut(
  subjects: readonly ShortcutSubject[],
  overrides: ShortcutOverrides,
  id: string,
  combo: Combo,
): { overrides: ShortcutOverrides; displaced: string[] } {
  const bindings = buildBindings(subjects, overrides);
  const displaced = findOwners(bindings, combo, id);
  const next: ShortcutOverrides = { ...overrides };
  for (const other of displaced) {
    next[other] = "";
  }
  next[id] = combo;
  return { overrides: next, displaced };
}

export function resetShortcut(overrides: ShortcutOverrides, id: string): ShortcutOverrides {
  const next = { ...overrides };
  delete next[id];
  return next;
}

export function clearShortcut(overrides: ShortcutOverrides, id: string): ShortcutOverrides {
  return { ...overrides, [id]: "" };
}
