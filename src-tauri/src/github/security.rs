use serde::{Deserialize, Serialize};

use crate::error::AppResult;
use crate::github::client::GithubClient;
use crate::github::pulls::repo_path;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct AlertPackage {
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub ecosystem: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct AlertDependency {
    #[serde(default)]
    pub package: Option<AlertPackage>,
    #[serde(default)]
    pub manifest_path: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct Advisory {
    #[serde(default)]
    pub summary: String,
    #[serde(default)]
    pub severity: String,
    #[serde(default)]
    pub cve_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct SecurityAlert {
    pub number: u64,
    #[serde(default)]
    pub state: String,
    #[serde(default)]
    pub dependency: Option<AlertDependency>,
    pub security_advisory: Advisory,
    #[serde(default)]
    pub html_url: String,
    #[serde(default)]
    pub created_at: String,
}

pub async fn list_alerts(
    client: &GithubClient,
    owner: &str,
    repo: &str,
) -> AppResult<Vec<SecurityAlert>> {
    let path = format!("{}/dependabot/alerts", repo_path(owner, repo)?);
    client
        .get_json(
            &path,
            &[
                ("state", "open".to_string()),
                ("per_page", "50".to_string()),
                ("sort", "created".to_string()),
                ("direction", "desc".to_string()),
            ],
        )
        .await
}
