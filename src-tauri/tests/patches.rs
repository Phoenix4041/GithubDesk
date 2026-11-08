mod common;

use std::path::{Path, PathBuf};

use common::{commit_file, git_as, git_output, new_repository, write_file};
use githubdesk_lib::commands::operation::{
    current_operation, run_operation_action, OperationAction,
};
use githubdesk_lib::commands::patches::{
    apply_patches, export_patches, preview_patches, PatchApplyMode,
};
use githubdesk_lib::error::ErrorKind;
use githubdesk_lib::git::repo_state::OperationKind;
use tempfile::TempDir;

const AUTHOR: &str = "Patch Author";
const AUTHOR_EMAIL: &str = "patch@example.com";

fn clone_of(source: &Path) -> (TempDir, PathBuf) {
    let root = TempDir::new().expect("temp dir");
    git_output(
        root.path(),
        &["clone", "-q", source.to_str().expect("path"), "copy"],
    );
    let path = root.path().join("copy");
    (root, path)
}

fn commit_as_author(repo: &Path, relative: &str, content: &str, title: &str) -> String {
    write_file(repo, relative, content);
    git_as(repo, AUTHOR, AUTHOR_EMAIL, &["add", relative]);
    git_as(repo, AUTHOR, AUTHOR_EMAIL, &["commit", "-q", "-m", title]);
    git_output(repo, &["rev-parse", "HEAD"]).trim().to_string()
}

fn directory_text(directory: &TempDir) -> String {
    directory.path().to_str().expect("path").to_string()
}

#[tokio::test]
async fn exporting_numbers_the_files_in_the_order_given() {
    let workspace = new_repository().await;
    let repo = &workspace.path;
    commit_file(repo, "a.txt", "one", "base").await;
    let first = commit_file(repo, "b.txt", "two", "Add b").await;
    let second = commit_file(repo, "c.txt", "three", "Add c").await;
    let output = TempDir::new().expect("temp dir");

    let files = export_patches(repo, &[first, second], &directory_text(&output))
        .await
        .expect("export");

    assert_eq!(files.len(), 2);
    assert!(files[0].contains("0001-Add-b"), "{files:?}");
    assert!(files[1].contains("0002-Add-c"), "{files:?}");
    let text = std::fs::read_to_string(&files[0]).expect("patch");
    assert!(text.contains("Subject: [PATCH] Add b"));
}

#[tokio::test]
async fn exporting_rejects_merge_commits_empty_selections_and_relative_folders() {
    let workspace = new_repository().await;
    let repo = &workspace.path;
    commit_file(repo, "a.txt", "one", "base").await;
    git_output(repo, &["checkout", "-q", "-b", "feature"]);
    commit_file(repo, "b.txt", "two", "feature work").await;
    git_output(repo, &["checkout", "-q", "main"]);
    commit_file(repo, "c.txt", "three", "main work").await;
    git_output(repo, &["merge", "-q", "--no-ff", "-m", "join", "feature"]);
    let merge = git_output(repo, &["rev-parse", "HEAD"]).trim().to_string();
    let output = TempDir::new().expect("temp dir");

    let merged = export_patches(repo, std::slice::from_ref(&merge), &directory_text(&output))
        .await
        .expect_err("merge");
    assert_eq!(merged.kind, ErrorKind::InvalidInput);

    let empty = export_patches(repo, &[], &directory_text(&output))
        .await
        .expect_err("empty");
    assert_eq!(empty.kind, ErrorKind::InvalidInput);

    let relative = export_patches(repo, &[merge], "patches")
        .await
        .expect_err("relative");
    assert_eq!(relative.kind, ErrorKind::InvalidInput);
}

#[tokio::test]
async fn preview_reads_the_commit_data_and_checks_the_patch() {
    let source = new_repository().await;
    commit_file(&source.path, "a.txt", "one", "base").await;
    let (_keep, target) = clone_of(&source.path);
    let tip = commit_as_author(&source.path, "b.txt", "two\n", "Add b");
    let output = TempDir::new().expect("temp dir");
    let files = export_patches(&source.path, &[tip], &directory_text(&output))
        .await
        .expect("export");

    let previews = preview_patches(&target, &files).await.expect("preview");

    assert_eq!(previews.len(), 1);
    let preview = &previews[0];
    assert!(preview.mailbox);
    assert_eq!(preview.subject.as_deref(), Some("Add b"));
    assert_eq!(
        preview.author.as_deref(),
        Some("Patch Author <patch@example.com>")
    );
    assert_eq!(preview.changes.len(), 1);
    assert_eq!(preview.changes[0].path, "b.txt");
    assert_eq!(preview.changes[0].insertions, Some(1));
    assert!(preview.applies_cleanly);
    assert_eq!(preview.problem, None);
}

