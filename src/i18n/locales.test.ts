import { describe, expect, it } from "vitest";
import en from "./locales/en.json";
import es from "./locales/es.json";

function flatten(value: unknown, prefix = ""): Record<string, string> {
  const entries: Record<string, string> = {};
  if (typeof value === "string") {
    entries[prefix] = value;
    return entries;
  }
  if (typeof value === "object" && value !== null) {
    for (const [key, child] of Object.entries(value)) {
      Object.assign(entries, flatten(child, prefix ? `${prefix}.${key}` : key));
    }
  }
  return entries;
}

function placeholders(text: string): string[] {
  return [...text.matchAll(/\{\{(\w+)\}\}/g)].map((match) => match[1] ?? "").sort();
}

const spanish = flatten(es);
const english = flatten(en);

describe("locales", () => {
  it("define the same keys in every language", () => {
    expect(Object.keys(english).sort()).toEqual(Object.keys(spanish).sort());
  });

  it("use the same interpolation placeholders in every language", () => {
    for (const [key, text] of Object.entries(spanish)) {
      expect(placeholders(english[key] ?? ""), key).toEqual(placeholders(text));
    }
  });

  it("have no empty translations", () => {
    for (const [key, text] of [...Object.entries(spanish), ...Object.entries(english)]) {
      expect(text.trim().length, key).toBeGreaterThan(0);
    }
  });

  it("provide a title and message for every error kind", () => {
    const kinds = Object.keys(es.errors).filter((key) => key !== "actions");
    expect(kinds.length).toBeGreaterThanOrEqual(29);
    for (const kind of kinds) {
      expect(spanish[`errors.${kind}.title`], kind).toBeTruthy();
      expect(spanish[`errors.${kind}.message`], kind).toBeTruthy();
    }
  });
});
