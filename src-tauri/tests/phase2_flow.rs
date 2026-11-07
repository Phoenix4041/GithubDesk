mod common;

use std::path::Path;

use common::{commit_file, git_as, git_output, git_try, new_repository, write_file, Workspace};
use githubdesk_lib::commands::commit_ops::{self, ResetMode};
use githubdesk_lib::commands::operation::{self, OperationAction};
use githubdesk_lib::commands::{history, remote, stash, status, tag};
use githubdesk_lib::error::ErrorKind;
use githubdesk_lib::git::history_query::{ContentMode, HistoryQuery, HistoryScope};
use githubdesk_lib::git::parse::diff::LineKind;
use githubdesk_lib::git::parse::log::CommitSummary;
use githubdesk_lib::git::parse::status::ChangeKind;
use githubdesk_lib::git::repo_state::OperationKind;
use githubdesk_lib::jobs::CancelToken;
use status::DiffSource;

async fn diverged_repository() -> Workspace {
    let workspace = new_repository().await;
    let repo = workspace.path.as_path();
    commit_file(repo, "f.txt", "base\n", "base").await;
    git_output(repo, &["checkout", "-b", "feature"]);
    commit_file(repo, "f.txt", "feature\n", "feature edit").await;
    git_output(repo, &["checkout", "main"]);
    commit_file(repo, "f.txt", "main\n", "main edit").await;
    workspace
}

async fn resolve(repo: &Path, content: &str) {
    write_file(repo, "f.txt", content);
    status::stage_paths(repo, &["f.txt".to_string()])
        .await
        .expect("stage resolution");
}

async fn current_kind(repo: &Path) -> Option<OperationKind> {
    operation::current_operation(repo)
        .await
        .expect("state")
        .map(|operation| operation.kind)
}

fn last_subject(repo: &Path) -> String {
    git_output(repo, &["log", "-1", "--format=%s"])
        .trim()
        .to_string()
}

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
        .filter(|line| line.kind != LineKind::Context)
        .count();
    assert_eq!(normal_changes, 3);
    assert!(normal.partial_staging_allowed);

    let ignored = status::get_file_diff(repo, "f.txt", None, DiffSource::Unstaged, true)
        .await
        .expect("diff");
    let ignored_changes = ignored.hunks[0]
        .lines
        .iter()
        .filter(|line| line.kind != LineKind::Context)
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

#[tokio::test]
async fn merge_conflict_can_be_aborted() {
    let workspace = diverged_repository().await;
    let repo = workspace.path.as_path();
    assert_eq!(current_kind(repo).await, None);

    let (merged, _) = git_try(repo, &["merge", "feature"]);
    assert!(!merged);
    assert_eq!(current_kind(repo).await, Some(OperationKind::Merge));

    operation::run_operation_action(repo, OperationAction::Abort)
        .await
        .expect("abort");
    assert_eq!(current_kind(repo).await, None);
    assert!(status::get_status(repo)
        .await
        .expect("status")
        .entries
        .is_empty());
}

#[tokio::test]
async fn merge_continue_requires_resolution_and_creates_the_merge_commit() {
    let workspace = diverged_repository().await;
    let repo = workspace.path.as_path();
    git_try(repo, &["merge", "feature"]);

    let error = operation::run_operation_action(repo, OperationAction::Continue)
        .await
        .expect_err("unresolved");
    assert_eq!(error.kind, ErrorKind::UnmergedFiles);

    let skip = operation::run_operation_action(repo, OperationAction::Skip)
        .await
        .expect_err("merge cannot be skipped");
    assert_eq!(skip.kind, ErrorKind::InvalidInput);

    resolve(repo, "resolved\n").await;
    operation::run_operation_action(repo, OperationAction::Continue)
        .await
        .expect("continue");
    assert_eq!(current_kind(repo).await, None);
    let parents = git_output(repo, &["log", "-1", "--format=%P"]);
    assert_eq!(parents.split_whitespace().count(), 2);
}

