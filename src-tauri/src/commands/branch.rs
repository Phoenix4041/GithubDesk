use std::path::Path;

use tauri::ipc::Channel;
use tauri::State;

use crate::commands::remote::list_remotes;
use crate::error::{AppError, AppResult, ErrorKind};
use crate::git::parse::branch::{parse_branches, Branch, BRANCH_FORMAT};
use crate::git::parse::progress::Progress;
use crate::git::parse::remote::preferred_remote;
use crate::git::runner::{git, git_streaming};
use crate::git::validate::{ensure_revision, ensure_valid_branch_name};
use crate::jobs::CancelToken;
use crate::state::AppState;

pub async fn list_branches(repo: &Path) -> AppResult<Vec<Branch>> {
    let output = git(
        repo,
        &["for-each-ref", BRANCH_FORMAT, "refs/heads", "refs/remotes"],
    )
    .await?;
    Ok(parse_branches(&output.text()))
}

pub async fn create_branch(
    repo: &Path,
    name: &str,
    start_point: Option<&str>,
    checkout: bool,
) -> AppResult<()> {
    ensure_valid_branch_name(repo, name).await?;
    let name = name.trim();

    let mut args = if checkout {
        vec!["switch", "-c", name]
    } else {
        vec!["branch", name]
    };
    if let Some(start) = start_point.filter(|value| !value.trim().is_empty()) {
        ensure_revision(start)?;
        args.push(start.trim());
    }
    git(repo, &args).await?;
    Ok(())
}

pub async fn switch_branch(repo: &Path, name: &str, track_remote: bool) -> AppResult<()> {
    ensure_valid_branch_name(repo, name).await?;
    let name = name.trim();
    if track_remote {
        git(repo, &["switch", "--track", name]).await?;
    } else {
        git(repo, &["switch", name]).await?;
    }
    Ok(())
}

pub async fn rename_branch(repo: &Path, old_name: &str, new_name: &str) -> AppResult<()> {
    ensure_valid_branch_name(repo, old_name).await?;
    ensure_valid_branch_name(repo, new_name).await?;
    git(repo, &["branch", "-m", old_name.trim(), new_name.trim()]).await?;
    Ok(())
}

pub async fn delete_branch(repo: &Path, name: &str, force: bool) -> AppResult<()> {
    ensure_valid_branch_name(repo, name).await?;
    let flag = if force { "-D" } else { "-d" };
    git(repo, &["branch", flag, name.trim()]).await?;
    Ok(())
}

pub async fn publish_branch(
    repo: &Path,
    name: &str,
    cancel: CancelToken,
    on_progress: &(dyn Fn(Progress) + Send + Sync),
) -> AppResult<()> {
    ensure_valid_branch_name(repo, name).await?;
    let remotes = list_remotes(repo).await?;
    let remote = preferred_remote(&remotes)
        .ok_or_else(|| AppError::new(ErrorKind::NoRemote, "no remotes configured"))?;

    git_streaming(
        Some(repo),
        &["push", "--progress", "-u", &remote.name, name.trim()],
        cancel,
        on_progress,
    )
    .await?;
    Ok(())
}

#[tauri::command]
pub async fn branch_list(path: String) -> AppResult<Vec<Branch>> {
    list_branches(Path::new(&path)).await
}

#[tauri::command]
pub async fn branch_create(
    path: String,
    name: String,
    start_point: Option<String>,
    checkout: bool,
) -> AppResult<()> {
    create_branch(Path::new(&path), &name, start_point.as_deref(), checkout).await
}

#[tauri::command]
pub async fn branch_switch(path: String, name: String, track_remote: bool) -> AppResult<()> {
    switch_branch(Path::new(&path), &name, track_remote).await
}

#[tauri::command]
pub async fn branch_rename(path: String, old_name: String, new_name: String) -> AppResult<()> {
    rename_branch(Path::new(&path), &old_name, &new_name).await
}

#[tauri::command]
pub async fn branch_delete(path: String, name: String, force: bool) -> AppResult<()> {
    if force {
        crate::commands::rescue::guard_branch(Path::new(&path), &name).await;
    }
    delete_branch(Path::new(&path), &name, force).await
}

#[tauri::command]
pub async fn branch_publish(
    state: State<'_, AppState>,
    path: String,
    name: String,
    job_id: String,
    on_progress: Channel<Progress>,
) -> AppResult<()> {
    let guard = state.jobs.register(&job_id);
    publish_branch(Path::new(&path), &name, guard.token(), &|progress| {
        let _ = on_progress.send(progress);
    })
    .await
}
