use reqwest::Method;
use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::error::{AppError, AppResult};
use crate::github::client::GithubClient;
use crate::github::orgs::ensure_login;
use crate::github::path::ensure_slug;

const LIST_PAGE_SIZE: &str = "100";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct Member {
    pub login: String,
    #[serde(default)]
    pub avatar_url: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct OrgInvitation {
    pub id: u64,
    #[serde(default)]
    pub login: Option<String>,
    #[serde(default)]
    pub email: Option<String>,
    #[serde(default)]
    pub role: String,
    #[serde(default)]
    pub created_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct Team {
    pub id: u64,
    pub slug: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub privacy: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct MyMembership {
    pub role: String,
    #[serde(default)]
    pub state: String,
}

#[derive(Deserialize)]
struct UserId {
    id: u64,
}

pub fn ensure_member_filter(role: &str) -> AppResult<()> {
    if matches!(role, "all" | "admin" | "member") {
        Ok(())
    } else {
        Err(AppError::invalid_input(format!("invalid role: {role}")))
    }
}

pub fn ensure_invite_role(role: &str) -> AppResult<()> {
    if matches!(role, "admin" | "direct_member" | "billing_manager") {
        Ok(())
    } else {
        Err(AppError::invalid_input(format!("invalid role: {role}")))
    }
}

fn is_email(value: &str) -> bool {
    let mut parts = value.split('@');
    matches!(
        (parts.next(), parts.next(), parts.next()),
        (Some(local), Some(domain), None) if !local.is_empty() && domain.contains('.')
    ) && !value
        .chars()
        .any(|character| character.is_whitespace() || character.is_control())
}

pub async fn my_membership(client: &GithubClient, org: &str) -> AppResult<MyMembership> {
    ensure_login(org)?;
    client
        .get_json(&format!("/user/memberships/orgs/{org}"), &[])
        .await
}

pub async fn list_members(client: &GithubClient, org: &str, role: &str) -> AppResult<Vec<Member>> {
    ensure_login(org)?;
    ensure_member_filter(role)?;
    client
        .get_json(
            &format!("/orgs/{org}/members"),
            &[
                ("role", role.to_string()),
                ("per_page", LIST_PAGE_SIZE.to_string()),
            ],
        )
        .await
}

pub async fn set_membership(
    client: &GithubClient,
    org: &str,
    login: &str,
    role: &str,
) -> AppResult<()> {
    ensure_login(org)?;
    ensure_login(login)?;
    if !matches!(role, "admin" | "member") {
        return Err(AppError::invalid_input(format!("invalid role: {role}")));
    }
    client
        .send_no_content(
            Method::PUT,
            &format!("/orgs/{org}/memberships/{login}"),
            Some(&json!({ "role": role })),
        )
        .await
}

pub async fn remove_membership(client: &GithubClient, org: &str, login: &str) -> AppResult<()> {
    ensure_login(org)?;
    ensure_login(login)?;
    client
        .send_no_content::<()>(
            Method::DELETE,
            &format!("/orgs/{org}/memberships/{login}"),
            None,
        )
        .await
}

pub async fn list_invitations(client: &GithubClient, org: &str) -> AppResult<Vec<OrgInvitation>> {
    ensure_login(org)?;
    client
        .get_json(
            &format!("/orgs/{org}/invitations"),
            &[("per_page", LIST_PAGE_SIZE.to_string())],
        )
        .await
}

pub async fn invite(client: &GithubClient, org: &str, who: &str, role: &str) -> AppResult<()> {
    ensure_login(org)?;
    ensure_invite_role(role)?;
    let who = who.trim();
    let mut body = json!({ "role": role });
    if who.contains('@') {
        if !is_email(who) {
            return Err(AppError::invalid_input("invalid email"));
        }
        body["email"] = json!(who);
    } else {
        ensure_login(who)?;
        let user: UserId = client.get_json(&format!("/users/{who}"), &[]).await?;
        body["invitee_id"] = json!(user.id);
    }
    client
        .send_json::<_, serde_json::Value>(Method::POST, &format!("/orgs/{org}/invitations"), &body)
        .await
        .map(|_| ())
}

pub async fn cancel_invitation(client: &GithubClient, org: &str, id: u64) -> AppResult<()> {
    ensure_login(org)?;
    client
        .send_no_content::<()>(
            Method::DELETE,
            &format!("/orgs/{org}/invitations/{id}"),
            None,
        )
        .await
}

pub async fn list_teams(client: &GithubClient, org: &str) -> AppResult<Vec<Team>> {
    ensure_login(org)?;
    client
        .get_json(
            &format!("/orgs/{org}/teams"),
            &[("per_page", LIST_PAGE_SIZE.to_string())],
        )
        .await
}

pub async fn create_team(
    client: &GithubClient,
    org: &str,
    name: &str,
    description: &str,
    secret: bool,
) -> AppResult<Team> {
    ensure_login(org)?;
    let name = name.trim();
    if name.is_empty() || name.chars().count() > 100 || name.chars().any(char::is_control) {
        return Err(AppError::invalid_input("invalid team name"));
    }
    if description.chars().count() > 255 || description.chars().any(char::is_control) {
        return Err(AppError::invalid_input("invalid description"));
    }
    client
        .send_json(
            Method::POST,
            &format!("/orgs/{org}/teams"),
            &json!({ "name": name, "description": description.trim(), "privacy": if secret { "secret" } else { "closed" } }),
        )
        .await
}

pub async fn delete_team(client: &GithubClient, org: &str, slug: &str) -> AppResult<()> {
    ensure_login(org)?;
    ensure_slug(slug, "team")?;
    client
        .send_no_content::<()>(Method::DELETE, &format!("/orgs/{org}/teams/{slug}"), None)
        .await
}

pub async fn list_team_members(
    client: &GithubClient,
    org: &str,
    slug: &str,
) -> AppResult<Vec<Member>> {
    ensure_login(org)?;
    ensure_slug(slug, "team")?;
    client
        .get_json(
            &format!("/orgs/{org}/teams/{slug}/members"),
            &[("per_page", LIST_PAGE_SIZE.to_string())],
        )
        .await
}

pub async fn add_team_member(
    client: &GithubClient,
    org: &str,
    slug: &str,
    login: &str,
) -> AppResult<()> {
    ensure_login(org)?;
    ensure_slug(slug, "team")?;
    ensure_login(login)?;
    client
        .send_no_content::<()>(
            Method::PUT,
            &format!("/orgs/{org}/teams/{slug}/memberships/{login}"),
            None,
        )
        .await
}

pub async fn remove_team_member(
    client: &GithubClient,
    org: &str,
    slug: &str,
    login: &str,
) -> AppResult<()> {
    ensure_login(org)?;
    ensure_slug(slug, "team")?;
    ensure_login(login)?;
    client
        .send_no_content::<()>(
            Method::DELETE,
            &format!("/orgs/{org}/teams/{slug}/memberships/{login}"),
            None,
        )
        .await
}

pub async fn list_outside_collaborators(
    client: &GithubClient,
    org: &str,
) -> AppResult<Vec<Member>> {
    ensure_login(org)?;
    client
        .get_json(
            &format!("/orgs/{org}/outside_collaborators"),
            &[("per_page", LIST_PAGE_SIZE.to_string())],
        )
        .await
}

pub async fn remove_outside_collaborator(
    client: &GithubClient,
    org: &str,
    login: &str,
) -> AppResult<()> {
    ensure_login(org)?;
    ensure_login(login)?;
    client
        .send_no_content::<()>(
            Method::DELETE,
            &format!("/orgs/{org}/outside_collaborators/{login}"),
            None,
        )
        .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn emails_and_roles_are_validated() {
        assert!(is_email("ana@example.com"));
        for bad in ["ana", "ana@", "@x.com", "a@b", "a b@c.com", "a@b@c.com"] {
            assert!(!is_email(bad), "{bad}");
        }
        for good in ["all", "admin", "member"] {
            assert!(ensure_member_filter(good).is_ok());
        }
        assert!(ensure_member_filter("owner").is_err());
        assert!(ensure_invite_role("direct_member").is_ok());
        assert!(ensure_invite_role("owner").is_err());
    }
}
