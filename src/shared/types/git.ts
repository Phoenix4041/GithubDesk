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
  | "patchNotApplicable"
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
  | "nothingToMerge"
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
  | "githubMissingScope"
  | "githubAccountMismatch"
  | "systemLoginUnavailable"
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

export type SuggestedAction = "pull" | "publishBranch" | "retry" | "showChanges" | "forceDelete" | "grantScopes";

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

export type OperationKind = "merge" | "cherryPick" | "revert" | "rebase" | "am";

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

export type AccountSource = "oauth" | "token" | "system" | "cli";

export interface GithubAccount {
  id: string;
  host: string;
  login: string;
  name: string | null;
  avatarUrl: string;
  source: AccountSource;
  userId: number | null;
}

export type CapabilityId =
  | "repos"
  | "workflows"
  | "orgRead"
  | "orgAdmin"
  | "sshKeys"
  | "gpgKeys"
  | "deleteRepo"
  | "notifications"
  | "emails"
  | "profile";

export interface CapabilityStatus {
  id: CapabilityId;
  request: string[];
  granted: boolean | null;
}

export interface RateLimit {
  limit: number;
  remaining: number;
  resetAt: number;
}

export interface TokenInfo {
  login: string;
  scopes: string[] | null;
  expiresAt: string | null;
  rateLimit: RateLimit | null;
  capabilities: CapabilityStatus[];
}

export interface OrgSummary {
  login: string;
  description: string | null;
  avatarUrl: string;
}

export interface RepoPermissions {
  admin: boolean;
  push: boolean;
  pull: boolean;
}

export interface RepoSummary {
  name: string;
  fullName: string;
  owner: { login: string };
  description: string | null;
  private: boolean;
  fork: boolean;
  archived: boolean;
  defaultBranch: string;
  pushedAt: string | null;
  language: string | null;
  htmlUrl: string;
  cloneUrl: string;
  sshUrl: string;
  permissions: RepoPermissions | null;
}

export interface NewRepo {
  name: string;
  description: string;
  private: boolean;
  autoInit: boolean;
  gitignoreTemplate: string | null;
  licenseTemplate: string | null;
}

export interface IdentityValue {
  value: string;
  scope: string;
}

export interface Identity {
  name: IdentityValue | null;
  email: IdentityValue | null;
  signingKey: IdentityValue | null;
  signingEnabled: boolean;
}

export type SigningFormat = "openpgp" | "ssh" | "x509";

export interface IdentityUpdate {
  name: string;
  email: string;
  signing: { key: string; format: SigningFormat } | null;
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

export interface LfsPattern {
  pattern: string;
  source: string;
}

export interface LfsFile {
  oid: string;
  present: boolean;
  path: string;
  size: string | null;
}

export interface LfsStatus {
  installed: boolean;
  version: string | null;
  filtersConfigured: boolean;
  hooksInstalled: boolean;
  patterns: LfsPattern[];
  files: LfsFile[];
  filesTruncated: boolean;
}

export interface IgnoreFile {
  content: string;
  exists: boolean;
}

export interface IgnoreMatch {
  path: string;
  ignored: boolean;
  source: string | null;
  line: number | null;
  pattern: string | null;
}

export interface EditorOption {
  id: string;
  label: string;
}

export type MergeMode = "merge" | "noFastForward" | "squash";
export type MergeOutcome = "fastForward" | "merged" | "squashed";

export interface MergePreview {
  commits: number;
  filesChanged: number;
  upToDate: boolean;
  canFastForward: boolean;
  unrelated: boolean;
  conflicts: string[];
}

export interface CleanupFile {
  path: string;
  directory: boolean;
}

export interface CleanupBranch {
  name: string;
  hash: string;
  uniqueCommits: number;
}

export interface CleanupPreview {
  untracked: CleanupFile[];
  ignored: CleanupFile[];
  mergedBranches: CleanupBranch[];
  goneBranches: CleanupBranch[];
}

export interface StaleRemoteBranch {
  remote: string;
  name: string;
}

export interface CleanupRequest {
  untracked: string[];
  ignored: string[];
  mergedBranches: string[];
  goneBranches: string[];
  pruneRemotes: string[];
}

export interface CleanupFailure {
  item: string;
  detail: string;
}

export interface CleanupReport {
  removedFiles: number;
  deletedBranches: Array<{ name: string; hash: string }>;
  prunedBranches: number;
  failures: CleanupFailure[];
}

export type BisectVerdict = "good" | "bad" | "skip";

export interface BisectStep {
  verdict: BisectVerdict;
  hash: string;
  title: string;
}

export interface BisectCulprit {
  hash: string;
  title: string;
}

export interface BisectState {
  active: boolean;
  steps: BisectStep[];
  currentHash: string | null;
  currentTitle: string | null;
  remaining: number | null;
  estimatedSteps: number | null;
  culprit: BisectCulprit | null;
  startRef: string | null;
}

export type PatchApplyMode = "commit" | "workingTree";

export interface PatchFileChange {
  path: string;
  insertions: number | null;
  deletions: number | null;
}

export interface PatchPreview {
  file: string;
  mailbox: boolean;
  subject: string | null;
  author: string | null;
  changes: PatchFileChange[];
  appliesCleanly: boolean;
  problem: string | null;
}

export interface RebaseOntoPreview {
  replay: number;
  incoming: number;
  hasMerges: boolean;
  upToDate: boolean;
  conflicts: string[];
}
