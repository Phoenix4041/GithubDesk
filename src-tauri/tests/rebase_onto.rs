mod common;

use common::{commit_file, git_output, new_repository, write_file};
use githubdesk_lib::commands::operation::{
    current_operation, run_operation_action, OperationAction,
};
use githubdesk_lib::commands::rebase_onto::{preview_rebase_onto, rebase_onto_branch};
use githubdesk_lib::commands::status::stage_paths;
use githubdesk_lib::error::ErrorKind;
use githubdesk_lib::git::repo_state::OperationKind;

fn merge_commits_since(repo: &std::path::Path, base: &str) -> usize {
    git_output(repo, &["rev-list", "--merges", &format!("{base}..HEAD")])
        .lines()
        .filter(|line| !line.is_empty())
        .count()
}

#[tokio::test]
async fn a_feature_branch_is_replayed_on_top_of_the_target() {
    let workspace = new_repository().await;
    let repo = &workspace.path;
    commit_file(repo, "base.txt", "base", "base").await;
    git_output(repo, &["checkout", "-q", "-b", "feature"]);
    let old_first = commit_file(repo, "one.txt", "one", "feature one").await;
    commit_file(repo, "two.txt", "two", "feature two").await;
    git_output(repo, &["checkout", "-q", "main"]);
    let main_tip = commit_file(repo, "main.txt", "main", "main work").await;
    git_output(repo, &["checkout", "-q", "feature"]);

    let preview = preview_rebase_onto(repo, "main").await.expect("preview");
    assert_eq!(preview.replay, 2);
    assert_eq!(preview.incoming, 1);
    assert!(!preview.has_merges);
    assert!(!preview.up_to_date);
    assert!(preview.conflicts.is_empty());

    rebase_onto_branch(repo, "main", false)
        .await
        .expect("rebase");

    let parent = git_output(repo, &["rev-parse", "HEAD~2"]);
    assert_eq!(parent.trim(), main_tip);
    assert_ne!(git_output(repo, &["rev-parse", "HEAD~1"]).trim(), old_first);
    assert!(repo.join("main.txt").is_file());
    assert!(repo.join("one.txt").is_file());
    assert!(repo.join("two.txt").is_file());
    assert!(current_operation(repo).await.expect("state").is_none());
}

#[tokio::test]
async fn conflicts_are_predicted_then_resolved_and_continued() {
    let workspace = new_repository().await;
    let repo = &workspace.path;
    commit_file(repo, "doc.txt", "base", "base").await;
    git_output(repo, &["checkout", "-q", "-b", "feature"]);
    commit_file(repo, "doc.txt", "feature version", "feature edit").await;
    git_output(repo, &["checkout", "-q", "main"]);
    commit_file(repo, "doc.txt", "main version", "main edit").await;
    git_output(repo, &["checkout", "-q", "feature"]);

    let preview = preview_rebase_onto(repo, "main").await.expect("preview");
    assert_eq!(preview.conflicts, vec!["doc.txt".to_string()]);

    let error = rebase_onto_branch(repo, "main", false)
        .await
        .expect_err("conflict");
    assert_eq!(error.kind, ErrorKind::MergeConflict);
    let operation = current_operation(repo)
        .await
        .expect("state")
        .expect("rebasing");
    assert_eq!(operation.kind, OperationKind::Rebase);

    write_file(repo, "doc.txt", "resolved");
    stage_paths(repo, &["doc.txt".to_string()])
        .await
        .expect("stage");
    run_operation_action(repo, OperationAction::Continue)
        .await
        .expect("continue");
    assert!(current_operation(repo).await.expect("state").is_none());
    assert_eq!(
        git_output(repo, &["show", "HEAD:doc.txt"]).trim(),
        "resolved"
    );
}

