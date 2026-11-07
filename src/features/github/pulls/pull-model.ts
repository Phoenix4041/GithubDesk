import type { CheckRun, MergeMethod, PullRequest, RepoInfo, Review } from "../types";

export type PullState = "open" | "draft" | "merged" | "closed";

export function pullState(pull: Pick<PullRequest, "state" | "draft" | "mergedAt">): PullState {
  if (pull.mergedAt) {
    return "merged";
  }
  if (pull.state === "closed") {
    return "closed";
  }
  return pull.draft ? "draft" : "open";
}

export type ChecksState = "none" | "pending" | "success" | "failure";

export interface ChecksSummary {
  state: ChecksState;
  total: number;
  passed: number;
  failed: number;
  pending: number;
}

const FAILING = new Set(["failure", "timed_out", "cancelled", "action_required", "startup_failure", "stale"]);
const PASSING = new Set(["success", "neutral", "skipped"]);

export function summarizeChecks(runs: readonly CheckRun[]): ChecksSummary {
  let passed = 0;
  let failed = 0;
  let pending = 0;
  for (const run of runs) {
    if (run.status !== "completed") {
      pending += 1;
    } else if (run.conclusion && FAILING.has(run.conclusion)) {
      failed += 1;
    } else if (run.conclusion && PASSING.has(run.conclusion)) {
      passed += 1;
    } else {
      pending += 1;
    }
  }
  let state: ChecksState = "none";
  if (runs.length > 0) {
    state = failed > 0 ? "failure" : pending > 0 ? "pending" : "success";
  }
  return { state, total: runs.length, passed, failed, pending };
}

export function allowedMergeMethods(info: RepoInfo): MergeMethod[] {
  const methods: MergeMethod[] = [];
  if (info.allowMergeCommit) {
    methods.push("merge");
  }
  if (info.allowSquashMerge) {
    methods.push("squash");
  }
  if (info.allowRebaseMerge) {
    methods.push("rebase");
  }
  return methods;
}

export function canMerge(pull: PullRequest, info: RepoInfo | undefined): boolean {
  const writable = info?.permissions ? info.permissions.push || info.permissions.admin : true;
  return pullState(pull) === "open" && pull.mergeable !== false && writable;
}

export interface ReviewSummary {
  approved: string[];
  changesRequested: string[];
}

export function summarizeReviews(reviews: readonly Review[]): ReviewSummary {
  const latest = new Map<string, string>();
  const ordered = [...reviews].sort((left, right) => (left.submittedAt ?? "").localeCompare(right.submittedAt ?? ""));
  for (const review of ordered) {
    const login = review.user?.login;
    if (!login || review.state === "COMMENTED" || review.state === "PENDING") {
      continue;
    }
    latest.set(login, review.state);
  }
  const approved: string[] = [];
  const changesRequested: string[] = [];
  for (const [login, state] of latest) {
    if (state === "APPROVED") {
      approved.push(login);
    } else if (state === "CHANGES_REQUESTED") {
      changesRequested.push(login);
    }
  }
  return { approved, changesRequested };
}

export function suggestPullTitle(branch: string, lastSubject: string | null, commitCount: number): string {
  if (commitCount === 1 && lastSubject && lastSubject.trim().length > 0) {
    return lastSubject.trim();
  }
  const words = branch
    .replace(/^(feature|feat|fix|bugfix|hotfix|chore|docs)\//i, "")
    .split(/[-_/]+/)
    .filter((word) => word.length > 0);
  if (words.length === 0) {
    return branch;
  }
  const sentence = words.join(" ");
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}
