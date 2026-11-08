use tauri::State;

use crate::commands::github_pulls::client_for;
use crate::error::AppResult;
use crate::github::actions_secrets::{self, ActionsSecret, ActionsVariable, Scope};
use crate::state::AppState;

fn scope<'a>(owner: &'a str, repo: &'a str, org: &'a Option<String>) -> Scope<'a> {
    match org {
        Some(org) => Scope::Organization { org },
        None => Scope::Repository { owner, repo },
    }
}

#[tauri::command]
pub async fn github_actions_secrets_list(
    state: State<'_, AppState>,
    account_id: String,
    owner: String,
    repo: String,
    org: Option<String>,
) -> AppResult<Vec<ActionsSecret>> {
    let client = client_for(&state, &account_id).await?;
    actions_secrets::list_secrets(&client, scope(&owner, &repo, &org)).await
}

#[tauri::command]
pub async fn github_actions_variables_list(
    state: State<'_, AppState>,
    account_id: String,
    owner: String,
    repo: String,
    org: Option<String>,
) -> AppResult<Vec<ActionsVariable>> {
    let client = client_for(&state, &account_id).await?;
    actions_secrets::list_variables(&client, scope(&owner, &repo, &org)).await
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn github_actions_secret_put(
    state: State<'_, AppState>,
    account_id: String,
    owner: String,
    repo: String,
    org: Option<String>,
    name: String,
    value: String,
    visibility: Option<String>,
) -> AppResult<()> {
    let client = client_for(&state, &account_id).await?;
    actions_secrets::put_secret(
        &client,
        scope(&owner, &repo, &org),
        &name,
        &value,
        visibility.as_deref(),
    )
    .await
}

#[tauri::command]
pub async fn github_actions_secret_delete(
    state: State<'_, AppState>,
    account_id: String,
    owner: String,
    repo: String,
    org: Option<String>,
    name: String,
) -> AppResult<()> {
    let client = client_for(&state, &account_id).await?;
    actions_secrets::delete_secret(&client, scope(&owner, &repo, &org), &name).await
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn github_actions_variable_create(
    state: State<'_, AppState>,
    account_id: String,
    owner: String,
    repo: String,
    org: Option<String>,
    name: String,
    value: String,
    visibility: Option<String>,
) -> AppResult<()> {
    let client = client_for(&state, &account_id).await?;
    actions_secrets::create_variable(
        &client,
        scope(&owner, &repo, &org),
        &name,
        &value,
        visibility.as_deref(),
    )
    .await
}

#[tauri::command]
pub async fn github_actions_variable_update(
    state: State<'_, AppState>,
    account_id: String,
    owner: String,
    repo: String,
    org: Option<String>,
    name: String,
    value: String,
) -> AppResult<()> {
    let client = client_for(&state, &account_id).await?;
    actions_secrets::update_variable(&client, scope(&owner, &repo, &org), &name, &value).await
}

#[tauri::command]
pub async fn github_actions_variable_delete(
    state: State<'_, AppState>,
    account_id: String,
    owner: String,
    repo: String,
    org: Option<String>,
    name: String,
) -> AppResult<()> {
    let client = client_for(&state, &account_id).await?;
    actions_secrets::delete_variable(&client, scope(&owner, &repo, &org), &name).await
}
