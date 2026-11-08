use reqwest::header::HeaderMap;
use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};
use crate::github::client::GithubClient;

const MAX_SCOPE_LENGTH: usize = 40;
const MAX_EXTRA_SCOPES: usize = 20;

pub struct Capability {
    pub id: &'static str,
    pub any_of: &'static [&'static str],
    pub request: &'static [&'static str],
}

pub const CAPABILITIES: [Capability; 10] = [
    Capability {
        id: "repos",
        any_of: &["repo"],
        request: &["repo"],
    },
    Capability {
        id: "workflows",
        any_of: &["workflow"],
        request: &["workflow"],
    },
    Capability {
        id: "orgRead",
        any_of: &["read:org"],
        request: &["read:org"],
    },
    Capability {
        id: "orgAdmin",
        any_of: &["admin:org"],
        request: &["admin:org"],
    },
    Capability {
        id: "sshKeys",
        any_of: &["admin:public_key"],
        request: &["admin:public_key"],
    },
    Capability {
        id: "gpgKeys",
        any_of: &["admin:gpg_key"],
        request: &["admin:gpg_key"],
    },
    Capability {
        id: "deleteRepo",
        any_of: &["delete_repo"],
        request: &["delete_repo"],
    },
    Capability {
        id: "notifications",
        any_of: &["notifications", "repo"],
        request: &["notifications"],
    },
    Capability {
        id: "emails",
        any_of: &["user:email"],
        request: &["user:email"],
    },
    Capability {
        id: "profile",
        any_of: &["user"],
        request: &["user"],
    },
];

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CapabilityStatus {
    pub id: String,
    pub request: Vec<String>,
    pub granted: Option<bool>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RateLimit {
    pub limit: u32,
    pub remaining: u32,
    pub reset_at: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TokenInfo {
    pub login: String,
    pub scopes: Option<Vec<String>>,
    pub expires_at: Option<String>,
    pub rate_limit: Option<RateLimit>,
    pub capabilities: Vec<CapabilityStatus>,
}

#[derive(Deserialize)]
struct UserLogin {
    login: String,
}

fn implied_by(parent: &str) -> &'static [&'static str] {
    match parent {
        "repo" => &[
            "repo:status",
            "repo_deployment",
            "public_repo",
            "repo:invite",
            "security_events",
        ],
        "admin:org" => &["write:org", "read:org"],
        "write:org" => &["read:org"],
        "admin:public_key" => &["write:public_key", "read:public_key"],
        "write:public_key" => &["read:public_key"],
        "admin:repo_hook" => &["write:repo_hook", "read:repo_hook"],
        "write:repo_hook" => &["read:repo_hook"],
        "admin:gpg_key" => &["write:gpg_key", "read:gpg_key"],
        "write:gpg_key" => &["read:gpg_key"],
        "user" => &["read:user", "user:email", "user:follow"],
        "project" => &["read:project"],
        _ => &[],
    }
}

pub fn split_scopes(value: &str) -> Vec<String> {
    value
        .split(',')
        .map(str::trim)
        .filter(|scope| !scope.is_empty())
        .map(str::to_string)
        .collect()
}

pub fn scope_grants(granted: &[String], needed: &str) -> bool {
    granted
        .iter()
        .any(|scope| scope == needed || implied_by(scope).contains(&needed))
}

pub fn missing_scopes(headers: &HeaderMap) -> Option<Vec<String>> {
    let granted = split_scopes(headers.get("x-oauth-scopes")?.to_str().ok()?);
    let accepted = split_scopes(headers.get("x-accepted-oauth-scopes")?.to_str().ok()?);
    if accepted.is_empty() || accepted.iter().any(|needed| scope_grants(&granted, needed)) {
        None
    } else {
        Some(accepted)
    }
}

pub fn union_scopes(base: &str, extra: &[String]) -> AppResult<String> {
    if extra.len() > MAX_EXTRA_SCOPES {
        return Err(AppError::invalid_input("too many scopes requested"));
    }
    let mut scopes: Vec<String> = base.split_whitespace().map(str::to_string).collect();
    for scope in extra {
        let scope = scope.trim();
        let valid = !scope.is_empty()
            && scope.len() <= MAX_SCOPE_LENGTH
            && scope
                .chars()
                .all(|character| character.is_ascii_lowercase() || matches!(character, ':' | '_'));
        if !valid {
            return Err(AppError::invalid_input(format!("invalid scope: {scope}")));
        }
        if !scopes.iter().any(|existing| existing == scope) {
            scopes.push(scope.to_string());
        }
    }
    Ok(scopes.join(" "))
}

pub fn capabilities_for(scopes: Option<&[String]>) -> Vec<CapabilityStatus> {
    CAPABILITIES
        .iter()
        .map(|capability| CapabilityStatus {
            id: capability.id.to_string(),
            request: capability
                .request
                .iter()
                .map(|scope| scope.to_string())
                .collect(),
            granted: scopes.map(|granted| {
                capability
                    .any_of
                    .iter()
                    .any(|needed| scope_grants(granted, needed))
            }),
        })
        .collect()
}

pub fn normalize_expiry(raw: &str) -> String {
    let trimmed = raw.trim();
    if let Some(stamp) = trimmed.strip_suffix(" UTC") {
        if let Some((date, time)) = stamp.split_once(' ') {
            return format!("{date}T{time}Z");
        }
    }
    trimmed.to_string()
}

fn number_header<T: std::str::FromStr>(headers: &HeaderMap, name: &str) -> Option<T> {
    headers.get(name)?.to_str().ok()?.trim().parse().ok()
}

fn rate_limit_from(headers: &HeaderMap) -> Option<RateLimit> {
    Some(RateLimit {
        limit: number_header(headers, "x-ratelimit-limit")?,
        remaining: number_header(headers, "x-ratelimit-remaining")?,
        reset_at: number_header(headers, "x-ratelimit-reset")?,
    })
}

pub async fn token_info(client: &GithubClient) -> AppResult<TokenInfo> {
    let (user, headers): (UserLogin, HeaderMap) =
        client.get_json_with_headers("/user", &[]).await?;
    let scopes = headers
        .get("x-oauth-scopes")
        .and_then(|value| value.to_str().ok())
        .map(split_scopes);
    let expires_at = headers
        .get("github-authentication-token-expiration")
        .and_then(|value| value.to_str().ok())
        .map(normalize_expiry)
        .filter(|value| !value.is_empty());
    Ok(TokenInfo {
        login: user.login,
        capabilities: capabilities_for(scopes.as_deref()),
        scopes,
        expires_at,
        rate_limit: rate_limit_from(&headers),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use reqwest::header::HeaderValue;

    fn headers(pairs: &[(&str, &str)]) -> HeaderMap {
        let mut map = HeaderMap::new();
        for (name, value) in pairs {
            map.insert(
                reqwest::header::HeaderName::from_bytes(name.as_bytes()).expect("name"),
                HeaderValue::from_str(value).expect("value"),
            );
        }
        map
    }

    fn owned(values: &[&str]) -> Vec<String> {
        values.iter().map(|value| value.to_string()).collect()
    }

    #[test]
    fn a_wider_scope_grants_the_narrower_ones_it_contains() {
        let granted = owned(&["admin:org", "repo", "user"]);
        assert!(scope_grants(&granted, "read:org"));
        assert!(scope_grants(&granted, "write:org"));
        assert!(scope_grants(&granted, "public_repo"));
        assert!(scope_grants(&granted, "user:email"));
        assert!(!scope_grants(&granted, "delete_repo"));
        assert!(!scope_grants(&owned(&["read:org"]), "admin:org"));
    }

    #[test]
    fn header_values_become_a_clean_list() {
        assert_eq!(
            split_scopes("repo, workflow ,read:org"),
            owned(&["repo", "workflow", "read:org"])
        );
        assert!(split_scopes("").is_empty());
        assert!(split_scopes(" , ").is_empty());
    }

    #[test]
    fn missing_scopes_need_both_headers_and_no_overlap() {
        let missing = headers(&[
            ("x-oauth-scopes", "repo"),
            ("x-accepted-oauth-scopes", "admin:org, write:org"),
        ]);
        assert_eq!(
            missing_scopes(&missing),
            Some(owned(&["admin:org", "write:org"]))
        );

        let covered = headers(&[
            ("x-oauth-scopes", "admin:org"),
            ("x-accepted-oauth-scopes", "write:org"),
        ]);
        assert_eq!(missing_scopes(&covered), None);

        let fine_grained = headers(&[("x-accepted-oauth-scopes", "admin:org")]);
        assert_eq!(missing_scopes(&fine_grained), None);

        let nothing_asked = headers(&[("x-oauth-scopes", "repo"), ("x-accepted-oauth-scopes", "")]);
        assert_eq!(missing_scopes(&nothing_asked), None);

        let no_scopes_at_all =
            headers(&[("x-oauth-scopes", ""), ("x-accepted-oauth-scopes", "repo")]);
        assert_eq!(missing_scopes(&no_scopes_at_all), Some(owned(&["repo"])));
    }

    #[test]
    fn requested_scopes_are_added_once_and_validated() {
        assert_eq!(
            union_scopes("repo workflow read:org", &owned(&["admin:org", "repo"])).expect("union"),
            "repo workflow read:org admin:org"
        );
        assert_eq!(union_scopes("repo", &[]).expect("union"), "repo");
        for bad in ["", "repo;rm", "Repo", "a b", "x".repeat(41).as_str()] {
            assert!(union_scopes("repo", &owned(&[bad])).is_err(), "{bad}");
        }
        let many: Vec<String> = (0..21).map(|_| "repo".to_string()).collect();
        assert!(union_scopes("repo", &many).is_err());
    }

    #[test]
    fn capabilities_report_unknown_when_the_token_hides_its_scopes() {
        let known = capabilities_for(Some(&owned(&["repo", "admin:org"])));
        let status = |id: &str| known.iter().find(|item| item.id == id).expect(id).granted;
        assert_eq!(status("repos"), Some(true));
        assert_eq!(status("orgRead"), Some(true));
        assert_eq!(status("orgAdmin"), Some(true));
        assert_eq!(status("notifications"), Some(true));
        assert_eq!(status("deleteRepo"), Some(false));
        assert_eq!(status("sshKeys"), Some(false));

        let hidden = capabilities_for(None);
        assert!(hidden.iter().all(|item| item.granted.is_none()));
    }

    #[test]
    fn expiry_dates_become_iso_timestamps() {
        assert_eq!(
            normalize_expiry("2026-12-01 10:30:00 UTC"),
            "2026-12-01T10:30:00Z"
        );
        assert_eq!(normalize_expiry(" soon "), "soon");
    }
}
