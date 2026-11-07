mod common;

use common::{commit_file, new_repository, write_file};
use githubdesk_lib::commands::{history, status};
use status::DiffSource;

#[tokio::test]
async fn ignoring_whitespace_hides_indentation_only_changes() {
    let workspace = new_repository().await;
    let repo = workspace.path.as_path();
    commit_file(repo, "f.txt", "alpha\nbeta\ngamma\n", "Add f").await;

    write_file(repo, "f.txt", "alpha\n    beta\ngamma\nextra\n");

    let normal = status::get_file_diff(repo, "f.txt", None, DiffSource::Unstaged, false)
        .await
        .expect("diff");
    let normal_changes = normal.hunks[0]
        .lines
        .iter()
        .filter(|line| line.kind != githubdesk_lib::git::parse::diff::LineKind::Context)
        .count();
    assert_eq!(normal_changes, 3);
    assert!(normal.partial_staging_allowed);

    let ignored = status::get_file_diff(repo, "f.txt", None, DiffSource::Unstaged, true)
        .await
        .expect("diff");
    let ignored_changes = ignored.hunks[0]
        .lines
        .iter()
        .filter(|line| line.kind != githubdesk_lib::git::parse::diff::LineKind::Context)
        .count();
    assert_eq!(ignored_changes, 1);
    assert!(!ignored.partial_staging_allowed);
}

#[tokio::test]
async fn commit_diff_can_ignore_whitespace() {
    let workspace = new_repository().await;
    let repo = workspace.path.as_path();
    commit_file(repo, "f.txt", "alpha\nbeta\n", "Add f").await;
    let hash = commit_file(repo, "f.txt", "alpha\n  beta\n", "Indent beta").await;

    let normal = history::commit_file_diff(repo, &hash, "f.txt", None, false)
        .await
        .expect("diff");
    assert!(!normal.hunks.is_empty());

    let ignored = history::commit_file_diff(repo, &hash, "f.txt", None, true)
        .await
        .expect("diff");
    assert!(ignored.hunks.is_empty());
}
