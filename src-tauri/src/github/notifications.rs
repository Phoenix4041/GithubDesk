use reqwest::Method;
use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::error::{AppError, AppResult};
use crate::github::client::GithubClient;

const NOTIFICATIONS_PAGE_SIZE: &str = "50";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct NotificationRepo {
    pub full_name: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct NotificationSubject {
    #[serde(default)]
    pub title: String,
    #[serde(default, rename(serialize = "kind", deserialize = "type"))]
    pub kind: String,
    #[serde(default)]
    pub url: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct Notification {
    pub id: String,
    #[serde(default)]
    pub unread: bool,
    #[serde(default)]
    pub reason: String,
    pub subject: NotificationSubject,
    pub repository: NotificationRepo,
    #[serde(default)]
    pub updated_at: String,
}

pub fn ensure_thread_id(id: &str) -> AppResult<()> {
    if !id.is_empty() && id.len() <= 20 && id.chars().all(|character| character.is_ascii_digit()) {
        Ok(())
    } else {
        Err(AppError::invalid_input(format!(
            "invalid notification: {id}"
        )))
    }
}

pub fn web_url(api_url: Option<&str>, repository: &str, kind: &str) -> Option<String> {
    let url = api_url?;
    let (_, rest) = url.split_once("/repos/")?;
    let mut parts = rest.split('/');
    let owner = parts.next()?;
    let repo = parts.next()?;
    let section = parts.next()?;
    let number = parts.next()?;
    if format!("{owner}/{repo}") != repository || number.is_empty() {
        return None;
    }
    let host = url.split("/repos/").next()?;
    let web = host
        .replace("://api.github.com", "://github.com")
        .trim_end_matches("/api/v3")
        .to_string();
    let path = match (kind, section) {
        ("PullRequest", _) | (_, "pulls") => "pull",
        _ => "issues",
    };
    Some(format!("{web}/{owner}/{repo}/{path}/{number}"))
}

pub async fn list_notifications(client: &GithubClient, all: bool) -> AppResult<Vec<Notification>> {
    client
        .get_json(
            "/notifications",
            &[
                ("all", all.to_string()),
                ("per_page", NOTIFICATIONS_PAGE_SIZE.to_string()),
            ],
        )
        .await
}

pub async fn mark_read(client: &GithubClient, id: &str) -> AppResult<()> {
    ensure_thread_id(id)?;
    client
        .send_no_content::<()>(Method::PATCH, &format!("/notifications/threads/{id}"), None)
        .await
}

pub async fn mark_all_read(client: &GithubClient) -> AppResult<()> {
    client
        .send_no_content(Method::PUT, "/notifications", Some(&json!({})))
        .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn thread_ids_are_plain_numbers() {
        assert!(ensure_thread_id("123456").is_ok());
        for bad in ["", "12a", "../x", &"9".repeat(21)] {
            assert!(ensure_thread_id(bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn the_web_address_comes_from_the_subject() {
        assert_eq!(
            web_url(
                Some("https://api.github.com/repos/acme/app/pulls/7"),
                "acme/app",
                "PullRequest"
            )
            .as_deref(),
            Some("https://github.com/acme/app/pull/7")
        );
        assert_eq!(
            web_url(
                Some("https://api.github.com/repos/acme/app/issues/9"),
                "acme/app",
                "Issue"
            )
            .as_deref(),
            Some("https://github.com/acme/app/issues/9")
        );
        assert_eq!(
            web_url(
                Some("https://git.corp.example/api/v3/repos/acme/app/issues/9"),
                "acme/app",
                "Issue"
            )
            .as_deref(),
            Some("https://git.corp.example/acme/app/issues/9")
        );
        assert_eq!(web_url(None, "acme/app", "Issue"), None);
        assert_eq!(
            web_url(
                Some("https://api.github.com/repos/other/app/issues/9"),
                "acme/app",
                "Issue"
            ),
            None
        );
    }
}
