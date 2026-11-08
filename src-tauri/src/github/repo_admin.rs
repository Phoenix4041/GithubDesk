use reqwest::Method;
use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::error::{AppError, AppResult};
use crate::github::client::GithubClient;
use crate::github::orgs::{ensure_login, ensure_repo_name};
use crate::github::path::{encode_segment, ensure_branch_name, ensure_slug};
use crate::github::pulls::repo_path;

const MAX_DESCRIPTION: usize = 350;
const MAX_HOMEPAGE: usize = 255;
const MAX_TOPICS: usize = 20;
const MAX_TOPIC_LENGTH: usize = 50;
const LIST_PAGE_SIZE: &str = "100";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct OwnerRef {
    pub login: String,
    #[serde(default, rename(serialize = "kind", deserialize = "type"))]
    pub kind: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct RepoSettings {
    pub name: String,
    pub full_name: String,
    pub owner: OwnerRef,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub homepage: Option<String>,
    #[serde(default)]
    pub private: bool,
    #[serde(default)]
    pub archived: bool,
    #[serde(default)]
    pub fork: bool,
    #[serde(default)]
    pub default_branch: String,
    #[serde(default)]
    pub topics: Vec<String>,
    #[serde(default)]
    pub has_issues: bool,
    #[serde(default)]
    pub has_wiki: bool,
    #[serde(default)]
    pub has_projects: bool,
    #[serde(default)]
    pub allow_merge_commit: bool,
    #[serde(default)]
    pub allow_squash_merge: bool,
    #[serde(default)]
    pub allow_rebase_merge: bool,
    #[serde(default)]
    pub allow_auto_merge: bool,
    #[serde(default)]
    pub delete_branch_on_merge: bool,
    #[serde(default)]
    pub html_url: String,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all(serialize = "snake_case", deserialize = "camelCase"))]
