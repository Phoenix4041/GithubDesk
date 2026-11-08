use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use crypto_box::aead::OsRng;
use crypto_box::PublicKey;
use reqwest::Method;
use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::error::{AppError, AppResult, ErrorKind};
use crate::github::client::{GithubClient, Page};
use crate::github::orgs::ensure_login;
use crate::github::pulls::repo_path;

const MAX_NAME_LENGTH: usize = 100;
const MAX_VALUE_BYTES: usize = 48 * 1024;
const SECRETS_PAGE_SIZE: u32 = 100;
const VARIABLES_PAGE_SIZE: u32 = 30;
const MAX_PAGES: u32 = 4;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct ActionsSecret {
    pub name: String,
    #[serde(default)]
    pub created_at: String,
    #[serde(default)]
    pub updated_at: String,
    #[serde(default)]
    pub visibility: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct ActionsVariable {
    pub name: String,
    #[serde(default)]
    pub value: String,
    #[serde(default)]
    pub created_at: String,
    #[serde(default)]
    pub updated_at: String,
    #[serde(default)]
    pub visibility: Option<String>,
}

#[derive(Deserialize)]
struct SecretsWrapper {
    #[serde(default)]
    secrets: Vec<ActionsSecret>,
}

#[derive(Deserialize)]
struct VariablesWrapper {
    #[serde(default)]
    variables: Vec<ActionsVariable>,
}

#[derive(Deserialize)]
struct PublicKeyResponse {
    key_id: String,
    key: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Scope<'a> {
    Repository { owner: &'a str, repo: &'a str },
    Organization { org: &'a str },
}

impl Scope<'_> {
    fn base(&self) -> AppResult<String> {
        match self {
            Scope::Repository { owner, repo } => Ok(format!("{}/actions", repo_path(owner, repo)?)),
            Scope::Organization { org } => {
                ensure_login(org)?;
                Ok(format!("/orgs/{org}/actions"))
            }
        }
    }

    fn is_organization(&self) -> bool {
        matches!(self, Scope::Organization { .. })
    }
}

pub fn ensure_secret_name(name: &str) -> AppResult<()> {
    let mut characters = name.chars();
    let starts_well = characters
        .next()
        .is_some_and(|first| first.is_ascii_alphabetic() || first == '_');
    let valid = starts_well
        && name.len() <= MAX_NAME_LENGTH
        && name
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || character == '_')
        && !name.to_uppercase().starts_with("GITHUB_");
    if valid {
        Ok(())
    } else {
        Err(AppError::invalid_input(format!("invalid name: {name}")))
    }
}

fn ensure_value(value: &str) -> AppResult<()> {
    if value.is_empty() || value.len() > MAX_VALUE_BYTES {
        return Err(AppError::invalid_input("the value is empty or too large"));
    }
    Ok(())
}

pub fn ensure_visibility(visibility: &str) -> AppResult<()> {
    if matches!(visibility, "all" | "private") {
        Ok(())
    } else {
        Err(AppError::invalid_input(format!(
            "invalid visibility: {visibility}"
        )))
    }
}

pub fn encrypt_secret(public_key_base64: &str, value: &str) -> AppResult<String> {
    let bad_key = || {
        AppError::new(
            ErrorKind::GithubServerError,
            "GitHub sent an unusable public key",
        )
    };
    let bytes = STANDARD
        .decode(public_key_base64.trim())
        .map_err(|_| bad_key())?;
    let key = PublicKey::from_slice(&bytes).map_err(|_| bad_key())?;
    let sealed = key
        .seal(&mut OsRng, value.as_bytes())
        .map_err(|_| AppError::new(ErrorKind::Unknown, "the value could not be encrypted"))?;
    Ok(STANDARD.encode(sealed))
}

pub async fn list_secrets(
    client: &GithubClient,
    scope: Scope<'_>,
) -> AppResult<Vec<ActionsSecret>> {
    let path = format!("{}/secrets", scope.base()?);
    let mut secrets = Vec::new();
    let mut page = 1;
    while page <= MAX_PAGES {
        let result: Page<ActionsSecret> = client
            .get_page_wrapped(
                &path,
                &[],
                page,
                SECRETS_PAGE_SIZE,
                |wrapper: SecretsWrapper| wrapper.secrets,
            )
            .await?;
        secrets.extend(result.items);
        match result.next_page {
            Some(next) => page = next,
            None => break,
        }
    }
    Ok(secrets)
}

