mod common;

use std::process::Command;

use common::{git_output, new_repository, write_file};
use githubdesk_lib::commands::commit::create_commit;
use githubdesk_lib::commands::lfs::{lfs_install, lfs_status, lfs_track, lfs_untrack};
use githubdesk_lib::commands::status::stage_paths;
use githubdesk_lib::error::ErrorKind;

fn lfs_available() -> bool {
    Command::new("git")
        .args(["lfs", "version"])
        .output()
        .is_ok_and(|output| output.status.success())
}

async fn commit_paths(repo: &std::path::Path, paths: &[&str], title: &str) {
    let owned: Vec<String> = paths.iter().map(|path| path.to_string()).collect();
    stage_paths(repo, &owned).await.expect("stage");
    create_commit(repo, title, "", false).await.expect("commit");
}

#[tokio::test]
async fn a_repository_without_lfs_setup_reports_empty_state() {
    if !lfs_available() {
        eprintln!("git lfs is not installed, skipping");
        return;
    }
    let workspace = new_repository().await;
    let status = lfs_status(&workspace.path).await.expect("status");
    assert!(status.installed);
    assert!(status.version.is_some());
    assert!(status.patterns.is_empty());
    assert!(status.files.is_empty());
}

#[tokio::test]
async fn installing_tracking_and_listing_large_files_works_end_to_end() {
    if !lfs_available() {
        eprintln!("git lfs is not installed, skipping");
        return;
    }
    let workspace = new_repository().await;
    lfs_install(&workspace.path).await.expect("install");
    lfs_track(&workspace.path, "*.bin").await.expect("track");
    lfs_track(&workspace.path, "assets/**")
        .await
        .expect("track dir");

    let status = lfs_status(&workspace.path).await.expect("status");
    assert!(status.filters_configured);
    assert!(status.hooks_installed);
    let patterns: Vec<&str> = status
        .patterns
        .iter()
        .map(|item| item.pattern.as_str())
        .collect();
    assert_eq!(patterns, vec!["*.bin", "assets/**"]);
    assert!(status
        .patterns
        .iter()
        .all(|item| item.source == ".gitattributes"));

    write_file(&workspace.path, "big.bin", &"x".repeat(20_000));
    write_file(&workspace.path, "assets/pic.dat", "image data");
    write_file(&workspace.path, "note.txt", "plain text");
    commit_paths(
        &workspace.path,
        &[".gitattributes", "big.bin", "assets/pic.dat", "note.txt"],
        "add large files",
    )
    .await;

    let after = lfs_status(&workspace.path).await.expect("status");
    let mut paths: Vec<&str> = after.files.iter().map(|file| file.path.as_str()).collect();
    paths.sort_unstable();
    assert_eq!(paths, vec!["assets/pic.dat", "big.bin"]);
    assert!(after.files.iter().all(|file| file.present));
    assert!(after.files.iter().all(|file| file.oid.len() == 64));
    let big = after
        .files
        .iter()
        .find(|file| file.path == "big.bin")
        .expect("big.bin");
    assert!(big.size.is_some());

    let stored = git_output(&workspace.path, &["show", "HEAD:big.bin"]);
    assert!(
        stored.starts_with("version https://git-lfs.github.com/spec/v1"),
        "the repository must store a pointer, not the content"
    );

    lfs_untrack(&workspace.path, "*.bin")
        .await
        .expect("untrack");
    let untracked = lfs_status(&workspace.path).await.expect("status");
    let remaining: Vec<&str> = untracked
        .patterns
        .iter()
        .map(|item| item.pattern.as_str())
        .collect();
    assert_eq!(remaining, vec!["assets/**"]);
}

#[tokio::test]
async fn invalid_patterns_are_rejected() {
    if !lfs_available() {
        eprintln!("git lfs is not installed, skipping");
        return;
    }
    let workspace = new_repository().await;
    for bad in ["", "  ", "--all", "-x", "#comment", "two\nlines"] {
        let error = lfs_track(&workspace.path, bad)
            .await
            .expect_err("invalid pattern");
        assert_eq!(error.kind, ErrorKind::InvalidInput, "pattern {bad:?}");
    }
}