#[tokio::test]
async fn cherry_pick_conflict_can_continue_skip_and_abort() {
    let workspace = diverged_repository().await;
    let repo = workspace.path.as_path();
    let feature = git_output(repo, &["rev-parse", "feature"])
        .trim()
        .to_string();

    let (picked, _) = git_try(repo, &["cherry-pick", &feature]);
    assert!(!picked);
    assert_eq!(current_kind(repo).await, Some(OperationKind::CherryPick));
    operation::run_operation_action(repo, OperationAction::Abort)
        .await
        .expect("abort");
    assert_eq!(current_kind(repo).await, None);

    git_try(repo, &["cherry-pick", &feature]);
    resolve(repo, "resolved\n").await;
    operation::run_operation_action(repo, OperationAction::Continue)
        .await
        .expect("continue");
    assert_eq!(current_kind(repo).await, None);
    assert_eq!(last_subject(repo), "feature edit");

    git_output(repo, &["reset", "--hard", "HEAD~1"]);
    git_try(repo, &["cherry-pick", &feature]);
    operation::run_operation_action(repo, OperationAction::Skip)
        .await
        .expect("skip");
    assert_eq!(current_kind(repo).await, None);
    assert_eq!(last_subject(repo), "main edit");
}

#[tokio::test]
async fn revert_conflict_is_detected_and_aborted() {
    let workspace = new_repository().await;
    let repo = workspace.path.as_path();
    commit_file(repo, "f.txt", "one\n", "one").await;
    commit_file(repo, "f.txt", "two\n", "two").await;
    commit_file(repo, "f.txt", "three\n", "three").await;

    let (reverted, _) = git_try(repo, &["revert", "--no-edit", "HEAD~1"]);
    assert!(!reverted);
    assert_eq!(current_kind(repo).await, Some(OperationKind::Revert));

    operation::run_operation_action(repo, OperationAction::Abort)
        .await
        .expect("abort");
    assert_eq!(current_kind(repo).await, None);
    assert_eq!(last_subject(repo), "three");
}

#[tokio::test]
async fn rebase_conflict_reports_progress_and_continues() {
    let workspace = diverged_repository().await;
    let repo = workspace.path.as_path();
    git_output(repo, &["checkout", "feature"]);

    let (rebased, _) = git_try(repo, &["rebase", "main"]);
    assert!(!rebased);
    let info = operation::current_operation(repo)
        .await
        .expect("state")
        .expect("rebase in progress");
    assert_eq!(info.kind, OperationKind::Rebase);
    assert_eq!(info.step, Some(1));
    assert_eq!(info.total, Some(1));
    assert_eq!(info.branch.as_deref(), Some("feature"));

    let error = operation::run_operation_action(repo, OperationAction::Continue)
        .await
        .expect_err("unresolved");
    assert!(
        matches!(
            error.kind,
            ErrorKind::UnmergedFiles | ErrorKind::UnstagedChanges
        ),
        "{error:?}"
    );

    resolve(repo, "resolved\n").await;
    operation::run_operation_action(repo, OperationAction::Continue)
        .await
        .expect("continue");
    assert_eq!(current_kind(repo).await, None);
    assert_eq!(last_subject(repo), "feature edit");
    assert_eq!(
        git_output(repo, &["rev-parse", "--abbrev-ref", "HEAD"]).trim(),
        "feature"
    );
}

#[tokio::test]
async fn rebase_conflict_can_be_aborted() {
    let workspace = diverged_repository().await;
    let repo = workspace.path.as_path();
    git_output(repo, &["checkout", "feature"]);
    let before = git_output(repo, &["rev-parse", "HEAD"]);
    git_try(repo, &["rebase", "main"]);

    operation::run_operation_action(repo, OperationAction::Abort)
        .await
        .expect("abort");
    assert_eq!(current_kind(repo).await, None);
    assert_eq!(git_output(repo, &["rev-parse", "HEAD"]), before);
}

#[tokio::test]
async fn actions_fail_clearly_without_an_operation() {
    let workspace = new_repository().await;
    let repo = workspace.path.as_path();
    commit_file(repo, "f.txt", "one\n", "one").await;
    let error = operation::run_operation_action(repo, OperationAction::Continue)
        .await
        .expect_err("nothing to continue");
    assert_eq!(error.kind, ErrorKind::NoOperationInProgress);
}

