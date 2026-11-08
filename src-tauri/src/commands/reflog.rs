use std::path::Path;

use serde::Serialize;

use crate::error::{AppError, AppResult, ErrorKind};
use crate::git::parse::reflog::{
    parse_reflog, plan_undo, ReflogEntry, UndoPlan, UndoStrategy, REFLOG_FORMAT,
};
use crate::git::runner::{git, git_unchecked};
use crate::git::validate::{ensure_commit_hash, ensure_revision, ensure_valid_branch_name};

const MAX_REFLOG_ENTRIES: u32 = 500;
const MAX_PREVIEW_COMMITS: usize = 50;
const COMMIT_FIELD_SEPARATOR: char = '\u{1f}';
const STASH_MESSAGE: &str = "githubdesk: saved before undoing an operation";

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewCommit {
    pub hash: String,
    pub short_hash: String,
    pub subject: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewFile {
    pub path: String,
    pub additions: u32,
    pub deletions: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UndoPreview {
    pub plan: UndoPlan,
    pub has_uncommitted_changes: bool,
    pub removed_commits: Vec<PreviewCommit>,
    pub restored_commits: Vec<PreviewCommit>,
    pub files: Vec<PreviewFile>,
}

pub async fn list_reflog(repo: &Path, limit: u32) -> AppResult<Vec<ReflogEntry>> {
    list_reflog_for(repo, "HEAD", limit).await
}

pub async fn list_reflog_refs(repo: &Path) -> AppResult<Vec<String>> {
    let output = git_unchecked(
        repo,
        &["for-each-ref", "--format=%(refname:short)", "refs/heads"],
    )
    .await?;
    if !output.success() {
        return Ok(Vec::new());
    }
    Ok(output
        .text()
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(str::to_string)
        .collect())
}

pub async fn list_reflog_for(
    repo: &Path,
    reference: &str,
    limit: u32,
) -> AppResult<Vec<ReflogEntry>> {
    ensure_revision(reference)?;
    let count = format!("--max-count={}", limit.clamp(1, MAX_REFLOG_ENTRIES));
    let output = git_unchecked(
        repo,
        &["reflog", "show", REFLOG_FORMAT, &count, reference, "--"],
    )
    .await?;
    if !output.success() {
        let error = AppError::from_git_failure(&output.text(), &output.stderr);
        if error.kind == ErrorKind::NoCommits || output.stderr.contains("unknown revision") {
            return Ok(Vec::new());
        }
        return Err(error);
    }
    Ok(parse_reflog(&output.text()))
}

pub async fn undo_plan(repo: &Path) -> AppResult<Option<UndoPlan>> {
    let entries = list_reflog(repo, 100).await?;
    Ok(plan_undo(&entries))
}

async fn has_uncommitted_changes(repo: &Path) -> AppResult<bool> {
    let output = git(repo, &["status", "--porcelain", "--untracked-files=no"]).await?;
    Ok(!output.trimmed().is_empty())
}

fn parse_commits(text: &str) -> Vec<PreviewCommit> {
    text.lines()
        .filter_map(|line| {
            let (hash, subject) = line.split_once(COMMIT_FIELD_SEPARATOR)?;
            Some(PreviewCommit {
                hash: hash.to_string(),
                short_hash: hash.chars().take(7).collect(),
                subject: subject.to_string(),
            })
        })
        .collect()
}

fn parse_numstat(text: &str) -> Vec<PreviewFile> {
    text.lines()
        .filter_map(|line| {
            let mut fields = line.splitn(3, '\t');
            let additions = fields.next()?.parse().unwrap_or(0);
            let deletions = fields.next()?.parse().unwrap_or(0);
            let path = fields.next()?.to_string();
            Some(PreviewFile {
                path,
                additions,
                deletions,
            })
        })
        .collect()
}

async fn commits_in(repo: &Path, range: &str) -> AppResult<Vec<PreviewCommit>> {
    let limit = format!("--max-count={MAX_PREVIEW_COMMITS}");
    let output = git_unchecked(repo, &["log", "--format=%H%x1f%s", &limit, range, "--"]).await?;
    if !output.success() {
        return Ok(Vec::new());
    }
    Ok(parse_commits(&output.text()))
}

fn destination_of(plan: &UndoPlan) -> &str {
    plan.switch_to.as_deref().unwrap_or(&plan.target_hash)
}

pub async fn undo_preview(repo: &Path) -> AppResult<Option<UndoPreview>> {
    let Some(plan) = undo_plan(repo).await? else {
        return Ok(None);
    };
    let destination = destination_of(&plan).to_string();
    ensure_revision(&destination)?;
    let removed_commits =
        commits_in(repo, &format!("{destination}..{}", plan.current_hash)).await?;
    let restored_commits =
        commits_in(repo, &format!("{}..{destination}", plan.current_hash)).await?;
    let diff = git_unchecked(
        repo,
        &["diff", "--numstat", &plan.current_hash, &destination, "--"],
    )
    .await?;
    let files = if diff.success() {
        parse_numstat(&diff.text())
    } else {
        Vec::new()
    };
    let has_uncommitted_changes = has_uncommitted_changes(repo).await?;
    Ok(Some(UndoPreview {
        plan,
        has_uncommitted_changes,
        removed_commits,
        restored_commits,
        files,
    }))
}

pub async fn recover_commit(repo: &Path, name: &str, hash: &str) -> AppResult<()> {
    ensure_commit_hash(hash)?;
    ensure_valid_branch_name(repo, name).await?;
    git(repo, &["branch", name.trim(), hash]).await?;
    Ok(())
}

pub async fn restore_head(repo: &Path, hash: &str, strategy: UndoStrategy) -> AppResult<()> {
    ensure_commit_hash(hash)?;
    let flag = match strategy {
        UndoStrategy::KeepChangesStaged => "--soft",
        UndoStrategy::RestoreAll | UndoStrategy::SwitchBack => "--keep",
    };
    git(repo, &["reset", flag, hash]).await?;
    Ok(())
}

pub async fn undo_last_operation(
    repo: &Path,
    expected_current: &str,
    stash_first: bool,
) -> AppResult<()> {
    let Some(plan) = undo_plan(repo).await? else {
        return Err(AppError::invalid_input("there is nothing to undo"));
    };
    if plan.current_hash != expected_current {
        return Err(AppError::invalid_input(
            "the history changed since the undo was planned",
        ));
    }
    if plan.strategy != UndoStrategy::KeepChangesStaged && has_uncommitted_changes(repo).await? {
        if !stash_first {
            return Err(AppError::invalid_input(
                "there are unsaved changes that the undo would discard",
            ));
        }
        git(repo, &["stash", "push", "-m", STASH_MESSAGE]).await?;
    }
    if let Some(reference) = &plan.switch_to {
        ensure_revision(reference)?;
        git(repo, &["checkout", reference, "--"]).await?;
        return Ok(());
    }
    restore_head(repo, &plan.target_hash, plan.strategy).await
}

#[tauri::command]
pub async fn reflog_list(path: String, limit: u32) -> AppResult<Vec<ReflogEntry>> {
    list_reflog(Path::new(&path), limit).await
}

#[tauri::command]
pub async fn reflog_undo_plan(path: String) -> AppResult<Option<UndoPlan>> {
    undo_plan(Path::new(&path)).await
}

#[tauri::command]
pub async fn reflog_restore(path: String, hash: String) -> AppResult<()> {
    restore_head(Path::new(&path), &hash, UndoStrategy::RestoreAll).await
}

#[tauri::command]
pub async fn reflog_undo(
    path: String,
    expected_current: String,
    stash_first: bool,
) -> AppResult<()> {
    undo_last_operation(Path::new(&path), &expected_current, stash_first).await
}

#[tauri::command]
pub async fn reflog_undo_preview(path: String) -> AppResult<Option<UndoPreview>> {
    undo_preview(Path::new(&path)).await
}

#[tauri::command]
pub async fn reflog_refs(path: String) -> AppResult<Vec<String>> {
    list_reflog_refs(Path::new(&path)).await
}

#[tauri::command]
pub async fn reflog_list_ref(
    path: String,
    reference: String,
    limit: u32,
) -> AppResult<Vec<ReflogEntry>> {
    list_reflog_for(Path::new(&path), &reference, limit).await
}

#[tauri::command]
pub async fn reflog_recover(path: String, name: String, hash: String) -> AppResult<()> {
    recover_commit(Path::new(&path), &name, &hash).await
}
