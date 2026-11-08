use tauri::State;

use crate::commands::github_pulls::client_for;
use crate::error::AppResult;
use crate::github::client::Page;
use crate::github::orgs::{self, NewRepo, OrgSummary, RepoSummary};
use crate::state::AppState;

#[tauri::command]
pub async fn github_orgs_list(
    state: State<'_, AppState>,
    account_id: String,
) -> AppResult<Vec<OrgSummary>> {
    let client = client_for(&state, &account_id).await?;
    orgs::list_orgs(&client).await
}

#[tauri::command]
pub async fn github_context_repos(
    state: State<'_, AppState>,
    account_id: String,
    org: Option<String>,
    query: Option<String>,
    page: u32,
) -> AppResult<Page<RepoSummary>> {
    let account = state.accounts.get(&account_id).await?;
    let client = client_for(&state, &account_id).await?;
    orgs::list_context_repos(
        &client,
        &account.login,
        org.as_deref(),
        query.as_deref(),
        page,
    )
    .await
}

#[tauri::command]
pub async fn github_repo_create(
    state: State<'_, AppState>,
    account_id: String,
    org: Option<String>,
    request: NewRepo,
) -> AppResult<RepoSummary> {
    let client = client_for(&state, &account_id).await?;
    orgs::create_repo(&client, org.as_deref(), &request).await
}
