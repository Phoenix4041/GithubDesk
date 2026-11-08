use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::error::AppResult;
use crate::github::client::GithubClient;
use crate::github::orgs::ensure_login;

const INBOX_PAGE_SIZE: u32 = 20;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InboxItem {
    pub number: u64,
    pub title: String,
    pub repository: String,
    pub pull_request: bool,
    pub draft: bool,
    pub html_url: String,
    pub updated_at: String,
    pub author: Option<String>,
    pub comments: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Inbox {
    pub review_requested: Vec<InboxItem>,
    pub assigned: Vec<InboxItem>,
    pub authored: Vec<InboxItem>,
}

#[derive(Deserialize)]
struct RawAuthor {
    login: String,
}

#[derive(Deserialize)]
struct RawItem {
    number: u64,
    title: String,
    html_url: String,
    updated_at: String,
    #[serde(default)]
    draft: bool,
    #[serde(default)]
    repository_url: String,
    #[serde(default)]
    pull_request: Option<Value>,
    #[serde(default)]
    user: Option<RawAuthor>,
    #[serde(default)]
    comments: u32,
}

#[derive(Deserialize)]
struct SearchResponse {
    #[serde(default)]
    items: Vec<RawItem>,
}

pub fn repository_from_url(url: &str) -> String {
    let mut parts: Vec<&str> = url.trim_end_matches('/').rsplit('/').take(2).collect();
    parts.reverse();
    parts.join("/")
}

fn into_item(raw: RawItem) -> InboxItem {
    InboxItem {
        number: raw.number,
        title: raw.title,
        repository: repository_from_url(&raw.repository_url),
        pull_request: raw.pull_request.is_some(),
        draft: raw.draft,
        html_url: raw.html_url,
        updated_at: raw.updated_at,
        author: raw.user.map(|user| user.login),
        comments: raw.comments,
    }
}

async fn search(
    client: &GithubClient,
    qualifiers: &str,
    org: Option<&str>,
) -> AppResult<Vec<InboxItem>> {
    let mut query = format!("{qualifiers} archived:false");
    if let Some(org) = org {
        query.push_str(&format!(" org:{org}"));
    }
    let response: SearchResponse = client
        .get_json(
            "/search/issues",
            &[
                ("q", query),
                ("sort", "updated".to_string()),
                ("order", "desc".to_string()),
                ("per_page", INBOX_PAGE_SIZE.to_string()),
            ],
        )
        .await?;
    Ok(response.items.into_iter().map(into_item).collect())
}

pub async fn load_inbox(client: &GithubClient, login: &str, org: Option<&str>) -> AppResult<Inbox> {
    ensure_login(login)?;
    if let Some(org) = org {
        ensure_login(org)?;
    }
    let review_query = format!("is:open is:pr review-requested:{login}");
    let assigned_query = format!("is:open assignee:{login}");
    let authored_query = format!("is:open is:pr author:{login}");
    let (review_requested, assigned, authored) = tokio::try_join!(
        search(client, &review_query, org),
        search(client, &assigned_query, org),
        search(client, &authored_query, org),
    )?;
    Ok(Inbox {
        review_requested,
        assigned,
        authored,
    })
}

pub async fn load_mentions(
    client: &GithubClient,
    login: &str,
    org: Option<&str>,
) -> AppResult<Vec<InboxItem>> {
    ensure_login(login)?;
    if let Some(org) = org {
        ensure_login(org)?;
    }
    search(client, &format!("is:open mentions:{login}"), org).await
}

pub async fn load_failing(
    client: &GithubClient,
    login: &str,
    org: Option<&str>,
) -> AppResult<Vec<InboxItem>> {
    ensure_login(login)?;
    if let Some(org) = org {
        ensure_login(org)?;
    }
    search(
        client,
        &format!("is:open is:pr author:{login} status:failure"),
        org,
    )
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_repository_comes_from_the_api_address() {
        assert_eq!(
            repository_from_url("https://api.github.com/repos/octo/hello"),
            "octo/hello"
        );
        assert_eq!(repository_from_url("http://127.0.0.1:9/repos/a/b/"), "a/b");
        assert_eq!(repository_from_url(""), "");
    }
}
