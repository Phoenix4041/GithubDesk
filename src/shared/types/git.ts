export type ErrorKind =
  | "gitNotFound"
  | "notARepository"
  | "unsafeDirectory"
  | "authenticationFailed"
  | "networkUnavailable"
  | "remoteNotFound"
  | "remoteAhead"
  | "noUpstream"
  | "noRemote"
  | "mergeConflict"
  | "unmergedFiles"
  | "localChangesWouldBeOverwritten"
  | "branchAlreadyExists"
  | "branchNotFullyMerged"
  | "branchCheckedOut"
  | "branchNotFound"
  | "invalidName"
  | "nothingToCommit"
  | "emptyCommitMessage"
  | "identityMissing"
  | "hookRejected"
  | "destinationNotEmpty"
  | "repositoryLocked"
  | "unrelatedHistories"
  | "patchRejected"
  | "operationInProgress"
  | "noOperationInProgress"
  | "unstagedChanges"
  | "commitBecameEmpty"
  | "noCommits"
  | "cancelled"
  | "invalidInput"
  | "io"
  | "unknown";

export type SuggestedAction = "pull" | "publishBranch" | "retry" | "showChanges" | "forceDelete";

export interface AppError {
  kind: ErrorKind;
  suggestedAction: SuggestedAction | null;
  detail: string;
}

export interface Progress {
  phase: string;
  percent: number;
  detail: string;
}

export interface RepositoryInfo {
  path: string;
  name: string;
}

export type ChangeKind =
  | "unmodified"
  | "modified"
  | "added"
  | "deleted"
  | "renamed"
  | "copied"
  | "typeChanged"
  | "unmerged"
  | "untracked";

export interface StatusEntry {
  path: string;
  originalPath: string | null;
  index: ChangeKind;
  worktree: ChangeKind;
  conflicted: boolean;
  untracked: boolean;
  submodule: boolean;
}

export interface BranchStatus {
  head: string | null;
  oid: string | null;
  upstream: string | null;
  ahead: number;
  behind: number;
  detached: boolean;
  unborn: boolean;
}

export interface StatusSnapshot {
  branch: BranchStatus;
  entries: StatusEntry[];
}

export type FileChange = "modified" | "added" | "deleted" | "renamed";

export type LineKind = "context" | "added" | "removed" | "noNewline";

export interface DiffLine {
  kind: LineKind;
  content: string;
  oldNumber: number | null;
  newNumber: number | null;
}

export interface Hunk {
  header: string;
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: DiffLine[];
}

export interface FileDiff {
  path: string;
  oldPath: string | null;
  change: FileChange;
  binary: boolean;
  tooLarge: boolean;
  partialStagingAllowed: boolean;
  hunks: Hunk[];
}

export type DiffSource = "staged" | "unstaged" | "raw";

export interface LineSelection {
  hunkIndex: number;
  lineIndices: number[];
}

export interface Branch {
  name: string;
  fullName: string;
  isRemote: boolean;
  remote: string | null;
  isCurrent: boolean;
  upstream: string | null;
  ahead: number;
  behind: number;
  upstreamGone: boolean;
  tipHash: string;
  tipTime: number;
}

export interface Remote {
  name: string;
  url: string;
}

export type RefKind = "head" | "localBranch" | "remoteBranch" | "tag";

export interface RefLabel {
  name: string;
  kind: RefKind;
}

export interface CommitSummary {
  hash: string;
  shortHash: string;
  parents: string[];
  authorName: string;
  authorEmail: string;
  authorTime: number;
  refs: RefLabel[];
  subject: string;
}

export interface CommitDetail {
  summary: CommitSummary;
  body: string;
  committerName: string;
  committerTime: number;
}

export interface CommitFile {
  path: string;
  oldPath: string | null;
  status: ChangeKind;
}

export interface HeadCommit {
  hash: string;
  title: string;
  description: string;
  pushed: boolean;
  parentCount: number;
}

export type OperationKind = "merge" | "cherryPick" | "revert" | "rebase";

export type OperationAction = "continue" | "skip" | "abort";

export interface RepoOperation {
  kind: OperationKind;
  step: number | null;
  total: number | null;
  branch: string | null;
}
