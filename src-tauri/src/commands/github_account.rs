use tauri::State;

use crate::commands::github_pulls::client_for;
use crate::error::AppResult;
use crate::github::accounts::{Account, AccountSource};
use crate::github::device_flow::{
    request_device_code, wait_for_token, DeviceCode, PollTiming, DEVICE_SCOPES,
};
use crate::github::host::Endpoints;
use crate::github::scopes::{token_info, union_scopes, TokenInfo};
use crate::github::system_login::{login_options, LoginMethod, LoginOptions, Tool};
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
pub async fn github_device_start(
    host: String,
    client_id: String,
    scopes: Option<Vec<String>>,
) -> AppResult<DeviceCode> {
    let endpoints = Endpoints::for_host(&host)?;
    let scope = union_scopes(DEVICE_SCOPES, scopes.as_deref().unwrap_or_default())?;
    request_device_code(&endpoints.web_base, &client_id, &scope).await
}

#[tauri::command]
pub async fn github_token_info(
    state: State<'_, AppState>,
    account_id: String,
) -> AppResult<TokenInfo> {
    let client = client_for(&state, &account_id).await?;
    token_info(&client).await
}

#[tauri::command]
pub async fn github_device_finish(
    state: State<'_, AppState>,
    host: String,
    client_id: String,
    code: DeviceCode,
    job_id: String,
    expected_login: Option<String>,
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
        .add_with_token_expecting(
            &host,
            &token,
            AccountSource::Oauth,
            expected_login.as_deref(),
        )
        .await
}

#[tauri::command]
pub async fn github_login_options() -> AppResult<LoginOptions> {
    Ok(login_options(&Tool::git(), &Tool::github_cli()).await)
}

#[tauri::command]
pub async fn github_login_system(
    state: State<'_, AppState>,
    host: String,
    method: LoginMethod,
    job_id: String,
) -> AppResult<Account> {
    let guard = state.jobs.register(&job_id);
    let mut cancel = guard.token();
    state
        .accounts
        .login_with_system(
            &host,
            method,
            &Tool::git(),
            &Tool::github_cli(),
            &mut cancel,
        )
        .await
}
