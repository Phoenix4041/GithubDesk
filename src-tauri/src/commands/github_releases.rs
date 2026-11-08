use tauri::State;

use crate::commands::github_pulls::client_for;
use crate::error::AppResult;
use crate::github::client::Page;
use crate::github::models::{Label, Milestone};
use crate::github::releases::{
    self, GeneratedNotes, LabelEdit, MilestoneEdit, NewRelease, Release, ReleaseAsset, ReleaseEdit,
};
use crate::state::AppState;

#[tauri::command]
pub async fn github_label_create(
    state: State<'_, AppState>,
    account_id: String,
    owner: String,
    repo: String,
    name: String,
    color: String,
    description: String,
) -> AppResult<Label> {
    let client = client_for(&state, &account_id).await?;
    releases::create_label(&client, &owner, &repo, &name, &color, &description).await
}

#[tauri::command]
pub async fn github_label_update(
    state: State<'_, AppState>,
    account_id: String,
    owner: String,
    repo: String,
    name: String,
    edit: LabelEdit,
) -> AppResult<Label> {
    let client = client_for(&state, &account_id).await?;
    releases::update_label(&client, &owner, &repo, &name, &edit).await
}

#[tauri::command]
pub async fn github_label_delete(
    state: State<'_, AppState>,
    account_id: String,
    owner: String,
    repo: String,
    name: String,
) -> AppResult<()> {
    let client = client_for(&state, &account_id).await?;
    releases::delete_label(&client, &owner, &repo, &name).await
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn github_milestone_create(
    state: State<'_, AppState>,
    account_id: String,
    owner: String,
    repo: String,
    title: String,
    description: String,
    due_on: Option<String>,
) -> AppResult<Milestone> {
    let client = client_for(&state, &account_id).await?;
    releases::create_milestone(
        &client,
        &owner,
        &repo,
        &title,
        &description,
        due_on.as_deref(),
    )
    .await
}

#[tauri::command]
pub async fn github_milestone_update(
    state: State<'_, AppState>,
    account_id: String,
    owner: String,
    repo: String,
    number: u64,
    edit: MilestoneEdit,
) -> AppResult<Milestone> {
    let client = client_for(&state, &account_id).await?;
    releases::update_milestone(&client, &owner, &repo, number, &edit).await
}

#[tauri::command]
pub async fn github_milestone_delete(
    state: State<'_, AppState>,
    account_id: String,
    owner: String,
    repo: String,
    number: u64,
) -> AppResult<()> {
    let client = client_for(&state, &account_id).await?;
    releases::delete_milestone(&client, &owner, &repo, number).await
}

#[tauri::command]
pub async fn github_releases_list(
    state: State<'_, AppState>,
    account_id: String,
    owner: String,
    repo: String,
    page: u32,
) -> AppResult<Page<Release>> {
    let client = client_for(&state, &account_id).await?;
    releases::list_releases(&client, &owner, &repo, page).await
}

#[tauri::command]
pub async fn github_release_create(
    state: State<'_, AppState>,
    account_id: String,
    owner: String,
    repo: String,
    request: NewRelease,
) -> AppResult<Release> {
    let client = client_for(&state, &account_id).await?;
    releases::create_release(&client, &owner, &repo, &request).await
}

#[tauri::command]
pub async fn github_release_update(
    state: State<'_, AppState>,
    account_id: String,
    owner: String,
    repo: String,
    id: u64,
    edit: ReleaseEdit,
) -> AppResult<Release> {
    let client = client_for(&state, &account_id).await?;
    releases::update_release(&client, &owner, &repo, id, &edit).await
}

#[tauri::command]
pub async fn github_release_delete(
    state: State<'_, AppState>,
    account_id: String,
    owner: String,
    repo: String,
    id: u64,
) -> AppResult<()> {
    let client = client_for(&state, &account_id).await?;
    releases::delete_release(&client, &owner, &repo, id).await
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn github_release_notes(
    state: State<'_, AppState>,
    account_id: String,
    owner: String,
    repo: String,
    tag: String,
    target: Option<String>,
    previous_tag: Option<String>,
) -> AppResult<GeneratedNotes> {
    let client = client_for(&state, &account_id).await?;
    releases::generate_notes(
        &client,
        &owner,
        &repo,
        &tag,
        target.as_deref(),
        previous_tag.as_deref(),
    )
    .await
}

#[tauri::command]
pub async fn github_release_asset_delete(
    state: State<'_, AppState>,
    account_id: String,
    owner: String,
    repo: String,
    id: u64,
) -> AppResult<()> {
    let client = client_for(&state, &account_id).await?;
    releases::delete_asset(&client, &owner, &repo, id).await
}

#[tauri::command]
pub async fn github_release_asset_upload(
    state: State<'_, AppState>,
    account_id: String,
    owner: String,
    repo: String,
    release_id: u64,
    file: String,
) -> AppResult<ReleaseAsset> {
    let client = client_for(&state, &account_id).await?;
    releases::upload_asset(&client, &owner, &repo, release_id, &file).await
}
