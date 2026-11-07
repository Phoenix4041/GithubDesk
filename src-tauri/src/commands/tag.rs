use std::path::Path;

use tauri::ipc::Channel;
use tauri::State;

use crate::commands::remote::list_remotes;
use crate::error::{AppError, AppResult, ErrorKind};
use crate::git::parse::progress::Progress;
use crate::git::parse::remote::preferred_remote;
use crate::git::parse::tag::{parse_tags, Tag, TAG_FORMAT};
use crate::git::runner::{git, git_streaming};
use crate::git::validate::{ensure_revision, ensure_valid_tag_name};
use crate::jobs::CancelToken;
use crate::state::AppState;

pub async fn list_tags(repo: &Path) -> AppResult<Vec<Tag>> {
    let output = git(
        repo,
        &[
            "for-each-ref",
            "--sort=-creatordate",
            TAG_FORMAT,
            "refs/tags",
        ],
    )
    .await?;
    Ok(parse_tags(&output.text()))
}

pub async fn create_tag(
    repo: &Path,
    name: &str,
    target: Option<&str>,
    message: Option<&str>,
) -> AppResult<()> {
    ensure_valid_tag_name(repo, name).await?;
    let name = name.trim();
    let target = target
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("HEAD");
    ensure_revision(target)?;
    let message = message.map(str::trim).filter(|value| !value.is_empty());

    match message {
        Some(text) => git(repo, &["tag", "-a", name, "-m", text, target]).await?,
        None => git(repo, &["tag", name, target]).await?,
    };
    Ok(())
}

pub async fn delete_tag(repo: &Path, name: &str) -> AppResult<()> {
    ensure_valid_tag_name(repo, name).await?;
    git(repo, &["tag", "-d", name.trim()]).await?;
    Ok(())
}

async fn remote_name(repo: &Path) -> AppResult<String> {
    let remotes = list_remotes(repo).await?;
    preferred_remote(&remotes)
        .map(|remote| remote.name.clone())
        .ok_or_else(|| AppError::new(ErrorKind::NoRemote, "no remotes configured"))
}

pub async fn push_tag(
    repo: &Path,
    name: &str,
    cancel: CancelToken,
    on_progress: &(dyn Fn(Progress) + Send + Sync),
) -> AppResult<()> {
    ensure_valid_tag_name(repo, name).await?;
    let remote = remote_name(repo).await?;
    let reference = format!("refs/tags/{}", name.trim());
    git_streaming(
        Some(repo),
        &["push", "--progress", &remote, &reference],
        cancel,
        on_progress,
    )
    .await?;
    Ok(())
}

pub async fn delete_remote_tag(
    repo: &Path,
    name: &str,
    cancel: CancelToken,
    on_progress: &(dyn Fn(Progress) + Send + Sync),
) -> AppResult<()> {
    ensure_valid_tag_name(repo, name).await?;
    let remote = remote_name(repo).await?;
    let reference = format!("refs/tags/{}", name.trim());
    git_streaming(
        Some(repo),
        &["push", "--progress", &remote, "--delete", &reference],
        cancel,
        on_progress,
    )
    .await?;
    Ok(())
}

#[tauri::command]
pub async fn tag_list(path: String) -> AppResult<Vec<Tag>> {
    list_tags(Path::new(&path)).await
}

#[tauri::command]
pub async fn tag_create(
    path: String,
    name: String,
    target: Option<String>,
    message: Option<String>,
) -> AppResult<()> {
    create_tag(
        Path::new(&path),
        &name,
        target.as_deref(),
        message.as_deref(),
    )
    .await
}

#[tauri::command]
pub async fn tag_delete(path: String, name: String) -> AppResult<()> {
    delete_tag(Path::new(&path), &name).await
}

#[tauri::command]
pub async fn tag_push(
    state: State<'_, AppState>,
    path: String,
    name: String,
    job_id: String,
    on_progress: Channel<Progress>,
) -> AppResult<()> {
    let guard = state.jobs.register(&job_id);
    push_tag(Path::new(&path), &name, guard.token(), &|progress| {
        let _ = on_progress.send(progress);
    })
    .await
}

#[tauri::command]
pub async fn tag_delete_remote(
    state: State<'_, AppState>,
    path: String,
    name: String,
    job_id: String,
    on_progress: Channel<Progress>,
) -> AppResult<()> {
    let guard = state.jobs.register(&job_id);
    delete_remote_tag(Path::new(&path), &name, guard.token(), &|progress| {
        let _ = on_progress.send(progress);
    })
    .await
}
