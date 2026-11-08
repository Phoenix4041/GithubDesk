use std::path::Path;

use tauri::State;

use crate::commands::github_pulls::client_for;
use crate::error::{AppError, AppResult};
use crate::github::account_keys::{
    self, AccountEmail, AccountGpgKey, AccountSshKey, ProfileUpdate, UserProfile,
};
use crate::github::notifications::{self, Notification};
use crate::github::org_admin::{self, Member, MyMembership, OrgInvitation, Team};
use crate::github::security::{self, SecurityAlert};
use crate::state::AppState;

const MAX_PUBLIC_KEY_FILE: u64 = 16 * 1024;

#[tauri::command]
pub async fn read_public_key_file(path: String) -> AppResult<String> {
    let file = Path::new(path.trim());
    let is_public = file
        .extension()
        .is_some_and(|extension| extension.eq_ignore_ascii_case("pub"));
    if !file.is_absolute() || !is_public {
        return Err(AppError::invalid_input("choose a .pub file"));
    }
    let metadata = tokio::fs::metadata(file)
        .await
        .map_err(|_| AppError::invalid_input("the file does not exist"))?;
    if !metadata.is_file() || metadata.len() > MAX_PUBLIC_KEY_FILE {
        return Err(AppError::invalid_input("the file is not a public key"));
    }
    Ok(tokio::fs::read_to_string(file).await?.trim().to_string())
}

#[tauri::command]
pub async fn github_profile_get(
    state: State<'_, AppState>,
    account_id: String,
) -> AppResult<UserProfile> {
    let client = client_for(&state, &account_id).await?;
    account_keys::get_profile(&client).await
}

#[tauri::command]
pub async fn github_profile_update(
    state: State<'_, AppState>,
    account_id: String,
    update: ProfileUpdate,
) -> AppResult<UserProfile> {
    let client = client_for(&state, &account_id).await?;
    account_keys::update_profile(&client, &update).await
}

#[tauri::command]
pub async fn github_emails_list(
    state: State<'_, AppState>,
    account_id: String,
) -> AppResult<Vec<AccountEmail>> {
    let client = client_for(&state, &account_id).await?;
    account_keys::list_emails(&client).await
}

#[tauri::command]
pub async fn github_ssh_keys_list(
    state: State<'_, AppState>,
    account_id: String,
    signing: bool,
) -> AppResult<Vec<AccountSshKey>> {
    let client = client_for(&state, &account_id).await?;
    account_keys::list_ssh_keys(&client, signing).await
}

#[tauri::command]
pub async fn github_ssh_key_add(
    state: State<'_, AppState>,
    account_id: String,
    signing: bool,
    title: String,
    key: String,
) -> AppResult<AccountSshKey> {
    let client = client_for(&state, &account_id).await?;
    account_keys::add_ssh_key(&client, signing, &title, &key).await
}

#[tauri::command]
pub async fn github_ssh_key_delete(
    state: State<'_, AppState>,
    account_id: String,
    signing: bool,
    id: u64,
) -> AppResult<()> {
    let client = client_for(&state, &account_id).await?;
    account_keys::delete_ssh_key(&client, signing, id).await
}

#[tauri::command]
pub async fn github_gpg_keys_list(
    state: State<'_, AppState>,
    account_id: String,
) -> AppResult<Vec<AccountGpgKey>> {
    let client = client_for(&state, &account_id).await?;
    account_keys::list_gpg_keys(&client).await
}

#[tauri::command]
pub async fn github_gpg_key_add(
    state: State<'_, AppState>,
    account_id: String,
    name: String,
    armored: String,
) -> AppResult<AccountGpgKey> {
    let client = client_for(&state, &account_id).await?;
    account_keys::add_gpg_key(&client, &name, &armored).await
}

#[tauri::command]
pub async fn github_gpg_key_delete(
    state: State<'_, AppState>,
    account_id: String,
    id: u64,
) -> AppResult<()> {
    let client = client_for(&state, &account_id).await?;
    account_keys::delete_gpg_key(&client, id).await
}

#[tauri::command]
pub async fn github_org_membership(
    state: State<'_, AppState>,
    account_id: String,
    org: String,
) -> AppResult<MyMembership> {
    let client = client_for(&state, &account_id).await?;
    org_admin::my_membership(&client, &org).await
}

#[tauri::command]
pub async fn github_org_members(
    state: State<'_, AppState>,
    account_id: String,
    org: String,
    role: String,
) -> AppResult<Vec<Member>> {
    let client = client_for(&state, &account_id).await?;
    org_admin::list_members(&client, &org, &role).await
}

#[tauri::command]
pub async fn github_org_member_role(
    state: State<'_, AppState>,
    account_id: String,
    org: String,
    login: String,
    role: String,
) -> AppResult<()> {
    let client = client_for(&state, &account_id).await?;
    org_admin::set_membership(&client, &org, &login, &role).await
}

