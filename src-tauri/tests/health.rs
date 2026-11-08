mod common;

use std::path::{Path, PathBuf};
use std::sync::Arc;

use common::{commit_file, git_output, new_repository, write_file};
use githubdesk_lib::commands::health::{
    largest_blobs, run_maintenance, size_report, sparse_disable, sparse_set, sparse_state,
};
use githubdesk_lib::commands::repo::{clone_repository_with, CloneOptions};
use githubdesk_lib::error::ErrorKind;
use githubdesk_lib::jobs::{CancelToken, JobRegistry};
use tempfile::TempDir;

fn ignore(_: githubdesk_lib::git::parse::progress::Progress) {}

fn file_url(path: &Path) -> String {
    let text = path.to_string_lossy().replace('\\', "/");
    if text.starts_with('/') {
        format!("file://{text}")
    } else {
        format!("file:///{text}")
    }
}

#[tokio::test]
async fn a_big_file_removed_from_the_tree_is_still_found_in_the_history() {
    let workspace = new_repository().await;
    let repo = workspace.path.as_path();
    commit_file(repo, "small.txt", "tiny\n", "small").await;
    let big = "x".repeat(300_000);
    commit_file(repo, "assets/big.bin", &big, "big").await;
    git_output(repo, &["rm", "-q", "assets/big.bin"]);
    git_output(repo, &["commit", "-q", "-m", "drop big"]);

    let blobs = largest_blobs(repo, CancelToken::never())
        .await
        .expect("blobs");
    assert_eq!(blobs[0].path, "assets/big.bin");
    assert_eq!(blobs[0].size, 300_000);
    assert!(blobs.iter().any(|blob| blob.path == "small.txt"));
}

#[tokio::test]
async fn a_cancelled_blob_search_stops() {
    let workspace = new_repository().await;
    commit_file(&workspace.path, "a.txt", "a\n", "a").await;
    let registry = Arc::new(JobRegistry::default());
    let guard = registry.register("blobs");
    registry.cancel("blobs");
    let error = largest_blobs(&workspace.path, guard.token())
        .await
        .expect_err("cancelled");
    assert_eq!(error.kind, ErrorKind::Cancelled);
}

#[tokio::test]
async fn the_size_report_counts_objects_refs_and_stashes() {
    let workspace = new_repository().await;
    let repo = workspace.path.as_path();
    commit_file(repo, "a.txt", "one\n", "first").await;
    git_output(repo, &["branch", "side"]);
    git_output(repo, &["checkout", "-q", "-b", "extra"]);
    commit_file(repo, "b.txt", "two\n", "extra work").await;
    git_output(repo, &["checkout", "-q", "main"]);
    write_file(repo, "a.txt", "changed\n");
    git_output(repo, &["stash", "-q"]);

    let report = size_report(repo).await.expect("size");
    assert!(report.git_dir_bytes > 0);
    assert!(report.objects.loose_objects > 0);
    assert_eq!(report.refs.branches, 3);
    assert_eq!(report.refs.unmerged_branches, 1);
    assert_eq!(report.refs.stashes, 1);
    assert!(report.refs.loose_refs >= 3);
    assert!(!report.shallow);

    let maintenance = run_maintenance(repo, CancelToken::never())
        .await
        .expect("gc");
    assert!(maintenance.before.loose_objects > 0);
    assert_eq!(maintenance.after.loose_objects, 0);
    assert!(maintenance.after.packs >= 1);
    let after = size_report(repo).await.expect("size after");
    assert!(after.refs.packed_refs > 0);
}

#[tokio::test]
async fn sparse_checkout_removes_other_folders_and_brings_them_back() {
    let workspace = new_repository().await;
    let repo = workspace.path.as_path();
    write_file(repo, "app/main.rs", "fn main() {}\n");
    write_file(repo, "docs/guide.md", "guide\n");
    write_file(repo, "tools/build.sh", "echo\n");
    write_file(repo, "README.md", "root\n");
    git_output(repo, &["add", "-A"]);
    git_output(repo, &["commit", "-q", "-m", "layout"]);

    let initial = sparse_state(repo).await.expect("state");
    assert!(!initial.enabled);

    let state = sparse_set(repo, &["app\\".to_string()]).await.expect("set");
    assert!(state.enabled);
    assert!(state.cone);
    assert_eq!(state.folders, vec!["app".to_string()]);
    assert!(repo.join("app/main.rs").exists());
    assert!(repo.join("README.md").exists());
    assert!(!repo.join("docs/guide.md").exists());
    assert!(!repo.join("tools/build.sh").exists());

    assert!(sparse_set(repo, &["../outside".to_string()]).await.is_err());

    let state = sparse_disable(repo).await.expect("disable");
    assert!(!state.enabled);
    assert!(repo.join("docs/guide.md").exists());
    assert!(repo.join("tools/build.sh").exists());
}

#[tokio::test]
async fn shallow_and_blobless_clones_use_the_requested_options() {
    let workspace = new_repository().await;
    let source = workspace.path.as_path();
    for index in 0..3 {
        commit_file(source, "a.txt", &format!("{index}\n"), "step").await;
    }
    git_output(source, &["config", "uploadpack.allowFilter", "true"]);
    let root = TempDir::new().expect("root");
    let url = file_url(source);

    let shallow_destination = root.path().join("shallow");
    let shallow = clone_repository_with(
        &url,
        &shallow_destination,
        CloneOptions {
            depth: Some(1),
            blobless: false,
        },
        CancelToken::never(),
        &ignore,
    )
    .await
    .expect("shallow clone");
    let shallow_path = PathBuf::from(&shallow.path);
    let count = git_output(&shallow_path, &["rev-list", "--count", "HEAD"]);
    assert_eq!(count.trim(), "1");
    assert!(size_report(&shallow_path).await.expect("size").shallow);

    let partial_destination = root.path().join("partial");
    let partial = clone_repository_with(
        &url,
        &partial_destination,
        CloneOptions {
            depth: None,
            blobless: true,
        },
        CancelToken::never(),
        &ignore,
    )
    .await
    .expect("partial clone");
    let partial_path = PathBuf::from(&partial.path);
    let count = git_output(&partial_path, &["rev-list", "--count", "HEAD"]);
    assert_eq!(count.trim(), "3");
    assert!(size_report(&partial_path).await.expect("size").partial);

    let error = clone_repository_with(
        &url,
        &root.path().join("bad"),
        CloneOptions {
            depth: Some(0),
            blobless: false,
        },
        CancelToken::never(),
        &ignore,
    )
    .await
    .expect_err("invalid depth");
    assert_eq!(error.kind, ErrorKind::InvalidInput);
}
