mod common;

use common::{commit_file, git_output, new_repository, write_file};
use githubdesk_lib::commands::merge::{merge_into_current, preview_merge, MergeMode, MergeOutcome};
use githubdesk_lib::commands::operation::{
    current_operation, run_operation_action, OperationAction,
};
use githubdesk_lib::commands::status::stage_paths;
use githubdesk_lib::error::ErrorKind;
use githubdesk_lib::git::repo_state::OperationKind;

fn parent_count(repo: &std::path::Path) -> usize {
    git_output(repo, &["rev-list", "--parents", "-n", "1", "HEAD"])
        .split_whitespace()
        .count()
        - 1
}

#[tokio::test]
async fn a_branch_ahead_of_head_fast_forwards() {
    let workspace = new_repository().await;
    let repo = &workspace.path;
    commit_file(repo, "a.txt", "one", "first").await;
    git_output(repo, &["checkout", "-q", "-b", "feature"]);
    let tip = commit_file(repo, "b.txt", "two", "second").await;
    git_output(repo, &["checkout", "-q", "main"]);

    let preview = preview_merge(repo, "feature").await.expect("preview");
    assert_eq!(preview.commits, 1);
    assert_eq!(preview.files_changed, 1);
    assert!(preview.can_fast_forward);
    assert!(!preview.up_to_date);
    assert!(preview.conflicts.is_empty());

    let outcome = merge_into_current(repo, "feature", MergeMode::Merge, None)
        .await
        .expect("merge");
    assert_eq!(outcome, MergeOutcome::FastForward);
    assert_eq!(git_output(repo, &["rev-parse", "HEAD"]).trim(), tip);
    assert_eq!(parent_count(repo), 1);
}

#[tokio::test]
async fn no_fast_forward_always_creates_a_merge_commit_with_the_given_message() {
    let workspace = new_repository().await;
    let repo = &workspace.path;
    commit_file(repo, "a.txt", "one", "first").await;
    git_output(repo, &["checkout", "-q", "-b", "feature"]);
    commit_file(repo, "b.txt", "two", "second").await;
    git_output(repo, &["checkout", "-q", "main"]);

    let outcome = merge_into_current(
        repo,
        "feature",
        MergeMode::NoFastForward,
        Some("Join feature"),
    )
    .await
    .expect("merge");
    assert_eq!(outcome, MergeOutcome::Merged);
    assert_eq!(parent_count(repo), 2);
    assert_eq!(
        git_output(repo, &["log", "-1", "--format=%s"]).trim(),
        "Join feature"
    );
}

#[tokio::test]
async fn diverged_branches_without_overlap_merge_cleanly() {
    let workspace = new_repository().await;
    let repo = &workspace.path;
    commit_file(repo, "a.txt", "one", "first").await;
    git_output(repo, &["checkout", "-q", "-b", "feature"]);
    commit_file(repo, "feature.txt", "from feature", "feature work").await;
    git_output(repo, &["checkout", "-q", "main"]);
    commit_file(repo, "main.txt", "from main", "main work").await;

    let preview = preview_merge(repo, "feature").await.expect("preview");
    assert!(!preview.can_fast_forward);
    assert!(preview.conflicts.is_empty());
    assert_eq!(preview.commits, 1);

    let outcome = merge_into_current(repo, "feature", MergeMode::Merge, None)
        .await
        .expect("merge");
    assert_eq!(outcome, MergeOutcome::Merged);
    assert_eq!(parent_count(repo), 2);
    assert!(repo.join("feature.txt").is_file());
    assert!(repo.join("main.txt").is_file());
}

#[tokio::test]
async fn squash_stages_the_changes_without_committing() {
    let workspace = new_repository().await;
    let repo = &workspace.path;
    let first = commit_file(repo, "a.txt", "one", "first").await;
    git_output(repo, &["checkout", "-q", "-b", "feature"]);
    commit_file(repo, "b.txt", "two", "second").await;
    commit_file(repo, "c.txt", "three", "third").await;
    git_output(repo, &["checkout", "-q", "main"]);

    let outcome = merge_into_current(repo, "feature", MergeMode::Squash, None)
        .await
        .expect("squash");
    assert_eq!(outcome, MergeOutcome::Squashed);
    assert_eq!(git_output(repo, &["rev-parse", "HEAD"]).trim(), first);
    let staged = git_output(repo, &["diff", "--cached", "--name-only"]);
    assert!(staged.contains("b.txt") && staged.contains("c.txt"));
    assert!(current_operation(repo).await.expect("state").is_none());
}

