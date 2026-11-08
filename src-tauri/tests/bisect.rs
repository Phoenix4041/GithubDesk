mod common;

use std::path::Path;

use common::{commit_file, git_output, new_repository, write_file, Workspace};
use githubdesk_lib::commands::bisect::{
    bisect_state, finish_bisect, mark_bisect, start_bisect, BisectState, BisectVerdict,
};
use githubdesk_lib::error::ErrorKind;

const TOTAL: usize = 16;
const CULPRIT: usize = 9;

async fn history_with_culprit() -> (Workspace, Vec<String>) {
    let workspace = new_repository().await;
    let mut hashes = Vec::new();
    for index in 0..TOTAL {
        let content = if index >= CULPRIT {
            format!("bad {index}\n")
        } else {
            format!("ok {index}\n")
        };
        let hash = commit_file(
            &workspace.path,
            "value.txt",
            &content,
            &format!("commit {index}"),
        )
        .await;
        hashes.push(hash);
    }
    (workspace, hashes)
}

fn verdict_for_checkout(repo: &Path) -> BisectVerdict {
    let content = std::fs::read_to_string(repo.join("value.txt")).expect("value");
    if content.starts_with("bad") {
        BisectVerdict::Bad
    } else {
        BisectVerdict::Good
    }
}

async fn run_until_found(repo: &Path, mut state: BisectState) -> (BisectState, usize) {
    let mut rounds = 0;
    while state.culprit.is_none() {
        rounds += 1;
        assert!(rounds < 12, "bisect did not converge: {state:?}");
        state = mark_bisect(repo, verdict_for_checkout(repo), None)
            .await
            .expect("mark");
    }
    (state, rounds)
}

#[tokio::test]
async fn finds_the_first_bad_commit_in_few_steps_and_returns_to_the_branch() {
    let (workspace, hashes) = history_with_culprit().await;
    let repo = &workspace.path;

    let started = start_bisect(repo, &hashes[TOTAL - 1], &hashes[0])
        .await
        .expect("start");
    assert!(started.active);
    assert_eq!(started.start_ref.as_deref(), Some("main"));
    assert!(started.remaining.is_some());
    assert!(started.estimated_steps.is_some());
    assert_eq!(started.steps.len(), 2);
    assert_ne!(
        started.current_hash.as_deref(),
        Some(hashes[TOTAL - 1].as_str())
    );

    let (done, rounds) = run_until_found(repo, started).await;
    let culprit = done.culprit.expect("culprit");
    assert_eq!(culprit.hash, hashes[CULPRIT]);
    assert_eq!(culprit.title, format!("commit {CULPRIT}"));
    assert!(rounds <= 5, "took {rounds} rounds");
    assert_eq!(done.remaining, None);

    finish_bisect(repo).await.expect("finish");
    assert!(!bisect_state(repo).await.expect("state").active);
    assert_eq!(
        git_output(repo, &["rev-parse", "--abbrev-ref", "HEAD"]).trim(),
        "main"
    );
    assert_eq!(
        git_output(repo, &["rev-parse", "HEAD"]).trim(),
        hashes[TOTAL - 1]
    );
}

#[tokio::test]
async fn the_remaining_work_shrinks_after_each_mark() {
    let (workspace, hashes) = history_with_culprit().await;
    let repo = &workspace.path;
    let started = start_bisect(repo, &hashes[TOTAL - 1], &hashes[0])
        .await
        .expect("start");
    let before = started.remaining.expect("remaining");

    let next = mark_bisect(repo, verdict_for_checkout(repo), None)
        .await
        .expect("mark");

    assert!(next.remaining.expect("remaining") < before);
    assert!(next.steps.len() > started.steps.len());
}

#[tokio::test]
async fn starting_needs_a_clean_tree_and_no_other_bisect() {
    let (workspace, hashes) = history_with_culprit().await;
    let repo = &workspace.path;
    write_file(repo, "value.txt", "edited by hand\n");

    let dirty = start_bisect(repo, &hashes[TOTAL - 1], &hashes[0])
        .await
        .expect_err("dirty");
    assert_eq!(dirty.kind, ErrorKind::LocalChangesWouldBeOverwritten);

    git_output(repo, &["checkout", "--", "value.txt"]);
    start_bisect(repo, &hashes[TOTAL - 1], &hashes[0])
        .await
        .expect("start");
    let twice = start_bisect(repo, &hashes[TOTAL - 1], &hashes[0])
        .await
        .expect_err("twice");
    assert_eq!(twice.kind, ErrorKind::OperationInProgress);
}

#[tokio::test]
async fn the_range_must_make_sense() {
    let (workspace, hashes) = history_with_culprit().await;
    let repo = &workspace.path;

    let same = start_bisect(repo, &hashes[3], &hashes[3])
        .await
        .expect_err("same");
    assert_eq!(same.kind, ErrorKind::InvalidInput);

    let reversed = start_bisect(repo, &hashes[0], &hashes[5])
        .await
        .expect_err("reversed");
    assert_eq!(reversed.kind, ErrorKind::InvalidInput);

    let unknown = start_bisect(repo, "HEAD", "no-such-commit")
        .await
        .expect_err("unknown");
    assert_eq!(unknown.kind, ErrorKind::InvalidInput);

    let flag = start_bisect(repo, "HEAD", "--all").await.expect_err("flag");
    assert_eq!(flag.kind, ErrorKind::InvalidInput);
}

#[tokio::test]
async fn skipping_moves_to_another_commit_and_a_chosen_revision_can_be_marked() {
    let (workspace, hashes) = history_with_culprit().await;
    let repo = &workspace.path;
    let started = start_bisect(repo, &hashes[TOTAL - 1], &hashes[0])
        .await
        .expect("start");
    let first = started.current_hash.clone().expect("current");

    let skipped = mark_bisect(repo, BisectVerdict::Skip, None)
        .await
        .expect("skip");
    assert!(skipped.active);
    assert_ne!(skipped.current_hash.as_deref(), Some(first.as_str()));

    let chosen = &hashes[12];
    let marked = mark_bisect(repo, BisectVerdict::Bad, Some(chosen))
        .await
        .expect("mark revision");
    let last_bad = marked
        .steps
        .iter()
        .rev()
        .find(|step| step.verdict == BisectVerdict::Bad)
        .expect("bad step");
    assert_eq!(&last_bad.hash, chosen);
}

#[tokio::test]
async fn without_a_bisect_there_is_nothing_to_mark_or_finish() {
    let (workspace, _hashes) = history_with_culprit().await;
    let repo = &workspace.path;

    let state = bisect_state(repo).await.expect("state");
    assert!(!state.active);
    assert!(state.steps.is_empty());

    let mark = mark_bisect(repo, BisectVerdict::Good, None)
        .await
        .expect_err("mark");
    assert_eq!(mark.kind, ErrorKind::NoOperationInProgress);
    let finish = finish_bisect(repo).await.expect_err("finish");
    assert_eq!(finish.kind, ErrorKind::NoOperationInProgress);
}

#[tokio::test]
async fn adjacent_commits_name_the_culprit_right_away() {
    let (workspace, hashes) = history_with_culprit().await;
    let repo = &workspace.path;

    let state = start_bisect(repo, &hashes[CULPRIT], &hashes[CULPRIT - 1])
        .await
        .expect("start");

    assert_eq!(state.culprit.expect("culprit").hash, hashes[CULPRIT]);
}
