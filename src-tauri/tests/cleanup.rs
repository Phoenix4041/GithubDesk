mod common;

use std::path::{Path, PathBuf};

use common::{commit_file, git_output, new_repository, write_file};
use githubdesk_lib::commands::cleanup::{
    preview_cleanup, run_cleanup, stale_remote_branches, CleanupRequest,
};
use githubdesk_lib::error::ErrorKind;
use tempfile::TempDir;

fn names(files: &[githubdesk_lib::commands::cleanup::CleanupFile]) -> Vec<&str> {
    files.iter().map(|file| file.path.as_str()).collect()
}

fn branch_names(branches: &[githubdesk_lib::commands::cleanup::CleanupBranch]) -> Vec<&str> {
    branches.iter().map(|branch| branch.name.as_str()).collect()
}

fn bare_remote() -> (TempDir, PathBuf) {
    let root = TempDir::new().expect("temp dir");
    git_output(
        root.path(),
        &["init", "-q", "--bare", "-b", "main", "remote.git"],
    );
    let path = root.path().join("remote.git");
    (root, path)
}

fn connect(repo: &Path, remote: &Path) {
    git_output(
        repo,
        &["remote", "add", "origin", remote.to_str().expect("path")],
    );
}

async fn repository_with_files() -> common::Workspace {
    let workspace = new_repository().await;
    let repo = &workspace.path;
    commit_file(repo, ".gitignore", "*.log\nbuild/\n", "ignore").await;
    commit_file(repo, "a.txt", "one", "base").await;
    write_file(repo, "notes.txt", "x");
    write_file(repo, "scratch/deep.txt", "y");
    write_file(repo, "app.log", "l");
    write_file(repo, "build/out.bin", "o");
    workspace
}

#[tokio::test]
async fn the_preview_separates_untracked_from_ignored_files() {
    let workspace = repository_with_files().await;

    let preview = preview_cleanup(&workspace.path).await.expect("preview");

    assert_eq!(names(&preview.untracked), vec!["notes.txt", "scratch"]);
    assert!(!preview.untracked[0].directory);
    assert!(preview.untracked[1].directory);
    assert_eq!(names(&preview.ignored), vec!["app.log", "build"]);
    assert!(preview.merged_branches.is_empty());
    assert!(preview.gone_branches.is_empty());
}

#[tokio::test]
async fn only_the_selected_files_are_removed() {
    let workspace = repository_with_files().await;
    let repo = &workspace.path;

    let report = run_cleanup(
        repo,
        &CleanupRequest {
            untracked: vec!["notes.txt".to_string()],
            ignored: vec!["app.log".to_string()],
            ..CleanupRequest::default()
        },
    )
    .await
    .expect("cleanup");

    assert_eq!(report.removed_files, 2);
    assert!(report.failures.is_empty());
    assert!(!repo.join("notes.txt").exists());
    assert!(!repo.join("app.log").exists());
    assert!(repo.join("scratch/deep.txt").exists());
    assert!(repo.join("build/out.bin").exists());
    assert!(repo.join("a.txt").exists());
}

#[tokio::test]
async fn directories_go_away_with_everything_inside() {
    let workspace = repository_with_files().await;
    let repo = &workspace.path;

    run_cleanup(
        repo,
        &CleanupRequest {
            untracked: vec!["scratch".to_string()],
            ignored: vec!["build".to_string()],
            ..CleanupRequest::default()
        },
    )
    .await
    .expect("cleanup");

    assert!(!repo.join("scratch").exists());
    assert!(!repo.join("build").exists());
    assert!(repo.join("notes.txt").exists());
}

#[tokio::test]
async fn names_with_glob_characters_only_remove_that_exact_file() {
    let workspace = new_repository().await;
    let repo = &workspace.path;
    commit_file(repo, "a.txt", "one", "base").await;
    write_file(repo, "odd [1] name.txt", "bracketed");
    write_file(repo, "odd 1 name.txt", "plain");

    run_cleanup(
        repo,
        &CleanupRequest {
            untracked: vec!["odd [1] name.txt".to_string()],
            ..CleanupRequest::default()
        },
    )
    .await
    .expect("cleanup");

    assert!(!repo.join("odd [1] name.txt").exists());
    assert!(repo.join("odd 1 name.txt").exists());
}

#[tokio::test]
async fn anything_outside_the_preview_is_refused() {
    let workspace = repository_with_files().await;
    let repo = &workspace.path;

    for request in [
        CleanupRequest {
            untracked: vec!["a.txt".to_string()],
            ..CleanupRequest::default()
        },
        CleanupRequest {
            untracked: vec!["../outside.txt".to_string()],
            ..CleanupRequest::default()
        },
        CleanupRequest {
            untracked: vec!["app.log".to_string()],
            ..CleanupRequest::default()
        },
        CleanupRequest {
            merged_branches: vec!["main".to_string()],
            ..CleanupRequest::default()
        },
        CleanupRequest {
            prune_remotes: vec!["nowhere".to_string()],
            ..CleanupRequest::default()
        },
        CleanupRequest::default(),
    ] {
        let error = run_cleanup(repo, &request).await.expect_err("refused");
        assert_eq!(error.kind, ErrorKind::InvalidInput, "{request:?}");
    }
    assert!(repo.join("a.txt").exists());
    assert!(repo.join("notes.txt").exists());
}

