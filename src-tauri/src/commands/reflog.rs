use std::path::Path;

use crate::error::{AppError, AppResult, ErrorKind};
use crate::git::parse::reflog::{
    parse_reflog, plan_undo, ReflogEntry, UndoPlan, UndoStrategy, REFLOG_FORMAT,
};
use crate::git::runner::{git, git_unchecked};
use crate::git::validate::ensure_commit_hash;

const MAX_REFLOG_ENTRIES: u32 = 500;

pub async fn list_reflog(repo: &Path, limit: u32) -> AppResult<Vec<ReflogEntry>> {
    let count = format!("--max-count={}", limit.clamp(1, MAX_REFLOG_ENTRIES));
    let output = git_unchecked(repo, &["reflog", "show", REFLOG_FORMAT, &count, "HEAD"]).await?;
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

pub async fn restore_head(repo: &Path, hash: &str, strategy: UndoStrategy) -> AppResult<()> {
    ensure_commit_hash(hash)?;
    let flag = match strategy {
        UndoStrategy::KeepChangesStaged => "--soft",
        UndoStrategy::RestoreAll => "--keep",
    };
    git(repo, &["reset", flag, hash]).await?;
    Ok(())
}

pub async fn undo_last_operation(repo: &Path, expected_current: &str) -> AppResult<()> {
    let Some(plan) = undo_plan(repo).await? else {
        return Err(AppError::invalid_input("there is nothing to undo"));
    };
    if plan.current_hash != expected_current {
        return Err(AppError::invalid_input(
            "the history changed since the undo was planned",
        ));
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
pub async fn reflog_undo(path: String, expected_current: String) -> AppResult<()> {
    undo_last_operation(Path::new(&path), &expected_current).await
}
