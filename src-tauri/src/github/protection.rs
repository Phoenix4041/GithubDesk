use reqwest::Method;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::error::{AppError, AppResult, ErrorKind};
use crate::github::client::GithubClient;
use crate::github::path::{encode_segment, ensure_branch_name};
use crate::github::pulls::repo_path;

const LIST_PAGE_SIZE: &str = "100";
const MAX_REQUIRED_REVIEWS: u32 = 6;
const MAX_CHECKS: usize = 50;
const MAX_CHECK_LENGTH: usize = 200;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct BranchEntry {
    pub name: String,
    #[serde(default)]
    pub protected: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProtectionSettings {
    pub required_reviews: Option<u32>,
    pub dismiss_stale_reviews: bool,
    pub require_code_owner_reviews: bool,
    pub required_checks: Option<Vec<String>>,
    pub strict_checks: bool,
    pub enforce_admins: bool,
    pub require_linear_history: bool,
    pub allow_force_pushes: bool,
    pub allow_deletions: bool,
    pub require_conversation_resolution: bool,
}

#[derive(Deserialize, Default)]
struct RawReviews {
    #[serde(default)]
    dismiss_stale_reviews: bool,
    #[serde(default)]
    require_code_owner_reviews: bool,
    #[serde(default)]
    required_approving_review_count: u32,
}

#[derive(Deserialize, Default)]
struct RawChecks {
    #[serde(default)]
    strict: bool,
    #[serde(default)]
    contexts: Vec<String>,
}

#[derive(Deserialize, Default)]
struct RawToggle {
    #[serde(default)]
    enabled: bool,
}

#[derive(Deserialize, Default)]
struct RawProtection {
    #[serde(default)]
    required_pull_request_reviews: Option<RawReviews>,
    #[serde(default)]
    required_status_checks: Option<RawChecks>,
    #[serde(default)]
    enforce_admins: Option<RawToggle>,
    #[serde(default)]
    required_linear_history: Option<RawToggle>,
    #[serde(default)]
    allow_force_pushes: Option<RawToggle>,
    #[serde(default)]
    allow_deletions: Option<RawToggle>,
    #[serde(default)]
    required_conversation_resolution: Option<RawToggle>,
}

fn enabled(toggle: Option<RawToggle>) -> bool {
    toggle.is_some_and(|value| value.enabled)
}

impl From<RawProtection> for ProtectionSettings {
    fn from(raw: RawProtection) -> Self {
        let reviews = raw.required_pull_request_reviews;
        let checks = raw.required_status_checks;
        Self {
            required_reviews: reviews
                .as_ref()
                .map(|value| value.required_approving_review_count),
            dismiss_stale_reviews: reviews
                .as_ref()
                .is_some_and(|value| value.dismiss_stale_reviews),
            require_code_owner_reviews: reviews
                .as_ref()
                .is_some_and(|value| value.require_code_owner_reviews),
            strict_checks: checks.as_ref().is_some_and(|value| value.strict),
            required_checks: checks.map(|value| value.contexts),
            enforce_admins: enabled(raw.enforce_admins),
            require_linear_history: enabled(raw.required_linear_history),
            allow_force_pushes: enabled(raw.allow_force_pushes),
            allow_deletions: enabled(raw.allow_deletions),
            require_conversation_resolution: enabled(raw.required_conversation_resolution),
        }
    }
}

fn validate(settings: &ProtectionSettings) -> AppResult<()> {
    if let Some(count) = settings.required_reviews {
        if count > MAX_REQUIRED_REVIEWS {
            return Err(AppError::invalid_input("too many required reviews"));
        }
    }
    if let Some(checks) = &settings.required_checks {
        let valid = checks.len() <= MAX_CHECKS
            && checks.iter().all(|check| {
                let trimmed = check.trim();
                !trimmed.is_empty()
                    && trimmed.len() <= MAX_CHECK_LENGTH
                    && !trimmed.chars().any(char::is_control)
            });
        if !valid {
            return Err(AppError::invalid_input("invalid required checks"));
        }
    }
    Ok(())
}

pub fn protection_body(settings: &ProtectionSettings) -> Value {
    let reviews = settings.required_reviews.map(|count| {
        json!({
            "required_approving_review_count": count,
            "dismiss_stale_reviews": settings.dismiss_stale_reviews,
            "require_code_owner_reviews": settings.require_code_owner_reviews,
        })
    });
    let checks = settings.required_checks.as_ref().map(|contexts| {
        json!({
            "strict": settings.strict_checks,
            "contexts": contexts.iter().map(|check| check.trim()).collect::<Vec<_>>(),
        })
    });
    json!({
        "required_status_checks": checks,
        "enforce_admins": settings.enforce_admins,
        "required_pull_request_reviews": reviews,
        "restrictions": Value::Null,
        "required_linear_history": settings.require_linear_history,
        "allow_force_pushes": settings.allow_force_pushes,
        "allow_deletions": settings.allow_deletions,
        "required_conversation_resolution": settings.require_conversation_resolution,
    })
}

fn protection_path(owner: &str, repo: &str, branch: &str) -> AppResult<String> {
    ensure_branch_name(branch)?;
    Ok(format!(
        "{}/branches/{}/protection",
        repo_path(owner, repo)?,
        encode_segment(branch)
    ))
}

pub async fn list_branches(
    client: &GithubClient,
    owner: &str,
    repo: &str,
) -> AppResult<Vec<BranchEntry>> {
    let path = format!("{}/branches", repo_path(owner, repo)?);
    client
        .get_json(&path, &[("per_page", LIST_PAGE_SIZE.to_string())])
        .await
}

pub async fn get_protection(
    client: &GithubClient,
    owner: &str,
    repo: &str,
    branch: &str,
) -> AppResult<Option<ProtectionSettings>> {
    let path = protection_path(owner, repo, branch)?;
    match client.get_json::<RawProtection>(&path, &[]).await {
        Ok(raw) => Ok(Some(raw.into())),
        Err(error) if error.kind == ErrorKind::GithubNotFound => Ok(None),
        Err(error) => Err(error),
    }
}

pub async fn put_protection(
    client: &GithubClient,
    owner: &str,
    repo: &str,
    branch: &str,
    settings: &ProtectionSettings,
) -> AppResult<()> {
    validate(settings)?;
    let path = protection_path(owner, repo, branch)?;
    client
        .send_json::<_, Value>(Method::PUT, &path, &protection_body(settings))
        .await
        .map(|_| ())
}

pub async fn delete_protection(
    client: &GithubClient,
    owner: &str,
    repo: &str,
    branch: &str,
) -> AppResult<()> {
    let path = protection_path(owner, repo, branch)?;
    client
        .send_no_content::<()>(Method::DELETE, &path, None)
        .await
}

#[cfg(test)]
mod tests {
    use super::*;

    fn settings() -> ProtectionSettings {
        ProtectionSettings {
            required_reviews: Some(2),
            dismiss_stale_reviews: true,
            require_code_owner_reviews: false,
            required_checks: Some(vec![" ci/build ".to_string(), "lint".to_string()]),
            strict_checks: true,
            enforce_admins: true,
            require_linear_history: false,
            allow_force_pushes: false,
            allow_deletions: false,
            require_conversation_resolution: true,
        }
    }

    #[test]
    fn the_request_body_has_every_field_github_demands() {
        let body = protection_body(&settings());
        assert_eq!(
            body["required_pull_request_reviews"]["required_approving_review_count"],
            2
        );
        assert_eq!(
            body["required_pull_request_reviews"]["dismiss_stale_reviews"],
            true
        );
        assert_eq!(body["required_status_checks"]["strict"], true);
        assert_eq!(
            body["required_status_checks"]["contexts"],
            json!(["ci/build", "lint"])
        );
        assert_eq!(body["enforce_admins"], true);
        assert!(body["restrictions"].is_null());
        assert_eq!(body["required_conversation_resolution"], true);
    }

    #[test]
    fn switched_off_sections_are_sent_as_null() {
        let mut plain = settings();
        plain.required_reviews = None;
        plain.required_checks = None;
        let body = protection_body(&plain);
        assert!(body["required_pull_request_reviews"].is_null());
        assert!(body["required_status_checks"].is_null());
        assert!(body
            .as_object()
            .expect("object")
            .contains_key("required_status_checks"));
    }

    #[test]
    fn github_answers_are_flattened_into_one_settings_object() {
        let raw: RawProtection = serde_json::from_str(
            r#"{"required_pull_request_reviews":{"required_approving_review_count":1,"dismiss_stale_reviews":true},
            "required_status_checks":{"strict":false,"contexts":["ci"]},
            "enforce_admins":{"enabled":true},"allow_force_pushes":{"enabled":false},
            "required_linear_history":{"enabled":true}}"#,
        )
        .expect("json");
        let parsed = ProtectionSettings::from(raw);
        assert_eq!(parsed.required_reviews, Some(1));
        assert!(parsed.dismiss_stale_reviews);
        assert!(!parsed.require_code_owner_reviews);
        assert_eq!(parsed.required_checks, Some(vec!["ci".to_string()]));
        assert!(!parsed.strict_checks);
        assert!(parsed.enforce_admins);
        assert!(parsed.require_linear_history);
        assert!(!parsed.allow_deletions);
        let empty = ProtectionSettings::from(RawProtection::default());
        assert_eq!(empty.required_reviews, None);
        assert_eq!(empty.required_checks, None);
    }

    #[test]
    fn invalid_settings_are_refused() {
        let mut too_many = settings();
        too_many.required_reviews = Some(7);
        assert!(validate(&too_many).is_err());
        let mut blank = settings();
        blank.required_checks = Some(vec!["  ".to_string()]);
        assert!(validate(&blank).is_err());
        assert!(validate(&settings()).is_ok());
    }
}
