use tauri::State;

use crate::commands::github_pulls::client_for;
use crate::error::AppResult;
use crate::github::hooks::{self, DeployKey, Hook, HookUpdate, NewHook};
use crate::github::protection::{self, BranchEntry, ProtectionSettings};
use crate::github::repo_admin::{
    self, Collaborator, Invitation, RepoSettings, RepoSettingsPatch, TeamAccess,
};
use crate::state::AppState;

macro_rules! client {
    ($state:expr, $account:expr) => {
        client_for(&$state, &$account).await?
    };
}

#[tauri::command]
pub async fn github_repo_settings_get(
    state: State<'_, AppState>,
    account_id: String,
    owner: String,
    repo: String,
) -> AppResult<RepoSettings> {
    let client = client!(state, account_id);
    repo_admin::get_repo_settings(&client, &owner, &repo).await
}

#[tauri::command]
pub async fn github_repo_settings_update(
    state: State<'_, AppState>,
    account_id: String,
    owner: String,
    repo: String,
    patch: RepoSettingsPatch,
) -> AppResult<RepoSettings> {
    let client = client!(state, account_id);
    repo_admin::update_repo_settings(&client, &owner, &repo, &patch).await
}

#[tauri::command]
pub async fn github_repo_topics_set(
    state: State<'_, AppState>,
    account_id: String,
    owner: String,
    repo: String,
    topics: Vec<String>,
) -> AppResult<Vec<String>> {
    let client = client!(state, account_id);
    repo_admin::replace_topics(&client, &owner, &repo, &topics).await
}

#[tauri::command]
pub async fn github_collaborators_list(
    state: State<'_, AppState>,
    account_id: String,
    owner: String,
    repo: String,
) -> AppResult<Vec<Collaborator>> {
    let client = client!(state, account_id);
    repo_admin::list_collaborators(&client, &owner, &repo).await
}

#[tauri::command]
pub async fn github_collaborator_add(
    state: State<'_, AppState>,
    account_id: String,
    owner: String,
    repo: String,
    login: String,
    permission: String,
) -> AppResult<()> {
    let client = client!(state, account_id);
    repo_admin::add_collaborator(&client, &owner, &repo, &login, &permission).await
}

#[tauri::command]
pub async fn github_collaborator_remove(
    state: State<'_, AppState>,
    account_id: String,
    owner: String,
    repo: String,
    login: String,
) -> AppResult<()> {
    let client = client!(state, account_id);
    repo_admin::remove_collaborator(&client, &owner, &repo, &login).await
}

#[tauri::command]
pub async fn github_invitations_list(
    state: State<'_, AppState>,
    account_id: String,
    owner: String,
    repo: String,
) -> AppResult<Vec<Invitation>> {
    let client = client!(state, account_id);
    repo_admin::list_invitations(&client, &owner, &repo).await
}

#[tauri::command]
pub async fn github_invitation_cancel(
    state: State<'_, AppState>,
    account_id: String,
    owner: String,
    repo: String,
    id: u64,
) -> AppResult<()> {
    let client = client!(state, account_id);
    repo_admin::cancel_invitation(&client, &owner, &repo, id).await
}

#[tauri::command]
pub async fn github_team_access_list(
    state: State<'_, AppState>,
    account_id: String,
    owner: String,
    repo: String,
) -> AppResult<Vec<TeamAccess>> {
    let client = client!(state, account_id);
    repo_admin::list_team_access(&client, &owner, &repo).await
}

#[tauri::command]
pub async fn github_team_access_set(
    state: State<'_, AppState>,
    account_id: String,
    owner: String,
    repo: String,
    team: String,
    permission: String,
) -> AppResult<()> {
    let client = client!(state, account_id);
    repo_admin::set_team_access(&client, &owner, &repo, &team, &permission).await
}

