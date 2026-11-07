use tauri::State;

use crate::commands::github_pulls::client_for;
use crate::error::AppResult;
use crate::github::client::Page;
use crate::github::issues::{self, IssueBundle, NewIssue};
use crate::github::models::{Comment, Issue, Label, UserRef};
use crate::github::pulls;
use crate::state::AppState;

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn github_issues_list(
    state: State<'_, AppState>,
    account_id: String,
    owner: String,
    repo: String,
    issue_state: String,
    label: Option<String>,
    search: Option<String>,
    page: u32,
) -> AppResult<Page<Issue>> {
    let client = client_for(&state, &account_id).await?;
    issues::list_issues(
        &client,
        &owner,
        &repo,
        &issue_state,
        label.as_deref(),
        search.as_deref(),
        page,
    )
    .await
}

#[tauri::command]
pub async fn github_issue_get(
    state: State<'_, AppState>,
    account_id: String,
    owner: String,
    repo: String,
    number: u64,
) -> AppResult<IssueBundle> {
    let client = client_for(&state, &account_id).await?;
    issues::get_issue_bundle(&client, &owner, &repo, number).await
}

#[tauri::command]
pub async fn github_issue_create(
    state: State<'_, AppState>,
    account_id: String,
    owner: String,
    repo: String,
    request: NewIssue,
) -> AppResult<Issue> {
    let client = client_for(&state, &account_id).await?;
    issues::create_issue(&client, &owner, &repo, &request).await
}

#[tauri::command]
pub async fn github_issue_comment(
    state: State<'_, AppState>,
    account_id: String,
    owner: String,
    repo: String,
    number: u64,
    body: String,
) -> AppResult<Comment> {
    let client = client_for(&state, &account_id).await?;
    pulls::add_comment(&client, &owner, &repo, number, &body).await
}

#[tauri::command]
pub async fn github_issue_set_state(
    state: State<'_, AppState>,
    account_id: String,
    owner: String,
    repo: String,
    number: u64,
    issue_state: String,
    reason: Option<String>,
) -> AppResult<Issue> {
    let client = client_for(&state, &account_id).await?;
    issues::set_issue_state(
        &client,
        &owner,
        &repo,
        number,
        &issue_state,
        reason.as_deref(),
    )
    .await
}

#[tauri::command]
pub async fn github_labels_list(
    state: State<'_, AppState>,
    account_id: String,
    owner: String,
    repo: String,
) -> AppResult<Vec<Label>> {
    let client = client_for(&state, &account_id).await?;
    issues::list_labels(&client, &owner, &repo).await
}

#[tauri::command]
pub async fn github_assignees_list(
    state: State<'_, AppState>,
    account_id: String,
    owner: String,
    repo: String,
) -> AppResult<Vec<UserRef>> {
    let client = client_for(&state, &account_id).await?;
    issues::list_assignees(&client, &owner, &repo).await
}
