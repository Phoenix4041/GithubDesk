import { describe, expect, it } from "vitest";
import { commentKey, lineAnchor } from "@/features/diff/line-comments";
import type { DiffLine } from "@/shared/types/git";
import type { ReviewComment } from "../types";
import { buildThreads, commentCounts, outdatedThreads, threadsAt, threadsForFile } from "./review-model";

function comment(id: number, overrides: Partial<ReviewComment> = {}): ReviewComment {
  return {
    id,
    user: { login: "hubot", avatarUrl: "", htmlUrl: "" },
    body: `comment ${id}`,
    path: "src/a.rs",
    line: 2,
    originalLine: 2,
    side: "RIGHT",
    inReplyToId: null,
    commitId: "abc123",
    createdAt: `2026-01-0${id}T10:00:00Z`,
    htmlUrl: "",
    ...overrides,
  };
}

describe("buildThreads", () => {
  it("groups replies under the comment that started the thread", () => {
    const threads = buildThreads([comment(1), comment(2, { inReplyToId: 1 }), comment(3, { line: 5 })]);
    expect(threads).toHaveLength(2);
    expect(threads[0]?.id).toBe(1);
    expect(threads[0]?.comments.map((item) => item.id)).toEqual([1, 2]);
    expect(threads[1]?.line).toBe(5);
  });

  it("orders comments by date even when the server returns them shuffled", () => {
    const threads = buildThreads([comment(3, { inReplyToId: 1 }), comment(1), comment(2, { inReplyToId: 1 })]);
    expect(threads).toHaveLength(1);
    expect(threads[0]?.comments.map((item) => item.id)).toEqual([1, 2, 3]);
  });

  it("follows chains of replies back to the first comment", () => {
    const threads = buildThreads([comment(1), comment(2, { inReplyToId: 1 }), comment(3, { inReplyToId: 2 })]);
    expect(threads).toHaveLength(1);
    expect(threads[0]?.comments).toHaveLength(3);
  });

  it("keeps a reply whose first comment is missing as its own thread", () => {
    const threads = buildThreads([comment(2, { inReplyToId: 99 })]);
    expect(threads).toHaveLength(1);
    expect(threads[0]?.id).toBe(99);
  });

  it("treats a missing side as the new version of the file", () => {
    const threads = buildThreads([comment(1, { side: null })]);
    expect(threads[0]?.side).toBe("RIGHT");
  });
});

describe("thread lookups", () => {
  const threads = buildThreads([
    comment(1),
    comment(2, { inReplyToId: 1 }),
    comment(3, { side: "LEFT", line: 2 }),
    comment(4, { line: null, originalLine: 7 }),
    comment(5, { path: "src/b.rs" }),
  ]);

  it("filters by file", () => {
    expect(threadsForFile(threads, "src/a.rs")).toHaveLength(3);
    expect(threadsForFile(threads, "src/b.rs")).toHaveLength(1);
    expect(threadsForFile(threads, "missing")).toHaveLength(0);
  });

  it("separates the threads whose line no longer exists", () => {
    expect(outdatedThreads(threads).map((thread) => thread.id)).toEqual([4]);
  });

  it("finds the threads of one line on one side", () => {
    expect(threadsAt(threads, "RIGHT", 2).map((thread) => thread.id)).toContain(1);
    expect(threadsAt(threads, "LEFT", 2).map((thread) => thread.id)).toEqual([3]);
    expect(threadsAt(threads, "RIGHT", 9)).toHaveLength(0);
  });

  it("counts the comments of each anchored line and skips outdated ones", () => {
    const counts = commentCounts(threadsForFile(threads, "src/a.rs"));
    expect(counts.get(commentKey("RIGHT", 2))).toBe(2);
    expect(counts.get(commentKey("LEFT", 2))).toBe(1);
    expect(counts.size).toBe(2);
  });
});

describe("lineAnchor", () => {
  function line(kind: DiffLine["kind"], oldNumber: number | null, newNumber: number | null): DiffLine {
    return { kind, content: "x", oldNumber, newNumber };
  }

  it("anchors removed lines to the old file and every other line to the new one", () => {
    expect(lineAnchor(line("removed", 4, null))).toEqual({ side: "LEFT", line: 4 });
    expect(lineAnchor(line("added", null, 6))).toEqual({ side: "RIGHT", line: 6 });
    expect(lineAnchor(line("context", 7, 8))).toEqual({ side: "RIGHT", line: 8 });
  });

  it("gives no anchor to the missing newline marker or to lines without a number", () => {
    expect(lineAnchor(line("noNewline", null, null))).toBeNull();
    expect(lineAnchor(line("removed", null, null))).toBeNull();
    expect(lineAnchor(line("added", null, null))).toBeNull();
  });
});
