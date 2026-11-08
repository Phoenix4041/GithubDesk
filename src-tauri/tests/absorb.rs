mod common;

use common::{commit_file, git_output, new_repository, write_file};
use githubdesk_lib::commands::absorb::{absorb_apply, absorb_plan, SkipReason};
use githubdesk_lib::error::ErrorKind;

async fn history() -> common::Workspace {
    let workspace = new_repository().await;
    let repo = &workspace.path;
    commit_file(repo, "alpha.txt", "a1\na2\na3\n", "add alpha").await;
    commit_file(repo, "beta.txt", "b1\nb2\nb3\n", "add beta").await;
    commit_file(repo, "gamma.txt", "g1\ng2\ng3\n", "add gamma").await;
    workspace
}

#[tokio::test]
async fn each_changed_line_is_assigned_to_the_commit_that_wrote_it() {
    let workspace = history().await;
    let repo = &workspace.path;
    write_file(repo, "alpha.txt", "a1\nA2\na3\n");
    write_file(repo, "beta.txt", "b1\nb2\nB3\n");
    git_output(repo, &["add", "-A"]);

    let plan = absorb_plan(repo).await.expect("plan");
    assert_eq!(plan.assignments.len(), 2);
    let titles: Vec<&str> = plan
        .assignments
        .iter()
        .map(|item| item.target.title.as_str())
        .collect();
    assert!(titles.contains(&"add alpha"));
    assert!(titles.contains(&"add beta"));
    assert!(plan.skipped.is_empty());
}

#[tokio::test]
async fn additions_new_files_and_mixed_origins_are_left_out_with_a_reason() {
    let workspace = history().await;
    let repo = &workspace.path;
    write_file(repo, "alpha.txt", "a1\na2\na3\nnew tail\n");
    write_file(repo, "fresh.txt", "brand new\n");
    git_output(repo, &["add", "-A"]);
    let plan = absorb_plan(repo).await.expect("plan");
    assert!(plan.assignments.is_empty());
    let reasons: Vec<SkipReason> = plan.skipped.iter().map(|item| item.reason).collect();
    assert!(reasons.contains(&SkipReason::OnlyAdditions));
    assert!(reasons.contains(&SkipReason::Unsupported));
}

#[tokio::test]
async fn lines_written_by_several_commits_are_not_guessed() {
    let workspace = history().await;
    let repo = &workspace.path;
    commit_file(repo, "alpha.txt", "a1\na2\na3\nlast\n", "extend alpha").await;
    write_file(repo, "alpha.txt", "CHANGED\nCHANGED\nCHANGED\nCHANGED\n");
    git_output(repo, &["add", "-A"]);
    let plan = absorb_plan(repo).await.expect("plan");
    assert!(plan.assignments.is_empty());
    assert_eq!(plan.skipped[0].reason, SkipReason::ManyCommits);
}

#[tokio::test]
async fn applying_creates_one_fixup_per_target_and_keeps_unrelated_staged_changes() {
    let workspace = history().await;
    let repo = &workspace.path;
    write_file(repo, "alpha.txt", "a1\nA2\na3\n");
    write_file(repo, "beta.txt", "b1\nb2\nB3\n");
    write_file(repo, "gamma.txt", "g1\ng2\ng3\nmore\n");
    git_output(repo, &["add", "-A"]);

    let report = absorb_apply(repo, false).await.expect("absorb");
    assert_eq!(report.fixups, 2);
    let subjects = git_output(repo, &["log", "--format=%s", "-n", "5"]);
    assert!(subjects.contains("fixup! add alpha"));
    assert!(subjects.contains("fixup! add beta"));
    let staged = git_output(repo, &["diff", "--cached", "--name-only"]);
    assert_eq!(staged.trim(), "gamma.txt");
    assert_eq!(
        std::fs::read_to_string(repo.join("alpha.txt")).expect("alpha"),
        "a1\nA2\na3\n"
    );
}

#[tokio::test]
async fn squashing_folds_the_fixups_into_their_commits() {
    let workspace = history().await;
    let repo = &workspace.path;
    write_file(repo, "alpha.txt", "a1\nA2\na3\n");
    write_file(repo, "beta.txt", "b1\nb2\nB3\n");
    git_output(repo, &["add", "-A"]);
    let before = git_output(repo, &["rev-list", "--count", "HEAD"]);

    let report = absorb_apply(repo, true).await.expect("absorb");
    assert!(report.squashed);
    assert_eq!(git_output(repo, &["rev-list", "--count", "HEAD"]), before);
    assert!(!git_output(repo, &["log", "--format=%s"]).contains("fixup!"));
    assert_eq!(
        git_output(repo, &["show", "HEAD~2:alpha.txt"]),
        "a1\nA2\na3\n"
    );
    assert_eq!(
        git_output(repo, &["show", "HEAD~1:beta.txt"]),
        "b1\nb2\nB3\n"
    );
    assert_eq!(git_output(repo, &["status", "--porcelain"]), "");
}

#[tokio::test]
async fn published_commits_are_never_rewritten() {
    let workspace = history().await;
    let repo = &workspace.path;
    let remote = tempfile::TempDir::new().expect("remote dir");
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
    write_file(repo, "alpha.txt", "a1\nA2\na3\n");
    git_output(repo, &["add", "-A"]);

    let plan = absorb_plan(repo).await.expect("plan");
    assert!(plan.assignments.is_empty());
    assert_eq!(plan.skipped[0].reason, SkipReason::Published);
    assert_eq!(
        absorb_apply(repo, false).await.expect_err("nothing").kind,
        ErrorKind::InvalidInput
    );
}

#[tokio::test]
async fn nothing_staged_means_an_empty_plan() {
    let workspace = history().await;
    let plan = absorb_plan(&workspace.path).await.expect("plan");
    assert!(plan.assignments.is_empty() && plan.skipped.is_empty());
}
