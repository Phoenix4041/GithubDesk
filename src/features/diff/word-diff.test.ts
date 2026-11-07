import { describe, expect, it } from "vitest";
import type { DiffLine, FileDiff, Hunk } from "@/shared/types/git";
import {
  MAX_WORD_DIFF_LINE_LENGTH,
  applyWordRanges,
  computeWordRanges,
  diffWords,
  tokenize,
  wordKey,
} from "./word-diff";

function text(source: string, ranges: ReadonlyArray<{ start: number; end: number }>): string[] {
  return ranges.map((range) => source.slice(range.start, range.end));
}

function line(kind: DiffLine["kind"], content: string): DiffLine {
  return { kind, content, oldNumber: null, newNumber: null };
}

function diffOf(lines: DiffLine[]): FileDiff {
  const hunk: Hunk = { header: "@@", oldStart: 1, oldCount: 1, newStart: 1, newCount: 1, lines };
  return { path: "a.ts", hunks: [hunk] } as unknown as FileDiff;
}

describe("tokenize", () => {
  it("splits words, spaces and punctuation with offsets", () => {
    const tokens = tokenize("let x = foo(1);");
    expect(tokens.map((token) => token.text)).toEqual(["let", " ", "x", " ", "=", " ", "foo", "(", "1", ")", ";"]);
    expect(tokens.map((token) => token.start)).toEqual([0, 3, 4, 5, 6, 7, 8, 11, 12, 13, 14]);
  });

  it("keeps accented letters inside one word", () => {
    expect(tokenize("canción nueva").map((token) => token.text)).toEqual(["canción", " ", "nueva"]);
  });
});

describe("diffWords", () => {
  it("marks only the word that changed", () => {
    const before = "const total = price * quantity;";
    const after = "const total = price * amount;";
    const result = diffWords(before, after);
    expect(result).not.toBeNull();
    expect(text(before, result?.removed ?? [])).toEqual(["quantity"]);
    expect(text(after, result?.added ?? [])).toEqual(["amount"]);
  });

  it("marks insertions on the new side only", () => {
    const before = "call(a, b)";
    const after = "call(a, b, c)";
    const result = diffWords(before, after);
    expect(result?.removed).toEqual([]);
    expect(text(after, result?.added ?? [])).toEqual([", c"]);
  });

  it("merges neighbouring changed tokens into one range", () => {
    const before = "return alpha beta gamma;";
    const after = "return one two gamma;";
    const result = diffWords(before, after);
    expect(text(before, result?.removed ?? [])).toEqual(["alpha beta"]);
    expect(text(after, result?.added ?? [])).toEqual(["one two"]);
  });

  it("skips identical lines and lines that share too little", () => {
    expect(diffWords("same", "same")).toBeNull();
    expect(diffWords("alpha beta gamma delta", "wxyz qrst uvno pqrs")).toBeNull();
  });

  it("skips very long lines", () => {
    const long = "word ".repeat(MAX_WORD_DIFF_LINE_LENGTH);
    expect(diffWords(long, `${long}x`)).toBeNull();
  });
});

describe("computeWordRanges", () => {
  it("pairs removed and added lines in order", () => {
    const diff = diffOf([
      line("context", "keep"),
      line("removed", "let a = 1;"),
      line("removed", "let b = 2;"),
      line("added", "let a = 10;"),
      line("added", "let b = 20;"),
      line("context", "end"),
    ]);
    const ranges = computeWordRanges(diff);
    expect(ranges.get(wordKey(0, 1))).toEqual([{ start: 8, end: 9 }]);
    expect(ranges.get(wordKey(0, 3))).toEqual([{ start: 8, end: 10 }]);
    expect(ranges.get(wordKey(0, 2))).toEqual([{ start: 8, end: 9 }]);
    expect(ranges.get(wordKey(0, 4))).toEqual([{ start: 8, end: 10 }]);
    expect(ranges.has(wordKey(0, 0))).toBe(false);
  });

  it("leaves unpaired lines without ranges", () => {
    const diff = diffOf([line("removed", "let a = 1;"), line("removed", "let b = 2;"), line("added", "let a = 9;")]);
    const ranges = computeWordRanges(diff);
    expect(ranges.has(wordKey(0, 0))).toBe(true);
    expect(ranges.has(wordKey(0, 1))).toBe(false);
  });

  it("ignores the line ending and the no newline marker", () => {
    const diff = diffOf([line("removed", "value = 1\r"), line("noNewline", ""), line("added", "value = 2\r")]);
    const ranges = computeWordRanges(diff);
    expect(ranges.get(wordKey(0, 0))).toEqual([{ start: 8, end: 9 }]);
    expect(ranges.get(wordKey(0, 2))).toEqual([{ start: 8, end: 9 }]);
  });
});

describe("applyWordRanges", () => {
  it("returns the segments untouched without ranges", () => {
    expect(applyWordRanges([{ text: "abc", className: "k" }], undefined)).toEqual([
      { text: "abc", className: "k", changed: false },
    ]);
  });

  it("splits a syntax segment around the changed range", () => {
    const result = applyWordRanges([{ text: "abcdef", className: "k" }], [{ start: 2, end: 4 }]);
    expect(result).toEqual([
      { text: "ab", className: "k", changed: false },
      { text: "cd", className: "k", changed: true },
      { text: "ef", className: "k", changed: false },
    ]);
  });

  it("carries a range across several syntax segments", () => {
    const result = applyWordRanges(
      [
        { text: "ab", className: null },
        { text: "cd", className: "k" },
        { text: "ef", className: null },
      ],
      [{ start: 1, end: 5 }],
    );
    expect(result.map((segment) => [segment.text, segment.changed])).toEqual([
      ["a", false],
      ["b", true],
      ["cd", true],
      ["e", true],
      ["f", false],
    ]);
    const joined = result.map((segment) => segment.text).join("");
    expect(joined).toBe("abcdef");
  });
});
