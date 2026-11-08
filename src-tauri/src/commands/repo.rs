use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::ipc::Channel;
use tauri::State;

use crate::commands::github_repo::arm_git_account;
use crate::error::{AppError, AppResult, ErrorKind};
use crate::git::auth::set_repo_auth;
use crate::git::parse::progress::Progress;
use crate::git::runner::{git, git_streaming};
use crate::git::validate::{ensure_folder_name, ensure_valid_branch_name};
use crate::jobs::CancelToken;
use crate::state::AppState;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepositoryInfo {
    pub path: String,
    pub name: String,
}

fn repository_name(root: &Path) -> String {
    root.file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_else(|| root.display().to_string())
}

fn directory_has_entries(path: &Path) -> bool {
    std::fs::read_dir(path).is_ok_and(|mut entries| entries.next().is_some())
}

pub async fn open_repository(path: &Path) -> AppResult<RepositoryInfo> {
    if !path.is_dir() {
        return Err(AppError::new(
            ErrorKind::NotARepository,
            path.display().to_string(),
        ));
    }
    let output = git(path, &["rev-parse", "--show-toplevel"]).await?;
    let root: PathBuf = PathBuf::from(output.trimmed()).components().collect();
    Ok(RepositoryInfo {
        path: root.to_string_lossy().into_owned(),
        name: repository_name(&root),
    })
}

pub async fn init_repository(
    parent: &Path,
    name: &str,
    initial_branch: &str,
) -> AppResult<RepositoryInfo> {
    ensure_folder_name(name)?;
    ensure_valid_branch_name(parent, initial_branch).await?;

    let target = parent.join(name.trim());
    if directory_has_entries(&target) {
        return Err(AppError::new(
            ErrorKind::DestinationNotEmpty,
            target.display().to_string(),
        ));
    }
    std::fs::create_dir_all(&target)?;
    git(&target, &["init", "-b", initial_branch.trim()]).await?;
    open_repository(&target).await
}

fn clean_partial_clone(destination: &Path, created: bool) {
    if !destination.exists() {
        return;
    }
    if created {
        let _ = std::fs::remove_dir_all(destination);
        return;
    }
    if let Ok(entries) = std::fs::read_dir(destination) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                let _ = std::fs::remove_dir_all(path);
            } else {
                let _ = std::fs::remove_file(path);
            }
        }
    }
}

pub async fn clone_repository(
    url: &str,
    destination: &Path,
    cancel: CancelToken,
    on_progress: &(dyn Fn(Progress) + Send + Sync),
) -> AppResult<RepositoryInfo> {
    let source = url.trim();
    if source.is_empty() || source.starts_with('-') {
        return Err(AppError::invalid_input("invalid repository url"));
    }
    if directory_has_entries(destination) {
        return Err(AppError::new(
            ErrorKind::DestinationNotEmpty,
            destination.display().to_string(),
        ));
    }

    let created = !destination.exists();
    let parent = destination
        .parent()
        .ok_or_else(|| AppError::invalid_input("invalid destination"))?;
    std::fs::create_dir_all(parent)?;
    let destination_text = destination.to_string_lossy().into_owned();

    let result = git_streaming(
        Some(parent),
        &["clone", "--progress", "--", source, &destination_text],
        cancel,
        on_progress,
    )
    .await;

    match result {
        Ok(_) => open_repository(destination).await,
        Err(error) => {
            clean_partial_clone(destination, created);
            Err(error)
        }
    }
}

#[tauri::command]
pub async fn repo_open(path: String) -> AppResult<RepositoryInfo> {
    open_repository(Path::new(&path)).await
}

#[tauri::command]
pub async fn repo_init(
    parent: String,
    name: String,
    initial_branch: String,
) -> AppResult<RepositoryInfo> {
    init_repository(Path::new(&parent), &name, &initial_branch).await
}

#[tauri::command]
pub async fn repo_clone(
    state: State<'_, AppState>,
    url: String,
    destination: String,
    job_id: String,
    account_id: Option<String>,
    on_progress: Channel<Progress>,
) -> AppResult<RepositoryInfo> {
    let guard = state.jobs.register(&job_id);
    let parent = Path::new(&destination).parent().map(Path::to_path_buf);
    let armed = match (&account_id, &parent) {
        (Some(id), Some(directory)) => {
            arm_git_account(&state, directory, Some(id)).await?;
            true
        }
        _ => false,
    };
    let result = clone_repository(&url, Path::new(&destination), guard.token(), &|progress| {
        let _ = on_progress.send(progress);
    })
    .await;
    if let (true, Some(directory)) = (armed, &parent) {
        set_repo_auth(directory, None);
    }
    result
}
