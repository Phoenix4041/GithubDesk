use std::path::Path;

use tauri::State;

use crate::commands::github_pulls::client_for;
use crate::commands::remote::list_remotes;
use crate::error::{AppError, AppResult};
use crate::git::runner::git;
use crate::github::forks::{self, ForkInfo, ForkSyncResult};
use crate::state::AppState;

pub const UPSTREAM_REMOTE: &str = "upstream";

fn valid_remote_url(url: &str) -> bool {
    let allowed = ["https://", "http://", "ssh://", "git@"];
    !url.is_empty()
        && url.len() <= 2048
        && allowed.iter().any(|prefix| url.starts_with(prefix))
        && !url
            .chars()
            .any(|character| character.is_whitespace() || character.is_control())
}

pub async fn add_upstream_remote(repo: &Path, url: &str) -> AppResult<()> {
    let url = url.trim();
    if !valid_remote_url(url) {
        return Err(AppError::invalid_input("invalid remote URL"));
    }
    let remotes = list_remotes(repo).await?;
    if remotes.iter().any(|remote| remote.name == UPSTREAM_REMOTE) {
        return Err(AppError::invalid_input(
            "the upstream remote already exists",
        ));
    }
    git(repo, &["remote", "add", UPSTREAM_REMOTE, url]).await?;
    Ok(())
}

#[tauri::command]
pub async fn github_fork_info(
    state: State<'_, AppState>,
    account_id: String,
    owner: String,
    repo: String,
) -> AppResult<ForkInfo> {
    let client = client_for(&state, &account_id).await?;
    forks::fork_info(&client, &owner, &repo).await
}

#[tauri::command]
pub async fn github_fork_sync(
    state: State<'_, AppState>,
    account_id: String,
    owner: String,
    repo: String,
    branch: String,
) -> AppResult<ForkSyncResult> {
    let client = client_for(&state, &account_id).await?;
    forks::sync_fork(&client, &owner, &repo, &branch).await
}

#[tauri::command]
pub async fn github_fork_add_upstream(path: String, url: String) -> AppResult<()> {
    add_upstream_remote(Path::new(&path), &url).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_plain_remote_urls_are_accepted() {
        for good in [
            "https://github.com/acme/app.git",
            "git@github.com:acme/app.git",
            "ssh://git@host/acme/app.git",
        ] {
            assert!(valid_remote_url(good), "{good}");
        }
        for bad in [
            "",
            "--upload-pack=evil",
            "file:///tmp/x",
            "ext::sh -c x",
            "https://a b",
        ] {
            assert!(!valid_remote_url(bad), "{bad}");
        }
    }
}
