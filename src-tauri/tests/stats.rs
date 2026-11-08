mod common;

use std::path::Path;
use std::sync::Arc;

use common::{git_as, new_repository, write_file};
use githubdesk_lib::commands::stats::{collect_stats, find_todos, line_author};
use githubdesk_lib::error::ErrorKind;
use githubdesk_lib::jobs::{CancelToken, JobRegistry};

fn commit_as(repo: &Path, name: &str, email: &str, file: &str, content: &str, message: &str) {
    write_file(repo, file, content);
    git_as(repo, name, email, &["add", "-A"]);
    git_as(repo, name, email, &["commit", "-q", "-m", message]);
}

async fn team_repository() -> common::Workspace {
    let workspace = new_repository().await;
    let repo = workspace.path.as_path();
    for round in 0..5 {
        let body = format!("fn main() {{}}\n// round {round}\n");
        commit_as(
            repo,
            "Ana",
            "Ana@Example.com",
            "src/core/engine.rs",
            &body,
            "engine",
        );
    }
    commit_as(
        repo,
        "Ana",
        "ana@example.com",
        "README.md",
        "hola\n",
        "readme",
    );
    commit_as(
        repo,
        "Beto",
        "beto@example.com",
        "README.md",
        "hola\nmundo\n",
        "readme 2",
    );
    commit_as(
        repo,
        "Beto",
        "beto@example.com",
        "docs/guide.md",
        "intro\n// TODO: write the guide\n",
        "guide",
    );
    workspace
}

#[tokio::test]
async fn statistics_group_authors_by_email_and_find_the_sole_owner_files() {
    let workspace = team_repository().await;
    let stats = collect_stats(&workspace.path, 20_000, CancelToken::never())
        .await
        .expect("stats");

    assert_eq!(stats.commits, 8);
    assert!(!stats.truncated);
    assert_eq!(stats.contributors.len(), 2);
    let ana = &stats.contributors[0];
    assert_eq!(ana.email, "ana@example.com");
    assert_eq!(ana.commits, 6);
    assert!(ana.first_commit <= ana.last_commit);
    let beto = &stats.contributors[1];
    assert_eq!((beto.commits, beto.additions), (2, 3));

    assert_eq!(stats.files[0].path, "src/core/engine.rs");
    assert_eq!(stats.files[0].commits, 5);
    let readme = stats
        .files
        .iter()
        .find(|file| file.path == "README.md")
        .expect("readme");
    assert_eq!(readme.authors, 2);
    assert_eq!(stats.folders[0].path, "src/core");

    assert_eq!(stats.bus_factor.len(), 1);
    assert_eq!(stats.bus_factor[0].path, "src/core/engine.rs");
    assert!(stats.bus_factor[0].size > 0);

    let today: u32 = stats.activity.iter().map(|day| day.commits).sum();
    assert_eq!(today, 8);
}

#[tokio::test]
async fn the_commit_limit_cuts_the_history_and_says_so() {
    let workspace = team_repository().await;
    let stats = collect_stats(&workspace.path, 3, CancelToken::never())
        .await
        .expect("stats");
    assert_eq!(stats.commits, 3);
    assert!(stats.truncated);
    assert!(collect_stats(&workspace.path, 0, CancelToken::never())
        .await
        .is_err());
}

#[tokio::test]
async fn an_empty_repository_has_no_statistics() {
    let workspace = new_repository().await;
    let stats = collect_stats(&workspace.path, 100, CancelToken::never())
        .await
        .expect("stats");
    assert_eq!(stats.commits, 0);
    assert!(stats.contributors.is_empty());
}

#[tokio::test]
async fn a_cancelled_job_stops_the_statistics() {
    let workspace = team_repository().await;
    let registry = Arc::new(JobRegistry::default());
    let guard = registry.register("stats");
    registry.cancel("stats");
    let error = collect_stats(&workspace.path, 100, guard.token())
        .await
        .expect_err("cancelled");
    assert_eq!(error.kind, ErrorKind::Cancelled);
}

#[tokio::test]
async fn pending_notes_are_found_and_their_author_is_looked_up_on_demand() {
    let workspace = team_repository().await;
    write_file(&workspace.path, "src/new.rs", "fn x() {}\n// FIXME later\n");
    git_as(
        &workspace.path,
        "Ana",
        "ana@example.com",
        &["add", "src/new.rs"],
    );

    let report = find_todos(&workspace.path, 100).await.expect("todos");
    assert_eq!(report.items.len(), 2);
    let guide = report
        .items
        .iter()
        .find(|item| item.path == "docs/guide.md")
        .expect("guide");
    assert_eq!((guide.line, guide.kind.as_str()), (2, "TODO"));

    let author = line_author(&workspace.path, "docs/guide.md", 2)
        .await
        .expect("author");
    assert_eq!(author.author, "Beto");
    assert_eq!(author.email, "beto@example.com");
    assert!(author.committed);

    let pending = line_author(&workspace.path, "src/new.rs", 2)
        .await
        .expect("pending");
    assert!(!pending.committed);

    assert!(line_author(&workspace.path, "../outside.rs", 1)
        .await
        .is_err());
}

#[tokio::test]
async fn a_repository_without_notes_returns_an_empty_list() {
    let workspace = new_repository().await;
    commit_as(
        &workspace.path,
        "Ana",
        "ana@example.com",
        "a.txt",
        "clean\n",
        "a",
    );
    let report = find_todos(&workspace.path, 10).await.expect("todos");
    assert!(report.items.is_empty());
}
