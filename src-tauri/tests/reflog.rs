mod common;

use common::{commit_file, git_output, new_repository};
use githubdesk_lib::commands::reflog::{
    list_reflog, list_reflog_for, list_reflog_refs, recover_commit,
};
use githubdesk_lib::error::ErrorKind;
use githubdesk_lib::git::parse::reflog::ReflogAction;

#[tokio::test]
async fn the_head_reflog_lists_commits_and_branch_switches() {
    let workspace = new_repository().await;
    let repo = &workspace.path;
    commit_file(repo, "a.txt", "one", "first").await;
    git_output(repo, &["checkout", "-q", "-b", "feature"]);
    commit_file(repo, "b.txt", "two", "second").await;

    let entries = list_reflog(repo, 50).await.expect("reflog");
    assert_eq!(entries[0].action, ReflogAction::Commit);
    assert!(entries
        .iter()
        .any(|entry| entry.action == ReflogAction::Checkout));
}

#[tokio::test]
async fn each_branch_has_its_own_reflog() {
    let workspace = new_repository().await;
    let repo = &workspace.path;
    commit_file(repo, "a.txt", "one", "first").await;
    git_output(repo, &["checkout", "-q", "-b", "feature"]);
    commit_file(repo, "b.txt", "two", "second").await;

    let refs = list_reflog_refs(repo).await.expect("refs");
    assert!(refs.contains(&"main".to_string()));
    assert!(refs.contains(&"feature".to_string()));

    let main = list_reflog_for(repo, "main", 50).await.expect("main reflog");
    let feature = list_reflog_for(repo, "feature", 50)
        .await
        .expect("feature reflog");
    assert_eq!(main.len(), 1);
    assert_eq!(feature.len(), 2);
}

#[tokio::test]
async fn a_dropped_commit_is_recovered_into_a_new_branch() {
    let workspace = new_repository().await;
    let repo = &workspace.path;
    commit_file(repo, "a.txt", "one", "first").await;
    let lost = commit_file(repo, "b.txt", "two", "second").await;
    git_output(repo, &["reset", "-q", "--hard", "HEAD~1"]);

    recover_commit(repo, "rescued", &lost)
        .await
        .expect("recover");
    assert_eq!(git_output(repo, &["rev-parse", "rescued"]).trim(), lost);
}

#[tokio::test]
async fn recovering_rejects_bad_names_and_hashes() {
    let workspace = new_repository().await;
    let repo = &workspace.path;
    let tip = commit_file(repo, "a.txt", "one", "first").await;

    let bad_name = recover_commit(repo, "bad name..", &tip)
        .await
        .expect_err("name");
    assert_eq!(bad_name.kind, ErrorKind::InvalidName);
    assert!(recover_commit(repo, "ok", "--force").await.is_err());
    assert!(recover_commit(repo, "main", &tip).await.is_err());
}
