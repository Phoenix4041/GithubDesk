use std::path::Path;

use tauri::State;

use crate::commands::remote::list_remotes;
use crate::error::AppResult;
use crate::git::auth::{set_repo_auth, GitAuth};
use crate::github::host::Endpoints;
use crate::github::remote::{to_remote_repo, RemoteRepo};
use crate::state::AppState;

pub async fn remote_repos(repo: &Path) -> AppResult<Vec<RemoteRepo>> {
    let remotes = list_remotes(repo).await?;
    let mut repos: Vec<RemoteRepo> = remotes
        .iter()
        .filter_map(|remote| to_remote_repo(&remote.name, &remote.url))
        .collect();
    repos.sort_by_key(|repo| repo.remote_name != "origin");
    Ok(repos)
}

pub async fn arm_git_account(
    state: &AppState,
    repo: &Path,
    account_id: Option<&str>,
) -> AppResult<()> {
    let Some(id) = account_id else {
        set_repo_auth(repo, None);
        return Ok(());
    };
    let account = state.accounts.get(id).await?;
    let token = state.accounts.token(id).await?;
    let endpoints = Endpoints::for_host(&account.host)?;
    set_repo_auth(
        repo,
        Some(GitAuth {
            web_base: endpoints.web_base,
            token,
        }),
    );
    Ok(())
}

#[tauri::command]
pub async fn github_repo_remotes(path: String) -> AppResult<Vec<RemoteRepo>> {
    remote_repos(Path::new(&path)).await
}

#[tauri::command]
pub async fn github_set_git_account(
    state: State<'_, AppState>,
    path: String,
    account_id: Option<String>,
) -> AppResult<()> {
    arm_git_account(&state, Path::new(&path), account_id.as_deref()).await
}