#[tauri::command]
pub async fn github_team_access_remove(
    state: State<'_, AppState>,
    account_id: String,
    owner: String,
    repo: String,
    team: String,
) -> AppResult<()> {
    let client = client!(state, account_id);
    repo_admin::remove_team_access(&client, &owner, &repo, &team).await
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn github_repo_transfer(
    state: State<'_, AppState>,
    account_id: String,
    owner: String,
    repo: String,
    new_owner: String,
    new_name: Option<String>,
    confirmation: String,
) -> AppResult<()> {
    let client = client!(state, account_id);
    repo_admin::transfer_repository(
        &client,
        &owner,
        &repo,
        &new_owner,
        new_name.as_deref(),
        &confirmation,
    )
    .await
}

#[tauri::command]
pub async fn github_repo_delete(
    state: State<'_, AppState>,
    account_id: String,
    owner: String,
    repo: String,
    confirmation: String,
) -> AppResult<()> {
    let client = client!(state, account_id);
    repo_admin::delete_repository(&client, &owner, &repo, &confirmation).await
}

#[tauri::command]
pub async fn github_branches_list(
    state: State<'_, AppState>,
    account_id: String,
    owner: String,
    repo: String,
) -> AppResult<Vec<BranchEntry>> {
    let client = client!(state, account_id);
    protection::list_branches(&client, &owner, &repo).await
}

#[tauri::command]
pub async fn github_protection_get(
    state: State<'_, AppState>,
    account_id: String,
    owner: String,
    repo: String,
    branch: String,
) -> AppResult<Option<ProtectionSettings>> {
    let client = client!(state, account_id);
    protection::get_protection(&client, &owner, &repo, &branch).await
}

#[tauri::command]
pub async fn github_protection_set(
    state: State<'_, AppState>,
    account_id: String,
    owner: String,
    repo: String,
    branch: String,
    settings: ProtectionSettings,
) -> AppResult<()> {
    let client = client!(state, account_id);
    protection::put_protection(&client, &owner, &repo, &branch, &settings).await
}

#[tauri::command]
pub async fn github_protection_remove(
    state: State<'_, AppState>,
    account_id: String,
    owner: String,
    repo: String,
    branch: String,
) -> AppResult<()> {
    let client = client!(state, account_id);
    protection::delete_protection(&client, &owner, &repo, &branch).await
}

#[tauri::command]
pub async fn github_hooks_list(
    state: State<'_, AppState>,
    account_id: String,
    owner: String,
    repo: String,
) -> AppResult<Vec<Hook>> {
    let client = client!(state, account_id);
    hooks::list_hooks(&client, &owner, &repo).await
}

#[tauri::command]
pub async fn github_hook_create(
    state: State<'_, AppState>,
    account_id: String,
    owner: String,
    repo: String,
    request: NewHook,
) -> AppResult<Hook> {
    let client = client!(state, account_id);
    hooks::create_hook(&client, &owner, &repo, &request).await
}

#[tauri::command]
pub async fn github_hook_update(
    state: State<'_, AppState>,
    account_id: String,
    owner: String,
    repo: String,
    id: u64,
    update: HookUpdate,
) -> AppResult<Hook> {
    let client = client!(state, account_id);
    hooks::update_hook(&client, &owner, &repo, id, &update).await
}

#[tauri::command]
pub async fn github_hook_delete(
    state: State<'_, AppState>,
    account_id: String,
    owner: String,
    repo: String,
    id: u64,
) -> AppResult<()> {
    let client = client!(state, account_id);
    hooks::delete_hook(&client, &owner, &repo, id).await
}

#[tauri::command]
pub async fn github_hook_ping(
    state: State<'_, AppState>,
    account_id: String,
    owner: String,
    repo: String,
    id: u64,
) -> AppResult<()> {
    let client = client!(state, account_id);
    hooks::ping_hook(&client, &owner, &repo, id).await
}

#[tauri::command]
pub async fn github_deploy_keys_list(
    state: State<'_, AppState>,
    account_id: String,
    owner: String,
    repo: String,
) -> AppResult<Vec<DeployKey>> {
    let client = client!(state, account_id);
    hooks::list_deploy_keys(&client, &owner, &repo).await
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn github_deploy_key_add(
    state: State<'_, AppState>,
    account_id: String,
    owner: String,
    repo: String,
    title: String,
    key: String,
    read_only: bool,
) -> AppResult<DeployKey> {
    let client = client!(state, account_id);
    hooks::add_deploy_key(&client, &owner, &repo, &title, &key, read_only).await
}

#[tauri::command]
pub async fn github_deploy_key_delete(
    state: State<'_, AppState>,
    account_id: String,
    owner: String,
    repo: String,
    id: u64,
) -> AppResult<()> {
    let client = client!(state, account_id);
    hooks::delete_deploy_key(&client, &owner, &repo, id).await
}
