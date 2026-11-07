use std::path::Path;

use tauri::ipc::Channel;
use tauri::State;

use crate::error::{AppError, AppResult, ErrorKind};
use crate::git::parse::progress::Progress;
use crate::git::parse::remote::{parse_remotes, Remote};
use crate::git::runner::{git_streaming, git_unchecked};
use crate::jobs::CancelToken;
use crate::state::AppState;

pub async fn list_remotes(repo: &Path) -> AppResult<Vec<Remote>> {
    let output = git_unchecked(
        repo,
        &["config", "--get-regexp", "-z", "^remote\\..+\\.url$"],
    )
    .await?;
    if output.exit_code == 1 {
        return Ok(Vec::new());
    }
    if !output.success() {
        return Err(AppError::from_git_failure("", &output.stderr));
    }
    Ok(parse_remotes(&output.stdout))
}

async fn require_remote(repo: &Path) -> AppResult<()> {
    if list_remotes(repo).await?.is_empty() {
        return Err(AppError::new(ErrorKind::NoRemote, "no remotes configured"));
    }
    Ok(())
}

pub async fn fetch_all(
    repo: &Path,
    cancel: CancelToken,
    on_progress: &(dyn Fn(Progress) + Send + Sync),
) -> AppResult<()> {
    require_remote(repo).await?;
    git_streaming(
        Some(repo),
        &["fetch", "--all", "--prune", "--progress"],
        cancel,
        on_progress,
    )
    .await?;
    Ok(())
}

pub async fn pull_current(
    repo: &Path,
    cancel: CancelToken,
    on_progress: &(dyn Fn(Progress) + Send + Sync),
) -> AppResult<()> {
    require_remote(repo).await?;
    let strategy_configured = git_unchecked(repo, &["config", "--get", "pull.rebase"])
        .await?
        .success();

    let mut args = vec!["pull", "--progress", "--no-edit"];
    if !strategy_configured {
        args.push("--no-rebase");
    }
    git_streaming(Some(repo), &args, cancel, on_progress).await?;
    Ok(())
}

pub async fn push_current(
    repo: &Path,
    cancel: CancelToken,
    on_progress: &(dyn Fn(Progress) + Send + Sync),
) -> AppResult<()> {
    require_remote(repo).await?;
    git_streaming(Some(repo), &["push", "--progress"], cancel, on_progress).await?;
    Ok(())
}

#[tauri::command]
pub async fn remote_list(path: String) -> AppResult<Vec<Remote>> {
    list_remotes(Path::new(&path)).await
}

#[tauri::command]
pub async fn remote_fetch(
    state: State<'_, AppState>,
    path: String,
    job_id: String,
    on_progress: Channel<Progress>,
) -> AppResult<()> {
    let guard = state.jobs.register(&job_id);
    fetch_all(Path::new(&path), guard.token(), &|progress| {
        let _ = on_progress.send(progress);
    })
    .await
}

#[tauri::command]
pub async fn remote_pull(
    state: State<'_, AppState>,
    path: String,
    job_id: String,
    on_progress: Channel<Progress>,
) -> AppResult<()> {
    let guard = state.jobs.register(&job_id);
    pull_current(Path::new(&path), guard.token(), &|progress| {
        let _ = on_progress.send(progress);
    })
    .await
}

#[tauri::command]
pub async fn remote_push(
    state: State<'_, AppState>,
    path: String,
    job_id: String,
    on_progress: Channel<Progress>,
) -> AppResult<()> {
    let guard = state.jobs.register(&job_id);
    push_current(Path::new(&path), guard.token(), &|progress| {
        let _ = on_progress.send(progress);
    })
    .await
}