pub async fn list_variables(
    client: &GithubClient,
    scope: Scope<'_>,
) -> AppResult<Vec<ActionsVariable>> {
    let path = format!("{}/variables", scope.base()?);
    let mut variables = Vec::new();
    let mut page = 1;
    while page <= MAX_PAGES {
        let result: Page<ActionsVariable> = client
            .get_page_wrapped(
                &path,
                &[],
                page,
                VARIABLES_PAGE_SIZE,
                |wrapper: VariablesWrapper| wrapper.variables,
            )
            .await?;
        variables.extend(result.items);
        match result.next_page {
            Some(next) => page = next,
            None => break,
        }
    }
    Ok(variables)
}

pub async fn put_secret(
    client: &GithubClient,
    scope: Scope<'_>,
    name: &str,
    value: &str,
    visibility: Option<&str>,
) -> AppResult<()> {
    ensure_secret_name(name)?;
    ensure_value(value)?;
    let visibility = visibility_for(scope, visibility)?;
    let base = scope.base()?;
    let key: PublicKeyResponse = client
        .get_json(&format!("{base}/secrets/public-key"), &[])
        .await?;
    let encrypted = encrypt_secret(&key.key, value)?;
    let mut body = json!({ "encrypted_value": encrypted, "key_id": key.key_id });
    if let Some(visibility) = visibility {
        body["visibility"] = json!(visibility);
    }
    client
        .send_no_content(Method::PUT, &format!("{base}/secrets/{name}"), Some(&body))
        .await
}

fn visibility_for<'a>(scope: Scope<'_>, visibility: Option<&'a str>) -> AppResult<Option<&'a str>> {
    if !scope.is_organization() {
        return Ok(None);
    }
    let chosen = visibility.unwrap_or("private");
    ensure_visibility(chosen)?;
    Ok(Some(chosen))
}

pub async fn delete_secret(client: &GithubClient, scope: Scope<'_>, name: &str) -> AppResult<()> {
    ensure_secret_name(name)?;
    let path = format!("{}/secrets/{name}", scope.base()?);
    client
        .send_no_content::<()>(Method::DELETE, &path, None)
        .await
}

pub async fn create_variable(
    client: &GithubClient,
    scope: Scope<'_>,
    name: &str,
    value: &str,
    visibility: Option<&str>,
) -> AppResult<()> {
    ensure_secret_name(name)?;
    ensure_value(value)?;
    let visibility = visibility_for(scope, visibility)?;
    let mut body = json!({ "name": name, "value": value });
    if let Some(visibility) = visibility {
        body["visibility"] = json!(visibility);
    }
    let path = format!("{}/variables", scope.base()?);
    client
        .send_no_content(Method::POST, &path, Some(&body))
        .await
}

pub async fn update_variable(
    client: &GithubClient,
    scope: Scope<'_>,
    name: &str,
    value: &str,
) -> AppResult<()> {
    ensure_secret_name(name)?;
    ensure_value(value)?;
    let path = format!("{}/variables/{name}", scope.base()?);
    client
        .send_no_content(
            Method::PATCH,
            &path,
            Some(&json!({ "name": name, "value": value })),
        )
        .await
}

pub async fn delete_variable(client: &GithubClient, scope: Scope<'_>, name: &str) -> AppResult<()> {
    ensure_secret_name(name)?;
    let path = format!("{}/variables/{name}", scope.base()?);
    client
        .send_no_content::<()>(Method::DELETE, &path, None)
        .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_follow_the_github_rules() {
        for good in ["TOKEN", "api_key_2", "_private", "A"] {
            assert!(ensure_secret_name(good).is_ok(), "{good}");
        }
        for bad in [
            "",
            "1TOKEN",
            "has space",
            "a-b",
            "GITHUB_TOKEN",
            "github_x",
            "ñ",
            &"A".repeat(101),
        ] {
            assert!(ensure_secret_name(bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn values_must_not_be_empty_or_huge() {
        assert!(ensure_value("x").is_ok());
        assert!(ensure_value("").is_err());
        assert!(ensure_value(&"x".repeat(MAX_VALUE_BYTES + 1)).is_err());
    }

    #[test]
    fn only_two_organization_visibilities_are_offered() {
        assert!(ensure_visibility("all").is_ok());
        assert!(ensure_visibility("private").is_ok());
        assert!(ensure_visibility("selected").is_err());
    }

    #[test]
    fn an_unusable_public_key_is_reported_without_panicking() {
        for bad in ["", "not base64!!", "AAAA"] {
            let error = encrypt_secret(bad, "value").expect_err("bad key");
            assert_eq!(error.kind, ErrorKind::GithubServerError);
        }
    }
}
