use std::path::PathBuf;

use tauri::{AppHandle, State};

use crate::error::AppResult;
use crate::state::AppState;
use crate::watcher::start_watching;

#[tauri::command]
pub fn watch_start(app: AppHandle, state: State<'_, AppState>, path: String) -> AppResult<()> {
    let watcher = start_watching(app, PathBuf::from(path))?;
    let mut slot = state
        .watcher
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    *slot = Some(watcher);
    Ok(())
}

#[tauri::command]
pub fn watch_stop(state: State<'_, AppState>) {
    let mut slot = state
        .watcher
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    *slot = None;
}
