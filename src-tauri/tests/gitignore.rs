mod common;

use common::{commit_file, git_output, new_repository, write_file};
use githubdesk_lib::commands::gitignore::{
    append_ignore_lines, check_ignored, read_ignore_file, tracked_but_ignored, untrack_paths,
    write_ignore_file,
};
use githubdesk_lib::error::ErrorKind;

#[tokio::test]
async fn a_missing_ignore_file_reads_as_empty_and_writes_round_trip() {
    let workspace = new_repository().await;
    let missing = read_ignore_file(&workspace.path).expect("read");
    assert!(!missing.exists);
    assert_eq!(missing.content, "");

    write_ignore_file(&workspace.path, "node_modules/\n*.log\n").expect("write");
    let stored = read_ignore_file(&workspace.path).expect("read");
    assert!(stored.exists);
    assert_eq!(stored.content, "node_modules/\n*.log\n");

    assert!(write_ignore_file(&workspace.path, "bad\0content").is_err());
}

#[tokio::test]
async fn appending_only_adds_new_lines_and_rejects_multiline_values() {
    let workspace = new_repository().await;
    assert_eq!(
        append_ignore_lines(&workspace.path, &["/dist".to_string(), "*.tmp".to_string()])
            .expect("append"),
        2
    );
    assert_eq!(
        append_ignore_lines(&workspace.path, &["/dist".to_string(), "/out".to_string()])
            .expect("append"),
        1
    );
    let content = read_ignore_file(&workspace.path).expect("read").content;
    assert_eq!(content, "/dist\n*.tmp\n/out\n");

    let error = append_ignore_lines(&workspace.path, &["a\nb".to_string()]).expect_err("multiline");
    assert_eq!(error.kind, ErrorKind::InvalidInput);
}

#[tokio::test]
async fn paths_are_checked_against_the_rules_with_their_source() {
    let workspace = new_repository().await;
    write_file(
        &workspace.path,
        ".gitignore",
        "# logs\n*.log\n!keep.log\nbuild/\n",
    );
    commit_file(&workspace.path, "src/main.rs", "fn main() {}", "first").await;

    let matches = check_ignored(
        &workspace.path,
        &[
            "debug.log".to_string(),
            "src/main.rs".to_string(),
            "keep.log".to_string(),
            "build/out.bin".to_string(),
        ],
    )
    .await
    .expect("check");
    assert_eq!(matches.len(), 4);

    assert!(matches[0].ignored);
    assert_eq!(matches[0].pattern.as_deref(), Some("*.log"));
    assert_eq!(matches[0].source.as_deref(), Some(".gitignore"));
    assert_eq!(matches[0].line, Some(2));

    assert!(!matches[1].ignored);
    assert_eq!(matches[1].pattern, None);

    assert!(!matches[2].ignored || matches[2].pattern.as_deref() == Some("!keep.log"));
    assert!(matches[3].ignored);
    assert_eq!(matches[3].pattern.as_deref(), Some("build/"));

    let escape = check_ignored(&workspace.path, &["../outside".to_string()])
        .await
        .expect_err("escape");
    assert_eq!(escape.kind, ErrorKind::InvalidInput);
}

#[tokio::test]
async fn tracked_files_that_match_a_rule_can_be_found_and_untracked() {
    let workspace = new_repository().await;
    commit_file(&workspace.path, "keep.txt", "keep", "first").await;
    commit_file(&workspace.path, "secret.env", "TOKEN=1", "add secret").await;
    commit_file(&workspace.path, "logs/a.log", "log", "add log").await;
    write_file(&workspace.path, ".gitignore", "*.env\n*.log\n");

    let mut tracked = tracked_but_ignored(&workspace.path).await.expect("tracked");
    tracked.sort();
    assert_eq!(
        tracked,
        vec!["logs/a.log".to_string(), "secret.env".to_string()]
    );

    untrack_paths(&workspace.path, &tracked)
        .await
        .expect("untrack");
    assert!(workspace.path.join("secret.env").is_file());
    assert!(tracked_but_ignored(&workspace.path)
        .await
        .expect("tracked")
        .is_empty());
    let listed = git_output(&workspace.path, &["ls-files"]);
    assert!(listed.contains("keep.txt"));
    assert!(!listed.contains("secret.env"));

    let bad = untrack_paths(&workspace.path, &["../x".to_string()])
        .await
        .expect_err("escape");
    assert_eq!(bad.kind, ErrorKind::InvalidInput);
}