#[tokio::test]
async fn preview_flags_a_patch_that_does_not_fit_and_rejects_non_patches() {
    let source = new_repository().await;
    commit_file(&source.path, "a.txt", "one\n", "base").await;
    let (_keep, target) = clone_of(&source.path);
    let tip = commit_as_author(&source.path, "a.txt", "from patch\n", "Change a");
    commit_file(&target, "a.txt", "local change\n", "Local change").await;
    let output = TempDir::new().expect("temp dir");
    let files = export_patches(&source.path, &[tip], &directory_text(&output))
        .await
        .expect("export");

    let previews = preview_patches(&target, &files).await.expect("preview");
    assert!(!previews[0].applies_cleanly);
    assert!(previews[0].problem.is_some());

    let junk = output.path().join("notes.txt");
    std::fs::write(&junk, "just some words\n").expect("junk");
    let error = preview_patches(&target, &[junk.to_string_lossy().into_owned()])
        .await
        .expect_err("not a patch");
    assert_eq!(error.kind, ErrorKind::PatchNotApplicable);
}

#[tokio::test]
async fn applying_as_commits_keeps_author_and_message() {
    let source = new_repository().await;
    commit_file(&source.path, "a.txt", "one", "base").await;
    let (_keep, target) = clone_of(&source.path);
    let tip = commit_as_author(&source.path, "b.txt", "two\n", "Add b");
    let output = TempDir::new().expect("temp dir");
    let files = export_patches(&source.path, &[tip], &directory_text(&output))
        .await
        .expect("export");

    apply_patches(&target, &files, PatchApplyMode::Commit)
        .await
        .expect("apply");

    let log = git_output(&target, &["log", "-1", "--format=%an|%ae|%s"]);
    assert_eq!(log.trim(), "Patch Author|patch@example.com|Add b");
    assert_eq!(
        std::fs::read_to_string(target.join("b.txt")).expect("file"),
        "two\n"
    );
    assert!(current_operation(&target).await.expect("state").is_none());
}

#[tokio::test]
async fn applying_to_the_working_tree_stages_the_changes_without_a_commit() {
    let source = new_repository().await;
    commit_file(&source.path, "a.txt", "one\n", "base").await;
    let (_keep, target) = clone_of(&source.path);
    commit_file(&source.path, "a.txt", "two\n", "Change a").await;
    let diff = git_output(&source.path, &["diff", "HEAD~1", "HEAD"]);
    let output = TempDir::new().expect("temp dir");
    let patch = output.path().join("change.diff");
    std::fs::write(&patch, diff).expect("diff");
    let head_before = git_output(&target, &["rev-parse", "HEAD"]);

    apply_patches(
        &target,
        &[patch.to_string_lossy().into_owned()],
        PatchApplyMode::WorkingTree,
    )
    .await
    .expect("apply");

    assert_eq!(git_output(&target, &["rev-parse", "HEAD"]), head_before);
    assert_eq!(
        std::fs::read_to_string(target.join("a.txt")).expect("file"),
        "two\n"
    );
    assert!(git_output(&target, &["status", "--porcelain"]).starts_with("M  a.txt"));
}

#[tokio::test]
async fn creating_commits_needs_a_mailbox_patch() {
    let source = new_repository().await;
    commit_file(&source.path, "a.txt", "one\n", "base").await;
    let (_keep, target) = clone_of(&source.path);
    commit_file(&source.path, "a.txt", "two\n", "Change a").await;
    let diff = git_output(&source.path, &["diff", "HEAD~1", "HEAD"]);
    let output = TempDir::new().expect("temp dir");
    let patch = output.path().join("change.diff");
    std::fs::write(&patch, diff).expect("diff");

    let error = apply_patches(
        &target,
        &[patch.to_string_lossy().into_owned()],
        PatchApplyMode::Commit,
    )
    .await
    .expect_err("plain diff");

    assert_eq!(error.kind, ErrorKind::InvalidInput);
}