pub struct RepoSettingsPatch {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub homepage: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub private: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub default_branch: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub has_issues: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub has_wiki: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub has_projects: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub allow_merge_commit: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub allow_squash_merge: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub allow_rebase_merge: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub allow_auto_merge: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub delete_branch_on_merge: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub archived: Option<bool>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct CollaboratorPermissions {
    #[serde(default)]
    pub admin: bool,
    #[serde(default)]
    pub maintain: bool,
    #[serde(default)]
    pub push: bool,
    #[serde(default)]
    pub triage: bool,
    #[serde(default)]
    pub pull: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct Collaborator {
    pub login: String,
    #[serde(default)]
    pub avatar_url: String,
    #[serde(default)]
    pub html_url: String,
    #[serde(default)]
    pub role_name: String,
    #[serde(default)]
    pub permissions: Option<CollaboratorPermissions>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct InvitationUser {
    pub login: String,
    #[serde(default)]
    pub avatar_url: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct Invitation {
    pub id: u64,
    #[serde(default)]
    pub invitee: Option<InvitationUser>,
    #[serde(default)]
    pub permissions: String,
    #[serde(default)]
    pub created_at: String,
    #[serde(default)]
    pub html_url: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct TeamAccess {
    pub slug: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub permission: String,
}

#[derive(Serialize)]
struct PermissionBody<'a> {
    permission: &'a str,
}

#[derive(Serialize)]
struct TransferBody<'a> {
    new_owner: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    new_name: Option<&'a str>,
}

#[derive(Deserialize)]
struct TopicsResponse {
    #[serde(default)]
    names: Vec<String>,
}

pub fn ensure_permission(permission: &str) -> AppResult<()> {
    if matches!(
        permission,
        "pull" | "triage" | "push" | "maintain" | "admin"
    ) {
        Ok(())
    } else {
        Err(AppError::invalid_input(format!(
            "invalid permission: {permission}"
        )))
    }
}

pub fn ensure_confirmation(owner: &str, repo: &str, typed: &str) -> AppResult<()> {
    if typed == format!("{owner}/{repo}") {
        Ok(())
    } else {
        Err(AppError::invalid_input(
            "the typed name does not match the repository",
        ))
    }
}

fn validate_patch(patch: &RepoSettingsPatch) -> AppResult<()> {
    if let Some(name) = &patch.name {
        ensure_repo_name(name.trim())?;
    }
    if let Some(description) = &patch.description {
        if description.chars().count() > MAX_DESCRIPTION
            || description.chars().any(char::is_control)
        {
            return Err(AppError::invalid_input("invalid description"));
        }
    }
    if let Some(homepage) = &patch.homepage {
        let trimmed = homepage.trim();
        let valid = trimmed.is_empty()
            || (trimmed.len() <= MAX_HOMEPAGE
                && (trimmed.starts_with("https://") || trimmed.starts_with("http://"))
                && !trimmed
                    .chars()
                    .any(|character| character.is_control() || character.is_whitespace()));
        if !valid {
            return Err(AppError::invalid_input("invalid homepage address"));
        }
    }
    if let Some(branch) = &patch.default_branch {
        ensure_branch_name(branch)?;
    }
    Ok(())
}

pub fn validate_topics(topics: &[String]) -> AppResult<Vec<String>> {
    if topics.len() > MAX_TOPICS {
        return Err(AppError::invalid_input("too many topics"));
    }
    let mut cleaned: Vec<String> = Vec::new();
    for topic in topics {
        let name = topic.trim().to_lowercase();
        let valid = !name.is_empty()
            && name.len() <= MAX_TOPIC_LENGTH
            && !name.starts_with('-')
            && name.chars().all(|character| {
                character.is_ascii_lowercase() || character.is_ascii_digit() || character == '-'
            });
        if !valid {
            return Err(AppError::invalid_input(format!("invalid topic: {topic}")));
        }
        if !cleaned.contains(&name) {
            cleaned.push(name);
        }
    }
    Ok(cleaned)
}

pub async fn get_repo_settings(
    client: &GithubClient,
    owner: &str,
    repo: &str,
) -> AppResult<RepoSettings> {
    client.get_json(&repo_path(owner, repo)?, &[]).await
}

pub async fn update_repo_settings(
    client: &GithubClient,
    owner: &str,
    repo: &str,
    patch: &RepoSettingsPatch,
) -> AppResult<RepoSettings> {
    validate_patch(patch)?;
    let mut clean = patch.clone();
    clean.name = clean.name.map(|name| name.trim().to_string());
    clean.homepage = clean.homepage.map(|homepage| homepage.trim().to_string());
    client
        .send_json(Method::PATCH, &repo_path(owner, repo)?, &clean)
        .await
}

pub async fn replace_topics(
    client: &GithubClient,
    owner: &str,
    repo: &str,
    topics: &[String],
) -> AppResult<Vec<String>> {
    let names = validate_topics(topics)?;
    let path = format!("{}/topics", repo_path(owner, repo)?);
    let response: TopicsResponse = client
        .send_json(Method::PUT, &path, &json!({ "names": names }))
        .await?;
    Ok(response.names)
}

pub async fn list_collaborators(
    client: &GithubClient,
    owner: &str,
    repo: &str,
) -> AppResult<Vec<Collaborator>> {
    let path = format!("{}/collaborators", repo_path(owner, repo)?);
    client
        .get_json(
            &path,
            &[
                ("affiliation", "direct".to_string()),
                ("per_page", LIST_PAGE_SIZE.to_string()),
            ],
        )
        .await
}

pub async fn add_collaborator(
    client: &GithubClient,
    owner: &str,
    repo: &str,
    login: &str,
    permission: &str,
) -> AppResult<()> {
    ensure_login(login)?;
    ensure_permission(permission)?;
    let path = format!("{}/collaborators/{login}", repo_path(owner, repo)?);
    client
        .send_no_content(Method::PUT, &path, Some(&PermissionBody { permission }))
        .await
}

pub async fn remove_collaborator(
    client: &GithubClient,
    owner: &str,
    repo: &str,
    login: &str,
) -> AppResult<()> {
    ensure_login(login)?;
    let path = format!("{}/collaborators/{login}", repo_path(owner, repo)?);
    client
        .send_no_content::<()>(Method::DELETE, &path, None)
        .await
}

pub async fn list_invitations(
    client: &GithubClient,
    owner: &str,
    repo: &str,
) -> AppResult<Vec<Invitation>> {
    let path = format!("{}/invitations", repo_path(owner, repo)?);
    client
        .get_json(&path, &[("per_page", LIST_PAGE_SIZE.to_string())])
        .await
}

pub async fn cancel_invitation(
    client: &GithubClient,
    owner: &str,
    repo: &str,
    id: u64,
) -> AppResult<()> {
    let path = format!("{}/invitations/{id}", repo_path(owner, repo)?);
    client
        .send_no_content::<()>(Method::DELETE, &path, None)
        .await
}

pub async fn list_team_access(
    client: &GithubClient,
    owner: &str,
    repo: &str,
) -> AppResult<Vec<TeamAccess>> {
    let path = format!("{}/teams", repo_path(owner, repo)?);
    match client
        .get_json::<Vec<TeamAccess>>(&path, &[("per_page", LIST_PAGE_SIZE.to_string())])
        .await
    {
        Err(error) if error.kind == crate::error::ErrorKind::GithubNotFound => Ok(Vec::new()),
        other => other,
    }
}

pub async fn set_team_access(
    client: &GithubClient,
    owner: &str,
    repo: &str,
    team: &str,
    permission: &str,
) -> AppResult<()> {
    ensure_login(owner)?;
    ensure_slug(team, "team")?;
    ensure_permission(permission)?;
    let path = format!(
        "/orgs/{owner}/teams/{team}/repos/{owner}/{}",
        encode_segment(repo)
    );
    repo_path(owner, repo)?;
    client
        .send_no_content(Method::PUT, &path, Some(&PermissionBody { permission }))
        .await
}

pub async fn remove_team_access(
    client: &GithubClient,
    owner: &str,
    repo: &str,
    team: &str,
) -> AppResult<()> {
    ensure_login(owner)?;
    ensure_slug(team, "team")?;
    repo_path(owner, repo)?;
    let path = format!(
        "/orgs/{owner}/teams/{team}/repos/{owner}/{}",
        encode_segment(repo)
    );
    client
        .send_no_content::<()>(Method::DELETE, &path, None)
        .await
}

pub async fn transfer_repository(
    client: &GithubClient,
    owner: &str,
    repo: &str,
    new_owner: &str,
    new_name: Option<&str>,
    confirmation: &str,
) -> AppResult<()> {
    ensure_confirmation(owner, repo, confirmation)?;
    ensure_login(new_owner)?;
    if let Some(name) = new_name {
        ensure_repo_name(name)?;
    }
    let path = format!("{}/transfer", repo_path(owner, repo)?);
    client
        .send_json::<_, serde_json::Value>(
            Method::POST,
            &path,
            &TransferBody {
                new_owner,
                new_name,
            },
        )
        .await
        .map(|_| ())
}

pub async fn delete_repository(
    client: &GithubClient,
    owner: &str,
    repo: &str,
    confirmation: &str,
) -> AppResult<()> {
    ensure_confirmation(owner, repo, confirmation)?;
    client
        .send_no_content::<()>(Method::DELETE, &repo_path(owner, repo)?, None)
        .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn topics_are_lowercased_deduplicated_and_validated() {
        let topics = vec![
            "Rust".to_string(),
            "cli-tools".to_string(),
            "rust".to_string(),
        ];
        assert_eq!(
            validate_topics(&topics).expect("topics"),
            vec!["rust", "cli-tools"]
        );
        for bad in ["", "has space", "-x", "ñ", "UPPER_CASE"] {
            assert!(validate_topics(&[bad.to_string()]).is_err(), "{bad}");
        }
        let many: Vec<String> = (0..21).map(|index| format!("t{index}")).collect();
        assert!(validate_topics(&many).is_err());
    }

    #[test]
    fn permissions_are_the_five_github_roles() {
        for good in ["pull", "triage", "push", "maintain", "admin"] {
            assert!(ensure_permission(good).is_ok());
        }
        for bad in ["", "owner", "write", "read"] {
            assert!(ensure_permission(bad).is_err());
        }
    }

    #[test]
    fn dangerous_actions_need_the_exact_full_name() {
        assert!(ensure_confirmation("acme", "app", "acme/app").is_ok());
        for typed in ["", "app", "ACME/app", "acme/app ", "acme/ap"] {
            assert!(
                ensure_confirmation("acme", "app", typed).is_err(),
                "{typed:?}"
            );
        }
    }

    #[test]
    fn patches_reject_bad_names_addresses_and_branches() {
        let bad = |patch: RepoSettingsPatch| validate_patch(&patch).is_err();
        assert!(bad(RepoSettingsPatch {
            name: Some("has space".to_string()),
            ..RepoSettingsPatch::default()
        }));
        assert!(bad(RepoSettingsPatch {
            homepage: Some("javascript:alert(1)".to_string()),
            ..RepoSettingsPatch::default()
        }));
        assert!(bad(RepoSettingsPatch {
            default_branch: Some("a..b".to_string()),
            ..RepoSettingsPatch::default()
        }));
        assert!(bad(RepoSettingsPatch {
            description: Some("x".repeat(351)),
            ..RepoSettingsPatch::default()
        }));
        assert!(!bad(RepoSettingsPatch {
            homepage: Some(String::new()),
            description: Some("Fine".to_string()),
            ..RepoSettingsPatch::default()
        }));
    }
}