#[tokio::test]
async fn merged_branches_are_offered_without_the_ones_that_matter() {
    let workspace = new_repository().await;
    let repo = &workspace.path;
    commit_file(repo, "a.txt", "one", "base").await;
    git_output(repo, &["branch", "develop"]);
    git_output(repo, &["checkout", "-q", "-b", "feature"]);
    commit_file(repo, "feature.txt", "f", "feature work").await;
    git_output(repo, &["checkout", "-q", "main"]);
    commit_file(repo, "main2.txt", "m", "main work").await;
    git_output(repo, &["merge", "-q", "--no-ff", "-m", "join", "feature"]);
    git_output(repo, &["branch", "fresh"]);
    git_output(repo, &["checkout", "-q", "-b", "wip"]);
    commit_file(repo, "wip.txt", "w", "unfinished").await;
    git_output(repo, &["checkout", "-q", "main"]);
    let other = TempDir::new().expect("temp dir");
    git_output(
        repo,
        &[
            "worktree",
            "add",
            "-q",
            "-b",
            "busy",
            other.path().join("busy").to_str().expect("path"),
            "HEAD~1",
        ],
    );

    let preview = preview_cleanup(repo).await.expect("preview");

    assert_eq!(branch_names(&preview.merged_branches), vec!["feature"]);
    assert_eq!(preview.merged_branches[0].unique_commits, 0);
    assert!(preview.gone_branches.is_empty());

    let report = run_cleanup(
        repo,
        &CleanupRequest {
            merged_branches: vec!["feature".to_string()],
            ..CleanupRequest::default()
        },
    )
    .await
    .expect("cleanup");
    assert_eq!(report.deleted_branches.len(), 1);
    assert_eq!(report.deleted_branches[0].name, "feature");
    assert!(git_output(repo, &["branch", "--list", "feature"])
        .trim()
        .is_empty());
    assert!(!git_output(repo, &["branch", "--list", "wip"])
        .trim()
        .is_empty());

    let unmerged = run_cleanup(
        repo,
        &CleanupRequest {
            merged_branches: vec!["wip".to_string()],
            ..CleanupRequest::default()
        },
    )
    .await
    .expect_err("not offered");
    assert_eq!(unmerged.kind, ErrorKind::InvalidInput);
}

#[tokio::test]
async fn branches_whose_remote_disappeared_report_their_own_commits() {
    let (_remote_root, remote) = bare_remote();
    let workspace = new_repository().await;
    let repo = &workspace.path;
    connect(repo, &remote);
    commit_file(repo, "a.txt", "one", "base").await;
    git_output(repo, &["push", "-q", "-u", "origin", "main"]);
    git_output(repo, &["checkout", "-q", "-b", "feature"]);
    let tip = commit_file(repo, "feature.txt", "f", "squashed elsewhere").await;
    git_output(repo, &["push", "-q", "-u", "origin", "feature"]);
    git_output(repo, &["checkout", "-q", "main"]);
    git_output(&remote, &["branch", "-D", "feature"]);
    git_output(repo, &["fetch", "-q", "--prune", "origin"]);

    let preview = preview_cleanup(repo).await.expect("preview");

    assert_eq!(branch_names(&preview.gone_branches), vec!["feature"]);
    assert_eq!(preview.gone_branches[0].unique_commits, 1);
    assert_eq!(preview.gone_branches[0].hash, tip);
    assert!(preview.merged_branches.is_empty());

    let report = run_cleanup(
        repo,
        &CleanupRequest {
            gone_branches: vec!["feature".to_string()],
            ..CleanupRequest::default()
        },
    )
    .await
    .expect("cleanup");
    assert_eq!(report.deleted_branches[0].hash, tip);
    assert!(git_output(repo, &["branch", "--list", "feature"])
        .trim()
        .is_empty());
}

#[tokio::test]
async fn stale_remote_branches_are_listed_and_pruned() {
    let (_remote_root, remote) = bare_remote();
    let workspace = new_repository().await;
    let repo = &workspace.path;
    connect(repo, &remote);
    commit_file(repo, "a.txt", "one", "base").await;
    git_output(repo, &["push", "-q", "-u", "origin", "main"]);
    git_output(repo, &["push", "-q", "origin", "main:old-topic"]);
    git_output(&remote, &["branch", "-D", "old-topic"]);

    let stale = stale_remote_branches(repo).await.expect("stale");
    assert_eq!(stale.len(), 1);
    assert_eq!(stale[0].remote, "origin");
    assert_eq!(stale[0].name, "old-topic");

    let report = run_cleanup(
        repo,
        &CleanupRequest {
            prune_remotes: vec!["origin".to_string()],
            ..CleanupRequest::default()
        },
    )
    .await
    .expect("cleanup");
    assert_eq!(report.pruned_branches, 1);
    assert!(stale_remote_branches(repo).await.expect("stale").is_empty());
}

#[tokio::test]
async fn the_default_branch_of_origin_is_never_offered() {
    let (_remote_root, remote) = bare_remote();
    let workspace = new_repository().await;
    let repo = &workspace.path;
    connect(repo, &remote);
    commit_file(repo, "a.txt", "one", "base").await;
    git_output(repo, &["branch", "release"]);
    commit_file(repo, "b.txt", "two", "later").await;
    git_output(repo, &["push", "-q", "origin", "main", "release"]);
    git_output(
        repo,
        &[
            "symbolic-ref",
            "refs/remotes/origin/HEAD",
            "refs/remotes/origin/release",
        ],
    );

    let preview = preview_cleanup(repo).await.expect("preview");

    assert!(preview.merged_branches.is_empty());
}
