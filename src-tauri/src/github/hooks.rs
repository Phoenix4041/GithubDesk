use reqwest::Method;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::error::{AppError, AppResult};
use crate::github::client::GithubClient;
use crate::github::pulls::repo_path;

const LIST_PAGE_SIZE: &str = "100";
const MAX_EVENTS: usize = 40;
const MAX_URL_LENGTH: usize = 500;
const MAX_SECRET_LENGTH: usize = 255;
const MAX_TITLE_LENGTH: usize = 100;
const MAX_KEY_LENGTH: usize = 3000;
const KEY_PREFIXES: [&str; 5] = [
    "ssh-ed25519 ",
    "ssh-rsa ",
    "ecdsa-sha2-",
    "sk-ssh-ed25519@openssh.com ",
    "sk-ecdsa-sha2-",
];

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct HookConfig {
    #[serde(default)]
    pub url: String,
    #[serde(default)]
    pub content_type: String,
    #[serde(default)]
    pub insecure_ssl: Option<Value>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct HookResponse {
    #[serde(default)]
    pub code: Option<i64>,
    #[serde(default)]
    pub status: Option<String>,
    #[serde(default)]
    pub message: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct Hook {
    pub id: u64,
    #[serde(default)]
    pub active: bool,
    #[serde(default)]
    pub events: Vec<String>,
    pub config: HookConfig,
    #[serde(default)]
    pub last_response: Option<HookResponse>,
    #[serde(default)]
    pub updated_at: String,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewHook {
    pub url: String,
    pub events: Vec<String>,
    #[serde(default)]
    pub secret: Option<String>,
    #[serde(default = "default_active")]
    pub active: bool,
}

fn default_active() -> bool {
    true
}

impl std::fmt::Debug for NewHook {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("NewHook")
            .field("url", &self.url)
            .field("events", &self.events)
            .field("secret", &self.secret.as_ref().map(|_| "[redacted]"))
            .field("active", &self.active)
            .finish()
    }
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HookUpdate {
    #[serde(default)]
    pub active: Option<bool>,
    #[serde(default)]
    pub events: Option<Vec<String>>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct DeployKey {
    pub id: u64,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub key: String,
    #[serde(default)]
    pub read_only: bool,
    #[serde(default)]
    pub verified: bool,
    #[serde(default)]
    pub created_at: String,
}

pub fn validate_hook_url(url: &str) -> AppResult<String> {
    let trimmed = url.trim();
    let valid = trimmed.len() <= MAX_URL_LENGTH
        && trimmed.starts_with("https://")
        && trimmed.len() > "https://".len()
        && !trimmed
            .chars()
            .any(|character| character.is_control() || character.is_whitespace());
    if valid {
        Ok(trimmed.to_string())
    } else {
        Err(AppError::invalid_input(
            "a webhook address must start with https://",
        ))
    }
}

pub fn validate_events(events: &[String]) -> AppResult<Vec<String>> {
    if events.is_empty() || events.len() > MAX_EVENTS {
        return Err(AppError::invalid_input("choose between 1 and 40 events"));
    }
    let mut cleaned: Vec<String> = Vec::new();
    for event in events {
        let name = event.trim();
        let valid = name == "*"
            || (!name.is_empty()
                && name.len() <= 60
                && name
                    .chars()
                    .all(|character| character.is_ascii_lowercase() || character == '_'));
        if !valid {
            return Err(AppError::invalid_input(format!("invalid event: {event}")));
        }
        if !cleaned.iter().any(|existing| existing == name) {
            cleaned.push(name.to_string());
        }
    }
    Ok(cleaned)
}

fn validate_secret(secret: &Option<String>) -> AppResult<Option<String>> {
    match secret {
        None => Ok(None),
        Some(text) if text.is_empty() => Ok(None),
        Some(text) => {
            if text.len() > MAX_SECRET_LENGTH || text.chars().any(char::is_control) {
                Err(AppError::invalid_input("invalid webhook secret"))
            } else {
                Ok(Some(text.clone()))
            }
        }
    }
}

pub fn validate_deploy_key(title: &str, key: &str) -> AppResult<(String, String)> {
    let title = title.trim();
    if title.is_empty()
        || title.chars().count() > MAX_TITLE_LENGTH
        || title.chars().any(char::is_control)
    {
        return Err(AppError::invalid_input("invalid key title"));
    }
    let key = key.trim();
    let known = KEY_PREFIXES.iter().any(|prefix| key.starts_with(prefix));
    if !known
        || key.len() > MAX_KEY_LENGTH
        || key
            .chars()
            .any(|character| character == '\n' || character == '\r')
    {
        return Err(AppError::invalid_input(
            "paste one public SSH key on a single line",
        ));
    }
    Ok((title.to_string(), key.to_string()))
}

pub async fn list_hooks(client: &GithubClient, owner: &str, repo: &str) -> AppResult<Vec<Hook>> {
    let path = format!("{}/hooks", repo_path(owner, repo)?);
    client
        .get_json(&path, &[("per_page", LIST_PAGE_SIZE.to_string())])
        .await
}

pub async fn create_hook(
    client: &GithubClient,
    owner: &str,
    repo: &str,
    request: &NewHook,
) -> AppResult<Hook> {
    let url = validate_hook_url(&request.url)?;
    let events = validate_events(&request.events)?;
    let secret = validate_secret(&request.secret)?;
    let mut config = json!({ "url": url, "content_type": "json", "insecure_ssl": "0" });
    if let Some(secret) = secret {
        config["secret"] = Value::String(secret);
    }
    let body = json!({
        "name": "web",
        "active": request.active,
        "events": events,
        "config": config,
    });
    let path = format!("{}/hooks", repo_path(owner, repo)?);
    client.send_json(Method::POST, &path, &body).await
}

pub async fn update_hook(
    client: &GithubClient,
    owner: &str,
    repo: &str,
    id: u64,
    update: &HookUpdate,
) -> AppResult<Hook> {
    let mut body = serde_json::Map::new();
    if let Some(active) = update.active {
        body.insert("active".to_string(), Value::Bool(active));
    }
    if let Some(events) = &update.events {
        body.insert("events".to_string(), json!(validate_events(events)?));
    }
    if body.is_empty() {
        return Err(AppError::invalid_input("nothing to change"));
    }
    let path = format!("{}/hooks/{id}", repo_path(owner, repo)?);
    client
        .send_json(Method::PATCH, &path, &Value::Object(body))
        .await
}

pub async fn delete_hook(client: &GithubClient, owner: &str, repo: &str, id: u64) -> AppResult<()> {
    let path = format!("{}/hooks/{id}", repo_path(owner, repo)?);
    client
        .send_no_content::<()>(Method::DELETE, &path, None)
        .await
}

pub async fn ping_hook(client: &GithubClient, owner: &str, repo: &str, id: u64) -> AppResult<()> {
    let path = format!("{}/hooks/{id}/pings", repo_path(owner, repo)?);
    client
        .send_no_content(Method::POST, &path, Some(&json!({})))
        .await
}

pub async fn list_deploy_keys(
    client: &GithubClient,
    owner: &str,
    repo: &str,
) -> AppResult<Vec<DeployKey>> {
    let path = format!("{}/keys", repo_path(owner, repo)?);
    client
        .get_json(&path, &[("per_page", LIST_PAGE_SIZE.to_string())])
        .await
}

pub async fn add_deploy_key(
    client: &GithubClient,
    owner: &str,
    repo: &str,
    title: &str,
    key: &str,
    read_only: bool,
) -> AppResult<DeployKey> {
    let (title, key) = validate_deploy_key(title, key)?;
    let path = format!("{}/keys", repo_path(owner, repo)?);
    client
        .send_json(
            Method::POST,
            &path,
            &json!({ "title": title, "key": key, "read_only": read_only }),
        )
        .await
}

pub async fn delete_deploy_key(
    client: &GithubClient,
    owner: &str,
    repo: &str,
    id: u64,
) -> AppResult<()> {
    let path = format!("{}/keys/{id}", repo_path(owner, repo)?);
    client
        .send_no_content::<()>(Method::DELETE, &path, None)
        .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn webhook_addresses_must_be_https_without_spaces() {
        assert_eq!(
            validate_hook_url(" https://example.com/hook ").expect("url"),
            "https://example.com/hook"
        );
        for bad in [
            "http://example.com",
            "https://",
            "ftp://x",
            "https://a b",
            "javascript:x",
            "",
        ] {
            assert!(validate_hook_url(bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn events_are_lowercase_names_or_the_wildcard() {
        let events = vec![
            "push".to_string(),
            "pull_request".to_string(),
            "push".to_string(),
        ];
        assert_eq!(
            validate_events(&events).expect("events"),
            vec!["push", "pull_request"]
        );
        assert_eq!(
            validate_events(&["*".to_string()]).expect("events"),
            vec!["*"]
        );
        for bad in [
            vec![],
            vec!["Push".to_string()],
            vec!["a b".to_string()],
            vec![String::new()],
        ] {
            assert!(validate_events(&bad).is_err(), "{bad:?}");
        }
    }

    #[test]
    fn secrets_never_show_up_when_the_request_is_printed() {
        let request = NewHook {
            url: "https://example.com".to_string(),
            events: vec!["push".to_string()],
            secret: Some("top-secret-value".to_string()),
            active: true,
        };
        let printed = format!("{request:?}");
        assert!(!printed.contains("top-secret"));
        assert!(printed.contains("redacted"));
    }

    #[test]
    fn empty_secrets_are_dropped_and_odd_ones_refused() {
        assert_eq!(validate_secret(&Some(String::new())).expect("none"), None);
        assert_eq!(validate_secret(&None).expect("none"), None);
        assert!(validate_secret(&Some("a\nb".to_string())).is_err());
        assert!(validate_secret(&Some("x".repeat(256))).is_err());
    }

    #[test]
    fn deploy_keys_are_single_line_public_keys() {
        assert!(validate_deploy_key("CI", "ssh-ed25519 AAAAC3Nza comment").is_ok());
        assert!(validate_deploy_key("CI", "ecdsa-sha2-nistp256 AAAA").is_ok());
        for (title, key) in [
            ("", "ssh-ed25519 AAAA"),
            ("CI", "-----BEGIN OPENSSH PRIVATE KEY-----"),
            ("CI", "ssh-ed25519 AAAA\nssh-rsa BBBB"),
            ("CI", "not a key"),
        ] {
            assert!(validate_deploy_key(title, key).is_err(), "{title}/{key}");
        }
    }
}