#[tokio::test]
async fn tags_can_be_created_listed_and_deleted() {
    let workspace = new_repository().await;
    let repo = workspace.path.as_path();
    let first = commit_file(repo, "f.txt", "one\n", "one").await;
    commit_file(repo, "f.txt", "two\n", "two").await;

    tag::create_tag(repo, "light", None, None)
        .await
        .expect("lightweight tag");
    tag::create_tag(repo, "v1.0", Some(&first), Some("First release"))
        .await
        .expect("annotated tag");

    let tags = tag::list_tags(repo).await.expect("list");
    assert_eq!(tags.len(), 2);
    let annotated = tags.iter().find(|tag| tag.name == "v1.0").expect("v1.0");
    assert!(annotated.annotated);
    assert_eq!(annotated.target_hash, first);
    assert_eq!(annotated.message.as_deref(), Some("First release"));
    let light = tags.iter().find(|tag| tag.name == "light").expect("light");
    assert!(!light.annotated);

    let duplicate = tag::create_tag(repo, "light", None, None)
        .await
        .expect_err("duplicate");
    assert_eq!(duplicate.kind, ErrorKind::TagAlreadyExists);

    let invalid = tag::create_tag(repo, "bad name", None, None)
        .await
        .expect_err("invalid");
    assert_eq!(invalid.kind, ErrorKind::InvalidName);
    let option_like = tag::create_tag(repo, "--force", None, None)
        .await
        .expect_err("option-like");
    assert_eq!(option_like.kind, ErrorKind::InvalidName);

    tag::delete_tag(repo, "light").await.expect("delete");
    assert_eq!(tag::list_tags(repo).await.expect("list").len(), 1);
    let missing = tag::delete_tag(repo, "light").await.expect_err("missing");
    assert_eq!(missing.kind, ErrorKind::TagNotFound);
}

#[tokio::test]
async fn tags_can_be_pushed_and_deleted_on_the_remote() {
    let workspace = new_repository().await;
    let repo = workspace.path.as_path();
    commit_file(repo, "f.txt", "one\n", "one").await;
    let remote_dir = tempfile::TempDir::new().expect("remote dir");
    git_output(remote_dir.path(), &["init", "--bare", "-b", "main"]);
    let remote_url = remote_dir.path().to_string_lossy().into_owned();
    git_output(repo, &["remote", "add", "origin", &remote_url]);

    tag::create_tag(repo, "v1", None, None).await.expect("tag");
    tag::push_tag(repo, "v1", CancelToken::never(), &|_| {})
        .await
        .expect("push tag");
    assert!(git_output(remote_dir.path(), &["tag"]).contains("v1"));

    tag::delete_remote_tag(repo, "v1", CancelToken::never(), &|_| {})
        .await
        .expect("delete remote tag");
    assert!(!git_output(remote_dir.path(), &["tag"]).contains("v1"));
}

#[tokio::test]
async fn cherry_pick_applies_several_commits_in_order() {
    let workspace = new_repository().await;
    let repo = workspace.path.as_path();
    commit_file(repo, "base.txt", "base\n", "base").await;
    git_output(repo, &["checkout", "-b", "feature"]);
    let first = commit_file(repo, "a.txt", "a\n", "add a").await;
    let second = commit_file(repo, "b.txt", "b\n", "add b").await;
    git_output(repo, &["checkout", "main"]);

    commit_ops::cherry_pick_commits(repo, &[first, second])
        .await
        .expect("cherry-pick");
    assert!(repo.join("a.txt").exists());
    assert!(repo.join("b.txt").exists());
    let subjects = git_output(repo, &["log", "-2", "--format=%s"]);
    assert_eq!(subjects.lines().collect::<Vec<_>>(), vec!["add b", "add a"]);

    let empty = commit_ops::cherry_pick_commits(repo, &[]).await;
    assert_eq!(empty.expect_err("empty").kind, ErrorKind::InvalidInput);
    let invalid = commit_ops::cherry_pick_commits(repo, &["--abort".to_string()]).await;
    assert_eq!(invalid.expect_err("invalid").kind, ErrorKind::InvalidInput);
}

#[tokio::test]
async fn cherry_pick_conflict_leaves_an_operation_to_resolve() {
    let workspace = diverged_repository().await;
    let repo = workspace.path.as_path();
    let feature = git_output(repo, &["rev-parse", "feature"])
        .trim()
        .to_string();

    let error = commit_ops::cherry_pick_commits(repo, &[feature])
        .await
        .expect_err("conflict");
    assert_eq!(error.kind, ErrorKind::MergeConflict);
    assert_eq!(current_kind(repo).await, Some(OperationKind::CherryPick));
}

