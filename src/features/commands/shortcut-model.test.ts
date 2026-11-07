import { describe, expect, it } from "vitest";
import {
  assignShortcut,
  buildBindings,
  clearShortcut,
  effectiveShortcut,
  eventToCombo,
  formatCombo,
  isValidCombo,
  resetShortcut,
} from "./shortcut-model";
import type { KeyEventLike } from "./shortcut-model";

function press(partial: Partial<KeyEventLike> & { key: string; code?: string }): KeyEventLike {
  return {
    key: partial.key,
    code: partial.code ?? "",
    ctrlKey: partial.ctrlKey ?? false,
    metaKey: partial.metaKey ?? false,
    altKey: partial.altKey ?? false,
    shiftKey: partial.shiftKey ?? false,
  };
}

describe("eventToCombo", () => {
  it("builds the combo for letters with the platform modifier", () => {
    expect(eventToCombo(press({ key: "k", code: "KeyK", ctrlKey: true }), false)).toBe("Mod+K");
    expect(eventToCombo(press({ key: "k", code: "KeyK", metaKey: true }), true)).toBe("Mod+K");
  });

  it("orders modifiers consistently", () => {
    const event = press({ key: "N", code: "KeyN", ctrlKey: true, shiftKey: true, altKey: true });
    expect(eventToCombo(event, false)).toBe("Mod+Alt+Shift+N");
  });

  it("uses the physical digit and punctuation keys when shift changes the character", () => {
    expect(eventToCombo(press({ key: "!", code: "Digit1", ctrlKey: true, shiftKey: true }), false)).toBe("Mod+Shift+1");
    expect(eventToCombo(press({ key: "<", code: "Comma", ctrlKey: true, shiftKey: true }), false)).toBe("Mod+Shift+,");
  });

  it("falls back to the physical letter for non latin layouts", () => {
    expect(eventToCombo(press({ key: "л", code: "KeyK", ctrlKey: true }), false)).toBe("Mod+K");
  });

  it("ignores pure modifier presses and the windows key outside macos", () => {
    expect(eventToCombo(press({ key: "Control", code: "ControlLeft", ctrlKey: true }), false)).toBeNull();
    expect(eventToCombo(press({ key: "k", code: "KeyK", metaKey: true }), false)).toBeNull();
  });

  it("keeps the real control key apart on macos", () => {
    expect(eventToCombo(press({ key: "k", code: "KeyK", ctrlKey: true }), true)).toBe("Ctrl+K");
  });

  it("names special keys", () => {
    expect(eventToCombo(press({ key: " ", code: "Space", ctrlKey: true }), false)).toBe("Mod+Space");
    expect(eventToCombo(press({ key: "F5", code: "F5" }), false)).toBe("F5");
    expect(eventToCombo(press({ key: "Enter", code: "Enter", ctrlKey: true }), false)).toBe("Mod+Enter");
  });
});

describe("isValidCombo", () => {
  it("requires a modifier unless the key is a function key", () => {
    expect(isValidCombo("Mod+K")).toBe(true);
    expect(isValidCombo("Alt+Shift+P")).toBe(true);
    expect(isValidCombo("F5")).toBe(true);
    expect(isValidCombo("K")).toBe(false);
    expect(isValidCombo("Shift+K")).toBe(false);
    expect(isValidCombo("Escape")).toBe(false);
  });

  it("rejects malformed values", () => {
    expect(isValidCombo("")).toBe(false);
    expect(isValidCombo("Mod+")).toBe(false);
    expect(isValidCombo("Mod+Shift")).toBe(false);
    expect(isValidCombo("Banana+K")).toBe(false);
  });
});

describe("formatCombo", () => {
  it("renders readable labels per platform", () => {
    expect(formatCombo("Mod+Shift+K", false)).toBe("Ctrl+Shift+K");
    expect(formatCombo("Mod+Shift+K", true)).toBe("⌘⇧K");
    expect(formatCombo("F5", false)).toBe("F5");
    expect(formatCombo("", false)).toBe("");
  });
});

describe("bindings", () => {
  const subjects = [
    { id: "a", defaultShortcut: "Mod+K" },
    { id: "b", defaultShortcut: "Mod+J" },
    { id: "c" },
  ];

  it("uses overrides over defaults and treats empty as unbound", () => {
    expect(effectiveShortcut(subjects[0]!, {})).toBe("Mod+K");
    expect(effectiveShortcut(subjects[0]!, { a: "Mod+L" })).toBe("Mod+L");
    expect(effectiveShortcut(subjects[0]!, { a: "" })).toBeNull();
    expect(effectiveShortcut(subjects[2]!, {})).toBeNull();
  });

  it("groups subjects by combo", () => {
    const bindings = buildBindings(subjects, { c: "Mod+K" });
    expect(bindings.get("Mod+K")).toEqual(["a", "c"]);
    expect(bindings.get("Mod+J")).toEqual(["b"]);
  });

  it("displaces the previous owner when assigning a taken combo", () => {
    const result = assignShortcut(subjects, {}, "c", "Mod+K");
    expect(result.displaced).toEqual(["a"]);
    expect(result.overrides).toEqual({ a: "", c: "Mod+K" });
  });

  it("does not displace anything for a free combo or the same owner", () => {
    expect(assignShortcut(subjects, {}, "c", "Mod+U").displaced).toEqual([]);
    expect(assignShortcut(subjects, {}, "a", "Mod+K").displaced).toEqual([]);
  });

  it("resets and clears overrides", () => {
    expect(resetShortcut({ a: "Mod+L", b: "" }, "a")).toEqual({ b: "" });
    expect(clearShortcut({}, "a")).toEqual({ a: "" });
  });
});
