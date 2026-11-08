use reqwest::Method;
use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::error::{AppResult, ErrorKind};
use crate::github::client::GithubClient;
use crate::github::path::ensure_branch_name;
use crate::github::pulls::repo_path;

#[derive(Debug, Clone, Deserialize)]
struct RawOwner {
    login: String,
}

#[derive(Debug, Clone, Deserialize)]
struct RawParent {
    name: String,
    full_name: String,
    owner: RawOwner,
    #[serde(default)]
    clone_url: String,
    #[serde(default)]
    html_url: String,
    #[serde(default)]
    default_branch: String,
}

#[derive(Debug, Clone, Deserialize)]
struct RawRepo {
    #[serde(default)]
    fork: bool,
    #[serde(default)]
    default_branch: String,
    #[serde(default)]
    parent: Option<RawParent>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ForkParent {
    pub owner: String,
    pub name: String,
    pub full_name: String,
    pub clone_url: String,
    pub html_url: String,
    pub default_branch: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ForkInfo {
    pub is_fork: bool,
    pub default_branch: String,
    pub parent: Option<ForkParent>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ForkSyncStatus {
    FastForward,
    Merged,
    UpToDate,
    Conflict,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ForkSyncResult {
    pub status: ForkSyncStatus,
    pub branch: String,
    pub base_branch: String,
    pub message: String,
}

#[derive(Debug, Clone, Deserialize)]
struct RawSync {
    #[serde(default)]
    message: String,
    #[serde(default)]
    merge_type: String,
    #[serde(default)]
    base_branch: String,
}

fn status_of(merge_type: &str) -> ForkSyncStatus {
    match merge_type {
        "fast-forward" => ForkSyncStatus::FastForward,
        "none" => ForkSyncStatus::UpToDate,
        _ => ForkSyncStatus::Merged,
    }
}

pub async fn fork_info(client: &GithubClient, owner: &str, repo: &str) -> AppResult<ForkInfo> {
    let raw: RawRepo = client.get_json(&repo_path(owner, repo)?, &[]).await?;
    let parent = if raw.fork {
        raw.parent.map(|parent| ForkParent {
            owner: parent.owner.login,
            name: parent.name,
            full_name: parent.full_name,
            clone_url: parent.clone_url,
            html_url: parent.html_url,
            default_branch: parent.default_branch,
        })
    } else {
        None
    };
    Ok(ForkInfo {
        is_fork: raw.fork,
        default_branch: raw.default_branch,
        parent,
    })
}

pub async fn sync_fork(
    client: &GithubClient,
    owner: &str,
    repo: &str,
    branch: &str,
) -> AppResult<ForkSyncResult> {
    ensure_branch_name(branch)?;
    let path = format!("{}/merge-upstream", repo_path(owner, repo)?);
    let response: AppResult<RawSync> = client
        .send_json(Method::POST, &path, &json!({ "branch": branch }))
        .await;
    match response {
        Ok(raw) => Ok(ForkSyncResult {
            status: status_of(&raw.merge_type),
            branch: branch.to_string(),
            base_branch: raw.base_branch,
            message: raw.message,
        }),
        Err(error) if error.kind == ErrorKind::GithubNotMergeable => Ok(ForkSyncResult {
            status: ForkSyncStatus::Conflict,
            branch: branch.to_string(),
            base_branch: String::new(),
            message: error.detail,
        }),
        Err(error) => Err(error),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn merge_types_map_to_statuses() {
        assert_eq!(status_of("fast-forward"), ForkSyncStatus::FastForward);
        assert_eq!(status_of("merge"), ForkSyncStatus::Merged);
        assert_eq!(status_of("none"), ForkSyncStatus::UpToDate);
    }
}
