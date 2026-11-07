mod common;

use std::path::Path;

use common::{commit_file, git_output, git_try, new_repository, write_file, Workspace};
use githubdesk_lib::commands::commit_ops::{self, ResetMode};
use githubdesk_lib::commands::operation::{self, OperationAction};
use githubdesk_lib::commands::{history, remote, status, tag};
use githubdesk_lib::error::ErrorKind;
use githubdesk_lib::git::parse::diff::LineKind;
use githubdesk_lib::git::parse::status::ChangeKind;
use githubdesk_lib::git::repo_state::OperationKind;
use githubdesk_lib::jobs::CancelToken;
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

#[tokio::test]
async fn tags_can_be_created_listed_and_deleted() {
    let workspace = new_repository().await;
    let repo = workspace.path.as_path();
    let first = commit_file(repo, "f.txt", "one\n", "one").await;
    commit_file(repo, "f.txt", "two\n", "two").await;

    tag::create_tag(repo, "light", None, None)
        .await
        .expect("lightweight tag");
    tag::create_tag(repo, "v1.0", Some(&first), Some("First release"))
        .await
        .expect("annotated tag");

    let tags = tag::list_tags(repo).await.expect("list");
    assert_eq!(tags.len(), 2);
    let annotated = tags.iter().find(|tag| tag.name == "v1.0").expect("v1.0");
    assert!(annotated.annotated);
    assert_eq!(annotated.target_hash, first);
    assert_eq!(annotated.message.as_deref(), Some("First release"));
    let light = tags.iter().find(|tag| tag.name == "light").expect("light");
    assert!(!light.annotated);

    let duplicate = tag::create_tag(repo, "light", None, None)
        .await
        .expect_err("duplicate");
    assert_eq!(duplicate.kind, ErrorKind::TagAlreadyExists);

    let invalid = tag::create_tag(repo, "bad name", None, None)
        .await
        .expect_err("invalid");
    assert_eq!(invalid.kind, ErrorKind::InvalidName);
    let option_like = tag::create_tag(repo, "--force", None, None)
        .await
        .expect_err("option-like");
    assert_eq!(option_like.kind, ErrorKind::InvalidName);

    tag::delete_tag(repo, "light").await.expect("delete");
    assert_eq!(tag::list_tags(repo).await.expect("list").len(), 1);
    let missing = tag::delete_tag(repo, "light").await.expect_err("missing");
    assert_eq!(missing.kind, ErrorKind::TagNotFound);
}

#[tokio::test]
async fn tags_can_be_pushed_and_deleted_on_the_remote() {
    let workspace = new_repository().await;
    let repo = workspace.path.as_path();
    commit_file(repo, "f.txt", "one\n", "one").await;
    let remote_dir = tempfile::TempDir::new().expect("remote dir");
    git_output(remote_dir.path(), &["init", "--bare", "-b", "main"]);
    let remote_url = remote_dir.path().to_string_lossy().into_owned();
    git_output(repo, &["remote", "add", "origin", &remote_url]);

    tag::create_tag(repo, "v1", None, None).await.expect("tag");
    tag::push_tag(repo, "v1", CancelToken::never(), &|_| {})
        .await
        .expect("push tag");
    assert!(git_output(remote_dir.path(), &["tag"]).contains("v1"));

    tag::delete_remote_tag(repo, "v1", CancelToken::never(), &|_| {})
        .await
        .expect("delete remote tag");
    assert!(!git_output(remote_dir.path(), &["tag"]).contains("v1"));
}

#[tokio::test]
async fn cherry_pick_applies_several_commits_in_order() {
    let workspace = new_repository().await;
    let repo = workspace.path.as_path();
    commit_file(repo, "base.txt", "base\n", "base").await;
    git_output(repo, &["checkout", "-b", "feature"]);
    let first = commit_file(repo, "a.txt", "a\n", "add a").await;
    let second = commit_file(repo, "b.txt", "b\n", "add b").await;
    git_output(repo, &["checkout", "main"]);

    commit_ops::cherry_pick_commits(repo, &[first, second])
        .await
        .expect("cherry-pick");
    assert!(repo.join("a.txt").exists());
    assert!(repo.join("b.txt").exists());
    let subjects = git_output(repo, &["log", "-2", "--format=%s"]);
    assert_eq!(subjects.lines().collect::<Vec<_>>(), vec!["add b", "add a"]);

    let empty = commit_ops::cherry_pick_commits(repo, &[]).await;
    assert_eq!(empty.expect_err("empty").kind, ErrorKind::InvalidInput);
    let invalid = commit_ops::cherry_pick_commits(repo, &["--abort".to_string()]).await;
    assert_eq!(invalid.expect_err("invalid").kind, ErrorKind::InvalidInput);
}

