import { describe, expect, it } from "vitest";
import { indexAtPosition } from "./reorder";

const rows = [
  { top: 0, bottom: 40 },
  { top: 46, bottom: 86 },
  { top: 92, bottom: 132 },
];

describe("indexAtPosition", () => {
  it("finds the row under the pointer", () => {
    expect(indexAtPosition(rows, 10)).toBe(0);
    expect(indexAtPosition(rows, 60)).toBe(1);
    expect(indexAtPosition(rows, 100)).toBe(2);
  });

  it("clamps above the first and below the last row", () => {
    expect(indexAtPosition(rows, -50)).toBe(0);
    expect(indexAtPosition(rows, 500)).toBe(2);
  });

  it("picks the closest row when the pointer is in a gap", () => {
    expect(indexAtPosition(rows, 42)).toBe(0);
    expect(indexAtPosition(rows, 45)).toBe(1);
    expect(indexAtPosition(rows, 89)).toBe(1);
    expect(indexAtPosition(rows, 91)).toBe(2);
  });

  it("handles empty and single row lists", () => {
    expect(indexAtPosition([], 10)).toBe(0);
    expect(indexAtPosition([{ top: 0, bottom: 10 }], 99)).toBe(0);
  });
});
