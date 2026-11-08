use std::path::Path;

use serde::Serialize;
use url::Url;

const MAX_URL_LENGTH: usize = 2000;
const CUSTOM_SCHEME: &str = "githubdesk";
const DESKTOP_SCHEME: &str = "x-github-client";

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum LaunchRequest {
    Open { path: String },
    Clone { url: String, branch: Option<String> },
}

fn safe_clone_url(candidate: &str) -> Option<String> {
    if candidate.len() > MAX_URL_LENGTH || candidate.chars().any(|character| character.is_control() || character.is_whitespace()) {
        return None;
    }
    let parsed = Url::parse(candidate).ok()?;
    if parsed.scheme() != "https" || parsed.host_str().is_none_or(str::is_empty) {
        return None;
    }
    if !parsed.username().is_empty() || parsed.password().is_some() {
        return None;
    }
    Some(parsed.to_string())
}

fn safe_branch(candidate: Option<String>) -> Option<String> {
    candidate.filter(|name| {
        !name.is_empty()
            && name.len() <= 200
            && !name.starts_with('-')
            && !name.chars().any(|character| character.is_control() || character.is_whitespace())
    })
}

fn parse_link(text: &str) -> Option<LaunchRequest> {
    let link = Url::parse(text).ok()?;
    match link.scheme() {
        CUSTOM_SCHEME if link.host_str() == Some("clone") => {
            let mut url = None;
            let mut branch = None;
            for (key, value) in link.query_pairs() {
                match key.as_ref() {
                    "url" => url = Some(value.into_owned()),
                    "branch" => branch = Some(value.into_owned()),
                    _ => {}
                }
            }
            Some(LaunchRequest::Clone {
                url: safe_clone_url(&url?)?,
                branch: safe_branch(branch),
            })
        }
        DESKTOP_SCHEME if link.host_str() == Some("openrepo") => {
            let rest = link.path().trim_start_matches('/');
            let target = if rest.starts_with("https:/") && !rest.starts_with("https://") {
                rest.replacen("https:/", "https://", 1)
            } else {
                rest.to_string()
            };
            let branch = link
                .query_pairs()
                .find(|(key, _)| key == "branch")
                .map(|(_, value)| value.into_owned());
            let clean = target.split('?').next().unwrap_or_default().to_string();
            Some(LaunchRequest::Clone {
                url: safe_clone_url(&clean)?,
                branch: safe_branch(branch),
            })
        }
        _ => None,
    }
}

pub fn parse_arguments(arguments: &[String]) -> Option<LaunchRequest> {
    arguments.iter().skip(1).find_map(|argument| {
        let trimmed = argument.trim().trim_matches('"');
        if trimmed.is_empty() || trimmed.starts_with('-') {
            return None;
        }
        if let Some(request) = parse_link(trimmed) {
            return Some(request);
        }
        Path::new(trimmed).is_dir().then(|| LaunchRequest::Open {
            path: trimmed.to_string(),
        })
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(items: &[&str]) -> Vec<String> {
        items.iter().map(|item| (*item).to_string()).collect()
    }

    #[test]
    fn a_folder_argument_opens_that_repository() {
        let directory = std::env::temp_dir();
        let text = directory.to_string_lossy().into_owned();
        assert_eq!(
            parse_arguments(&args(&["githubdesk", &text])),
            Some(LaunchRequest::Open { path: text.clone() })
        );
        assert_eq!(
            parse_arguments(&args(&["githubdesk", &format!("\"{text}\"")])),
            Some(LaunchRequest::Open { path: text })
        );
    }

    #[test]
    fn missing_folders_flags_and_empty_arguments_are_ignored() {
        assert_eq!(parse_arguments(&args(&["githubdesk"])), None);
        assert_eq!(parse_arguments(&args(&["githubdesk", "--flag", ""])), None);
        assert_eq!(parse_arguments(&args(&["githubdesk", "/no/such/folder/anywhere"])), None);
    }

    #[test]
    fn the_own_clone_link_carries_the_address_and_branch() {
        let link = "githubdesk://clone?url=https%3A%2F%2Fgithub.com%2Focto%2Fhello.git&branch=dev";
        assert_eq!(
            parse_arguments(&args(&["githubdesk", link])),
            Some(LaunchRequest::Clone {
                url: "https://github.com/octo/hello.git".to_string(),
                branch: Some("dev".to_string())
            })
        );
    }

    #[test]
    fn the_github_desktop_link_is_understood() {
        let link = "x-github-client://openRepo/https://github.com/octo/hello?branch=main";
        assert_eq!(
            parse_arguments(&args(&["githubdesk", link])),
            Some(LaunchRequest::Clone {
                url: "https://github.com/octo/hello".to_string(),
                branch: Some("main".to_string())
            })
        );
    }

    #[test]
    fn unsafe_addresses_are_refused() {
        for link in [
            "githubdesk://clone?url=file%3A%2F%2F%2Fetc%2Fpasswd",
            "githubdesk://clone?url=ssh%3A%2F%2Fevil%2Fx",
            "githubdesk://clone?url=https%3A%2F%2Fuser%3Apass%40github.com%2Fa%2Fb",
            "githubdesk://clone?url=https%3A%2F%2Fgithub.com%2Fa%2Fb%20--upload-pack%3Dx",
            "githubdesk://clone",
            "githubdesk://other?url=https%3A%2F%2Fgithub.com%2Fa%2Fb",
            "x-github-client://openRepo/--upload-pack=x",
        ] {
            assert_eq!(parse_arguments(&args(&["githubdesk", link])), None, "{link}");
        }
    }

    #[test]
    fn a_dangerous_branch_name_is_dropped_but_the_clone_stays() {
        let link = "githubdesk://clone?url=https%3A%2F%2Fgithub.com%2Fa%2Fb&branch=--evil";
        assert_eq!(
            parse_arguments(&args(&["githubdesk", link])),
            Some(LaunchRequest::Clone {
                url: "https://github.com/a/b".to_string(),
                branch: None
            })
        );
    }
}
