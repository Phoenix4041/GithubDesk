use std::path::Path;

use serde::Deserialize;

use crate::error::{AppError, AppResult};
use crate::git::runner::git;
use crate::git::validate::ensure_commit_hash;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ResetMode {
    Soft,
    Mixed,
    Hard,
}

impl ResetMode {
    fn flag(self) -> &'static str {
        match self {
            ResetMode::Soft => "--soft",
            ResetMode::Mixed => "--mixed",
            ResetMode::Hard => "--hard",
        }
    }
}

pub async fn cherry_pick_commits(repo: &Path, hashes: &[String]) -> AppResult<()> {
    if hashes.is_empty() {
        return Err(AppError::invalid_input("no commits selected"));
    }
    for hash in hashes {
        ensure_commit_hash(hash)?;
    }
    let mut args = vec!["cherry-pick"];
    args.extend(hashes.iter().map(String::as_str));
    git(repo, &args).await?;
    Ok(())
}

pub async fn revert_commit(repo: &Path, hash: &str, mainline: Option<u32>) -> AppResult<()> {
    ensure_commit_hash(hash)?;
    let mainline_text = mainline.map(|parent| parent.to_string());
    let mut args = vec!["revert", "--no-edit"];
    if let Some(parent) = mainline_text.as_deref() {
        args.push("-m");
        args.push(parent);
    }
    args.push(hash);
    git(repo, &args).await?;
    Ok(())
}

pub async fn reset_to(repo: &Path, hash: &str, mode: ResetMode) -> AppResult<()> {
    ensure_commit_hash(hash)?;
    git(repo, &["reset", mode.flag(), hash]).await?;
    Ok(())
}

pub async fn checkout_detached(repo: &Path, hash: &str) -> AppResult<()> {
    ensure_commit_hash(hash)?;
    git(repo, &["checkout", "--detach", hash]).await?;
    Ok(())
}

#[tauri::command]
pub async fn commit_cherry_pick(path: String, hashes: Vec<String>) -> AppResult<()> {
    cherry_pick_commits(Path::new(&path), &hashes).await
}

#[tauri::command]
pub async fn commit_revert(path: String, hash: String, mainline: Option<u32>) -> AppResult<()> {
    revert_commit(Path::new(&path), &hash, mainline).await
}

#[tauri::command]
pub async fn commit_reset(path: String, hash: String, mode: ResetMode) -> AppResult<()> {
    if matches!(mode, ResetMode::Hard) {
        crate::commands::rescue::guard_worktree(Path::new(&path), "reset").await;
    }
    reset_to(Path::new(&path), &hash, mode).await
}

#[tauri::command]
pub async fn commit_checkout(path: String, hash: String) -> AppResult<()> {
    checkout_detached(Path::new(&path), &hash).await
}
