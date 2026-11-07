import { describe, expect, it } from "vitest";
import type { BlameLine } from "@/shared/types/git";
import { BLAME_COLOR_COUNT, colorIndexFor, groupStarts, longestBlameLine } from "./blame-model";

function line(commitIndex: number, content = "x"): BlameLine {
  return { commitIndex, originalLine: 1, content };
}

describe("groupStarts", () => {
  it("marks the first line of every run of the same commit", () => {
    expect(groupStarts([line(0), line(0), line(1), line(1), line(0)])).toEqual([true, false, true, false, true]);
  });

  it("handles empty and single line files", () => {
    expect(groupStarts([])).toEqual([]);
    expect(groupStarts([line(3)])).toEqual([true]);
  });
});

describe("colorIndexFor", () => {
  it("cycles through the palette", () => {
    expect(colorIndexFor(0)).toBe(0);
    expect(colorIndexFor(BLAME_COLOR_COUNT)).toBe(0);
    expect(colorIndexFor(BLAME_COLOR_COUNT + 3)).toBe(3);
  });
});

describe("longestBlameLine", () => {
  it("measures the widest line", () => {
    expect(longestBlameLine([line(0, "ab"), line(1, "abcdef"), line(2, "abc")])).toBe(6);
    expect(longestBlameLine([])).toBe(0);
  });
});