#[tokio::test]
async fn revert_creates_an_inverse_commit_and_handles_merges() {
    let workspace = new_repository().await;
    let repo = workspace.path.as_path();
    commit_file(repo, "f.txt", "one\n", "one").await;
    let second = commit_file(repo, "g.txt", "g\n", "add g").await;

    commit_ops::revert_commit(repo, &second, None)
        .await
        .expect("revert");
    assert!(!repo.join("g.txt").exists());
    assert!(last_subject(repo).starts_with("Revert"));

    git_output(repo, &["checkout", "-b", "topic"]);
    commit_file(repo, "topic.txt", "t\n", "topic work").await;
    git_output(repo, &["checkout", "main"]);
    commit_file(repo, "main.txt", "m\n", "main work").await;
    git_output(repo, &["merge", "--no-ff", "-m", "merge topic", "topic"]);
    let merge = git_output(repo, &["rev-parse", "HEAD"]).trim().to_string();

    let without_parent = commit_ops::revert_commit(repo, &merge, None)
        .await
        .expect_err("needs parent");
    assert_eq!(without_parent.kind, ErrorKind::MergeCommitNeedsParent);

    commit_ops::revert_commit(repo, &merge, Some(1))
        .await
        .expect("revert merge");
    assert!(!repo.join("topic.txt").exists());
    assert!(repo.join("main.txt").exists());
}

#[tokio::test]
async fn reset_modes_move_head_and_keep_the_expected_state() {
    let workspace = new_repository().await;
    let repo = workspace.path.as_path();
    let first = commit_file(repo, "f.txt", "one\n", "one").await;
    commit_file(repo, "f.txt", "two\n", "two").await;

    commit_ops::reset_to(repo, &first, ResetMode::Soft)
        .await
        .expect("soft");
    assert_eq!(last_subject(repo), "one");
    let snapshot = status::get_status(repo).await.expect("status");
    assert_eq!(snapshot.entries.len(), 1);
    assert_eq!(snapshot.entries[0].index, ChangeKind::Modified);

    commit_ops::reset_to(repo, &first, ResetMode::Mixed)
        .await
        .expect("mixed");
    let snapshot = status::get_status(repo).await.expect("status");
    assert_eq!(snapshot.entries[0].worktree, ChangeKind::Modified);
    assert_eq!(snapshot.entries[0].index, ChangeKind::Unmodified);

    commit_ops::reset_to(repo, &first, ResetMode::Hard)
        .await
        .expect("hard");
    assert!(status::get_status(repo)
        .await
        .expect("status")
        .entries
        .is_empty());
    assert_eq!(
        std::fs::read_to_string(repo.join("f.txt")).expect("read"),
        "one\n"
    );
}

#[tokio::test]
async fn checkout_detached_moves_head_without_a_branch() {
    let workspace = new_repository().await;
    let repo = workspace.path.as_path();
    let first = commit_file(repo, "f.txt", "one\n", "one").await;
    commit_file(repo, "f.txt", "two\n", "two").await;

    commit_ops::checkout_detached(repo, &first)
        .await
        .expect("checkout");
    let snapshot = status::get_status(repo).await.expect("status");
    assert!(snapshot.branch.detached);
    assert_eq!(git_output(repo, &["rev-parse", "HEAD"]).trim(), first);
}

#[tokio::test]
async fn force_with_lease_replaces_rewritten_history_on_the_remote() {
    let workspace = new_repository().await;
    let repo = workspace.path.as_path();
    commit_file(repo, "f.txt", "one\n", "one").await;
    let remote_dir = tempfile::TempDir::new().expect("remote dir");
    git_output(remote_dir.path(), &["init", "--bare", "-b", "main"]);
    let remote_url = remote_dir.path().to_string_lossy().into_owned();
    git_output(repo, &["remote", "add", "origin", &remote_url]);
    git_output(repo, &["push", "-u", "origin", "main"]);

    git_output(repo, &["commit", "--amend", "-m", "one rewritten"]);
    let rejected = remote::push_current(repo, CancelToken::never(), &|_| {})
        .await
        .expect_err("rejected");
    assert_eq!(rejected.kind, ErrorKind::RemoteAhead);

    remote::push_with_options(repo, true, CancelToken::never(), &|_| {})
        .await
        .expect("force with lease");
    let remote_subject = git_output(remote_dir.path(), &["log", "-1", "--format=%s", "main"]);
    assert_eq!(remote_subject.trim(), "one rewritten");
}

