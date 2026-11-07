import { describe, expect, it } from "vitest";
import { isoToUnixSeconds } from "./dates";

describe("isoToUnixSeconds", () => {
  it("converts GitHub timestamps to unix seconds", () => {
    expect(isoToUnixSeconds("2026-01-01T00:00:00Z")).toBe(1_767_225_600);
  });

  it("returns zero for missing or malformed values", () => {
    expect(isoToUnixSeconds(null)).toBe(0);
    expect(isoToUnixSeconds(undefined)).toBe(0);
    expect(isoToUnixSeconds("")).toBe(0);
    expect(isoToUnixSeconds("not a date")).toBe(0);
  });
});
