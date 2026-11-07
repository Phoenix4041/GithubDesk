import { describe, expect, it } from "vitest";
import type { Branch, Worktree } from "@/shared/types/git";
import {
  branchesWithoutWorktree,
  defaultWorktreeName,
  folderNameOf,
  joinFolder,
  parentFolderOf,
  shortHead,
  slugifyBranch,
} from "./worktree-model";

function branch(name: string, isRemote = false): Branch {
  return {
    name,
    fullName: name,
    isRemote,
    remote: null,
    isCurrent: false,
    upstream: null,
    ahead: 0,
    behind: 0,
    upstreamGone: false,
    tipHash: "abc",
    tipTime: 0,
  };
}

function worktree(branchName: string | null): Worktree {
  return {
    path: "/x",
    head: null,
    branch: branchName,
    detached: branchName === null,
    bare: false,
    locked: false,
    lockReason: null,
    prunable: false,
    prunableReason: null,
    isMain: false,
    isCurrent: false,
  };
}

describe("slugifyBranch", () => {
  it("turns branch names into safe folder names", () => {
    expect(slugifyBranch("feature/login form")).toBe("feature-login-form");
    expect(slugifyBranch("  fix: crash?  ")).toBe("fix-crash");
    expect(slugifyBranch("a//b")).toBe("a-b");
  });

  it("falls back to a generic name", () => {
    expect(slugifyBranch("///")).toBe("worktree");
    expect(slugifyBranch("")).toBe("worktree");
  });
});

describe("folder helpers", () => {
  it("splits windows and unix paths", () => {
    expect(parentFolderOf("C:\\Users\\me\\proj")).toBe("C:\\Users\\me");
    expect(parentFolderOf("/home/me/proj/")).toBe("/home/me");
    expect(folderNameOf("C:\\Users\\me\\proj\\")).toBe("proj");
    expect(folderNameOf("/home/me/proj")).toBe("proj");
  });

  it("joins with the separator the parent already uses", () => {
    expect(joinFolder("C:\\Users\\me", "proj-x")).toBe("C:\\Users\\me\\proj-x");
    expect(joinFolder("/home/me/", "proj-x")).toBe("/home/me/proj-x");
    expect(joinFolder("", "proj-x")).toBe("proj-x");
  });

  it("builds the default name from the repository and target", () => {
    expect(defaultWorktreeName("C:\\Users\\me\\proj", "feature/x")).toBe("proj-feature-x");
  });
});

describe("branchesWithoutWorktree", () => {
  it("keeps only local branches that no worktree has checked out", () => {
    const result = branchesWithoutWorktree(
      [branch("main"), branch("topic"), branch("origin/main", true)],
      [worktree("main"), worktree(null)],
    );
    expect(result.map((item) => item.name)).toEqual(["topic"]);
  });
});

describe("shortHead", () => {
  it("shortens commit ids", () => {
    expect(shortHead("0123456789")).toBe("0123456");
    expect(shortHead(null)).toBe("");
  });
});