#[tauri::command]
pub async fn github_org_member_remove(
    state: State<'_, AppState>,
    account_id: String,
    org: String,
    login: String,
) -> AppResult<()> {
    let client = client_for(&state, &account_id).await?;
    org_admin::remove_membership(&client, &org, &login).await
}

#[tauri::command]
pub async fn github_org_invitations(
    state: State<'_, AppState>,
    account_id: String,
    org: String,
) -> AppResult<Vec<OrgInvitation>> {
    let client = client_for(&state, &account_id).await?;
    org_admin::list_invitations(&client, &org).await
}

#[tauri::command]
pub async fn github_org_invite(
    state: State<'_, AppState>,
    account_id: String,
    org: String,
    who: String,
    role: String,
) -> AppResult<()> {
    let client = client_for(&state, &account_id).await?;
    org_admin::invite(&client, &org, &who, &role).await
}

#[tauri::command]
pub async fn github_org_invitation_cancel(
    state: State<'_, AppState>,
    account_id: String,
    org: String,
    id: u64,
) -> AppResult<()> {
    let client = client_for(&state, &account_id).await?;
    org_admin::cancel_invitation(&client, &org, id).await
}

#[tauri::command]
pub async fn github_org_teams(
    state: State<'_, AppState>,
    account_id: String,
    org: String,
) -> AppResult<Vec<Team>> {
    let client = client_for(&state, &account_id).await?;
    org_admin::list_teams(&client, &org).await
}

#[tauri::command]
pub async fn github_org_team_create(
    state: State<'_, AppState>,
    account_id: String,
    org: String,
    name: String,
    description: String,
    secret: bool,
) -> AppResult<Team> {
    let client = client_for(&state, &account_id).await?;
    org_admin::create_team(&client, &org, &name, &description, secret).await
}

#[tauri::command]
pub async fn github_org_team_delete(
    state: State<'_, AppState>,
    account_id: String,
    org: String,
    slug: String,
) -> AppResult<()> {
    let client = client_for(&state, &account_id).await?;
    org_admin::delete_team(&client, &org, &slug).await
}

#[tauri::command]
pub async fn github_org_team_members(
    state: State<'_, AppState>,
    account_id: String,
    org: String,
    slug: String,
) -> AppResult<Vec<Member>> {
    let client = client_for(&state, &account_id).await?;
    org_admin::list_team_members(&client, &org, &slug).await
}

#[tauri::command]
pub async fn github_org_team_member_add(
    state: State<'_, AppState>,
    account_id: String,
    org: String,
    slug: String,
    login: String,
) -> AppResult<()> {
    let client = client_for(&state, &account_id).await?;
    org_admin::add_team_member(&client, &org, &slug, &login).await
}

#[tauri::command]
pub async fn github_org_team_member_remove(
    state: State<'_, AppState>,
    account_id: String,
    org: String,
    slug: String,
    login: String,
) -> AppResult<()> {
    let client = client_for(&state, &account_id).await?;
    org_admin::remove_team_member(&client, &org, &slug, &login).await
}

#[tauri::command]
pub async fn github_org_outside_collaborators(
    state: State<'_, AppState>,
    account_id: String,
    org: String,
) -> AppResult<Vec<Member>> {
    let client = client_for(&state, &account_id).await?;
    org_admin::list_outside_collaborators(&client, &org).await
}

#[tauri::command]
pub async fn github_org_outside_collaborator_remove(
    state: State<'_, AppState>,
    account_id: String,
    org: String,
    login: String,
) -> AppResult<()> {
    let client = client_for(&state, &account_id).await?;
    org_admin::remove_outside_collaborator(&client, &org, &login).await
}

#[tauri::command]
pub async fn github_notifications_list(
    state: State<'_, AppState>,
    account_id: String,
    all: bool,
) -> AppResult<Vec<Notification>> {
    let client = client_for(&state, &account_id).await?;
    notifications::list_notifications(&client, all).await
}

#[tauri::command]
pub async fn github_notification_read(
    state: State<'_, AppState>,
    account_id: String,
    id: String,
) -> AppResult<()> {
    let client = client_for(&state, &account_id).await?;
    notifications::mark_read(&client, &id).await
}

#[tauri::command]
pub async fn github_notifications_read_all(
    state: State<'_, AppState>,
    account_id: String,
) -> AppResult<()> {
    let client = client_for(&state, &account_id).await?;
    notifications::mark_all_read(&client).await
}

#[tauri::command]
pub async fn github_security_alerts(
    state: State<'_, AppState>,
    account_id: String,
    owner: String,
    repo: String,
) -> AppResult<Vec<SecurityAlert>> {
    let client = client_for(&state, &account_id).await?;
    security::list_alerts(&client, &owner, &repo).await
}
