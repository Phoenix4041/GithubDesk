mod common;

use common::{commit_file, git_output, new_repository, write_file};
use githubdesk_lib::commands::branch::delete_branch;
use githubdesk_lib::commands::commit_ops::{reset_to, ResetMode};
use githubdesk_lib::commands::rescue::{
    branch_from, delete_entry, guard_branch, guard_stash, guard_worktree, list_entries, preview,
    prune, restore, snapshot_worktree, RescueKind, MAX_SNAPSHOTS, RESCUE_NAMESPACE,
};
use githubdesk_lib::commands::stash::{drop_stash, list_stashes, save_stash};
use githubdesk_lib::commands::status::discard_changes;
use githubdesk_lib::error::ErrorKind;

fn read(repo: &std::path::Path, relative: &str) -> String {
    std::fs::read_to_string(repo.join(relative)).expect("file")
}

#[tokio::test]
async fn discarded_tracked_and_untracked_changes_come_back() {
    let workspace = new_repository().await;
    let repo = &workspace.path;
    commit_file(repo, "a.txt", "one\n", "base").await;
    write_file(repo, "a.txt", "one\nedited\n");
    write_file(repo, "new.txt", "fresh\n");

    guard_worktree(repo, "discard").await;
    discard_changes(repo, &["a.txt".to_string()], &["new.txt".to_string()])
        .await
        .expect("discard");
    assert_eq!(read(repo, "a.txt"), "one\n");
    assert!(!repo.join("new.txt").exists());

    let entries = list_entries(repo).await.expect("list");
    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0].reason, "discard");
    assert_eq!(entries[0].kind, RescueKind::Snapshot);
    assert_eq!(entries[0].files, 2);

    let detail = preview(repo, &entries[0].id).await.expect("preview");
    assert!(detail.patch.contains("+edited"));
    assert!(detail.patch.contains("+fresh"));

    restore(repo, &entries[0].id).await.expect("restore");
    assert_eq!(read(repo, "a.txt"), "one\nedited\n");
    assert_eq!(read(repo, "new.txt"), "fresh\n");
}

#[tokio::test]
async fn a_hard_reset_keeps_the_lost_commit_and_the_edits() {
    let workspace = new_repository().await;
    let repo = &workspace.path;
    let first = commit_file(repo, "a.txt", "one\n", "first").await;
    let second = commit_file(repo, "a.txt", "one\ntwo\n", "second").await;
    write_file(repo, "a.txt", "one\ntwo\nthree\n");

    guard_worktree(repo, "reset").await;
    reset_to(repo, &first, ResetMode::Hard)
        .await
        .expect("reset");
    assert_eq!(read(repo, "a.txt"), "one\n");

    let entries = list_entries(repo).await.expect("list");
    assert_eq!(entries.len(), 1);
    git_output(
        repo,
        &["merge-base", "--is-ancestor", &second, &entries[0].hash],
    );
    branch_from(repo, &entries[0].id, "recovered")
        .await
        .expect("branch");
    let content = git_output(repo, &["show", "recovered:a.txt"]);
    assert_eq!(content, "one\ntwo\nthree\n");
}

#[tokio::test]
async fn nothing_is_saved_when_the_tree_is_clean() {
    let workspace = new_repository().await;
    let repo = &workspace.path;
    commit_file(repo, "a.txt", "one\n", "base").await;
    assert_eq!(
        snapshot_worktree(repo, "discard").await.expect("snapshot"),
        None
    );
    assert!(list_entries(repo).await.expect("list").is_empty());
}

#[tokio::test]
async fn a_repository_without_commits_is_skipped_quietly() {
    let workspace = new_repository().await;
    write_file(&workspace.path, "a.txt", "x");
    assert_eq!(
        snapshot_worktree(&workspace.path, "discard")
            .await
            .expect("snapshot"),
        None
    );
}

#[tokio::test]
async fn snapshots_leave_the_working_tree_the_index_and_the_stash_alone() {
    let workspace = new_repository().await;
    let repo = &workspace.path;
    commit_file(repo, "a.txt", "one\n", "base").await;
    write_file(repo, "a.txt", "one\nstaged\n");
    git_output(repo, &["add", "a.txt"]);
    write_file(repo, "a.txt", "one\nstaged\nunstaged\n");
    write_file(repo, "loose.txt", "loose\n");
    let before_status = git_output(repo, &["status", "--porcelain"]);

    snapshot_worktree(repo, "discard").await.expect("snapshot");

    assert_eq!(git_output(repo, &["status", "--porcelain"]), before_status);
    assert_eq!(git_output(repo, &["stash", "list"]), "");
    assert_eq!(read(repo, "a.txt"), "one\nstaged\nunstaged\n");
    let leftovers: Vec<_> = std::fs::read_dir(repo.join(".git"))
        .expect("git dir")
        .filter_map(Result::ok)
        .filter(|entry| {
            entry
                .file_name()
                .to_string_lossy()
                .contains("githubdesk-rescue")
        })
        .collect();
    assert!(leftovers.is_empty());
}