#[tokio::test]
async fn a_conflicting_rebase_can_be_aborted_and_restores_the_branch() {
    let workspace = new_repository().await;
    let repo = &workspace.path;
    commit_file(repo, "doc.txt", "base", "base").await;
    git_output(repo, &["checkout", "-q", "-b", "feature"]);
    let before = commit_file(repo, "doc.txt", "feature version", "feature edit").await;
    git_output(repo, &["checkout", "-q", "main"]);
    commit_file(repo, "doc.txt", "main version", "main edit").await;
    git_output(repo, &["checkout", "-q", "feature"]);

    rebase_onto_branch(repo, "main", false)
        .await
        .expect_err("conflict");
    run_operation_action(repo, OperationAction::Abort)
        .await
        .expect("abort");
    assert_eq!(git_output(repo, &["rev-parse", "HEAD"]).trim(), before);
}

#[tokio::test]
async fn merges_are_kept_only_when_asked() {
    let workspace = new_repository().await;
    let repo = &workspace.path;
    commit_file(repo, "base.txt", "base", "base").await;
    git_output(repo, &["checkout", "-q", "-b", "feature"]);
    commit_file(repo, "f1.txt", "f1", "feature one").await;
    git_output(repo, &["checkout", "-q", "-b", "side", "main"]);
    commit_file(repo, "side.txt", "side", "side work").await;
    git_output(repo, &["checkout", "-q", "feature"]);
    git_output(repo, &["merge", "-q", "--no-ff", "--no-edit", "side"]);
    git_output(repo, &["checkout", "-q", "main"]);
    commit_file(repo, "main.txt", "main", "main work").await;
    git_output(repo, &["checkout", "-q", "feature"]);

    let preview = preview_rebase_onto(repo, "main").await.expect("preview");
    assert!(preview.has_merges);

    git_output(repo, &["branch", "backup"]);
    rebase_onto_branch(repo, "main", true)
        .await
        .expect("rebase keeping merges");
    assert_eq!(merge_commits_since(repo, "main"), 1);

    git_output(repo, &["reset", "-q", "--hard", "backup"]);
    rebase_onto_branch(repo, "main", false)
        .await
        .expect("linear rebase");
    assert_eq!(merge_commits_since(repo, "main"), 0);
}

#[tokio::test]
async fn nothing_to_do_and_invalid_targets_are_reported() {
    let workspace = new_repository().await;
    let repo = &workspace.path;
    commit_file(repo, "base.txt", "base", "base").await;
    git_output(repo, &["checkout", "-q", "-b", "feature"]);
    commit_file(repo, "f.txt", "f", "feature work").await;

    let preview = preview_rebase_onto(repo, "main").await.expect("preview");
    assert!(preview.up_to_date);
    let error = rebase_onto_branch(repo, "main", false)
        .await
        .expect_err("already up to date");
    assert_eq!(error.kind, ErrorKind::NothingToRebase);

    assert_eq!(
        preview_rebase_onto(repo, "--oops")
            .await
            .expect_err("flag")
            .kind,
        ErrorKind::InvalidInput
    );
    assert!(preview_rebase_onto(repo, "no-such-branch").await.is_err());
}

#[tokio::test]
async fn uncommitted_changes_are_kept_across_the_rebase() {
    let workspace = new_repository().await;
    let repo = &workspace.path;
    commit_file(repo, "base.txt", "base", "base").await;
    commit_file(repo, "notes.txt", "notes", "notes").await;
    git_output(repo, &["checkout", "-q", "-b", "feature"]);
    commit_file(repo, "f.txt", "f", "feature work").await;
    git_output(repo, &["checkout", "-q", "main"]);
    commit_file(repo, "main.txt", "main", "main work").await;
    git_output(repo, &["checkout", "-q", "feature"]);
    write_file(repo, "notes.txt", "edited but not committed");

    rebase_onto_branch(repo, "main", false)
        .await
        .expect("rebase");
    let content = std::fs::read_to_string(repo.join("notes.txt")).expect("notes");
    assert_eq!(content, "edited but not committed");
}
