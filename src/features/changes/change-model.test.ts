import { describe, expect, it } from "vitest";
import type { StatusEntry } from "@/shared/types/git";
import { badgeFor, buildChangeModel, diffSourceFor, findRow, firstFileRow } from "./change-model";

function entry(overrides: Partial<StatusEntry> & { path: string }): StatusEntry {
  return {
    originalPath: null,
    index: "unmodified",
    worktree: "unmodified",
    conflicted: false,
    untracked: false,
    submodule: false,
    ...overrides,
  };
}

describe("buildChangeModel", () => {
  it("splits entries into staged, unstaged and conflicts", () => {
    const model = buildChangeModel([
      entry({ path: "a.ts", index: "modified" }),
      entry({ path: "b.ts", worktree: "modified" }),
      entry({ path: "c.ts", index: "added", worktree: "modified" }),
      entry({ path: "d.ts", worktree: "untracked", untracked: true }),
      entry({ path: "e.ts", index: "unmerged", worktree: "unmerged", conflicted: true }),
    ]);

    expect(model.staged.map((item) => item.path)).toEqual(["a.ts", "c.ts"]);
    expect(model.unstaged.map((item) => item.path)).toEqual(["b.ts", "c.ts", "d.ts"]);
    expect(model.conflicts.map((item) => item.path)).toEqual(["e.ts"]);
  });

  it("lists a file with staged and unstaged changes in both sections", () => {
    const model = buildChangeModel([entry({ path: "c.ts", index: "modified", worktree: "modified" })]);
    const files = model.rows.filter((row) => row.kind === "file");
    expect(files).toHaveLength(2);
    expect(findRow(model.rows, "staged", "c.ts")).not.toBeNull();
    expect(findRow(model.rows, "unstaged", "c.ts")).not.toBeNull();
  });

  it("emits section rows only for non-empty sections", () => {
    const model = buildChangeModel([entry({ path: "a.ts", worktree: "modified" })]);
    const sections = model.rows.filter((row) => row.kind === "section");
    expect(sections).toHaveLength(1);
    expect(sections[0]).toMatchObject({ section: "unstaged", count: 1 });
    expect(firstFileRow(model.rows)?.entry.path).toBe("a.ts");
  });

  it("returns no rows for a clean repository", () => {
    expect(buildChangeModel([]).rows).toEqual([]);
    expect(firstFileRow([])).toBeNull();
  });
});

describe("diffSourceFor", () => {
  it("reads raw content for untracked and conflicted files", () => {
    expect(diffSourceFor("unstaged", entry({ path: "a", untracked: true, worktree: "untracked" }))).toBe("raw");
    expect(diffSourceFor("conflicts", entry({ path: "a", conflicted: true }))).toBe("raw");
  });

  it("uses git diff otherwise", () => {
    expect(diffSourceFor("staged", entry({ path: "a", index: "modified" }))).toBe("staged");
    expect(diffSourceFor("unstaged", entry({ path: "a", worktree: "modified" }))).toBe("unstaged");
  });
});

describe("badgeFor", () => {
  it("maps change kinds to letters and tones", () => {
    expect(badgeFor("modified")).toEqual({ letter: "M", tone: "warning" });
    expect(badgeFor("untracked")).toEqual({ letter: "U", tone: "success" });
    expect(badgeFor("deleted")).toEqual({ letter: "D", tone: "danger" });
    expect(badgeFor("unmerged")).toEqual({ letter: "!", tone: "danger" });
  });
});
