import { describe, expect, it } from "vitest";
import type { DiffLine, FileDiff } from "@/shared/types/git";
import {
  buildDiffRows,
  buildSplitRows,
  changeLineIndices,
  lineKey,
  longestLineLength,
  selectionsFromKeys,
} from "./diff-model";

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

function diffOf(lines: DiffLine[]): FileDiff {
  return {
    path: "a.txt",
    oldPath: null,
    change: "modified",
    binary: false,
    tooLarge: false,
    partialStagingAllowed: true,
    hunks: [{ header: "@@ -1 +1 @@", oldStart: 1, oldCount: 1, newStart: 1, newCount: 1, lines }],
  };
}

describe("buildSplitRows", () => {
  it("mirrors context lines on both sides", () => {
    const rows = buildSplitRows(diffOf([line("context", "same")]));
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({ kind: "pair", left: { line: { content: "same" } }, right: { line: { content: "same" } } });
  });

  it("pairs removed and added lines side by side", () => {
    const rows = buildSplitRows(diffOf([line("removed", "old"), line("added", "new")]));
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({
      kind: "pair",
      left: { line: { content: "old" } },
      right: { line: { content: "new" } },
    });
  });

  it("leaves the opposite side empty when counts differ", () => {
    const rows = buildSplitRows(
      diffOf([line("removed", "a"), line("removed", "b"), line("added", "x"), line("context", "end")]),
    );
    const pairs = rows.filter((row) => row.kind === "pair");
    expect(pairs).toHaveLength(3);
    expect(pairs[0]).toMatchObject({ left: { line: { content: "a" } }, right: { line: { content: "x" } } });
    expect(pairs[1]).toMatchObject({ left: { line: { content: "b" } }, right: null });
    expect(pairs[2]).toMatchObject({ left: { line: { content: "end" } } });
  });

  it("shows pure additions only on the right", () => {
    const rows = buildSplitRows(diffOf([line("added", "fresh")]));
    expect(rows[1]).toMatchObject({ kind: "pair", left: null, right: { line: { content: "fresh" } } });
  });

  it("marks the side that lacks a trailing newline", () => {
    const rows = buildSplitRows(
      diffOf([line("removed", "old"), line("noNewline", ""), line("added", "new"), line("noNewline", "")]),
    );
    const pair = rows[1];
    expect(pair).toMatchObject({ kind: "pair", left: { missingNewline: true }, right: { missingNewline: true } });
  });

  it("keeps the hunk index and a running row index", () => {
    const rows = buildSplitRows(diff);
    const pairs = rows.filter((row) => row.kind === "pair");
    expect(rows.filter((row) => row.kind === "hunk")).toHaveLength(2);
    expect(pairs.map((row) => (row.kind === "pair" ? row.rowIndex : -1))).toEqual([0, 1, 2, 0, 1]);
  });
});
