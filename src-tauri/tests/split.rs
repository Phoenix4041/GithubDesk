mod common;

use common::{commit_file, git_output, new_repository, write_file};
use githubdesk_lib::commands::split::{split_commit, split_files};
use githubdesk_lib::error::ErrorKind;

async fn repository_with_a_two_file_commit() -> (common::Workspace, String) {
    let workspace = new_repository().await;
    let repo = &workspace.path;
    commit_file(repo, "base.txt", "base\n", "base").await;
    write_file(repo, "one.txt", "one\n");
    write_file(repo, "two.txt", "two\n");
    write_file(repo, "base.txt", "base\nchanged\n");
    git_output(repo, &["add", "-A"]);
    git_output(repo, &["commit", "-q", "-m", "three things at once"]);
    let hash = git_output(repo, &["rev-parse", "HEAD"]).trim().to_string();
    (workspace, hash)
}

fn names(repo: &std::path::Path, revision: &str) -> Vec<String> {
    git_output(
        repo,
        &["diff-tree", "--no-commit-id", "--name-only", "-r", revision],
    )
    .lines()
    .map(str::to_string)
    .collect()
}

#[tokio::test]
async fn the_last_commit_becomes_two_commits_with_the_same_final_content() {
    let (workspace, hash) = repository_with_a_two_file_commit().await;
    let repo = &workspace.path;
    let tree_before = git_output(repo, &["rev-parse", "HEAD^{tree}"]);

    split_commit(
        repo,
        &hash,
        &["one.txt".to_string()],
        "add one",
        "add the rest",
    )
    .await
    .expect("split");

    assert_eq!(git_output(repo, &["rev-parse", "HEAD^{tree}"]), tree_before);
    assert_eq!(
        git_output(repo, &["log", "--format=%s", "-n", "3"]),
        "add the rest\nadd one\nbase\n"
    );
    assert_eq!(names(repo, "HEAD~1"), vec!["one.txt"]);
    let mut second = names(repo, "HEAD");
    second.sort();
    assert_eq!(second, vec!["base.txt", "two.txt"]);
    assert_eq!(git_output(repo, &["status", "--porcelain"]), "");
}

#[tokio::test]
async fn an_older_commit_is_split_and_the_later_ones_are_replayed() {
    let (workspace, hash) = repository_with_a_two_file_commit().await;
    let repo = &workspace.path;
    commit_file(repo, "later.txt", "later\n", "later work").await;
    commit_file(repo, "more.txt", "more\n", "more work").await;
    let tree_before = git_output(repo, &["rev-parse", "HEAD^{tree}"]);

    split_commit(
        repo,
        &hash,
        &["one.txt".to_string(), "two.txt".to_string()],
        "add two files",
        "tweak base",
    )
    .await
    .expect("split");

    assert_eq!(git_output(repo, &["rev-parse", "HEAD^{tree}"]), tree_before);
    assert_eq!(
        git_output(repo, &["log", "--format=%s", "-n", "5"]),
        "more work\nlater work\ntweak base\nadd two files\nbase\n"
    );
    assert_eq!(
        git_output(repo, &["branch", "--show-current"]).trim(),
        "main"
    );
}

#[tokio::test]
async fn the_original_author_is_kept() {
    let (workspace, hash) = repository_with_a_two_file_commit().await;
    let repo = &workspace.path;
    let author = git_output(repo, &["show", "-s", "--format=%an <%ae>", &hash]);
    split_commit(repo, &hash, &["one.txt".to_string()], "a", "b")
        .await
        .expect("split");
    assert_eq!(
        git_output(repo, &["show", "-s", "--format=%an <%ae>", "HEAD"]),
        author
    );
    assert_eq!(
        git_output(repo, &["show", "-s", "--format=%an <%ae>", "HEAD~1"]),
        author
    );
}

#[tokio::test]
async fn a_root_commit_can_be_split() {
    let workspace = new_repository().await;
    let repo = &workspace.path;
    write_file(repo, "a.txt", "a\n");
    write_file(repo, "b.txt", "b\n");
    git_output(repo, &["add", "-A"]);
    git_output(repo, &["commit", "-q", "-m", "first"]);
    let hash = git_output(repo, &["rev-parse", "HEAD"]).trim().to_string();
    split_commit(repo, &hash, &["a.txt".to_string()], "only a", "then b")
        .await
        .expect("split");
    assert_eq!(
        git_output(repo, &["log", "--format=%s"]),
        "then b\nonly a\n"
    );
}

#[tokio::test]
async fn bad_choices_are_refused_without_touching_history() {
    let (workspace, hash) = repository_with_a_two_file_commit().await;
    let repo = &workspace.path;
    let head = git_output(repo, &["rev-parse", "HEAD"]);
    let both: Vec<String> = ["base.txt", "one.txt", "two.txt"]
        .iter()
        .map(|name| name.to_string())
        .collect();
    for (paths, first, second, kind) in [
        (vec![], "a", "b", ErrorKind::InvalidInput),
        (both, "a", "b", ErrorKind::InvalidInput),
        (
            vec!["missing.txt".to_string()],
            "a",
            "b",
            ErrorKind::InvalidInput,
        ),
        (
            vec!["one.txt".to_string()],
            "",
            "b",
            ErrorKind::EmptyCommitMessage,
        ),
        (
            vec!["../one.txt".to_string()],
            "a",
            "b",
            ErrorKind::InvalidInput,
        ),
    ] {
        let error = split_commit(repo, &hash, &paths, first, second)
            .await
            .expect_err("refused");
        assert_eq!(error.kind, kind);
    }
    assert_eq!(git_output(repo, &["rev-parse", "HEAD"]), head);
}

#[tokio::test]
async fn published_and_merge_commits_cannot_be_split() {
    let (workspace, hash) = repository_with_a_two_file_commit().await;
    let repo = &workspace.path;
    let remote = tempfile::TempDir::new().expect("remote");
    git_output(
        remote.path(),
        &["init", "-q", "--bare", "-b", "main", "origin.git"],
    );
    let url = remote.path().join("origin.git");
    git_output(
        repo,
        &["remote", "add", "origin", url.to_str().expect("path")],
    );
    git_output(repo, &["push", "-q", "-u", "origin", "main"]);
    assert_eq!(
        split_files(repo, &hash).await.expect_err("published").kind,
        ErrorKind::InvalidInput
    );

    git_output(repo, &["switch", "-q", "-c", "side"]);
    commit_file(repo, "side.txt", "s\n", "side").await;
    git_output(repo, &["switch", "-q", "main"]);
    commit_file(repo, "main.txt", "m\n", "main side").await;
    git_output(
        repo,
        &["merge", "-q", "--no-ff", "-m", "merge side", "side"],
    );
    let merge = git_output(repo, &["rev-parse", "HEAD"]).trim().to_string();
    assert!(split_files(repo, &merge).await.is_err());
}
