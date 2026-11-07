use std::path::{Path, PathBuf};

use tauri::ipc::Channel;
use tauri::State;

use crate::error::{AppError, AppResult};
use crate::git::parse::progress::Progress;
use crate::git::parse::submodule::{
    merge_submodules, parse_gitmodules, parse_submodule_status, Submodule,
};
use crate::git::runner::{git, git_streaming, git_unchecked};
use crate::git::validate::{ensure_relative_path, ensure_valid_branch_name};
use crate::jobs::CancelToken;
use crate::state::AppState;

pub async fn list_submodules(repo: &Path) -> AppResult<Vec<Submodule>> {
    let status = git(repo, &["submodule", "status"]).await?;
    let statuses = parse_submodule_status(&status.text());
    if statuses.is_empty() {
        return Ok(Vec::new());
    }
    let config = git_unchecked(
        repo,
        &[
            "config",
            "--file",
            ".gitmodules",
            "--null",
            "--get-regexp",
            "^submodule\\.",
        ],
    )
    .await?;
    let configs = if config.success() {
        parse_gitmodules(&config.text())
    } else {
        Vec::new()
    };
    Ok(merge_submodules(statuses, configs))
}

fn ensure_url(value: &str) -> AppResult<&str> {
    let url = value.trim();
    if url.is_empty() || url.starts_with('-') || url.contains('\0') {
        Err(AppError::invalid_input("invalid submodule url"))
    } else {
        Ok(url)
    }
}

pub async fn add_submodule(
    repo: &Path,
    url: &str,
    path: &str,
    branch: Option<&str>,
    cancel: CancelToken,
    on_progress: &(dyn Fn(Progress) + Send + Sync),
) -> AppResult<()> {
    let url = ensure_url(url)?;
    let path = path.trim();
    ensure_relative_path(path)?;
    let mut args = vec!["submodule", "add", "--progress"];
    if let Some(name) = branch.map(str::trim).filter(|text| !text.is_empty()) {
        ensure_valid_branch_name(repo, name).await?;
        args.push("-b");
        args.push(name);
    }
    args.push("--");
    args.push(url);
    args.push(path);
    git_streaming(Some(repo), &args, cancel, on_progress).await?;
    Ok(())
}

pub async fn update_submodules(
    repo: &Path,
    path: Option<&str>,
    init: bool,
    recursive: bool,
    remote: bool,
    cancel: CancelToken,
    on_progress: &(dyn Fn(Progress) + Send + Sync),
) -> AppResult<()> {
    let mut args = vec!["submodule", "update", "--progress"];
    if init {
        args.push("--init");
    }
    if recursive {
        args.push("--recursive");
    }
    if remote {
        args.push("--remote");
    }
    if let Some(target) = path.map(str::trim).filter(|text| !text.is_empty()) {
        ensure_relative_path(target)?;
        args.push("--");
        args.push(target);
    }
    git_streaming(Some(repo), &args, cancel, on_progress).await?;
    Ok(())
}

pub async fn remove_submodule(repo: &Path, path: &str) -> AppResult<()> {
    let path = path.trim();
    ensure_relative_path(path)?;
    let known = list_submodules(repo).await?;
    let submodule = known
        .iter()
        .find(|item| item.path == path)
        .ok_or_else(|| AppError::invalid_input("the folder is not a submodule"))?;
    let name = submodule.name.clone();

    git(repo, &["submodule", "deinit", "--force", "--", path]).await?;
    git(repo, &["rm", "--force", "--", path]).await?;

    if ensure_relative_path(&name).is_ok() {
        let common = git(repo, &["rev-parse", "--git-common-dir"]).await?;
        let modules: PathBuf = repo.join(common.trimmed()).join("modules").join(&name);
        if modules.is_dir() {
            let _ = std::fs::remove_dir_all(modules);
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn submodule_list(path: String) -> AppResult<Vec<Submodule>> {
    list_submodules(Path::new(&path)).await
}

#[tauri::command]
pub async fn submodule_add(
    state: State<'_, AppState>,
    path: String,
    url: String,
    submodule_path: String,
    branch: Option<String>,
    job_id: String,
    on_progress: Channel<Progress>,
) -> AppResult<()> {
    let guard = state.jobs.register(&job_id);
    add_submodule(
        Path::new(&path),
        &url,
        &submodule_path,
        branch.as_deref(),
        guard.token(),
        &|progress| {
            let _ = on_progress.send(progress);
        },
    )
    .await
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn submodule_update(
    state: State<'_, AppState>,
    path: String,
    submodule_path: Option<String>,
    init: bool,
    recursive: bool,
    remote: bool,
    job_id: String,
    on_progress: Channel<Progress>,
) -> AppResult<()> {
    let guard = state.jobs.register(&job_id);
    update_submodules(
        Path::new(&path),
        submodule_path.as_deref(),
        init,
        recursive,
        remote,
        guard.token(),
        &|progress| {
            let _ = on_progress.send(progress);
        },
    )
    .await
}

#[tauri::command]
pub async fn submodule_remove(path: String, submodule_path: String) -> AppResult<()> {
    remove_submodule(Path::new(&path), &submodule_path).await
}
