mod common;

use std::path::Path;

use common::{commit_file, git_output, git_try, new_repository, write_file, Workspace};
use githubdesk_lib::commands::operation::{self, OperationAction};
use githubdesk_lib::commands::{history, status};
use githubdesk_lib::error::ErrorKind;
use githubdesk_lib::git::parse::diff::LineKind;
use githubdesk_lib::git::repo_state::OperationKind;
use status::DiffSource;

async fn diverged_repository() -> Workspace {
    let workspace = new_repository().await;
    let repo = workspace.path.as_path();
    commit_file(repo, "f.txt", "base\n", "base").await;
    git_output(repo, &["checkout", "-b", "feature"]);
    commit_file(repo, "f.txt", "feature\n", "feature edit").await;
    git_output(repo, &["checkout", "main"]);
    commit_file(repo, "f.txt", "main\n", "main edit").await;
    workspace
}

async fn resolve(repo: &Path, content: &str) {
    write_file(repo, "f.txt", content);
    status::stage_paths(repo, &["f.txt".to_string()])
        .await
        .expect("stage resolution");
}

async fn current_kind(repo: &Path) -> Option<OperationKind> {
    operation::current_operation(repo)
        .await
        .expect("state")
        .map(|operation| operation.kind)
}

fn last_subject(repo: &Path) -> String {
    git_output(repo, &["log", "-1", "--format=%s"])
        .trim()
        .to_string()
}

#[tokio::test]
async fn ignoring_whitespace_hides_indentation_only_changes() {
    let workspace = new_repository().await;
    let repo = workspace.path.as_path();
    commit_file(repo, "f.txt", "alpha\nbeta\ngamma\n", "Add f").await;

    write_file(repo, "f.txt", "alpha\n    beta\ngamma\nextra\n");

    let normal = status::get_file_diff(repo, "f.txt", None, DiffSource::Unstaged, false)
        .await
        .expect("diff");
    let normal_changes = normal.hunks[0]
        .lines
        .iter()
        .filter(|line| line.kind != LineKind::Context)
        .count();
    assert_eq!(normal_changes, 3);
    assert!(normal.partial_staging_allowed);

    let ignored = status::get_file_diff(repo, "f.txt", None, DiffSource::Unstaged, true)
        .await
        .expect("diff");
    let ignored_changes = ignored.hunks[0]
        .lines
        .iter()
        .filter(|line| line.kind != LineKind::Context)
        .count();
    assert_eq!(ignored_changes, 1);
    assert!(!ignored.partial_staging_allowed);
}

#[tokio::test]
async fn commit_diff_can_ignore_whitespace() {
    let workspace = new_repository().await;
    let repo = workspace.path.as_path();
    commit_file(repo, "f.txt", "alpha\nbeta\n", "Add f").await;
    let hash = commit_file(repo, "f.txt", "alpha\n  beta\n", "Indent beta").await;

    let normal = history::commit_file_diff(repo, &hash, "f.txt", None, false)
        .await
        .expect("diff");
    assert!(!normal.hunks.is_empty());

    let ignored = history::commit_file_diff(repo, &hash, "f.txt", None, true)
        .await
        .expect("diff");
    assert!(ignored.hunks.is_empty());
}

#[tokio::test]
async fn merge_conflict_can_be_aborted() {
    let workspace = diverged_repository().await;
    let repo = workspace.path.as_path();
    assert_eq!(current_kind(repo).await, None);

    let (merged, _) = git_try(repo, &["merge", "feature"]);
    assert!(!merged);
    assert_eq!(current_kind(repo).await, Some(OperationKind::Merge));

    operation::run_operation_action(repo, OperationAction::Abort)
        .await
        .expect("abort");
    assert_eq!(current_kind(repo).await, None);
    assert!(status::get_status(repo)
        .await
        .expect("status")
        .entries
        .is_empty());
}

#[tokio::test]
async fn merge_continue_requires_resolution_and_creates_the_merge_commit() {
    let workspace = diverged_repository().await;
    let repo = workspace.path.as_path();
    git_try(repo, &["merge", "feature"]);

    let error = operation::run_operation_action(repo, OperationAction::Continue)
        .await
        .expect_err("unresolved");
    assert_eq!(error.kind, ErrorKind::UnmergedFiles);

    let skip = operation::run_operation_action(repo, OperationAction::Skip)
        .await
        .expect_err("merge cannot be skipped");
    assert_eq!(skip.kind, ErrorKind::InvalidInput);

    resolve(repo, "resolved\n").await;
    operation::run_operation_action(repo, OperationAction::Continue)
        .await
        .expect("continue");
    assert_eq!(current_kind(repo).await, None);
    let parents = git_output(repo, &["log", "-1", "--format=%P"]);
    assert_eq!(parents.split_whitespace().count(), 2);
}

