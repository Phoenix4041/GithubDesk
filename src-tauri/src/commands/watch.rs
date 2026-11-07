use std::path::PathBuf;

use tauri::{AppHandle, State};

use crate::error::{AppError, AppResult, ErrorKind};
use crate::state::AppState;
use crate::watcher::{start_watching, RepoWatcher};

fn replace_watcher(state: &AppState, watcher: Option<RepoWatcher>) -> Option<RepoWatcher> {
    let mut slot = state
        .watcher
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    std::mem::replace(&mut *slot, watcher)
}

#[tauri::command]
pub async fn watch_start(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
) -> AppResult<()> {
    let watcher =
        tauri::async_runtime::spawn_blocking(move || start_watching(app, PathBuf::from(path)))
            .await
            .map_err(|error| AppError::new(ErrorKind::Io, error.to_string()))??;
    let previous = replace_watcher(&state, Some(watcher));
    drop(previous);
    Ok(())
}

#[tauri::command]
pub async fn watch_stop(state: State<'_, AppState>) -> AppResult<()> {
    let previous = replace_watcher(&state, None);
    drop(previous);
    Ok(())
}
