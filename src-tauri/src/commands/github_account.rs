use tauri::State;

use crate::error::AppResult;
use crate::github::accounts::{Account, AccountSource};
use crate::github::device_flow::{
    request_device_code, wait_for_token, DeviceCode, PollTiming, DEVICE_SCOPES,
};
use crate::github::host::Endpoints;
use crate::state::AppState;

#[tauri::command]
pub async fn github_accounts_list(state: State<'_, AppState>) -> AppResult<Vec<Account>> {
    state.accounts.list().await
}

#[tauri::command]
pub async fn github_account_add_token(
    state: State<'_, AppState>,
    host: String,
    token: String,
) -> AppResult<Account> {
    state
        .accounts
        .add_with_token(&host, &token, AccountSource::Token)
        .await
}

#[tauri::command]
pub async fn github_account_remove(state: State<'_, AppState>, id: String) -> AppResult<()> {
    state.accounts.remove(&id).await
}

#[tauri::command]
pub async fn github_device_start(host: String, client_id: String) -> AppResult<DeviceCode> {
    let endpoints = Endpoints::for_host(&host)?;
    request_device_code(&endpoints.web_base, &client_id, DEVICE_SCOPES).await
}

#[tauri::command]
pub async fn github_device_finish(
    state: State<'_, AppState>,
    host: String,
    client_id: String,
    code: DeviceCode,
    job_id: String,
) -> AppResult<Account> {
    let endpoints = Endpoints::for_host(&host)?;
    let guard = state.jobs.register(&job_id);
    let token = wait_for_token(
        &endpoints.web_base,
        &client_id,
        &code.device_code,
        PollTiming::from_code(&code),
        guard.token(),
    )
    .await?;
    state
        .accounts
        .add_with_token(&host, &token, AccountSource::Oauth)
        .await
}