#[tokio::test]
async fn a_conflicting_patch_leaves_an_operation_that_can_be_aborted() {
    let source = new_repository().await;
    commit_file(&source.path, "a.txt", "one\n", "base").await;
    let (_keep, target) = clone_of(&source.path);
    let tip = commit_as_author(&source.path, "a.txt", "from patch\n", "Change a");
    commit_file(&target, "a.txt", "local change\n", "Local change").await;
    let head_before = git_output(&target, &["rev-parse", "HEAD"]);
    let output = TempDir::new().expect("temp dir");
    let files = export_patches(&source.path, &[tip], &directory_text(&output))
        .await
        .expect("export");

    let error = apply_patches(&target, &files, PatchApplyMode::Commit)
        .await
        .expect_err("conflict");
    assert_eq!(error.kind, ErrorKind::MergeConflict);

    let operation = current_operation(&target)
        .await
        .expect("state")
        .expect("operation");
    assert_eq!(operation.kind, OperationKind::Am);
    assert_eq!(operation.step, Some(1));
    assert_eq!(operation.total, Some(1));

    run_operation_action(&target, OperationAction::Abort)
        .await
        .expect("abort");
    assert!(current_operation(&target).await.expect("state").is_none());
    assert_eq!(git_output(&target, &["rev-parse", "HEAD"]), head_before);
    assert_eq!(
        std::fs::read_to_string(target.join("a.txt")).expect("file"),
        "local change\n"
    );
}

#[tokio::test]
async fn a_resolved_conflict_continues_with_the_original_author() {
    let source = new_repository().await;
    commit_file(&source.path, "a.txt", "one\n", "base").await;
    let (_keep, target) = clone_of(&source.path);
    let tip = commit_as_author(&source.path, "a.txt", "from patch\n", "Change a");
    commit_file(&target, "a.txt", "local change\n", "Local change").await;
    let output = TempDir::new().expect("temp dir");
    let files = export_patches(&source.path, &[tip], &directory_text(&output))
        .await
        .expect("export");
    apply_patches(&target, &files, PatchApplyMode::Commit)
        .await
        .expect_err("conflict");

    write_file(&target, "a.txt", "resolved\n");
    git_output(&target, &["add", "a.txt"]);
    run_operation_action(&target, OperationAction::Continue)
        .await
        .expect("continue");

    assert!(current_operation(&target).await.expect("state").is_none());
    let log = git_output(&target, &["log", "-1", "--format=%an|%s"]);
    assert_eq!(log.trim(), "Patch Author|Change a");
    assert_eq!(
        std::fs::read_to_string(target.join("a.txt")).expect("file"),
        "resolved\n"
    );
}

#[tokio::test]
async fn skipping_the_conflicting_patch_ends_the_operation_without_a_commit() {
    let source = new_repository().await;
    commit_file(&source.path, "a.txt", "one\n", "base").await;
    let (_keep, target) = clone_of(&source.path);
    let tip = commit_as_author(&source.path, "a.txt", "from patch\n", "Change a");
    commit_file(&target, "a.txt", "local change\n", "Local change").await;
    let head_before = git_output(&target, &["rev-parse", "HEAD"]);
    let output = TempDir::new().expect("temp dir");
    let files = export_patches(&source.path, &[tip], &directory_text(&output))
        .await
        .expect("export");
    apply_patches(&target, &files, PatchApplyMode::Commit)
        .await
        .expect_err("conflict");

    run_operation_action(&target, OperationAction::Skip)
        .await
        .expect("skip");

    assert!(current_operation(&target).await.expect("state").is_none());
    assert_eq!(git_output(&target, &["rev-parse", "HEAD"]), head_before);
}

#[tokio::test]
async fn staged_changes_block_applying_commits_and_relative_paths_are_rejected() {
    let source = new_repository().await;
    commit_file(&source.path, "a.txt", "one\n", "base").await;
    let (_keep, target) = clone_of(&source.path);
    let tip = commit_as_author(&source.path, "b.txt", "two\n", "Add b");
    let output = TempDir::new().expect("temp dir");
    let files = export_patches(&source.path, &[tip], &directory_text(&output))
        .await
        .expect("export");
    write_file(&target, "a.txt", "dirty\n");
    git_output(&target, &["add", "a.txt"]);

    let blocked = apply_patches(&target, &files, PatchApplyMode::Commit)
        .await
        .expect_err("dirty index");
    assert_eq!(blocked.kind, ErrorKind::LocalChangesWouldBeOverwritten);

    let relative = apply_patches(
        &target,
        &["change.patch".to_string()],
        PatchApplyMode::WorkingTree,
    )
    .await
    .expect_err("relative");
    assert_eq!(relative.kind, ErrorKind::InvalidInput);
}
