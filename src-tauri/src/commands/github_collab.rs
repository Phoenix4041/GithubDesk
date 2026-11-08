use tauri::State;

use crate::commands::github_pulls::client_for;
use crate::error::AppResult;
use crate::github::collab::{self, IssueEdit};
use crate::github::models::{Issue, Milestone, TeamRef};
use crate::state::AppState;

#[tauri::command]
pub async fn github_issue_edit(
    state: State<'_, AppState>,
    account_id: String,
    owner: String,
    repo: String,
    number: u64,
    edit: IssueEdit,
) -> AppResult<Issue> {
    let client = client_for(&state, &account_id).await?;
    collab::edit_issue(&client, &owner, &repo, number, &edit).await
}

#[tauri::command]
pub async fn github_pull_request_reviewers(
    state: State<'_, AppState>,
    account_id: String,
    owner: String,
    repo: String,
    number: u64,
    reviewers: Vec<String>,
    teams: Vec<String>,
) -> AppResult<()> {
    let client = client_for(&state, &account_id).await?;
    collab::request_reviewers(&client, &owner, &repo, number, &reviewers, &teams).await
}

#[tauri::command]
pub async fn github_pull_remove_reviewers(
    state: State<'_, AppState>,
    account_id: String,
    owner: String,
    repo: String,
    number: u64,
    reviewers: Vec<String>,
    teams: Vec<String>,
) -> AppResult<()> {
    let client = client_for(&state, &account_id).await?;
    collab::remove_reviewers(&client, &owner, &repo, number, &reviewers, &teams).await
}

#[tauri::command]
pub async fn github_repo_teams(
    state: State<'_, AppState>,
    account_id: String,
    owner: String,
    repo: String,
) -> AppResult<Vec<TeamRef>> {
    let client = client_for(&state, &account_id).await?;
    collab::list_repo_teams(&client, &owner, &repo).await
}

#[tauri::command]
pub async fn github_milestones_list(
    state: State<'_, AppState>,
    account_id: String,
    owner: String,
    repo: String,
    milestone_state: String,
) -> AppResult<Vec<Milestone>> {
    let client = client_for(&state, &account_id).await?;
    collab::list_milestones(&client, &owner, &repo, &milestone_state).await
}

#[tauri::command]
pub async fn github_pull_update_branch(
    state: State<'_, AppState>,
    account_id: String,
    owner: String,
    repo: String,
    number: u64,
) -> AppResult<()> {
    let client = client_for(&state, &account_id).await?;
    collab::update_pull_branch(&client, &owner, &repo, number).await
}

#[tauri::command]
pub async fn github_pull_set_draft(
    state: State<'_, AppState>,
    account_id: String,
    owner: String,
    repo: String,
    number: u64,
    draft: bool,
) -> AppResult<()> {
    let client = client_for(&state, &account_id).await?;
    collab::set_pull_draft(&client, &owner, &repo, number, draft).await
}
