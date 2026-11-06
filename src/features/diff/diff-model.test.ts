import { describe, expect, it } from "vitest";
import type { DiffLine, FileDiff } from "@/shared/types/git";
import { buildDiffRows, changeLineIndices, lineKey, longestLineLength, selectionsFromKeys } from "./diff-model";

function line(kind: DiffLine["kind"], content: string): DiffLine {
  return { kind, content, oldNumber: null, newNumber: null };
}

const diff: FileDiff = {
  path: "a.txt",
  oldPath: null,
  change: "modified",
  binary: false,
  tooLarge: false,
  partialStagingAllowed: true,
  hunks: [
    {
      header: "@@ -1,3 +1,3 @@",
      oldStart: 1,
      oldCount: 3,
      newStart: 1,
      newCount: 3,
      lines: [line("context", "one"), line("removed", "two"), line("added", "TWO"), line("context", "three")],
    },
    {
      header: "@@ -9,2 +9,3 @@",
      oldStart: 9,
      oldCount: 2,
      newStart: 9,
      newCount: 3,
      lines: [line("context", "nine"), line("added", "a much longer added line")],
    },
  ],
};

describe("buildDiffRows", () => {
  it("interleaves hunk headers and lines", () => {
    const rows = buildDiffRows(diff);
    expect(rows).toHaveLength(8);
    expect(rows[0]).toMatchObject({ kind: "hunk", hunkIndex: 0, changeCount: 2 });
    expect(rows[5]).toMatchObject({ kind: "hunk", hunkIndex: 1, changeCount: 1 });
    expect(rows[2]).toMatchObject({ kind: "line", hunkIndex: 0, lineIndex: 1 });
  });
});

describe("changeLineIndices", () => {
  it("returns only added and removed lines", () => {
    const hunk = diff.hunks[0];
    expect(hunk && changeLineIndices(hunk)).toEqual([1, 2]);
  });
});

describe("selectionsFromKeys", () => {
  it("groups selected lines by hunk in ascending order", () => {
    const keys = new Set([lineKey(1, 1), lineKey(0, 2), lineKey(0, 1)]);
    expect(selectionsFromKeys(keys)).toEqual([
      { hunkIndex: 0, lineIndices: [1, 2] },
      { hunkIndex: 1, lineIndices: [1] },
    ]);
  });

  it("returns an empty list for an empty selection", () => {
    expect(selectionsFromKeys(new Set())).toEqual([]);
  });
});

describe("longestLineLength", () => {
  it("measures the widest line", () => {
    expect(longestLineLength(diff)).toBe("a much longer added line".length);
  });
});
