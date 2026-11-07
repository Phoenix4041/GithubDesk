use crate::error::AppResult;
use crate::github::client::GithubClient;
use crate::update_check::{
    check_latest, not_configured, UpdateStatus, CURRENT_VERSION, UPDATE_REPOSITORY,
};

const RELEASES_API: &str = "https://api.github.com";

#[tauri::command]
pub async fn app_update_check() -> AppResult<UpdateStatus> {
    let Some(repository) = UPDATE_REPOSITORY else {
        return Ok(not_configured());
    };
    let client = GithubClient::new(RELEASES_API, None)?;
    check_latest(&client, repository, CURRENT_VERSION).await
}
