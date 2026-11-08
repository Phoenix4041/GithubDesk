use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult, ErrorKind};
use crate::github::client::GithubClient;
use crate::github::pulls::repo_path;

pub const UPDATE_REPOSITORY: Option<&str> = None;
pub const CURRENT_VERSION: &str = env!("CARGO_PKG_VERSION");

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateStatus {
    pub configured: bool,
    pub installable: bool,
    pub current: String,
    pub latest: Option<String>,
    pub update_available: bool,
    pub url: Option<String>,
}

#[derive(Debug, Deserialize)]
struct Release {
    tag_name: String,
    html_url: String,
    #[serde(default)]
    draft: bool,
    #[serde(default)]
    prerelease: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct Version {
    core: [u64; 3],
    pre_release: Option<String>,
}

fn parse_version(text: &str) -> Option<Version> {
    let trimmed = text.trim().trim_start_matches(['v', 'V']);
    let without_build = trimmed.split('+').next()?;
    let (core_text, pre_release) = match without_build.split_once('-') {
        Some((core, pre)) => (core, Some(pre.to_string())),
        None => (without_build, None),
    };
    let mut parts = core_text.split('.');
    let mut core = [0u64; 3];
    for slot in &mut core {
        *slot = parts.next()?.parse().ok()?;
    }
    if parts.next().is_some() {
        return None;
    }
    Some(Version { core, pre_release })
}

fn compare(left: &Version, right: &Version) -> std::cmp::Ordering {
    left.core
        .cmp(&right.core)
        .then_with(|| match (&left.pre_release, &right.pre_release) {
            (None, None) => std::cmp::Ordering::Equal,
            (None, Some(_)) => std::cmp::Ordering::Greater,
            (Some(_), None) => std::cmp::Ordering::Less,
            (Some(first), Some(second)) => first.cmp(second),
        })
}

pub fn is_newer(candidate: &str, current: &str) -> bool {
    match (parse_version(candidate), parse_version(current)) {
        (Some(latest), Some(installed)) => {
            compare(&latest, &installed) == std::cmp::Ordering::Greater
        }
        _ => false,
    }
}

pub fn not_configured() -> UpdateStatus {
    UpdateStatus {
        configured: false,
        installable: false,
        current: CURRENT_VERSION.to_string(),
        latest: None,
        update_available: false,
        url: None,
    }
}

pub async fn check_latest(
    client: &GithubClient,
    repository: &str,
    current: &str,
) -> AppResult<UpdateStatus> {
    let (owner, name) = repository
        .split_once('/')
        .ok_or_else(|| AppError::invalid_input("the update repository must be owner/name"))?;
    let path = format!("{}/releases/latest", repo_path(owner, name)?);
    let release: Release = match client.get_json(&path, &[]).await {
        Ok(release) => release,
        Err(error) if error.kind == ErrorKind::GithubNotFound => {
            return Ok(UpdateStatus {
                configured: true,
                installable: false,
                current: current.to_string(),
                latest: None,
                update_available: false,
                url: None,
            });
        }
        Err(error) => return Err(error),
    };
    let usable = !release.draft && !release.prerelease;
    let update_available = usable && is_newer(&release.tag_name, current);
    Ok(UpdateStatus {
        configured: true,
        installable: false,
        current: current.to_string(),
        latest: Some(release.tag_name.trim_start_matches(['v', 'V']).to_string()),
        update_available,
        url: update_available.then_some(release.html_url),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn versions_are_compared_numerically_not_as_text() {
        assert!(is_newer("0.10.0", "0.9.9"));
        assert!(is_newer("v1.0.0", "0.99.99"));
        assert!(is_newer("1.2.4", "1.2.3"));
        assert!(!is_newer("1.2.3", "1.2.3"));
        assert!(!is_newer("1.2.2", "1.2.3"));
    }

    #[test]
    fn a_prerelease_is_older_than_its_final_version() {
        assert!(is_newer("1.0.0", "1.0.0-beta.1"));
        assert!(!is_newer("1.0.0-beta.1", "1.0.0"));
        assert!(is_newer("1.0.0-beta.2", "1.0.0-beta.1"));
    }

    #[test]
    fn prefixes_and_build_metadata_are_ignored() {
        assert!(is_newer("V2.0.0+build.5", "1.9.0"));
        assert_eq!(parse_version("v1.2.3+meta"), parse_version("1.2.3"));
    }

    #[test]
    fn text_that_is_not_a_version_never_counts_as_an_update() {
        assert!(!is_newer("nightly", "0.5.0"));
        assert!(!is_newer("1.2", "0.5.0"));
        assert!(!is_newer("1.2.3.4", "0.5.0"));
        assert!(!is_newer("0.5.1", "dev"));
    }

    #[test]
    fn checking_is_off_until_a_repository_is_configured() {
        let status = not_configured();
        assert!(!status.configured);
        assert!(!status.update_available);
        assert_eq!(status.current, CURRENT_VERSION);
    }
}
