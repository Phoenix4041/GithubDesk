use std::path::{Path, PathBuf};

use serde::Deserialize;

use crate::error::{AppError, AppResult, ErrorKind};
use crate::git::parse::worktree::{parse_worktrees, same_path, Worktree};
use crate::git::runner::git;
use crate::git::validate::{ensure_revision, ensure_valid_branch_name};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewWorktree {
    pub path: String,
    pub branch: Option<String>,
    pub new_branch: Option<String>,
    pub start_point: Option<String>,
    pub detach: bool,
}

pub async fn list_worktrees(repo: &Path) -> AppResult<Vec<Worktree>> {
    let output = git(repo, &["worktree", "list", "--porcelain", "-z"]).await?;
    let mut worktrees = parse_worktrees(&output.text());
    let current = repo.to_string_lossy();
    for worktree in &mut worktrees {
        worktree.is_current = same_path(&worktree.path, &current);
    }
    Ok(worktrees)
}

fn directory_has_entries(path: &Path) -> bool {
    std::fs::read_dir(path).is_ok_and(|mut entries| entries.next().is_some())
}

fn clean(value: &Option<String>) -> Option<&str> {
    value
        .as_deref()
        .map(str::trim)
        .filter(|text| !text.is_empty())
}

pub async fn add_worktree(repo: &Path, request: &NewWorktree) -> AppResult<()> {
    let destination = PathBuf::from(request.path.trim());
    if request.path.trim().is_empty() || !destination.is_absolute() {
        return Err(AppError::invalid_input(
            "the worktree path must be absolute",
        ));
    }
    if directory_has_entries(&destination) {
        return Err(AppError::new(
            ErrorKind::DestinationNotEmpty,
            destination.display().to_string(),
        ));
    }
    let destination_text = destination.to_string_lossy().into_owned();
    let start_point = clean(&request.start_point);
    if let Some(value) = start_point {
        ensure_revision(value)?;
    }

    if let Some(name) = clean(&request.new_branch) {
        ensure_valid_branch_name(repo, name).await?;
        let mut args = vec!["worktree", "add", "-b", name, "--", &destination_text];
        if let Some(start) = start_point {
            args.push(start);
        }
        git(repo, &args).await?;
        return Ok(());
    }

    if request.detach {
        let target = start_point.unwrap_or("HEAD");
        git(
            repo,
            &[
                "worktree",
                "add",
                "--detach",
                "--",
                &destination_text,
                target,
            ],
        )
        .await?;
        return Ok(());
    }

    let Some(branch) = clean(&request.branch) else {
        return Err(AppError::invalid_input("choose a branch for the worktree"));
    };
    ensure_revision(branch)?;
    git(repo, &["worktree", "add", "--", &destination_text, branch]).await?;
    Ok(())
}

async fn find_registered(repo: &Path, target: &str) -> AppResult<(Worktree, PathBuf)> {
    let worktrees = list_worktrees(repo).await?;
    let main_path = worktrees
        .first()
        .map(|worktree| PathBuf::from(&worktree.path))
        .ok_or_else(|| AppError::invalid_input("the repository has no worktrees"))?;
    let found = worktrees
        .into_iter()
        .find(|worktree| same_path(&worktree.path, target))
        .ok_or_else(|| AppError::invalid_input("the folder is not a registered worktree"))?;
    Ok((found, main_path))
}

pub async fn remove_worktree(repo: &Path, target: &str, force: bool) -> AppResult<()> {
    let (worktree, main_path) = find_registered(repo, target).await?;
    if worktree.is_main {
        return Err(AppError::invalid_input(
            "the main worktree cannot be removed",
        ));
    }
    if worktree.is_current {
        return Err(AppError::invalid_input(
            "the worktree that is open cannot be removed",
        ));
    }
    let mut args = vec!["worktree", "remove"];
    if force {
        args.push("--force");
    }
    args.push("--");
    args.push(&worktree.path);
    git(&main_path, &args).await?;
    Ok(())
}

pub async fn lock_worktree(repo: &Path, target: &str, reason: Option<&str>) -> AppResult<()> {
    let (worktree, main_path) = find_registered(repo, target).await?;
    if worktree.is_main {
        return Err(AppError::invalid_input(
            "the main worktree cannot be locked",
        ));
    }
    let reason = reason.map(str::trim).filter(|text| !text.is_empty());
    let mut args = vec!["worktree", "lock"];
    if let Some(text) = reason {
        args.push("--reason");
        args.push(text);
    }
    args.push("--");
    args.push(&worktree.path);
    git(&main_path, &args).await?;
    Ok(())
}

pub async fn unlock_worktree(repo: &Path, target: &str) -> AppResult<()> {
    let (worktree, main_path) = find_registered(repo, target).await?;
    git(&main_path, &["worktree", "unlock", "--", &worktree.path]).await?;
    Ok(())
}

pub async fn prune_worktrees(repo: &Path) -> AppResult<()> {
    git(repo, &["worktree", "prune"]).await?;
    Ok(())
}

#[tauri::command]
pub async fn worktree_list(path: String) -> AppResult<Vec<Worktree>> {
    list_worktrees(Path::new(&path)).await
}

#[tauri::command]
pub async fn worktree_add(path: String, request: NewWorktree) -> AppResult<()> {
    add_worktree(Path::new(&path), &request).await
}

#[tauri::command]
pub async fn worktree_remove(path: String, worktree: String, force: bool) -> AppResult<()> {
    remove_worktree(Path::new(&path), &worktree, force).await
}

#[tauri::command]
pub async fn worktree_lock(
    path: String,
    worktree: String,
    reason: Option<String>,
) -> AppResult<()> {
    lock_worktree(Path::new(&path), &worktree, reason.as_deref()).await
}

#[tauri::command]
pub async fn worktree_unlock(path: String, worktree: String) -> AppResult<()> {
    unlock_worktree(Path::new(&path), &worktree).await
}

#[tauri::command]
pub async fn worktree_prune(path: String) -> AppResult<()> {
    prune_worktrees(Path::new(&path)).await
}
