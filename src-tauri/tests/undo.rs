mod common;

use common::{commit_file, git_output, new_repository, write_file};
use githubdesk_lib::commands::merge::{merge_into_current, MergeMode};
use githubdesk_lib::commands::reflog::{undo_last_operation, undo_plan, undo_preview};
use githubdesk_lib::git::parse::reflog::UndoStrategy;

fn head(repo: &std::path::Path) -> String {
    git_output(repo, &["rev-parse", "HEAD"]).trim().to_string()
}

#[tokio::test]
async fn a_merge_is_undone_and_previewed() {
    let workspace = new_repository().await;
    let repo = &workspace.path;
    commit_file(repo, "a.txt", "one", "first").await;
    git_output(repo, &["checkout", "-q", "-b", "feature"]);
    commit_file(repo, "b.txt", "two", "feature work").await;
    git_output(repo, &["checkout", "-q", "main"]);
    let before = commit_file(repo, "c.txt", "three", "main work").await;
    merge_into_current(repo, "feature", MergeMode::Merge, None)
        .await
        .expect("merge");
    assert_ne!(head(repo), before);

    let preview = undo_preview(repo).await.expect("preview").expect("some");
    assert_eq!(preview.plan.target_hash, before);
    assert!(!preview.removed_commits.is_empty());
    assert!(preview.files.iter().any(|file| file.path == "b.txt"));
    assert!(!preview.has_uncommitted_changes);

    let plan = undo_plan(repo).await.expect("plan").expect("some");
    undo_last_operation(repo, &plan.current_hash, false)
        .await
        .expect("undo");
    assert_eq!(head(repo), before);
}

#[tokio::test]
async fn a_reset_is_undone() {
    let workspace = new_repository().await;
    let repo = &workspace.path;
    commit_file(repo, "a.txt", "one", "first").await;
    let second = commit_file(repo, "b.txt", "two", "second").await;
    git_output(repo, &["reset", "-q", "--hard", "HEAD~1"]);

    let plan = undo_plan(repo).await.expect("plan").expect("some");
    assert_eq!(plan.strategy, UndoStrategy::RestoreAll);
    let preview = undo_preview(repo).await.expect("preview").expect("some");
    assert_eq!(preview.restored_commits.len(), 1);

    undo_last_operation(repo, &plan.current_hash, false)
        .await
        .expect("undo");
    assert_eq!(head(repo), second);
}

#[tokio::test]
async fn a_branch_switch_is_undone() {
    let workspace = new_repository().await;
    let repo = &workspace.path;
    commit_file(repo, "a.txt", "one", "first").await;
    git_output(repo, &["checkout", "-q", "-b", "feature"]);
    commit_file(repo, "b.txt", "two", "second").await;
    git_output(repo, &["checkout", "-q", "main"]);

    let plan = undo_plan(repo).await.expect("plan").expect("some");
    assert_eq!(plan.strategy, UndoStrategy::SwitchBack);
    assert_eq!(plan.switch_to.as_deref(), Some("feature"));
    undo_last_operation(repo, &plan.current_hash, false)
        .await
        .expect("undo");
    assert_eq!(
        git_output(repo, &["branch", "--show-current"]).trim(),
        "feature"
    );
}

#[tokio::test]
async fn unsaved_changes_block_the_undo_unless_they_are_stashed() {
    let workspace = new_repository().await;
    let repo = &workspace.path;
    commit_file(repo, "a.txt", "one", "first").await;
    let second = commit_file(repo, "b.txt", "two", "second").await;
    git_output(repo, &["reset", "-q", "--hard", "HEAD~1"]);
    let after_reset = head(repo);
    write_file(repo, "a.txt", "edited");

    let plan = undo_plan(repo).await.expect("plan").expect("some");
    let preview = undo_preview(repo).await.expect("preview").expect("some");
    assert!(preview.has_uncommitted_changes);

    let refused = undo_last_operation(repo, &plan.current_hash, false).await;
    assert!(refused.is_err());
    assert_eq!(head(repo), after_reset);
    assert_eq!(
        std::fs::read_to_string(repo.join("a.txt")).expect("read"),
        "edited"
    );

    undo_last_operation(repo, &plan.current_hash, true)
        .await
        .expect("undo with stash");
    assert_eq!(head(repo), second);
    assert!(git_output(repo, &["stash", "list"]).contains("githubdesk"));
    assert_eq!(
        std::fs::read_to_string(repo.join("a.txt")).expect("read"),
        "one"
    );
}

#[tokio::test]
async fn the_undo_is_refused_when_history_moved() {
    let workspace = new_repository().await;
    let repo = &workspace.path;
    commit_file(repo, "a.txt", "one", "first").await;
    commit_file(repo, "b.txt", "two", "second").await;
    assert!(undo_last_operation(repo, "deadbeef", false).await.is_err());
}
