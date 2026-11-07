use crate::diagnostics;
use crate::error::{AppError, AppResult, ErrorKind};

#[tauri::command]
pub async fn diagnostics_log(source: String, kind: String, detail: String) -> AppResult<()> {
    tokio::task::spawn_blocking(move || diagnostics::record(&source, &kind, &detail))
        .await
        .map_err(|error| AppError::new(ErrorKind::Unknown, error.to_string()))
}

#[tauri::command]
pub async fn diagnostics_open_folder() -> AppResult<()> {
    tokio::task::spawn_blocking(|| {
        let directory = diagnostics::log_directory()
            .ok_or_else(|| AppError::new(ErrorKind::Io, "the log folder is not available"))?;
        std::fs::create_dir_all(&directory)?;
        tauri_plugin_opener::open_path(directory.to_string_lossy().into_owned(), None::<&str>)
            .map_err(|error| AppError::new(ErrorKind::Io, error.to_string()))
    })
    .await
    .map_err(|error| AppError::new(ErrorKind::Unknown, error.to_string()))?
}
