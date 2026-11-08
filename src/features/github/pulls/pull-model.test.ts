import { describe, expect, it } from "vitest";
import type { CheckRun, PullRequest, RepoInfo, Review } from "../types";
import {
  allowedMergeMethods,
  canMerge,
  pullState,
  suggestPullTitle,
  summarizeChecks,
  summarizeReviews,
} from "./pull-model";

function run(status: string, conclusion: string | null): CheckRun {
  return { id: 1, name: "job", status, conclusion, htmlUrl: null, completedAt: null };
}

function review(login: string, state: string, submittedAt: string): Review {
  return {
    id: 1,
    user: { login, avatarUrl: "", htmlUrl: "" },
    state,
    body: null,
    submittedAt,
    htmlUrl: "",
  };
}

const baseInfo: RepoInfo = {
  fullName: "o/r",
  defaultBranch: "main",
  private: false,
  htmlUrl: "",
  permissions: { admin: false, push: true, pull: true },
  allowMergeCommit: true,
  allowSquashMerge: true,
  allowRebaseMerge: false,
  hasIssues: true,
};

function pull(overrides: Partial<PullRequest>): PullRequest {
  return {
    number: 1,
    nodeId: "PR_1",
    title: "t",
    state: "open",
    draft: false,
    body: null,
    user: null,
    labels: [],
    assignees: [],
    requestedReviewers: [],
    requestedTeams: [],
    milestone: null,
    createdAt: "",
    updatedAt: "",
    closedAt: null,
    mergedAt: null,
    htmlUrl: "",
    head: { label: "", refName: "topic", sha: "a", repo: null },
    base: { label: "", refName: "main", sha: "b", repo: null },
    merged: false,
    mergeable: true,
    mergeableState: "clean",
    additions: null,
    deletions: null,
    changedFiles: null,
    commits: null,
    comments: null,
    reviewComments: null,
    mergedBy: null,
    ...overrides,
  };
}

describe("pullState", () => {
  it("gives merged precedence, then closed, draft and open", () => {
    expect(pullState({ state: "closed", draft: false, mergedAt: "2026-01-01" })).toBe("merged");
    expect(pullState({ state: "closed", draft: false, mergedAt: null })).toBe("closed");
    expect(pullState({ state: "open", draft: true, mergedAt: null })).toBe("draft");
    expect(pullState({ state: "open", draft: false, mergedAt: null })).toBe("open");
  });
});

describe("summarizeChecks", () => {
  it("is none without runs", () => {
    expect(summarizeChecks([]).state).toBe("none");
  });

  it("is a success when everything passed or was skipped", () => {
    const summary = summarizeChecks([run("completed", "success"), run("completed", "skipped"), run("completed", "neutral")]);
    expect(summary).toMatchObject({ state: "success", passed: 3, failed: 0, pending: 0, total: 3 });
  });

  it("fails as soon as one run failed even if others are pending", () => {
    expect(summarizeChecks([run("completed", "failure"), run("in_progress", null)]).state).toBe("failure");
    expect(summarizeChecks([run("completed", "cancelled")]).state).toBe("failure");
  });

  it("is pending while runs are queued or unfinished", () => {
    expect(summarizeChecks([run("completed", "success"), run("queued", null)])).toMatchObject({ state: "pending", pending: 1 });
    expect(summarizeChecks([run("completed", null)]).state).toBe("pending");
  });
});

describe("merge rules", () => {
  it("lists only the methods the repository allows", () => {
    expect(allowedMergeMethods(baseInfo)).toEqual(["merge", "squash"]);
  });

  it("only allows merging open, mergeable pull requests with write access", () => {
    expect(canMerge(pull({}), baseInfo)).toBe(true);
    expect(canMerge(pull({ draft: true }), baseInfo)).toBe(false);
    expect(canMerge(pull({ mergeable: false }), baseInfo)).toBe(false);
    expect(canMerge(pull({ state: "closed" }), baseInfo)).toBe(false);
    expect(canMerge(pull({}), { ...baseInfo, permissions: { admin: false, push: false, pull: true } })).toBe(false);
    expect(canMerge(pull({ mergeable: null }), undefined)).toBe(true);
  });
});

describe("summarizeReviews", () => {
  it("keeps only the latest decision of each reviewer", () => {
    const summary = summarizeReviews([
      review("ana", "CHANGES_REQUESTED", "2026-01-01T10:00:00Z"),
      review("ana", "APPROVED", "2026-01-02T10:00:00Z"),
      review("beto", "APPROVED", "2026-01-01T12:00:00Z"),
      review("beto", "COMMENTED", "2026-01-03T12:00:00Z"),
      review("carla", "CHANGES_REQUESTED", "2026-01-02T09:00:00Z"),
    ]);
    expect(summary.approved.sort()).toEqual(["ana", "beto"]);
    expect(summary.changesRequested).toEqual(["carla"]);
  });
});

describe("suggestPullTitle", () => {
  it("uses the commit subject for a single commit", () => {
    expect(suggestPullTitle("feature/login", " Add login form ", 1)).toBe("Add login form");
  });

  it("turns the branch name into a sentence otherwise", () => {
    expect(suggestPullTitle("feature/add-login-form", "last", 3)).toBe("Add login form");
    expect(suggestPullTitle("fix/null_pointer", null, 2)).toBe("Null pointer");
    expect(suggestPullTitle("main", null, 0)).toBe("Main");
  });
});
