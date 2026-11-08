use tauri::{AppHandle, Runtime};
use tauri_plugin_updater::{Error as UpdaterError, Update, UpdaterExt};

use crate::error::{AppError, AppResult, ErrorKind};
use crate::update_check::{UpdateStatus, CURRENT_VERSION};

const PLUGIN_NAME: &str = "updater";

pub fn is_configured<R: Runtime>(app: &AppHandle<R>) -> bool {
    app.config().plugins.0.contains_key(PLUGIN_NAME)
}

pub fn register<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    if is_configured(app) {
        app.plugin(tauri_plugin_updater::Builder::new().build())?;
    }
    Ok(())
}

fn map_error(error: UpdaterError) -> AppError {
    let kind = match error {
        UpdaterError::Reqwest(_) | UpdaterError::Network(_) => ErrorKind::NetworkUnavailable,
        _ => ErrorKind::Unknown,
    };
    AppError::new(kind, error.to_string())
}

pub async fn find_update<R: Runtime>(app: &AppHandle<R>) -> AppResult<Option<Update>> {
    let updater = app.updater().map_err(map_error)?;
    updater.check().await.map_err(map_error)
}

pub fn status_of(update: Option<&Update>) -> UpdateStatus {
    UpdateStatus {
        configured: true,
        installable: true,
        current: CURRENT_VERSION.to_string(),
        latest: update.map(|found| found.version.clone()),
        update_available: update.is_some(),
        url: None,
    }
}

pub async fn check<R: Runtime>(app: &AppHandle<R>) -> AppResult<UpdateStatus> {
    let update = find_update(app).await?;
    Ok(status_of(update.as_ref()))
}

pub async fn install<R: Runtime>(app: &AppHandle<R>) -> AppResult<()> {
    let Some(update) = find_update(app).await? else {
        return Err(AppError::invalid_input(
            "there is no newer version to install",
        ));
    };
    update
        .download_and_install(|_, _| {}, || {})
        .await
        .map_err(map_error)
}
