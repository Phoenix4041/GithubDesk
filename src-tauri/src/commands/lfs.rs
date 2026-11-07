use std::path::Path;

use serde::Serialize;
use tauri::ipc::Channel;
use tauri::State;

use crate::error::{AppError, AppResult, ErrorKind};
use crate::git::parse::lfs::{
    parse_lfs_files, parse_lfs_track, parse_lfs_version, LfsFile, LfsPattern,
};
use crate::git::parse::progress::Progress;
use crate::git::runner::{git, git_streaming, git_unchecked};
use crate::jobs::CancelToken;
use crate::state::AppState;

const MAX_LISTED_FILES: usize = 5000;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LfsStatus {
    pub installed: bool,
    pub version: Option<String>,
    pub filters_configured: bool,
    pub hooks_installed: bool,
    pub patterns: Vec<LfsPattern>,
    pub files: Vec<LfsFile>,
    pub files_truncated: bool,
}

fn not_installed() -> AppError {
    AppError::new(ErrorKind::LfsNotInstalled, "git lfs is not available")
}

async fn installed_version(repo: &Path) -> AppResult<Option<String>> {
    let output = git_unchecked(repo, &["lfs", "version"]).await?;
    if !output.success() {
        return Ok(None);
    }
    Ok(parse_lfs_version(&output.text()))
}

async fn require_lfs(repo: &Path) -> AppResult<()> {
    if installed_version(repo).await?.is_none() {
        return Err(not_installed());
    }
    Ok(())
}

async fn hooks_installed(repo: &Path) -> bool {
    let Ok(output) = git(repo, &["rev-parse", "--git-path", "hooks/pre-push"]).await else {
        return false;
    };
    let hook = repo.join(output.trimmed());
    std::fs::read_to_string(hook).is_ok_and(|text| text.contains("git lfs"))
}

pub async fn lfs_status(repo: &Path) -> AppResult<LfsStatus> {
    let Some(version) = installed_version(repo).await? else {
        return Ok(LfsStatus {
            installed: false,
            version: None,
            filters_configured: false,
            hooks_installed: false,
            patterns: Vec::new(),
            files: Vec::new(),
            files_truncated: false,
        });
    };

    let filter = git_unchecked(repo, &["config", "--get", "filter.lfs.clean"]).await?;
    let filters_configured = filter.success() && !filter.trimmed().is_empty();

    let track = git_unchecked(repo, &["lfs", "track"]).await?;
    let patterns = if track.success() {
        parse_lfs_track(&track.text())
    } else {
        Vec::new()
    };

    let listing = git_unchecked(repo, &["lfs", "ls-files", "--long", "--size"]).await?;
    let mut files = if listing.success() {
        parse_lfs_files(&listing.text())
    } else {
        Vec::new()
    };
    let files_truncated = files.len() > MAX_LISTED_FILES;
    files.truncate(MAX_LISTED_FILES);

    Ok(LfsStatus {
        installed: true,
        version: Some(version),
        filters_configured,
        hooks_installed: hooks_installed(repo).await,
        patterns,
        files,
        files_truncated,
    })
}

fn ensure_pattern(value: &str) -> AppResult<&str> {
    let pattern = value.trim();
    if pattern.is_empty()
        || pattern.starts_with('-')
        || pattern.starts_with('#')
        || pattern.chars().any(|character| character.is_control())
    {
        Err(AppError::invalid_input("invalid pattern"))
    } else {
        Ok(pattern)
    }
}

pub async fn lfs_install(repo: &Path) -> AppResult<()> {
    require_lfs(repo).await?;
    git(repo, &["lfs", "install", "--local"]).await?;
    Ok(())
}

pub async fn lfs_track(repo: &Path, pattern: &str) -> AppResult<()> {
    require_lfs(repo).await?;
    let pattern = ensure_pattern(pattern)?;
    git(repo, &["lfs", "track", "--", pattern]).await?;
    Ok(())
}

pub async fn lfs_untrack(repo: &Path, pattern: &str) -> AppResult<()> {
    require_lfs(repo).await?;
    let pattern = ensure_pattern(pattern)?;
    git(repo, &["lfs", "untrack", "--", pattern]).await?;
    Ok(())
}

pub async fn lfs_pull(
    repo: &Path,
    cancel: CancelToken,
    on_progress: &(dyn Fn(Progress) + Send + Sync),
) -> AppResult<()> {
    require_lfs(repo).await?;
    git_streaming(Some(repo), &["lfs", "pull"], cancel, on_progress).await?;
    Ok(())
}

#[tauri::command]
pub async fn lfs_status_get(path: String) -> AppResult<LfsStatus> {
    lfs_status(Path::new(&path)).await
}

#[tauri::command]
pub async fn lfs_install_local(path: String) -> AppResult<()> {
    lfs_install(Path::new(&path)).await
}

#[tauri::command]
pub async fn lfs_track_pattern(path: String, pattern: String) -> AppResult<()> {
    lfs_track(Path::new(&path), &pattern).await
}

#[tauri::command]
pub async fn lfs_untrack_pattern(path: String, pattern: String) -> AppResult<()> {
    lfs_untrack(Path::new(&path), &pattern).await
}

#[tauri::command]
pub async fn lfs_pull_files(
    state: State<'_, AppState>,
    path: String,
    job_id: String,
    on_progress: Channel<Progress>,
) -> AppResult<()> {
    let guard = state.jobs.register(&job_id);
    lfs_pull(Path::new(&path), guard.token(), &|progress| {
        let _ = on_progress.send(progress);
    })
    .await
}