#[tokio::test]
async fn stash_round_trip_with_untracked_files() {
    let workspace = new_repository().await;
    let repo = workspace.path.as_path();
    commit_file(repo, "tracked.txt", "one\n", "one").await;
    write_file(repo, "tracked.txt", "one\ntwo\n");
    write_file(repo, "fresh.txt", "brand new\n");

    stash::save_stash(repo, Some("before lunch"), true)
        .await
        .expect("save");
    assert!(status::get_status(repo)
        .await
        .expect("status")
        .entries
        .is_empty());
    assert!(!repo.join("fresh.txt").exists());

    let stashes = stash::list_stashes(repo).await.expect("list");
    assert_eq!(stashes.len(), 1);
    assert_eq!(stashes[0].message, "before lunch");
    assert_eq!(stashes[0].branch.as_deref(), Some("main"));
    let hash = stashes[0].hash.clone();

    let files = stash::stash_files(repo, &hash).await.expect("files");
    let paths: Vec<&str> = files.iter().map(|file| file.path.as_str()).collect();
    assert!(paths.contains(&"tracked.txt"));
    assert!(paths.contains(&"fresh.txt"));

    let tracked_diff = stash::stash_file_diff(repo, &hash, "tracked.txt", None, false)
        .await
        .expect("tracked diff");
    assert!(tracked_diff.hunks[0]
        .lines
        .iter()
        .any(|line| line.kind == LineKind::Added && line.content == "two"));
    let untracked_diff = stash::stash_file_diff(repo, &hash, "fresh.txt", None, false)
        .await
        .expect("untracked diff");
    assert!(untracked_diff.hunks[0]
        .lines
        .iter()
        .any(|line| line.kind == LineKind::Added && line.content == "brand new"));

    stash::apply_stash(repo, &hash, false).await.expect("apply");
    assert!(repo.join("fresh.txt").exists());
    assert_eq!(stash::list_stashes(repo).await.expect("list").len(), 1);

    git_output(repo, &["reset", "--hard"]);
    git_output(repo, &["clean", "-fd"]);
    stash::apply_stash(repo, &hash, true).await.expect("pop");
    assert!(stash::list_stashes(repo).await.expect("list").is_empty());
    assert_eq!(
        std::fs::read_to_string(repo.join("tracked.txt")).expect("read"),
        "one\ntwo\n"
    );
}

#[tokio::test]
async fn stashing_without_changes_is_reported() {
    let workspace = new_repository().await;
    let repo = workspace.path.as_path();
    commit_file(repo, "f.txt", "one\n", "one").await;
    let error = stash::save_stash(repo, None, false)
        .await
        .expect_err("nothing");
    assert_eq!(error.kind, ErrorKind::NothingToStash);
}

#[tokio::test]
async fn stash_without_a_message_uses_the_wip_label() {
    let workspace = new_repository().await;
    let repo = workspace.path.as_path();
    commit_file(repo, "f.txt", "one\n", "first commit").await;
    write_file(repo, "f.txt", "changed\n");
    stash::save_stash(repo, None, false).await.expect("save");
    let stashes = stash::list_stashes(repo).await.expect("list");
    assert_eq!(stashes[0].message, "WIP: first commit");
}

#[tokio::test]
async fn stash_operations_use_the_hash_not_a_stale_index() {
    let workspace = new_repository().await;
    let repo = workspace.path.as_path();
    commit_file(repo, "f.txt", "one\n", "one").await;
    write_file(repo, "f.txt", "a\n");
    stash::save_stash(repo, Some("first"), false)
        .await
        .expect("first");
    write_file(repo, "f.txt", "b\n");
    stash::save_stash(repo, Some("second"), false)
        .await
        .expect("second");

    let stashes = stash::list_stashes(repo).await.expect("list");
    let older = stashes
        .iter()
        .find(|stash| stash.message == "first")
        .expect("first stash")
        .hash
        .clone();
    stash::drop_stash(repo, &older).await.expect("drop older");

    let remaining = stash::list_stashes(repo).await.expect("list");
    assert_eq!(remaining.len(), 1);
    assert_eq!(remaining[0].message, "second");

    let missing = stash::drop_stash(repo, &older).await.expect_err("gone");
    assert_eq!(missing.kind, ErrorKind::StashNotFound);
    let invalid = stash::drop_stash(repo, "--all").await.expect_err("invalid");
    assert_eq!(invalid.kind, ErrorKind::InvalidInput);
}

