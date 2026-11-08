use std::fmt::Display;

use tauri::AppHandle;
use tauri_plugin_autostart::ManagerExt;

use crate::error::{AppError, AppResult, ErrorKind};
use crate::tray::{self, TrayLabels};

fn unknown(error: impl Display) -> AppError {
    AppError::new(ErrorKind::Unknown, error.to_string())
}

#[tauri::command]
pub async fn tray_set_enabled(
    app: AppHandle,
    enabled: bool,
    labels: Option<TrayLabels>,
) -> AppResult<()> {
    match (enabled, labels) {
        (true, Some(labels)) => tray::enable(&app, &labels).map_err(unknown),
        (true, None) => Err(AppError::invalid_input("the tray needs its labels")),
        (false, _) => {
            tray::disable(&app);
            Ok(())
        }
    }
}

#[tauri::command]
pub async fn tray_set_pending(app: AppHandle, count: u32, tooltip: String) -> AppResult<()> {
    tray::set_pending(&app, count, &tooltip).map_err(unknown)
}

#[tauri::command]
pub async fn autostart_get(app: AppHandle) -> AppResult<bool> {
    app.autolaunch().is_enabled().map_err(unknown)
}

#[tauri::command]
pub async fn autostart_set(app: AppHandle, enabled: bool) -> AppResult<bool> {
    let manager = app.autolaunch();
    if enabled {
        manager.enable().map_err(unknown)?;
    } else {
        manager.disable().map_err(unknown)?;
    }
    manager.is_enabled().map_err(unknown)
}
