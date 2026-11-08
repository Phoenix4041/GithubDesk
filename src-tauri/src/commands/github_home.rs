use std::path::Path;

use tauri::ipc::Channel;
use tauri::State;

use crate::commands::github_pulls::client_for;
use crate::commands::github_repo::arm_git_account;
use crate::commands::remote::list_remotes;
use crate::error::{AppError, AppResult, ErrorKind};
use crate::git::parse::progress::Progress;
use crate::git::runner::{git, git_streaming, git_unchecked};
use crate::github::client::GithubClient;
use crate::github::inbox::{load_inbox, Inbox};
use crate::github::orgs::{create_repo, NewRepo, RepoSummary};
use crate::jobs::CancelToken;
use crate::state::AppState;

const PRIMARY_REMOTE: &str = "origin";
const FALLBACK_REMOTE: &str = "github";

pub async fn publish_repository(
    repo: &Path,
    client: &GithubClient,
    org: Option<&str>,
    request: &NewRepo,
    cancel: CancelToken,
    on_progress: &(dyn Fn(Progress) + Send + Sync),
) -> AppResult<RepoSummary> {
    let head = git_unchecked(repo, &["rev-parse", "--verify", "-q", "HEAD"]).await?;
    if !head.success() {
        return Err(AppError::new(
            ErrorKind::NoCommits,
            "there is nothing to publish yet",
        ));
    }
    let branch_output = git_unchecked(repo, &["symbolic-ref", "--short", "-q", "HEAD"]).await?;
    if !branch_output.success() {
        return Err(AppError::invalid_input(
            "check out a branch before publishing",
        ));
    }
    let branch = branch_output.trimmed();

    let remotes = list_remotes(repo).await?;
    let taken = |name: &str| remotes.iter().any(|remote| remote.name == name);
    let remote_name = if !taken(PRIMARY_REMOTE) {
        PRIMARY_REMOTE
    } else if !taken(FALLBACK_REMOTE) {
        FALLBACK_REMOTE
    } else {
        return Err(AppError::invalid_input(
            "the remotes origin and github already exist",
        ));
    };

    let mut request = request.clone();
    request.auto_init = false;
    let created = create_repo(client, org, &request).await?;

    git(repo, &["remote", "add", remote_name, &created.clone_url]).await?;
    git_streaming(
        Some(repo),
        &["push", "--progress", "-u", remote_name, &branch],
        cancel,
        on_progress,
    )
    .await?;
    Ok(created)
}

#[tauri::command]
pub async fn github_inbox(
    state: State<'_, AppState>,
    account_id: String,
    org: Option<String>,
) -> AppResult<Inbox> {
    let account = state.accounts.get(&account_id).await?;
    let client = client_for(&state, &account_id).await?;
    load_inbox(&client, &account.login, org.as_deref()).await
}

#[tauri::command]
pub async fn github_publish_repository(
    state: State<'_, AppState>,
    path: String,
    account_id: String,
    org: Option<String>,
    request: NewRepo,
    job_id: String,
    on_progress: Channel<Progress>,
) -> AppResult<RepoSummary> {
    let client = client_for(&state, &account_id).await?;
    arm_git_account(&state, Path::new(&path), Some(&account_id)).await?;
    let guard = state.jobs.register(&job_id);
    publish_repository(
        Path::new(&path),
        &client,
        org.as_deref(),
        &request,
        guard.token(),
        &|progress| {
            let _ = on_progress.send(progress);
        },
    )
    .await
}