#[tokio::test]
async fn applying_a_conflicting_stash_keeps_it_and_reports_conflicts() {
    let workspace = new_repository().await;
    let repo = workspace.path.as_path();
    commit_file(repo, "f.txt", "base\n", "base").await;
    write_file(repo, "f.txt", "stashed\n");
    stash::save_stash(repo, Some("conflicting"), false)
        .await
        .expect("save");
    commit_file(repo, "f.txt", "committed\n", "diverge").await;

    let hash = stash::list_stashes(repo).await.expect("list")[0]
        .hash
        .clone();
    let error = stash::apply_stash(repo, &hash, true)
        .await
        .expect_err("conflict");
    assert_eq!(error.kind, ErrorKind::MergeConflict);
    assert_eq!(stash::list_stashes(repo).await.expect("list").len(), 1);
    assert!(status::get_status(repo)
        .await
        .expect("status")
        .entries
        .iter()
        .any(|entry| entry.conflicted));
}

#[tokio::test]
async fn branch_can_be_created_from_a_stash() {
    let workspace = new_repository().await;
    let repo = workspace.path.as_path();
    commit_file(repo, "f.txt", "base\n", "base").await;
    write_file(repo, "f.txt", "work in progress\n");
    stash::save_stash(repo, Some("wip"), false)
        .await
        .expect("save");
    commit_file(repo, "other.txt", "x\n", "move on").await;

    let hash = stash::list_stashes(repo).await.expect("list")[0]
        .hash
        .clone();
    stash::branch_from_stash(repo, &hash, "from-stash")
        .await
        .expect("branch");
    assert_eq!(
        git_output(repo, &["rev-parse", "--abbrev-ref", "HEAD"]).trim(),
        "from-stash"
    );
    assert_eq!(
        std::fs::read_to_string(repo.join("f.txt")).expect("read"),
        "work in progress\n"
    );
    assert!(stash::list_stashes(repo).await.expect("list").is_empty());
}

async fn searchable_repository() -> Workspace {
    let workspace = new_repository().await;
    let repo = workspace.path.as_path();
    commit_file(repo, "alpha.txt", "first line\n", "Add alpha file").await;
    commit_file(
        repo,
        "beta.txt",
        "needle in a haystack\n",
        "Add beta with needle",
    )
    .await;
    git_as(
        repo,
        "Grace Hopper",
        "grace@example.com",
        &["commit", "--allow-empty", "-m", "Compiler tweak by Grace"],
    );
    commit_file(
        repo,
        "alpha.txt",
        "first line\nsecond line\n",
        "Extend alpha",
    )
    .await;
    workspace
}

fn subjects(commits: &[CommitSummary]) -> Vec<&str> {
    commits
        .iter()
        .map(|commit| commit.subject.as_str())
        .collect()
}

#[tokio::test]
async fn history_search_filters_by_message_and_author() {
    let workspace = searchable_repository().await;
    let repo = workspace.path.as_path();

    let by_message = history::history_search(
        repo,
        &HistoryQuery {
            text: Some("ALPHA".into()),
            ..HistoryQuery::default()
        },
        0,
        50,
        None,
    )
    .await
    .expect("message search");
    assert_eq!(
        subjects(&by_message),
        vec!["Extend alpha", "Add alpha file"]
    );

    let by_author = history::history_search(
        repo,
        &HistoryQuery {
            author: Some("grace".into()),
            ..HistoryQuery::default()
        },
        0,
        50,
        None,
    )
    .await
    .expect("author search");
    assert_eq!(subjects(&by_author), vec!["Compiler tweak by Grace"]);

    let both = history::history_search(
        repo,
        &HistoryQuery {
            text: Some("alpha".into()),
            author: Some("Test User".into()),
            ..HistoryQuery::default()
        },
        0,
        50,
        None,
    )
    .await
    .expect("combined");
    assert_eq!(subjects(&both), vec!["Extend alpha", "Add alpha file"]);
}

#[tokio::test]
async fn history_search_finds_content_changes_with_text_and_regex() {
    let workspace = searchable_repository().await;
    let repo = workspace.path.as_path();

    let pickaxe = history::history_search(
        repo,
        &HistoryQuery {
            content: Some("needle".into()),
            ..HistoryQuery::default()
        },
        0,
        50,
        Some(CancelToken::never()),
    )
    .await
    .expect("pickaxe");
    assert_eq!(subjects(&pickaxe), vec!["Add beta with needle"]);

    let regex = history::history_search(
        repo,
        &HistoryQuery {
            content: Some("sec.nd line".into()),
            content_mode: ContentMode::Regex,
            ..HistoryQuery::default()
        },
        0,
        50,
        None,
    )
    .await
    .expect("regex");
    assert_eq!(subjects(&regex), vec!["Extend alpha"]);
}

