use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use githubdesk_lib::commands::{branch, commit, history, remote, repo, status};
use githubdesk_lib::error::{ErrorKind, SuggestedAction};
use githubdesk_lib::git::parse::diff::{FileDiff, LineKind};
use githubdesk_lib::git::parse::progress::Progress;
use githubdesk_lib::git::parse::status::ChangeKind;
use githubdesk_lib::git::patch::{LineSelection, PatchDirection};
use githubdesk_lib::jobs::{CancelToken, JobRegistry};
use status::DiffSource;
use tempfile::TempDir;

mod common;

use common::{commit_file, configure_environment, git_output, new_repository, write_file};

fn change_indices(diff: &FileDiff, hunk_index: usize) -> Vec<usize> {
    diff.hunks[hunk_index]
        .lines
        .iter()
        .enumerate()
        .filter(|(_, line)| matches!(line.kind, LineKind::Added | LineKind::Removed))
        .map(|(index, _)| index)
        .collect()
}

fn ignore_progress(_: Progress) {}

fn path_text(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

#[tokio::test]
async fn stages_commits_and_reports_clean_status() {
    let workspace = new_repository().await;
    let repo = workspace.path.as_path();

    write_file(repo, "a.txt", "hello\n");
    let snapshot = status::get_status(repo).await.expect("status");
    assert_eq!(snapshot.branch.head.as_deref(), Some("main"));
    assert!(snapshot.branch.unborn);
    assert_eq!(snapshot.entries.len(), 1);
    assert!(snapshot.entries[0].untracked);

    status::stage_paths(repo, &["a.txt".to_string()])
        .await
        .expect("stage");
    let snapshot = status::get_status(repo).await.expect("status");
    assert_eq!(snapshot.entries[0].index, ChangeKind::Added);

    commit::create_commit(repo, "Add a", "details", false)
        .await
        .expect("commit");
    let head = commit::head_commit(repo)
        .await
        .expect("head")
        .expect("some");
    assert_eq!(head.title, "Add a");
    assert_eq!(head.description, "details");
    assert!(!head.pushed);

    let snapshot = status::get_status(repo).await.expect("status");
    assert!(snapshot.entries.is_empty());
    assert!(!snapshot.branch.unborn);
}

#[tokio::test]
async fn handles_spaces_and_unicode_in_paths() {
    let workspace = new_repository().await;
    let repo = workspace.path.as_path();
    let relative = "carpeta con espacio/archivo \u{f1}.txt";

    write_file(repo, relative, "contenido\n");
    status::stage_paths(repo, &[relative.to_string()])
        .await
        .expect("stage");
    let snapshot = status::get_status(repo).await.expect("status");
    assert_eq!(snapshot.entries[0].path, relative);
    assert_eq!(snapshot.entries[0].index, ChangeKind::Added);

    status::unstage_paths(repo, &[relative.to_string()])
        .await
        .expect("unstage in unborn repository");
    let snapshot = status::get_status(repo).await.expect("status");
    assert!(snapshot.entries[0].untracked);
}

#[tokio::test]
async fn rejects_paths_outside_the_repository() {
    let workspace = new_repository().await;
    let repo = workspace.path.as_path();

    let error = status::stage_paths(repo, &["../escape.txt".to_string()])
        .await
        .expect_err("must reject");
    assert_eq!(error.kind, ErrorKind::InvalidInput);

    let error = status::discard_changes(repo, &[], &["..\\escape.txt".to_string()])
        .await
        .expect_err("must reject");
    assert_eq!(error.kind, ErrorKind::InvalidInput);
}

#[tokio::test]
async fn stages_and_unstages_whole_hunks() {
    let workspace = new_repository().await;
    let repo = workspace.path.as_path();
    let base: String = (1..=30).map(|number| format!("line {number}\n")).collect();
    commit_file(repo, "f.txt", &base, "init").await;

    let modified = base
        .replace("line 2\n", "line two\n")
        .replace("line 28\n", "line twenty-eight\n");
    write_file(repo, "f.txt", &modified);

    let diff = status::get_file_diff(repo, "f.txt", None, DiffSource::Unstaged, false)
        .await
        .expect("diff");
    assert_eq!(diff.hunks.len(), 2);
    assert!(diff.partial_staging_allowed);

    let selection = vec![LineSelection {
        hunk_index: 0,
        line_indices: change_indices(&diff, 0),
    }];
    status::apply_selection(repo, &diff, &selection, PatchDirection::Stage)
        .await
        .expect("stage hunk");

    let staged = status::get_file_diff(repo, "f.txt", None, DiffSource::Staged, false)
        .await
        .expect("staged diff");
    assert_eq!(staged.hunks.len(), 1);
    assert!(staged.hunks[0]
        .lines
        .iter()
        .any(|line| line.kind == LineKind::Added && line.content == "line two"));

    let unstaged = status::get_file_diff(repo, "f.txt", None, DiffSource::Unstaged, false)
        .await
        .expect("unstaged diff");
    assert_eq!(unstaged.hunks.len(), 1);
    assert!(unstaged.hunks[0]
        .lines
        .iter()
        .any(|line| line.content == "line twenty-eight"));

    let unstage_selection = vec![LineSelection {
        hunk_index: 0,
        line_indices: change_indices(&staged, 0),
    }];
    status::apply_selection(repo, &staged, &unstage_selection, PatchDirection::Unstage)
        .await
        .expect("unstage hunk");
    let staged_after = status::get_file_diff(repo, "f.txt", None, DiffSource::Staged, false)
        .await
        .expect("staged diff");
    assert!(staged_after.hunks.is_empty());
}

#[tokio::test]
async fn stages_a_single_added_line() {
    let workspace = new_repository().await;
    let repo = workspace.path.as_path();
    commit_file(repo, "g.txt", "a\nb\nc\nd\ne\n", "init").await;
    write_file(repo, "g.txt", "a\nB\nc\nd\ne\nf\n");

    let diff = status::get_file_diff(repo, "g.txt", None, DiffSource::Unstaged, false)
        .await
        .expect("diff");
    let added_index = diff.hunks[0]
        .lines
        .iter()
        .position(|line| line.kind == LineKind::Added && line.content == "f")
        .expect("added line f");

    let selection = vec![LineSelection {
        hunk_index: 0,
        line_indices: vec![added_index],
    }];
    status::apply_selection(repo, &diff, &selection, PatchDirection::Stage)
        .await
        .expect("stage line");

    assert_eq!(git_output(repo, &["show", ":g.txt"]), "a\nb\nc\nd\ne\nf\n");
    assert_eq!(
        std::fs::read_to_string(repo.join("g.txt")).expect("worktree"),
        "a\nB\nc\nd\ne\nf\n"
    );

    let staged = status::get_file_diff(repo, "g.txt", None, DiffSource::Staged, false)
        .await
        .expect("staged diff");
    let unstage_selection = vec![LineSelection {
        hunk_index: 0,
        line_indices: change_indices(&staged, 0),
    }];
    status::apply_selection(repo, &staged, &unstage_selection, PatchDirection::Unstage)
        .await
        .expect("unstage line");
    assert_eq!(git_output(repo, &["show", ":g.txt"]), "a\nb\nc\nd\ne\n");
}

#[tokio::test]
async fn stale_selection_is_rejected_without_touching_the_index() {
    let workspace = new_repository().await;
    let repo = workspace.path.as_path();
    commit_file(repo, "s.txt", "one\ntwo\nthree\n", "init").await;
    write_file(repo, "s.txt", "one\nTWO\nthree\n");

    let diff = status::get_file_diff(repo, "s.txt", None, DiffSource::Unstaged, false)
        .await
        .expect("diff");
    write_file(repo, "s.txt", "uno\ndos\ntres\n");
    status::stage_paths(repo, &["s.txt".to_string()])
        .await
        .expect("stage whole file");

    let selection = vec![LineSelection {
        hunk_index: 0,
        line_indices: change_indices(&diff, 0),
    }];
    let error = status::apply_selection(repo, &diff, &selection, PatchDirection::Stage)
        .await
        .expect_err("stale patch");
    assert_eq!(error.kind, ErrorKind::PatchRejected);
    assert_eq!(git_output(repo, &["show", ":s.txt"]), "uno\ndos\ntres\n");
}

#[tokio::test]
async fn diffs_untracked_files_from_disk() {
    let workspace = new_repository().await;
    let repo = workspace.path.as_path();
    write_file(repo, "new.txt", "x\ny\n");

    let diff = status::get_file_diff(repo, "new.txt", None, DiffSource::Raw, false)
        .await
        .expect("diff");
    assert_eq!(diff.hunks.len(), 1);
    assert_eq!(diff.hunks[0].lines.len(), 2);
    assert!(!diff.partial_staging_allowed);
}

#[tokio::test]
async fn discards_tracked_and_untracked_changes() {
    let workspace = new_repository().await;
    let repo = workspace.path.as_path();
    commit_file(repo, "keep.txt", "original\n", "init").await;

    write_file(repo, "keep.txt", "changed\n");
    write_file(repo, "temp/scratch.txt", "scratch\n");
    status::discard_changes(
        repo,
        &["keep.txt".to_string()],
        &["temp/scratch.txt".to_string()],
    )
    .await
    .expect("discard");

    assert_eq!(
        std::fs::read_to_string(repo.join("keep.txt")).expect("read"),
        "original\n"
    );
    assert!(!repo.join("temp/scratch.txt").exists());
    assert!(status::get_status(repo)
        .await
        .expect("status")
        .entries
        .is_empty());
}

#[tokio::test]
async fn amends_and_undoes_the_last_commit() {
    let workspace = new_repository().await;
    let repo = workspace.path.as_path();
    commit_file(repo, "a.txt", "1\n", "first").await;
    commit_file(repo, "b.txt", "2\n", "second").await;

    commit::create_commit(repo, "second amended", "body", true)
        .await
        .expect("amend");
    let head = commit::head_commit(repo)
        .await
        .expect("head")
        .expect("some");
    assert_eq!(head.title, "second amended");
    assert_eq!(head.description, "body");

    let undone = commit::undo_last_commit(repo).await.expect("undo");
    assert_eq!(undone.title, "second amended");
    let snapshot = status::get_status(repo).await.expect("status");
    assert_eq!(snapshot.entries.len(), 1);
    assert_eq!(snapshot.entries[0].path, "b.txt");
    assert_eq!(snapshot.entries[0].index, ChangeKind::Added);

    let head = commit::head_commit(repo)
        .await
        .expect("head")
        .expect("some");
    assert_eq!(head.title, "first");

    commit::undo_last_commit(repo).await.expect("undo root");
    assert!(commit::head_commit(repo).await.expect("head").is_none());
    let snapshot = status::get_status(repo).await.expect("status");
    assert_eq!(snapshot.entries.len(), 2);
}

#[tokio::test]
async fn rejects_empty_commit_message_and_nothing_to_commit() {
    let workspace = new_repository().await;
    let repo = workspace.path.as_path();
    commit_file(repo, "a.txt", "1\n", "first").await;

    let error = commit::create_commit(repo, "   ", "", false)
        .await
        .expect_err("empty title");
    assert_eq!(error.kind, ErrorKind::EmptyCommitMessage);

    let error = commit::create_commit(repo, "nothing", "", false)
        .await
        .expect_err("nothing staged");
    assert_eq!(error.kind, ErrorKind::NothingToCommit);
}

#[tokio::test]
async fn manages_branches() {
    let workspace = new_repository().await;
    let repo = workspace.path.as_path();
    commit_file(repo, "a.txt", "1\n", "first").await;

    branch::create_branch(repo, "feature/login", None, true)
        .await
        .expect("create");
    let branches = branch::list_branches(repo).await.expect("list");
    assert_eq!(branches[0].name, "feature/login");
    assert!(branches[0].is_current);
    assert_eq!(branches.len(), 2);

    branch::switch_branch(repo, "main", false)
        .await
        .expect("switch");
    branch::rename_branch(repo, "feature/login", "feature/signin")
        .await
        .expect("rename");
    let names: Vec<String> = branch::list_branches(repo)
        .await
        .expect("list")
        .into_iter()
        .map(|item| item.name)
        .collect();
    assert!(names.contains(&"feature/signin".to_string()));
    assert!(!names.contains(&"feature/login".to_string()));

    branch::delete_branch(repo, "feature/signin", false)
        .await
        .expect("delete merged branch");

    branch::create_branch(repo, "topic", None, true)
        .await
        .expect("create");
    commit_file(repo, "topic.txt", "t\n", "topic work").await;
    branch::switch_branch(repo, "main", false)
        .await
        .expect("switch");

    let error = branch::delete_branch(repo, "topic", false)
        .await
        .expect_err("unmerged");
    assert_eq!(error.kind, ErrorKind::BranchNotFullyMerged);
    assert_eq!(error.suggested_action, Some(SuggestedAction::ForceDelete));
    branch::delete_branch(repo, "topic", true)
        .await
        .expect("force delete");

    let error = branch::create_branch(repo, "bad name", None, false)
        .await
        .expect_err("invalid name");
    assert_eq!(error.kind, ErrorKind::InvalidName);
    let error = branch::create_branch(repo, "main", None, false)
        .await
        .expect_err("duplicate");
    assert_eq!(error.kind, ErrorKind::BranchAlreadyExists);
}

#[tokio::test]
async fn reads_paginated_history_and_commit_files() {
    let workspace = new_repository().await;
    let repo = workspace.path.as_path();
    for number in 1..=5 {
        commit_file(
            repo,
            &format!("file-{number}.txt"),
            &format!("{number}\n"),
            &format!("commit {number}"),
        )
        .await;
    }

    let first_page = history::history_page(repo, None, 0, 2).await.expect("page");
    let second_page = history::history_page(repo, None, 2, 2).await.expect("page");
    assert_eq!(first_page[0].subject, "commit 5");
    assert_eq!(first_page[1].subject, "commit 4");
    assert_eq!(second_page[0].subject, "commit 3");
    assert!(first_page[0].refs.iter().any(|label| label.name == "main"));
    assert_eq!(first_page[0].parents.len(), 1);

    let all = history::history_page(repo, None, 0, 100)
        .await
        .expect("page");
    assert_eq!(all.len(), 5);
    let root = all.last().expect("root commit");
    assert!(root.parents.is_empty());

    let files = history::commit_files(repo, &first_page[0].hash)
        .await
        .expect("files");
    assert_eq!(files.len(), 1);
    assert_eq!(files[0].path, "file-5.txt");
    assert_eq!(files[0].status, ChangeKind::Added);

    let root_files = history::commit_files(repo, &root.hash)
        .await
        .expect("files");
    assert_eq!(root_files[0].path, "file-1.txt");

    let diff = history::commit_file_diff(repo, &first_page[0].hash, "file-5.txt", None, false)
        .await
        .expect("diff");
    assert_eq!(diff.hunks[0].lines[0].content, "5");

    let detail = history::commit_detail(repo, &first_page[0].hash)
        .await
        .expect("detail")
        .expect("some");
    assert_eq!(detail.summary.subject, "commit 5");
    assert_eq!(detail.committer_name, "Test User");
}

#[tokio::test]
async fn history_of_empty_repository_is_empty() {
    let workspace = new_repository().await;
    let page = history::history_page(workspace.path.as_path(), None, 0, 50)
        .await
        .expect("page");
    assert!(page.is_empty());
}

#[tokio::test]
async fn syncs_through_a_remote_with_progress() {
    configure_environment();
    let root = TempDir::new().expect("temp dir");
    let remote_path = root.path().join("remote.git");
    std::fs::create_dir_all(&remote_path).expect("remote dir");
    git_output(&remote_path, &["init", "--bare", "-b", "main"]);
    let remote_url = path_text(&remote_path);

    let first = repo::init_repository(root.path(), "first", "main")
        .await
        .expect("init");
    let first_path = PathBuf::from(&first.path);

    let error = remote::fetch_all(&first_path, CancelToken::never(), &ignore_progress)
        .await
        .expect_err("no remote");
    assert_eq!(error.kind, ErrorKind::NoRemote);

    commit_file(&first_path, "a.txt", "1\n", "first").await;
    git_output(&first_path, &["remote", "add", "origin", &remote_url]);
    assert_eq!(
        remote::list_remotes(&first_path)
            .await
            .expect("remotes")
            .len(),
        1
    );

    let error = remote::push_current(&first_path, CancelToken::never(), &ignore_progress)
        .await
        .expect_err("no upstream");
    assert_eq!(error.kind, ErrorKind::NoUpstream);
    assert_eq!(error.suggested_action, Some(SuggestedAction::PublishBranch));

    branch::publish_branch(&first_path, "main", CancelToken::never(), &ignore_progress)
        .await
        .expect("publish");
    let snapshot = status::get_status(&first_path).await.expect("status");
    assert_eq!(snapshot.branch.upstream.as_deref(), Some("origin/main"));
    assert_eq!((snapshot.branch.ahead, snapshot.branch.behind), (0, 0));

    let events = Arc::new(Mutex::new(Vec::<Progress>::new()));
    let sink = Arc::clone(&events);
    let second_destination = root.path().join("second");
    let second = repo::clone_repository(
        &remote_url,
        &second_destination,
        CancelToken::never(),
        &move |progress| sink.lock().expect("lock").push(progress),
    )
    .await
    .expect("clone");
    let second_path = PathBuf::from(&second.path);
    assert!(second_path.join("a.txt").exists());

    commit_file(&second_path, "b.txt", "2\n", "second").await;
    remote::push_current(&second_path, CancelToken::never(), &ignore_progress)
        .await
        .expect("push from clone");

    remote::fetch_all(&first_path, CancelToken::never(), &ignore_progress)
        .await
        .expect("fetch");
    let snapshot = status::get_status(&first_path).await.expect("status");
    assert_eq!((snapshot.branch.ahead, snapshot.branch.behind), (0, 1));

    commit_file(&first_path, "c.txt", "3\n", "local only").await;
    let error = remote::push_current(&first_path, CancelToken::never(), &ignore_progress)
        .await
        .expect_err("rejected");
    assert_eq!(error.kind, ErrorKind::RemoteAhead);
    assert_eq!(error.suggested_action, Some(SuggestedAction::Pull));

    remote::pull_current(&first_path, CancelToken::never(), &ignore_progress)
        .await
        .expect("pull with merge");
    let snapshot = status::get_status(&first_path).await.expect("status");
    assert_eq!(snapshot.branch.behind, 0);
    assert_eq!(snapshot.branch.ahead, 2);
    assert!(first_path.join("b.txt").exists());

    remote::push_current(&first_path, CancelToken::never(), &ignore_progress)
        .await
        .expect("push merged work");
    let head = commit::head_commit(&first_path)
        .await
        .expect("head")
        .expect("some");
    assert!(head.pushed);
}

#[tokio::test]
async fn reports_conflicts_and_aborts_the_merge() {
    configure_environment();
    let root = TempDir::new().expect("temp dir");
    let remote_path = root.path().join("remote.git");
    std::fs::create_dir_all(&remote_path).expect("remote dir");
    git_output(&remote_path, &["init", "--bare", "-b", "main"]);
    let remote_url = path_text(&remote_path);

    let first = repo::init_repository(root.path(), "first", "main")
        .await
        .expect("init");
    let first_path = PathBuf::from(&first.path);
    commit_file(&first_path, "shared.txt", "base\n", "base").await;
    git_output(&first_path, &["remote", "add", "origin", &remote_url]);
    branch::publish_branch(&first_path, "main", CancelToken::never(), &ignore_progress)
        .await
        .expect("publish");

    let second_destination = root.path().join("second");
    let second = repo::clone_repository(
        &remote_url,
        &second_destination,
        CancelToken::never(),
        &ignore_progress,
    )
    .await
    .expect("clone");
    let second_path = PathBuf::from(&second.path);

    commit_file(&second_path, "shared.txt", "from second\n", "second edit").await;
    remote::push_current(&second_path, CancelToken::never(), &ignore_progress)
        .await
        .expect("push");

    commit_file(&first_path, "shared.txt", "from first\n", "first edit").await;
    let error = remote::pull_current(&first_path, CancelToken::never(), &ignore_progress)
        .await
        .expect_err("conflict");
    assert_eq!(error.kind, ErrorKind::MergeConflict);
    assert_eq!(error.suggested_action, Some(SuggestedAction::ShowChanges));

    let snapshot = status::get_status(&first_path).await.expect("status");
    assert!(snapshot.entries.iter().any(|entry| entry.conflicted));

    let raw = status::get_file_diff(&first_path, "shared.txt", None, DiffSource::Raw, false)
        .await
        .expect("raw diff");
    assert!(raw.hunks[0]
        .lines
        .iter()
        .any(|line| line.content.starts_with("<<<<<<<")));

    remote::abort_merge(&first_path).await.expect("abort");
    let snapshot = status::get_status(&first_path).await.expect("status");
    assert!(snapshot.entries.is_empty());
}

#[tokio::test]
async fn cancelled_clone_leaves_no_partial_directory() {
    configure_environment();
    let root = TempDir::new().expect("temp dir");
    let source = repo::init_repository(root.path(), "source", "main")
        .await
        .expect("init");
    let source_path = PathBuf::from(&source.path);
    commit_file(&source_path, "a.txt", "1\n", "first").await;

    let registry = Arc::new(JobRegistry::default());
    let guard = registry.register("clone-job");
    assert!(registry.cancel("clone-job"));

    let destination = root.path().join("cloned");
    let error = repo::clone_repository(&source.path, &destination, guard.token(), &ignore_progress)
        .await
        .expect_err("cancelled");
    assert_eq!(error.kind, ErrorKind::Cancelled);
    assert!(!destination.exists());
}

#[tokio::test]
async fn clone_refuses_non_empty_destination_and_option_like_urls() {
    configure_environment();
    let root = TempDir::new().expect("temp dir");
    let destination = root.path().join("occupied");
    write_file(&destination, "keep.txt", "x");

    let error = repo::clone_repository(
        "https://example.invalid/x.git",
        &destination,
        CancelToken::never(),
        &ignore_progress,
    )
    .await
    .expect_err("occupied");
    assert_eq!(error.kind, ErrorKind::DestinationNotEmpty);

    let error = repo::clone_repository(
        "--upload-pack=evil",
        &root.path().join("other"),
        CancelToken::never(),
        &ignore_progress,
    )
    .await
    .expect_err("option url");
    assert_eq!(error.kind, ErrorKind::InvalidInput);
}

#[tokio::test]
async fn open_rejects_plain_folders() {
    configure_environment();
    let root = TempDir::new().expect("temp dir");
    let error = repo::open_repository(root.path())
        .await
        .expect_err("not a repository");
    assert_eq!(error.kind, ErrorKind::NotARepository);
}
