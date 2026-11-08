use tauri::AppHandle;

use crate::error::AppResult;
use crate::github::client::GithubClient;
use crate::self_update;
use crate::update_check::{
    check_latest, not_configured, UpdateStatus, CURRENT_VERSION, UPDATE_REPOSITORY,
};

const RELEASES_API: &str = "https://api.github.com";

#[tauri::command]
pub async fn app_update_check(app: AppHandle) -> AppResult<UpdateStatus> {
    if self_update::is_configured(&app) {
        return self_update::check(&app).await;
    }
    let Some(repository) = UPDATE_REPOSITORY else {
        return Ok(not_configured());
    };
    let client = GithubClient::new(RELEASES_API, None)?;
    check_latest(&client, repository, CURRENT_VERSION).await
}

#[tauri::command]
pub async fn app_update_install(app: AppHandle) -> AppResult<()> {
    if !self_update::is_configured(&app) {
        return Err(crate::error::AppError::invalid_input(
            "the updater has no signing key configured",
        ));
    }
    self_update::install(&app).await?;
    app.restart()
}