#[tokio::test]
async fn a_force_deleted_branch_can_be_brought_back() {
    let workspace = new_repository().await;
    let repo = &workspace.path;
    commit_file(repo, "a.txt", "one\n", "base").await;
    git_output(repo, &["switch", "-q", "-c", "feature/idea"]);
    let tip = commit_file(repo, "idea.txt", "idea\n", "idea").await;
    git_output(repo, &["switch", "-q", "main"]);

    guard_branch(repo, "feature/idea").await;
    delete_branch(repo, "feature/idea", true)
        .await
        .expect("delete");

    let entries = list_entries(repo).await.expect("list");
    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0].kind, RescueKind::Commit);
    assert_eq!(entries[0].label.as_deref(), Some("feature/idea"));
    assert_eq!(entries[0].hash, tip);

    let error = restore(repo, &entries[0].id)
        .await
        .expect_err("not applicable");
    assert_eq!(error.kind, ErrorKind::InvalidInput);
    branch_from(repo, &entries[0].id, "feature/idea")
        .await
        .expect("branch");
    assert_eq!(git_output(repo, &["rev-parse", "feature/idea"]).trim(), tip);
}

#[tokio::test]
async fn a_dropped_stash_is_kept() {
    let workspace = new_repository().await;
    let repo = &workspace.path;
    commit_file(repo, "a.txt", "one\n", "base").await;
    write_file(repo, "a.txt", "one\nwip\n");
    save_stash(repo, Some("wip"), true).await.expect("stash");
    let stash = list_stashes(repo).await.expect("stashes").remove(0);

    guard_stash(repo, &stash.hash).await;
    drop_stash(repo, &stash.hash).await.expect("drop");

    let entries = list_entries(repo).await.expect("list");
    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0].reason, "stash-drop");
    assert_eq!(entries[0].hash, stash.hash);
}

#[tokio::test]
async fn restoring_over_conflicting_edits_is_reported_and_leaves_a_safety_copy() {
    let workspace = new_repository().await;
    let repo = &workspace.path;
    commit_file(repo, "a.txt", "one\n", "base").await;
    write_file(repo, "a.txt", "one\nmine\n");
    let id = snapshot_worktree(repo, "discard")
        .await
        .expect("snapshot")
        .expect("saved");
    git_output(repo, &["checkout", "--", "a.txt"]);
    write_file(repo, "a.txt", "completely different\n");

    let error = restore(repo, &id).await.expect_err("conflict");
    assert_eq!(error.kind, ErrorKind::PatchNotApplicable);
    let reasons: Vec<String> = list_entries(repo)
        .await
        .expect("list")
        .into_iter()
        .map(|entry| entry.reason)
        .collect();
    assert!(reasons.contains(&"before-restore".to_string()));
}

#[tokio::test]
async fn old_entries_are_pruned_and_entries_can_be_deleted() {
    let workspace = new_repository().await;
    let repo = &workspace.path;
    let base = commit_file(repo, "a.txt", "one\n", "base").await;

    for number in 0..(MAX_SNAPSHOTS + 3) {
        let reference = format!(
            "{RESCUE_NAMESPACE}{}-discard",
            1_700_000_000_000_i64 + number as i64
        );
        git_output(repo, &["update-ref", &reference, &base]);
    }
    let removed = prune(repo).await.expect("prune");
    assert_eq!(removed as usize, MAX_SNAPSHOTS + 3);
    assert!(list_entries(repo).await.expect("list").is_empty());

    write_file(repo, "a.txt", "one\nx\n");
    let id = snapshot_worktree(repo, "discard")
        .await
        .expect("snapshot")
        .expect("saved");
    delete_entry(repo, &id).await.expect("delete");
    assert!(list_entries(repo).await.expect("list").is_empty());
}

#[tokio::test]
async fn invalid_ids_never_reach_git() {
    let workspace = new_repository().await;
    let repo = &workspace.path;
    commit_file(repo, "a.txt", "one\n", "base").await;
    assert_eq!(
        preview(repo, "../../heads/main")
            .await
            .expect_err("bad")
            .kind,
        ErrorKind::InvalidInput
    );
    assert_eq!(
        delete_entry(repo, "").await.expect_err("bad").kind,
        ErrorKind::InvalidInput
    );
    assert_eq!(
        preview(repo, "1700000000000-nothing")
            .await
            .expect_err("missing")
            .kind,
        ErrorKind::InvalidInput
    );
}
