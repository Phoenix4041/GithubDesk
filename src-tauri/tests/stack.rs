mod common;

use common::{commit_file, git_output, new_repository};
use githubdesk_lib::commands::stack::{restack, set_parent, stack_nodes};
use githubdesk_lib::error::ErrorKind;

async fn stack_of_three() -> common::Workspace {
    let workspace = new_repository().await;
    let repo = &workspace.path;
    commit_file(repo, "base.txt", "base\n", "base").await;
    git_output(repo, &["switch", "-q", "-c", "a"]);
    commit_file(repo, "a.txt", "a\n", "a work").await;
    git_output(repo, &["switch", "-q", "-c", "b"]);
    commit_file(repo, "b.txt", "b\n", "b work").await;
    git_output(repo, &["switch", "-q", "-c", "c"]);
    commit_file(repo, "c.txt", "c\n", "c work").await;
    set_parent(repo, "a", Some("main")).await.expect("a");
    set_parent(repo, "b", Some("a")).await.expect("b");
    set_parent(repo, "c", Some("b")).await.expect("c");
    workspace
}

#[tokio::test]
async fn the_chain_is_listed_parent_first_with_depth_and_size() {
    let workspace = stack_of_three().await;
    let nodes = stack_nodes(&workspace.path).await.expect("nodes");
    let summary: Vec<(&str, u32, u32, bool)> = nodes
        .iter()
        .map(|node| {
            (
                node.name.as_str(),
                node.depth,
                node.ahead,
                node.needs_restack,
            )
        })
        .collect();
    assert_eq!(
        summary,
        vec![
            ("main", 0, 0, false),
            ("a", 1, 1, false),
            ("b", 2, 1, false),
            ("c", 3, 1, false)
        ]
    );
    assert!(nodes[3].is_current);
}

#[tokio::test]
async fn a_new_commit_on_the_root_moves_the_whole_chain_and_keeps_the_current_branch() {
    let workspace = stack_of_three().await;
    let repo = &workspace.path;
    git_output(repo, &["switch", "-q", "main"]);
    let moved = commit_file(repo, "main.txt", "main\n", "main moved").await;
    git_output(repo, &["switch", "-q", "b"]);

    let nodes = stack_nodes(repo).await.expect("nodes");
    assert!(
        nodes
            .iter()
            .find(|node| node.name == "a")
            .expect("a")
            .needs_restack
    );

    let report = restack(repo).await.expect("restack");
    assert_eq!(report.restacked, vec!["a", "b", "c"]);
    for branch in ["a", "b", "c"] {
        git_output(repo, &["merge-base", "--is-ancestor", &moved, branch]);
    }
    assert_eq!(
        git_output(repo, &["rev-list", "--count", "main..c"]).trim(),
        "3"
    );
    assert_eq!(git_output(repo, &["branch", "--show-current"]).trim(), "b");
    assert!(stack_nodes(repo)
        .await
        .expect("nodes")
        .iter()
        .all(|node| !node.needs_restack));
    assert!(restack(repo).await.expect("again").restacked.is_empty());
}

#[tokio::test]
async fn a_conflict_stops_the_restack_and_can_be_aborted() {
    let workspace = new_repository().await;
    let repo = &workspace.path;
    commit_file(repo, "x.txt", "one\n", "base").await;
    git_output(repo, &["switch", "-q", "-c", "a"]);
    commit_file(repo, "x.txt", "branch\n", "a edit").await;
    set_parent(repo, "a", Some("main")).await.expect("parent");
    git_output(repo, &["switch", "-q", "main"]);
    commit_file(repo, "x.txt", "main\n", "main edit").await;

    let error = restack(repo).await.expect_err("conflict");
    assert_eq!(error.kind, ErrorKind::MergeConflict);
    assert!(
        repo.join(".git").join("rebase-merge").exists()
            || repo.join(".git").join("rebase-apply").exists()
    );
    git_output(repo, &["rebase", "--abort"]);
}

#[tokio::test]
async fn invalid_parents_and_cycles_are_refused_and_a_parent_can_be_removed() {
    let workspace = stack_of_three().await;
    let repo = &workspace.path;
    for (branch, parent) in [("a", "a"), ("a", "nope"), ("a", "c"), ("missing", "main")] {
        assert_eq!(
            set_parent(repo, branch, Some(parent))
                .await
                .expect_err("refused")
                .kind,
            ErrorKind::InvalidInput,
            "{branch} {parent}"
        );
    }
    set_parent(repo, "b", None).await.expect("unset");
    let names: Vec<String> = stack_nodes(repo)
        .await
        .expect("nodes")
        .into_iter()
        .map(|node| node.name)
        .collect();
    assert!(!names.contains(&"b".to_string()) || names.iter().position(|n| n == "b") != Some(2));
    assert_eq!(
        git_output(
            repo,
            &["config", "--local", "--get-regexp", "githubdeskparent"]
        )
        .lines()
        .count(),
        2
    );
}
