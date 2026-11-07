import type { FileDiff } from "@/shared/types/git";

export interface UserRef {
  login: string;
  avatarUrl: string;
  htmlUrl: string;
}

export interface Label {
  name: string;
  color: string;
  description: string | null;
}

export interface Page<T> {
  items: T[];
  nextPage: number | null;
}

export interface BranchRef {
  label: string;
  refName: string;
  sha: string;
  repo: { fullName: string } | null;
}

export interface PullRequest {
  number: number;
  title: string;
  state: string;
  draft: boolean;
  body: string | null;
  user: UserRef | null;
  labels: Label[];
  assignees: UserRef[];
  requestedReviewers: UserRef[];
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  mergedAt: string | null;
  htmlUrl: string;
  head: BranchRef;
  base: BranchRef;
  merged: boolean | null;
  mergeable: boolean | null;
  mergeableState: string | null;
  additions: number | null;
  deletions: number | null;
  changedFiles: number | null;
  commits: number | null;
  comments: number | null;
  reviewComments: number | null;
  mergedBy: UserRef | null;
}

export interface Comment {
  id: number;
  user: UserRef | null;
  body: string | null;
  createdAt: string;
  updatedAt: string | null;
  htmlUrl: string;
  authorAssociation: string | null;
}

export interface Review {
  id: number;
  user: UserRef | null;
  state: string;
  body: string | null;
  submittedAt: string | null;
  htmlUrl: string;
}

export interface CheckRun {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  htmlUrl: string | null;
  completedAt: string | null;
}

export interface PullBundle {
  pull: PullRequest;
  comments: Comment[];
  reviews: Review[];
  checks: CheckRun[];
}

export interface PullFile {
  path: string;
  previousPath: string | null;
  status: string;
  additions: number;
  deletions: number;
  diff: FileDiff;
}

export interface RepoInfo {
  fullName: string;
  defaultBranch: string;
  private: boolean;
  htmlUrl: string;
  permissions: { admin: boolean; push: boolean; pull: boolean } | null;
  allowMergeCommit: boolean;
  allowSquashMerge: boolean;
  allowRebaseMerge: boolean;
  hasIssues: boolean;
}

export interface MergeResult {
  merged: boolean;
  message: string;
  sha: string | null;
}

export interface NewPull {
  title: string;
  body: string;
  head: string;
  base: string;
  draft: boolean;
}

export type MergeMethod = "merge" | "squash" | "rebase";

export interface Issue {
  number: number;
  title: string;
  state: string;
  stateReason: string | null;
  body: string | null;
  user: UserRef | null;
  labels: Label[];
  assignees: UserRef[];
  comments: number;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  htmlUrl: string;
}

export interface WorkflowRun {
  id: number;
  name: string | null;
  displayTitle: string | null;
  headBranch: string | null;
  headSha: string;
  event: string;
  status: string | null;
  conclusion: string | null;
  runNumber: number;
  runAttempt: number | null;
  createdAt: string;
  updatedAt: string;
  runStartedAt: string | null;
  htmlUrl: string;
  actor: UserRef | null;
  workflowId: number | null;
}

export interface JobStep {
  name: string;
  status: string;
  conclusion: string | null;
  number: number;
}

export interface Job {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  startedAt: string | null;
  completedAt: string | null;
  htmlUrl: string | null;
  steps: JobStep[];
}

export interface Workflow {
  id: number;
  name: string;
  path: string;
  state: string;
}