#[tokio::test]
async fn history_search_limits_by_path_and_follows_renames() {
    let workspace = new_repository().await;
    let repo = workspace.path.as_path();
    commit_file(
        repo,
        "old.txt",
        "content that stays the same\nmore\n",
        "Create old",
    )
    .await;
    git_output(repo, &["mv", "old.txt", "new.txt"]);
    git_output(repo, &["commit", "-m", "Rename to new"]);
    commit_file(
        repo,
        "new.txt",
        "content that stays the same\nmore\nextra\n",
        "Edit new",
    )
    .await;

    let plain = history::history_search(
        repo,
        &HistoryQuery {
            path: Some("new.txt".into()),
            ..HistoryQuery::default()
        },
        0,
        50,
        None,
    )
    .await
    .expect("path");
    assert_eq!(subjects(&plain), vec!["Edit new", "Rename to new"]);

    let followed = history::history_search(
        repo,
        &HistoryQuery {
            path: Some("new.txt".into()),
            follow: true,
            ..HistoryQuery::default()
        },
        0,
        50,
        None,
    )
    .await
    .expect("follow");
    assert_eq!(
        subjects(&followed),
        vec!["Edit new", "Rename to new", "Create old"]
    );
}

#[tokio::test]
async fn history_search_filters_by_date_range() {
    let workspace = new_repository().await;
    let repo = workspace.path.as_path();
    write_file(repo, "a.txt", "a\n");
    git_output(repo, &["add", "a.txt"]);
    git_output(
        repo,
        &["commit", "-m", "old commit", "--date=2020-03-10T12:00:00"],
    );
    let old_date = "2020-03-10T12:00:00";
    git_output(
        repo,
        &[
            "commit",
            "--amend",
            "--no-edit",
            &format!("--date={old_date}"),
        ],
    );
    commit_file(repo, "b.txt", "b\n", "recent commit").await;

    let recent_only = history::history_search(
        repo,
        &HistoryQuery {
            since: Some("2024-01-01".into()),
            ..HistoryQuery::default()
        },
        0,
        50,
        None,
    )
    .await
    .expect("since");
    assert!(subjects(&recent_only).contains(&"recent commit"));
}

#[tokio::test]
async fn history_search_all_scope_includes_other_branches() {
    let workspace = new_repository().await;
    let repo = workspace.path.as_path();
    commit_file(repo, "a.txt", "a\n", "on main").await;
    git_output(repo, &["checkout", "-b", "side"]);
    commit_file(repo, "b.txt", "b\n", "on side").await;
    git_output(repo, &["checkout", "main"]);

    let current = history::history_search(repo, &HistoryQuery::default(), 0, 50, None)
        .await
        .expect("current");
    assert_eq!(subjects(&current), vec!["on main"]);

    let all = history::history_search(
        repo,
        &HistoryQuery {
            scope: HistoryScope::All,
            topo_order: true,
            ..HistoryQuery::default()
        },
        0,
        50,
        None,
    )
    .await
    .expect("all");
    assert_eq!(all.len(), 2);
    let side = all
        .iter()
        .find(|commit| commit.subject == "on side")
        .expect("side commit");
    assert_eq!(side.parents.len(), 1);
}

#[tokio::test]
async fn history_search_on_a_repository_without_commits_is_empty() {
    let workspace = new_repository().await;
    let repo = workspace.path.as_path();
    let all = history::history_search(
        repo,
        &HistoryQuery {
            scope: HistoryScope::All,
            ..HistoryQuery::default()
        },
        0,
        50,
        None,
    )
    .await
    .expect("empty");
    assert!(all.is_empty());
}

#[tokio::test]
async fn prepare_commit_graph_writes_the_file_once() {
    let workspace = new_repository().await;
    let repo = workspace.path.as_path();
    commit_file(repo, "a.txt", "a\n", "one").await;
    let graph_file = repo
        .join(".git")
        .join("objects")
        .join("info")
        .join("commit-graph");
    assert!(!graph_file.exists());

    history::prepare_commit_graph(repo).await.expect("prepare");
    assert!(graph_file.exists());
    history::prepare_commit_graph(repo).await.expect("again");
}
