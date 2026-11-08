mod common;

use std::path::Path;

use common::{commit_file, git_output, new_repository, write_file};
use githubdesk_lib::commands::multi::{fetch_all, pull_all, statuses, OutcomeState};
use githubdesk_lib::jobs::{CancelToken, JobRegistry};
use std::sync::Arc;
use tempfile::TempDir;

fn text(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

struct Setup {
    _root: TempDir,
    remote: std::path::PathBuf,
    clones: Vec<std::path::PathBuf>,
}

fn clone_of(root: &Path, remote: &Path, name: &str) -> std::path::PathBuf {
    git_output(
        root,
        &["clone", "-q", remote.to_str().expect("remote"), name],
    );
    let path = root.join(name);
    git_output(&path, &["config", "user.name", "T"]);
    git_output(&path, &["config", "user.email", "t@example.com"]);
    path
}

async fn three_clones() -> Setup {
    let seed = new_repository().await;
    commit_file(&seed.path, "a.txt", "one\n", "base").await;
    let root = TempDir::new().expect("root");
    git_output(
        root.path(),
        &[
            "clone",
            "-q",
            "--bare",
            seed.path.to_str().expect("seed"),
            "origin.git",
        ],
    );
    let remote = root.path().join("origin.git");
    let clones = vec![
        clone_of(root.path(), &remote, "one"),
        clone_of(root.path(), &remote, "two"),
        clone_of(root.path(), &remote, "three"),
    ];
    Setup {
        _root: root,
        remote,
        clones,
    }
}

fn push_from(setup: &Setup, name: &str, file: &str) {
    let helper = clone_of(setup._root.path(), &setup.remote, name);
    write_file(&helper, file, "new\n");
    git_output(&helper, &["add", "-A"]);
    git_output(&helper, &["commit", "-q", "-m", "remote work"]);
    git_output(&helper, &["push", "-q", "origin", "HEAD"]);
}

#[tokio::test]
async fn the_state_of_every_repository_is_reported() {
    let setup = three_clones().await;
    write_file(&setup.clones[0], "dirty.txt", "x\n");
    write_file(&setup.clones[1], "b.txt", "two\n");
    git_output(&setup.clones[1], &["add", "-A"]);
    git_output(&setup.clones[1], &["commit", "-q", "-m", "local"]);
    let missing = text(&setup.clones[2].join("nope"));
    let paths = vec![
        text(&setup.clones[0]),
        text(&setup.clones[1]),
        missing.clone(),
    ];

    let rows = statuses(&paths).await.expect("rows");
    assert_eq!(rows.len(), 3);
    assert_eq!(rows[0].changes, 1);
    assert_eq!(rows[0].branch.as_deref(), Some("main"));
    assert_eq!(rows[1].ahead, 1);
    assert!(!rows[2].available);
}

#[tokio::test]
async fn fetching_all_updates_each_repository_and_reports_failures() {
    let setup = three_clones().await;
    push_from(&setup, "helper", "remote.txt");
    let mut paths: Vec<String> = setup.clones.iter().map(|path| text(path)).collect();
    paths.push(text(&setup.clones[0].join("missing")));

    let outcomes = fetch_all(&paths, &CancelToken::never())
        .await
        .expect("fetch");
    assert_eq!(outcomes.len(), 4);
    assert!(outcomes[..3]
        .iter()
        .all(|outcome| outcome.state == OutcomeState::Done));
    assert_eq!(outcomes[3].state, OutcomeState::Failed);
    let rows = statuses(&paths[..3]).await.expect("rows");
    assert!(rows.iter().all(|row| row.behind == 1));
}

#[tokio::test]
async fn pulling_only_fast_forwards_and_says_why_it_skips() {
    let setup = three_clones().await;
    push_from(&setup, "helper", "remote.txt");
    git_output(&setup.clones[0], &["fetch", "-q"]);
    git_output(&setup.clones[1], &["fetch", "-q"]);
    write_file(&setup.clones[1], "local.txt", "x\n");
    git_output(&setup.clones[1], &["add", "-A"]);
    git_output(&setup.clones[1], &["commit", "-q", "-m", "diverge"]);
    git_output(&setup.clones[2], &["fetch", "-q"]);
    git_output(&setup.clones[2], &["remote", "remove", "origin"]);
    let paths: Vec<String> = setup.clones.iter().map(|path| text(path)).collect();

    let outcomes = pull_all(&paths, &CancelToken::never()).await.expect("pull");
    assert_eq!(outcomes[0].state, OutcomeState::Updated);
    assert!(setup.clones[0].join("remote.txt").exists());
    assert_eq!(outcomes[1].state, OutcomeState::Skipped);
    assert_eq!(outcomes[1].detail.as_deref(), Some("diverged"));
    assert!(!setup.clones[1].join("remote.txt").exists());
    assert_eq!(outcomes[2].state, OutcomeState::Skipped);
    assert_eq!(outcomes[2].detail.as_deref(), Some("noUpstream"));

    let again = pull_all(&paths[..1], &CancelToken::never())
        .await
        .expect("again");
    assert_eq!(again[0].state, OutcomeState::UpToDate);
}

#[tokio::test]
async fn a_cancelled_run_skips_what_has_not_started() {
    let setup = three_clones().await;
    let registry = Arc::new(JobRegistry::default());
    let guard = registry.register("multi");
    registry.cancel("multi");
    let paths: Vec<String> = setup.clones.iter().map(|path| text(path)).collect();
    let outcomes = fetch_all(&paths, &guard.token()).await.expect("fetch");
    assert!(outcomes
        .iter()
        .all(|outcome| outcome.state == OutcomeState::Skipped));
}

#[tokio::test]
async fn too_many_repositories_are_refused() {
    let paths: Vec<String> = (0..201).map(|index| format!("repo-{index}")).collect();
    assert!(statuses(&paths).await.is_err());
}