#[tokio::test]
async fn cherry_pick_conflict_can_continue_skip_and_abort() {
    let workspace = diverged_repository().await;
    let repo = workspace.path.as_path();
    let feature = git_output(repo, &["rev-parse", "feature"])
        .trim()
        .to_string();

    let (picked, _) = git_try(repo, &["cherry-pick", &feature]);
    assert!(!picked);
    assert_eq!(current_kind(repo).await, Some(OperationKind::CherryPick));
    operation::run_operation_action(repo, OperationAction::Abort)
        .await
        .expect("abort");
    assert_eq!(current_kind(repo).await, None);

    git_try(repo, &["cherry-pick", &feature]);
    resolve(repo, "resolved\n").await;
    operation::run_operation_action(repo, OperationAction::Continue)
        .await
        .expect("continue");
    assert_eq!(current_kind(repo).await, None);
    assert_eq!(last_subject(repo), "feature edit");

    git_output(repo, &["reset", "--hard", "HEAD~1"]);
    git_try(repo, &["cherry-pick", &feature]);
    operation::run_operation_action(repo, OperationAction::Skip)
        .await
        .expect("skip");
    assert_eq!(current_kind(repo).await, None);
    assert_eq!(last_subject(repo), "main edit");
}

#[tokio::test]
async fn revert_conflict_is_detected_and_aborted() {
    let workspace = new_repository().await;
    let repo = workspace.path.as_path();
    commit_file(repo, "f.txt", "one\n", "one").await;
    commit_file(repo, "f.txt", "two\n", "two").await;
    commit_file(repo, "f.txt", "three\n", "three").await;

    let (reverted, _) = git_try(repo, &["revert", "--no-edit", "HEAD~1"]);
    assert!(!reverted);
    assert_eq!(current_kind(repo).await, Some(OperationKind::Revert));

    operation::run_operation_action(repo, OperationAction::Abort)
        .await
        .expect("abort");
    assert_eq!(current_kind(repo).await, None);
    assert_eq!(last_subject(repo), "three");
}

#[tokio::test]
async fn rebase_conflict_reports_progress_and_continues() {
    let workspace = diverged_repository().await;
    let repo = workspace.path.as_path();
    git_output(repo, &["checkout", "feature"]);

    let (rebased, _) = git_try(repo, &["rebase", "main"]);
    assert!(!rebased);
    let info = operation::current_operation(repo)
        .await
        .expect("state")
        .expect("rebase in progress");
    assert_eq!(info.kind, OperationKind::Rebase);
    assert_eq!(info.step, Some(1));
    assert_eq!(info.total, Some(1));
    assert_eq!(info.branch.as_deref(), Some("feature"));

    let error = operation::run_operation_action(repo, OperationAction::Continue)
        .await
        .expect_err("unresolved");
    assert!(
        matches!(
            error.kind,
            ErrorKind::UnmergedFiles | ErrorKind::UnstagedChanges
        ),
        "{error:?}"
    );

    resolve(repo, "resolved\n").await;
    operation::run_operation_action(repo, OperationAction::Continue)
        .await
        .expect("continue");
    assert_eq!(current_kind(repo).await, None);
    assert_eq!(last_subject(repo), "feature edit");
    assert_eq!(
        git_output(repo, &["rev-parse", "--abbrev-ref", "HEAD"]).trim(),
        "feature"
    );
}

#[tokio::test]
async fn rebase_conflict_can_be_aborted() {
    let workspace = diverged_repository().await;
    let repo = workspace.path.as_path();
    git_output(repo, &["checkout", "feature"]);
    let before = git_output(repo, &["rev-parse", "HEAD"]);
    git_try(repo, &["rebase", "main"]);

    operation::run_operation_action(repo, OperationAction::Abort)
        .await
        .expect("abort");
    assert_eq!(current_kind(repo).await, None);
    assert_eq!(git_output(repo, &["rev-parse", "HEAD"]), before);
}

#[tokio::test]
async fn actions_fail_clearly_without_an_operation() {
    let workspace = new_repository().await;
    let repo = workspace.path.as_path();
    commit_file(repo, "f.txt", "one\n", "one").await;
    let error = operation::run_operation_action(repo, OperationAction::Continue)
        .await
        .expect_err("nothing to continue");
    assert_eq!(error.kind, ErrorKind::NoOperationInProgress);
}