#[tokio::test]
async fn conflicts_are_predicted_and_can_be_resolved_then_continued() {
    let workspace = new_repository().await;
    let repo = &workspace.path;
    commit_file(repo, "doc.txt", "base", "first").await;
    git_output(repo, &["checkout", "-q", "-b", "feature"]);
    commit_file(repo, "doc.txt", "from feature", "feature edit").await;
    git_output(repo, &["checkout", "-q", "main"]);
    commit_file(repo, "doc.txt", "from main", "main edit").await;

    let preview = preview_merge(repo, "feature").await.expect("preview");
    assert_eq!(preview.conflicts, vec!["doc.txt".to_string()]);

    let error = merge_into_current(repo, "feature", MergeMode::Merge, None)
        .await
        .expect_err("conflict");
    assert_eq!(error.kind, ErrorKind::MergeConflict);
    let operation = current_operation(repo)
        .await
        .expect("state")
        .expect("merging");
    assert_eq!(operation.kind, OperationKind::Merge);

    write_file(repo, "doc.txt", "resolved by hand");
    stage_paths(repo, &["doc.txt".to_string()])
        .await
        .expect("stage");
    run_operation_action(repo, OperationAction::Continue)
        .await
        .expect("continue");
    assert_eq!(parent_count(repo), 2);
    assert!(current_operation(repo).await.expect("state").is_none());
}

#[tokio::test]
async fn a_conflicting_merge_can_be_aborted() {
    let workspace = new_repository().await;
    let repo = &workspace.path;
    commit_file(repo, "doc.txt", "base", "first").await;
    git_output(repo, &["checkout", "-q", "-b", "feature"]);
    commit_file(repo, "doc.txt", "from feature", "feature edit").await;
    git_output(repo, &["checkout", "-q", "main"]);
    let before = commit_file(repo, "doc.txt", "from main", "main edit").await;

    merge_into_current(repo, "feature", MergeMode::Merge, None)
        .await
        .expect_err("conflict");
    run_operation_action(repo, OperationAction::Abort)
        .await
        .expect("abort");
    assert_eq!(git_output(repo, &["rev-parse", "HEAD"]).trim(), before);
    assert!(current_operation(repo).await.expect("state").is_none());
}

#[tokio::test]
async fn merging_a_branch_that_is_already_included_is_reported() {
    let workspace = new_repository().await;
    let repo = &workspace.path;
    commit_file(repo, "a.txt", "one", "first").await;
    git_output(repo, &["branch", "same"]);
    commit_file(repo, "b.txt", "two", "second").await;

    let preview = preview_merge(repo, "same").await.expect("preview");
    assert!(preview.up_to_date);
    let error = merge_into_current(repo, "same", MergeMode::Merge, None)
        .await
        .expect_err("nothing to merge");
    assert_eq!(error.kind, ErrorKind::NothingToMerge);
}

#[tokio::test]
async fn unrelated_histories_are_detected_and_refused() {
    let workspace = new_repository().await;
    let repo = &workspace.path;
    commit_file(repo, "a.txt", "one", "first").await;
    git_output(repo, &["checkout", "-q", "--orphan", "other"]);
    git_output(repo, &["rm", "-rfq", "."]);
    commit_file(repo, "z.txt", "unrelated", "other root").await;
    git_output(repo, &["checkout", "-q", "main"]);

    let preview = preview_merge(repo, "other").await.expect("preview");
    assert!(preview.unrelated);
    let error = merge_into_current(repo, "other", MergeMode::Merge, None)
        .await
        .expect_err("unrelated");
    assert_eq!(error.kind, ErrorKind::UnrelatedHistories);
}

#[tokio::test]
async fn invalid_and_unknown_sources_are_rejected() {
    let workspace = new_repository().await;
    let repo = &workspace.path;
    commit_file(repo, "a.txt", "one", "first").await;

    let flag = preview_merge(repo, "--oops").await.expect_err("flag");
    assert_eq!(flag.kind, ErrorKind::InvalidInput);
    assert!(preview_merge(repo, "no-such-branch").await.is_err());
}
