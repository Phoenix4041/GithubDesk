use std::path::PathBuf;
use std::sync::Arc;

use tauri::ipc::Channel;
use tauri::State;

use crate::error::{AppError, AppResult, ErrorKind};
use crate::pty::{
    detect_shells, ensure_session_id, pick_shell, EventSink, ShellOption, TerminalEvent,
};
use crate::state::AppState;

fn join_failure(error: tokio::task::JoinError) -> AppError {
    AppError::new(ErrorKind::Unknown, error.to_string())
}

#[tauri::command]
pub async fn terminal_shells() -> AppResult<Vec<ShellOption>> {
    let shells = tokio::task::spawn_blocking(detect_shells)
        .await
        .map_err(join_failure)?;
    Ok(shells.iter().map(ShellOption::from).collect())
}

#[tauri::command]
pub async fn terminal_open(
    state: State<'_, AppState>,
    session_id: String,
    path: String,
    shell: Option<String>,
    columns: u16,
    rows: u16,
    on_event: Channel<TerminalEvent>,
) -> AppResult<()> {
    ensure_session_id(&session_id)?;
    let registry = state.terminals.clone();
    let sink: EventSink = Arc::new(move |event| {
        let _ = on_event.send(event);
    });
    tokio::task::spawn_blocking(move || {
        let shells = detect_shells();
        let chosen = pick_shell(&shells, shell.as_deref())
            .ok_or_else(|| AppError::new(ErrorKind::TerminalUnavailable, "no shell was found"))?;
        registry.open(
            &session_id,
            &PathBuf::from(path),
            chosen,
            columns,
            rows,
            sink,
        )
    })
    .await
    .map_err(join_failure)?
}

#[tauri::command]
pub async fn terminal_write(
    state: State<'_, AppState>,
    session_id: String,
    data: String,
) -> AppResult<()> {
    let registry = state.terminals.clone();
    tokio::task::spawn_blocking(move || registry.write(&session_id, data.as_bytes()))
        .await
        .map_err(join_failure)?
}

#[tauri::command]
pub async fn terminal_resize(
    state: State<'_, AppState>,
    session_id: String,
    columns: u16,
    rows: u16,
) -> AppResult<()> {
    let registry = state.terminals.clone();
    tokio::task::spawn_blocking(move || registry.resize(&session_id, columns, rows))
        .await
        .map_err(join_failure)?
}

#[tauri::command]
pub async fn terminal_close(state: State<'_, AppState>, session_id: String) -> AppResult<()> {
    let registry = state.terminals.clone();
    tokio::task::spawn_blocking(move || registry.close(&session_id))
        .await
        .map_err(join_failure)
}
