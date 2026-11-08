use reqwest::Method;
use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};
use crate::github::client::{GithubClient, Page};

const ORGS_PAGE_SIZE: u32 = 100;
const MAX_ORG_PAGES: u32 = 5;
pub const REPOS_PAGE_SIZE: u32 = 30;
const MAX_NAME_LENGTH: usize = 100;
const MAX_DESCRIPTION_LENGTH: usize = 350;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct OrgSummary {
    pub login: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub avatar_url: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct RepoPermissions {
    #[serde(default)]
    pub admin: bool,
    #[serde(default)]
    pub push: bool,
    #[serde(default)]
    pub pull: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct RepoOwner {
    pub login: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct RepoSummary {
    pub name: String,
    pub full_name: String,
    pub owner: RepoOwner,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub private: bool,
    #[serde(default)]
    pub fork: bool,
    #[serde(default)]
    pub archived: bool,
    #[serde(default)]
    pub default_branch: String,
    #[serde(default)]
    pub pushed_at: Option<String>,
    #[serde(default)]
    pub language: Option<String>,
    pub html_url: String,
    #[serde(default)]
    pub clone_url: String,
    #[serde(default)]
    pub ssh_url: String,
    #[serde(default)]
    pub permissions: Option<RepoPermissions>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewRepo {
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub private: bool,
    #[serde(default)]
    pub auto_init: bool,
    #[serde(default)]
    pub gitignore_template: Option<String>,
    #[serde(default)]
    pub license_template: Option<String>,
}

#[derive(Serialize)]
struct CreateRepoBody<'a> {
    name: &'a str,
    description: &'a str,
    private: bool,
    auto_init: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    gitignore_template: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    license_template: Option<&'a str>,
}

#[derive(Deserialize)]
struct SearchRepos {
    #[serde(default)]
    items: Vec<RepoSummary>,
}

pub fn ensure_repo_name(name: &str) -> AppResult<()> {
    let valid = !name.is_empty()
        && name.len() <= MAX_NAME_LENGTH
        && name != "."
        && name != ".."
        && name.chars().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.')
        });
    if valid {
        Ok(())
    } else {
        Err(AppError::invalid_input(format!(
            "invalid repository name: {name}"
        )))
    }
}

pub fn ensure_login(login: &str) -> AppResult<()> {
    let valid = !login.is_empty()
        && login.len() <= 39
        && !login.starts_with('-')
        && login
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || character == '-');
    if valid {
        Ok(())
    } else {
        Err(AppError::invalid_input(format!("invalid login: {login}")))
    }
}

fn ensure_template_name(value: &str) -> AppResult<()> {
    let valid = !value.is_empty()
        && value.len() <= 60
        && value.chars().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.' | '+')
        });
    if valid {
        Ok(())
    } else {
        Err(AppError::invalid_input(format!(
            "invalid template name: {value}"
        )))
    }
}

fn clean_text(text: &str) -> String {
    text.chars()
        .map(|character| {
            if character.is_control() {
                ' '
            } else {
                character
            }
        })
        .collect::<String>()
        .trim()
        .to_string()
}

pub async fn list_orgs(client: &GithubClient) -> AppResult<Vec<OrgSummary>> {
    let mut orgs = Vec::new();
    let mut page = 1;
    while page <= MAX_ORG_PAGES {
        let result: Page<OrgSummary> = client
            .get_page("/user/orgs", &[], page, ORGS_PAGE_SIZE)
            .await?;
        orgs.extend(result.items);
        match result.next_page {
            Some(next) => page = next,
            None => break,
        }
    }
    Ok(orgs)
}

pub async fn list_context_repos(
    client: &GithubClient,
    personal_login: &str,
    org: Option<&str>,
    query: Option<&str>,
    page: u32,
) -> AppResult<Page<RepoSummary>> {
    let search = query.map(clean_text).filter(|text| !text.is_empty());
    if let Some(org) = org {
        ensure_login(org)?;
    }
    if let Some(text) = search {
        let owner = match org {
            Some(org) => format!("org:{org}"),
            None => {
                ensure_login(personal_login)?;
                format!("user:{personal_login}")
            }
        };
        let q = format!("{text} in:name {owner} fork:true");
        return client
            .get_page_wrapped(
                "/search/repositories",
                &[("q", q), ("sort", "updated".to_string())],
                page,
                REPOS_PAGE_SIZE,
                |wrapper: SearchRepos| wrapper.items,
            )
            .await;
    }
    match org {
        Some(org) => {
            client
                .get_page(
                    &format!("/orgs/{org}/repos"),
                    &[("type", "all".to_string()), ("sort", "pushed".to_string())],
                    page,
                    REPOS_PAGE_SIZE,
                )
                .await
        }
        None => {
            client
                .get_page(
                    "/user/repos",
                    &[
                        ("affiliation", "owner,collaborator".to_string()),
                        ("sort", "pushed".to_string()),
                    ],
                    page,
                    REPOS_PAGE_SIZE,
                )
                .await
        }
    }
}

pub async fn create_repo(
    client: &GithubClient,
    org: Option<&str>,
    request: &NewRepo,
) -> AppResult<RepoSummary> {
    let name = request.name.trim();
    ensure_repo_name(name)?;
    let description = clean_text(&request.description);
    if description.chars().count() > MAX_DESCRIPTION_LENGTH {
        return Err(AppError::invalid_input("the description is too long"));
    }
    let gitignore = request.gitignore_template.as_deref().map(str::trim);
    let license = request.license_template.as_deref().map(str::trim);
    if let Some(value) = gitignore {
        ensure_template_name(value)?;
    }
    if let Some(value) = license {
        ensure_template_name(value)?;
    }
    let body = CreateRepoBody {
        name,
        description: &description,
        private: request.private,
        auto_init: request.auto_init,
        gitignore_template: gitignore,
        license_template: license,
    };
    let path = match org {
        Some(org) => {
            ensure_login(org)?;
            format!("/orgs/{org}/repos")
        }
        None => "/user/repos".to_string(),
    };
    client.send_json(Method::POST, &path, &body).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn repository_names_follow_github_rules() {
        for good in ["app", "my-app_2", "v1.0", "a"] {
            assert!(ensure_repo_name(good).is_ok(), "{good}");
        }
        for bad in ["", ".", "..", "has space", "a/b", "ñandú", &"x".repeat(101)] {
            assert!(ensure_repo_name(bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn logins_reject_anything_that_could_change_the_path() {
        for good in ["octo", "octo-cat", "A1"] {
            assert!(ensure_login(good).is_ok(), "{good}");
        }
        for bad in [
            "",
            "-octo",
            "octo cat",
            "a/b",
            "a..b",
            "o?x",
            &"x".repeat(40),
        ] {
            assert!(ensure_login(bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn template_names_are_plain_words() {
        assert!(ensure_template_name("Node").is_ok());
        assert!(ensure_template_name("mit").is_ok());
        assert!(ensure_template_name("c++").is_ok());
        assert!(ensure_template_name("a b").is_err());
        assert!(ensure_template_name("../x").is_err());
    }
}
