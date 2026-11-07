use serde::Serialize;
use thiserror::Error;

const MAX_DETAIL_LENGTH: usize = 4000;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ErrorKind {
    GitNotFound,
    NotARepository,
    UnsafeDirectory,
    AuthenticationFailed,
    NetworkUnavailable,
    RemoteNotFound,
    RemoteAhead,
    NoUpstream,
    NoRemote,
    MergeConflict,
    UnmergedFiles,
    LocalChangesWouldBeOverwritten,
    BranchAlreadyExists,
    BranchNotFullyMerged,
    BranchCheckedOut,
    BranchNotFound,
    InvalidName,
    NothingToCommit,
    EmptyCommitMessage,
    IdentityMissing,
    HookRejected,
    DestinationNotEmpty,
    RepositoryLocked,
    UnrelatedHistories,
    PatchRejected,
    OperationInProgress,
    NoOperationInProgress,
    UnstagedChanges,
    CommitBecameEmpty,
    NoCommits,
    Cancelled,
    InvalidInput,
    Io,
    Unknown,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum SuggestedAction {
    Pull,
    PublishBranch,
    Retry,
    ShowChanges,
    ForceDelete,
}

#[derive(Debug, Clone, Serialize, Error)]
#[serde(rename_all = "camelCase")]
#[error("{kind:?}: {detail}")]
pub struct AppError {
    pub kind: ErrorKind,
    pub suggested_action: Option<SuggestedAction>,
    pub detail: String,
}

pub type AppResult<T> = Result<T, AppError>;

impl AppError {
    pub fn new(kind: ErrorKind, detail: impl Into<String>) -> Self {
        let mut detail: String = detail.into();
        if detail.len() > MAX_DETAIL_LENGTH {
            let mut cut = MAX_DETAIL_LENGTH;
            while !detail.is_char_boundary(cut) {
                cut -= 1;
            }
            detail.truncate(cut);
        }
        Self {
            kind,
            suggested_action: suggested_action_for(kind),
            detail,
        }
    }

    pub fn from_git_failure(stdout: &str, stderr: &str) -> Self {
        let combined = format!("{stderr}\n{stdout}");
        let kind = classify_failure(&combined);
        let detail = if stderr.trim().is_empty() {
            stdout.trim()
        } else {
            stderr.trim()
        };
        Self::new(kind, detail)
    }

    pub fn cancelled() -> Self {
        Self::new(ErrorKind::Cancelled, "operation cancelled")
    }

    pub fn invalid_input(detail: impl Into<String>) -> Self {
        Self::new(ErrorKind::InvalidInput, detail)
    }
}

impl From<std::io::Error> for AppError {
    fn from(error: std::io::Error) -> Self {
        Self::new(ErrorKind::Io, error.to_string())
    }
}

pub fn suggested_action_for(kind: ErrorKind) -> Option<SuggestedAction> {
    match kind {
        ErrorKind::RemoteAhead => Some(SuggestedAction::Pull),
        ErrorKind::NoUpstream => Some(SuggestedAction::PublishBranch),
        ErrorKind::NetworkUnavailable
        | ErrorKind::AuthenticationFailed
        | ErrorKind::RepositoryLocked => Some(SuggestedAction::Retry),
        ErrorKind::MergeConflict
        | ErrorKind::UnmergedFiles
        | ErrorKind::UnstagedChanges
        | ErrorKind::LocalChangesWouldBeOverwritten => Some(SuggestedAction::ShowChanges),
        ErrorKind::BranchNotFullyMerged => Some(SuggestedAction::ForceDelete),
        _ => None,
    }
}

pub fn classify_failure(output: &str) -> ErrorKind {
    let text = output.to_lowercase();
    let has = |needle: &str| text.contains(needle);

    if has("not a git repository") {
        return ErrorKind::NotARepository;
    }
    if has("detected dubious ownership") {
        return ErrorKind::UnsafeDirectory;
    }
    if has("another git process seems to be running") || has("index.lock") {
        return ErrorKind::RepositoryLocked;
    }
    if has("please tell me who you are")
        || has("unable to auto-detect email address")
        || has("empty ident name")
    {
        return ErrorKind::IdentityMissing;
    }
    if has("authentication failed")
        || has("could not read username")
        || has("could not read password")
        || has("terminal prompts disabled")
        || has("permission denied (publickey)")
        || has("invalid credentials")
        || has("returned error: 403")
        || has("returned error: 401")
    {
        return ErrorKind::AuthenticationFailed;
    }
    if has("repository not found")
        || has("returned error: 404")
        || has("does not appear to be a git repository")
    {
        return ErrorKind::RemoteNotFound;
    }
    if has("no configured push destination")
        || has("no remote repository specified")
        || has("no such remote")
    {
        return ErrorKind::NoRemote;
    }
    if has("could not resolve host")
        || has("failed to connect")
        || has("connection timed out")
        || has("connection refused")
        || has("network is unreachable")
        || has("unable to access")
    {
        return ErrorKind::NetworkUnavailable;
    }
    if has("has no upstream branch")
        || has("no upstream configured")
        || has("no tracking information for the current branch")
    {
        return ErrorKind::NoUpstream;
    }
    if has("non-fast-forward")
        || has("fetch first")
        || has("updates were rejected because the remote contains work")
        || has("updates were rejected because the tip of your current branch is behind")
    {
        return ErrorKind::RemoteAhead;
    }
    if has("is now empty") || has("did you forget to use 'git add'") {
        return ErrorKind::CommitBecameEmpty;
    }
    if has("you have not concluded your merge")
        || has("already in progress")
        || has("already a rebase-merge directory")
        || has("already a rebase-apply directory")
    {
        return ErrorKind::OperationInProgress;
    }
    if has("no rebase in progress")
        || has("no cherry-pick or revert in progress")
        || has("there is no merge to abort")
    {
        return ErrorKind::NoOperationInProgress;
    }
    if has("you have unstaged changes") {
        return ErrorKind::UnstagedChanges;
    }
    if has("you have unmerged paths")
        || has("unmerged files")
        || has("needs merge")
        || has("unresolved conflict")
        || has("you must edit all merge conflicts")
    {
        return ErrorKind::UnmergedFiles;
    }
    if has("automatic merge failed") || has("conflict (") || has("merge conflict") {
        return ErrorKind::MergeConflict;
    }
    if has("would be overwritten by")
        || has("please commit your changes or stash them")
        || has("local changes to the following files would be overwritten")
    {
        return ErrorKind::LocalChangesWouldBeOverwritten;
    }
    if has("not fully merged") {
        return ErrorKind::BranchNotFullyMerged;
    }
    if (has("cannot delete branch") && has("checked out")) || has("cannot delete the branch") {
        return ErrorKind::BranchCheckedOut;
    }
    if has("a branch named") && has("already exists") {
        return ErrorKind::BranchAlreadyExists;
    }
    if has("is not a valid branch name") || has("not a valid ref name") {
        return ErrorKind::InvalidName;
    }
    if has("invalid reference") || (has("branch") && has("not found")) {
        return ErrorKind::BranchNotFound;
    }
    if has("nothing to commit") || has("no changes added to commit") {
        return ErrorKind::NothingToCommit;
    }
    if has("empty commit message") {
        return ErrorKind::EmptyCommitMessage;
    }
    if has("pre-commit hook") || has("hook declined") || has("commit-msg hook") {
        return ErrorKind::HookRejected;
    }
    if has("already exists and is not an empty directory") {
        return ErrorKind::DestinationNotEmpty;
    }
    if has("does not have any commits yet")
        || has("bad default revision")
        || has("bad revision 'head'")
    {
        return ErrorKind::NoCommits;
    }
    if has("refusing to merge unrelated histories") {
        return ErrorKind::UnrelatedHistories;
    }
    if has("patch does not apply") || has("patch failed") || has("corrupt patch") {
        return ErrorKind::PatchRejected;
    }
    ErrorKind::Unknown
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_rejected_push_as_remote_ahead() {
        let output = "To origin\n ! [rejected]        main -> main (fetch first)\nerror: failed to push some refs";
        assert_eq!(classify_failure(output), ErrorKind::RemoteAhead);
        assert_eq!(
            suggested_action_for(ErrorKind::RemoteAhead),
            Some(SuggestedAction::Pull)
        );
    }

    #[test]
    fn detects_missing_upstream() {
        let output = "fatal: The current branch feature has no upstream branch.";
        assert_eq!(classify_failure(output), ErrorKind::NoUpstream);
    }

    #[test]
    fn detects_authentication_before_network() {
        let output =
            "fatal: unable to access 'https://x/y.git/': The requested URL returned error: 403";
        assert_eq!(classify_failure(output), ErrorKind::AuthenticationFailed);
    }

    #[test]
    fn detects_network_failure() {
        let output = "fatal: unable to access 'https://x/y.git/': Could not resolve host: x";
        assert_eq!(classify_failure(output), ErrorKind::NetworkUnavailable);
    }

    #[test]
    fn detects_merge_conflict_from_stdout() {
        let output =
            "CONFLICT (content): Merge conflict in a.txt\nAutomatic merge failed; fix conflicts";
        assert_eq!(classify_failure(output), ErrorKind::MergeConflict);
    }

    #[test]
    fn detects_unmerged_branch_delete() {
        let output = "error: the branch 'topic' is not fully merged";
        assert_eq!(classify_failure(output), ErrorKind::BranchNotFullyMerged);
        assert_eq!(
            suggested_action_for(ErrorKind::BranchNotFullyMerged),
            Some(SuggestedAction::ForceDelete)
        );
    }

    #[test]
    fn detects_nothing_to_commit_and_identity() {
        assert_eq!(
            classify_failure("On branch main\nnothing to commit, working tree clean"),
            ErrorKind::NothingToCommit
        );
        assert_eq!(
            classify_failure(
                "*** Please tell me who you are.\nfatal: unable to auto-detect email address"
            ),
            ErrorKind::IdentityMissing
        );
    }

    #[test]
    fn detects_repository_without_commits() {
        assert_eq!(
            classify_failure("fatal: bad revision 'HEAD'"),
            ErrorKind::NoCommits
        );
        assert_eq!(
            classify_failure("fatal: your current branch 'main' does not have any commits yet"),
            ErrorKind::NoCommits
        );
    }

    #[test]
    fn detects_operation_state_errors() {
        assert_eq!(
            classify_failure("fatal: You have not concluded your merge (MERGE_HEAD exists)."),
            ErrorKind::OperationInProgress
        );
        assert_eq!(
            classify_failure("error: a cherry-pick or revert is already in progress"),
            ErrorKind::OperationInProgress
        );
        assert_eq!(
            classify_failure("fatal: No rebase in progress?"),
            ErrorKind::NoOperationInProgress
        );
        assert_eq!(
            classify_failure("fatal: There is no merge to abort (MERGE_HEAD missing)."),
            ErrorKind::NoOperationInProgress
        );
    }

    #[test]
    fn detects_empty_results_before_nothing_to_commit() {
        let output = "nothing to commit, working tree clean
The previous cherry-pick is now empty, possibly due to conflict resolution.";
        assert_eq!(classify_failure(output), ErrorKind::CommitBecameEmpty);
        assert_eq!(
            classify_failure("No changes - did you forget to use 'git add'?"),
            ErrorKind::CommitBecameEmpty
        );
    }

    #[test]
    fn unresolved_conflicts_on_continue_are_unmerged_files() {
        let output = "f.txt: needs merge
You must edit all merge conflicts and then
mark them as resolved using git add";
        assert_eq!(classify_failure(output), ErrorKind::UnmergedFiles);
    }

    #[test]
    fn detects_unstaged_changes() {
        assert_eq!(
            classify_failure("error: cannot rebase: You have unstaged changes."),
            ErrorKind::UnstagedChanges
        );
        assert_eq!(
            suggested_action_for(ErrorKind::UnstagedChanges),
            Some(SuggestedAction::ShowChanges)
        );
    }

    #[test]
    fn falls_back_to_unknown() {
        assert_eq!(classify_failure("something odd"), ErrorKind::Unknown);
    }

    #[test]
    fn truncates_long_detail_on_char_boundary() {
        let error = AppError::new(ErrorKind::Unknown, "é".repeat(5000));
        assert!(error.detail.len() <= MAX_DETAIL_LENGTH);
    }
}
