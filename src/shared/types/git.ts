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
  | "mergeCommitNeedsParent"
  | "tagAlreadyExists"
  | "tagNotFound"
  | "nothingToStash"
  | "stashNotFound"
  | "rebaseHasMerges"
  | "nothingToRebase"
  | "fileNotInRevision"
  | "githubUnauthorized"
  | "githubForbidden"
  | "githubNotFound"
  | "githubRateLimited"
  | "githubValidation"
  | "githubNotMergeable"
  | "githubServerError"
  | "githubNoAccount"
  | "githubNotConfigured"
  | "githubDeviceDenied"
  | "githubDeviceExpired"
  | "githubNotARepository"
  | "credentialStoreUnavailable"
  | "terminalUnavailable"
  | "terminalNotFound"
  | "worktreeHasChanges"
  | "branchInUseByWorktree"
  | "signingFailed"
  | "signingKeyMissing"
  | "lfsNotInstalled"
  | "editorNotFound"
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

export interface Tag {
  name: string;
  targetHash: string;
  annotated: boolean;
  message: string | null;
  tagger: string | null;
  time: number;
}

export type ResetMode = "soft" | "mixed" | "hard";

export interface Stash {
  index: number;
  hash: string;
  branch: string | null;
  message: string;
  time: number;
}

export type HistoryScope = "current" | "all";

export type ContentMode = "text" | "regex";

export interface HistoryQuery {
  revision?: string | null;
  scope: HistoryScope;
  text: string | null;
  author: string | null;
  content: string | null;
  contentMode: ContentMode;
  path: string | null;
  follow: boolean;
  since: string | null;
  until: string | null;
  topoOrder: boolean;
}

export interface CompareSummary {
  onlyInBase: number;
  onlyInHead: number;
  mergeBase: string | null;
}

export type ConflictKind = "bothModified" | "bothAdded" | "deletedByUs" | "deletedByThem" | "bothDeleted";

export type ConflictSide = "ours" | "theirs";

export type LineEnding = "lf" | "crlf";

export interface ConflictFile {
  path: string;
  kind: ConflictKind;
  binary: boolean;
  tooLarge: boolean;
  lineEnding: LineEnding;
  base: string | null;
  ours: string | null;
  theirs: string | null;
  working: string | null;
}

export type RebaseAction = "pick" | "reword" | "edit" | "squash" | "fixup" | "drop";

export interface RebaseCommit {
  hash: string;
  shortHash: string;
  subject: string;
  authorName: string;
  pushed: boolean;
}

export interface RebasePlan {
  base: string;
  commits: RebaseCommit[];
}

export interface RebaseStepPayload {
  hash: string;
  action: RebaseAction;
  message: string | null;
}

export interface BlameCommit {
  hash: string;
  shortHash: string;
  author: string;
  authorTime: number;
  summary: string;
  uncommitted: boolean;
}

export interface BlameLine {
  commitIndex: number;
  originalLine: number;
  content: string;
}

export interface BlameResult {
  path: string;
  commits: BlameCommit[];
  lines: BlameLine[];
  binary: boolean;
  tooLarge: boolean;
  truncated: boolean;
}

export type ReflogAction =
  | "commit"
  | "commitAmend"
  | "checkout"
  | "merge"
  | "rebase"
  | "reset"
  | "cherryPick"
  | "revert"
  | "pull"
  | "clone"
  | "branch"
  | "other";

export interface ReflogEntry {
  index: number;
  hash: string;
  shortHash: string;
  time: number;
  action: ReflogAction;
  message: string;
}

export type UndoStrategy = "keepChangesStaged" | "restoreAll";

export interface UndoPlan {
  action: ReflogAction;
  strategy: UndoStrategy;
  message: string;
  currentHash: string;
  targetHash: string;
  targetShortHash: string;
}

export type AccountSource = "oauth" | "token";

export interface GithubAccount {
  id: string;
  host: string;
  login: string;
  name: string | null;
  avatarUrl: string;
  source: AccountSource;
}

export interface DeviceCode {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresIn: number;
  interval: number;
}

export interface RemoteRepo {
  remoteName: string;
  url: string;
  host: string;
  owner: string;
  name: string;
}

export interface Worktree {
  path: string;
  head: string | null;
  branch: string | null;
  detached: boolean;
  bare: boolean;
  locked: boolean;
  lockReason: string | null;
  prunable: boolean;
  prunableReason: string | null;
  isMain: boolean;
  isCurrent: boolean;
}

export interface NewWorktree {
  path: string;
  branch: string | null;
  newBranch: string | null;
  startPoint: string | null;
  detach: boolean;
}

export type SubmoduleState = "uninitialized" | "upToDate" | "modified" | "conflict";

export interface Submodule {
  name: string;
  path: string;
  url: string | null;
  branch: string | null;
  commit: string;
  state: SubmoduleState;
  describe: string | null;
}

export type SignatureStatus =
  | "none"
  | "good"
  | "goodUntrusted"
  | "goodExpired"
  | "goodExpiredKey"
  | "goodRevokedKey"
  | "bad"
  | "unverifiable";

export interface SignatureInfo {
  status: SignatureStatus;
  signer: string | null;
  key: string | null;
}

export type SignatureFormat = "openpgp" | "ssh";
export type SigningScope = "local" | "global";

export interface SigningConfig {
  enabled: boolean;
  format: string;
  key: string | null;
  allowedSigners: string | null;
  scope: string | null;
}

export interface SigningUpdate {
  scope: SigningScope;
  enabled: boolean;
  format: SignatureFormat;
  key: string | null;
  allowedSigners: string | null;
}

export interface GpgKey {
  keyId: string;
  fingerprint: string | null;
  user: string | null;
  created: number | null;
  expires: number | null;
  expired: boolean;
}

export interface SshKey {
  path: string;
  kind: string;
  comment: string | null;
  fingerprint: string | null;
}

export interface SigningKeys {
  gpgAvailable: boolean;
  gpg: GpgKey[];
  ssh: SshKey[];
}
