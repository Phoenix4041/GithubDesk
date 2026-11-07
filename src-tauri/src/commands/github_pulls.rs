use std::path::Path;
use std::sync::Arc;

use tauri::ipc::Channel;
use tauri::State;

use crate::commands::remote::list_remotes;
use crate::error::{AppError, AppResult};
use crate::git::parse::progress::Progress;
use crate::git::runner::{git, git_streaming};
use crate::github::client::{GithubClient, Page};
use crate::github::models::{Comment, PullRequest, RepoInfo, Review, ReviewComment};
use crate::github::pulls::{self, MergeResult, NewPull, PullBundle, PullFile};
use crate::jobs::CancelToken;
use crate::state::AppState;

pub async fn client_for(state: &AppState, account_id: &str) -> AppResult<GithubClient> {
    let (_, client) = state
        .accounts
        .client_for(account_id, Some(Arc::clone(&state.etags)))
        .await?;
    Ok(client)
}

pub async fn checkout_pull(
    repo: &Path,
    remote: &str,
    number: u64,
    cancel: CancelToken,
    on_progress: &(dyn Fn(Progress) + Send + Sync),
) -> AppResult<String> {
    let known = list_remotes(repo).await?;
    if !known.iter().any(|candidate| candidate.name == remote) {
        return Err(AppError::invalid_input(format!("unknown remote: {remote}")));
    }
    let branch = format!("pr-{number}");
    let refspec = format!("+refs/pull/{number}/head:refs/heads/{branch}");
    git_streaming(
        Some(repo),
        &["fetch", "--progress", "--update-head-ok", remote, &refspec],
        cancel,
        on_progress,
    )
    .await?;
    git(repo, &["switch", &branch]).await?;
    Ok(branch)
}

#[tauri::command]
pub async fn github_repo_info(
    state: State<'_, AppState>,
    account_id: String,
    owner: String,
    repo: String,
) -> AppResult<RepoInfo> {
    let client = client_for(&state, &account_id).await?;
    pulls::get_repo(&client, &owner, &repo).await
}

#[tauri::command]
pub async fn github_pulls_list(
    state: State<'_, AppState>,
    account_id: String,
    owner: String,
    repo: String,
    pull_state: String,
    page: u32,
) -> AppResult<Page<PullRequest>> {
    let client = client_for(&state, &account_id).await?;
    pulls::list_pulls(&client, &owner, &repo, &pull_state, page).await
}

#[tauri::command]
pub async fn github_pull_get(
    state: State<'_, AppState>,
    account_id: String,
    owner: String,
    repo: String,
    number: u64,
) -> AppResult<PullBundle> {
    let client = client_for(&state, &account_id).await?;
    pulls::get_pull_bundle(&client, &owner, &repo, number).await
}

#[tauri::command]
pub async fn github_pull_files(
    state: State<'_, AppState>,
    account_id: String,
    owner: String,
    repo: String,
    number: u64,
    page: u32,
) -> AppResult<Page<PullFile>> {
    let client = client_for(&state, &account_id).await?;
    pulls::list_pull_files(&client, &owner, &repo, number, page).await
}

#[tauri::command]
pub async fn github_pull_create(
    state: State<'_, AppState>,
    account_id: String,
    owner: String,
    repo: String,
    request: NewPull,
) -> AppResult<PullRequest> {
    let client = client_for(&state, &account_id).await?;
    pulls::create_pull(&client, &owner, &repo, &request).await
}

#[tauri::command]
pub async fn github_pull_comment(
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
pub async fn github_pull_review_comments(
    state: State<'_, AppState>,
    account_id: String,
    owner: String,
    repo: String,
    number: u64,
) -> AppResult<Vec<ReviewComment>> {
    let client = client_for(&state, &account_id).await?;
    pulls::list_review_comments(&client, &owner, &repo, number).await
}

#[tauri::command]
pub async fn github_pull_review_comment_create(
    state: State<'_, AppState>,
    account_id: String,
    owner: String,
    repo: String,
    number: u64,
    request: pulls::NewReviewComment,
) -> AppResult<ReviewComment> {
    let client = client_for(&state, &account_id).await?;
    pulls::create_review_comment(&client, &owner, &repo, number, &request).await
}

#[tauri::command]
pub async fn github_pull_review_comment_reply(
    state: State<'_, AppState>,
    account_id: String,
    owner: String,
    repo: String,
    number: u64,
    comment_id: u64,
    body: String,
) -> AppResult<ReviewComment> {
    let client = client_for(&state, &account_id).await?;
    pulls::reply_to_review_comment(&client, &owner, &repo, number, comment_id, &body).await
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn github_pull_merge(
    state: State<'_, AppState>,
    account_id: String,
    owner: String,
    repo: String,
    number: u64,
    method: String,
    commit_title: Option<String>,
    commit_message: Option<String>,
) -> AppResult<MergeResult> {
    let client = client_for(&state, &account_id).await?;
    pulls::merge_pull(
        &client,
        &owner,
        &repo,
        number,
        &method,
        commit_title.as_deref(),
        commit_message.as_deref(),
    )
    .await
}

#[tauri::command]
pub async fn github_pull_set_state(
    state: State<'_, AppState>,
    account_id: String,
    owner: String,
    repo: String,
    number: u64,
    pull_state: String,
) -> AppResult<PullRequest> {
    let client = client_for(&state, &account_id).await?;
    pulls::set_pull_state(&client, &owner, &repo, number, &pull_state).await
}

#[tauri::command]
pub async fn github_pull_review(
    state: State<'_, AppState>,
    account_id: String,
    owner: String,
    repo: String,
    number: u64,
    event: String,
    body: String,
) -> AppResult<Review> {
    let client = client_for(&state, &account_id).await?;
    pulls::submit_review(&client, &owner, &repo, number, &event, &body).await
}

#[tauri::command]
pub async fn github_pull_checkout(
    state: State<'_, AppState>,
    path: String,
    remote: String,
    number: u64,
    job_id: String,
    on_progress: Channel<Progress>,
) -> AppResult<String> {
    let guard = state.jobs.register(&job_id);
    checkout_pull(
        Path::new(&path),
        &remote,
        number,
        guard.token(),
        &|progress| {
            let _ = on_progress.send(progress);
        },
    )
    .await
}