#[tokio::test]
async fn cherry_pick_conflict_leaves_an_operation_to_resolve() {
    let workspace = diverged_repository().await;
    let repo = workspace.path.as_path();
    let feature = git_output(repo, &["rev-parse", "feature"])
        .trim()
        .to_string();

    let error = commit_ops::cherry_pick_commits(repo, &[feature])
        .await
        .expect_err("conflict");
    assert_eq!(error.kind, ErrorKind::MergeConflict);
    assert_eq!(current_kind(repo).await, Some(OperationKind::CherryPick));
}

#[tokio::test]
async fn revert_creates_an_inverse_commit_and_handles_merges() {
    let workspace = new_repository().await;
    let repo = workspace.path.as_path();
    commit_file(repo, "f.txt", "one\n", "one").await;
    let second = commit_file(repo, "g.txt", "g\n", "add g").await;

    commit_ops::revert_commit(repo, &second, None)
        .await
        .expect("revert");
    assert!(!repo.join("g.txt").exists());
    assert!(last_subject(repo).starts_with("Revert"));

    git_output(repo, &["checkout", "-b", "topic"]);
    commit_file(repo, "topic.txt", "t\n", "topic work").await;
    git_output(repo, &["checkout", "main"]);
    commit_file(repo, "main.txt", "m\n", "main work").await;
    git_output(repo, &["merge", "--no-ff", "-m", "merge topic", "topic"]);
    let merge = git_output(repo, &["rev-parse", "HEAD"]).trim().to_string();

    let without_parent = commit_ops::revert_commit(repo, &merge, None)
        .await
        .expect_err("needs parent");
    assert_eq!(without_parent.kind, ErrorKind::MergeCommitNeedsParent);

    commit_ops::revert_commit(repo, &merge, Some(1))
        .await
        .expect("revert merge");
    assert!(!repo.join("topic.txt").exists());
    assert!(repo.join("main.txt").exists());
}

#[tokio::test]
async fn reset_modes_move_head_and_keep_the_expected_state() {
    let workspace = new_repository().await;
    let repo = workspace.path.as_path();
    let first = commit_file(repo, "f.txt", "one\n", "one").await;
    commit_file(repo, "f.txt", "two\n", "two").await;

    commit_ops::reset_to(repo, &first, ResetMode::Soft)
        .await
        .expect("soft");
    assert_eq!(last_subject(repo), "one");
    let snapshot = status::get_status(repo).await.expect("status");
    assert_eq!(snapshot.entries.len(), 1);
    assert_eq!(snapshot.entries[0].index, ChangeKind::Modified);

    commit_ops::reset_to(repo, &first, ResetMode::Mixed)
        .await
        .expect("mixed");
    let snapshot = status::get_status(repo).await.expect("status");
    assert_eq!(snapshot.entries[0].worktree, ChangeKind::Modified);
    assert_eq!(snapshot.entries[0].index, ChangeKind::Unmodified);

    commit_ops::reset_to(repo, &first, ResetMode::Hard)
        .await
        .expect("hard");
    assert!(status::get_status(repo)
        .await
        .expect("status")
        .entries
        .is_empty());
    assert_eq!(
        std::fs::read_to_string(repo.join("f.txt")).expect("read"),
        "one\n"
    );
}

#[tokio::test]
async fn checkout_detached_moves_head_without_a_branch() {
    let workspace = new_repository().await;
    let repo = workspace.path.as_path();
    let first = commit_file(repo, "f.txt", "one\n", "one").await;
    commit_file(repo, "f.txt", "two\n", "two").await;

    commit_ops::checkout_detached(repo, &first)
        .await
        .expect("checkout");
    let snapshot = status::get_status(repo).await.expect("status");
    assert!(snapshot.branch.detached);
    assert_eq!(git_output(repo, &["rev-parse", "HEAD"]).trim(), first);
}

#[tokio::test]
async fn force_with_lease_replaces_rewritten_history_on_the_remote() {
    let workspace = new_repository().await;
    let repo = workspace.path.as_path();
    commit_file(repo, "f.txt", "one\n", "one").await;
    let remote_dir = tempfile::TempDir::new().expect("remote dir");
    git_output(remote_dir.path(), &["init", "--bare", "-b", "main"]);
    let remote_url = remote_dir.path().to_string_lossy().into_owned();
    git_output(repo, &["remote", "add", "origin", &remote_url]);
    git_output(repo, &["push", "-u", "origin", "main"]);

    git_output(repo, &["commit", "--amend", "-m", "one rewritten"]);
    let rejected = remote::push_current(repo, CancelToken::never(), &|_| {})
        .await
        .expect_err("rejected");
    assert_eq!(rejected.kind, ErrorKind::RemoteAhead);

    remote::push_with_options(repo, true, CancelToken::never(), &|_| {})
        .await
        .expect("force with lease");
    let remote_subject = git_output(remote_dir.path(), &["log", "-1", "--format=%s", "main"]);
    assert_eq!(remote_subject.trim(), "one rewritten");
}
